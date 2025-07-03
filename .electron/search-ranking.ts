// Search Ranking System - Phase 5
import { EnhancedSearchResult } from './search-engine.ts';

export interface RankingConfig {
  weights?: {
    vectorSimilarity?: number;
    recency?: number;
    levelBoost?: number;
    sessionStatus?: number;
    cycleStatus?: number;
    contentLength?: number;
    fieldImportance?: number;
  };
  boosts?: {
    recentSessions?: number;
    completedSessions?: number;
    hitCycles?: number;
    planningFields?: number;
    reviewFields?: number;
  };
  recencyDecay?: {
    halfLife?: number; // Days
    maxAge?: number; // Days
  };
}

const DEFAULT_RANKING_CONFIG: RankingConfig = {
  weights: {
    vectorSimilarity: 0.4,
    recency: 0.2,
    levelBoost: 0.15,
    sessionStatus: 0.1,
    cycleStatus: 0.1,
    contentLength: 0.03,
    fieldImportance: 0.02
  },
  boosts: {
    recentSessions: 1.2,
    completedSessions: 1.1,
    hitCycles: 1.15,
    planningFields: 1.05,
    reviewFields: 1.1
  },
  recencyDecay: {
    halfLife: 7, // 7 days
    maxAge: 90 // 90 days
  }
};

/**
 * Calculate composite score for a search result
 */
export async function calculateCompositeScore(
  result: any,
  query: string,
  config: RankingConfig = DEFAULT_RANKING_CONFIG
): Promise<number> {
  const weights = { ...DEFAULT_RANKING_CONFIG.weights, ...config.weights };
  const boosts = { ...DEFAULT_RANKING_CONFIG.boosts, ...config.boosts };
  const recencyDecay = { ...DEFAULT_RANKING_CONFIG.recencyDecay, ...config.recencyDecay };
  
  // 1. Vector similarity score (0-1)
  const vectorScore = 1 - (result._distance || 0);
  
  // 2. Recency score (0-1)
  const recencyScore = calculateRecencyScore(result.created_at, recencyDecay);
  
  // 3. Level boost (different weights for different levels)
  const levelBoost = calculateLevelBoost(result.level, query);
  
  // 4. Session status boost
  const sessionStatusBoost = calculateSessionStatusBoost(result, boosts);
  
  // 5. Cycle status boost
  const cycleStatusBoost = calculateCycleStatusBoost(result, boosts);
  
  // 6. Content length normalization
  const contentLengthScore = calculateContentLengthScore(result.text);
  
  // 7. Field importance boost
  const fieldImportanceBoost = calculateFieldImportanceBoost(result, boosts);
  
  // Calculate weighted composite score
  const compositeScore = 
    (vectorScore * weights.vectorSimilarity!) +
    (recencyScore * weights.recency!) +
    (levelBoost * weights.levelBoost!) +
    (sessionStatusBoost * weights.sessionStatus!) +
    (cycleStatusBoost * weights.cycleStatus!) +
    (contentLengthScore * weights.contentLength!) +
    (fieldImportanceBoost * weights.fieldImportance!);
  
  // Apply additional boosts
  let finalScore = compositeScore;
  
  // Recent sessions boost
  if (isRecentSession(result.created_at)) {
    finalScore *= boosts.recentSessions!;
  }
  
  return Math.min(finalScore, 1.0); // Cap at 1.0
}

/**
 * Calculate recency score with exponential decay
 */
function calculateRecencyScore(
  createdAt: string,
  recencyDecay: { halfLife?: number; maxAge?: number }
): number {
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const ageInDays = (now - created) / (24 * 60 * 60 * 1000);
  
  // If older than maxAge, return 0
  if (ageInDays > recencyDecay.maxAge!) {
    return 0;
  }
  
  // Exponential decay based on half-life
  const halfLife = recencyDecay.halfLife!;
  return Math.exp(-0.693 * ageInDays / halfLife);
}

/**
 * Calculate level-based boost score
 */
function calculateLevelBoost(level: string, query: string): number {
  const queryLower = query.toLowerCase();
  
  // Base scores for different levels
  const baseScores = {
    field: 0.6,
    cycle: 0.7,
    session: 0.8
  };
  
  let score = baseScores[level as keyof typeof baseScores] || 0.5;
  
  // Query-specific boosts
  if (queryLower.includes('session') && level === 'session') {
    score *= 1.3;
  } else if (queryLower.includes('cycle') && level === 'cycle') {
    score *= 1.3;
  } else if (queryLower.includes('specific') && level === 'field') {
    score *= 1.2;
  }
  
  return score;
}

/**
 * Calculate session status boost
 */
function calculateSessionStatusBoost(result: any, boosts: any): number {
  // This would require additional metadata from the database
  // For now, return neutral score
  return 0.5;
}

/**
 * Calculate cycle status boost
 */
function calculateCycleStatusBoost(result: any, boosts: any): number {
  // This would require additional metadata from the database
  // For now, return neutral score
  return 0.5;
}

