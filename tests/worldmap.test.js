const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const gameUtilsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'game-utils.js'), 'utf8');
const roadmapSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'roadmap.js'), 'utf8');
const worldmapSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'worldmap.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

function createContext() {
  const context = {
    console,
    questions: [],
    questionSets: [],
    roadmapDefinitions: [],
    packageDefinitions: [],
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
${worldmapSource}
this.setQuestionSets = (value) => { questionSets = value; };
this.setRoadmapDefinitions = (value) => { roadmapDefinitions = value; };
this.setPackageDefinitions = (value) => { packageDefinitions = value; };
this.setActiveSetId = (value) => { activeSetId = value; };
this.getRoadmapsForPackage = getRoadmapsForPackage;
this.pickDefaultWorldMapPackageId = pickDefaultWorldMapPackageId;
this.buildWorldMapZonesHtml = buildWorldMapZonesHtml;
this.buildContinueQuestCardHtml = buildContinueQuestCardHtml;
this.buildWorldMapIndexEntries = buildWorldMapIndexEntries;
this.buildWorldMapIndexHtml = buildWorldMapIndexHtml;`,
    context
  );
  return context;
}

function testGetRoadmapsForPackageFiltersAndSortsAscending() {
  const context = createContext();
  context.setRoadmapDefinitions([
    { id: 'r1', packageId: 'n4', order: 2 },
    { id: 'r2', packageId: 'n3', order: 1 },
    { id: 'r3', packageId: 'n4', order: 1 }
  ]);
  const result = context.getRoadmapsForPackage('n4');
  assert.deepStrictEqual(result.map(r => r.id), ['r3', 'r1']);
}

function testPickDefaultWorldMapPackageIdKeepsValidFallback() {
  const context = createContext();
  context.setPackageDefinitions([{ id: 'n4', order: 1 }, { id: 'n3', order: 2 }]);
  assert.strictEqual(context.pickDefaultWorldMapPackageId('n3'), 'n3');
}

function testPickDefaultWorldMapPackageIdIgnoresInvalidFallback() {
  const context = createContext();
  context.setPackageDefinitions([{ id: 'n4', order: 1 }]);
  assert.strictEqual(context.pickDefaultWorldMapPackageId('nope'), 'n4');
}

function testPickDefaultWorldMapPackageIdUsesActiveSetsRoadmapPackage() {
  const context = createContext();
  context.setPackageDefinitions([{ id: 'n4', order: 1 }, { id: 'n3', order: 2 }]);
  context.setRoadmapDefinitions([{ id: 'n3-path', packageId: 'n3' }]);
  context.setQuestionSets([{ id: 'set-a', roadmapId: 'n3-path' }]);
  context.setActiveSetId('set-a');
  assert.strictEqual(context.pickDefaultWorldMapPackageId(null), 'n3');
}

function testPickDefaultWorldMapPackageIdFallsBackToLowestOrder() {
  const context = createContext();
  context.setPackageDefinitions([{ id: 'n4', order: 2 }, { id: 'n3', order: 1 }]);
  assert.strictEqual(context.pickDefaultWorldMapPackageId(null), 'n3');
}

function testPickDefaultWorldMapPackageIdReturnsNullWhenNoPackages() {
  const context = createContext();
  context.setPackageDefinitions([]);
  assert.strictEqual(context.pickDefaultWorldMapPackageId(null), null);
}

function testBuildWorldMapZonesHtmlRendersOneZonePerRoadmapWithProgressSummary() {
  const context = createContext();
  context.setRoadmapDefinitions([{ id: 'r1', name: 'Bài 1', packageId: 'n4', order: 1 }]);
  context.setQuestionSets([
    { id: 'a', roadmapId: 'r1', name: 'Set A', category: 'vocabulary', questionCount: 5, order: 1 },
    { id: 'b', roadmapId: 'r1', name: 'Set B', category: 'grammar', questionCount: 5, order: 2 }
  ]);
  const progressById = new Map([
    ['a', { progress: { total: 3 }, stars: 3 }],
    ['b', { progress: { total: 0 }, stars: 0 }]
  ]);
  const html = context.buildWorldMapZonesHtml(context.getRoadmapsForPackage('n4'), progressById, null);
  assert.ok(html.includes('worldmap-zone-active'));
  assert.ok(html.includes('Bài 1'));
  assert.ok(html.includes('1/2'));
  assert.ok(html.includes('Set A'));
  assert.ok(html.includes('Set B'));
}

function testBuildWorldMapZonesHtmlMarksZoneCompleteWhenAllSetsMastered() {
  const context = createContext();
  context.setRoadmapDefinitions([{ id: 'r1', name: 'Bài 1', packageId: 'n4', order: 1 }]);
  context.setQuestionSets([{ id: 'a', roadmapId: 'r1', name: 'Set A', category: 'vocabulary', questionCount: 5, order: 1 }]);
  const progressById = new Map([['a', { progress: { total: 5 }, stars: 3 }]]);
  const html = context.buildWorldMapZonesHtml(context.getRoadmapsForPackage('n4'), progressById, null);
  assert.ok(html.includes('worldmap-zone-complete'));
  assert.ok(html.includes('1/1'));
}

function testBuildWorldMapZonesHtmlMarksZoneUntouchedWhenNothingPlayed() {
  const context = createContext();
  context.setRoadmapDefinitions([{ id: 'r1', name: 'Bài 1', packageId: 'n4', order: 1 }]);
  context.setQuestionSets([{ id: 'a', roadmapId: 'r1', name: 'Set A', category: 'vocabulary', questionCount: 5, order: 1 }]);
  const html = context.buildWorldMapZonesHtml(context.getRoadmapsForPackage('n4'), new Map(), null);
  assert.ok(html.includes('worldmap-zone-untouched'));
  assert.ok(html.includes('0/1'));
}

function testBuildWorldMapZonesHtmlMarksZoneCollapsedWhenNotExpanded() {
  const context = createContext();
  context.setRoadmapDefinitions([{ id: 'r1', name: 'Bài 1', packageId: 'n4', order: 1 }]);
  context.setQuestionSets([{ id: 'a', roadmapId: 'r1', name: 'Set A', category: 'vocabulary', questionCount: 5, order: 1 }]);
  const html = context.buildWorldMapZonesHtml(context.getRoadmapsForPackage('n4'), new Map(), null, new Set());
  assert.ok(html.includes('worldmap-zone-collapsed'));
}

function testBuildWorldMapZonesHtmlMarksZoneExpandedWhenInExpandedSet() {
  const context = createContext();
  context.setRoadmapDefinitions([{ id: 'r1', name: 'Bài 1', packageId: 'n4', order: 1 }]);
  context.setQuestionSets([{ id: 'a', roadmapId: 'r1', name: 'Set A', category: 'vocabulary', questionCount: 5, order: 1 }]);
  const html = context.buildWorldMapZonesHtml(context.getRoadmapsForPackage('n4'), new Map(), null, new Set(['r1']));
  assert.ok(!html.includes('worldmap-zone-collapsed'));
}

function testBuildWorldMapZonesHtmlDefaultsToCollapsedWhenExpandedSetOmitted() {
  const context = createContext();
  context.setRoadmapDefinitions([{ id: 'r1', name: 'Bài 1', packageId: 'n4', order: 1 }]);
  context.setQuestionSets([{ id: 'a', roadmapId: 'r1', name: 'Set A', category: 'vocabulary', questionCount: 5, order: 1 }]);
  const html = context.buildWorldMapZonesHtml(context.getRoadmapsForPackage('n4'), new Map(), null);
  assert.ok(html.includes('worldmap-zone-collapsed'));
}

function testBuildWorldMapZonesHtmlAlwaysIncludesNodeMarkupRegardlessOfCollapsedState() {
  const context = createContext();
  context.setRoadmapDefinitions([{ id: 'r1', name: 'Bài 1', packageId: 'n4', order: 1 }]);
  context.setQuestionSets([{ id: 'a', roadmapId: 'r1', name: 'Set A', category: 'vocabulary', questionCount: 5, order: 1 }]);
  const html = context.buildWorldMapZonesHtml(context.getRoadmapsForPackage('n4'), new Map(), null, new Set());
  assert.ok(html.includes('Set A'));
}

function testBuildWorldMapIndexEntriesGroupsSetsByRoadmap() {
  const context = createContext();
  context.setRoadmapDefinitions([
    { id: 'r1', name: 'N4 Bài 26', packageId: 'n4', order: 1 },
    { id: 'r2', name: 'N3 Bài 1', packageId: 'n3', order: 1 }
  ]);
  context.setQuestionSets([
    { id: 'a', roadmapId: 'r1', name: 'N4 Bài 26 - Từ vựng', order: 1 },
    { id: 'b', roadmapId: 'r1', name: 'N4 Bài 26 - Ngữ pháp', order: 2 },
    { id: 'c', roadmapId: 'r2', name: 'N3 Bài 1 - Từ vựng', order: 1 }
  ]);
  const entries = context.buildWorldMapIndexEntries();
  assert.strictEqual(entries.length, 2);
  const r1Entry = entries.find(e => e.roadmapId === 'r1');
  assert.strictEqual(r1Entry.roadmapName, 'N4 Bài 26');
  assert.deepStrictEqual(r1Entry.sets.map(s => s.id).sort(), ['a', 'b']);
}

function testBuildWorldMapIndexHtmlShowsEverythingWhenQueryEmpty() {
  const context = createContext();
  const entries = [
    { roadmapId: 'r1', roadmapName: 'N4 Bài 26', sets: [{ id: 'a', name: 'N4 Bài 26 - Từ vựng' }] },
    { roadmapId: 'r2', roadmapName: 'N3 Bài 1', sets: [{ id: 'c', name: 'N3 Bài 1 - Từ vựng' }] }
  ];
  const html = context.buildWorldMapIndexHtml(entries, '');
  assert.ok(html.includes('N4 Bài 26'));
  assert.ok(html.includes('N3 Bài 1'));
  assert.ok(html.includes('N4 Bài 26 - Từ vựng'));
  assert.ok(html.includes('N3 Bài 1 - Từ vựng'));
}

function testBuildWorldMapIndexHtmlFiltersByRoadmapNameCaseInsensitive() {
  const context = createContext();
  const entries = [
    { roadmapId: 'r1', roadmapName: 'N4 Bài 26', sets: [{ id: 'a', name: 'N4 Bài 26 - Từ vựng' }] },
    { roadmapId: 'r2', roadmapName: 'N3 Bài 1', sets: [{ id: 'c', name: 'N3 Bài 1 - Từ vựng' }] }
  ];
  const html = context.buildWorldMapIndexHtml(entries, 'bài 26');
  assert.ok(html.includes('N4 Bài 26'));
  assert.ok(!html.includes('N3 Bài 1'));
}

function testBuildWorldMapIndexHtmlFiltersBySetNameKeepingOnlyMatchingSets() {
  const context = createContext();
  const entries = [
    { roadmapId: 'r1', roadmapName: 'N4 Bài 26', sets: [
      { id: 'a', name: 'N4 Bài 26 - Từ vựng' },
      { id: 'b', name: 'N4 Bài 26 - Ngữ pháp' }
    ] }
  ];
  const html = context.buildWorldMapIndexHtml(entries, 'ngữ pháp');
  assert.ok(html.includes('N4 Bài 26'));
  assert.ok(html.includes('N4 Bài 26 - Ngữ pháp'));
  assert.ok(!html.includes('N4 Bài 26 - Từ vựng'));
}

function testBuildWorldMapIndexHtmlHighlightsSelectedRoadmap() {
  const context = createContext();
  const entries = [
    { roadmapId: 'r1', roadmapName: 'N4 Bài 26', sets: [{ id: 'a', name: 'N4 Bài 26 - Từ vựng' }] },
    { roadmapId: 'r2', roadmapName: 'N3 Bài 1', sets: [{ id: 'c', name: 'N3 Bài 1 - Từ vựng' }] }
  ];
  const html = context.buildWorldMapIndexHtml(entries, '', 'r1', null);
  const r1Match = html.match(/<button class="worldmap-index-roadmap ([^"]*)" onclick="navigateWorldMapIndex\('r1'\)">/);
  const r2Match = html.match(/<button class="worldmap-index-roadmap ([^"]*)" onclick="navigateWorldMapIndex\('r2'\)">/);
  assert.ok(r1Match && r1Match[1].includes('worldmap-index-item-active'));
  assert.ok(r2Match && !r2Match[1].includes('worldmap-index-item-active'));
}

function testBuildWorldMapIndexHtmlHighlightsSelectedSetNotItsRoadmap() {
  const context = createContext();
  const entries = [
    { roadmapId: 'r1', roadmapName: 'N4 Bài 26', sets: [
      { id: 'a', name: 'N4 Bài 26 - Từ vựng' },
      { id: 'b', name: 'N4 Bài 26 - Ngữ pháp' }
    ] }
  ];
  const html = context.buildWorldMapIndexHtml(entries, '', 'r1', 'b');
  const roadmapMatch = html.match(/<button class="worldmap-index-roadmap ([^"]*)" onclick="navigateWorldMapIndex\('r1'\)">/);
  const setBMatch = html.match(/<button class="worldmap-index-set ([^"]*)" onclick="navigateWorldMapIndex\('r1', 'b'\)">/);
  const setAMatch = html.match(/<button class="worldmap-index-set ([^"]*)" onclick="navigateWorldMapIndex\('r1', 'a'\)">/);
  assert.ok(roadmapMatch && !roadmapMatch[1].includes('worldmap-index-item-active'));
  assert.ok(setBMatch && setBMatch[1].includes('worldmap-index-item-active'));
  assert.ok(setAMatch && !setAMatch[1].includes('worldmap-index-item-active'));
}

function testBuildWorldMapIndexHtmlShowsNoResultsMessageWhenNothingMatches() {
  const context = createContext();
  const entries = [
    { roadmapId: 'r1', roadmapName: 'N4 Bài 26', sets: [{ id: 'a', name: 'N4 Bài 26 - Từ vựng' }] }
  ];
  const html = context.buildWorldMapIndexHtml(entries, 'zzz-no-match');
  assert.ok(!html.includes('N4 Bài 26'));
  assert.ok(html.toLowerCase().includes('no results'));
}

function testBuildContinueQuestCardHtmlShowsSetAndZoneName() {
  const context = createContext();
  const html = context.buildContinueQuestCardHtml({ id: 'a', name: 'Set A' }, 'Bài 1');
  assert.ok(html.includes('Set A'));
  assert.ok(html.includes('Bài 1'));
  assert.ok(html.includes("showScreen('screen-play')"));
}

function testBuildContinueQuestCardHtmlShowsEmptyStateWhenNoActiveSet() {
  const context = createContext();
  const html = context.buildContinueQuestCardHtml(null, null);
  assert.ok(html.includes('Pick a lesson to begin'));
}

testGetRoadmapsForPackageFiltersAndSortsAscending();
testPickDefaultWorldMapPackageIdKeepsValidFallback();
testPickDefaultWorldMapPackageIdIgnoresInvalidFallback();
testPickDefaultWorldMapPackageIdUsesActiveSetsRoadmapPackage();
testPickDefaultWorldMapPackageIdFallsBackToLowestOrder();
testPickDefaultWorldMapPackageIdReturnsNullWhenNoPackages();
testBuildWorldMapZonesHtmlRendersOneZonePerRoadmapWithProgressSummary();
testBuildWorldMapZonesHtmlMarksZoneCompleteWhenAllSetsMastered();
testBuildWorldMapZonesHtmlMarksZoneUntouchedWhenNothingPlayed();
testBuildWorldMapZonesHtmlMarksZoneCollapsedWhenNotExpanded();
testBuildWorldMapZonesHtmlMarksZoneExpandedWhenInExpandedSet();
testBuildWorldMapZonesHtmlDefaultsToCollapsedWhenExpandedSetOmitted();
testBuildWorldMapZonesHtmlAlwaysIncludesNodeMarkupRegardlessOfCollapsedState();
testBuildWorldMapIndexEntriesGroupsSetsByRoadmap();
testBuildWorldMapIndexHtmlShowsEverythingWhenQueryEmpty();
testBuildWorldMapIndexHtmlFiltersByRoadmapNameCaseInsensitive();
testBuildWorldMapIndexHtmlFiltersBySetNameKeepingOnlyMatchingSets();
testBuildWorldMapIndexHtmlHighlightsSelectedRoadmap();
testBuildWorldMapIndexHtmlHighlightsSelectedSetNotItsRoadmap();
testBuildWorldMapIndexHtmlShowsNoResultsMessageWhenNothingMatches();
testBuildContinueQuestCardHtmlShowsSetAndZoneName();
testBuildContinueQuestCardHtmlShowsEmptyStateWhenNoActiveSet();

console.log('world map tests passed');
