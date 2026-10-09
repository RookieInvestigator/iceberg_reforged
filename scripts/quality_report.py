#!/usr/bin/env python3
"""iceberg.json 数据质量报告（原 check_links.py 升级）

检查项：
  1. 链接有效性（HTTP 状态 / 跳转 / 软404）— 网络检查
  2. 描述检查（句尾标点 / 过短 / 中英文标点混用 / 半角省略号 / 直引号）
  3. 结构完整性（标题空/重复 / 分类缺失 / tagMap 一致性 / 有链接无描述）
  4. 链接重复与链接质量（未编码中文 / 空格）
  5. 回归对比（与上一版 .bak 快照：删除条目 / 标题变更 / 数量层级变化）

用法:
    python quality_report.py                          # 默认检查 Vue 版数据
    python quality_report.py path/to/iceberg.json     # 指定数据文件

输出写入 reports/ 带时间戳目录，报告头部含数据路径、hash、检查时间与统计。
"""
import json, urllib.request, urllib.error, ssl, csv, re, time, sys, io, hashlib, datetime
from pathlib import Path
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed

# Windows CMD UTF-8
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# 2026-08-16 深度重整理：脚本位于 scripts/，项目根 = parents[1]
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_PATH = ROOT / 'iceberg-vue' / 'src' / 'data' / 'iceberg.json'
REPORTS_DIR = ROOT / 'data' / 'reports'
TIMEOUT = 15
MAX_WORKERS = 6

# 软404检测关键词
SOFT_404_PATTERNS = [
    # 通用中文
    '页面不存在', '内容不存在', '信息不存在', '已删除', '已被删除', '该内容已被删除',
    '已失效', '已过期', '已下架', '已不可用', '不存在或已删除',
    '未找到', '无法找到', '找不到', '您要找的内容', '您访问的页面',
    '抱歉，此', '出错', '出错了', '404', 'page not found', 'not found',
    'no longer exists', 'doesn.t exist', 'does not exist', '无法访问',
    # 知乎
    '没有知识存在的荒原', '该回答已被删除', '内容被删除', '内容不存在或已被删除',
    # B站
    '视频去哪了', '该视频已删除', '啊叻', '视频不见了', '非常抱歉，本视频',
    # 贴吧
    '贴子已被删除', '贴子不存在', '该贴已被删除', '您访问的贴子',
    # 微博
    '微博已被删除', '此微博已被作者删除', '部分内容未通过审核',
    # 豆瓣
    '日记不存在', '该内容已被删除',
    # 微信公众号
    '该内容已被发布者删除', '此内容因违规无法查看', '此内容被投诉且经审核',
    # YouTube/海外
    'video isn.t available', 'video unavailable', 'this video is no longer',
    'video has been removed', 'this video is private',
    # GitHub
    'there isn.t anything here', 'find what you.re looking for',
]

# ==========================================
# 静态检查（无需网络）
# ==========================================
# 描述句尾标点：以句号/叹号/问号/省略号结尾视为规范（允许结尾为闭合引号/括号）
SENTENCE_END_CHARS = '。！？…!?.'
CLOSING_CHARS = '」』）】》〉'
MIN_DESC_LEN = 20  # 描述过短阈值（字符）
# 中文后跟英文标点（normalizeData 会修复，此处暴露数据源头）
CN_EN_PUNCT_RE = re.compile(r'[一-鿿][,\.!\?;:]')
# 半角省略号（应为 ……）
ELLIPSIS3_RE = re.compile(r'\.{3}')

# 营销号/自媒体来源域名（内容多为搬运/标题党，作为来源质量提示）
# 条目允许带路径前缀（如 'www.163.com/dy' 网易号路径）
MARKETING_DOMAINS = [
    'baijiahao.baidu.com',  # 百家号
    'mp.weixin.qq.com',     # 微信公众号
    'mp.sohu.com',          # 搜狐号
    'dy.163.com',           # 网易号
    'www.163.com/dy',       # 网易号（路径）
    'mp.toutiao.com',       # 头条号
    'www.toutiao.com',      # 今日头条
    'so.toutiao.com',
    '360kuai.com',          # 360 快资讯
    'qutoutiao.com',        # 趣头条
    'mp.sogou.com',         # 搜狗号
    'www.360doc.com',       # 个人图书馆
    'www.jianshu.com',      # 简书
    'om.qq.com',            # 腾讯内容开放平台
    'kuaibao.qq.com',       # 腾讯快报
]

