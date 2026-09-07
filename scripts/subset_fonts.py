"""
subset_fonts.py — 按站内语料子集化 Noto 字体，自托管替代 Google Fonts CDN。

背景：
    index.html 曾从 fonts.googleapis.com 拉取 11 个字重，代价有二：
    1) 每个访客的 IP/UA 直送 Google（GDPR/PIPL 下的个人信息出境）；
    2) googleapis 在国内时好时坏，标题宋体挂了最伤视觉。
    全量子集镜像（单字重上百个 unicode-range 分包 × 10 字重）有几十 MB，
    不可行；本站语料去重后 CJK 仅约 3700 字，子集化后单字重约 100–300KB。

用法（任意 cwd 可运行；需 pip install fonttools brotli）:
    python scripts/subset_fonts.py --src <目录>

    <目录> 须含 7 个源 OTF（SIL OFL 1.1，见 https://github.com/notofonts/noto-cjk）：
        Sans/SubsetOTF/SC/NotoSansSC-{Regular,Medium,Bold,Black}.otf
        Serif/SubsetOTF/TC/NotoSerifTC-{Regular,Bold,Black}.otf

输出（iceberg-vue/ 下）:
    public/fonts/noto-sans-sc-{400,500,700,900}.woff2
    public/fonts/noto-serif-tc-{400,700,900}.woff2
    public/fonts/OFL.txt            # 需与 woff2 一起分发（OFL 第 2 条）
    public/fonts/corpus.sha256      # 语料指纹：--check 模式与 CI 用它判定子集是否过期
    src/styles/fonts.css            # 7 条 @font-face（font-display: swap，无 unicode-range：
                                    # 单文件即全语料覆盖，语料外字符由字栈后备字体逐字回退）

`--check` 模式（CI 门）：重算当前语料指纹并与 corpus.sha256 比对，同时确认
7 个 woff2 + OFL.txt + fonts.css 存在；任一不符即 exit 1，提示重跑本脚本。
用指纹而不用 woff2 cmap 覆盖率的原因：源 OTF 本身缺的字形（如 emoji）无论如何
都进不了子集，按覆盖率比对会永久误报；指纹只回答"语料变了没有"这一个真问题，
且 CI 端纯标准库、零字体依赖。

字重纪律（见 CLAUDE.md 设计令牌）：只允许 400/500/700/900。
600/800 已归一为 700/900（与 CDN 时代的合成渲染像素一致），200/300（零引用）与
Serif SC（仅下线 Hero 用）已删除；恢复 Hero 时重跑本脚本并加回 Serif SC。

幂等：重复运行输出字节一致（同一输入）；语料变化（新词条/新文案）时重跑即可，
新字自动进入子集。用户评论/昵称的生僻字不在子集内，由系统字体回退，无痛。
"""

import argparse
import hashlib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# 项目根 = scripts/ 的父目录（与 build_data_api.py 同一推导，任意 cwd 可运行）
ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "iceberg-vue" / "src"
PUB_FONTS = ROOT / "iceberg-vue" / "public" / "fonts"
FONTS_CSS = ROOT / "iceberg-vue" / "src" / "styles" / "fonts.css"

# (css 家族名, 字重, 源 OTF 文件名)
FONTS = [
    ("Noto Sans SC", 400, "NotoSansSC-Regular.otf"),
    ("Noto Sans SC", 500, "NotoSansSC-Medium.otf"),
    ("Noto Sans SC", 700, "NotoSansSC-Bold.otf"),
    ("Noto Sans SC", 900, "NotoSansSC-Black.otf"),
    ("Noto Serif TC", 400, "NotoSerifTC-Regular.otf"),
    ("Noto Serif TC", 700, "NotoSerifTC-Bold.otf"),
    ("Noto Serif TC", 900, "NotoSerifTC-Black.otf"),
]

OFL_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt"


def collect_corpus() -> str:
    """收集站内全部渲染文本：词条/术语/专题/公告/日历/界面/i18n/模板/样式/静态 HTML。"""
    parts: list[str] = []
    data = SRC_DIR / "data"
    for p in [
        data / "iceberg.json",
        data / "handbook.md",
        data / "on-this-day.csv",
        ROOT / "iceberg-vue" / "index.html",
        ROOT / "iceberg-vue" / "public" / "404.html",
    ]:
        if p.exists():
            parts.append(p.read_text(encoding="utf-8"))
    for rel in ["data/features", "data/bulletins"]:
        d = SRC_DIR / rel
        if d.is_dir():
            for p in sorted(d.glob("*.md")):
                parts.append(p.read_text(encoding="utf-8"))
    for p in sorted((SRC_DIR / "lib" / "i18n").glob("*.ts")):
        parts.append(p.read_text(encoding="utf-8"))
    # 模板与样式中的硬编码文案（含 Tailwind 类名中的 ASCII，不影响子集）
    for ext in ("*.vue", "*.ts", "*.css"):
        for p in sorted(SRC_DIR.rglob(ext)):
            if p.name.endswith(".test.ts"):
                continue
            parts.append(p.read_text(encoding="utf-8"))
    return "\n".join(parts)


def unicodes_arg(text: str) -> str:
    """去重字符 → pyftsubset 的 U+XXXX,U+YYYY-ZZZZ 参数（含全部 ASCII/CJK/假名/符号）。"""
    cps = sorted({ord(c) for c in text if c > " " or c in "\t"})
    ranges: list[str] = []
    start = prev = cps[0]
    for cp in cps[1:]:
        if cp == prev + 1:
            prev = cp
            continue
        ranges.append(f"U+{start:04X}" if start == prev else f"U+{start:04X}-{prev:04X}")
        start = prev = cp
    ranges.append(f"U+{start:04X}" if start == prev else f"U+{start:04X}-{prev:04X}")
    return ",".join(ranges)


