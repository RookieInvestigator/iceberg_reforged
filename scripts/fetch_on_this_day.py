"""
fetch_on_this_day.py — 用 Wikipedia 搜索 API 找"历史上的今天"候选条目。

只调 list=search 接口，不抓取日期条目页（如 9月12日）内容；
desc 仍需人工核对撰写，本脚本只负责找候选 + 输出 CSV 行模板。

用法（任意 cwd 可运行；零外部依赖，仅标准库）:
    python scripts/fetch_on_this_day.py --query 双鱼玉佩
    python scripts/fetch_on_this_day.py --query UFO --lang en --limit 5
    python scripts/fetch_on_this_day.py --date 09-12      # 该日期已有条目
    python scripts/fetch_on_this_day.py --gaps             # 哪些日期缺条目（指导填充顺序）
    python scripts/fetch_on_this_day.py --query 盗肾 --emit 09-12
        # 每个命中输出一行 CSV 模板：09-12,,标题,,链接,
        # （year/desc/item 留空人工填；先打开链接核实年份与日期再落笔）

CSV 口径（iceberg-vue/src/data/on-this-day.csv）:
    date,year,title,desc,link,item
    link = 站外链接（此处填维基 URL），item = 站内词条 id（可选）
"""

import argparse
import csv
import html
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError

# 项目根 = scripts/ 的父目录（与 build_data_api.py 同一推导，任意 cwd 可运行）
ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "iceberg-vue/src/data/on-this-day.csv"

UA = "IcebergReforged/5.0 (on-this-day research; contact via github.com/RookieInvestigator/iceberg_reforged)"
RETRIES = 3


def api_search(query: str, lang: str = "zh", limit: int = 10) -> list:
    """调 list=search，返回命中列表（title/snippet/url）。失败重试 3 次指数退避。"""
    base = f"https://{lang}.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "list": "search",
        "srsearch": query,
        "srlimit": max(1, min(limit, 50)),
        "srprop": "snippet",
        "format": "json",
        "formatversion": "2",
    }
    url = base + "?" + urlencode(params)
    last_err = None
    for attempt in range(RETRIES):
        try:
            req = Request(url, headers={"User-Agent": UA})
            with urlopen(req, timeout=30) as r:
                data = json.load(r)
            hits = data.get("query", {}).get("search", [])
            out = []
            for h in hits:
                title = h.get("title", "")
                out.append({
                    "title": title,
                    "snippet": clean_snippet(h.get("snippet", "")),
                    "url": f"https://{lang}.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}",
                })
            return out
        except (URLError, json.JSONDecodeError, TimeoutError) as e:
            last_err = e
            time.sleep(2 ** attempt)
    print(f"ERROR: 搜索失败（{last_err}），检查网络后重试", file=sys.stderr)
    sys.exit(1)


def clean_snippet(s: str) -> str:
    """去摘要 HTML：searchmatch 高亮保留文字，其余标签剥离，实体反转义，空白归一。
    归一化是硬需求：摘要含 \\xa0 等不可见空白，直接 print 会在 GBK 控制台炸。"""
    s = re.sub(r'<span class="searchmatch">(.*?)</span>', r"《\1》", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\s+", " ", html.unescape(s)).strip()
    return s


def load_rows() -> list:
    """读现有 CSV（无文件返回空列表）。"""
    if not CSV_PATH.exists():
        return []
    with open(CSV_PATH, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def cmd_gaps() -> None:
    """覆盖率报告：全年 366 天（含 02-29）哪些日期 0 条 / 仅 1 条。"""
    from collections import Counter
    rows = load_rows()
    counts = Counter(r.get("date", "") for r in rows)
    days = [f"{m:02d}-{d:02d}" for m in range(1, 13)
            for d in range(1, [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m] + 1)]
    zero = [d for d in days if counts.get(d, 0) == 0]
    one = [d for d in days if counts.get(d, 0) == 1]
    print(f"共 {len(rows)} 条 / 覆盖 {len(counts)} 天 / 全年 {len(days)} 天")
    print(f"空缺 {len(zero)} 天：")
    print("  " + " ".join(zero) if zero else "  无（全覆盖）")
    print(f"仅 1 条 {len(one)} 天：")
    print("  " + " ".join(one) if one else "  无")


def cmd_date(mmdd: str) -> None:
    """列出某日期已有条目（防重复收录）。"""
    rows = [r for r in load_rows() if r.get("date") == mmdd]
    if not rows:
        print(f"{mmdd} 暂无条目，可填。")
        return
    print(f"{mmdd} 已有 {len(rows)} 条：")
    for r in rows:
        print(f"  [{r.get('year', '')}] {r.get('title', '')}")


def cmd_search(query: str, lang: str, limit: int, emit_date: str = "") -> None:
    """搜索并打印候选；--emit 则追加输出 CSV 行模板。"""
    hits = api_search(query, lang, limit)
    if not hits:
        print("无命中，换关键词试试（如去掉书名号、用地名/人名搜）。")
        return
    for i, h in enumerate(hits, 1):
        print(f"[{i}] {h['title']}")
        print(f"    {h['snippet'][:120]}")
        print(f"    {h['url']}")
    if emit_date:
        print("\n--- CSV 模板（year/desc/item 人工补，先开链接核实年份）---")
        for h in hits:
            # 手工拼行：本站 CSV 无引号、无逗号字段，直接逗号连接即可
            print(f"{emit_date},,{h['title']},,{h['url']},")


def valid_date(s: str) -> str:
    if not re.fullmatch(r"(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])", s or ""):
        raise argparse.ArgumentTypeError("日期须为 MM-DD（如 09-12）")
    return s


def main() -> None:
    ap = argparse.ArgumentParser(description="Wikipedia 搜索找历史上的今天候选（只调 search API）")
    ap.add_argument("--query", default="", help="搜索关键词（如词条名/人名/地名）")
    ap.add_argument("--lang", default="zh", choices=["zh", "en", "ja"], help="维基语言版本（默认 zh）")
    ap.add_argument("--limit", type=int, default=10, help="返回条数（默认 10，上限 50）")
    ap.add_argument("--date", type=valid_date, default=None, help="查看某日期已有条目（MM-DD）")
    ap.add_argument("--gaps", action="store_true", help="全年覆盖率报告（空缺/单条日期）")
    ap.add_argument("--emit", type=valid_date, default=None, metavar="MM-DD",
                    help="配合 --query，为命中输出该日期的 CSV 行模板")
    ap.add_argument("--json", action="store_true",
                    help="配合 --query，以 JSON 输出命中（供批量反查脚本解析）")
    args = ap.parse_args()

    if args.gaps:
        cmd_gaps()
    if args.date:
        cmd_date(args.date)
    if args.query:
        if args.json:
            print(json.dumps(api_search(args.query, args.lang, args.limit),
                             ensure_ascii=False))
        else:
            cmd_search(args.query, args.lang, args.limit, args.emit)
    if not (args.gaps or args.date or args.query):
        ap.print_help()


if __name__ == "__main__":
    main()
