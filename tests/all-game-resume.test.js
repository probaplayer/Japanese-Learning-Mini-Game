const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sources = [
  ['js', 'main.js'],
  ['js', 'game-utils.js'],
  ['js', 'storage.js'],
  ['js', 'games', 'game-quiz.js'],
  ['js', 'games', 'game-listen.js'],
  ['js', 'games', 'game-flash.js'],
  ['js', 'games', 'game-match.js'],
  ['js', 'games', 'game-type.js'],
  ['js', 'games', 'game-write.js'],
  ['js', 'games', 'game-grammar.js']
].map(parts => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8'));

function createElement(id) {
  return {
    id,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    children: [],
    dataset: {},
    disabled: false,
    width: 300,
    height: 150,
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
      return { left: 0, top: 0, width: this.width, height: this.height };
    },
    getContext() {
      return {
        clearRect() {},
        fillRect() {},
        strokeRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        fillText() {},
        measureText(text) { return { width: String(text).length * 10 }; },
        save() {},
        restore() {}
      };
    },
    focus() {},
    cloneNode() {
      return createElement(id);
    },
    replaceWith() {},
    addEventListener() {},
    removeEventListener() {}
  };
}

function createContext() {
  const store = {};
  const elements = {};
  const context = {
    console,
    Date,
    Math,
    Number,
    parseInt,
    JSON,
    Array,
    Object,
    String,
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    window: {
      innerWidth: 800,
      innerHeight: 600,
      addEventListener() {},
      removeEventListener() {}
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
      removeEventListener() {},
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
    KanjiCanvas: {
      init(id) {
        this[`ctx_${id}`] = createElement(id).getContext('2d');
        this[`w_${id}`] = 280;
        this[`h_${id}`] = 280;
      },
      erase() {},
      deleteLast() {},
      redraw() {},
      momentNormalize() { return []; },
      extractFeatures() { return []; },
      coarseClassification() { return ''; },
      fineClassification() { return ''; },
      recordedPattern_writeCanvas: []
    },
    fetch() {
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve({ meanings: ['student'], kun_readings: [], on_readings: [] });
        }
      });
    },
    Audio() {
      return { play() { return Promise.resolve(); } };
    },
    renderSettingsScreen() {},
    refreshQuestionSetUI() {},
    renderStatsScreen() {},
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
    `${sources.join('\n')}
this.saveGameResumeState = saveGameResumeState;
this.loadGameResumeState = loadGameResumeState;
this.clearGameResumeState = clearGameResumeState;
this.resumeGameFromState = resumeGameFromState;
this.startGame = startGame;
this.setAppState = (state) => {
  activeSetId = state.activeSetId ?? activeSetId;
  questions = state.questions ?? questions;
  settings = { ...settings, ...(state.settings || {}) };
};
this.listenState = () => ({ listenDeck, listenIdx, listenHP, listenScore, listenCombo, listenCorrect, listenWrong });
this.setListenState = (state) => {
  listenDeck = state.deck ?? listenDeck;
  listenIdx = state.idx ?? listenIdx;
  listenHP = state.hp ?? listenHP;
  listenScore = state.score ?? listenScore;
  listenCombo = state.combo ?? listenCombo;
  listenCorrect = state.correct ?? listenCorrect;
  listenWrong = state.wrong ?? listenWrong;
};
this.flashState = () => ({ flashDeck, flashIdx, flashKnown, flashUnknown });
this.setFlashState = (state) => {
  flashDeck = state.deck ?? flashDeck;
  flashIdx = state.idx ?? flashIdx;
  flashKnown = state.known ?? flashKnown;
  flashUnknown = state.unknown ?? flashUnknown;
};
this.matchState = () => ({ matchCards, matchSelection, matchAttempts, matchFound, pairCount, matchTimeLeft, matchActive, matchCorrect, matchWrong });
this.setMatchState = (state) => {
  matchCards = state.cards ?? matchCards;
  matchSelection = state.selection ?? matchSelection;
  matchAttempts = state.attempts ?? matchAttempts;
  matchFound = state.found ?? matchFound;
  pairCount = state.pairCount ?? pairCount;
  matchTimeLeft = state.timeLeft ?? matchTimeLeft;
  matchActive = state.active ?? matchActive;
  matchCorrect = state.correct ?? matchCorrect;
  matchWrong = state.wrong ?? matchWrong;
};
this.typeState = () => ({ fallingWords, typeHP, typeScore, typeCombo, typeCorrect, typeWrong, typeDeck, spawnTimer, spawnInterval, gameSpeed, isStartGame });
this.setTypeState = (state) => {
  fallingWords = state.fallingWords ?? fallingWords;
  typeHP = state.hp ?? typeHP;
  typeScore = state.score ?? typeScore;
  typeCombo = state.combo ?? typeCombo;
  typeCorrect = state.correct ?? typeCorrect;
  typeWrong = state.wrong ?? typeWrong;
  typeDeck = state.deck ?? typeDeck;
  spawnTimer = state.spawnTimer ?? spawnTimer;
  spawnInterval = state.spawnInterval ?? spawnInterval;
  gameSpeed = state.gameSpeed ?? gameSpeed;
  isStartGame = state.active ?? isStartGame;
};
this.writeState = () => ({ writeDeck, writeIdx, writeHP, writeScore, writeCombo, writeCorrect, writeWrong, writeKanjiQueue, writeCurrentKanjiIdx });
this.setWriteState = (state) => {
  writeDeck = state.deck ?? writeDeck;
  writeIdx = state.idx ?? writeIdx;
  writeHP = state.hp ?? writeHP;
  writeScore = state.score ?? writeScore;
  writeCombo = state.combo ?? writeCombo;
  writeCorrect = state.correct ?? writeCorrect;
  writeWrong = state.wrong ?? writeWrong;
  writeKanjiQueue = state.kanjiQueue ?? writeKanjiQueue;
  writeCurrentKanjiIdx = state.currentKanjiIdx ?? writeCurrentKanjiIdx;
};
this.isGrammarAnswerCorrect = isGrammarAnswerCorrect;
this.grammarState = () => ({ grammarDeck, grammarIdx, grammarHP, grammarScore, grammarCombo, grammarCorrect, grammarWrong, grammarAnswer, grammarAnswered });
this.setGrammarState = (state) => {
  grammarDeck = state.deck ?? grammarDeck;
  grammarIdx = state.idx ?? grammarIdx;
  grammarHP = state.hp ?? grammarHP;
  grammarScore = state.score ?? grammarScore;
  grammarCombo = state.combo ?? grammarCombo;
  grammarCorrect = state.correct ?? grammarCorrect;
  grammarWrong = state.wrong ?? grammarWrong;
  grammarAnswer = state.answer ?? grammarAnswer;
  if (state.answered !== undefined) grammarAnswered = state.answered;
};`,
    context
  );
  context.store = store;
  context.elements = elements;
  return context;
}

