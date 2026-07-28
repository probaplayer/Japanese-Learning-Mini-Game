# File-based Question Sets + MCP Authoring Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move question-set content out of localStorage/Firebase into a versioned `questions/` folder that the static game fetches at runtime, and build a local MCP server that lets Claude Desktop author question sets and publish them to GitHub (auto-deploying via the already-configured GitHub Pages).

**Architecture:** The game becomes a pure reader of `questions/manifest.json` + per-set JSON files (fetched over HTTP, no build step). All in-browser authoring (import/export/Firebase/edit-question UI) is deleted — authoring happens exclusively through a new `mcp-server/` Node project (stdio MCP server) that reads/writes those same JSON files and can `git commit`/`push` them to `main`.

**Tech Stack:** Vanilla JS (unchanged) for the game. Node.js + `@modelcontextprotocol/sdk` (`^1.30.0`) + `zod` (`^3.23.8`) for the MCP server, ESM (`"type": "module"`). Plain Node `assert`-based tests, matching the existing `tests/` convention — no test framework introduced.

## Global Constraints

- No build step for the game — everything still loads via `<script>` tags in `index.html`, paths stay relative (works both under `python -m http.server` and GitHub Pages "deploy from branch").
- Player-progress localStorage keys (`jq_hp`, `jq_exp`, `jq_level`, `jq_combo`, `jq_settings`, `jq_question_stats`, `jq_stats_migrated`, `jq_session_history`, `jq_daily_streak`/`jq_streak_date`) are unaffected — do not touch their persistence logic.
- `jq_active_set` stays in localStorage but only ever stores the *id string* of the last-selected set, never question content.
- No Firebase anywhere (SDK script tags, `firebase-config.js`, Firestore calls, `jq_firebase_config`) after this plan is done.
- No in-browser question authoring UI (import/export/edit/delete/paste-JSON/search/pagination) — authoring is MCP-only.
- `mcp-server/` pushes straight to `main` (single-owner repo, confirmed acceptable) — no PR flow.
- Every file write from the MCP server validates the question shape (`word`, `romaji`, `translation`, `q`, `a` as exactly 4 strings, `c` in `0..3`, `ex`) before touching disk.
- Spec: `docs/superpowers/specs/2026-07-28-file-based-questions-and-mcp-design.md`

---

### Task 1: `questions/` data folder + migrate SAMPLE_DATA

**Files:**
- Create: `questions/manifest.json`
- Create: `questions/n5-core.json`
- Create: `tests/questions-data.test.js`

**Interfaces:**
- Produces: on-disk contract every later task depends on —
  - `questions/manifest.json` → `{ "sets": [{ "id": string, "file": string, "name": string, "questionCount": number, "updatedAt": ISO-string }] }`
  - `questions/<id>.json` → `{ "id": string, "name": string, "description": string, "createdAt": ISO-string, "updatedAt": ISO-string, "questions": Question[] }`
  - `Question` → `{ word: string, romaji: string, translation: string, q: string, a: string[4], c: 0|1|2|3, ex: string }`

- [ ] **Step 1: Write the failing test**

Create `tests/questions-data.test.js`:

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const questionsDir = path.join(__dirname, '..', 'questions');

function testManifestHasAtLeastOneSet() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  assert.ok(Array.isArray(manifest.sets));
  assert.ok(manifest.sets.length >= 1);
}

function testEachManifestEntryMatchesItsFile() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  manifest.sets.forEach(entry => {
    const filePath = path.join(questionsDir, entry.file);
    assert.ok(fs.existsSync(filePath), `Missing question set file: ${entry.file}`);
    const set = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.strictEqual(set.id, entry.id);
    assert.strictEqual(set.questions.length, entry.questionCount, `questionCount mismatch for ${entry.id}`);
  });
}

function testEveryQuestionHasRequiredShape() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  manifest.sets.forEach(entry => {
    const set = JSON.parse(fs.readFileSync(path.join(questionsDir, entry.file), 'utf8'));
    set.questions.forEach((q, i) => {
      assert.strictEqual(typeof q.word, 'string', `${entry.id}[${i}].word`);
      assert.strictEqual(typeof q.romaji, 'string', `${entry.id}[${i}].romaji`);
      assert.strictEqual(typeof q.translation, 'string', `${entry.id}[${i}].translation`);
      assert.strictEqual(typeof q.q, 'string', `${entry.id}[${i}].q`);
      assert.ok(Array.isArray(q.a) && q.a.length === 4, `${entry.id}[${i}].a`);
      assert.ok(Number.isInteger(q.c) && q.c >= 0 && q.c <= 3, `${entry.id}[${i}].c`);
    });
  });
}

testManifestHasAtLeastOneSet();
testEachManifestEntryMatchesItsFile();
testEveryQuestionHasRequiredShape();

