# Per-Answer Translations (`aTranslation`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `aTranslation` field (4 Vietnamese meanings, parallel to the 4 entries in `a`) to the question schema, and reveal all 4 after the player answers a quiz question — without requiring any change to the 643 existing questions.

**Architecture:** Add the field as fully optional at every layer that touches the question schema (repo validation, MCP Zod schema, client answer-shuffling, client rendering). Each layer falls back to "do nothing new" when the field is absent, so old data and old behavior are untouched.

**Tech Stack:** Node.js (ESM) for `mcp-server/`, plain browser JS (`js/`) for the game client, `node:assert`-based test files run via `node test/run-all.js` (mcp-server) and `node tests/run-all.js` (root).

## Global Constraints

- `aTranslation`, when present, must be an array of exactly 4 non-empty strings, positionally parallel to `a` (from spec `docs/superpowers/specs/2026-07-31-answer-translations-design.md`).
- The field is optional everywhere — no backfill of existing 643 questions.
- No change to `translation`, `ex`, or anything feeding `generateQuestionId` (`word`, `q`, `romaji`, `translation`).
- Translations must render only after the player answers, one per choice button, in the same shuffled order as the buttons.

---

### Task 1: Backend schema validation (`questions-repo.js`)

**Files:**
- Modify: `mcp-server/src/questions-repo.js:4-26`
- Test: `mcp-server/test/questions-repo.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `validateQuestion(question)` now accepts an optional `question.aTranslation: string[4]` and returns an error string mentioning `aTranslation` when it's present but malformed. `QUESTION_FIELDS` now includes `'aTranslation'` so it isn't rejected as unexpected.

- [ ] **Step 1: Write the failing tests**

Add to `mcp-server/test/questions-repo.test.js`, right after `testValidateQuestionRejectsOutOfRangeCorrectIndex`:

```js
function testValidateQuestionAcceptsValidATranslation() {
  const withTranslations = { ...sampleQuestion, aTranslation: ['Học sinh', 'sai 1', 'sai 2', 'sai 3'] };
  assert.strictEqual(validateQuestion(withTranslations), null);
}

function testValidateQuestionRejectsWrongLengthATranslation() {
  const bad = { ...sampleQuestion, aTranslation: ['only', 'two'] };
  assert.match(validateQuestion(bad), /aTranslation.*exactly 4 non-empty strings/);
}

function testValidateQuestionRejectsEmptyStringInATranslation() {
  const bad = { ...sampleQuestion, aTranslation: ['ok', '', 'ok', 'ok'] };
  assert.match(validateQuestion(bad), /aTranslation.*exactly 4 non-empty strings/);
}
```

And register the calls near the bottom of the file, right after `testValidateQuestionRejectsOutOfRangeCorrectIndex();`:

```js
testValidateQuestionAcceptsValidATranslation();
testValidateQuestionRejectsWrongLengthATranslation();
testValidateQuestionRejectsEmptyStringInATranslation();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mcp-server && node test/questions-repo.test.js`
Expected: `testValidateQuestionAcceptsValidATranslation` throws `AssertionError` (because `validateQuestion` currently returns an "unexpected fields: aTranslation" error instead of `null`).

- [ ] **Step 3: Implement the schema change**

In `mcp-server/src/questions-repo.js`, replace lines 4-26 with:

```js
const QUESTION_FIELDS = ['word', 'romaji', 'translation', 'q', 'a', 'c', 'ex', 'aTranslation'];

