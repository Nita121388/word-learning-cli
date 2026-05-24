import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function resolveVaultDbPath(vaultPath: string): string {
  return join(vaultPath, ".word-learning", "user.sqlite");
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function compactObject<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      output[key] = item;
    }
  }
  return output as T;
}