console.log('questions data tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/questions-data.test.js`
Expected: throws `ENOENT` reading `questions/manifest.json` (folder doesn't exist yet).

- [ ] **Step 3: Migrate SAMPLE_DATA into the new folder**

`js/data.js` currently contains `const SAMPLE_DATA = [ ...400 question objects... ];` (a plain JS array literal). Run this one-off migration command from the repo root:

```bash
node -e "
const fs = require('fs');
const src = fs.readFileSync('js/data.js', 'utf8');
const jsonText = src.replace(/^[^\[]*/, '').replace(/;\s*\$/, '');
const questions = JSON.parse(jsonText);
const now = new Date().toISOString();
fs.mkdirSync('questions', { recursive: true });
const set = {
  id: 'n5-core',
  name: 'N5 Core Vocabulary',
  description: 'Default vocabulary set migrated from the original built-in sample data.',
  createdAt: now,
  updatedAt: now,
  questions
};
fs.writeFileSync('questions/n5-core.json', JSON.stringify(set, null, 2) + '\n');
const manifest = { sets: [{ id: 'n5-core', file: 'n5-core.json', name: 'N5 Core Vocabulary', questionCount: questions.length, updatedAt: now }] };
fs.writeFileSync('questions/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Wrote', questions.length, 'questions to questions/n5-core.json');
"
```

Expected output: `Wrote 400 questions to questions/n5-core.json`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/questions-data.test.js`
Expected: `questions data tests passed`

- [ ] **Step 5: Commit**

```bash
git add questions/manifest.json questions/n5-core.json tests/questions-data.test.js
git commit -m "Add questions/ data folder migrated from SAMPLE_DATA"
```

---

### Task 2: Async manifest/set loading in the game (drop localStorage question-set content)

**Files:**
- Modify: `js/storage.js` (full-file rewrite)
- Modify: `js/main.js:49-67` (DOMContentLoaded handler)
- Create: `tests/init-question-sets.test.js`

**Interfaces:**
- Consumes: `questions/manifest.json` + `questions/<file>` (Task 1's on-disk contract), via `fetch()`.
- Produces (used by `js/game-utils.js`, `js/games/*.js`, `js/main.js`, and Task 3's `index.html`):
  - `async function initQuestionSets()` — populates globals `questionSets` (manifest metadata array) and `questions`/`activeSetId`.
  - `async function switchQuestionSet(id)` — re-fetches a set and updates globals + UI.
  - `function getActiveQuestionSet()` → `{ id, name, questions }`.
  - `function refreshQuestionSetUI()` — unchanged signature, now reads manifest metadata.
  - `function loadPlayerProgressFromStorage()` — replaces the old `loadFromStorage()`.
  - `function saveToStorage()` — unchanged signature, no longer persists question content.

- [ ] **Step 1: Write the failing test**

Create `tests/init-question-sets.test.js`:

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
const gameUtilsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'game-utils.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');

function createElement(id) {
  return {
    id,
    textContent: '',
    innerHTML: '',
    style: {},
    classList: { values: new Set(['hidden']), add(v) { this.values.add(v); }, remove(v) { this.values.delete(v); }, contains(v) { return this.values.has(v); } }
  };
}

function createFetchStub(responses) {
  return async function fetch(url) {
    const body = responses[url];
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
  };
}

function createContext(responses, storedActiveSet) {
  const store = {};
  if (storedActiveSet) store['jq_active_set'] = storedActiveSet;
  const elements = {};
  const context = {
    console,
    SAMPLE_DATA: [],
    Date,
    parseInt,
    fetch: createFetchStub(responses),
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); }
    },
    document: {
      addEventListener() {},
      getElementById(id) { if (!elements[id]) elements[id] = createElement(id); return elements[id]; },
      querySelector() { return null; }
    },
    window: { addEventListener() {} }
  };
  context.window.document = context.document;
  vm.createContext(context);
  vm.runInContext(
    `${mainSource}
${gameUtilsSource}
${storageSource}
this.runInitQuestionSets = initQuestionSets;
this.runSwitchQuestionSet = switchQuestionSet;
this.getState = () => ({ questions, questionSets, activeSetId });`,
    context
  );
  context.store = store;
  return context;
}

const MANIFEST = {
  sets: [
    { id: 'set-a', file: 'set-a.json', name: 'Set A', questionCount: 1, updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'set-b', file: 'set-b.json', name: 'Set B', questionCount: 1, updatedAt: '2026-01-01T00:00:00.000Z' }
  ]
};
const SET_A = { id: 'set-a', name: 'Set A', questions: [{ word: 'a', q: 'a?', a: ['1', '2', '3', '4'], c: 0, romaji: 'a' }] };
const SET_B = { id: 'set-b', name: 'Set B', questions: [{ word: 'b', q: 'b?', a: ['1', '2', '3', '4'], c: 1, romaji: 'b' }] };
const RESPONSES = {
  'questions/manifest.json': MANIFEST,
  'questions/set-a.json': SET_A,
  'questions/set-b.json': SET_B
};

async function testLoadsFirstSetWhenNoStoredActiveId() {
  const context = createContext(RESPONSES);
  await context.runInitQuestionSets();
  const state = context.getState();
  assert.strictEqual(state.activeSetId, 'set-a');
  assert.strictEqual(state.questions[0].word, 'a');
  assert.strictEqual(state.questionSets.length, 2);
}

async function testRespectsStoredActiveId() {
  const context = createContext(RESPONSES, 'set-b');
  await context.runInitQuestionSets();
  const state = context.getState();
  assert.strictEqual(state.activeSetId, 'set-b');
  assert.strictEqual(state.questions[0].word, 'b');
}

async function testFallsBackToFirstSetWhenStoredIdIsUnknown() {
  const context = createContext(RESPONSES, 'set-does-not-exist');
  await context.runInitQuestionSets();
  const state = context.getState();
  assert.strictEqual(state.activeSetId, 'set-a');
}

async function testSwitchQuestionSetUpdatesStateAndPersistsPointer() {
  const context = createContext(RESPONSES);
  await context.runInitQuestionSets();
  await context.runSwitchQuestionSet('set-b');
  const state = context.getState();
  assert.strictEqual(state.activeSetId, 'set-b');
  assert.strictEqual(state.questions[0].word, 'b');
  assert.strictEqual(context.store['jq_active_set'], 'set-b');
}

(async () => {
  await testLoadsFirstSetWhenNoStoredActiveId();
  await testRespectsStoredActiveId();
  await testFallsBackToFirstSetWhenStoredIdIsUnknown();
  await testSwitchQuestionSetUpdatesStateAndPersistsPointer();
  console.log('init question sets tests passed');
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/init-question-sets.test.js`
Expected: FAIL with `initQuestionSets is not defined` (or similar ReferenceError).

- [ ] **Step 3: Rewrite `js/storage.js`**

Replace the entire file content with:

```js
// ================================================
// 日本語 QUEST — Storage Module
// ================================================

/* ── QUESTION SETS (loaded from questions/ folder) ── */
async function fetchQuestionsManifest() {
  const res = await fetch('questions/manifest.json');
  if (!res.ok) throw new Error(`Failed to load questions/manifest.json (${res.status})`);
  const manifest = await res.json();
  if (!manifest || !Array.isArray(manifest.sets)) throw new Error('Invalid manifest.json: missing "sets" array');
  return manifest.sets;
}

async function fetchQuestionSetFile(file) {
  const res = await fetch(`questions/${file}`);
  if (!res.ok) throw new Error(`Failed to load questions/${file} (${res.status})`);
  const set = await res.json();
  if (!set || !Array.isArray(set.questions)) throw new Error(`Invalid question set file: questions/${file}`);
  return set;
}

function saveActiveSetId() {
  if (activeSetId) localStorage.setItem('jq_active_set', activeSetId);
}

async function initQuestionSets() {
  questionSets = await fetchQuestionsManifest();
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

async function switchQuestionSet(id) {
  const meta = questionSets.find(s => s.id === id);
  if (!meta) return;
  const set = await fetchQuestionSetFile(meta.file);
  activeSetId = id;
  questions = set.questions;
  saveActiveSetId();
  if (typeof initQuestionStats === 'function') initQuestionStats(questions);
  refreshQuestionSetUI();
  updateMenuUI();
}

function getActiveQuestionSet() {
  const meta = questionSets.find(s => s.id === activeSetId);
  return { id: activeSetId, name: meta ? meta.name : 'Unknown Set', questions };
}

function refreshQuestionSetUI() {
  const selector = document.getElementById('question-set-selector');
  const activeNameEl = document.getElementById('active-set-name');

  if (selector) {
    selector.innerHTML = questionSets.map(set => `<option value="${escapeHtml(set.id)}"${set.id === activeSetId ? ' selected' : ''}>${escapeHtml(set.name)} (${set.questionCount})</option>`).join('');
  }
  if (activeNameEl) {
    const meta = questionSets.find(s => s.id === activeSetId);
    activeNameEl.textContent = meta ? meta.name : 'No active set';
  }
  if (document.getElementById('current-count')) {
    document.getElementById('current-count').textContent = questions.length;
  }
}

/* ── PLAYER PROGRESS ── */
function saveToStorage() {
  normalizePlayerProgress();
  localStorage.setItem('jq_hp', playerHP);
  localStorage.setItem('jq_exp', playerEXP);
  localStorage.setItem('jq_level', playerLevel);
  localStorage.setItem('jq_combo', playerCombo);
  localStorage.setItem('jq_settings', JSON.stringify(settings));
  saveQuestionStats();
  saveDailyStreak();
}

function loadPlayerProgressFromStorage() {
  playerHP = parseInt(localStorage.getItem('jq_hp') ?? 100, 10);
  playerEXP = parseInt(localStorage.getItem('jq_exp') ?? 0, 10);
  playerLevel = parseInt(localStorage.getItem('jq_level') ?? 1, 10);
  playerCombo = parseInt(localStorage.getItem('jq_combo') ?? 0, 10);
  normalizePlayerProgress();
}

function mergePlainObjects(defaults, overrides) {
  const result = { ...defaults };
  if (!overrides || typeof overrides !== 'object') return result;
  Object.keys(overrides).forEach(key => {
    const defaultValue = defaults ? defaults[key] : undefined;
    const overrideValue = overrides[key];
    if (
      defaultValue &&
      overrideValue &&
      typeof defaultValue === 'object' &&
      typeof overrideValue === 'object' &&
      !Array.isArray(defaultValue) &&
      !Array.isArray(overrideValue)
    ) {
      result[key] = mergePlainObjects(defaultValue, overrideValue);
    } else {
      result[key] = overrideValue;
    }
  });
  return result;
}

function loadSettingsFromStorage() {
  const s = localStorage.getItem('jq_settings');
  if (s) {
    try {
      const parsed = JSON.parse(s);
      settings = mergePlainObjects(settings, parsed);
    } catch (e) {
      settings = { ...settings };
    }
  }
}

function saveSettingsToStorage() {
  localStorage.setItem('jq_settings', JSON.stringify(settings));
}

function detectLegacyStats() {
  return Object.keys(questionStats).some(key => /^q-\d+$/.test(key));
}

function migrateStatsToHashBased() {
  const legacyKeys = Object.keys(questionStats).filter(key => /^q-\d+$/.test(key));
  const migrated = {};
  legacyKeys.forEach(key => {
    const index = parseInt(key.replace('q-', ''), 10);
    if (index >= 0 && index < questions.length) {
      const newId = getScopedQuestionId(questions[index]);
      migrated[newId] = questionStats[key];
    }
  });
  Object.keys(migrated).forEach(id => {
    questionStats[id] = migrated[id];
  });
  legacyKeys.forEach(key => delete questionStats[key]);
  initQuestionStats(questions);
  saveQuestionStats();
}

function loadQuestionStats() {
  const alreadyMigrated = localStorage.getItem('jq_stats_migrated') === 'true';
  const stored = localStorage.getItem('jq_question_stats');
  if (stored) {
    try {
      questionStats = JSON.parse(stored);
      seedIncorrectHistory();
    } catch (e) {
      questionStats = {};
    }
  }
  if (!alreadyMigrated && detectLegacyStats()) {
    try {
      migrateStatsToHashBased();
      localStorage.setItem('jq_stats_migrated', 'true');
    } catch (e) {
      console.warn('Stats migration failed, initializing empty stats:', e);
      questionStats = {};
      localStorage.setItem('jq_stats_migrated', 'true');
    }
  }
  initQuestionStats(questions);
}

function seedIncorrectHistory() {
  Object.keys(questionStats).forEach(id => {
    const qStats = questionStats[id];
    Object.keys(qStats).forEach(game => {
      if (game.startsWith('_')) return;
      const stats = qStats[game];
      if (stats.incorrect > 0 && (!stats.incorrectHistory || stats.incorrectHistory.length === 0)) {
        stats.incorrectHistory = stats.lastSeen ? [stats.lastSeen] : [];
      } else if (!stats.incorrectHistory) {
        stats.incorrectHistory = [];
      }
    });
  });
}

function saveQuestionStats() {
  localStorage.setItem('jq_question_stats', JSON.stringify(questionStats));
}

function loadSessionHistory() {
  const stored = localStorage.getItem('jq_session_history');
  if (stored) {
    try {
      sessionHistory = JSON.parse(stored);
    } catch (e) {
      sessionHistory = [];
    }
  }
}

function saveSessionHistory() {
  localStorage.setItem('jq_session_history', JSON.stringify(sessionHistory));
}

function initQuestionStats(questionsArr) {
  const gameTypes = ['quiz', 'listen', 'flash', 'match', 'type', 'write'];
  questionsArr.forEach((q) => {
    const legacyId = generateQuestionId(q);
    const id = getScopedQuestionId(q);
    if (!questionStats[id] && questionStats[legacyId]) {
      questionStats[id] = questionStats[legacyId];
    }
    if (!questionStats[id]) {
      questionStats[id] = {};
    }
    gameTypes.forEach(game => {
      if (!questionStats[id][game]) {
        questionStats[id][game] = getDefaultQuestionTypeStats();
      }
    });
  });
}

function cleanupQuestionStats(deletedIndex) {
  const q = questions[deletedIndex];
  if (!q) return;
  const id = getScopedQuestionId(q);
  delete questionStats[id];
  saveQuestionStats();
}

function applyScanlinesVisibility() {
  const scanlines = document.querySelector('.scanlines');
  if (!scanlines) return;
  scanlines.style.display = settings.scanlinesEnabled ? 'block' : 'none';
}

function updateAnimationBodyClass() {
  if (settings.animationEnabled === false) {
    document.body.classList.add('animations-disabled');
  } else {
    document.body.classList.remove('animations-disabled');
  }
}
```

- [ ] **Step 4: Edit `js/main.js` DOMContentLoaded handler**

In `js/main.js`, replace:

```js
document.addEventListener('DOMContentLoaded', () => {
  initStars();
  loadSettingsFromStorage();
  loadFromStorage();
  loadQuestionStats();
  loadSessionHistory();
  loadDailyStreak();
  applyScanlinesVisibility();
  updateAnimationBodyClass();
  
  const firebaseConfig = loadFirebaseConfig();
  if (firebaseConfig) {
    initializeFirebase(firebaseConfig);
    showFirebaseSetsButton(true);
  }
  
  updateMenuUI();
  showScreen('screen-menu');
});
```

with:

```js
document.addEventListener('DOMContentLoaded', async () => {
  initStars();
  loadSettingsFromStorage();
  loadPlayerProgressFromStorage();
  try {
    await initQuestionSets();
  } catch (e) {
    console.error('Failed to load question sets:', e);
    showToast('❌ Failed to load question sets', 'err');
  }
  loadQuestionStats();
  loadSessionHistory();
  loadDailyStreak();
  applyScanlinesVisibility();
  updateAnimationBodyClass();

  updateMenuUI();
  showScreen('screen-menu');
});
```

- [ ] **Step 5: Run the new test to verify it passes**

Run: `node tests/init-question-sets.test.js`
Expected: `init question sets tests passed`

- [ ] **Step 6: Run the full existing test suite to check nothing else broke**

Run: `node tests/run-all.js`
Expected: all test files pass (no test calls `loadFromStorage`, `createQuestionSet`, `deleteQuestionSet`, or `getActiveQuestionSet` with the old full-set shape, so none should regress).

- [ ] **Step 7: Commit**

```bash
git add js/storage.js js/main.js tests/init-question-sets.test.js
git commit -m "Load question sets from questions/ folder instead of localStorage"
```

---

### Task 3: Remove Firebase + in-browser authoring UI

**Files:**
- Delete: `js/firebase-config.js`
- Delete: `js/data.js`
- Delete: `js/data-manager.js`
- Modify: `index.html` (remove Firebase/data.js/data-manager.js script tags, rewrite `screen-data`, remove `import-modal` and `firebase-sets-modal`)
- Modify: `js/main.js:124-127` (drop `refreshDataPreview()` call in `showScreen`)
- Modify: `tests/quiz-resume.test.js`, `tests/all-game-resume.test.js`, `tests/main-utils.test.js`, `tests/settings-storage.test.js` (drop now-dead stubs)

**Interfaces:**
- Consumes: `switchQuestionSet`, `refreshQuestionSetUI` from Task 2.
- Produces: nothing new — this task only removes code and dead references.

- [ ] **Step 1: Delete the obsolete files**

```bash
git rm js/firebase-config.js js/data.js js/data-manager.js
```

- [ ] **Step 2: Edit `index.html` — remove Firebase SDK script tags**

Replace:

```html
  <!-- Firebase SDK -->
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"></script>
  <!-- 3rd party libs -->
```

with:

```html
  <!-- 3rd party libs -->
```

- [ ] **Step 3: Edit `index.html` — remove the deleted modules' script tags**

Replace:

```html
  <!-- Core modules -->
  <script src="js/firebase-config.js"></script>
  <script src="js/data.js"></script>
  <script src="js/main.js"></script>
  <script src="js/game-utils.js"></script>
  <script src="js/storage.js"></script>
  <script src="js/settings.js"></script>
  <script src="js/data-manager.js"></script>
```

with:

```html
  <!-- Core modules -->
  <script src="js/main.js"></script>
  <script src="js/game-utils.js"></script>
  <script src="js/storage.js"></script>
  <script src="js/settings.js"></script>
```

- [ ] **Step 4: Edit `index.html` — replace the DATA MANAGEMENT screen**

Replace the entire block from `<!-- DATA MANAGEMENT -->` through its closing `</div>` (the block starting `<div id="screen-data" class="screen screen-data">` and ending just before `<!-- IMPORT MODAL -->`), i.e. replace:

```html
  <!-- DATA MANAGEMENT -->
  <div id="screen-data" class="screen screen-data">
    <div class="panel">
      <h2 class="panel-title">📦 DATA MANAGEMENT</h2>
      <div class="form-group">
        <label>Question set</label>
        <div class="btn-row">
          <select id="question-set-selector" onchange="switchQuestionSet(this.value)"></select>
          <button class="action-btn btn-secondary" onclick="promptCreateQuestionSet()">+ NEW</button>
          <button class="action-btn btn-secondary" onclick="promptRenameQuestionSet()">✏️ RENAME</button>
          <button class="action-btn btn-danger" onclick="deleteActiveQuestionSet()">🗑 DELETE</button>
          <button class="action-btn" id="btn-backup" onclick="backupQuestionSet()">☁️ BACKUP</button>
          <button class="action-btn btn-secondary hidden" id="btn-firebase-sets" onclick="showFirebaseSetsModal()">📂 FIREBASE SETS</button>
        </div>
      </div>
      <div class="form-group">
        <label>Active set: <span id="active-set-name">Default Set</span></label>
      </div>
      <div class="form-group">
        <label>Press IMPORT to paste question JSON in the modal.</label>
      </div>
      <div class="btn-row">
        <button class="action-btn" onclick="openImportModal()">✅ IMPORT</button>
        <button class="action-btn btn-danger" onclick="clearData()">🗑 CLEAR SET</button>
        <button class="action-btn btn-secondary" onclick="loadSampleData()">📚 SAMPLE DATA</button>
        <button class="action-btn btn-secondary" onclick="exportData()">📤 EXPORT</button>
      </div>
      <div class="firebase-config-section">
        <button type="button" class="toggle-config-btn" onclick="toggleFirebaseConfig()">🔧 FIREBASE CONFIG</button>
        <div id="firebase-config-panel" class="firebase-config-panel hidden">
          <div class="firebase-config-group">
            <div class="form-group">
              <label for="firebase-project-id">Project ID *</label>
              <input id="firebase-project-id" type="text" placeholder="my-project-123" />
            </div>
            <div class="form-group">
              <label for="firebase-bucket">Storage Bucket *</label>
              <input id="firebase-bucket" type="text" placeholder="my-project-123.appspot.com" />
            </div>
          </div>
          <div class="firebase-config-group">
            <div class="form-group">
              <label for="firebase-api-key">API Key</label>
              <input id="firebase-api-key" type="text" placeholder="AIzaSy..." />
            </div>
            <div class="form-group">
              <label for="firebase-auth-domain">Auth Domain</label>
              <input id="firebase-auth-domain" type="text" placeholder="my-project.firebaseapp.com" />
            </div>
          </div>
          <div class="firebase-config-group">
            <div class="form-group">
              <label for="firebase-messaging-sender-id">Messaging Sender ID</label>
              <input id="firebase-messaging-sender-id" type="text" placeholder="123456789" />
            </div>
            <div class="form-group">
              <label for="firebase-app-id">App ID</label>
              <input id="firebase-app-id" type="text" placeholder="1:123456789:web:abc123..." />
            </div>
          </div>
          <div class="form-group">
            <label for="firebase-measurement-id">Measurement ID</label>
            <input id="firebase-measurement-id" type="text" placeholder="G-XXXXXXXXXX" />
          </div>
          <div class="btn-row">
            <button class="action-btn" onclick="saveFirebaseConfig()">💾 SAVE CONFIG</button>
            <button class="action-btn btn-secondary" onclick="testFirebaseConnection()">🧪 TEST</button>
          </div>
        </div>
      </div>
      <div class="import-section">
        <label>☁️ IMPORT</label>
        <div class="import-toggle">
          <input type="radio" id="import-url" name="import-mode" value="url" checked onchange="toggleImportMode()" />
          <label for="import-url">URL</label>
          <input type="radio" id="import-id" name="import-mode" value="id" onchange="toggleImportMode()" />
          <label for="import-id">ID</label>
        </div>
        <div class="btn-row">
          <input id="import-url-input" type="text" class="import-input" placeholder="Paste JSON URL here..." />
          <button class="action-btn" onclick="handleGetButton()">GET</button>
        </div>
      </div>
      <div id="data-status" class="status-msg"></div>
      <div class="form-group">
        <label for="question-search">Search questions</label>
        <input id="question-search" type="text" placeholder="Search by word, question, romaji, or translation" oninput="updateQuestionSearch()" />
      </div>
      <div class="current-data">
        <h3>Current items: <span id="current-count">0</span></h3>
        <div id="question-list" class="question-list"></div>
      </div>
      <button class="back-btn" onclick="showScreen('screen-menu')">◀ BACK TO MENU</button>
    </div>
  </div>

  <!-- IMPORT MODAL -->
  <div id="import-modal" class="modal-overlay hidden" onclick="if (event.target === this) closeImportModal()">
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
      <h3 id="import-modal-title" class="modal-title">📥 IMPORT DATA</h3>
      <textarea id="import-textarea" class="modal-textarea" placeholder='[{"word":"学生","q":"What's the reading?","a":["がくせい","がくぜい","がっせい","かくせい"],"c":0,"romaji":"gakusei","translation":"Student","ex":"Student"}]'></textarea>
      <div class="modal-buttons">
        <button class="action-btn btn-secondary" onclick="closeImportModal()">Cancel</button>
        <button id="modal-replace-btn" class="action-btn" onclick="applyImportReplace()">Replace</button>
        <button id="modal-append-btn" class="action-btn btn-green" onclick="applyImportAppend()">Append</button>
        <button id="modal-edit-btn" class="action-btn btn-green hidden" onclick="applyEditQuestion()">Edit</button>
      </div>
    </div>
  </div>

  <!-- FIREBASE SETS MODAL -->
  <div id="firebase-sets-modal" class="modal-overlay hidden" onclick="if (event.target === this) closeFirebaseSetsModal()">
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="firebase-sets-modal-title">
      <h3 id="firebase-sets-modal-title" class="modal-title">☁️ FIREBASE SETS</h3>
      <div id="firebase-sets-list" class="firebase-sets-list"></div>
      <div class="modal-buttons">
        <button class="action-btn btn-secondary" onclick="closeFirebaseSetsModal()">Close</button>
      </div>
    </div>
  </div>
```

with:

```html
  <!-- QUESTION SETS -->
  <div id="screen-data" class="screen screen-data">
    <div class="panel">
      <h2 class="panel-title">📦 QUESTION SETS</h2>
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
      <button class="back-btn" onclick="showScreen('screen-menu')">◀ BACK TO MENU</button>
    </div>
  </div>
```

- [ ] **Step 5: Edit `js/main.js` — drop the `refreshDataPreview()` call**

Replace:

```js
  if (id === 'screen-data') {
    refreshQuestionSetUI();
    refreshDataPreview();
  }
```

with:

```js
  if (id === 'screen-data') {
    refreshQuestionSetUI();
  }
```

- [ ] **Step 6: Clean up dead stubs in `tests/quiz-resume.test.js`**

Replace:

```js
    SAMPLE_DATA: [],
```

with nothing (delete the line) — it's the line right after `console,` in `createContext()`.

Then replace:

```js
    loadFirebaseConfig() { return null; },
    initializeFirebase() {},
    showFirebaseSetsButton() {},
    renderSettingsScreen() {},
    refreshQuestionSetUI() {},
    refreshDataPreview() {},
    renderStatsScreen() {},
```

with:

```js
    renderSettingsScreen() {},
    refreshQuestionSetUI() {},
    renderStatsScreen() {},
```

- [ ] **Step 7: Clean up dead stubs in `tests/all-game-resume.test.js`**

Replace:

```js
    SAMPLE_DATA: [],
```

with nothing (delete the line) — same location, right after `console,`.

Then replace:

```js
    loadFirebaseConfig() { return null; },
    initializeFirebase() {},
    showFirebaseSetsButton() {},
    renderSettingsScreen() {},
    refreshQuestionSetUI() {},
    refreshDataPreview() {},
    renderStatsScreen() {},
```

with:

```js
    renderSettingsScreen() {},
    refreshQuestionSetUI() {},
    renderStatsScreen() {},
```

- [ ] **Step 8: Clean up dead stub in `tests/main-utils.test.js`**

Replace:

```js
  const context = {
    console,
    Math: math,
    SAMPLE_DATA: [],
    document: {
      addEventListener() {}
    }
  };
```

with:

```js
  const context = {
    console,
    Math: math,
    document: {
      addEventListener() {}
    }
  };
```

- [ ] **Step 9: Clean up dead stub in `tests/settings-storage.test.js`**

Replace:

```js
  localStorage: {
    getItem(key) {
      if (key === 'jq_settings') return JSON.stringify(storedSettings);
      return null;
    },
    setItem() {}
  },
  SAMPLE_DATA: []
};
```

with:

```js
  localStorage: {
    getItem(key) {
      if (key === 'jq_settings') return JSON.stringify(storedSettings);
      return null;
    },
    setItem() {}
  }
};
```

- [ ] **Step 10: Run the full test suite**

Run: `node tests/run-all.js`
Expected: all test files pass.

- [ ] **Step 11: Manually verify in a browser**

Run: `python -m http.server` from the repo root, open `http://localhost:8000`, open DevTools console (should show no errors), go to **DATA MANAGEMENT** and confirm the "N5 Core Vocabulary (400)" set is listed and selected, then start a Quiz game and confirm questions appear.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "Remove Firebase and in-browser question authoring UI"
```

---

### Task 4: MCP authoring server (`mcp-server/`)

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/src/questions-repo.js`
- Create: `mcp-server/src/publish.js`
- Create: `mcp-server/src/index.js`
- Create: `mcp-server/test/questions-repo.test.js`
- Create: `mcp-server/test/publish.test.js`
- Create: `mcp-server/test/mcp-server.smoke.test.js`
- Create: `mcp-server/test/run-all.js`
- Create: `mcp-server/.gitignore`

**Interfaces:**
- Consumes: `questions/manifest.json` + `questions/<file>` on-disk contract from Task 1 (same repo, resolved relative to `mcp-server/`).
- Produces: an MCP stdio server exposing tools `list_question_sets`, `get_question_set`, `create_question_set`, `delete_question_set`, `add_question`, `update_question`, `delete_question`, `publish` — registered in Claude Desktop's config, launched as `node mcp-server/src/index.js`.
- Env overrides for testability: `QUESTIONS_DIR` (defaults to `<repo>/questions`), `REPO_ROOT` (defaults to `<repo>`).

All code below has been prototyped and run end-to-end against the real `@modelcontextprotocol/sdk@1.30.0` (a live stdio client/server round trip, and a real `git commit`+`push` to a local bare remote) before being written into this plan — it is verified working, not illustrative.

- [ ] **Step 1: Create `mcp-server/package.json`**

```json
{
  "name": "japanese-quest-mcp",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "MCP server for authoring question sets for the Japanese Learning Mini-Game and publishing them via git push",
  "scripts": {
    "start": "node src/index.js",
    "test": "node test/run-all.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.30.0",
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Create `mcp-server/.gitignore`**

```
node_modules/
```

- [ ] **Step 3: Install dependencies**

```bash
cd mcp-server
npm install
cd ..
```

- [ ] **Step 4: Write the failing unit test for the repo layer**

Create `mcp-server/test/questions-repo.test.js`:

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';
import { createQuestionsRepo, validateQuestion, slugify } from '../src/questions-repo.js';

function makeTempQuestionsDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jq-questions-'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ sets: [] }, null, 2));
  return dir;
}

const sampleQuestion = {
  word: '学生', romaji: 'がくせい', translation: 'Student', q: 'Reading?',
  a: ['がくせい', 'がくぜい', 'がっせい', 'かくせい'], c: 0, ex: 'ex'
};

function testValidateQuestionAcceptsWellFormedQuestion() {
  assert.strictEqual(validateQuestion(sampleQuestion), null);
}

function testValidateQuestionRejectsWrongAnswerCount() {
  const bad = { ...sampleQuestion, a: ['a', 'b'] };
  assert.match(validateQuestion(bad), /exactly 4 strings/);
}

function testValidateQuestionRejectsOutOfRangeCorrectIndex() {
  const bad = { ...sampleQuestion, c: 4 };
  assert.match(validateQuestion(bad), /between 0 and 3/);
}

function testSlugifyNormalizesNames() {
  assert.strictEqual(slugify('N5 Vocabulary!'), 'n5-vocabulary');
  assert.strictEqual(slugify('  --Trailing--  '), 'trailing');
}

function testCreateListGetQuestionSet() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);

  const created = repo.createQuestionSet({ name: 'N5 Vocab', questions: [sampleQuestion] });
  assert.strictEqual(created.id, 'n5-vocab');

  const list = repo.listQuestionSets();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].questionCount, 1);

  const fetched = repo.getQuestionSet('n5-vocab');
  assert.strictEqual(fetched.questions.length, 1);
  assert.strictEqual(fetched.questions[0].word, '学生');
}

function testCreateQuestionSetRejectsDuplicateId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ name: 'Set A' });
  assert.throws(() => repo.createQuestionSet({ id: 'set-a', name: 'Set A Again' }), /already exists/);
}

function testAddUpdateDeleteQuestion() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo' });

  const index = repo.addQuestion('demo', sampleQuestion);
  assert.strictEqual(index, 0);
  assert.strictEqual(repo.getQuestionSet('demo').questions.length, 1);
  assert.strictEqual(repo.listQuestionSets()[0].questionCount, 1);

  const updated = { ...sampleQuestion, translation: 'Changed' };
  repo.updateQuestion('demo', 0, updated);
  assert.strictEqual(repo.getQuestionSet('demo').questions[0].translation, 'Changed');

  repo.deleteQuestion('demo', 0);
  assert.strictEqual(repo.getQuestionSet('demo').questions.length, 0);
  assert.strictEqual(repo.listQuestionSets()[0].questionCount, 0);
}

function testAddQuestionRejectsInvalidShape() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo' });
  assert.throws(() => repo.addQuestion('demo', { ...sampleQuestion, a: ['only', 'two'] }), /exactly 4 strings/);
}

function testDeleteQuestionSetRemovesFileAndManifestEntry() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo' });
  assert.ok(fs.existsSync(path.join(dir, 'demo.json')));

  repo.deleteQuestionSet('demo');
  assert.strictEqual(fs.existsSync(path.join(dir, 'demo.json')), false);
  assert.strictEqual(repo.listQuestionSets().length, 0);
}

testValidateQuestionAcceptsWellFormedQuestion();
testValidateQuestionRejectsWrongAnswerCount();
testValidateQuestionRejectsOutOfRangeCorrectIndex();
testSlugifyNormalizesNames();
testCreateListGetQuestionSet();
testCreateQuestionSetRejectsDuplicateId();
testAddUpdateDeleteQuestion();
testAddQuestionRejectsInvalidShape();
testDeleteQuestionSetRemovesFileAndManifestEntry();

console.log('questions-repo tests passed');
```

- [ ] **Step 5: Run test to verify it fails**

Run: `node mcp-server/test/questions-repo.test.js`
Expected: FAIL — `Cannot find module '../src/questions-repo.js'`.

- [ ] **Step 6: Implement `mcp-server/src/questions-repo.js`**

```js
import fs from 'node:fs';
import path from 'node:path';

const QUESTION_FIELDS = ['word', 'romaji', 'translation', 'q', 'a', 'c', 'ex'];

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
  const extraFields = Object.keys(question).filter(k => !QUESTION_FIELDS.includes(k));
  if (extraFields.length > 0) {
    return `Question has unexpected fields: ${extraFields.join(', ')}`;
  }
  return null;
}

export function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function createQuestionsRepo(baseDir) {
  const manifestPath = path.join(baseDir, 'manifest.json');

  function readManifest() {
    if (!fs.existsSync(manifestPath)) {
      return { sets: [] };
    }
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  function writeManifest(manifest) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  }

  function readSetFile(file) {
    const filePath = path.join(baseDir, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Question set file not found: ${file}`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  function writeSetFile(file, set) {
    fs.writeFileSync(path.join(baseDir, file), JSON.stringify(set, null, 2) + '\n', 'utf8');
  }

  function findEntry(manifest, id) {
    return manifest.sets.find(s => s.id === id);
  }

  function listQuestionSets() {
    return readManifest().sets;
  }

  function getQuestionSet(id) {
    const manifest = readManifest();
    const entry = findEntry(manifest, id);
    if (!entry) throw new Error(`Question set not found: ${id}`);
    return readSetFile(entry.file);
  }

  function createQuestionSet({ id, name, description = '', questions = [] }) {
    const manifest = readManifest();
    const setId = id ? slugify(id) : slugify(name);
    if (!setId) throw new Error('Could not derive a valid id from the provided name/id');
    if (findEntry(manifest, setId)) throw new Error(`Question set id already exists: ${setId}`);
    for (const q of questions) {
      const error = validateQuestion(q);
      if (error) throw new Error(error);
    }
    const now = new Date().toISOString();
    const file = `${setId}.json`;
    const set = { id: setId, name, description, createdAt: now, updatedAt: now, questions };
    writeSetFile(file, set);
    manifest.sets.push({ id: setId, file, name, questionCount: questions.length, updatedAt: now });
    writeManifest(manifest);
    return set;
  }

  function deleteQuestionSet(id) {
    const manifest = readManifest();
    const entry = findEntry(manifest, id);
    if (!entry) throw new Error(`Question set not found: ${id}`);
    const filePath = path.join(baseDir, entry.file);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    manifest.sets = manifest.sets.filter(s => s.id !== id);
    writeManifest(manifest);
  }

  function updateManifestEntry(manifest, id, set) {
    const entry = findEntry(manifest, id);
    entry.questionCount = set.questions.length;
    entry.updatedAt = set.updatedAt;
    entry.name = set.name;
  }

  function addQuestion(setId, question) {
    const error = validateQuestion(question);
    if (error) throw new Error(error);
    const manifest = readManifest();
    const entry = findEntry(manifest, setId);
    if (!entry) throw new Error(`Question set not found: ${setId}`);
    const set = readSetFile(entry.file);
    set.questions.push(question);
    set.updatedAt = new Date().toISOString();
    writeSetFile(entry.file, set);
    updateManifestEntry(manifest, setId, set);
    writeManifest(manifest);
    return set.questions.length - 1;
  }

  function updateQuestion(setId, index, question) {
    const error = validateQuestion(question);
    if (error) throw new Error(error);
    const manifest = readManifest();
    const entry = findEntry(manifest, setId);
    if (!entry) throw new Error(`Question set not found: ${setId}`);
    const set = readSetFile(entry.file);
    if (index < 0 || index >= set.questions.length) throw new Error(`Question index out of range: ${index}`);
    set.questions[index] = question;
    set.updatedAt = new Date().toISOString();
    writeSetFile(entry.file, set);
    updateManifestEntry(manifest, setId, set);
    writeManifest(manifest);
  }

  function deleteQuestion(setId, index) {
    const manifest = readManifest();
    const entry = findEntry(manifest, setId);
    if (!entry) throw new Error(`Question set not found: ${setId}`);
    const set = readSetFile(entry.file);
    if (index < 0 || index >= set.questions.length) throw new Error(`Question index out of range: ${index}`);
    set.questions.splice(index, 1);
    set.updatedAt = new Date().toISOString();
    writeSetFile(entry.file, set);
    updateManifestEntry(manifest, setId, set);
    writeManifest(manifest);
  }

  return {
    listQuestionSets,
    getQuestionSet,
    createQuestionSet,
    deleteQuestionSet,
    addQuestion,
    updateQuestion,
    deleteQuestion
  };
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node mcp-server/test/questions-repo.test.js`
Expected: `questions-repo tests passed`

- [ ] **Step 8: Write the failing test for the publish/git layer**

Create `mcp-server/test/publish.test.js`:

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createPublisher } from '../src/publish.js';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function makeFixtureRepoWithOrigin() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jq-publish-'));
  const bareOrigin = path.join(root, 'origin.git');
  const repoRoot = path.join(root, 'repo');
  fs.mkdirSync(bareOrigin);
  fs.mkdirSync(repoRoot);
  fs.mkdirSync(path.join(repoRoot, 'questions'));

  git(bareOrigin, ['init', '--bare', '-q']);
  git(repoRoot, ['init', '-q']);
  git(repoRoot, ['config', 'user.email', 'test@example.com']);
  git(repoRoot, ['config', 'user.name', 'Test']);
  git(repoRoot, ['remote', 'add', 'origin', bareOrigin]);
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'hello\n');
  fs.writeFileSync(path.join(repoRoot, 'questions', 'manifest.json'), '{"sets":[]}\n');
  git(repoRoot, ['add', 'README.md', 'questions/manifest.json']);
  git(repoRoot, ['commit', '-q', '-m', 'initial']);
  git(repoRoot, ['branch', '-M', 'main']);
  git(repoRoot, ['push', '-q', '-u', 'origin', 'main']);

  return { repoRoot, bareOrigin };
}

function testStatusSeparatesQuestionsChangesFromOtherChanges() {
  const { repoRoot } = makeFixtureRepoWithOrigin();
  fs.appendFileSync(path.join(repoRoot, 'questions', 'manifest.json'), '\n');
  const publisher = createPublisher({ repoRoot });
  const status = publisher.status();
  assert.strictEqual(status.questionsChanges.length, 1);
  assert.strictEqual(status.otherChanges.length, 0);
}

function testPublishRefusesWhenUnrelatedFilesAreDirty() {
  const { repoRoot } = makeFixtureRepoWithOrigin();
  fs.appendFileSync(path.join(repoRoot, 'questions', 'manifest.json'), '\n');
  fs.appendFileSync(path.join(repoRoot, 'README.md'), 'unrelated change\n');
  const publisher = createPublisher({ repoRoot });
  assert.throws(() => publisher.publish('should fail'), /unrelated uncommitted changes/);
}

function testPublishRefusesWhenNothingChangedUnderQuestions() {
  const { repoRoot } = makeFixtureRepoWithOrigin();
  const publisher = createPublisher({ repoRoot });
  assert.throws(() => publisher.publish('nothing to do'), /No changes under questions\//);
}

function testPublishCommitsAndPushesToOrigin() {
  const { repoRoot, bareOrigin } = makeFixtureRepoWithOrigin();
  fs.writeFileSync(path.join(repoRoot, 'questions', 'new-set.json'), '{"id":"new-set","questions":[]}\n');
  fs.writeFileSync(path.join(repoRoot, 'questions', 'manifest.json'), '{"sets":[{"id":"new-set"}]}\n');
  const publisher = createPublisher({ repoRoot });

  const result = publisher.publish('test: add new-set');
  assert.ok(result.commitHash);

  const localLog = git(repoRoot, ['log', '--oneline', '-1']);
  assert.ok(localLog.includes('test: add new-set'));

  const originLog = git(bareOrigin, ['log', '--oneline', '-1', 'main']);
  assert.ok(originLog.includes('test: add new-set'), `expected push to reach origin, got: ${originLog}`);

  const statusAfter = publisher.status();
  assert.strictEqual(statusAfter.questionsChanges.length, 0);
}

testStatusSeparatesQuestionsChangesFromOtherChanges();
testPublishRefusesWhenUnrelatedFilesAreDirty();
testPublishRefusesWhenNothingChangedUnderQuestions();
testPublishCommitsAndPushesToOrigin();

console.log('publish tests passed');
```

- [ ] **Step 9: Run test to verify it fails**

Run: `node mcp-server/test/publish.test.js`
Expected: FAIL — `Cannot find module '../src/publish.js'`.

- [ ] **Step 10: Implement `mcp-server/src/publish.js`**

```js
import { execFileSync } from 'node:child_process';

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

export function createPublisher({ repoRoot, questionsRelDir = 'questions' }) {
  function status() {
    const porcelain = git(repoRoot, ['status', '--porcelain']);
    const lines = porcelain.split('\n').filter(Boolean);
    const prefix = `${questionsRelDir.replace(/\\/g, '/')}/`;
    const questionsChanges = lines.filter(l => l.slice(3).startsWith(prefix));
    const otherChanges = lines.filter(l => !l.slice(3).startsWith(prefix));
    return { questionsChanges, otherChanges };
  }

  function publish(message) {
    const { questionsChanges, otherChanges } = status();
    if (questionsChanges.length === 0) {
      throw new Error(`No changes under ${questionsRelDir}/ to publish`);
    }
    if (otherChanges.length > 0) {
      throw new Error(`Refusing to publish: unrelated uncommitted changes outside ${questionsRelDir}/: ${otherChanges.map(l => l.slice(3)).join(', ')}`);
    }
    git(repoRoot, ['add', questionsRelDir]);
    git(repoRoot, ['commit', '-m', message]);
    git(repoRoot, ['pull', '--rebase', 'origin', 'main']);
    git(repoRoot, ['push', 'origin', 'main']);
    return { commitHash: git(repoRoot, ['rev-parse', 'HEAD']).trim() };
  }

  return { status, publish };
}
```

Note: git subcommands are invoked via `execFileSync` with argument arrays (no shell interpolation), so commit messages and file paths are never subject to shell-quoting bugs or injection.

- [ ] **Step 11: Run test to verify it passes**

Run: `node mcp-server/test/publish.test.js`
Expected: `publish tests passed`

- [ ] **Step 12: Write the failing end-to-end MCP server smoke test**

Create `mcp-server/test/mcp-server.smoke.test.js`:

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeTempQuestionsDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jq-mcp-smoke-'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    sets: [{ id: 'demo', file: 'demo.json', name: 'Demo Set', questionCount: 1, updatedAt: '2026-01-01T00:00:00.000Z' }]
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'demo.json'), JSON.stringify({
    id: 'demo', name: 'Demo Set', description: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    questions: [{ word: '学生', romaji: 'がくせい', translation: 'Student', q: 'Reading?', a: ['がくせい', 'がくぜい', 'がっせい', 'かくせい'], c: 0, ex: 'ex' }]
  }, null, 2));
  return dir;
}

