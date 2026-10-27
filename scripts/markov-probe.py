#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""马尔可夫生成可行性探针（临时脚本，可删）。

测量：在本项目 desc 语料上，不同“阶数/插值权重/单元粒度”下生成文本的
  - 复制率：生成文本的 n-gram 有多少命中训练语料（抄袭度代理）
  - 多样性：生成文本自身的 distinct n-gram 比
  - 无 Grade 的人工可读性：直接打印样本肉眼判定

用法：python scripts/markov-probe.py
依赖：jieba（已在隔离 python 中安装）
"""
import json
import random
import re
import collections
from pathlib import Path

import jieba

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "iceberg-vue" / "src" / "data" / "iceberg.json"
SEED = 20261006


def load_corpus():
    d = json.loads(DATA.read_text(encoding="utf-8"))
    items = [i for tier in d["tiers"].values() for i in tier]
    return [i["desc"] for i in items if i.get("desc") and len(i["desc"]) >= 10]


# ---------- 分句 / 分词 ----------

SENT_SPLIT = re.compile(r"[。！？]+")
CLAUSE_SPLIT = re.compile(r"[，。；：、！？（）]+")


def to_units(texts, unit):
    """unit: word | clause"""
    out = []
    for t in texts:
        if unit == "word":
            out.append([w for w in jieba.lcut(t) if w.strip()])
        else:
            out.append([c.strip() for c in CLAUSE_SPLIT.split(t) if c.strip()])
    return out


class NGram:
    """插值 n-gram：P(w|h) = sum_k lambda_k * P_k(w|h_k)，k 为阶数（back-off 到更低阶）。"""

    def __init__(self, seqs, orders, seed=SEED):
        self.orders = orders
        self.rng = random.Random(seed)
        self.tables = {}
        for n in orders:  # n = 条件长度 + 1
            tab = collections.defaultdict(collections.Counter)
            for s in seqs:
                pad = ["<S>"] * (n - 1) + list(s) + ["<E>"]
                for i in range(n - 1, len(pad) + 1):
                    tab[tuple(pad[i - n + 1 : i - 1])][pad[i - 1]] += 1
            self.tables[n] = tab

    def sample(self, hist, lambdas):
        cand = collections.Counter()
        for n, lam in zip(self.orders, lambdas):
            if lam <= 0:
                continue
            row = self.tables[n].get(tuple(hist[-(n - 1) :]))
            if not row:
                continue
            tot = sum(row.values())
            for w, c in row.items():
                cand[w] += lam * c / tot
        if not cand:
            return "<E>"
        r = self.rng.random() * sum(cand.values())
        acc = 0.0
        for w, p in cand.items():
            acc += p
            if r <= acc:
                return w
        return cand.most_common(1)[0][0]

    def generate(self, lambdas, length=200):
        hist = ["<S>"] * (max(self.orders) - 1)
        out = []
        while len(out) < length:
            w = self.sample(hist, lambdas)
            if w == "<E>":
                hist = ["<S>"] * (max(self.orders) - 1)
                out.append("。")
                continue
            out.append(w)
            hist.append(w)
        return "".join(out)


# ---------- 评判指标 ----------


def ngrams(seq, n):
    return {tuple(seq[i : i + n]) for i in range(len(seq) - n + 1)}


def evaluate(gen_tokens, train_tokens, n=6):
    hit = len(ngrams(gen_tokens, n) & ngrams(train_tokens, n))
    return hit / max(1, len(ngrams(gen_tokens, n)))


def main():
    texts = load_corpus()
    print(f"语料：{len(texts)} 条 desc，{sum(len(t) for t in texts)} 字\n")

    train_tokens = [w for t in texts for w in jieba.lcut(t) if w.strip()]

    configs = [
        ("word  L=(1,0,0) 纯 bigram", [1, 0, 0]),
        ("word  L=(.5,.5,0) 2/3 阶插值", [0.5, 0.5, 0]),
        ("word  L=(.2,.3,.5) 偏高阶", [0.2, 0.3, 0.5]),
        ("word  L=(0,0,1) 纯 4-gram", [0, 0, 1]),
    ]
    model = NGram(to_units(texts, "word"), [2, 3, 4])
    print(f"{'配置':32s} {'6gram复制率':>12s} {'distinct2':>10s}")
    for name, lam in configs:
        gen = model.generate(lam, length=300)
        gt = [w for w in jieba.lcut(gen) if w.strip()]
        rep = evaluate(gt, train_tokens, 6)
        div = len(ngrams(gt, 2)) / max(1, len(gt) - 1)
        print(f"{name:32s} {rep:12.3f} {div:10.3f}")
        print("   >>", gen[:110].replace("\n", " "), "\n")

    # 子句级链
    cm = NGram(to_units(texts, "clause"), [2])
    gen = "，".join(cm.generate([1], length=24))
    ct = [c for t in texts for c in CLAUSE_SPLIT.split(t) if c.strip()]
    print(f"{'clause L=(1) 纯子句 bigram':32s} {evaluate(gen[:200], ''.join(ct), 6):12.3f}")
    print("   >>", gen[:160], "\n")


if __name__ == "__main__":
    main()
