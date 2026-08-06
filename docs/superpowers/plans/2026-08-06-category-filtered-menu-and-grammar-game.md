# Category-Filtered Menu + Grammar Sentence Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `category` (`vocabulary`/`grammar`) to question sets, filter the main menu to only show games compatible with the active set's category, and ship a 7th game — Sentence Builder — for grammar sets, while fixing two dead-code/doc gaps found in review.

**Architecture:** `category` flows from `questions/manifest.json` → `js/storage.js` `questionSets` → a static `GAME_CATEGORY_COMPAT` lookup table in `js/game-utils.js` that `updateMenuUI()` consults to toggle menu button visibility. The new game (`js/games/game-grammar.js`) follows the exact same single-question-per-render + HP/score/combo/timer + resume-state pattern as `js/games/game-listen.js`, wired into the existing central dispatchers in `js/games/game-quiz.js`. The MCP server (`mcp-server/src/questions-repo.js`) becomes category-aware so grammar question sets can be authored the same way vocabulary ones are today.

**Tech Stack:** Vanilla HTML/CSS/JS (no build step), Node's built-in `assert`/`vm` test harness, MCP SDK + Zod on the server side.

## Global Constraints

- No build step — every JS file is loaded via a plain `<script src="...">` tag in `index.html`; all functions are globals.
- `generateQuestionId`, `getPrioritizedDeck`, `updateQuestionStats`, and all localStorage-backed resume/stats functions must keep working unmodified for the 6 existing vocabulary games — every change to shared code must be additive/backward-compatible.
- Test files are plain Node scripts (no test runner framework) that `assert()` and `console.log(...)` on success; both `tests/run-all.js` and `mcp-server/test/run-all.js` auto-discover every `*.test.js` file in their directory — no manual registration needed.
- Follow existing code style: no semicolons omitted, 2-space indent, `function` declarations (not arrow functions) for top-level game logic, template literals for DOM text.
- Grammar questions never gain `word`/`romaji`/`q`/`a`/`c`/`aTranslation` fields — they are a distinct shape (`sentence`, `chunks`, `translation`, `ex`), not an extension of the vocabulary shape.

---

### Task 1: MCP repo — category-aware question validation

**Files:**
- Modify: `mcp-server/src/questions-repo.js`
- Test: `mcp-server/test/questions-repo.test.js`

**Interfaces:**
- Produces: `validateQuestion(question, category = 'vocabulary')` (signature change — now takes a second param), `createQuestionSet({ id, name, description, category = 'vocabulary', questions })` (persists `category` into manifest entry and set file).

- [ ] **Step 1: Write the failing tests**

Add to `mcp-server/test/questions-repo.test.js` (near the other `testValidateQuestion*` functions):

```javascript
const sampleGrammarQuestion = {
  sentence: '私は学生です',
  chunks: ['私', 'は', '学生', 'です'],
  translation: 'Tôi là học sinh',
  ex: 'は đánh dấu chủ đề câu'
};

function testValidateQuestionAcceptsWellFormedGrammarQuestion() {
  assert.strictEqual(validateQuestion(sampleGrammarQuestion, 'grammar'), null);
}

function testValidateQuestionRejectsGrammarQuestionMissingChunks() {
  const bad = { ...sampleGrammarQuestion, chunks: undefined };
  assert.match(validateQuestion(bad, 'grammar'), /chunks/);
}

function testValidateQuestionRejectsGrammarQuestionWithTooFewChunks() {
  const bad = { ...sampleGrammarQuestion, chunks: ['私'] };
  assert.match(validateQuestion(bad, 'grammar'), /at least 2/);
}

function testValidateQuestionRejectsGrammarQuestionWhereChunksDontMatchSentence() {
  const bad = { ...sampleGrammarQuestion, chunks: ['私', 'は', '先生', 'です'] };
  assert.match(validateQuestion(bad, 'grammar'), /chunks.*must concatenate to sentence/);
}

function testValidateQuestionRejectsGrammarQuestionMissingTranslation() {
  const bad = { ...sampleGrammarQuestion, translation: '' };
  assert.match(validateQuestion(bad, 'grammar'), /translation/);
}

function testValidateQuestionGrammarExIsOptional() {
  const { ex, ...withoutEx } = sampleGrammarQuestion;
  assert.strictEqual(validateQuestion(withoutEx, 'grammar'), null);
}

function testCreateQuestionSetPersistsCategoryToManifestAndFile() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  const created = repo.createQuestionSet({ name: 'N5 Grammar', category: 'grammar', questions: [sampleGrammarQuestion] });
  assert.strictEqual(created.category, 'grammar');

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.sets[0].category, 'grammar');
}

function testCreateQuestionSetDefaultsCategoryToVocabulary() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  const created = repo.createQuestionSet({ name: 'Plain Set' });
  assert.strictEqual(created.category, 'vocabulary');
}

function testAddQuestionValidatesAgainstSetsOwnCategory() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo-grammar', name: 'Demo Grammar', category: 'grammar' });

  const index = repo.addQuestion('demo-grammar', sampleGrammarQuestion);
  assert.strictEqual(index, 0);
  assert.throws(() => repo.addQuestion('demo-grammar', sampleQuestion), /chunks/);
}
```

Add these calls to the bottom invocation block (right before `console.log('questions-repo tests passed');`):

```javascript
testValidateQuestionAcceptsWellFormedGrammarQuestion();
testValidateQuestionRejectsGrammarQuestionMissingChunks();
testValidateQuestionRejectsGrammarQuestionWithTooFewChunks();
testValidateQuestionRejectsGrammarQuestionWhereChunksDontMatchSentence();
testValidateQuestionRejectsGrammarQuestionMissingTranslation();
testValidateQuestionGrammarExIsOptional();
testCreateQuestionSetPersistsCategoryToManifestAndFile();
testCreateQuestionSetDefaultsCategoryToVocabulary();
testAddQuestionValidatesAgainstSetsOwnCategory();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mcp-server && node test/questions-repo.test.js`
Expected: FAIL — `validateQuestion` doesn't accept a second argument yet, `createQuestionSet` doesn't persist `category`.

- [ ] **Step 3: Implement `validateQuestion` category branching**

In `mcp-server/src/questions-repo.js`, replace the `validateQuestion` function (currently lines 6-32) with:

```javascript
function validateVocabularyQuestion(question) {
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

function validateGrammarQuestion(question) {
  if (typeof question.sentence !== 'string' || question.sentence.length === 0) {
    return 'Question field "sentence" must be a non-empty string';
  }
  if (!Array.isArray(question.chunks) || question.chunks.length < 2 || question.chunks.some(c => typeof c !== 'string' || c.length === 0)) {
    return 'Question field "chunks" must be an array of at least 2 non-empty strings';
  }
  if (question.chunks.join('') !== question.sentence) {
    return 'Question field "chunks" must concatenate to sentence';
  }
  if (typeof question.translation !== 'string' || question.translation.length === 0) {
    return 'Question field "translation" must be a non-empty string';
  }
  if (question.ex !== undefined && (typeof question.ex !== 'string' || question.ex.length === 0)) {
    return 'Question field "ex" must be a non-empty string when present';
  }
  const extraFields = Object.keys(question).filter(k => !GRAMMAR_QUESTION_FIELDS.includes(k));
  if (extraFields.length > 0) {
    return `Question has unexpected fields: ${extraFields.join(', ')}`;
  }
  return null;
}

export function validateQuestion(question, category = 'vocabulary') {
  if (!question || typeof question !== 'object') {
    return 'Question must be an object';
  }
  return category === 'grammar' ? validateGrammarQuestion(question) : validateVocabularyQuestion(question);
}
```

Add the new field whitelist constant right next to `QUESTION_FIELDS` (line 4):

```javascript
const QUESTION_FIELDS = ['word', 'romaji', 'translation', 'q', 'a', 'c', 'ex', 'aTranslation'];
const GRAMMAR_QUESTION_FIELDS = ['sentence', 'chunks', 'translation', 'ex'];
```

- [ ] **Step 4: Thread `category` through `createQuestionSet`, `addQuestion`, `updateQuestion`, `patchQuestion`**

Replace `createQuestionSet` (currently lines 79-95) with:

```javascript
  function createQuestionSet({ id, name, description = '', category = 'vocabulary', questions = [] }) {
    const manifest = readManifest();
    const setId = id ? slugify(id) : slugify(name);
    if (!setId) throw new Error('Could not derive a valid id from the provided name/id');
    if (findEntry(manifest, setId)) throw new Error(`Question set id already exists: ${setId}`);
    for (const q of questions) {
      const error = validateQuestion(q, category);
      if (error) throw new Error(error);
    }
    const now = new Date().toISOString();
    const file = `${setId}.json`;
    const set = { id: setId, name, description, category, createdAt: now, updatedAt: now, questions };
    writeSetFile(file, set);
    manifest.sets.push({ id: setId, file, name, category, questionCount: questions.length, updatedAt: now });
    writeManifest(manifest);
    return set;
  }
```

Replace `addQuestion` (currently lines 114-127) with:

```javascript
  function addQuestion(setId, question) {
    const manifest = readManifest();
    const entry = findEntry(manifest, setId);
    if (!entry) throw new Error(`Question set not found: ${setId}`);
    const set = readSetFile(entry.file);
    const error = validateQuestion(question, set.category || 'vocabulary');
    if (error) throw new Error(error);
    set.questions.push(question);
    set.updatedAt = new Date().toISOString();
    writeSetFile(entry.file, set);
    updateManifestEntry(manifest, setId, set);
    writeManifest(manifest);
    return set.questions.length - 1;
  }
```

Replace `updateQuestion` (currently lines 129-142) with:

```javascript
  function updateQuestion(setId, index, question) {
    const manifest = readManifest();
    const entry = findEntry(manifest, setId);
    if (!entry) throw new Error(`Question set not found: ${setId}`);
    const set = readSetFile(entry.file);
    const error = validateQuestion(question, set.category || 'vocabulary');
    if (error) throw new Error(error);
    if (index < 0 || index >= set.questions.length) throw new Error(`Question index out of range: ${index}`);
    set.questions[index] = question;
    set.updatedAt = new Date().toISOString();
    writeSetFile(entry.file, set);
    updateManifestEntry(manifest, setId, set);
    writeManifest(manifest);
  }
```

