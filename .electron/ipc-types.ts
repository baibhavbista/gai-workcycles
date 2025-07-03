// IPC Types for Embedding System
// These types help ensure type safety between main and renderer processes

export interface EmbeddingStatus {
  isProcessing: boolean;
  queueStatus: {
    pending: number;
    processing: number;
    total: number;
  };
  statistics: {
    pending: number;
    processing: number;
    done: number;
    error: number;
  };
}

export interface EmbeddingSearchOptions {
  level?: 'field' | 'cycle' | 'session';
  sessionId?: string;
  limit?: number;
}

export interface EmbeddingSearchResult {
  id: string;
  level: string;
  session_id: string;
  cycle_id?: string;
  column?: string;
  field_label?: string;
  text: string;
  score?: number;
  _distance?: number;
}

export interface BackfillResult {
  sessionsProcessed: number;
  cyclesProcessed: number;
  jobsCreated: number;
}

// IPC Channel Names for Embedding System
export const EMBEDDING_IPC_CHANNELS = {
  GET_STATUS: 'wc:embedding-status',
  SEARCH: 'wc:embedding-search',
  CASCADING_SEARCH: 'wc:embedding-cascading-search',
  BACKFILL: 'wc:embedding-backfill',
  VECTOR_SEARCH: 'wc:vector-search', // Legacy compatibility
} as const;

// Helper type for IPC calls
export type EmbeddingIPC = {
  [EMBEDDING_IPC_CHANNELS.GET_STATUS]: () => Promise<EmbeddingStatus>;
  [EMBEDDING_IPC_CHANNELS.SEARCH]: (query: string, options?: EmbeddingSearchOptions) => Promise<EmbeddingSearchResult[]>;
  [EMBEDDING_IPC_CHANNELS.CASCADING_SEARCH]: (query: string, userIntent: string, k?: number) => Promise<EmbeddingSearchResult[]>;
  [EMBEDDING_IPC_CHANNELS.BACKFILL]: (limit?: number) => Promise<BackfillResult>;
  [EMBEDDING_IPC_CHANNELS.VECTOR_SEARCH]: (query: string, k?: number) => Promise<EmbeddingSearchResult[]>;
}; 