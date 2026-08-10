# Roadmap UI, Site-Wide Animations, and GitNexus Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all GitNexus artifacts (CodeGraph is now the sole code-intelligence tool), and add a new "🌌 LỘ TRÌNH" roadmap screen that visually links the 7 question sets into a climbing-to-space path, plus a small site-wide CSS animation pass (screen transitions, menu stagger-in, roadmap motion).

**Architecture:** Pure vanilla HTML/CSS/JS, no build step — matches the existing codebase exactly. The roadmap is a new screen (`screen-roadmap`) rendered by a new `js/roadmap.js` file, driven by two new manifest fields (`order`, `level`) and by reading the *existing* `questionStats` storage (no new stats format). Clicking a node reuses the existing `switchQuestionSet()` unmodified. All animations are CSS keyframes/transitions toggled by JS class changes, following the existing `body.animations-disabled` override convention in `css/base.css`.

**Tech Stack:** Vanilla JS (no modules, no bundler), vanilla CSS, Node's built-in `assert`/`vm` for tests (no test framework), Node's `zod` for the MCP server's tool schemas.

## Global Constraints

- No build system, no bundler, no new dependencies — this repo has none and the design doc is explicit about not introducing any (`docs/superpowers/specs/2026-08-10-roadmap-ui-and-gitnexus-removal-design.md`, Non-goals).
- No sequential locking of roadmap nodes — every set is playable at any time (design doc, Non-goals).
- Every new CSS animation/transition selector must get a matching `body.animations-disabled` override in `css/base.css` (design doc, Part C intro).
- Question stats lookups for a set that is **not** the currently active set must NOT go through `getQuestionStatsEntry()` — that helper scopes through the *global* `activeSetId`, not the set being examined, and would read the wrong bucket (design doc, B5 point 3).
- `order`/`level` are manifest-only fields — never duplicated into the question-set JSON file itself (design doc, B3).

---

### Task 1: Remove GitNexus artifacts

**Files:**
- Delete: `CLAUDE.md` (all 43 lines are the GitNexus block; nothing else is in the file)
- Modify: `AGENTS.md:176-219` (remove the blank line + entire `<!-- gitnexus:start -->` … `<!-- gitnexus:end -->` block, which is the last thing in the file)
- Delete: `.claude/skills/gitnexus/` (6 files: `gitnexus-cli/SKILL.md`, `gitnexus-debugging/SKILL.md`, `gitnexus-exploring/SKILL.md`, `gitnexus-guide/SKILL.md`, `gitnexus-impact-analysis/SKILL.md`, `gitnexus-refactoring/SKILL.md`)
- Delete: `.gitnexus/` (local index directory at repo root)
- Modify: `.gitignore` (remove the `.gitnexus` line; keep `.codegraph` and `.claude/worktrees/`)

**Interfaces:** None — this task has no code dependencies on or from any other task.

- [ ] **Step 1: Delete the GitNexus skill directory and local index**

```bash
rm -rf .claude/skills/gitnexus
rm -rf .gitnexus
```

- [ ] **Step 2: Delete `CLAUDE.md`**

```bash
rm CLAUDE.md
```

- [ ] **Step 3: Remove the GitNexus block from `AGENTS.md`**

Open `AGENTS.md`. The file currently ends with:

```
- Dữ liệu người chơi và câu hỏi được lưu trong `localStorage`

<!-- gitnexus:start -->
# GitNexus — Code Intelligence
...
<!-- gitnexus:end -->
```

Delete everything from the blank line right after `` - Dữ liệu người chơi và câu hỏi được lưu trong `localStorage` `` through the end of the file (the `<!-- gitnexus:start -->` … `<!-- gitnexus:end -->` block), so the file now ends with that `localStorage` bullet line.

- [ ] **Step 4: Remove the `.gitnexus` line from `.gitignore`**

Current content:
```
.gitnexus
.codegraph
.claude/worktrees/
```

New content:
```
.codegraph
.claude/worktrees/
```

- [ ] **Step 5: Verify no remaining references**

Run: `git grep -il gitnexus` (from repo root)
Expected: no output (empty result — everything is gone). If anything is still listed, remove/fix it before continuing.

- [ ] **Step 6: Commit**

```bash
git add -A -- CLAUDE.md AGENTS.md .gitignore .claude/skills/gitnexus
git commit -m "chore: remove GitNexus artifacts, CodeGraph is now the sole code-intel tool"
```

Note: `.gitnexus/` was already gitignored (never tracked), so no `git add`/`git rm` is needed for it — only deleting it from disk in Step 1 matters.

---

### Task 2: Add `order`/`level` roadmap metadata to the data model

**Files:**
- Modify: `questions/manifest.json` (all 7 entries)
- Modify: `mcp-server/src/questions-repo.js:107-123` (`createQuestionSet`)
- Modify: `mcp-server/src/index.js:86-100` (`create_question_set` tool schema)
- Test: `mcp-server/test/questions-repo.test.js` (extend)
- Test: `tests/questions-data.test.js` (extend)

