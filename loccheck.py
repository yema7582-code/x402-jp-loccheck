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
            if not k.lower().endswith("keywords") and re.search(r"[A-Za-z][,.!?]|[\u3040-\u9fff][,!?]", body): f.append("half-width punctuation in CJK target")
            if "..." in body: f.append("'...' instead of '…'")
            if re.search(r"\b[a-z]{4,}\b", body): f.append("possible untranslated English word")
        if s.strip() and t.strip() and not CJK.search(t) and len(t) > max_ratio * len(s): f.append(f"target {len(t)/len(s):.1f}x longer than source")
        if f: out.append((i, k, f))
    return rows, out
# App Store / Google Play metadata limits (characters), keyed by field name in the key column
LIMITS = {"name": 30, "app_name": 30, "subtitle": 30, "keywords": 100, "promotional_text": 170, "promo_text": 170,
          "description": 4000, "whats_new": 4000, "release_notes": 4000,
          "play_title": 30, "short_description": 80, "full_description": 4000}
def aso_check(rows, key_col, tgt_col):
    out, words = [], collections.defaultdict(set)
    for i, r in enumerate(rows, start=2):
        k = (r.get(key_col, "") or "").strip().lower(); t = (r.get(tgt_col, "") or "").strip(); f = []
        field = k.split(".")[-1]
        if field in LIMITS and len(t) > LIMITS[field]: f.append(f"{field} is {len(t)} chars, store limit {LIMITS[field]}")
        if field == "keywords":
            if re.search(r",\s", t): f.append("spaces after commas waste keyword characters")
            kws = [w.strip() for w in re.split(r"[,、]", t) if w.strip()]
            dup = [w for w, c in collections.Counter(kws).items() if c > 1]
            if dup: f.append(f"duplicate keywords: {dup}")
            words["keywords"].update(kws)
        if field in ("name", "app_name", "subtitle"): words["title"].add(t.lower())
        if f: out.append((i, k, f))
    rep = sorted(w for w in words["keywords"] if any(w.lower() in x for x in words["title"]))
    if rep: out.append((0, "keywords", [f"already in name/subtitle (Apple indexes them, drop from keywords): {rep}"]))
    return out
if __name__ == "__main__":
    a = argparse.ArgumentParser(); a.add_argument("csv"); a.add_argument("--key", default="key"); a.add_argument("--source", default="source"); a.add_argument("--target", default="target"); a.add_argument("--max-ratio", type=float, default=1.6); a.add_argument("--aso", action="store_true", help="also check App Store/Play metadata limits")
    o = a.parse_args(); rows, issues = check(o.csv, o.source, o.target, o.key, o.max_ratio)
    if o.aso: issues += aso_check(rows, o.key, o.target)
    print(f"# Localization check: {o.csv}\n{len(rows)} rows, {len(issues)} flagged\n")
    for line, k, f in issues: print(f"- line {line} `{k}`: " + "; ".join(f))