APPENDIX_DIR = ROOT / 'iceberg-vue' / 'src' / 'data' / 'appendix'
# 副表一表一域契约：这些字段名由专职副表拥有，overrides.csv（标量字段订正）不得承载
RESERVED_FIELDS = {
    'category': 'categories.csv（role=main）',
    'link': 'references.csv（role=main）',
    'related': 'related.csv',
}
# 各副表的合法 role 与空值默认（契约：categories 空 = extra，references 空 = ref）
APPENDIX_ROLES = {
    'categories.csv': ({'main', 'extra'}, 'extra'),
    'references.csv': ({'main', 'ref'}, 'ref'),
}
# 标记副表（extra.csv）的 flag 允许集合：与构建门 build_data_api.py 的 EXTRA_FLAGS、前端
# appendix.ts 的 EXTRA_FLAGS 同口径。将来加标记只在这里加一项（**允许集合**，不是两处硬编码）。
EXTRA_FLAGS = ('warn', 'need')
# 署名副表（contributors.csv）的日期列 at：空 = 未记日期，否则 YYYY-MM-DD（与构建门同口径）
AT_RE = re.compile(r'\d{4}-\d{2}-\d{2}')


def _is_marketing_url(url):
    """判断 URL 是否命中营销号域名（netloc+path 前缀匹配，容忍 www 子域）"""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    hostpath = (parsed.netloc + parsed.path).lower().lstrip('www.')
    for entry in MARKETING_DOMAINS:
        e = entry.lstrip('www.')
        if hostpath == e or hostpath.startswith(e + '/') or hostpath.startswith(e + '?'):
            return True
    return False
QUOTE_CHARS = '"\''

# 每项检测返回列表：{check, title, tier, detail}
def _entry(item, tier_name):
    return (item.get('title', '?'), tier_name, item.get('category', ''), item.get('id', ''))


def check_structure(data, tag_names):
    """结构完整性：标题空/重复、分类缺失/未知、tagMap 一致性、有链接无描述。
    返回统一格式 (title, tier, id, detail)，子类型标注在 detail 前缀。"""
    problems = []
    seen_titles = {}
    for tier_name, items in data.get('tiers', {}).items():
        for item in items:
            title = (item.get('title') or '').strip()
            iid = item.get('id', '')
            if not title:
                problems.append(('', tier_name, iid, '标题为空'))
                continue
            # 同层级标题重复
            if title in seen_titles:
                problems.append((title, tier_name, iid, f'标题重复: 与 {seen_titles[title]} 重复'))
            else:
                seen_titles[title] = iid
            # 分类
            cat = (item.get('category') or '').strip()
            if not cat or cat == '未知类别':
                problems.append((title, tier_name, iid, f'分类缺失/未知: {cat}'))
            # 标签一致性
            for tag in item.get('tags', []) or []:
                if tag not in tag_names:
                    problems.append((title, tier_name, iid, f'标签不在 tagMap: {tag}'))
            # 有链接无描述
            if item.get('link') and not (item.get('desc') or '').strip():
                problems.append((title, tier_name, iid, '有链接无描述'))
    return problems


def check_desc_length(data):
    """描述过短（< MIN_DESC_LEN 字符，疑似占位/残缺）"""
    problems = []
    for tier_name, items in data.get('tiers', {}).items():
        for item in items:
            desc = (item.get('desc') or '').strip()
            if desc and len(desc) < MIN_DESC_LEN:
                problems.append(('描述过短', *(_entry(item, tier_name)[:2]), _entry(item, tier_name)[3],
                                 f'{len(desc)} 字: {desc[:40]}'))
    return problems


