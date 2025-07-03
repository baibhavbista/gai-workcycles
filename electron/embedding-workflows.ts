// LangGraph Workflows for Embedding Processing
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { RunnableConfig } from '@langchain/core/runnables';
import { 
  generateEmbedding, 
  generateSessionSummary, 
  storeEmbedding
} from './db.ts';
import {
  markJobProcessing,
  updateJobStatus,
  EmbedJob
} from './db.ts';
import { globalRateLimiter } from './batch-processor.ts';

// ===============================
// State Definitions
// ===============================

// State for Field-Level Embedding Workflow
const FieldEmbedState = Annotation.Root({
  jobs: Annotation<EmbedJob[]>({
    reducer: (x, y) => Array.isArray(y) ? y : x || [],
  }),
  processedJobs: Annotation<string[]>({
    reducer: (x, y) => Array.isArray(y) ? [...(x || []), ...y] : x || [],
  }),
  errors: Annotation<{ jobId: string; error: string }[]>({
    reducer: (x, y) => Array.isArray(y) ? [...(x || []), ...y] : x || [],
  }),
  retryCount: Annotation<number>({
    reducer: (x, y) => typeof y === 'number' ? y : x || 0,
  }),
  batchSize: Annotation<number>({
    reducer: (x, y) => typeof y === 'number' ? y : x || 10,
  }),
});

// State for Cycle-Level Embedding Workflow
const CycleEmbedState = Annotation.Root({
  job: Annotation<EmbedJob>({
    reducer: (x, y) => y || x,
  }),
  combinedText: Annotation<string>({
    reducer: (x, y) => y || x || '',
  }),
  embedding: Annotation<number[]>({
    reducer: (x, y) => Array.isArray(y) ? y : x || [],
  }),
  error: Annotation<string>({
    reducer: (x, y) => y || x || '',
  }),
  retryCount: Annotation<number>({
    reducer: (x, y) => typeof y === 'number' ? y : x || 0,
  }),
});

// State for Session-Level Embedding Workflow
const SessionEmbedState = Annotation.Root({
  job: Annotation<EmbedJob>({
    reducer: (x, y) => y || x,
  }),
  rawData: Annotation<string>({
    reducer: (x, y) => y || x || '',
  }),
  summary: Annotation<string>({
    reducer: (x, y) => y || x || '',
  }),
  embedding: Annotation<number[]>({
    reducer: (x, y) => Array.isArray(y) ? y : x || [],
  }),
  error: Annotation<string>({
    reducer: (x, y) => y || x || '',
  }),
  retryCount: Annotation<number>({
    reducer: (x, y) => typeof y === 'number' ? y : x || 0,
  }),
});

// ===============================
// Field-Level Embedding Workflow
// ===============================

// Node: Fetch and prepare field-level jobs
async function fetchFieldJobs(
  state: typeof FieldEmbedState.State,
  config?: RunnableConfig
): Promise<Partial<typeof FieldEmbedState.State>> {
  try {
    console.log(`Processing ${state.jobs.length} field embedding jobs`);
    
    // Mark all jobs as processing
    for (const job of state.jobs) {
      markJobProcessing(job.id);
    }
    
    return { processedJobs: [] };
  } catch (error) {
    console.error('Error in fetchFieldJobs:', error);
    return { 
      errors: [{ jobId: 'batch', error: error instanceof Error ? error.message : 'Unknown error' }] 
    };
  }
}

