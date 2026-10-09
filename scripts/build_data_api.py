"""
build_data_api.py — 从 icebergthreads.com API 获取数据，编译为 iceberg.json

用法:
    python build_data_api.py

输出（iceberg-vue/src/data/）:
    iceberg.json ← Vue 版使用的 JSON 数据

对比 build_data.py：
    - 不需要手动保存 HTML
    - 不需要 beautifulsoup4
    - 时间戳直接来自 API（不再自己算指纹）
    - 颜色/标签无需正则解析 style 属性
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError
from urllib.parse import urlparse
from pinyin_sort import sort_key

# ==========================================
# 配置
# ==========================================
API_URL = "https://icebergthreads.com/api/iceberg/fel4BTCqlMAGSa2gelRJ"
# 项目根 = scripts/ 的父目录（2026-08-16 深度重整理：脚本移入 scripts/，路径不再依赖 cwd）
ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "iceberg-vue/src/data"
ID_HISTORY_PATH = os.path.join(OUTPUT_DIR, "id_history.json")
# 轻量元数据（约 3.5KB）：只需统计口径的视图（首页 / 术语表）导入它，
# 避免为 4 个数字拉下 ~800KB 的全量 iceberg.json。与 iceberg.json 同批原子写入。
META_PATH = os.path.join(OUTPUT_DIR, "meta.json")
# 精简索引（约 106KB）：id → 标题 + 分类。供用户面板等只需「按 id 查标题/分类」的场景使用，
# 避免为此载入全量词条正文（~800KB）。同样与 iceberg.json 同批原子写入。
ID_INDEX_PATH = os.path.join(OUTPUT_DIR, "id-index.json")
SKIP_TIERS = {"说明", "说明 / Notes"}  # 跳过的层级（不是真正的冰山数据）

NOW = int(time.time())

# 分类颜色：API 返回的颜色直接可用，但仍保留 fallback
DEFAULT_COLOR = "#FFFFFF"


# ==========================================
# ID 持久化（F30：标题/层级修订不再换 ID）
# ==========================================
def make_id(tier: str, title: str) -> str:
    """生成 8 位 MD5 ID（仅作无 API id 时的回退）"""
    raw = f"{tier}::{title}"
    return hashlib.md5(raw.encode('utf-8')).hexdigest()[:8]


def normalize_link(link: str) -> str:
    """F34：URL 规范化 —— 无协议裸域名自动补 https://；非 http(s) 协议或结构非法直接拒绝。

    验收：主数据非空 URL 100% 通过 URL schema（渲染端不再出现站内相对路径误导航）。
    """
    link = (link or '').strip()
    if not link:
        return ''
    if link.startswith('http://') or link.startswith('https://'):
        return link
    if link.startswith('//'):
        return 'https:' + link
    if '://' in link:
        return ''  # javascript: / data: 等非 http(s) 协议 → 拒绝
    # 无协议裸域名（zhuanlan.zhihu.com/... 等）→ 补 https:// 并校验结构
    candidate = 'https://' + link
    try:
        parsed = urlparse(candidate)
        host = parsed.netloc or ''
        if not host or '.' not in host:
            return ''
        if not re.fullmatch(r'[A-Za-z0-9.-]+', host):
            return ''
        return candidate
    except ValueError:
        return ''


def load_history() -> dict:
    """读取上次构建的 ID 历史（api_uuid → 8位id 锚点 + tier::title → id）"""
    try:
        with open(ID_HISTORY_PATH, encoding='utf-8') as f:
            h = json.load(f)
        return {"byApiId": {}, "byTitle": {}, **h}
    except (OSError, json.JSONDecodeError):
        return {"byApiId": {}, "byTitle": {}}


def save_history(history: dict):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(ID_HISTORY_PATH, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def seed_history(history: dict, old_data: dict | None) -> dict:
    """以现有 iceberg.json 为首次迁移种子：tier::title → id（标题未变条目直接复用旧 id）。"""
    if not old_data:
        return {}
    old_ids_by_title = {}
    for tier, items in old_data.get('tiers', {}).items():
        for it in items:
            key = f"{tier}::{it.get('title', '')}"
            history.setdefault('byTitle', {}).setdefault(key, it['id'])
            old_ids_by_title[key] = it['id']
    return old_ids_by_title


def resolve_id(api_id: str, tier: str, title: str, history: dict) -> str:
    """
    解析条目 ID（稳定性优先级）：
    1. API 稳定 uuid 已锚定 → 复用历史 8 位 id（标题/层级修订不换 ID，收藏/评论/副表/分享链接不断）
    2. 有 api_id 且标题未变（首次迁移） → 复用旧 8 位 id 并锚定 api_id
    3. 无 api_id（HTML 回退） → tier::title 命中历史则复用
    4. 全新条目 → 生成新 8 位 md5 id 并记录
    """
    by_api = history.setdefault('byApiId', {})
    by_title = history.setdefault('byTitle', {})
    if api_id and api_id in by_api:
        return by_api[api_id]
    key = f"{tier}::{title}"
    if api_id:
        if key in by_title:
            by_api[api_id] = by_title[key]
            return by_title[key]
        new_id = make_id(tier, title)
        by_api[api_id] = new_id
        return new_id
    if key in by_title:
        return by_title[key]
    new_id = make_id(tier, title)
    by_title[key] = new_id
    return new_id


def check_id_collisions(items_by_tier: dict) -> None:
    """构建检查：8 位截断空间碰撞检测（F30）"""
    seen = {}
    for tier, items in items_by_tier.items():
        for it in items:
            if it['id'] in seen:
                print(f"ERROR: ID 碰撞 {it['id']} — {seen[it['id']]} 与 {tier}::{it['title']}")
                sys.exit(1)
            seen[it['id']] = f"{tier}::{it['title']}"


def build_aliases(old_ids_by_title: dict, items_by_tier: dict) -> dict:
    """检测非预期 ID 变更：同 (tier,title) 条目 id 变化 → alias[旧] = 新（前端重定向旧链接）"""
    aliases = {}
    by_title_now = {f"{t}::{it['title']}": it['id'] for t, its in items_by_tier.items() for it in its}
    for key, old_id in old_ids_by_title.items():
        new_id = by_title_now.get(key)
        if new_id and new_id != old_id:
            aliases[old_id] = new_id
    return aliases


# ==========================================
# API 调用
# ==========================================
def fetch_api(url: str, retries: int = 3) -> dict:
    """从 icebergthreads API 获取完整 JSON（失败自动重试，指数退避）"""
    print(f"GET {url}")
    req = Request(url, headers={
        'Accept': 'application/json',
        'User-Agent': 'iceberg-vue-builder/1.0',
    })
    last_err = None
    for attempt in range(retries):
        try:
            with urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except (URLError, TimeoutError, OSError) as e:
            last_err = e
            if attempt < retries - 1:
                wait = 2 ** attempt
                print(f"  attempt {attempt + 1}/{retries} failed ({e}), retrying in {wait}s...")
                time.sleep(wait)
    print(f"ERROR: Failed to fetch API after {retries} attempts: {last_err}")
    sys.exit(1)


def load_api_data(input_path: str | None) -> dict:
    """数据源入口：`--input 本地 JSON`（API 不可达时的离线通路）优先，否则走网络 API。

    本地文件应为 API 返回的原始 JSON（结构：{layers: [{title, items: [...]}]}）。
    与网络路径共用同一套 build_from_api / 校验 / 原子写管线，数据一致性无差别。
    """
    if input_path:
        print(f"LOAD {input_path} (local, offline mode)")
        with open(input_path, encoding='utf-8') as f:
            return json.load(f)
    return fetch_api(API_URL)


# ==========================================
# 数据映射
# ==========================================
def build_from_api(data: dict, history: dict, old_ids_by_title: dict) -> dict:
    """将 API JSON 映射为项目数据格式"""
    # 1. 构建查找表
    categories_map = {}
    for cat in data.get('categories', []):
        color = (cat.get('color') or '').strip()  # color 可能为 null/缺失，先守卫再处理
        categories_map[cat['id']] = {
            'name': cat['name'],
            'color': color.upper() if color.startswith('#') else color,
        }

    markers_map = {}
    for m in data.get('markers', []):
        # 上游 superscript 偶发首尾空白（如 " 🎲"），统一 strip，否则 tagMap 出现
        # 带空格的脏 key，前端精确匹配时产生幽灵筛选 bug（2026-09-06 发现实证）
        emoji = (m.get('superscript') or '').strip()
        name = (m.get('name') or '').strip()
        if not emoji or not name:
            continue
        markers_map[m['id']] = {
            'emoji': emoji,
            'name': name,
        }

    # 2. 解析层级
    intro_text = data.get('description', '')
    category_colors = {}
    tag_map = {}
    items_by_tier = {}
    tier_order = []

    for layer in data.get('layers', []):
        tier_name = layer.get('title', '').strip()
        if not tier_name:
            continue

        # 跳过说明层
        if tier_name in SKIP_TIERS:
            continue

        tier_order.append(tier_name)
        items_by_tier[tier_name] = []

        for item in layer.get('items', []):
            title = (item.get('text') or '').strip()
            if not title:
                continue

            # 分类
            cat = categories_map.get(item.get('categoryId', ''), {})
            cat_name = cat.get('name', '未知类别')
            cat_color = cat.get('color') or DEFAULT_COLOR
            if cat_name not in category_colors:
                category_colors[cat_name] = cat_color

            # 标签
            tag_names = []
            for mid in item.get('markerIds', []):
                m = markers_map.get(mid)
                if m:
                    tag_names.append(m['name'])
                    if m['emoji'] not in tag_map:
                        tag_map[m['emoji']] = m['name']

            # 描述
            desc = (item.get('description') or '').strip()
            link = normalize_link(item.get('url'))  # F34：补协议/拒绝非法

            # 时间戳：API 返回毫秒，转为秒；为 0/缺失时省略该字段（不输出 1970 时间戳）
            # F30：API 稳定 uuid 仅作持久锚（history 内部映射），输出 id 仍为 8 位（复用历史或新生成）
            api_item_id = (item.get('id') or '').strip()
            iid = resolve_id(api_item_id, tier_name, title, history)
            created_ms = item.get('createdAt') or 0
            modified_ms = item.get('modifiedAt') or created_ms

            item_out = {
                'id': iid,
                'title': title,
                'category': cat_name,
                'tags': tag_names,
                'desc': desc,
                'link': link,
            }
            if created_ms:
                item_out['createdAt'] = int(created_ms / 1000)
                item_out['modifiedAt'] = int(modified_ms / 1000)

            items_by_tier[tier_name].append(item_out)

    # 3. 解析 introText（按拼音首字母重排参与创作者）
    # 名单一并写入 meta.json，供前端转载模板引用（与 introText 同源，数据更新自动同步）
    contributor_names: list = []
    contrib_match = re.search(r'参与创作者(?:（[^）]*）)?：', intro_text)
    if contrib_match:
        head = intro_text[:contrib_match.start()]
        tail = intro_text[contrib_match.end():]

        # 创作者名以句号结束，也可能在末尾
        if '。' in tail:
            names_raw = tail.split('。')[0]
            suffix = '。' + '。'.join(tail.split('。')[1:])
        else:
            names_raw = tail
            suffix = ''

        # 排序 key：无依赖「按首字母」（读 lib/pinyin.ts 首字母表，见 pinyin_sort.py）；
        # 旧实现依赖可选 pypinyin 全拼，缺失时回退 Unicode 序导致名单乱序（已修复）
        names = sorted(
            [n.strip() for n in names_raw.split('、') if n.strip()],
            key=sort_key,
        )
        intro_text = head + '参与创作者（按首字母排序）：' + '、'.join(names) + suffix
        contributor_names = names

    # 4. 构建检查（F30）：碰撞检测 + 非预期 ID 变更报告
    check_id_collisions(items_by_tier)
    aliases = build_aliases(old_ids_by_title, items_by_tier)
    if aliases:
        print(f"  ID 变更（旧链接由 alias 重定向）: {len(aliases)} 条")
        for old, new in list(aliases.items())[:10]:
            print(f"    {old} → {new}")

    # 5. 聚合 config（contributors 随 data 透传，供 compile_output 写 meta.json）
    config = {
        'generatedAt': NOW,
        'introText': intro_text,
        'categoryColors': category_colors,
        'tagMap': tag_map,
        'tierOrder': tier_order,
        'defaultColor': DEFAULT_COLOR,
        'idAliases': aliases,
        'contributors': contributor_names,
    }

    return {
        **config,
        'tiers': {t: items_by_tier[t] for t in tier_order},
    }


# ==========================================
# F32：覆盖前校验（缺字段 / ID 唯一 / URL 协议 / 数量突降 / 副表孤儿）
# ==========================================
MIN_ITEMS = 500  # 数量下限（当前 1440；低于此值视为上游异常）
COUNT_DROP_RATIO = 0.5  # 相对上一版数量突降阈值

# 一表一域契约：这些字段名由专职副表拥有，overrides.csv（标量字段订正表）不得承载。
# category → categories.csv（role=main）、link → references.csv、related → related.csv。
RESERVED_FIELDS = {
    'category': 'categories.csv（role=main）',
    'link': 'references.csv（role=main）',
    'related': 'related.csv',
}

# 标记副表（extra.csv）的 flag **允许集合**：只在这里维护一份 —— 将来加标记（前端 appendix.ts
# 的 EXTRA_FLAGS 同步加一项）改这里即可，校验按集合判定，不在下面再硬编码一个字面量。
# 大小写不敏感（与前端 appendix.ts 同口径：写入前 lowercase 再比对）。
EXTRA_FLAGS = ('warn', 'need')


def validate_data(data: dict) -> list:
    """字段完整性 / ID 格式与唯一性 / URL 协议 / 层级名称，违规即返回错误列表"""
    errors = []
    tiers = data.get('tiers', {})
    if not tiers:
        errors.append('tiers 为空')
    # tagMap / categoryColors 的 key 禁止首尾空白（上游 superscript 脏数据曾产出 " 🎲"）
    for key in list(data.get('tagMap', {}).keys()):
        if key != key.strip():
            errors.append(f'tagMap 脏 key（含首尾空白）: {key!r}')
    for key in list(data.get('categoryColors', {}).keys()):
        if key != key.strip():
            errors.append(f'categoryColors 脏 key（含首尾空白）: {key!r}')
    ids = []
    for tier, items in tiers.items():
        if not isinstance(tier, str) or not tier.strip():
            errors.append('存在空层级名')
        for it in items:
            if not isinstance(it, dict):
                errors.append(f'{tier} 含非对象条目')
                continue
            for field in ('id', 'title', 'category', 'tags', 'desc', 'link'):
                if field not in it:
                    errors.append(f'{tier}::{it.get("title", "?")} 缺字段 {field}')
            iid = it.get('id', '')
            if not re.fullmatch(r'[a-f0-9]{8}', iid):
                errors.append(f'非法 ID 格式: {iid!r} ({tier}::{it.get("title", "?")})')
            ids.append(iid)
            link = it.get('link') or ''
            if link and not (link.startswith('http://') or link.startswith('https://')):
                errors.append(f'非法 URL: {link[:60]} ({tier}::{it.get("title", "?")})')
    if len(ids) != len(set(ids)):
        errors.append('ID 重复（8 位截断碰撞）')
    if len(ids) < MIN_ITEMS:
        errors.append(f'数量异常：仅 {len(ids)} 条（下限 {MIN_ITEMS}）')
    return errors


def check_count_drop(old_data: dict | None, new_count: int) -> str | None:
    """相对上一版数量突降检测"""
    if not old_data:
        return None
    old_count = sum(len(v) for v in old_data.get('tiers', {}).values())
    if old_count > 0 and new_count < old_count * COUNT_DROP_RATIO:
        return f'数量突降：{old_count} → {new_count}（低于 {int(old_count * COUNT_DROP_RATIO)}）'
    return None


def check_orphan_relations(new_ids: set, known_categories: set | None = None,
                           main_by_id: dict | None = None) -> list:
    """副表孤儿关系与字段归属：related.csv / references.csv 的 source_id / target_id 必须存在于新数据；
    categories.csv 的 item_id 必须存在、category 必须落在 categoryColors 内，且 role 合法
    （main / extra，空 = extra）、一个 item 最多一行 main、extra 不得与主分类重合；
    overrides.csv 不得承载保留字段（category / link / related —— 它们由专职副表拥有）；
    contributors.csv（署名副表）的 item_id 必须存在、by 非空、同一 (item_id, by) 不得重复、
    at 为空或 YYYY-MM-DD；
    extra.csv（标记副表）的 item_id 必须存在、flag ∈ EXTRA_FLAGS（大小写不敏感、空即违规）、
    同一 (item_id, flag) 不得重复（note 是 hover 提示，可空）。

    main_by_id：item_id → 新数据里的主分类（来自 tiers），用于判断 extra 是否与主分类重复；
    不传时退化为「只看 categories.csv 自己的 main 行」。

    所有副表一律 utf-8-sig 读（BOM 会让首列名变成 '\\ufeffsource_id'，检查静默空转）。
    """
    problems = []
    for rel_file in ('related.csv', 'references.csv'):
        path = os.path.join(OUTPUT_DIR, 'appendix', rel_file)
        if not os.path.exists(path):
            continue
        try:
            import csv as _csv
            # utf-8-sig：related.csv 带 UTF-8 BOM，按 utf-8 读首列名会变成 '\ufeffsource_id'，
            # 于是 source_id 永远取不到、孤儿检查静默失效（BOM 只在第一个单元格上）
            with open(path, encoding='utf-8-sig') as f:
                for row in _csv.DictReader(f):
                    src = (row.get('source_id') or '').strip()
                    tgt = (row.get('target_id') or '').strip()
                    if src and src not in new_ids:
                        problems.append(f'{rel_file} 孤儿 source_id: {src}')
                    if tgt and tgt not in new_ids:
                        problems.append(f'{rel_file} 孤儿 target_id: {tgt}')
        except (OSError, ValueError) as e:
            problems.append(f'{rel_file} 读取失败: {e}')
    # overrides.csv 只承载标量字段订正（title/desc/tags）：保留字段由专职副表拥有，出现即阻断覆盖
    try:
        import csv as _csv
        ov_path = os.path.join(OUTPUT_DIR, 'appendix', 'overrides.csv')
        if os.path.exists(ov_path):
            with open(ov_path, encoding='utf-8-sig') as f:
                for row in _csv.DictReader(f):
                    field = (row.get('field') or '').strip()
                    if field in RESERVED_FIELDS:
                        iid = (row.get('item_id') or '').strip()
                        problems.append(
                            f'overrides.csv 保留字段 {field}（应由 {RESERVED_FIELDS[field]} 承载）'
                            f': item_id={iid or "?"} value={(row.get("value") or "")[:40]!r}')
    except (OSError, ValueError) as e:
        problems.append(f'overrides.csv 读取失败: {e}')
    # 分类副表（role=main 覆盖主分类 / extra 叠加 OR）：孤儿 item_id、未知分类、非法 role、
    # 重复 main 行、extra 与主分类重合 —— 任一违规都阻断覆盖
    try:
        import csv as _csv
        cat_path = os.path.join(OUTPUT_DIR, 'appendix', 'categories.csv')
        if os.path.exists(cat_path):
            with open(cat_path, encoding='utf-8-sig') as f:
                # 按列名读：契约只认 item_id/category/role 三列，多出来的列自动忽略
                cat_rows = list(_csv.DictReader(f))
            main_rows, extra_rows = {}, []
            for row in cat_rows:
                iid = (row.get('item_id') or '').strip()
                cat = (row.get('category') or '').strip()
                if not iid and not cat:
                    continue
                # role 空 = extra（契约默认值），大小写不敏感
                role = (row.get('role') or '').strip().lower() or 'extra'
                if iid and iid not in new_ids:
                    problems.append(f'categories.csv 孤儿 item_id: {iid}')
                if cat and known_categories is not None and cat not in known_categories:
                    problems.append(f'categories.csv 未知分类: {cat}')
                if role not in ('main', 'extra'):
                    problems.append(f'categories.csv 未知 role: {role!r}'
                                    f'（item_id={iid or "?"}，只允许 main / extra，空 = extra）')
                    continue
                if role == 'main':
                    if iid in main_rows:
                        problems.append(f'categories.csv 一个 item 只能有一行 role=main（重复）: {iid}')
                    else:
                        main_rows[iid] = cat
                else:
                    extra_rows.append((iid, cat))
            for iid, cat in extra_rows:
                # 主分类 = categories.csv 的 main 行；没有 main 行就用新数据里该词条自带的分类
                main_cat = main_rows.get(iid) or (main_by_id or {}).get(iid, '')
                if cat and main_cat and cat == main_cat:
                    problems.append(f'categories.csv extra 与主分类重复（extra 必须与主分类不同）: {iid} {cat}')
    except (OSError, ValueError) as e:
        problems.append(f'categories.csv 读取失败: {e}')
    # 署名副表（contributors.csv）：署名是独立数据域，条目详情页脚「由 X 提供」的数据源。
    # 孤儿 item_id / 空 by / 同 (item_id, by) 重复 / 非法 at 任一违规都阻断覆盖 ——
    # 脏署名会直接显示在页脚（空 by 前端会静默忽略该行，等于白写，所以在这里就拦下）。
    try:
        import csv as _csv
        con_path = os.path.join(OUTPUT_DIR, 'appendix', 'contributors.csv')
        if os.path.exists(con_path):
            with open(con_path, encoding='utf-8-sig') as f:
                con_keys = set()
                for row in _csv.DictReader(f):
                    iid = (row.get('item_id') or '').strip()
                    by = (row.get('by') or '').strip()
                    at = (row.get('at') or '').strip()
                    if not iid and not by and not at:
                        continue  # 整行空（编辑器/手工留下的空行）不算违规
                    if iid and iid not in new_ids:
                        problems.append(f'contributors.csv 孤儿 item_id: {iid}')
                    if not by:
                        problems.append(f'contributors.csv 空 by（署名行必须写清是谁）: item_id={iid or "?"}')
                    elif iid:
                        if (iid, by) in con_keys:
                            problems.append(f'contributors.csv 重复署名 (item_id, by): {iid} {by}')
                        con_keys.add((iid, by))
                    # at 只看格式：空 = 未记日期（契约允许），否则必须 YYYY-MM-DD
                    if at and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', at):
                        problems.append(f'contributors.csv 非法 at（需 YYYY-MM-DD 或留空）: '
                                        f'{iid or "?"} {by or "?"} {at!r}')
    except (OSError, ValueError) as e:
        problems.append(f'contributors.csv 读取失败: {e}')
    # 标记副表（extra.csv）：**行的存在即该标记为真**（删行 = 取消标记），前端只读不写 ——
    # 全由副表编辑器手填，所以脏行会一路渲染到词条卡片的小图标上：孤儿 item_id 挂不上词条、
    # 未知/空 flag 前端直接忽略（等于白写）、同 (item_id, flag) 两行是同一标记记了两次。
    # note 只是图标 hover 提示，空是契约允许的（有图标没说明），不检查内容。
    try:
        import csv as _csv
        ex_path = os.path.join(OUTPUT_DIR, 'appendix', 'extra.csv')
        if os.path.exists(ex_path):
            with open(ex_path, encoding='utf-8-sig') as f:
                ex_keys = set()
                for row in _csv.DictReader(f):
                    iid = (row.get('item_id') or '').strip()
                    raw_flag = (row.get('flag') or '').strip()
                    # flag 大小写不敏感：前端 appendix.ts 也是 lowercase 后再比对
                    flag = raw_flag.lower()
                    if not iid and not raw_flag:
                        continue  # 整行空（编辑器/手工留下的空行）不算违规
                    if not iid:
                        problems.append(f'extra.csv 缺 item_id（标记行必须挂在词条上）: '
                                        f'flag={raw_flag or "?"}')
                    elif iid not in new_ids:
                        problems.append(f'extra.csv 孤儿 item_id: {iid}')
                    if not flag:
                        problems.append(f'extra.csv 空 flag（标记行必须写标记名）: item_id={iid or "?"}')
                        continue
                    if flag not in EXTRA_FLAGS:
                        problems.append(f'extra.csv 未知 flag: {raw_flag!r}'
                                        f'（item_id={iid or "?"}，只允许 {" / ".join(EXTRA_FLAGS)}）')
                        continue
                    if iid:
                        if (iid, flag) in ex_keys:
                            problems.append(f'extra.csv 重复标记 (item_id, flag): {iid} {flag}')
                        ex_keys.add((iid, flag))
    except (OSError, ValueError) as e:
        problems.append(f'extra.csv 读取失败: {e}')
    return problems


def diff_summary(old_data: dict | None, new_data: dict) -> dict:
    """生成差异摘要（新增 / 删除 / 层级变化）"""
    if not old_data:
        return {'added': 0, 'removed': 0, 'tier_delta': 0}
    old_ids = {it['id'] for its in old_data.get('tiers', {}).values() for it in its}
    new_ids = {it['id'] for its in new_data['tiers'].values() for it in its}
    return {
        'added': len(new_ids - old_ids),
        'removed': len(old_ids - new_ids),
        'tier_delta': len(new_data['tierOrder']) - len(old_data.get('tierOrder', [])),
    }


# ==========================================
# 输出
# ==========================================
def compile_output(data: dict, output_dir: str):
    """写入 iceberg.json（F32：先留 .bak 快照，再临时文件原子替换）"""
    os.makedirs(output_dir, exist_ok=True)

    json_str = json.dumps(data, ensure_ascii=False, indent=2)

    json_path = os.path.join(output_dir, 'iceberg.json')
    if os.path.exists(json_path):
        import shutil
        shutil.copy2(json_path, json_path + '.bak')  # 可恢复快照
    tmp_path = json_path + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        f.write(json_str)
    os.replace(tmp_path, json_path)  # 原子替换

    total = sum(len(v) for v in data['tiers'].values())
    print(f"  输出: {json_path} ({total} items, {len(data['tierOrder'])} tiers)")
    print(f"  {len(data['categoryColors'])} categories, {len(data['tagMap'])} tags")

    # 轻量元数据：仅统计口径，供首页 / 术语表使用（不含任何词条正文）
    # contributors：参与创作者名单（与 introText 同源），供转载模板完整展示
    tier_counts = {name: len(data['tiers'].get(name, [])) for name in data['tierOrder']}
    meta = {
        'generatedAt': data.get('generatedAt'),
        'tierOrder': data.get('tierOrder', []),
        'categoryColors': data.get('categoryColors', {}),
        'tagMap': data.get('tagMap', {}),
        'tierCounts': tier_counts,
        'total': total,
        'contributors': data.get('contributors', []),
    }
    meta_tmp = META_PATH + '.tmp'
    with open(meta_tmp, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    os.replace(meta_tmp, META_PATH)  # 原子替换
    print(f"  输出: {META_PATH} ({os.path.getsize(META_PATH)} bytes, 轻量元数据)")

    # 精简索引：id → 标题 + 分类（不含正文，不含链接）
    id_index = {
        it['id']: {'t': it['title'], 'c': it.get('category', '')}
        for items in data['tiers'].values() for it in items
    }
    idx_tmp = ID_INDEX_PATH + '.tmp'
    with open(idx_tmp, 'w', encoding='utf-8') as f:
        json.dump(id_index, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(idx_tmp, ID_INDEX_PATH)  # 原子替换
    print(f"  输出: {ID_INDEX_PATH} ({os.path.getsize(ID_INDEX_PATH)} bytes, {len(id_index)} 条精简索引)")


# ==========================================
# 主入口
# ==========================================
def build():
    parser = argparse.ArgumentParser(description='从 icebergthreads API 编译 iceberg.json')
    parser.add_argument('--input', metavar='FILE', default=None,
                        help='本地 API JSON 文件（离线模式，跳过网络拉取）')
    args = parser.parse_args()
    api_data = load_api_data(args.input)

    layers = api_data.get('layers', [])
    print(f"  API returned {len(layers)} layers")

    for layer in layers:
        items = layer.get('items', [])
        title = layer.get('title', '')
        print(f"    {title}: {len(items)} items")

    # F30：加载/种子 ID 历史，构建完成后持久化
    history = load_history()
    old_data = None
    try:
        with open(os.path.join(OUTPUT_DIR, 'iceberg.json'), encoding='utf-8') as f:
            old_data = json.load(f)
    except (OSError, json.JSONDecodeError):
        old_data = None
    old_ids_by_title = seed_history(history, old_data)

    data = build_from_api(api_data, history, old_ids_by_title)

    # F32：覆盖前校验 —— 任一违规即阻断覆盖（保留旧数据）
    total = sum(len(v) for v in data['tiers'].values())
    errors = validate_data(data)
    drop = check_count_drop(old_data, total)
    if drop:
        errors.append(drop)
    errors += check_orphan_relations(
        {it['id'] for its in data['tiers'].values() for it in its},
        set(data.get('categoryColors', {}).keys()),
        # 新数据里每个词条的主分类：用于校验 categories.csv 的 extra 行不与主分类重合
        {it['id']: (it.get('category') or '') for its in data['tiers'].values() for it in its},
    )
    if errors:
        print('ERROR: 数据校验未通过，拒绝覆盖（旧数据保留在 iceberg.json）:')
        for e in errors[:20]:
            print(f'  - {e}')
        if len(errors) > 20:
            print(f'  ... 共 {len(errors)} 条')
        sys.exit(1)

    diff = diff_summary(old_data, data)
    print(f"  差异: +{diff['added']} / -{diff['removed']} 条, 层级 {diff['tier_delta']:+d}")
    compile_output(data, OUTPUT_DIR)
    save_history(history)


if __name__ == '__main__':
    build()
