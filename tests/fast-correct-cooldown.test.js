const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'game-utils.js'), 'utf8');

function createContext() {
  let saveCount = 0;
  const elements = {};
  const makeElement = (id) => ({
    id,
    textContent: '',
    onclick: null,
    focused: false,
    classList: {
      values: new Set(['hidden']),
      add(value) {
        this.values.add(value);
      },
      remove(value) {
        this.values.delete(value);
      },
      contains(value) {
        return this.values.has(value);
      }
    },
    focus() {
      this.focused = true;
    }
  });
  const context = {
    settings: {
      fastCorrectCooldownEnabled: true,
      fastCorrectCooldownDays: 3,
      fastCorrectThresholdSeconds: 8,
      priority: {
        enabled: false,
        global: { incorrect: 0, timeSinceSeen: 0, learning: 0, slowResponse: 0 }
      }
    },
    activeSetId: 'set-a',
    questions: [],
    questionStats: {},
    get saveCount() {
      return saveCount;
    },
    document: {
      getElementById(id) {
        if (!elements[id]) elements[id] = makeElement(id);
        return elements[id];
      }
    },
    Date,
    Math,
    Number,
    parseInt,
    saveQuestionStats() {
      saveCount += 1;
    },
    showToast() {},
    shuffle(arr) {
      return arr;
    }
  };
  context.document.getElementById('fast-correct-cooldown-modal');
  context.document.getElementById('fast-correct-cooldown-message');
  context.document.getElementById('fast-correct-cooldown-confirm');
  context.document.getElementById('fast-correct-cooldown-cancel');

  vm.createContext(context);
  vm.runInContext(
    `${source}
this.generateQuestionId = generateQuestionId;
this.getPrioritizedDeck = getPrioritizedDeck;
this.maybeApplyFastCorrectCooldown = maybeApplyFastCorrectCooldown;
this.updateQuestionStats = updateQuestionStats;`,
    context
  );
  context.elements = elements;

  return context;
}

function testDeclinedCooldownDoesNotHideQuestion() {
  const context = createContext();

  const applied = context.maybeApplyFastCorrectCooldown('q-fast', 'quiz', 2000);
  assert.strictEqual(context.elements['fast-correct-cooldown-modal'].classList.contains('hidden'), false);
  context.elements['fast-correct-cooldown-cancel'].onclick();

  assert.strictEqual(applied, true);
  assert.match(context.elements['fast-correct-cooldown-message'].textContent, /3 days/);
  assert.strictEqual(context.elements['fast-correct-cooldown-modal'].classList.contains('hidden'), true);
  assert.strictEqual(context.questionStats['q-fast'], undefined);
  assert.strictEqual(context.saveCount, 0);
}

function testAcceptedCooldownHidesQuestionUntilConfiguredDate() {
  const context = createContext();
  let advanced = false;

  const applied = context.maybeApplyFastCorrectCooldown('q-fast', 'listen', 2000, () => {
    advanced = true;
  });
  assert.strictEqual(context.elements['fast-correct-cooldown-modal'].classList.contains('hidden'), false);
  context.elements['fast-correct-cooldown-confirm'].onclick();

  assert.strictEqual(applied, true);
  assert.strictEqual(context.elements['fast-correct-cooldown-modal'].classList.contains('hidden'), true);
  const meta = context.questionStats['set-a::q-fast']._meta;
  assert.ok(new Date(meta.cooldowns.listen.until).getTime() > Date.now());
  assert.strictEqual(context.saveCount, 1);
  assert.strictEqual(advanced, true);
}

function testDeclinedCooldownSignalsKeepWithoutApplying() {
  const context = createContext();
  let callbackValue = null;

  context.maybeApplyFastCorrectCooldown('q-fast', 'quiz', 2000, (applied) => {
    callbackValue = applied;
  });
  context.elements['fast-correct-cooldown-cancel'].onclick();

  assert.strictEqual(context.questionStats['q-fast'], undefined);
  assert.strictEqual(callbackValue, false);
}

function testSlowCorrectAnswerDoesNotPrompt() {
  const context = createContext();

  const applied = context.maybeApplyFastCorrectCooldown('q-slow', 'quiz', 9000);

  assert.strictEqual(applied, false);
  assert.strictEqual(context.elements['fast-correct-cooldown-modal'].classList.contains('hidden'), true);
  assert.strictEqual(context.questionStats['q-slow'], undefined);
  assert.strictEqual(context.saveCount, 0);
}

function testCooldownIsScopedToActiveQuestionSetAndGameMode() {
  const context = createContext();
  const question = {
    word: '学生',
    q: 'Reading?',
    romaji: 'gakusei',
    translation: 'student',
    a: ['がくせい'],
    c: 0
  };
  const questionId = context.generateQuestionId(question);

  context.activeSetId = 'set-a';
  context.maybeApplyFastCorrectCooldown(questionId, 'quiz', 1000);
  context.elements['fast-correct-cooldown-confirm'].onclick();

  assert.strictEqual(context.getPrioritizedDeck([question], 'quiz').length, 0);
  const listenDeck = context.getPrioritizedDeck([question], 'listen');
  assert.strictEqual(listenDeck.length, 1);
  assert.strictEqual(listenDeck[0].word, question.word);

  context.activeSetId = 'set-b';
  const otherSetDeck = context.getPrioritizedDeck([question], 'quiz');
  assert.strictEqual(otherSetDeck.length, 1);
  assert.strictEqual(otherSetDeck[0].word, question.word);
}

function testFastCorrectPopupOnlyAppliesToAllowedGames() {
  const context = createContext();

  const prompted = context.maybeApplyFastCorrectCooldown('q-fast', 'write', 1000);

  assert.strictEqual(prompted, false);
  assert.strictEqual(context.elements['fast-correct-cooldown-modal'].classList.contains('hidden'), true);
  assert.deepStrictEqual(context.questionStats, {});
}

function testWeakQuestionDoesNotShowFastCorrectPopup() {
  const context = createContext();
  const now = new Date().toISOString();
  context.questionStats['set-a::q-weak'] = {
    quiz: {
      incorrect: 2,
      correctCount: 0,
      totalAttempts: 2,
      lastSeen: now,
      correctStreak: 0,
      avgResponseTime: 0,
      slowCorrectCount: 0,
      incorrectHistory: [now, now]
    }
  };

  const prompted = context.maybeApplyFastCorrectCooldown('q-weak', 'quiz', 1000);

  assert.strictEqual(prompted, false);
  assert.strictEqual(context.elements['fast-correct-cooldown-modal'].classList.contains('hidden'), true);
}

function testSlowCorrectUsesConfiguredFastThresholdWithoutOverlap() {
  const context = createContext();
  context.updateQuestionStats('q-speed', 'quiz', true, 8000);
  context.updateQuestionStats('q-speed', 'quiz', true, 8001);

  assert.strictEqual(context.questionStats['set-a::q-speed'].quiz.slowCorrectCount, 1);
}

testDeclinedCooldownDoesNotHideQuestion();
testAcceptedCooldownHidesQuestionUntilConfiguredDate();
testDeclinedCooldownSignalsKeepWithoutApplying();
testSlowCorrectAnswerDoesNotPrompt();
testCooldownIsScopedToActiveQuestionSetAndGameMode();
testFastCorrectPopupOnlyAppliesToAllowedGames();
testWeakQuestionDoesNotShowFastCorrectPopup();
testSlowCorrectUsesConfiguredFastThresholdWithoutOverlap();

console.log('fast-correct cooldown tests passed');
