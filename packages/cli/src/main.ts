#!/usr/bin/env node
import { Command } from "commander";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  WordLearning,
  fail,
  isNodeSqliteAvailable,
  ok,
  resolveVaultDbPath,
  type LookupSource,
  type MorphemeInput,
  type Rating,
  type SentenceInput,
  type WordInput,
  type WordLearningOptions,
  type WordStatus
} from "@word-learning/core";
import { getConfigPath, getEnvStorage, parseConfigKey, readCliConfig, resolveStorage, resolveStorageOptions, setCliConfigValue, unsetCliConfigValue } from "./config.js";

interface GlobalOptions {
  vault?: string;
  db?: string;
  reviewAlgorithm?: string;
  json?: boolean;
}

function createApp(options: GlobalOptions): WordLearning {
  const appOptions: WordLearningOptions = {};
  const resolvedOptions = resolveStorageOptions(options);
  const reviewAlgorithm = parseReviewAlgorithm(options.reviewAlgorithm);
  if (resolvedOptions.vault !== undefined) appOptions.vaultPath = resolvedOptions.vault;
  if (resolvedOptions.db !== undefined) appOptions.dbPath = resolvedOptions.db;
  if (reviewAlgorithm !== undefined) appOptions.reviewAlgorithm = reviewAlgorithm;
  return new WordLearning(appOptions);
}

function withDefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

