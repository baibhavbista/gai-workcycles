// Enhanced Search Engine - Phase 5
import { generateEmbedding, searchEmbeddings, getSessionById } from './db.ts';
import { calculateCompositeScore, RankingConfig } from './search-ranking.ts';
import { deduplicateResults, DeduplicationStrategy } from './search-deduplication.ts';
import { enrichSearchResults } from './search-enrichment.ts';

export interface SearchFilter {
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
  boost?: {
    recency?: number;
    level?: Record<string, number>;
    status?: Record<string, number>;
  };
}

export interface SearchOptions {
  limit?: number;
  filters?: SearchFilter;
  deduplication?: DeduplicationStrategy;
  ranking?: RankingConfig;
  includeContext?: boolean;
  includeSnippets?: boolean;
  groupBySession?: boolean;
  groupByCycle?: boolean;
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

export interface SearchResultGroup {
  type: 'session' | 'cycle' | 'mixed';
  key: string;
  label: string;
  results: EnhancedSearchResult[];
  score: number;
  totalResults: number;
}

export class EnhancedSearchEngine {
  private searchHistory: Array<{
    query: string;
    timestamp: Date;
    resultCount: number;
    userIntent?: string;
  }> = [];

  /**
   * Main search method with enhanced capabilities
   */
  async search(
    query: string,
    userIntent?: string,
    options: SearchOptions = {}
  ): Promise<EnhancedSearchResult[]> {
    const startTime = Date.now();
    
    // Record search for analytics
    this.recordSearch(query, userIntent);
    
    // Step 1: Get raw vector search results
    const rawResults = await this.getRawSearchResults(query, options);
    
    if (rawResults.length === 0) {
      return [];
    }
    
    // Step 2: Apply filters
    const filteredResults = await this.applyFilters(rawResults, options.filters);
    
    // Step 3: Calculate composite scores
    const rankedResults = await this.calculateRanking(filteredResults, query, options.ranking);
    
    // Step 4: Apply deduplication
    const dedupedResults = await this.applyDeduplication(rankedResults, options.deduplication);
    
    // Step 5: Enrich results with context and metadata
    const enrichedResults = await this.enrichResults(dedupedResults, options);
    
    // Step 6: Apply final sorting and limiting
    const finalResults = this.finalizeResults(enrichedResults, options);
    
    const searchTime = Date.now() - startTime;
    console.log(`Enhanced search completed in ${searchTime}ms: ${finalResults.length} results`);
    
    return finalResults;
  }

  /**
   * Cascading search with intelligent level prioritization
   */
  async cascadingSearch(
    query: string,
    userIntent: string,
    k: number = 8,
    options: SearchOptions = {}
  ): Promise<EnhancedSearchResult[]> {
    // Determine search priority based on user intent
    const levelPriority = this.determineLevelPriority(userIntent);
    
    // Try each level in priority order
    for (const level of levelPriority) {
      const levelOptions = {
        ...options,
        filters: {
          ...options.filters,
          level: level as any
        },
        limit: k
      };
      
      const results = await this.search(query, userIntent, levelOptions);
      
      if (results.length > 0) {
        // If we found good results at this level, return them
        const goodResults = results.filter(r => r.compositeScore > 0.6);
        if (goodResults.length >= Math.min(k / 2, 3)) {
          return results;
        }
      }
    }
    
    // If no single level provided good results, do a general search
    return await this.search(query, userIntent, { ...options, limit: k });
  }

  /**
   * Group search results by session or cycle
   */
  async groupedSearch(
    query: string,
    userIntent?: string,
    options: SearchOptions = {}
  ): Promise<SearchResultGroup[]> {
    const results = await this.search(query, userIntent, options);
    
    if (options.groupBySession) {
      return this.groupBySession(results);
    } else if (options.groupByCycle) {
      return this.groupByCycle(results);
    }
    
    // Default: return as single mixed group
    return [{
      type: 'mixed',
      key: 'all',
      label: 'All Results',
      results,
      score: results.reduce((sum, r) => sum + r.compositeScore, 0) / results.length,
      totalResults: results.length
    }];
  }

  /**
   * Get search suggestions based on query
   */
  async getSearchSuggestions(
    partialQuery: string,
    limit: number = 5
  ): Promise<string[]> {
    // Get recent search history
    const recentSearches = this.searchHistory
      .filter(s => s.query.toLowerCase().includes(partialQuery.toLowerCase()))
      .slice(0, limit);
    
    // TODO: Could enhance with common terms from embeddings
    return recentSearches.map(s => s.query);
  }

  /**
   * Get search analytics
   */
  getSearchAnalytics() {
    const totalSearches = this.searchHistory.length;
    const recentSearches = this.searchHistory.filter(
      s => Date.now() - s.timestamp.getTime() < 24 * 60 * 60 * 1000
    );
    
    return {
      totalSearches,
      recentSearches: recentSearches.length,
      avgResultsPerSearch: totalSearches > 0 
        ? this.searchHistory.reduce((sum, s) => sum + s.resultCount, 0) / totalSearches
        : 0,
      commonQueries: this.getCommonQueries(),
      searchTrends: this.getSearchTrends()
    };
  }

  // Private methods

  private async getRawSearchResults(
    query: string,
    options: SearchOptions
  ): Promise<any[]> {
    const searchOptions = {
      level: options.filters?.level,
      sessionId: options.filters?.sessionId,
      limit: options.limit ? options.limit * 2 : 20 // Get more for filtering
    };
    
    return await searchEmbeddings(query, searchOptions);
  }

