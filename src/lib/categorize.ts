import { resolveModel, type AIProvider } from './ai';

export interface CategorizeWord {
  id: number;
  term: string;
  translation: string;
}

export interface CategorizeAssignment {
  id: number;
  category: string;
}

const SYSTEM_PROMPT = `You categorize vocabulary words into a small number of meaningful semantic categories (e.g. "Food", "Animals", "Verbs - Movement", "Family", "Time", "Numbers", "Emotions"). Use 3-12 categories total, in Title Case. Return ALL provided word ids.`;

// Groq's free "on-demand" tier enforces a low output-tokens-per-minute cap
// (e.g. 1000). Keep each request's max output well under it, and batch the
// word list so one batch's JSON output can't exceed the cap.
const BATCH_SIZE = 40;
const MAX_OUTPUT_TOKENS = 900;
const GEMINI_MAX_OUTPUT_TOKENS = 2048;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Groq's free tier enforces a per-minute OUTPUT-token cap (e.g. 1000), so a deck
// that needs several batches can trip it mid-run. When that happens, wait for the
// window it reports and retry instead of failing the whole categorization.
async function withRateLimitRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const limited = /rate limit|429|too large|tokens per minute/i.test(message);
      if (!limited || attempt >= maxRetries) throw error;
      const match = message.match(/try again in ([\d.]+)\s*s/i);
      const waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 1500 : 15000 * (attempt + 1);
      await sleep(waitMs);
    }
  }
}

const userPrompt = (items: CategorizeWord[]) =>
  `Categorize these vocabulary words. Each item has an id, the term and its translation. Return ONLY valid JSON of the shape {"assignments":[{"id":number,"category":string}]} that covers every id.\n\n${JSON.stringify(items)}`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    assignments: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'NUMBER' },
          category: { type: 'STRING' },
        },
        required: ['id', 'category'],
      },
    },
  },
  required: ['assignments'],
};

function extractError(data: any): string | undefined {
  if (!data) return undefined;
  const err = data.error;
  if (typeof err === 'string') return err;
  if (err?.message) return err.message;
  return undefined;
}

function parseAssignments(text: string): CategorizeAssignment[] {
  if (!text) return [];
  let clean = text.trim();
  // Strip a possible ```json fence.
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed?.assignments) ? parsed.assignments : [];
  } catch {
    return [];
  }
}

async function categorizeWithGemini(
  apiKey: string,
  model: string,
  items: CategorizeWord[],
): Promise<CategorizeAssignment[]> {
  const modelId = resolveModel('gemini', model) || 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt(items) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
      },
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(extractError(data) || `Gemini error ${res.status}`);
  }
  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: any) => p?.text ?? '')
    .join('');
  return parseAssignments(text);
}

async function categorizeWithGroq(
  apiKey: string,
  model: string,
  items: CategorizeWord[],
): Promise<CategorizeAssignment[]> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPT} Respond only with JSON.` },
        { role: 'user', content: userPrompt(items) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: MAX_OUTPUT_TOKENS,
      // Groq's reasoning models (qwen3, deepseek, qwq, …) otherwise spend the
      // output budget "thinking", which blows the per-minute token cap.
      ...(/qwen|deepseek|qwq|reason/i.test(model || '') ? { reasoning_effort: 'none' } : {}),
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(extractError(data) || `Groq error ${res.status}`);
  }
  return parseAssignments(data?.choices?.[0]?.message?.content ?? '');
}

export async function categorizeWords(
  provider: AIProvider,
  apiKey: string,
  model: string,
  words: CategorizeWord[],
): Promise<CategorizeAssignment[]> {
  const key = apiKey.trim().replace(/^["']|["']$/g, '').trim();
  if (!key) throw new Error('Missing API key. Add one in Settings → AI Categorization.');
  if (!words.length) return [];

  const items = words.slice(0, 500).map(w => ({
    id: w.id,
    term: w.term,
    translation: w.translation,
  }));

  const assignments: CategorizeAssignment[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const result = await withRateLimitRetry(() =>
      provider === 'groq'
        ? categorizeWithGroq(key, model, batch)
        : categorizeWithGemini(key, model, batch),
    );
    assignments.push(...result);
    // Space batches out so they don't all land in the same token-per-minute window.
    if (i + BATCH_SIZE < items.length) await sleep(1200);
  }

  if (assignments.length === 0) {
    throw new Error('The AI returned no categories. Check your key and model, then try again.');
  }
  return assignments;
}
