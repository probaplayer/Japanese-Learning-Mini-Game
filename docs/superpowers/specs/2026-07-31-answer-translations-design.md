# Design: per-answer translations (`aTranslation`)

## Problem

Quiz questions currently expose only one Vietnamese meaning per question — the
question-level `translation` field (the meaning of `word`). The 4 multiple-choice
options in `a` (some of which are decoy/incorrect readings or words) have no
translation of their own. After answering, the player only sees `ex` (a free-text
explanation) and, on a wrong answer, the meaning of the *correct* word via the
practice-writing button — never the meaning of the other 3 options they were
choosing between.

The user wants to add per-answer meanings that reveal after the player picks an
answer, without breaking any of the 643 existing questions across the two current
sets (`n5-core`, `n4-kanji`).

## Goals

- Add an optional field carrying one Vietnamese translation per entry in `a`.
- Reveal all 4 translations, one under each choice button, after the player answers
  (correct or wrong) — not before.
- Existing questions (no such field) continue to work exactly as today: nothing new
  renders for them.
- Keep the change backward-compatible everywhere the question schema is enforced:
  `mcp-server/src/questions-repo.js` (`validateQuestion`), `mcp-server/src/index.js`
  (Zod `questionShape`, used by `create_question_set`, `add_question`,
  `update_question`, `patch_question`), and the quiz UI.

## Non-goals

- No backfill of `aTranslation` for the 643 existing questions — the field is
  optional and can be added incrementally (e.g. via `patch_question`) later.
- No change to `translation` (question-level meaning) or `ex` semantics.
- No change to how `word`/`q`/`romaji`/`translation` feed `generateQuestionId` —
  question identity and stored per-question stats are unaffected.

## Design

### Schema

New optional field `aTranslation`: an array of exactly 4 non-empty strings,
positionally parallel to `a` — `aTranslation[i]` is the Vietnamese meaning of
`a[i]`, including decoy/incorrect options (author writes a short gloss like
"(từ không có nghĩa)" for nonsense decoys rather than leaving them blank).

```json
{
  "word": "学生",
  "romaji": "がくせい",
  "translation": "Học sinh",
  "q": "Cách đọc của '学生' là gì?",
  "a": ["がくせい", "がくぜい", "がっせい", "かくせい"],
  "aTranslation": ["Học sinh", "(từ không có nghĩa)", "(từ không có nghĩa)", "(từ không có nghĩa)"],
  "c": 0,
  "ex": "学生 (Học sinh). Học (学) + Sinh (生)."
}
```

When present, `aTranslation` must have the same length as `a` (4) and every
element must be a non-empty string. When absent, the question is unchanged from
today's schema and behaves identically.

### Validation (`mcp-server/src/questions-repo.js`)

- Add `'aTranslation'` to `QUESTION_FIELDS` so it isn't rejected as an unexpected
  field.
- In `validateQuestion()`: only if `question.aTranslation !== undefined`, check it's
  an array of exactly 4 non-empty strings (same shape check as `a`, mirrored). Skip
  the check entirely when the field is absent — this is what makes the field
  optional and existing questions valid with no changes.

### MCP tool schema (`mcp-server/src/index.js`)

- Add `aTranslation: z.array(z.string().min(1)).length(4).optional()` to
  `questionShape`. Because `questionPatchFieldsShape` is derived from
  `questionShape` via `.partial().strict()`, this automatically extends
  `create_question_set`, `add_question`, `update_question`, and `patch_question`
  with no separate changes needed.

### Shuffle (`js/game-utils.js`)

`shuffleAnswerOptions(q)` (line ~386) currently shuffles `a` and recomputes
`correctIndex`. Extend it to also carry `aTranslation` through the same
permutation:

- If `!settings.shuffleAnswers`: return `{ options: [...q.a], correctIndex: q.c,
  translations: q.aTranslation ? [...q.aTranslation] : null }`.
- If shuffling: index `{ text, translation, wasCorrect }` triples (pairing
  `q.a[i]` with `q.aTranslation?.[i]`), shuffle together, derive `options`,
  `correctIndex`, and `translations` (an array of the shuffled translations, or
  `null` if `q.aTranslation` was absent) from the same shuffled array — guaranteeing
  `translations[i]` always describes `options[i]`.

### UI (`js/games/game-quiz.js`)

- `renderQuiz()`: destructure `translations` from `shuffleAnswerOptions(q)` (in
  addition to today's `options`, `correctIndex`). While building each choice button,
  stash `translations?.[i]` on the button (e.g. `btn.dataset.translation`) but do
  **not** render it yet — buttons show only the answer text before the player picks,
  same as today.
- `answerQuiz()`: after the existing `allBtns.forEach(b => b.disabled = true)`, if
  `translations` is non-null, append a small secondary line (e.g.
  `<span class="choice-translation">`) under each button's existing text showing
  that button's stashed translation. If `translations` is null (question has no
  `aTranslation`), skip this entirely — output is byte-for-byte the same as before
  this change.
- No change to the `ex` explanation box, scoring, HP, or combo logic.

### Backward compatibility

Every layer treats `aTranslation`/`translations` as optional and falls back to
"do nothing new" when absent:
- JSON: field can be omitted; existing 643 questions need no edits.
- `validateQuestion`: skips the check when absent.
- Zod `questionShape`: `.optional()`.
- `shuffleAnswerOptions`: returns `translations: null` when `q.aTranslation` is
  absent.
- UI: renders nothing extra when `translations` is null.

## Testing

- `mcp-server/test/questions-repo.test.js`: `validateQuestion` accepts a question
  with a valid 4-element `aTranslation`, accepts a question with no `aTranslation`
  (unchanged existing case), and rejects `aTranslation` with the wrong length or a
  non-string/empty element.
- Manual UI check: play a quiz question seeded with `aTranslation` — confirm all 4
  translation lines appear under the correct buttons after answering, both with
  `settings.shuffleAnswers` on and off. Play an existing question with no
  `aTranslation` — confirm the screen looks identical to current behavior.

## Files touched

- `mcp-server/src/questions-repo.js` — extend `QUESTION_FIELDS` and
  `validateQuestion`.
- `mcp-server/src/index.js` — extend `questionShape`.
- `js/game-utils.js` — extend `shuffleAnswerOptions`.
- `js/games/game-quiz.js` — extend `renderQuiz` and `answerQuiz`.
- `mcp-server/test/questions-repo.test.js` — new validation test cases.