async function main() {
  const questionsDir = makeTempQuestionsDir();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, '..', 'src', 'index.js')],
    env: { ...process.env, QUESTIONS_DIR: questionsDir }
  });
  const client = new Client({ name: 'smoke-test', version: '1.0.0' });
  await client.connect(transport);

  const list = await client.callTool({ name: 'list_question_sets', arguments: {} });
  const sets = JSON.parse(list.content[0].text);
  assert.strictEqual(sets.length, 1);
  assert.strictEqual(sets[0].id, 'demo');

  const created = await client.callTool({ name: 'create_question_set', arguments: { name: 'New Set', questions: [] } });
  const createdSet = JSON.parse(created.content[0].text);
  assert.strictEqual(createdSet.id, 'new-set');

  const added = await client.callTool({
    name: 'add_question',
    arguments: { setId: 'new-set', question: { word: 'a', romaji: 'a', translation: 'a', q: 'a?', a: ['1', '2', '3', '4'], c: 1, ex: 'ex' } }
  });
  assert.strictEqual(JSON.parse(added.content[0].text).index, 0);

  const fetched = await client.callTool({ name: 'get_question_set', arguments: { id: 'new-set' } });
  assert.strictEqual(JSON.parse(fetched.content[0].text).questions.length, 1);

  const updated = await client.callTool({
    name: 'update_question',
    arguments: { setId: 'new-set', index: 0, question: { word: 'b', romaji: 'b', translation: 'b', q: 'b?', a: ['1', '2', '3', '4'], c: 2, ex: 'ex' } }
  });
  assert.strictEqual(JSON.parse(updated.content[0].text).updated, 0);

  const badQuestion = await client.callTool({
    name: 'add_question',
    arguments: { setId: 'new-set', question: { word: 'x', romaji: 'x', translation: 'x', q: 'x?', a: ['1', '2'], c: 0, ex: 'ex' } }
  });
  assert.strictEqual(badQuestion.isError, true);

  const deletedQ = await client.callTool({ name: 'delete_question', arguments: { setId: 'new-set', index: 0 } });
  assert.strictEqual(JSON.parse(deletedQ.content[0].text).deleted, 0);

  const deletedSet = await client.callTool({ name: 'delete_question_set', arguments: { id: 'new-set' } });
  assert.strictEqual(JSON.parse(deletedSet.content[0].text).deleted, 'new-set');

  const finalList = await client.callTool({ name: 'list_question_sets', arguments: {} });
  assert.strictEqual(JSON.parse(finalList.content[0].text).length, 1);

  await client.close();
  fs.rmSync(questionsDir, { recursive: true, force: true });
  console.log('mcp server smoke test passed');
}

