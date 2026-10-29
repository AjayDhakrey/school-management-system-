CREATE TABLE IF NOT EXISTS school_events (
  id text PRIMARY KEY,
  school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  event_date text NOT NULL,
  event_time text NOT NULL,
  location text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  created_by text REFERENCES users(id),
  created_at text NOT NULL DEFAULT app_now()
);
CREATE INDEX IF NOT EXISTS ix_school_events_school_date ON school_events (school_id, event_date);

CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key text PRIMARY KEY,
  setting_value text NOT NULL,
  updated_by text REFERENCES users(id),
  updated_at text NOT NULL DEFAULT app_now()
);

CREATE TABLE IF NOT EXISTS school_options (
  id text PRIMARY KEY,
  school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  option_type text NOT NULL,
  option_value text NOT NULL,
  created_at text NOT NULL DEFAULT app_now(),
  UNIQUE (school_id, option_type, option_value)
);
