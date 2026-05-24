#!/usr/bin/env node
import { Command } from "commander";
import { WordLearning, fail, ok, type LookupSource, type MorphemeInput, type Rating, type SentenceInput, type WordInput, type WordLearningOptions, type WordStatus } from "@word-learning/core";

interface GlobalOptions {
  vault?: string;
  db?: string;
  reviewAlgorithm?: string;
  json?: boolean;
}

function createApp(options: GlobalOptions): WordLearning {
  const appOptions: WordLearningOptions = {};
  const reviewAlgorithm = parseReviewAlgorithm(options.reviewAlgorithm);
  if (options.vault !== undefined) appOptions.vaultPath = options.vault;
  if (options.db !== undefined) appOptions.dbPath = options.db;
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

const program = new Command();

program
  .name("wordcli")
  .description("Local-first vocabulary learning CLI for AI agents and Obsidian")
  .version("0.1.3")
  .option("--vault <path>", "Obsidian vault path")
  .option("--db <path>", "SQLite database path")
  .option("--review-algorithm <algorithm>", "simple_v1 | fsrs_v1")
  .option("--json", "print machine-readable JSON");

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
  .command("add")
  .argument("<word>")
  .description("add or update a word")
  .option("--meaning-zh <text>")
  .option("--meaning-en <text>")
  .option("--phonetic <text>")
  .option("--pos <text>")
  .option("--example <text>")
  .option("--source <text>")
  .option("--note <text>")
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

review
  .command("due")
  .option("--limit <number>", "maximum due words", (value) => Number.parseInt(value, 10), 20)
  .option("--tag <tag>")
  .action((commandOptions: { limit: number; tag?: string }) => {
    const options = program.opts<GlobalOptions>();
    try {
      const app = createApp(options);
      const result = app.getDueWords(withDefined({ limit: commandOptions.limit, tag: commandOptions.tag }));
      app.close();
      printResult(result, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

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
      if (!options.vault) {
        throw new Error("--vault is required for views refresh");
      }
      const app = createApp(options);
      app.refreshViews(options.vault);
      app.close();
      printResult({ refreshed: true }, options.json);
    } catch (error) {
      handleError(error, options.json);
    }
  });

program.parse();
