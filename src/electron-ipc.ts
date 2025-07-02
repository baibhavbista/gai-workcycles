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