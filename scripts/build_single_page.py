"""
build_single_page.py — 从 iceberg.json 生成单文件 HTML 冰山图

数据来源为 build_data.py 输出的 iceberg.json，与 React 版共用同一份数据。
生成的 HTML 无任何外部依赖：内嵌样式和脚本，系统字体。

用法:
    python build_single_page.py
    python build_single_page.py --data path/to/iceberg.json --output index.html
    python build_single_page.py --title "我的冰山图" --output my_iceberg.html
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime

FONT_STACK = (
    '"Noto Sans SC", -apple-system, BlinkMacSystemFont, "PingFang SC", '
    '"Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
)


# ==========================================
# 数据加载
# ==========================================


def load_data(path):
    if not os.path.exists(path):
        sys.exit(f'❌ 数据文件不存在: {path}')
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    if 'tiers' not in data or 'tierOrder' not in data:
        sys.exit('❌ 数据格式错误：缺少 tiers 或 tierOrder')
    return data


# ==========================================
# 工具函数
# ==========================================


def stable_offset(seed):
    """基于种子字符串生成稳定偏移，每次构建结果一致"""
    h = int(hashlib.md5(seed.encode()).hexdigest()[:8], 16)
    tx = ((h % 1100) / 100) - 5.5
    ty = ((h >> 11) % 900) / 100 - 4.5
    return round(tx, 2), round(ty, 2)


def esc(s):
    """HTML 属性值转义"""
    return s.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')


# ==========================================
# HTML 生成
# ==========================================


def build_html(data, title, subtitle):
    tiers = data['tiers']
    tier_order = data['tierOrder']
    category_colors = data.get('categoryColors', {})
    tag_map = data.get('tagMap', {})
    default_color = data.get('defaultColor', '#FFFFFF')
    intro_text = data.get('introText', '')

    # 构建 emoji → name 反向映射
    name_to_emoji = {v: k for k, v in tag_map.items()}

    # 扁平化所有词条，附加处理后的字段
    all_items = []
    for tier_name in tier_order:
        for item in tiers.get(tier_name, []):
            tags = item.get('tags', [])
            emojis = [name_to_emoji.get(t, t) for t in tags]
            full_tags = [f'{name_to_emoji.get(t, t)} {t}' for t in tags if name_to_emoji.get(t) is not None]
            tx, ty = stable_offset(item['id'])
            all_items.append({
                'tier': tier_name,
                'title': item['title'],
                'category': item.get('category', ''),
                'color': category_colors.get(item.get('category', ''), default_color),
                'emojis': emojis,
                'full_tags': full_tags,
                'desc': item.get('desc', ''),
                'link': item.get('link', ''),
                'tx': tx,
                'ty': ty,
                'id': item['id'],
            })

    total_tiers = len(tier_order)

    parts = [
        '<!DOCTYPE html>',
        '<html lang="zh-CN">',
        '<head>',
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">',
        f'<title>{esc(title)}</title>',
        '<style>',
        f':root {{ --total-tiers: {total_tiers}; }}',
        f'* {{ box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }}',
        f'body {{ background: #050505; font-family: {FONT_STACK}; color: #fff; min-height: 100vh; padding: 40px 16px 80px; overflow-x: hidden; }}',
        f'a {{ color: inherit; text-decoration: none; }}',

        # 页头
        f'.header {{ text-align: center; margin-bottom: 40px; padding: 40px 16px 0; }}',
        f'.header .subtitle {{ margin-bottom: 16px; font-size: 0.875rem; font-weight: 300; letter-spacing: 0.8em; margin-right: -0.8em; color: rgba(255,255,255,0.5); text-transform: uppercase; }}',
        f'.header .title-wrap {{ position: relative; display: inline-flex; align-items: flex-start; }}',
        f'.header .title {{ font-weight: 900; font-size: 3.8rem; letter-spacing: 0.1em; line-height: 1; color: #fff; }}',
        f'.header .version {{ position: absolute; right: -56px; top: 0; font-weight: 100; font-size: 1.1rem; color: rgba(255,255,255,0.9); letter-spacing: 0.1em; user-select: none; }}',
        f'.header .meta {{ margin-top: 32px; font-size: 0.85rem; font-weight: 300; color: rgba(255,255,255,0.5); letter-spacing: 0.1em; text-transform: uppercase; }}',
        f'.header .meta-sep {{ margin: 0 12px; opacity: 0.3; }}',
        f'.header .intro {{ margin-top: 24px; font-size: 1rem; color: rgba(255,255,255,0.6); font-weight: 400; line-height: 1.625; max-width: 750px; margin-left: auto; margin-right: auto; white-space: pre-wrap; }}',

        # 图例
        f'.legend {{ max-width: 900px; margin: 0 auto 60px; padding-bottom: 40px; border-bottom: 1px solid #333; }}',
        f'.legend h3 {{ font-size: 0.7rem; font-weight: 700; letter-spacing: 0.15em; color: #666; text-transform: uppercase; text-align: center; margin: 24px 0 12px; }}',
        f'.legend-grid {{ display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 14px; }}',
        f'.legend-btn {{ display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 500; padding: 5px 12px; border-radius: 20px; cursor: pointer; transition: opacity 0.2s, background 0.15s; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.06); color: inherit; user-select: none; }}',
        f'.legend-btn:hover {{ background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.2); }}',
        f'.legend-btn.dimmed {{ opacity: 0.2; filter: grayscale(1); }}',
        f'.legend-dot {{ width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }}',

        # 层级
        f'.tier {{ padding: 30px 0; border-bottom: 1px solid #222; }}',
        f'.tier:last-child {{ border-bottom: none; }}',
        f'.tier-title {{ text-align: center; font-weight: 900; font-size: 0.75rem; color: rgba(255,255,255,0.3); letter-spacing: 0.4em; text-transform: uppercase; margin-bottom: 20px; }}',
        f'.items {{ display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px 14px; max-width: 1200px; margin: 0 auto; padding: 0 20px; }}',

        # 词条
        f'.item {{ display: inline-flex; align-items: center; font-weight: 700; font-size: 1.1rem; cursor: crosshair; position: relative; padding: 2px 6px; color: var(--c); transition: all 0.2s ease; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }}',
        f'.item.hidden {{ display: none !important; }}',
        f'.item.dimmed {{ opacity: 0.08; filter: blur(2px) grayscale(1); pointer-events: none; }}',
        f'.item:hover {{ background: var(--c); z-index: 10; text-shadow: none !important; }}',
        f'.item:hover .item-text, .item:hover .item-tag {{ color: #000 !important; }}',
        f'.item-tag {{ font-size: 0.5em; margin-left: 5px; position: relative; top: -0.15em; }}',

        # Tooltip
        f'.tooltip {{ position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: #fff; padding: 12px 16px; width: max-content; max-width: min(360px, 85vw); max-height: 55vh; overflow-y: auto; z-index: 100; text-shadow: none; text-align: left; box-shadow: 0 8px 24px rgba(0,0,0,0.6); opacity: 0; visibility: hidden; transition: opacity 0.15s, visibility 0.15s; }}',
        f'.tooltip::-webkit-scrollbar {{ width: 4px; }}',
        f'.tooltip::-webkit-scrollbar-thumb {{ background: #ccc; border-radius: 2px; }}',
        f'.item:hover .tooltip {{ opacity: 1; visibility: visible; }}',
        f'.item.tip-left .tooltip {{ left: 0; transform: none; }}',
        f'.item.tip-right .tooltip {{ left: auto; right: 0; transform: none; }}',
        f'.item.tip-bottom .tooltip {{ bottom: auto; top: 100%; }}',
        f'.tooltip-desc {{ color: #000; font-size: 14px; font-weight: 500; line-height: 1.5; white-space: pre-wrap; }}',
        f'.tooltip-meta {{ margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; color: #888; font-size: 12px; }}',

        # 搜索
        f'.search {{ max-width: 500px; margin: 0 auto 40px; }}',
        f'.search input {{ width: 100%; padding: 10px 16px; font-size: 0.95rem; color: #fff; background: rgba(255,255,255,0.05); border: 1px solid #333; border-radius: 6px; outline: none; transition: border-color 0.2s, background 0.2s; }}',
        f'.search input:focus {{ border-color: #888; background: rgba(255,255,255,0.08); }}',

        # 移动端
        f'#overlay {{ display: none; }}',
        f'#sheet {{ display: none; }}',

        f'@media (max-width: 768px) {{',
        f'  body {{ padding: 20px 8px 60px; }}',
        f'  .header {{ padding: 20px 8px 0; }}',
        f'  .header .subtitle {{ font-size: 0.65rem; letter-spacing: 0.6em; margin-right: -0.6em; }}',
        f'  .header .title {{ font-size: 2.4rem; }}',
        f'  .header .version {{ right: -44px; top: -8px; font-size: 1rem; }}',
        f'  .header .intro {{ font-size: 0.95rem; text-align: justify; }}',
        f'  .item {{ font-size: 1rem; }}',
        f'  .items {{ gap: 6px 10px; padding: 0 10px; }}',
        f'  .tooltip {{ display: none !important; }}',
        f'  #overlay {{ display: block; position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 999; opacity: 0; pointer-events: none; transition: opacity 0.25s; }}',
        f'  #overlay.show {{ opacity: 1; pointer-events: auto; }}',
        f'  #sheet {{ display: block; position: fixed; bottom: 0; left: 0; width: 100%; background: #fff; z-index: 1000; padding: 12px 20px 30px; border-radius: 20px 20px 0 0; box-shadow: 0 -8px 30px rgba(0,0,0,0.5); transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.2,0.8,0.2,1); max-height: 80vh; overflow-y: auto; }}',
        f'  #sheet.show {{ transform: translateY(0); }}',
        f'  .sheet-handle {{ width: 36px; height: 4px; background: #ddd; border-radius: 2px; margin: 0 auto 16px; }}',
        f'  .sheet-title {{ font-size: 1.3rem; font-weight: 900; color: #000; margin-bottom: 12px; }}',
        f'  #sheet .tooltip-desc {{ font-size: 1rem; color: #222; }}',
        f'  #sheet .tooltip-meta {{ font-size: 0.85rem; }}',
        f'  .sheet-link {{ display: block; margin-top: 18px; padding: 12px; background: #111; color: #fff !important; text-align: center; border-radius: 10px; font-weight: bold; font-size: 1rem; }}',
        f'}}',
        '</style>',
        '</head>',
        '<body>',

        # 标题
        f'<div class="header">',
        f'<div class="subtitle">{esc(subtitle)}</div>' if subtitle else '',
        f'<div class="title-wrap"><h1 class="title">{esc(title)}</h1>',
        f'<span class="version">{esc(data.get("version", "第六版"))}</span></div>',
    ]

    # 构建日期 + 词条数
    generated_at = data.get('generatedAt')
    if generated_at:
        from datetime import datetime as dt
        build_date = dt.fromtimestamp(generated_at).strftime('%Y/%m/%d')
        total_items = sum(len(v) for v in tiers.values())
        parts.append(
            f'<p class="meta">{build_date}'
            f'<span class="meta-sep">|</span>{total_items} Entries</p>'
        )

    # 介绍文字
    if intro_text:
        parts.append(f'<p class="intro">{esc(intro_text)}</p>')

    parts.append('</div>')

    # 搜索框
    parts.append('<div class="search"><input type="text" id="search" placeholder="搜索词条..." autocomplete="off"></div>')

    # 图例
    parts.append('<div class="legend">')
    parts.append('<h3>分类</h3><div class="legend-grid">')
    for cat, color in category_colors.items():
        parts.append(
            f'<button class="legend-btn" data-type="cat" data-val="{esc(cat)}" style="color:{color}">'
            f'<span class="legend-dot" style="background:{color}"></span>{esc(cat)}</button>'
        )
    parts.append('</div>')

    parts.append('<h3>标签</h3><div class="legend-grid">')
    for emoji, name in sorted(tag_map.items(), key=lambda x: x[1]):
        parts.append(
            f'<button class="legend-btn" data-type="tag" data-val="{esc(emoji)}" style="color:#999">'
            f'<span>{emoji}</span>{esc(name)}</button>'
        )
    parts.append('</div></div>')

    # 冰山层级
    for tier_name in tier_order:
        items = [it for it in all_items if it['tier'] == tier_name]
        parts.append(
            f'<div class="tier"><div class="tier-title">{esc(tier_name)}</div><div class="items">'
        )

        for it in items:
            cat_esc = esc(it['category'])
            tags_esc = esc(','.join(it['emojis']))
            search_data = esc(f"{it['title']} {it['desc']} {it['category']} {' '.join(it['full_tags'])}".lower())
            link_esc = esc(it['link']) if it['link'] else ''

            parts.append(
                f'<div class="item" data-category="{cat_esc}" data-tags="{tags_esc}" '
                f'data-search="{search_data}" data-link="{link_esc}" '
                f'style="--c:{it["color"]};transform:translate({it["tx"]}px,{it["ty"]}px)">'
            )

            if it['link']:
                parts.append(f'<a class="item-text" href="{esc(it["link"])}" target="_blank">{esc(it["title"])}</a>')
            else:
                parts.append(f'<span class="item-text">{esc(it["title"])}</span>')

            for em in it['emojis']:
                parts.append(f'<span class="item-tag">{em}</span>')

            # Tooltip
            parts.append('<div class="tooltip">')
            if it['desc']:
                parts.append(f'<div class="tooltip-desc">{esc(it["desc"])}</div>')
            meta = f'类别: {esc(it["category"])}'
            if it['full_tags']:
                tags_joined = ' &nbsp;'.join(esc(t) for t in it['full_tags'])
                meta += f' &nbsp;|&nbsp; 标签: {tags_joined}'
            parts.append(f'<div class="tooltip-meta">{meta}</div>')
            parts.append('</div></div>')

        parts.append('</div></div>')

    # 移动端覆盖层
    parts.append('<div id="overlay"></div><div id="sheet"></div>')

    # JS
    parts.append('<script>')
    parts.append(js_template())
    parts.append('</script></body></html>')

    return '\n'.join(parts)


def js_template():
    """返回内联 JavaScript"""
    return r"""
    const items = document.querySelectorAll('.item');
    const buttons = document.querySelectorAll('.legend-btn');
    const search = document.getElementById('search');
    const overlay = document.getElementById('overlay');
    const sheet = document.getElementById('sheet');

    // ==========================================
    // 1. PC Tooltip 定位
    // ==========================================
    items.forEach(item => {
        item.addEventListener('mouseenter', function() {
            if (window.innerWidth <= 768 || window.matchMedia('(pointer: coarse)').matches) return;
            const tip = this.querySelector('.tooltip');
            if (!tip) return;
            this.classList.remove('tip-left', 'tip-right', 'tip-bottom');
            const r = this.getBoundingClientRect();
            const tw = tip.getBoundingClientRect().width;
            const th = tip.getBoundingClientRect().height;
            if (r.left < tw / 2) this.classList.add('tip-left');
            else if (window.innerWidth - r.right < tw / 2) this.classList.add('tip-right');
            if (r.top < th + 12) this.classList.add('tip-bottom');
        });
    });

    // ==========================================
    // 2. 移动端 Bottom Sheet
    // ==========================================
    let activeItem = null;

    function closeSheet() {
        if (activeItem) activeItem.classList.remove('mobile-active');
        activeItem = null;
        overlay.classList.remove('show');
        sheet.classList.remove('show');
    }

    overlay.addEventListener('click', closeSheet);

    items.forEach(item => {
        item.addEventListener('click', function(e) {
            if (!window.matchMedia('(pointer: coarse)').matches || e.pointerType === 'mouse') return;
            e.preventDefault();
            if (activeItem === this) { closeSheet(); return; }
            closeSheet();
            this.classList.add('mobile-active');
            activeItem = this;

            const tip = this.querySelector('.tooltip');
            const linkEl = this.querySelector('.item-text');
            const itemLink = this.getAttribute('data-link') || (linkEl && linkEl.href) || '';
            const itemTitle = linkEl ? linkEl.innerText : '';

            let html = '<div class="sheet-handle"></div>';
            if (itemTitle) html += '<div class="sheet-title">' + itemTitle + '</div>';
            html += tip.innerHTML;
            if (itemLink) html += '<a href="' + itemLink + '" target="_blank" class="sheet-link">\u{1f517} 访问词条链接</a>';
            sheet.innerHTML = html;
            overlay.classList.add('show');
            sheet.classList.add('show');
        });
    });

    // ==========================================
    // 3. 筛选与搜索
    // ==========================================
    let activeFilter = null;

    buttons.forEach(btn => {
        btn.addEventListener('click', function() {
            search.value = '';
            const type = this.getAttribute('data-type');
            const val = this.getAttribute('data-val');

            if (activeFilter && activeFilter.type === type && activeFilter.val === val) {
                activeFilter = null;
                buttons.forEach(b => b.classList.remove('dimmed'));
                items.forEach(i => { i.classList.remove('dimmed', 'hidden'); });
            } else {
                activeFilter = {type, val};
                buttons.forEach(b => b.classList.toggle('dimmed', b !== this));
                items.forEach(i => {
                    const match = type === 'cat'
                        ? i.getAttribute('data-category') === val
                        : i.getAttribute('data-tags').split(',').includes(val);
                    i.classList.toggle('dimmed', !match);
                    i.classList.remove('hidden');
                });
            }
        });
    });

    search.addEventListener('input', function() {
        const q = this.value.toLowerCase().trim();
        if (activeFilter) {
            activeFilter = null;
            buttons.forEach(b => b.classList.remove('dimmed'));
        }
        if (!q) {
            items.forEach(i => { i.classList.remove('dimmed', 'hidden'); });
            return;
        }
        items.forEach(i => {
            const match = i.getAttribute('data-search').includes(q);
            i.classList.toggle('dimmed', !match);
            i.classList.remove('hidden');
        });
    });

    // ==========================================
    // 4. 全局点击关闭（移动端误触保护）
    // ==========================================
    document.addEventListener('click', function(e) {
        if (activeItem && !e.target.closest('.item') && !e.target.closest('#sheet')) {
            closeSheet();
        }
    });
    """


# ==========================================
# CLI
# ==========================================


def resolve_output(path):
    """如果文件已存在，自动追加 _1, _2 ... 后缀"""
    if not os.path.exists(path):
        return path
    base, ext = os.path.splitext(path)
    n = 1
    while os.path.exists(f'{base}_{n}{ext}'):
        n += 1
    return f'{base}_{n}{ext}'


def main():
    default_output = f'Iceberg_{datetime.now().strftime("%Y-%m-%d_%H%M%S")}.html'
    parser = argparse.ArgumentParser(description='从 iceberg.json 生成单文件 HTML 冰山图')
    # 2026-08-16 深度重整理：默认数据源改为 Vue 版主数据（原指向已归档的 iceberg-react）
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    parser.add_argument('--data', default=os.path.join(root, 'iceberg-vue/src/data/iceberg.json'), help='iceberg.json 路径')
    parser.add_argument('--output', default=default_output, help=f'输出 HTML 文件名 (默认: {default_output})')
    parser.add_argument('--title', default='中文兔子洞冰山图', help='页面标题')
    parser.add_argument('--subtitle', default='Chinese Oddities Iceberg', help='英文副标题（留空省略）')
    args = parser.parse_args()

    output = resolve_output(args.output)

    print(f'读取: {args.data}')
    data = load_data(args.data)

    item_count = sum(len(v) for v in data['tiers'].values())
    print(f'  {item_count} 个词条，{len(data["tierOrder"])} 个层级，'
          f'{len(data.get("categoryColors", {}))} 个分类，{len(data.get("tagMap", {}))} 个标签')

    print('生成 HTML...')
    html = build_html(data, args.title, args.subtitle)

    with open(output, 'w', encoding='utf-8-sig') as f:
        f.write(html)

    size_kb = os.path.getsize(output) / 1024
    print(f'  输出: {output} ({size_kb:.0f} KB)')


if __name__ == '__main__':
    main()
