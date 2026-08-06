# Category-Filtered Menu + Grammar Sentence Builder — Design

## Problem

Today every question set uses one schema (vocabulary reading-quiz) and the main menu always
shows all 6 games regardless of which set is active. There is no way to add a fundamentally
different kind of content (grammar) without either forcing it into the vocab schema or showing
game buttons that don't make sense for it (e.g. "Falling Words" typing romaji for a grammar
pattern).

## Goals

1. Question sets declare a `category`: `"vocabulary"` or `"grammar"`.
2. The main menu shows only the games compatible with the active set's category.
3. A new game, **Sentence Builder** (grammar scramble), is added for `"grammar"` sets.
4. Two pre-existing gaps found during codebase review are fixed alongside this work:
   - The "per-game priority settings" modal (`game-priority-modal`) has no button anywhere that
     opens it — dead UI advertised in the README but unreachable.
   - `API-Japanese-Learning-Mini-Game.md` describes a Firebase API and localStorage keys that no
     longer exist in the codebase (leftover from before the file-based + MCP architecture).

## Non-goals

- No drag-and-drop *from* the shuffled pool into arbitrary answer-row positions — only
  tap-to-append and reorder-within-answer-row via drag.
- No distractor (wrong) chunks in the sentence-builder puzzles.
- No AI-generated bulk grammar content — a small (~12-15 question) hand-authored sample set only.
- No changes to the existing vocabulary question schema or its 6 games' mechanics.
- No cleanup of the 18 stale/unarchived OpenSpec proposals — flagged in review, out of scope here.

## Data model

### `questions/manifest.json`

Each entry in `sets` gains a `category` field:

```json
{ "id": "n5-core", "file": "n5-core.json", "name": "N5 Core Vocabulary", "category": "vocabulary", "questionCount": 400, "updatedAt": "..." }
```

Missing `category` (any pre-existing entry) is treated as `"vocabulary"` by every reader — no
forced file migration, just a fallback (`entry.category || 'vocabulary'`) everywhere it's read.
The two existing sets (`n5-core`, `n4-kanji`) get `"category": "vocabulary"` written explicitly
for clarity.

### Set file top-level `category`

Mirrors manifest (same duplication pattern as `name`/`description` today):

```json
{ "id": "n5-grammar", "name": "N5 Grammar Basics", "category": "grammar", "description": "...", "questions": [...] }
```

### Grammar question shape (new, alongside the existing vocabulary shape)

```json
{
  "sentence": "私は学生です",
  "chunks": ["私", "は", "学生", "です"],
  "translation": "Tôi là học sinh",
  "ex": "は đánh dấu chủ đề câu"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `sentence` | string | yes | Full correct sentence, for record-keeping/id hashing |
| `chunks` | string[] | yes, length ≥ 2 | Ordered pieces; concatenation must equal `sentence` |
| `translation` | string | yes | Vietnamese meaning |
| `ex` | string | no | Grammar-point explanation shown after answering |

No `word`/`romaji`/`q`/`a`/`c`/`aTranslation` — this is a distinct shape, not an extension of the
vocab one.

### `mcp-server/src/questions-repo.js`

- `validateQuestion(question, category)` gains a `category` parameter (default `'vocabulary'`
  for backward compatibility with existing callers/tests). When `category === 'grammar'`,
  validates the grammar shape described above instead of the vocab `QUESTION_FIELDS` list.
- `createQuestionSet({ id, name, description, category = 'vocabulary', questions })` accepts and
  persists `category` into both the manifest entry and the set file.
- `addQuestion`, `updateQuestion`, `patchQuestion` read the target set's `category` from its file
  (`readSetFile(entry.file).category || 'vocabulary'`) before validating, so callers don't need to
  pass it explicitly.
- MCP tool schemas (wherever `createQuestionSet`/`addQuestion` are exposed as MCP tools) add an
  optional `category` enum param.

## Menu filtering

### Compatibility table (`js/main.js`)

```js
const GAME_CATEGORY_COMPAT = {
  quiz: ['vocabulary'], listen: ['vocabulary'], type: ['vocabulary'],
  match: ['vocabulary'], flash: ['vocabulary'], write: ['vocabulary'],
  grammar: ['grammar']
};
```

### `updateMenuUI()` (`js/main.js:135`)

Adds: look up the active set's category (`questionSets.find(s => s.id === activeSetId)?.category
|| 'vocabulary'`), then for each `.menu-btn.btn-*` whose game key has a `GAME_CATEGORY_COMPAT`
entry, toggle a `hidden` class based on whether the active category is in that game's list.
`btn-stats`, `btn-settings`, `btn-data` are never toggled — they aren't tied to a category.

This function already runs on `showScreen('screen-menu')` and after `switchQuestionSet()`, so no
new call sites are needed.

### `index.html`

New menu button (same markup pattern as the existing 6):

```html
<button class="menu-btn btn-grammar" onclick="startGame('grammar')">
  <span class="btn-icon">🧩</span>
  <span class="btn-text">SENTENCE BUILDER<br><small>Arrange the grammar</small></span>
  <span class="btn-arrow">▶</span>
