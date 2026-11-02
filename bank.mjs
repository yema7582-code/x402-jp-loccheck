// Japanese bank / branch codes (全銀コード) and 振込名義 (zengin half-width kana) checks.
// Data: zengin-code source-data (MIT).
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const D = JSON.parse(gunzipSync(readFileSync(new URL('./bankdata.json.gz', import.meta.url))).toString('utf8'));
let nb = 0; for (const b of Object.values(D.banks)) nb += Object.keys(b[3]).length;
export const BANK_META = { source: D.source, data_updated: D.updated, banks: Object.keys(D.banks).length, branches: nb };
const fw = (s) => String(s ?? '').replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();
const pad = (s, n) => { const d = fw(s).replace(/\D/g, ''); return d ? d.padStart(n, '0') : ''; };

// full-width katakana -> half-width
const H = 'ｧｱｨｲｩｳｪｴｫｵｶｶﾞｷｷﾞｸｸﾞｹｹﾞｺｺﾞｻｻﾞｼｼﾞｽｽﾞｾｾﾞｿｿﾞﾀﾀﾞﾁﾁﾞｯﾂﾂﾞﾃﾃﾞﾄﾄﾞﾅﾆﾇﾈﾉﾊﾊﾞﾊﾟﾋﾋﾞﾋﾟﾌﾌﾞﾌﾟﾍﾍﾞﾍﾟﾎﾎﾞﾎﾟﾏﾐﾑﾒﾓｬﾔｭﾕｮﾖﾗﾘﾙﾚﾛﾜﾜｲｴｦﾝｳﾞ';
const FK = 'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴ';
const HT = []; { let i = 0; for (const c of FK) { let h = H[i]; i++; if (H[i] === 'ﾞ' || H[i] === 'ﾟ') { h += H[i]; i++; } HT.push([c, h]); } }
const K2H = Object.fromEntries(HT);
const SMALL = { 'ｧ': 'ｱ', 'ｨ': 'ｲ', 'ｩ': 'ｳ', 'ｪ': 'ｴ', 'ｫ': 'ｵ', 'ｯ': 'ﾂ', 'ｬ': 'ﾔ', 'ｭ': 'ﾕ', 'ｮ': 'ﾖ', 'ｰ': '-' };
const CORP = [['株式会社', 'ｶ'], ['有限会社', 'ﾕ'], ['合同会社', 'ﾄﾞ'], ['合名会社', 'ﾒ'], ['合資会社', 'ｼ'], ['一般社団法人', 'ｼﾔ'], ['一般財団法人', 'ｻﾞｲ'], ['特定非営利活動法人', 'ﾄｸﾋ'], ['医療法人', 'ｲ'], ['学校法人', 'ｶﾞｸ'], ['社会福祉法人', 'ﾌｸ']];
const OK = /^[ｱ-ﾝﾞﾟA-Z0-9 ().,\-\/\\「」]$/;
export function toZenginKana(raw) {
  let s = fw(raw).replace(/\u3000/g, ' ');
  const notes = [];
  for (const [w, a] of CORP) {
    if (s.startsWith(w)) { s = a + ')' + s.slice(w.length); notes.push(w + ' at start -> ' + a + ')'); }
    else if (s.endsWith(w)) { s = s.slice(0, -w.length) + '(' + a; notes.push(w + ' at end -> (' + a); }
    else if (s.includes(w)) { s = s.replace(w, '(' + a + ')'); notes.push(w + ' in middle -> (' + a + ')'); }
  }
  s = s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)).toUpperCase();
  let out = '';
  for (const c of s) out += K2H[c] ?? ({ 'ー': '-', '－': '-', '‐': '-', '・': '.', '（': '(', '）': ')', '．': '.', '，': ',', '／': '/', 'ｰ': '-', '･': '.' }[c] ?? c);
  out = [...out].map((c) => SMALL[c] ?? c).join('').replace(/ +/g, ' ').trim();
  const bad = [...new Set([...out].filter((c) => !OK.test(c)))];
  if (bad.length) notes.push('characters not allowed in zengin kana (kanji or symbols need a reading): ' + bad.join(''));
  return { input: raw, zengin_kana: out, valid: bad.length === 0 && out.length > 0, length: out.length, invalid_chars: bad, notes };
}
const bankOut = (c, trial) => { const b = D.banks[c]; return trial ? { code: c, name: b[0] } : { code: c, name: b[0], kana: b[1], romaji: b[2], branch_count: Object.keys(b[3]).length }; };
export function bankLookup(q, trial = false) {
  const res = {};
  if (q.bank) {
    const c = pad(q.bank, 4);
    if (D.banks[c]) res.bank = bankOut(c, trial);
    else {
      const t = fw(q.bank).replace(/銀行$/, '');
      let hits = Object.entries(D.banks).filter(([, b]) => fw(b[0]) === t || b[1] === t || b[2] === t.toLowerCase()).map(([k]) => k);
      if (!hits.length && t.length >= 2) hits = Object.entries(D.banks).filter(([, b]) => fw(b[0]).startsWith(t) || b[1].startsWith(t)).map(([k]) => k);
      if (hits.length) res.bank = bankOut(hits[0], trial); else res.bank = { input: q.bank, found: false };
      if (hits.length > 1) res.other_matches = hits.slice(1, 10).map((k) => bankOut(k, true));
    }
  }
  if (trial) { res.data = BANK_META; return res; }
  const bc = res.bank?.code;
  if (q.branch !== undefined) {
    if (!bc) throw new Error('branch lookup needs a valid bank code or name');
    const br = D.banks[bc][3]; const c = pad(q.branch, 3);
    let hit = br[c] ? c : Object.keys(br).find((k) => fw(br[k][0]) === fw(q.branch).replace(/支店$|出張所$/, '') || br[k][1] === fw(q.branch));
    res.branch = hit ? { code: hit, name: br[hit][0], kana: br[hit][1], romaji: br[hit][2] } : { input: q.branch, found: false };
  }
  if (q.name !== undefined) res.account_name = toZenginKana(q.name);
  if (q.account !== undefined) { const a = fw(q.account).replace(/[\s-]/g, ''); res.account_number = { input: q.account, normalized: /^\d{1,7}$/.test(a) ? a.padStart(7, '0') : null, valid: /^\d{1,7}$/.test(a) }; }
  if (!Object.keys(res).length) throw new Error('give bank= (code or name), optional branch=, name= (振込名義) or account=');
  res.data = BANK_META;
  return res;
}
