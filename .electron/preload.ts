import { contextBridge, ipcRenderer } from 'electron';

// For now we just expose a simple ping method to validate the bridge.
contextBridge.exposeInMainWorld('wc', {
  ping: () => 'pong',
  createSession: (payload: any) => ipcRenderer.invoke('wc:session-create', payload),
  startCycle: (payload: any) => ipcRenderer.invoke('wc:cycle-start', payload),
  finishCycle: (payload: any) => ipcRenderer.invoke('wc:cycle-finish', payload),
  getSession: (sessionId: string) => ipcRenderer.invoke('wc:get-session', sessionId),
}); 