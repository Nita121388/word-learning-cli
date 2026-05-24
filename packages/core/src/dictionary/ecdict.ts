import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { SqliteAdapter } from "../db/adapter.js";
import { ecdictSchemaSql } from "../db/schema.js";
import type { DictionaryEntry } from "../types.js";
import { normalizeWord } from "../utils.js";

export interface EcdictImportResult {
  imported: number;
  skipped: number;
}

export class EcdictDictionary {
  constructor(private readonly adapter: SqliteAdapter) {}

  init(): void {
    this.adapter.exec(ecdictSchemaSql);
  }

  async importCsv(filePath: string): Promise<EcdictImportResult> {
    this.init();
    const reader = createInterface({
      input: createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity
    });
    let header: string[] | null = null;
    let imported = 0;
    let skipped = 0;
    const insert = this.adapter.prepare(
      `INSERT OR REPLACE INTO ecdict_entries (
        word, normalized_word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange, detail, audio
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for await (const line of reader) {
      if (!line.trim()) continue;
      const columns = parseCsvLine(line);
      if (!header) {
        header = columns.map((item) => item.trim());
        continue;
      }
      const row = Object.fromEntries(header.map((key, index) => [key, columns[index] ?? ""]));
      const word = row.word?.trim();
      if (!word) {
        skipped += 1;
        continue;
      }
      insert.run(
        word,
        normalizeWord(word),
        emptyToNull(row.phonetic),
        emptyToNull(row.definition),
        emptyToNull(row.translation),
        emptyToNull(row.pos),
        toInteger(row.collins),
        toInteger(row.oxford),
        emptyToNull(row.tag),
        toInteger(row.bnc),
        toInteger(row.frq),
        emptyToNull(row.exchange),
        emptyToNull(row.detail),
        emptyToNull(row.audio)
      );
      imported += 1;
    }

    return { imported, skipped };
  }

  lookup(word: string): DictionaryEntry[] {
    this.init();
    const normalized = normalizeWord(word);
    const rows = this.adapter.prepare(
      `SELECT * FROM ecdict_entries WHERE normalized_word = ? LIMIT 5`
    ).all<Record<string, string | number | null>>(normalized);
    return rows.map((row) => ({
      word: String(row.word),
      normalizedWord: String(row.normalized_word),
      phonetic: nullableString(row.phonetic),
      definition: nullableString(row.definition),
      translation: nullableString(row.translation),
      pos: nullableString(row.pos),
      tags: nullableString(row.tag)?.split(/\s+/).filter(Boolean) ?? [],
      exchange: nullableString(row.exchange),
      example: null,
      audioUrl: nullableString(row.audio),
      provider: "ecdict",
      source: "ecdict"
    }));
  }
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.length > 0 ? value : null;
}

function toInteger(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  result.push(current);
  return result;
}
