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

const BASE_PAYTO = '0x4C4860b980a3AE0c91aa69e8eff48009C5469fEe';
const SOL_PAYTO = '8BwJ9oHnwfiQgAMrR6fbBX4e1EcELGaeyiRAeP21sLbo';
const BASE = 'eip155:8453', SOL = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const LOCCHECK = process.env.LOCCHECK || new URL('./loccheck.py', import.meta.url).pathname;

const facilitator = new HTTPFacilitatorClient({ url: process.env.FACILITATOR || 'https://facilitator.opencovenant.org' });
const server = new x402ResourceServer(facilitator).register(BASE, new ExactEvmScheme()).register(SOL, new ExactSvmScheme());

const app = express();
app.use(express.text({ type: '*/*', limit: '512kb' }));
app.get('/', (_q, r) => r.type('text/plain').send(
  'Japanese/Chinese localization check for game/app string tables.\n' +
  'POST /api/loccheck with a UTF-8 CSV (columns key,source,target). $0.01 USDC via x402 (Base or Solana).\n' +
  'Flags blank/untranslated targets, placeholder mismatches, duplicate keys, half-width punctuation, "..." vs "…", leftover English.\n'));
app.use(paymentMiddleware({
  'POST /api/loccheck': {
    accepts: [
      { scheme: 'exact', price: '$0.01', network: BASE, payTo: BASE_PAYTO },
      { scheme: 'exact', price: '$0.01', network: SOL, payTo: SOL_PAYTO },
    ],
    description: 'Check a JA/ZH localization CSV (key,source,target) for placeholder, blank, untranslated and CJK punctuation errors',
    mimeType: 'text/markdown',
  },
}, server));
app.post('/api/loccheck', (q, r) => {
  const d = mkdtempSync(join(tmpdir(), 'lc-')); const f = join(d, 'in.csv');
  writeFileSync(f, q.body || '');
  try { r.type('text/markdown').send(execFileSync('python3', [LOCCHECK, '--aso', f], { timeout: 10000 }).toString()); }
  catch (e) { r.status(400).send('Could not parse CSV: expected header key,source,target'); }
});
app.listen(process.env.PORT || 4021, () => console.log('listening', process.env.PORT || 4021));
