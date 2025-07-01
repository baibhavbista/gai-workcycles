**WorkCycles — MVP Product Requirements Document**

---

### 1 · Project Overview

Desktop companion that lets users run 30-min/10-min Ultraworking cycles, capture voice-notes, and review results—all offline except for Whisper transcription.

---

### 2 · Core Workflows

1. **Start Session** – Hotkey *Ctrl + Shift + U* opens pop-over, user sets goals, hazards, cycles.
2. **Pre-Cycle Plan** – User fills goal/first-step/energy/morale; clicks **Start**.
3. **Cycle Timer** – 30-minute countdown with Pause + Finish-Early; two mic buttons log Work vs Distraction notes.
4. **Cycle Review** – On chime, user marks target hit/missed, reviews timestamped notes, adds improvements.
5. **Break Timer** – 5-min rest screen; auto-advances to next Pre-Cycle Plan.
6. **Session Review** – After last cycle, user completes five debrief questions and sees success stats.
7. **History & Search** – Menu-bar “Sessions” opens list; user filters or semantically searches past cycles.

---

### 3 · Technical Foundation

#### 3.1 Tech Stack

*Electron 27* · TypeScript · React 18 · TailwindCSS 3 · Zustand (state) · **better-sqlite3** (core data) · **LanceDB** (vector search) · transformers.js (mixedbread-ai/mxbai-embed-xsmall-v1 embeddings) · OpenAI Whisper (voice transcription).

#### 3.2 Data Models (SQLite)

```sql
TABLE sessions (
  id TEXT PRIMARY KEY,
  started_at DATETIME,
  work_minutes INT DEFAULT 30,
  break_minutes INT DEFAULT 10,
  cycles_planned INT DEFAULT 6,
  objective TEXT,
  importance TEXT,
  definition_of_done TEXT,
  hazards TEXT,
  concrete BOOL,
  created_at DATETIME,
  completed BOOL DEFAULT 0
);

TABLE cycles (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  idx INT,               -- 0-based order
  goal TEXT,
  first_step TEXT,
  hazards TEXT,
  energy TEXT,           -- 'High'|'Medium'|'Low'
  morale TEXT,
  status TEXT,           -- 'hit'|'miss'|'partial'
  noteworthy TEXT,
  distractions TEXT,
  improvement TEXT,
  started_at DATETIME,
  ended_at DATETIME
);

TABLE voice_notes (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  cycle_idx INT,
  kind TEXT,             -- 'work'|'distraction'
  timestamp DATETIME,
  text TEXT,
  audio_path TEXT
);
```

#### 3.3 Data Models (LanceDB)

`vectors(cycle_id TEXT PRIMARY KEY, embedding VECTOR[384], energy TEXT, morale TEXT, goal TEXT)`

#### 3.4 Internal API (endpoints = IPC/renderer helpers)

| Name             | Payload                 | Returns            | Purpose                           |
| ---------------- | ----------------------- | ------------------ | --------------------------------- |
| `session.create` | payload ⇒ sessions cols | `sessionId`        | Start new session                 |
| `cycle.start`    | `{sessionId}`           | `cycleId`          | Opens planner, starts timer       |
| `cycle.finish`   | cycle review data       | 200                | Persist results & queue embedding |
| `voice.record`   | `{cycleId, kind}`       | `noteId`           | Saves WAV → Whisper → text        |
| `vector.search`  | `{queryText}`           | `[cycleId, score]` | Top-K semantic matches            |
| `history.list`   | `{from, to}`            | `[sessionMeta]`    | Populate history page             |

#### 3.5 Key Components

* **Main Process** – global shortcut, Tray/menu-bar timer, timer engine, IPC router.
* **Renderer** – React screens: SessionIntent, PreCycle, Timer, Review, Break, History.
* **Persistence Layer** – SQLite adapter (CRUD) + LanceDB adapter (add/search).
* **Voice Module** – Mic capture, temp WAV, Whisper call, JSON parser, cleanup after 30 days.
* **Embedding Worker** – Batch encode cycle text with MiniLM, push to LanceDB.
* **Notifier** – OS toast + WAV chime on cycle/break transitions.

---

### 4 · MVP Launch Requirements

1. Global hotkey toggles a frameless 480 × 620 window.
2. Full 6-cycle flow with editable work/break lengths and chimes.
3. Voice-note capture (click-start/stop) populates Work/Distraction lists; audio auto-deletes after 30 days.
4. Whisper transcription + GPT-4o JSON formatting auto-fill Pre-Cycle fields.
5. Local persistence via better-sqlite3; sessions survive app crash.
6. Menu-bar/System-tray timer shows mm\:ss remaining, click re-opens window.
7. History view lists sessions with success rate; semantic search returns similar cycles.
8. Download-only installer for macOS (Universal) and Windows (x64) ≤ 70 MB.
9. Brand styling with #482F60; no dark mode.
10. Manual export: “Export session as Markdown” saves to `.md`.

---

### 5 · Out-of-Scope for MVP

*Encryption, auto-updates, multi-language UI, co-working sync, charts beyond per-session stats.*

Deliverables: working app bundle + README build steps + schema SQL + icon set.
