/** Shape of the Chat Completion response for tool calls */
interface ChatToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
  type: "function";
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content?: string;
  tool_calls?: ChatToolCall[];
}

interface ChatChoice {
  message: ChatMessage;
  finish_reason: string;
}

interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatChoice[];
}

// ---------------- Question specification ----------------
// 1) Simple string question -> {key, question}
// 2) Boolean (checkbox)     -> {key, question, type: 'boolean'}
// 3) Enum (select list)     -> {key, question, enum: [...values]}

// Note that OPenAI `parameters` are defined by JSON Schema (https://json-schema.org/), 
//   so we can leverage many of its rich features like property types, enums, descriptions, nested objects, and, recursive objects.

export type QuestionSpec =
  | { key: string; question: string }
  | { key: string; question: string; type: 'boolean' }
  | { key: string; question: string; enum: string[] };

/**
 * Dynamically build the JSON‐schema for the form‐filling function.
 */
export function buildFormTool(specs: QuestionSpec[]) { 
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const spec of specs) {
    // Normalize tuple -> object
    const s: QuestionSpec = Array.isArray(spec)
      ? { key: spec[0], question: spec[1] }
      : spec;

    if ('enum' in s) {
      properties[s.key] = {
        type: 'string',
        enum: s.enum,
        description: `Answer to: ${s.question}`,
      };
    } else if ((s as any).type === 'boolean') {
      properties[s.key] = {
        type: ['boolean', 'null'],
        description: `Answer to: ${s.question}`,
      };
    } else {
      properties[s.key] = {
        type: 'string',
        description: `Answer to: ${s.question}`,
      };
    }
    required.push(s.key);
  }

  return {
    type: "function",
    function: {
      name: "fill_form",
      description: "Populate the user's form with their spoken answers",
      parameters: {
        type: "object",
        properties,
        required,
        additionalProperties: false    // ← forbid any unspecified fields
      }
    }
  };
}

/**
 * Turn your questions into a numbered prompt.
 */
export function buildQuestionsPrompt(specs: QuestionSpec[]): string {
  return specs
    .map((spec, idx) => {
      const q = Array.isArray(spec) ? spec[1] : spec.question;
      return `${idx + 1}) ${q}`;
    })
    .join('\n');
}

/**
 * Call OpenAI's chat API to fill the form using `tools` + `tool_choice`.
 *
 * @param transcript - raw text from Whisper
 * @param pairs      - your [fieldKey, question] list
 * @param apiKey     - a valid OpenAI API key
 * @returns          - object mapping each key to its answered string
 */
export async function autoFillForm(
  transcript: string,
  specs: QuestionSpec[],
  apiKey: string
): Promise<Record<string, string>> {
  const formTool = buildFormTool(specs);
  const questionsPrompt = buildQuestionsPrompt(specs);

  // Build the payload using the newer `tools` + `tool_choice` parameters.
  let payload: any = {
    model: "gpt-4o-mini", // cost-effective model that supports tool calls
    messages: [
      {
        role: "system",
        content:
          `You're a form-filling assistant. Use the user's transcript to answer each question exactly. 
          Do not fabricate information. If the user didn't mention something, return null.
          For enum or boolean fields return null unless the transcript states the value explicitly.
          Do NOT guess or infer.`
      },
      { role: "user", content: questionsPrompt },
      { role: "user", content: `Transcript:\n${transcript}` }
    ],
    tools: [formTool],
    // Force the model to call our single tool.
    tool_choice: { type: "function", function: { name: formTool.function.name } }
  };

  // We'll try twice: if the first response isn't valid JSON, ask the model to reply strictly with JSON.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error: ${res.status} – ${err}`);
    }

    const data = (await res.json()) as any;
    const choice = data.choices?.[0];

    // New tool calling response shape: tool_calls array inside the assistant message.
    const toolCalls = choice?.message?.tool_calls as
      | Array<{ function: { name: string; arguments: string } }>
      | undefined;

    let argStr: string | undefined;

    if (toolCalls?.length) {
      argStr = toolCalls[0].function.arguments;
    } else if (choice?.message?.function_call) {
      // Fallback for legacy `function_call`.
      argStr = choice.message.function_call.arguments;
    }

    if (!argStr) {
      throw new Error("Model response did not include a tool/function call");
    }

    try {
      return JSON.parse(argStr);
    } catch {
      // Ask the model again with a stricter instruction.
      payload.messages.push({
        role: "assistant",
        content:
          "Your last response was not valid JSON. Please reply **only** with the JSON object that matches the tool schema—no extra text."
      });
      continue; // retry
    }
  }

  // If we reach here both attempts failed.
  throw new Error("Failed to obtain valid JSON from OpenAI after 2 attempts");
} 

