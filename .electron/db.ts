import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { v4 as uuid } from 'uuid';
import { FIELD_LABEL_MAP, getFieldLabel, isEmbeddableField } from './field-labels.ts';
import { OpenAI } from 'openai';
import { safeStorage } from 'electron';

import {
  Field,
  Schema,
  Utf8,
  Int32,
  TimestampMillisecond,
  Float32,
  FixedSizeList
} from 'apache-arrow';

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

// ---------- OpenAI and LanceDB setup ----------

// OpenAI embedding-3-small dimensions
const embeddingDimension = 1536;
const vectorField = new Field(
  'vec',
  new FixedSizeList(embeddingDimension, new Field('item', new Float32())),
  false
);

// Define the full schema
const arrowSchema = new Schema([
  new Field('id', new Utf8(), false),          // "field:<row>:<col>" | "cycle:<id>" | "session:<id>"
  new Field('level', new Utf8(), false),       // field | cycle | session
  new Field('session_id', new Utf8(), false),
  new Field('cycle_id', new Utf8(), true),     // NULL for sessions
  new Field('column', new Utf8(), true),      // exact SQL column name. NULL for session  
  new Field('field_label', new Utf8(), true), // human-readable question label
  vectorField,
  new Field('text', new Utf8(), false),
  new Field('version', new Int32(), false),
  new Field('created_at', new TimestampMillisecond(), false)
]);

// Lazy imports for LanceDB
let lancedbConnect: any;

async function importLanceDB() {
  if (!lancedbConnect) {
    const lancedb = await import('@lancedb/lancedb');
    lancedbConnect = lancedb.connect;
  }
}

// OpenAI client setup
let openaiClient: OpenAI | null = null;

async function getOpenAIClient(): Promise<OpenAI | null> {
  if (openaiClient) return openaiClient;
  
  const settings = getSettings();
  if (!settings.aiEnabled) return null;
  
  const keyData = getEncryptedKey();
  if (!keyData) return null;
  
  try {
    const apiKey = keyData.encrypted 
      ? safeStorage.decryptString(keyData.cipher).trim()
      : keyData.cipher.toString('utf-8').trim();
    
    openaiClient = new OpenAI({ apiKey });
    return openaiClient;
  } catch (error) {
    console.error('Failed to initialize OpenAI client:', error);
    return null;
  }
}

// LanceDB table management
let tablePromise: Promise<any> | null = null;

async function getEmbeddingTable() {
  if (tablePromise) return tablePromise;
  
  // Create the promise for table initialization
  tablePromise = initializeTable();
  return tablePromise;
}

