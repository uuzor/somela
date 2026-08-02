ALTER TABLE user_selfies
  ADD COLUMN IF NOT EXISTS status varchar(50) NOT NULL DEFAULT 'completed';

ALTER TABLE user_selfies
  ADD COLUMN IF NOT EXISTS error_message text;

UPDATE user_selfies
SET status = 'completed'
WHERE status IS NULL;
