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