def check_punctuation(data):
    """标点规范：句尾标点 / 中英文标点混用 / 半角省略号 / 直引号"""
    problems = []
    for tier_name, items in data.get('tiers', {}).items():
        for item in items:
            title, tier, _, iid = _entry(item, tier_name)
            desc = (item.get('desc') or '').strip()
            if not desc:
                continue
            if not desc_ending_ok(desc):
                problems.append(('描述不以句尾标点结尾', title, tier, iid, desc[-30:]))
            if CN_EN_PUNCT_RE.search(desc):
                problems.append(('中文后英文标点', title, tier, iid,
                                 CN_EN_PUNCT_RE.search(desc).group(0)))
            if ELLIPSIS3_RE.search(desc):
                problems.append(('半角省略号', title, tier, iid, '...'))
            for q in QUOTE_CHARS:
                if q in desc:
                    problems.append(('描述含直引号', title, tier, iid, q))
    return problems


def check_duplicate_links(data):
    """链接重复：同一 URL（去尾斜杠归一）被多条词条引用"""
    seen = {}
    problems = []
    for tier_name, items in data.get('tiers', {}).items():
        for item in items:
            url = (item.get('link') or '').strip().rstrip('/')
            if not url:
                continue
            if url in seen:
                problems.append(('链接重复', item.get('title', '?'), tier_name, item.get('id', ''),
                                 f'与 {seen[url]} 同链接: {url[:60]}'))
            else:
                seen[url] = item.get('title', '?')
    return problems


def check_link_quality(data):
    """链接质量：URL 含未编码中文 / 空格"""
    problems = []
    for tier_name, items in data.get('tiers', {}).items():
        for item in items:
            url = (item.get('link') or '').strip()
            if not url:
                continue
            if re.search(r'[一-鿿\s]', url):
                problems.append(('URL 含中文/空格', item.get('title', '?'), tier_name,
                                 item.get('id', ''), url[:60]))
    return problems


def check_marketing_sources(data):
    """营销号/自媒体来源（主链接 + 副表 references.csv），返回 (title, tier, id, detail)"""
    problems = []
    for tier_name, items in data.get('tiers', {}).items():
        for item in items:
            url = (item.get('link') or '').strip()
            if url and _is_marketing_url(url):
                problems.append((item.get('title', '?'), tier_name,
                                 item.get('id', ''), f'营销号来源: {url[:60]}'))
    ref_csv = APPENDIX_DIR / 'references.csv'
    if ref_csv.exists():
        try:
            # utf-8-sig：副表可能带 BOM（Excel 手工维护过，或编辑器保存时保留），
            # 按 utf-8 读会把首列名变成 '\ufeffsource_id' —— source_id 永远取不到，
            # 检查静默空转（related.csv 的孤儿检查就栽在这上面，2026-10-09 修）。
            with open(ref_csv, encoding='utf-8-sig') as f:
                for row in csv.DictReader(f):
                    url = (row.get('url') or '').strip()
                    if url and _is_marketing_url(url):
                        src = (row.get('source_id') or '').strip()
                        label = (row.get('label') or '').strip()
                        problems.append((src, '', '',
                                         f'营销号来源(副表): {label}: {url[:60]}'))
        except (OSError, ValueError) as e:
            problems.append(('', '', '', f'营销号来源(副表) 读取失败: {e}'))
    return problems


