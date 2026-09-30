/*
# Create FlowMoney financial tables

## What this migration does
Creates the core financial data tables for FlowMoney. All tables are user-scoped
with RLS ownership checks. Amounts are stored as positive integers (IDR smallest unit = rupiah).

## New Tables

1. `categories` — User-customizable transaction categories
   - id (uuid PK)
   - user_id (uuid FK -> users, ON DELETE CASCADE)
   - name (text)
   - type (text: 'expense' or 'income')
   - icon (text, nullable)
   - color (text, nullable)
   - sort_order (int, default 0)
   - is_system (boolean — system defaults vs user-created)
   - created_at, updated_at
   - deleted_at (timestamptz, nullable — soft delete)
   - UNIQUE(user_id, name, type) — no duplicate categories per user

2. `wallets` — User financial accounts
   - id (uuid PK)
   - user_id (uuid FK -> users, ON DELETE CASCADE, DEFAULT auth.uid())
   - name (text)
   - type (text: 'cash', 'bank', 'ewallet', 'savings', 'credit', 'other')
   - initial_balance (bigint — positive integer, IDR)
   - currency (text, default 'IDR')
   - icon (text, nullable)
   - is_active (boolean, default true)
   - created_at, updated_at, deleted_at (soft delete)

3. `transactions` — Income and expense records
   - id (uuid PK)
   - user_id (uuid FK -> users, ON DELETE CASCADE, DEFAULT auth.uid())
   - type (text: 'income' or 'expense')
   - amount (bigint — always positive, type determines direction)
   - currency (text, default 'IDR')
   - category_id (uuid FK -> categories, nullable)
   - category_name (text — denormalized for history even if category deleted)
   - wallet_id (uuid FK -> wallets)
   - date (date — transaction date in user timezone)
   - time (text — HH:MM format)
   - note (text, nullable)
   - created_at, updated_at, deleted_at (soft delete)

4. `transfers` — Wallet-to-wallet transfers (NOT income/expense)
   - id (uuid PK)
   - user_id (uuid FK -> users, ON DELETE CASCADE, DEFAULT auth.uid())
   - from_wallet_id (uuid FK -> wallets)
   - to_wallet_id (uuid FK -> wallets)
   - amount (bigint — always positive)
   - currency (text, default 'IDR')
   - date (date)
   - note (text, nullable)
   - created_at, updated_at, deleted_at (soft delete)

5. `budgets` — Monthly spending limits per category
   - id (uuid PK)
   - user_id (uuid FK -> users, ON DELETE CASCADE, DEFAULT auth.uid())
   - category_id (uuid FK -> categories, nullable)
   - category_name (text — denormalized)
   - month (text — YYYY-MM format)
   - limit_amount (bigint — positive integer)
   - created_at, updated_at, deleted_at (soft delete)
   - UNIQUE(user_id, category_name, month) — one budget per category per month

6. `goals` — Financial savings goals
   - id (uuid PK)
   - user_id (uuid FK -> users, ON DELETE CASCADE, DEFAULT auth.uid())
   - name (text)
   - target_amount (bigint — positive)
   - current_amount (bigint — defaults to 0)
   - currency (text, default 'IDR')
   - deadline (date, nullable)
   - icon (text, nullable)
   - created_at, updated_at, deleted_at (soft delete)

7. `goal_contributions` — History of money added to goals
   - id (uuid PK)
   - goal_id (uuid FK -> goals, ON DELETE CASCADE)
   - user_id (uuid FK -> users, ON DELETE CASCADE)
   - amount (bigint — can be positive or negative for withdrawals)
   - note (text, nullable)
   - created_at

8. `user_settings` — User preferences
   - id (uuid PK)
   - user_id (uuid FK -> users, ON DELETE CASCADE, unique)
   - notifications_enabled (boolean, default true)
   - streak_count (int, default 0)
   - last_activity_date (date, nullable)
   - created_at, updated_at

## Security
- RLS enabled on all tables.
- Every table has owner-scoped CRUD: SELECT/INSERT/UPDATE/DELETE all check auth.uid() = user_id.
- user_id columns default to auth.uid() so client inserts work without passing user_id.
- goal_contributions scoped through user_id directly (not via goal_id parent check).
- categories have UNIQUE(user_id, name, type) to prevent duplicates.

## Notes
1. Amounts stored as bigint (IDR has no fractional units — Rp 50.000 = 50000).
2. Transfers are a separate table, NOT in transactions — they never count as income/expense.
3. category_name is denormalized on transactions and budgets so history survives category deletion.
4. Soft delete (deleted_at) on all financial entities — never hard-delete financial history.
5. System default categories are seeded per-user via a SECURITY DEFINER function.
*/

-- ============================================================
-- 1. CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('expense', 'income')),
  icon text,
  color text,
  sort_order int NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(user_id, name, type)
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select_own" ON categories;
CREATE POLICY "categories_select_own" ON categories FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "categories_insert_own" ON categories;
CREATE POLICY "categories_insert_own" ON categories FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "categories_update_own" ON categories;
CREATE POLICY "categories_update_own" ON categories FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "categories_delete_own" ON categories;
CREATE POLICY "categories_delete_own" ON categories FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 2. WALLETS
-- ============================================================
CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'cash' CHECK (type IN ('cash', 'bank', 'ewallet', 'savings', 'credit', 'other')),
  initial_balance bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IDR',
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallets_select_own" ON wallets;
CREATE POLICY "wallets_select_own" ON wallets FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wallets_insert_own" ON wallets;
CREATE POLICY "wallets_insert_own" ON wallets FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "wallets_update_own" ON wallets;
CREATE POLICY "wallets_update_own" ON wallets FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "wallets_delete_own" ON wallets;
CREATE POLICY "wallets_delete_own" ON wallets FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 3. TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  amount bigint NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'IDR',
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  category_name text NOT NULL DEFAULT 'Lainnya',
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  date date NOT NULL,
  time text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_select_own" ON transactions;
