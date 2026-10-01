CREATE TABLE IF NOT EXISTS shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  token_hash text NOT NULL,
  vpas text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL,
  bank text NOT NULL,
  utr text NOT NULL,
  amount_paise bigint NOT NULL,
  credited_at timestamptz NOT NULL,
  source text NOT NULL,
  dkim_domain text NOT NULL,
  raw_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL,
  credit_id uuid NOT NULL,
  order_ref text NOT NULL,
  screenshot_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claims_naive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id uuid NOT NULL,
  order_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL,
  screenshot_sha256 text NOT NULL,
  extracted text NOT NULL,
  verdict text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ASYNC IF NOT EXISTS credits_once ON credits (shop_id, bank, utr, amount_paise, credited_at);
CREATE INDEX ASYNC IF NOT EXISTS credits_by_utr ON credits (shop_id, utr);
CREATE UNIQUE INDEX ASYNC IF NOT EXISTS claims_once ON claims (credit_id);
CREATE INDEX ASYNC IF NOT EXISTS claims_naive_by_credit ON claims_naive (credit_id);
