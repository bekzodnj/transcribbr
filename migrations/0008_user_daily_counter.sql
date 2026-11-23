-- Track the daily transcription counter alongside the monthly allowance.
ALTER TABLE user_monthly_usage ADD COLUMN day TEXT NOT NULL DEFAULT '';
ALTER TABLE user_monthly_usage ADD COLUMN day_calls INTEGER NOT NULL DEFAULT 0;
