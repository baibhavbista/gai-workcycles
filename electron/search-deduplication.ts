// Search Deduplication System - Phase 5
import { EnhancedSearchResult } from './search-engine.ts';
import { generateEmbedding } from './db.ts';

export type DeduplicationStrategy = 
  | 'none'
  | 'exact'
  | 'semantic'
  | 'hierarchical'
  | 'session-based'
  | 'content-length'
  | 'hybrid';

export interface DeduplicationConfig {
  strategy?: DeduplicationStrategy;
  semanticThreshold?: number;
  maxResultsPerSession?: number;
  maxResultsPerCycle?: number;
  preserveHighestScore?: boolean;
  contentSimilarityThreshold?: number;
}

const DEFAULT_DEDUPLICATION_CONFIG: DeduplicationConfig = {
  strategy: 'semantic',
  semanticThreshold: 0.85,
  maxResultsPerSession: 3,
  maxResultsPerCycle: 2,
  preserveHighestScore: true,
  contentSimilarityThreshold: 0.9
};

/**
 * Main deduplication function
 */
export async function deduplicateResults(
  results: EnhancedSearchResult[],
  strategy: DeduplicationStrategy = 'semantic',
  config: DeduplicationConfig = DEFAULT_DEDUPLICATION_CONFIG
): Promise<EnhancedSearchResult[]> {
  if (strategy === 'none' || results.length <= 1) {
    return results;
  }
  
  const mergedConfig = { ...DEFAULT_DEDUPLICATION_CONFIG, ...config, strategy };
  
  switch (strategy) {
    case 'exact':
      return exactDeduplication(results, mergedConfig);
    case 'semantic':
      return await semanticDeduplication(results, mergedConfig);
    case 'hierarchical':
      return hierarchicalDeduplication(results, mergedConfig);
    case 'session-based':
      return sessionBasedDeduplication(results, mergedConfig);
    case 'content-length':
      return contentLengthDeduplication(results, mergedConfig);
    case 'hybrid':
      return await hybridDeduplication(results, mergedConfig);
    default:
      return results;
  }
}

/**
 * Exact text deduplication
 */
function exactDeduplication(
  results: EnhancedSearchResult[],
  config: DeduplicationConfig
): EnhancedSearchResult[] {
  const seen = new Set<string>();
  const deduplicated: EnhancedSearchResult[] = [];
  
  for (const result of results) {
    const key = normalizeText(result.text);
    
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(result);
    } else if (config.preserveHighestScore) {
      // Replace if current result has higher score
      const existingIndex = deduplicated.findIndex(r => normalizeText(r.text) === key);
      if (existingIndex !== -1 && result.compositeScore > deduplicated[existingIndex].compositeScore) {
        deduplicated[existingIndex] = result;
      }
    }
  }
  
  return deduplicated;
}

/**
 * Semantic deduplication using embedding similarity
 */
async function semanticDeduplication(
  results: EnhancedSearchResult[],
  config: DeduplicationConfig
): Promise<EnhancedSearchResult[]> {
  if (results.length <= 1) return results;
  
  const threshold = config.semanticThreshold || 0.85;
  const deduplicated: EnhancedSearchResult[] = [];
  const processed = new Set<number>();
  
  for (let i = 0; i < results.length; i++) {
    if (processed.has(i)) continue;
    
    const currentResult = results[i];
    const similarResults = [currentResult];
    processed.add(i);
    
    // Find similar results
    for (let j = i + 1; j < results.length; j++) {
      if (processed.has(j)) continue;
      
      const similarity = await calculateSemanticSimilarity(
        currentResult.text,
        results[j].text
      );
      
      if (similarity >= threshold) {
        similarResults.push(results[j]);
        processed.add(j);
      }
    }
    
    // Select best result from similar group
    const bestResult = selectBestFromSimilar(similarResults, config);
    deduplicated.push(bestResult);
  }
  
  return deduplicated;
}

/**
 * Hierarchical deduplication (prefer higher-level results)
 */
