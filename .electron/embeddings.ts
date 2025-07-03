import path from 'node:path';
import { app } from 'electron';
import { v4 as uuid } from 'uuid';
import { OpenAI } from 'openai';
import { getSettings, getEncryptedKey } from './db.ts';
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
  await importLanceDB();
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

// Import the EmbedJob interface from db.ts
export type { EmbedJob } from './db.ts';

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

function fieldValueToPromptValue(value: string): string {
  if (!value) return 'N/A';
  if (value === 'N/A') return 'N/A';
  if (typeof value === 'string' && value.trim() === '') return 'N/A';
  return value;
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

// Reset OpenAI client (for settings changes)
export function resetOpenAIClient(): void {
  openaiClient = null;
} 