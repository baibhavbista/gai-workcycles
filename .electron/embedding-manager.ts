// Embedding Manager - Main interface for embedding system management
import { 
  getJobQueueStatus, 
  getPendingEmbedJobs, 
  getJobStatistics,
  searchEmbeddings,
  cascadingSearch,
  resetOpenAIClient
} from './embeddings.js';
import { 
  processBatch, 
  retryFailedEmbeddings, 
  checkNetworkConnectivity,
  globalRateLimiter,
  type BatchItem 
} from './batch-processor.js';
import { 
  performPeriodicCleanup,
  createEmbeddingJobsForExistingData 
} from './db.js';

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
  
  // Process pending embedding jobs
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
      
      // Convert to batch items
      const batchItems: BatchItem[] = pendingJobs.map(job => ({
        id: job.id,
        text: job.text,
        level: job.level,
        sessionId: job.sessionId,
        metadata: {
          cycleId: job.cycleId,
          column: job.columnName,
          fieldLabel: job.fieldLabel
        }
      }));
      
      // Apply rate limiting
      await globalRateLimiter.waitForSlot();
      
      // Process the batch
      const result = await processBatch(batchItems);
      
      if (result.success) {
        console.log(`Successfully processed ${result.processed} embedding jobs`);
      } else {
        console.log(`Processed ${result.processed} jobs with ${result.errors.length} errors`);
        
        // Retry failed jobs (up to 3 times)
        if (result.errors.length > 0) {
          const failedItems = batchItems.filter(item => 
            result.errors.some(error => error.id === item.id)
          );
          
          if (failedItems.length > 0) {
            console.log(`Retrying ${failedItems.length} failed embedding jobs`);
            await retryFailedEmbeddings(failedItems);
          }
        }
      }
      
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
  
  // Search embeddings
  async search(query: string, options: {
    level?: 'field' | 'cycle' | 'session';
    sessionId?: string;
    limit?: number;
  } = {}): Promise<any[]> {
    return await searchEmbeddings(query, options);
  }
  
  // Cascading search
  async cascadingSearch(query: string, userIntent: string, k: number = 8): Promise<any[]> {
    return await cascadingSearch(query, userIntent, k);
  }
  
  // Create jobs for existing data
  async backfillExistingData(limit: number = 100): Promise<{
    sessionsProcessed: number;
    cyclesProcessed: number;
    jobsCreated: number;
  }> {
    console.log('Starting backfill of existing data for embeddings');
    const result = createEmbeddingJobsForExistingData(limit);
    
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