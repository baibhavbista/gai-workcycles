import path from 'node:path';
import { app } from 'electron';

// Lazy imports because lancedb and transformers are ESM and somewhat heavy
let lancedbConnect: any;
let pipeline: any;

async function importDeps() {
  if (!lancedbConnect) {
    const lancedb = await import('@lancedb/lancedb');
    lancedbConnect = lancedb.connect;
  }
  if (!pipeline) {
    const tjs = await import('@xenova/transformers');
    pipeline = tjs.pipeline;
  }
}

let tablePromise: Promise<any> | null = null;
let embedderPromise: Promise<any> | null = null;

async function getTable() {
  if (tablePromise) return tablePromise;
  await importDeps();
  const dir = path.join(app.getPath('userData'), 'lance');
  const db = await lancedbConnect(dir);
  try {
    // Create table by providing a single dummy row so LanceDB can infer types
    const dummyVec = new Array(384).fill(0);
    const dummy = [{
      cycle_id: 'dummy',
      embedding: dummyVec,
      energy: 'High',
      morale: 'High',
      goal: 'init',
    }];
    tablePromise = await db.createTable('cycles', dummy, { mode: 'overwrite' });
  } catch {
    const schema = {
      cycle_id: 'string',
      embedding: 'vector[384]',
      energy: 'string',
      morale: 'string',
      goal: 'string',
    } as any;
    tablePromise = await db.createTable('cycles', [], { schema });
  }
  return tablePromise;
}

async function getEmbedder() {
  if (embedderPromise) return embedderPromise;
  await importDeps();
  // FIXME: Consider this vs mixedbread-ai/mxbai-embed-xsmall-v1 vs just using openai embeddings
  // FIXME: not sure if this is working
  // FIXME:I think I will have to quantize all form elements separately?
  embedderPromise = pipeline('feature-extraction', 'sentence-transformers/all-MiniLM-L6-v2', {
    // revision: 'onnx', // official IR8 ONNX weights compatible with ORT 1.22
    quantized: false,
  });
  return embedderPromise;
}

async function embed(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

export interface IndexPayload {
  cycleId: string;
  text: string;
  energy: string;
  morale: string;
}

export async function indexCycleEmbedding(payload: IndexPayload) {
  try {
    const vec = await embed(payload.text);
    const table = await getTable();
    await table.add([{ cycle_id: payload.cycleId, embedding: vec, energy: payload.energy, morale: payload.morale, goal: payload.text }]);
  } catch (err) {
    console.error('Failed to index embedding', err);
  }
}

export async function searchSimilar(queryText: string, k = 5) {
  const vec = await embed(queryText);
  const table = await getTable();
  const res = await table.search(vec).limit(k).execute();
  return res.rows?.map((row: any) => ({ cycleId: row.cycle_id, score: row._distance ?? row.score ?? 0 })) ?? [];
}

export async function setupVectorTable() {
  await getTable();
} 