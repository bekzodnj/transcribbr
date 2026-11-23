-- Translation now runs inline from the callback, so the queued-job table is unused.
DROP TABLE IF EXISTS translation_jobs;
