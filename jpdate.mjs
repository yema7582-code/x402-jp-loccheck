// Japanese calendar helpers: 和暦⇄西暦, national holidays (Cabinet Office syukujitsu.csv), business days.
import { readFileSync } from 'node:fs';
export const HOLIDAYS = JSON.parse(readFileSync(new URL('./holidays.json', import.meta.url), 'utf8'));
const KEYS = Object.keys(HOLIDAYS).sort();
export const COVERAGE = { from: KEYS[0], to: KEYS[KEYS.length - 1] };
const ERAS = [ // start date (Gregorian), name, romaji, letter
  ['2019-05-01', '令和', 'Reiwa', 'R'], ['1989-01-08', '平成', 'Heisei', 'H'], ['1926-12-25', '昭和', 'Showa', 'S'],
  ['1912-07-30', '大正', 'Taisho', 'T'], ['1873-01-01', '明治', 'Meiji', 'M'],
];
const ERA_START_YEAR = { 令和: 2019, 平成: 1989, 昭和: 1926, 大正: 1912, 明治: 1868, R: 2019, H: 1989, S: 1926, T: 1912, M: 1868 };
const WD = ['日', '月', '火', '水', '木', '金', '土'], WDE = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const z2h = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[．／－]/g, (c) => ({ '．': '.', '／': '/', '－': '-' })[c]);
// Accepts 2026-11-02, 2026/11/2, 20261102, 令和8年11月2日, 令和元年5月1日, R8.11.2, H31/4/30
export function parseDate(input) {
  let s = z2h(String(input || '').trim()).replace(/\s+/g, '');
  let y, m, d, m1;
  if ((m1 = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/))) [y, m, d] = [+m1[1], +m1[2], +m1[3]];
  else if ((m1 = s.match(/^(\d{4})(\d{2})(\d{2})$/))) [y, m, d] = [+m1[1], +m1[2], +m1[3]];
  else if ((m1 = s.match(/^(令和|平成|昭和|大正|明治|[RHSTMrhstm])(元|\d{1,2})[年./-](\d{1,2})[月./-](\d{1,2})日?$/))) {
    const era = m1[1].length === 1 ? m1[1].toUpperCase() : m1[1];
    const ey = m1[2] === '元' ? 1 : +m1[2];
    [y, m, d] = [ERA_START_YEAR[era] + ey - 1, +m1[3], +m1[4]];
    const dt = new Date(Date.UTC(y, m - 1, d));
    const w = toWareki(dt);
    if (!w || (w.era !== era && w.letter !== era)) throw new Error(`${input}: date is outside the ${m1[1]} era`);
  } else throw new Error(`Unrecognized date: ${input}`);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw new Error(`Invalid date: ${input}`);
  return dt;
}
export function toWareki(dt) {
  const s = iso(dt);
  for (const [start, era, romaji, letter] of ERAS) if (s >= start) {
    const ey = dt.getUTCFullYear() - ERA_START_YEAR[era] + 1;
    const m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
    return { era, romaji, letter, year: ey, text: `${era}${ey === 1 ? '元' : ey}年${m}月${d}日`, short: `${letter}${ey}.${m}.${d}` };
  }
  return null;
}
const YEAREND = { none: [], gov: ['12-29', '12-30', '12-31', '01-01', '01-02', '01-03'], bank: ['12-31', '01-01', '01-02', '01-03'] };
export function dayInfo(dt, yearend = 'none') {
  const s = iso(dt), w = dt.getUTCDay();
  const ye = (YEAREND[yearend] || []).includes(s.slice(5));
  const holiday = HOLIDAYS[s] || null;
  const inCoverage = s >= COVERAGE.from.slice(0, 4) + '-01-01' && s <= COVERAGE.to.slice(0, 4) + '-12-31';
  return { date: s, weekday: WD[w], weekday_en: WDE[w], wareki: toWareki(dt), holiday, year_end_closure: ye,
    business_day: !(w === 0 || w === 6 || holiday || ye), holiday_data_covered: inCoverage };
}
export function addBusinessDays(dt, n, yearend = 'none') {
  if (!Number.isInteger(n) || Math.abs(n) > 1000) throw new Error('add_business_days must be an integer between -1000 and 1000');
  let d = new Date(dt), left = Math.abs(n), step = n < 0 ? -1 : 1;
  while (left > 0) { d = new Date(d.getTime() + step * 86400000); if (dayInfo(d, yearend).business_day) left--; }
  return d;
}
export function businessDaysBetween(a, b, yearend = 'none') { // counts business days in (a, b], sign by order
  if (Math.abs(b - a) > 3660 * 86400000) throw new Error('range too long (max 10 years)');
  const sign = b < a ? -1 : 1; let [x, y] = sign > 0 ? [a, b] : [b, a]; let c = 0;
  for (let d = new Date(x.getTime() + 86400000); d <= y; d = new Date(d.getTime() + 86400000)) if (dayInfo(d, yearend).business_day) c++;
  return sign * c;
}
export function jpdate(q) {
  const yearend = ['gov', 'bank', 'none'].includes(q.yearend) ? q.yearend : 'none';
  const dt = parseDate(q.date);
  const out = { ...dayInfo(dt, yearend), yearend_rule: yearend };
  if (q.add_business_days !== undefined && q.add_business_days !== '') {
    const n = Number(q.add_business_days); const r = addBusinessDays(dt, n, yearend);
    out.add_business_days = { n, result: dayInfo(r, yearend) };
  }
  if (q.to) { const t = parseDate(q.to); out.business_days_to = { to: iso(t), count: businessDaysBetween(dt, t, yearend), counting: 'exclusive of start, inclusive of end' }; }
  if (!out.holiday_data_covered) out.warning = `Holiday data covers ${COVERAGE.from.slice(0, 4)}-${COVERAGE.to.slice(0, 4)} only (Cabinet Office list); weekends still applied.`;
  return out;
}
