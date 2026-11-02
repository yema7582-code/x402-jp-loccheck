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
  'Free trial (date info only, no add/to): GET /api/jpdate/trial?date=...\n'));
const ACCEPTS = [
  { scheme: 'exact', price: '$0.01', network: BASE, payTo: BASE_PAYTO },
  { scheme: 'exact', price: '$0.01', network: SOL, payTo: SOL_PAYTO },
];
const JD_ACCEPTS = ACCEPTS.map((a) => ({ ...a, price: '$0.001' }));
const JD_DESC = 'Japanese calendar: wareki (Reiwa/Heisei/Showa) to/from Gregorian, Japanese national holidays, business-day check, add N business days, business days between two dates';
const JD_OUT = { date: '2026-11-03', weekday: '火', wareki: { era: '令和', year: 8, text: '令和8年11月3日', short: 'R8.11.3' }, holiday: '文化の日', business_day: false };
const jd = (q, r, trial) => { try { const p = { ...q.query }; if (trial) { delete p.add_business_days; delete p.to; } const o = jpdate(p); if (trial) o.note = 'Free trial: add_business_days and to need the paid route GET /api/jpdate ($0.001 USDC via x402).'; r.json(o); } catch (e) { r.status(400).json({ error: e.message }); } };
app.get('/api/jpdate/trial', (q, r) => jd(q, r, true));
const DESC = 'Check a JA/ZH localization CSV (key,source,target) for placeholder, blank, untranslated and CJK punctuation errors';
const SAMPLE = 'key,source,target\nmenu.start,Start {name},スタート\n';
const OUT = '# Localization check\n- menu.start: placeholder {name} missing in target\n';
app.get('/favicon.ico', (_q, r) => r.sendFile(new URL('./favicon.ico', import.meta.url).pathname));
app.get('/openapi.json', (_q, r) => r.json({
  openapi: '3.0.3',
  info: { title: 'JA/ZH localization check + Japanese calendar API (x402)', version: '1.0.0', description: DESC, contact: { name: 'Shinji Nakasaki', email: 'shinji-work@mail.grokbot.com' } },
  servers: [{ url: 'https://x402-jp-loccheck.onrender.com' }],
  paths: {
    '/api/jpdate': {
      get: { summary: JD_DESC, 'x-payment-info': { protocol: 'x402', price: '0.001', currency: 'USDC', networks: [BASE, SOL] },
        parameters: [{ name: 'date', in: 'query', required: true, schema: { type: 'string' }, example: '令和8年11月3日' },
          { name: 'add_business_days', in: 'query', schema: { type: 'integer' } }, { name: 'to', in: 'query', schema: { type: 'string' } },
          { name: 'yearend', in: 'query', schema: { type: 'string', enum: ['none', 'gov', 'bank'] } }],
        responses: { '200': { description: 'JSON day info', content: { 'application/json': { example: JD_OUT } } }, '402': { description: 'Payment Required (x402, $0.001 USDC)' } } },
    },
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
}, server));
app.get('/api/jpdate', (q, r) => jd(q, r, false));
const run = (csv, r, note = '') => {
  const d = mkdtempSync(join(tmpdir(), 'lc-')); const f = join(d, 'in.csv');
  writeFileSync(f, csv || '');
  try { r.type('text/markdown').send(execFileSync('python3', [LOCCHECK, '--aso', f], { timeout: 10000 }).toString().replace(f, 'input.csv') + note); }
  catch (e) { r.status(400).send('Could not parse CSV: expected header key,source,target'); }
};
app.post('/api/loccheck', (q, r) => run(typeof q.body === 'string' ? q.body : '', r));
app.get('/api/loccheck', (q, r) => run(String(q.query.csv || ''), r));
app.listen(process.env.PORT || 4021, () => console.log('listening', process.env.PORT || 4021));