**Interfaces:**
- Produces: every entry in `questionSets` (loaded client-side from `questions/manifest.json` via `fetchQuestionsManifest()` in `js/storage.js:6`) now has `entry.order` (integer) and `entry.level` (string) — Task 6/7's roadmap renderer reads both directly off the objects already in the global `questionSets` array, no new fetch needed for this part.

- [ ] **Step 1: Write the failing mcp-server tests for `order`/`level` defaulting and persistence**

Add to `mcp-server/test/questions-repo.test.js`, right after `testCreateQuestionSetDefaultsCategoryToVocabulary()`'s definition (before the block of `test...()` call statements at the bottom):

```js
function testCreateQuestionSetDefaultsOrderToEndOfManifestAndLevelToNA() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'first', name: 'First' });
  repo.createQuestionSet({ id: 'second', name: 'Second' });

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.sets[0].order, 1);
  assert.strictEqual(manifest.sets[0].level, 'N/A');
  assert.strictEqual(manifest.sets[1].order, 2);
  assert.strictEqual(manifest.sets[1].level, 'N/A');
}

function testCreateQuestionSetPersistsExplicitOrderAndLevel() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', order: 5, level: 'N4' });

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.sets[0].order, 5);
  assert.strictEqual(manifest.sets[0].level, 'N4');
}
```

Add both calls at the bottom, right before `console.log('questions-repo tests passed');`:

```js
testCreateQuestionSetDefaultsOrderToEndOfManifestAndLevelToNA();
testCreateQuestionSetPersistsExplicitOrderAndLevel();
```

- [ ] **Step 2: Run the mcp-server tests to verify the new ones fail**

Run: `cd mcp-server && npm test`
Expected: FAIL — `manifest.sets[0].order` is `undefined`, not `1`.

- [ ] **Step 3: Implement `order`/`level` in `createQuestionSet`**

In `mcp-server/src/questions-repo.js`, replace the `createQuestionSet` function (currently lines 107-123):

```js
  function createQuestionSet({ id, name, description = '', category = 'vocabulary', order, level, questions = [] }) {
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
    const resolvedOrder = Number.isInteger(order) ? order : manifest.sets.length + 1;
    const resolvedLevel = typeof level === 'string' && level.length > 0 ? level : 'N/A';
    manifest.sets.push({ id: setId, file, name, category, order: resolvedOrder, level: resolvedLevel, questionCount: questions.length, updatedAt: now });
    writeManifest(manifest);
    return set;
  }
```

- [ ] **Step 4: Run the mcp-server tests to verify they pass**

Run: `cd mcp-server && npm test`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 5: Add the `order`/`level` params to the MCP tool schema**

In `mcp-server/src/index.js`, in the `create_question_set` tool's `inputSchema` (currently lines 91-97):

```js
    inputSchema: {
      id: z.string().optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(['vocabulary', 'grammar']).optional(),
      order: z.number().int().optional(),
      level: z.string().optional(),
      questions: z.array(anyQuestionShape).optional()
    }
```

- [ ] **Step 6: Update `questions/manifest.json` with `order`/`level` for the 7 existing sets**

Replace the full contents of `questions/manifest.json`:

```json
{
  "sets": [
    {
      "id": "n5-core",
      "file": "n5-core.json",
      "name": "N5 Core Vocabulary",
      "category": "vocabulary",
      "order": 1,
      "level": "N5",
      "questionCount": 400,
      "updatedAt": "2026-07-28T08:59:46.370Z"
    },
    {
      "id": "n5-grammar",
      "file": "n5-grammar.json",
      "name": "N5 Grammar Basics",
      "category": "grammar",
      "order": 2,
      "level": "N5",
      "questionCount": 12,
      "updatedAt": "2026-08-06T00:00:00.000Z"
    },
    {
      "id": "n4-kanji",
      "file": "n4-kanji.json",
      "name": "Từ vựng N4",
      "category": "vocabulary",
      "order": 3,
      "level": "N4",
      "questionCount": 243,
      "updatedAt": "2026-07-31T04:24:53.033Z"
    },
    {
      "id": "n4-l26-vocab",
      "file": "n4-l26-vocab.json",
      "name": "N4 Bài 26 - Từ vựng (nghĩa)",
      "category": "vocabulary",
      "order": 4,
      "level": "N4",
      "questionCount": 20,
      "updatedAt": "2026-08-07T09:56:42.052Z"
    },
    {
      "id": "n4-l26-kanji",
      "file": "n4-l26-kanji.json",
      "name": "N4 Bài 26 - Từ vựng Kanji (đọc)",
      "category": "vocabulary",
      "order": 5,
      "level": "N4",
      "questionCount": 24,
      "updatedAt": "2026-08-07T09:57:07.694Z"
    },
    {
      "id": "n4-l26-kanji-hanviet",
      "file": "n4-l26-kanji-hanviet.json",
      "name": "N4 Bài 26 - Hán Việt từng Kanji",
      "category": "vocabulary",
      "order": 6,
      "level": "N4",
      "questionCount": 30,
      "updatedAt": "2026-08-07T09:58:47.864Z"
    },
    {
      "id": "n4-l26-grammar",
      "file": "n4-l26-grammar.json",
      "name": "N4 Bài 26 - Ngữ pháp",
      "category": "grammar",
      "order": 7,
      "level": "N4",
      "questionCount": 10,
      "updatedAt": "2026-08-07T10:00:33.868Z"
    }
  ]
}
```

