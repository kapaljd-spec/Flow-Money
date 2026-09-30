# FlowMoney

FlowMoney is a personal finance application for tracking wallets, transactions, budgets, goals, and spending patterns. The current UI is a vanilla JavaScript static app with local persistence. This repository is being evolved toward one API-first backend shared by web, Telegram Bot, Telegram Mini App, mobile, and future AI tools.

## Architecture

- Existing UI: `index.html`, `script.js`, and `styles.css`
- Shared foundation: `src/utils`, `src/services`, and `src/repositories`
- Database migrations: `supabase/migrations`
- Architecture: [docs/architecture.md](docs/architecture.md)
- API contract: [docs/api.md](docs/api.md)
- Assessment: [docs/architecture-assessment.md](docs/architecture-assessment.md)

The browser currently uses local storage so existing data is not lost. The API client and API repository define the migration boundary; a production server must own authentication, validation, ownership checks, calculations, audit logging, and Telegram verification.

## Local Development

```bash
npm install
npm start
```

Open the URL printed by `npm start`. The current application works without a backend and stores demo data in the browser.

Run foundation tests:

```bash
npm test
```

## Environment

Copy `.env.example` to `.env` and provide values appropriate to the environment. `VITE_` values are client-visible. Supabase service keys, Telegram bot tokens, webhook secrets, and session secrets are server-only and must never be placed in frontend code.

## Firebase setup

This project is configured to use the Firebase project `flow-moneys` for authentication and Firestore.

1. Create or open the Firebase project `flow-moneys` in the Firebase console.
2. Register a web app in the project.
3. Copy the Web SDK configuration values into the app runtime using either:
   - `VITE_FIREBASE_*` environment variables, or
   - a browser config object loaded before Firebase initialization.
4. Enable Email/Password sign-in in Authentication > Sign-in method.
5. Create the Firestore database in native mode and add the app to the project.

For a static Cloudflare Pages deployment, copy `firebase-config.example.js` to
`firebase-config.js`, replace its placeholder values with the Firebase Web App
configuration, and deploy that file with `index.html`. The file contains client
configuration only; never put service-account keys or Telegram bot tokens in it.

The Firebase web SDK is initialized from [src/firebase.js](src/firebase.js) and the auth helpers are in [src/services/firebaseAuth.js](src/services/firebaseAuth.js).

## Database

The Supabase migrations define user identities, Telegram accounts, sessions, audit logs, wallets, categories, transactions, transfers, budgets, goals, goal contributions, and settings. Apply them with the Supabase CLI or dashboard in filename order. Row-level security scopes data to the authenticated user.

## Telegram

The shared Telegram adapter parses `/start`, `/help`, `/balance`, `/summary`, `/transactions`, `/add`, and `/settings`. The Firebase HTTP Function in [functions/index.js](functions/index.js) now handles `/start`, `/balance`, expense parsing such as `makan 45rb`, and confirmation before inserting a transaction into Supabase.

Deploy the webhook with server-only secrets. Replace each placeholder interactively; never paste a bot token into source control:

```bash
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
firebase functions:secrets:set SUPABASE_URL
firebase functions:secrets:set SUPABASE_SERVICE_ROLE_KEY
firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET
firebase deploy --only functions:telegramWebhook
```

After deployment, register the HTTPS function URL with Telegram using the Bot API and the same webhook secret. The confirmation cache currently lives in function memory with a ten-minute TTL; move it to Supabase or Firestore before running multiple function instances. Mini App `initData` must be validated server-side with the bot token; `initDataUnsafe` is not trusted.

## Deployment

The existing frontend can remain on Cloudflare Pages. Deploy the API as a separate server or Worker only after wiring it to the Supabase migrations and server-only environment variables. Configure CORS to the approved FlowMoney and Telegram origins, protect the Telegram webhook with its secret token, and never use `Access-Control-Allow-Origin: *` for authenticated production requests.

## Future AI

AI will use controlled finance tools such as `get_balance`, `get_monthly_summary`, `get_category_spending`, and `create_transaction`. It will not receive database credentials or execute raw SQL.