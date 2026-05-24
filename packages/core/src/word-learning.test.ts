import { mkdtempSync, rmSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WordLearning } from "./word-learning.js";
import type { ReviewScheduler } from "./review/scheduler.js";

const dirs: string[] = [];

function createApp(): WordLearning {
  const dir = mkdtempSync(join(tmpdir(), "word-learning-"));
  dirs.push(dir);
  return new WordLearning({ dbPath: join(dir, "user.sqlite") });
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("WordLearning", () => {
  it("adds words with tags and returns due reviews", () => {
    const app = createApp();
    const word = app.addWord({ word: "precise", meaningZh: "精确的", tags: ["writing"] });

    expect(word.word).toBe("precise");
    expect(word.tags).toEqual(["writing"]);
    expect(app.getDueWords({ limit: 10 })).toHaveLength(1);
    app.close();
  });

  it("submits simple review results", () => {
    const app = createApp();
    app.addWord({ word: "recall" });
    const result = app.submitReview("recall", "good", new Date("2026-05-24T00:00:00.000Z"));

    expect(result.intervalMinutes).toBe(4320);
    expect(result.nextDueAt).toBe("2026-05-27T00:00:00.000Z");
    expect(app.getWord("recall")?.status).toBe("learning");
    app.close();
  });

  it("links sentences and morphemes into a graph", () => {
    const app = createApp();
    app.addWord({ word: "preview" });
    app.addSentence({ text: "Preview the file before saving.", words: ["preview"] });
    app.addMorpheme({ text: "pre", type: "prefix", meaningZh: "在前；预先" });
    app.linkWordMorpheme("preview", "pre", { position: "prefix" });

    const graph = app.getGraph("word", "preview");
    expect(graph.sentences).toHaveLength(1);
    expect(graph.morphemes).toHaveLength(1);
    app.close();
  });

  it("imports ECDICT and saves lookup results", async () => {
    const dir = mkdtempSync(join(tmpdir(), "word-learning-"));
    dirs.push(dir);
    const csv = join(dir, "ecdict.csv");
    writeFileSync(
      csv,
      [
        "word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio",
        "precise,prɪˈsaɪs,exact and accurate,精确的,adj,1,1,ielts,1000,1000,precisely,demo,"
      ].join("\n"),
      "utf8"
    );
    const app = new WordLearning({
      dbPath: join(dir, "user.sqlite"),
      dictionaryDbPath: join(dir, "ecdict.sqlite")
    });

    const imported = await app.importEcdict(csv);
    const lookup = await app.lookupWord("precise", { save: true });

    expect(imported.imported).toBe(1);
    expect(lookup.entries[0]?.translation).toBe("精确的");
    expect(lookup.savedWord?.meaningZh).toBe("精确的");
    expect(lookup.savedWord?.tags).toContain("ielts");
    app.close();
  });

  it("accepts a custom review scheduler", () => {
    const scheduler: ReviewScheduler = {
      algorithm: "custom_v1",
      schedule(current, _rating, reviewedAt) {
        return {
          algorithm: "custom_v1",
          dueAt: new Date(reviewedAt.getTime() + 60_000).toISOString(),
          intervalMinutes: 1,
          lapseCount: current?.lapseCount ?? 0,
          reviewCount: (current?.reviewCount ?? 0) + 1,
          stateJson: JSON.stringify({ custom: true })
        };
      }
    };
    const app = createApp();
    app.addWord({ word: "adapter" });
    app.updateWord("adapter", { status: "learning" });
    const result = app.submitReview("adapter", "good", new Date("2026-05-24T00:00:00.000Z"));

    expect(result.nextDueAt).toBe("2026-05-27T00:00:00.000Z");
    app.close();

    const customDir = mkdtempSync(join(tmpdir(), "word-learning-"));
    dirs.push(customDir);
    const appWithScheduler = new WordLearning({
      dbPath: join(customDir, "user.sqlite"),
      scheduler,
      reviewAlgorithm: "custom_v1"
    });
    appWithScheduler.addWord({ word: "custom" });
    const customResult = appWithScheduler.submitReview("custom", "good", new Date("2026-05-24T00:00:00.000Z"));
    expect(customResult.intervalMinutes).toBe(1);
    expect(appWithScheduler.getWord("custom")?.schedule?.algorithm).toBe("custom_v1");
    appWithScheduler.close();
  });

  it("stores and restores FSRS review state", () => {
    const dir = mkdtempSync(join(tmpdir(), "word-learning-"));
    dirs.push(dir);
    const app = new WordLearning({
      dbPath: join(dir, "user.sqlite"),
      reviewAlgorithm: "fsrs_v1"
    });
    app.addWord({ word: "retain" });

    const first = app.submitReview("retain", "good", new Date("2026-05-24T00:00:00.000Z"));
    const firstSchedule = app.getWord("retain")?.schedule;

    expect(first.intervalMinutes).toBeGreaterThan(0);
    expect(firstSchedule?.algorithm).toBe("fsrs_v1");
    expect(firstSchedule?.reviewCount).toBe(1);
    expect(firstSchedule?.stateJson).toContain("\"card\"");

    app.submitReview("retain", "hard", new Date(first.nextDueAt));
    const secondSchedule = app.getWord("retain")?.schedule;

    expect(secondSchedule?.algorithm).toBe("fsrs_v1");
    expect(secondSchedule?.reviewCount).toBe(2);
    expect(secondSchedule?.stateJson).toContain("\"last_review\"");
    app.close();
  });
});
