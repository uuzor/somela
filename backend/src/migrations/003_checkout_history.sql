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

INSERT INTO checkouts (
  user_id,
  session_id,
  cart_id,
  payment_session_id,
  merchant_name,
  merchant_url,
  merchant_country,
  currency,
  subtotal,
  shipping,
  tax,
  total,
  items,
  status,
  provider_session_id,
  provider_order_id,
  approved_at,
  completed_at,
  failed_at,
  metadata,
  created_at,
  updated_at
)
SELECT
  user_id,
  session_id,
  cart_id,
  id,
  merchant_name,
  merchant_url,
  merchant_country,
  currency,
  total_amount,
  0,
  0,
  total_amount,
  COALESCE(metadata->'items', '[]'::jsonb),
  CASE lower(status)
    WHEN 'awaiting_result' THEN 'approved'
    WHEN 'completed' THEN 'paid'
    WHEN 'failed' THEN 'failed'
    WHEN 'expired' THEN 'expired'
    WHEN 'pending' THEN 'awaiting_approval'
    WHEN 'pending_approval' THEN 'awaiting_approval'
    ELSE 'created'
  END,
  provider_session_id,
  provider_checkout_id,
  CASE WHEN lower(status) IN ('awaiting_result', 'completed') THEN updated_at END,
  CASE WHEN lower(status) = 'completed' THEN updated_at END,
  CASE WHEN lower(status) = 'failed' THEN updated_at END,
  jsonb_build_object('source', 'prava_session_backfill'),
  created_at,
  updated_at
FROM prava_payment_sessions
ON CONFLICT (payment_session_id) DO NOTHING;
