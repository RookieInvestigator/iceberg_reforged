"""无依赖的中英混排「按首字母」排序键（数据管线共用）。

背景：参与创作者名单排序此前依赖可选 pypinyin，缺失时回退 Unicode 序
（数字 < 大写 < 小写 < 汉字码点），产出「看起来完全没排序」的名单；
而 CLAUDE.md 要求数据脚本零外部依赖。本模块改为读取仓库既有事实源
`iceberg-vue/src/lib/pinyin.ts` 的汉字→拼音**首字母**定长表
（HandbookView A-Z 同款），实现标准库内的确定性拼音序：

  key(名字) = 逐字「首字母或原字符」拼接后小写
  —— ASCII 名字 ≈ 全小写（大小写不敏感穿插）；汉字按首字母序列排序，
     与英文名自然混排；表外字符（假名等）保留原字符，仍确定性。

用法：
  from pinyin_sort import sort_key
  names.sort(key=sort_key)
  或 python scripts/pinyin_sort.py --fix-iceberg   # 原地重排 iceberg.json 的 introText
"""
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PINYIN_TS = REPO_ROOT / 'iceberg-vue' / 'src' / 'lib' / 'pinyin.ts'
TABLE_START = 0x4E00
TABLE_END = 0x9FED  # CJK 基本区上界（与 pinyin.ts 覆盖一致）
EXPECTED_LEN = TABLE_END - TABLE_START + 1

_table: str | None = None


def _load_table() -> str:
    """解析 pinyin.ts 的定长表（INITIAL_TABLE = '...' + '...' 串接），缓存结果。"""
    global _table
    if _table is not None:
        return _table
    text = PINYIN_TS.read_text(encoding='utf-8')
    start = text.index('const INITIAL_TABLE')
    # 表块结束于其后的首个文档注释或函数声明
    end = text.find('function lookupInitial', start)
    if end < 0:
        end = text.find('/**', start)
    if end < 0:
        raise RuntimeError(f'pinyin.ts 表块解析失败：{PINYIN_TS}')
    table = ''.join(re.findall(r"'([A-Z\-]*)'", text[start:end]))
    if len(table) != EXPECTED_LEN:
        raise RuntimeError(f'pinyin.ts 表长度异常：{len(table)} != {EXPECTED_LEN}（需重新导出）')
    _table = table
    return table


def sort_key(name: str) -> str:
    """混排排序键：逐字「首字母（汉字）/ 原字符（其余）」拼接，整体小写。"""
    t = _load_table()
    out: list[str] = []
    for ch in name:
        i = ord(ch) - TABLE_START
        if 0 <= i < len(t):
            c = t[i]
            out.append(c if c != '-' else ch)
        else:
            out.append(ch)
    return ''.join(out).lower()


def _fix_iceberg(path: Path) -> bool:
    """单行内定点重排 iceberg.json 的 introText 创作者名单（其余字节零扰动）。

    ⚠️ 只在 introText 所在 JSON 行内操作：名单以「值结尾引号」为界，不假设以句号结束
    （早前文本级实现以 find('。') 切段，命中后续 desc 的句号导致名单截断注入（已回滚修复）。
    """
    lines = path.read_text(encoding='utf-8').split('\n')
    li = next((i for i, l in enumerate(lines) if l.startswith('  "introText": ')), None)
    if li is None:
        print(f'  {path.name}: 未找到 introText 行（跳过）')
        return False
    line = lines[li]
    key, value = line.split(':', 1)
    value = value.strip()
    has_comma = value.endswith(',')
    if has_comma:
        value = value[:-1]
    if not (value.startswith('"') and value.endswith('"')):
        print(f'  {path.name}: introText 值结构异常（跳过）')
        return False
    body = value[1:-1]
    marker = '参与创作者（按首字母排序）：'
    mi = body.find(marker)
    if mi < 0:
        print(f'  {path.name}: 未找到创作者段（跳过）')
        return False
    head, rest = body[:mi + len(marker)], body[mi + len(marker):]
    suffix = ''
    if rest.endswith('。'):
        rest, suffix = rest[:-1], '。'
    names = [n.strip() for n in rest.split('、') if n.strip()]
    if len(set(names)) != len(names):
        print(f'  {path.name}: 名单含重复项（跳过，需人工检查）')
        return False
    ordered = sorted(names, key=sort_key)
    if ordered == names:
        print(f'  {path.name}: 已按首字母排序，无需改动')
        return False
    lines[li] = key + ': "' + head + '、'.join(ordered) + suffix + ('",' if has_comma else '"')
    path.write_text('\n'.join(lines), encoding='utf-8')
    print(f'  {path.name}: 已重排 {len(names)} 个创作者名（原序 ≠ 拼音序）')
    return True


def main() -> int:
    if '--fix-iceberg' in sys.argv:
        _fix_iceberg(REPO_ROOT / 'iceberg-vue' / 'src' / 'data' / 'iceberg.json')
        return 0
    # 冒烟：从当前 json 抽取名单并打印拼音序前 12 / 末 8
    raw = json.loads((REPO_ROOT / 'iceberg-vue/src/data/iceberg.json').read_text(encoding='utf-8'))
    intro = raw.get('introText', '')
    m = re.search(r'参与创作者(?:（[^）]*）)?：', intro)
    if not m:
        print('未找到创作者段')
        return 1
    tail = intro[m.end():]
    names = [n.strip() for n in tail.split('。')[0].split('、') if n.strip()]
    ordered = sorted(names, key=sort_key)
    print(f'共 {len(ordered)} 名；拼音序样本：')
    print('、'.join(ordered[:12]))
    print('…')
    print('、'.join(ordered[-8:]))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
