"""输出词条名列表 → items_by_category.txt / items_by_tag.txt"""
import json, sys

def main(data_path=None):
    if data_path is None:
        # 2026-08-16 深度重整理：默认路径基于脚本位置推导（脚本位于 scripts/）
        import os
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        data_path = os.path.join(root, 'iceberg-vue/src/data/iceberg.json')
    data = json.load(open(data_path, 'r', encoding='utf-8'))
    all_items = []
    for tier in data['tierOrder']:
        all_items.extend(data['tiers'][tier])

    choice = sys.argv[1] if len(sys.argv) > 1 else 'both'

    if choice in ('category', 'both'):
        cats = {}
        for item in all_items:
            cats.setdefault(item['category'], []).append(item['title'])
        with open('items_by_category.txt', 'w', encoding='utf-8') as f:
            for cat in sorted(cats):
                f.write(f'\n【{cat}】（{len(cats[cat])} 条）\n')
                for t in cats[cat]:
                    f.write(f'  · {t}\n')
        print('OK → items_by_category.txt')

    if choice in ('tag', 'both'):
        tags = {}
        for item in all_items:
            for tag in item.get('tags', []):
                tags.setdefault(tag, set()).add(item['title'])
        with open('items_by_tag.txt', 'w', encoding='utf-8') as f:
            for tag in sorted(tags, key=lambda t: len(tags[t]), reverse=True):
                titles = tags[tag]
                f.write(f'\n【{tag}】（{len(titles)} 条）\n')
                for t in sorted(titles):
                    f.write(f'  · {t}\n')
        print('OK → items_by_tag.txt')

if __name__ == '__main__':
    main()
