ALTER TABLE tryon_tasks
  ADD COLUMN IF NOT EXISTS parent_task_id uuid,
  ADD COLUMN IF NOT EXISTS source_image_url text,
  ADD COLUMN IF NOT EXISTS garment_slot varchar(50),
  ADD COLUMN IF NOT EXISTS outfit_state jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS tryon_tasks_parent_task_id_idx
  ON tryon_tasks(parent_task_id);

UPDATE tryon_tasks
SET
  source_image_url = COALESCE(source_image_url, user_selfie_url),
  outfit_state = CASE
    WHEN product_id IS NOT NULL AND garment_slot IS NOT NULL
      THEN jsonb_build_object(garment_slot, product_id)
    ELSE outfit_state
  END
WHERE source_image_url IS NULL OR outfit_state = '{}'::jsonb;