function sampleDeck() {
  return [
    { word: '学生', romaji: 'がくせい', translation: 'Học sinh', q: 'Reading?', a: ['がくせい', 'せんせい'], c: 0, questionId: 'q-1' },
    { word: '先生', romaji: 'せんせい', translation: 'Giáo viên', q: 'Reading?', a: ['せんせい', 'がくせい'], c: 0, questionId: 'q-2' }
  ];
}

function testListenResumeRoundTrip() {
  const context = createContext();
  const deck = sampleDeck();
  context.setAppState({ activeSetId: 'set-a' });
  context.setListenState({ deck, idx: 1, hp: 70, score: 30, combo: 2, correct: 2, wrong: 1 });

  const saved = context.saveGameResumeState('listen');
  context.setListenState({ deck: [], idx: 0, hp: 100, score: 0, combo: 0, correct: 0, wrong: 0 });
  const resumed = context.resumeGameFromState('listen');
  const state = context.listenState();

  assert.strictEqual(saved.type, 'listen');
  assert.strictEqual(resumed, true);
  assert.strictEqual(state.listenIdx, 1);
  assert.strictEqual(state.listenHP, 70);
  assert.strictEqual(state.listenScore, 30);
  assert.strictEqual(state.listenCombo, 2);
  assert.strictEqual(state.listenCorrect, 2);
  assert.strictEqual(state.listenWrong, 1);
  assert.strictEqual(context.localStorage.getItem('jq_resume_listen'), null);
}

