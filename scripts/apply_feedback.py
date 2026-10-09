#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""apply_feedback.py — 把 entry_feedback 反馈合入订正副表（本地批量 / 未来 workflow 的引擎）。

设计见 docs/FEEDBACK_WORKFLOW.md「自动化二」。这里只做机器该做的事：
搬运 + 格式校验 + 去重 + 报告；**判断对错归人**（status 由人在 Supabase 改，脚本只处理
status=open 的行；不带 --write 时是纯 dry-run，一个字节都不落盘）。

写法约束（踩过的坑）：
  - 前端 src/lib/csv.ts 的 parseCSV 按行解析，**值里带换行会把整行解坏**。因此写盘前
    把值内的换行归一为空格并记数上报（`normalized`），不让 CSV 变成埋雷。
  - 一表一域（副表重整理后的契约）：每个数据域只有一张归属表，专职表胜出，overrides.csv
    只收标量字段 title/desc/tags。category → categories.csv(role=main)、link → references.csv、
    related → related.csv（RESERVED 里的字段名永不由本脚本写进 overrides.csv）。
  - overrides.csv 以 (item_id, field) 为键：同键 last-accepted-wins，新值覆盖旧值。
  - categories.csv 以 (item_id, role=main) 为键：一个词条的主分类只留一行，新值覆盖旧行。
  - references.csv 以 (source_id, url, role) 为键：同键已存在则跳过（skip:dup）。
  - **署名（by / at）有自己的域 = contributors.csv**：以 (item_id, by) 为键 upsert，同键保留**较晚**的
    at。overrides.csv 只有 item_id,field,value、categories.csv 只有 item_id,category,role ——
    by/at 已从这两张表删列，再写进去就是 schema 违规（构建门 / 质量报告 / 前端测试都会报）。
  - 只写 appendix 四张 CSV，永不碰 iceberg.json 主数据与代码。

用法：
  python scripts/apply_feedback.py --csv <导出.csv>              # dry-run 报告
  python scripts/apply_feedback.py --csv <导出.csv> --write      # 落盘（自动 .bak）
  python scripts/apply_feedback.py --from-api --write            # 直接读 Supabase（需 .env）
  python scripts/apply_feedback.py --csv <导出.csv> --emit-sql out.sql   # 生成回填语句

