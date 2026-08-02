-- Saved products / wishlist table
-- Apply with: psql $DATABASE_URL -f 002_saved_products.sql

CREATE TABLE IF NOT EXISTS saved_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  session_id text REFERENCES sessions(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saved_products_user_id_idx ON saved_products(user_id);
CREATE INDEX IF NOT EXISTS saved_products_session_id_idx ON saved_products(session_id);
CREATE INDEX IF NOT EXISTS saved_products_product_id_idx ON saved_products(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS saved_products_user_product_unique_idx ON saved_products(user_id, product_id);
CREATE UNIQUE INDEX IF NOT EXISTS saved_products_session_product_unique_idx ON saved_products(session_id, product_id);
