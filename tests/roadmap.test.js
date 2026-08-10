const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const gameUtilsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'game-utils.js'), 'utf8');
const roadmapSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'roadmap.js'), 'utf8');
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

testComputeSetProgressSumsAcrossGameTypesForTargetSetOnly();
testComputeSetProgressIgnoresMetaKey();
testComputeSetProgressReturnsZeroForUnattemptedQuestions();
testStarsForProgressThresholds();
testRenderStarStringPadsToThreeCharacters();
testGetSetsForRoadmapFiltersAndSortsDescending();
testBuildRoadmapNodesHtmlHighlightsMatchingSetAndEmbedsClickHandler();
testBuildRoadmapNodesHtmlCompactModeOmitsZigzagStaggerAndAvatarButKeepsHighlight();
testRenderRoadmapChipsHtmlMarksSelectedChipActive();

console.log('roadmap tests passed');