def slug(family: str, weight: int) -> str:
    base = "noto-sans-sc" if "Sans" in family else "noto-serif-tc"
    return f"{base}-{weight}.woff2"


def fingerprint(corpus: str) -> str:
    """语料指纹：去重字符排序后 sha256（换行/重复不影响结果，内容变化必变）。"""
    return hashlib.sha256("".join(sorted(set(corpus))).encode("utf-8")).hexdigest()


def check() -> int:
    """--check：产物齐全 + 指纹一致即过；否则打印重跑指引并 exit 1。"""
    expected = [
        *(PUB_FONTS / slug(f, w) for f, w, _ in FONTS),
        PUB_FONTS / "OFL.txt",
        PUB_FONTS / "corpus.sha256",
        FONTS_CSS,
    ]
    missing = [str(p.relative_to(ROOT)) for p in expected if not p.exists()]
    if missing:
        print(f"CHECK FAIL: 缺产物文件: {missing}")
        print("  请运行: python scripts/subset_fonts.py --src <OTF目录>")
        return 1
    corpus = collect_corpus()
    now = fingerprint(corpus)
    saved = (PUB_FONTS / "corpus.sha256").read_text(encoding="utf-8").strip()
    if now != saved:
        print("CHECK FAIL: 站内语料变化而字体子集未同步（新词条/新文案带了新字）。")
        print("  请运行: python scripts/subset_fonts.py --src <OTF目录>")
        return 1
    print(f"CHECK OK: 语料指纹一致 ({now[:12]}…)，7 个子集均为最新。")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser(description="按站内语料子集化自托管字体")
    ap.add_argument("--src", default=None, help="含 7 个源 OTF 的目录（见文件头）")
    ap.add_argument("--check", action="store_true", help="只校验子集是否过期，不生成（供 CI）")
    args = ap.parse_args()
    if args.check:
        sys.exit(check())
    if not args.src:
        ap.error("--src 必填（生成模式）；仅校验请用 --check")
    src_dir = Path(args.src)
    missing = [name for _, _, name in FONTS if not (src_dir / name).exists()]
    if missing:
        print(f"ERROR: 源目录缺文件: {missing}")
        sys.exit(1)

    corpus = collect_corpus()
    uniq = {c for c in corpus}
    cjk = sum(1 for c in uniq if "\u4e00" <= c <= "\u9fff")
    print(f"  语料去重 {len(uniq)} 字符，其中 CJK {cjk}")
    uni = unicodes_arg(corpus)

    PUB_FONTS.mkdir(parents=True, exist_ok=True)
    css_blocks: list[str] = []
    total = 0
    for family, weight, otf in FONTS:
        out = PUB_FONTS / slug(family, weight)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_out = str(Path(tmp) / out.name)
            cmd = [
                sys.executable, "-m", "fontTools.subset",
                str(src_dir / otf),
                f"--unicodes={uni}",
                "--flavor=woff2",
                "--no-hinting",
                "--desubroutinize",
                f"--output-file={tmp_out}",
            ]
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode != 0:
                print(f"ERROR: 子集化失败 {otf}:\n{r.stderr[-2000:]}")
                sys.exit(1)
            shutil.move(tmp_out, out)
        size = out.stat().st_size
        total += size
        print(f"  输出: {out.relative_to(ROOT)} ({size / 1024:.1f} KB)")
        css_blocks.append(
            "@font-face {\n"
            f"  font-family: '{family}';\n"
            "  font-style: normal;\n"
            f"  font-weight: {weight};\n"
            "  font-display: swap;\n"
            f"  src: url('/fonts/{out.name}') format('woff2');\n"
            "}"
        )

    # OFL 许可文本随字体分发（OFL 第 2 条要求）
    ofl = PUB_FONTS / "OFL.txt"
    if not ofl.exists():
        try:
            from urllib.request import urlopen
            ofl.write_bytes(urlopen(OFL_URL, timeout=60).read())
            print(f"  输出: {ofl.relative_to(ROOT)} (OFL 许可文本)")
        except OSError as e:
            print(f"  WARN: OFL.txt 下载失败（{e}），请手工放入 {ofl}")

    FONTS_CSS.write_text(
        "/* 本文件由 scripts/subset_fonts.py 生成，勿手工编辑；重跑脚本即更新。\n"
        "   自托管 Noto 子集（SIL OFL 1.1，见 public/fonts/OFL.txt），替代 Google Fonts CDN\n"
        "   （访客 IP 不再外发 + 国内加载可靠）。单文件即全语料覆盖，无 unicode-range；\n"
        "   语料外字符（用户评论生僻字等）由字栈后备字体逐字回退。*/\n"
        + "\n\n".join(css_blocks)
        + "\n",
        encoding="utf-8",
    )
    print(f"  输出: {FONTS_CSS.relative_to(ROOT)}")
    sha_path = PUB_FONTS / "corpus.sha256"
    sha_path.write_text(fingerprint(corpus) + "\n", encoding="utf-8")
    print(f"  输出: {sha_path.relative_to(ROOT)} (语料指纹，供 --check / CI)")
    print(f"  合计 woff2: {total / 1024:.0f} KB（7 个字重）")


if __name__ == "__main__":
    main()
