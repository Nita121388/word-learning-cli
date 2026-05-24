import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SqliteAdapter } from "./db/adapter.js";
import { schemaSql } from "./db/schema.js";
import { NodeSqliteAdapter } from "./db/node-sqlite.js";
import { EcdictDictionary, type EcdictImportResult } from "./dictionary/ecdict.js";
import { FreeDictionaryProvider } from "./dictionary/free-dictionary.js";
import type {
  DictionaryEntry,
  DueWord,
  EntityGraph,
  LookupResult,
  MorphemeInput,
  Rating,
  ReviewResult,
  Schedule,
  SentenceInput,
  WordDetail,
  WordInput,
  WordSource,
  WordStatus
} from "./types.js";
import { SimpleScheduler } from "./review/simple-scheduler.js";
import { FsrsScheduler } from "./review/fsrs-scheduler.js";
import { SchedulerRegistry, type ReviewScheduler } from "./review/scheduler.js";
import { createId, normalizeText, normalizeWord, nowIso, resolveVaultDbPath } from "./utils.js";

export type LookupSource = "ecdict" | "free-dictionary" | "all";

interface WordRow {
  id: string;
  word: string;
  normalized_word: string;
  language: string;
  meaning_zh: string | null;
  meaning_en: string | null;
  phonetic: string | null;
  part_of_speech: string | null;
  example: string | null;
  source: string | null;
  personal_note: string | null;
  ai_note: string | null;
  status: WordStatus;
  created_at: string;
  updated_at: string;
}

interface ScheduleRow {
  word_id: string;
  algorithm: string;
  due_at: string;
  last_reviewed_at: string | null;
  review_count: number;
  lapse_count: number;
  interval_minutes: number;
  ease: number | null;
  state_json: string | null;
  updated_at: string;
}

export interface WordLearningOptions {
  dbPath?: string;
  vaultPath?: string;
  dictionaryDbPath?: string;
  adapter?: SqliteAdapter;
  dictionaryAdapter?: SqliteAdapter;
  scheduler?: ReviewScheduler;
  reviewAlgorithm?: string;
}

export class WordLearning {
  private readonly adapter: SqliteAdapter;
  private readonly dictionaryAdapter: SqliteAdapter;
  private readonly schedulers = new SchedulerRegistry();
  private readonly reviewAlgorithm: string;
  private readonly baseDir: string;

  constructor(options: WordLearningOptions) {
    this.schedulers.register(new SimpleScheduler());
    this.schedulers.register(new FsrsScheduler());
    if (options.scheduler) {
      this.schedulers.register(options.scheduler);
    }
    this.reviewAlgorithm = options.reviewAlgorithm ?? options.scheduler?.algorithm ?? "simple_v1";
    if (options.adapter) {
      this.adapter = options.adapter;
      this.dictionaryAdapter = options.dictionaryAdapter ?? options.adapter;
      this.baseDir = process.cwd();
      return;
    }
    const dbPath = options.dbPath ?? (options.vaultPath ? resolveVaultDbPath(options.vaultPath) : join(process.cwd(), ".word-learning", "user.sqlite"));
    this.baseDir = dirname(dbPath);
    this.adapter = new NodeSqliteAdapter(dbPath);
    const dictionaryDbPath = options.dictionaryDbPath ?? join(this.baseDir, "dictionaries", "ecdict.sqlite");
    this.dictionaryAdapter = options.dictionaryAdapter ?? new NodeSqliteAdapter(dictionaryDbPath);
  }

  init(): void {
    mkdirSync(this.baseDir, { recursive: true });
    this.adapter.exec(schemaSql);
    this.ensureJsonl("ops.jsonl");
    this.ensureJsonl("reviews.jsonl");
  }

  close(): void {
    this.adapter.close();
    if (this.dictionaryAdapter !== this.adapter) {
      this.dictionaryAdapter.close();
    }
  }

