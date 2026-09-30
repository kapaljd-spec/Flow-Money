# FlowMoney Dashboard

The standalone dashboard lives at `/dashboard/` and keeps its local records separate from the existing landing page. `index.html` is the visual shell, `app.js` owns menu/actions, and the repository/services in `src/` own data and calculations. It uses vanilla HTML, CSS, and ES modules with no charting or UI library.

## Run locally

Install the existing npm dependencies and start the static server:

```sh
npm install
npm start
```

Open the Dashboard URL printed by `npm start`. A static HTTP server is required because the dashboard uses ES modules. The default `runtime-config.js` selects local storage, so Firebase sign-in and an API are not needed.

Run the automated checks with:

```sh
npm test
```

The suite covers quick-entry parsing, wallet/category/daily/monthly calculations, streaks, holdings P&L, goal progress, budget thresholds, v1/v2 migrations, LocalRepository CRUD/import/export/reset/fallback, Firebase REST token refresh, manual price updates, and authenticated API request headers.

## Data model

Local data is stored under `flowmoney.dashboard.v1` in `localStorage`. If browser storage is blocked or full, the dashboard warns and continues in memory for the current page session. The dashboard does not read or alter the existing app's `flowmoney-data-v1` records.

All money amounts are positive safe integers in rupiah; only crypto/share quantity may be fractional. Version 3 stores the profile name, wallets, canonical `tx` records (`type: "in" | "out"`, `wallet`, `cat`), budgets, goals, and assets. A wallet balance is its opening balance plus all income minus all expenses, across every month. The default v3 budget map is `{ category: limit }`; older month-scoped maps remain readable and retain their month values.

When the dashboard finds a valid version 1 or 2 snapshot, it upgrades it to version 3 under the same `flowmoney.dashboard.v1` key. Missing `name`, `goals`, `assets`, and `budgets` fields receive safe defaults; existing wallet and transaction records and budget maps are preserved.

The JSON export shape is:

```json
{
  "version": 3,
  "name": "Ayu",
  "wallets": [{ "id": "wallet-id", "name": "Tunai", "open": 250000 }],
  "tx": [{
    "id": "transaction-id",
    "type": "out",
    "amount": 45000,
    "wallet": "wallet-id",
    "cat": "Makan",
    "date": "2026-09-29",
    "note": "makan siang",
    "createdAt": "2026-09-29T08:00:00.000Z"
  }],
  "budgets": { "Makan": 1000000 },
  "goals": [{ "id": "goal-id", "name": "Dana darurat", "target": 5000000, "saved": 250000 }],
  "assets": [
    { "id": "asset-id", "kind": "aset", "name": "Emas 10 gram", "qty": 1, "buy": 9000000, "price": 11000000 },
    { "id": "holding-id", "kind": "crypto", "name": "BTC", "qty": 0.01, "buy": 900000000, "price": 1100000000 }
  ],
  "importedAccounts": []
}
```

Categories are persisted in Indonesian (`Makan`, `Transport`, `Belanja`, `Tagihan`, `Hiburan`, `Kesehatan`, `Gaji`, `Bonus`, and `Lainnya`) and translated to labels and emoji in the UI. Crypto/share `qty` may be fractional; every buy/current price and transaction amount is an integer. Imports validate wallet IDs, dates, integer prices/amounts, goals, budgets, and holdings before replacing current data. `Reset` restores the default local wallets and clears this dashboard only; it does not clear the landing-page application's storage. Sample data sets wallet balance to Rp12.500.000, current-month income to Rp7.000.000, expenses to Rp2.350.000, and net monthly change to Rp4.650.000, plus example assets and goals. The displayed net worth includes the sample holdings' current value.

## Runtime configuration and API

`runtime-config.js` is the public runtime feature flag. It defaults to:

```js
window.FLOWMONEY_RUNTIME_CONFIG = {
  USE_API: false,
  API_BASE_URL: ''
};
```

To opt in, set `USE_API: true` and set `API_BASE_URL` to the HTTPS base URL of a deployed FlowMoney API. `firebase-config.js` contains Firebase Web App client configuration only; `firebase-config.example.js` is the placeholder template. Enable Email/Password in Firebase Authentication. Do not put service account credentials, Supabase service-role keys, or Telegram bot tokens in either browser config file.

When API mode is selected, the dashboard shows Email/Password sign-in and sends each request with `Authorization: Bearer <Firebase ID token>`. Its dashboard-only auth adapter uses Firebase Identity Toolkit and Secure Token REST endpoints, persists the refresh token using the same guarded local storage, and refreshes ID tokens before expiry. This avoids loading an SDK script from a third-party CDN in the dashboard. The existing landing page's separate Firebase SDK integration is unchanged. If Firebase config cannot load or the first dashboard API request fails, the dashboard visibly returns to local mode. Once API mode has successfully loaded data, later request failures are shown as errors instead of silently splitting writes between local and remote stores.