def check_appendix_categories(data):
    """分类副表（categories.csv）：孤儿 item_id / 未知分类 / 重复 main 行 / extra 与主分类重复。

    role=main 覆盖词条主分类（只要分类已知即可），role=extra 是 OR 叠加（**必须与主分类不同**）；
    空 role 按契约等于 extra。主分类取该词条的 main 行，没有 main 行则取词条自身的分类。

    表结构是 item_id,category,role 三列（by/at 已于 2026-10 迁到 contributors.csv），
    因此下面**一律按列名取值** —— 列的顺序/有无 by/at 都不影响这里。
    """
    problems = []
    ids = {it['id'] for its in data.get('tiers', {}).values() for it in its}
    known = set(data.get('categoryColors', {}).keys())
    by_id = {it['id']: it.get('category', '') for its in data.get('tiers', {}).values() for it in its}
    cat_csv = APPENDIX_DIR / 'categories.csv'
    if not cat_csv.exists():
        return problems
    try:
        with open(cat_csv, encoding='utf-8-sig') as f:
            # 按列名读：契约只认 item_id/category/role 三列，多出来的列自动忽略
            rows = list(csv.DictReader(f))
        main_cat, extras = {}, []
        for row in rows:
            iid = (row.get('item_id') or '').strip()
            cat = (row.get('category') or '').strip()
            role = (row.get('role') or '').strip().lower() or 'extra'   # 空 = extra（契约默认）
            if not iid or not cat:
                continue
            if iid not in ids:
                problems.append((iid, '', '', f'多分类副表孤儿 item_id: {iid}'))
                continue
            if cat not in known:
                problems.append((iid, '', '', f'多分类副表未知分类: {cat}'))
                continue
            if role not in ('main', 'extra'):
                problems.append((iid, '', '', f'多分类副表未知 role: {role!r}（只允许 main/extra，空 = extra）'))
                continue
            if role == 'main':
                if iid in main_cat:
                    problems.append((iid, '', '', f'多分类副表重复 main 行（一个词条只允许一行）: {cat}'))
                else:
                    main_cat[iid] = cat
            else:
                extras.append((iid, cat))
        for iid, cat in extras:
            # extra 是 OR 叠加：与主分类相同就是空操作（也是 role 写错的信号）
            if cat == (main_cat.get(iid) or by_id.get(iid, '')):
                problems.append((iid, '', '', f'多分类副表 extra 与主分类重复: {cat}'))
    except (OSError, ValueError) as e:
        problems.append(('', '', '', f'多分类副表读取失败: {e}'))
    return problems


def check_appendix_overrides(data):
    """字段订正副表（overrides.csv）：只允许 title/desc/tags，保留字段必须迁到专职副表。

    表结构是 item_id,field,value 三列（by/at 已于 2026-10 迁到 contributors.csv）——
    这里按列名取 field，列的变化（增删/换序）都不影响判读。
    """
    problems = []
    ov_csv = APPENDIX_DIR / 'overrides.csv'
    if not ov_csv.exists():
        return problems
    try:
        with open(ov_csv, encoding='utf-8-sig') as f:
            for row in csv.DictReader(f):
                field = (row.get('field') or '').strip()
                if field in RESERVED_FIELDS:
                    iid = (row.get('item_id') or '').strip()
                    problems.append((iid, '', '', f'字段订正副表含保留字段 {field}'
                                                  f'（应由 {RESERVED_FIELDS[field]} 承载）'))
    except (OSError, ValueError) as e:
        problems.append(('', '', '', f'字段订正副表读取失败: {e}'))
    return problems


def check_appendix_roles(data):
    """副表 role 合法性：categories.csv ∈ {main, extra}；references.csv ∈ {main, ref}（空 = 该表默认值）"""
    problems = []
    for fname, (allowed, default) in APPENDIX_ROLES.items():
        path = APPENDIX_DIR / fname
        if not path.exists():
            continue
        try:
            with open(path, encoding='utf-8-sig') as f:
                for row in csv.DictReader(f):
                    # 空 role 是契约允许的默认值（categories 空 = extra，references 空 = ref）；
                    # 老副表没有 role 列时 DictReader 给 None，同样算空 —— 都不算违规
                    raw = (row.get('role') or '').strip().lower()
                    if raw and raw not in allowed:
                        key = (row.get('item_id') or row.get('source_id') or '').strip()
                        problems.append((key, '', '', f'{fname} 未知 role: {raw}'
                                                        f'（只允许 {"、".join(sorted(allowed))}，空 = {default}）'))
        except (OSError, ValueError) as e:
            problems.append(('', '', '', f'{fname} 读取失败: {e}'))
    return problems


