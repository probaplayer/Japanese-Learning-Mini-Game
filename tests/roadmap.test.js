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
  assert.strictEqual(progress.correct, 0);
  assert.strictEqual(progress.wrong, 0);
  assert.strictEqual(progress.total, 0);
  assert.strictEqual(progress.accuracy, 0);
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
