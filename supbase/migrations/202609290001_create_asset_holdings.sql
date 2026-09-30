CREATE TABLE IF NOT EXISTS asset_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('aset', 'crypto', 'saham')),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  quantity numeric(28, 10) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  purchase_price bigint NOT NULL CHECK (purchase_price > 0),
  current_price bigint NOT NULL CHECK (current_price > 0),
  currency text NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE asset_holdings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_holdings_select_own" ON asset_holdings;
CREATE POLICY "asset_holdings_select_own" ON asset_holdings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "asset_holdings_insert_own" ON asset_holdings;
CREATE POLICY "asset_holdings_insert_own" ON asset_holdings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "asset_holdings_update_own" ON asset_holdings;
CREATE POLICY "asset_holdings_update_own" ON asset_holdings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "asset_holdings_delete_own" ON asset_holdings;
CREATE POLICY "asset_holdings_delete_own" ON asset_holdings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_asset_holdings_user_kind
  ON asset_holdings(user_id, kind) WHERE deleted_at IS NULL;