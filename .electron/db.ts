import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { v4 as uuid } from 'uuid';
import { 
  createFieldEmbedJobs, 
  createCycleEmbedJob, 
  createSessionEmbedJob,
  performJobCleanup
} from './embeddings.js';

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

// Simple migration: add column openai_cipher_encrypted if it doesn't exist
try {
  const info = db.prepare(`PRAGMA table_info(app_settings)`).all() as any[];
  const hasCol = info.some((r) => r.name === 'openai_cipher_encrypted');
  if (!hasCol) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN openai_cipher_encrypted INTEGER DEFAULT 0;`);
  }
  const hasTray = info.some((r) => r.name === 'tray_timer_enabled');
  if (!hasTray) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN tray_timer_enabled INTEGER DEFAULT 1;`);
  }

  // Add session review columns if missing
  const reviewCols = [
    'review_accomplishments',
    'review_comparison',
    'review_obstacles',
    'review_successes',
    'review_takeaways',
  ];
  for (const col of reviewCols) {
    if (!info.some((r) => r.name === col)) {
      db.exec(`ALTER TABLE sessions ADD COLUMN ${col} TEXT;`);
    }
  }
} catch {
  // ignore migration errors
}

// ---------- prepared statements ----------
const insertSessionStmt = db.prepare(`
  INSERT INTO sessions (
    id, started_at, work_minutes, break_minutes, cycles_planned,
    plan_objective, plan_importance, plan_done_definition, plan_hazards, plan_misc_notes, plan_concrete, completed
  ) VALUES (
    @id, datetime('now'), @work_minutes, @break_minutes, @cycles_planned,
    @objective, @importance, @definition_of_done, @hazards, @misc_notes, @concrete, 0
  )
`);

const insertCycleStmt = db.prepare(`
  INSERT INTO cycles (
    id, session_id, idx, plan_goal, plan_first_step, plan_hazards_cycle, plan_energy, plan_morale, started_at
  ) VALUES (
    @id, @session_id, @idx, @goal, @first_step, @hazards, @energy, @morale, datetime('now')
  )
`);

const finishCycleStmt = db.prepare(`
  UPDATE cycles SET
    review_status=@status,
    review_noteworthy=@noteworthy,
    review_distractions=@distractions,
    review_improvement=@improvement,
    ended_at=datetime('now')
  WHERE id=@id
`);

const markSessionCompletedStmt = db.prepare(`
  UPDATE sessions SET 
    completed=1, 
    ended_at=datetime('now') 
  WHERE id=@id
`);

