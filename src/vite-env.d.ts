/// <reference types="vite/client" />

interface Window {
  wc?: {
    ping: () => string;
    createSession: (payload: any) => Promise<string>;
    startCycle: (payload: any) => Promise<string>;
    finishCycle: (payload: any) => Promise<{ ok: boolean }>;
    getSession: (sessionId: string) => Promise<any>;
  };
}
