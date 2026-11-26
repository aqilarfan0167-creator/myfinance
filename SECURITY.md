# Security

MyFinance holds personal financial data. It is **local-first**: without cloud sync, nothing leaves the device.

## Threat model
| Threat | Examples | Main controls |
|---|---|---|
| Malicious or broken files | crafted receipt image/PDF/HEIC, zip-bomb backup, hostile CSV | type/size validation (20 MB files, 10 MB CSV); OCR/PDF run in workers; PDF.js with `isEvalSupported:false`; ZIP limits checked **before** decompression (100 MB/entry, 2 GB total, 20 000 entries, whitelisted paths); SHA-256 checksums; per-record schema validation before anything is stored; restore is previewed and atomic with a safety snapshot |
| Script injection (XSS) | merchant name or OCR text containing HTML | React escaping (no `dangerouslySetInnerHTML`; the two `innerHTML` uses are static/escaped); strict CSP without `unsafe-inline` scripts or `unsafe-eval`; stored navigation links sanitised (`safeLink`) |
| Spreadsheet formula injection | `=HYPERLINK(...)` in a merchant name | CSV cells starting with `= + - @` are prefixed with `'`; XLSX cells are written as inline strings, never formulas |
| Other users of the same Supabase project | reading or overwriting someone else's data | Row Level Security on `sync_records` (select/insert/update own rows only, **no delete**); RPC `sync_push` runs as the caller and stamps `auth.uid()`; storage policy limits each user to `<user-id>/…` in a **private** bucket; anon role has no access — 20 SQL checks in `supabase/tests/security_test.sql` |
| Stale/clock-skewed devices | old phone overwrites new edits | server-side last-writer-wins guard; timestamps > 1 day in the future rejected; monotonic server cursor for pulls |
| Secret leakage | service-role key in the frontend | only the anon/publishable key is accepted (service-role JWTs and `sb_secret_` keys are rejected in the UI); no secrets in the repo (`.env` is git-ignored) |
| Mixing accounts on one device | partner signs in on the same laptop | each device is bound to one account; switching requires a backup and clears local data |
| Data loss on update | schema change breaks old data | additive-only migrations; raw pre-upgrade snapshot taken **before** the database opens; versionchange handling across tabs |
| Supply chain | vulnerable dependency | `npm audit --omit=dev`: **0 vulnerabilities** (Nov 2026); exact versions in `package-lock.json`; OCR models self-hosted (no CDN at runtime) |
| Clickjacking / sniffing | framing the app | `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, HSTS, `Permissions-Policy` (camera only) — `public/_headers`, `vercel.json` |

## Content Security Policy
Set via `<meta>` in `index.html` (works on any static host):
`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob: data: https:; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'self'`

The HEIC converter (heic2any) needs `eval`. Instead of weakening the app's CSP it runs in a **sandboxed iframe** (`sandbox="allow-scripts"`, opaque origin, its own CSP), which cannot read the app's storage, cookies or DOM. It only receives a Blob and returns a JPEG; responses are checked (source window, request id, MIME type) and time out after 45 s.

## Accepted risks / limitations
- **Data at rest on the device is not encrypted by the app** (IndexedDB is protected by the OS user account and browser profile). Use a device lock; download backups to a safe place.
- **Cloud data is not end-to-end encrypted**: whoever controls the Supabase project can read it. Use your own project.
- Supabase session tokens are stored in `localStorage` (library default). XSS is mitigated by the CSP above.
- `style-src 'unsafe-inline'` (React/Recharts inline styles) and `connect-src https:` (to allow any self-hosted/custom-domain Supabase URL). Tighten `connect-src` to your project URL if you build with a fixed one.
- Dev-only advisories in Vite ≤6 (dev-server path traversal) and Vitest ≤4 (UI server) need major upgrades not yet supported by `vite-plugin-pwa`. They do not affect the built app. Don't run `npm run dev -- --host` on untrusted networks or the Vitest UI.
- Notifications are local and only while the app is open; there is no push server.

## Reporting
Please report vulnerabilities privately to the project owner rather than in a public issue.