- [ ] **Step 7: Write a failing root-level test asserting every manifest entry has `order`/`level`**

Add to `tests/questions-data.test.js`, right after `testEveryManifestEntryHasAKnownCategory()`'s definition:

```js
function testEveryManifestEntryHasUniqueOrderAndNonEmptyLevel() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  const orders = manifest.sets.map(entry => entry.order);
  manifest.sets.forEach(entry => {
    assert.ok(Number.isInteger(entry.order), `${entry.id}.order must be an integer`);
    assert.ok(typeof entry.level === 'string' && entry.level.length > 0, `${entry.id}.level must be a non-empty string`);
  });
  assert.strictEqual(new Set(orders).size, orders.length, 'manifest entry "order" values must be unique');
}
```

Add the call at the bottom, right before `console.log('questions data tests passed');`:

```js
testEveryManifestEntryHasUniqueOrderAndNonEmptyLevel();
```

This test would already pass given Step 6's manifest update (it isn't testing not-yet-written code), but run it anyway to confirm the manifest edit was applied correctly.

- [ ] **Step 8: Run the root test suite**

Run: `node tests/run-all.js` (from repo root)
Expected: PASS — all test files including the updated `questions-data.test.js`.

- [ ] **Step 9: Commit**

```bash
git add mcp-server/src/questions-repo.js mcp-server/src/index.js mcp-server/test/questions-repo.test.js questions/manifest.json tests/questions-data.test.js
git commit -m "feat(data): add order/level fields to question set manifest for roadmap sequencing"
```

---

### Task 3: Site-wide screen transition animation

**Files:**
- Modify: `js/main.js:112-131` (`showScreen`)
- Modify: `css/animations.css` (add `screenFadeUp` keyframe)
- Modify: `css/base.css:30-34` (add the `animations-disabled` override)

**Interfaces:**
- Produces: every call to `showScreen(id)` now triggers a `.screen-transitioning` fade-up entrance on the newly shown screen. No function signature changes — `showScreen(id)` keeps the same single-argument call shape every other file already uses.

- [ ] **Step 1: Add the `screenFadeUp` keyframe to `css/animations.css`**

Append to the end of `css/animations.css`:

```css
/* ─── Screen Transition ──────────────────────────── */
@keyframes screenFadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 2: Add the transition-trigger class and its disabled-state override to `css/base.css`**

In `css/base.css`, add right after the existing `.screen.active { ... }` block (currently ending at line 28):

```css
.screen.screen-transitioning { animation: screenFadeUp .35s ease; }
```

Then extend the existing `animations-disabled` override block (currently lines 30-34) by adding this line right after `body.animations-disabled .screen { transition: none; opacity: 1; }`:

```css
body.animations-disabled .screen.screen-transitioning { animation: none !important; }
```

- [ ] **Step 3: Trigger the class from `showScreen()`**

In `js/main.js`, replace the `showScreen` function (currently lines 112-131):

```js
function showScreen(id) {
  const prevScreen = currentScreen;
  currentScreen = id;
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active', 'screen-transitioning');
    s.style.display = 'none';
  });
  const el = document.getElementById(id);
  el.style.display = 'flex';
  el.classList.add('active');
  requestAnimationFrame(() => el.classList.add('screen-transitioning'));
  if (prevScreen === 'screen-match' && id !== 'screen-match') {
    if (typeof stopMatchTimer === 'function') stopMatchTimer();
  }
  if (id === 'screen-data') {
    refreshQuestionSetUI();
  }
  if (id === 'screen-menu') updateMenuUI();
  if (id === 'screen-settings') renderSettingsScreen();
  if (id === 'screen-stats') renderStatsScreen();
}
```

(This is purely additive: one `classList.remove` gains a second argument, and one `requestAnimationFrame` line is added. Nothing else changes — the `screen-roadmap` hook is added by Task 6, not here.)

- [ ] **Step 4: Manually verify in the browser**

Run: `python -m http.server` (from repo root), open `http://localhost:8000`
Expected: navigating between any two screens (e.g. Menu → Settings → Menu) shows a brief fade-up on the incoming screen instead of an instant snap. Toggle "disable animations" in Settings and confirm the snap returns (no animation) — the `animations-disabled` override from Step 2 is doing its job.