main().catch(e => {
  console.error('MCP SERVER SMOKE TEST FAILED:', e);
  process.exit(1);
});
```

- [ ] **Step 13: Run test to verify it fails**

Run: `node mcp-server/test/mcp-server.smoke.test.js`
Expected: FAIL — `Cannot find module '../src/index.js'`.

- [ ] **Step 14: Implement `mcp-server/src/index.js`**

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createQuestionsRepo } from './questions-repo.js';
import { createPublisher } from './publish.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.REPO_ROOT || path.resolve(__dirname, '..', '..');
const questionsDir = process.env.QUESTIONS_DIR || path.join(repoRoot, 'questions');
const repo = createQuestionsRepo(questionsDir);
const publisher = createPublisher({ repoRoot, questionsRelDir: 'questions' });

const questionShape = {
  word: z.string().min(1),
  romaji: z.string().min(1),
  translation: z.string().min(1),
  q: z.string().min(1),
  a: z.array(z.string()).length(4),
  c: z.number().int().min(0).max(3),
  ex: z.string().min(1)
};

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(message) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function guarded(fn) {
  return async (args) => {
    try {
      return ok(await fn(args));
    } catch (e) {
      return err(e.message);
    }
  };
}

const server = new McpServer({ name: 'japanese-quest-questions', version: '1.0.0' });

server.registerTool(
  'list_question_sets',
  { title: 'List question sets', description: 'List all question sets with id, name, and question count' },
  guarded(() => repo.listQuestionSets())
);

server.registerTool(
  'get_question_set',
  { title: 'Get question set', description: 'Get the full contents of one question set by id', inputSchema: { id: z.string() } },
  guarded(({ id }) => repo.getQuestionSet(id))
);

server.registerTool(
  'create_question_set',
  {
    title: 'Create question set',
    description: 'Create a new question set file and register it in the manifest',
    inputSchema: {
      id: z.string().optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      questions: z.array(z.object(questionShape)).optional()
    }
  },
  guarded((args) => repo.createQuestionSet(args))
);

server.registerTool(
  'delete_question_set',
  { title: 'Delete question set', description: 'Delete a question set file and remove it from the manifest', inputSchema: { id: z.string() } },
  guarded(({ id }) => {
    repo.deleteQuestionSet(id);
    return { deleted: id };
  })
);

server.registerTool(
  'add_question',
  {
    title: 'Add question',
    description: 'Append a question to an existing question set',
    inputSchema: { setId: z.string(), question: z.object(questionShape) }
  },
  guarded(({ setId, question }) => ({ index: repo.addQuestion(setId, question) }))
);

server.registerTool(
  'update_question',
  {
    title: 'Update question',
    description: 'Replace the question at the given index within a question set',
    inputSchema: { setId: z.string(), index: z.number().int().min(0), question: z.object(questionShape) }
  },
  guarded(({ setId, index, question }) => {
    repo.updateQuestion(setId, index, question);
    return { updated: index };
  })
);

server.registerTool(
  'delete_question',
  {
    title: 'Delete question',
    description: 'Remove the question at the given index within a question set',
    inputSchema: { setId: z.string(), index: z.number().int().min(0) }
  },
  guarded(({ setId, index }) => {
    repo.deleteQuestion(setId, index);
    return { deleted: index };
  })
);

server.registerTool(
  'publish',
  {
    title: 'Publish question sets',
    description: 'Commit changes under questions/ and push to origin/main so GitHub Pages redeploys',
    inputSchema: { message: z.string().min(1) }
  },
  guarded(({ message }) => publisher.publish(message))
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 15: Run test to verify it passes**

Run: `node mcp-server/test/mcp-server.smoke.test.js`
Expected: `mcp server smoke test passed`

- [ ] **Step 16: Create the test runner `mcp-server/test/run-all.js`**

```js
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFiles = fs.readdirSync(__dirname)
  .filter(file => file.endsWith('.test.js'))
  .sort();

