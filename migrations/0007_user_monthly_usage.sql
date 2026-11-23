CREATE TABLE user_monthly_usage (
  user_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  audio_seconds INTEGER NOT NULL DEFAULT 0,
  transcription_calls INTEGER NOT NULL DEFAULT 0,
  translation_calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);
CREATE INDEX user_monthly_usage_month ON user_monthly_usage(month);