def check_appendix_contributors(data):
    """署名副表（contributors.csv）：孤儿 item_id / 空 by / 重复 (item_id, by) / 非法 at。

    署名是独立数据域（词条详情页脚「由 X 提供」的数据源），键是 (item_id, by)：
    空 by 的行前端 appendix.ts 直接忽略（等于白写），同 key 两行则是同一人被记了两次
    （契约：同 by 取较晚的 at，不该出现两行）。at 空 = 未记日期，否则必须 YYYY-MM-DD。
    """
    problems = []
    ids = {it['id'] for its in data.get('tiers', {}).values() for it in its}
    con_csv = APPENDIX_DIR / 'contributors.csv'
    if not con_csv.exists():
        return problems
    try:
        with open(con_csv, encoding='utf-8-sig') as f:
            rows = list(csv.DictReader(f))
        seen = set()
        for row in rows:
            iid = (row.get('item_id') or '').strip()
            by = (row.get('by') or '').strip()
            at = (row.get('at') or '').strip()
            if not iid and not by and not at:
                continue  # 整行空（编辑器留下的空行）
            if not iid:
                problems.append(('', '', '', '署名副表缺 item_id（署名行必须挂在词条上）'))
                continue
            if iid not in ids:
                problems.append((iid, '', '', f'署名副表孤儿 item_id: {iid}'))
            if not by:
                problems.append((iid, '', '', '署名副表 by 为空（页脚会忽略该行，等于白写）'))
            else:
                if (iid, by) in seen:
                    problems.append((iid, '', '', f'署名副表重复署名 (item_id, by): {iid} {by}'))
                seen.add((iid, by))
            if at and not AT_RE.fullmatch(at):
                problems.append((iid, '', '', f'署名副表非法 at: {at!r}（需 YYYY-MM-DD 或留空）'))
    except (OSError, ValueError) as e:
        problems.append(('', '', '', f'署名副表读取失败: {e}'))
    return problems


def check_appendix_extra(data):
    """标记副表（extra.csv）：孤儿 item_id / 未知 flag / 重复 (item_id, flag)。

    表结构是 item_id,flag,note 三列，键 = (item_id, flag)：**行的存在即该标记为真**
    （删行 = 取消标记），note 是那个小圆图标的 hover 提示。前端只读不写 —— 表由副表编辑器
    手填，所以这里盯的是「填了但不生效」的几类：孤儿 item_id 挂不上词条、未知 flag 前端
    直接丢弃（只认 EXTRA_FLAGS，大小写不敏感，空 flag 同样算丢弃）、同键两行是同一标记记了两次。
    空 note 是契约允许的（有标记没说明），不报。
    """
    problems = []
    ids = {it['id'] for its in data.get('tiers', {}).values() for it in its}
    ex_csv = APPENDIX_DIR / 'extra.csv'
    if not ex_csv.exists():
        return problems
    try:
        # utf-8-sig：副表可能带 BOM（Excel 手工维护过），按 utf-8 读会把首列名变成
        # '\ufeffitem_id' —— item_id 永远取不到，整项检查静默空转（related.csv 栽过这个坑）。
        with open(ex_csv, encoding='utf-8-sig') as f:
            rows = list(csv.DictReader(f))
        seen = set()
        for row in rows:
            iid = (row.get('item_id') or '').strip()
            raw = (row.get('flag') or '').strip()
            flag = raw.lower()   # 大小写不敏感（与前端 appendix.ts 同口径）
            if not iid and not raw:
                continue  # 整行空（编辑器留下的空行）
            if not iid:
                problems.append(('', '', '', f'标记副表缺 item_id（标记行必须挂在词条上）: flag={raw or "?"}'))
                continue
            if iid not in ids:
                problems.append((iid, '', '', f'标记副表孤儿 item_id: {iid}'))
            if not flag:
                problems.append((iid, '', '', '标记副表 flag 为空（前端会忽略该行，等于白写）'))
                continue
            if flag not in EXTRA_FLAGS:
                problems.append((iid, '', '', f'标记副表未知 flag: {flag!r}'
                                              f'（只允许 {"、".join(EXTRA_FLAGS)}，大小写不敏感）'))
                continue
            if (iid, flag) in seen:
                problems.append((iid, '', '', f'标记副表重复标记 (item_id, flag): {iid} {flag}'))
            seen.add((iid, flag))
    except (OSError, ValueError) as e:
        problems.append(('', '', '', f'标记副表读取失败: {e}'))
    return problems