let failed = false;

testFiles.forEach(file => {
  const fullPath = path.join(__dirname, file);
  const result = spawnSync(process.execPath, [fullPath], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.status !== 0) failed = true;
});

if (failed) process.exit(1);
console.log(`${testFiles.length} test files passed`);
```

- [ ] **Step 17: Run the full mcp-server test suite**

Run: `node mcp-server/test/run-all.js`
Expected: `3 test files passed`

- [ ] **Step 18: Commit**

```bash
git add mcp-server/
git commit -m "Add MCP authoring server for question sets"
```

---

### Task 5: README update + full manual verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: nothing new — documentation + verification only.

- [ ] **Step 1: Update `README.md`**

Replace the `### 📦 Data Management` section:

```markdown
### 📦 Data Management

- Import/Export question sets as JSON
- Multiple question sets support (create, rename, delete, switch)
- Search & preview questions
- Built-in sample data (Vietnamese → Japanese)
- Bulk replace or append import modes
```

with:

```markdown
### 📦 Question Sets

- Question sets live as JSON files in `questions/`, listed in `questions/manifest.json`
- The game only ever *reads* these files (via `fetch`) and lets you switch between them — no in-browser editing
- Sets are authored, edited, and published through the MCP server in `mcp-server/` (see below)
```

