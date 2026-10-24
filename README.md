# JA/ZH localization check (x402 pay-per-call)

`POST /api/loccheck` with a UTF-8 CSV string table (`key,source,target`). Returns a Markdown report flagging blank or untranslated targets, placeholder mismatches (`{name}`, `%s`, `<tags>`, `\n`), duplicate keys, half-width punctuation in Japanese/Chinese text, `...` instead of `…`, and leftover English words.

Price: $0.01 USDC per call over [x402](https://x402.org), on Base or Solana. Any x402 v2 client or agent wallet can pay; no account or API key.

Run locally: `npm install && node server.mjs` (port 4021).
