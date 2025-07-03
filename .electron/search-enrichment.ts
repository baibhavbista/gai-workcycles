// Search Result Enrichment System - Phase 5
import { EnhancedSearchResult } from './search-engine.ts';
import { getSessionById } from './db.ts';
import { calculateTextRelevance, calculatePositionBoost } from './search-ranking.ts';

export interface EnrichmentOptions {
  includeContext?: boolean;
  includeSnippets?: boolean;
  includeMetadata?: boolean;
  includeRelatedResults?: boolean;
  snippetLength?: number;
  contextRadius?: number;
}

export interface ResultContext {
  session?: any;
  cycle?: any;
  relatedResults?: string[];
  fieldContext?: {
    previousValue?: string;
    nextValue?: string;
    relatedFields?: Array<{
      column: string;
      value: string;
      fieldLabel: string;
    }>;
  };
}

export interface ResultMetadata {
  createdAt: Date;
  sessionStartedAt?: Date;
  cycleStartedAt?: Date;
  sessionStatus?: 'active' | 'completed' | 'cancelled';
  cycleStatus?: 'hit' | 'miss' | 'skip';
  sessionObjective?: string;
  cycleObjective?: string;
  sessionDuration?: number;
  cycleDuration?: number;
  successRate?: number;
  cycleNumber?: number;
  totalCycles?: number;
}

const DEFAULT_ENRICHMENT_OPTIONS: EnrichmentOptions = {
  includeContext: true,
  includeSnippets: true,
  includeMetadata: true,
  includeRelatedResults: false,
  snippetLength: 200,
  contextRadius: 50
};

/**
 * Main result enrichment function
 */
export async function enrichSearchResults(
  results: EnhancedSearchResult[],
  options: EnrichmentOptions = DEFAULT_ENRICHMENT_OPTIONS
): Promise<EnhancedSearchResult[]> {
  const enrichedResults: EnhancedSearchResult[] = [];
  
  for (const result of results) {
    let enrichedResult = { ...result };
    
    // Add snippets
    if (options.includeSnippets) {
      enrichedResult.snippet = generateSnippet(result.text, '', options.snippetLength);
    }
    
    // Add context
    if (options.includeContext) {
      enrichedResult.context = await getResultContext(result, options);
    }
    
    // Add metadata
    if (options.includeMetadata) {
      enrichedResult.metadata = await getResultMetadata(result);
    }
    
    // Add related results
    if (options.includeRelatedResults) {
      enrichedResult.context = {
        ...enrichedResult.context,
        relatedResults: await findRelatedResults(result, results)
      };
    }
    
    enrichedResults.push(enrichedResult);
  }
  
  return enrichedResults;
}

/**
 * Generate text snippet with query highlighting
 */
export function generateSnippet(
  text: string,
  query: string,
  maxLength: number = 200
): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  if (!query) {
    return text.substring(0, maxLength) + '...';
  }
  
  const queryTerms = query.toLowerCase().split(/\s+/);
  const textLower = text.toLowerCase();
  
  // Find the best position to start the snippet
  let bestPosition = 0;
  let bestScore = 0;
  
  for (let i = 0; i <= text.length - maxLength; i++) {
    const snippet = text.substring(i, i + maxLength);
    const snippetLower = snippet.toLowerCase();
    
    let score = 0;
    for (const term of queryTerms) {
      if (snippetLower.includes(term)) {
        score += 1;
        // Bonus for terms appearing early in snippet
        const termIndex = snippetLower.indexOf(term);
        score += (maxLength - termIndex) / maxLength;
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestPosition = i;
    }
  }
  
  let snippet = text.substring(bestPosition, bestPosition + maxLength);
  
  // Try to end at a word boundary
  if (bestPosition + maxLength < text.length) {
    const lastSpaceIndex = snippet.lastIndexOf(' ');
    if (lastSpaceIndex > maxLength * 0.8) {
      snippet = snippet.substring(0, lastSpaceIndex);
    }
    snippet += '...';
  }
  
  // Add leading ellipsis if we didn't start at the beginning
  if (bestPosition > 0) {
    snippet = '...' + snippet;
  }
  
  return snippet;
}

/**
 * Get context information for a search result
 */
export async function getResultContext(
  result: EnhancedSearchResult,
  options: EnrichmentOptions
): Promise<ResultContext> {
  const context: ResultContext = {};
  
  try {
    // Get session context
    if (result.sessionId) {
      context.session = await getSessionById(result.sessionId);
    }
    
    // Get field context for field-level results
    if (result.level === 'field' && result.column) {
      context.fieldContext = await getFieldContext(result);
    }
    
  } catch (error) {
    console.error('Failed to get result context:', error);
  }
  
  return context;
}

