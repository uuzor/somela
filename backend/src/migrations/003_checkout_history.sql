CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_group_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  session_id text,
  cart_id uuid REFERENCES carts(id) ON DELETE SET NULL,
  payment_session_id uuid NOT NULL REFERENCES prava_payment_sessions(id) ON DELETE CASCADE,
  merchant_name varchar(255) NOT NULL,
  merchant_url text NOT NULL,
  merchant_country varchar(2) NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'USD',
  subtotal numeric(12,2) NOT NULL,
  shipping numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(50) NOT NULL DEFAULT 'created',
  provider_session_id text,
  provider_order_id text,
  approved_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  failure_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkouts_user_id_idx ON checkouts(user_id);
CREATE INDEX IF NOT EXISTS checkouts_session_id_idx ON checkouts(session_id);
CREATE INDEX IF NOT EXISTS checkouts_group_id_idx ON checkouts(checkout_group_id);
CREATE INDEX IF NOT EXISTS checkouts_status_idx ON checkouts(status);
CREATE INDEX IF NOT EXISTS checkouts_created_at_idx ON checkouts(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS checkouts_payment_session_id_key ON checkouts(payment_session_id);
CREATE INDEX IF NOT EXISTS checkouts_provider_session_id_idx ON checkouts(provider_session_id);
CREATE INDEX IF NOT EXISTS checkouts_provider_order_id_idx ON checkouts(provider_order_id);
