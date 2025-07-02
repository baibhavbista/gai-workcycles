const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wc', {
  ping: () => 'pong',
  createSession: (payload) => ipcRenderer.invoke('wc:session-create', payload),
  startCycle: (payload) => ipcRenderer.invoke('wc:cycle-start', payload),
  finishCycle: (payload) => ipcRenderer.invoke('wc:cycle-finish', payload),
  getSession: (sessionId) => ipcRenderer.invoke('wc:get-session', sessionId),
  vectorSearch: (query, k = 5) => ipcRenderer.invoke('wc:vector-search', query, k),
  listSessions: () => ipcRenderer.invoke('wc:list-sessions'),
  getSettings: () => ipcRenderer.invoke('wc:get-settings'),
  saveSettings: (patch) => ipcRenderer.invoke('wc:save-settings', patch),
  saveOpenAIKey: (plainKey) => ipcRenderer.invoke('wc:save-openai-key', plainKey),
  getOpenAIKey: () => ipcRenderer.invoke('wc:get-openai-key'),
  isEncryptionAvailable: () => ipcRenderer.invoke('wc:is-encryption-available'),
  updateTray: (title) => ipcRenderer.invoke('wc:update-tray', title),
  saveSessionReview: (id, review) => ipcRenderer.invoke('wc:session-review-save', id, review),
}); 