export function validateQuestion(question) {
  if (!question || typeof question !== 'object') {
    return 'Question must be an object';
  }
  for (const field of ['word', 'romaji', 'translation', 'q', 'ex']) {
    if (typeof question[field] !== 'string' || question[field].length === 0) {
      return `Question field "${field}" must be a non-empty string`;
    }
  }
  if (!Array.isArray(question.a) || question.a.length !== 4 || question.a.some(opt => typeof opt !== 'string')) {
    return 'Question field "a" must be an array of exactly 4 strings';
  }
  if (!Number.isInteger(question.c) || question.c < 0 || question.c > 3) {
    return 'Question field "c" must be an integer between 0 and 3';
  }
  if (question.aTranslation !== undefined) {
    const at = question.aTranslation;
    if (!Array.isArray(at) || at.length !== 4 || at.some(opt => typeof opt !== 'string' || opt.length === 0)) {
      return 'Question field "aTranslation" must be an array of exactly 4 non-empty strings';
    }
  }
  const extraFields = Object.keys(question).filter(k => !QUESTION_FIELDS.includes(k));
  if (extraFields.length > 0) {
    return `Question has unexpected fields: ${extraFields.join(', ')}`;
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mcp-server && node test/questions-repo.test.js`
Expected: `questions-repo tests passed` printed, exit code 0.

- [ ] **Step 5: Run the full mcp-server test suite**

Run: `cd mcp-server && npm test`
Expected: all test files pass, ending with `4 test files passed` (or however many `.test.js` files currently exist in `mcp-server/test/`).

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/questions-repo.js mcp-server/test/questions-repo.test.js
git commit -m "feat: accept optional aTranslation field in question validation"
```

---

### Task 2: MCP tool schema (`index.js`)

**Files:**
- Modify: `mcp-server/src/index.js:15-23`
- Test: `mcp-server/test/mcp-server.smoke.test.js`

**Interfaces:**
- Consumes: `validateQuestion` from Task 1 (already accepts `aTranslation`).
- Produces: `questionShape.aTranslation: z.array(z.string().min(1)).length(4).optional()`, automatically applied to `create_question_set`, `add_question`, `update_question`, and `patch_question` since they all derive from `questionShape`.

- [ ] **Step 1: Write the failing test**

In `mcp-server/test/mcp-server.smoke.test.js`, insert this block right after the existing `afterPatch`/`afterPatchQuestions` assertions (after the line `assert.strictEqual(afterPatchQuestions[0].word, 'b');`) and before the existing `badQuestion` block:

```js
  const addedWithTranslations = await client.callTool({
    name: 'add_question',
    arguments: {
      setId: 'new-set',
      question: {
        word: 'c', romaji: 'c', translation: 'c', q: 'c?',
        a: ['1', '2', '3', '4'], aTranslation: ['one', 'two', 'three', 'four'], c: 0, ex: 'ex'
      }
    }
  });
  assert.strictEqual(JSON.parse(addedWithTranslations.content[0].text).index, 1);

  const afterAddWithTranslations = await client.callTool({ name: 'get_question_set', arguments: { id: 'new-set' } });
  const questionsAfterAdd = JSON.parse(afterAddWithTranslations.content[0].text).questions;
  assert.deepStrictEqual(questionsAfterAdd[1].aTranslation, ['one', 'two', 'three', 'four']);

  const badTranslationLength = await client.callTool({
    name: 'add_question',
    arguments: {
      setId: 'new-set',
      question: {
        word: 'd', romaji: 'd', translation: 'd', q: 'd?',
        a: ['1', '2', '3', '4'], aTranslation: ['only', 'two'], c: 0, ex: 'ex'
      }
    }
  });
  assert.strictEqual(badTranslationLength.isError, true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp-server && node test/mcp-server.smoke.test.js`
Expected: fails at `assert.deepStrictEqual(questionsAfterAdd[1].aTranslation, ['one', 'two', 'three', 'four'])` with actual value `undefined`. `add_question`'s input schema (`index.js:103`, `z.object(questionShape)`) is not `.strict()`, so today `aTranslation` is silently stripped as an unrecognized key instead of erroring — the question gets added, just without that field. (The next assertion, `badTranslationLength.isError === true`, would also fail for the same reason: the malformed field is stripped rather than rejected — but the test never reaches it because the earlier assertion throws first.)

- [ ] **Step 3: Implement the schema change**

In `mcp-server/src/index.js`, replace lines 15-23:

```js
const questionShape = {
  word: z.string().min(1),
  romaji: z.string().min(1),
  translation: z.string().min(1),
  q: z.string().min(1),
  a: z.array(z.string()).length(4),
  c: z.number().int().min(0).max(3),
  ex: z.string().min(1),
  aTranslation: z.array(z.string().min(1)).length(4).optional()
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mcp-server && node test/mcp-server.smoke.test.js`
Expected: `mcp server smoke test passed` printed, exit code 0.

- [ ] **Step 5: Run the full mcp-server test suite**

Run: `cd mcp-server && npm test`
Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/index.js mcp-server/test/mcp-server.smoke.test.js
git commit -m "feat: allow aTranslation in MCP question tools (add/update/patch/create)"
```

---

### Task 3: Carry translations through answer shuffling (`game-utils.js`)

**Files:**
- Modify: `js/game-utils.js:385-397`
- Test: `tests/game-utils.test.js`

**Interfaces:**
- Consumes: `q.aTranslation` (optional array of 4 strings, from a question object — no import needed, same file scope).
- Produces: `shuffleAnswerOptions(q)` now returns `{ options, correctIndex, translations }` where `translations` is either an array of 4 strings in the same order as `options`, or `null` when `q.aTranslation` is absent. Existing callers (`game-quiz.js`, `game-listen.js`) that only destructure `{ options, correctIndex }` are unaffected — the extra `translations` property is additive.

- [ ] **Step 1: Write the failing tests**

Add to `tests/game-utils.test.js`, right after `testShuffleAnswerOptionsKeepsCorrectAnswerMapping`:

```js
function testShuffleAnswerOptionsCarriesTranslationsThroughSamePermutation() {
  const context = createContext();
  const question = sampleQuestion({ c: 1, aTranslation: ['A', 'B', 'C', 'D'] });

  const shuffled = context.shuffleAnswerOptions(question);
  assert.deepStrictEqual(shuffled.translations, ['D', 'C', 'B', 'A']);
  assert.strictEqual(shuffled.translations[shuffled.correctIndex], 'B');

  context.settings.shuffleAnswers = false;
  const original = context.shuffleAnswerOptions(question);
  assert.deepStrictEqual(original.translations, question.aTranslation);
}

function testShuffleAnswerOptionsReturnsNullTranslationsWhenAbsent() {
  const context = createContext();
  const question = sampleQuestion({ c: 0 });

  assert.strictEqual(context.shuffleAnswerOptions(question).translations, null);

  context.settings.shuffleAnswers = false;
  assert.strictEqual(context.shuffleAnswerOptions(question).translations, null);
}
```

Register the calls near the bottom, right after `testShuffleAnswerOptionsKeepsCorrectAnswerMapping();`:

```js
testShuffleAnswerOptionsCarriesTranslationsThroughSamePermutation();
testShuffleAnswerOptionsReturnsNullTranslationsWhenAbsent();
```

(These tests rely on the file's existing `createContext()` mock, which overrides `shuffle(arr)` as `arr.reverse()` — a deterministic, non-random stand-in for the real Fisher-Yates `shuffle` in `js/main.js`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/game-utils.test.js`
Expected: `AssertionError` — `shuffled.translations` is `undefined`, not `['D', 'C', 'B', 'A']`.

- [ ] **Step 3: Implement the change**

In `js/game-utils.js`, replace lines 385-397 (the `shuffleAnswerOptions` function):

```js
/* ── SHUFFLE ANSWER OPTIONS ── */
function shuffleAnswerOptions(q) {
  if (!settings.shuffleAnswers) {
    return {
      options: [...q.a],
      correctIndex: q.c,
      translations: q.aTranslation ? [...q.aTranslation] : null
    };
  }

  const indexed = q.a.map((ans, i) => ({
    text: ans,
    translation: q.aTranslation ? q.aTranslation[i] : undefined,
    wasCorrect: i === q.c
  }));
  const shuffled = shuffle(indexed);
  const options = shuffled.map(item => item.text);
  const correctIndex = shuffled.findIndex(item => item.wasCorrect);
  const translations = q.aTranslation ? shuffled.map(item => item.translation) : null;

  return { options, correctIndex, translations };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/game-utils.test.js`
Expected: `game-utils tests passed` printed, exit code 0.

- [ ] **Step 5: Run the full root test suite**

Run: `node tests/run-all.js`
Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add js/game-utils.js tests/game-utils.test.js
git commit -m "feat: carry per-answer translations through shuffleAnswerOptions"
```

---

### Task 4: Reveal translations under each choice button (`game-quiz.js` + CSS)

**Files:**
- Modify: `js/games/game-quiz.js:199-206` (renderQuiz), `js/games/game-quiz.js:209-214` (answerQuiz)
- Modify: `css/game-quiz.css` (add `.choice-translation` rule)

**Interfaces:**
- Consumes: `shuffleAnswerOptions(q)` from Task 3, specifically the new `translations` field.
- Produces: no new exported interface — this is the leaf UI consumer.

There is no automated test for this task (no existing DOM/browser test harness for `game-quiz.js` in this repo — its tests, e.g. `tests/quiz-resume.test.js`, cover state/storage logic, not rendering). Verify manually per Step 4.

- [ ] **Step 1: Update `renderQuiz` to stash translations on each button**

In `js/games/game-quiz.js`, replace lines 199-206:

```js
  const { options, correctIndex, translations } = shuffleAnswerOptions(q);
  options.forEach((ans, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = ans;
    if (translations && translations[i]) {
      btn.dataset.translation = translations[i];
    }
    btn.onclick = () => answerQuiz(i, btn, q, correctIndex);
    grid.appendChild(btn);
  });
```

- [ ] **Step 2: Update `answerQuiz` to reveal the stashed translation on every button**

In `js/games/game-quiz.js`, replace line 214 (`allBtns.forEach(b => b.disabled = true);`) with:

```js
  allBtns.forEach(b => {
    b.disabled = true;
    if (b.dataset.translation) {
      const translationEl = document.createElement('span');
      translationEl.className = 'choice-translation';
      translationEl.textContent = b.dataset.translation;
      b.appendChild(translationEl);
    }
  });
```

- [ ] **Step 3: Add the CSS rule**

In `css/game-quiz.css`, insert this rule right after `.choice-btn:disabled { cursor: default; }` (currently line 47):

```css
.choice-translation {
  display: block;
  margin-top: 4px;
  font-family: var(--font-px);
  font-size: 10px;
  color: var(--text-dim);
}
```

- [ ] **Step 4: Manually verify in the browser**

1. Serve the repo root with a static file server (e.g. `npx serve .` or any local HTTP server) and open the game in a browser — opening `index.html` via `file://` may block `fetch()` calls the game uses to load `questions/manifest.json`, so use `http://`.
2. Open browser devtools console and run:
   ```js
   questions[0].aTranslation = ['Học sinh', 'không có nghĩa', 'không có nghĩa', 'không có nghĩa'];
   ```
   (adjust the index to match whichever question is about to appear, or just patch every loaded question in a loop: `questions.forEach(q => q.aTranslation = ['t1','t2','t3','t4']);` before starting a quiz).
3. Start a Quiz game, answer the seeded question. Confirm all 4 choice buttons show a small Vietnamese line under their Japanese text after answering, and that the line under each button matches that button's own answer (not the correct answer's meaning) — check this explicitly with `settings.shuffleAnswers` both `true` and `false` (toggle in Settings).
4. Answer a different question that was **not** patched with `aTranslation`. Confirm the screen looks identical to current production behavior — no extra lines, no layout shift, no console errors.

- [ ] **Step 5: Commit**

```bash
git add js/games/game-quiz.js css/game-quiz.css
git commit -m "feat: reveal per-answer translations under quiz choice buttons after answering"
```

---

### Task 5: Guard the real question data files against malformed `aTranslation`

**Files:**
- Modify: `tests/questions-data.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: an extra assertion so that if `aTranslation` is later added to `questions/n5-core.json` or `questions/n4-kanji.json` (e.g. via `patch_question`), a malformed value fails CI immediately instead of silently reaching the client.

- [ ] **Step 1: Write the failing test (temporarily, by hand)**

This test can't "fail first" in the usual TDD sense because no real question currently has `aTranslation` — there's nothing to violate the assertion yet. Instead, confirm the assertion logic is correct by temporarily adding a malformed question to a copy of the check and running it standalone, then add the real assertion into the test file directly.

In `tests/questions-data.test.js`, inside `testEveryQuestionHasRequiredShape`'s `set.questions.forEach((q, i) => { ... })` callback, add after the existing `c` assertion:

```js
      if (q.aTranslation !== undefined) {
        assert.ok(
          Array.isArray(q.aTranslation) && q.aTranslation.length === 4 &&
          q.aTranslation.every(t => typeof t === 'string' && t.length > 0),
          `${entry.id}[${i}].aTranslation must be an array of exactly 4 non-empty strings when present`
        );
      }
```

- [ ] **Step 2: Run the test to verify it still passes on current data**

Run: `node tests/questions-data.test.js`
Expected: `questions data tests passed` — since no current question has `aTranslation`, the new `if` block never triggers, and this proves the guard doesn't break the 643 existing questions.

- [ ] **Step 3: Run the full root test suite**

Run: `node tests/run-all.js`
Expected: all test files pass.

- [ ] **Step 4: Commit**

```bash
git add tests/questions-data.test.js
git commit -m "test: validate aTranslation shape when present in real question data"
```
