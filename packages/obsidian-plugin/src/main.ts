import { ItemView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { WordLearning, resolveVaultDbPath } from "@word-learning/core";

const VIEW_TYPE = "word-learning-view";

interface WordLearningSettings {
  databasePath: string;
}

const defaultSettings: WordLearningSettings = {
  databasePath: ".word-learning/user.sqlite"
};

export default class WordLearningPlugin extends Plugin {
  settings: WordLearningSettings = defaultSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
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
        new Notice(`Selected: ${selected}`);
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
        const word = app.addWord({ word: selected, source: "obsidian-selection" });
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
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...defaultSettings, ...(await this.loadData()) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  createCore(): WordLearning {
    const adapter = this.app.vault.adapter as { getBasePath?: () => string };
    const vaultPath = adapter.getBasePath?.();
    if (vaultPath) {
      return new WordLearning({ dbPath: resolveVaultDbPath(vaultPath) });
    }
    return new WordLearning({ dbPath: this.settings.databasePath });
  }

  async activateView(): Promise<void> {
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      return;
    }
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private getSelectedText(): string {
    const selection = this.app.workspace.activeEditor?.editor?.getSelection() ?? "";
    return selection.trim();
  }
}

class WordLearningView extends ItemView {
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
    this.render();
  }

  render(): void {
    const container = this.containerEl.children[1];
    if (!(container instanceof HTMLElement)) {
      return;
    }
    container.empty();
    container.createEl("h2", { text: "Word Learning" });

    const app = this.plugin.createCore();
    const due = app.getDueWords({ limit: 10 });
    app.close();

    container.createEl("p", { text: `今日待复习：${due.length}` });
    const list = container.createEl("ul", { cls: "word-learning-view" });
    for (const item of due) {
      list.createEl("li", {
        text: `${item.word.word} - ${item.word.meaningZh ?? item.word.meaningEn ?? "未补充释义"}`
      });
    }

    const actions = container.createDiv({ cls: "word-learning-actions" });
    const refresh = actions.createEl("button", { text: "Refresh" });
    refresh.addEventListener("click", () => this.render());
  }
}