def check_appendix_headers():
    """副表列名契约：overrides.csv = item_id,field,value；categories.csv = item_id,category,role。

    2026-10 署名副表上线时 by/at 从这两张表删列（署名归 contributors.csv）——
    任何工具（编辑器 / 旧脚本 / 手工粘贴）再把它们写回去都是 schema 违规，这里点名报出来。
    只盯 by/at 这两列，其余多余列不判违规（避免误伤未来的合法扩列）。
    """
    problems = []
    for fname in ('overrides.csv', 'categories.csv'):
        path = APPENDIX_DIR / fname
        if not path.exists():
            continue
        try:
            # utf-8-sig：BOM 会粘在第一个列名上，按列名比对必须先剥掉
            with open(path, encoding='utf-8-sig', newline='') as f:
                header = next(csv.reader(f), [])
            extra = [h for h in ((c or '').strip().lower() for c in header) if h in ('by', 'at')]
            if extra:
                problems.append(('', '', '', f'{fname} 不该有列 {"、".join(sorted(set(extra)))}'
                                                '（署名归 contributors.csv）'))
        except (OSError, ValueError) as e:
            problems.append(('', '', '', f'{fname} 读表头失败: {e}'))
    return problems


def check_regression(old_data, new_data):
    """回归对比（与上一版 .bak 快照）：删除条目 / 标题变更 / 数量层级变化"""
    problems = []
    if not old_data:
        return problems
    old_tiers = old_data.get('tiers', {})
    new_tiers = new_data.get('tiers', {})
    old_by_id = {it['id']: (t, it.get('title', '')) for t, its in old_tiers.items() for it in its}
    new_by_id = {it['id']: (t, it.get('title', '')) for t, its in new_tiers.items() for it in its}
    old_count = len(old_by_id)
    new_count = len(new_by_id)
    if old_count != new_count:
        problems.append(('数量变化', f'{old_count} → {new_count}', '', '', ''))
    old_tier_n = len(old_data.get('tierOrder', []))
    new_tier_n = len(new_data.get('tierOrder', []))
    if old_tier_n != new_tier_n:
        problems.append(('层级数变化', f'{old_tier_n} → {new_tier_n}', '', '', ''))
    for iid, (tier, title) in old_by_id.items():
        if iid not in new_by_id:
            problems.append(('删除条目', title, tier, iid, ''))
        else:
            _, new_title = new_by_id[iid]
            if new_title != title:
                problems.append(('标题变更', f'{title} → {new_title}', tier, iid, ''))
    return problems


def run_static_checks(data, old_data):
    """全部静态检查汇总（结构 / 描述 / 标点 / 链接 / 回归）"""
    tag_names = set(data.get('tagMap', {}).values())
    checks = [
        ('结构完整性', check_structure(data, tag_names)),
        ('描述过短', check_desc_length(data)),
        ('标点规范', check_punctuation(data)),
        ('链接重复', check_duplicate_links(data)),
        ('链接质量', check_link_quality(data)),
        ('营销号来源', check_marketing_sources(data)),
        ('多分类副表', check_appendix_categories(data)),
        ('副表字段归属', check_appendix_overrides(data)),
        ('副表角色', check_appendix_roles(data)),
        ('署名副表', check_appendix_contributors(data)),
        ('标记副表', check_appendix_extra(data)),
        ('副表列名', check_appendix_headers()),
        ('回归对比', check_regression(old_data, data)),
    ]
    return [(check, *row) for check, rows in checks for row in rows]


# 描述句尾标点：以句号/叹号/问号/省略号结尾视为规范（允许结尾为闭合引号/括号）
def desc_ending_ok(desc):
    """描述是否以句尾标点结尾（先剥掉结尾的闭合引号/括号，及零宽字符）"""
    s = desc.rstrip(' \t\n\r​‌‍﻿')
    while s and s[-1] in CLOSING_CHARS:
        s = s[:-1]
    return bool(s) and s[-1] in SENTENCE_END_CHARS


