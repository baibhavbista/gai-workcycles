import { generateEmbedding, generateSessionSummary, storeEmbedding } from './db.ts';
import { markJobProcessing, updateJobStatus } from './db.ts';

// Batch size for OpenAI API calls (as per plan)
const BATCH_SIZE = 96;

export interface BatchItem {
  id: string;
  text: string;
  level: 'field' | 'cycle' | 'session';
  sessionId: string;
  metadata: {
    cycleId?: string;
    column?: string;
    fieldLabel?: string;
  };
}

export interface BatchResult {
  success: boolean;
  processed: number;
  errors: Array<{
    id: string;
    error: string;
  }>;
}

// Process a batch of embedding jobs
export async function processBatch(items: BatchItem[]): Promise<BatchResult> {
  const results: BatchResult = {
    success: true,
    processed: 0,
    errors: []
  };
  
  // Process in chunks of BATCH_SIZE
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    
    try {
      await processChunk(chunk, results);
    } catch (error) {
      console.error('Batch processing error:', error);
      results.success = false;
      
      // Mark all items in this chunk as failed
      chunk.forEach(item => {
        results.errors.push({
          id: item.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    }
  }
  
  return results;
}

// Process a single chunk of items
async function processChunk(chunk: BatchItem[], results: BatchResult): Promise<void> {
  const promises = chunk.map(async (item) => {
    try {
      // Mark as processing
      markJobProcessing(item.id);
      
      let embedding: number[];
      let finalText = item.text;
      
      // Handle session-level jobs that need GPT summarization
      if (item.level === 'session') {
        try {
          finalText = await generateSessionSummary(item.text);
        } catch (summaryError) {
          console.error('Session summary generation failed:', summaryError);
          // Fall back to using raw text if summary fails
          finalText = item.text;
        }
      }
      
      // Generate embedding
      embedding = await generateEmbedding(finalText);
      
      // Store in LanceDB
      await storeEmbedding(
        item.id,
        item.level,
        item.sessionId,
        finalText,
        embedding,
        item.metadata
      );
      
      // Mark as done
      updateJobStatus(item.id, 'done');
      results.processed++;
      
    } catch (error) {
      console.error(`Failed to process embedding job ${item.id}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateJobStatus(item.id, 'error', errorMessage);
      
      results.errors.push({
        id: item.id,
        error: errorMessage
      });
      
      results.success = false;
    }
  });
  
  // Wait for all items in this chunk to complete
  await Promise.allSettled(promises);
}

// Retry failed embeddings with exponential backoff
export async function retryFailedEmbeddings(
  items: BatchItem[],
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<BatchResult> {
  let attempt = 0;
  let lastResult: BatchResult | null = null;
  
  while (attempt < maxRetries) {
    try {
      const result = await processBatch(items);
      
      if (result.success) {
        return result;
      }
      
      lastResult = result;
      
      // If we have partial success, only retry the failed items
      if (result.errors.length < items.length) {
        const failedIds = new Set(result.errors.map(e => e.id));
        items = items.filter(item => failedIds.has(item.id));
      }
      
      attempt++;
      
      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt - 1);
        console.log(`Retrying batch processing in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
    } catch (error) {
      console.error(`Batch retry attempt ${attempt} failed:`, error);
      attempt++;
      
      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  return lastResult || {
    success: false,
    processed: 0,
    errors: items.map(item => ({
      id: item.id,
      error: 'Max retries exceeded'
    }))
  };
}

// Check network connectivity
export async function checkNetworkConnectivity(): Promise<boolean> {
  try {
    // Simple connectivity check using a public endpoint that doesn't require auth
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    // Use Google's public DNS-over-HTTPS endpoint for a simple connectivity check
    const response = await fetch('https://dns.google/resolve?name=google.com&type=A', {
      method: 'HEAD',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.log('Network connectivity check failed:', error);
    return false;
  }
}

// Rate limiting helper
export class RateLimiter {
  private lastRequestTime = 0;
  private requestCount = 0;
  private readonly maxRequestsPerMinute: number;
  
  constructor(maxRequestsPerMinute: number = 3000) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
  }
  
  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    
    // Reset counter if more than a minute has passed
    if (now - this.lastRequestTime > oneMinute) {
      this.requestCount = 0;
    }
    
    // Check if we're hitting rate limits
    if (this.requestCount >= this.maxRequestsPerMinute) {
      const waitTime = oneMinute - (now - this.lastRequestTime);
      console.log(`Rate limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
    }
    
    this.requestCount++;
    this.lastRequestTime = now;
  }
}

// Create a global rate limiter instance
export const globalRateLimiter = new RateLimiter(); 