function hierarchicalDeduplication(
  results: EnhancedSearchResult[],
  config: DeduplicationConfig
): EnhancedSearchResult[] {
  const groupedBySession = new Map<string, EnhancedSearchResult[]>();
  
  // Group by session
  for (const result of results) {
    const sessionId = result.sessionId;
    if (!groupedBySession.has(sessionId)) {
      groupedBySession.set(sessionId, []);
    }
    groupedBySession.get(sessionId)!.push(result);
  }
  
  const deduplicated: EnhancedSearchResult[] = [];
  
  // For each session, prefer higher-level results
  for (const sessionResults of groupedBySession.values()) {
    const sessionResult = sessionResults.find(r => r.level === 'session');
    const cycleResults = sessionResults.filter(r => r.level === 'cycle');
    const fieldResults = sessionResults.filter(r => r.level === 'field');
    
    // Prefer session-level if available and good score
    if (sessionResult && sessionResult.compositeScore > 0.7) {
      deduplicated.push(sessionResult);
    } else if (cycleResults.length > 0) {
      // Add best cycle results
      cycleResults
        .sort((a, b) => b.compositeScore - a.compositeScore)
        .slice(0, config.maxResultsPerCycle || 2)
        .forEach(result => deduplicated.push(result));
    } else {
      // Add best field results
      fieldResults
        .sort((a, b) => b.compositeScore - a.compositeScore)
        .slice(0, config.maxResultsPerSession || 3)
        .forEach(result => deduplicated.push(result));
    }
  }
  
  return deduplicated.sort((a, b) => b.compositeScore - a.compositeScore);
}

/**
 * Session-based deduplication (limit results per session)
 */
function sessionBasedDeduplication(
  results: EnhancedSearchResult[],
  config: DeduplicationConfig
): EnhancedSearchResult[] {
  const groupedBySession = new Map<string, EnhancedSearchResult[]>();
  
  // Group by session
  for (const result of results) {
    const sessionId = result.sessionId;
    if (!groupedBySession.has(sessionId)) {
      groupedBySession.set(sessionId, []);
    }
    groupedBySession.get(sessionId)!.push(result);
  }
  
  const deduplicated: EnhancedSearchResult[] = [];
  
  // Limit results per session
  for (const sessionResults of groupedBySession.values()) {
    const sortedResults = sessionResults.sort((a, b) => b.compositeScore - a.compositeScore);
    const limitedResults = sortedResults.slice(0, config.maxResultsPerSession || 3);
    deduplicated.push(...limitedResults);
  }
  
  return deduplicated.sort((a, b) => b.compositeScore - a.compositeScore);
}

/**
 * Content length deduplication (prefer optimal length)
 */
function contentLengthDeduplication(
  results: EnhancedSearchResult[],
  config: DeduplicationConfig
): EnhancedSearchResult[] {
  const threshold = config.contentSimilarityThreshold || 0.9;
  const deduplicated: EnhancedSearchResult[] = [];
  
  for (const result of results) {
    const isDuplicate = deduplicated.some(existing => {
      const similarity = calculateContentSimilarity(result.text, existing.text);
      return similarity >= threshold;
    });
    
    if (!isDuplicate) {
      deduplicated.push(result);
    } else if (config.preserveHighestScore) {
      // Replace if current has better score and better length
      const existingIndex = deduplicated.findIndex(existing => {
        const similarity = calculateContentSimilarity(result.text, existing.text);
        return similarity >= threshold;
      });
      
      if (existingIndex !== -1) {
        const existing = deduplicated[existingIndex];
        if (result.compositeScore > existing.compositeScore && 
            isOptimalLength(result.text) && !isOptimalLength(existing.text)) {
          deduplicated[existingIndex] = result;
        }
      }
    }
  }
  
  return deduplicated;
}

/**
 * Hybrid deduplication combining multiple strategies
 */
async function hybridDeduplication(
  results: EnhancedSearchResult[],
  config: DeduplicationConfig
): Promise<EnhancedSearchResult[]> {
  // Step 1: Exact deduplication
  let deduplicated = exactDeduplication(results, config);
  
  // Step 2: Semantic deduplication
  deduplicated = await semanticDeduplication(deduplicated, config);
  
  // Step 3: Session-based limiting
  deduplicated = sessionBasedDeduplication(deduplicated, config);
  
  // Step 4: Content length optimization
  deduplicated = contentLengthDeduplication(deduplicated, config);
  
  return deduplicated;
}

/**
 * Calculate semantic similarity between two texts
 */