export const mergeDataOnVoiceComplete = (setterFn: (arg0: { (prev: any): any; (prev: any): any; }) => void, formSchema: QuestionSpec[], transcript: string, filled?: Record<string, string>) => {
  console.log('transcript', transcript);
  console.log('filled', filled);

  if (filled) {
    setterFn(prev => {
      const merged = { ...prev };
      for (const [key, value] of Object.entries(filled)) {
        // if value is null or empty string, skip
        //   lol sometimes GPT responds with the string "null"
        if (value === null || value === '' || value === undefined || value === 'undefined' || value === 'null') continue;
        if (typeof key !== 'string') continue;

        // locate schema definition for this key
        const spec = formSchema.find((it) => (Array.isArray(it) ? it[0] : it.key) === key) as any;
        if (!spec) continue;

        const prevValue = (merged as any)[key];

        const shouldAppend = (!(spec.enum || spec.type === 'boolean')) && typeof prevValue === 'string' && prevValue.trim().length > 0;

        const newValue = shouldAppend ? `${prevValue.trim()}\n${value}` : value;
        (merged as any)[key] = newValue;
      }
      return merged;
    });
  } else {
    // Fallback: append transcript to first field
    const firstKey = formSchema[0].key;
    const spec = formSchema.find((it) => (Array.isArray(it) ? it[0] : it.key) === firstKey) as any;
    if (spec && !(spec.enum || spec.type === 'boolean')){
      setterFn(prev => ({
        ...prev,
        [firstKey]: (prev[firstKey] ? (prev[firstKey] + '\n\n' + transcript) : transcript)
      }));
    }
  }
};

export const transcribeAudio = async (audioBlob: Blob, apiKey: string): Promise<string> => {
  try {
    if (!apiKey) {
      throw new Error('OpenAI API key not found. Please add it in settings.');
    }

    // Convert audio blob to File object
    const file = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });
    
    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'whisper-1');
    
    // Send to OpenAI API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to transcribe audio');
    }
    
    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  }
};

interface DistractionNote {
  text: string;
  timestamp: Date;
}

export const analyzeDistractions = async (
  distractionNotes: DistractionNote[],
  apiKey: string
): Promise<string> => {
  try {
    if (!apiKey) {
      throw new Error('OpenAI API key not found. Please add it in settings.');
    }

    if (distractionNotes.length === 0) {
      return "No distractions recorded - great focus! 🎯";
    }

    // Format notes with timestamps for context
    const notesText = distractionNotes
      .map(note => {
        const time = note.timestamp.toLocaleTimeString('en-US', { 
          hour12: false, 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        return `${time}: ${note.text}`;
      })
      .join('\n');

    const payload = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Analyze distraction notes from a work cycle and create a brief summary.

Rules:
1. Group similar distractions together
2. Order by most to least disruptive
3. Use plain nested lists only (no headings, bold, italics, or other formatting)
4. Be as concise as possible while preserving key information
5. Put reminders/tasks (like "remember to call doctor") at the top as separate bullets

Format example:
- Remember to book dentist appointment
- Remember to reply to mom's email
- Social media checks (3 times)
  - Instagram notifications
  - Twitter browsing
- Noise from construction outside
- Hunger and thirst
  - Got snack at 10:15
  - Coffee break thoughts

Keep it minimal and factual.`
        },
        {
          role: "user", 
          content: `Analyze these distraction notes from my work cycle:\n\n${notesText}`
        }
      ],
      max_tokens: 300,
      temperature: 0.3
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} – ${error}`);
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content;

    if (!analysis) {
      throw new Error("No analysis returned from OpenAI");
    }

    return analysis;
  } catch (error) {
    console.error('Distraction analysis error:', error);
    throw error;
  }
};
