const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'game-utils.js'), 'utf8');

function createContext(overrides = {}) {
  let saveCount = 0;
  const context = {
    settings: {
      shuffleAnswers: true,
      fastCorrectCooldownEnabled: true,
      fastCorrectCooldownDays: 3,
      fastCorrectThresholdSeconds: 8,
      priority: {
        enabled: true,
        global: { incorrect: 8, timeSinceSeen: 3, learning: 2, slowResponse: 3 }
      }
    },
    activeSetId: 'set-a',
    questions: [],
    questionStats: {},
    get saveCount() {
      return saveCount;
    },
    document: {
      getElementById() {
        return null;
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
      return arr.reverse();
    },
    ...overrides
  };

  vm.createContext(context);
  vm.runInContext(
    `${source}
this.generateQuestionId = generateQuestionId;
this.getScopedQuestionId = getScopedQuestionId;
this.getQuestionStatsEntry = getQuestionStatsEntry;
this.getAvailableQuestionsForGame = getAvailableQuestionsForGame;
this.getPrioritizedDeck = getPrioritizedDeck;
this.shuffleAnswerOptions = shuffleAnswerOptions;
this.updateQuestionStats = updateQuestionStats;
this.getConfidenceLevel = getConfidenceLevel;
this.getEffectiveIncorrect = getEffectiveIncorrect;
this.getVisibleGamesForCategory = getVisibleGamesForCategory;
this.GAME_CATEGORY_COMPAT = GAME_CATEGORY_COMPAT;`,
    context
  );
  return context;
}

function sampleQuestion(overrides = {}) {
  return {
    word: '学生',
    q: 'Reading?',
    romaji: 'がくせい',
    translation: 'Student',
    a: ['がくせい', 'がくぜい', 'がっせい', 'かくせい'],
    c: 0,
    ...overrides
  };
}

function testGenerateQuestionIdIsStableAndContentBased() {
  const context = createContext();
  const question = sampleQuestion();
  const sameQuestion = { ...question };
  const changedQuestion = sampleQuestion({ translation: 'Pupil' });

  assert.strictEqual(context.generateQuestionId(question), context.generateQuestionId(sameQuestion));
  assert.notStrictEqual(context.generateQuestionId(question), context.generateQuestionId(changedQuestion));
  assert.match(context.generateQuestionId(question), /^q-[a-z0-9]+$/);
}

function testScopedQuestionIdsIncludeActiveSetOnce() {
  const context = createContext();

  assert.strictEqual(context.getScopedQuestionId('q-abc'), 'set-a::q-abc');
  assert.strictEqual(context.getScopedQuestionId('set-b::q-abc'), 'set-b::q-abc');
}

function testShuffleAnswerOptionsKeepsCorrectAnswerMapping() {
  const context = createContext();
  const question = sampleQuestion({ c: 1 });

  const shuffled = context.shuffleAnswerOptions(question);
  assert.deepStrictEqual(shuffled.options, ['かくせい', 'がっせい', 'がくぜい', 'がくせい']);
  assert.strictEqual(shuffled.options[shuffled.correctIndex], 'がくぜい');

  context.settings.shuffleAnswers = false;
  const original = context.shuffleAnswerOptions(question);
  assert.deepStrictEqual(Array.from(original.options), question.a);
  assert.strictEqual(original.correctIndex, 1);
}

function testShuffleAnswerOptionsCarriesTranslationsThroughSamePermutation() {
  const context = createContext();
  const question = sampleQuestion({ c: 1, aTranslation: ['A', 'B', 'C', 'D'] });

  const shuffled = context.shuffleAnswerOptions(question);
  assert.deepStrictEqual(shuffled.translations, ['D', 'C', 'B', 'A']);
  assert.strictEqual(shuffled.translations[shuffled.correctIndex], 'B');

  context.settings.shuffleAnswers = false;
  const original = context.shuffleAnswerOptions(question);
  assert.deepStrictEqual(original.translations, question.aTranslation);
}

function testShuffleAnswerOptionsReturnsNullTranslationsWhenAbsent() {
  const context = createContext();
  const question = sampleQuestion({ c: 0 });

  assert.strictEqual(context.shuffleAnswerOptions(question).translations, null);

  context.settings.shuffleAnswers = false;
  assert.strictEqual(context.shuffleAnswerOptions(question).translations, null);
}

function testUpdateQuestionStatsTracksCorrectWrongAndResponseTime() {
  const context = createContext();

  context.updateQuestionStats('q-stat', 'quiz', true, 2000);
  context.updateQuestionStats('q-stat', 'quiz', true, 10000);
  context.updateQuestionStats('q-stat', 'quiz', false, 3000);

  const stats = context.questionStats['set-a::q-stat'].quiz;
  assert.strictEqual(stats.correctCount, 2);
  assert.strictEqual(stats.incorrect, 1);
  assert.strictEqual(stats.totalAttempts, 3);
  assert.strictEqual(stats.correctStreak, 0);
  assert.strictEqual(stats.fastCorrectStreak, 0);
  assert.strictEqual(stats.slowCorrectCount, 1);
  assert.strictEqual(stats.avgResponseTime, 5000);
  assert.strictEqual(stats.incorrectHistory.length, 1);
  assert.strictEqual(context.saveCount, 3);
}

function testAvailableQuestionsFiltersCooldownBySetAndMode() {
  const context = createContext();
  const question = sampleQuestion();
  const id = context.generateQuestionId(question);
  context.questionStats['set-a::' + id] = {
    _meta: {
      cooldowns: {
        quiz: {
          setAt: new Date().toISOString(),
          until: new Date(Date.now() + 86400000).toISOString()
        }
      }
    }
  };

  assert.strictEqual(context.getAvailableQuestionsForGame([question], 'quiz').length, 0);
  assert.strictEqual(context.getAvailableQuestionsForGame([question], 'listen').length, 1);

  context.activeSetId = 'set-b';
  assert.strictEqual(context.getAvailableQuestionsForGame([question], 'quiz').length, 1);
}

function testConfidenceAndEffectiveIncorrectUseDecayHistory() {
  const context = createContext();
  const now = new Date().toISOString();
  const stats = {
    incorrect: 9,
    incorrectHistory: [now, now]
  };

  assert.strictEqual(context.getEffectiveIncorrect(stats), 2);
  assert.strictEqual(context.getConfidenceLevel(0, 0), 'new');
  assert.strictEqual(context.getConfidenceLevel(1, 1), 'learning');
  assert.strictEqual(context.getConfidenceLevel(3, 2), 'familiar');
  assert.strictEqual(context.getConfidenceLevel(8, 1), 'mastered');
}

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
  assert.deepStrictEqual([...grammarGames].sort(), ['grammar']);
}

function testGetVisibleGamesForCategoryDefaultsUnknownCategoryToVocabulary() {
  const context = createContext();
  assert.deepStrictEqual([...context.getVisibleGamesForCategory(undefined)].sort(), ['flash', 'listen', 'match', 'quiz', 'type', 'write']);
}

testGenerateQuestionIdIsStableAndContentBased();
testScopedQuestionIdsIncludeActiveSetOnce();
testShuffleAnswerOptionsKeepsCorrectAnswerMapping();
testShuffleAnswerOptionsCarriesTranslationsThroughSamePermutation();
testShuffleAnswerOptionsReturnsNullTranslationsWhenAbsent();
testUpdateQuestionStatsTracksCorrectWrongAndResponseTime();
testAvailableQuestionsFiltersCooldownBySetAndMode();
testConfidenceAndEffectiveIncorrectUseDecayHistory();
testGenerateQuestionIdHandlesGrammarShapedQuestions();
testGetVisibleGamesForCategorySeparatesVocabularyAndGrammar();
testGetVisibleGamesForCategoryDefaultsUnknownCategoryToVocabulary();

console.log('game-utils tests passed');
