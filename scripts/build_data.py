"""
build_data.py — 从 iceberg.html 刮取数据，拆分为单个 .md + config.json，再编译为 iceberg.json

用法:
    python build_data.py [html_file] [work_dir]

默认:
    python scripts/build_data.py iceberg.html [work_dir]  # 默认 data/work

中间产物（work_dir/）:
    data_work/
    ├── config.json        ← 全局元数据 + 层级→条目ID映射
    └── items/
        ├── 87fbcd52.md    ← 每个词条一个 .md (JSON frontmatter + 正文)
        └── ...

最终输出（iceberg-vue/src/data/）:
    └── iceberg.json       ← Vue 版使用的 JSON 数据

.md 格式:
    ---
    {"id":"...", "title":"...", "tier":"...", ...}
    ---
    描述正文...

每次构建前，会将 data_work/ 下已有文件归档到 data_archive/YYYY-MM-DD_HHMMSS/。
"""

import hashlib
import json
import os
import re
import shutil
import sys
import time
from datetime import datetime
from bs4 import BeautifulSoup
from pinyin_sort import sort_key  # 无依赖「按首字母」key：读 lib/pinyin.ts 首字母表（见 pinyin_sort.py）


# ==========================================
# 1. 全局配置
# ==========================================
INTRO_TEXT = """「与君幽明道别，何意相照也？」\n\n这是一个集体创作项目。不收录侵害个人隐私、过重政治色彩、过度血腥或色情的内容。对于上面列出的个人账号、商家或是线下组织，都请不要直接联系骚扰或者攻击对方。 \n\n参与创作者：Cyberotonin、Convalla、门罗、wingzero、Musca、冬寂網路、陌と対馬、EdwardC、苦苣、C、黒船躑躅、Akilulf、非梦剧场、栗子、叶辰渊、水狮提督衙门、Rusell、夏梁、sjsj_yee、筑沢幽、亞洲銅、迢迢牛奶路、Prismriver、致陌生人_、桃浪之二、结束子qwq、戚斯叹、橘往右往、forr、lithauch、Hagiwara、超越論的ナ唯我独尊、辅酱出击、五技鼠_绝弦、渡し守、Lord Kremlin、脑叶0811、斗斗、T95T95T、海市、玏玏、决老师、原子能蝴蝶、夢中的聲音、paiz503、二十三霜秋、绯衣暮雪、未确认幻想物体、弃逐夜雪、纯狐、狗蛤、高岭爱花花、WhiterHJ、聆之、Thyj_w、lindigo、FMRMTN、药厂人家、Sakumokou、C7H14S、DigitalSiren、vitissafi84、1214179656"""

CATEGORY_COLORS = {
    "都市传说・事件・超自然现象": "#FFFFFF",
    "鬼宅・异常地点": "#CACEFF",
    "网络怪谈": "#99CEFF",
    "自然现象": "#0BFE28",
    "未确认生物": "#9BFF99",
    "民俗・宗教・灵性": "#FFF700",
    "神话・志怪・传奇": "#E0DFA3",
    "真实犯罪・事故": "#FF3333",
    "电视节目・放送・广播信号": "#C48787",
    "艺术与创作物": "#FF5CB0",
    "边缘科学": "#1F93FF",
    "阴谋论・边缘理论": "#9876C1",
    "骗局・营销・谣言": "#69739B",
    "历史・疑案・假说": "#00FFD5",
    "预言・谶纬": "#FF8D0A",
    "城市神秘物件": "#949494"
}
DEFAULT_COLOR = "#FFFFFF"

NOW = int(time.time())


# ==========================================
# 2. 工具函数
# ==========================================
COLOR_RE = re.compile(r'(#[0-9a-fA-F]{3,6}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))')
TIER_HEADER_RE = re.compile(r'^(?:层级|Layer)\s*\d+')

def _is_tier_header(tag):
    """候选层级标题：文本匹配「层级 N」的标题元素（h1-h6 或 div），供层级提取回退使用"""
    if not getattr(tag, 'name', None) or tag.name not in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div'):
        return False
    text = tag.get_text(strip=True)
    if not text or len(text) > 30:
        return False
    return bool(TIER_HEADER_RE.match(text))

