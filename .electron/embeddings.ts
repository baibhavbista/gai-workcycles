import path from 'node:path';
import { app } from 'electron';
import { v4 as uuid } from 'uuid';
import { OpenAI } from 'openai';
import { db, getSettings, getEncryptedKey } from './db.js';
import { FIELD_LABEL_MAP, getFieldLabel, isEmbeddableField } from './field-labels.js';
import { safeStorage } from 'electron';

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
  
  await importLanceDB();
  const lanceDir = path.join(app.getPath('userData'), 'lance');
  const lancedb = await lancedbConnect(lanceDir);
  
  try {
    // Try to open existing table
    tablePromise = lancedb.openTable('embeddings');
  } catch {
    // Create new table with schema
    const schema = {
      id: 'string',              // "field:<row>:<col>" | "cycle:<id>" | "session:<id>"
      level: 'string',           // field | cycle | session
      session_id: 'string',
      cycle_id: 'string',        // NULL for sessions
      column: 'string',          // exact SQL column name
      field_label: 'string',     // human-readable question label
      vec: 'vector[1536]',       // OpenAI embedding-3-small dimensions
      text: 'string',
      version: 'int',
      created_at: 'timestamp'
    };
    
    tablePromise = lancedb.createTable('embeddings', [], { schema });
  }
  
  return tablePromise;
}

// Embedding job queue management
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
  const id = uuid();
  
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
  
  const data = JSON.parse(sessionData);
  const prompt = `Summarize this work session in 150 words or less, focusing on key objectives, outcomes, and insights:

Intentions:
- Objective: ${data.intentions.objective}
- Importance: ${data.intentions.importance}
- Definition of Done: ${data.intentions.definitionOfDone}
- Hazards: ${data.intentions.hazards}

Review:
- Accomplishments: ${data.review.accomplishments}
- Comparison to normal output: ${data.review.comparison}
- Obstacles: ${data.review.obstacles}
- Successes: ${data.review.successes}
- Takeaways: ${data.review.takeaways}

Stats: ${data.stats.cyclesCompleted}/${data.stats.cyclesPlanned} cycles completed`;

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

// Get job queue status
export function getJobQueueStatus(): {
  pending: number;
  processing: number;
  total: number;
} {
  const stats = db.prepare(`
    SELECT 
      status,
      COUNT(*) as count
    FROM embed_jobs 
    GROUP BY status
  `).all() as any[];
  
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

// Reset OpenAI client (for settings changes)
export function resetOpenAIClient(): void {
  openaiClient = null;
}

// Cleanup utilities for completed jobs
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