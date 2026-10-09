#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""export_overrides.py — 把本地副表里的社区订正导出成「可回流上游（icebergthreads）」的产物。

为什么需要：本地一旦采纳反馈，内容就与上游分叉 —— 副表只在本地渲染层叠加
（lib/iceberg/overrides.ts / references.csv），上游完全不知道。本脚本把分叉点整理成两种形态：

  1. `upstream-import-<日期>.json` —— 按**上游 uuid** 组织、字段名对齐上游 item 的载荷
     （`id` / `text` / `description` / `url` / `categoryId` / `markerIds`），
     上游若有导入接口可直接投喂；同时附 `upstream` 现值做对照、`localId` 便于本地追溯。
  2. `upstream-submit-<日期>.md` —— 人工提交清单（逐条：词条 / uuid / 字段 / 上游现值 → 建议值 / 署名 / 日期），
     上游没有导入接口时照着填。

关键：**上游不认我们的 8 位 MD5 id，只认它自己的 uuid**。映射来自 `id_history.json` 的 `byApiId`
（api uuid → 8 位 id，F30 的持久锚）——这里**反向**使用它。分类名 / 标签名 → 上游 `categoryId` /
`markerIds` 的反查需要上游数据（`--from-api` 或 `--input` 本地保存的 API JSON）；拿不到就退化成
带名字的中间形态并明确标注（`category` / `tags` 字段 + `notes`），**绝不编造 id**。

顺带产出 `references-<日期>.csv`：本地追加的参考链接。上游 item 只有单个 `url` 字段，
放不下多条，故单独成表供人工并入描述或取舍。

分类：主分类覆盖住在专职表 `categories.csv`（role=main），导出时**折叠回上游唯一的
`category` / `categoryId`**；role=extra 的附加分类上游放不下，列在提交清单 md 里（不静默丢）。

署名：住在专职表 `contributors.csv`（`item_id,by,at`，2026-10 起 by/at 从 overrides.csv /
categories.csv 删列）。上游 item 只有一个署名位，故同一条目多人时取 **at 最晚**的一条当
`by` / `at`，完整名单进载荷的 `contributors` 数组并在提交清单 md 单列一节。

标记：`extra.csv`（`item_id,flag,note`，flag ∈ warn / need，**行的存在即标记为真**，删行 = 取消）
是**本地独有**的概念 —— 上游 item 没有任何标记字段，导入载荷里无处安放。但「放不下」不等于
可以静默丢：逐条列进提交清单 md 的标记节并报总行数，提交的人才知道这些标记存在、需要人工
决定在上游怎么表达（并入描述 / 走上游 issue / 干脆不带上去）。

用法:
    python scripts/export_overrides.py                    # 离线：只用本地副表 + id_history
    python scripts/export_overrides.py --from-api         # 额外拉上游 categories/markers 做 id 反查 + 现值对照
    python scripts/export_overrides.py --input api.json   # 离线等价：用本地保存的 API JSON
    python scripts/export_overrides.py --out-dir outputs   # 输出目录（默认 outputs/，被 .gitignore 覆盖）