Replace the `## 🏗️ Architecture` block (the fenced plain-text diagram) so it reads:

```
index.html          ← Single-page app, all screens
style.css           ← Retro arcade theme
main.js             ← Core: state, navigation, storage, utilities
questions/          ← Question set data (manifest.json + one JSON file per set)
game-quiz.js        ← Multiple choice quiz
game-listen.js      ← TTS-based listening quiz
game-flash.js       ← Flashcard game
game-match.js       ← Match pairs game
game-type.js        ← Falling words typing game
lib/wanakana.min.js ← Japanese input library
mcp-server/         ← MCP server for authoring/publishing question sets
```

(previously this block listed `data.js ← Sample question data` instead of the `questions/` and `mcp-server/` lines — remove that line and add these two.)

Replace the `## 📖 Adding Your Own Questions` section:

```markdown
## 📖 Adding Your Own Questions

1. Open the app → **DATA MANAGEMENT**
2. Click **IMPORT** and paste your JSON array
3. Choose **Replace** or **Append**
4. Or load **SAMPLE DATA** to get started
```

with:

````markdown
## 📖 Adding Your Own Questions

Questions are authored through the MCP server in `mcp-server/`, connected to Claude Desktop:

1. Install dependencies once: `cd mcp-server && npm install`
2. Add this repo's MCP server to your Claude Desktop config (`claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "japanese-quest-questions": {
         "command": "node",
         "args": ["/absolute/path/to/mcp-server/src/index.js"]
       }
     }
   }
   ```
3. Restart Claude Desktop, then ask Claude to create/edit question sets — it has tools to list, create, and delete sets, and to add, update, or delete individual questions.
4. Ask Claude to **publish** when you're ready — it commits the changes under `questions/` and pushes to `main`, which GitHub Pages redeploys automatically.
````

Also update the last line of `## 🛠️ Tech Stack`:

