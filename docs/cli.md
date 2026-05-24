# CLI Commands

Global options:

```bash
wordcli --vault <obsidian-vault> --json <command>
wordcli --db <user.sqlite> --json <command>
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
```

