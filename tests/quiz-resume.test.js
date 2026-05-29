const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
const gameUtilsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'game-utils.js'), 'utf8');
const quizSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'game-quiz.js'), 'utf8');

function createElement(id) {
  return {
    id,
    textContent: '',
    innerHTML: '',
    style: {},
    children: [],
    dataset: {},
    disabled: false,
    classList: {
      values: new Set(['hidden']),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      contains(value) { return this.values.has(value); },
      toggle(value, force) {
        const shouldAdd = force === undefined ? !this.values.has(value) : force;
        if (shouldAdd) this.values.add(value);
        else this.values.delete(value);
      }
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    querySelectorAll() {
      return [];
    },
    getBoundingClientRect() {
      return { left: 0, top: 0 };
    },
    focus() {},
    cloneNode() {
      return createElement(id);
    },
    replaceWith() {},
    addEventListener() {}
  };
}

function createContext() {
  const store = {};
  const elements = {};
  const context = {
    console,
    SAMPLE_DATA: [],
    Date,
    Math,
    Number,
    parseInt,
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 1;
    },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    requestAnimationFrame() {},
    cancelAnimationFrame() {},
    window: {
      innerWidth: 800,
      innerHeight: 600,
      addEventListener() {}
    },
    localStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      setItem(key, value) {
        store[key] = String(value);
      },
      removeItem(key) {
        delete store[key];
      }
    },
    document: {
      addEventListener() {},
      createElement(tag) {
        return createElement(tag);
      },
      getElementById(id) {
        if (!elements[id]) elements[id] = createElement(id);
        return elements[id];
      },
      querySelectorAll() {
        return [];
      },
      querySelector() {
        return null;
      },
      body: createElement('body')
    },
    loadFirebaseConfig() { return null; },
    initializeFirebase() {},
    showFirebaseSetsButton() {},
    renderSettingsScreen() {},
    refreshQuestionSetUI() {},
    refreshDataPreview() {},
    renderStatsScreen() {},
    startListen() {},
    startFlash() {},
    startTyping() {},
    startMatch() {},
    startWrite() {},
    speakJapanese() {},
    showToast() {},
    showComboPopup() {},
    maybeApplyFastCorrectCooldown() { return false; },
    updateQuestionStats() {},
    saveQuestionStats() {},
    saveDailyStreak() {},
    loadDailyStreak() {},
    loadSessionHistory() {},
    recordPlayTime() {},
    computeTotalStats() { return { totalCorrect: 0, totalWrong: 0, gameTypeStats: {} }; }
  };

  context.window.document = context.document;
  vm.createContext(context);
  vm.runInContext(
    `${mainSource}
${gameUtilsSource}
${storageSource}
${quizSource}
this.saveQuizResumeState = saveQuizResumeState;
this.loadQuizResumeState = loadQuizResumeState;
this.clearQuizResumeState = clearQuizResumeState;
this.resumeQuizFromState = resumeQuizFromState;
this.recordAbandonedSession = recordAbandonedSession;
this.startGame = startGame;
this.getSessionHistory = () => sessionHistory;
this.quizState = () => ({ quizDeck, quizIdx, quizHP, quizScore, quizCombo, quizCorrect, quizWrong });
this.setQuizState = (state) => {
  quizDeck = state.deck || quizDeck;
  quizIdx = state.idx ?? quizIdx;
  quizHP = state.hp ?? quizHP;
  quizScore = state.score ?? quizScore;
  quizCombo = state.combo ?? quizCombo;
  quizCorrect = state.correct ?? quizCorrect;
  quizWrong = state.wrong ?? quizWrong;
};
this.setAppState = (state) => {
  activeSetId = state.activeSetId ?? activeSetId;
  questions = state.questions ?? questions;
  settings = { ...settings, ...(state.settings || {}) };
};`,
    context
  );
  context.store = store;
  context.elements = elements;
  return context;
}

