CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  transcript TEXT,
  next_chunk INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX jobs_user_created ON jobs(user_id, created_at);