```markdown
- **localStorage** — Persistent player data & settings
```

with:

```markdown
- **localStorage** — Persistent player data & settings (question sets themselves live in `questions/`, not localStorage)
```

- [ ] **Step 2: Run the full game test suite**

Run: `node tests/run-all.js`
Expected: all test files pass.

- [ ] **Step 3: Run the full MCP server test suite**

Run: `node mcp-server/test/run-all.js`
Expected: `3 test files passed`

- [ ] **Step 4: Manual browser verification**

Run: `python -m http.server` from the repo root, open `http://localhost:8000`:
- Confirm the menu loads with no console errors.
- Go to **QUESTION SETS**, confirm "N5 Core Vocabulary (400)" is shown.
- Play one round each of Quiz, Listening, Flashcard, Match, Falling Words, and Writing — confirm questions render and scoring/HP/EXP still work.
- Reload the page — confirm the previously-selected question set is remembered (via `jq_active_set`) and HP/EXP/combo persist.

- [ ] **Step 5: Manual MCP verification (optional but recommended)**

Register `mcp-server/src/index.js` in Claude Desktop per the new README instructions, restart Claude Desktop, and ask it to create a small test question set, add a question, then delete the test set again — confirming the tools are reachable from a real Claude Desktop session.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "Document questions/ folder and MCP authoring workflow in README"
```
