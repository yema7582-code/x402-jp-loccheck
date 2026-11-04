// Japanese qualified invoice issuer number (適格請求書発行事業者登録番号, T+13 digits) check.
// Format + check digit offline; live status from the NTA public site (国税庁 適格請求書発行事業者公表サイト).
const URL_T = (d) => `https://www.invoice-kohyo.nta.go.jp/regno-search/detail?selRegNo=${d}`;
const CORP = ['株式会社', '有限会社', '合同会社', '合資会社', '合名会社', '一般社団法人', '一般財団法人', '公益社団法人', '公益財団法人', '特定非営利活動法人', '(株)', '(有)', '(同)', '㈱', '㈲'];
export const normNo = (s) => String(s || '').normalize('NFKC').toUpperCase().replace(/[\s\-‐ー―−]/g, '');
export const checkDigitOk = (d) => {
  const body = d.slice(1).split('').reverse();
  const tot = body.reduce((a, c, i) => a + Number(c) * (i % 2 === 0 ? 1 : 2), 0);
  return Number(d[0]) === 9 - (tot % 9);
};
const normName = (s) => { let t = String(s || '').normalize('NFKC'); for (const c of CORP) t = t.split(c.normalize('NFKC')).join(''); return t.replace(/[\s・,.、。]/g, '').toLowerCase(); };
const text = (raw) => raw.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/\s+/g, ' ');
async function nta(d) {
  const res = await fetch(URL_T(d), { headers: { 'User-Agent': 'Mozilla/5.0 x402-jp invoice-check' }, signal: AbortSignal.timeout(15000) });
  const t = text(await res.text());
  const g = (re) => { const m = t.match(re); return m ? m[1].trim() : ''; };
  const name = g(/氏名又は名称 (.+?) (?:登録年月日|主たる屋号)/);
  const out = { found: !!name, name, registered: g(/登録年月日 (\S+)/), address: g(/本店又は主たる事務所の所在地 (.+?) (?:最終更新年月日|更新年月日|取消年月日|失効年月日|公表|法人番号|$)/).slice(0, 120) };
  const rv = t.match(/(取消年月日|失効年月日) (\S+)/); out.revoked = rv ? `${rv[1]} ${rv[2]}` : '';
  return out;
}
async function one(raw, wantName, trial) {
  let no = normNo(raw); if (/^\d{13}$/.test(no)) no = 'T' + no;
  const o = { input: raw, number: no, format_ok: /^T\d{13}$/.test(no) };
  if (!o.format_ok) return { ...o, valid: false, reason: 'expected T + 13 digits' };
  const d = no.slice(1); o.check_digit_ok = checkDigitOk(d);
  o.corporate_number = d; o.lookup_url = URL_T(d);
  if (!o.check_digit_ok) return { ...o, valid: false, reason: 'check digit mismatch (typo?)' };
  if (trial) return o;
  try {
    const n = await nta(d); o.nta = n;
    o.registered_now = n.found && !n.revoked;
    if (wantName && n.found) { const a = normName(wantName), b = normName(n.name); o.name_match = !!a && (a.includes(b) || b.includes(a)); }
    o.valid = o.registered_now && o.name_match !== false;
    if (!n.found) o.reason = 'not found on the NTA public site';
    else if (n.revoked) o.reason = 'registration revoked/expired: check validity on the transaction date';
    else if (o.name_match === false) o.reason = 'name differs from the NTA record';
  } catch (e) { o.valid = null; o.reason = 'NTA lookup failed, retry later'; }
  return o;
}
export async function invoiceCheck(q, trial = false) {
  const list = q.numbers ? String(q.numbers).split(/[,\n]/).map((s) => s.trim()).filter(Boolean) : [q.number ?? q.regno ?? q.t ?? ''];
  const names = q.names ? String(q.names).split(/[,\n]/) : [q.name ?? ''];
  if (list.length > 10) throw new Error('max 10 numbers per call');
  const use = trial ? list.slice(0, 1) : list; const out = [];
  for (let i = 0; i < use.length; i++) { if (i && !trial) await new Promise((r) => setTimeout(r, 1000)); out.push(await one(use[i], (names[i] || '').trim(), trial)); }
  const res = out.length === 1 && !q.numbers ? out[0] : { count: out.length, items: out };
  res.source = 'National Tax Agency public site (invoice-kohyo.nta.go.jp), looked up live. Matching only, not tax advice.';
  return res;
}