  addWord(input: WordInput): WordDetail {
    this.init();
    const normalized = normalizeWord(input.word);
    if (!normalized) {
      throw new Error("word is required");
    }
    const existing = this.getWordByNormalized(normalized);
    if (existing) {
      this.updateExistingWord(existing, input);
      const updated = this.getWord(input.word);
      if (!updated) {
        throw new Error("failed to load updated word");
      }
      this.addTags(updated.id, input.tags ?? []);
      this.writeOp("word.update", "word", updated.id, input);
      return this.requireWord(input.word);
    }

    const at = nowIso();
    const id = createId("word");
    this.adapter.prepare(
      `INSERT INTO words (
        id, word, normalized_word, language, meaning_zh, meaning_en, phonetic, part_of_speech,
        example, source, personal_note, ai_note, status, created_at, updated_at
      ) VALUES (?, ?, ?, 'en', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.word.trim(),
      normalized,
      input.meaningZh ?? null,
      input.meaningEn ?? null,
      input.phonetic ?? null,
      input.partOfSpeech ?? null,
      input.example ?? null,
      input.source ?? null,
      input.personalNote ?? null,
      input.aiNote ?? null,
      input.status ?? "new",
      at,
      at
    );
    this.adapter.prepare(
      `INSERT INTO schedules (word_id, algorithm, due_at, updated_at) VALUES (?, ?, ?, ?)`
    ).run(id, this.reviewAlgorithm, at, at);
    this.addTags(id, input.tags ?? []);
    this.writeOp("word.add", "word", id, input);
    return this.requireWord(input.word);
  }

  getWord(word: string): WordDetail | null {
    this.init();
    const row = this.getWordByNormalized(normalizeWord(word));
    return row ? this.toWordDetail(row) : null;
  }

  getWordSources(word: string): WordSource[] {
    this.init();
    const detail = this.requireWord(word);
    return this.adapter.prepare(
      `SELECT id, provider, field_name, license, url, fetched_at
       FROM word_sources
       WHERE word_id = ?
       ORDER BY fetched_at DESC`
    ).all<{
      id: string;
      provider: string;
      field_name: string;
      license: string | null;
      url: string | null;
      fetched_at: string;
    }>(detail.id).map((row) => ({
      id: row.id,
      provider: row.provider,
      fieldName: row.field_name,
      license: row.license,
      url: row.url,
      fetchedAt: row.fetched_at
    }));
  }

  updateWord(word: string, patch: Partial<WordInput>): WordDetail {
    this.init();
    const existing = this.getWordByNormalized(normalizeWord(word));
    if (!existing) {
      throw new Error(`word not found: ${word}`);
    }
    this.updateExistingWord(existing, patch);
    if (patch.tags) {
      this.addTags(existing.id, patch.tags);
    }
    this.writeOp("word.update", "word", existing.id, patch);
    return this.requireWord(word);
  }

  listWords(options: { tag?: string; status?: WordStatus; limit?: number } = {}): WordDetail[] {
    this.init();
    const limit = options.limit ?? 100;
    let rows: WordRow[];
    if (options.tag) {
      rows = this.adapter.prepare(
        `SELECT w.* FROM words w
         JOIN word_tags wt ON wt.word_id = w.id
         JOIN tags t ON t.id = wt.tag_id
         WHERE t.name = ? AND w.deleted_at IS NULL
         ORDER BY w.updated_at DESC
         LIMIT ?`
      ).all<WordRow>(options.tag, limit);
    } else if (options.status) {
      rows = this.adapter.prepare(
        `SELECT * FROM words WHERE status = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`
      ).all<WordRow>(options.status, limit);
    } else {
      rows = this.adapter.prepare(
        `SELECT * FROM words WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`
      ).all<WordRow>(limit);
    }
    return rows.map((row) => this.toWordDetail(row));
  }

  addTags(wordIdOrWord: string, tags: string[]): void {
    const wordId = wordIdOrWord.startsWith("word_") ? wordIdOrWord : this.requireWord(wordIdOrWord).id;
    for (const tag of tags.map((item) => item.trim()).filter(Boolean)) {
      const tagId = this.ensureTag(tag);
      this.adapter.prepare(
        `INSERT OR IGNORE INTO word_tags (word_id, tag_id, created_at) VALUES (?, ?, ?)`
      ).run(wordId, tagId, nowIso());
    }
  }

  removeTags(word: string, tags: string[]): void {
    const detail = this.requireWord(word);
    for (const tag of tags) {
      this.adapter.prepare(
        `DELETE FROM word_tags WHERE word_id = ? AND tag_id IN (SELECT id FROM tags WHERE name = ?)`
      ).run(detail.id, tag);
    }
    this.writeOp("tag.remove", "word", detail.id, { tags });
  }

  listTags(): Array<{ name: string; count: number }> {
    this.init();
    return this.adapter.prepare(
      `SELECT t.name as name, COUNT(wt.word_id) as count
       FROM tags t
       LEFT JOIN word_tags wt ON wt.tag_id = t.id
       GROUP BY t.id
       ORDER BY t.name ASC`
    ).all<{ name: string; count: number }>();
  }

  importWordsFromFile(filePath: string, options: { format?: "json" | "csv" | "tsv"; tag?: string; source?: string } = {}): {
    createdOrUpdated: number;
    words: string[];
  } {
    this.init();
    const format = options.format ?? this.detectImportFormat(filePath);
    const content = readFileSync(filePath, "utf8");
    const rows = format === "json" ? this.parseJsonWords(content) : this.parseDelimitedWords(content, format === "tsv" ? "\t" : ",");
    const words: string[] = [];
    for (const row of rows) {
      const tags = new Set(row.tags ?? []);
      if (options.tag) {
        tags.add(options.tag);
      }
      const input: WordInput = {
        word: row.word,
        tags: Array.from(tags)
      };
      if (row.meaningZh) input.meaningZh = row.meaningZh;
      if (row.meaningEn) input.meaningEn = row.meaningEn;
      if (row.phonetic) input.phonetic = row.phonetic;
      if (row.partOfSpeech) input.partOfSpeech = row.partOfSpeech;
      if (row.example) input.example = row.example;
      input.source = row.source ?? options.source ?? `import:${filePath}`;
      this.addWord(input);
      words.push(row.word);
    }
    this.writeOp("import.words", "import", createId("import"), { filePath, format, count: words.length, options });
    return { createdOrUpdated: words.length, words };
  }

  getStats(): Record<string, unknown> {
    this.init();
    const total = this.adapter.prepare(`SELECT COUNT(*) as count FROM words WHERE deleted_at IS NULL`).get<{ count: number }>()?.count ?? 0;
    const due = this.adapter.prepare(
      `SELECT COUNT(*) as count FROM schedules s JOIN words w ON w.id = s.word_id WHERE s.due_at <= ? AND w.deleted_at IS NULL`
    ).get<{ count: number }>(nowIso())?.count ?? 0;
    const statusRows = this.adapter.prepare(
      `SELECT status, COUNT(*) as count FROM words WHERE deleted_at IS NULL GROUP BY status`
    ).all<{ status: string; count: number }>();
    const reviewCount = this.adapter.prepare(`SELECT COUNT(*) as count FROM reviews`).get<{ count: number }>()?.count ?? 0;
    return {
      totalWords: total,
      dueWords: due,
      reviewCount,
      byStatus: Object.fromEntries(statusRows.map((row) => [row.status, row.count])),
      tags: this.listTags()
    };
  }

  backup(): string {
    this.init();
    const backupDir = join(this.baseDir, "backups");
    mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = join(backupDir, `backup-${timestamp}.sqlite`);
    copyFileSync(join(this.baseDir, "user.sqlite"), backupPath);
    this.writeOp("backup.create", "backup", createId("backup"), { backupPath });
    return backupPath;
  }

  async importEcdict(filePath: string): Promise<EcdictImportResult> {
    const dictionary = new EcdictDictionary(this.dictionaryAdapter);
    const result = await dictionary.importCsv(filePath);
    this.init();
    this.writeOp("dictionary.import_ecdict", "dictionary", createId("dictionary"), { filePath, ...result });
    return result;
  }

  async lookupWord(word: string, options: { save?: boolean; source?: LookupSource } = {}): Promise<LookupResult> {
    this.init();
    const source = options.source ?? "ecdict";
    const entries: DictionaryEntry[] = [];

    if (source === "ecdict" || source === "all") {
      const dictionary = new EcdictDictionary(this.dictionaryAdapter);
      entries.push(...dictionary.lookup(word));
    }

    if (source === "free-dictionary" || source === "all") {
      const provider = new FreeDictionaryProvider();
      entries.push(...(await provider.lookup(word)));
    }

    const savedWord = options.save && entries[0] ? this.saveDictionaryEntry(entries[0]) : undefined;
    const result: LookupResult = { word, entries, source };
    if (savedWord) {
      result.savedWord = savedWord;
    }
    return result;
  }

  lookupWordLocal(word: string, options: { save?: boolean } = {}): LookupResult {
    this.init();
    const dictionary = new EcdictDictionary(this.dictionaryAdapter);
    const entries = dictionary.lookup(word);
    const savedWord = options.save && entries[0] ? this.saveDictionaryEntry(entries[0]) : undefined;
    const result: LookupResult = { word, entries, source: "ecdict" };
    if (savedWord) {
      result.savedWord = savedWord;
    }
    return result;
  }

  getDueWords(options: { now?: Date; limit?: number; tag?: string } = {}): DueWord[] {
    this.init();
    const now = (options.now ?? new Date()).toISOString();
    const limit = options.limit ?? 20;
    const rows = options.tag
      ? this.adapter.prepare(
          `SELECT w.* FROM words w
           JOIN schedules s ON s.word_id = w.id
           JOIN word_tags wt ON wt.word_id = w.id
           JOIN tags t ON t.id = wt.tag_id
           WHERE s.due_at <= ? AND t.name = ? AND w.deleted_at IS NULL AND w.status != 'suspended'
           ORDER BY s.due_at ASC
           LIMIT ?`
        ).all<WordRow>(now, options.tag, limit)
      : this.adapter.prepare(
          `SELECT w.* FROM words w
           JOIN schedules s ON s.word_id = w.id
           WHERE s.due_at <= ? AND w.deleted_at IS NULL AND w.status != 'suspended'
           ORDER BY s.due_at ASC
           LIMIT ?`
        ).all<WordRow>(now, limit);
    return rows.map((row) => {
      const detail = this.toWordDetail(row);
      return { word: detail, dueAt: detail.schedule?.dueAt ?? now };
    });
  }

  submitReview(word: string, rating: Rating, reviewedAt = new Date()): ReviewResult {
    this.init();
    const detail = this.requireWord(word);
    const current = this.getSchedule(detail.id);
    const scheduler = this.schedulers.get(current?.algorithm ?? "simple_v1");
    const next = scheduler.schedule(current, rating, reviewedAt);
    const previousDueAt = current?.dueAt ?? null;
    const reviewedAtIso = reviewedAt.toISOString();
    const reviewId = createId("review");

    this.adapter.prepare(
      `INSERT INTO reviews (
        id, word_id, rating, reviewed_at, previous_due_at, next_due_at, interval_minutes, algorithm, state_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(reviewId, detail.id, rating, reviewedAtIso, previousDueAt, next.dueAt, next.intervalMinutes, next.algorithm, next.stateJson);
    this.adapter.prepare(
      `UPDATE schedules
       SET due_at = ?, last_reviewed_at = ?, review_count = ?, lapse_count = ?,
           interval_minutes = ?, algorithm = ?, state_json = ?, updated_at = ?
       WHERE word_id = ?`
    ).run(next.dueAt, reviewedAtIso, next.reviewCount, next.lapseCount, next.intervalMinutes, next.algorithm, next.stateJson, reviewedAtIso, detail.id);
    if (detail.status === "new") {
      this.adapter.prepare(`UPDATE words SET status = 'learning', updated_at = ? WHERE id = ?`).run(reviewedAtIso, detail.id);
    }

    const result: ReviewResult = {
      word: detail.word,
      rating,
      previousDueAt,
      nextDueAt: next.dueAt,
      intervalMinutes: next.intervalMinutes
    };
    this.appendJsonl("reviews.jsonl", { ...result, reviewedAt: reviewedAtIso });
    this.writeOp("review.submit", "word", detail.id, result);
    return result;
  }

  addSentence(input: SentenceInput): Record<string, unknown> {
    this.init();
    const id = createId("sentence");
    const at = nowIso();
    this.adapter.prepare(
      `INSERT INTO sentences (
        id, text, normalized_text, translation_zh, source, source_type, difficulty, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.text,
      normalizeText(input.text).toLowerCase(),
      input.translationZh ?? null,
      input.source ?? null,
      input.sourceType ?? null,
      input.difficulty ?? null,
      input.note ?? null,
      at,
      at
    );
    for (const word of input.words ?? []) {
      const detail = this.getWord(word) ?? this.addWord({ word });
      this.adapter.prepare(
        `INSERT OR IGNORE INTO sentence_words (sentence_id, word_id, role, occurrence_text) VALUES (?, ?, 'example', ?)`
      ).run(id, detail.id, word);
    }
    this.writeOp("sentence.add", "sentence", id, input);
    return { id, ...input };
  }

  addMorpheme(input: MorphemeInput): Record<string, unknown> {
    this.init();
    const existing = this.adapter.prepare(
      `SELECT * FROM morphemes WHERE text = ? AND type = ?`
    ).get<Record<string, unknown>>(input.text, input.type);
    if (existing) {
      return existing;
    }
    const id = createId("morpheme");
    const at = nowIso();
    this.adapter.prepare(
      `INSERT INTO morphemes (id, text, type, meaning_zh, meaning_en, origin, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.text, input.type, input.meaningZh ?? null, input.meaningEn ?? null, input.origin ?? null, input.note ?? null, at, at);
    this.writeOp("morpheme.add", "morpheme", id, input);
    return { id, ...input };
  }

  linkWordMorpheme(word: string, morphemeText: string, relation: { position?: string; explanation?: string; confidence?: string } = {}): void {
    this.init();
    const detail = this.requireWord(word);
    const morpheme = this.adapter.prepare(`SELECT id FROM morphemes WHERE text = ?`).get<{ id: string }>(morphemeText);
    if (!morpheme) {
      throw new Error(`morpheme not found: ${morphemeText}`);
    }
    this.adapter.prepare(
      `INSERT OR REPLACE INTO word_morphemes (word_id, morpheme_id, position, explanation, confidence)
       VALUES (?, ?, ?, ?, ?)`
    ).run(detail.id, morpheme.id, relation.position ?? null, relation.explanation ?? null, relation.confidence ?? null);
    this.writeOp("word.link_morpheme", "word", detail.id, { morphemeText, ...relation });
  }

  getGraph(entityType: string, entityIdOrWord: string): EntityGraph {
    this.init();
    const word = entityType === "word" ? this.requireWord(entityIdOrWord) : null;
    const entityId = word?.id ?? entityIdOrWord;
    const words = word ? [word] : [];
    const sentences = this.adapter.prepare(
      `SELECT s.* FROM sentences s
       JOIN sentence_words sw ON sw.sentence_id = s.id
       WHERE sw.word_id = ?`
    ).all<Record<string, unknown>>(entityId);
    const morphemes = this.adapter.prepare(
      `SELECT m.*, wm.position, wm.explanation FROM morphemes m
       JOIN word_morphemes wm ON wm.morpheme_id = m.id
       WHERE wm.word_id = ?`
    ).all<Record<string, unknown>>(entityId);
    const relations = this.adapter.prepare(
      `SELECT * FROM relations WHERE (from_type = ? AND from_id = ?) OR (to_type = ? AND to_id = ?)`
    ).all<Record<string, unknown>>(entityType, entityId, entityType, entityId);
    return { entityType, entityId, words, sentences, morphemes, relations };
  }

  generateTodayReviewMarkdown(limit = 20): string {
    const due = this.getDueWords({ limit });
    const lines = [
      "# 今日复习",
      "",
      "<!-- wordcli:managed:start -->",
      "",
      `待复习：${due.length}`,
      ""
    ];
    for (const item of due) {
      lines.push(`- **${item.word.word}**：${item.word.meaningZh ?? item.word.meaningEn ?? "未补充释义"}`);
    }
    lines.push("", "<!-- wordcli:managed:end -->", "");
    return lines.join("\n");
  }

  generateTagIndexMarkdown(): string {
    const tags = this.listTags();
    const lines = ["# 标签索引", "", "<!-- wordcli:managed:start -->", ""];
    for (const tag of tags) {
      lines.push(`- ${tag.name}：${tag.count}`);
    }
    lines.push("", "<!-- wordcli:managed:end -->", "");
    return lines.join("\n");
  }

  refreshViews(vaultPath: string): void {
    const viewDir = join(vaultPath, "单词学习");
    mkdirSync(viewDir, { recursive: true });
    writeFileSync(join(viewDir, "今日复习.md"), this.generateTodayReviewMarkdown(), "utf8");
    writeFileSync(join(viewDir, "标签索引.md"), this.generateTagIndexMarkdown(), "utf8");
  }

  repair(): Record<string, unknown> {
    this.init();
    const missingSchedules = this.adapter.prepare(
      `SELECT id FROM words WHERE id NOT IN (SELECT word_id FROM schedules) AND deleted_at IS NULL`
    ).all<{ id: string }>();
    const at = nowIso();
    for (const row of missingSchedules) {
      this.adapter.prepare(
      `INSERT INTO schedules (word_id, algorithm, due_at, updated_at) VALUES (?, ?, ?, ?)`
      ).run(row.id, this.reviewAlgorithm, at, at);
    }
    this.writeOp("repair", "system", createId("repair"), { missingSchedules: missingSchedules.length });
    return { repairedMissingSchedules: missingSchedules.length };
  }

  private updateExistingWord(existing: WordRow, patch: Partial<WordInput>): void {
    const at = nowIso();
    const next = {
      meaningZh: patch.meaningZh ?? existing.meaning_zh,
      meaningEn: patch.meaningEn ?? existing.meaning_en,
      phonetic: patch.phonetic ?? existing.phonetic,
      partOfSpeech: patch.partOfSpeech ?? existing.part_of_speech,
      example: patch.example ?? existing.example,
      source: patch.source ?? existing.source,
      personalNote: patch.personalNote ?? existing.personal_note,
      aiNote: patch.aiNote ?? existing.ai_note,
      status: patch.status ?? existing.status
    };
    this.adapter.prepare(
      `UPDATE words
       SET meaning_zh = ?, meaning_en = ?, phonetic = ?, part_of_speech = ?, example = ?,
           source = ?, personal_note = ?, ai_note = ?, status = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      next.meaningZh,
      next.meaningEn,
      next.phonetic,
      next.partOfSpeech,
      next.example,
      next.source,
      next.personalNote,
      next.aiNote,
      next.status,
      at,
      existing.id
    );
  }

  private getWordByNormalized(normalized: string): WordRow | undefined {
    return this.adapter.prepare(
      `SELECT * FROM words WHERE normalized_word = ? AND deleted_at IS NULL`
    ).get<WordRow>(normalized);
  }

  private requireWord(word: string): WordDetail {
    const detail = this.getWord(word);
    if (!detail) {
      throw new Error(`word not found: ${word}`);
    }
    return detail;
  }

  private toWordDetail(row: WordRow): WordDetail {
    return {
      id: row.id,
      word: row.word,
      normalizedWord: row.normalized_word,
      language: row.language,
      meaningZh: row.meaning_zh,
      meaningEn: row.meaning_en,
      phonetic: row.phonetic,
      partOfSpeech: row.part_of_speech,
      example: row.example,
      source: row.source,
      personalNote: row.personal_note,
      aiNote: row.ai_note,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tags: this.getWordTags(row.id),
      schedule: this.getSchedule(row.id)
    };
  }

  private getWordTags(wordId: string): string[] {
    return this.adapter.prepare(
      `SELECT t.name FROM tags t
       JOIN word_tags wt ON wt.tag_id = t.id
       WHERE wt.word_id = ?
       ORDER BY t.name ASC`
    ).all<{ name: string }>(wordId).map((row) => row.name);
  }

  private getSchedule(wordId: string): Schedule | null {
    const row = this.adapter.prepare(`SELECT * FROM schedules WHERE word_id = ?`).get<ScheduleRow>(wordId);
    if (!row) {
      return null;
    }
    return {
      wordId: row.word_id,
      algorithm: row.algorithm,
      dueAt: row.due_at,
      lastReviewedAt: row.last_reviewed_at,
      reviewCount: row.review_count,
      lapseCount: row.lapse_count,
      intervalMinutes: row.interval_minutes,
      ease: row.ease,
      stateJson: row.state_json,
      updatedAt: row.updated_at
    };
  }

  private ensureTag(name: string): string {
    const existing = this.adapter.prepare(`SELECT id FROM tags WHERE name = ?`).get<{ id: string }>(name);
    if (existing) {
      return existing.id;
    }
    const id = createId("tag");
    this.adapter.prepare(`INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)`).run(id, name, nowIso());
    return id;
  }

  private writeOp(opType: string, entityType: string, entityId: string, payload: unknown): void {
    const op = {
      id: createId("op"),
      opType,
      entityType,
      entityId,
      payload,
      createdAt: nowIso()
    };
    this.adapter.prepare(
      `INSERT INTO ops (id, op_type, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(op.id, opType, entityType, entityId, JSON.stringify(payload), op.createdAt);
    this.appendJsonl("ops.jsonl", op);
  }

  private ensureJsonl(name: string): void {
    mkdirSync(this.baseDir, { recursive: true });
    appendFileSync(join(this.baseDir, name), "", "utf8");
  }

  private appendJsonl(name: string, value: unknown): void {
    mkdirSync(this.baseDir, { recursive: true });
    appendFileSync(join(this.baseDir, name), `${JSON.stringify(value)}\n`, "utf8");
  }

  private saveDictionaryEntry(entry: DictionaryEntry): WordDetail {
    const input: WordInput = {
      word: entry.word,
      source: entry.provider,
      tags: entry.tags
    };
    if (entry.translation) input.meaningZh = entry.translation;
    if (entry.definition) input.meaningEn = entry.definition;
    if (entry.phonetic) input.phonetic = entry.phonetic;
    if (entry.pos) input.partOfSpeech = entry.pos;
    if (entry.example) input.example = entry.example;
    const detail = this.addWord(input);
    this.recordFieldSource(detail.id, "meaning_zh", entry.provider, entry.translation, entry);
    this.recordFieldSource(detail.id, "meaning_en", entry.provider, entry.definition, entry);
    this.recordFieldSource(detail.id, "phonetic", entry.provider, entry.phonetic, entry);
    this.recordFieldSource(detail.id, "part_of_speech", entry.provider, entry.pos, entry);
    this.recordFieldSource(detail.id, "example", entry.provider, entry.example, entry);
    this.recordFieldSource(detail.id, "audio_url", entry.provider, entry.audioUrl, entry);
    return detail;
  }

  private recordFieldSource(wordId: string, fieldName: string, provider: string, value: string | null, raw: unknown): void {
    if (!value) {
      return;
    }
    this.adapter.prepare(
      `INSERT INTO word_sources (id, word_id, provider, field_name, value_hash, license, url, raw_json, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      createId("source"),
      wordId,
      provider,
      fieldName,
      String(value.length),
      provider === "ecdict" ? "MIT" : null,
      null,
      JSON.stringify(raw),
      nowIso()
    );
  }

  private detectImportFormat(filePath: string): "json" | "csv" | "tsv" {
    if (filePath.endsWith(".json")) return "json";
    if (filePath.endsWith(".tsv")) return "tsv";
    return "csv";
  }

  private parseJsonWords(content: string): Array<WordInput & { tags?: string[] }> {
    const value = JSON.parse(content) as unknown;
    if (!Array.isArray(value)) {
      throw new Error("JSON import must be an array");
    }
    return value.map((item) => this.normalizeImportRow(item as Record<string, unknown>));
  }

  private parseDelimitedWords(content: string, delimiter: "," | "\t"): Array<WordInput & { tags?: string[] }> {
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const header = lines.shift()?.split(delimiter).map((item) => item.trim()) ?? [];
    return lines.map((line) => {
      const columns = line.split(delimiter);
      const row: Record<string, unknown> = {};
      for (let index = 0; index < header.length; index += 1) {
        const key = header[index];
        if (key) {
          row[key] = columns[index]?.trim();
        }
      }
      return this.normalizeImportRow(row);
    });
  }

  private normalizeImportRow(row: Record<string, unknown>): WordInput & { tags?: string[] } {
    const word = String(row.word ?? "").trim();
    if (!word) {
      throw new Error("import row missing word");
    }
    const tagsValue = row.tags;
    const tags = Array.isArray(tagsValue)
      ? tagsValue.map(String)
      : typeof tagsValue === "string"
        ? tagsValue.split(/[;,]/).map((item) => item.trim()).filter(Boolean)
        : undefined;
    const input: WordInput & { tags?: string[] } = { word };
    const map: Array<[keyof WordInput, string]> = [
      ["meaningZh", "meaning_zh"],
      ["meaningZh", "meaningZh"],
      ["meaningEn", "meaning_en"],
      ["meaningEn", "meaningEn"],
      ["phonetic", "phonetic"],
      ["partOfSpeech", "part_of_speech"],
      ["partOfSpeech", "partOfSpeech"],
      ["example", "example"],
      ["source", "source"],
      ["personalNote", "note"]
    ];
    for (const [target, source] of map) {
      const value = row[source];
      if (typeof value === "string" && value.trim()) {
        Object.assign(input, { [target]: value.trim() });
      }
    }
    if (tags) {
      input.tags = tags;
    }
    return input;
  }
}
