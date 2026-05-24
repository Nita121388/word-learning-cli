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

