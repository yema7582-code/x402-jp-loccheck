# JA/ZH localization check (x402 pay-per-call)

`POST /api/loccheck` with a UTF-8 CSV string table (`key,source,target`). Returns a Markdown report flagging blank or untranslated targets, placeholder mismatches (`{name}`, `%s`, `<tags>`, `\n`), duplicate keys, half-width punctuation in Japanese/Chinese text, `...` instead of `…`, and leftover English words.

Free trial (first 5 rows, no payment): `POST /api/loccheck/trial`.

Price: $0.01 USDC per call over [x402](https://x402.org), on Base or Solana. Any x402 v2 client or agent wallet can pay; no account or API key.

Run locally: `npm install && node server.mjs` (port 4021).

## App Store / Google Play listing checks

Rows whose key ends in a store field (`name`, `subtitle`, `keywords`, `promotional_text`, `description`, `whats_new`, `short_description`, `full_description`, e.g. `ios.keywords`) are also checked against the store character limits (name/subtitle 30, keywords 100, promo text 170, Play short description 80, descriptions 4000). The keywords field is checked for spaces after commas, duplicate keywords, and keywords that already appear in the name or subtitle (Apple indexes those, so repeating them wastes the 100 characters). CLI: `python3 loccheck.py --aso listing.csv`.

## Japanese calendar API ($0.001 per call)
`GET /api/jpdate?date=令和8年11月3日&add_business_days=3&to=2026-12-01&yearend=gov`

- 和暦⇄西暦: accepts `2026-11-03`, `2026/11/3`, `20261103`, `令和8年11月3日`, `令和元年5月1日`, `R8.11.3`, full-width digits
- National holidays from the Cabinet Office list (`holidays.json`, 1955–2027, incl. 振替休日 / 国民の休日)
- `business_day`, `add_business_days=N` (±1000), `to=DATE` (business days between, start exclusive, end inclusive)
- `yearend=gov` (12/29–1/3 closed) or `bank` (12/31–1/3 closed)
- Free trial without payment: `GET /api/jpdate/trial?date=...` (day info only)

## Japanese postal code API

`GET /api/zip?zip=100-0001` ($0.001 USDC via x402, Base or Solana) or `zips=1000001,5300001,...` (up to 100 per call).
Returns prefecture, city and town in kanji, kana and romaji, the full address string and the JIS municipality code.
Input may include 〒, hyphens or full-width digits. Codes shared by several towns return every match (`multiple: true`).
Data: Japan Post `utf_ken_all.zip` (2026-10-30 update, 120,721 codes) plus `KEN_ALL_ROME` for romaji; every response carries the data date.
Free trial: `GET /api/zip/trial?zip=...` (prefecture + city only).

## Japanese bank transfer API

`GET /api/bank?bank=0005&branch=341&name=株式会社サンプル&account=12345`, $0.001 USDC via x402 (Base or Solana).

- `bank`: 4-digit zengin bank code or bank name (三菱UFJ, 楽天, ゆうちょ…)
- `branch`: 3-digit branch code or branch name
- `name`: account holder (振込名義) converted to zengin half-width kana, with 株式会社/有限会社/合同会社 etc. abbreviated (ｶ) / (ｶ), small kana enlarged, ー to -, and kanji or other disallowed characters flagged
- `account`: account number check, zero-padded to 7 digits

Free trial: `GET /api/bank/trial?bank=0005` (bank name only). Data: [zengin-code](https://github.com/zengin-code/source-data) (MIT), 1,146 banks and 28,944 branches.
