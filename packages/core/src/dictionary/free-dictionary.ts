import type { DictionaryEntry } from "../types.js";
import { normalizeWord } from "../utils.js";

interface FreeDictionaryResponse {
  word?: string;
  phonetic?: string;
  phonetics?: Array<{ text?: string; audio?: string }>;
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{
      definition?: string;
      example?: string;
      synonyms?: string[];
      antonyms?: string[];
    }>;
    synonyms?: string[];
    antonyms?: string[];
  }>;
}

export class FreeDictionaryProvider {
  constructor(private readonly endpoint = "https://api.dictionaryapi.dev/api/v2/entries/en") {}

  async lookup(word: string): Promise<DictionaryEntry[]> {
    const normalized = normalizeWord(word);
    const response = await fetch(`${this.endpoint}/${encodeURIComponent(normalized)}`, {
      headers: {
        accept: "application/json"
      }
    });
    if (response.status === 404) {
      return [];
    }
    if (!response.ok) {
      throw new Error(`Free Dictionary API failed: ${response.status}`);
    }
    const body = (await response.json()) as FreeDictionaryResponse[];
    return body.flatMap((item) => toEntries(item, normalized));
  }
}

function toEntries(item: FreeDictionaryResponse, fallbackWord: string): DictionaryEntry[] {
  const audioUrl = item.phonetics?.map((phonetic) => phonetic.audio).find((audio) => typeof audio === "string" && audio.length > 0) ?? null;
  const phonetic = item.phonetic ?? item.phonetics?.map((entry) => entry.text).find((text) => typeof text === "string" && text.length > 0) ?? null;
  const word = item.word ?? fallbackWord;
  const entries: DictionaryEntry[] = [];

  for (const meaning of item.meanings ?? []) {
    const firstDefinition = meaning.definitions?.[0];
    if (!firstDefinition?.definition) continue;
    entries.push({
      word,
      normalizedWord: normalizeWord(word),
      phonetic,
      definition: firstDefinition.definition,
      translation: null,
      pos: meaning.partOfSpeech ?? null,
      tags: [],
      exchange: null,
      example: firstDefinition.example ?? null,
      audioUrl,
      provider: "free-dictionary",
      source: "https://dictionaryapi.dev/"
    });
  }

  return entries.slice(0, 5);
}
