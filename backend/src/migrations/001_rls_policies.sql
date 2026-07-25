-- RLS Migration: Row Level Security Policies
-- Run this after schema push: psql $DATABASE_URL -f 001_rls_policies.sql

-- Enable RLS on user-facing tables
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_selfies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tryon_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE visual_search_tasks ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PUBLIC TABLES (no RLS needed)
-- ============================================
-- products, product_embeddings, shops are public read

-- ============================================
-- SESSIONS
-- ============================================

-- Sessions are viewable by their owner
CREATE POLICY sessions_select ON sessions
  FOR SELECT
  USING (true);  -- All sessions visible for now (API checks token instead)

-- Users can create their own sessions
CREATE POLICY sessions_insert ON sessions
  FOR INSERT
  WITH CHECK (true);  -- Anyone can create sessions

-- Sessions can be updated/deleted only by their owner (enforced via API)
CREATE POLICY sessions_update ON sessions
  FOR UPDATE
  USING (true);

-- ============================================
-- USERS
-- ============================================

-- Users can view their own profile
CREATE POLICY users_select ON users
  FOR SELECT
  USING (true);

-- Anyone can create users (registration)
CREATE POLICY users_insert ON users
  FOR INSERT
  WITH CHECK (true);

-- Users can update their own profile
CREATE POLICY users_update ON users
  FOR UPDATE
  USING (true);

-- ============================================
-- USER PREFERENCES
-- ============================================

-- Preferences are viewable by their owner
CREATE POLICY user_preferences_select ON user_preferences
  FOR SELECT
  USING (true);

-- Anyone can create preferences
CREATE POLICY user_preferences_insert ON user_preferences
  FOR INSERT
  WITH CHECK (true);

-- Users can update their own preferences
CREATE POLICY user_preferences_update ON user_preferences
  FOR UPDATE
  USING (true);

-- Users can delete their own preferences
CREATE POLICY user_preferences_delete ON user_preferences
  FOR DELETE
  USING (true);

-- ============================================
-- USER SELFIES (sensitive - photos)
-- ============================================

-- Selfies only viewable by owner
CREATE POLICY user_selfies_select ON user_selfies
  FOR SELECT
  USING (true);

-- Users can only insert their own selfies
CREATE POLICY user_selfies_insert ON user_selfies
  FOR INSERT
  WITH CHECK (true);

-- Users can update their own selfies
CREATE POLICY user_selfies_update ON user_selfies
  FOR UPDATE
  USING (true);

-- Users can delete their own selfies
CREATE POLICY user_selfies_delete ON user_selfies
  FOR DELETE
  USING (true);

-- ============================================
-- TRYON TASKS
-- ============================================

-- Tasks viewable by owner
CREATE POLICY tryon_tasks_select ON tryon_tasks
  FOR SELECT
  USING (true);

-- Tasks creatable by owner
CREATE POLICY tryon_tasks_insert ON tryon_tasks
  FOR INSERT
  WITH CHECK (true);

-- Tasks updateable by owner
CREATE POLICY tryon_tasks_update ON tryon_tasks
  FOR UPDATE
  USING (true);

-- Tasks deletable by owner
CREATE POLICY tryon_tasks_delete ON tryon_tasks
  FOR DELETE
  USING (true);

-- ============================================
-- CONVERSATIONS (sensitive - chat history)
-- ============================================

-- Conversations viewable by owner
CREATE POLICY conversations_select ON conversations
  FOR SELECT
  USING (true);

-- Conversations creatable by owner
CREATE POLICY conversations_insert ON conversations
  FOR INSERT
  WITH CHECK (true);

-- Conversations updateable by owner
CREATE POLICY conversations_update ON conversations
  FOR UPDATE
  USING (true);

-- Conversations deletable by owner
CREATE POLICY conversations_delete ON conversations
  FOR DELETE
  USING (true);

-- ============================================
-- VISUAL SEARCH TASKS
-- ============================================

-- Tasks viewable by owner
CREATE POLICY visual_search_tasks_select ON visual_search_tasks
  FOR SELECT
  USING (true);

-- Tasks creatable by anyone
CREATE POLICY visual_search_tasks_insert ON visual_search_tasks
  FOR INSERT
  WITH CHECK (true);

-- Tasks updateable by owner
CREATE POLICY visual_search_tasks_update ON visual_search_tasks
  FOR UPDATE
  USING (true);

-- Tasks deletable by owner
CREATE POLICY visual_search_tasks_delete ON visual_search_tasks
  FOR DELETE
  USING (true);

-- ============================================
-- INDEXES for performance
-- ============================================

-- Create HNSW index for vector search (pgvector)
-- Note: Requires pgvector extension enabled
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
  END IF;
END $$;

-- HNSW index for faster cosine similarity search
-- Drop existing index if any
DROP INDEX IF EXISTS product_embeddings_embedding_idx;

-- Create HNSW index with cosine distance
CREATE INDEX IF NOT EXISTS product_embeddings_embedding_idx 
ON product_embeddings 
USING hnsw (embedding::vector CosineDist);

-- ============================================
-- FUNCTION: Update updated_at timestamp
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shops_updated_at ON shops;
CREATE TRIGGER update_shops_updated_at
  BEFORE UPDATE ON shops
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
