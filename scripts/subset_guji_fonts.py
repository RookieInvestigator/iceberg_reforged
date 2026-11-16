#!/usr/bin/env python3
"""
subset_guji_fonts.py — 单独子集化古籍模式的四款字体（朱雀仿宋 / 仲春仿宋 / 汇迹正楷 / 花园明朝）。

为什么单独一个脚本：
    subset_fonts.py 一次生成全部 Noto 字重，要求本机备齐 7 个 Noto 源 OTF。
    古籍字体来源不同（各自独立发布、各自许可证），单独处理可以只补一款字体
    而不必重新准备 Noto 源文件。CSS 也单独出一个文件（fonts-guji.css），
    避免 subset_fonts.py 重跑时把这里的 @font-face 覆盖掉。

用法（任意 cwd 可运行；需 pip install fonttools brotli）：
    python scripts/subset_guji_fonts.py --zhuque data/fonts-src --sotyr data/fonts-src --huiji data/fonts-src --hana data/fonts-src
python scripts/subset_guji_fonts.py --css-only   # 只按表重写 CSS（woff2 已在、CSS 丢了）
    python scripts/subset_guji_fonts.py --sotyr <dir>          # 只补一款

源文件获取：
    朱雀仿宋  https://github.com/TrionesType/zhuque/releases → ZhuqueFangsong-v0.212.zip
              解压得 ZhuqueFangsong-Regular.ttf（SIL OFL 1.1）
    仲春仿宋  https://github.com/Hulenkius/sotyr/releases → SotyrFangsong-Regular.ttf
              （SIL OFL 1.1，聚珍仿宋二号长体复刻）
    汇迹正楷  https://github.com/Lovely1020/HJZK-HuiJi-V2     → CooperZhengKai-2.0.ttf
              （SIL OFL 1.1；上游 https://www.maoken.com/freefonts/24749.html）
    花园明朝  https://osdn.net/projects/hanazono-font/ 或 vRain 仓库 fonts/HanaMinA.ttf
              （Hanazono 自由授权，GlyphWiki 生成）

输出：
    iceberg-vue/public/fonts/zhuque-fangsong-400.woff2
    iceberg-vue/public/fonts/sotyr-fangsong-400.woff2
    iceberg-vue/public/fonts/huiji-zhengkai-400.woff2
    iceberg-vue/public/fonts/hanamin-a-400.woff2
    iceberg-vue/public/fonts/{ZHUQUE,SOTYR,HUIJI,HANAZONO}-LICENSE.txt
    iceberg-vue/src/styles/fonts-guji.css

语料与 subset_fonts.py 共用同一套收集逻辑（站内全部渲染文本），
保证古籍模式里出现的字都有字形；语料外的字由 CSS 字栈逐字回退。
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB_FONTS = ROOT / "iceberg-vue" / "public" / "fonts"
GUJI_CSS = ROOT / "iceberg-vue" / "src" / "styles" / "fonts-guji.css"

# key -> (源文件名, CSS 家族名, 输出名, 许可证文件名, size-adjust, 许可证正文)
#
# size-adjust（CSS Fonts 5）：按字面高度补偿，让各字体视觉大小一致。
# 实测语料 CJK 字的中位字面高（em）：
#   思源宋 0.916 / 思源黑 0.919 / 朱雀仿宋 0.900 / 汇迹正楷 0.832
#   仲春仿宋 1.023 / 花园明朝 0.918
# 系数 = 0.916 / 该字体中位高。用 size-adjust 而不是改字号：字号会连带改变
# 字格与列宽（layout.ts 的 cw = fs × 1.08），切字体整页重排。
FONTS = {
    "zhuque": (
        "ZhuqueFangsong-Regular.ttf",
        "Zhuque Fangsong",
        "zhuque-fangsong-400.woff2",
        "ZHUQUE-LICENSE.txt",
        "102%",
        """朱雀仿宋 Zhuque Fangsong
========================

作者：璇玑造字（TrionesType）· 余俊益、韩泳思、殷叶航、李剑桥
来源：https://github.com/TrionesType/zhuque
版本：v0.212（technical preview）
授权：SIL Open Font License 1.1（全文见同目录 OFL.txt）

开源仿宋体，字形取法民国铅印仿宋，直排特性（vert / vrt2）完整。
luatex-cn 的 Linux 字体方案同样以它作仿宋首选。

本文件为按站内语料子集化后的 woff2，字形未作修改，仅裁剪字符集。
子集化工具：fonttools (pyftsubset)。