- [ ] **Step 5: Commit**

```bash
git add js/main.js css/animations.css css/base.css
git commit -m "feat(ui): add fade-up transition to all screen changes"
```

---

### Task 4: Menu button stagger-in animation

**Files:**
- Modify: `js/main.js:112-132` (`showScreen`, the `screen-menu` branch)
- Modify: `css/menu.css` (append stagger rules)
- Modify: `css/base.css` (add the `animations-disabled` override)

**Interfaces:**
- Consumes: `showScreen()` from Task 3 (this task edits the same function again, adding to the `if (id === 'screen-menu')` branch).
- Produces: nothing new consumed by later tasks — this is a leaf, purely cosmetic.

- [ ] **Step 1: Add the stagger CSS to `css/menu.css`**

Append to the end of `css/menu.css`:

```css
/* ─── Menu Button Stagger-In ─────────────────────── */
.main-nav.menu-nav-animate .menu-btn { opacity: 0; animation: slideIn .35s ease forwards; }
.main-nav.menu-nav-animate .menu-btn:nth-child(1)  { animation-delay: .00s; }
.main-nav.menu-nav-animate .menu-btn:nth-child(2)  { animation-delay: .03s; }
.main-nav.menu-nav-animate .menu-btn:nth-child(3)  { animation-delay: .06s; }
.main-nav.menu-nav-animate .menu-btn:nth-child(4)  { animation-delay: .09s; }
.main-nav.menu-nav-animate .menu-btn:nth-child(5)  { animation-delay: .12s; }
.main-nav.menu-nav-animate .menu-btn:nth-child(6)  { animation-delay: .15s; }
.main-nav.menu-nav-animate .menu-btn:nth-child(7)  { animation-delay: .18s; }
.main-nav.menu-nav-animate .menu-btn:nth-child(8)  { animation-delay: .21s; }
.main-nav.menu-nav-animate .menu-btn:nth-child(9)  { animation-delay: .24s; }
.main-nav.menu-nav-animate .menu-btn:nth-child(10) { animation-delay: .27s; }
.main-nav.menu-nav-animate .menu-btn:nth-child(11) { animation-delay: .30s; }
```

(`slideIn` already exists in `css/animations.css:47-50` — no new keyframe needed. 11 rules cover the 10 existing menu buttons plus the new "🌌 LỘ TRÌNH" button Task 6 adds.)

- [ ] **Step 2: Add the `animations-disabled` override to `css/base.css`**

Add this line to the existing override block (right after the line Task 3 added):

```css
body.animations-disabled .main-nav.menu-nav-animate .menu-btn { animation: none !important; opacity: 1; }
```

- [ ] **Step 3: Trigger the animation class from `showScreen()`**

In `js/main.js`, change this one line inside `showScreen()`:

```js
  if (id === 'screen-menu') updateMenuUI();
```

to:

```js
  if (id === 'screen-menu') {
    updateMenuUI();
    const nav = document.querySelector('.main-nav');
    if (nav) {
      nav.classList.remove('menu-nav-animate');
      requestAnimationFrame(() => nav.classList.add('menu-nav-animate'));
    }
  }
```

- [ ] **Step 4: Manually verify in the browser**

Run: `python -m http.server` (from repo root), open `http://localhost:8000`
Expected: on load (and every time you navigate back to the main menu), the nav buttons fade/slide in one after another top-to-bottom instead of all appearing at once. With "disable animations" on, they all appear instantly instead.

- [ ] **Step 5: Commit**

```bash
git add js/main.js css/menu.css css/base.css
git commit -m "feat(ui): stagger the main menu buttons in on every menu entry"
```

---

### Task 5: Roadmap progress computation (`js/roadmap.js` pure logic)

**Files:**
- Create: `js/roadmap.js`
- Test: `tests/roadmap.test.js`

**Interfaces:**
- Consumes: `generateQuestionId(q)` (`js/game-utils.js:24`, returns e.g. `"q-1a2b3c"`), the global `questionStats` object (`js/main.js:14`, shape `{ [scopedId]: { [gameType]: { correctCount, incorrect, ... }, _meta?: {...} } }`).
- Produces (used by Task 6/7):
  - `computeSetProgress(setId, questionsArr)` → `{ correct: number, wrong: number, total: number, accuracy: number }`
  - `starsForProgress(progress)` → integer `0`–`3`
  - `renderStarString(stars)` → 3-character string like `"★★☆"`
  - `roadmapQuestionsCache` (module-level `Map`, id → questions array) and `getRoadmapQuestionsForSet(meta)` (async, returns that set's `questions` array, reusing the active set's already-loaded array and caching everything else)

