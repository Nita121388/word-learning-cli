# CLI Commands

Global options:

```bash
wordcli --vault <obsidian-vault> --json <command>
wordcli --db <user.sqlite> --json <command>
wordcli --review-algorithm simple_v1 <command>
wordcli --review-algorithm fsrs_v1 <command>
```

Core commands:

```bash
wordcli init
wordcli add WORD --meaning-zh TEXT --tag TAG
wordcli get WORD
wordcli update WORD --note TEXT
wordcli import words.csv --tag imported
wordcli lookup WORD --save
wordcli stats
wordcli backup
wordcli repair
```

Review:

```bash
wordcli review due --limit 20
wordcli review answer WORD --rating again
wordcli review answer WORD --rating hard
wordcli review answer WORD --rating good
```

The default scheduler is `simple_v1`. Use global option `--review-algorithm fsrs_v1` before the command to create new schedules with FSRS.
Existing words keep the scheduler stored in their `schedules.algorithm` field.

```bash
wordcli --vault ~/Documents/MyVault --review-algorithm fsrs_v1 add retain
wordcli --vault ~/Documents/MyVault review answer retain --rating good
```

The core package exposes a `ReviewScheduler` interface so custom schedulers can be plugged in without changing CLI commands.

Relations:

```bash
wordcli sentence "Use precise words." --word precise
wordcli morpheme add pre --type prefix --meaning-zh "在前；预先"
wordcli morpheme link preview pre --position prefix
wordcli graph word precise
```

Dictionary:

```bash
wordcli dictionary import-ecdict /path/to/ecdict.csv
wordcli lookup precise
wordcli lookup precise --save
wordcli lookup hello --source free-dictionary
wordcli lookup hello --source all --save
```

Lookup sources:

- `ecdict`: local ECDICT cache.
- `free-dictionary`: online Free Dictionary API.
- `all`: local ECDICT followed by Free Dictionary API.

Obsidian plugin package:

```bash
pnpm pack:plugin
```

The generated zip is written to `dist/obsidian-plugin/word-learning.zip`.