SIL OFL 1.1 要求：衍生字体不得使用保留字体名。本字体未声明保留字体名，
子集保留原名仅用于 CSS font-family 标识，未作为独立字体发布。
""",
    ),
    "huiji": (
        "CooperZhengKai-2.0.ttf",
        "Huiji Zhengkai",
        "huiji-zhengkai-400.woff2",
        "HUIJI-LICENSE.txt",
        "110%",
        """汇迹正楷 Huiji Zhengkai（CooperZhengKai）
=========================================

作者：特里王（Terry Wang）、綿雲飴里（MYIL）、indestructible type*
来源：https://github.com/Lovely1020/HJZK-HuiJi-V2
上游：https://www.maoken.com/freefonts/24749.html
版本：2.0
授权：SIL Open Font License 1.1（全文见同目录 OFL.txt）

以汇文正楷为汉字基础、Cooper* 为西文基础撮合而成的正楷，西文与汉字同调。

本文件为按站内语料子集化后的 woff2，字形未作修改，仅裁剪字符集。
子集化工具：fonttools (pyftsubset)。

SIL OFL 1.1 要求：衍生字体不得使用保留字体名。本字体未声明保留字体名，
子集保留原名仅用于 CSS font-family 标识，未作为独立字体发布。
""",
    ),
    "sotyr": (
        "SotyrFangsong-Regular.ttf",
        "Sotyr Fangsong",
        "sotyr-fangsong-400.woff2",
        "SOTYR-LICENSE.txt",
        "89.5%",
        """仲春仿宋 Sotyr Fangsong
=======================

作者：活字攷古（hantype）仿宋体研究小组 · 执刀 hulenkius
来源：https://github.com/Hulenkius/sotyr
版本：v0.23-beta
授权：SIL Open Font License 1.1（全文见同目录 OFL.txt）

对上世纪「聚珍仿宋二号长体」铅活字字形的数字化复刻：字形底本直接从印刷品
扫描件提取，缺字用 zi2zi-JiT / HanziGen 生成后再人工修绘。
长体（字面窄而高），老笔形，与朱雀仿宋的民国铅印风格互补。

OpenType：vert / vkrn / ss01 / ss02 / cv01 / cv02，古籍排版推荐
`vert` + `ss02` + `cv02`（CSS 见 ancient-book-v2.css 的 font-feature-settings）。

本文件为按站内语料子集化后的 woff2，字形未作修改，仅裁剪字符集。
子集化工具：fonttools (pyftsubset)。
""",
    ),
    "hana": (
        "HanaMinA.ttf",
        "HanaMinA",
        "hanamin-a-400.woff2",
        "HANAZONO-LICENSE.txt",
        "100%",
        """花园明朝 HanaMinA（花園明朝）
============================

来源：https://osdn.net/projects/hanazono-font/
生成：GlyphWiki（http://glyphwiki.org/）
授权：Hanazono 自由授权（可自由使用、修改、再分发，含商用）

覆盖 Ext-A/B 与大量生僻字的明朝体，作为**兜底字体**挂在所有字栈末尾：
主字体缺字时逐字回退到这里，避免出现豆腐块。

