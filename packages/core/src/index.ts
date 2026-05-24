export { WordLearning, type LookupSource } from "./word-learning.js";
export { FreeDictionaryProvider } from "./dictionary/free-dictionary.js";
export { isNodeSqliteAvailable } from "./db/node-sqlite.js";
export { SchedulerRegistry, type NextSchedule, type ReviewScheduler } from "./review/scheduler.js";
export { SimpleScheduler } from "./review/simple-scheduler.js";
export type {
  ApiResponse,
  DictionaryEntry,
  DueWord,
  EntityGraph,
  LookupResult,
  MorphemeInput,
  MorphemeType,
  Rating,
  ReviewResult,
  Schedule,
  SentenceInput,
  WordDetail,
  WordInput,
  WordSource,
  WordStatus
} from "./types.js";
export { ok, fail } from "./json-api.js";
export { resolveVaultDbPath } from "./utils.js";