// Node: Generate embeddings for field batch
async function generateFieldEmbeddings(
  state: typeof FieldEmbedState.State,
  config?: RunnableConfig
): Promise<Partial<typeof FieldEmbedState.State>> {
  try {
    const processedJobs: string[] = [];
    const errors: { jobId: string; error: string }[] = [];
    
    // Process jobs in batches
    const batchSize = state.batchSize || 10;
    for (let i = 0; i < state.jobs.length; i += batchSize) {
      const batch = state.jobs.slice(i, i + batchSize);
      
      // Apply rate limiting
      await globalRateLimiter.waitForSlot();
      
      // Process batch in parallel
      const batchPromises = batch.map(async (job) => {
        try {
          // Generate embedding
          const embedding = await generateEmbedding(job.text);
          
          // Store in LanceDB
          await storeEmbedding(
            job.id,
            job.level,
            job.sessionId,
            job.text,
            embedding,
            {
              cycleId: job.cycleId,
              column: job.columnName,
              fieldLabel: job.fieldLabel
            }
          );
          
          // Mark as done
          updateJobStatus(job.id, 'done');
          return job.id;
        } catch (error) {
          console.error(`Failed to process field job ${job.id}:`, error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          updateJobStatus(job.id, 'error', errorMessage);
          throw { jobId: job.id, error: errorMessage };
        }
      });
      
      // Wait for batch to complete
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          processedJobs.push(result.value);
        } else {
          errors.push(result.reason);
        }
      });
    }
    
    console.log(`Field embedding batch completed: ${processedJobs.length} successful, ${errors.length} errors`);
    
    return { 
      processedJobs,
      errors
    };
  } catch (error) {
    console.error('Error in generateFieldEmbeddings:', error);
    return { 
      errors: [{ jobId: 'batch', error: error instanceof Error ? error.message : 'Unknown error' }] 
    };
  }
}

// Conditional edge: Should retry failed jobs?
function shouldRetryFieldJobs(state: typeof FieldEmbedState.State): string {
  const hasErrors = state.errors.length > 0;
  const canRetry = state.retryCount < 3;
  
  if (hasErrors && canRetry) {
    console.log(`Retrying ${state.errors.length} failed field jobs (attempt ${state.retryCount + 1}/3)`);
    return 'retry';
  }
  
  if (hasErrors) {
    console.log(`Max retries reached for field jobs, ${state.errors.length} jobs failed permanently`);
    return 'error';
  }
  
  return 'complete';
}

// Node: Retry failed jobs
async function retryFieldJobs(
  state: typeof FieldEmbedState.State,
  config?: RunnableConfig
): Promise<Partial<typeof FieldEmbedState.State>> {
  // Filter jobs to only retry the failed ones
  const failedJobIds = new Set(state.errors.map(e => e.jobId));
  const jobsToRetry = state.jobs.filter(job => failedJobIds.has(job.id));
  
  // Exponential backoff delay
  const delay = 1000 * Math.pow(2, state.retryCount);
  await new Promise(resolve => setTimeout(resolve, delay));
  
  return {
    jobs: jobsToRetry,
    errors: [], // Reset errors for retry
    retryCount: state.retryCount + 1
  };
}

// Build Field Embedding Workflow
const fieldEmbeddingWorkflow = new StateGraph(FieldEmbedState)
  .addNode('fetch', fetchFieldJobs)
  .addNode('generate', generateFieldEmbeddings)
  .addNode('retry', retryFieldJobs)
  .addEdge(START, 'fetch')
  .addEdge('fetch', 'generate')
  .addConditionalEdges('generate', shouldRetryFieldJobs, {
    'retry': 'retry',
    'complete': END,
    'error': END
  })
  .addEdge('retry', 'generate');

export const fieldEmbeddingGraph = fieldEmbeddingWorkflow.compile();

// ===============================
// Cycle-Level Embedding Workflow
// ===============================

