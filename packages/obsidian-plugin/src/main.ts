import { ItemView, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";
import { WordLearning, resolveVaultDbPath, type DueWord, type LookupResult, type Rating, type WordDetail, type WordSource } from "@word-learning/core";

const VIEW_TYPE = "word-learning-view";

interface WordLearningSettings {
  databasePath: string;
  dictionaryDatabasePath: string;
  defaultTags: string;
  autoSaveLookup: boolean;
  reviewLimit: number;
}

const defaultSettings: WordLearningSettings = {
  databasePath: ".word-learning/user.sqlite",
  dictionaryDatabasePath: ".word-learning/dictionaries/ecdict.sqlite",
  defaultTags: "",
  autoSaveLookup: false,
  reviewLimit: 10
};

export default class WordLearningPlugin extends Plugin {
  settings: WordLearningSettings = defaultSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new WordLearningSettingTab(this.app, this));
    this.registerView(VIEW_TYPE, (leaf) => new WordLearningView(leaf, this));

    this.addRibbonIcon("book-open", "Word Learning", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "lookup-selected-word",
      name: "Lookup selected word",
      callback: () => {
        const selected = this.getSelectedText();
        if (!selected) {
          new Notice("No selected word");
          return;
        }
        void this.activateView(selected);
      }
    });

    this.addCommand({
      id: "add-selected-word",
      name: "Add selected word",
      callback: () => {
        const selected = this.getSelectedText();
        if (!selected) {
          new Notice("No selected word");
          return;
        }
        const app = this.createCore();
        const word = app.addWord({
          word: selected,
          source: "obsidian-selection",
          tags: this.defaultTags()
        });
        app.close();
        new Notice(`Added ${word.word}`);
      }
    });

    this.addCommand({
      id: "open-today-review",
      name: "Open today review",
      callback: () => {
        void this.activateView();
      }
    });

    this.addCommand({
      id: "refresh-generated-views",
      name: "Refresh generated views",
      callback: () => {
        const vaultPath = this.getVaultBasePath();
        if (!vaultPath) {
          new Notice("Vault base path is unavailable");
          return;
        }
        const app = this.createCore();
        app.refreshViews(vaultPath);
        app.close();
        new Notice("Word Learning views refreshed");
      }
    });
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...defaultSettings, ...(await this.loadData()) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  createCore(): WordLearning {
    const vaultPath = this.getVaultBasePath();
    if (vaultPath) {
      return new WordLearning({
        dbPath: resolvePath(vaultPath, this.settings.databasePath, resolveVaultDbPath(vaultPath)),
        dictionaryDbPath: resolvePath(vaultPath, this.settings.dictionaryDatabasePath)
      });
    }
    return new WordLearning({
      dbPath: this.settings.databasePath,
      dictionaryDbPath: this.settings.dictionaryDatabasePath
    });
  }

  defaultTags(): string[] {
    return this.settings.defaultTags
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async activateView(word?: string): Promise<void> {
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      return;
    }
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof WordLearningView && word) {
      view.lookup(word);
    }
  }

  getVaultBasePath(): string | null {
    const adapter = this.app.vault.adapter as { getBasePath?: () => string };
    return adapter.getBasePath?.() ?? null;
  }

  private getSelectedText(): string {
    const selection = this.app.workspace.activeEditor?.editor?.getSelection() ?? "";
    return normalizeInput(selection);
  }
}