/**
 * Get metadata for a search result
 */
export async function getResultMetadata(
  result: EnhancedSearchResult
): Promise<ResultMetadata> {
  const metadata: ResultMetadata = {
    createdAt: new Date() // Default fallback
  };
  
  try {
    // Get session metadata
    if (result.sessionId) {
      const sessionData = await getSessionById(result.sessionId);
      if (sessionData && sessionData.cycles) {
        // sessionData has cycles array but not the metadata directly
        // We'll need to infer from the cycles array
        metadata.totalCycles = sessionData.cycles.length;
        
        // Calculate success rate
        if (sessionData.cycles.length > 0) {
          const hitCycles = sessionData.cycles.filter((c: any) => c.status === 'hit').length;
          metadata.successRate = Math.round((hitCycles / sessionData.cycles.length) * 100);
        }
      }
    }
    
  } catch (error) {
    console.error('Failed to get result metadata:', error);
  }
  
  return metadata;
}

/**
 * Get field-specific context
 */
async function getFieldContext(result: EnhancedSearchResult): Promise<any> {
  // This would require more complex database queries to get related fields
  // For now, return basic context
  return {
    fieldType: determineFieldType(result.column || ''),
    fieldImportance: calculateFieldImportance(result.column || '', result.fieldLabel || '')
  };
}

/**
 * Find related results based on session/cycle relationships
 */
async function findRelatedResults(
  result: EnhancedSearchResult,
  allResults: EnhancedSearchResult[]
): Promise<string[]> {
  const relatedIds: string[] = [];
  
  // Find results from the same session
  const sessionResults = allResults.filter(r => 
    r.sessionId === result.sessionId && r.id !== result.id
  );
  
  // Add top 2 related results from the same session
  sessionResults
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 2)
    .forEach(r => relatedIds.push(r.id));
  
  // Find results from the same cycle
  if (result.cycleId) {
    const cycleResults = allResults.filter(r => 
      r.cycleId === result.cycleId && r.id !== result.id
    );
    
    cycleResults
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, 1)
      .forEach(r => relatedIds.push(r.id));
  }
  
  return relatedIds;
}

/**
 * Determine field type based on column name
 */
function determineFieldType(column: string): string {
  if (column.includes('objective')) return 'objective';
  if (column.includes('plan')) return 'planning';
  if (column.includes('intention')) return 'planning';
  if (column.includes('review')) return 'review';
  if (column.includes('reflection')) return 'reflection';
  if (column.includes('outcome')) return 'outcome';
  if (column.includes('note')) return 'note';
  return 'other';
}

/**
 * Calculate field importance score
 */
function calculateFieldImportance(column: string, fieldLabel: string): number {
  const combined = `${column} ${fieldLabel}`.toLowerCase();
  
  // High importance
  if (combined.includes('objective')) return 1.0;
  if (combined.includes('main') || combined.includes('primary')) return 0.9;
  
  // Medium importance
  if (combined.includes('plan') || combined.includes('intention')) return 0.8;
  if (combined.includes('review') || combined.includes('outcome')) return 0.7;
  
  // Lower importance
  if (combined.includes('note') || combined.includes('comment')) return 0.6;
  if (combined.includes('additional') || combined.includes('other')) return 0.5;
  
  return 0.6; // Default
}

/**
 * Generate query-aware snippet with highlighting
 */
export function generateQuerySnippet(
  text: string,
  query: string,
  maxLength: number = 200
): string {
  if (!query || text.length <= maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }
  
  const queryTerms = query.toLowerCase().split(/\s+/);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  // Score each sentence
  const scoredSentences = sentences.map(sentence => {
    const relevanceScore = calculateTextRelevance(sentence, query);
    const positionBoost = calculatePositionBoost(sentence, query);
    const lengthScore = Math.min(sentence.length / 100, 1.0); // Prefer longer sentences up to 100 chars
    
    return {
      text: sentence.trim(),
      score: relevanceScore + positionBoost + lengthScore * 0.1
    };
  });
  
  // Sort by score and build snippet
  scoredSentences.sort((a, b) => b.score - a.score);
  
  let snippet = '';
  let currentLength = 0;
  
  for (const sentence of scoredSentences) {
    if (currentLength + sentence.text.length <= maxLength) {
      if (snippet.length > 0) snippet += '. ';
      snippet += sentence.text;
      currentLength = snippet.length;
    } else {
      break;
    }
  }
  
  // If we couldn't fit any complete sentences, use the best one truncated
  if (snippet.length === 0 && scoredSentences.length > 0) {
    const bestSentence = scoredSentences[0].text;
    snippet = bestSentence.substring(0, maxLength - 3) + '...';
  }
  
  return snippet || text.substring(0, maxLength - 3) + '...';
}

