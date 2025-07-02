import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { v4 as uuid } from 'uuid';

// ---------- database bootstrapping ----------
// Ensure the app name is set BEFORE we resolve userData path so dev runs use
// the same directory name as packaged builds (WorkCycles instead of default
// "Electron").
if (app.name === 'Electron') {
  app.name = 'WorkCycles';
}

const DB_PATH = path.join(app.getPath('userData'), 'core.db');

// Ensure userData dir exists (it always should but for safety)
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

// Ensure window_bounds table exists for persisting Electron window positions
db.exec(`
  CREATE TABLE IF NOT EXISTS window_bounds (
    display_id TEXT PRIMARY KEY,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL
  );
`);

// Load schema once
const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');
db.exec(schema);

// ---------- prepared statements ----------
const insertSessionStmt = db.prepare(`
  INSERT INTO sessions (
    id, started_at, work_minutes, break_minutes, cycles_planned,
    objective, importance, definition_of_done, hazards, concrete, completed
  ) VALUES (
    @id, datetime('now'), @work_minutes, @break_minutes, @cycles_planned,
    @objective, @importance, @definition_of_done, @hazards, @concrete, 0
  )
`);

const insertCycleStmt = db.prepare(`
  INSERT INTO cycles (
    id, session_id, idx, goal, first_step, hazards, energy, morale, started_at
  ) VALUES (
    @id, @session_id, @idx, @goal, @first_step, @hazards, @energy, @morale, datetime('now')
  )
`);

const finishCycleStmt = db.prepare(`
  UPDATE cycles SET
    status=@status,
    noteworthy=@noteworthy,
    distractions=@distractions,
    improvement=@improvement,
    ended_at=datetime('now')
  WHERE id=@id
`);

const markSessionCompletedStmt = db.prepare(`
  UPDATE sessions SET completed=1 WHERE id=@id
`);

const getSessionStmt = db.prepare(`
  SELECT * FROM sessions WHERE id = ?
`);

const getCyclesForSessionStmt = db.prepare(`
  SELECT * FROM cycles WHERE session_id = ? ORDER BY idx ASC
`);

const getWindowBoundsStmt = db.prepare<[string], WindowBoundsQuery>(
  `SELECT x, y, width, height FROM window_bounds WHERE display_id = ?`
);

const upsertWindowBoundsStmt = db.prepare(
  `INSERT INTO window_bounds (display_id, x, y, width, height)
   VALUES (@display_id, @x, @y, @width, @height)
   ON CONFLICT(display_id) DO UPDATE SET
     x=excluded.x,
     y=excluded.y,
     width=excluded.width,
     height=excluded.height`
);

// Types for payloads (minimal)
export interface SessionPayload {
  work_minutes: number;
  break_minutes: number;
  cycles_planned: number;
  objective: string;
  importance: string;
  definition_of_done: string;
  hazards: string;
  concrete: boolean;
}

export interface CycleStartPayload {
  sessionId: string;
  idx: number;
  goal: string;
  first_step: string;
  hazards: string;
  energy: string;
  morale: string;
}

export interface CycleFinishPayload {
  cycleId: string;
  status: string;
  noteworthy: string;
  distractions: string;
  improvement: string;
  shouldCompleteSession: boolean;
  sessionId: string;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WindowBoundsQuery {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------- API functions ----------
export function insertSession(payload: SessionPayload): string {
  const id = uuid();
  insertSessionStmt.run({ id, ...payload, concrete: payload.concrete ? 1 : 0 });
  return id;
}

export function insertCycle(payload: CycleStartPayload): string {
  const id = uuid();
  insertCycleStmt.run({
    id,
    session_id: payload.sessionId,
    idx: payload.idx,
    goal: payload.goal,
    first_step: payload.first_step,
    hazards: payload.hazards,
    energy: payload.energy,
    morale: payload.morale,
  });
  return id;
}

export function finishCycle(payload: CycleFinishPayload) {
  finishCycleStmt.run({
    id: payload.cycleId,
    status: payload.status,
    noteworthy: payload.noteworthy,
    distractions: payload.distractions,
    improvement: payload.improvement,
  });

  if (payload.shouldCompleteSession) {
    markSessionCompletedStmt.run({ id: payload.sessionId });
  }
}

export function getSessionById(sessionId: string) {
  const session = getSessionStmt.get(sessionId);
  if (!session) return null;
  const cycles = getCyclesForSessionStmt.all(sessionId);
  return { ...session, cycles };
}

export function listSessionsWithCycles() {
  const sessions = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all();
  return sessions.map((row: any) => {
    const cycles = getCyclesForSessionStmt.all(row.id);
    const intentions = {
      objective: row.objective,
      importance: row.importance,
      definitionOfDone: row.definition_of_done,
      hazards: row.hazards,
      concrete: !!row.concrete,
      workMinutes: row.work_minutes,
      breakMinutes: row.break_minutes,
      cyclesPlanned: row.cycles_planned,
    };
    return {
      id: row.id,
      startedAt: (() => {
        const str = typeof row.started_at === 'string' ? row.started_at : '';
        // Convert "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SSZ"
        const iso = str.includes('T') ? str : str.replace(' ', 'T') + 'Z';
        return new Date(iso);
      })(),
      completed: !!row.completed,
      intentions,
      cycles,
      currentCycleIdx: cycles.length,
    };
  });
}

/**
 * Persist the bounds (position + size) for a given display.
 * Uses an UPSERT so subsequent saves overwrite the previous record.
 */
export function saveWindowBounds(displayId: string, bounds: WindowBounds) {
  upsertWindowBoundsStmt.run({ display_id: displayId, ...bounds });
}

/**
 * Retrieve the previously saved bounds for a display, if any.
 * Returns `undefined` if no record exists.
 */
export function getWindowBounds(displayId: string): WindowBounds | undefined {
  const row = getWindowBoundsStmt.get(displayId);
  if (!row) return undefined;
  return {
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
  };
} 