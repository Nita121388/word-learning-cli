# Word Learning Obsidian Plugin

Desktop-only MVP plugin for the Word Learning project.

## Features

- Side panel for dictionary lookup and due reviews.
- Command palette actions:
  - Lookup selected word
  - Add selected word
  - Open today review
  - Refresh generated views
- Settings for user database path, dictionary database path, default tags, auto-save lookup, review algorithm, and review limit.
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

Review scheduling:

1. Open Word Learning settings.
2. Keep `Simple review curve` for the built-in fixed schedule, or choose `FSRS` for the optional FSRS scheduler.
3. Newly added words use the selected algorithm. Existing words keep their stored schedule algorithm.

## Runtime Notes

The plugin avoids crashing when Node SQLite is unavailable. In that case:

- Online Free Dictionary lookup still works.
- Pronunciation playback still works when an audio URL exists.
- Saving words, local ECDICT lookup, review scheduling, and generated views are disabled until SQLite is available.