function seedQuizInProgress(context) {
  const deck = [
    { word: '学生', q: 'Reading?', a: ['がくせい', 'がくぜい'], c: 0, questionId: 'q-1' },
    { word: '先生', q: 'Reading?', a: ['せんせい', 'せんぜい'], c: 0, questionId: 'q-2' }
  ];
  context.setAppState({ activeSetId: 'set-a', settings: { quizTimeLimit: 20 } });
  context.setQuizState({
    deck,
    idx: 1,
    hp: 80,
    score: 15,
    combo: 2,
    correct: 1,
    wrong: 1
  });
  return deck;
}

function testSavesAndLoadsQuizResumeSnapshot() {
  const context = createContext();
  seedQuizInProgress(context);

  const saved = context.saveQuizResumeState();
  const loaded = context.loadQuizResumeState();

  assert.strictEqual(saved.type, 'quiz');
  assert.strictEqual(loaded.type, 'quiz');
  assert.strictEqual(loaded.activeSetId, 'set-a');
  assert.strictEqual(loaded.idx, 1);
  assert.strictEqual(loaded.hp, 80);
  assert.strictEqual(loaded.score, 15);
  assert.strictEqual(loaded.combo, 2);
  assert.strictEqual(loaded.correct, 1);
  assert.strictEqual(loaded.wrong, 1);
  assert.deepStrictEqual(Array.from(loaded.deck.map(q => q.questionId)), ['q-1', 'q-2']);
}

function testResumeRestoresQuizGlobalsAndClearsSavedState() {
  const context = createContext();
  seedQuizInProgress(context);
  context.saveQuizResumeState();

  context.setQuizState({
    deck: [],
    idx: 0,
    hp: 100,
    score: 0,
    combo: 0,
    correct: 0,
    wrong: 0
  });

  const resumed = context.resumeQuizFromState();
  const state = context.quizState();

  assert.strictEqual(resumed, true);
  assert.strictEqual(state.quizDeck.length, 2);
  assert.strictEqual(state.quizIdx, 1);
  assert.strictEqual(state.quizHP, 80);
  assert.strictEqual(state.quizScore, 15);
  assert.strictEqual(state.quizCombo, 2);
  assert.strictEqual(state.quizCorrect, 1);
  assert.strictEqual(state.quizWrong, 1);
  assert.strictEqual(context.localStorage.getItem('jq_resume_quiz'), null);
}

function testDoesNotSaveResumeWhenQuizIsComplete() {
  const context = createContext();
  const deck = seedQuizInProgress(context);
  context.setQuizState({ idx: deck.length });

  assert.strictEqual(context.saveQuizResumeState(), false);
  assert.strictEqual(context.localStorage.getItem('jq_resume_quiz'), null);
}

function testRecordAbandonedSessionAddsStatusWithoutDuplicates() {
  const context = createContext();

  context.recordAbandonedSession('quiz', 15, 1, 1, 'resume-1');
  context.recordAbandonedSession('quiz', 15, 1, 1, 'resume-1');

  assert.strictEqual(context.getSessionHistory().length, 1);
  assert.strictEqual(context.getSessionHistory()[0].status, 'abandoned');
  assert.strictEqual(context.getSessionHistory()[0].resumeId, 'resume-1');
  assert.strictEqual(JSON.parse(context.localStorage.getItem('jq_session_history')).length, 1);
}

function testStartGameShowsResumeModalWhenQuizResumeExists() {
  const context = createContext();
  context.setAppState({ questions: [{ word: '学生' }] });
  seedQuizInProgress(context);
  context.saveQuizResumeState();

  context.startGame('quiz');

  assert.strictEqual(context.elements['quiz-resume-modal'].classList.contains('hidden'), false);
}

testSavesAndLoadsQuizResumeSnapshot();
testResumeRestoresQuizGlobalsAndClearsSavedState();
testDoesNotSaveResumeWhenQuizIsComplete();
testRecordAbandonedSessionAddsStatusWithoutDuplicates();
testStartGameShowsResumeModalWhenQuizResumeExists();

console.log('quiz resume tests passed');
