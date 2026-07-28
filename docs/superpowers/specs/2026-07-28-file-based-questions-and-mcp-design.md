# File-based Question Sets + MCP Authoring Server — Design

Date: 2026-07-28
Status: Approved for planning

## Problem

The app currently stores question sets in two places: `localStorage` (`jq_question_sets`, `jq_active_set`) as the primary cache, and optionally Firebase Firestore (collection `question-sets`) as a remote backup/sync, wired up through a manual import/export UI in `js/data-manager.js` and `js/firebase-config.js`. The site itself is plain static HTML/JS/CSS with no build step or backend (confirmed: no `package.json`, no bundler, served via `python -m http.server` or GitHub Pages "deploy from branch").

We want to:
1. Stop storing question-set *content* in `localStorage` and remove Firebase entirely.
2. Make question sets live as files in the repo, so they're versioned, diffable, and can be authored by Claude via a dedicated MCP server running locally in Claude Desktop.
3. Let that MCP server also `git commit` + `push` the changes to `main`, which GitHub Pages (already configured to deploy from branch) will pick up automatically.

## Non-goals

- No new backend/server for the deployed game — it stays a static site.
- No change to player-progress persistence (HP/EXP/level/combo/settings/stats/session history) — these stay in `localStorage` as today.
- No GitHub Actions workflow — Pages is already set to "deploy from branch", push is enough.
- No in-browser authoring UI (add/edit/delete questions in the browser) — authoring happens exclusively through the MCP server / Claude Desktop.

## Data format

`questions/` directory at repo root, one JSON file per set, plus a manifest:

```
questions/
  manifest.json
  n5-vocab.json
  n5-kanji.json
  ...
```

`manifest.json`:
```json
{
  "sets": [
    { "id": "n5-vocab", "file": "n5-vocab.json", "name": "N5 Vocabulary", "questionCount": 42, "updatedAt": "2026-07-28T00:00:00.000Z" }
  ]
}
```

Set file (`<id>.json`):
```json
{
  "id": "n5-vocab",
  "name": "N5 Vocabulary",
  "description": "",
  "createdAt": "...",
  "updatedAt": "...",
  "questions": [
    { "word": "...", "romaji": "...", "translation": "...", "q": "...", "a": ["...", "...", "...", "..."], "c": 0, "ex": "..." }
  ]
}
```

This question shape matches the existing one (`README.md:77-97`, `js/data.js` `SAMPLE_DATA`), so no game-logic changes are needed for question rendering — only for where sets are loaded from.

The existing hardcoded `SAMPLE_DATA` in `js/data.js` is migrated into one or more of these JSON files as the default shipped content (no data loss), then removed from `data.js`.

## Game-side changes (static client)

- `js/storage.js`: remove `jq_question_sets` (no longer cache set content in localStorage). Keep `jq_active_set` but repurpose it to store only the *id* of the last-selected set (a small preference pointer, not question content). Keep all player-progress keys as-is (`jq_hp`, `jq_exp`, `jq_level`, `jq_combo`, `jq_settings`, `jq_question_stats`, `jq_session_history`, `jq_daily_streak`/`jq_streak_date`). Remove `jq_firebase_config`.
- New loading flow: on startup, `fetch('questions/manifest.json')` → render set picker → on selection, `fetch('questions/<file>')` to get that set's questions. Sets are no longer cached across full reload beyond the browser's normal HTTP cache; `jq_active_set` is used to pre-select the last-used set on next visit.
- `js/data-manager.js`: strip out all Firestore CRUD (list/import/export/delete via Firebase), the "paste/upload JSON" import UI, and Firebase config UI. What remains: fetching the manifest and rendering the set-selection list. Consider renaming responsibilities/functions to reflect the shrunk scope (exact renames decided during implementation).
- Remove `js/firebase-config.js` entirely.
- `index.html`: remove the Firebase SDK `<script>` tags and any Firebase-related UI panels/buttons.
- `js/main.js`: remove the `initializeFirebase` auto-init call; adjust startup sequence to await the manifest fetch before rendering the set list.

## MCP server (`mcp-server/`)

A separate Node.js project living in `mcp-server/` inside this repo (own `package.json`, dependency `@modelcontextprotocol/sdk`), run locally by the user and registered in Claude Desktop's config (stdio transport, launched as `node mcp-server/index.js` with cwd at the repo root or resolving `questions/` via a path relative to the server file — decided during implementation).

Tools exposed:

| Tool | Purpose |
|---|---|
| `list_question_sets` | Read `manifest.json`, return set metadata |
| `get_question_set` | Read and return one full set (by id) |
| `create_question_set` | Create a new set file + manifest entry |
| `delete_question_set` | Delete a set file + manifest entry |
| `add_question` | Append a question to a set, update manifest `questionCount`/`updatedAt` |
| `update_question` | Edit a question at a given index within a set |
| `delete_question` | Remove a question at a given index within a set |
| `publish` | `git add questions/`, `git commit -m <message>`, `git pull --rebase origin main`, `git push origin main` |

Validation: every write validates the question shape (`word`, `romaji`, `translation`, `q`, `a` as a 4-element array, `c` in `0..3`, `ex`) and rejects malformed input with a clear error message returned to Claude, before touching disk.

`publish` behavior:
- Runs `git status --porcelain -- questions/` first; only proceeds if there are changes under `questions/` (refuses if unrelated files are also dirty, to avoid accidentally bundling unrelated work into the commit — reports back to Claude what's dirty so it can ask the user).
- Commits only `questions/`, pulls with rebase, pushes to `main` directly (confirmed acceptable — single-owner repo).
- Surfaces git errors (merge conflict, push rejected, no remote auth) back to Claude as tool errors rather than swallowing them.

## Testing / verification plan

- Manual: serve the site locally (`python -m http.server`), verify the set picker loads from `questions/manifest.json` and each of the 6 game modes (quiz/listen/flash/match/type/write) still plays correctly using a fetched set.
- Existing `tests/run-all.js` Node test scripts: update/remove any tests that assumed `jq_question_sets` localStorage content or Firebase; add coverage for the new manifest/fetch loading path where feasible under the existing plain-Node test style.
- MCP server: a small Node smoke-test script that imports the server's tool handlers directly (not through a live Claude Desktop session) and exercises create → add_question → update_question → delete_question → delete_question_set, plus a dry-run check of `publish`'s git-status guard (without actually pushing during automated tests).

## Migration/removal checklist

- Delete: `js/firebase-config.js`, Firebase `<script>` tags in `index.html`, Firestore code paths in `js/data-manager.js`, `jq_firebase_config` and `jq_question_sets` handling in `js/storage.js`, hardcoded `SAMPLE_DATA` in `js/data.js` (after migrating its content to `questions/*.json`).
- Add: `questions/manifest.json` + set JSON files, `mcp-server/` project, set-picker fetch logic in the game.
- Update: `README.md` to describe the new `questions/` folder and MCP-based authoring workflow instead of Firebase/import UI.
