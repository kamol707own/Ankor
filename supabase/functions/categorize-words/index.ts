import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Supported AI providers, each exposed through an OpenAI-compatible
// `/chat/completions` endpoint with function-calling support.
const PROVIDERS: Record<string, { url: string; defaultModel: string }> = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    defaultModel: 'gemini-2.0-flash',
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));

    const provider = String(body?.provider ?? 'gemini').toLowerCase();
    const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
    const model = typeof body?.model === 'string' && body.model.trim()
      ? body.model.trim()
      : (PROVIDERS[provider]?.defaultModel ?? '');

    const cfg = PROVIDERS[provider];
    if (!cfg) {
      return json({ error: `Unsupported provider "${provider}". Use "gemini" or "groq".` }, 400);
    }
    if (!apiKey) {
      return json({ error: 'Missing API key. Add one in Settings → AI Categorization.' }, 400);
    }

    const { words } = body;
    if (!Array.isArray(words) || words.length === 0) {
      return json({ error: 'words array required' }, 400);
    }

    const items = words.slice(0, 500).map((w: any) => ({
      id: w.id,
      term: w.term ?? w.korean ?? '',
      translation: w.translation ?? w.uzbek ?? w.meaning ?? '',
    }));

    const systemPrompt = `You categorize vocabulary words into a small number of meaningful semantic categories (e.g. "Food", "Animals", "Verbs - Movement", "Family", "Time", "Numbers", "Emotions"). Use 3-12 categories total, in Title Case. Return ALL provided word ids.`;

    const userPrompt = `Categorize these vocabulary words. Each item has an id, the term and its translation. Group semantically. Return via the assign_categories tool.\n\n${JSON.stringify(items)}`;

    const response = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'assign_categories',
            description: 'Assign a category to each word.',
            parameters: {
              type: 'object',
              properties: {
                assignments: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'number' },
                      category: { type: 'string' },
                    },
                    required: ['id', 'category'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['assignments'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'assign_categories' } },
      }),
    });

    if (response.status === 429) {
      return json({ error: 'Rate limit exceeded, try again shortly.' }, 429);
    }
    if (response.status === 401 || response.status === 403) {
      return json({ error: 'Invalid API key. Check Settings → AI Categorization.' }, 401);
    }
    if (!response.ok) {
      const txt = await response.text();
      console.error('AI error', response.status, txt);
      throw new Error(`AI provider error ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall ? JSON.parse(toolCall.function.arguments) : { assignments: [] };

    return json({ assignments: args.assignments ?? [] }, 200);
  } catch (e) {
    console.error('categorize-words error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
