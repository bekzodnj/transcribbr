ALTER TABLE user_preferences ADD COLUMN first_name TEXT;
ALTER TABLE user_preferences ADD COLUMN last_name TEXT;
ALTER TABLE user_preferences ADD COLUMN username TEXT;
ALTER TABLE user_preferences ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