</button>
```

New screen `screen-grammar` (HUD: HP bar, score, combo, progress counter, timer — same layout
pattern as `screen-listen`), plus its game-over sub-view, following the existing per-game screen
structure.

## Sentence Builder game (`js/games/game-grammar.js`, `css/game-grammar.css`)

### Deck & prioritization

`startGrammar()` calls `getPrioritizedDeck(questions, 'grammar')` — the existing smart
prioritization system (cooldowns, priority weights, stats) works unmodified once
`generateQuestionId` is fixed (see below), because it's already generic over question shape.

### Rendering & interaction

- Each `chunks` array is shuffled with the existing `shuffle()` util and rendered as a row of
  chip buttons ("pool").
- Tap a pool chip → moves it to the end of the "answer row". Tap an answer-row chip → returns it
  to the pool (removed from answer row, chips re-flow).
- Once the answer row holds as many chips as `chunks.length`, auto-check.
- **Reordering**: chips already in the answer row can be dragged to swap position, implemented
  with pointer events (`pointerdown`/`pointermove`/`pointerup` + `setPointerCapture`) rather than
  the native HTML5 Drag-and-Drop API, so the same code path handles mouse and touch. Reordering
  never touches the pool — only reorders the answer-row array, then re-renders it.

### Scoring & feedback

- Correct: `score += Math.floor(BASE_XP_REWARD * Math.max(1, combo) * 1.5)` (same multiplier as
  Listening), `combo++`, `playerEXP += points`, show `ex`, `updateQuestionStats(id, 'grammar',
  true, responseTime)`.
- Incorrect: HP -20 unless `settings.disableGameOver`, `combo = 0`, reveal the correct chunk order
  inline, show `ex`, shake animation, `updateQuestionStats(id, 'grammar', false, responseTime)`.
- Timer: reuses `settings.quizTimerEnabled` / `settings.quizTimeLimit` (no new setting). Timeout
  is treated as a wrong answer, mirroring `handleListenTimeout`.
- HP ≤ 0 → game-over modal (score, correct/wrong) via `gameOver(...)`, matching every other game.
- Deck exhausted → `gameOver(...)`, `saveToStorage()`, `recordPlayTime()`, return to
  `screen-menu` — mirrors `listenComplete()`.

### Resume support

`game-grammar.js` implements `saveGrammarResumeState`/`loadGrammarResumeState`/
`clearGrammarResumeState`/`resumeGrammarFromState`, storing `deck`, `idx`, `hp`, `score`, `combo`,
`correct`, `wrong`, and the player's in-progress answer-row order — same validation pattern
(`version`, `type`, `activeSetId` match) as `createQuizResumeState`/`loadQuizResumeState`.

These four hook into the existing central dispatchers in `js/games/game-quiz.js`
(`saveGameResumeState`, `loadGameResumeState`, `clearGameResumeState`, `resumeGameFromState`) by
adding one `if (type === 'grammar' && ...)` branch to each, following the exact pattern the other
5 games use.

`js/main.js` additions: `startFreshGame` gets `if (type === 'grammar') startGrammar();`,
`getGameResumeLabel` gets `grammar: 'Sentence Builder'`, `getCurrentResumeGameType` gets
`'screen-grammar': 'grammar'`.

## Existing-code changes required (impact-checked)

- **`generateQuestionId(q)`** (`js/game-utils.js:9`, 9 callers, no covering tests): currently
  hardcodes `q.word`/`q.q`/`q.romaji`, which are absent on grammar questions and would collapse
  every grammar question's hash to the same `"undefined||undefined||undefined||..."` prefix.
  Fix: `` `${q.word ?? q.sentence ?? ''}||${q.q ?? ''}||${q.romaji ?? ''}||${q.translation || ''}` ``.
  Purely additive — behavior for existing vocabulary questions (which always have `word`/`q`)
  is unchanged. Covered by a new unit test (grammar-shaped input produces a stable, distinct id).
- **`openGamePrioritySettings(gameType)` titles map** (`js/settings.js:155`): add
  `grammar: '🧩 Sentence Builder'`.
- **Dead-code fix**: add a "⚙️ Game Settings" trigger button to each of the 6 existing menu-btn
  game rows' settings-screen equivalent AND the new grammar one, wired to
  `openGamePrioritySettings('<type>')`. (Exact placement: settings screen currently has no
  per-game list container — one will be added, iterating a `GAME_TYPES` array that includes
  `grammar`, rendering one row + button per game that opens the existing modal.)

## Documentation updates

`API-Japanese-Learning-Mini-Game.md` is rewritten to match actual code:
- Remove the entire "Firebase API" section and `jq_firebase_config` storage key (no such code
  exists).
- Fix the `QuestionSet Object` / Storage API sections to reflect the real manifest+fetch model
  (`questions/manifest.json`, `fetchQuestionSetFile`, no `jq_question_sets` localStorage key).
- Add the Grammar Question object shape and the `category` field to `QuestionSet Object`.
- Add `grammar` to the `Game Types` table and to `updateQuestionStats` game-type list.

`README.md` gains the 7th game to its feature table and a short "Question Set Categories"
subsection explaining `vocabulary` vs `grammar` and which games each category unlocks.

## Testing

- `mcp-server/test`: extend `questions-repo.test.js` with grammar-category validation
  (accepts valid grammar question, rejects missing `chunks`/mismatched `sentence`), and a
  `createQuestionSet` category round-trip test.
- `tests/`: new `game-utils.test.js` case for `generateQuestionId` on grammar-shaped input; new
  test verifying `updateMenuUI` hides/shows the right buttons for each category (can follow the
  existing DOM-less test harness pattern used by `main-utils.test.js`).
- Manual smoke test via the dev server: switch between a vocabulary set and the new grammar set,
  confirm menu buttons swap correctly; play Sentence Builder to completion and through a
  wrong-answer path; verify resume-after-exit works mid-sentence.

## Risks / open questions resolved during brainstorming

- Category → game compatibility is a static code table, not per-set curation — simplest model,
  matches the "one schema per category" design (resolved: recommended option chosen).
- Interaction is tap-to-order as the source of truth, drag only reorders what's already placed
  (resolved: user asked for "both", this is the least-duplicated-logic way to give both).
- No distractor chunks (resolved: simpler authoring, user chose this explicitly).
