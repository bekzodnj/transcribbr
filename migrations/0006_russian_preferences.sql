-- Russian becomes a supported UI and audio language.
CREATE TABLE user_preferences_new (
  user_id INTEGER PRIMARY KEY,
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'uz', 'ru')),
  audio_language TEXT NOT NULL DEFAULT 'auto' CHECK (audio_language IN ('auto', 'en', 'uz', 'ru'))
);
INSERT INTO user_preferences_new (user_id, locale, audio_language)
  SELECT user_id, locale, audio_language FROM user_preferences;
DROP TABLE user_preferences;
ALTER TABLE user_preferences_new RENAME TO user_preferences;
