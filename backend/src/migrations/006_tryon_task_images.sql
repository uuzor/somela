ALTER TABLE tryon_tasks
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS garment_image_url text,
  ADD COLUMN IF NOT EXISTS user_selfie_url text;

UPDATE tryon_tasks
SET product_id = product_ids ->> 0
WHERE product_id IS NULL
  AND jsonb_typeof(product_ids) = 'array'
  AND jsonb_array_length(product_ids) > 0;
