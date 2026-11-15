export type CardState = 'new' | 'learning' | 'review';

export interface Word {
  id: number;
  set?: string;
  // Storage uses legacy field names for backward compatibility:
  // `korean` = front/term, `uzbek` = back/translation, `romanization` = pronunciation
  korean: string;
  uzbek: string;
  romanization: string;
  meaning?: string;
  example?: string;
  category?: string;
  createdAt: number;
  isKnown?: boolean;
  // SRS fields (SM-2 simplified). All optional for backward compat.
  interval?: number;   // days
  ease?: number;       // default 2.5, min 1.3
  due?: number;        // epoch ms when card is next due
  lapses?: number;
  state?: CardState;
}

export interface Document {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface VocabSet {
  id: string;
  name: string;
  words: Word[];
  documents?: Document[];
  language?: string; // BCP-47 code for pronunciation, e.g. "ko-KR", "en-US"
  createdAt: number;
}

export type SortOption = 'alphabetical' | 'date';

/** Fields the scheduler owns. Edits must never drop these. */
export const SRS_FIELDS = ['interval', 'ease', 'due', 'lapses', 'state', 'isKnown'] as const;

/**
 * Merge edited content onto an existing word while preserving scheduling state.
 * Editing a term or translation must not reset the card to "new".
 */
export function mergeWordEdit(existing: Word, edits: Partial<Word>): Word {
  const merged: Word = { ...existing, ...edits, id: existing.id, createdAt: existing.createdAt };
  for (const field of SRS_FIELDS) {
    if (field in existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[field] = existing[field];
    }
  }
  return merged;
}
