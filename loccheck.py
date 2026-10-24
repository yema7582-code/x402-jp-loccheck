#!/usr/bin/env python3
"""Localization string-table checker (CSV: key,source,target[,...]).
Flags: empty/duplicate keys, blank targets, untranslated (target==source),
placeholder mismatches ({name},{0},%s,%d,<tags>,\\n), leading/trailing spaces,
CJK-specific issues (half-width punctuation in JA/ZH target, ASCII '...' vs '…'),
length overflow vs source (ratio), and stray source-language text in target."""
import csv, re, sys, collections, argparse
PH = re.compile(r"\{[^{}]*\}|%\d*\$?[sdif@]|<[^<>]+>|\\n|\[[a-z_]+\]")
CJK = re.compile(r"[\u3040-\u30ff\u4e00-\u9fff]")
def check(path, src_col, tgt_col, key_col, max_ratio):
    rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))
    seen = collections.Counter(r.get(key_col, "") for r in rows)
    out = []
    for i, r in enumerate(rows, start=2):
        k, s, t = r.get(key_col, ""), r.get(src_col, "") or "", r.get(tgt_col, "") or ""
        f = []
        if not k.strip(): f.append("empty key")
        elif seen[k] > 1: f.append("duplicate key")
        if k != k.strip(): f.append("whitespace around key")
        if s.strip() and not t.strip(): f.append("blank target")
        elif t.strip() and t.strip() == s.strip() and re.search(r"[A-Za-z]{3}", s): f.append("target identical to source (untranslated?)")
        ps, pt = collections.Counter(PH.findall(s)), collections.Counter(PH.findall(t))
        if t.strip() and ps != pt:
            f.append(f"placeholder mismatch: source {sorted(ps.elements())} vs target {sorted(pt.elements())}")
        if t and (t != t.strip()) and (s == s.strip()): f.append("leading/trailing space in target only")
        if CJK.search(t):
            body = PH.sub("", t)
            if re.search(r"[A-Za-z][,.!?]|[\u3040-\u9fff][,!?]", body): f.append("half-width punctuation in CJK target")
            if "..." in body: f.append("'...' instead of '…'")
            if re.search(r"\b[a-z]{4,}\b", body): f.append("possible untranslated English word")
        if s.strip() and t.strip() and not CJK.search(t) and len(t) > max_ratio * len(s): f.append(f"target {len(t)/len(s):.1f}x longer than source")
        if f: out.append((i, k, f))
    return rows, out
if __name__ == "__main__":
    a = argparse.ArgumentParser(); a.add_argument("csv"); a.add_argument("--key", default="key"); a.add_argument("--source", default="source"); a.add_argument("--target", default="target"); a.add_argument("--max-ratio", type=float, default=1.6)
    o = a.parse_args(); rows, issues = check(o.csv, o.source, o.target, o.key, o.max_ratio)
    print(f"# Localization check: {o.csv}\n{len(rows)} rows, {len(issues)} flagged\n")
    for line, k, f in issues: print(f"- line {line} `{k}`: " + "; ".join(f))
