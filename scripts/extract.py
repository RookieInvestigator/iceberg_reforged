import csv
import re
from bs4 import BeautifulSoup

COLOR_RE = re.compile(r'(#[0-9a-fA-F]{3,6}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))')

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

def extract_iceberg_to_csv(html_file, output_csv):
    with open(html_file, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')

    # 1. 建立辅助的"颜色->类别名"和"Emoji->标签名"字典（为了让CSV依然有人类可读的中文）
    category_map = {}
    marker_map = {}

    category_divs = soup.find_all('div', style=re.compile(r'background-color'))
    for div in category_divs:
        span = div.find('span')
        if span:
            cat_name = span.get_text(strip=True)
            color_match = COLOR_RE.search(div.get('style', ''))
            if color_match:
                category_map[normalize_color(color_match.group(1))] = cat_name

    marker_spans = soup.find_all('span', class_='marker-button-selector')
    for marker in marker_spans:
        text_span = marker.find('span')
        if text_span:
            sup_tag = text_span.find('sup')
            if sup_tag:
                emoji = sup_tag.get_text(strip=True)
                sup_tag.extract()
                if emoji:
                    marker_map[emoji] = text_span.get_text(strip=True)

    # 2. 解析所有冰山图词条，提取标准 ID
    items = soup.find_all('div', attrs={'data-iceberg-item': True})
    data_list = []

    for item in items:
        # 【重要更新】直接获取原生的 data-category-id 和 data-marker-ids
        category_id = item.get('data-category-id', '')
        marker_ids = item.get('data-marker-ids', '')
        
        # 获取描述
        description = item.get('data-tooltip', '').strip()
        
        # 获取标题和链接
        title, link = "", ""
        a_tag = item.find('a', class_='extra-shadow')
        if a_tag:
            title, link = a_tag.get_text(strip=True), a_tag.get('href', '')
        else:
            span_tag = item.find('span', class_='extra-shadow')
            if span_tag:
                title = span_tag.get_text(strip=True)
        
        # 辅助获取中文类别名
        category_name = "未知类别"
        color_div = item.find('div', style=re.compile(r'color:\s*(#[0-9a-fA-F]{6}|rgb)'))
        if color_div:
            color_match = COLOR_RE.search(color_div.get('style', ''))
            if color_match:
                category_name = category_map.get(normalize_color(color_match.group(1)), "未知类别")
        
        # 辅助获取中文标签名
        item_tags = []
        for span in item.find_all('span', class_='text-xs'):
            emoji = span.get_text(strip=True)
            item_tags.append(f"{marker_map.get(emoji, '')} {emoji}".strip())
        tags_str = ' | '.join(item_tags)
        
        # 获取层级 (Tier)
        tier_name = "未知层级"
        tier_container = item.find_parent('div', class_='z-[1]')
        if tier_container:
            tier_header = tier_container.find('div', class_='text-2xl')
            if tier_header:
                tier_name = tier_header.get_text(strip=True)

        data_list.append({
            '层级 (Tier)': tier_name,
            '类别ID (Category ID)': category_id,
            '类别名称 (Category Name)': category_name,
            '标签IDs (Marker IDs)': marker_ids,
            '标签名称 (Tags)': tags_str,
            '标题 (Title)': title,
            '描述 (Description)': description,
            '链接 (Link)': link
        })

    # 3. 写入 CSV
    if not data_list:
        print("未找到任何词条，请检查 HTML 结构。")
        return

    headers = list(data_list[0].keys())
    with open(output_csv, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(data_list)
        
    print(f"成功提取 {len(data_list)} 个词条（包含 Category ID 和 Marker IDs）！已保存至 {output_csv}")

if __name__ == '__main__':
    extract_iceberg_to_csv('iceberg.html', 'iceberg_database.csv')