def normalize_color(color_str):
    """Normalize hex or rgb color to uppercase hex for consistent matching."""
    m = re.search(r'#([0-9a-fA-F]{3,6})', color_str)
    if m:
        h = m.group(1)
        if len(h) == 3:
            h = ''.join(c * 2 for c in h)
        return '#' + h.upper()
    m = re.search(r'rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)', color_str)
    if m:
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f'#{r:02X}{g:02X}{b:02X}'
    return color_str


def make_id(tier, title):
    raw = f"{tier}::{title}"
    return hashlib.md5(raw.encode('utf-8')).hexdigest()[:8]


def normalize_link(link):
    """F34：URL 规范化 —— 无协议裸域名自动补 https://；非 http(s) 协议或结构非法直接拒绝。"""
    from urllib.parse import urlparse
    link = (link or '').strip()
    if not link:
        return ''
    if link.startswith('http://') or link.startswith('https://'):
        return link
    if link.startswith('//'):
        return 'https:' + link
    if '://' in link:
        return ''
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


# F30：ID 持久化 —— 标题/层级修订不换 ID（HTML 方式无 API 稳定 id，靠 tier::title 锚定复用）
# 项目根 = scripts/ 的父目录（2026-08-16 深度重整理：脚本移入 scripts/，路径不再依赖 cwd）
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ID_HISTORY_PATH = os.path.join(ROOT, "iceberg-vue/src/data/id_history.json")


def load_history():
    try:
        with open(ID_HISTORY_PATH, encoding='utf-8') as f:
            h = json.load(f)
        return {"byApiId": {}, "byTitle": {}, **h}
    except (OSError, json.JSONDecodeError):
        return {"byApiId": {}, "byTitle": {}}