async function calculateSemanticSimilarity(text1: string, text2: string): Promise<number> {
  try {
    // For short texts, use simple string similarity
    if (text1.length < 100 && text2.length < 100) {
      return calculateContentSimilarity(text1, text2);
    }
    
    // For longer texts, use embeddings
    const [embedding1, embedding2] = await Promise.all([
      generateEmbedding(text1),
      generateEmbedding(text2)
    ]);
    
    return cosineSimilarity(embedding1, embedding2);
  } catch (error) {
    console.error('Failed to calculate semantic similarity:', error);
    return calculateContentSimilarity(text1, text2);
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Calculate content similarity using string-based methods
 */
function calculateContentSimilarity(text1: string, text2: string): number {
  const normalized1 = normalizeText(text1);
  const normalized2 = normalizeText(text2);
  
  // Exact match
  if (normalized1 === normalized2) {
    return 1.0;
  }
  
  // Jaccard similarity
  const words1 = new Set(normalized1.split(/\s+/));
  const words2 = new Set(normalized2.split(/\s+/));
  
  const intersection = new Set([...words1].filter(word => words2.has(word)));
  const union = new Set([...words1, ...words2]);
  
  const jaccardSimilarity = intersection.size / union.size;
  
  // Levenshtein distance for short texts
  if (text1.length < 200 && text2.length < 200) {
    const levenshteinSimilarity = 1 - (levenshteinDistance(text1, text2) / Math.max(text1.length, text2.length));
    return (jaccardSimilarity + levenshteinSimilarity) / 2;
  }
  
  return jaccardSimilarity;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i;
  }
  
  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j;
  }
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator  // substitution
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Select the best result from a group of similar results
 */
function selectBestFromSimilar(
  similarResults: EnhancedSearchResult[],
  config: DeduplicationConfig
): EnhancedSearchResult {
  if (similarResults.length === 1) {
    return similarResults[0];
  }
  
  // Sort by composite score first
  const sortedByScore = similarResults.sort((a, b) => b.compositeScore - a.compositeScore);
  
  // If preserve highest score is enabled, return the top result
  if (config.preserveHighestScore) {
    return sortedByScore[0];
  }
  
  // Otherwise, consider other factors
  
  // Prefer session-level results
  const sessionResults = sortedByScore.filter(r => r.level === 'session');
  if (sessionResults.length > 0) {
    return sessionResults[0];
  }
  
  // Prefer cycle-level results
  const cycleResults = sortedByScore.filter(r => r.level === 'cycle');
  if (cycleResults.length > 0) {
    return cycleResults[0];
  }
  
  // Prefer results with optimal length
  const optimalResults = sortedByScore.filter(r => isOptimalLength(r.text));
  if (optimalResults.length > 0) {
    return optimalResults[0];
  }
  
  // Default to highest score
  return sortedByScore[0];
}

/**
 * Check if text has optimal length
 */
function isOptimalLength(text: string): boolean {
  const length = text.length;
  return length >= 200 && length <= 500;
}

/**
 * Normalize text for comparison
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Advanced clustering-based deduplication
 */
export async function clusterBasedDeduplication(
  results: EnhancedSearchResult[],
  config: { maxClusters?: number; similarityThreshold?: number } = {}
): Promise<EnhancedSearchResult[]> {
  const maxClusters = config.maxClusters || Math.ceil(results.length / 3);
  const threshold = config.similarityThreshold || 0.75;
  
  const clusters: EnhancedSearchResult[][] = [];
  const processed = new Set<number>();
  
  for (let i = 0; i < results.length; i++) {
    if (processed.has(i)) continue;
    
    const cluster = [results[i]];
    processed.add(i);
    
    // Find similar results for this cluster
    for (let j = i + 1; j < results.length; j++) {
      if (processed.has(j)) continue;
      
      const similarity = await calculateSemanticSimilarity(
        results[i].text,
        results[j].text
      );
      
      if (similarity >= threshold) {
        cluster.push(results[j]);
        processed.add(j);
      }
    }
    
    clusters.push(cluster);
    
    // Limit number of clusters
    if (clusters.length >= maxClusters) {
      break;
    }
  }
  
  // Select best result from each cluster
  const deduplicated: EnhancedSearchResult[] = [];
  
  for (const cluster of clusters) {
    const bestResult = selectBestFromSimilar(cluster, { preserveHighestScore: true });
    deduplicated.push(bestResult);
  }
  
  return deduplicated.sort((a, b) => b.compositeScore - a.compositeScore);
} 