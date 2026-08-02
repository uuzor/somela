CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS session_knowledge jsonb DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS prava_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  session_id text,
  provider varchar(50) NOT NULL DEFAULT 'prava',
  provider_account_id text,
  provider_subject text,
  email varchar(255),
  display_name varchar(255),
  status varchar(50) NOT NULL DEFAULT 'linked',
  metadata jsonb DEFAULT '{}'::jsonb,
  linked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prava_connections_user_id_idx ON prava_connections(user_id);
CREATE INDEX IF NOT EXISTS prava_connections_session_id_idx ON prava_connections(session_id);
CREATE INDEX IF NOT EXISTS prava_connections_provider_account_id_idx ON prava_connections(provider_account_id);

CREATE TABLE IF NOT EXISTS prava_payment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  session_id text,
  cart_id uuid REFERENCES carts(id) ON DELETE SET NULL,
  merchant_name varchar(255) NOT NULL,
  merchant_url text NOT NULL,
  merchant_country varchar(2) NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'USD',
  status varchar(50) NOT NULL DEFAULT 'draft',
  approval_url text,
  provider_session_id text,
  provider_checkout_id text,
  expires_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prava_payment_sessions_user_id_idx ON prava_payment_sessions(user_id);
CREATE INDEX IF NOT EXISTS prava_payment_sessions_session_id_idx ON prava_payment_sessions(session_id);
CREATE INDEX IF NOT EXISTS prava_payment_sessions_status_idx ON prava_payment_sessions(status);
CREATE INDEX IF NOT EXISTS prava_payment_sessions_provider_session_id_idx ON prava_payment_sessions(provider_session_id);

CREATE TABLE IF NOT EXISTS prava_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  session_id text,
  scope varchar(20) NOT NULL DEFAULT 'listed',
  frequency varchar(20) NOT NULL DEFAULT 'one_time',
  merchant_name varchar(255),
  merchant_url text,
  merchant_country varchar(2),
  amount numeric(12,2) NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'USD',
  status varchar(50) NOT NULL DEFAULT 'pending',
  approval_url text,
  provider_mandate_id text,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prava_mandates_user_id_idx ON prava_mandates(user_id);
CREATE INDEX IF NOT EXISTS prava_mandates_session_id_idx ON prava_mandates(session_id);
CREATE INDEX IF NOT EXISTS prava_mandates_status_idx ON prava_mandates(status);
CREATE INDEX IF NOT EXISTS prava_mandates_provider_mandate_id_idx ON prava_mandates(provider_mandate_id);

CREATE TABLE IF NOT EXISTS prava_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  session_id text,
  payment_session_id uuid REFERENCES prava_payment_sessions(id) ON DELETE SET NULL,
  mandate_id uuid REFERENCES prava_mandates(id) ON DELETE SET NULL,
  merchant_name varchar(255) NOT NULL,
  merchant_url text NOT NULL,
  merchant_country varchar(2) NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'USD',
  status varchar(50) NOT NULL DEFAULT 'pending',
  provider_transaction_id text,
  approval_status varchar(50),
  authorization_code text,
  error_code text,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prava_transactions_user_id_idx ON prava_transactions(user_id);
CREATE INDEX IF NOT EXISTS prava_transactions_session_id_idx ON prava_transactions(session_id);
CREATE INDEX IF NOT EXISTS prava_transactions_status_idx ON prava_transactions(status);
CREATE INDEX IF NOT EXISTS prava_transactions_provider_transaction_id_idx ON prava_transactions(provider_transaction_id);
