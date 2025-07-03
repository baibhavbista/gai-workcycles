// Embedding Manager - Main interface for embedding system management
import { 
  searchEmbeddings,
  cascadingSearch,
  resetOpenAIClient
} from './db.ts';
import { 
  enhancedSearchEngine,
  EnhancedSearchResult,
  SearchOptions,
  SearchFilter
} from './search-engine.ts';
import {
  getJobQueueStatus, 
  getPendingEmbedJobs, 
  getJobStatistics,
  performPeriodicCleanup,
  createEmbeddingJobsForExistingData 
} from './db.ts';
import { 
  checkNetworkConnectivity,
  globalRateLimiter
} from './batch-processor.ts';
import {
  executeFieldEmbeddingWorkflow,
  executeCycleEmbeddingWorkflow,
  executeSessionEmbeddingWorkflow,
  type WorkflowResult
} from './embedding-workflows.ts';

// Manager class to coordinate all embedding operations
export class EmbeddingManager {
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.startPeriodicCleanup();
  }
  
  // Start the background processing
  startProcessing(intervalMs: number = 30000): void {
    if (this.isProcessing) {
      console.log('Embedding processing already started');
      return;
    }
    
    this.isProcessing = true;
    console.log('Starting embedding background processing');
    
    this.processingInterval = setInterval(async () => {
      await this.processQueue();
    }, intervalMs);
    
    // Process immediately
    this.processQueue();
  }
  
  // Stop the background processing
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    this.isProcessing = false;
    console.log('Embedding background processing stopped');
  }
  
  // Process pending embedding jobs using LangGraph workflows
  async processQueue(): Promise<void> {
    try {
      // Check network connectivity first
      const isOnline = await checkNetworkConnectivity();
      if (!isOnline) {
        console.log('Offline - skipping embedding job processing');
        return;
      }
      
      // Get pending jobs
      const pendingJobs = getPendingEmbedJobs(50); // Process up to 50 jobs at a time
      
      if (pendingJobs.length === 0) {
        return; // No jobs to process
      }
      
      console.log(`Processing ${pendingJobs.length} embedding jobs`);
      
      // Group jobs by level for appropriate workflow execution
      const fieldJobs = pendingJobs.filter(job => job.level === 'field');
      const cycleJobs = pendingJobs.filter(job => job.level === 'cycle');
      const sessionJobs = pendingJobs.filter(job => job.level === 'session');
      
      let totalProcessed = 0;
      let totalErrors = 0;
      
      // Process field-level jobs in batch
      if (fieldJobs.length > 0) {
        console.log(`Processing ${fieldJobs.length} field-level embedding jobs`);
        const fieldResult = await executeFieldEmbeddingWorkflow(fieldJobs);
        totalProcessed += fieldResult.processed;
        totalErrors += fieldResult.errors;
        
        if (fieldResult.success) {
          console.log(`Field workflow completed successfully: ${fieldResult.processed} jobs`);
        } else {
          console.log(`Field workflow completed with errors: ${fieldResult.errors} failed`);
        }
      }
      
      // Process cycle-level jobs individually
      if (cycleJobs.length > 0) {
        console.log(`Processing ${cycleJobs.length} cycle-level embedding jobs`);
        
        for (const cycleJob of cycleJobs) {
          try {
            const cycleResult = await executeCycleEmbeddingWorkflow(cycleJob);
            totalProcessed += cycleResult.processed;
            totalErrors += cycleResult.errors;
            
            if (cycleResult.success) {
              console.log(`Cycle workflow completed: ${cycleJob.id}`);
            } else {
              console.log(`Cycle workflow failed: ${cycleJob.id}`);
            }
          } catch (error) {
            console.error(`Error processing cycle job ${cycleJob.id}:`, error);
            totalErrors++;
          }
        }
      }
      
      // Process session-level jobs individually
      if (sessionJobs.length > 0) {
        console.log(`Processing ${sessionJobs.length} session-level embedding jobs`);
        
        for (const sessionJob of sessionJobs) {
          try {
            const sessionResult = await executeSessionEmbeddingWorkflow(sessionJob);
            totalProcessed += sessionResult.processed;
            totalErrors += sessionResult.errors;
            
            if (sessionResult.success) {
              console.log(`Session workflow completed: ${sessionJob.id}`);
            } else {
              console.log(`Session workflow failed: ${sessionJob.id}`);
            }
          } catch (error) {
            console.error(`Error processing session job ${sessionJob.id}:`, error);
            totalErrors++;
          }
        }
      }
      
      console.log(`Embedding queue processing completed: ${totalProcessed} successful, ${totalErrors} errors`);
      
    } catch (error) {
      console.error('Error processing embedding queue:', error);
    }
  }
  
  // Get current status
  getStatus(): {
    isProcessing: boolean;
    queueStatus: ReturnType<typeof getJobQueueStatus>;
    statistics: ReturnType<typeof getJobStatistics>;
  } {
    return {
      isProcessing: this.isProcessing,
      queueStatus: getJobQueueStatus(),
      statistics: getJobStatistics()
    };
  }
  
  // Search embeddings (legacy method)
  async search(query: string, options: {
    level?: 'field' | 'cycle' | 'session';
    sessionId?: string;
    limit?: number;
  } = {}): Promise<any[]> {
    return await searchEmbeddings(query, options);
  }
  
  // Cascading search (legacy method)
  async cascadingSearch(query: string, userIntent: string, k: number = 8): Promise<any[]> {
    return await cascadingSearch(query, userIntent, k);
  }

  // Enhanced search methods
  async enhancedSearch(
    query: string,
    userIntent?: string,
    options: SearchOptions = {}
  ): Promise<EnhancedSearchResult[]> {
    return await enhancedSearchEngine.search(query, userIntent, options);
  }

  async enhancedCascadingSearch(
    query: string,
    userIntent: string,
    k: number = 8,
    options: SearchOptions = {}
  ): Promise<EnhancedSearchResult[]> {
    return await enhancedSearchEngine.cascadingSearch(query, userIntent, k, options);
  }

  async getSearchSuggestions(
    partialQuery: string,
    limit: number = 5
  ): Promise<string[]> {
    return await enhancedSearchEngine.getSearchSuggestions(partialQuery, limit);
  }

  getSearchAnalytics() {
    return enhancedSearchEngine.getSearchAnalytics();
  }
  
  // Create jobs for existing data
  async backfillExistingData(limit: number = 100): Promise<{
    sessionsProcessed: number;
    cyclesProcessed: number;
    jobsCreated: number;
  }> {
    console.log('Starting backfill of existing data for embeddings');
    const result = await createEmbeddingJobsForExistingData(limit);
    
    // Trigger immediate processing if we're running
    if (this.isProcessing) {
      setTimeout(() => this.processQueue(), 1000);
    }
    
    return result;
  }
  
  // Reset OpenAI client (for settings changes)
  resetClient(): void {
    resetOpenAIClient();
  }
  
  // Start periodic cleanup
  private startPeriodicCleanup(): void {
    // Run cleanup every 4 hours
    this.cleanupInterval = setInterval(() => {
      performPeriodicCleanup();
    }, 4 * 60 * 60 * 1000);
    
    // Run cleanup immediately
    performPeriodicCleanup();
  }
  
  // Stop periodic cleanup
  private stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  // Cleanup resources
  shutdown(): void {
    this.stopProcessing();
    this.stopPeriodicCleanup();
  }
}

// Export singleton instance
export const embeddingManager = new EmbeddingManager();

// Export for main process usage
export {
  getJobQueueStatus,
  getJobStatistics,
  searchEmbeddings,
  cascadingSearch,
  checkNetworkConnectivity
}; 