署名 by：优先 --by；否则调 Supabase batch_user_display 解 user_id → 昵称
（user_display 的 EXECUTE 已被 REVOKE，前端口径就是 batch 版）；解不到则留空，前端会
回退显示 t('anonymousUser')。
"""
import argparse
import csv
import json
import os
import re
import shutil
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

# Windows 上 Python 写管道默认走系统代码页（cp936），而调用方（dev 中间件）按 UTF-8 解码 ——
# 不声明的话中文报告在页面上全是 `����`。这里固定 UTF-8 输出（errors=replace 防个别字符抛错）。
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # 老版本/非常规流：忽略
    pass

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "iceberg-vue" / "src" / "data"
APPENDIX = DATA / "appendix"
ID_INDEX = DATA / "id-index.json"
ICEBERG = DATA / "iceberg.json"
ENV_FILE = ROOT / "iceberg-vue" / ".env"

SUPPORTED = ("title", "desc", "tags")   # overrides.csv 只收标量字段订正（渲染层同口径）
# 保留字段名 → 它的归属表（一表一域契约）：这些字段名由专职副表承载，
# 本脚本永不把它们写进 overrides.csv；发现历史遗留行时报警（见 RESERVED 的用法与 --review-md）。
RESERVED = {
    "category": "categories.csv（role=main）",
    "link": "references.csv（role=main）",
    "related": "related.csv",
}

# 各副表的列 = 一表一域契约的落盘真源：**列永远来自这里**，write_table 只会照表头写，
# 不会给任何表凭空长出一列。by/at 只属于 contributors.csv —— overrides.csv / categories.csv
# 写它们就是 schema 违规（2026-10 署名副表上线时把这两列从它们身上删掉了）。
REFERENCES_HEADER = ["source_id", "label", "url", "role"]
OVERRIDES_HEADER = ["item_id", "field", "value"]
CATEGORIES_HEADER = ["item_id", "category", "role"]
CONTRIBUTORS_HEADER = ["item_id", "by", "at"]

# 站点名解析：精确表**从 前端 lib/sourceLabel.ts 解析**，不在这里复制一份
# （沿用 scripts/pinyin_sort.py 读 lib/pinyin.ts 的先例：表只维护一处，两侧口径不会漂）。
# 家族与后缀规则很小，在此镜像实现，注释指向 TS 侧对应位置。
SOURCE_LABEL_TS = ROOT / "iceberg-vue" / "src" / "lib" / "sourceLabel.ts"
# 家族规则（子域敏感）：与 sourceLabel.ts 的 familyLabel 一一对应
FAMILY_LABELS = {
    "fandom.com": "{sub} Wiki",
    "wikidot.com": "{sub} Wiki",
    "wikipedia.org": "维基百科",
    "wikisource.org": "维基文库",
}
# 后缀规则（子域无关，覆盖裸域）：与 sourceLabel.ts 的 SUFFIX_LABELS 一一对应
SUFFIX_LABELS = [
    ("edu.cn", "高校网站"), ("gov.cn", "政府网站"), ("gov.hk", "香港政府网站"),
    ("gov.mo", "澳门政府网站"), ("gov.tw", "台湾政府网站"), ("edu.tw", "台湾高校"),
    ("ac.cn", "科研机构"), ("github.io", "GitHub Pages"),
    ("blogspot.com", "Blogger"), ("wordpress.com", "WordPress"),
    ("substack.com", "Substack"), ("medium.com", "Medium"), ("notion.site", "Notion"),
]
_labels_cache = None


def source_labels() -> dict:
    """解析 sourceLabel.ts 的 SOURCE_LABELS（形如 `'host': '站点名',`）；解析异常时回退空表并告警。"""
    global _labels_cache
    if _labels_cache is not None:
        return _labels_cache
    out = {}
    try:
        text = SOURCE_LABEL_TS.read_text(encoding="utf-8")
        block = text.split("SOURCE_LABELS", 1)[1].split("}", 1)[0]
        for m in re.finditer(r"'([^']+)'\s*:\s*'([^']*)'", block):
            out[m.group(1)] = m.group(2)
    except Exception as e:
        print(f"  WARN: 读取 sourceLabel.ts 域名表失败（{e}）—— 站点名将回退为域名")
    if len(out) < 20:
        print(f"  WARN: 域名表只解析到 {len(out)} 条，疑似 sourceLabel.ts 结构变了")
    _labels_cache = out
    return out


def label_for(url):
    """与 lib/sourceLabel.ts 的 sourceLabel 同口径：精确 → 父域回退 → 家族 → 后缀 → 回退域名。"""
    host = url.split("//", 1)[-1].split("/", 1)[0].lower()
    host = host[4:] if host.startswith("www.") else host
    if not host:
        return ""
    labels = source_labels()
    if host in labels:
        return labels[host]
    parts = host.split(".")
    for i in range(1, len(parts)):
        parent = ".".join(parts[i:])
        sub = ".".join(parts[:i])
        fam = FAMILY_LABELS.get(parent)
        if fam:
            return fam.format(sub=sub[:1].upper() + sub[1:]) if "{sub}" in fam else fam
        if parent in labels:
            return labels[parent]
    for sfx, label in SUFFIX_LABELS:
        if host == sfx or host.endswith("." + sfx):
            return label
    return host


def load_env() -> dict:
    """读 iceberg-vue/.env（gitignore，不入库）；返回 VITE_SUPABASE_* 。"""
    out = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    # 环境变量优先（workflow 里走 secrets）
    for k in ("VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY"):
        if os.environ.get(k):
            out[k] = os.environ[k]
    return out


def supabase_cfg(env: dict):
    url = env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
    key = env.get("SUPABASE_ANON_KEY") or env.get("VITE_SUPABASE_ANON_KEY")
    return (url.rstrip("/") if url else None), key


def api_get(url, key, path):
    req = urllib.request.Request(url + path, headers={
        "apikey": key, "Authorization": "Bearer " + key, "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def api_rpc(url, key, fn, payload):
    req = urllib.request.Request(url + "/rest/v1/rpc/" + fn, method="POST",
                                 data=json.dumps(payload).encode("utf-8"),
                                 headers={"apikey": key, "Authorization": "Bearer " + key,
                                          "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read().decode("utf-8")
    return json.loads(body) if body.strip() else []


def service_key(env) -> str:
    """service_role key：本地回填状态用。只在此处（脚本/dev 中间件）使用，绝不进浏览器包。

    entry_feedback 没有 UPDATE 策略（只有公开 SELECT + 本人 INSERT/DELETE），而这些反馈行属于
    他人 —— anon key 无论如何改不了，`applied` 这类管理性写入只能走 service_role（绕过 RLS）
    或 Supabase 后台手跑 SQL。
    """
    return (env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_KEY")
            or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "")


def mark_rows(env, ids, status, applied):
    """PATCH entry_feedback 的状态；返回 (更新行数, 错误说明)。无 service key 时返回 (None, 原因)。"""
    if not ids:
        return 0, ""
    url, _ = supabase_cfg(env)
    svc = service_key(env)
    if not url:
        return None, "未配置 SUPABASE_URL"
    if not svc:
        return None, "未配置 service key（SUPABASE_SERVICE_ROLE_KEY）"
    q = f"/rest/v1/entry_feedback?id=in.({','.join(ids)})"
    req = urllib.request.Request(
        url + q, method="PATCH",
        data=json.dumps({"status": status, "applied": applied}).encode("utf-8"),
        headers={"apikey": svc, "Authorization": "Bearer " + svc,
                 "Content-Type": "application/json", "Prefer": "return=representation"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode("utf-8")
        return len(json.loads(body) if body.strip() else []), ""
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:200]}"
    except Exception as e:  # 网络/权限
        return None, str(e)


def fetch_rows_from_api(env):
    url, key = supabase_cfg(env)
    if not url or not key:
        sys.exit("ERROR: --from-api 需要 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY")
    # 与前端同口径的列（不取 user_id 明细的地方就不取），这里需要 user_id 解署名
    q = "/rest/v1/entry_feedback?status=eq.open&applied=eq.false&select=id,item_id,changes,note,user_id,status,applied,created_at&order=id.asc"
    return api_get(url, key, q)


def read_csv_rows(path):
    p = Path(path)
    if not p.exists():
        sys.exit(f"ERROR: --csv 指定的文件不存在：{p}（Supabase 导出的 entry_feedback CSV，或改用 --from-api）")
    with open(p, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def resolve_names(user_ids, env, override):
    """user_id → 显示名：--by 优先；否则 batch_user_display（REVOKE 了单数版）。"""
    if override:
        return {u: override for u in user_ids}
    url, key = supabase_cfg(env)
    names = {}
    if url and key and user_ids:
        try:
            rows = api_rpc(url, key, "batch_user_display", {"uids": sorted(user_ids)})
            names = {r["user_id"]: (r.get("display_name") or "") for r in rows}
        except Exception as e:  # 离线/未配置：留空，前端回退匿名
            print(f"  WARN: batch_user_display 失败（{e}），by 留空")
    return names


def is_http(url):
    return url.startswith("http://") or url.startswith("https://")


def normalize_link(link):
    """F34 同规则（与 scripts/build_data_api.py 的 normalize_link 一致，不另立标准）：
    无协议裸域名补 https://；`//` 协议相对补 https:；其它协议（chrome-extension: 等）拒绝。
    返回 (url, 是否需要补协议)；拒绝时 url 为空串。
    """
    link = (link or "").strip()
    if not link:
        return "", False
    if link.startswith("http://") or link.startswith("https://"):
        return link, False
    if link.startswith("//"):
        return "https:" + link, True
    if "://" in link:
        return "", False          # javascript: / data: / chrome-extension: → 拒绝
    candidate = "https://" + link
    parsed = urlparse(candidate)
    host = parsed.netloc or ""
    if not host or "." not in host or not re.fullmatch(r"[A-Za-z0-9.-]+", host):
        return "", False
    return candidate, True


def one_line(v):
    """值归一为单行（parseCSV 按行解析，换行会解坏整行）。返回 (值, 是否被归一)。"""
    s = v.replace("\r\n", "\n").replace("\r", "\n")
    if "\n" not in s:
        return s, False
    # 段落换行保留为单个空格：视觉上 pre-wrap 的两段变一行，但不破坏 CSV 结构
    return " ".join(part.strip() for part in s.split("\n") if part.strip()), True


def read_table(path, header):
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    return rows


def write_table(path, header, rows, default_role="ref"):
    """整表重写（先备份 .bak）。

    default_role：role 列缺省值随表而异 —— references.csv 空 = ref，categories.csv 空 = extra。
    写死 "ref" 会把分类副表的空角色写成非法值（契约只认 main/extra）；且**只在表头真有 role 列时生效**：
    contributors.csv 的表头是 ["item_id","by","at"]，既没有 role 也不会被补出 by/at 之外的列 ——
    写什么列完全由调用方传进来的 header 决定。
    """
    if path.exists():
        shutil.copyfile(path, str(path) + ".bak")
    tmp = str(path) + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(header)
        for r in rows:
            # role 缺省补默认值：老副表没有该列，读进来是空 key
            w.writerow([r.get(h, "") or (default_role if h == "role" else "") for h in header])
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser(description="把 entry_feedback 合入订正副表")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--csv", help="Supabase 导出的 entry_feedback CSV")
    src.add_argument("--from-api", action="store_true", help="直接读 Supabase（需 .env）")
    ap.add_argument("--write", action="store_true", help="真的落盘（缺省 dry-run）")
    ap.add_argument("--by", default=None, help="统一署名（缺省走 batch_user_display）")
    ap.add_argument("--emit-sql", default=None, help="把回填语句写到该文件")
    ap.add_argument("--review-md", default=None, help="把本次合入清单写成 Markdown（UTF-8，便于人核）")
    ap.add_argument("--decisions", default=None, help="审核工作台导出的 data/feedback/decisions.json（只落盘 accept）")
    ap.add_argument("--mark-applied", action="store_true", help="回填 Supabase：采纳行 → status=accepted & applied=true")
    ap.add_argument("--mark-rejected", action="store_true", help="回填 Supabase：驳回行 → status=rejected（需 service key）")
    ap.add_argument("--limit", type=int, default=0, help="只处理前 N 条（调试用）")
    args = ap.parse_args()

    env = load_env()
    rows = fetch_rows_from_api(env) if args.from_api else read_csv_rows(args.csv)
    rows = [r for r in rows if (r.get("status") or "open") == "open"]
    if args.limit:
        rows = rows[: args.limit]
    print(f"待处理反馈 {len(rows)} 条")

    dec = {}
    rejected_ids = []
    if args.decisions:
        dec_path = Path(args.decisions)
        if dec_path.exists():
            dec = json.loads(dec_path.read_text(encoding="utf-8"))
        else:
            # 工作台第一次预演时决定文件还没生成：按「尚无决定」处理，报清楚而不是抛 traceback
            print(f"注意：决定文件不存在（{dec_path}）—— 视为尚无决定，本次不会落盘任何字段")
        tally = {"accept": 0, "reject": 0, "later": 0, "undecided": 0}
        kept = []
        for r in rows:
            d = (dec.get(str(r.get("id"))) or {}).get("decision")
            if d == "accept":
                tally["accept"] += 1
                kept.append(r)
            else:
                tally[d if d in tally else "undecided"] += 1
        print(f"审核决定：采纳 {tally['accept']} / 驳回 {tally['reject']} / 待定 {tally['later']} / 未决 {tally['undecided']}")
        print(f"只落盘「采纳」的 {len(kept)} 条（决定文件：{args.decisions}）")
        rows = kept
        rejected_ids = [k for k, v in dec.items() if (v or {}).get("decision") == "reject"]

    idx = json.loads(ID_INDEX.read_text(encoding="utf-8"))
    aliases = {}
    if ICEBERG.exists():
        aliases = (json.loads(ICEBERG.read_text(encoding="utf-8")) or {}).get("idAliases") or {}

    ref_existing = read_table(APPENDIX / "references.csv", None)
    ov_existing = read_table(APPENDIX / "overrides.csv", None)
    cat_existing = read_table(APPENDIX / "categories.csv", None)
    con_existing = read_table(APPENDIX / "contributors.csv", None)

    ref_keys = {
        (r.get("source_id", ""), r.get("url", ""),
         "main" if (r.get("role") or "").strip().lower() == "main" else "ref")
        for r in ref_existing
    }
    ref_rows = list(ref_existing)
    # 历史遗留：overrides.csv 里若有保留字段（一表一域之前的写法），**不静默丢**——
    # 记数 + 逐行打印归属表，提示人把它们迁到专职副表去（迁移辅助）。
    reserved_rows = [r for r in ov_existing
                     if (r.get("field") or "").strip() in RESERVED]
    ov_map = {(r.get("item_id", ""), r.get("field", "")): r for r in ov_existing
              if (r.get("field") or "").strip() not in RESERVED}
    # 分类副表：保留原有行，按 (item_id) 索引 role=main 行以便覆盖（同键多行时 last wins）
    cat_rows = list(cat_existing)
    main_map = {}
    for r in cat_rows:
        if (r.get("role") or "").strip().lower() == "main":
            main_map[(r.get("item_id") or "").strip()] = r
    # 署名副表：以 (item_id, by) 为键（前端 appendix.ts 同口径：同 by 取较晚的 at）。
    # 单独建表而不是在 overrides/categories 里带 by/at 列 —— 署名有自己的域（一表一域）。
    con_rows = list(con_existing)
    con_map = {}
    for r in con_rows:
        key = ((r.get("item_id") or "").strip(), (r.get("by") or "").strip())
        if key[0] and key[1]:
            con_map[key] = r
    # 历史 by/at 迁移：一表一域之前署名是挂在 overrides.csv / categories.csv 的 by/at 列上的。
    # 这两张表现在的表头没有那两列，write_table 重写时会把它们**丢掉** —— 所以读到就顺手迁进
    # contributors.csv（(item_id, by) upsert，同键保留较晚的 at），不静默丢署名。
    # 真实仓库里这两张表已是三列（上面的迁移早已做过），此路径只对旧 5 列文件 / 从 .bak 还原的文件生效。
    legacy_cons = [( (r.get("item_id") or "").strip(), (r.get("by") or "").strip(),
                     (r.get("at") or "").strip())
                   for r in list(ov_existing) + list(cat_existing)]
    legacy_migrated = 0   # 从旧 5 列文件迁进 contributors.csv 的署名条数（见下）
    for l_iid, l_by, l_at in legacy_cons:
        if not l_iid or not l_by:
            continue
        prev = con_map.get((l_iid, l_by))
        if prev is None:
            rec = {"item_id": l_iid, "by": l_by, "at": l_at}
            con_map[(l_iid, l_by)] = rec
            con_rows.append(rec)
            legacy_migrated += 1
        elif l_at > (prev.get("at") or "").strip():
            prev["at"] = l_at
            legacy_migrated += 1

    names = resolve_names({r.get("user_id", "") for r in rows if r.get("user_id")}, env, args.by)
    who = ", ".join(f"{k[:8]}…→{v or '<空 → 前端回退匿名>'}" for k, v in names.items())
    print("署名（by）：" + (who or "未解析（留空 → 前端回退匿名）"))

    stats = dict(ref_add=0, ref_dup=0, ov_add=0, ov_replace=0, cat_add=0, cat_replace=0,
                 cat_extra_dup=0, con_add=0, con_replace=0, con_skip=0, con_migrate=legacy_migrated,
                 norm=0, link_fixed=0, edited=0,
                 orphan=0, bad_url=0, empty=0, unsupported=0, bad_json=0)
    merged_ids, unsupported_kinds = [], {}
    added_refs, added_ovs, added_cats, added_cons = [], [], [], []
    notes = []

    for r in sorted(rows, key=lambda x: (x.get("created_at") or "", int(x.get("id") or 0))):
        fid = r.get("id")
        iid = (r.get("item_id") or "").strip()
        iid = aliases.get(iid, iid)          # F30：旧 id 归一
        if iid not in idx:
            stats["orphan"] += 1
            notes.append(f"  #{fid} 孤儿 item_id {iid}")
            continue
        try:
            ch = json.loads(r.get("changes") or "{}")
        except Exception:
            stats["bad_json"] += 1
            notes.append(f"  #{fid} changes 非法 JSON")
            continue
        by = names.get(r.get("user_id", ""), "") or ""
        at = (r.get("created_at") or "")[:10]
        touched = False
        wrote = False     # 是否**真的写进去**了（同键重复跳过的参考链接不算，见署名）

        # 工作台里的就地编辑优先于反馈原值（edits 只存在本地 decisions.json，未回写 Supabase）。
        # 空编辑 = 未改（不做删除语义）；编辑也能补上反馈没提到的字段（例如补一条参考链接）。
        edits = ((dec.get(str(fid)) or {}).get("edits") or {})

        def picked(field):
            """返回 (值, 是否来自就地编辑)"""
            ev = (edits.get(field) or "").strip()
            if ev:
                return ev, True
            return (ch.get(field) or "").strip(), False

        link_raw, link_edited = picked("link")
        # 链接副表的两个附加属性只能来自工作台编辑（反馈表单不收集）：显示名与角色
        link_label = (edits.get("linkLabel") or "").strip()
        link_role = "main" if (edits.get("linkRole") or "").strip().lower() == "main" else "ref"
        if link_edited:
            stats["edited"] += 1
        # 只改了显示名/角色而没动地址时，edits.link 会带上该词条当前的主链接（工作台负责），
        # 这样「给主链接换个站名」也能落成一行 role=main 的副表记录
        if link_raw and (link_label or link_role == "main"):
            link_edited = True
        if link_raw:
            link, fixed = normalize_link(link_raw)
            if not link:
                stats["bad_url"] += 1
                notes.append(f"  #{fid} 非法 URL（非 http(s) 或结构非法）：{link_raw[:70]}")
            else:
                if fixed:
                    stats["link_fixed"] += 1
                    notes.append(f"  #{fid} 补协议 → {link}")
                key = (iid, link, link_role)   # 同一 URL 可以同时是主链接覆盖与附加参考，故带 role 去重
                if key in ref_keys:
                    stats["ref_dup"] += 1
                    touched = True
                else:
                    ref_keys.add(key)
                    rec = {"source_id": iid, "label": link_label or label_for(link), "url": link, "role": link_role}
                    ref_rows.append(rec)
                    added_refs.append({**rec, "fid": fid, "note": (r.get("note") or "").strip()})
                    stats["ref_add"] += 1
                    touched = True
                    wrote = True

        # 分类是专职表字段：落 categories.csv 的 role=main（覆盖该词条的主分类），不进 overrides.csv。
        # 一个词条最多一行 main —— 已有则就地覆盖（报告为「覆盖同键」，与 overrides.csv 同口径）。
        cat_val, cat_edited = picked("category")
        if cat_val:
            if cat_edited:
                stats["edited"] += 1
            cat_val, was_norm = one_line(cat_val)
            if was_norm:
                stats["norm"] += 1
            prev_main = main_map.get(iid)
            if prev_main is not None:
                # 只覆盖 category/role：by/at 已不在这张表的列里（署名归 contributors.csv）
                prev_main.update({"category": cat_val, "role": "main"})
                stats["cat_replace"] += 1
            else:
                rec = {"item_id": iid, "category": cat_val, "role": "main"}
                main_map[iid] = rec
                cat_rows.append(rec)
                stats["cat_add"] += 1
            wrote = True
            # 新主分类一旦与某条 extra 行重合，那条 extra 就失去意义（契约：extra 必须与主分类不同）；
            # 顺手去掉并记账，否则刚写出的表会被 build_data_api 的门在下次构建时拦下。
            for crow in [x for x in cat_rows
                         if (x.get("role") or "").strip().lower() != "main"
                         and (x.get("item_id") or "").strip() == iid
                         and (x.get("category") or "").strip() == cat_val]:
                cat_rows.remove(crow)
                stats["cat_extra_dup"] += 1
            added_cats.append({"fid": fid, "item_id": iid, "category": cat_val,
                               "note": (r.get("note") or "").strip()})
            touched = True

        # 文本字段 + tags 统一成 (字段, 值, 是否来自就地编辑) 列表再落盘
        writes = []
        for field in SUPPORTED:
            if field == "tags":
                continue          # tags 在下面单独处理（changes 里是数组）
            val, was_edited = picked(field)
            if val:
                writes.append((field, val, was_edited))

        # tags：changes 里是数组（表单多选），落 CSV 序列化为 JSON ——
        # 前端 lib/tags.ts 的 normalizeTags 优先按 JSON 解析，逗号歧义天然不存在
        raw_tags = ch.get("tags")
        if isinstance(raw_tags, list):
            tags_val = json.dumps([str(x) for x in raw_tags], ensure_ascii=False)
        elif isinstance(raw_tags, str):
            tags_val = raw_tags.strip()
        else:
            tags_val = ""
        tag_edit = (edits.get("tags") or "").strip()
        if tag_edit:
            tags_val = tag_edit
        if tags_val and tags_val != "[]":
            writes.append(("tags", tags_val, bool(tag_edit)))

        for field, val, was_edited in writes:
            if was_edited:
                stats["edited"] += 1
            val, was_norm = one_line(val)
            if was_norm:
                stats["norm"] += 1
            key = (iid, field)
            if key in ov_map:
                # 只覆盖 value：by/at 已不在这张表的列里（署名归 contributors.csv）
                ov_map[key].update({"value": val})
                stats["ov_replace"] += 1
            else:
                rec = {"item_id": iid, "field": field, "value": val}
                ov_map[key] = rec
                stats["ov_add"] += 1
            added_ovs.append({"fid": fid, "item_id": iid, "field": field, "value": val,
                              "note": (r.get("note") or "").strip()})
            touched = True
            wrote = True

        for k in ch:
            # link/category 已由专职副表承接；related.csv 不由本脚本落地（故仍按未知上报）
            if k in SUPPORTED or k in ("link", "category"):
                continue
            stats["unsupported"] += 1
            unsupported_kinds[k] = unsupported_kinds.get(k, 0) + 1
            notes.append(f"  #{fid} 字段 {k} 未知（脚本不落盘）")

        # 署名 → contributors.csv（一表一域：署名是独立的数据域，不再挂在 overrides/categories 的列上）。
        # 只有**真写进去**的反馈才记一笔：同键重复跳过的参考链接没有新数据落地，不作为贡献。
        # by 解不出（没 --by 且 batch_user_display 失败）时跳过不写 —— 空 by 会被构建门拦下、
        # 前端 appendix.ts 也会忽略该行，写进去只是脏数据。
        if wrote:
            if by:
                key = (iid, by)
                prev = con_map.get(key)
                if prev is not None:
                    # 同键保留较晚的 at（重跑旧反馈不会把日期改小；at 为空视为最早）
                    if at > (prev.get("at") or "").strip():
                        prev["at"] = at
                    stats["con_replace"] += 1
                else:
                    rec = {"item_id": iid, "by": by, "at": at}
                    con_map[key] = rec
                    con_rows.append(rec)
                    stats["con_add"] += 1
                added_cons.append({"fid": fid, "item_id": iid, "by": by, "at": at})
            else:
                stats["con_skip"] += 1

        if touched:
            merged_ids.append(str(fid))

    # 保留字段行**原样写回**：一表一域只约束「新写入」，脚本不替用户删历史数据 ——
    # 删掉它们会让 overrides.csv.bak 成为唯一副本，而 .bak 下次运行就被覆盖，
    # 那是不可逆的数据丢失。内容一字不改，位置挪到表尾；越界本身由三处门拦下：
    # 构建门（build_data_api）、质量报告（quality_report）、前端测试（appendix.test.ts）。
    ov_rows = list(ov_map.values()) + reserved_rows
    main_count = sum(1 for r in cat_rows if (r.get("role") or "").strip().lower() == "main")

    print(f"\n链接 → references.csv：新增 {stats['ref_add']}，重复跳过 {stats['ref_dup']}，"
          f"补协议 {stats['link_fixed']}，非法 URL（丢弃）{stats['bad_url']}")
    print(f"字段订正 → overrides.csv（{'/'.join(SUPPORTED)}）：新增 {stats['ov_add']}，覆盖同键 {stats['ov_replace']}")
    print(f"分类 → categories.csv（role=main 覆盖主分类）：新增 {stats['cat_add']}，覆盖同键 {stats['cat_replace']}"
          + (f"，去掉与主分类重合的 extra 行 {stats['cat_extra_dup']}" if stats["cat_extra_dup"] else ""))
    print(f"署名 → contributors.csv（谁为这个词条出过力，(item_id, by) upsert）：新增 {stats['con_add']}，"
          f"覆盖 {stats['con_replace']}"
          + (f"，by 未解析跳过 {stats['con_skip']}（无 --by 且解不出昵称）" if stats["con_skip"] else "")
          + (f"，自旧表 by/at 列迁入 {stats['con_migrate']}" if stats["con_migrate"] else ""))
    if stats["edited"]:
        print(f"其中 {stats['edited']} 处落的是工作台里的就地编辑（edits 优先于反馈原值）")
    print(f"值内含换行被归一为单行：{stats['norm']} 条（parseCSV 按行解析，换行会解坏整行）")
    print(f"孤儿 item_id 跳过：{stats['orphan']} / changes 非法：{stats['bad_json']} / 空值跳过：{stats['empty']}")
    if unsupported_kinds:
        print(f"暂不支持落盘：{unsupported_kinds}")
    if reserved_rows:
        # 迁移辅助：老 overrides.csv 里的保留字段行**不静默丢**，逐行点名归属表。
        # 这些行原样留在文件里（脚本不删用户数据），但不会被渲染层采纳 ——
        # 构建门 / 质量报告 / 前端测试都会因为越界而报出来，直到迁到专职副表为止。
        print(f"\n⚠️  overrides.csv 有 {len(reserved_rows)} 行保留字段（overrides.csv 只收 {'/'.join(SUPPORTED)}）："
              "这些行必须迁到各自的专职副表；本次**原样保留**在 overrides.csv（不删用户数据），"
              "但在页面上不生效，且构建门 / 质量报告 / 前端测试都会报越界。")
        for r0 in reserved_rows[:10]:
            f0 = (r0.get("field") or "").strip()
            print(f"    {r0.get('item_id', '?')} {f0} → {RESERVED.get(f0, '?')}：{(r0.get('value') or '')[:60]}")
        if len(reserved_rows) > 10:
            print(f"    … 共 {len(reserved_rows)} 行")
    if notes:
        print("\n明细（前 20 条）：")
        print("\n".join(notes[:20]))
    print(f"\n落地后：references.csv {len(ref_rows)} 行，overrides.csv {len(ov_rows)} 行，"
          f"categories.csv {len(cat_rows)} 行（其中 role=main {main_count} 行），"
          f"contributors.csv {len(con_rows)} 行")
    print(f"可标 applied 的反馈 id：{len(merged_ids)} 条")

    if args.review_md:
        def t(iid):
            return (idx.get(iid) or {}).get("t", iid)

        md = [
            "# 反馈合入清单", "",
            f"- 生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}",
            f"- 处理反馈 **{len(rows)}** 条；可标 applied **{len(merged_ids)}** 条",
            f"- 链接新增 {stats['ref_add']}（补协议 {stats['link_fixed']} / 非法丢弃 {stats['bad_url']}）；"
            f"字段订正 {'/'.join(SUPPORTED)} 新增 {stats['ov_add']}、覆盖同键 {stats['ov_replace']}；"
            f"分类 role=main 新增 {stats['cat_add']}、覆盖同键 {stats['cat_replace']}；"
            f"署名新增 {stats['con_add']}、覆盖同键 {stats['con_replace']}",
            "",
            "## 字段订正 → overrides.csv（只收 title/desc/tags）", "",
            "| 反馈 | 词条 | 字段 | 值 |", "| --- | --- | --- | --- |",
        ]
        for a in added_ovs:
            val = a["value"].replace("|", "\\|").replace("\n", " ")
            md.append(f"| #{a['fid']} | {t(a['item_id'])} | {a['field']} | {val} |")
        md += ["", "## 分类 → categories.csv（role=main 覆盖主分类）", "",
               "| 反馈 | 词条 | 主分类 | 角色 |", "| --- | --- | --- | --- |"]
        for a in added_cats:
            md.append(f"| #{a['fid']} | {t(a['item_id'])} | {a['category']} | main |")
        if not added_cats:
            md.append("| （本次无分类改动） | — | — | — |")
        md += ["", "## 链接副表 → references.csv（role=main 覆盖主链接，ref 为附加参考）", "",
               "| 反馈 | 词条 | 显示名 | URL | 角色 |", "| --- | --- | --- | --- | --- |"]
        for a in added_refs:
            md.append(f"| #{a['fid']} | {t(a['source_id'])} | {a['label']} | {a['url']} | {a.get('role', 'ref')} |")
        # 署名独立成节：它是自己的数据域（contributors.csv），不再是 overrides/categories 的列。
        # 同键覆盖（同一人再次为同一词条出过力）也列出来，人核对时才看得到日期被推后。
        md += ["", "## 署名 → contributors.csv（谁为这个词条出过力，(item_id, by) upsert）", "",
               "| 反馈 | 词条 | 署名 | 日期 |", "| --- | --- | --- | --- |"]
        for a in added_cons:
            md.append(f"| #{a['fid']} | {t(a['item_id'])} | {a['by']} | {a['at'] or '—'} |")
        if not added_cons:
            md.append("| （本次无署名变更） | — | — | — |")
        if stats["con_migrate"]:
            md += ["", f"> 另有 {stats['con_migrate']} 条署名是从旧表残留的 `by`/`at` 列迁进来的"
                       "（overrides.csv / categories.csv 已无这两列，写入时会丢，故先迁移）。"]
        if stats["con_skip"]:
            md += ["", f"> ⚠️ 有 {stats['con_skip']} 条反馈落地了改动但**解不出署名**（未传 --by 且 "
                       "batch_user_display 无结果），未写署名行 —— 需要的话带 --by 重跑补上。"]
        if reserved_rows:
            md += ["", "## ⚠️ overrides.csv 里的保留字段（一表一域：需迁到专职副表）", "",
                   "| 词条 | 字段 | 值 | 应迁往 |", "| --- | --- | --- | --- |"]
            for r0 in reserved_rows:
                f0 = (r0.get("field") or "").strip()
                val = (r0.get("value") or "").replace("|", "\\|")[:80]
                md.append(f"| {t((r0.get('item_id') or '').strip())} | {f0} | {val} | {RESERVED.get(f0, '?')} |")
        Path(args.review_md).write_text("\n".join(md) + "\n", encoding="utf-8")
        print(f"合入清单已写入 {args.review_md}（字段 {len(added_ovs)} 行 / 分类 {len(added_cats)} 行 / "
              f"链接 {len(added_refs)} 行 / 署名 {len(added_cons)} 行）")

    if args.emit_sql:
        ids = ",".join(merged_ids) or "NULL"
        Path(args.emit_sql).write_text(
            "-- 合入完成后在 Supabase SQL Editor 执行（applied 只由这一步写，人勿手改）\n"
            f"UPDATE entry_feedback SET status = 'accepted', applied = true\n"
            f"WHERE id IN ({ids});\n", encoding="utf-8")
        print(f"回填语句已写入 {args.emit_sql}")

    if not args.write:
        print("\n[dry-run] 未落盘（--mark-* 的回填同样跳过）。加 --write 才写入 appendix 四张 CSV。")
        return

    # 四张副表一次写全（列 = 上面的 *_HEADER 常量，一表一域）：overrides.csv 只收 SUPPORTED、
    # 分类走 categories.csv 的 role=main、**by/at 只进 contributors.csv**（它们已不是前两张表的列）。
    # categories.csv 的 role 缺省值是 extra（references.csv 是 ref）—— 写死 ref 会写出非法角色。
    write_table(APPENDIX / "references.csv", REFERENCES_HEADER, ref_rows)
    write_table(APPENDIX / "overrides.csv", OVERRIDES_HEADER, ov_rows)
    write_table(APPENDIX / "categories.csv", CATEGORIES_HEADER, cat_rows, default_role="extra")
    write_table(APPENDIX / "contributors.csv", CONTRIBUTORS_HEADER, con_rows)
    print("\n已写入 references.csv / overrides.csv / categories.csv / contributors.csv（原文件备份为 .bak）")

    # ── 回填 Supabase 状态 ────────────────────────────────────────────
    # 必须先落盘再回填：没写副表就标 applied=true 等于谎报合入（文档「applied 由收尾步骤写」）。
    # 走 service_role（entry_feedback 无 UPDATE 策略，anon 连自己的行都改不了，何况这些是他人的行）。
    if args.mark_applied or args.mark_rejected:
        if not service_key(env):
            print("回填未执行：未配置 service key。把它写进 iceberg-vue/.env 的 "
                  "SUPABASE_SERVICE_ROLE_KEY=…（Supabase → Project Settings → API → service_role），"
                  "或用 --emit-sql 生成的语句在 Supabase SQL Editor 执行。")
        else:
            if args.mark_applied:
                n, err = mark_rows(env, merged_ids, "accepted", True)
                print(f"回填 采纳 {len(merged_ids)} 条 → status=accepted/applied=true："
                      + (f"成功 {n} 行" if n is not None else f"未执行（{err}）"))
            if args.mark_rejected:
                n, err = mark_rows(env, rejected_ids, "rejected", False)
                print(f"回填 驳回 {len(rejected_ids)} 条 → status=rejected："
                      + (f"成功 {n} 行" if n is not None else f"未执行（{err}）"))


if __name__ == "__main__":
    main()