async function initializeTable() {
  console.log('Initializing LanceDB table...');
  await importLanceDB();
  console.log('Initializing LanceDB table... 2');
  const lanceDir = path.join(app.getPath('userData'), 'lance');
  const lancedb = await lancedbConnect(lanceDir);
  
  try {
    // Try to open existing table
    console.log('Attempting to open existing LanceDB table...');
    const table = await lancedb.openTable('embeddings');
    console.log('Successfully opened existing LanceDB table');
    return table;
  } catch (error) {
    console.log('Table does not exist, creating new LanceDB table...', error);
    // unsure if we should have mode: 'overwrite' below
    const table = await lancedb.createTable('embeddings', [], { schema: arrowSchema, mode: 'overwrite' });
    console.log('Successfully created new LanceDB table');
    return table;
  }
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

// -------- Embedding Job Management --------

// Embedding job interface
export interface EmbedJob {
  id: string;
  level: 'field' | 'cycle' | 'session';
  sessionId: string;
  cycleId?: string;
  tableName: string;
  rowId: string;
  columnName?: string;
  fieldLabel?: string;
  text: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMessage?: string;
  version: number;
  createdAt: Date;
  processedAt?: Date;
}

// Prepared statements for embed jobs
const insertEmbedJobStmt = db.prepare(`
  INSERT INTO embed_jobs (
    id, level, session_id, cycle_id, table_name, row_id, column_name, field_label, text, status, version
  ) VALUES (
    @id, @level, @session_id, @cycle_id, @table_name, @row_id, @column_name, @field_label, @text, @status, @version
  )
`);

const checkJobExistsStmt = db.prepare(`
  SELECT COUNT(*) as count FROM embed_jobs WHERE id = ?
`);

const getPendingJobsStmt = db.prepare(`
  SELECT * FROM embed_jobs 
  WHERE status = 'pending' 
  ORDER BY level, created_at ASC
  LIMIT ?
`);

const updateJobStatusStmt = db.prepare(`
  UPDATE embed_jobs 
  SET status = @status, error_message = @error_message, processed_at = datetime('now')
  WHERE id = @id
`);

const markJobProcessingStmt = db.prepare(`
  UPDATE embed_jobs 
  SET status = 'processing'
  WHERE id = @id
`);

const cleanupCompletedJobsStmt = db.prepare(`
  DELETE FROM embed_jobs 
  WHERE status = 'done' AND processed_at < datetime('now', '-7 days')
`);

const cleanupErrorJobsStmt = db.prepare(`
  DELETE FROM embed_jobs 
  WHERE status = 'error' AND created_at < datetime('now', '-30 days')
`);

const countJobsByStatusStmt = db.prepare(`
  SELECT status, COUNT(*) as count 
  FROM embed_jobs 
  GROUP BY status
`);

// Check if embedding job already exists in embed_jobs table
function jobExists(id: string): boolean {
  const result = checkJobExistsStmt.get(id) as { count: number };
  return result.count > 0;
}

// Check if embedding already exists in LanceDB
async function embeddingExists(id: string): Promise<boolean> {
  try {
    return await checkEmbeddingExists(id);
  } catch (error) {
    console.warn('Could not check embedding existence:', error);
    return false;
  }
}

// Create embedding job
export function createEmbedJob(
  level: 'field' | 'cycle' | 'session',
  sessionId: string,
  tableName: string,
  rowId: string,
  text: string,
  options: {
    cycleId?: string;
    columnName?: string;
    fieldLabel?: string;
  } = {}
): string {
  let id: string;
  if (level === 'field') {
    id = `field:${rowId}:${options.columnName}`;
  } else if (level === 'cycle') {
    id = `cycle:${options.cycleId}`;
  } else if (level === 'session') {
    id = `session:${sessionId}`;
  } else {
    console.error('Invalid level when generating embedding-id:', level);
    id = uuid();
  }
  
  insertEmbedJobStmt.run({
    id,
    level,
    session_id: sessionId,
    cycle_id: options.cycleId || null,
    table_name: tableName,
    row_id: rowId,
    column_name: options.columnName || null,
    field_label: options.fieldLabel || null,
    text,
    status: 'pending',
    version: 1
  });
  
  return id;
}

// Create embedding job with conservative duplicate checking
export async function createEmbedJobSafe(
  level: 'field' | 'cycle' | 'session',
  sessionId: string,
  tableName: string,
  rowId: string,
  text: string,
  options: {
    cycleId?: string;
    columnName?: string;
    fieldLabel?: string;
  } = {}
): Promise<string | null> {
  // Generate the deterministic ID
  let id: string;
  if (level === 'field') {
    id = `field:${rowId}:${options.columnName}`;
  } else if (level === 'cycle') {
    id = `cycle:${options.cycleId}`;
  } else if (level === 'session') {
    id = `session:${sessionId}`;
  } else {
    console.error('Invalid level when generating embedding-id:', level);
    return null;
  }
  
  // Check 1: Does job already exist in embed_jobs?
  if (jobExists(id)) {
    console.log(`Embedding job already exists: ${id}`);
    return null;
  }
  
  // Check 2: Does embedding already exist in LanceDB?
  if (await embeddingExists(id)) {
    console.log(`Embedding already exists in LanceDB: ${id}`);
    return null;
  }
  
  // Safe to create the job
  return createEmbedJob(level, sessionId, tableName, rowId, text, options);
}

// Create field-level embedding jobs for a record
export function createFieldEmbedJobs(
  tableName: 'sessions' | 'cycles',
  record: any,
  sessionId: string,
  cycleId?: string
): string[] {
  const jobs: string[] = [];
  
  for (const [column, value] of Object.entries(record)) {
    if (!value || typeof value !== 'string' || !isEmbeddableField(column)) {
      continue;
    }
    
    const fieldLabel = getFieldLabel(column);
    if (!fieldLabel) continue;
    
    const jobId = createEmbedJob('field', sessionId, tableName, record.id, value, {
      cycleId,
      columnName: column,
      fieldLabel
    });
    
    jobs.push(jobId);
  }
  
  return jobs;
}

// Create field-level embedding jobs with duplicate checking
export async function createFieldEmbedJobsSafe(
  tableName: 'sessions' | 'cycles',
  record: any,
  sessionId: string,
  cycleId?: string
): Promise<string[]> {
  const jobs: string[] = [];
  
  for (const [column, value] of Object.entries(record)) {
    if (!value || typeof value !== 'string' || !isEmbeddableField(column)) {
      continue;
    }
    
    const fieldLabel = getFieldLabel(column);
    if (!fieldLabel) continue;
    
    const jobId = await createEmbedJobSafe('field', sessionId, tableName, record.id, value, {
      cycleId,
      columnName: column,
      fieldLabel
    });
    
    if (jobId) {
      jobs.push(jobId);
    }
  }
  
  return jobs;
}

// Create cycle-level embedding job
export function createCycleEmbedJob(cycleData: any): string {
  // Combine planning and review fields into cycle summary
  const planText = [
    cycleData.plan_goal && `Goal: ${cycleData.plan_goal}`,
    cycleData.plan_first_step && `First step: ${cycleData.plan_first_step}`,
    cycleData.plan_hazards_cycle && `Hazards: ${cycleData.plan_hazards_cycle}`,
    cycleData.plan_energy && `Energy: ${['Low', 'Medium', 'High'][cycleData.plan_energy]}`,
    cycleData.plan_morale && `Morale: ${['Low', 'Medium', 'High'][cycleData.plan_morale]}`
  ].filter(Boolean).join('. ');
  
  const reviewText = [
    cycleData.review_status !== null && `Status: ${['miss', 'partial', 'hit'][cycleData.review_status]}`,
    cycleData.review_noteworthy && `Noteworthy: ${cycleData.review_noteworthy}`,
    cycleData.review_distractions && `Distractions: ${cycleData.review_distractions}`,
    cycleData.review_improvement && `Improvement: ${cycleData.review_improvement}`
  ].filter(Boolean).join('. ');
  
  const fullText = `START: ${planText} END: ${reviewText}`;
  
  return createEmbedJob('cycle', cycleData.session_id, 'cycles', cycleData.id, fullText, {
    cycleId: cycleData.id
  });
}

// Create cycle-level embedding job with duplicate checking
export async function createCycleEmbedJobSafe(cycleData: any): Promise<string | null> {
  // Combine planning and review fields into cycle summary
  const planText = [
    cycleData.plan_goal && `Goal: ${cycleData.plan_goal}`,
    cycleData.plan_first_step && `First step: ${cycleData.plan_first_step}`,
    cycleData.plan_hazards_cycle && `Hazards: ${cycleData.plan_hazards_cycle}`,
    cycleData.plan_energy && `Energy: ${['Low', 'Medium', 'High'][cycleData.plan_energy]}`,
    cycleData.plan_morale && `Morale: ${['Low', 'Medium', 'High'][cycleData.plan_morale]}`
  ].filter(Boolean).join('. ');
  
  const reviewText = [
    cycleData.review_status !== null && `Status: ${['miss', 'partial', 'hit'][cycleData.review_status]}`,
    cycleData.review_noteworthy && `Noteworthy: ${cycleData.review_noteworthy}`,
    cycleData.review_distractions && `Distractions: ${cycleData.review_distractions}`,
    cycleData.review_improvement && `Improvement: ${cycleData.review_improvement}`
  ].filter(Boolean).join('. ');
  
  const fullText = `START: ${planText} END: ${reviewText}`;
  
  return await createEmbedJobSafe('cycle', cycleData.session_id, 'cycles', cycleData.id, fullText, {
    cycleId: cycleData.id
  });
}

// Create session-level embedding job (will need GPT summary)
export function createSessionEmbedJob(sessionData: any): string {
  // This will be processed by the worker with GPT-4o-mini summarization
  const rawText = JSON.stringify({
    intentions: {
      objective: sessionData.plan_objective,
      importance: sessionData.plan_importance,
      definitionOfDone: sessionData.plan_done_definition,
      hazards: sessionData.plan_hazards,
      miscNotes: sessionData.plan_misc_notes
    },
    review: {
      accomplishments: sessionData.review_accomplishments,
      comparison: sessionData.review_comparison,
      obstacles: sessionData.review_obstacles,
      successes: sessionData.review_successes,
      takeaways: sessionData.review_takeaways
    },
    stats: {
      cyclesPlanned: sessionData.cycles_planned,
      cyclesCompleted: sessionData.cycles_completed,
      workMinutes: sessionData.work_minutes
    }
  });
  
  return createEmbedJob('session', sessionData.id, 'sessions', sessionData.id, rawText);
}

// Create session-level embedding job with duplicate checking
export async function createSessionEmbedJobSafe(sessionData: any): Promise<string | null> {
  // This will be processed by the worker with GPT-4o-mini summarization
  const rawText = JSON.stringify({
    intentions: {
      objective: sessionData.plan_objective,
      importance: sessionData.plan_importance,
      definitionOfDone: sessionData.plan_done_definition,
      hazards: sessionData.plan_hazards,
      miscNotes: sessionData.plan_misc_notes
    },
    review: {
      accomplishments: sessionData.review_accomplishments,
      comparison: sessionData.review_comparison,
      obstacles: sessionData.review_obstacles,
      successes: sessionData.review_successes,
      takeaways: sessionData.review_takeaways
    },
    stats: {
      cyclesPlanned: sessionData.cycles_planned,
      cyclesCompleted: sessionData.cycles_completed,
      workMinutes: sessionData.work_minutes
    }
  });
  
  return await createEmbedJobSafe('session', sessionData.id, 'sessions', sessionData.id, rawText);
}

// Get pending jobs for processing
export function getPendingEmbedJobs(limit: number = 10): EmbedJob[] {
  const rows = getPendingJobsStmt.all(limit);
  return rows.map((row: any) => ({
    id: row.id,
    level: row.level,
    sessionId: row.session_id,
    cycleId: row.cycle_id,
    tableName: row.table_name,
    rowId: row.row_id,
    columnName: row.column_name,
    fieldLabel: row.field_label,
    text: row.text,
    status: row.status,
    errorMessage: row.error_message,
    version: row.version,
    createdAt: new Date(row.created_at),
    processedAt: row.processed_at ? new Date(row.processed_at) : undefined
  }));
}

// Mark job as processing
export function markJobProcessing(jobId: string): void {
  markJobProcessingStmt.run({ id: jobId });
}

// Update job status
export function updateJobStatus(jobId: string, status: 'done' | 'error', errorMessage?: string): void {
  updateJobStatusStmt.run({
    id: jobId,
    status,
    error_message: errorMessage || null
  });
}

// Get job queue status
export function getJobQueueStatus(): {
  pending: number;
  processing: number;
  total: number;
} {
  const stats = countJobsByStatusStmt.all() as any[];
  
  const counts = { pending: 0, processing: 0, done: 0, error: 0 };
  stats.forEach(row => {
    counts[row.status as keyof typeof counts] = row.count;
  });
  
  return {
    pending: counts.pending,
    processing: counts.processing,
    total: counts.pending + counts.processing + counts.done + counts.error
  };
}

// Clean up old completed jobs (older than 7 days)
export function cleanupCompletedJobs(): number {
  const result = cleanupCompletedJobsStmt.run();
  return result.changes;
}

// Clean up old error jobs (older than 30 days)
export function cleanupErrorJobs(): number {
  const result = cleanupErrorJobsStmt.run();
  return result.changes;
}

// Get job statistics
export function getJobStatistics(): Record<string, number> {
  const rows = countJobsByStatusStmt.all() as any[];
  const stats: Record<string, number> = { pending: 0, processing: 0, done: 0, error: 0 };
  
  rows.forEach(row => {
    stats[row.status] = row.count;
  });
  
  return stats;
}

// Comprehensive cleanup (run periodically)
export function performJobCleanup(): {
  completedCleaned: number;
  errorsCleaned: number;
  totalRemaining: number;
} {
  const completedCleaned = cleanupCompletedJobs();
  const errorsCleaned = cleanupErrorJobs();
  const stats = getJobStatistics();
  const totalRemaining = Object.values(stats).reduce((sum, count) => sum + count, 0);
  
  return {
    completedCleaned,
    errorsCleaned,
    totalRemaining
  };
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
export async function createEmbeddingJobsForExistingData(limit: number = 100): Promise<{
  sessionsProcessed: number;
  cyclesProcessed: number;
  jobsCreated: number;
}> {
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
      
      const planningJobs = await createFieldEmbedJobsSafe('sessions', planningRecord, session.id);
      jobsCreated += planningJobs.length;
      
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
        
        const reviewJobs = await createFieldEmbedJobsSafe('sessions', reviewRecord, session.id);
        jobsCreated += reviewJobs.length;
        
        // Create session-level job
        const sessionJob = await createSessionEmbedJobSafe(session);
        if (sessionJob) jobsCreated++;
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
      
      const planningJobs = await createFieldEmbedJobsSafe('cycles', planningRecord, cycle.session_id, cycle.id);
      jobsCreated += planningJobs.length;
      
      // Create field-level jobs for cycle review fields
      if (cycle.review_noteworthy || cycle.review_distractions || cycle.review_improvement) {
        const reviewRecord = {
          id: cycle.id,
          session_id: cycle.session_id,
          review_noteworthy: cycle.review_noteworthy,
          review_distractions: cycle.review_distractions,
          review_improvement: cycle.review_improvement
        };
        
        const reviewJobs = await createFieldEmbedJobsSafe('cycles', reviewRecord, cycle.session_id, cycle.id);
        jobsCreated += reviewJobs.length;
        
        // Create cycle-level job
        const cycleJob = await createCycleEmbedJobSafe(cycle);
        if (cycleJob) jobsCreated++;
      }
      
      cyclesProcessed++;
    }
    
    console.log(`Bulk job creation completed: ${sessionsProcessed} sessions, ${cyclesProcessed} cycles processed, ${jobsCreated} jobs created`);
    
  } catch (error) {
    console.error('Failed to create bulk embedding jobs:', error);
  }
  
  return { sessionsProcessed, cyclesProcessed, jobsCreated };
}

