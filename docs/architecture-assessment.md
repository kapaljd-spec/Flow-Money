# FlowMoney Architecture Assessment

Date: 2026-09-15

## Current State

- **Application:** vanilla JavaScript single-page application rendered from `script.js`; no React router or component framework.
- **Package manager:** npm, with only `servor` as a runtime development dependency.
- **UI:** existing HTML string renderer and `styles.css`, with a coherent dashboard, transactions, wallets, budgets, goals, analytics, insights, and settings experience. This is the visual source of truth and should remain intact.
- **State and persistence:** one in-memory state object plus `localStorage` under `flowmoney-data-v1`. CRUD, calculations, rendering, and event handling are tightly coupled in `script.js`.
- **Backend/API:** none. The frontend does not call a backend and has no authentication boundary.
- **Database:** Supabase migrations exist and already cover users, identities, Telegram accounts, sessions, audit logs, categories, wallets, transactions, transfers, budgets, goals, goal contributions, and user settings. They are not connected to the current frontend.
- **Shared source modules:** `src/config`, `src/types`, and `src/utils` contain an early modularization attempt, but the browser entry point does not import them. The finance utility also expects normalized server shapes that differ from the local-storage shape.
- **Deployment:** the project is currently a static site suitable for Cloudflare Pages or another static host. No Worker, Supabase client, server route, or deployment configuration is present in this repository.
- **Environment:** `.env` contains a Supabase URL and anon key. There is no checked-in `.env.example`; secrets and client-safe configuration are not yet clearly separated.

## Reuse

- Preserve the current visual design, navigation, page composition, and chart-like dashboard presentation.
- Keep local storage during migration so existing browser data is not silently lost.
- Reuse the existing Supabase migrations as the starting database contract, after correcting gaps and validating them against the chosen backend boundary.
- Reuse the existing format and icon utilities, moving behavior gradually out of the monolithic script.

## Refactor

- Introduce a repository boundary so the UI can use a local repository today and an API repository later.
- Normalize local records into the shared financial types, including separate transfer records and soft-delete semantics.
- Make the finance calculation engine the only place for balance, cashflow, budget, and analytics formulas.
- Add a centralized API client with `/api/v1` response and error conventions.
- Add platform and authentication adapters so web, Telegram bot, and Telegram Mini App resolve to the same user context.

## Replace or Add

- Replace direct persistence calls in new code with repository methods; migrate the existing UI incrementally rather than rewriting it.
- Add a server-side API and service layer. A static Pages deployment alone cannot safely validate sessions, Telegram init data, webhook secrets, or ownership.
- Add server-side Telegram validation and a thin command/webhook adapter.
- Add tests for financial formulas, validation, ownership, and Telegram identity linking.
- Add `.env.example`, API documentation, architecture documentation, migration instructions, and deployment instructions.

## Risks and Decisions

1. **Supabase vs Cloudflare D1:** the repository already has Supabase-specific SQL and RLS, so Supabase is the smallest compatible backend for this foundation. A Cloudflare Worker can still host an API facade later, but a D1 migration should not be started without a deployment requirement.
2. **Legacy transfer shape:** the UI currently stores transfers inside `transactions`; the database migration correctly separates them. The repository layer must translate between these shapes during migration.
3. **Authentication:** the current UI has no user identity. Local mode must remain available until an authentication and upload flow exists.
4. **Production safety:** the existing anon key is client-safe only when RLS is correct. No service-role key or Telegram bot token may enter frontend code.

## Recommended Incremental Path

1. Establish shared types, validation, calculations, platform detection, and repository interfaces.
2. Preserve the UI while routing future local operations through the local repository.
3. Add authenticated Supabase/API persistence and an explicit local-data migration flow.
4. Add `/api/v1` services for transactions, wallets, dashboard, budgets, goals, and analytics.
5. Add Telegram webhook and Mini App authentication adapters that call the same services.
