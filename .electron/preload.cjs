const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wc', {
  ping: () => 'pong',
  createSession: (payload) => ipcRenderer.invoke('wc:session-create', payload),
  startCycle: (payload) => ipcRenderer.invoke('wc:cycle-start', payload),
  finishCycle: (payload) => ipcRenderer.invoke('wc:cycle-finish', payload),
  getSession: (sessionId) => ipcRenderer.invoke('wc:get-session', sessionId),
  vectorSearch: (query, k = 5) => ipcRenderer.invoke('wc:vector-search', query, k),
}); 