In `patchQuestion` (currently lines 185-207), change the per-patch validation line from
`const error = validateQuestion(question);` to `const error = validateQuestion(question, set.category || 'vocabulary');`
— it's inside the `merged = patches.map(...)` callback, right after `const question = { ...set.questions[index], ...fields };`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd mcp-server && node test/questions-repo.test.js`
Expected: PASS — `26 test files passed` style final line unaffected, all assertions green.

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/questions-repo.js mcp-server/test/questions-repo.test.js
git commit -m "feat(mcp): validate grammar question shape and persist set category"
```

---

### Task 2: MCP tool schemas — expose `category` and grammar question shape

**Files:**
- Modify: `mcp-server/src/index.js`
- Test: `mcp-server/test/mcp-server.smoke.test.js`

**Interfaces:**
- Consumes: `repo.createQuestionSet`, `repo.addQuestion`, `repo.updateQuestion` from Task 1 (already category-aware).
- Produces: `create_question_set` tool now accepts `category`; `add_question`/`update_question` accept either vocabulary or grammar question shape.

- [ ] **Step 1: Write the failing test**

Add to `mcp-server/test/mcp-server.smoke.test.js`, right before `await client.close();`:

```javascript
  const createdGrammarSet = await client.callTool({
    name: 'create_question_set',
    arguments: { name: 'Grammar Set', category: 'grammar', questions: [] }
  });
  const grammarSet = JSON.parse(createdGrammarSet.content[0].text);
  assert.strictEqual(grammarSet.category, 'grammar');

  const addedGrammarQuestion = await client.callTool({
    name: 'add_question',
    arguments: {
      setId: 'grammar-set',
      question: { sentence: '私は学生です', chunks: ['私', 'は', '学生', 'です'], translation: 'Tôi là học sinh', ex: 'は đánh dấu chủ đề' }
    }
  });
  assert.strictEqual(JSON.parse(addedGrammarQuestion.content[0].text).index, 0);

  const rejectedVocabQuestionInGrammarSet = await client.callTool({
    name: 'add_question',
    arguments: {
      setId: 'grammar-set',
      question: { word: 'x', romaji: 'x', translation: 'x', q: 'x?', a: ['1', '2', '3', '4'], c: 0, ex: 'ex' }
    }
  });
  assert.strictEqual(rejectedVocabQuestionInGrammarSet.isError, true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp-server && node test/mcp-server.smoke.test.js`
Expected: FAIL — Zod rejects the `category` field on `create_question_set` (unrecognized key) and rejects the grammar-shaped `question` on `add_question` (doesn't match `questionShape`).

- [ ] **Step 3: Update `mcp-server/src/index.js` tool schemas**

Add a grammar question Zod shape right after the existing `questionShape` (currently lines 15-24):

```javascript
const grammarQuestionShape = {
  sentence: z.string().min(1),
  chunks: z.array(z.string().min(1)).min(2),
  translation: z.string().min(1),
  ex: z.string().min(1).optional()
};

const anyQuestionShape = z.union([z.object(questionShape), z.object(grammarQuestionShape)]);
```

Update `create_question_set`'s `inputSchema` (currently lines 80-85):

```javascript
    inputSchema: {
      id: z.string().optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(['vocabulary', 'grammar']).optional(),
      questions: z.array(anyQuestionShape).optional()
    }
```

Update `add_question`'s `inputSchema` (currently line 104):

```javascript
    inputSchema: { setId: z.string(), question: anyQuestionShape }
```

Update `update_question`'s `inputSchema` (currently line 114):

```javascript
    inputSchema: { setId: z.string(), index: z.number().int().min(0), question: anyQuestionShape }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mcp-server && node test/mcp-server.smoke.test.js`
Expected: PASS — `mcp server smoke test passed`.

- [ ] **Step 5: Run the full mcp-server suite**

Run: `cd mcp-server && npm test`
Expected: `3 test files passed`.

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/index.js mcp-server/test/mcp-server.smoke.test.js
git commit -m "feat(mcp): expose category and grammar question shape on MCP tools"
```

---

### Task 3: Sample data — tag existing sets, add the N5 grammar set

**Files:**
- Modify: `questions/manifest.json`, `questions/n5-core.json`, `questions/n4-kanji.json`
- Create: `questions/n5-grammar.json`
- Modify: `tests/questions-data.test.js`

**Interfaces:**
- Produces: `questions/n5-grammar.json` with `category: "grammar"` and 12 grammar questions matching the shape from Task 1.

- [ ] **Step 1: Write the failing test**

Add to `tests/questions-data.test.js`, right after `testEveryQuestionHasRequiredShape`:

```javascript
function testEveryManifestEntryHasAKnownCategory() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  manifest.sets.forEach(entry => {
    assert.ok(['vocabulary', 'grammar'].includes(entry.category), `${entry.id}.category must be vocabulary or grammar`);
    const set = JSON.parse(fs.readFileSync(path.join(questionsDir, entry.file), 'utf8'));
    assert.strictEqual(set.category, entry.category, `${entry.id}: set file category must match manifest`);
  });
}

function testGrammarQuestionsHaveChunksMatchingSentence() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  manifest.sets.filter(entry => entry.category === 'grammar').forEach(entry => {
    const set = JSON.parse(fs.readFileSync(path.join(questionsDir, entry.file), 'utf8'));
    set.questions.forEach((q, i) => {
      assert.strictEqual(typeof q.sentence, 'string', `${entry.id}[${i}].sentence`);
      assert.ok(Array.isArray(q.chunks) && q.chunks.length >= 2, `${entry.id}[${i}].chunks`);
      assert.strictEqual(q.chunks.join(''), q.sentence, `${entry.id}[${i}] chunks must concatenate to sentence`);
      assert.strictEqual(typeof q.translation, 'string', `${entry.id}[${i}].translation`);
    });
  });
}
```

Add the calls at the bottom, before `console.log('questions data tests passed');`:

```javascript
testEveryManifestEntryHasAKnownCategory();
testGrammarQuestionsHaveChunksMatchingSentence();
```

Also guard `testEveryQuestionHasRequiredShape` so it only checks the vocabulary shape for vocabulary sets — wrap its body:

```javascript
function testEveryQuestionHasRequiredShape() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  manifest.sets.filter(entry => entry.category !== 'grammar').forEach(entry => {
    const set = JSON.parse(fs.readFileSync(path.join(questionsDir, entry.file), 'utf8'));
    set.questions.forEach((q, i) => {
      assert.strictEqual(typeof q.word, 'string', `${entry.id}[${i}].word`);
      assert.strictEqual(typeof q.romaji, 'string', `${entry.id}[${i}].romaji`);
      assert.strictEqual(typeof q.translation, 'string', `${entry.id}[${i}].translation`);
      assert.strictEqual(typeof q.q, 'string', `${entry.id}[${i}].q`);
      assert.ok(Array.isArray(q.a) && q.a.length === 4, `${entry.id}[${i}].a`);
      assert.ok(Number.isInteger(q.c) && q.c >= 0 && q.c <= 3, `${entry.id}[${i}].c`);
      if (q.aTranslation !== undefined) {
        assert.ok(
          Array.isArray(q.aTranslation) && q.aTranslation.length === 4 &&
          q.aTranslation.every(t => typeof t === 'string' && t.length > 0),
          `${entry.id}[${i}].aTranslation must be an array of exactly 4 non-empty strings when present`
        );
      }
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/questions-data.test.js`
Expected: FAIL — `manifest.sets[0].category` is `undefined`, not one of `['vocabulary', 'grammar']`.

- [ ] **Step 3: Add `category` to the two existing sets**

In `questions/manifest.json`, add `"category": "vocabulary"` to both entries (after `"name"`):

```json
{
  "sets": [
    {
      "id": "n5-core",
      "file": "n5-core.json",
      "name": "N5 Core Vocabulary",
      "category": "vocabulary",
      "questionCount": 400,
      "updatedAt": "2026-07-28T08:59:46.370Z"
    },
    {
      "id": "n4-kanji",
      "file": "n4-kanji.json",
      "name": "Từ vựng N4",
      "category": "vocabulary",
      "questionCount": 243,
      "updatedAt": "2026-07-31T04:24:53.033Z"
    },
    {
      "id": "n5-grammar",
      "file": "n5-grammar.json",
      "name": "N5 Grammar Basics",
      "category": "grammar",
      "questionCount": 12,
      "updatedAt": "2026-08-06T00:00:00.000Z"
    }
  ]
}
```

In `questions/n5-core.json`, add `"category": "vocabulary",` right after the `"name"` line (currently line 3, before `"description"`). In `questions/n4-kanji.json`, add the same line right after its `"name"` field. (Both files keep their existing `questions` arrays untouched — this is a single added top-level key.)

- [ ] **Step 4: Create the sample grammar set**

Create `questions/n5-grammar.json`:

```json
{
  "id": "n5-grammar",
  "name": "N5 Grammar Basics",
  "category": "grammar",
  "description": "12 câu mẫu ngữ pháp N5 cơ bản: trợ từ は/を/に/で, ~ている, ~たい, ~ことができる.",
  "createdAt": "2026-08-06T00:00:00.000Z",
  "updatedAt": "2026-08-06T00:00:00.000Z",
  "questions": [
    { "sentence": "私は学生です", "chunks": ["私", "は", "学生", "です"], "translation": "Tôi là học sinh", "ex": "は đánh dấu chủ đề của câu" },
    { "sentence": "私は水を飲みます", "chunks": ["私", "は", "水", "を", "飲みます"], "translation": "Tôi uống nước", "ex": "を đánh dấu đối tượng chịu tác động của động từ" },
    { "sentence": "学校に行きます", "chunks": ["学校", "に", "行きます"], "translation": "Tôi đi đến trường", "ex": "に đánh dấu điểm đến của chuyển động" },
    { "sentence": "図書館で勉強します", "chunks": ["図書館", "で", "勉強します"], "translation": "Tôi học ở thư viện", "ex": "で đánh dấu địa điểm diễn ra hành động" },
    { "sentence": "テレビを見ています", "chunks": ["テレビ", "を", "見て", "います"], "translation": "Tôi đang xem TV", "ex": "~ている diễn tả hành động đang diễn ra" },
    { "sentence": "日本語を勉強しています", "chunks": ["日本語", "を", "勉強して", "います"], "translation": "Tôi đang học tiếng Nhật", "ex": "~ている diễn tả hành động đang diễn ra" },
    { "sentence": "寿司を食べたいです", "chunks": ["寿司", "を", "食べたい", "です"], "translation": "Tôi muốn ăn sushi", "ex": "~たい diễn tả mong muốn của người nói" },
    { "sentence": "日本に行きたいです", "chunks": ["日本", "に", "行きたい", "です"], "translation": "Tôi muốn đi Nhật Bản", "ex": "~たい diễn tả mong muốn của người nói" },
    { "sentence": "漢字を読むことができます", "chunks": ["漢字", "を", "読む", "ことができます"], "translation": "Tôi có thể đọc chữ Kanji", "ex": "~ことができる diễn tả khả năng làm việc gì" },
    { "sentence": "車を運転することができます", "chunks": ["車", "を", "運転する", "ことができます"], "translation": "Tôi có thể lái xe", "ex": "~ことができる diễn tả khả năng làm việc gì" },
    { "sentence": "友達と映画を見ました", "chunks": ["友達", "と", "映画", "を", "見ました"], "translation": "Tôi đã xem phim với bạn", "ex": "と đánh dấu người cùng thực hiện hành động" },
    { "sentence": "駅から家まで歩きます", "chunks": ["駅", "から", "家", "まで", "歩きます"], "translation": "Tôi đi bộ từ nhà ga về nhà", "ex": "から/まで đánh dấu điểm bắt đầu/kết thúc" }
  ]
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/questions-data.test.js`
Expected: PASS — `questions data tests passed`.

- [ ] **Step 6: Run the full front-end test suite**

Run: `node tests/run-all.js`
Expected: `11 test files passed` (or `12` if a new file was added by a later task — at this point still 11).

- [ ] **Step 7: Commit**

```bash
git add questions/manifest.json questions/n5-core.json questions/n4-kanji.json questions/n5-grammar.json tests/questions-data.test.js
git commit -m "feat(data): tag existing sets vocabulary, add sample N5 grammar set"
```

---

### Task 4: Core utils — category compatibility table, id-hash fix, stats registries

**Files:**
- Modify: `js/game-utils.js`
- Modify: `js/storage.js`
- Test: `tests/game-utils.test.js`

**Interfaces:**
- Produces: `GAME_CATEGORY_COMPAT` (object), `getVisibleGamesForCategory(category)` (returns `string[]` of game keys), `generateQuestionId(q)` (now grammar-safe).
- Consumes: nothing new — pure additions/fixes to existing functions.

- [ ] **Step 1: Write the failing tests**

Add to `tests/game-utils.test.js`. First, expose the two new symbols in `createContext`'s `vm.runInContext` call — change:

```javascript
this.getConfidenceLevel = getConfidenceLevel;
this.getEffectiveIncorrect = getEffectiveIncorrect;`,
```

to:

```javascript
this.getConfidenceLevel = getConfidenceLevel;
this.getEffectiveIncorrect = getEffectiveIncorrect;
this.getVisibleGamesForCategory = getVisibleGamesForCategory;
this.GAME_CATEGORY_COMPAT = GAME_CATEGORY_COMPAT;`,
```

Then add these test functions (near `testGenerateQuestionIdIsStableAndContentBased`):

```javascript
function testGenerateQuestionIdHandlesGrammarShapedQuestions() {
  const context = createContext();
  const grammarQuestion = { sentence: '私は学生です', chunks: ['私', 'は', '学生', 'です'], translation: 'Tôi là học sinh' };
  const sameQuestion = { ...grammarQuestion };
  const changedQuestion = { ...grammarQuestion, translation: 'Khác' };

  assert.match(context.generateQuestionId(grammarQuestion), /^q-[a-z0-9]+$/);
  assert.strictEqual(context.generateQuestionId(grammarQuestion), context.generateQuestionId(sameQuestion));
  assert.notStrictEqual(context.generateQuestionId(grammarQuestion), context.generateQuestionId(changedQuestion));
}

function testGetVisibleGamesForCategorySeparatesVocabularyAndGrammar() {
  const context = createContext();

  const vocabGames = context.getVisibleGamesForCategory('vocabulary');
  assert.deepStrictEqual([...vocabGames].sort(), ['flash', 'listen', 'match', 'quiz', 'type', 'write']);

  const grammarGames = context.getVisibleGamesForCategory('grammar');
  assert.deepStrictEqual(grammarGames, ['grammar']);
}

function testGetVisibleGamesForCategoryDefaultsUnknownCategoryToVocabulary() {
  const context = createContext();
  assert.deepStrictEqual([...context.getVisibleGamesForCategory(undefined)].sort(), ['flash', 'listen', 'match', 'quiz', 'type', 'write']);
}
```

Add the calls near the bottom:

```javascript
testGenerateQuestionIdHandlesGrammarShapedQuestions();
testGetVisibleGamesForCategorySeparatesVocabularyAndGrammar();
testGetVisibleGamesForCategoryDefaultsUnknownCategoryToVocabulary();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/game-utils.test.js`
Expected: FAIL — `getVisibleGamesForCategory is not a function`, and the grammar `generateQuestionId` call produces `q-` + hash of `"undefined||undefined||undefined||Tôi là học sinh"` for both grammar questions but the *stable/distinct* assertions still happen to pass by luck on content difference — the real failure is `ReferenceError: getVisibleGamesForCategory is not defined` from the `vm.runInContext` exposure line, which fails the whole file before any assertion runs.

- [ ] **Step 3: Fix `generateQuestionId` in `js/game-utils.js`**

Replace line 10:

```javascript
  const str = `${q.word}||${q.q}||${q.romaji}||${q.translation || ''}`;
```

with:

```javascript
  const str = `${q.word ?? q.sentence ?? ''}||${q.q ?? ''}||${q.romaji ?? ''}||${q.translation || ''}`;
```

- [ ] **Step 4: Add `GAME_CATEGORY_COMPAT` and `getVisibleGamesForCategory`**

In `js/game-utils.js`, right after the `LEVEL_XP_CURVE`/`BASE_XP_REWARD` constants (currently lines 5-6), add:

```javascript
const GAME_CATEGORY_COMPAT = {
  quiz: ['vocabulary'],
  listen: ['vocabulary'],
  type: ['vocabulary'],
  match: ['vocabulary'],
  flash: ['vocabulary'],
  write: ['vocabulary'],
  grammar: ['grammar']
};

function getVisibleGamesForCategory(category) {
  const effectiveCategory = category || 'vocabulary';
  return Object.keys(GAME_CATEGORY_COMPAT).filter(game => GAME_CATEGORY_COMPAT[game].includes(effectiveCategory));
}
```

- [ ] **Step 5: Register `grammar` in `computeGameTypeStats`**

In `js/game-utils.js`, in `computeGameTypeStats` (currently line 547), change:

```javascript
  const gameTypes = ['quiz', 'listen', 'flash', 'match', 'type', 'write'];
```

to:

```javascript
  const gameTypes = ['quiz', 'listen', 'flash', 'match', 'type', 'write', 'grammar'];
```

- [ ] **Step 6: Register `grammar` in `js/storage.js`'s `initQuestionStats`**

In `js/storage.js`, in `initQuestionStats` (currently line 242), change:

```javascript
  const gameTypes = ['quiz', 'listen', 'flash', 'match', 'type', 'write'];
```

to:

```javascript
  const gameTypes = ['quiz', 'listen', 'flash', 'match', 'type', 'write', 'grammar'];
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node tests/game-utils.test.js`
Expected: PASS — `game-utils tests passed`.

- [ ] **Step 8: Run the full front-end test suite**

Run: `node tests/run-all.js`
Expected: `11 test files passed`.

- [ ] **Step 9: Commit**

```bash
git add js/game-utils.js js/storage.js tests/game-utils.test.js
git commit -m "feat(core): add category compatibility table, fix id hash for grammar questions"
```

---

### Task 5: Grammar screen markup + styles

**Files:**
- Modify: `index.html`
- Create: `css/game-grammar.css`

**Interfaces:**
- Produces: `#screen-grammar` DOM structure with ids `grammar-score`, `grammar-combo`, `grammar-timer`, `grammar-progress`, `grammar-hpbar`, `grammar-translation`, `grammar-pool`, `grammar-answer-row`, `grammar-explanation`, `grammar-next`, `grammar-gameover`, `grammar-go-score`; menu button `.btn-grammar`; `<link>`/`<script>` tags.

- [ ] **Step 1: Add the menu button**

In `index.html`, inside `<nav class="main-nav">`, right after the `btn-write` button (ends at line 94) and before `btn-stats` (line 95), insert:

```html
          <button class="menu-btn btn-grammar" onclick="startGame('grammar')">
            <span class="btn-icon">🧩</span>
            <span class="btn-text">SENTENCE BUILDER<br><small>Arrange the grammar</small></span>
            <span class="btn-arrow">▶</span>
          </button>
```

- [ ] **Step 2: Add the CSS link and script tag**

In `index.html`'s `<head>`, right after `<link rel="stylesheet" href="css/game-write.css">` (line 17), add:

```html
  <link rel="stylesheet" href="css/game-grammar.css">
```

Right after `<script src="js/games/game-write.js"></script>` (line 663), add:

```html
  <script src="js/games/game-grammar.js"></script>
```

- [ ] **Step 3: Add the `screen-grammar` markup**

In `index.html`, right after the closing `</div>` of `screen-write` (line 580, before the `<!-- PRACTICE WRITING MODAL -->` comment on line 582), insert:

```html
  <!-- GAME 7: GRAMMAR SENTENCE BUILDER -->
  <div id="screen-grammar" class="screen">
    <div class="game-hud">
      <button class="hud-back" onclick="exitGame()">◀</button>
      <div class="hud-title">🧩 SENTENCE BUILDER</div>
      <div class="hud-stats">
        <span>⭐ <span id="grammar-score">0</span></span>
        <span>🔥 x<span id="grammar-combo">0</span></span>
        <span>⏱ <span id="grammar-timer">00</span>s</span>
        <span id="grammar-progress">0 / 0</span>
      </div>
    </div>
    <div class="hp-bar-wrap"><div class="hp-bar-inner" id="grammar-hpbar"></div></div>

    <div class="grammar-container">
      <div class="question-card" id="grammar-translation-card">
        <div id="grammar-translation" class="grammar-translation"></div>
      </div>
      <div class="grammar-answer-row" id="grammar-answer-row"></div>
      <div class="grammar-pool" id="grammar-pool"></div>
      <div class="explanation-box hidden" id="grammar-explanation"></div>
      <button class="next-btn hidden" id="grammar-next" onclick="nextGrammar()">Next ▶</button>
    </div>

    <div class="gameover-overlay hidden" id="grammar-gameover">
      <div class="gameover-box">
        <div class="go-title">GAME OVER</div>
        <div class="go-score">Score: <span id="grammar-go-score">0</span></div>
        <button class="action-btn" onclick="restartGrammar()">▶ RESTART</button>
        <button class="action-btn btn-secondary" onclick="exitGame()">◀ MENU</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 4: Create `css/game-grammar.css`**

```css
/* ================================================
   Grammar Sentence Builder Styles
   ================================================ */

.grammar-container { width: 100%; max-width: 1000px; display: flex; flex-direction: column; gap: 16px; flex: 1; min-height: 0; }

.grammar-translation { font-size: 16px; color: var(--text); text-align: center; }

.grammar-answer-row, .grammar-pool {
  display: flex; flex-wrap: wrap; gap: 8px;
  min-height: 52px;
  padding: 10px;
  border-radius: var(--radius);
}
.grammar-answer-row { border: 2px dashed var(--border); background: rgba(255,255,255,.03); }
.grammar-pool { border: none; }

.grammar-chip { font-family: var(--font-jp); font-size: 18px; padding: 10px 16px; touch-action: none; }
.grammar-chip-placed { cursor: grab; }
.grammar-chip-placed.dragging { opacity: 0.5; cursor: grabbing; }

/* Desktop 150% scale */
@media (min-width: 1024px) {
  .grammar-container { gap: 24px; }
  .grammar-translation { font-size: 24px; }
  .grammar-answer-row, .grammar-pool { min-height: 78px; padding: 15px; gap: 12px; }
  .grammar-chip { font-size: 27px; padding: 15px 24px; }
}
```

- [ ] **Step 5: Manually verify the screen renders**

Run: `python -m http.server` from the repo root, open `http://localhost:8000`, click "SENTENCE BUILDER". Since `js/games/game-grammar.js` doesn't exist yet (Task 6), expect a console error (`startGame` calls `startFreshGame('grammar')` which is a no-op — nothing happens, no crash) — confirms the markup/CSS loaded without breaking the page. Check the browser console shows no CSS/HTML parse errors.

- [ ] **Step 6: Commit**

```bash
git add index.html css/game-grammar.css
git commit -m "feat(grammar): add Sentence Builder screen markup and styles"
```

---

### Task 6: Grammar game core logic + resume state

**Files:**
- Create: `js/games/game-grammar.js`
- Modify: `tests/all-game-resume.test.js`

**Interfaces:**
- Consumes: `getPrioritizedDeck`, `generateQuestionId`, `updateQuestionStats`, `maybeApplyFastCorrectCooldown`, `handleEmptyGameDeck`, `shuffle`, `gameOver`, `showScreen`, `showToast`, `saveToStorage`, `recordPlayTime` (all pre-existing).
- Produces: `startGrammar()`, `nextGrammar()`, `restartGrammar()`, `isGrammarAnswerCorrect(submitted, correct)`, `saveGrammarResumeState()`, `loadGrammarResumeState()`, `clearGrammarResumeState()`, `resumeGrammarFromState()` — these last four are the exact names Task 7's dispatcher wiring will call.

- [ ] **Step 1: Write the failing tests**

In `tests/all-game-resume.test.js`, add `['js', 'games', 'game-grammar.js']` to the `sources` array (after the `game-write.js` entry, currently line 15):

```javascript
  ['js', 'games', 'game-write.js'],
  ['js', 'games', 'game-grammar.js']
].map(parts => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8'));
```

In `createContext`'s `vm.runInContext` template string, add (after the `writeState`/`setWriteState` block, before the closing backtick):

```javascript
this.isGrammarAnswerCorrect = isGrammarAnswerCorrect;
this.grammarState = () => ({ grammarDeck, grammarIdx, grammarHP, grammarScore, grammarCombo, grammarCorrect, grammarWrong, grammarAnswer });
this.setGrammarState = (state) => {
  grammarDeck = state.deck ?? grammarDeck;
  grammarIdx = state.idx ?? grammarIdx;
  grammarHP = state.hp ?? grammarHP;
  grammarScore = state.score ?? grammarScore;
  grammarCombo = state.combo ?? grammarCombo;
  grammarCorrect = state.correct ?? grammarCorrect;
  grammarWrong = state.wrong ?? grammarWrong;
  grammarAnswer = state.answer ?? grammarAnswer;
};
```

Add these test functions after `testWriteResumeRoundTrip`:

```javascript
function sampleGrammarDeck() {
  return [
    { sentence: '私は学生です', chunks: ['私', 'は', '学生', 'です'], translation: 'Tôi là học sinh', questionId: 'q-1' },
    { sentence: '学校に行きます', chunks: ['学校', 'に', '行きます'], translation: 'Tôi đi đến trường', questionId: 'q-2' }
  ];
}

function testIsGrammarAnswerCorrectComparesOrderAndLength() {
  const context = createContext();
  assert.strictEqual(context.isGrammarAnswerCorrect(['私', 'は', '学生', 'です'], ['私', 'は', '学生', 'です']), true);
  assert.strictEqual(context.isGrammarAnswerCorrect(['は', '私', '学生', 'です'], ['私', 'は', '学生', 'です']), false);
  assert.strictEqual(context.isGrammarAnswerCorrect(['私', 'は'], ['私', 'は', '学生', 'です']), false);
}

function testGrammarResumeRoundTrip() {
  const context = createContext();
  const deck = sampleGrammarDeck();
  context.setAppState({ activeSetId: 'set-a' });
  context.setGrammarState({ deck, idx: 1, hp: 60, score: 40, combo: 3, correct: 2, wrong: 0, answer: ['学校'] });

  const saved = context.saveGameResumeState('grammar');
  context.setGrammarState({ deck: [], idx: 0, hp: 100, score: 0, combo: 0, correct: 0, wrong: 0, answer: [] });
  const resumed = context.resumeGameFromState('grammar');
  const state = context.grammarState();

  assert.strictEqual(saved.type, 'grammar');
  assert.strictEqual(resumed, true);
  assert.strictEqual(state.grammarIdx, 1);
  assert.strictEqual(state.grammarHP, 60);
  assert.strictEqual(state.grammarScore, 40);
  assert.strictEqual(state.grammarCombo, 3);
  assert.strictEqual(state.grammarCorrect, 2);
  assert.deepStrictEqual(Array.from(state.grammarAnswer), ['学校']);
  assert.strictEqual(context.localStorage.getItem('jq_resume_grammar'), null);
}
```

Add the calls at the bottom (before `console.log('all-game resume tests passed');`):

```javascript
testIsGrammarAnswerCorrectComparesOrderAndLength();
testGrammarResumeRoundTrip();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/all-game-resume.test.js`
Expected: FAIL — `ENOENT` reading `js/games/game-grammar.js` (file doesn't exist yet).

- [ ] **Step 3: Implement `js/games/game-grammar.js`**

```javascript
// ================================================
// GAME 7: GRAMMAR SENTENCE BUILDER
// ================================================

let grammarDeck = [];
let grammarIdx = 0;
let grammarHP = 100;
let grammarScore = 0;
let grammarCombo = 0;
let grammarCorrect = 0;
let grammarWrong = 0;
let grammarTimeLeft = 0;
let grammarTimerInterval = null;
let grammarDelayTimeout = null;
let grammarAnswer = [];
let grammarPoolChunks = [];
let grammarQuestionStartTime = 0;
let grammarDragState = null;
const GRAMMAR_RESUME_STORAGE_KEY = 'jq_resume_grammar';

function isGrammarAnswerCorrect(submitted, correct) {
  if (submitted.length !== correct.length) return false;
  return submitted.every((chunk, i) => chunk === correct[i]);
}

function createGrammarResumeState() {
  if (!Array.isArray(grammarDeck) || grammarDeck.length === 0) return null;
  if (grammarIdx >= grammarDeck.length) return null;

  return {
    version: 1,
    id: `grammar-${Date.now()}`,
    type: 'grammar',
    activeSetId: activeSetId || 'set-default',
    savedAt: new Date().toISOString(),
    deck: grammarDeck.map(q => ({ ...q })),
    idx: grammarIdx,
    hp: grammarHP,
    score: grammarScore,
    combo: grammarCombo,
    correct: grammarCorrect,
    wrong: grammarWrong,
    answer: [...grammarAnswer]
  };
}

function saveGrammarResumeState() {
  const state = createGrammarResumeState();
  if (!state) {
    clearGrammarResumeState();
    return false;
  }
  localStorage.setItem(GRAMMAR_RESUME_STORAGE_KEY, JSON.stringify(state));
  return state;
}

function loadGrammarResumeState() {
  try {
    const raw = localStorage.getItem(GRAMMAR_RESUME_STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state || state.version !== 1 || state.type !== 'grammar') return null;
    if (state.activeSetId !== (activeSetId || 'set-default')) return null;
    if (!Array.isArray(state.deck) || state.deck.length === 0) return null;
    if (!Number.isInteger(state.idx) || state.idx < 0 || state.idx >= state.deck.length) return null;
    return state;
  } catch (e) {
    clearGrammarResumeState();
    return null;
  }
}

function clearGrammarResumeState() {
  localStorage.removeItem(GRAMMAR_RESUME_STORAGE_KEY);
}

function resumeGrammarFromState() {
  const state = loadGrammarResumeState();
  if (!state) return false;

  grammarDeck = state.deck.map(q => ({ ...q }));
  grammarIdx = state.idx;
  grammarHP = state.hp;
  grammarScore = state.score;
  grammarCombo = state.combo;
  grammarCorrect = state.correct;
  grammarWrong = state.wrong;
  grammarAnswer = Array.isArray(state.answer) ? [...state.answer] : [];
  stopGrammarTimer();
  clearGrammarResumeState();
  showScreen('screen-grammar');
  renderGrammar(true);
  return true;
}

function startGrammar() {
  clearGrammarResumeState();
  stopGrammarTimer();
  grammarDeck = getPrioritizedDeck(questions, 'grammar').map(q => ({
    ...q,
    questionId: generateQuestionId(q)
  }));
  if (settings.questionLimitEnabled) {
    grammarDeck = grammarDeck.slice(0, settings.questionLimit);
  }
  if (grammarDeck.length === 0) {
    handleEmptyGameDeck('grammar');
    return;
  }
  grammarIdx = 0;
  grammarHP = 100;
  grammarScore = 0;
  grammarCombo = 0;
  grammarCorrect = 0;
  grammarWrong = 0;
  grammarAnswer = [];
  showScreen('screen-grammar');
  renderGrammar(false);
}

function renderGrammar(resuming) {
  const container = document.getElementById('screen-grammar');
  if (!container) return;

  if (grammarIdx >= grammarDeck.length) {
    return grammarComplete();
  }

  const q = grammarDeck[grammarIdx];
  grammarQuestionStartTime = Date.now();
  document.getElementById('grammar-progress').textContent = `${grammarIdx + 1} / ${grammarDeck.length}`;
  document.getElementById('grammar-translation').textContent = q.translation || '';
  document.getElementById('grammar-explanation').classList.add('hidden');
  document.getElementById('grammar-next').classList.add('hidden');

  if (!resuming) {
    grammarAnswer = [];
  }

  const remaining = [...q.chunks];
  grammarAnswer.forEach(chunk => {
    const pos = remaining.indexOf(chunk);
    if (pos !== -1) remaining.splice(pos, 1);
  });
  grammarPoolChunks = shuffle(remaining);

  updateGrammarHUD();
  if (settings.quizTimerEnabled) {
    startGrammarTimer();
  } else {
    stopGrammarTimer();
  }

  renderGrammarChips();
}

function renderGrammarChips() {
  const pool = document.getElementById('grammar-pool');
  const answerRow = document.getElementById('grammar-answer-row');
  pool.innerHTML = '';
  answerRow.innerHTML = '';

  grammarPoolChunks.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-btn grammar-chip';
    btn.textContent = text;
    btn.onclick = () => moveChunkToAnswer(i);
    pool.appendChild(btn);
  });

  grammarAnswer.forEach((text) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-btn grammar-chip grammar-chip-placed';
    btn.textContent = text;
    btn.onclick = () => moveChunkToPool(Array.from(answerRow.children).indexOf(btn));
    attachGrammarDragHandlers(btn);
    answerRow.appendChild(btn);
  });
}

function moveChunkToAnswer(poolIndex) {
  const [text] = grammarPoolChunks.splice(poolIndex, 1);
  grammarAnswer.push(text);
  renderGrammarChips();
  if (grammarAnswer.length === grammarDeck[grammarIdx].chunks.length) {
    checkGrammarAnswer();
  }
}

function moveChunkToPool(answerIndex) {
  const [text] = grammarAnswer.splice(answerIndex, 1);
  grammarPoolChunks.push(text);
  renderGrammarChips();
}

function attachGrammarDragHandlers(btn) {
  btn.addEventListener('pointerdown', (e) => {
    grammarDragState = { pointerId: e.pointerId };
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('dragging');
  });
  btn.addEventListener('pointermove', (e) => {
    if (!grammarDragState || grammarDragState.pointerId !== e.pointerId) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const targetChip = target ? target.closest('.grammar-chip-placed') : null;
    if (!targetChip || targetChip === btn) return;
    const answerRow = document.getElementById('grammar-answer-row');
    const children = Array.from(answerRow.children);
    const fromIndex = children.indexOf(btn);
    const toIndex = children.indexOf(targetChip);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    if (fromIndex < toIndex) {
      answerRow.insertBefore(btn, targetChip.nextSibling);
    } else {
      answerRow.insertBefore(btn, targetChip);
    }
    grammarAnswer = Array.from(answerRow.children).map(el => el.textContent);
  });
  const endDrag = (e) => {
    if (!grammarDragState || grammarDragState.pointerId !== e.pointerId) return;
    btn.classList.remove('dragging');
    grammarDragState = null;
  };
  btn.addEventListener('pointerup', endDrag);
  btn.addEventListener('pointercancel', endDrag);
}

function checkGrammarAnswer() {
  stopGrammarTimer();
  const q = grammarDeck[grammarIdx];
  const responseTime = Date.now() - grammarQuestionStartTime;
  const correct = isGrammarAnswerCorrect(grammarAnswer, q.chunks);

  document.querySelectorAll('.grammar-chip').forEach(b => { b.disabled = true; });

  let cooldownPrompted = false;
  if (correct) {
    grammarCombo++;
    grammarCorrect++;
    const points = Math.floor(BASE_XP_REWARD * Math.max(1, grammarCombo) * 1.5);
    grammarScore += points;
    playerEXP += points;
    updateQuestionStats(q.questionId, 'grammar', true, responseTime);
    cooldownPrompted = maybeApplyFastCorrectCooldown(q.questionId, 'grammar', responseTime, (applied) => {
      if (applied && grammarIdx < grammarDeck.length) {
        nextGrammar();
      } else {
        document.getElementById('grammar-next').classList.remove('hidden');
      }
    });
    showToast(`✅ Correct! +${points} EXP`, 'ok');
  } else {
    if (!settings.disableGameOver) {
      grammarHP = Math.max(0, grammarHP - 20);
    }
    grammarCombo = 0;
    grammarWrong++;
    updateQuestionStats(q.questionId, 'grammar', false, responseTime);
    showToast('❌ Wrong order!', 'err');
    document.getElementById('screen-grammar').classList.add('shake');
    setTimeout(() => document.getElementById('screen-grammar').classList.remove('shake'), 400);
    grammarAnswer = [...q.chunks];
    grammarPoolChunks = [];
    renderGrammarChips();
    document.querySelectorAll('.grammar-chip').forEach(b => { b.disabled = true; });
  }

  const explanation = document.getElementById('grammar-explanation');
  explanation.textContent = q.ex ? `${q.sentence} — ${q.ex}` : q.sentence;
  explanation.classList.remove('hidden');
  document.getElementById('grammar-next').classList.toggle('hidden', correct && cooldownPrompted);
  updateGrammarHUD();

  if (grammarHP <= 0) {
    setTimeout(() => {
      showToast('💀 Out of health! Game over.', 'err');
      showGrammarGameOver();
    }, 1000);
  }
}

function nextGrammar() {
  grammarIdx++;
  if (grammarIdx < grammarDeck.length) {
    renderGrammar(false);
  } else {
    grammarComplete();
  }
}

function updateGrammarHUD() {
  document.getElementById('grammar-score').textContent = grammarScore;
  document.getElementById('grammar-combo').textContent = grammarCombo;
  const timerEl = document.getElementById('grammar-timer');
  if (timerEl) {
    timerEl.textContent = settings.quizTimerEnabled ? String(grammarTimeLeft).padStart(2, '0') : '--';
  }
  document.getElementById('grammar-hpbar').style.width = `${Math.max(0, grammarHP)}%`;
}

function startGrammarTimer() {
  stopGrammarTimer();
  if (!settings.quizTimerEnabled) return;
  grammarTimeLeft = settings.quizTimeLimit;
  updateGrammarHUD();
  grammarTimerInterval = setInterval(() => {
    grammarTimeLeft = Math.max(0, grammarTimeLeft - 1);
    updateGrammarHUD();
    if (grammarTimeLeft <= 0) {
      handleGrammarTimeout();
    }
  }, 1000);
}

function clearGrammarDelayTimeout() {
  if (grammarDelayTimeout) {
    clearTimeout(grammarDelayTimeout);
    grammarDelayTimeout = null;
  }
}

function stopGrammarTimer() {
  if (grammarTimerInterval) {
    clearInterval(grammarTimerInterval);
    grammarTimerInterval = null;
  }
  clearGrammarDelayTimeout();
}

function handleGrammarTimeout() {
  stopGrammarTimer();
  if (grammarIdx >= grammarDeck.length) return;

  const q = grammarDeck[grammarIdx];
  document.querySelectorAll('.grammar-chip').forEach(b => { b.disabled = true; });
  document.getElementById('screen-grammar').classList.add('shake');
  setTimeout(() => document.getElementById('screen-grammar').classList.remove('shake'), 400);

  grammarCombo = 0;
  grammarAnswer = [...q.chunks];
  grammarPoolChunks = [];
  renderGrammarChips();
  document.querySelectorAll('.grammar-chip').forEach(b => { b.disabled = true; });

  const explanation = document.getElementById('grammar-explanation');
  explanation.textContent = q.ex ? `${q.sentence} — ${q.ex}` : q.sentence;
  explanation.classList.remove('hidden');
  document.getElementById('grammar-next').classList.remove('hidden');

  if (!settings.disableGameOver) {
    grammarHP = Math.max(0, grammarHP - 20);
  }
  updateGrammarHUD();
  if (!settings.disableGameOver && grammarHP <= 0) {
    showToast('💀 Time’s up! Game over.', 'err');
    grammarDelayTimeout = setTimeout(() => {
      grammarDelayTimeout = null;
      showGrammarGameOver();
    }, 900);
    return;
  }

  showToast('⏱ Time’s up! Wrong answer.', 'err');
  updateQuestionStats(q.questionId, 'grammar', false, undefined);
  grammarWrong++;
  grammarDelayTimeout = setTimeout(() => {
    grammarDelayTimeout = null;
    nextGrammar();
  }, 900);
}

function grammarComplete() {
  stopGrammarTimer();
  clearGrammarResumeState();
  gameOver(grammarScore, grammarCombo, 'grammar', grammarCorrect, grammarWrong, true);
  playerCombo = Math.max(playerCombo, grammarCombo);
  saveToStorage();
  showToast(`🎉 Complete! Score: ${grammarScore}`, 'ok');
  if (gameStartTime) {
    const elapsed = (Date.now() - gameStartTime) / 60000;
    recordPlayTime(elapsed);
  }
  setTimeout(() => showScreen('screen-menu'), 800);
}

function showGrammarGameOver() {
  stopGrammarTimer();
  clearGrammarResumeState();
  gameOver(grammarScore, grammarCombo, 'grammar', grammarCorrect, grammarWrong);
  const el = document.getElementById('grammar-go-score');
  if (el) el.textContent = grammarScore;
  document.getElementById('grammar-gameover')?.classList.remove('hidden');
}

function restartGrammar() {
  document.getElementById('grammar-gameover')?.classList.add('hidden');
  startGrammar();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/all-game-resume.test.js`
Expected: PASS — `all-game resume tests passed`.

- [ ] **Step 5: Run the full front-end test suite**

Run: `node tests/run-all.js`
Expected: `11 test files passed` — this file doesn't add a new file, it extends `all-game-resume.test.js`, so the count stays at 11 (Task 3 didn't add a new test file either, it extended `questions-data.test.js`).

- [ ] **Step 6: Commit**

```bash
git add js/games/game-grammar.js tests/all-game-resume.test.js
git commit -m "feat(grammar): implement Sentence Builder game logic and resume state"
```

---

### Task 7: Wire grammar into central dispatchers, router, and stats

**Files:**
- Modify: `js/games/game-quiz.js`
- Modify: `js/main.js`

**Interfaces:**
- Consumes: `saveGrammarResumeState`, `loadGrammarResumeState`, `clearGrammarResumeState`, `resumeGrammarFromState`, `startGrammar` (from Task 6).
- Produces: `startGame('grammar')` now fully functional end-to-end (resume modal, fresh start, stats attribution).

- [ ] **Step 1: Add grammar branches to the 4 central dispatchers**

In `js/games/game-quiz.js`, add one line to each of the 4 dispatcher functions (currently lines 18-55), right before their final `return false;`/`return null;`:

`saveGameResumeState` (line 18-26): after the `write` line, add:
```javascript
  if (type === 'grammar' && typeof saveGrammarResumeState === 'function') return saveGrammarResumeState();
```

`loadGameResumeState` (line 28-36): after the `write` line, add:
```javascript
  if (type === 'grammar' && typeof loadGrammarResumeState === 'function') return loadGrammarResumeState();
```

`clearGameResumeState` (line 38-45): after the `write` line, add:
```javascript
  if (type === 'grammar' && typeof clearGrammarResumeState === 'function') clearGrammarResumeState();
```

`resumeGameFromState` (line 47-55): after the `write` line, add:
```javascript
  if (type === 'grammar' && typeof resumeGrammarFromState === 'function') return resumeGrammarFromState();
```

- [ ] **Step 2: Wire the router and labels in `js/main.js`**

In `startFreshGame` (currently lines 182-189), add after the `write` line:

```javascript
  if (type === 'grammar') startGrammar();
```

In `getGameResumeLabel`'s `labels` object (currently lines 192-199), add:

```javascript
    write: 'Writing',
    grammar: 'Sentence Builder'
```

In `getCurrentResumeGameType`'s `screenMap` object (currently lines 204-211), add:

```javascript
    'screen-write': 'write',
    'screen-grammar': 'grammar'
```

In `dictionaryGame` (currently lines 315-322), add:

```javascript
  'write': () => { restartGame(() => { startWrite(); }); },
  'grammar': () => { restartGame(() => { startGrammar(); }); }
```

- [ ] **Step 3: Register grammar in the Stats screen**

In `js/main.js`'s `renderStatsScreen` (currently lines 370-558):

Change the `gameNames` map (line 376):
```javascript
  const gameNames = { quiz: '📝 Quiz', listen: '🎧 Listening', flash: '🃏 Flashcard', match: '🧩 Match', type: '⌨ Falling Words', write: '✍️ Writing', grammar: '🧩 Sentence Builder' };
```

Change the `gameColors` map (line 377):
```javascript
  const gameColors = { quiz: '#0a84ff', listen: '#ff00c8', flash: '#bf5af2', match: '#ffd60a', type: '#ff2d55', write: '#30d158', grammar: '#5ac8fa' };
```

Change the loop over game types (line 380):
```javascript
  for (const type of ['quiz', 'listen', 'flash', 'match', 'type', 'write', 'grammar']) {
```

Change the `gameIcons` map used for session history (line 407):
```javascript
      const gameIcons = { quiz: '📝', listen: '🎧', flash: '🃏', match: '🧩', type: '⌨', write: '✍️', grammar: '🧩' };
```

Change the mastery-section `gameTypes` array (line 499):
```javascript
    const gameTypes = ['quiz', 'listen', 'flash', 'match', 'type', 'write', 'grammar'];
```

- [ ] **Step 4: Manually verify end-to-end**

Run: `python -m http.server`, open `http://localhost:8000`. Switch the active set to a set with `category: "vocabulary"` (any existing set), confirm menu still shows all 6 vocab games (Task 8 will restrict this — for now every button is still visible since menu filtering hasn't been wired yet). Click "SENTENCE BUILDER" — confirm it starts, chips render, tapping chips moves them, completing a sentence advances, HP drops on wrong order, exiting mid-game and re-entering re-triggers a resume prompt.

- [ ] **Step 5: Run the full front-end test suite**

Run: `node tests/run-all.js`
Expected: `11 test files passed`.

- [ ] **Step 6: Commit**

```bash
git add js/games/game-quiz.js js/main.js
git commit -m "feat(grammar): wire grammar into game router, resume dispatchers, and stats screen"
```

---

### Task 8: Menu category filtering

**Files:**
- Modify: `js/main.js`
- Test: `tests/main-utils.test.js`

**Interfaces:**
- Consumes: `getVisibleGamesForCategory` (Task 4), `questionSets`/`activeSetId` (existing globals).
- Produces: `updateMenuUI()` now hides/shows `.menu-btn.btn-*` elements based on the active set's category.

- [ ] **Step 1: Write the failing test**

In `tests/main-utils.test.js`, the `createContext` helper's `document` mock only implements `addEventListener`. Replace the whole file's `createContext` and add a menu-filtering test. Replace the file's `createContext` function (currently lines 8-33) with:

```javascript
function createElement(id) {
  return {
    id,
    style: {},
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      contains(value) { return this.values.has(value); }
    }
  };
}

function createContext(randomValues = []) {
  const math = Object.create(Math);
  let randomIndex = 0;
  math.random = () => {
    const value = randomValues[randomIndex] ?? 0;
    randomIndex += 1;
    return value;
  };

  const elements = {};
  const gameUtilsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'game-utils.js'), 'utf8');
  const context = {
    console,
    Math: math,
    questionSets: [],
    activeSetId: null,
    questions: [],
    playerHP: 100, playerEXP: 0, playerLevel: 1, playerCombo: 0,
    dailyStreak: { currentStreak: 0 },
    document: {
      addEventListener() {},
      getElementById(id) {
        if (!elements[id]) elements[id] = createElement(id);
        return elements[id];
      },
      querySelectorAll(selector) {
        if (selector === '.menu-btn[data-game]') {
          return Object.values(elements).filter(el => el.dataset && el.dataset.game);
        }
        return [];
      }
    },
    getXpForLevel() { return 500; }
  };

  vm.createContext(context);
  vm.runInContext(
    `${gameUtilsSource}
${source}
this.escapeHtml = escapeHtml;
this.shuffle = shuffle;
this.updateMenuUI = updateMenuUI;`,
    context
  );
  context.elements = elements;
  return context;
}
```

Add a `createMenuButton(id, game)` helper and a new test function right after `testShuffleMutatesAndReturnsSameArrayWithFisherYatesSwaps`:

```javascript
function createMenuButtonElement(game) {
  const el = createElement(`btn-${game}`);
  el.dataset = { game };
  return el;
}

function testUpdateMenuUIHidesGamesNotCompatibleWithActiveCategory() {
  const context = createContext();
  context.elements['menu-hp'] = createElement('menu-hp');
  context.elements['menu-exp'] = createElement('menu-exp');
  context.elements['menu-level'] = createElement('menu-level');
  context.elements['menu-combo'] = createElement('menu-combo');
  context.elements['data-count'] = createElement('data-count');
  context.elements['menu-streak'] = createElement('menu-streak');
  ['quiz', 'listen', 'type', 'match', 'flash', 'write', 'grammar'].forEach(game => {
    context.elements[`btn-${game}`] = createMenuButtonElement(game);
  });

  context.questionSets = [{ id: 'set-a', category: 'grammar' }];
  context.activeSetId = 'set-a';
  context.updateMenuUI();

  assert.strictEqual(context.elements['btn-quiz'].classList.contains('hidden'), true);
  assert.strictEqual(context.elements['btn-grammar'].classList.contains('hidden'), false);

  context.questionSets = [{ id: 'set-b', category: 'vocabulary' }];
  context.activeSetId = 'set-b';
  context.updateMenuUI();

  assert.strictEqual(context.elements['btn-quiz'].classList.contains('hidden'), false);
  assert.strictEqual(context.elements['btn-grammar'].classList.contains('hidden'), true);
}

function testUpdateMenuUIShowsAllVocabGamesWhenNoActiveSetCategoryKnown() {
  const context = createContext();
  context.elements['menu-hp'] = createElement('menu-hp');
  context.elements['menu-exp'] = createElement('menu-exp');
  context.elements['menu-level'] = createElement('menu-level');
  context.elements['menu-combo'] = createElement('menu-combo');
  context.elements['data-count'] = createElement('data-count');
  context.elements['menu-streak'] = createElement('menu-streak');
  ['quiz', 'grammar'].forEach(game => {
    context.elements[`btn-${game}`] = createMenuButtonElement(game);
  });

  context.questionSets = [];
  context.activeSetId = null;
  context.updateMenuUI();

  assert.strictEqual(context.elements['btn-quiz'].classList.contains('hidden'), false);
  assert.strictEqual(context.elements['btn-grammar'].classList.contains('hidden'), true);
}
```

Add the calls at the bottom:

```javascript
testUpdateMenuUIHidesGamesNotCompatibleWithActiveCategory();
testUpdateMenuUIShowsAllVocabGamesWhenNoActiveSetCategoryKnown();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/main-utils.test.js`
Expected: FAIL — the current `updateMenuUI()` never touches `.menu-btn` elements, so both buttons stay non-hidden in the grammar-category case.

- [ ] **Step 3: Add `data-game` attributes to the 7 game menu buttons**

In `index.html`, add a `data-game="..."` attribute to each of the 7 game menu buttons (`btn-quiz`, `btn-listen`, `btn-type`, `btn-match`, `btn-flash`, `btn-write`, `btn-grammar`) — for example, line 65 becomes:

```html
          <button class="menu-btn btn-quiz" data-game="quiz" onclick="startGame('quiz')">
```

Apply the same pattern (add `data-game="<key>"` right after the `class` attribute) to `btn-listen` (`data-game="listen"`), `btn-type` (`data-game="type"`), `btn-match` (`data-game="match"`), `btn-flash` (`data-game="flash"`), `btn-write` (`data-game="write"`), and the `btn-grammar` button added in Task 5 (`data-game="grammar"`). Do **not** add `data-game` to `btn-stats`, `btn-settings`, or `btn-data` — those aren't category-gated.

- [ ] **Step 4: Implement the filtering in `updateMenuUI()`**

In `js/main.js`, replace `updateMenuUI` (currently lines 135-145) with:

```javascript
function updateMenuUI() {

  document.getElementById('menu-hp').style.width = `${Math.max(0, playerHP)}%`;
  document.getElementById('menu-exp').style.width = `${Math.min(100, (playerEXP / getXpForLevel(playerLevel)) * 100)}%`;
  const levelEl = document.getElementById('menu-level');
  if (levelEl) levelEl.textContent = playerLevel;
  document.getElementById('menu-combo').textContent = playerCombo;
  document.getElementById('data-count').textContent = `${questions.length} loaded questions`;
  const streakEl = document.getElementById('menu-streak');
  if (streakEl) streakEl.textContent = dailyStreak.currentStreak;

  const activeMeta = questionSets.find(s => s.id === activeSetId);
  const visibleGames = getVisibleGamesForCategory(activeMeta ? activeMeta.category : undefined);
  document.querySelectorAll('.menu-btn[data-game]').forEach(btn => {
    btn.classList.toggle('hidden', !visibleGames.includes(btn.dataset.game));
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/main-utils.test.js`
Expected: PASS — `main-utils tests passed`.

- [ ] **Step 6: Run the full front-end test suite**

Run: `node tests/run-all.js`
Expected: `11 test files passed`.

- [ ] **Step 7: Manually verify in the browser**

Run: `python -m http.server`, open `http://localhost:8000`. On the "QUESTION SETS" screen, switch between `n5-core` (vocabulary) and `n5-grammar` (grammar). Return to the main menu each time (or just watch it update live since `switchQuestionSet` calls `updateMenuUI()`) — confirm the 6 vocab game buttons disappear and only "SENTENCE BUILDER" shows for the grammar set, and vice versa for vocabulary sets. Confirm Stats/Settings/Question Sets buttons never disappear.

- [ ] **Step 8: Commit**

```bash
git add index.html js/main.js tests/main-utils.test.js
git commit -m "feat(menu): filter game buttons by the active question set's category"
```

---

### Task 9: Fix the unreachable per-game priority settings modal

**Files:**
- Modify: `index.html`
- Modify: `js/settings.js`
- Modify: `js/main.js`

**Interfaces:**
- Consumes: `openGamePrioritySettings(gameType)` (pre-existing, currently uncalled from anywhere).
- Produces: 7 visible buttons on the Settings screen that open the existing (already-implemented) per-game priority modal.

- [ ] **Step 1: Add the trigger buttons to the Settings screen**

In `index.html`, inside the `setting-block-priority` block, right after the closing `</div>` of `priority-panel` (currently line 298, before the block's own closing `</div>` on line 299), insert:

```html
            <div class="setting-block-per-game">
              <p class="setting-desc">Or override priority weights for one specific game:</p>
              <div class="btn-row">
                <button class="action-btn btn-secondary btn-sm" onclick="openGamePrioritySettings('quiz')">📝 Quiz</button>
                <button class="action-btn btn-secondary btn-sm" onclick="openGamePrioritySettings('listen')">🎧 Listening</button>
                <button class="action-btn btn-secondary btn-sm" onclick="openGamePrioritySettings('flash')">🃏 Flashcard</button>
                <button class="action-btn btn-secondary btn-sm" onclick="openGamePrioritySettings('match')">🧩 Match</button>
                <button class="action-btn btn-secondary btn-sm" onclick="openGamePrioritySettings('type')">⌨ Falling Words</button>
                <button class="action-btn btn-secondary btn-sm" onclick="openGamePrioritySettings('write')">✍️ Writing</button>
                <button class="action-btn btn-secondary btn-sm" onclick="openGamePrioritySettings('grammar')">🧩 Sentence Builder</button>
              </div>
            </div>
```

- [ ] **Step 2: Add `grammar` to the modal's title map**

In `js/settings.js`, in `openGamePrioritySettings` (currently line 155), change:

```javascript
  const titles = { quiz: '📝 Quiz', listen: '🎧 Listening', flash: '🃏 Flashcard', match: '🧩 Match', type: '⌨ Falling Words', write: '✍️ Writing' };
```

to:

```javascript
  const titles = { quiz: '📝 Quiz', listen: '🎧 Listening', flash: '🃏 Flashcard', match: '🧩 Match', type: '⌨ Falling Words', write: '✍️ Writing', grammar: '🧩 Sentence Builder' };
```

- [ ] **Step 3: Add a default `grammar` entry to both `perGame` default-settings literals**

In `js/main.js`'s `settings` initializer (currently lines 38-45), add after the `write` line:

```javascript
      write: { enabled: null, incorrect: 8, timeSinceSeen: 3, learning: 2, slowResponse: 3 },
      grammar: { enabled: null, incorrect: 8, timeSinceSeen: 3, learning: 2, slowResponse: 3 }
```

In `js/settings.js`'s `resetSettingsToDefault` (currently lines 283-290), change:

```javascript
        write: { enabled: null, incorrect: 8, timeSinceSeen: 3, learning: 2, slowResponse: 3 }
      }
```

to:

```javascript
        write: { enabled: null, incorrect: 8, timeSinceSeen: 3, learning: 2, slowResponse: 3 },
        grammar: { enabled: null, incorrect: 8, timeSinceSeen: 3, learning: 2, slowResponse: 3 }
      }
```

- [ ] **Step 4: Manually verify**

Run: `python -m http.server`, open `http://localhost:8000`, go to Settings, scroll to "🔀 Smart Prioritization", confirm 7 new buttons appear below the global sliders, click "🧩 Sentence Builder" — confirm the modal opens titled "⚙️ 🧩 Sentence Builder Settings", toggle "Override global settings" on, adjust a slider, close the modal, reopen it — confirm the overridden values persisted.

- [ ] **Step 5: Run the full front-end test suite**

Run: `node tests/run-all.js`
Expected: `11 test files passed` (no test file specifically covers this DOM modal — consistent with the existing lack of coverage for `renderSettingsScreen`/`updateSettingsFromUI`; the manual check in Step 4 is the verification for this task).

- [ ] **Step 6: Commit**

```bash
git add index.html js/settings.js js/main.js
git commit -m "fix(settings): expose the per-game priority override modal via visible buttons"
```

---

### Task 10: Documentation

**Files:**
- Modify: `README.md`
- Modify: `API-Japanese-Learning-Mini-Game.md`

- [ ] **Step 1: Update `README.md`'s game table and question-set section**

In `README.md`, add a row to the "🕹️ 6 Mini-Games" table (rename the heading to "🕹️ 7 Mini-Games") after the Writing Practice row:

```markdown
| 🧩 **Sentence Builder** | Arrange shuffled word chunks into the correct grammar order |
```

In the "📦 Question Sets" section, add a new bullet right after the existing three:

```markdown
- Each set has a `category` — `vocabulary` (unlocks Quiz/Listening/Falling Words/Match/Flashcard/Writing) or `grammar` (unlocks Sentence Builder). The main menu shows only the games that match the active set's category.
```

- [ ] **Step 2: Rewrite `API-Japanese-Learning-Mini-Game.md`**

Remove the entire "## Firebase API" section (its heading through the end of the "Constants" section's preceding content — i.e. everything from `## Firebase API` down to, but not including, `## Constants`) and the `jq_firebase_config` row from the "LocalStorage Keys" table.

In the `QuestionSet Object` section, replace the code block and add a `category` field row:

```javascript
{
  "id": "n5-core",           // Set ID, referenced from manifest.json
  "name": "N5 Core Vocabulary",
  "category": "vocabulary",  // "vocabulary" or "grammar" — determines which games unlock in the menu
  "description": "...",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "questions": [...]
}
```

Add a new subsection right after `Question Object`, before `QuestionSet Object`:

```markdown
### Grammar Question Object

```javascript
{
  "sentence": "私は学生です",              // Full correct sentence (required)
  "chunks": ["私", "は", "学生", "です"],  // Ordered pieces; must concatenate to sentence (required, min 2)
  "translation": "Tôi là học sinh",         // Vietnamese meaning (required)
  "ex": "は đánh dấu chủ đề câu"            // Grammar explanation (optional)
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sentence` | string | Yes | Full correct Japanese sentence |
| `chunks` | array | Yes | Ordered word/phrase pieces whose concatenation equals `sentence` |
| `translation` | string | Yes | Vietnamese meaning |
| `ex` | string | No | Grammar-point explanation shown after answering |
```

Fix the "Storage API" section's `LocalStorage Keys` table — remove the `jq_firebase_config` row, and fix the `jq_question_sets` row description to reflect reality: change `| jq_question_sets | array | All question sets |` to `| jq_active_set | string | Currently active question set id (the sets themselves are fetched from questions/manifest.json, not stored in localStorage) |` (this replaces the incorrect `jq_question_sets` row rather than adding a new one — `jq_active_set` already exists as its own row further down, so remove the duplicate and keep only the accurate one).

In the `Game Types` table at the bottom, add a row:

```markdown
| `grammar` | Sentence Builder (grammar word-order arrangement) |
```

Update the `gameType` parameter description on `updateQuestionStats` to read: `Game type: quiz, listen, flash, match, type, write, grammar`.

- [ ] **Step 3: Commit**

```bash
git add README.md API-Japanese-Learning-Mini-Game.md
git commit -m "docs: document grammar category/question shape, remove stale Firebase API docs"
```

---

### Task 11: Final integration pass

**Files:** none (verification only)

- [ ] **Step 1: Run every automated test suite**

Run: `node tests/run-all.js`
Expected: `11 test files passed`

Run: `cd mcp-server && npm test`
Expected: `3 test files passed`

- [ ] **Step 2: Syntax-check every touched JS file**

Run: `node --check js/main.js && node --check js/storage.js && node --check js/settings.js && node --check js/game-utils.js && node --check js/games/game-quiz.js && node --check js/games/game-grammar.js`
Expected: no output (success).

- [ ] **Step 3: Full manual smoke test in the browser**

Run: `python -m http.server` from the repo root, open `http://localhost:8000`.

Checklist:
- Menu shows all 6 vocab games + no Sentence Builder when `n5-core` or `n4-kanji` is active.
- Switching to `n5-grammar` on the Question Sets screen immediately swaps the menu to show only Sentence Builder (plus Stats/Settings/Question Sets).
- Play Sentence Builder to completion on a fresh run: tapping chips builds the answer row correctly; completing a sentence scores points and shows the explanation; getting one wrong reveals the correct order and reduces HP; dragging a placed chip to reorder it works with mouse.
- Exit mid-sentence via the back arrow, restart the game — the resume prompt appears and "Continue" restores the in-progress deck position.
- Open Settings → Smart Prioritization → click each of the 7 per-game buttons (including "Sentence Builder") — modal opens with the correct title every time.
- Stats screen shows a "Sentence Builder" row in "Stats by Game Mode" after playing at least one round.

- [ ] **Step 4: No commit for this task** — it's verification only. If any check fails, return to the relevant earlier task, fix, and re-commit there.