class WordLearningView extends ItemView {
  private currentLookup: LookupResult | null = null;
  private currentWord: WordDetail | null = null;
  private currentSources: WordSource[] = [];
  private due: DueWord[] = [];

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: WordLearningPlugin
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Word Learning";
  }

  async onOpen(): Promise<void> {
    this.refreshData();
    this.render();
  }

  lookup(rawWord: string): void {
    const word = normalizeInput(rawWord);
    if (!word) return;
    const app = this.plugin.createCore();
    this.currentLookup = app.lookupWord(word, { save: this.plugin.settings.autoSaveLookup });
    this.currentWord = app.getWord(word);
    this.currentSources = this.currentWord ? app.getWordSources(word) : [];
    this.due = app.getDueWords({ limit: this.plugin.settings.reviewLimit });
    app.close();
    this.render();
  }

  private refreshData(): void {
    const app = this.plugin.createCore();
    this.due = app.getDueWords({ limit: this.plugin.settings.reviewLimit });
    if (this.currentWord) {
      this.currentWord = app.getWord(this.currentWord.word);
      this.currentSources = this.currentWord ? app.getWordSources(this.currentWord.word) : [];
    }
    app.close();
  }

  private render(): void {
    const container = this.containerEl.children[1];
    if (!(container instanceof HTMLElement)) {
      return;
    }
    container.empty();
    container.addClass("word-learning-view");

    container.createEl("h2", { text: "Word Learning" });
    this.renderLookupBox(container);
    this.renderLookupResult(container);
    this.renderReview(container);
    this.renderActions(container);
  }

  private renderLookupBox(container: Element): void {
    const wrapper = container.createDiv({ cls: "word-learning-lookup" });
    const input = wrapper.createEl("input", {
      attr: {
        type: "text",
        placeholder: "Lookup word"
      }
    });
    const button = wrapper.createEl("button", { text: "Lookup" });
    button.addEventListener("click", () => this.lookup(input.value));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        this.lookup(input.value);
      }
    });
  }

  private renderLookupResult(container: Element): void {
    const section = container.createDiv({ cls: "word-learning-section" });
    section.createEl("h3", { text: "Lookup" });

    if (!this.currentLookup) {
      section.createEl("p", { text: "Select or enter a word to look up." });
      return;
    }

    section.createEl("h4", { text: this.currentLookup.word });
    const entry = this.currentLookup.entries[0];
    if (!entry) {
      section.createEl("p", { text: "No dictionary entry found." });
      return;
    }

    const list = section.createEl("ul");
    list.createEl("li", { text: `中文：${entry.translation ?? "未提供"}` });
    list.createEl("li", { text: `English：${entry.definition ?? "Not available"}` });
    list.createEl("li", { text: `音标：${entry.phonetic ?? "未提供"}` });
    list.createEl("li", { text: `词性：${entry.pos ?? "未提供"}` });
    list.createEl("li", { text: `来源：${entry.provider}` });

    const controls = section.createDiv({ cls: "word-learning-actions" });
    const save = controls.createEl("button", { text: this.currentWord ? "Saved" : "Save" });
    save.disabled = Boolean(this.currentWord);
    save.addEventListener("click", () => {
      const app = this.plugin.createCore();
      const saved = app.lookupWord(this.currentLookup?.word ?? "", { save: true }).savedWord;
      app.close();
      if (saved) {
        this.currentWord = saved;
        new Notice(`Saved ${saved.word}`);
        this.render();
      }
    });

    if (this.currentWord) {
      section.createEl("h4", { text: "Sources" });
      const sources = section.createEl("ul");
      for (const source of this.currentSources) {
        sources.createEl("li", { text: `${source.fieldName}: ${source.provider}${source.license ? ` (${source.license})` : ""}` });
      }
    }
  }

  private renderReview(container: Element): void {
    const section = container.createDiv({ cls: "word-learning-section" });
    section.createEl("h3", { text: `今日复习 (${this.due.length})` });
    if (this.due.length === 0) {
      section.createEl("p", { text: "No due words." });
      return;
    }

    const item = this.due[0];
    if (!item) return;
    section.createEl("h4", { text: item.word.word });
    section.createEl("p", { text: item.word.meaningZh ?? item.word.meaningEn ?? "未补充释义" });
    const controls = section.createDiv({ cls: "word-learning-actions" });
    this.addReviewButton(controls, item.word.word, "不认识", "again");
    this.addReviewButton(controls, item.word.word, "有点熟悉", "hard");
    this.addReviewButton(controls, item.word.word, "认识", "good");
  }

  private addReviewButton(container: Element, word: string, label: string, rating: Rating): void {
    const button = container.createEl("button", { text: label });
    button.addEventListener("click", () => {
      const app = this.plugin.createCore();
      app.submitReview(word, rating);
      this.due = app.getDueWords({ limit: this.plugin.settings.reviewLimit });
      app.close();
      new Notice(`Reviewed ${word}: ${label}`);
      this.render();
    });
  }

  private renderActions(container: Element): void {
    const actions = container.createDiv({ cls: "word-learning-actions" });
    const refresh = actions.createEl("button", { text: "Refresh" });
    refresh.addEventListener("click", () => {
      this.refreshData();
      this.render();
    });

    const generateViews = actions.createEl("button", { text: "Generate views" });
    generateViews.addEventListener("click", () => {
      const vaultPath = this.plugin.getVaultBasePath();
      if (!vaultPath) {
        new Notice("Vault base path is unavailable");
        return;
      }
      const app = this.plugin.createCore();
      app.refreshViews(vaultPath);
      app.close();
      new Notice("Generated Word Learning views");
    });
  }
}

class WordLearningSettingTab extends PluginSettingTab {
  constructor(
    app: WordLearningPlugin["app"],
    private readonly plugin: WordLearningPlugin
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Word Learning" });

    new Setting(containerEl)
      .setName("User database path")
      .setDesc("Relative to the vault when possible.")
      .addText((text) => {
        text.setValue(this.plugin.settings.databasePath);
        text.onChange(async (value) => {
          this.plugin.settings.databasePath = value.trim() || defaultSettings.databasePath;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Dictionary database path")
      .setDesc("ECDICT cache path. Relative to the vault when possible.")
      .addText((text) => {
        text.setValue(this.plugin.settings.dictionaryDatabasePath);
        text.onChange(async (value) => {
          this.plugin.settings.dictionaryDatabasePath = value.trim() || defaultSettings.dictionaryDatabasePath;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Default tags")
      .setDesc("Comma or space separated tags for selected words.")
      .addText((text) => {
        text.setValue(this.plugin.settings.defaultTags);
        text.onChange(async (value) => {
          this.plugin.settings.defaultTags = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Auto-save lookup")
      .setDesc("Automatically save the first dictionary result when looking up a word.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.autoSaveLookup);
        toggle.onChange(async (value) => {
          this.plugin.settings.autoSaveLookup = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Review limit")
      .setDesc("Maximum due words shown in the side panel.")
      .addText((text) => {
        text.setValue(String(this.plugin.settings.reviewLimit));
        text.onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.reviewLimit = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultSettings.reviewLimit;
          await this.plugin.saveSettings();
        });
      });
  }
}

function normalizeInput(value: string): string {
  return value.trim().replace(/^\W+|\W+$/g, "");
}

function resolvePath(vaultPath: string, configuredPath: string, fallback?: string): string {
  const trimmed = configuredPath.trim();
  if (!trimmed) {
    return fallback ?? vaultPath;
  }
  if (trimmed.startsWith("/")) {
    return trimmed;
  }
  return `${vaultPath}/${trimmed}`;
}
