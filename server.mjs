// x402 pay-per-call: Japanese/Chinese localization string-table check.
// POST /api/loccheck  body: raw CSV (key,source,target)  -> markdown report
// Price $0.01 USDC per call, Base mainnet or Solana mainnet, settles to the owner's wallets.
import express from 'express';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { ExactSvmScheme } from '@x402/svm/exact/server';
import { declareDiscoveryExtension, bazaarResourceServerExtension } from '@x402/extensions/bazaar';
import { jpdate, COVERAGE } from './jpdate.mjs';
import { zipLookup, ZIP_META } from './zipcode.mjs';
import { bankLookup, BANK_META } from './bank.mjs';
import { invoiceCheck } from './invoice.mjs';

const BASE_PAYTO = '0x4C4860b980a3AE0c91aa69e8eff48009C5469fEe';
const SOL_PAYTO = '8BwJ9oHnwfiQgAMrR6fbBX4e1EcELGaeyiRAeP21sLbo';
const BASE = 'eip155:8453', SOL = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const LOCCHECK = process.env.LOCCHECK || new URL('./loccheck.py', import.meta.url).pathname;

const facilitator = new HTTPFacilitatorClient({ url: process.env.FACILITATOR || 'https://facilitator.payai.network' });
const server = new x402ResourceServer(facilitator).register(BASE, new ExactEvmScheme()).register(SOL, new ExactSvmScheme()).registerExtension(bazaarResourceServerExtension);

const app = express();
app.set('trust proxy', true);
app.use(express.text({ type: '*/*', limit: '512kb' }));
app.get('/', (_q, r) => r.type('text/plain').send(
  'Japanese/Chinese localization check for game/app string tables.\n' +
  'POST /api/loccheck with a UTF-8 CSV (columns key,source,target). $0.01 USDC via x402 (Base or Solana).\n' +
  'Flags blank/untranslated targets, placeholder mismatches, duplicate keys, half-width punctuation, "..." vs "…", leftover English.\n' +
  'Free trial (first 5 rows, no payment): POST /api/loccheck/trial\n\n' +
  'Japanese calendar API: GET /api/jpdate?date=2026-11-02 ($0.001 USDC via x402). 和暦⇄西暦 (令和/平成/昭和/大正/明治, R8.11.2, 元年),\n' +
  'national holidays from the Cabinet Office list (' + COVERAGE.from.slice(0, 4) + '-' + COVERAGE.to.slice(0, 4) + '), business-day check,\n' +
  'add_business_days=N, to=DATE (business days between), yearend=none|gov|bank (12/29-1/3 or 12/31-1/3 closures). JSON out.\n' +
  'Free trial (date info only, no add/to): GET /api/jpdate/trial?date=...\n\n' +
  'Japanese postal code API: GET /api/zip?zip=100-0001 ($0.001 USDC via x402), or zips=a,b,c (up to 100 per call).\n' +
  'Returns prefecture/city/town in kanji, kana and romaji plus the JIS municipality code; accepts 〒, hyphens and full-width digits.\n' +
  'Data: Japan Post (' + ZIP_META.zip_codes + ' codes, updated ' + ZIP_META.data_updated + '). Free trial (prefecture + city only): GET /api/zip/trial?zip=...\n\n' +
  'Japanese bank transfer API: GET /api/bank?bank=0005&branch=新宿&name=株式会社サンプル&account=12345 ($0.001 USDC via x402).\n' +
  'Bank/branch code (全銀コード) or name to name/kana/romaji, plus 振込名義 conversion to zengin half-width kana (ｶ) ﾕ) (ﾄﾞ etc.) with invalid-character flags.\n' +
  'Data: zengin-code (MIT, ' + BANK_META.banks + ' banks, ' + BANK_META.branches + ' branches). Free trial (bank name only): GET /api/bank/trial?bank=0005\n\n' +
  'Japanese invoice number check (適格請求書発行事業者登録番号): GET /api/invoice?number=T1180301018771&name=トヨタ自動車 ($0.002 USDC via x402), or numbers=a,b,c&names=x,y,z (up to 10).\n' +
  'Format and check digit, then a live lookup on the National Tax Agency public site: registered name, registration date, address, revoked/expired flag, name match.\n' +
  'Free trial (format + check digit only): GET /api/invoice/trial?number=...\n'));
