import { StateGraph, END, START } from '@langchain/langgraph';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { embeddingManager } from './embedding-manager';
import { ChatOpenAI } from '@langchain/openai';
import { getEncryptedKey, db } from './db';
import { safeStorage } from 'electron';

// --- Tool Definitions ---

// 1. Search Tool
const searchTool = new DynamicStructuredTool({
    name: 'search_work_cycles',
    description: 'Searches and retrieves user work cycle data, including session intentions, cycle goals, and reflections. Use for questions about "what", "how", "when", etc.',
    schema: z.object({
        query: z.string().describe('The user query to search for. Should be a semantic description of what the user is looking for.'),
    }),
    func: async ({ query }) => {
        try {
            console.log(`Performing search for: ${query}`);
            const searchResults = await embeddingManager.enhancedSearch(query);
            return JSON.stringify(searchResults, null, 2);
        } catch (error) {
            console.error('Error during semantic search:', error);
            return "Failed to perform search.";
        }
    },
});

// 2. Charting Tool
const chartTool = new DynamicStructuredTool({
    name: 'generate_chart',
    description: 'Generates chart data based on a user query by writing and executing a SQL query against the database. Use this for any requests about trends, counts, or data over time, like "show me a graph of..." or "how many cycles...".',
    schema: z.object({
        query: z.string().describe('A natural language query that can be converted into a SQL query. e.g., "my cycle count per day for the last week"'),
    }),
    func: async ({ query }) => {
        console.log(`Chart generation requested for: ${query}`);
        const schema = `
          CREATE TABLE cycles (
            id TEXT PRIMARY KEY,
            sessionId TEXT,
            idx INTEGER,
            goal TEXT,
            energy TEXT, -- 'High' | 'Medium' | 'Low'
            morale TEXT, -- 'High' | 'Medium' | 'Low'
            status TEXT, -- 'hit' | 'miss' | 'partial'
            startedAt DATETIME,
            endedAt DATETIME
          );
          CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            startedAt DATETIME,
            objective TEXT,
            concrete BOOLEAN
          );
        `;
        const prompt = `
            You are an expert SQL analyst. Given the following database schema and a user's natural language query, write a single, valid SQLite query to answer the user's question.

            Schema:
            ${schema}

            User Query: ${query}

            Your response MUST be a JSON object with two keys: "query" and "confidence".
            - "query": A string containing only the SQLite query.
            - "confidence": A number between 0 and 1 indicating how confident you are that the query is correct.

            If the user's request is ambiguous or cannot be answered with the given schema, return a confidence of 0 and a query that asks a clarifying question.
            Do not under any circumstances return a query that modifies the database (e.g., INSERT, UPDATE, DELETE). Only SELECT statements are allowed.
        `;

        try {
            const llmResponse = await model.invoke(prompt);
            const responseJson = JSON.parse(llmResponse.content as string);

            if (responseJson.confidence < 0.8) {
                return `I'm not confident I can answer that. Clarification: ${responseJson.query}`;
            }

            console.log(`Executing generated SQL: ${responseJson.query}`);
            const data = db.prepare(responseJson.query).all();
            return JSON.stringify(data, null, 2);

        } catch (error) {
            console.error('Error in chart generation tool:', error);
            return "Sorry, I was unable to generate the data for that chart.";
        }
    }
});

const tools = [searchTool, chartTool];
const toolNode = new ToolNode(tools);

// --- LLM and Agent Definition ---

function getOpenAIKey() {
    const row = getEncryptedKey();
    if (!row) return null;
    const { cipher, encrypted } = row;
    if (encrypted) {
        if (safeStorage.isEncryptionAvailable()) {
            try { return safeStorage.decryptString(Buffer.from(cipher)); } catch { return null; }
        }
        return null;
    }
    return cipher.toString();
}

const model = new ChatOpenAI({ 
    apiKey: getOpenAIKey() ?? undefined,
    modelName: 'gpt-4o-mini',
    temperature: 0,
});

const modelWithTools = model.bindTools(tools);

const agentNode = async (state: AgentState) => {
    const response = await modelWithTools.invoke(state.messages);
    return { messages: [response] };
};

// --- Graph Definition ---

// Define a function to decide which path to take
const shouldContinue = (state: AgentState) => {
  const { messages } = state;
  const lastMessage = messages[messages.length - 1] as AIMessage;
  if (lastMessage.tool_calls?.length) {
    return 'tools';
  }
  return END;
};

// Define the state for our agent
interface AgentState {
  messages: BaseMessage[];
  searchResults?: any[];
  chartData?: any;
}

const workflow = new StateGraph<AgentState>({
  channels: {
    messages: {
      value: (x, y) => x.concat(y),
      default: () => [],
    },
    searchResults: {
        value: (x, y) => y,
        default: () => [],
    },
    chartData: {
        value: (x, y) => y,
        default: () => undefined,
    }
  },
});

// Add the nodes to the graph
workflow.addNode('agent', agentNode);
workflow.addNode('tools', toolNode);

// Define the graph connections
workflow.addEdge(START, 'agent');
workflow.addConditionalEdges(
  'agent',
  shouldContinue,
  {
    tools: 'tools',
    __end__: END
  }
);
workflow.addEdge('tools', 'agent');

// Compile the graph
export const conversationalAgent = workflow.compile();
