// Japanese postal code (郵便番号) -> address, from Japan Post's public utf_ken_all + KEN_ALL_ROME data.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const D = JSON.parse(gunzipSync(readFileSync(new URL('./zipdata.json.gz', import.meta.url))).toString('utf8'));
export const ZIP_META = { source: D.source, rows: D.rows, zip_codes: Object.keys(D.zips).length, data_updated: '2026-10-30' };
const norm = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[〒\s\-‐－ー―−]/g, '');
const one = (raw, trial) => {
  const z = norm(raw);
  if (!/^\d{7}$/.test(z)) return { input: raw, error: 'expected a 7-digit postal code like 100-0001' };
  const rows = D.zips[z];
  if (!rows) return { input: raw, zip: z, found: false };
  const results = rows.map(([p, city, town, cityKana, townKana, cityRoma, townRoma, jis]) => {
    const o = { prefecture: D.prefs[p], city, town, address: D.prefs[p] + city + town };
    if (trial) return { prefecture: o.prefecture, city };
    return { ...o, kana: { prefecture: D.prefsKana[p], city: cityKana, town: townKana },
      romaji: { prefecture: D.prefsRoma[p], city: cityRoma, town: townRoma }, jis_code: jis };
  });
  return { input: raw, zip: z.slice(0, 3) + '-' + z.slice(3), found: true, multiple: results.length > 1, results };
};
export function zipLookup(q, trial = false) {
  const list = q.zips ? String(q.zips).split(/[,\n]/).filter(Boolean) : [q.zip ?? q.code ?? ''];
  if (!trial && list.length > 100) throw new Error('max 100 zips per call');
  const out = (trial ? list.slice(0, 1) : list).map((x) => one(x.trim(), trial));
  const res = out.length === 1 && !q.zips ? out[0] : { count: out.length, items: out };
  res.data = ZIP_META;
  return res;
}
