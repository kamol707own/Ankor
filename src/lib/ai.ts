export type AIProvider = 'gemini' | 'groq';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

export const AI_CONFIG_STORAGE_KEY = 'ankor-ai-config';

export const AI_PROVIDERS: { key: AIProvider; label: string; defaultModel: string; hint: string }[] = [
  { key: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-3.8-flash', hint: 'Free key from Google AI Studio' },
  { key: 'groq', label: 'Groq', defaultModel: 'llama-3.3-70b-versatile', hint: 'Free key from Groq Cloud' },
];

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'gemini',
  apiKey: '',
  model: 'gemini-3.8-flash',
};

// Gemini 1.5/2.0 models were shut down (2.0 on June 1, 2026) and now 404.
// Map any stale saved value to the current free Flash model.
const RETIRED_GEMINI = /^gemini-(1\.5|2\.0)/i;

export function defaultModelFor(provider: AIProvider): string {
  return AI_PROVIDERS.find((p) => p.key === provider)?.defaultModel ?? '';
}

export function resolveModel(provider: AIProvider, model: string): string {
  if (!model) return defaultModelFor(provider);
  if (provider === 'gemini' && RETIRED_GEMINI.test(model)) return defaultModelFor('gemini');
  return model;
}