The client API repository expects these routes:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/wallets` | List wallets with opening and current balances |
| `POST` | `/api/v1/wallets` | Create a wallet |
| `DELETE` | `/api/v1/wallets/:id` | Delete an empty wallet, unless it is the last one |
| `GET` / `PUT` | `/api/v1/profile` | Read or update the authenticated user's nickname |
| `GET` | `/api/v1/assets?kind=aset\|crypto\|saham` | List the user's active holdings |
| `POST` | `/api/v1/assets` | Create an asset or holding |
| `PUT` / `DELETE` | `/api/v1/assets/:id` | Update a manual price or delete a holding |
| `GET` | `/api/v1/transactions?month=YYYY-MM` | List transactions for the selected month |
| `POST` | `/api/v1/transactions` | Create an income or expense |
| `DELETE` | `/api/v1/transactions/:id` | Delete a transaction |
| `GET` | `/api/v1/budgets?month=YYYY-MM` | List category limits for the month |
| `PUT` / `DELETE` | `/api/v1/budgets?month=YYYY-MM[&category=...]` | Set or remove a category limit |
| `GET` | `/api/v1/goals` | List savings goals and contributed amounts |
| `POST` | `/api/v1/goals` | Create a goal |
| `POST` | `/api/v1/goals/:id/contributions` | Add savings to a goal |
| `DELETE` | `/api/v1/goals/:id` | Delete a goal |
| `GET` | `/api/v1/dashboard/export` | Export the authenticated account snapshot |
| `POST` | `/api/v1/dashboard/import` | Import a validated JSON snapshot |
| `POST` | `/api/v1/dashboard/import-local` | Import local records using an `Idempotency-Key` header |
| `DELETE` | `/api/v1/dashboard` | Reset the authenticated account dashboard |

Email/Password login is provided by Firebase REST Identity Toolkit and token refresh uses Secure Token REST. No Firebase SDK script is fetched from a CDN by the dashboard. The landing page retains its existing auth implementation independently.

The `import-local` handler must atomically deduplicate by idempotency key (the client key is stable per Firebase UID), validate the snapshot server-side, verify the Firebase token, derive the owner from the verified token, and scope every read/write to that owner. The API must never trust a user ID supplied in the body. The repository currently implements the authenticated client contract only; no dashboard Worker/API server is included in this repository. API mode is therefore not production-ready until these routes and ownership checks exist.

The additive Supabase `asset_holdings` migration is under `supbase/migrations/202609290001_create_asset_holdings.sql`; apply it after the existing user and financial migrations. It stores fractional quantity separately from integer IDR buy/current prices and applies owner-scoped RLS. The repository's current migration directory is named `supbase/migrations`; keep deployment tooling pointed at that existing location unless the directory itself is migrated separately.

Local mode does not make any Firebase network requests. API mode uses Firebase Authentication REST endpoints and requires a Firebase Web API key from `firebase-config.js`. Google Fonts is optional and falls back to `system-ui`.

## Deploy

### Cloudflare Pages

The source repository root is the static output directory; leave the build command empty for the dashboard folder route. Pages serves `dashboard/index.html` at `/dashboard/`; the dashboard links its shared modules with relative paths. Publish `runtime-config.js` and the Firebase client config with the site. The default is local-only; do not enable API mode until its Worker is deployed and secured.

### Firebase Hosting

`firebase.json` publishes `public/`, sets `cleanUrls: true` and `trailingSlash: false`, and runs `npm run build:hosting` before deploy. The staging script copies only the app, dashboard, parser, and required `src/` modules into `public/`.

```sh
npm install
npm run build:hosting
npx firebase-tools deploy --only hosting --project YOUR_FIREBASE_PROJECT_ID
```

The Hosting CLI must be authenticated with `npx firebase-tools login`. The Firebase project must have Email/Password enabled before API-mode sign-in is used.

## Manual verification checklist

- [ ] On a fresh local profile, choose **Muat data contoh**. Verify wallet balance Rp12.500.000, income Rp7.000.000, expense Rp2.350.000, monthly delta +Rp4.650.000, net worth includes holdings, the daily chart and category donut render, and five recent transactions appear.
- [ ] Enter `makan 45rb`, `kopi 25.000`, `gaji 5jt`, and `beli buku 1,5jt` in Catat cepat; verify category, type, selected wallet, integer amount, and Enter submission. Confirm input without nominal is rejected.
- [ ] Add a transaction from the full form and delete a recent transaction; verify dialog confirmation and recalculated balances.
- [ ] Add a wallet with an opening balance; verify the total. Confirm deleting the last wallet or one with transactions is blocked, then delete an empty extra wallet.
- [ ] Set a category budget, reach 80%, then exceed it; verify normal, amber warning, and red exceeded states. Change month and verify budgets remain associated with the selected month.
- [ ] Change the month selector and verify metrics, daily bars, category totals, and budgets update.
- [ ] Add Aset, Crypto, and Saham entries, update manual prices, check integer IDR P/L, then delete holdings.
- [ ] Fill a savings target to 100% and verify the progress color changes to green.
- [ ] Export JSON, import the valid file, then try malformed and invalid-schema files; invalid files must leave data untouched.
- [ ] Check all sidebar menus, the back link, the 1280px desktop window, 360px mobile sidebar, daily-bar tooltip amounts, keyboard focus, modal focus/Escape, and reduced-motion behavior.
- [ ] Confirm local-to-account import requires confirmation and repeated API requests with the same idempotency key do not duplicate records.
- [ ] Reset after confirmation and verify the default empty wallet and the sample-data action return.

## Reference comparison

The dashboard window preserves the updated inline reference: three-color titlebar, tilted desktop frame, green glow, dark red-gradient net-worth card, daily expense bars, category donut, and recent transactions. Functionality is split between `index.html`, `dashboard.css`, `app.js`, repositories/services, and shared Telegram parsing. Navigation exposes Dashboard, Transaksi, Aset, Crypto, Saham, Target, Pengaturan, Bantuan, and Keluar. The 3D tilt flattens below 1000px, on hover/focus, and under reduced motion. Destructive actions and data-entry dialogs use accessible `<dialog>` rather than browser prompts. Automated screenshot capture is not configured; use the manual 360px and 1280px checklist to compare the hosted page.