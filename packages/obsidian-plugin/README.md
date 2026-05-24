# Word Learning Obsidian Plugin

Desktop-only MVP plugin for the Word Learning project.

## Features

- Side panel for dictionary lookup and due reviews.
- Command palette actions:
  - Lookup selected word
  - Add selected word
  - Open today review
  - Refresh generated views
- Settings for user database path, dictionary database path, default tags, auto-save lookup, and review limit.
- ECDICT CSV import from the settings tab or command palette.
- Online Free Dictionary lookup support.
- Pronunciation playback when a lookup result includes an audio URL.

## Data

The plugin uses the shared `@word-learning/core` package and stores structured data in SQLite:

- User database: `.word-learning/user.sqlite`
- ECDICT cache: `.word-learning/dictionaries/ecdict.sqlite`

Generated Obsidian views are written under `单词学习/`.

Import ECDICT:

1. Open Word Learning settings.
2. Set the ECDICT CSV path.
3. Click `Import`.

Online lookup:

1. Open Word Learning settings.
2. Set Lookup source to `Free Dictionary online` or `All sources`.
3. Look up a word from the side panel or selected text.
4. Click `Play` when an audio button is shown.
