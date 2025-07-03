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

export interface EnhancedSearchResult {
  id: string;
  level: 'field' | 'cycle' | 'session';
  sessionId: string;
  cycleId?: string;
  column?: string;
  fieldLabel?: string;
  text: string;
  snippet?: string;
  vectorScore: number;
  compositeScore: number;
  rank: number;
  context?: {
    session?: any;
    cycle?: any;
    relatedResults?: string[];
  };
  metadata?: {
    createdAt: Date;
    sessionStartedAt?: Date;
    cycleStartedAt?: Date;
    sessionStatus?: string;
    cycleStatus?: string;
    sessionObjective?: string;
    cycleObjective?: string;
    sessionDuration?: number;
    cycleDuration?: number;
    successRate?: number;
    cycleNumber?: number;
    totalCycles?: number;
  };
}

export interface SearchOptions {
  limit?: number;
  filters?: {
    level?: 'field' | 'cycle' | 'session';
    sessionId?: string;
    cycleId?: string;
    dateRange?: {
      start: Date;
      end: Date;
    };
    sessionStatus?: 'active' | 'completed' | 'cancelled';
    cycleStatus?: 'hit' | 'miss' | 'skip';
    contentType?: 'planning' | 'review' | 'reflection' | 'notes';
    minScore?: number;
  };
  deduplication?: 'none' | 'semantic' | 'hierarchical';
  includeContext?: boolean;
  includeSnippets?: boolean;
  groupBySession?: boolean;
  groupByCycle?: boolean;
}

export interface SearchAnalytics {
  totalSearches: number;
  recentSearches: number;
  avgResultsPerSearch: number;
  commonQueries: Array<{query: string, count: number}>;
  searchTrends: Array<{date: string, count: number}>;
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
  // Enhanced search channels
  ENHANCED_SEARCH: 'wc:enhanced-search',
  ENHANCED_CASCADING_SEARCH: 'wc:enhanced-cascading-search',
  SEARCH_SUGGESTIONS: 'wc:search-suggestions',
  SEARCH_ANALYTICS: 'wc:search-analytics',
} as const;

// Helper type for IPC calls
export type EmbeddingIPC = {
  [EMBEDDING_IPC_CHANNELS.GET_STATUS]: () => Promise<EmbeddingStatus>;
  [EMBEDDING_IPC_CHANNELS.SEARCH]: (query: string, options?: EmbeddingSearchOptions) => Promise<EmbeddingSearchResult[]>;
  [EMBEDDING_IPC_CHANNELS.CASCADING_SEARCH]: (query: string, userIntent: string, k?: number) => Promise<EmbeddingSearchResult[]>;
  [EMBEDDING_IPC_CHANNELS.BACKFILL]: (limit?: number) => Promise<BackfillResult>;
  [EMBEDDING_IPC_CHANNELS.VECTOR_SEARCH]: (query: string, k?: number) => Promise<EmbeddingSearchResult[]>;
  // Enhanced search methods
  [EMBEDDING_IPC_CHANNELS.ENHANCED_SEARCH]: (query: string, userIntent?: string, options?: SearchOptions) => Promise<EnhancedSearchResult[]>;
  [EMBEDDING_IPC_CHANNELS.ENHANCED_CASCADING_SEARCH]: (query: string, userIntent: string, k?: number, options?: SearchOptions) => Promise<EnhancedSearchResult[]>;
  [EMBEDDING_IPC_CHANNELS.SEARCH_SUGGESTIONS]: (partialQuery: string, limit?: number) => Promise<string[]>;
  [EMBEDDING_IPC_CHANNELS.SEARCH_ANALYTICS]: () => Promise<SearchAnalytics>;
}; 