def check_url(url):
    """返回 (final_url, status, flag, detail)"""
    ctx = ssl.create_default_context()
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
    }
    # 知乎/B站需要 Referer，否则返回403
    if any(d in url for d in ('zhihu.com', 'bilibili.com', 'douban.com')):
        headers['Referer'] = 'https://www.google.com/'
    # 知乎限速：随机延迟
    if 'zhihu.com' in url:
        time.sleep(0.3 + (hash(url) % 100) / 200)
    req = urllib.request.Request(url, method='GET', headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as resp:
            final_url = resp.geturl()
            status = resp.status
            raw = resp.read(200000)
            body = raw.decode('utf-8', errors='ignore').lower()
            body_len = len(raw)

            # 跳转检测
            redirect_flag = ''
            if final_url != url:
                fp = urlparse(final_url)
                op = urlparse(url)
                # 跳到了完全不同域名的根路径
                if fp.netloc != op.netloc:
                    redirect_flag = f'跨域跳转 → {fp.netloc}'
                # 跳到了根路径
                elif fp.path in ('/', '/index.html', '/index.htm', '/index.php', ''):
                    redirect_flag = f'跳转到首页: {final_url}'
                # 跳到了404/error页面
                elif any(k in fp.path.lower() for k in ('404', 'error', 'notfound', 'not-found')):
                    redirect_flag = f'跳转到错误页: {final_url}'

            # 软404: 先查title，页面很短时才扫全文
            m = re.search(r'<title>([^<]+)</title>', body)
            title = m.group(1).strip() if m else ''
            soft_flag = ''
            for p in ('页面不存在', '404', 'not found', '已删除', '不存在'):
                if p in title:
                    soft_flag = f'标题含"{p}"'
                    break
            if not soft_flag and body_len < 5000:
                for p in SOFT_404_PATTERNS:
                    if p in body:
                        soft_flag = f'正文含"{p}"'
                        break

            flag = '; '.join(filter(None, [redirect_flag, soft_flag]))
            return (final_url, status, flag, '')

    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode('utf-8', errors='ignore').lower()
        except:
            return (e.url, e.code, f'{e.code}', '')
        # 提取title检查
        m = re.search(r'<title>([^<]+)</title>', body)
        title = m.group(1).strip() if m else ''
        for p in SOFT_404_PATTERNS[:8]:
            if p in title:
                return (e.url, e.code, f'{e.code}; 标题含"{p}"', '')
        return (e.url, e.code, f'{e.code}', '')
    except Exception as e:
        return (url, 0, str(e)[:100], '')


def main():
    args = [a for a in sys.argv[1:] if a != '--static']
    static_only = '--static' in sys.argv[1:]
    data_path = Path(args[0]) if args else DEFAULT_DATA_PATH
    if not data_path.exists():
        print(f'找不到: {data_path}')
        return

    with open(data_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    links = []
    for tier_name, items in data.get('tiers', {}).items():
        for item in items:
            url = item.get('link', '').strip()
            if url and url.startswith('http'):
                links.append((url, item['title'], tier_name, item.get('category', ''), item['id']))

    total = len(links)
    # F33：报告元信息 —— 数据路径 / sha256 hash / 检查时间 / 总链接数
    data_hash = hashlib.sha256(data_path.read_bytes()).hexdigest()[:16]
    check_time = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f'数据: {data_path}')
    print(f'Hash: {data_hash}')
    print(f'时间: {check_time}')
    print(f'链接总数: {total}')

    reports_dir = REPORTS_DIR
    reports_dir.mkdir(exist_ok=True)
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    output = reports_dir / f'broken_links-{stamp}.csv'
    uncertain_path = reports_dir / f'uncertain_links-{stamp}.csv'

    if static_only:
        print('模式: --static（仅静态检查，跳过网络链接检查）')

    problems = []
    uncertain = []  # 403/401 = 无法确认
    if not static_only:
        bar_w = 40
        print(f'共 {total} 个链接，{MAX_WORKERS}线程检查中...\n')

        checked = 0
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futures = {pool.submit(check_url, u): (u, t, r, c, i) for u, t, r, c, i in links}
            for f in as_completed(futures):
                info = futures[f]
                checked += 1
                final, status, flag, _ = f.result()

            if status == 410:
                flag = (flag + '; ' if flag else '') + '410 Gone: 内容已永久删除'

            if status in (403, 401, 429):
                # 无法确认：被拦截/需登录/限速，不代表链接失效
                uncertain.append((*info, status, flag, final))
                print(f'\n  [BLOCKED {status}] {info[0]} — {info[1]}', flush=True)
            elif status != 200 or flag:
                problems.append((*info, status, flag, final))
                print(f'\n  [BROKEN {status}] {info[0]} — {info[1]}', flush=True)
                if flag:
                    print(f'     → {flag}', flush=True)

            # 进度条
            pct = checked / total
            filled = int(bar_w * pct)
            bar = '█' * filled + '░' * (bar_w - filled)
            print(f'\r[{bar}] {checked}/{total}  X{len(problems)} ?{len(uncertain)}', end='', flush=True)

        print()  # 换行

        print(f'\n\n===== Done =====')
        print(f'  OK: {total - len(problems) - len(uncertain)}')
        print(f'  Broken: {len(problems)}')
        print(f'  Blocked(403/401/429): {len(uncertain)}')
        if problems:
            print(f'  -> {output}')
        if uncertain:
            print(f'  -> {uncertain_path}')
        if problems:
            with open(output, 'w', newline='', encoding='utf-8-sig') as f:
                w = csv.writer(f)
                w.writerow([f'# data: {data_path}'])
                w.writerow([f'# hash: {data_hash}'])
                w.writerow([f'# time: {check_time}'])
                w.writerow([f'# total: {total}'])
                w.writerow(['URL', 'HTTP状态', '问题', '跳转到', '词条标题', '分类', '层级', 'ID'])
                for url, title, tier, cat, iid, status, flag, final in problems:
                    w.writerow([url, status, flag, final if final != url else '', title, cat, tier, iid])
            print(f'失效链接: {output}')
        if uncertain:
            with open(uncertain_path, 'w', newline='', encoding='utf-8-sig') as f:
                w = csv.writer(f)
                w.writerow([f'# data: {data_path}'])
                w.writerow([f'# hash: {data_hash}'])
                w.writerow([f'# time: {check_time}'])
                w.writerow([f'# total: {total}'])
                w.writerow(['URL', 'HTTP状态', '问题', '跳转到', '词条标题', '分类', '层级', 'ID'])
                for url, title, tier, cat, iid, status, flag, final in uncertain:
                    w.writerow([url, status, flag, final if final != url else '', title, cat, tier, iid])
            print(f'无法确认: {uncertain_path}')

    # 静态数据质量检查（结构 / 描述 / 标点 / 链接重复与质量 / 回归对比）
    old_data = None
    bak = Path(str(data_path) + '.bak')
    if bak.exists():
        try:
            with open(bak, 'r', encoding='utf-8') as f:
                old_data = json.load(f)
        except (OSError, json.JSONDecodeError):
            old_data = None
    static_problems = run_static_checks(data, old_data)
    if static_problems:
        quality_out = reports_dir / f'data_quality-{stamp}.csv'
        with open(quality_out, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f)
            w.writerow([f'# data: {data_path}'])
            w.writerow([f'# hash: {data_hash}'])
            w.writerow([f'# time: {check_time}'])
            w.writerow([f'# static issues: {len(static_problems)}'])
            w.writerow(['检查项', '词条标题', '层级', 'ID', '详情'])
            for row in static_problems:
                w.writerow(row)
        stats = {}
        for r in static_problems:
            stats[r[0]] = stats.get(r[0], 0) + 1
        print(f'\n静态质量检查: 共 {len(static_problems)} 条问题 -> {quality_out}')
        for k, v in stats.items():
            print(f'  {k}: {v}')
        for row in static_problems[:15]:
            print(f'  [{row[0]}] {row[1]} …{str(row[4])[:50]}')
        if len(static_problems) > 15:
            print(f'  ... 共 {len(static_problems)} 条')


if __name__ == '__main__':
    main()