const incrementCyclesCompletedStmt = db.prepare(`
  UPDATE sessions SET 
    cycles_completed = cycles_completed + 1 
  WHERE id=@id
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
  misc_notes: string;
  concrete: boolean;
}

export interface CycleStartPayload {
  sessionId: string;
  idx: number;
  goal: string;
  first_step: string;
  hazards: string;
  energy: 'Low' | 'Medium' | 'High';
  morale: 'Low' | 'Medium' | 'High';
}

export interface CycleFinishPayload {
  cycleId: string;
  status: 'hit' | 'miss' | 'partial';
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

// ----------------------------------
// Settings table helpers
// ----------------------------------

export interface Settings {
  aiEnabled: boolean;
  workMinutes: number;
  breakMinutes: number;
  cyclesPlanned: number;
  chimeEnabled: boolean;
  notifyEnabled: boolean;
  hotkey: string;
  trayTimerEnabled: boolean;
}

const getSettingsStmt = db.prepare(`SELECT * FROM app_settings WHERE id='default'`);

const updateSettingsStmt = db.prepare(`
  UPDATE app_settings SET
    ai_enabled=@ai_enabled,
    work_minutes=@work_minutes,
    break_minutes=@break_minutes,
    cycles_planned=@cycles_planned,
    chime_enabled=@chime_enabled,
    notify_enabled=@notify_enabled,
    tray_timer_enabled=@tray_timer_enabled,
    hotkey=@hotkey
  WHERE id='default'
`);

const getCipherStmt = db.prepare(`SELECT openai_cipher, openai_cipher_encrypted FROM app_settings WHERE id='default'`);

const updateCipherStmt = db.prepare(`UPDATE app_settings SET openai_cipher = @cipher, openai_cipher_encrypted=@enc WHERE id='default'`);

export function getSettings(): Settings {
  const row: any = getSettingsStmt.get();
  return {
    aiEnabled: !!row.ai_enabled,
    workMinutes: row.work_minutes,
    breakMinutes: row.break_minutes,
    cyclesPlanned: row.cycles_planned,
    chimeEnabled: !!row.chime_enabled,
    notifyEnabled: !!row.notify_enabled,
    trayTimerEnabled: !!row.tray_timer_enabled,
    hotkey: row.hotkey,
  };
}

export function saveSettings(patch: Partial<Settings>) {
  const current = getSettings();
  const next: Settings = { ...current, ...patch } as Settings;
  updateSettingsStmt.run({
    ai_enabled: next.aiEnabled ? 1 : 0,
    work_minutes: next.workMinutes,
    break_minutes: next.breakMinutes,
    cycles_planned: next.cyclesPlanned,
    chime_enabled: next.chimeEnabled ? 1 : 0,
    notify_enabled: next.notifyEnabled ? 1 : 0,
    tray_timer_enabled: next.trayTimerEnabled ? 1 : 0,
    hotkey: next.hotkey,
  });
}

export function saveEncryptedKey(cipher: Buffer | null, encryptedFlag: number) {
  updateCipherStmt.run({ cipher, enc: encryptedFlag });
}

export function getEncryptedKey(): { cipher: Buffer; encrypted: boolean } | null {
  const row: any = getCipherStmt.get();
  if (!row || !row.openai_cipher) return null;
  return { cipher: row.openai_cipher as Buffer, encrypted: !!row.openai_cipher_encrypted };
}

// --- enum mapping helpers ---
const energyMap = { Low: 0, Medium: 1, High: 2 } as const;
const statusMap = { miss: 0, partial: 1, hit: 2 } as const;

const energyFromInt = ['Low', 'Medium', 'High'] as const;
const statusFromInt = ['miss', 'partial', 'hit'] as const;

// --- embedding job helpers ---
// Safe job creation that won't break if embeddings are disabled
function safeCreateFieldEmbedJobs(
  tableName: 'sessions' | 'cycles',
  record: any,
  sessionId: string,
  cycleId?: string
): void {
  try {
    const settings = getSettings();
    if (!settings.aiEnabled) return;
    
    createFieldEmbedJobs(tableName, record, sessionId, cycleId);
  } catch (error) {
    console.error('Failed to create field embedding jobs:', error);
  }
}

function safeCreateCycleEmbedJob(cycleData: any): void {
  try {
    const settings = getSettings();
    if (!settings.aiEnabled) return;
    
    createCycleEmbedJob(cycleData);
  } catch (error) {
    console.error('Failed to create cycle embedding job:', error);
  }
}

function safeCreateSessionEmbedJob(sessionData: any): void {
  try {
    const settings = getSettings();
    if (!settings.aiEnabled) return;
    
    createSessionEmbedJob(sessionData);
  } catch (error) {
    console.error('Failed to create session embedding job:', error);
  }
}

// Periodic cleanup call (can be called from main process)
export function performPeriodicCleanup(): void {
  try {
    const result = performJobCleanup();
    if (result.completedCleaned > 0 || result.errorsCleaned > 0) {
      console.log(`Embedding job cleanup: ${result.completedCleaned} completed, ${result.errorsCleaned} errors removed`);
    }
  } catch (error) {
    console.error('Failed to perform embedding job cleanup:', error);
  }
}

// Bulk job creation for existing data (useful when AI is first enabled)
export function createEmbeddingJobsForExistingData(limit: number = 100): {
  sessionsProcessed: number;
  cyclesProcessed: number;
  jobsCreated: number;
} {
  const settings = getSettings();
  if (!settings.aiEnabled) {
    return { sessionsProcessed: 0, cyclesProcessed: 0, jobsCreated: 0 };
  }
  
  let jobsCreated = 0;
  let sessionsProcessed = 0;
  let cyclesProcessed = 0;
  
  try {
    // Get recent sessions that might not have embedding jobs yet
    const sessions = db.prepare(`
      SELECT * FROM sessions 
      WHERE completed = 1 
      ORDER BY started_at DESC 
      LIMIT ?
    `).all(limit) as any[];
    
    for (const session of sessions) {
      // Create field-level jobs for session planning fields
      const planningRecord = {
        id: session.id,
        plan_objective: session.plan_objective,
        plan_importance: session.plan_importance,
        plan_done_definition: session.plan_done_definition,
        plan_hazards: session.plan_hazards,
        plan_misc_notes: session.plan_misc_notes
      };
      
             safeCreateFieldEmbedJobs('sessions', planningRecord, session.id);
      
      // Create field-level jobs for session review fields
      if (session.review_accomplishments || session.review_comparison || 
          session.review_obstacles || session.review_successes || session.review_takeaways) {
        const reviewRecord = {
          id: session.id,
          review_accomplishments: session.review_accomplishments,
          review_comparison: session.review_comparison,
          review_obstacles: session.review_obstacles,
          review_successes: session.review_successes,
          review_takeaways: session.review_takeaways
        };
        
        safeCreateFieldEmbedJobs('sessions', reviewRecord, session.id);
        
        // Create session-level job
        safeCreateSessionEmbedJob(session);
      }
      
      sessionsProcessed++;
    }
    
    // Get recent cycles
    const cycles = db.prepare(`
      SELECT * FROM cycles 
      WHERE ended_at IS NOT NULL 
      ORDER BY started_at DESC 
      LIMIT ?
    `).all(limit) as any[];
    
    for (const cycle of cycles) {
      // Create field-level jobs for cycle planning fields
      const planningRecord = {
        id: cycle.id,
        session_id: cycle.session_id,
        plan_goal: cycle.plan_goal,
        plan_first_step: cycle.plan_first_step,
        plan_hazards_cycle: cycle.plan_hazards_cycle
      };
      
      safeCreateFieldEmbedJobs('cycles', planningRecord, cycle.session_id, cycle.id);
      
      // Create field-level jobs for cycle review fields
      if (cycle.review_noteworthy || cycle.review_distractions || cycle.review_improvement) {
        const reviewRecord = {
          id: cycle.id,
          session_id: cycle.session_id,
          review_noteworthy: cycle.review_noteworthy,
          review_distractions: cycle.review_distractions,
          review_improvement: cycle.review_improvement
        };
        
        safeCreateFieldEmbedJobs('cycles', reviewRecord, cycle.session_id, cycle.id);
        
        // Create cycle-level job
        safeCreateCycleEmbedJob(cycle);
      }
      
      cyclesProcessed++;
    }
    
    console.log(`Bulk job creation completed: ${sessionsProcessed} sessions, ${cyclesProcessed} cycles processed`);
    
  } catch (error) {
    console.error('Failed to create bulk embedding jobs:', error);
  }
  
  return { sessionsProcessed, cyclesProcessed, jobsCreated };
}

// ---------- API functions ----------
export function insertSession(payload: SessionPayload): string {
  const id = uuid();
  insertSessionStmt.run({ id, ...payload, concrete: payload.concrete ? 1 : 0 });
  
  // Create embedding jobs for session planning fields
  const sessionRecord = {
    id,
    plan_objective: payload.objective,
    plan_importance: payload.importance,
    plan_done_definition: payload.definition_of_done,
    plan_hazards: payload.hazards,
    plan_misc_notes: payload.misc_notes
  };
  
  safeCreateFieldEmbedJobs('sessions', sessionRecord, id);
  
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
    energy: energyMap[payload.energy],
    morale: energyMap[payload.morale],
  });
  
  // Create embedding jobs for cycle planning fields
  const cycleRecord = {
    id,
    session_id: payload.sessionId,
    plan_goal: payload.goal,
    plan_first_step: payload.first_step,
    plan_hazards_cycle: payload.hazards
  };
  
  safeCreateFieldEmbedJobs('cycles', cycleRecord, payload.sessionId, id);
  
  return id;
}

export function finishCycle(payload: CycleFinishPayload) {
  finishCycleStmt.run({
    id: payload.cycleId,
    status: statusMap[payload.status],
    noteworthy: payload.noteworthy,
    distractions: payload.distractions,
    improvement: payload.improvement,
  });

  // Always increment completed count
  incrementCyclesCompletedStmt.run({ id: payload.sessionId });

  if (payload.shouldCompleteSession) {
    markSessionCompletedStmt.run({ id: payload.sessionId });
  }
  
  // Create embedding jobs for cycle review fields
  const cycleReviewRecord = {
    id: payload.cycleId,
    session_id: payload.sessionId,
    review_noteworthy: payload.noteworthy,
    review_distractions: payload.distractions,
    review_improvement: payload.improvement
  };
  
  safeCreateFieldEmbedJobs('cycles', cycleReviewRecord, payload.sessionId, payload.cycleId);
  
  // Create cycle-level embedding job with complete cycle data
  try {
    const settings = getSettings();
    if (settings.aiEnabled) {
      // Get the complete cycle data for the cycle-level embedding
      const fullCycleData = db.prepare(`
        SELECT * FROM cycles WHERE id = ?
      `).get(payload.cycleId) as any;
      
      if (fullCycleData) {
        safeCreateCycleEmbedJob(fullCycleData);
      }
    }
  } catch (error) {
    console.error('Failed to create cycle-level embedding job:', error);
  }
}

export function getSessionById(sessionId: string) {
  const session = getSessionStmt.get(sessionId);
  if (!session) return null;
  const cycles = getCyclesForSessionStmt.all(sessionId).map((row: any) => ({
    ...row,
    goal: row.plan_goal,
    firstStep: row.plan_first_step,
    hazards: row.plan_hazards_cycle,
    energy: energyFromInt[row.plan_energy] as any,
    morale: energyFromInt[row.plan_morale] as any,
    status: row.review_status !== null ? (statusFromInt[row.review_status] as any) : undefined,
    noteworthy: row.review_noteworthy,
    distractions: row.review_distractions,
    improvement: row.review_improvement,
  }));
  return { ...session, cycles };
}

export function listSessionsWithCycles() {
  const sessions = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all();
  return sessions.map((row: any) => {
    const cycles = getCyclesForSessionStmt.all(row.id).map((c: any) => ({
      ...c,
      goal: c.plan_goal,
      firstStep: c.plan_first_step,
      hazards: c.plan_hazards_cycle,
      energy: energyFromInt[c.plan_energy] as any,
      morale: energyFromInt[c.plan_morale] as any,
      status: c.review_status !== null ? (statusFromInt[c.review_status] as any) : undefined,
      noteworthy: c.review_noteworthy,
      distractions: c.review_distractions,
      improvement: c.review_improvement,
    }));
    const intentions = {
      objective: row.plan_objective,
      importance: row.plan_importance,
      definitionOfDone: row.plan_done_definition,
      hazards: row.plan_hazards,
      miscNotes: row.plan_misc_notes,
      concrete: !!row.plan_concrete,
      workMinutes: row.work_minutes,
      breakMinutes: row.break_minutes,
      cyclesPlanned: row.cycles_planned,
    };
    return {
      id: row.id,
      startedAt: (() => {
        const str = typeof row.started_at === 'string' ? row.started_at : '';
        // FIXME: unsure if we should save this data as GMT or localtime
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

// -------- Session Review ---------
export interface SessionReviewPayload {
  accomplishments: string;
  comparison: string;
  obstacles: string;
  successes: string;
  takeaways: string;
}

const saveSessionReviewStmt = db.prepare(`
  UPDATE sessions SET
    review_accomplishments=@accomp,
    review_comparison=@comp,
    review_obstacles=@obs,
    review_successes=@succ,
    review_takeaways=@take,
    completed=1,
    ended_at=datetime('now')
  WHERE id=@id
`);

export function saveSessionReview(id: string, payload: SessionReviewPayload) {
  saveSessionReviewStmt.run({
    id,
    accomp: payload.accomplishments,
    comp: payload.comparison,
    obs: payload.obstacles,
    succ: payload.successes,
    take: payload.takeaways,
  });
  
  // Create embedding jobs for session review fields
  const sessionReviewRecord = {
    id,
    review_accomplishments: payload.accomplishments,
    review_comparison: payload.comparison,
    review_obstacles: payload.obstacles,
    review_successes: payload.successes,
    review_takeaways: payload.takeaways
  };
  
  safeCreateFieldEmbedJobs('sessions', sessionReviewRecord, id);
  
  // Create session-level embedding job with complete session data
  try {
    const settings = getSettings();
    if (settings.aiEnabled) {
      // Get the complete session data for the session-level embedding
      const fullSessionData = db.prepare(`
        SELECT * FROM sessions WHERE id = ?
      `).get(id) as any;
      
      if (fullSessionData) {
        safeCreateSessionEmbedJob(fullSessionData);
      }
    }
  } catch (error) {
    console.error('Failed to create session-level embedding job:', error);
  }
}

// -------- Cycle Notes ---------
export interface CycleNotePayload {
  sessionId: string;
  cycleId: string;
  cycleIdx: number;
  noteType: 'work' | 'distraction';
  entryType: 'voice' | 'manual';
  text: string;
  timestamp: Date;
}

export interface CycleNote {
  id: string;
  sessionId: string;
  cycleId: string;
  cycleIdx: number;
  noteType: 'work' | 'distraction';
  entryType: 'voice' | 'manual';
  text: string;
  timestamp: Date;
  createdAt: Date;
}

const insertCycleNoteStmt = db.prepare(`
  INSERT INTO cycle_notes (
    id, session_id, cycle_id, cycle_idx, note_type, entry_type, text, timestamp
  ) VALUES (
    @id, @session_id, @cycle_id, @cycle_idx, @note_type, @entry_type, @text, @timestamp
  )
`);

const getCycleNotesStmt = db.prepare(`
  SELECT * FROM cycle_notes 
  WHERE session_id = ? AND cycle_id = ? 
  ORDER BY timestamp ASC
`);

const getSessionNotesStmt = db.prepare(`
  SELECT * FROM cycle_notes 
  WHERE session_id = ? 
  ORDER BY cycle_idx ASC, timestamp ASC
`);

const deleteCycleNoteStmt = db.prepare(`
  DELETE FROM cycle_notes WHERE id = ?
`);

const updateCycleNoteStmt = db.prepare(`
  UPDATE cycle_notes SET 
    text = @text
  WHERE id = @id
`);

export function saveCycleNote(payload: CycleNotePayload): string {
  const id = uuid();
  insertCycleNoteStmt.run({
    id,
    session_id: payload.sessionId,
    cycle_id: payload.cycleId,
    cycle_idx: payload.cycleIdx,
    note_type: payload.noteType,
    entry_type: payload.entryType,
    text: payload.text,
    timestamp: payload.timestamp.toISOString(),
  });
  return id;
}

export function getCycleNotes(sessionId: string, cycleId: string): CycleNote[] {
  const rows = getCycleNotesStmt.all(sessionId, cycleId);
  return rows.map((row: any) => ({
    id: row.id,
    sessionId: row.session_id,
    cycleId: row.cycle_id,
    cycleIdx: row.cycle_idx,
    noteType: row.note_type,
    entryType: row.entry_type,
    text: row.text,
    timestamp: new Date(row.timestamp),
    createdAt: new Date(row.created_at),
  }));
}

export function getSessionNotes(sessionId: string): CycleNote[] {
  const rows = getSessionNotesStmt.all(sessionId);
  return rows.map((row: any) => ({
    id: row.id,
    sessionId: row.session_id,
    cycleId: row.cycle_id,
    cycleIdx: row.cycle_idx,
    noteType: row.note_type,
    entryType: row.entry_type,
    text: row.text,
    timestamp: new Date(row.timestamp),
    createdAt: new Date(row.created_at),
  }));
}

export function deleteCycleNote(noteId: string): void {
  deleteCycleNoteStmt.run(noteId);
}

export function updateCycleNote(noteId: string, text: string): void {
  updateCycleNoteStmt.run({
    id: noteId,
    text,
  });
}