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

const BASE_PAYTO = '0x4C4860b980a3AE0c91aa69e8eff48009C5469fEe';
const SOL_PAYTO = '8BwJ9oHnwfiQgAMrR6fbBX4e1EcELGaeyiRAeP21sLbo';
const BASE = 'eip155:8453', SOL = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const LOCCHECK = process.env.LOCCHECK || new URL('./loccheck.py', import.meta.url).pathname;

const facilitator = new HTTPFacilitatorClient({ url: process.env.FACILITATOR || 'https://facilitator.opencovenant.org' });
const server = new x402ResourceServer(facilitator).register(BASE, new ExactEvmScheme()).register(SOL, new ExactSvmScheme()).registerExtension(bazaarResourceServerExtension);

const app = express();
app.set('trust proxy', true);
app.use(express.text({ type: '*/*', limit: '512kb' }));
app.get('/', (_q, r) => r.type('text/plain').send(
  'Japanese/Chinese localization check for game/app string tables.\n' +
  'POST /api/loccheck with a UTF-8 CSV (columns key,source,target). $0.01 USDC via x402 (Base or Solana).\n' +
  'Flags blank/untranslated targets, placeholder mismatches, duplicate keys, half-width punctuation, "..." vs "…", leftover English.\n'));
const ACCEPTS = [
  { scheme: 'exact', price: '$0.01', network: BASE, payTo: BASE_PAYTO },
  { scheme: 'exact', price: '$0.01', network: SOL, payTo: SOL_PAYTO },
];
const DESC = 'Check a JA/ZH localization CSV (key,source,target) for placeholder, blank, untranslated and CJK punctuation errors';
const SAMPLE = 'key,source,target\nmenu.start,Start {name},スタート\n';
const OUT = '# Localization check\n- menu.start: placeholder {name} missing in target\n';
app.get('/openapi.json', (_q, r) => r.json({
  openapi: '3.0.3',
  info: { title: 'JA/ZH localization check (x402)', version: '1.0.0', description: DESC },
  servers: [{ url: 'https://x402-jp-loccheck.onrender.com' }],
  paths: {
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
}, server));
const run = (csv, r) => {
  const d = mkdtempSync(join(tmpdir(), 'lc-')); const f = join(d, 'in.csv');
  writeFileSync(f, csv || '');
  try { r.type('text/markdown').send(execFileSync('python3', [LOCCHECK, '--aso', f], { timeout: 10000 }).toString()); }
  catch (e) { r.status(400).send('Could not parse CSV: expected header key,source,target'); }
};
app.post('/api/loccheck', (q, r) => run(typeof q.body === 'string' ? q.body : '', r));
app.get('/api/loccheck', (q, r) => run(String(q.query.csv || ''), r));
app.listen(process.env.PORT || 4021, () => console.log('listening', process.env.PORT || 4021));