只读脚本：不写任何库内文件，输出一律落 --out-dir。
"""

import argparse
import csv
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen

API_URL = "https://icebergthreads.com/api/iceberg/fel4BTCqlMAGSa2gelRJ"
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / "iceberg-vue" / "src" / "data"

# 标记副表（extra.csv）的 flag → 中文标签：flag 是给机器看的键，提交清单 md 是给人看的，
# 两个都写出来（`警示（warn）`）免得对不上。只做展示 —— 合法性由构建门 / quality_report 拦。
EXTRA_FLAG_LABELS = {"warn": "警示", "need": "需补充"}

# 控制台是 GBK，中文词条名（含 ・ 等字符）会直接抛 UnicodeEncodeError —— 会崩的输出不如换成替换字符
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def read_csv(path: Path) -> list:
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        return [r for r in csv.DictReader(f) if any((v or "").strip() for v in r.values())]


def fetch_api(input_path: str | None) -> dict:
    if input_path:
        return json.loads(Path(input_path).read_text(encoding="utf-8"))
    req = Request(API_URL, headers={"User-Agent": "iceberg-reforged/export-overrides"})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def parse_tags(value: str) -> list:
    """tags 单元格 → 名称数组（CSV 里存 JSON；兼容逗号/顿号分隔的历史写法）"""
    v = (value or "").strip()
    if not v:
        return []
    if v.startswith("["):
        try:
            parsed = json.loads(v)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass
    return [s.strip() for s in re.split(r"[,，|]", v) if s.strip()]


def main() -> None:
    ap = argparse.ArgumentParser(description="本地社区订正 → 上游可导入/可提交的产物")
    ap.add_argument("--from-api", action="store_true", help="拉上游数据做分类/标签 id 反查与现值对照")
    ap.add_argument("--input", default=None, help="离线：本地保存的上游 API JSON（与 --from-api 等价）")
    ap.add_argument("--out-dir", default=str(ROOT / "outputs"), help="输出目录（默认 outputs/）")
    ap.add_argument("--data-dir", default=str(DEFAULT_DATA), help="数据目录（测试用，默认 iceberg-vue/src/data）")
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    appendix = data_dir / "appendix"
    history = json.loads((data_dir / "id_history.json").read_text(encoding="utf-8"))
    idx = json.loads((data_dir / "id-index.json").read_text(encoding="utf-8"))
    local2api = {v: k for k, v in (history.get("byApiId") or {}).items()}

    cat_id_by_name, marker_id_by_name, upstream_items = {}, {}, {}
    if args.from_api or args.input:
        api = fetch_api(args.input)
        for c in api.get("categories", []) or []:
            name = (c.get("name") or "").strip()
            if name:
                cat_id_by_name[name] = c.get("id")
        for m in api.get("markers", []) or []:
            name = (m.get("name") or "").strip()
            if name:
                marker_id_by_name[name] = m.get("id")
        for layer in api.get("layers", []) or []:
            for it in layer.get("items", []) or []:
                uid = (it.get("id") or "").strip()
                if uid:
                    upstream_items[uid] = it

    overrides = read_csv(appendix / "overrides.csv")
    refs = read_csv(appendix / "references.csv")
    cats = read_csv(appendix / "categories.csv")
    contribs = read_csv(appendix / "contributors.csv")
    extras = read_csv(appendix / "extra.csv")

    # 署名住专职表 contributors.csv（2026-10 起 by/at 从 overrides.csv / categories.csv 删列）：
    # 署名不再跟着某一处改动走，而是「谁为这个词条出过力」。同一条目多人时取 **at 最晚**的一条
    # 当主署名（上游 item 只有一个署名位；at 为空视为最早，同 at 按表内顺序先到先得），
    # 完整名单另存 entry["contributors"] 并单列 md 一节 —— 不静默丢人。
    contrib_by_item: dict = {}
    for r in contribs:
        iid = (r.get("item_id") or "").strip()
        by = (r.get("by") or "").strip()
        if iid and by:
            contrib_by_item.setdefault(iid, []).append({"by": by, "at": (r.get("at") or "").strip()})

    def primary_signature(iid: str) -> dict:
        """该词条的主署名：at 最晚的一条（并列时保持表内顺序，先出现的胜）"""
        best = {}
        for c in contrib_by_item.get(iid, []):
            if not best or c["at"] > best["at"]:
                best = c
        return best

    # 标记副表 extra.csv：**本地独有**（上游 item 没有标记字段），读出来只为在提交清单 md 里
    # 逐条列出 + 报行数 —— 本脚本只读，绝不写回这张表（行的存在即标记为真，写它等于改内容）。
    extra_by_item: dict = {}
    for r in extras:
        iid = (r.get("item_id") or "").strip()
        flag = (r.get("flag") or "").strip().lower()   # 大小写不敏感（与前端同口径）
        if iid and flag:
            extra_by_item.setdefault(iid, []).append(r)

    # 分类住专职表 categories.csv：role=main 折叠回上游唯一的 category 字段；
    # role=extra 上游放不下（列进报告 md，不静默丢）。role 空 = extra（契约默认值）。
    main_cat_by_item: dict = {}
    extra_cats: list = []
    for r in cats:
        iid = (r.get("item_id") or "").strip()
        cat = (r.get("category") or "").strip()
        if not iid or not cat:
            continue
        if (r.get("role") or "").strip().lower() == "main":
            main_cat_by_item[iid] = r      # 同 item 多行 main：last wins（与前端渲染同口径）
        else:
            extra_cats.append(r)
    print(f"本地副表读取：overrides.csv {len(overrides)} 行，references.csv {len(refs)} 行，"
          f"categories.csv {len(cats)} 行（role=main {len(main_cat_by_item)} / 非 main {len(extra_cats)}），"
          f"contributors.csv {len(contribs)} 行（{len(contrib_by_item)} 个词条有署名），"
          f"extra.csv {len(extras)} 行（{len(extra_by_item)} 个词条有标记）")

    by_item: dict = {}
    for r in overrides:
        iid = (r.get("item_id") or "").strip()
        field = (r.get("field") or "").strip()
        if iid and field:
            by_item.setdefault(iid, []).append(r)

    refs_by_item: dict = {}
    for r in refs:
        iid = (r.get("source_id") or "").strip()
        if iid:
            refs_by_item.setdefault(iid, []).append(r)

    entries, orphans, mapping_gaps = [], [], set()
    # 词条集合 = 有字段订正的 ∪ 有主分类覆盖的（后者只存在于 categories.csv）
    for iid in sorted(set(by_item) | set(main_cat_by_item)):
        rows = by_item.get(iid, [])
        uuid = local2api.get(iid, "")
        cur = idx.get(iid) or {}
        if not uuid:
            orphans.append(iid)
        entry = {
            "id": uuid,
            "localId": iid,
            "title": cur.get("t", ""),
            "changed": [],
            "by": "",
            "at": "",
        }
        for r in rows:
            field = (r.get("field") or "").strip()
            value = r.get("value") or ""
            if field not in entry["changed"]:
                entry["changed"].append(field)
            if field == "title":
                entry["text"] = value
            elif field == "desc":
                entry["description"] = value
            elif field == "link":
                entry["url"] = value
            elif field == "category":
                # 老表遗留（一表一域后 category 由 categories.csv role=main 承载）：
                # 仍解出来，但下面的 main 行会覆盖它（专职表胜出）
                entry["category"] = value
                cid = cat_id_by_name.get(value)
                if cid:
                    entry["categoryId"] = cid
                else:
                    mapping_gaps.add("category")
            elif field == "tags":
                names = parse_tags(value)
                entry["tags"] = names
                ids = [marker_id_by_name[n] for n in names if n in marker_id_by_name]
                if names and len(ids) == len(names):
                    entry["markerIds"] = ids
                else:
                    mapping_gaps.add("tags")
        # 主分类覆盖（categories.csv role=main）折叠成上游的 category / categoryId ——
        # 放在字段订正之后：上游 item 只有一个分类，专职表的值说了算
        main_row = main_cat_by_item.get(iid)
        if main_row:
            value = (main_row.get("category") or "").strip()
            if "category" not in entry["changed"]:
                entry["changed"].append("category")
            entry["category"] = value
            cid = cat_id_by_name.get(value)
            if cid:
                entry["categoryId"] = cid
            else:
                mapping_gaps.add("category")
        # 署名（contributors.csv）：主署名（at 最晚）填 by/at，完整名单进 contributors 数组。
        # 署名与「改了哪些字段」解耦 —— 上游载荷只要一个署名位，其余并列在 md 里给人看。
        all_sigs = contrib_by_item.get(iid, [])
        if all_sigs:
            entry["contributors"] = all_sigs
            prim = primary_signature(iid)
            entry["by"] = prim.get("by", "")
            entry["at"] = prim.get("at", "")
        if uuid and uuid in upstream_items:
            up = upstream_items[uuid]
            entry["upstream"] = {
                "text": (up.get("text") or "").strip(),
                "description": (up.get("description") or "").strip(),
                "url": (up.get("url") or "").strip(),
            }
        entries.append(entry)

    stamp = datetime.now().strftime("%Y%m%d")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 只有署名、没有任何字段/分类改动的词条：没有可回流的内容，不生成 entry，
    # 但署名会出现在 md 的署名节里（不静默丢），控制台也报一句。
    contrib_only = sorted(set(contrib_by_item) - set(by_item) - set(main_cat_by_item))

    notes = [
        "id 为上游 uuid（来自 id_history.json 的 byApiId 反向映射）；localId 是本站 8 位 id，便于本地追溯。",
        "字段名对齐上游 item：title→text、desc→description、link→url、category→categoryId、tags→markerIds。",
        "category 来自 appendix/categories.csv 的 role=main 行（覆盖主分类）；"
        "role=extra 的附加分类上游只有一个 category 字段，放不下，见提交清单 md 的专节。",
        "by / at 来自 appendix/contributors.csv（署名专职表，键 item_id + by）：同一条目多人时"
        "取 at 最晚的一条为主署名，完整名单见 contributors 数组与提交清单 md 的署名节。",
    ]
    if not (args.from_api or args.input):
        notes.append("未提供上游数据（--from-api / --input）：只有 category / tags 的名称，没有 categoryId / markerIds；"
                     "分类与标签的改动需自行对照上游，或重跑并加 --from-api。")
    if mapping_gaps:
        notes.append(f"以下字段没能全部反查到上游 id：{', '.join(sorted(mapping_gaps))}（上游可能新增/改名了分类或标签）。")
    if extra_cats:
        notes.append(f"categories.csv 的 role=extra 附加分类 {len(extra_cats)} 行无法随导入载荷回流"
                     "（上游 item 只有单个 category 字段），已列在提交清单 md 里。")
    if extras:
        notes.append(f"extra.csv 的标记（warn / need，行的存在即标记为真）是**本地独有**概念："
                     f"上游 item 没有标记字段，{len(extras)} 行标记无法随导入载荷回流，"
                     "已列在提交清单 md 的标记节。")

    import_path = out_dir / f"upstream-import-{stamp}.json"
    import_path.write_text(json.dumps({
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "source": "iceberg_reforged 本地副表（appendix/overrides.csv + categories.csv + contributors.csv）",
        "apiEndpoint": API_URL,
        "notes": notes,
        "counts": {"items": len(entries), "fields": sum(len(e["changed"]) for e in entries),
                   "withoutUpstreamId": len(orphans), "extraCategories": len(extra_cats),
                   "contributors": len(contribs), "extraMarks": len(extras)},
        "items": entries,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    md = [
        "# 上游提交清单（本地社区订正 → icebergthreads）", "",
        f"- 生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"- 涉及词条 **{len(entries)}** 条、字段 {sum(len(e['changed']) for e in entries)} 处",
        f"- 上游 uuid 缺失（本地上游无对应词条）：**{len(orphans)}** 条"
        + (f" —— {', '.join(orphans[:10])}" if orphans else ""),
        f"- 本地标记（extra.csv，上游**没有**这个概念）：**{len(extras)}** 行"
        + (f" —— {len(extra_by_item)} 个词条，见文末标记节" if extras else "（当前为空）"),
        "",
        "> 上游没有批量导入接口时，按本清单逐条在站内编辑；字段对应关系见 import JSON 的 notes。", "",
        "| 词条 | 上游 uuid | 改动字段 | 建议值 | 署名 / 日期 |",
        "| --- | --- | --- | --- | --- |",
    ]
    for e in entries:
        pieces = []
        for f in e["changed"]:
            if f == "title":
                pieces.append(f"标题 → {e.get('text','')}")
            elif f == "desc":
                d = e.get("description", "")
                pieces.append(f"描述 → {d[:80]}{'…' if len(d) > 80 else ''}")
            elif f == "link":
                pieces.append(f"链接 → {e.get('url','')}")
            elif f == "category":
                pieces.append(f"分类 → {e.get('category','')}" + (f"（id: {e['categoryId']}）" if e.get("categoryId") else "（id 未反查）"))
            elif f == "tags":
                pieces.append("标签 → " + "、".join(e.get("tags", [])) + (f"（ids: {','.join(str(x) for x in e['markerIds'])}）" if e.get("markerIds") else "（id 未反查）"))
        md.append(f"| {e['title'] or e['localId']} | `{e['id'] or '—'}` | {' / '.join(e['changed'])} | {'；'.join(pieces)} | {e['by'] or '—'} / {e['at'] or '—'} |")
    if not entries:
        md.append("| （本地副表为空，暂无可回流的订正） | — | — | — | — |")
    if contrib_by_item:
        # 署名单列一节：上游只有一个署名位，主署名（at 最晚）在上面的表格里，这里给全名单。
        # 署名与「改了哪些字段」无关（谁为词条出过力），含只有署名、无字段改动的词条。
        md += ["", "## 署名副表（contributors.csv）", "",
               f"署名住在专职表 `contributors.csv`（一表一域；`by`/`at` 已不是 overrides.csv / "
               f"categories.csv 的列），共 **{len(contribs)}** 行 / {len(contrib_by_item)} 个词条。"
               "上游 item 只有一个署名位：上面表格里的「署名 / 日期」取 **at 最晚** 的一条为主署名，"
               "完整名单见下方（import JSON 的 `contributors` 数组同）：", "",
               "| 词条 | 上游 uuid | 署名 | 日期 |", "| --- | --- | --- | --- |"]
        for iid in sorted(contrib_by_item):
            for c in sorted(contrib_by_item[iid], key=lambda x: x["at"], reverse=True):
                md.append(f"| {(idx.get(iid) or {}).get('t') or iid} | `{local2api.get(iid) or '—'}` | "
                          f"{c['by']} | {c['at'] or '—'} |")
        if contrib_only:
            md += ["", f"> 其中 {len(contrib_only)} 个词条只有署名、没有字段/分类改动，"
                       "因此未出现在上方改动表里（本地没东西可回流，署名仍记录在此）。"]
    if extra_cats:
        # role=extra 是本地 OR 叠加的附加分类，上游 item 只有一个 category 字段 ——
        # 放进报告而不是静默丢掉（人看到才知道要不要并进描述或另开上游分类）
        md += ["", "## 本地附加分类（categories.csv role=extra，上游放不下）", "",
               f"上游 item 只有单个 `categoryId`，以下 **{len(extra_cats)}** 行是主分类之外的 OR 叠加分类，"
               "回流时需人工取舍（或并入描述）：", "",
               "| 词条 | 上游 uuid | 附加分类 | 署名 / 日期 |", "| --- | --- | --- | --- |"]
        for r in extra_cats:
            iid = (r.get("item_id") or "").strip()
            # 署名从 contributors.csv 取（category 行自己已经没有 by/at 列了）
            prim = primary_signature(iid)
            md.append(f"| {(idx.get(iid) or {}).get('t') or iid} | `{local2api.get(iid) or '—'}` | "
                      f"{r.get('category', '')} | {prim.get('by') or '—'} / {prim.get('at') or '—'} |")
    if extras:
        # 标记是本地独有概念（上游 item 没有任何标记字段）：载荷里放不下不代表能静默丢 ——
        # 逐条列出来，提交的人才知道要为这些标记做点什么（并入描述 / 上游开 issue / 不带上去）。
        md += ["", "## 本地标记（extra.csv，上游没有该概念）", "",
               f"`extra.csv` 是本地独有的标记副表（**行的存在即标记为真**，删行 = 取消标记），"
               f"共 **{len(extras)}** 行 / {len(extra_by_item)} 个词条。上游 item 没有标记字段，"
               "以下标记无法随导入载荷回流，需人工决定在上游怎么表达：", "",
               "| 词条 | 上游 uuid | 标记 | 说明 |", "| --- | --- | --- | --- |"]
        for iid in sorted(extra_by_item):
            for r in extra_by_item[iid]:
                flag = (r.get("flag") or "").strip().lower()
                note = (r.get("note") or "").strip()
                md.append(f"| {(idx.get(iid) or {}).get('t') or iid} | `{local2api.get(iid) or '—'}` | "
                          f"{EXTRA_FLAG_LABELS.get(flag, flag)}（{flag}） | {note or '—'} |")
    md_path = out_dir / f"upstream-submit-{stamp}.md"
    md_path.write_text("\n".join(md) + "\n", encoding="utf-8")

    ref_path = out_dir / f"references-{stamp}.csv"
    with open(ref_path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["api_uuid", "local_id", "title", "label", "url"])
        for iid, rows in sorted(refs_by_item.items()):
            for r in rows:
                w.writerow([local2api.get(iid, ""), iid, (idx.get(iid) or {}).get("t", ""),
                            r.get("label", ""), r.get("url", "")])

    print(f"词条 {len(entries)} 条 / 字段 {sum(len(e['changed']) for e in entries)} 处"
          f"{'（上游 uuid 缺失 ' + str(len(orphans)) + ' 条：本地新词条无法作为编辑回流）' if orphans else ''}")
    print(f"分类：role=main 折叠回上游 category {len(main_cat_by_item)} 条；"
          f"role=extra {len(extra_cats)} 条上游放不下，已列入提交清单 md")
    print(f"署名：contributors.csv {len(contribs)} 行 / {len(contrib_by_item)} 个词条"
          + (f"（其中 {len(contrib_only)} 个词条只有署名、无字段改动，见 md 署名节）" if contrib_only else ""))
    print(f"标记：extra.csv {len(extras)} 行 / {len(extra_by_item)} 个词条"
          "（本地独有概念，上游无对应字段，已列入提交清单 md 标记节）")
    if mapping_gaps:
        print(f"注意：{'、'.join(sorted(mapping_gaps))} 未能反查到上游 id（加 --from-api 可解）")
    print(f"输出 → {import_path}")
    print(f"输出 → {md_path}")
    print(f"输出 → {ref_path}")


if __name__ == "__main__":
    main()
