"""
json_to_yaml.py — 将 iceberg.json 转换为 iceberg.yaml

用法:
    python json_to_yaml.py [input_json] [output_yaml]

默认:
    python json_to_yaml.py iceberg-vue/src/data/iceberg.json iceberg.yaml

YAML 格式更适合人工编辑，每个词条的 desc 字段支持多行文字。
"""

import json
import sys
import os

import yaml


def convert(input_path: str, output_path: str):
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    class LiteralStr(str):
        pass

    def literal_representer(dumper, value):
        return dumper.represent_scalar('tag:yaml.org,2002:str', value, style='|')

    class FlowList(list):
        pass

    def flowlist_representer(dumper, value):
        return dumper.represent_sequence('tag:yaml.org,2002:seq', value, flow_style=True)

    yaml.add_representer(LiteralStr, literal_representer)
    yaml.add_representer(FlowList, flowlist_representer)

    # 层级转为词条内字段，扁平化为单列表
    import re as _re
    flat_items = []
    for tier_name, items in data.get('tiers', {}).items():
        tier_num = _re.search(r'\d+', tier_name)
        for item in items:
            item.pop('id', None)
            item.pop('modifiedAt', None)
            item.pop('related', None)    # 迁移至副表
            item['tier'] = int(tier_num.group()) if tier_num else tier_name
            if item.get('tags'):
                item['tags'] = FlowList(item['tags'])
            else:
                item.pop('tags', None)
            if not item.get('link'):
                item.pop('link', None)
            if item.get('desc'):
                item['desc'] = LiteralStr(item['desc'])
            else:
                item.pop('desc', None)
            flat_items.append(item)

    total = len(flat_items)
    print(f"  读取: {input_path} ({total} items, {len(data['tierOrder'])} tiers)")

    yaml_data = {
        'items': flat_items,
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        yaml.dump(
            yaml_data,
            f,
            allow_unicode=True,
            default_flow_style=False,
            sort_keys=False,
            width=120,
            indent=2,
        )

    size_kb = os.path.getsize(output_path) / 1024
    print(f"  输出: {output_path} ({size_kb:.0f} KB)")


if __name__ == '__main__':
    # 2026-08-16 深度重整理：默认路径基于脚本位置推导（脚本位于 scripts/）
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    input_file = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'iceberg-vue/src/data/iceberg.json')
    output_file = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, 'iceberg.yaml')
    convert(input_file, output_file)