function testFlashResumeRoundTrip() {
  const context = createContext();
  const deck = sampleDeck();
  context.setFlashState({ deck, idx: 1, known: 3, unknown: 1 });

  context.saveGameResumeState('flash');
  context.setFlashState({ deck: [], idx: 0, known: 0, unknown: 0 });
  context.resumeGameFromState('flash');
  const state = context.flashState();

  assert.strictEqual(state.flashIdx, 1);
  assert.strictEqual(state.flashKnown, 3);
  assert.strictEqual(state.flashUnknown, 1);
}

function testMatchResumeRoundTrip() {
  const context = createContext();
  const cards = [
    { id: 'a', pairId: '1', text: '学生', matched: true, revealed: true },
    { id: 'b', pairId: '1', text: 'Học sinh', matched: true, revealed: true },
    { id: 'c', pairId: '2', text: '先生', matched: false, revealed: true },
    { id: 'd', pairId: '2', text: 'Giáo viên', matched: false, revealed: false }
  ];
  context.setMatchState({ cards, selection: ['c'], attempts: 4, found: 1, pairCount: 2, timeLeft: 42, active: true, correct: 1, wrong: 3 });

  context.saveGameResumeState('match');
  context.setMatchState({ cards: [], selection: [], attempts: 0, found: 0, pairCount: 0, timeLeft: 0, active: false, correct: 0, wrong: 0 });
  context.resumeGameFromState('match');
  const state = context.matchState();

  assert.strictEqual(state.matchFound, 1);
  assert.strictEqual(state.matchAttempts, 4);
  assert.strictEqual(state.matchTimeLeft, 42);
  assert.strictEqual(state.matchActive, true);
  assert.deepStrictEqual(Array.from(state.matchSelection), []);
  assert.strictEqual(state.matchCards.find(card => card.id === 'c').revealed, false);
}

function testTypeResumeRoundTrip() {
  const context = createContext();
  const deck = sampleDeck();
  context.setTypeState({
    deck,
    fallingWords: [{ id: 'w1', q: deck[0], text: 'がくせい', x: 10, y: 20, speed: 1, startedAt: 123 }],
    hp: 60,
    score: 25,
    combo: 2,
    correct: 2,
    wrong: 1,
    spawnTimer: 12,
    spawnInterval: 99,
    gameSpeed: 0.5,
    active: true
  });

  context.saveGameResumeState('type');
  context.setTypeState({ deck: [], fallingWords: [], hp: 100, score: 0, combo: 0, correct: 0, wrong: 0, active: false });
  context.resumeGameFromState('type');
  const state = context.typeState();

  assert.strictEqual(state.typeHP, 60);
  assert.strictEqual(state.typeScore, 25);
  assert.strictEqual(state.fallingWords.length, 1);
  assert.strictEqual(state.isStartGame, true);
}