本文件为按站内语料子集化后的 woff2，字形未作修改，仅裁剪字符集。
子集化工具：fonttools (pyftsubset)。
""",
    ),
}


def collect_corpus() -> str:
    """复用 subset_fonts.py 的语料收集（同一套规则，避免两处漂移）。"""
    sys.path.insert(0, str(ROOT / "scripts"))
    from subset_fonts import collect_corpus as _collect  # type: ignore

    return _collect()



def subset_one(key: str, src_dir: Path, chars: str) -> str | None:
    """子集化一款字体，返回它的 @font-face 块（失败返回 None）。"""
    src_name, family, out_name, lic_name, size_adjust, lic_text = FONTS[key]
    src = src_dir / src_name
    if not src.exists():
        print(f"SKIP {key}: 找不到 {src}")
        return None

    out = PUB_FONTS / out_name
    cmd = [
        sys.executable, "-m", "fontTools.subset", str(src),
        f"--text={chars}",
        "--flavor=woff2",
        f"--output-file={out}",
        # 竖排特性必须保留（古籍模式依赖 vrt2/vert）
        "--layout-features=*",
        "--no-hinting",
        "--desubroutinize",
    ]
    print(f"子集化 {key}…")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"FAILED {key}")
        print(r.stdout[-1500:])
        print(r.stderr[-1500:])
        return None

    (PUB_FONTS / lic_name).write_text(lic_text, encoding="utf-8")
    print(f"  OK  {out.relative_to(ROOT)}  {out.stat().st_size / 1024:.0f} KB")
    return (
        "@font-face {\n"
        f"  font-family: '{family}';\n"
        "  font-style: normal;\n"
        "  font-weight: 400;\n"
        "  font-display: swap;\n"
        f"  size-adjust: {size_adjust};\n"
        f"  src: url('/fonts/{out.name}') format('woff2');\n"
        "}"
    )


def face_block(key: str) -> str:
    """只按 FONTS 表拼 @font-face 块（不读字体文件）。"""
    _, family, out_name, _, size_adjust, _ = FONTS[key]
    return (
        "@font-face {\n"
        f"  font-family: '{family}';\n"
        "  font-style: normal;\n"
        "  font-weight: 400;\n"
        "  font-display: swap;\n"
        f"  size-adjust: {size_adjust};\n"
        f"  src: url('/fonts/{out_name}') format('woff2');\n"
        "}"
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zhuque", help="含 ZhuqueFangsong-Regular.ttf 的目录")
    ap.add_argument("--sotyr", help="含 SotyrFangsong-Regular.ttf 的目录")
    ap.add_argument("--huiji", help="含 CooperZhengKai-2.0.ttf 的目录")
    ap.add_argument("--hana", help="含 HanaMinA.ttf 的目录")
    ap.add_argument(
        "--css-only",
        action="store_true",
        help="不子集化，只按 FONTS 表重写 fonts-guji.css（woff2 已在，CSS 丢了时用）",
    )
    args = ap.parse_args()

    if not any([args.zhuque, args.sotyr, args.huiji, args.hana]) and not args.css_only:
        ap.error("至少给一个 --zhuque / --sotyr / --huiji / --hana，或 --css-only")

    if args.css_only:
        blocks = [face_block(k) for k in FONTS if (PUB_FONTS / FONTS[k][2]).exists()]
        if not blocks:
            print("public/fonts 里一款 woff2 都没有，不写 CSS")
            return 1
        GUJI_CSS.write_text(
            "/* 本文件由 scripts/subset_guji_fonts.py 生成，勿手工编辑；重跑脚本即更新。\n"
            "   古籍模式的四款字体（许可文本见 public/fonts/*-LICENSE.txt）。\n"
            "   与 fonts.css 分开：subset_fonts.py 重跑时不会覆盖这里。\n"
            "   size-adjust 按字面高度补偿，让各字体视觉大小一致（算法见脚本头注释）。*/\n"
            + "\n\n".join(blocks)
            + "\n",
            encoding="utf-8",
        )
        print(f"  输出: {GUJI_CSS.relative_to(ROOT)}（{len(blocks)} 款，仅按表重写）")
        return 0

    corpus = collect_corpus()
    chars = "".join(sorted(set(corpus)))
    print(f"语料字符数：{len(chars)}")

    PUB_FONTS.mkdir(parents=True, exist_ok=True)
    blocks: list[str] = []
    for key, src in (
        ("zhuque", args.zhuque),
        ("sotyr", args.sotyr),
        ("huiji", args.huiji),
        ("hana", args.hana),
    ):
        if not src:
            continue
        b = subset_one(key, Path(src), chars)
        if b:
            blocks.append(b)

    if not blocks:
        print("没有任何字体生成成功，不写 CSS")
        return 1

    # **只替换这次真正生成的字体块**：其余字体的 @font-face 原样保留。
    # 早先整份重写，跑一次 `--sotyr` 就把另外三款从 CSS 里抹掉了（字体文件还在，
    # 但页面上那三款直接回退系统字体）。
    generated = set()
    for key, src in (
        ("zhuque", args.zhuque),
        ("sotyr", args.sotyr),
        ("huiji", args.huiji),
        ("hana", args.hana),
    ):
        if src:
            generated.add(FONTS[key][1])  # CSS 家族名
    kept: list[str] = []
    if GUJI_CSS.exists():
        for chunk in GUJI_CSS.read_text(encoding="utf-8").split("@font-face")[1:]:
            block = "@font-face" + chunk.strip().split("\n\n")[0].rstrip()
            if "font-family" not in block:
                continue
            family = block.split("font-family:", 1)[1].split(";", 1)[0].strip().strip("'\"")
            if family and family not in generated and family not in "".join(blocks):
                kept.append(block)

    all_blocks = blocks + kept
    GUJI_CSS.write_text(
        "/* 本文件由 scripts/subset_guji_fonts.py 生成，勿手工编辑；重跑脚本即更新。\n"
        "   古籍模式的四款字体（许可文本见 public/fonts/*-LICENSE.txt）。\n"
        "   与 fonts.css 分开：subset_fonts.py 重跑时不会覆盖这里。\n"
        "   size-adjust 按字面高度补偿，让各字体视觉大小一致（算法见脚本头注释）。*/\n"
        + "\n\n".join(all_blocks)
        + "\n",
        encoding="utf-8",
    )
    print(f"  输出: {GUJI_CSS.relative_to(ROOT)}（新生成 {len(blocks)} 款，保留 {len(kept)} 款）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
