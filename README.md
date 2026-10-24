# JA/ZH localization check (x402 pay-per-call)

`POST /api/loccheck` with a UTF-8 CSV string table (`key,source,target`). Returns a Markdown report flagging blank or untranslated targets, placeholder mismatches (`{name}`, `%s`, `<tags>`, `\n`), duplicate keys, half-width punctuation in Japanese/Chinese text, `...` instead of `…`, and leftover English words.

Price: $0.01 USDC per call over [x402](https://x402.org), on Base or Solana. Any x402 v2 client or agent wallet can pay; no account or API key.

Run locally: `npm install && node server.mjs` (port 4021).

## App Store / Google Play listing checks

Rows whose key ends in a store field (`name`, `subtitle`, `keywords`, `promotional_text`, `description`, `whats_new`, `short_description`, `full_description`, e.g. `ios.keywords`) are also checked against the store character limits (name/subtitle 30, keywords 100, promo text 170, Play short description 80, descriptions 4000). The keywords field is checked for spaces after commas, duplicate keywords, and keywords that already appear in the name or subtitle (Apple indexes those, so repeating them wastes the 100 characters). CLI: `python3 loccheck.py --aso listing.csv`.