/**
 * Calculate content length score (prefer moderate length content)
 */
function calculateContentLengthScore(text: string): number {
  const length = text.length;
  
  // Optimal length is around 200-500 characters
  if (length < 50) return 0.3; // Too short
  if (length < 200) return 0.6; // Short but okay
  if (length < 500) return 1.0; // Optimal
  if (length < 1000) return 0.8; // Good
  if (length < 2000) return 0.6; // Long but okay
  return 0.4; // Too long
}

/**
 * Calculate field importance boost based on field type
 */
function calculateFieldImportanceBoost(result: any, boosts: any): number {
  const column = result.column || '';
  const fieldLabel = result.field_label || '';
  
  // High importance fields
  if (column.includes('objective') || fieldLabel.includes('objective')) {
    return 1.0;
  }
  
  // Medium importance fields
  if (column.includes('plan') || column.includes('intention') || 
      column.includes('review') || column.includes('outcome')) {
    return 0.8;
  }
  
  // Planning fields boost
  if (column.includes('plan') || fieldLabel.includes('plan')) {
    return 0.7 * boosts.planningFields!;
  }
  
  // Review fields boost
  if (column.includes('review') || fieldLabel.includes('review')) {
    return 0.7 * boosts.reviewFields!;
  }
  
  // Default field importance
  return 0.5;
}

/**
 * Check if a session is recent (within last 7 days)
 */
function isRecentSession(createdAt: string): boolean {
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const ageInDays = (now - created) / (24 * 60 * 60 * 1000);
  return ageInDays <= 7;
}

/**
 * Calculate relevance score for a text snippet
 */
export function calculateTextRelevance(text: string, query: string): number {
  const queryTerms = query.toLowerCase().split(/\s+/);
  const textLower = text.toLowerCase();
  
  let score = 0;
  let termMatches = 0;
  
  for (const term of queryTerms) {
    if (textLower.includes(term)) {
      termMatches++;
      
      // Exact word match gets higher score
      const wordRegex = new RegExp(`\\b${term}\\b`, 'i');
      if (wordRegex.test(text)) {
        score += 1.0;
      } else {
        score += 0.5; // Partial match
      }
    }
  }
  
  // Normalize by number of query terms
  const termCoverage = termMatches / queryTerms.length;
  const avgScore = score / queryTerms.length;
  
  return (termCoverage * 0.6) + (avgScore * 0.4);
}

/**
 * Calculate position-based boost (terms appearing earlier get higher score)
 */
export function calculatePositionBoost(text: string, query: string): number {
  const queryTerms = query.toLowerCase().split(/\s+/);
  const textLower = text.toLowerCase();
  
  let totalPositionScore = 0;
  let foundTerms = 0;
  
  for (const term of queryTerms) {
    const index = textLower.indexOf(term);
    if (index !== -1) {
      foundTerms++;
      // Earlier positions get higher scores
      const positionScore = Math.max(0, 1 - (index / text.length));
      totalPositionScore += positionScore;
    }
  }
  
  return foundTerms > 0 ? totalPositionScore / foundTerms : 0;
}

/**
 * Dynamic ranking adjustment based on search context
 */
export function adjustRankingForContext(
  results: EnhancedSearchResult[],
  context: {
    searchType?: 'exploratory' | 'specific' | 'recent';
    userHistory?: string[];
    sessionContext?: string;
  }
): EnhancedSearchResult[] {
  if (context.searchType === 'recent') {
    // Boost recent results more heavily
    return results.map(result => ({
      ...result,
      compositeScore: result.compositeScore * (isRecentSession(result.metadata?.createdAt?.toISOString() || '') ? 1.3 : 1.0)
    }));
  }
  
  if (context.searchType === 'specific') {
    // Boost field-level results
    return results.map(result => ({
      ...result,
      compositeScore: result.compositeScore * (result.level === 'field' ? 1.2 : 1.0)
    }));
  }
  
  // Default: return as-is
  return results;
}

/**
 * Calculate diversity score to promote result variety
 */
export function calculateDiversityScore(
  results: EnhancedSearchResult[],
  targetDiversity: number = 0.3
): EnhancedSearchResult[] {
  const sessionCounts = new Map<string, number>();
  const levelCounts = new Map<string, number>();
  
  // Count occurrences
  for (const result of results) {
    sessionCounts.set(result.sessionId, (sessionCounts.get(result.sessionId) || 0) + 1);
    levelCounts.set(result.level, (levelCounts.get(result.level) || 0) + 1);
  }
  
  // Apply diversity penalty
  return results.map(result => {
    const sessionCount = sessionCounts.get(result.sessionId) || 1;
    const levelCount = levelCounts.get(result.level) || 1;
    
    // Penalize over-representation
    const diversityPenalty = Math.max(0, 1 - (sessionCount - 1) * targetDiversity) * 
                           Math.max(0, 1 - (levelCount - 1) * targetDiversity);
    
    return {
      ...result,
      compositeScore: result.compositeScore * diversityPenalty
    };
  });
} 