- [ ] **Step 1: Write the failing tests**

Create `tests/roadmap.test.js`:

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const gameUtilsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'game-utils.js'), 'utf8');
const roadmapSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'roadmap.js'), 'utf8');

function createContext() {
  const context = {
    console,
    questions: [],
    questionSets: [],
    activeSetId: null,
    questionStats: {},
    settings: { shuffleAnswers: true }
  };
  vm.createContext(context);
  vm.runInContext(
    `${gameUtilsSource}
${roadmapSource}
this.setQuestionStats = (value) => { questionStats = value; };
this.computeSetProgress = computeSetProgress;
this.starsForProgress = starsForProgress;
this.renderStarString = renderStarString;
this.generateQuestionId = generateQuestionId;`,
    context
  );
  return context;
}

const questionA = { word: 'A', q: 'qA', romaji: 'a', translation: 'ta' };
const questionB = { word: 'B', q: 'qB', romaji: 'b', translation: 'tb' };

function testComputeSetProgressSumsAcrossGameTypesForTargetSetOnly() {
  const context = createContext();
  const idA = context.generateQuestionId(questionA);
  context.setQuestionStats({
    [`set-a::${idA}`]: { quiz: { correctCount: 3, incorrect: 1 }, listen: { correctCount: 2, incorrect: 0 } },
    [`set-b::${idA}`]: { quiz: { correctCount: 99, incorrect: 99 } }
  });

  const progress = context.computeSetProgress('set-a', [questionA]);
  assert.strictEqual(progress.correct, 5);
  assert.strictEqual(progress.wrong, 1);
  assert.strictEqual(progress.total, 6);
  assert.ok(Math.abs(progress.accuracy - 5 / 6) < 1e-9);
}

function testComputeSetProgressIgnoresMetaKey() {
  const context = createContext();
  const idA = context.generateQuestionId(questionA);
  context.setQuestionStats({
    [`set-a::${idA}`]: { _meta: { cooldowns: {} }, quiz: { correctCount: 1, incorrect: 0 } }
  });

  const progress = context.computeSetProgress('set-a', [questionA]);
  assert.strictEqual(progress.correct, 1);
  assert.strictEqual(progress.wrong, 0);
}

function testComputeSetProgressReturnsZeroForUnattemptedQuestions() {
  const context = createContext();
  const progress = context.computeSetProgress('set-a', [questionA, questionB]);
  assert.deepStrictEqual(progress, { correct: 0, wrong: 0, total: 0, accuracy: 0 });
}

function testStarsForProgressThresholds() {
  const context = createContext();
  assert.strictEqual(context.starsForProgress({ total: 0, accuracy: 0 }), 0);
  assert.strictEqual(context.starsForProgress({ total: 10, accuracy: 0.49 }), 1);
  assert.strictEqual(context.starsForProgress({ total: 10, accuracy: 0.5 }), 2);
  assert.strictEqual(context.starsForProgress({ total: 10, accuracy: 0.79 }), 2);
  assert.strictEqual(context.starsForProgress({ total: 10, accuracy: 0.8 }), 3);
}

function testRenderStarStringPadsToThreeCharacters() {
  const context = createContext();
  assert.strictEqual(context.renderStarString(0), '☆☆☆');
  assert.strictEqual(context.renderStarString(2), '★★☆');
  assert.strictEqual(context.renderStarString(3), '★★★');
}

testComputeSetProgressSumsAcrossGameTypesForTargetSetOnly();
testComputeSetProgressIgnoresMetaKey();
testComputeSetProgressReturnsZeroForUnattemptedQuestions();
testStarsForProgressThresholds();
testRenderStarStringPadsToThreeCharacters();