// ---------- OpenAI and LanceDB functions ----------

function fieldValueToPromptValue(value: string): string {
  if (!value) return 'N/A';
  if (value === 'N/A') return 'N/A';
  if (typeof value === 'string' && value.trim() === '') return 'N/A';
  return value;
}

// Generate OpenAI embeddings
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = await getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI client not available');
  }
  
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float'
  });
  
  return response.data[0].embedding;
}

// Generate GPT-4o-mini summary for sessions
export async function generateSessionSummary(sessionData: any): Promise<string> {
  const client = await getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI client not available');
  }

  // FIXME: maybe also include the cycle notes here
  
  const data = JSON.parse(sessionData);
  const prompt = `Summarize this work session in 150 words or less, focusing on key objectives, outcomes, and insights:

Intentions:
- Objective: ${fieldValueToPromptValue(data.intentions.objective)}
- Importance: ${fieldValueToPromptValue(data.intentions.importance)}
- Definition of Done: ${fieldValueToPromptValue(data.intentions.definitionOfDone)}
- Hazards: ${fieldValueToPromptValue(data.intentions.hazards)}

Review:
- Accomplishments: ${fieldValueToPromptValue(data.review.accomplishments)}
- Comparison to normal output: ${fieldValueToPromptValue(data.review.comparison)}
- Obstacles: ${fieldValueToPromptValue(data.review.obstacles)}
- Successes: ${fieldValueToPromptValue(data.review.successes)}
- Takeaways: ${fieldValueToPromptValue(data.review.takeaways)}

Stats: ${data.stats.cyclesCompleted}/${data.stats.cyclesPlanned} cycles completed; Worked for ${(data.stats.workMinutes * data.stats.cyclesCompleted)} minutes total

If any of the above fields say N/A, it means that the user did not fill in that field.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
    temperature: 0.3
  });
  
  return response.choices[0].message.content || '';
}

// Store embedding in LanceDB
export async function storeEmbedding(
  id: string,
  level: 'field' | 'cycle' | 'session',
  sessionId: string,
  text: string,
  embedding: number[],
  metadata: {
    cycleId?: string;
    column?: string;
    fieldLabel?: string;
  } = {}
): Promise<void> {
  const table = await getEmbeddingTable();
  
  const record = {
    id,
    level,
    session_id: sessionId,
    cycle_id: metadata.cycleId || null,
    column: metadata.column || null,
    field_label: metadata.fieldLabel || null,
    vec: embedding,
    text,
    version: 1,
    created_at: new Date()
  };
  
  await table.add([record]);
}

// Search embeddings
export async function searchEmbeddings(
  queryText: string,
  options: {
    level?: 'field' | 'cycle' | 'session';
    sessionId?: string;
    limit?: number;
  } = {}
): Promise<any[]> {
  const queryEmbedding = await generateEmbedding(queryText);
  const table = await getEmbeddingTable();
  
  let query = table.search(queryEmbedding);
  
  if (options.level) {
    query = query.where({ level: options.level });
  }
  
  if (options.sessionId) {
    query = query.where({ session_id: options.sessionId });
  }
  
  const results = await query.limit(options.limit || 10).execute();
  return results.rows || [];
}

// Cascading search implementation from the plan
export async function cascadingSearch(
  queryText: string,
  userIntent: string,
  k: number = 8
): Promise<any[]> {
  const queryEmbedding = await generateEmbedding(queryText);
  const table = await getEmbeddingTable();
  
  // Determine search order based on user intent
  const preference = /overall|trend|summary/i.test(userIntent)
    ? ['session', 'cycle', 'field']   // coarse first
    : ['field', 'cycle', 'session'];  // fine first
  
  for (const level of preference) {
    const results = await table
      .search(queryEmbedding)
      .where({ level })
      .limit(k)
      .execute();
    
    if (results.rows && results.rows.length > 0) {
      // Deduplicate by session_id/cycle_id
      const seen = new Set();
      const dedupedResults = results.rows.filter((row: any) => {
        const key = level === 'session' ? row.session_id : row.cycle_id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      
      if (dedupedResults.length > 0) {
        return dedupedResults;
      }
    }
  }
  
  return [];
}

// Check if embedding exists in LanceDB
export async function checkEmbeddingExists(id: string): Promise<boolean> {
  try {
    const table = await getEmbeddingTable();
    const results = await table
      .search([0]) // dummy vector, we just want to check if ID exists
      .where({ id })
      .limit(1)
      .execute();
    
    return results.rows && results.rows.length > 0;
  } catch (error) {
    console.error('Failed to check if embedding exists:', error);
    return false;
  }
}

// Reset OpenAI client (for settings changes)
export function resetOpenAIClient(): void {
  openaiClient = null;
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