def save_history(history):
    with open(ID_HISTORY_PATH, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def stabilize_ids(items_by_tier, history):
    """复用历史 id（byTitle 锚定）+ 检测变更生成 alias + 碰撞检查。返回 idAliases。"""
    old_ids_by_title = {}
    try:
        with open(os.path.join(ROOT, "iceberg-vue/src/data/iceberg.json"), encoding='utf-8') as f:
            old = json.load(f)
        for tier, items in old.get('tiers', {}).items():
            for it in items:
                key = f"{tier}::{it.get('title', '')}"
                history.setdefault('byTitle', {}).setdefault(key, it['id'])
                old_ids_by_title[key] = it['id']
    except (OSError, json.JSONDecodeError):
        pass

    by_title = history.setdefault('byTitle', {})
    for tier, items in items_by_tier.items():
        for it in items:
            key = f"{tier}::{it['title']}"
            if key in by_title:
                it['id'] = by_title[key]
            else:
                by_title[key] = it['id']

    # 碰撞检查（8 位截断空间）
    seen = {}
    for tier, items in items_by_tier.items():
        for it in items:
            if it['id'] in seen:
                print(f"ERROR: ID 碰撞 {it['id']} — {seen[it['id']]} 与 {tier}::{it['title']}")
                sys.exit(1)
            seen[it['id']] = f"{tier}::{it['title']}"

    # alias：同 (tier,title) 条目 id 变化 → 旧链接重定向
    aliases = {}
    by_title_now = {f"{t}::{it['title']}": it['id'] for t, its in items_by_tier.items() for it in its}
    for key, old_id in old_ids_by_title.items():
        new_id = by_title_now.get(key)
        if new_id and new_id != old_id:
            aliases[old_id] = new_id
    if aliases:
        print(f"  ID 变更（旧链接由 alias 重定向）: {len(aliases)} 条")
    return aliases


def _fingerprint(item):
    tags_key = '|'.join(sorted(item.get('tags', [])))
    return f"{item.get('title','')}|{item.get('category','')}|{tags_key}|{item.get('desc','')}|{item.get('link','')}"


# ==========================================
# 3. HTML 刮取
# ==========================================
def extract_from_html(html_file):
    """从 iceberg.html 刮取数据，返回 (items_by_tier, global_config).
    从 HTML 内建的图例区直接解析颜色→分类名映射，无需外部 CSV。"""
    with open(html_file, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')

    # 从硬编码 INTRO_TEXT 提取创作者，按首字母排序后拼回
    prefix = '参与创作者：'
    intro_text = INTRO_TEXT.strip()
    if prefix in intro_text:
        head, tail = intro_text.split(prefix, 1)
        # 提取名字列表（到下一个句号或结尾）
        if '。' in tail:
            names_raw = tail.split('。')[0]
            suffix = '。' + '。'.join(tail.split('。')[1:])
        else:
            names_raw = tail
            suffix = ''
        names = sorted([n.strip() for n in names_raw.split('、') if n.strip()], key=sort_key)
        intro_text = head + '参与创作者（按首字母排序）：' + '、'.join(names) + suffix

    # 从图例区构建 color → category_name 映射
    category_map = {}
    for div in soup.find_all('div', style=re.compile(r'background-color')):
        span = div.find('span')
        if span:
            cat_name = span.get_text(strip=True)
            m = COLOR_RE.search(div.get('style', ''))
            if m and cat_name:
                category_map[normalize_color(m.group(1))] = cat_name

    # marker_map: emoji → name (from marker-button-selector elements)
    marker_map = {}
    for marker in soup.find_all('span', class_='marker-button-selector'):
        text_span = marker.find('span')
        if not text_span:
            continue
        sup_tag = text_span.find('sup')
        if not sup_tag:
            continue
        emoji = sup_tag.get_text(strip=True)
        sup_tag.extract()
        if emoji:
            marker_map[emoji] = text_span.get_text(strip=True)

    # Items
    item_els = soup.find_all('div', attrs={'data-iceberg-item': True})
    items_by_tier = {}

    for el in item_els:
        desc = el.get('data-tooltip', '').strip()

        title, link = "", ""
        a_tag = el.find('a', class_='extra-shadow')
        if a_tag:
            title = a_tag.get_text(strip=True)
            link = normalize_link(a_tag.get('href', ''))  # F34：补协议/拒绝非法
        else:
            span_tag = el.find('span', class_='extra-shadow')
            if span_tag:
                title = span_tag.get_text(strip=True)
        if not title:
            continue

        # Category: match via item's color → legend color map
        cat_name = "未知类别"
        color_div = el.find('div', style=re.compile(r'color:\s*(#[0-9a-fA-F]{6}|rgb)'))
        if color_div:
            m = COLOR_RE.search(color_div.get('style', ''))
            if m:
                cat_name = category_map.get(normalize_color(m.group(1)), "未知类别")

        # Tags
        tag_names = []
        for span in el.find_all('span', class_='text-xs'):
            emoji = span.get_text(strip=True)
            name = marker_map.get(emoji, '')
            if name:
                tag_names.append(name)

        # Tier
        tier_name = "未知层级"
        tier_container = el.find_parent('div', class_='z-[1]')
        if tier_container:
            tier_header = tier_container.find('div', class_='text-2xl')
            if tier_header:
                tier_name = tier_header.get_text(strip=True)
        if tier_name == "未知层级":
            # 回退：Tailwind 类选择器失效时，按文本正则匹配文档序中最近的「层级 N」标题
            prev_header = el.find_previous(_is_tier_header)
            if prev_header:
                tier_name = prev_header.get_text(strip=True)

        if tier_name not in items_by_tier:
            items_by_tier[tier_name] = []

        items_by_tier[tier_name].append({
            "id": make_id(tier_name, title),
            "title": title,
            "category": cat_name,
            "tags": tag_names,
            "desc": desc,
            "link": link
        })

    sorted_tiers = sorted(items_by_tier.keys())

    # Collect categories actually used from items
    used_categories = set()
    for items in items_by_tier.values():
        for item in items:
            used_categories.add(item['category'])

    # 从 HTML 图例区反推 name → color（随 HTML 中 category 名字变化自动同步）
    _name_colors = {name: color for color, name in category_map.items()}

    config = {
        "generatedAt": NOW,
        "introText": intro_text,
        "categoryColors": {c: _name_colors.get(c, CATEGORY_COLORS.get(c, DEFAULT_COLOR)) for c in sorted(used_categories) if c != "未知类别"},
        "tagMap": marker_map,
        "tierOrder": sorted_tiers,
        "tiers": {t: [it["id"] for it in items_by_tier[t]] for t in sorted_tiers},
        "defaultColor": DEFAULT_COLOR
    }

    return items_by_tier, config


FM_RE = re.compile(r'^---\s*\n(.*?)\n---\s*\n', re.DOTALL)


def read_item_md(path):
    """读取 .md 文件，返回 item dict 或 None"""
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    m = FM_RE.match(content)
    if not m:
        return None
    try:
        item = json.loads(m.group(1))
    except json.JSONDecodeError:
        return None
    # Body is everything after the frontmatter
    body = content[m.end():].strip()
    item['desc'] = body
    return item


def write_item_md(path, item):
    """写入 .md 文件 (JSON frontmatter + description body)"""
    meta = {k: v for k, v in item.items() if k != 'desc'}
    fm = json.dumps(meta, ensure_ascii=False, indent=2)
    body = item.get('desc', '')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(f"---\n{fm}\n---\n\n{body}\n")


# ==========================================
# 4. 合并旧时间戳
# ==========================================
def merge_timestamps(items_by_tier, items_dir):
    """对比已有 .md 文件，内容未变的保留 modifiedAt"""
    unchanged = 0
    changed = 0
    new_items = 0

    for tier_name, items in items_by_tier.items():
        for item in items:
            path = os.path.join(items_dir, f"{item['id']}.md")
            old = read_item_md(path)

            if old and 'modifiedAt' in old:
                old_fp = _fingerprint(old)
                new_fp = _fingerprint(item)
                if old_fp == new_fp:
                    item['modifiedAt'] = old['modifiedAt']
                    unchanged += 1
                else:
                    item['modifiedAt'] = NOW
                    changed += 1
            else:
                item['modifiedAt'] = NOW
                new_items += 1

    if unchanged:
        print(f"  {unchanged} unchanged (timestamp preserved)")
    if changed:
        print(f"  {changed} modified (timestamp updated)")
    if new_items:
        print(f"  {new_items} new items")
    return items_by_tier


# ==========================================
# 5. 编译 → iceberg.json
# ==========================================
def compile_data(work_dir, output_dir):
    """从 work_dir (config.json + items/) 编译，输出 iceberg.json 到 output_dir"""
    config_path = os.path.join(work_dir, 'config.json')
    items_dir = os.path.join(work_dir, 'items')

    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    tiers = {}
    for tier_name, id_list in config['tiers'].items():
        tier_items = []
        for iid in id_list:
            item = read_item_md(os.path.join(items_dir, f"{iid}.md"))
            if item:
                tier_items.append(item)
        tiers[tier_name] = tier_items

    data = {
        "generatedAt": config['generatedAt'],
        "introText": config['introText'],
        "categoryColors": config['categoryColors'],
        "tagMap": config['tagMap'],
        "tiers": tiers,
        "tierOrder": config['tierOrder'],
        "defaultColor": config['defaultColor'],
        "idAliases": config.get('idAliases', {})  # F30：旧链接重定向表
    }

    os.makedirs(output_dir, exist_ok=True)
    json_str = json.dumps(data, ensure_ascii=False, indent=2)

    # F32：快照 + 原子替换（覆盖失败不影响旧数据）
    json_path = os.path.join(output_dir, 'iceberg.json')
    if os.path.exists(json_path):
        import shutil
        shutil.copy2(json_path, json_path + '.bak')
    tmp_path = json_path + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        f.write(json_str)
    os.replace(tmp_path, json_path)

    total = sum(len(v) for v in tiers.values())
    print(f"  输出: {json_path} ({total} items)")


# ==========================================
# 6. 归档旧数据
# ==========================================
def _items_fingerprint(items_by_tier):
    """items 内容指纹：每条 title|category|tags|desc|link 的连接串哈希"""
    entries = []
    for tier_name, items in items_by_tier.items():
        for item in items:
            entries.append((item.get('id', ''), _fingerprint(item)))
    return '\n'.join(f"{iid}|{fp}" for iid, fp in sorted(entries))


def _items_fingerprint_from_dir(items_dir):
    """读取 work_dir/items/*.md 计算旧 items 指纹（与 _items_fingerprint 同格式）"""
    if not os.path.isdir(items_dir):
        return None
    entries = []
    for fn in sorted(os.listdir(items_dir)):
        if not fn.endswith('.md'):
            continue
        old_item = read_item_md(os.path.join(items_dir, fn))
        if old_item:
            entries.append((old_item.get('id', ''), _fingerprint(old_item)))
    return '\n'.join(f"{iid}|{fp}" for iid, fp in sorted(entries))


def archive_existing(work_dir, new_config=None, new_items_fp=None):
    """将 work_dir/ 下已有文件移动到 data_archive/YYYY-MM-DD_HHMMSS/（仅当有变化时）"""
    if not os.path.exists(work_dir):
        return

    entries = os.listdir(work_dir)
    has_data = any(
        e in ('config.json',) or e == 'items'
        for e in entries
    )
    if not has_data:
        return

    # 比较新旧 config，无变化则跳过归档
    old_config_path = os.path.join(work_dir, 'config.json')
    if new_config and os.path.exists(old_config_path):
        import json
        with open(old_config_path, 'r', encoding='utf-8') as f:
            old_config = json.load(f)
        # 比较时排除 generatedAt 和无关字段
        old_tiers = old_config.get('tiers', {})
        new_tiers = new_config.get('tiers', {})
        unchanged = (
            old_tiers == new_tiers
            and old_config.get('introText') == new_config.get('introText')
        )
        # 条目内容变化也触发归档：对比 items 指纹（title|category|tags|desc|link）
        if unchanged and new_items_fp is not None:
            old_fp = _items_fingerprint_from_dir(os.path.join(work_dir, 'items'))
            if old_fp is not None:
                unchanged = old_fp == new_items_fp
        if unchanged:
            return  # 无变化，跳过归档

    ts = datetime.now().strftime('%Y-%m-%d_%H%M%S')
    archive_dir = os.path.join(ROOT, 'data/archive', ts)
    os.makedirs(archive_dir, exist_ok=True)

    for entry in entries:
        src = os.path.join(work_dir, entry)
        dst = os.path.join(archive_dir, entry)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
            shutil.rmtree(src)
        else:
            shutil.copy2(src, dst)
            os.remove(src)

    print(f'  归档旧数据 → {archive_dir}')


# ==========================================
# 7. 主入口
# ==========================================
def build(html_file, work_dir, output_dir):
    if not os.path.exists(html_file):
        print(f"ERROR: HTML file not found: {html_file}")
        sys.exit(1)

    items_dir = os.path.join(work_dir, 'items')
    config_path = os.path.join(work_dir, 'config.json')

    # 1. Extract from HTML
    print(f"Extracting from: {html_file}")
    items_by_tier, config = extract_from_html(html_file)
    total = sum(len(v) for v in items_by_tier.values())
    print(f"  {total} items across {len(config['tierOrder'])} tiers")

    # 2. Merge timestamps with existing .md files (must happen BEFORE archiving)
    items_by_tier = merge_timestamps(items_by_tier, items_dir)

    # F30: 稳定 ID（tier::title 锚定复用）+ alias + 碰撞检查
    history = load_history()
    id_aliases = stabilize_ids(items_by_tier, history)

    # 3. Archive old intermediate data, then write new
    archive_existing(work_dir, config, new_items_fp=_items_fingerprint(items_by_tier))

    # 4. Update generatedAt
    config['generatedAt'] = NOW

    # 5. Update tier→id lists in config
    config['tiers'] = {t: [it['id'] for it in items_by_tier[t]] for t in config['tierOrder']}

    # 6. Write individual .md files to work_dir
    written = 0
    for tier_name, items in items_by_tier.items():
        for item in items:
            write_item_md(os.path.join(items_dir, f"{item['id']}.md"), item)
            written += 1
    print(f"  {written} .md files → {items_dir}/")

    # 7. Write config.json to work_dir
    config['idAliases'] = id_aliases  # F30
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    print(f"  config.json → {config_path}")

    # 8. Compile → iceberg.json in output_dir
    compile_data(work_dir, output_dir)

    # F30：持久化 ID 历史（下次构建复用）
    save_history(history)


if __name__ == '__main__':
    html_file = sys.argv[1] if len(sys.argv) > 1 else 'iceberg.html'
    work_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'data/work')

    # 只 build 一次（归档也只在这一次发生）
    build(html_file, work_dir, os.path.join(ROOT, 'iceberg-vue/src/data'))

