/*
# Create FlowMoney core user and identity tables

## What this migration does
Creates the foundational user management tables for FlowMoney's multi-platform architecture.
A FlowMoney user can authenticate via email, Telegram, or future providers (Google, Apple).
All financial data is scoped to a user_id, and every API endpoint validates ownership.

## New Tables

1. `users` — The core FlowMoney user profile
   - id (uuid PK, defaults to auth.uid() so Supabase auth users auto-link)
   - name (text, display name)
   - email (text, nullable — Telegram-only users may not have email)
   - avatar_url (text, nullable)
   - default_currency (text, default 'IDR')
   - timezone (text, default 'Asia/Jakarta')
   - created_at, updated_at (timestamptz)
   - deleted_at (timestamptz, nullable — soft delete)

2. `user_identities` — Provider-agnostic identity linking
   - id (uuid PK)
   - user_id (uuid FK -> users, ON DELETE CASCADE)
   - provider (text: 'email', 'telegram', 'google', 'apple', etc.)
   - provider_user_id (text - the ID from that provider)
   - created_at, updated_at
   - UNIQUE(provider, provider_user_id)

3. `telegram_accounts` — Telegram-specific profile data
   - id (uuid PK)
   - user_id (uuid FK -> users, ON DELETE CASCADE)
   - telegram_user_id (bigint)
   - username, first_name, last_name, language_code (text, nullable)
   - created_at, updated_at
   - UNIQUE(telegram_user_id)

4. `sessions` — Session tracking for API auth
   - id (uuid PK)
   - user_id (uuid FK -> users, ON DELETE CASCADE)
   - token (text, unique)
   - platform (text: 'web', 'telegram', 'miniapp')
   - expires_at (timestamptz)
   - created_at

5. `audit_logs` — Action traceability for financial operations
   - id (uuid PK)
   - user_id (uuid FK -> users, ON DELETE CASCADE)
   - action, entity_type (text)
   - entity_id (text, nullable)
   - metadata (jsonb, nullable)
   - created_at

## Security
- RLS enabled on all tables.
- users: owner can SELECT/UPDATE own profile.
- user_identities, telegram_accounts, sessions: owner-scoped CRUD.
- audit_logs: owner can SELECT/INSERT own logs.

## Notes
1. users.id defaults to auth.uid() so it shares the same ID as auth.users.
2. A trigger creates a users row automatically when a new auth.users record is created.
3. Telegram accounts store minimal data — no phone numbers, no tokens.
*/

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT auth.uid(),
  name text NOT NULL DEFAULT '',
  email text,
  avatar_url text,
  default_currency text NOT NULL DEFAULT 'IDR',
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON users;
CREATE POLICY "users_select_own" ON users FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================
-- 2. USER IDENTITIES
-- ============================================================
CREATE TABLE IF NOT EXISTS user_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_user_id)
);

ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "identities_select_own" ON user_identities;
CREATE POLICY "identities_select_own" ON user_identities FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "identities_insert_own" ON user_identities;
CREATE POLICY "identities_insert_own" ON user_identities FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "identities_update_own" ON user_identities;
CREATE POLICY "identities_update_own" ON user_identities FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "identities_delete_own" ON user_identities;
CREATE POLICY "identities_delete_own" ON user_identities FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 3. TELEGRAM ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS telegram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL,
  username text,
  first_name text,
  last_name text,
  language_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(telegram_user_id)
);

ALTER TABLE telegram_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telegram_select_own" ON telegram_accounts;
CREATE POLICY "telegram_select_own" ON telegram_accounts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "telegram_insert_own" ON telegram_accounts;
CREATE POLICY "telegram_insert_own" ON telegram_accounts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "telegram_update_own" ON telegram_accounts;
CREATE POLICY "telegram_update_own" ON telegram_accounts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "telegram_delete_own" ON telegram_accounts;
CREATE POLICY "telegram_delete_own" ON telegram_accounts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 4. SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'web',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_select_own" ON sessions;
CREATE POLICY "sessions_select_own" ON sessions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_delete_own" ON sessions;
CREATE POLICY "sessions_delete_own" ON sessions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 5. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_select_own" ON audit_logs;
CREATE POLICY "audit_select_own" ON audit_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "audit_insert_own" ON audit_logs;
CREATE POLICY "audit_insert_own" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 6. AUTO-CREATE USER PROFILE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 7. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_user_identities_provider ON user_identities(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_user_id ON telegram_accounts(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