  private async applyFilters(
    results: any[],
    filters?: SearchFilter
  ): Promise<any[]> {
    if (!filters) return results;
    
    let filtered = results;
    
    // Date range filter
    if (filters.dateRange) {
      filtered = filtered.filter(r => {
        const date = new Date(r.created_at);
        return date >= filters.dateRange!.start && date <= filters.dateRange!.end;
      });
    }
    
    // Minimum score filter
    if (filters.minScore) {
      filtered = filtered.filter(r => (1 - r._distance) >= filters.minScore!);
    }
    
    // Content type filter (based on column patterns)
    if (filters.contentType) {
      filtered = filtered.filter(r => {
        const column = r.column || '';
        switch (filters.contentType) {
          case 'planning':
            return column.includes('objective') || column.includes('plan') || column.includes('intention');
          case 'review':
            return column.includes('review') || column.includes('reflection') || column.includes('outcome');
          case 'notes':
            return column.includes('note') || column.includes('comment');
          default:
            return true;
        }
      });
    }
    
    return filtered;
  }

  private async calculateRanking(
    results: any[],
    query: string,
    rankingConfig?: RankingConfig
  ): Promise<EnhancedSearchResult[]> {
    const enrichedResults: EnhancedSearchResult[] = [];
    
    for (const result of results) {
      const vectorScore = 1 - (result._distance || 0);
      const compositeScore = await calculateCompositeScore(result, query, rankingConfig);
      
      enrichedResults.push({
        id: result.id,
        level: result.level,
        sessionId: result.session_id,
        cycleId: result.cycle_id,
        column: result.column,
        fieldLabel: result.field_label,
        text: result.text,
        vectorScore,
        compositeScore,
        rank: 0 // Will be set after sorting
      });
    }
    
    // Sort by composite score and assign ranks
    enrichedResults.sort((a, b) => b.compositeScore - a.compositeScore);
    enrichedResults.forEach((result, index) => {
      result.rank = index + 1;
    });
    
    return enrichedResults;
  }

  private async applyDeduplication(
    results: EnhancedSearchResult[],
    strategy?: DeduplicationStrategy
  ): Promise<EnhancedSearchResult[]> {
    if (!strategy) {
      strategy = 'semantic'; // Default to semantic deduplication
    }
    
    return await deduplicateResults(results, strategy);
  }

  private async enrichResults(
    results: EnhancedSearchResult[],
    options: SearchOptions
  ): Promise<EnhancedSearchResult[]> {
    if (!options.includeContext && !options.includeSnippets) {
      return results;
    }
    
    return await enrichSearchResults(results, {
      includeContext: options.includeContext,
      includeSnippets: options.includeSnippets
    });
  }

  private finalizeResults(
    results: EnhancedSearchResult[],
    options: SearchOptions
  ): EnhancedSearchResult[] {
    const limit = options.limit || 10;
    return results.slice(0, limit);
  }

  private determineLevelPriority(userIntent: string): string[] {
    // Analyze user intent to determine search priority
    const intent = userIntent.toLowerCase();
    
    if (intent.includes('overall') || intent.includes('summary') || intent.includes('session')) {
      return ['session', 'cycle', 'field'];
    } else if (intent.includes('cycle') || intent.includes('round')) {
      return ['cycle', 'field', 'session'];
    } else if (intent.includes('specific') || intent.includes('detail')) {
      return ['field', 'cycle', 'session'];
    }
    
    // Default: start with most specific
    return ['field', 'cycle', 'session'];
  }

  private groupBySession(results: EnhancedSearchResult[]): SearchResultGroup[] {
    const groups = new Map<string, EnhancedSearchResult[]>();
    
    for (const result of results) {
      const sessionId = result.sessionId;
      if (!groups.has(sessionId)) {
        groups.set(sessionId, []);
      }
      groups.get(sessionId)!.push(result);
    }
    
    return Array.from(groups.entries()).map(([sessionId, groupResults]) => ({
      type: 'session' as const,
      key: sessionId,
      label: `Session ${sessionId.slice(0, 8)}...`,
      results: groupResults,
      score: groupResults.reduce((sum, r) => sum + r.compositeScore, 0) / groupResults.length,
      totalResults: groupResults.length
    }));
  }

  private groupByCycle(results: EnhancedSearchResult[]): SearchResultGroup[] {
    const groups = new Map<string, EnhancedSearchResult[]>();
    
    for (const result of results) {
      const key = result.cycleId || result.sessionId;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(result);
    }
    
    return Array.from(groups.entries()).map(([key, groupResults]) => ({
      type: 'cycle' as const,
      key,
      label: key.startsWith('cycle') ? `Cycle ${key.slice(0, 8)}...` : `Session ${key.slice(0, 8)}...`,
      results: groupResults,
      score: groupResults.reduce((sum, r) => sum + r.compositeScore, 0) / groupResults.length,
      totalResults: groupResults.length
    }));
  }

  private recordSearch(query: string, userIntent?: string): void {
    this.searchHistory.push({
      query,
      timestamp: new Date(),
      resultCount: 0, // Will be updated after search
      userIntent
    });
    
    // Keep only last 100 searches
    if (this.searchHistory.length > 100) {
      this.searchHistory = this.searchHistory.slice(-100);
    }
  }

  private getCommonQueries(): Array<{query: string, count: number}> {
    const queryCount = new Map<string, number>();
    
    for (const search of this.searchHistory) {
      queryCount.set(search.query, (queryCount.get(search.query) || 0) + 1);
    }
    
    return Array.from(queryCount.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getSearchTrends(): Array<{date: string, count: number}> {
    const dailyCounts = new Map<string, number>();
    
    for (const search of this.searchHistory) {
      const date = search.timestamp.toISOString().split('T')[0];
      dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
    }
    
    return Array.from(dailyCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

// Export singleton instance
export const enhancedSearchEngine = new EnhancedSearchEngine(); 