# search_questions + patch_question MCP Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `search_questions` (find a question by keyword, across one or all sets) and `patch_question` (atomically update only specific fields of one or more questions) to the `mcp-server` MCP server, without changing any existing tool's behavior.

**Architecture:** Two pure functions (`searchQuestions`, `patchQuestion`) added to `mcp-server/src/questions-repo.js`, exercised directly by unit tests. Two new `server.registerTool(...)` calls added to `mcp-server/src/index.js` following the exact `guarded(...)` pattern already used for every other tool, exercised end-to-end by the existing MCP client smoke test.

**Tech Stack:** Node.js (ESM), `@modelcontextprotocol/sdk`, `zod`, Node's built-in `node:assert` + `node:test`-free custom test runner (`mcp-server/test/run-all.js`).

## Global Constraints

- Do not modify the behavior/contract of any existing tool: `list_question_sets`, `get_question_set`, `create_question_set`, `delete_question_set`, `add_question`, `update_question`, `delete_question`, `publish`.
- `patch_question` must be atomic: if any patch in a batch is invalid, nothing is written to disk (verify by re-reading the file after the throw).
- Match rules for `search_questions`: case-insensitive substring match against `word`, `romaji`, `translation`, `q`, `ex`, and every element of `a`.
- `patch_question` field updates must reuse the existing `validateQuestion` function from `mcp-server/src/questions-repo.js` — do not duplicate its validation rules.
- Follow the existing code style in `mcp-server/src/*.js` and `mcp-server/test/*.js` exactly (plain functions, no test framework, `assert` from `node:assert`, temp dirs via `fs.mkdtempSync`).
- Spec reference: `docs/superpowers/specs/2026-07-30-question-search-and-patch-tools-design.md`

---

### Task 1: `searchQuestions` in `questions-repo.js`

**Files:**
- Modify: `mcp-server/src/questions-repo.js`
- Test: `mcp-server/test/questions-repo.test.js`

**Interfaces:**
- Produces: `searchQuestions(keyword: string, setId?: string) => Array<{ setId: string, index: number, question: object }>`. Throws `Error` with message `Question set not found: <setId>` if `setId` is given and doesn't exist in the manifest. Returns `[]` if nothing matches. Exported from `questions-repo.js` alongside the other repo functions.

- [ ] **Step 1: Write the failing tests**

Add these functions to `mcp-server/test/questions-repo.test.js`, just before the existing `testValidateQuestionAcceptsWellFormedQuestion();` call line (i.e. above the block of test invocations at the bottom of the file):

```javascript
function testSearchQuestionsMatchesWordAndAnswerChoice() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', questions: [sampleQuestion] });

  const byWord = repo.searchQuestions('学生');
  assert.strictEqual(byWord.length, 1);
  assert.strictEqual(byWord[0].setId, 'demo');
  assert.strictEqual(byWord[0].index, 0);
  assert.strictEqual(byWord[0].question.word, '学生');

  const byAnswerChoice = repo.searchQuestions('がっせい');
  assert.strictEqual(byAnswerChoice.length, 1);
  assert.strictEqual(byAnswerChoice[0].index, 0);
}

function testSearchQuestionsIsCaseInsensitiveOnTranslation() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', questions: [sampleQuestion] });

  const results = repo.searchQuestions('STUDENT');
  assert.strictEqual(results.length, 1);
}

function testSearchQuestionsScopedToSetIdVsAcrossAllSets() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'set-a', name: 'Set A', questions: [sampleQuestion] });
  repo.createQuestionSet({
    id: 'set-b', name: 'Set B',
    questions: [{ ...sampleQuestion, word: '先生', translation: 'Teacher' }]
  });

  const onlyA = repo.searchQuestions('Student', 'set-a');
  assert.strictEqual(onlyA.length, 1);
  assert.strictEqual(onlyA[0].setId, 'set-a');

  const acrossAll = repo.searchQuestions('e'); // "Student" and "Teacher" both contain "e"
  assert.strictEqual(acrossAll.length, 2);
  const setIds = acrossAll.map(r => r.setId).sort();
  assert.deepStrictEqual(setIds, ['set-a', 'set-b']);
}

function testSearchQuestionsErrorsOnUnknownSetId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  assert.throws(() => repo.searchQuestions('Student', 'nope'), /Question set not found: nope/);
}

function testSearchQuestionsReturnsEmptyArrayForNoMatch() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', questions: [sampleQuestion] });
  assert.deepStrictEqual(repo.searchQuestions('zzz-no-match'), []);
}
```

Then add calls to these five functions in the invocation block at the bottom of the file (after `testDeleteQuestionSetRemovesFileAndManifestEntry();`):

