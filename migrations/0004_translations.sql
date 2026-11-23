ALTER TABLE jobs ADD COLUMN is_transcript INTEGER NOT NULL DEFAULT 0;

CREATE TABLE translation_jobs (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  enqueued INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  translated_text TEXT,
  next_chunk INTEGER NOT NULL DEFAULT 0,
  is_error INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX translation_jobs_user_created ON translation_jobs(user_id, created_at);
