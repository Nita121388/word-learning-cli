# CLI Commands

The package installs both `wl` and `wordcli`. Use `wl` for daily use; `wordcli` remains available for compatibility.

Global options:

```bash
wl --vault <obsidian-vault> --json <command>
wl --db <user.sqlite> --json <command>
wl --review-algorithm simple_v1 <command>
wl --review-algorithm fsrs_v1 <command>
```

Default storage config:

```bash
wl config set vault ~/Documents/MyVault
wl config set db ~/.word-learning/user.sqlite
wl config show
wl config unset vault
wl config unset db
```

Storage is resolved in this order:

```text
--db / --vault
WORDCLI_DB / WORDCLI_VAULT
~/.config/wordcli/config.json
./.word-learning/user.sqlite
```

Core commands:

```bash
wl init
wl doctor
wl setup
wl add WORD --meaning-zh TEXT --tag TAG
wl a WORD --meaning-zh TEXT
wl get WORD
wl g WORD
wl card WORD
wl update WORD --note TEXT
wl update WORD --ai-note TEXT
wl import words.csv --tag imported
wl lookup WORD --save
wl lookup-stats WORD
wl stats
wl backup
wl repair
```

Review:

```bash
wl due --limit 20
wl d
wl review due --limit 20
wl review answer WORD --rating again
wl review answer WORD --rating hard
wl review answer WORD --rating good
```

The default scheduler is `simple_v1`. Use global option `--review-algorithm fsrs_v1` before the command to create new schedules with FSRS.
Existing words keep the scheduler stored in their `schedules.algorithm` field.

```bash
wl --review-algorithm fsrs_v1 add retain
wl review answer retain --rating good
```

The core package exposes a `ReviewScheduler` interface so custom schedulers can be plugged in without changing CLI commands.

Relations:

```bash
wl sentence "Use precise words." --word precise
wl morpheme add pre --type prefix --meaning-zh "在前；预先"
wl morpheme link preview pre --position prefix
wl graph word precise
```

Dictionary:

```bash
wl dictionary import-ecdict /path/to/ecdict.csv
wl lookup precise
wl lookup precise --save
wl lookup hello --source free-dictionary
wl lookup hello --source all --save
```

Lookup sources:

- `ecdict`: local ECDICT cache.
- `free-dictionary`: online Free Dictionary API.
- `all`: local ECDICT followed by Free Dictionary API.

UI integration:

```bash
wl --json doctor
wl --json setup
wl --json card precise
wl --json card precise --source all
wl --json card precise --no-record-lookup
wl --json lookup-stats precise
```

`card` returns one UI-ready payload containing the saved word, dictionary entries, best entry, audio URL, favorite state, review count, lookup count, and last lookup time. Saved words use the local database without forcing a network lookup. Unsaved words are looked up from the selected source.

`doctor` checks whether the configured database is ready. `setup` initializes the configured database and can refresh Obsidian generated views:

```bash
wl --vault ~/Documents/MyVault --json setup --refresh-views
```

Lookup counts are stored in `lookup_events`. `reviewCount` still comes from the spaced-repetition schedule and means something different from lookup count.

AI notes:

```bash
wl add precise --ai-note "AI-generated explanation"
wl update precise --ai-note "Updated AI explanation"
```

Use `--note` for a personal note and `--ai-note` for generated explanatory content.

Obsidian plugin package:

```bash
pnpm pack:plugin
```

The generated zip is written to `dist/obsidian-plugin/word-learning.zip`.
