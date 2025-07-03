-- sessions --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY,      -- UUID
  started_at       DATETIME NOT NULL,
  ended_at         DATETIME,              -- <- NEW
  work_minutes     INTEGER NOT NULL,
  break_minutes    INTEGER NOT NULL,
  cycles_planned   INTEGER NOT NULL,
  cycles_completed INTEGER NOT NULL DEFAULT 0,
  plan_objective       TEXT,
  plan_importance      TEXT,
  plan_done_definition TEXT,
  plan_hazards         TEXT,
  plan_misc_notes      TEXT,
  plan_concrete    INTEGER NOT NULL DEFAULT 0 CHECK(plan_concrete IN (0,1)),
  review_accomplishments TEXT,
  review_comparison      TEXT,
  review_obstacles       TEXT,
  review_successes       TEXT,
  review_takeaways       TEXT,
  completed        INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1))
);

-- cycles ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cycles (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  idx           INTEGER NOT NULL,
  started_at    DATETIME NOT NULL,
  ended_at      DATETIME,
  plan_goal          TEXT,
  plan_first_step    TEXT,
  plan_hazards_cycle TEXT,
  plan_energy        INTEGER CHECK(plan_energy IN (0,1,2)),   -- 0=Low 1=Med 2=High
  plan_morale        INTEGER CHECK(plan_morale IN (0,1,2)),
  review_status        INTEGER CHECK(review_status IN (0,1,2)),   -- 0=No 1=Half 2=Yes
  review_noteworthy    TEXT,
  review_distractions  TEXT,
  review_improvement   TEXT,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_cycles_session ON cycles(session_id);


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

-- cycle notes table (work/distraction notes during cycles)
CREATE TABLE IF NOT EXISTS cycle_notes (
  id TEXT PRIMARY KEY,                    -- UUID
  session_id TEXT NOT NULL,               -- Links to sessions table
  cycle_id TEXT NOT NULL,                 -- Links to cycles table  
  cycle_idx INTEGER NOT NULL,             -- For easy querying without joins
  note_type TEXT NOT NULL CHECK(note_type IN ('work', 'distraction')), -- work or distraction
  entry_type TEXT NOT NULL CHECK(entry_type IN ('voice', 'manual')),   -- voice or manual
  text TEXT NOT NULL,                     -- The actual note content
  timestamp DATETIME NOT NULL,            -- When the note was created
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- When row was inserted
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cycle_notes_session ON cycle_notes(session_id);
CREATE INDEX IF NOT EXISTS idx_cycle_notes_cycle ON cycle_notes(cycle_id);
CREATE INDEX IF NOT EXISTS idx_cycle_notes_type ON cycle_notes(note_type);

-- application settings (single row)
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,                -- always 'default'
  ai_enabled INTEGER DEFAULT 0,
  openai_cipher BLOB,
  work_minutes INTEGER DEFAULT 30,
  break_minutes INTEGER DEFAULT 10,
  cycles_planned INTEGER DEFAULT 6,
  chime_enabled INTEGER DEFAULT 1,
  notify_enabled INTEGER DEFAULT 1,
  tray_timer_enabled INTEGER DEFAULT 1,
  hotkey TEXT DEFAULT 'Control+Shift+U',
  openai_cipher_encrypted INTEGER DEFAULT 0
);

-- ensure row exists
INSERT OR IGNORE INTO app_settings (id) VALUES ('default');

-- embedding jobs queue for offline processing
CREATE TABLE IF NOT EXISTS embed_jobs (
  id TEXT PRIMARY KEY,                -- UUID
  level TEXT NOT NULL CHECK(level IN ('field', 'cycle', 'session')),
  session_id TEXT NOT NULL,
  cycle_id TEXT,                      -- NULL for sessions
  table_name TEXT NOT NULL,           -- 'sessions' or 'cycles'
  row_id TEXT NOT NULL,               -- session.id or cycle.id
  column_name TEXT,                   -- field column name (NULL for cycle/session)
  field_label TEXT,                   -- human-readable question label
  text TEXT NOT NULL,                 -- text to embed
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'done', 'error')),
  error_message TEXT,                 -- error details if status = 'error'
  version INTEGER NOT NULL DEFAULT 1, -- for schema migrations
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_embed_jobs_status ON embed_jobs(status);
CREATE INDEX IF NOT EXISTS idx_embed_jobs_level ON embed_jobs(level);
CREATE INDEX IF NOT EXISTS idx_embed_jobs_session ON embed_jobs(session_id); 