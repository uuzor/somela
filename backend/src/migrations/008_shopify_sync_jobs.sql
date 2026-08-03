CREATE TABLE IF NOT EXISTS shopify_sync_jobs (
  id text PRIMARY KEY,
  webhook_id text NOT NULL UNIQUE,
  job_key text NOT NULL,
  shop text NOT NULL,
  topic varchar(100) NOT NULL,
  product_id text NOT NULL,
  payload jsonb NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT shopify_sync_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS shopify_sync_jobs_ready_idx
  ON shopify_sync_jobs (status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS shopify_sync_jobs_product_idx
  ON shopify_sync_jobs (job_key, status);
