ALTER TABLE tryon_tasks
  ADD COLUMN IF NOT EXISTS stage varchar(50) NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS current_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_steps integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_product_id text;

UPDATE tryon_tasks
SET
  stage = CASE
    WHEN status = 'completed' THEN 'completed'
    WHEN status = 'failed' THEN 'failed'
    WHEN status = 'processing' THEN 'applying_garment'
    ELSE 'queued'
  END,
  total_steps = GREATEST(COALESCE(jsonb_array_length(product_ids), 1), 1),
  current_step = CASE WHEN status = 'completed' THEN GREATEST(COALESCE(jsonb_array_length(product_ids), 1), 1) ELSE 0 END;
