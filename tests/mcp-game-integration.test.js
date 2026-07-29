// Cross-seam test: verifies that what the MCP server's questions-repo.js
// actually writes to disk under a questions/ folder is loadable by the
// game's own initQuestionSets() in js/storage.js — i.e. the two halves of
// the system (authoring server output <-> game loader input) agree on the
// on-disk shape, rather than each side only being tested against its own
// hand-written fixtures.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const url = require('url');

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

// Unlike tests/init-question-sets.test.js's createFetchStub (which serves a
// hand-written RESPONSES object), this stub reads the *actual files* written
// to `questionsDir` by mcp-server's createQuestionsRepo(), keyed by the same
// `questions/manifest.json` / `questions/<file>` URL shape js/storage.js fetches.
function createRepoBackedFetchStub(questionsDir) {
  return async function fetch(reqUrl) {
    const prefix = 'questions/';
    if (!reqUrl.startsWith(prefix)) return { ok: false, status: 404, json: async () => ({}) };
    const relPath = reqUrl.slice(prefix.length);
    const filePath = path.join(questionsDir, relPath);
    if (!fs.existsSync(filePath)) return { ok: false, status: 404, json: async () => ({}) };
    const body = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { ok: true, status: 200, json: async () => body };
  };
}

function createGameContext(questionsDir) {
  const store = {};
  const elements = {};
  const context = {
    console,
    SAMPLE_DATA: [],
    Date,
    parseInt,
    fetch: createRepoBackedFetchStub(questionsDir),
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
this.getState = () => ({ questions, questionSets, activeSetId });`,
    context
  );
  return context;
}

async function testGameLoaderReadsRealMcpRepoOutput() {
  const questionsRepoUrl = url.pathToFileURL(
    path.join(__dirname, '..', 'mcp-server', 'src', 'questions-repo.js')
  ).href;
  const { createQuestionsRepo } = await import(questionsRepoUrl);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jq-mcp-game-integration-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify({ sets: [] }, null, 2));
    const repo = createQuestionsRepo(tmpDir);

    const questionOne = {
      word: '学生', romaji: 'がくせい', translation: 'Student', q: 'Reading of 学生?',
      a: ['がくせい', 'がくぜい', 'がっせい', 'かくせい'], c: 0, ex: 'Student'
    };
    const questionTwo = {
      word: '先生', romaji: 'せんせい', translation: 'Teacher', q: 'Reading of 先生?',
      a: ['せんせい', 'せいせん', 'せんせ', 'せんぜい'], c: 0, ex: 'Teacher'
    };

    const created = repo.createQuestionSet({ id: 'n5-core', name: 'N5 Core', questions: [questionOne] });
    assert.strictEqual(created.id, 'n5-core');
    repo.addQuestion('n5-core', questionTwo);

    const manifestEntry = repo.listQuestionSets().find(s => s.id === 'n5-core');
    assert.ok(manifestEntry, 'expected manifest to contain the created set');
    assert.strictEqual(manifestEntry.questionCount, 2);

    const gameContext = createGameContext(tmpDir);
    await gameContext.runInitQuestionSets();
    const state = gameContext.getState();

    assert.strictEqual(state.activeSetId, 'n5-core');
    assert.strictEqual(state.questions.length, 2);
    [questionOne, questionTwo].forEach((expected, i) => {
      assert.strictEqual(state.questions[i].word, expected.word);
      assert.strictEqual(state.questions[i].q, expected.q);
      assert.deepStrictEqual(state.questions[i].a, expected.a);
      assert.strictEqual(state.questions[i].c, expected.c);
    });

    assert.strictEqual(state.questionSets.length, 1);
    assert.strictEqual(state.questionSets[0].name, manifestEntry.name);
    assert.strictEqual(state.questionSets[0].questionCount, manifestEntry.questionCount);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

(async () => {
  await testGameLoaderReadsRealMcpRepoOutput();
  console.log('mcp-game integration tests passed');
})();
