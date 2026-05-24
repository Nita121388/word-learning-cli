import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WordLearning } from "./word-learning.js";

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
});

