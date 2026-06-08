# Word Learning CLI

[中文说明](README.zh-CN.md)

Local-first English vocabulary learning system for CLI, AI agents, and Obsidian.

The package installs two cross-platform commands:

- `wl`: short daily command.
- `wordcli`: full command name kept for compatibility and scripts.

## Architecture

- `packages/core`: domain model, SQLite schema, scheduling, imports, view generation.
- `packages/cli`: Node.js CLI with JSON-first automation support.
- `packages/obsidian-plugin`: Obsidian plugin shell using the shared core package.

The current storage strategy is SQLite as the structured source of truth, with JSONL operation logs and limited generated Markdown views for Obsidian.

Review scheduling is adapter-based. `simple_v1` is the default scheduler, `fsrs_v1` is available as an optional FSRS scheduler, and custom schedulers can be registered through the core `ReviewScheduler` interface.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter @word-learning/cli dev -- --help
```

## CLI Example

```bash
wl config set vault ~/Documents/MyVault
wl setup
wl doctor
wl a precise --meaning-zh "精确的" --tag writing
wl g precise
wl card precise
wl due
```

You can still override storage per command:

```bash
wl --vault ~/Documents/MyVault --json review due
wl --db ~/.word-learning/user.sqlite get precise
```

Use FSRS for newly added words:

```bash
wl --review-algorithm fsrs_v1 add retain
wl review answer retain --rating good
```

## Dictionary Lookup

Import a local ECDICT CSV file into the dictionary cache:

```bash
wl dictionary import-ecdict /path/to/ecdict.csv
```

Look up a word and save the first dictionary result into the learning database:

```bash
wl --json lookup precise --save
```

Use the online Free Dictionary API:

```bash
wl --json lookup hello --source free-dictionary
wl --json lookup hello --source all --save
```

Saved dictionary fields are recorded in `word_sources` so generated or imported content can be traced back to a provider.
Online entries can include an `audioUrl` for pronunciation playback.

## App Integration

External apps can use `doctor` and `card` for a small, stable integration surface:

```bash
wl --json doctor
wl --json setup
wl --json card hello --source all
wl --json card hello --no-record-lookup
```

The card payload includes saved word data, dictionary entries, `audioUrl`, favorite status, `reviewCount`, `lookupCount`, and `aiNote`. Lookup counts are tracked separately from review counts.

## Obsidian Plugin

```bash
pnpm pack:plugin
```

The plugin zip is written to `dist/obsidian-plugin/word-learning.zip`.

The MVP plugin is desktop-only and provides a side panel for lookup, save-to-library, due review, and generated view refresh.
It also supports importing an ECDICT CSV from the plugin settings tab.
The side panel can play pronunciation audio when the selected provider returns an audio URL.
The settings tab can choose the review algorithm for newly added words: `simple_v1` or `fsrs_v1`.

If Obsidian's runtime cannot load Node's SQLite module, the plugin falls back to online lookup and pronunciation playback. Saving words, local ECDICT lookup, review scheduling, and generated views require SQLite support.