```javascript
testSearchQuestionsMatchesWordAndAnswerChoice();
testSearchQuestionsIsCaseInsensitiveOnTranslation();
testSearchQuestionsScopedToSetIdVsAcrossAllSets();
testSearchQuestionsErrorsOnUnknownSetId();
testSearchQuestionsReturnsEmptyArrayForNoMatch();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mcp-server && node test/questions-repo.test.js`
Expected: `TypeError: repo.searchQuestions is not a function` (or similar) — `searchQuestions` doesn't exist yet.

- [ ] **Step 3: Implement `searchQuestions`**

In `mcp-server/src/questions-repo.js`, add this function inside `createQuestionsRepo(baseDir)`, after `deleteQuestion` and before the `return { ... }` block:

```javascript
  function searchQuestions(keyword, setId) {
    const needle = keyword.toLowerCase();
    const manifest = readManifest();
    let entries;
    if (setId) {
      const entry = findEntry(manifest, setId);
      if (!entry) throw new Error(`Question set not found: ${setId}`);
      entries = [entry];
    } else {
      entries = manifest.sets;
    }
    const results = [];
    for (const entry of entries) {
      const set = readSetFile(entry.file);
      set.questions.forEach((question, index) => {
        const haystack = [question.word, question.romaji, question.translation, question.q, question.ex, ...question.a]
          .join('\n')
          .toLowerCase();
        if (haystack.includes(needle)) {
          results.push({ setId: entry.id, index, question });
        }
      });
    }
    return results;
  }
```

Then add `searchQuestions` to the returned object at the bottom of `createQuestionsRepo`:

```javascript
  return {
    listQuestionSets,
    getQuestionSet,
    createQuestionSet,
    deleteQuestionSet,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    searchQuestions
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mcp-server && node test/questions-repo.test.js`
Expected: `questions-repo tests passed` printed, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/questions-repo.js mcp-server/test/questions-repo.test.js
git commit -m "Add searchQuestions to questions-repo for keyword lookup across sets"
```

---

### Task 2: `patchQuestion` in `questions-repo.js`

**Files:**
- Modify: `mcp-server/src/questions-repo.js`
- Test: `mcp-server/test/questions-repo.test.js`

**Interfaces:**
- Consumes: `validateQuestion(question)` (already defined in this file) — returns `null` if valid, an error string otherwise.
- Produces: `patchQuestion(setId: string, patches: Array<{ index: number, fields: object }>) => number[]` (the patched indexes, in input order). Throws `Error` with message `Question set not found: <setId>` if the set doesn't exist. Throws `Error` with message `Question index out of range: <index>` if any patch's index is invalid. Throws `Error` with message `Patch for index <index>: <validateQuestion message>` if merging a patch's `fields` onto the existing question produces an invalid question. On any throw, the set file on disk must be unchanged (no partial writes). Exported from `questions-repo.js`.

- [ ] **Step 1: Write the failing tests**

Add these functions to `mcp-server/test/questions-repo.test.js`, right after the `searchQuestions` test functions from Task 1:

```javascript
function testPatchQuestionUpdatesOnlyGivenFields() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', questions: [sampleQuestion] });

  const result = repo.patchQuestion('demo', [{ index: 0, fields: { translation: 'Changed' } }]);
  assert.deepStrictEqual(result, [0]);

  const question = repo.getQuestionSet('demo').questions[0];
  assert.strictEqual(question.translation, 'Changed');
  assert.strictEqual(question.word, sampleQuestion.word);
  assert.strictEqual(question.q, sampleQuestion.q);
}

function testPatchQuestionAppliesMultiplePatchesInOneCall() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({
    id: 'demo', name: 'Demo',
    questions: [sampleQuestion, { ...sampleQuestion, word: '先生', translation: 'Teacher' }]
  });

  const result = repo.patchQuestion('demo', [
    { index: 0, fields: { translation: 'Student (changed)' } },
    { index: 1, fields: { translation: 'Teacher (changed)' } }
  ]);
  assert.deepStrictEqual(result, [0, 1]);

  const questions = repo.getQuestionSet('demo').questions;
  assert.strictEqual(questions[0].translation, 'Student (changed)');
  assert.strictEqual(questions[1].translation, 'Teacher (changed)');
}

function testPatchQuestionIsAtomicOnInvalidIndex() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', questions: [sampleQuestion] });

  assert.throws(
    () => repo.patchQuestion('demo', [
      { index: 0, fields: { translation: 'Should not stick' } },
      { index: 5, fields: { translation: 'Out of range' } }
    ]),
    /Question index out of range: 5/
  );

  const question = repo.getQuestionSet('demo').questions[0];
  assert.strictEqual(question.translation, sampleQuestion.translation);
}

