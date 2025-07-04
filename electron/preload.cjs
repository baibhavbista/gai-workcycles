const { contextBridge, ipcRenderer } = require('electron');

// Expose all IPC handlers to the renderer process
contextBridge.exposeInMainWorld('wc', {
  ping: () => 'pong',
  
  // Session management
  createSession: (payload) => ipcRenderer.invoke('wc:session-create', payload),
  startCycle: (payload) => ipcRenderer.invoke('wc:cycle-start', payload),
  finishCycle: (payload) => ipcRenderer.invoke('wc:cycle-finish', payload),
  getSession: (sessionId) => ipcRenderer.invoke('wc:get-session', sessionId),
  listSessions: () => ipcRenderer.invoke('wc:list-sessions'),
  saveSessionReview: (sessionId, review) => ipcRenderer.invoke('wc:session-review-save', sessionId, review),
  
  // Search
  vectorSearch: (query, k) => ipcRenderer.invoke('wc:vector-search', query, k),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('wc:get-settings'),
  saveSettings: (patch) => ipcRenderer.invoke('wc:save-settings', patch),
  saveOpenAIKey: (plainKey) => ipcRenderer.invoke('wc:save-openai-key', plainKey),
  getOpenAIKey: () => ipcRenderer.invoke('wc:get-openai-key'),
  isEncryptionAvailable: () => ipcRenderer.invoke('wc:is-encryption-available'),
  
  // Tray
  updateTray: (title) => ipcRenderer.invoke('wc:update-tray', title),
  
  // Cycle Notes
  saveCycleNote: (payload) => ipcRenderer.invoke('wc:cycle-note-save', payload),
  getCycleNotes: (sessionId, cycleId) => ipcRenderer.invoke('wc:cycle-notes-get', sessionId, cycleId),
  getSessionNotes: (sessionId) => ipcRenderer.invoke('wc:session-notes-get', sessionId),
  deleteCycleNote: (noteId) => ipcRenderer.invoke('wc:cycle-note-delete', noteId),
  updateCycleNote: (noteId, text) => ipcRenderer.invoke('wc:cycle-note-update', noteId, text),
  
  // Embedding System
  embeddingStatus: () => ipcRenderer.invoke('wc:embedding-status'),
  embeddingSearch: (query, options) => ipcRenderer.invoke('wc:embedding-search', query, options),
  embeddingCascadingSearch: (query, userIntent, k) => ipcRenderer.invoke('wc:embedding-cascading-search', query, userIntent, k),
  enhancedSearch: (query, userIntent, options) => ipcRenderer.invoke('wc:enhanced-search', query, userIntent, options),
  enhancedCascadingSearch: (query, userIntent, k, options) => ipcRenderer.invoke('wc:enhanced-cascading-search', query, userIntent, k, options),
  searchSuggestions: (partialQuery, limit) => ipcRenderer.invoke('wc:search-suggestions', partialQuery, limit),
  searchAnalytics: () => ipcRenderer.invoke('wc:search-analytics'),
  embeddingBackfill: (limit) => ipcRenderer.invoke('wc:embedding-backfill', limit),
  
  // Additional Search & Status
  listAllCycles: () => ipcRenderer.invoke('wc:list-all-cycles'),
  getSearchSuggestions: (query) => ipcRenderer.invoke('wc:get-search-suggestions', query),
  getEmbeddingQueueStatus: () => ipcRenderer.invoke('wc:embedding-queue-status'),
  getEmbeddingDbStats: () => ipcRenderer.invoke('wc:embedding-db-stats'),
  triggerEmbeddingBackfill: () => ipcRenderer.invoke('trigger-embedding-backfill'),
  clearEmbeddingCache: () => ipcRenderer.invoke('wc:clear-embedding-cache'),
  clearVectorStore: () => ipcRenderer.invoke('clear-vector-store'),

  // Conversational Agent
  sendMessage: (messages) => ipcRenderer.invoke('agent:sendMessage', messages),
  onResponse: (callback) => {
    const channel = 'agent:onResponse';
    ipcRenderer.on(channel, (_event, response) => callback(response));
    return () => ipcRenderer.removeAllListeners(channel);
  }
}); 