# Multi-Roadmap + Library Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single roadmap into multiple named roadmaps ("N5 Path", "N4 Path") selectable via tabs, translate all roadmap-facing UI text to English, and integrate a mini roadmap preview into a renamed "📚 LIBRARY" screen (formerly "📦 QUESTION SETS") with its own Sets/Roadmaps tabs.

**Architecture:** Extends the existing vanilla JS/CSS roadmap feature (`js/roadmap.js`, `css/roadmap.css`) with a `roadmapId` grouping field and a shared node-list/chip-list HTML builder reused by three surfaces: the full-screen roadmap (navigates away on click), and two Library tabs (update in place on click). No build step, no new dependencies — matches the existing codebase exactly.

**Tech Stack:** Vanilla JS (no modules), vanilla CSS, Node's built-in `assert`/`vm` for tests, `zod` for the MCP server's tool schemas.

## Global Constraints

- No build system, no bundler, no new dependencies.
- No sequential locking — every set stays playable regardless of roadmap membership; a set with no `roadmapId` is simply absent from every roadmap view.
- `roadmapId` (like `order`/`level`) is manifest-only — never duplicated into the question-set JSON file itself.
- `level` field and its mcp-server support are untouched — it stops driving the roadmap's visual grouping but keeps its existing manifest/mcp-server behavior unchanged.
- All new/touched roadmap-facing strings are in English (see the design doc's copy table). No other existing Vietnamese copy in the app is touched.
- Node clicks on the full-screen `screen-roadmap` keep navigating to `screen-menu` afterward (unchanged). Node clicks inside either Library tab update the active set **in place** — Library stays open.

Full design detail: `docs/superpowers/specs/2026-08-10-multi-roadmap-library-design.md`.

---

### Task 1: Data model — `roadmapId` field, mcp-server support, manifest update

**Files:**
- Modify: `questions/manifest.json` (add top-level `roadmaps`, add `roadmapId` to all 7 `sets` entries)
- Modify: `mcp-server/src/questions-repo.js:107-125` (`createQuestionSet`)
- Modify: `mcp-server/src/index.js:86-101` (`create_question_set` tool schema)
- Modify: `js/storage.js:6-39` (`fetchQuestionsManifest`, `initQuestionSets`)
- Modify: `js/main.js:6` (add `roadmapDefinitions` global)
- Test: `mcp-server/test/questions-repo.test.js` (extend)
- Test: `tests/questions-data.test.js` (extend)
- Test: `tests/init-question-sets.test.js` (extend)

**Interfaces:**
- Produces: the global `roadmapDefinitions` array (`{id, name}[]`), populated by `initQuestionSets()` from `manifest.roadmaps` (defaults to `[]` if absent) — read by Task 2's helpers and Task 3/5's tab renderers.
- Produces: every entry in the global `questionSets` array may now have `.roadmapId` (string) — read by Task 2's `getSetsForRoadmap`.

- [ ] **Step 1: Write the failing mcp-server tests for `roadmapId`**

Add to `mcp-server/test/questions-repo.test.js`, after the existing order/level tests (before the bottom call-list):

```js
function testCreateQuestionSetPersistsValidRoadmapId() {
  const dir = makeTempQuestionsDir();
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ roadmaps: [{ id: 'demo-path', name: 'Demo Path' }], sets: [] }, null, 2));
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', roadmapId: 'demo-path' });

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.sets[0].roadmapId, 'demo-path');
}

function testCreateQuestionSetRejectsUnknownRoadmapId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  assert.throws(() => repo.createQuestionSet({ id: 'demo', name: 'Demo', roadmapId: 'nope' }), /Unknown roadmapId: nope/);
}

function testCreateQuestionSetLeavesRoadmapIdUnsetWhenOmitted() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo' });

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.strictEqual('roadmapId' in manifest.sets[0], false);
}
```

Add the three calls at the bottom, right before `console.log('questions-repo tests passed');`:

```js
testCreateQuestionSetPersistsValidRoadmapId();
testCreateQuestionSetRejectsUnknownRoadmapId();
testCreateQuestionSetLeavesRoadmapIdUnsetWhenOmitted();
```

- [ ] **Step 2: Run the mcp-server tests to verify the new ones fail**

Run: `cd mcp-server && npm test`
Expected: FAIL — `createQuestionSet` doesn't recognize `roadmapId` yet, so the first new test's assertion on `manifest.sets[0].roadmapId` fails (`undefined !== 'demo-path'`), and the second test's `assert.throws` fails because nothing throws today.

- [ ] **Step 3: Implement `roadmapId` in `createQuestionSet`**

In `mcp-server/src/questions-repo.js`, replace the `createQuestionSet` function (currently lines 107-125):

```js
  function createQuestionSet({ id, name, description = '', category = 'vocabulary', order, level, roadmapId, questions = [] }) {
    const manifest = readManifest();
    const setId = id ? slugify(id) : slugify(name);
    if (!setId) throw new Error('Could not derive a valid id from the provided name/id');
    if (findEntry(manifest, setId)) throw new Error(`Question set id already exists: ${setId}`);
    if (roadmapId !== undefined) {
      const knownRoadmaps = Array.isArray(manifest.roadmaps) ? manifest.roadmaps : [];
      if (!knownRoadmaps.some(r => r.id === roadmapId)) {
        throw new Error(`Unknown roadmapId: ${roadmapId}. Known roadmaps: ${knownRoadmaps.map(r => r.id).join(', ') || '(none)'}`);
      }
    }
    for (const q of questions) {
      const error = validateQuestion(q, category);
      if (error) throw new Error(error);
    }
    const now = new Date().toISOString();
    const file = `${setId}.json`;
    const set = { id: setId, name, description, category, createdAt: now, updatedAt: now, questions };
    writeSetFile(file, set);
    const resolvedOrder = Number.isInteger(order) ? order : Math.max(0, ...manifest.sets.map(s => s.order ?? 0)) + 1;
    const resolvedLevel = typeof level === 'string' && level.length > 0 ? level : 'N/A';
    const entry = { id: setId, file, name, category, order: resolvedOrder, level: resolvedLevel, questionCount: questions.length, updatedAt: now };
    if (roadmapId !== undefined) entry.roadmapId = roadmapId;
    manifest.sets.push(entry);
    writeManifest(manifest);
    return set;
  }
```

- [ ] **Step 4: Run the mcp-server tests to verify they pass**

Run: `cd mcp-server && npm test`
Expected: PASS (all tests, including the three new ones).

- [ ] **Step 5: Add `roadmapId` to the MCP tool schema**

In `mcp-server/src/index.js`, in the `create_question_set` tool's `inputSchema` (currently lines 91-99), add one line after `level: z.string().optional(),`:

```js
      roadmapId: z.string().optional(),
```

- [ ] **Step 6: Update `questions/manifest.json` with `roadmaps` and `roadmapId`**

Replace the full contents of `questions/manifest.json`:

```json
{
  "roadmaps": [
    { "id": "n5-path", "name": "N5 Path" },
    { "id": "n4-path", "name": "N4 Path" }
  ],
  "sets": [
    {
      "id": "n5-core",
      "file": "n5-core.json",
      "name": "N5 Core Vocabulary",
      "category": "vocabulary",
      "order": 1,
      "level": "N5",
      "roadmapId": "n5-path",
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
      "roadmapId": "n5-path",
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
      "roadmapId": "n4-path",
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
      "roadmapId": "n4-path",
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
      "roadmapId": "n4-path",
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
      "roadmapId": "n4-path",
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
      "roadmapId": "n4-path",
      "questionCount": 10,
      "updatedAt": "2026-08-07T10:00:33.868Z"
    }
  ]
}
```

- [ ] **Step 7: Add the referential-integrity test**

Add to `tests/questions-data.test.js`, right after `testEveryManifestEntryHasUniqueOrderAndNonEmptyLevel()`'s definition:

```js
function testEverySetRoadmapIdReferencesAKnownRoadmap() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  const roadmapIds = new Set((manifest.roadmaps || []).map(r => r.id));
  manifest.sets.forEach(entry => {
    if (entry.roadmapId === undefined) return;
    assert.ok(roadmapIds.has(entry.roadmapId), `${entry.id}.roadmapId "${entry.roadmapId}" must reference a known roadmap`);
  });
}
```

Add the call at the bottom, right before `console.log('questions data tests passed');`:

```js
testEverySetRoadmapIdReferencesAKnownRoadmap();
```

- [ ] **Step 8: Update `js/storage.js` to load `roadmapDefinitions` from the manifest**

Replace `fetchQuestionsManifest()` (currently lines 6-12):

```js
async function fetchQuestionsManifest() {
  const res = await fetch('questions/manifest.json');
  if (!res.ok) throw new Error(`Failed to load questions/manifest.json (${res.status})`);
  const manifest = await res.json();
  if (!manifest || !Array.isArray(manifest.sets)) throw new Error('Invalid manifest.json: missing "sets" array');
  return manifest;
}
```

(Only the return value changes: the whole `manifest` object instead of `manifest.sets`.)

Replace `initQuestionSets()` (currently lines 26-39):

```js
async function initQuestionSets() {
  const manifest = await fetchQuestionsManifest();
  questionSets = manifest.sets;
  roadmapDefinitions = Array.isArray(manifest.roadmaps) ? manifest.roadmaps : [];
  if (questionSets.length === 0) {
    questions = [];
    activeSetId = null;
    return;
  }
  const storedActiveId = localStorage.getItem('jq_active_set');
  const meta = questionSets.find(s => s.id === storedActiveId) || questionSets[0];
  const set = await fetchQuestionSetFile(meta.file);
  activeSetId = meta.id;
  questions = set.questions;
  saveActiveSetId();
}
```

- [ ] **Step 9: Declare the `roadmapDefinitions` global**

In `js/main.js`, add one line right after `let questionSets = [];` (currently line 6):

```js
let roadmapDefinitions = [];
```

- [ ] **Step 10: Extend `tests/init-question-sets.test.js` to cover `roadmapDefinitions`**

In `tests/init-question-sets.test.js`, change the `getState` exposure line (currently line 58) to also return `roadmapDefinitions`:

```js
this.getState = () => ({ questions, questionSets, activeSetId, roadmapDefinitions });
```

Add two new test functions after `testSwitchQuestionSetUpdatesStateAndPersistsPointer()`'s definition:

```js
async function testRoadmapDefinitionsDefaultsToEmptyArrayWhenManifestOmitsIt() {
  const context = createContext(RESPONSES);
  await context.runInitQuestionSets();
  const state = context.getState();
  assert.deepStrictEqual(state.roadmapDefinitions, []);
}

async function testRoadmapDefinitionsPopulateFromManifest() {
  const responsesWithRoadmaps = {
    ...RESPONSES,
    'questions/manifest.json': { ...MANIFEST, roadmaps: [{ id: 'demo-path', name: 'Demo Path' }] }
  };
  const context = createContext(responsesWithRoadmaps);
  await context.runInitQuestionSets();
  const state = context.getState();
  assert.deepStrictEqual(state.roadmapDefinitions, [{ id: 'demo-path', name: 'Demo Path' }]);
}
```

Add both calls inside the bottom `(async () => { ... })();` IIFE, after the existing four calls and before `console.log('init question sets tests passed');`:

```js
  await testRoadmapDefinitionsDefaultsToEmptyArrayWhenManifestOmitsIt();
  await testRoadmapDefinitionsPopulateFromManifest();
```

- [ ] **Step 11: Run the full test suites**

Run: `node tests/run-all.js` (from repo root) and `cd mcp-server && npm test`
Expected: both PASS.

- [ ] **Step 12: Commit**

```bash
git add mcp-server/src/questions-repo.js mcp-server/src/index.js mcp-server/test/questions-repo.test.js questions/manifest.json tests/questions-data.test.js js/storage.js js/main.js tests/init-question-sets.test.js
git commit -m "feat(data): add roadmapId field so question sets can group into named roadmaps"
```

---

### Task 2: Shared roadmap builder functions (`js/roadmap.js`)

**Files:**
- Modify: `js/roadmap.js` (add new functions; existing functions untouched)
- Test: `tests/roadmap.test.js` (extend)

**Interfaces:**
- Consumes: global `questionSets` (each entry may have `.roadmapId`, `.order`, `.category`, `.name`, `.questionCount`), `escapeHtml` (`js/main.js`), `computeSetProgress`/`starsForProgress`/`renderStarString`/`getRoadmapQuestionsForSet` (existing, unchanged, same file).
- Produces (used by Task 3/4/5):
  - `getSetsForRoadmap(roadmapId)` → array of set-meta objects, filtered to that roadmap, sorted descending by `order`.
  - `computeRoadmapProgress(setsForRoadmap)` → `async`, returns `Map<setId, {progress, stars}>`.
  - `buildRoadmapNodesHtml(setsForRoadmap, progressById, {highlightSetId, compact, clickHandler})` → HTML string of `<button class="roadmap-node ...">` fragments.
  - `renderRoadmapChipsHtml(definitions, selectedId, onSelectFnName)` → HTML string of `<button class="roadmap-tab ...">` fragments.
  - `pickDefaultRoadmapId(fallbackId)` → resolves which roadmap id a tab-based view should default to.

This task does **not** touch the existing `renderRoadmap()`/`launchRoadmapNode()` or the `ROADMAP_LEVEL_ICONS`/`ROADMAP_DEFAULT_LEVEL_ICON` constants — those are rewritten/removed in Task 3. This task only adds new, independently-testable functions alongside them.

- [ ] **Step 1: Write the failing tests**

Add to `tests/roadmap.test.js`. First, replace the whole `createContext()` function (currently lines 9-30) — it needs `js/main.js` loaded too, for `escapeHtml` and the `questionSets`/`roadmapDefinitions`/`activeSetId` globals:

```js
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

function createContext() {
  const context = {
    console,
    questions: [],
    questionSets: [],
    roadmapDefinitions: [],
    activeSetId: null,
    questionStats: {},
    settings: { shuffleAnswers: true },
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    window: { addEventListener() {} }
  };
  context.window.document = context.document;
  vm.createContext(context);
  vm.runInContext(
    `${mainSource}
${gameUtilsSource}
${roadmapSource}
this.setQuestionStats = (value) => { questionStats = value; };
this.setQuestionSets = (value) => { questionSets = value; };
this.setActiveSetId = (value) => { activeSetId = value; };
this.computeSetProgress = computeSetProgress;
this.starsForProgress = starsForProgress;
this.renderStarString = renderStarString;
this.generateQuestionId = generateQuestionId;
this.getSetsForRoadmap = getSetsForRoadmap;
this.buildRoadmapNodesHtml = buildRoadmapNodesHtml;
this.renderRoadmapChipsHtml = renderRoadmapChipsHtml;`,
    context
  );
  return context;
}
```

Then add these test functions after `testRenderStarStringPadsToThreeCharacters()`'s definition:

```js
function testGetSetsForRoadmapFiltersAndSortsDescending() {
  const context = createContext();
  context.setQuestionSets([
    { id: 'a', roadmapId: 'p1', order: 1 },
    { id: 'b', roadmapId: 'p2', order: 2 },
    { id: 'c', roadmapId: 'p1', order: 3 }
  ]);
  const result = context.getSetsForRoadmap('p1');
  assert.deepStrictEqual(result.map(s => s.id), ['c', 'a']);
}

function testBuildRoadmapNodesHtmlHighlightsMatchingSetAndEmbedsClickHandler() {
  const context = createContext();
  const sets = [{ id: 'a', name: 'Set A', category: 'vocabulary', questionCount: 5, order: 1 }];
  const progressById = new Map([['a', { progress: { total: 0 }, stars: 0 }]]);
  const html = context.buildRoadmapNodesHtml(sets, progressById, { highlightSetId: 'a', compact: false, clickHandler: 'launchRoadmapNode' });
  assert.ok(html.includes('roadmap-avatar'));
  assert.ok(html.includes('roadmap-node-highlighted'));
  assert.ok(html.includes("launchRoadmapNode('a')"));
  assert.ok(html.includes('roadmap-node-left'));
}

function testBuildRoadmapNodesHtmlCompactModeOmitsZigzagStaggerAndAvatarButKeepsHighlight() {
  const context = createContext();
  const sets = [{ id: 'a', name: 'Set A', category: 'grammar', questionCount: 3, order: 1 }];
  const progressById = new Map([['a', { progress: { total: 2 }, stars: 2 }]]);
  const html = context.buildRoadmapNodesHtml(sets, progressById, { highlightSetId: 'a', compact: true, clickHandler: 'selectRoadmapNodeInPlace' });
  assert.ok(!html.includes('roadmap-node-left'));
  assert.ok(!html.includes('roadmap-node-right'));
  assert.ok(!html.includes('--i:'));
  assert.ok(!html.includes('roadmap-avatar'));
  assert.ok(html.includes('roadmap-node-highlighted'));
  assert.ok(html.includes("selectRoadmapNodeInPlace('a')"));
}

function testRenderRoadmapChipsHtmlMarksSelectedChipActive() {
  const context = createContext();
  const html = context.renderRoadmapChipsHtml(
    [{ id: 'n5-path', name: 'N5 Path' }, { id: 'n4-path', name: 'N4 Path' }],
    'n4-path',
    'selectRoadmapTab'
  );
  const n5ChipMatch = html.match(/<button class="roadmap-tab ([^"]*)" onclick="selectRoadmapTab\('n5-path'\)">/);
  const n4ChipMatch = html.match(/<button class="roadmap-tab ([^"]*)" onclick="selectRoadmapTab\('n4-path'\)">/);
  assert.ok(n5ChipMatch && !n5ChipMatch[1].includes('roadmap-tab-active'));
  assert.ok(n4ChipMatch && n4ChipMatch[1].includes('roadmap-tab-active'));
}
```

Add the four calls at the bottom, before `console.log('roadmap tests passed');`:

```js
testGetSetsForRoadmapFiltersAndSortsDescending();
testBuildRoadmapNodesHtmlHighlightsMatchingSetAndEmbedsClickHandler();
testBuildRoadmapNodesHtmlCompactModeOmitsZigzagStaggerAndAvatarButKeepsHighlight();
testRenderRoadmapChipsHtmlMarksSelectedChipActive();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/roadmap.test.js`
Expected: FAIL — `getSetsForRoadmap`/`buildRoadmapNodesHtml`/`renderRoadmapChipsHtml` are not defined yet.

- [ ] **Step 3: Implement the new functions in `js/roadmap.js`**

Append to `js/roadmap.js` (after the existing `getRoadmapQuestionsForSet` function, before the existing `renderRoadmap` function):

```js
function getSetsForRoadmap(roadmapId) {
  return questionSets.filter(s => s.roadmapId === roadmapId).sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
}

async function computeRoadmapProgress(setsForRoadmap) {
  const progressById = new Map();
  await Promise.all(setsForRoadmap.map(async meta => {
    const setQuestions = await getRoadmapQuestionsForSet(meta);
    const progress = computeSetProgress(meta.id, setQuestions);
    progressById.set(meta.id, { progress, stars: starsForProgress(progress) });
  }));
  return progressById;
}

function buildRoadmapNodesHtml(setsForRoadmap, progressById, { highlightSetId, compact, clickHandler }) {
  let html = '';
  setsForRoadmap.forEach((meta, i) => {
    const entry = progressById.get(meta.id) || { progress: { total: 0 }, stars: 0 };
    const { progress, stars } = entry;
    const side = compact ? '' : (i % 2 === 0 ? 'roadmap-node-left' : 'roadmap-node-right');
    const playedClass = progress.total > 0 ? 'roadmap-node-played' : '';
    const isHighlighted = meta.id === highlightSetId;
    const highlightClass = isHighlighted ? 'roadmap-node-highlighted' : '';
    const showAvatar = isHighlighted && !compact;
    const categoryIcon = meta.category === 'grammar' ? '🧩' : '📖';
    const styleAttr = compact ? '' : ` style="--i:${i}"`;
    html += `
      <button class="roadmap-node ${side} ${playedClass} ${highlightClass}"${styleAttr} data-set-id="${escapeHtml(meta.id)}" onclick="${clickHandler}('${escapeHtml(meta.id)}')">
        ${showAvatar ? '<span class="roadmap-avatar" aria-hidden="true">🚀</span>' : ''}
        <span class="roadmap-node-icon">${categoryIcon}</span>
        <span class="roadmap-node-body">
          <span class="roadmap-node-name">${escapeHtml(meta.name)}</span>
          <span class="roadmap-node-meta">${meta.questionCount} questions · ${renderStarString(stars)}</span>
        </span>
      </button>`;
  });
  return html;
}

function renderRoadmapChipsHtml(definitions, selectedId, onSelectFnName) {
  return definitions.map(def => {
    const activeClass = def.id === selectedId ? 'roadmap-tab-active' : '';
    return `<button class="roadmap-tab ${activeClass}" onclick="${onSelectFnName}('${escapeHtml(def.id)}')">${escapeHtml(def.name)}</button>`;
  }).join('');
}

function pickDefaultRoadmapId(fallbackId) {
  if (fallbackId && roadmapDefinitions.some(d => d.id === fallbackId)) return fallbackId;
  const activeMeta = questionSets.find(s => s.id === activeSetId);
  if (activeMeta && activeMeta.roadmapId && roadmapDefinitions.some(d => d.id === activeMeta.roadmapId)) {
    return activeMeta.roadmapId;
  }
  return roadmapDefinitions.length > 0 ? roadmapDefinitions[0].id : null;
}
```

Note: every node whose `id` matches `highlightSetId` gets the `roadmap-node-highlighted` class regardless of `compact` — Task 4 adds the CSS that turns this into a visible border/glow, used by both compact previews (where it's the *only* highlight signal) and the full screen (where it's a second signal alongside the 🚀 avatar, which `showAvatar` still restricts to non-compact renders only).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/roadmap.test.js`
Expected: PASS (`roadmap tests passed`).

- [ ] **Step 5: Run the full root test suite**

Run: `node tests/run-all.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/roadmap.js tests/roadmap.test.js
git commit -m "feat(roadmap): add shared roadmap-filtering and HTML-builder helpers"
```

---

### Task 3: Full-screen ROADMAP — English rename + roadmap tabs

**Files:**
- Modify: `index.html` (menu button text, screen title, add `#roadmap-tabs` container)
- Modify: `css/roadmap.css` (add `.roadmap-tabs`/`.roadmap-tab`, remove `.roadmap-section-label`)
- Modify: `css/menu.css` (add `.btn-roadmap` accent color)
- Modify: `js/roadmap.js` (rewrite `renderRoadmap`, add `renderRoadmapTrack`/`selectRoadmapTab`, remove `ROADMAP_LEVEL_ICONS`/`ROADMAP_DEFAULT_LEVEL_ICON` and their only use site)

**Interfaces:**
- Consumes: Task 2's `getSetsForRoadmap`, `computeRoadmapProgress`, `buildRoadmapNodesHtml`, `renderRoadmapChipsHtml`, `pickDefaultRoadmapId`.
- Produces: `renderRoadmapTrack()` and `selectRoadmapTab(id)`, called only from within `js/roadmap.js` itself (chip `onclick` attributes) — no other file calls them.

- [ ] **Step 1: Update the main-menu button and screen title text in `index.html`**

Replace the roadmap menu button (currently lines 67-71):

```html
          <button class="menu-btn btn-roadmap" onclick="showScreen('screen-roadmap')">
            <span class="btn-icon">🌌</span>
            <span class="btn-text">ROADMAP<br><small>Your learning journey</small></span>
            <span class="btn-arrow">▶</span>
          </button>
```

Replace the `#screen-roadmap` block (currently lines 154-161):

```html
  <!-- ROADMAP -->
  <div id="screen-roadmap" class="screen screen-roadmap">
    <div class="panel roadmap-panel">
      <h2 class="panel-title">🌌 ROADMAP</h2>
      <div class="roadmap-tabs" id="roadmap-tabs"></div>
      <div class="roadmap-track" id="roadmap-track"></div>
      <button class="back-btn" onclick="showScreen('screen-menu')">◀ BACK TO MENU</button>
    </div>
  </div>
```

- [ ] **Step 2: Add tab/chip CSS and remove the dead section-label CSS in `css/roadmap.css`**

Delete the `.roadmap-section-label` rule (currently lines 34-42):

```css
.roadmap-section-label {
  align-self: center;
  font-family: var(--font-px);
  font-size: 10px;
  color: var(--accent2);
  text-shadow: var(--glow-y);
  letter-spacing: 2px;
  margin: 8px 0 -10px;
}
```

Delete the `.roadmap-section-label` line inside the `@media (min-width: 1024px)` block (its line number shifts once the block above is deleted — find it by its exact content instead):

```css
  .roadmap-section-label { font-size: 15px; }
```

Append to the end of `css/roadmap.css`:

```css
/* ─── Roadmap Tabs / Chips ───────────────────────── */
.roadmap-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-bottom: 8px;
}
.roadmap-tab {
  font-family: var(--font-px);
  font-size: 8px;
  padding: 8px 14px;
  background: var(--panel);
  border: 2px solid var(--border);
  border-radius: 999px;
  color: var(--text-dim);
  cursor: pointer;
  transition: all .15s;
}
.roadmap-tab:hover { border-color: var(--accent2); color: var(--text); }
.roadmap-tab-active {
  border-color: var(--accent2);
  color: var(--accent2);
  text-shadow: var(--glow-y);
  background: rgba(255, 214, 10, 0.08);
}
```

- [ ] **Step 3: Give `.btn-roadmap` its own accent color in `css/menu.css`**

Add to the `::before` color block, right after `.btn-data::before { background: var(--accent3); }`:

```css
.btn-roadmap::before { background: #a78bfa; }
```

Add to the `:hover` block, right after `.btn-data:hover { border-color: var(--accent3); box-shadow: inset 0 0 30px rgba(48,209,88,.08); }`:

```css
.btn-roadmap:hover { border-color: #a78bfa; box-shadow: inset 0 0 30px rgba(167,139,250,.08); }
```

- [ ] **Step 4: Rewrite `renderRoadmap` and add the tab-switching functions in `js/roadmap.js`**

Delete the two dead constants (currently lines 5-6):

```js
const ROADMAP_LEVEL_ICONS = { N5: '🌍', N4: '🪐' };
const ROADMAP_DEFAULT_LEVEL_ICON = '🌌';
```

Add a new module-level state variable near the top of the file (alongside `roadmapQuestionsCache`):

```js
let activeRoadmapTabId = null;
let roadmapProgressCache = new Map();
```

Replace the entire `renderRoadmap` function (currently the function containing the old level-grouping loop) with:

```js
async function renderRoadmap() {
  const tabsEl = document.getElementById('roadmap-tabs');
  const track = document.getElementById('roadmap-track');
  if (!track) return;
  track.innerHTML = '<div class="roadmap-loading">Loading roadmap…</div>';
  if (tabsEl) tabsEl.innerHTML = '';

  try {
    activeRoadmapTabId = pickDefaultRoadmapId(activeRoadmapTabId);
    if (!activeRoadmapTabId) {
      track.innerHTML = '<div class="roadmap-loading">No roadmaps configured yet.</div>';
      return;
    }
    if (tabsEl) tabsEl.innerHTML = renderRoadmapChipsHtml(roadmapDefinitions, activeRoadmapTabId, 'selectRoadmapTab');

    roadmapProgressCache = await computeRoadmapProgress(questionSets);
    renderRoadmapTrack();
  } catch (e) {
    console.error('Failed to render roadmap:', e);
    track.innerHTML = '<div class="roadmap-loading">❌ Failed to load the roadmap. Please try again.</div>';
    if (typeof showToast === 'function') showToast('❌ Failed to load roadmap', 'err');
  }
}

function renderRoadmapTrack() {
  const track = document.getElementById('roadmap-track');
  if (!track) return;
  const sets = getSetsForRoadmap(activeRoadmapTabId);
  track.innerHTML = buildRoadmapNodesHtml(sets, roadmapProgressCache, { highlightSetId: activeSetId, compact: false, clickHandler: 'launchRoadmapNode' });

  requestAnimationFrame(() => {
    const activeEl = track.querySelector(`.roadmap-node[data-set-id="${activeSetId}"]`) || track.querySelector('.roadmap-node:last-child');
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function selectRoadmapTab(id) {
  activeRoadmapTabId = id;
  const tabsEl = document.getElementById('roadmap-tabs');
  if (tabsEl) tabsEl.innerHTML = renderRoadmapChipsHtml(roadmapDefinitions, activeRoadmapTabId, 'selectRoadmapTab');
  renderRoadmapTrack();
}
```

`launchRoadmapNode` (below this in the file) is unchanged — leave it exactly as-is.

- [ ] **Step 5: Manually verify in the browser**

Run: `python -m http.server` (from repo root), open `http://localhost:8000`

- Main menu shows "🌌 ROADMAP" (violet accent stripe) instead of "🌌 LỘ TRÌNH".
- Click it: a tab bar shows "N5 Path" and "N4 Path" chips above the track; the tab containing the currently active set is selected by default and that set's node shows the 🚀 avatar.
- Click the other chip: the track redraws instantly (no loading flash) to that roadmap's own 2-5 nodes, correctly ordered bottom-to-top.
- Click a node: existing launch animation plays, active set switches, screen returns to the main menu (unchanged behavior).
- Re-enter Roadmap: the tab now defaults to whichever roadmap contains the newly active set.

- [ ] **Step 6: Run the full test suite**

Run: `node tests/run-all.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html css/roadmap.css css/menu.css js/roadmap.js
git commit -m "feat(roadmap): add roadmap-switching tabs and translate the full-screen roadmap to English"
```

---

### Task 4: Library screen rename + Sets-tab mini roadmap

**Files:**
- Modify: `index.html` (menu button rename, `screen-data` → `screen-library` id, library tab-bar markup, wrap existing dropdown content, Roadmaps-tab shell)
- Modify: `js/main.js` (`showScreen` hook rename)
- Modify: `js/storage.js` (`refreshQuestionSetUI` gains one hook line)
- Modify: `js/roadmap.js` (add `renderLibrarySetsTab`, `selectRoadmapNodeInPlace`, `selectLibraryTab`, `refreshLibraryRoadmapPreview`)
- Modify: `css/roadmap.css` (add `.roadmap-track-mini` modifier)
- Modify: `css/extra.css` (add `.library-tabs`/`.library-tab-btn`)

**Interfaces:**
- Consumes: Task 2's `getSetsForRoadmap`, `computeRoadmapProgress`, `buildRoadmapNodesHtml`.
- Produces: `selectLibraryTab('sets' | 'roadmaps')`, `renderLibrarySetsTab()`, `selectRoadmapNodeInPlace(id)`, `refreshLibraryRoadmapPreview()` — the last one is called by `js/storage.js`'s `refreshQuestionSetUI()` (guarded by `typeof`) and, later, by Task 5's `selectLibraryRoadmap`. `selectLibraryTab`'s `roadmaps` branch and `refreshLibraryRoadmapPreview`'s Roadmaps-tab branch both call `renderLibraryRoadmapsTab` guarded by `typeof renderLibraryRoadmapsTab === 'function'` — that function doesn't exist until Task 5, so clicking the "Roadmaps" tab button in this task's intermediate state shows an empty (but non-throwing) panel. This is expected and is called out in this task's own manual-verification step.

- [ ] **Step 1: Rename the Library menu button and screen markup in `index.html`**

Replace the data/library menu button (currently lines 117-121):

```html
          <button class="menu-btn btn-data" onclick="showScreen('screen-library')">
            <span class="btn-icon">📚</span>
            <span class="btn-text">LIBRARY<br><small>Choose a set</small></span>
            <span class="btn-arrow">▶</span>
          </button>
```

Replace the `#screen-data` block (currently lines 131-152) — note the `id` becomes `screen-library`, the `class` list keeps `screen-data` (it's the internal CSS hook used by ~15 rules in `css/extra.css`, unrelated to the outward-facing name):

```html
  <!-- LIBRARY -->
  <div id="screen-library" class="screen screen-data">
    <div class="panel">
      <h2 class="panel-title">📚 LIBRARY</h2>
      <div class="library-tabs">
        <button id="library-tab-btn-sets" class="library-tab-btn library-tab-active" onclick="selectLibraryTab('sets')">Sets</button>
        <button id="library-tab-btn-roadmaps" class="library-tab-btn" onclick="selectLibraryTab('roadmaps')">Roadmaps</button>
      </div>
      <div id="library-sets-tab">
        <div class="form-group">
          <label>Choose a question set</label>
          <div class="btn-row">
            <select id="question-set-selector" onchange="switchQuestionSet(this.value)"></select>
          </div>
        </div>
        <div class="form-group">
          <label>Active set: <span id="active-set-name">-</span></label>
        </div>
        <div class="form-group">
          <label>Questions in this set: <span id="current-count">0</span></label>
        </div>
        <div class="form-group">
          <label>Question sets are authored by Claude through the MCP server in mcp-server/ — see README.md.</label>
        </div>
        <div class="roadmap-track roadmap-track-mini" id="library-set-roadmap"></div>
      </div>
      <div id="library-roadmaps-tab" class="hidden">
        <div id="library-roadmap-chips" class="roadmap-tabs"></div>
        <div class="roadmap-track roadmap-track-mini" id="library-roadmap-preview"></div>
      </div>
      <button class="back-btn" onclick="showScreen('screen-menu')">◀ BACK TO MENU</button>
    </div>
  </div>
```

- [ ] **Step 2: Update the `showScreen()` hook in `js/main.js`**

Replace the `screen-data` branch inside `showScreen()` (its line number shifts by Task 1's earlier edit to this same file — find it by its exact content):

```js
  if (id === 'screen-library') {
    refreshQuestionSetUI();
    selectLibraryTab('sets');
  }
```

- [ ] **Step 3: Hook `refreshLibraryRoadmapPreview` into `refreshQuestionSetUI()` in `js/storage.js`**

In `js/storage.js`, add one line at the end of `refreshQuestionSetUI()` — right before its closing `}`, after the existing `if (document.getElementById('current-count')) { ... }` block (line numbers shift slightly once Task 1's edits to `initQuestionSets` land earlier in this same file, so locate the function by name, not by line number):

```js
  if (typeof refreshLibraryRoadmapPreview === 'function') refreshLibraryRoadmapPreview();
```

- [ ] **Step 4: Add the Library Sets-tab functions to `js/roadmap.js`**

Append to the end of `js/roadmap.js`:

```js
async function renderLibrarySetsTab() {
  const container = document.getElementById('library-set-roadmap');
  if (!container) return;
  const meta = questionSets.find(s => s.id === activeSetId);
  if (!meta || !meta.roadmapId) {
    container.innerHTML = '<div class="roadmap-loading">This set isn\'t part of a roadmap yet.</div>';
    return;
  }
  container.innerHTML = '<div class="roadmap-loading">Loading roadmap…</div>';
  try {
    const sets = getSetsForRoadmap(meta.roadmapId);
    const progressById = await computeRoadmapProgress(sets);
    container.innerHTML = buildRoadmapNodesHtml(sets, progressById, { highlightSetId: activeSetId, compact: true, clickHandler: 'selectRoadmapNodeInPlace' });
  } catch (e) {
    console.error('Failed to render library set roadmap:', e);
    container.innerHTML = '<div class="roadmap-loading">❌ Failed to load the roadmap. Please try again.</div>';
  }
}

function selectRoadmapNodeInPlace(id) {
  const nodeEl = document.querySelector(`.roadmap-node[data-set-id="${id}"]`);
  if (nodeEl) nodeEl.classList.add('roadmap-node-launch');
  const avatarEl = document.querySelector('.roadmap-avatar');
  if (avatarEl) avatarEl.classList.add('roadmap-avatar-launch');
  switchQuestionSet(id);
}

function selectLibraryTab(tab) {
  const setsTab = document.getElementById('library-sets-tab');
  const roadmapsTab = document.getElementById('library-roadmaps-tab');
  const setsBtn = document.getElementById('library-tab-btn-sets');
  const roadmapsBtn = document.getElementById('library-tab-btn-roadmaps');
  if (setsTab) setsTab.classList.toggle('hidden', tab !== 'sets');
  if (roadmapsTab) roadmapsTab.classList.toggle('hidden', tab !== 'roadmaps');
  if (setsBtn) setsBtn.classList.toggle('library-tab-active', tab === 'sets');
  if (roadmapsBtn) roadmapsBtn.classList.toggle('library-tab-active', tab === 'roadmaps');
  if (tab === 'sets') renderLibrarySetsTab();
  if (tab === 'roadmaps' && typeof renderLibraryRoadmapsTab === 'function') renderLibraryRoadmapsTab();
}

function refreshLibraryRoadmapPreview() {
  const setsTab = document.getElementById('library-sets-tab');
  const roadmapsTab = document.getElementById('library-roadmaps-tab');
  if (setsTab && !setsTab.classList.contains('hidden')) renderLibrarySetsTab();
  if (roadmapsTab && !roadmapsTab.classList.contains('hidden') && typeof renderLibraryRoadmapsTab === 'function') renderLibraryRoadmapsTab();
}
```

(`selectRoadmapNodeInPlace` intentionally has no `showScreen()` call and no `setTimeout` — unlike `launchRoadmapNode`, it must leave Library open. `switchQuestionSet()` already calls `refreshQuestionSetUI()`, which now (Step 3) calls `refreshLibraryRoadmapPreview()`, which re-renders this same Sets-tab container — so the highlight/dropdown/active-name all update together from that one call chain.)

- [ ] **Step 5: Add the highlighted-node and mini-roadmap CSS to `css/roadmap.css`**

Append to the end of `css/roadmap.css`:

```css
/* ─── Highlighted Node ────────────────────────────── */
.roadmap-node-highlighted { border-color: var(--accent2); box-shadow: var(--glow-y); }

/* ─── Mini Roadmap (Library previews) ────────────── */
.roadmap-track-mini { gap: 14px; padding: 10px 0; }
.roadmap-track-mini .roadmap-node {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 8px 10px;
  animation: none;
}
.roadmap-track-mini .roadmap-node::after { height: 14px; bottom: -14px; }
.roadmap-track-mini .roadmap-avatar { top: -20px; font-size: 18px; }
.roadmap-track-mini .roadmap-node-icon { font-size: 16px; }
.roadmap-track-mini .roadmap-node-name { font-size: 11px; }
.roadmap-track-mini .roadmap-node-meta { font-size: 8px; }
```

- [ ] **Step 6: Add the Library tab-bar CSS to `css/extra.css`**

Append to the end of `css/extra.css`:

```css
/* ─── Library Tabs ────────────────────────────────── */
.screen-data .library-tabs { display: flex; gap: 8px; margin-bottom: 4px; }
.screen-data .library-tab-btn {
  flex: 1;
  font-family: var(--font-px);
  font-size: 8px;
  padding: 10px;
  background: var(--panel);
  border: 2px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-dim);
  cursor: pointer;
  transition: all .15s;
}
.screen-data .library-tab-btn:hover { border-color: var(--accent3); color: var(--text); }
.screen-data .library-tab-btn.library-tab-active {
  border-color: var(--accent3);
  color: var(--accent3);
  text-shadow: var(--glow-g);
}
```

- [ ] **Step 7: Manually verify in the browser**

Run: `python -m http.server` (from repo root), open `http://localhost:8000`

- Main menu shows "📚 LIBRARY" (unchanged green accent) instead of "📦 QUESTION SETS".
- Click it: opens on the "Sets" tab (highlighted), dropdown works as before, and below the existing labels a compact roadmap preview shows the active set's roadmap with a highlighted/played node for the active set.
- Pick a different set from the dropdown: the mini preview below updates to that set's own roadmap (or the "isn't part of a roadmap yet" message, if it has none) without leaving the screen.
- Click the "Roadmaps" tab button: it visually activates but the panel below it is empty — expected, Task 5 implements it.

- [ ] **Step 8: Run the full test suite**

Run: `node tests/run-all.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add index.html js/main.js js/storage.js js/roadmap.js css/roadmap.css css/extra.css
git commit -m "feat(library): rename Question Sets to Library and add a Sets-tab roadmap preview"
```

---

### Task 5: Library Roadmaps tab

**Files:**
- Modify: `js/roadmap.js` (add `renderLibraryRoadmapsTab`, `selectLibraryRoadmap`, `activeLibraryRoadmapId` state)

**Interfaces:**
- Consumes: Task 2's `getSetsForRoadmap`, `computeRoadmapProgress`, `buildRoadmapNodesHtml`, `renderRoadmapChipsHtml`, `pickDefaultRoadmapId`; Task 4's `selectLibraryTab`/`refreshLibraryRoadmapPreview` (already calling this task's functions via `typeof` guards, no changes needed there).
- Produces: nothing consumed by later tasks — this is the last functional piece.

- [ ] **Step 1: Add the Library Roadmaps-tab functions to `js/roadmap.js`**

Add a module-level state variable near `activeRoadmapTabId`:

```js
let activeLibraryRoadmapId = null;
```

Append to the end of `js/roadmap.js`:

```js
async function renderLibraryRoadmapsTab() {
  const chipsEl = document.getElementById('library-roadmap-chips');
  const container = document.getElementById('library-roadmap-preview');
  if (!container) return;
  activeLibraryRoadmapId = pickDefaultRoadmapId(activeLibraryRoadmapId);
  if (!activeLibraryRoadmapId) {
    if (chipsEl) chipsEl.innerHTML = '';
    container.innerHTML = '<div class="roadmap-loading">No roadmaps configured yet.</div>';
    return;
  }
  if (chipsEl) chipsEl.innerHTML = renderRoadmapChipsHtml(roadmapDefinitions, activeLibraryRoadmapId, 'selectLibraryRoadmap');
  container.innerHTML = '<div class="roadmap-loading">Loading roadmap…</div>';
  try {
    const sets = getSetsForRoadmap(activeLibraryRoadmapId);
    const progressById = await computeRoadmapProgress(sets);
    container.innerHTML = buildRoadmapNodesHtml(sets, progressById, { highlightSetId: activeSetId, compact: true, clickHandler: 'selectRoadmapNodeInPlace' });
  } catch (e) {
    console.error('Failed to render library roadmaps tab:', e);
    container.innerHTML = '<div class="roadmap-loading">❌ Failed to load the roadmap. Please try again.</div>';
  }
}

function selectLibraryRoadmap(id) {
  activeLibraryRoadmapId = id;
  renderLibraryRoadmapsTab();
}
```

No changes to `selectLibraryTab` or `refreshLibraryRoadmapPreview` are needed — their `typeof renderLibraryRoadmapsTab === 'function'` guards (added in Task 4) now resolve `true` automatically.

- [ ] **Step 2: Manually verify in the browser**

Run: `python -m http.server` (from repo root), open `http://localhost:8000`

- Library → "Roadmaps" tab: shows the same "N5 Path"/"N4 Path" chip row as the full-screen roadmap, defaulting to whichever roadmap contains the active set.
- Switch chips: the mini preview below updates instantly.
- Click a node in this mini preview: Library stays open, the clicked set becomes active (check via switching back to the "Sets" tab — its dropdown and mini preview now reflect the new active set).
- Click a node while viewing a roadmap that does NOT contain the currently active set: no 🚀 avatar shows anywhere in that preview (expected — `highlightSetId` only matches a set actually in the shown roadmap), but the click still correctly switches the active set.

- [ ] **Step 3: Run the full test suite**

Run: `node tests/run-all.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add js/roadmap.js
git commit -m "feat(library): add the Roadmaps tab with its own roadmap chip picker"
```

---

### Task 6: Final end-to-end verification

**Files:** none expected — this task is verification-only. If it finds a real bug, fix it in the smallest touched file and note the deviation in the commit message.

- [ ] **Step 1: Run both test suites one more time**

Run: `node tests/run-all.js` (from repo root) and `cd mcp-server && npm test`
Expected: both PASS.

- [ ] **Step 2: Full manual walkthrough in the browser**

Run: `python -m http.server` (from repo root), open `http://localhost:8000`

- Confirm both main-menu buttons read "🌌 ROADMAP" and "📚 LIBRARY", each with its own accent color.
- Roadmap screen: switch between "N5 Path"/"N4 Path" a few times, click a node in each, confirm the launch animation and menu-switch behavior from the original feature are unaffected.
- Library → Sets tab: pick several different sets from the dropdown (including one from each roadmap), confirm the mini preview always matches the selected set's own roadmap and highlights the right node.
- Library → Roadmaps tab: click nodes across both roadmaps, confirm Library never navigates away and the Sets tab reflects the change when switched back to.
- Toggle "disable animations" in Settings; repeat a node click in both the full-screen roadmap and a Library tab; confirm no animation plays but all set-switching still works correctly.
- Confirm no Vietnamese text remains anywhere in the Roadmap screen or the Library screen's tabs/previews (English copy table in the design doc).

- [ ] **Step 3: Commit (only if a fix was needed)**

If Step 2 found nothing to fix, this task produces no commit — the plan is complete as of Task 5's commit. If a fix was needed:

```bash
git add <fixed files>
git commit -m "fix(roadmap): <describe the specific fix>"
```