function testPatchQuestionRejectsUnknownField() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', questions: [sampleQuestion] });

  assert.throws(
    () => repo.patchQuestion('demo', [{ index: 0, fields: { bogus: 'nope' } }]),
    /unexpected fields/
  );
  assert.strictEqual(repo.getQuestionSet('demo').questions[0].translation, sampleQuestion.translation);
}

function testPatchQuestionRejectsOutOfRangeCorrectIndexField() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', questions: [sampleQuestion] });

  assert.throws(
    () => repo.patchQuestion('demo', [{ index: 0, fields: { c: 4 } }]),
    /between 0 and 3/
  );
}

function testPatchQuestionErrorsOnUnknownSetId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  assert.throws(
    () => repo.patchQuestion('nope', [{ index: 0, fields: { translation: 'x' } }]),
    /Question set not found: nope/
  );
}
```

Add calls to all six functions in the invocation block at the bottom of the file, after the Task 1 test calls:

```javascript
testPatchQuestionUpdatesOnlyGivenFields();
testPatchQuestionAppliesMultiplePatchesInOneCall();
testPatchQuestionIsAtomicOnInvalidIndex();
testPatchQuestionRejectsUnknownField();
testPatchQuestionRejectsOutOfRangeCorrectIndexField();
testPatchQuestionErrorsOnUnknownSetId();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mcp-server && node test/questions-repo.test.js`
Expected: `TypeError: repo.patchQuestion is not a function` (or similar).

- [ ] **Step 3: Implement `patchQuestion`**

In `mcp-server/src/questions-repo.js`, add this function inside `createQuestionsRepo(baseDir)`, right after the `searchQuestions` function added in Task 1:

```javascript
  function patchQuestion(setId, patches) {
    const manifest = readManifest();
    const entry = findEntry(manifest, setId);
    if (!entry) throw new Error(`Question set not found: ${setId}`);
    const set = readSetFile(entry.file);

    const merged = patches.map(({ index, fields }) => {
      if (index < 0 || index >= set.questions.length) throw new Error(`Question index out of range: ${index}`);
      const question = { ...set.questions[index], ...fields };
      const error = validateQuestion(question);
      if (error) throw new Error(`Patch for index ${index}: ${error}`);
      return { index, question };
    });

    merged.forEach(({ index, question }) => {
      set.questions[index] = question;
    });
    set.updatedAt = new Date().toISOString();
    writeSetFile(entry.file, set);
    updateManifestEntry(manifest, setId, set);
    writeManifest(manifest);
    return merged.map(m => m.index);
  }
```

Then add `patchQuestion` to the returned object at the bottom of `createQuestionsRepo`:

```javascript
  return {
    listQuestionSets,
    getQuestionSet,
    createQuestionSet,
    deleteQuestionSet,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    searchQuestions,
    patchQuestion
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mcp-server && node test/questions-repo.test.js`
Expected: `questions-repo tests passed` printed, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/questions-repo.js mcp-server/test/questions-repo.test.js
git commit -m "Add patchQuestion to questions-repo for atomic partial question updates"
```

---

### Task 3: Register `search_questions` and `patch_question` tools, smoke test, README

**Files:**
- Modify: `mcp-server/src/index.js`
- Modify: `mcp-server/test/mcp-server.smoke.test.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: `repo.searchQuestions(keyword, setId)` and `repo.patchQuestion(setId, patches)` from Task 1/Task 2. `questionShape` (already defined in `index.js`) and the `guarded(fn)` wrapper (already defined in `index.js`).
- Produces: two new MCP tools, `search_questions` and `patch_question`, callable via `client.callTool({ name, arguments })` exactly like the existing tools.

- [ ] **Step 1: Write the failing smoke test additions**

In `mcp-server/test/mcp-server.smoke.test.js`, insert this block right after the existing `update_question` assertion (after the line `assert.strictEqual(JSON.parse(updated.content[0].text).updated, 0);`) and before the existing `badQuestion` block:

```javascript
  const searched = await client.callTool({ name: 'search_questions', arguments: { keyword: 'b?' } });
  const searchResults = JSON.parse(searched.content[0].text);
  assert.strictEqual(searchResults.length, 1);
  assert.strictEqual(searchResults[0].setId, 'new-set');
  assert.strictEqual(searchResults[0].index, 0);

  const patched = await client.callTool({
    name: 'patch_question',
    arguments: { setId: 'new-set', patches: [{ index: 0, fields: { translation: 'Patched' } }] }
  });
  assert.deepStrictEqual(JSON.parse(patched.content[0].text).updated, [0]);

  const afterPatch = await client.callTool({ name: 'get_question_set', arguments: { id: 'new-set' } });
  const afterPatchQuestions = JSON.parse(afterPatch.content[0].text).questions;
  assert.strictEqual(afterPatchQuestions[0].translation, 'Patched');
  assert.strictEqual(afterPatchQuestions[0].word, 'b');
```

(The existing `badQuestion`/`deletedQ`/`deletedSet`/`finalList` assertions after this block are unchanged and still valid: `new-set` still has exactly one question, at index 0, after the patch.)

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `cd mcp-server && node test/mcp-server.smoke.test.js`
Expected: fails with an MCP "unknown tool" / "Method not found" error for `search_questions` (tool not registered yet).

- [ ] **Step 3: Register the two tools in `index.js`**

In `mcp-server/src/index.js`, add this block right after the existing `get_question_set` registration (after its closing `);` around line 55) and before `create_question_set`:

```javascript
server.registerTool(
  'search_questions',
  {
    title: 'Search questions',
    description: 'Find questions by keyword across one or all question sets, matching word/romaji/translation/q/ex and answer choices',
    inputSchema: { keyword: z.string().min(1), setId: z.string().optional() }
  },
  guarded(({ keyword, setId }) => repo.searchQuestions(keyword, setId))
);
```

Then, just above the `questionShape` declaration near the top of the file, add the reusable partial-fields schema used by `patch_question`:

```javascript
const questionPatchFieldsShape = z.object(questionShape).partial().strict()
  .refine(fields => Object.keys(fields).length > 0, { message: 'fields must include at least one field to update' });