function printResult<T>(value: T, asJson: boolean | undefined): void {
  if (asJson) {
    console.log(JSON.stringify(ok(value), null, 2));
    return;
  }
  if (typeof value === "string") {
    console.log(value);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function handleError(error: unknown, asJson: boolean | undefined): never {
  const message = error instanceof Error ? error.message : String(error);
  if (asJson) {
    console.error(JSON.stringify(fail("COMMAND_ERROR", message), null, 2));
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function parseStatus(value: string): WordStatus {
  if (value === "new" || value === "learning" || value === "mastered" || value === "suspended" || value === "archived") {
    return value;
  }
  throw new Error(`invalid status: ${value}`);
}

function parseReviewAlgorithm(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value === "simple_v1" || value === "fsrs_v1") return value;
  throw new Error(`invalid review algorithm: ${value}`);
}

function makeDoctorResult(options: GlobalOptions): Record<string, unknown> {
  const configPath = getConfigPath();
  const active = resolveStorage(options, process.env, configPath);
  const dbPath = active.db ?? (active.vault ? resolveVaultDbPath(active.vault) : join(process.cwd(), ".word-learning", "user.sqlite"));
  const sqliteAvailable = isNodeSqliteAvailable();
  const checks = {
    nodeSqlite: sqliteAvailable,
    storageConfigured: active.source !== "cwd",
    dbExists: existsSync(dbPath),
    vaultExists: active.vault ? existsSync(active.vault) : null
  };
  const ok = checks.nodeSqlite && checks.dbExists;
  return {
    ok,
    version: "0.1.4",
    node: process.version,
    configPath,
    active,
    dbPath: dbPath ?? null,
    checks
  };
}

const program = new Command();

program
  .name("wordcli")
  .description("Local-first vocabulary learning CLI for AI agents and Obsidian")
  .version("0.1.4")
  .option("--vault <path>", "Obsidian vault path")
  .option("--db <path>", "SQLite database path")
  .option("--review-algorithm <algorithm>", "simple_v1 | fsrs_v1")
  .option("--json", "print machine-readable JSON");

const config = program.command("config").description("manage default CLI configuration");

config
  .command("show")
  .description("show default CLI configuration and active storage")
  .action(() => {
    const options = program.opts<GlobalOptions>();
    try {
      const configPath = getConfigPath();
      const result = {
        configPath,
        config: readCliConfig(configPath),
        env: getEnvStorage(),
        active: resolveStorage(options, process.env, configPath)
      };
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

config
  .command("set")
  .argument("<key>", "db | vault")
  .argument("<value>")
  .description("set default db or vault path")
  .action((key: string, value: string) => {
    const options = program.opts<GlobalOptions>();
    try {
      const parsedKey = parseConfigKey(key);
      const configPath = getConfigPath();
      const saved = setCliConfigValue(parsedKey, value, configPath);
      printResult({ configPath, config: saved }, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

config
  .command("unset")
  .argument("<key>", "db | vault")
  .description("remove default db or vault path")
  .action((key: string) => {
    const options = program.opts<GlobalOptions>();
    try {
      const parsedKey = parseConfigKey(key);
      const configPath = getConfigPath();
      const saved = unsetCliConfigValue(parsedKey, configPath);
      printResult({ configPath, config: saved }, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("init")
  .description("initialize the word learning database")
  .action(() => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      app.init();
      app.close();
      printResult({ initialized: true }, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("doctor")
  .description("check wordcli runtime, storage, and database readiness")
  .action(() => {
    const options = program.opts<GlobalOptions>();
    try {
      printResult(makeDoctorResult(options), options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("setup")
  .description("initialize storage and return readiness information")
  .option("--refresh-views", "refresh generated Obsidian views after setup")
  .action((commandOptions: { refreshViews?: boolean }) => {
    const options = program.opts<GlobalOptions>();
    try {
      const resolvedOptions = resolveStorageOptions(options);
      const app = createApp(resolvedOptions);
      app.init();
      if (commandOptions.refreshViews === true) {
        if (!resolvedOptions.vault) {
          throw new Error("--vault or configured vault is required for setup --refresh-views");
        }
        app.refreshViews(resolvedOptions.vault);
      }
      app.close();
      printResult(
        {
          initialized: true,
          refreshedViews: commandOptions.refreshViews === true,
          doctor: makeDoctorResult(options)
        },
        options.json
      );
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("add")
  .alias("a")
  .argument("<word>")
  .description("add or update a word")
  .option("--meaning-zh <text>")
  .option("--meaning-en <text>")
  .option("--phonetic <text>")
  .option("--pos <text>")
  .option("--example <text>")
  .option("--source <text>")
  .option("--note <text>")
  .option("--ai-note <text>")
  .option("--tag <tag>", "tag to add", collect, [])
  .action((word: string, commandOptions: Record<string, string | string[]>) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const input: WordInput = { word };
      if (typeof commandOptions.meaningZh === "string") input.meaningZh = commandOptions.meaningZh;
      if (typeof commandOptions.meaningEn === "string") input.meaningEn = commandOptions.meaningEn;
      if (typeof commandOptions.phonetic === "string") input.phonetic = commandOptions.phonetic;
      if (typeof commandOptions.pos === "string") input.partOfSpeech = commandOptions.pos;
      if (typeof commandOptions.example === "string") input.example = commandOptions.example;
      if (typeof commandOptions.source === "string") input.source = commandOptions.source;
      if (typeof commandOptions.note === "string") input.personalNote = commandOptions.note;
      if (typeof commandOptions.aiNote === "string") input.aiNote = commandOptions.aiNote;
      if (Array.isArray(commandOptions.tag)) input.tags = commandOptions.tag;
      const result = app.addWord(input);
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("get")
  .alias("g")
  .argument("<word>")
  .description("get a word from the learning database")
  .action((word: string) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const result = app.getWord(word);
      app.close();
      printResult(result ?? { found: false, word }, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("lookup")
  .argument("<word>")
  .description("look up a word in configured dictionary sources")
  .option("--save", "save the first dictionary result into the learning database")
  .option("--source <source>", "ecdict | free-dictionary | all", "ecdict")
  .action(async (word: string, commandOptions: { save?: boolean; source: LookupSource }) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const result = await app.lookupWord(word, { save: commandOptions.save === true, source: commandOptions.source });
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("card")
  .argument("<word>")
  .description("get UI-ready word card data")
  .option("--source <source>", "ecdict | free-dictionary | all", "all")
  .option("--no-record-lookup", "do not increment lookup count")
  .action(async (word: string, commandOptions: { source: LookupSource; recordLookup: boolean }) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const result = await app.getWordCard(word, {
        source: commandOptions.source,
        recordLookup: commandOptions.recordLookup !== false
      });
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("lookup-stats")
  .argument("<word>")
  .description("show lookup count and last lookup time for a word")
  .action((word: string) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const result = app.getLookupStats(word);
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("update")
  .argument("<word>")
  .description("update word fields")
  .option("--meaning-zh <text>")
  .option("--meaning-en <text>")
  .option("--phonetic <text>")
  .option("--pos <text>")
  .option("--example <text>")
  .option("--source <text>")
  .option("--note <text>")
  .option("--ai-note <text>")
  .option("--status <status>")
  .action((word: string, commandOptions: Record<string, string>) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const patch: Partial<WordInput> = {};
      if (commandOptions.meaningZh) patch.meaningZh = commandOptions.meaningZh;
      if (commandOptions.meaningEn) patch.meaningEn = commandOptions.meaningEn;
      if (commandOptions.phonetic) patch.phonetic = commandOptions.phonetic;
      if (commandOptions.pos) patch.partOfSpeech = commandOptions.pos;
      if (commandOptions.example) patch.example = commandOptions.example;
      if (commandOptions.source) patch.source = commandOptions.source;
      if (commandOptions.note) patch.personalNote = commandOptions.note;
      if (commandOptions.aiNote) patch.aiNote = commandOptions.aiNote;
      if (commandOptions.status) patch.status = parseStatus(commandOptions.status);
      const result = app.updateWord(word, patch);
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("import")
  .argument("<file>")
  .description("import words from CSV, TSV, or JSON")
  .option("--format <format>", "csv | tsv | json")
  .option("--tag <tag>")
  .option("--source <source>")
  .action((file: string, commandOptions: { format?: "csv" | "tsv" | "json"; tag?: string; source?: string }) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const result = app.importWordsFromFile(file, withDefined(commandOptions));
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

const tag = program.command("tag").description("manage word tags");

tag
  .command("add")
  .argument("<word>")
  .argument("<tags...>")
  .action((word: string, tags: string[]) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      app.addTags(word, tags);
      const result = app.getWord(word);
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

tag
  .command("remove")
  .argument("<word>")
  .argument("<tags...>")
  .action((word: string, tags: string[]) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      app.removeTags(word, tags);
      const result = app.getWord(word);
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

tag
  .command("list")
  .action(() => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const result = app.listTags();
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

const review = program.command("review").description("review words");

function showDueWords(commandOptions: { limit: number; tag?: string }): void {
  const options = program.opts<GlobalOptions>();
  try {
    const app = createApp(options);
    const result = app.getDueWords(withDefined({ limit: commandOptions.limit, tag: commandOptions.tag }));
    app.close();
    printResult(result, options.json);
  } catch (error) {
    handleError(error, options.json);
  }
}

review
  .command("due")
  .option("--limit <number>", "maximum due words", (value) => Number.parseInt(value, 10), 20)
  .option("--tag <tag>")
  .action(showDueWords);

program
  .command("due")
  .alias("d")
  .description("show due review words")
  .option("--limit <number>", "maximum due words", (value) => Number.parseInt(value, 10), 20)
  .option("--tag <tag>")
  .action(showDueWords);

const dictionary = program.command("dictionary").description("manage local dictionary sources");

dictionary
  .command("import-ecdict")
  .argument("<csv>")
  .description("import ECDICT CSV into the local dictionary database")
  .action(async (csv: string) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const result = await app.importEcdict(csv);
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

review
  .command("answer")
  .argument("<word>")
  .requiredOption("--rating <rating>", "again | hard | good")
  .action((word: string, commandOptions: { rating: Rating }) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const result = app.submitReview(word, commandOptions.rating);
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("sentence")
  .description("add sentences and link them to words")
  .argument("<text>")
  .option("--translation-zh <text>")
  .option("--source <text>")
  .option("--source-type <text>")
  .option("--word <word>", "word to link", collect, [])
  .action((text: string, commandOptions: { translationZh?: string; source?: string; sourceType?: string; word: string[] }) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const input: SentenceInput = { text, words: commandOptions.word };
      if (commandOptions.translationZh) input.translationZh = commandOptions.translationZh;
      if (commandOptions.source) input.source = commandOptions.source;
      if (commandOptions.sourceType) input.sourceType = commandOptions.sourceType;
      const result = app.addSentence(input);
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

const morpheme = program.command("morpheme").description("manage roots, prefixes, and suffixes");

morpheme
  .command("add")
  .argument("<text>")
  .requiredOption("--type <type>", "root | prefix | suffix")
  .option("--meaning-zh <text>")
  .option("--meaning-en <text>")
  .option("--origin <text>")
  .action((text: string, commandOptions: { type: "root" | "prefix" | "suffix"; meaningZh?: string; meaningEn?: string; origin?: string }) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const input: MorphemeInput = { text, type: commandOptions.type };
      if (commandOptions.meaningZh) input.meaningZh = commandOptions.meaningZh;
      if (commandOptions.meaningEn) input.meaningEn = commandOptions.meaningEn;
      if (commandOptions.origin) input.origin = commandOptions.origin;
      const result = app.addMorpheme(input);
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

morpheme
  .command("link")
  .argument("<word>")
  .argument("<morpheme>")
  .option("--position <position>")
  .option("--explanation <text>")
  .option("--confidence <value>")
  .action((word: string, morphemeText: string, commandOptions: { position?: string; explanation?: string; confidence?: string }) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      app.linkWordMorpheme(word, morphemeText, commandOptions);
      const result = app.getGraph("word", word);
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("graph")
  .argument("<type>")
  .argument("<id>")
  .description("show related words, sentences, morphemes, and relations")
  .action((type: string, id: string) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const result = app.getGraph(type, id);
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("stats")
  .description("show learning statistics")
  .action(() => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const result = app.getStats();
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("backup")
  .description("create a SQLite backup")
  .action(() => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const backupPath = app.backup();
      app.close();
      printResult({ backupPath }, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("repair")
  .description("repair missing schedules and basic database invariants")
  .action(() => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const result = app.repair();
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program
  .command("views")
  .argument("<action>")
  .description("refresh generated Obsidian views")
  .action((action: string) => {
    const options = program.opts<GlobalOptions>();
    try {
      if (action !== "refresh") {
        throw new Error(`unsupported views action: ${action}`);
      }
      const resolvedOptions = resolveStorageOptions(options);
      if (!resolvedOptions.vault) {
        throw new Error("--vault or configured vault is required for views refresh");
      }
      const app = createApp(resolvedOptions);
      app.refreshViews(resolvedOptions.vault);
      app.close();
      printResult({ refreshed: true }, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program.parse();
