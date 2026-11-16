#!/usr/bin/env python3
"""
guji-ink.py —— 从 guji-shot.mjs 的截图里逐格量**真实墨迹**，判断字在字格里的落点。

为什么不用 canvas.measureText：它量的是「CSS 字栈按横排规则排出来的墨迹」，
而古籍模式是直排（writing-mode: vertical-rl），浏览器走的是字体的 vmtx / VORG
竖排度量，两者不是一回事。只有截图像素是最终真相。

用法：
    node scripts/guji-shot.mjs --port 5175 --font sotyr --find 〇 --out shots/sotyr.png
    python scripts/guji-ink.py shots/sotyr.png

输出：每列一行，列出该列各字的墨迹中心相对字格中心的偏移（px，正 = 偏下/偏右），
以及全页满格字的中位数基准，最后单独点名「小字」（〇 这类）的偏移。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image


def ink_bbox(im: Image.Image, box: tuple[int, int, int, int], thresh: int = 200):
    """字格内的墨迹包围盒（相对字格左上角，像素）。空白返回 None。

    阈值 200：宣纸底约 233，墨迹 121~175，取 200 能干净分开（150 会漏掉淡笔画）。
    """
    crop = im.crop(box).convert("L")
    w, h = crop.size
    px = crop.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(h):
        for x in range(w):
            if px[x, y] < thresh:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    png = Path(sys.argv[1])
    meta_path = png.with_suffix(".json")
    if not meta_path.exists():
        print(f"缺少 {meta_path.name}：请用新版 guji-shot.mjs 重新截图")
        return 1

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    im = Image.open(png)
    scale = im.width / 1440  # deviceScaleFactor=2 且视口 1440 → 2.0
    cells = meta.get("allCells") or []
    if not cells:
        print("截图里没有字格（allCells 为空）")
        return 1

    rows = []
    for c in cells:
        t = (c.get("t") or "").strip()
        if len(t) != 1:
            continue
        box = (
            round(c["x"] * scale),
            round(c["y"] * scale),
            round((c["x"] + c["w"]) * scale),
            round((c["y"] + c["h"]) * scale),
        )
        bb = ink_bbox(im, box)
        if bb is None:
            continue
        x0, y0, x1, y1 = bb
        cw = (box[2] - box[0])
        ch = (box[3] - box[1])
        rows.append(
            {
                "t": t,
                "col": round(c["x"]),
                "y": round(c["y"]),
                "inkW": x1 - x0 + 1,
                "inkH": y1 - y0 + 1,
                # 墨迹中心相对字格中心的偏移（px）
                "dx": round((x0 + x1 + 1) / 2 - cw / 2, 2),
                "dy": round((y0 + y1 + 1) / 2 - ch / 2, 2),
            }
        )

    if not rows:
        print("没量到任何墨迹")
        return 1

    # 满格字（墨迹高 ≥ 0.6 字格）才是对齐基准
    full = [r for r in rows if r["inkH"] >= 0.6 * (cells[0]["h"] * scale)]
    small = [r for r in rows if r not in full]

    def med(vals):
        s = sorted(vals)
        return s[len(s) // 2] if s else None

    print(f"字格 {len(rows)} 个 · 满格 {len(full)} · 小字 {len(small)}")
    print(f"满格基准：dx={med([r['dx'] for r in full])} dy={med([r['dy'] for r in full])}")

    # 按列分组，看列内是否等距、小字是否与同列满格字同基线
    by_col: dict[int, list[dict]] = {}
    for r in rows:
        by_col.setdefault(r["col"], []).append(r)

    for col in sorted(by_col, reverse=True):
        rs = sorted(by_col[col], key=lambda r: r["y"])
        base = med([r["dy"] for r in rs if r in full])
        parts = []
        for r in rs:
            mark = "" if r in full else f"*{r['dy'] - (base or 0):+.1f}"
            parts.append(f"{r['t']}{mark}")
        print(f"  x={col:5d} dy基准={base}  " + " ".join(parts))

    if small:
        print("\n小字明细（* = 相对同列满格基准的偏移，正 = 偏下）：")
        for r in small:
            print(f"  {r['t']}  col={r['col']} inkH={r['inkH']} dx={r['dx']:+.2f} dy={r['dy']:+.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