```

(This must come after `questionShape` is declared, so place it directly below the `questionShape` object's closing `};`.)

Then add the `patch_question` registration right after the existing `update_question` registration (after its closing `);` around line 102) and before `delete_question`:

```javascript
server.registerTool(
  'patch_question',
  {
    title: 'Patch question(s)',
    description: 'Update only the given fields of one or more questions in a set, atomically — either every patch applies or none are written',
    inputSchema: {
      setId: z.string(),
      patches: z.array(z.object({
        index: z.number().int().min(0),
        fields: questionPatchFieldsShape
      })).min(1)
    }
  },
  guarded(({ setId, patches }) => ({ updated: repo.patchQuestion(setId, patches) }))
);
```

- [ ] **Step 4: Run the smoke test to verify it passes**

Run: `cd mcp-server && node test/mcp-server.smoke.test.js`
Expected: `mcp server smoke test passed` printed, exit code 0.

- [ ] **Step 5: Run the full test suite**

Run: `cd mcp-server && npm test`
Expected: all test files pass, ending with `3 test files passed` (or however many `.test.js` files exist), exit code 0.

- [ ] **Step 6: Update README**

In `README.md`, replace this sentence (around line 162):

```markdown
Ask Claude to create/edit question sets — it has tools to list, create, and delete sets, and to add, update, or delete individual questions. Ask Claude to **publish** when you're ready — it commits the changes under `questions/` and pushes to `main`, which GitHub Pages redeploys automatically.
```

with:

```markdown
Ask Claude to create/edit question sets — it has tools to list, create, and delete sets, and to add, update, or delete individual questions. To change just a few questions in a large set, ask Claude to **search** for the question by keyword (`search_questions`, matches word/romaji/translation/question text/explanation/answer choices) and **patch** only the fields that need to change (`patch_question`) instead of resending the whole question or recreating the set. Ask Claude to **publish** when you're ready — it commits the changes under `questions/` and pushes to `main`, which GitHub Pages redeploys automatically.
```

- [ ] **Step 7: Commit**

```bash
git add mcp-server/src/index.js mcp-server/test/mcp-server.smoke.test.js README.md
git commit -m "Register search_questions and patch_question MCP tools"
```

---

## Self-Review Notes

- **Spec coverage:** `search_questions` (input schema, cross-field match, setId scoping, output shape) → Task 1 + Task 3. `patch_question` (partial fields, atomic batch, validation reuse) → Task 2 + Task 3. Testing section of the spec (search hits/misses/scoping/unknown-set, patch partial/multi/atomic/reject-unknown-field/reject-invalid-value) → Task 1 and Task 2 unit tests. Smoke test tool list → Task 3. README mention → Task 3.
- **No existing tool's behavior changes** — verified no edits to `list_question_sets`, `get_question_set`, `create_question_set`, `delete_question_set`, `add_question`, `update_question`, `delete_question`, or `publish` registrations or their underlying repo functions.
- **Type/signature consistency:** `searchQuestions(keyword, setId)` and `patchQuestion(setId, patches)` signatures match between Task 1/2 (repo layer) and Task 3 (tool layer call sites). `patches[].fields` uses the same 7-field shape (`word, romaji, translation, q, a, c, ex`) as `questionShape` throughout.