// Node: Combine cycle planning and review data
async function combineCycleData(
  state: typeof CycleEmbedState.State,
  config?: RunnableConfig
): Promise<Partial<typeof CycleEmbedState.State>> {
  try {
    console.log(`Processing cycle embedding job: ${state.job.id}`);
    
    // Mark job as processing
    markJobProcessing(state.job.id);
    
    // The text is already combined in the job creation, so we use it directly
    const combinedText = state.job.text;
    
    return { combinedText };
  } catch (error) {
    console.error('Error in combineCycleData:', error);
    return { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Node: Generate cycle embedding
async function generateCycleEmbedding(
  state: typeof CycleEmbedState.State,
  config?: RunnableConfig
): Promise<Partial<typeof CycleEmbedState.State>> {
  try {
    // Apply rate limiting
    await globalRateLimiter.waitForSlot();
    
    // Generate embedding
    const embedding = await generateEmbedding(state.combinedText);
    
    // Store in LanceDB
    await storeEmbedding(
      state.job.id,
      state.job.level,
      state.job.sessionId,
      state.combinedText,
      embedding,
      {
        cycleId: state.job.cycleId
      }
    );
    
    // Mark as done
    updateJobStatus(state.job.id, 'done');
    
    console.log(`Cycle embedding completed: ${state.job.id}`);
    return { embedding };
  } catch (error) {
    console.error(`Failed to generate cycle embedding for job ${state.job.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateJobStatus(state.job.id, 'error', errorMessage);
    return { error: errorMessage };
  }
}

// Conditional edge: Should retry cycle job?
function shouldRetryCycleJob(state: typeof CycleEmbedState.State): string {
  const hasError = state.error !== '';
  const canRetry = state.retryCount < 3;
  
  if (hasError && canRetry) {
    console.log(`Retrying cycle job ${state.job.id} (attempt ${state.retryCount + 1}/3)`);
    return 'retry';
  }
  
  if (hasError) {
    console.log(`Max retries reached for cycle job ${state.job.id}`);
    return 'error';
  }
  
  return 'complete';
}

// Node: Retry cycle job
async function retryCycleJob(
  state: typeof CycleEmbedState.State,
  config?: RunnableConfig
): Promise<Partial<typeof CycleEmbedState.State>> {
  // Exponential backoff delay
  const delay = 1000 * Math.pow(2, state.retryCount);
  await new Promise(resolve => setTimeout(resolve, delay));
  
  return {
    error: '', // Reset error for retry
    retryCount: state.retryCount + 1
  };
}

// Build Cycle Embedding Workflow
const cycleEmbeddingWorkflow = new StateGraph(CycleEmbedState)
  .addNode('combine', combineCycleData)
  .addNode('generate', generateCycleEmbedding)
  .addNode('retry', retryCycleJob)
  .addEdge(START, 'combine')
  .addEdge('combine', 'generate')
  .addConditionalEdges('generate', shouldRetryCycleJob, {
    'retry': 'retry',
    'complete': END,
    'error': END
  })
  .addEdge('retry', 'generate');

export const cycleEmbeddingGraph = cycleEmbeddingWorkflow.compile();

// ===============================
// Session-Level Embedding Workflow
// ===============================

// Node: Generate session summary with GPT-4o-mini
async function generateSummary(
  state: typeof SessionEmbedState.State,
  config?: RunnableConfig
): Promise<Partial<typeof SessionEmbedState.State>> {
  try {
    console.log(`Generating summary for session job: ${state.job.id}:`, state.job.text);

    // state.job.text here is actually the stringified JSON of the session data
    
    // Mark job as processing
    markJobProcessing(state.job.id);
    
    // Apply rate limiting
    await globalRateLimiter.waitForSlot();
    
    // Generate summary using GPT-4o-mini
    const summary = await generateSessionSummary(state.job.text);
    
    console.log(`Session summary generated: ${summary.length} characters`);
    return { 
      rawData: state.job.text,
      summary 
    };
  } catch (error) {
    console.error(`Failed to generate summary for session job ${state.job.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Fallback to raw data if summary generation fails
    console.log('Falling back to raw session data for embedding');
    return { 
      rawData: state.job.text,
      summary: state.job.text, // Use raw data as fallback
      error: `Summary generation failed: ${errorMessage}`
    };
  }
}

// Node: Generate session embedding
async function generateSessionEmbedding(
  state: typeof SessionEmbedState.State,
  config?: RunnableConfig
): Promise<Partial<typeof SessionEmbedState.State>> {
  try {
    // Apply rate limiting
    await globalRateLimiter.waitForSlot();
    
    // Generate embedding from the summary
    console.log('Generating session embedding from summary:', state.summary);
    const embedding = await generateEmbedding(state.summary);
    
    // Store in LanceDB
    await storeEmbedding(
      state.job.id,
      state.job.level,
      state.job.sessionId,
      state.summary, // Store the summary text, not raw data
      embedding
    );
    
    // Mark as done
    updateJobStatus(state.job.id, 'done');
    
    console.log(`Session embedding completed: ${state.job.id}`);
    return { embedding };
  } catch (error) {
    console.error(`Failed to generate session embedding for job ${state.job.id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateJobStatus(state.job.id, 'error', errorMessage);
    return { error: errorMessage };
  }
}

// Conditional edge: Should retry session job?
function shouldRetrySessionJob(state: typeof SessionEmbedState.State): string {
  const hasError = state.error !== '';
  const canRetry = state.retryCount < 3;
  
  if (hasError && canRetry) {
    console.log(`Retrying session job ${state.job.id} (attempt ${state.retryCount + 1}/3)`);
    return 'retry';
  }
  
  if (hasError) {
    console.log(`Max retries reached for session job ${state.job.id}`);
    return 'error';
  }
  
  return 'complete';
}

// Node: Retry session job
async function retrySessionJob(
  state: typeof SessionEmbedState.State,
  config?: RunnableConfig
): Promise<Partial<typeof SessionEmbedState.State>> {
  // Exponential backoff delay
  const delay = 1000 * Math.pow(2, state.retryCount);
  await new Promise(resolve => setTimeout(resolve, delay));
  
  return {
    error: '', // Reset error for retry
    retryCount: state.retryCount + 1
  };
}

// Build Session Embedding Workflow
const sessionEmbeddingWorkflow = new StateGraph(SessionEmbedState)
  .addNode('summarize', generateSummary)
  .addNode('generate', generateSessionEmbedding)
  .addNode('retry', retrySessionJob)
  .addEdge(START, 'summarize')
  .addEdge('summarize', 'generate')
  .addConditionalEdges('generate', shouldRetrySessionJob, {
    'retry': 'retry',
    'complete': END,
    'error': END
  })
  .addEdge('retry', 'generate');

export const sessionEmbeddingGraph = sessionEmbeddingWorkflow.compile();

// ===============================
// Workflow Orchestrator
// ===============================

export interface WorkflowResult {
  success: boolean;
  processed: number;
  errors: number;
  details?: any;
}

// Execute field-level embedding workflow
export async function executeFieldEmbeddingWorkflow(jobs: EmbedJob[]): Promise<WorkflowResult> {
  try {
    const result = await fieldEmbeddingGraph.invoke({
      jobs,
      processedJobs: [],
      errors: [],
      retryCount: 0,
      batchSize: 10
    });
    
    return {
      success: result.errors.length === 0,
      processed: result.processedJobs.length,
      errors: result.errors.length,
      details: result
    };
  } catch (error) {
    console.error('Field embedding workflow failed:', error);
    return {
      success: false,
      processed: 0,
      errors: jobs.length,
      details: error
    };
  }
}

// Execute cycle-level embedding workflow
export async function executeCycleEmbeddingWorkflow(job: EmbedJob): Promise<WorkflowResult> {
  try {
    const result = await cycleEmbeddingGraph.invoke({
      job,
      combinedText: '',
      embedding: [],
      error: '',
      retryCount: 0
    });
    
    return {
      success: result.error === '',
      processed: result.error === '' ? 1 : 0,
      errors: result.error === '' ? 0 : 1,
      details: result
    };
  } catch (error) {
    console.error('Cycle embedding workflow failed:', error);
    return {
      success: false,
      processed: 0,
      errors: 1,
      details: error
    };
  }
}

// Execute session-level embedding workflow
export async function executeSessionEmbeddingWorkflow(job: EmbedJob): Promise<WorkflowResult> {
  try {
    const result = await sessionEmbeddingGraph.invoke({
      job,
      rawData: '',
      summary: '',
      embedding: [],
      error: '',
      retryCount: 0
    });
    
    return {
      success: result.error === '',
      processed: result.error === '' ? 1 : 0,
      errors: result.error === '' ? 0 : 1,
      details: result
    };
  } catch (error) {
    console.error('Session embedding workflow failed:', error);
    return {
      success: false,
      processed: 0,
      errors: 1,
      details: error
    };
  }
} 