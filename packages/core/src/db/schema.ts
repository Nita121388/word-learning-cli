export const schemaSql = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS words (
  id TEXT PRIMARY KEY,
  word TEXT NOT NULL,
  normalized_word TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'en',
  meaning_zh TEXT,
  meaning_en TEXT,
  phonetic TEXT,
  part_of_speech TEXT,
  example TEXT,
  source TEXT,
  personal_note TEXT,
  ai_note TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  archived_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS word_tags (
  word_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (word_id, tag_id),
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedules (
  word_id TEXT PRIMARY KEY,
  algorithm TEXT NOT NULL DEFAULT 'simple_v1',
  due_at TEXT NOT NULL,
  last_reviewed_at TEXT,
  review_count INTEGER NOT NULL DEFAULT 0,
  lapse_count INTEGER NOT NULL DEFAULT 0,
  interval_minutes INTEGER NOT NULL DEFAULT 0,
  ease REAL,
  state_json TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL,
  rating TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  previous_due_at TEXT,
  next_due_at TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL,
  algorithm TEXT NOT NULL,
  state_json TEXT,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS word_sources (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  field_name TEXT NOT NULL,
  value_hash TEXT NOT NULL,
  license TEXT,
  url TEXT,
  raw_json TEXT,
  fetched_at TEXT NOT NULL,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sentences (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  translation_zh TEXT,
  source TEXT,
  source_type TEXT,
  difficulty TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS morphemes (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  type TEXT NOT NULL,
  meaning_zh TEXT,
  meaning_en TEXT,
  origin TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(text, type)
);

CREATE TABLE IF NOT EXISTS sentence_words (
  sentence_id TEXT NOT NULL,
  word_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'example',
  occurrence_text TEXT,
  start_offset INTEGER,
  end_offset INTEGER,
  note TEXT,
  PRIMARY KEY (sentence_id, word_id),
  FOREIGN KEY (sentence_id) REFERENCES sentences(id) ON DELETE CASCADE,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS word_morphemes (
  word_id TEXT NOT NULL,
  morpheme_id TEXT NOT NULL,
  position TEXT,
  explanation TEXT,
  confidence TEXT,
  PRIMARY KEY (word_id, morpheme_id),
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
  FOREIGN KEY (morpheme_id) REFERENCES morphemes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  from_type TEXT NOT NULL,
  from_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  to_type TEXT NOT NULL,
  to_id TEXT NOT NULL,
  source TEXT,
  confidence TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ops (
  id TEXT PRIMARY KEY,
  op_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_words_normalized ON words(normalized_word);
CREATE INDEX IF NOT EXISTS idx_words_status ON words(status);
CREATE INDEX IF NOT EXISTS idx_schedules_due ON schedules(due_at);
CREATE INDEX IF NOT EXISTS idx_reviews_word ON reviews(word_id);
CREATE INDEX IF NOT EXISTS idx_word_sources_word ON word_sources(word_id);
CREATE INDEX IF NOT EXISTS idx_sentence_words_word ON sentence_words(word_id);
CREATE INDEX IF NOT EXISTS idx_word_morphemes_word ON word_morphemes(word_id);
CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_type, from_id);
CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_type, to_id);
`;