const ACCEPTS = [
  { scheme: 'exact', price: '$0.01', network: BASE, payTo: BASE_PAYTO },
  { scheme: 'exact', price: '$0.01', network: SOL, payTo: SOL_PAYTO },
];
const JD_ACCEPTS = ACCEPTS.map((a) => ({ ...a, price: '$0.001' }));
const JD_DESC = 'Japanese calendar: wareki (Reiwa/Heisei/Showa) to/from Gregorian, Japanese national holidays, business-day check, add N business days, business days between two dates';
const JD_OUT = { date: '2026-11-03', weekday: '火', wareki: { era: '令和', year: 8, text: '令和8年11月3日', short: 'R8.11.3' }, holiday: '文化の日', business_day: false };
const jd = (q, r, trial) => { try { const p = { ...q.query }; if (trial) { delete p.add_business_days; delete p.to; } const o = jpdate(p); if (trial) o.note = 'Free trial: add_business_days and to need the paid route GET /api/jpdate ($0.001 USDC via x402).'; r.json(o); } catch (e) { r.status(400).json({ error: e.message }); } };
app.get('/api/jpdate/trial', (q, r) => jd(q, r, true));
const ZP_DESC = 'Japanese postal code (郵便番号) to address: prefecture, city, town in kanji, kana and romaji, JIS code; batch up to 100';
const ZP_OUT = { zip: '100-0001', found: true, results: [{ prefecture: '東京都', city: '千代田区', town: '千代田', address: '東京都千代田区千代田', kana: { prefecture: 'トウキョウト', city: 'チヨダク', town: 'チヨダ' }, romaji: { prefecture: 'TOKYO TO', city: 'CHIYODA KU', town: 'CHIYODA' }, jis_code: '13101' }] };
const zp = (q, r, trial) => { try { const o = zipLookup(q.query, trial); if (trial) o.note = 'Free trial: town, kana, romaji, JIS code and batch need the paid route GET /api/zip ($0.001 USDC via x402).'; r.json(o); } catch (e) { r.status(400).json({ error: e.message }); } };
app.get('/api/zip/trial', (q, r) => zp(q, r, true));
const BK_DESC = 'Japanese bank transfer helper: bank/branch code (zengin) or name to kanji/kana/romaji, 振込名義 to zengin half-width kana with corporate abbreviations and invalid-character flags, account number check';
const BK_OUT = { bank: { code: '0005', name: '三菱ＵＦＪ', kana: 'ミツビシユ－エフジエイ' }, branch: { code: '341', name: '新宿', kana: 'シンジユク' }, account_name: { zengin_kana: 'ｶ)ｻﾝﾌﾟﾙ', valid: true }, account_number: { normalized: '0012345', valid: true } };
const bk = (q, r, trial) => { try { const o = bankLookup(q.query, trial); if (trial) o.note = 'Free trial: branch, kana, 振込名義 conversion and account check need the paid route GET /api/bank ($0.001 USDC via x402).'; r.json(o); } catch (e) { r.status(400).json({ error: e.message }); } };
app.get('/api/bank/trial', (q, r) => bk(q, r, true));
const IV_ACCEPTS = ACCEPTS.map((a) => ({ ...a, price: '$0.002' }));
const IV_DESC = 'Japanese qualified invoice issuer number (インボイス登録番号 T+13 digits): format and check digit, live National Tax Agency lookup of registered name, date, address, revoked/expired status and name match; batch up to 10';
const IV_OUT = { number: 'T1180301018771', format_ok: true, check_digit_ok: true, nta: { found: true, name: 'トヨタ自動車株式会社', registered: '令和5年10月1日', revoked: '' }, registered_now: true, name_match: true, valid: true };
const iv = async (q, r, trial) => { try { const o = await invoiceCheck(q.query, trial); if (trial) o.note = 'Free trial: the live NTA lookup (name, date, revoked status, name match) and batch need the paid route GET /api/invoice ($0.002 USDC via x402).'; r.json(o); } catch (e) { r.status(400).json({ error: e.message }); } };
app.get('/api/invoice/trial', (q, r) => iv(q, r, true));
const DESC = 'Check a JA/ZH localization CSV (key,source,target) for placeholder, blank, untranslated and CJK punctuation errors';
const SAMPLE = 'key,source,target\nmenu.start,Start {name},スタート\n';
const OUT = '# Localization check\n- menu.start: placeholder {name} missing in target\n';
app.get('/favicon.ico', (_q, r) => r.sendFile(new URL('./favicon.ico', import.meta.url).pathname));
app.get('/openapi.json', (_q, r) => r.json({
  openapi: '3.0.3',
  info: { title: 'JA/ZH localization check + Japanese calendar, postal code and bank code APIs (x402)', version: '1.0.0', description: DESC, contact: { name: 'Shinji Nakasaki', email: 'shinji-work@mail.grokbot.com' } },
  servers: [{ url: 'https://x402-jp-loccheck.onrender.com' }],
  paths: {
    '/api/jpdate': {
      get: { summary: JD_DESC, 'x-payment-info': { protocol: 'x402', price: '0.001', currency: 'USDC', networks: [BASE, SOL] },
        parameters: [{ name: 'date', in: 'query', required: true, schema: { type: 'string' }, example: '令和8年11月3日' },
          { name: 'add_business_days', in: 'query', schema: { type: 'integer' } }, { name: 'to', in: 'query', schema: { type: 'string' } },
          { name: 'yearend', in: 'query', schema: { type: 'string', enum: ['none', 'gov', 'bank'] } }],
        responses: { '200': { description: 'JSON day info', content: { 'application/json': { example: JD_OUT } } }, '402': { description: 'Payment Required (x402, $0.001 USDC)' } } },
    },
    '/api/zip': {
      get: { summary: ZP_DESC, 'x-payment-info': { protocol: 'x402', price: '0.001', currency: 'USDC', networks: [BASE, SOL] },
        parameters: [{ name: 'zip', in: 'query', schema: { type: 'string' }, example: '100-0001' }, { name: 'zips', in: 'query', schema: { type: 'string' }, description: 'comma-separated, up to 100' }],
        responses: { '200': { description: 'JSON address', content: { 'application/json': { example: ZP_OUT } } }, '402': { description: 'Payment Required (x402, $0.001 USDC)' } } },
    },
    '/api/bank': {
      get: { summary: BK_DESC, 'x-payment-info': { protocol: 'x402', price: '0.001', currency: 'USDC', networks: [BASE, SOL] },
        parameters: [{ name: 'bank', in: 'query', schema: { type: 'string' }, example: '0005' }, { name: 'branch', in: 'query', schema: { type: 'string' }, example: '341' },
          { name: 'name', in: 'query', schema: { type: 'string' }, description: '振込名義 (account holder) to convert' }, { name: 'account', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: 'JSON', content: { 'application/json': { example: BK_OUT } } }, '402': { description: 'Payment Required (x402, $0.001 USDC)' } } },
    },
    '/api/invoice': { get: { summary: 'Japanese invoice registration number (T+13) check with live NTA lookup, $0.002 via x402', parameters: [{ name: 'number', in: 'query', schema: { type: 'string' } }, { name: 'name', in: 'query', schema: { type: 'string' } }, { name: 'numbers', in: 'query', schema: { type: 'string' } }, { name: 'names', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'JSON' }, '402': { description: 'Payment required' } } } },
    '/api/invoice/trial': { get: { summary: 'Free trial: format and check digit for one number', parameters: [{ name: 'number', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'JSON' } } } },
    '/api/bank/trial': { get: { summary: 'Free trial: bank name for one bank code', parameters: [{ name: 'bank', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'JSON' } } } },
    '/api/zip/trial': { get: { summary: 'Free trial: prefecture and city for one postal code', parameters: [{ name: 'zip', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'JSON' } } } },
    '/api/jpdate/trial': { get: { summary: 'Free trial: day info for one date (no add_business_days / to)', parameters: [{ name: 'date', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'JSON day info' } } } },
    '/api/loccheck/trial': {
      post: { summary: 'Free trial: same check on the first 5 rows only (no payment)', requestBody: { required: true, content: { 'text/csv': { schema: { type: 'string' }, example: SAMPLE } } },
        responses: { '200': { description: 'Markdown report (first 5 rows)' } } },
    },
    '/api/loccheck': {
      post: { summary: DESC, 'x-payment-info': { protocol: 'x402', price: '0.01', currency: 'USDC', networks: [BASE, SOL] },
        requestBody: { required: true, content: { 'text/csv': { schema: { type: 'string' }, example: SAMPLE } } },
        responses: { '200': { description: 'Markdown report', content: { 'text/markdown': { schema: { type: 'string' } } } }, '402': { description: 'Payment Required (x402, $0.01 USDC)' } } },
      get: { summary: DESC + ' (CSV in the csv query parameter)', 'x-payment-info': { protocol: 'x402', price: '0.01', currency: 'USDC', networks: [BASE, SOL] },
        parameters: [{ name: 'csv', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Markdown report' }, '402': { description: 'Payment Required (x402, $0.01 USDC)' } } },
    },
  },
}));
// Free trial: checks only the header + first 5 rows, so buyer agents can verify the service before paying.
const trial = (csv) => (csv || '').split(/\r?\n/).slice(0, 6).join('\n') + '\n';
const TRIAL_NOTE = '\n\n_Free trial: only the first 5 rows were checked. Full table: POST /api/loccheck ($0.01 USDC via x402)._\n';
const runTrial = (csv, r) => run(trial(csv), r, TRIAL_NOTE);
app.post('/api/loccheck/trial', (q, r) => runTrial(typeof q.body === 'string' ? q.body : '', r));
app.get('/api/loccheck/trial', (q, r) => runTrial(String(q.query.csv || ''), r));
// Mirror the v2 PAYMENT-REQUIRED header into the 402 JSON body so v1-style indexers (x402dash etc.) see `accepts`.
app.use((_q, r, next) => {
  const end = r.end.bind(r);
  r.end = (chunk, ...rest) => {
    const h = r.statusCode === 402 && r.getHeader('PAYMENT-REQUIRED');
    const body = chunk ? chunk.toString() : '';
    if (h && (!body || body === '{}')) {
      try { const j = Buffer.from(String(h), 'base64').toString('utf8'); r.setHeader('Content-Length', Buffer.byteLength(j)); return end(j, ...rest.filter(x => typeof x === 'function')); } catch {}
    }
    return end(chunk, ...rest);
  };
  next();
});
app.use(paymentMiddleware({
  'POST /api/loccheck': {
    accepts: ACCEPTS, description: DESC, mimeType: 'text/markdown',
    extensions: declareDiscoveryExtension({ bodyType: 'text', input: { csv: SAMPLE }, output: { example: { report: OUT } } }),
  },
  'GET /api/loccheck': {
    accepts: ACCEPTS, description: DESC + ' (csv query parameter)', mimeType: 'text/markdown',
    extensions: declareDiscoveryExtension({ input: { csv: SAMPLE }, inputSchema: { properties: { csv: { type: 'string' } }, required: ['csv'] }, output: { example: { report: OUT } } }),
  },
  'GET /api/jpdate': {
    accepts: JD_ACCEPTS, description: JD_DESC, mimeType: 'application/json',
    extensions: declareDiscoveryExtension({ input: { date: '2026-11-03', add_business_days: 3 }, inputSchema: { properties: { date: { type: 'string' }, add_business_days: { type: 'integer' }, to: { type: 'string' }, yearend: { type: 'string' } }, required: ['date'] }, output: { example: JD_OUT } }),
  },
  'GET /api/zip': {
    accepts: JD_ACCEPTS, description: ZP_DESC, mimeType: 'application/json',
    extensions: declareDiscoveryExtension({ input: { zip: '100-0001' }, inputSchema: { properties: { zip: { type: 'string' }, zips: { type: 'string' } } }, output: { example: ZP_OUT } }),
  },
  'GET /api/invoice': {
    accepts: IV_ACCEPTS, description: IV_DESC, mimeType: 'application/json',
    extensions: declareDiscoveryExtension({ input: { number: 'T1180301018771', name: 'トヨタ自動車' }, inputSchema: { properties: { number: { type: 'string' }, name: { type: 'string' }, numbers: { type: 'string' }, names: { type: 'string' } } }, output: { example: IV_OUT } }),
  },
  'GET /api/bank': {
    accepts: JD_ACCEPTS, description: BK_DESC, mimeType: 'application/json',
    extensions: declareDiscoveryExtension({ input: { bank: '0005', branch: '341', name: '株式会社サンプル' }, inputSchema: { properties: { bank: { type: 'string' }, branch: { type: 'string' }, name: { type: 'string' }, account: { type: 'string' } } }, output: { example: BK_OUT } }),
  },
}, server));
app.get('/api/jpdate', (q, r) => jd(q, r, false));
app.get('/api/zip', (q, r) => zp(q, r, false));
app.get('/api/bank', (q, r) => bk(q, r, false));
app.get('/api/invoice', (q, r) => iv(q, r, false));
const run = (csv, r, note = '') => {
  const d = mkdtempSync(join(tmpdir(), 'lc-')); const f = join(d, 'in.csv');
  writeFileSync(f, csv || '');
  try { r.type('text/markdown').send(execFileSync('python3', [LOCCHECK, '--aso', f], { timeout: 10000 }).toString().replace(f, 'input.csv') + note); }
  catch (e) { r.status(400).send('Could not parse CSV: expected header key,source,target'); }
};
app.post('/api/loccheck', (q, r) => run(typeof q.body === 'string' ? q.body : '', r));
app.get('/api/loccheck', (q, r) => run(String(q.query.csv || ''), r));
app.listen(process.env.PORT || 4021, () => console.log('listening', process.env.PORT || 4021));
