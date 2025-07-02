-- sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at DATETIME,
  work_minutes INTEGER,
  break_minutes INTEGER,
  cycles_planned INTEGER,
  objective TEXT,
  importance TEXT,
  definition_of_done TEXT,
  hazards TEXT,
  concrete INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0
);

-- cycles table
CREATE TABLE IF NOT EXISTS cycles (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  idx INTEGER,
  goal TEXT,
  first_step TEXT,
  hazards TEXT,
  energy TEXT,
  morale TEXT,
  status TEXT,
  noteworthy TEXT,
  distractions TEXT,
  improvement TEXT,
  started_at DATETIME,
  ended_at DATETIME
);

-- voice notes table
CREATE TABLE IF NOT EXISTS voice_notes (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  cycle_idx INTEGER,
  kind TEXT,
  timestamp DATETIME,
  text TEXT,
  audio_path TEXT
);

-- application settings (single row)
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,                -- always 'default'
  ai_enabled INTEGER DEFAULT 0,
  openai_cipher BLOB,
  work_minutes INTEGER DEFAULT 30,
  break_minutes INTEGER DEFAULT 5,
  cycles_planned INTEGER DEFAULT 6,
  chime_enabled INTEGER DEFAULT 1,
  notify_enabled INTEGER DEFAULT 1,
  tray_timer_enabled INTEGER DEFAULT 1,
  hotkey TEXT DEFAULT 'Control+Shift+U',
  openai_cipher_encrypted INTEGER DEFAULT 0
);

-- ensure row exists
INSERT OR IGNORE INTO app_settings (id) VALUES ('default'); 