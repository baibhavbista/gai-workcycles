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