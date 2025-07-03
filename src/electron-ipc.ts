/* eslint-disable @typescript-eslint/no-explicit-any */
const getApi = () => (typeof window !== 'undefined' ? (window as any).wc : undefined);

export const isElectron = () => getApi() !== undefined;

export const createSession = (payload: any) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.createSession(payload) as Promise<string>;
};

export const startCycle = (payload: any) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.startCycle(payload) as Promise<string>;
};

export const finishCycle = (payload: any) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.finishCycle(payload) as Promise<{ ok: boolean }>;
};

export const getSession = (sessionId: string) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.getSession(sessionId) as Promise<any>;
};

export const vectorSearch = (query: string, k = 5) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.vectorSearch(query, k) as Promise<Array<{ cycleId: string; score: number }>>;
};

export const listSessions = () => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.listSessions() as Promise<any[]>;
};

// -------- settings --------

export const getSettings = () => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.getSettings() as Promise<any>;
};

export const saveSettings = (patch: any) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.saveSettings(patch) as Promise<{ ok: boolean }>;
};

export const saveOpenAIKey = (plainKey: string) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.saveOpenAIKey(plainKey) as Promise<{ ok: boolean }>;
};

export const getOpenAIKey = () => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.getOpenAIKey() as Promise<string | null>;
};

export const isEncryptionAvailable = () => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.isEncryptionAvailable() as Promise<boolean>;
};

// tray title
export const updateTray = (title: string) => {
  const api = getApi();
  if (!api) return; // no-op in web
  // fire and forget
  api.updateTray(title);
};

export const saveSessionReview = (sessionId: string, review: any) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.saveSessionReview(sessionId, review) as Promise<{ ok: boolean }>;
};

// -------- Cycle Notes --------

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

export const saveCycleNote = (payload: CycleNotePayload) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.saveCycleNote(payload) as Promise<string>;
};

export const getCycleNotes = (sessionId: string, cycleId: string) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.getCycleNotes(sessionId, cycleId) as Promise<CycleNote[]>;
};

export const getSessionNotes = (sessionId: string) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.getSessionNotes(sessionId) as Promise<CycleNote[]>;
};

export const deleteCycleNote = (noteId: string) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.deleteCycleNote(noteId) as Promise<{ ok: boolean }>;
};

export const updateCycleNote = (noteId: string, text: string) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.updateCycleNote(noteId, text) as Promise<{ ok: boolean }>;
};

// -------- Embedding Search --------

export const embeddingSearch = (query: string, options?: any) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.embeddingSearch(query, options) as Promise<any[]>;
};

export const embeddingCascadingSearch = (query: string, userIntent: string, k = 8) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.embeddingCascadingSearch(query, userIntent, k) as Promise<any[]>;
};

export const listAllCycles = () => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.listAllCycles() as Promise<any[]>;
};

export const getSearchSuggestions = (query: string) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.getSearchSuggestions(query) as Promise<string[]>;
};

// -------- Embedding Status --------

export const getEmbeddingStatus = () => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.getEmbeddingStatus() as Promise<any>;
};

export const getEmbeddingQueueStatus = () => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.getEmbeddingQueueStatus() as Promise<any>;
};

export const getEmbeddingDbStats = () => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.getEmbeddingDbStats() as Promise<any>;
};

export const triggerEmbeddingBackfill = (limit = 100) => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.triggerEmbeddingBackfill(limit) as Promise<{ ok: boolean }>;
};

export const clearEmbeddingCache = () => {
  const api = getApi();
  if (!api) throw new Error('Electron API not available');
  return api.clearEmbeddingCache() as Promise<{ ok: boolean }>;
}; 