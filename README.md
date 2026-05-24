# Word Learning CLI

Local-first English vocabulary learning system for CLI, AI agents, and Obsidian.

## Architecture

- `packages/core`: domain model, SQLite schema, scheduling, imports, view generation.
- `packages/cli`: Node.js CLI with JSON-first automation support.
- `packages/obsidian-plugin`: Obsidian plugin shell using the shared core package.

The current storage strategy is SQLite as the structured source of truth, with JSONL operation logs and limited generated Markdown views for Obsidian.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter @word-learning/cli dev -- --help
```

## CLI Example

```bash
wordcli init --vault ~/Documents/MyVault
wordcli add precise --meaning-zh "精确的" --tag writing --vault ~/Documents/MyVault
wordcli review due --vault ~/Documents/MyVault --json
```

## Dictionary Lookup

Import a local ECDICT CSV file into the dictionary cache:

```bash
wordcli --vault ~/Documents/MyVault dictionary import-ecdict /path/to/ecdict.csv
```

Look up a word and save the first dictionary result into the learning database:

```bash
wordcli --vault ~/Documents/MyVault --json lookup precise --save
```

Use the online Free Dictionary API:

```bash
wordcli --vault ~/Documents/MyVault --json lookup hello --source free-dictionary
wordcli --vault ~/Documents/MyVault --json lookup hello --source all --save
```

Saved dictionary fields are recorded in `word_sources` so generated or imported content can be traced back to a provider.
Online entries can include an `audioUrl` for pronunciation playback.

## Obsidian Plugin

```bash
pnpm pack:plugin
```

The plugin zip is written to `dist/obsidian-plugin/word-learning.zip`.

The MVP plugin is desktop-only and provides a side panel for lookup, save-to-library, due review, and generated view refresh.
It also supports importing an ECDICT CSV from the plugin settings tab.
The side panel can play pronunciation audio when the selected provider returns an audio URL.

If Obsidian's runtime cannot load Node's SQLite module, the plugin falls back to online lookup and pronunciation playback. Saving words, local ECDICT lookup, review scheduling, and generated views require SQLite support.