CREATE POLICY "transactions_select_own" ON transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "transactions_insert_own" ON transactions;
CREATE POLICY "transactions_insert_own" ON transactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "transactions_update_own" ON transactions;
CREATE POLICY "transactions_update_own" ON transactions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "transactions_delete_own" ON transactions;
CREATE POLICY "transactions_delete_own" ON transactions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 4. TRANSFERS
-- ============================================================
CREATE TABLE IF NOT EXISTS transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  from_wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  to_wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'IDR',
  date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transfers_select_own" ON transfers;
CREATE POLICY "transfers_select_own" ON transfers FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "transfers_insert_own" ON transfers;
CREATE POLICY "transfers_insert_own" ON transfers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "transfers_update_own" ON transfers;
CREATE POLICY "transfers_update_own" ON transfers FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "transfers_delete_own" ON transfers;
CREATE POLICY "transfers_delete_own" ON transfers FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 5. BUDGETS
-- ============================================================
CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  category_name text NOT NULL,
  month text NOT NULL,
  limit_amount bigint NOT NULL CHECK (limit_amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(user_id, category_name, month)
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budgets_select_own" ON budgets;
CREATE POLICY "budgets_select_own" ON budgets FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "budgets_insert_own" ON budgets;
CREATE POLICY "budgets_insert_own" ON budgets FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "budgets_update_own" ON budgets;
CREATE POLICY "budgets_update_own" ON budgets FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "budgets_delete_own" ON budgets;
CREATE POLICY "budgets_delete_own" ON budgets FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 6. GOALS
-- ============================================================
CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_amount bigint NOT NULL CHECK (target_amount > 0),
  current_amount bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IDR',
  deadline date,
  icon text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goals_select_own" ON goals;
CREATE POLICY "goals_select_own" ON goals FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "goals_insert_own" ON goals;
CREATE POLICY "goals_insert_own" ON goals FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "goals_update_own" ON goals;
CREATE POLICY "goals_update_own" ON goals FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "goals_delete_own" ON goals;
CREATE POLICY "goals_delete_own" ON goals FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 7. GOAL CONTRIBUTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS goal_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  amount bigint NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE goal_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contributions_select_own" ON goal_contributions;
CREATE POLICY "contributions_select_own" ON goal_contributions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "contributions_insert_own" ON goal_contributions;
CREATE POLICY "contributions_insert_own" ON goal_contributions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "contributions_delete_own" ON goal_contributions;
CREATE POLICY "contributions_delete_own" ON goal_contributions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 8. USER SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  notifications_enabled boolean NOT NULL DEFAULT true,
  streak_count int NOT NULL DEFAULT 0,
  last_activity_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select_own" ON user_settings;
CREATE POLICY "settings_select_own" ON user_settings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "settings_insert_own" ON user_settings;
CREATE POLICY "settings_insert_own" ON user_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "settings_update_own" ON user_settings;
CREATE POLICY "settings_update_own" ON user_settings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 9. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transfers_user_date ON transfers(user_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contributions_goal ON goal_contributions(goal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_categories_user_type ON categories(user_id, type) WHERE deleted_at IS NULL;

-- ============================================================
-- 10. AUTO-CREATE USER SETTINGS ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_created_settings ON users;
CREATE TRIGGER on_user_created_settings
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_settings();

-- ============================================================
-- 11. SEED DEFAULT CATEGORIES FOR NEW USERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_default_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.categories (user_id, name, type, is_system, sort_order)
  VALUES
    (NEW.id, 'Makanan', 'expense', true, 1),
    (NEW.id, 'Transportasi', 'expense', true, 2),
    (NEW.id, 'Belanja', 'expense', true, 3),
    (NEW.id, 'Tagihan', 'expense', true, 4),
    (NEW.id, 'Hiburan', 'expense', true, 5),
    (NEW.id, 'Kesehatan', 'expense', true, 6),
    (NEW.id, 'Pendidikan', 'expense', true, 7),
    (NEW.id, 'Perjalanan', 'expense', true, 8),
    (NEW.id, 'Langganan', 'expense', true, 9),
    (NEW.id, 'Pribadi', 'expense', true, 10),
    (NEW.id, 'Lainnya', 'expense', true, 11),
    (NEW.id, 'Gaji', 'income', true, 1),
    (NEW.id, 'Bonus', 'income', true, 2),
    (NEW.id, 'Freelance', 'income', true, 3),
    (NEW.id, 'Bisnis', 'income', true, 4),
    (NEW.id, 'Investasi', 'income', true, 5),
    (NEW.id, 'Hadiah', 'income', true, 6),
    (NEW.id, 'Lainnya', 'income', true, 7)
  ON CONFLICT (user_id, name, type) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_created_categories ON users;
CREATE TRIGGER on_user_created_categories
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_categories();
