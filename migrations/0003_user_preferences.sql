CREATE TABLE user_preferences (
  user_id INTEGER PRIMARY KEY,
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'uz')),
  audio_language TEXT NOT NULL DEFAULT 'auto' CHECK (audio_language IN ('auto', 'en', 'uz'))
);
