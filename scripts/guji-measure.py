#!/usr/bin/env python3
"""
guji-measure.py —— 从 guji-shot.mjs 的截图逐格量墨迹，出一份版式体检表。

回答三个问题：
  1. 每个字在**横向**上是否落在字格中心（直排下这是列内居中）
  2. 每个字在**纵向**上是否落在字格中心（同一列相邻字的落点是否一致）
  3. 界行（.rc）有没有真的画出来

用法：
    node scripts/guji-shot.mjs --port 5175 --font sotyr --page 2 --out shots/m-sotyr.png
    python scripts/guji-measure.py shots/m-sotyr.png

只统计满格字（墨迹高 ≥ 0.55 字格），符号与小字会污染中位数。
"""

from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

from PIL import Image
import numpy as np

INK_THRESHOLD = 190  # 宣纸底 ~235，墨迹 30~180


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    png = Path(sys.argv[1])
    meta = json.loads(png.with_suffix(".json").read_text(encoding="utf-8"))
    im = Image.open(png).convert("L")
    arr = np.array(im)
    scale = im.width / 1440

    cells = meta.get("allCells") or []
    if not cells:
        print("没有字格数据")
        return 1

    rows = []
    for c in cells:
        t = (c.get("t") or "").strip()
        if len(t) != 1:
            continue
        # 字格占满整条轨道（= 两条界行之间），右侧就是界行本身。
        # 量墨迹时裁掉右缘 2px 把界行排除，**但中心仍按整格算** ——
        # 用裁过的框算中心会带来 1px 的系统性负偏。
        cx0, cy0 = round(c["x"] * scale), round(c["y"] * scale)
        cx1, cy1 = round((c["x"] + c["w"]) * scale), round((c["y"] + c["h"]) * scale)
        sub = arr[cy0:cy1, cx0:cx1 - round(2 * scale)]
        ys, xs = np.nonzero(sub < INK_THRESHOLD)
        if len(xs) < 20:
            continue
        cw, ch = cx1 - cx0, cy1 - cy0
        rows.append(
            {
                "t": t,
                "inkH": (ys.max() - ys.min() + 1) / scale,
                "dx": ((xs.min() + xs.max() + 1) / 2 - cw / 2) / scale,
                "dy": ((ys.min() + ys.max() + 1) / 2 - ch / 2) / scale,
            }
        )

    cellH = cells[0]["h"]
    full = [r for r in rows if r["inkH"] >= cellH * 0.55]
    print(f"字格 {len(rows)} · 满格 {len(full)} · 字体栈 {meta.get('fontStack')}")
    if not full:
        print("没有满格字可统计")
        return 1

    print(f"横向 dx：中位 {statistics.median(r['dx'] for r in full):+.2f}px"
          f" · 均值 {statistics.mean(r['dx'] for r in full):+.2f}px"
          f" · 四分位 {np.percentile([r['dx'] for r in full], [25, 75]).round(2).tolist()}")
    print(f"纵向 dy：中位 {statistics.median(r['dy'] for r in full):+.2f}px"
          f" · 均值 {statistics.mean(r['dy'] for r in full):+.2f}px"
          f" · 四分位 {np.percentile([r['dy'] for r in full], [25, 75]).round(2).tolist()}")

    # 界行体检：在版心中部取一条水平线，看每条界行右侧是否真有暗线
    rules = meta.get("ruleRects") or []
    if rules:
        y = round(600 * scale)
        row = arr[y]
        drawn = 0
        for r in rules:
            xr = round((r["x"] + r["w"] - 1) * scale)
            seg = row[max(0, xr - 2):xr + 3]
            if seg.size and seg.min() < 200:
                drawn += 1
        print(f"界行：{drawn}/{len(rules)} 条在该扫描线上可见")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
