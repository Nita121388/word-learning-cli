export type Rating = "again" | "hard" | "good";

export type WordStatus = "new" | "learning" | "mastered" | "suspended" | "archived";

export type MorphemeType = "root" | "prefix" | "suffix";

export interface WordInput {
  word: string;
  meaningZh?: string;
  meaningEn?: string;
  phonetic?: string;
  partOfSpeech?: string;
  example?: string;
  source?: string;
  personalNote?: string;
  aiNote?: string;
  status?: WordStatus;
  tags?: string[];
}

export interface WordDetail {
  id: string;
  word: string;
  normalizedWord: string;
  language: string;
  meaningZh: string | null;
  meaningEn: string | null;
  phonetic: string | null;
  partOfSpeech: string | null;
  example: string | null;
  source: string | null;
  personalNote: string | null;
  aiNote: string | null;
  status: WordStatus;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  schedule: Schedule | null;
}

export interface Schedule {
  wordId: string;
  algorithm: string;
  dueAt: string;
  lastReviewedAt: string | null;
  reviewCount: number;
  lapseCount: number;
  intervalMinutes: number;
  ease: number | null;
  stateJson: string | null;
  updatedAt: string;
}

export interface DueWord {
  word: WordDetail;
  dueAt: string;
}

export interface ReviewResult {
  word: string;
  rating: Rating;
  previousDueAt: string | null;
  nextDueAt: string;
  intervalMinutes: number;
}

export interface SentenceInput {
  text: string;
  translationZh?: string;
  source?: string;
  sourceType?: string;
  difficulty?: string;
  note?: string;
  words?: string[];
}

export interface MorphemeInput {
  text: string;
  type: MorphemeType;
  meaningZh?: string;
  meaningEn?: string;
  origin?: string;
  note?: string;
}

export interface EntityGraph {
  entityType: string;
  entityId: string;
  words: WordDetail[];
  sentences: Array<Record<string, unknown>>;
  morphemes: Array<Record<string, unknown>>;
  relations: Array<Record<string, unknown>>;
}

export type ApiResponse<T> =
  | { ok: true; data: T; meta?: Record<string, unknown> }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

