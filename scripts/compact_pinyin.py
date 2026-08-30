"""把 src/lib/pinyin.ts 的汉字→拼音首字母对象字面量，压缩为定长字符串查表。

背景：pinyin.ts 原始形态是 2 万多条的对象字面量（218KB），是 HandbookView
chunk（173KB / gzip 64KB）体积的主要来源，而它只被术语表的 A-Z 分组用到。

压缩原理：映射覆盖 CJK 基本区 U+4E00–U+9FED，且取值只有 23 个字母，
因此可按码点顺序存成定长字符串（索引 = 码点 - 0x4E00），无拼音的码点空位填 '-'。
体积 218KB → 约 21KB，且重复字母在 gzip 下压缩率极高。

用法（任意 cwd 可运行）：
    python scripts/compact_pinyin.py
脚本是幂等的：已转换过的文件会被识别出并跳过（除非 --force）。
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, 'iceberg-vue', 'src', 'lib', 'pinyin.ts')

LO, HI = 0x4E00, 0x9FED  # 覆盖区间（表内实际最大码点 U+9FED）
CHUNK = 2048             # 字符串每行长度，便于阅读与 diff
NL = '\n'


def main(force: bool = False) -> int:
    src = io.open(TARGET, encoding='utf-8').read()
    if 'INITIAL_TABLE' in src and not force:
        print('pinyin.ts 已是定长字符串格式，跳过（需重转请加 --force）')
        return 0

    lines = src.split(NL)
    start = next(i for i, l in enumerate(lines) if l.startswith('const PINYIN_INITIAL'))
    end = next(i for i, l in enumerate(lines) if l.startswith('const NAME_INITIAL'))
    fn_i = next(i for i, l in enumerate(lines) if l.startswith('// 获取单字'))

    body = NL.join(lines[start:end])
    pairs = re.findall(r'(.):\s*\'([A-Z#])\'', body)
    if not pairs:
        print('ERROR: 未从 PINYIN_INITIAL 解析到任何条目，已中止（文件未改动）')
        return 1

    table = ['-'] * (HI - LO + 1)
    out_of_range = 0
    for ch, letter in pairs:
        cp = ord(ch)
        if LO <= cp <= HI:
            table[cp - LO] = '-' if letter == '#' else letter
        else:
            out_of_range += 1

    s = ''.join(table)
    name_block = NL.join(lines[end:fn_i])

    chunks = [s[i:i + CHUNK] for i in range(0, len(s), CHUNK)]
    table_src = (NL + '  + ').join("'" + c + "'" for c in chunks)

    out = f"""// 汉字 → 拼音首字母（由 pypinyin 生成，覆盖 CJK 基本区 U+4E00–U+9FED）
//
// 【存储格式】定长字符串查表，而非对象字面量（由 scripts/compact_pinyin.py 转换）：
//   索引 = 码点 - 0x4E00；取值 = A–Z 首字母，'-' 表示该码点无拼音（汉字之间的空位）。
//   体积：对象字面量 218KB → 定长字符串 {round(len(s.encode('utf-8')) / 1024)}KB，
//   gzip 后差距更大（重复字母高度可压缩）。HandbookView 用它做术语表 A-Z 分组，
//   此前是该路由 chunk 体积的主要来源。
//
// 【重新生成】如需从 pypinyin 重新导出：先按对象字面量 {{ 一: 'Y', ... }} 生成，
//   再执行 `python scripts/compact_pinyin.py --force` 转成定长字符串。
//   改动后请运行 src/lib/pinyin.test.ts 校验抽样字符。

const TABLE_START = 0x4e00
const INITIAL_TABLE =
  {table_src}

/** 查单个汉字的拼音首字母；无映射（非汉字 / 空位码点）返回 undefined */
function lookupInitial(ch: string): string | undefined {{
  const cp = ch.codePointAt(0)
  if (cp === undefined || cp < TABLE_START) return undefined
  const i = cp - TABLE_START
  if (i >= INITIAL_TABLE.length) return undefined
  const v = INITIAL_TABLE[i]
  return v === '-' ? undefined : v
}}

{name_block}
// 获取单字拼音首字母，非汉字返回原字符大写或 #
export function getInitial(ch: string): string {{
  if (!ch) return '#'
  if (/^[a-zA-Z]$/.test(ch)) return ch.toUpperCase()
  if (/^[0-9]$/.test(ch)) return '#'
  return lookupInitial(ch) || '#'
}}

// 获取文本首个有效字符的拼音首字母：
// 1) 先查名称级映射（处理多音字首字）；
// 2) 汉字 / 字母 / 数字直接判定；装饰符号（·、空格、emoji 等）跳过。
// 注意：不能用「扫描到第一个在映射表中的字」的逻辑，否则「汽车」会被误判成「车」的 C。
export function getFirstInitial(text: string): string {{
  if (!text) return '#'
  if (NAME_INITIAL[text]) return NAME_INITIAL[text]
  for (const ch of text) {{
    if (/^[a-zA-Z]$/.test(ch)) return ch.toUpperCase()
    if (/^[0-9]$/.test(ch)) return '#'
    if (/\\p{{Script=Han}}/u.test(ch)) return lookupInitial(ch) || '#'
    // 跳过非汉字装饰符（・、空格、emoji、箭头等）
  }}
  return '#'
}}
"""
    io.open(TARGET, 'w', encoding='utf-8').write(out)
    print(f'已重写 {os.path.relpath(TARGET, ROOT)}')
    print(f'  条目 {len(pairs)} 条，定长表 {len(s)} 字符（空位 {s.count("-")} 个，越界跳过 {out_of_range} 条）')
    print(f'  文件字节：{len(src.encode("utf-8"))} → {len(out.encode("utf-8"))}')
    return 0


if __name__ == '__main__':
    sys.exit(main(force='--force' in sys.argv))
