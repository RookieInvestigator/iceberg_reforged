#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""link_source_report.py — 链接来源站点识别的覆盖率报告（维护 lib/sourceLabel.ts 的域名表用）。

回答一个问题：**站内还有多少链接的站名是「没识别出来、直接露域名」的？**
按频次列出未识别宿主并附示例 URL，照着补进 `iceberg-vue/src/lib/sourceLabel.ts` 的 SOURCE_LABELS
（Python 侧的 apply_feedback.py 会解析同一张表，无需两处维护）。

已识别的判定与渲染层完全一致：精确表 → 父域回退 → 家族规则（fandom/wikidot/维基）→ 后缀规则
（edu.cn / gov.cn / gov.tw / github.io 等）。因此报告里的「未识别」就是页面上真的会露域名的那些。

用法:
    python scripts/link_source_report.py              # 全部未识别宿主
    python scripts/link_source_report.py --top 30     # 只看前 30
    python scripts/link_source_report.py --all        # 连已识别的也列出（核对映射是否有误）

只读脚本，不改任何文件。
"""
import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "iceberg-vue" / "src" / "data"
SOURCE_LABEL_TS = ROOT / "iceberg-vue" / "src" / "lib" / "sourceLabel.ts"

# 与 sourceLabel.ts 的 familyLabel / SUFFIX_LABELS 对齐
# 注意：家族规则**先于**精确表命中，且维基系在 TS 里不写进 SOURCE_LABELS（所以不能查 mapped）
FAMILY = {
    "fandom.com": "wiki",      # foo.fandom.com → Foo Wiki
    "wikidot.com": "wiki",     # foo.wikidot.com → Foo Wiki
    "wikipedia.org": "维基百科",  # zh.m.wikipedia.org → 维基百科
    "wikisource.org": "维基文库",
}
SUFFIX = ["edu.cn", "gov.cn", "gov.hk", "gov.mo", "gov.tw", "edu.tw", "ac.cn", "github.io",
          "blogspot.com", "wordpress.com", "substack.com", "medium.com", "notion.site"]

try:
    import sys
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def host_of(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return ""
    try:
        h = urlparse(u).hostname or ""
    except ValueError:
        return ""
    return h[4:] if h.startswith("www.") else h


def main() -> None:
    ap = argparse.ArgumentParser(description="链接来源站点识别的覆盖率报告")
    ap.add_argument("--top", type=int, default=0, help="只显示前 N 个")
    ap.add_argument("--all", action="store_true", help="连已识别的宿主一起列出")
    args = ap.parse_args()

    ts = SOURCE_LABEL_TS.read_text(encoding="utf-8")
    block = ts.split("SOURCE_LABELS", 1)[1].split("}", 1)[0]
    mapped = {m.group(1): m.group(2) for m in re.finditer(r"'([^']+)'\s*:\s*'([^']*)'", block)}

    def resolve(host: str):
        """返回站点名；未识别返回空串（与渲染层 sourceLabel() 同口径）"""
        if host in mapped:
            return mapped[host]
        parts = host.split(".")
        for i in range(1, len(parts)):
            parent = ".".join(parts[i:])
            if parent in FAMILY:
                rule = FAMILY[parent]
                if rule == "wiki":
                    sub = ".".join(parts[:i])
                    return f"{sub[:1].upper()}{sub[1:]} Wiki"
                return rule
            if parent in mapped:
                return mapped[parent]
        for sfx in SUFFIX:
            if host == sfx or host.endswith("." + sfx):
                return "(后缀规则)"
        return ""

    hosts, samples, from_item = Counter(), {}, Counter()
    ice = json.loads((DATA / "iceberg.json").read_text(encoding="utf-8"))
    for items in ice.get("tiers", {}).values():
        for it in items:
            h = host_of(it.get("link", ""))
            if h:
                hosts[h] += 1
                from_item[h] += 1
                samples.setdefault(h, it.get("link", ""))
    ref_path = DATA / "appendix" / "references.csv"
    if ref_path.exists():
        with ref_path.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                h = host_of(row.get("url", ""))
                if h:
                    hosts[h] += 1
                    samples.setdefault(h, row.get("url", ""))

    unknown = [(h, c) for h, c in hosts.most_common() if not resolve(h)]
    known_n = len(hosts) - len(unknown)
    print(f"链接 {sum(hosts.values())} 条 / {len(hosts)} 个宿主；已识别 {known_n} 个，"
          f"**未识别 {len(unknown)} 个（{sum(c for _, c in unknown)} 条链接）**")
    print(f"精确表 {len(mapped)} 个域名（{SOURCE_LABEL_TS.relative_to(ROOT)}）\n")

    rows = hosts.most_common() if args.all else unknown
    if not args.all:
        print("未识别宿主（按频次，附示例 URL）—— 认识的请补进 SOURCE_LABELS：")
    for h, c in (rows[: args.top] if args.top else rows):
        mark = resolve(h) or "—"
        src = "词条" if from_item.get(h) else "副表"
        print(f"  {c:4d}  {h:<32} [{mark}] {src}  {samples.get(h, '')[:70]}")


if __name__ == "__main__":
    main()