/**
 * Get result preview with enhanced formatting
 */
export function getResultPreview(
  result: EnhancedSearchResult,
  query: string = ''
): {
  title: string;
  subtitle: string;
  content: string;
  metadata: string[];
  tags: string[];
} {
  const preview = {
    title: '',
    subtitle: '',
    content: '',
    metadata: [] as string[],
    tags: [] as string[]
  };
  
  // Generate title based on level and content
  switch (result.level) {
    case 'session':
      preview.title = result.metadata?.sessionObjective || 'Session Summary';
      preview.subtitle = `Session • ${formatDate(result.metadata?.sessionStartedAt)}`;
      break;
    case 'cycle':
      preview.title = result.metadata?.cycleObjective || 'Cycle';
      preview.subtitle = `Cycle • ${formatDate(result.metadata?.cycleStartedAt)}`;
      break;
    case 'field':
      preview.title = result.fieldLabel || 'Field Response';
      preview.subtitle = `${capitalizeFirst(result.level)} • ${formatDate(result.metadata?.createdAt)}`;
      break;
  }
  
  // Content (snippet or full text)
  preview.content = result.snippet || generateQuerySnippet(result.text, query);
  
  // Metadata
  if (result.metadata?.successRate !== undefined) {
    preview.metadata.push(`${result.metadata.successRate}% success rate`);
  }
  
  if (result.metadata?.totalCycles) {
    preview.metadata.push(`${result.metadata.totalCycles} cycles`);
  }
  
  if (result.metadata?.sessionDuration) {
    preview.metadata.push(`${Math.round(result.metadata.sessionDuration / 60)} minutes`);
  }
  
  // Tags
  preview.tags.push(result.level);
  
  if (result.metadata?.sessionStatus) {
    preview.tags.push(result.metadata.sessionStatus);
  }
  
  if (result.metadata?.cycleStatus) {
    preview.tags.push(result.metadata.cycleStatus);
  }
  
  // Add field type tag for field-level results
  if (result.level === 'field' && result.column) {
    const fieldType = determineFieldType(result.column);
    if (fieldType !== 'other') {
      preview.tags.push(fieldType);
    }
  }
  
  return preview;
}

/**
 * Format date for display
 */
function formatDate(date?: Date): string {
  if (!date) return 'Unknown date';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  
  return date.toLocaleDateString();
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate contextual highlights for search results
 */
export function generateContextualHighlights(
  results: EnhancedSearchResult[],
  query: string
): EnhancedSearchResult[] {
  const queryTerms = query.toLowerCase().split(/\s+/);
  
  return results.map(result => {
    let highlightedText = result.text;
    let highlightedSnippet = result.snippet;
    
    // Apply highlights to query terms
    for (const term of queryTerms) {
      if (term.length > 2) { // Only highlight terms longer than 2 characters
        const regex = new RegExp(`\\b(${escapeRegExp(term)})\\b`, 'gi');
        highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
        if (highlightedSnippet) {
          highlightedSnippet = highlightedSnippet.replace(regex, '<mark>$1</mark>');
        }
      }
    }
    
    return {
      ...result,
      text: highlightedText,
      snippet: highlightedSnippet
    };
  });
}

/**
 * Escape regex special characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract key entities from search results
 */
export function extractKeyEntities(
  results: EnhancedSearchResult[]
): {
  sessions: Set<string>;
  cycles: Set<string>;
  objectives: Set<string>;
  topics: Set<string>;
} {
  const entities = {
    sessions: new Set<string>(),
    cycles: new Set<string>(),
    objectives: new Set<string>(),
    topics: new Set<string>()
  };
  
  for (const result of results) {
    // Sessions
    if (result.sessionId) {
      entities.sessions.add(result.sessionId);
    }
    
    // Cycles
    if (result.cycleId) {
      entities.cycles.add(result.cycleId);
    }
    
    // Objectives
    if (result.metadata?.sessionObjective) {
      entities.objectives.add(result.metadata.sessionObjective);
    }
    if (result.metadata?.cycleObjective) {
      entities.objectives.add(result.metadata.cycleObjective);
    }
    
    // Topics (simple keyword extraction)
    const words = result.text.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const commonWords = new Set(['this', 'that', 'with', 'have', 'been', 'will', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over', 'such', 'take', 'than', 'them', 'well', 'were']);
    
    for (const word of words) {
      if (!commonWords.has(word)) {
        entities.topics.add(word);
      }
    }
  }
  
  return entities;
} 