function testWriteResumeRoundTrip() {
  const context = createContext();
  const deck = sampleDeck();
  context.setWriteState({ deck, idx: 1, hp: 75, score: 20, combo: 1, correct: 1, wrong: 2, kanjiQueue: ['先', '生'], currentKanjiIdx: 1 });

  context.saveGameResumeState('write');
  context.setWriteState({ deck: [], idx: 0, hp: 100, score: 0, combo: 0, correct: 0, wrong: 0, kanjiQueue: [], currentKanjiIdx: 0 });
  context.resumeGameFromState('write');
  const state = context.writeState();

  assert.strictEqual(state.writeIdx, 1);
  assert.strictEqual(state.writeHP, 75);
  assert.strictEqual(state.writeScore, 20);
  assert.deepStrictEqual(Array.from(state.writeKanjiQueue), ['先', '生']);
  assert.strictEqual(state.writeCurrentKanjiIdx, 1);
}

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

function testGrammarResumeAdvancesPastAlreadyGradedQuestion() {
  const context = createContext();
  const deck = sampleGrammarDeck();
  context.setAppState({ activeSetId: 'set-a' });
  // Simulate: player answered question 0 wrong, the reveal placed the full
  // correct order into grammarAnswer, then the player exited before
  // pressing "Next". grammarAnswered=true marks this question as graded.
  context.setGrammarState({
    deck,
    idx: 0,
    hp: 60,
    score: 40,
    combo: 0,
    correct: 0,
    wrong: 1,
    answer: [...deck[0].chunks],
    answered: true
  });

  const saved = context.saveGameResumeState('grammar');
  assert.strictEqual(saved.type, 'grammar');
  assert.strictEqual(saved.idx, 1, 'resume pointer should skip past the already-graded question');
  assert.deepStrictEqual(Array.from(saved.answer), [], 'resume answer should be empty, not the revealed correct order');

  context.setGrammarState({ deck: [], idx: 0, hp: 100, score: 0, combo: 0, correct: 0, wrong: 0, answer: [], answered: false });
  const resumed = context.resumeGameFromState('grammar');
  const state = context.grammarState();

  assert.strictEqual(resumed, true);
  assert.strictEqual(state.grammarIdx, 1);
  assert.deepStrictEqual(Array.from(state.grammarAnswer), []);
  assert.strictEqual(context.localStorage.getItem('jq_resume_grammar'), null);
}

function testGrammarResumeReturnsNullWhenGradedQuestionWasLast() {
  const context = createContext();
  const deck = sampleGrammarDeck();
  context.setAppState({ activeSetId: 'set-a' });
  // The graded question was the last one in the deck — nothing left to
  // resume, so no resume state should be persisted (same as deck-exhausted).
  context.setGrammarState({
    deck,
    idx: deck.length - 1,
    hp: 50,
    score: 60,
    combo: 1,
    correct: 1,
    wrong: 1,
    answer: [...deck[deck.length - 1].chunks],
    answered: true
  });

  const saved = context.saveGameResumeState('grammar');
  assert.strictEqual(saved, false, 'no resumable question remains, so save should report false');
  assert.strictEqual(context.localStorage.getItem('jq_resume_grammar'), null);
}

function testStartGameShowsResumeModalForAnyGame() {
  const context = createContext();
  context.setAppState({ questions: sampleDeck() });
  context.setListenState({ deck: sampleDeck(), idx: 1, hp: 70, score: 30, combo: 2, correct: 2, wrong: 1 });
  context.saveGameResumeState('listen');

  context.startGame('listen');

  assert.strictEqual(context.elements['quiz-resume-modal'].classList.contains('hidden'), false);
  assert.strictEqual(context.elements['quiz-resume-title'].textContent.includes('LISTENING'), true);
}

testListenResumeRoundTrip();
testFlashResumeRoundTrip();
testMatchResumeRoundTrip();
testTypeResumeRoundTrip();
testWriteResumeRoundTrip();
testStartGameShowsResumeModalForAnyGame();
testIsGrammarAnswerCorrectComparesOrderAndLength();
testGrammarResumeRoundTrip();
testGrammarResumeAdvancesPastAlreadyGradedQuestion();
testGrammarResumeReturnsNullWhenGradedQuestionWasLast();

console.log('all-game resume tests passed');
