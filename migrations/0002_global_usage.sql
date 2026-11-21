CREATE TABLE daily_ai_usage (
  day TEXT PRIMARY KEY,
  reserved_seconds INTEGER NOT NULL DEFAULT 0,
  inference_calls INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX jobs_status ON jobs(status);