console.log('roadmap tests passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/roadmap.test.js`
Expected: FAIL — `Cannot find module`/`ENOENT` reading `js/roadmap.js` (it doesn't exist yet).

- [ ] **Step 3: Create `js/roadmap.js` with the pure computation functions**

Create `js/roadmap.js`:

```js
// ================================================
// 日本語 QUEST — Roadmap Module
// ================================================

const ROADMAP_LEVEL_ICONS = { N5: '🌍', N4: '🪐' };
const ROADMAP_DEFAULT_LEVEL_ICON = '🌌';
const roadmapQuestionsCache = new Map();

function computeSetProgress(setId, questionsArr) {
  let correct = 0;
  let wrong = 0;
  questionsArr.forEach(q => {
    const key = `${setId}::${generateQuestionId(q)}`;
    const stats = questionStats[key];
    if (!stats) return;
    Object.keys(stats).forEach(gameType => {
      if (gameType === '_meta') return;
      const typeStats = stats[gameType];
      correct += typeStats.correctCount || 0;
      wrong += typeStats.incorrect || 0;
    });
  });
  const total = correct + wrong;
  return { correct, wrong, total, accuracy: total > 0 ? correct / total : 0 };
}

function starsForProgress(progress) {
  if (progress.total === 0) return 0;
  if (progress.accuracy < 0.5) return 1;
  if (progress.accuracy < 0.8) return 2;
  return 3;
}

function renderStarString(stars) {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars);
}

async function getRoadmapQuestionsForSet(meta) {
  if (meta.id === activeSetId) return questions;
  if (roadmapQuestionsCache.has(meta.id)) return roadmapQuestionsCache.get(meta.id);
  const set = await fetchQuestionSetFile(meta.file);
  roadmapQuestionsCache.set(meta.id, set.questions);
  return set.questions;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/roadmap.test.js`
Expected: PASS (`roadmap tests passed`).

- [ ] **Step 5: Run the full root test suite to confirm nothing else broke**

Run: `node tests/run-all.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/roadmap.js tests/roadmap.test.js
git commit -m "feat(roadmap): add per-set progress/star computation logic"
```

---

### Task 6: Roadmap screen UI — markup, styles, menu entry, rendering

**Files:**
- Modify: `index.html` (head `<link>`, new screen markup, new menu button, new `<script>` tag)
- Create: `css/roadmap.css`
- Modify: `js/roadmap.js` (add `renderRoadmap()`)
- Modify: `js/main.js:112-138` (`showScreen`, add the `screen-roadmap` hook)

**Interfaces:**
- Consumes: `computeSetProgress`, `starsForProgress`, `renderStarString`, `getRoadmapQuestionsForSet`, `roadmapQuestionsCache` (all from Task 5); `questionSets`, `activeSetId` (globals, `js/main.js:6-7`); `escapeHtml` (`js/main.js:312`).
- Produces (used by Task 7): the rendered `#roadmap-track` DOM (`.roadmap-node[data-set-id]` buttons with an `onclick="launchRoadmapNode('...')"` that Task 7 implements), and the `renderRoadmap()` function itself, called by `showScreen('screen-roadmap')`.

- [ ] **Step 1: Add the roadmap stylesheet link and menu button to `index.html`**

In the `<head>`, add this line right after `<link rel="stylesheet" href="css/menu.css">` (currently line 12):

```html
  <link rel="stylesheet" href="css/roadmap.css">
```

In the main nav (`<nav class="main-nav">`, currently starting at line 65), insert this new button as the **first** child, right after the opening `<nav class="main-nav">` tag and before the existing `btn-quiz` button:

```html
          <button class="menu-btn btn-roadmap" onclick="showScreen('screen-roadmap')">
            <span class="btn-icon">🌌</span>
            <span class="btn-text">LỘ TRÌNH<br><small>Hành trình học tập</small></span>
            <span class="btn-arrow">▶</span>
          </button>
```

Add the new screen markup right after the `screen-data` screen's closing `</div>` (currently line 146), before the `<!-- FAST CORRECT COOLDOWN MODAL -->` comment (currently line 148):

```html

  <!-- ROADMAP -->
  <div id="screen-roadmap" class="screen screen-roadmap">
    <div class="panel roadmap-panel">
      <h2 class="panel-title">🌌 LỘ TRÌNH</h2>
      <div class="roadmap-track" id="roadmap-track"></div>
      <button class="back-btn" onclick="showScreen('screen-menu')">◀ BACK TO MENU</button>
    </div>
  </div>
```

Add the script tag right after `<script src="js/storage.js"></script>` (currently line 707):

```html
  <script src="js/roadmap.js"></script>
```

- [ ] **Step 2: Create `css/roadmap.css`**

Create `css/roadmap.css`:

```css
/* ================================================
   Roadmap Screen — Climbing to the Universe
   ================================================ */

.screen-roadmap {
  background: linear-gradient(
    to top,
    rgba(255, 159, 10, 0.10) 0%,
    rgba(10, 10, 18, 0) 35%,
    rgba(10, 10, 18, 0) 65%,
    rgba(90, 60, 200, 0.20) 100%
  );
}

.roadmap-panel { max-width: 640px; gap: 12px; }

.roadmap-track {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 46px;
  padding: 20px 4px 40px;
  position: relative;
}

.roadmap-loading {
  font-family: var(--font-px);
  font-size: 9px;
  color: var(--text-dim);
  text-align: center;
  padding: 24px 0;
}

.roadmap-section-label {
  align-self: center;
  font-family: var(--font-px);
  font-size: 10px;
  color: var(--accent2);
  text-shadow: var(--glow-y);
  letter-spacing: 2px;
  margin: 8px 0 -10px;
}

.roadmap-node {
  position: relative;
  width: 78%;
  max-width: 380px;
  padding: 14px 16px;
  background: var(--panel);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  color: var(--text);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  font-family: var(--font-jp);
  transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
  animation: cardEnter .4s ease both;
  animation-delay: calc(var(--i, 0) * 0.06s);
}
.roadmap-node:hover { transform: scale(1.04); box-shadow: var(--glow-b); }
.roadmap-node:active { transform: scale(0.98); }

.roadmap-node-left { align-self: flex-start; margin-left: 4%; }
.roadmap-node-right { align-self: flex-end; margin-right: 4%; }

.roadmap-node::after {
  content: '';
  position: absolute;
  left: 50%; bottom: -46px;
  width: 3px; height: 46px;
  background: linear-gradient(to bottom, var(--border), transparent);
  transform: translateX(-50%);
  pointer-events: none;
}
.roadmap-node:last-child::after { display: none; }
.roadmap-node-played::after {
  background: linear-gradient(to bottom, var(--accent3), transparent);
  animation: connectorGlow 2s ease-in-out infinite;
}

.roadmap-node-icon { font-size: 22px; flex-shrink: 0; }
.roadmap-node-body { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.roadmap-node-name { font-size: 13px; font-weight: 700; }
.roadmap-node-meta { font-size: 10px; color: var(--text-dim); font-family: var(--font-px); letter-spacing: 1px; }

.roadmap-avatar {
  position: absolute;
  top: -30px; left: 50%;
  transform: translateX(-50%);
  font-size: 24px;
  animation: avatarFloat 2.4s ease-in-out infinite;
}

@media (min-width: 1024px) {
  .roadmap-panel { max-width: 900px; }
  .roadmap-node { max-width: 520px; padding: 21px 24px; }
  .roadmap-node-icon { font-size: 33px; }
  .roadmap-node-name { font-size: 19.5px; }
  .roadmap-node-meta { font-size: 15px; }
  .roadmap-section-label { font-size: 15px; }
}
```

- [ ] **Step 3: Add the roadmap-specific keyframes to `css/animations.css`**

Append to the end of `css/animations.css`:

```css
/* ─── Roadmap ─────────────────────────────────────── */
@keyframes avatarFloat {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50% { transform: translateX(-50%) translateY(-6px); }
}

@keyframes connectorGlow {
  0%, 100% { opacity: .6; }
  50% { opacity: 1; }
}
```

(`cardEnter`, used by `.roadmap-node`, already exists at `css/animations.css:41-44` — no change needed there.)

- [ ] **Step 4: Add the `animations-disabled` overrides for the new roadmap classes to `css/base.css`**

Add these two lines to the existing override block (after the ones Task 3/4 added):

```css
body.animations-disabled .roadmap-node { animation: none !important; transition: none; }
body.animations-disabled .roadmap-avatar { animation: none !important; }
```

- [ ] **Step 5: Implement `renderRoadmap()` in `js/roadmap.js`**

Append to `js/roadmap.js` (after `getRoadmapQuestionsForSet`):

```js
async function renderRoadmap() {
  const track = document.getElementById('roadmap-track');
  if (!track) return;
  track.innerHTML = '<div class="roadmap-loading">Đang tải lộ trình…</div>';

  const sorted = [...questionSets].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  const entries = await Promise.all(sorted.map(async meta => {
    const setQuestions = await getRoadmapQuestionsForSet(meta);
    const progress = computeSetProgress(meta.id, setQuestions);
    return { meta, progress, stars: starsForProgress(progress) };
  }));

  let html = '';
  let lastLevel = null;
  entries.forEach((entry, i) => {
    const { meta, progress, stars } = entry;
    const level = meta.level || 'N/A';
    if (level !== lastLevel) {
      const levelIcon = ROADMAP_LEVEL_ICONS[level] || ROADMAP_DEFAULT_LEVEL_ICON;
      html += `<div class="roadmap-section-label">${levelIcon} ${escapeHtml(level)}</div>`;
      lastLevel = level;
    }
    const side = i % 2 === 0 ? 'roadmap-node-left' : 'roadmap-node-right';
    const playedClass = progress.total > 0 ? 'roadmap-node-played' : '';
    const isActive = meta.id === activeSetId;
    const categoryIcon = meta.category === 'grammar' ? '🧩' : '📖';
    html += `
      <button class="roadmap-node ${side} ${playedClass}" style="--i:${i}" data-set-id="${escapeHtml(meta.id)}" onclick="launchRoadmapNode('${escapeHtml(meta.id)}')">
        ${isActive ? '<span class="roadmap-avatar" aria-hidden="true">🚀</span>' : ''}
        <span class="roadmap-node-icon">${categoryIcon}</span>
        <span class="roadmap-node-body">
          <span class="roadmap-node-name">${escapeHtml(meta.name)}</span>
          <span class="roadmap-node-meta">${meta.questionCount} câu · ${renderStarString(stars)}</span>
        </span>
      </button>`;
  });

  track.innerHTML = html;

  requestAnimationFrame(() => {
    const activeEl = track.querySelector(`.roadmap-node[data-set-id="${activeSetId}"]`) || track.querySelector('.roadmap-node:last-child');
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
```

- [ ] **Step 6: Wire the `screen-roadmap` hook into `showScreen()`**

In `js/main.js`, add one line to the `showScreen` function (the same function Task 3/4 already modified): right after `if (id === 'screen-stats') renderStatsScreen();`, add:

```js
  if (id === 'screen-roadmap') renderRoadmap();
```

- [ ] **Step 7: Manually verify in the browser**

Run: `python -m http.server` (from repo root), open `http://localhost:8000`
Expected: the main menu now has a "🌌 LỘ TRÌNH" button at the top. Clicking it shows all 7 sets grouped under "🌍 N5" and "🪐 N4" labels, ordered N5 core → N5 grammar → N4 kanji → the four N4 Bài 26 sets from bottom to top, each showing its question count and a star string. The currently active set shows a 🚀 above its node. Clicking a node currently throws a browser console error (`launchRoadmapNode is not defined`) and does not navigate — that's expected until Task 7 defines that function; the screen itself renders correctly regardless.

- [ ] **Step 8: Commit**

```bash
git add index.html css/roadmap.css css/animations.css css/base.css js/roadmap.js js/main.js
git commit -m "feat(roadmap): add screen-roadmap UI rendering all question sets as a climbing path"
```

---

### Task 7: Roadmap node click behavior + avatar launch animation

**Files:**
- Modify: `js/roadmap.js` (add `launchRoadmapNode`)
- Modify: `css/roadmap.css` (launch animation trigger class)
- Modify: `css/animations.css` (`avatarLaunch` keyframe)
- Modify: `css/base.css` (`animations-disabled` override)

**Interfaces:**
- Consumes: `switchQuestionSet(id)` (`js/storage.js:41`, unmodified — already updates `activeSetId`, refetches `questions`, persists to storage, refreshes the data-screen selector and menu UI), `showScreen(id)` (`js/main.js`, unmodified).
- Produces: nothing consumed by later tasks — this is the last functional piece of the roadmap feature.

- [ ] **Step 1: Add the launch keyframe to `css/animations.css`**

Append to the "Roadmap" section added in Task 6:

```css
@keyframes avatarLaunch {
  0% { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
  100% { transform: translateX(-50%) translateY(-60px) scale(1.3); opacity: 0; }
}
```

- [ ] **Step 2: Add the launch-trigger rule to `css/roadmap.css`**

Append to `css/roadmap.css`:

```css
.roadmap-node-launch .roadmap-avatar { animation: avatarLaunch .3s ease-out forwards; }
.roadmap-node-launch { transform: scale(1.08); box-shadow: var(--glow-g); }
```

(`.roadmap-node-launch .roadmap-avatar` has higher specificity than the plain `.roadmap-avatar` idle-float rule from Task 6, so it correctly overrides it while the class is present.)

- [ ] **Step 3: Add the `animations-disabled` override**

Add to the existing override block in `css/base.css`:

```css
body.animations-disabled .roadmap-node-launch .roadmap-avatar { animation: none !important; }
```

- [ ] **Step 4: Implement `launchRoadmapNode` in `js/roadmap.js`**

Append to `js/roadmap.js`:

```js
function launchRoadmapNode(id) {
  const nodeEl = document.querySelector(`.roadmap-node[data-set-id="${id}"]`);
  if (nodeEl) nodeEl.classList.add('roadmap-node-launch');
  switchQuestionSet(id);
  setTimeout(() => showScreen('screen-menu'), 220);
}
```

- [ ] **Step 5: Manually verify the full roadmap flow end-to-end**

Run: `python -m http.server` (from repo root), open `http://localhost:8000`

Checklist:
- Click "🌌 LỘ TRÌNH" from the main menu — the 7 nodes render grouped and ordered correctly (as verified in Task 6).
- Click a node that is *not* the currently active set. Expected: a brief scale/glow "launch" pulse plays on that node, then the screen switches to the main menu with that set now active (check the game buttons filtered by its category, matching the existing category-filter behavior).
- Go back to "🌌 LỘ TRÌNH" — the 🚀 avatar now sits on the node you just switched to.
- Play a few questions in any game for the active set, answer some correctly, then return to the roadmap. Expected: that node's star string reflects the new accuracy, and its connector line below it now glows (green pulse) because `progress.total > 0`.
- Toggle "disable animations" in Settings, repeat the node click. Expected: no scale/glow pulse, no avatar-launch animation, but the set switch and screen change still work correctly.

- [ ] **Step 6: Run the full test suite one last time**

Run: `node tests/run-all.js` (from repo root) and `cd mcp-server && npm test`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add js/roadmap.js css/roadmap.css css/animations.css css/base.css
git commit -m "feat(roadmap): wire node clicks to switch question sets with a launch animation"
```
