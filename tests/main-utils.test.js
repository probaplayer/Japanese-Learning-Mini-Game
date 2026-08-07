const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

function createElement(id) {
  return {
    id,
    style: {},
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      contains(value) { return this.values.has(value); },
      toggle(value, force) {
        const shouldAdd = force === undefined ? !this.values.has(value) : !!force;
        if (shouldAdd) this.values.add(value); else this.values.delete(value);
        return shouldAdd;
      }
    }
  };
}

function createContext(randomValues = []) {
  const math = Object.create(Math);
  let randomIndex = 0;
  math.random = () => {
    const value = randomValues[randomIndex] ?? 0;
    randomIndex += 1;
    return value;
  };

  const elements = {};
  const gameUtilsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'game-utils.js'), 'utf8');
  const context = {
    console,
    Math: math,
    questionSets: [],
    activeSetId: null,
    questions: [],
    playerHP: 100, playerEXP: 0, playerLevel: 1, playerCombo: 0,
    dailyStreak: { currentStreak: 0 },
    document: {
      addEventListener() {},
      getElementById(id) {
        if (!elements[id]) elements[id] = createElement(id);
        return elements[id];
      },
      querySelectorAll(selector) {
        if (selector === '.menu-btn[data-game]') {
          return Object.values(elements).filter(el => el.dataset && el.dataset.game);
        }
        return [];
      }
    },
    getXpForLevel() { return 500; }
  };

  vm.createContext(context);
  vm.runInContext(
    `${gameUtilsSource}
${source}
this.escapeHtml = escapeHtml;
this.shuffle = shuffle;
this.updateMenuUI = updateMenuUI;
this.setQuestionSets = (value) => { questionSets = value; };
this.setActiveSetId = (value) => { activeSetId = value; };`,
    context
  );
  context.elements = elements;
  return context;
}

function testEscapeHtmlHandlesUnsafeAndEmptyValues() {
  const context = createContext();

  assert.strictEqual(context.escapeHtml(null), '');
  assert.strictEqual(context.escapeHtml(undefined), '');
  assert.strictEqual(
    context.escapeHtml(`<button data-x="1">'学生' & more</button>`),
    '&lt;button data-x=&quot;1&quot;&gt;&#39;学生&#39; &amp; more&lt;/button&gt;'
  );
}

function testShuffleMutatesAndReturnsSameArrayWithFisherYatesSwaps() {
  const context = createContext([0, 0.5, 0]);
  const input = ['a', 'b', 'c', 'd'];

  const result = context.shuffle(input);

  assert.strictEqual(result, input);
  assert.deepStrictEqual(result, ['c', 'd', 'b', 'a']);
}

function createMenuButtonElement(game) {
  const el = createElement(`btn-${game}`);
  el.dataset = { game };
  return el;
}

function testUpdateMenuUIHidesGamesNotCompatibleWithActiveCategory() {
  const context = createContext();
  context.elements['menu-hp'] = createElement('menu-hp');
  context.elements['menu-exp'] = createElement('menu-exp');
  context.elements['menu-level'] = createElement('menu-level');
  context.elements['menu-combo'] = createElement('menu-combo');
  context.elements['data-count'] = createElement('data-count');
  context.elements['menu-streak'] = createElement('menu-streak');
  ['quiz', 'listen', 'type', 'match', 'flash', 'write', 'grammar'].forEach(game => {
    context.elements[`btn-${game}`] = createMenuButtonElement(game);
  });

  context.setQuestionSets([{ id: 'set-a', category: 'grammar' }]);
  context.setActiveSetId('set-a');
  context.updateMenuUI();

  assert.strictEqual(context.elements['btn-quiz'].classList.contains('hidden'), true);
  assert.strictEqual(context.elements['btn-grammar'].classList.contains('hidden'), false);

  context.setQuestionSets([{ id: 'set-b', category: 'vocabulary' }]);
  context.setActiveSetId('set-b');
  context.updateMenuUI();

  assert.strictEqual(context.elements['btn-quiz'].classList.contains('hidden'), false);
  assert.strictEqual(context.elements['btn-grammar'].classList.contains('hidden'), true);
}

function testUpdateMenuUIShowsAllVocabGamesWhenNoActiveSetCategoryKnown() {
  const context = createContext();
  context.elements['menu-hp'] = createElement('menu-hp');
  context.elements['menu-exp'] = createElement('menu-exp');
  context.elements['menu-level'] = createElement('menu-level');
  context.elements['menu-combo'] = createElement('menu-combo');
  context.elements['data-count'] = createElement('data-count');
  context.elements['menu-streak'] = createElement('menu-streak');
  ['quiz', 'grammar'].forEach(game => {
    context.elements[`btn-${game}`] = createMenuButtonElement(game);
  });

  context.setQuestionSets([]);
  context.setActiveSetId(null);
  context.updateMenuUI();

  assert.strictEqual(context.elements['btn-quiz'].classList.contains('hidden'), false);
  assert.strictEqual(context.elements['btn-grammar'].classList.contains('hidden'), true);
}

testEscapeHtmlHandlesUnsafeAndEmptyValues();
testShuffleMutatesAndReturnsSameArrayWithFisherYatesSwaps();
testUpdateMenuUIHidesGamesNotCompatibleWithActiveCategory();
testUpdateMenuUIShowsAllVocabGamesWhenNoActiveSetCategoryKnown();

console.log('main-utils tests passed');
