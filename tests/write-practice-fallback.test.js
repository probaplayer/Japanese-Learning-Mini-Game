const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'game-write.js'), 'utf8');

function createContext() {
  const context = {
    console,
    document: {
      addEventListener() {},
      getElementById() {
        return {
          value: '',
          innerHTML: '',
          textContent: '',
          classList: { add() {}, remove() {}, contains() { return false; } },
          focus() {}
        };
      }
    },
    localStorage: {
      getItem() { return '{}'; },
      setItem() {}
    },
    KanjiCanvas: {
      erase() {},
      init() {}
    },
    wanakana: {
      toHiragana(value) {
        const map = {
          gaku: 'がく',
          sei: 'せい',
          gakusei: 'がくせい'
        };
        return map[value] || value;
      }
    },
    fetch() {},
    showToast() {},
    escapeHtml(value) { return String(value); },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 1;
    }
  };

  vm.createContext(context);
  vm.runInContext(
    `${source}
this.isPracticeFallbackCorrect = isPracticeFallbackCorrect;
this.setPracticeState = (state) => {
  practiceWriteRomaji = state.romaji || '';
  practiceKanjiList = state.kanjiList || [];
  practiceCurrentIdx = state.index || 0;
  practiceCurrentReadings = state.readings || [];
};`,
    context
  );
  return context;
}

function testMultiKanjiFallbackRejectsWholeWordRomajiForCurrentKanji() {
  const context = createContext();
  context.setPracticeState({ romaji: 'gakusei', kanjiList: ['学', '生'], index: 0, readings: ['がく'] });

  assert.strictEqual(context.isPracticeFallbackCorrect('gakusei'), false);
}

function testPracticeFallbackAcceptsCurrentKanjiLiteral() {
  const context = createContext();
  context.setPracticeState({ romaji: 'gakusei', kanjiList: ['学', '生'], index: 0, readings: ['がく'] });

  assert.strictEqual(context.isPracticeFallbackCorrect('学'), true);
}

function testPracticeFallbackAcceptsCurrentKanjiReading() {
  const context = createContext();
  context.setPracticeState({ romaji: 'gakusei', kanjiList: ['学', '生'], index: 0, readings: ['がく'] });

  assert.strictEqual(context.isPracticeFallbackCorrect('gaku'), true);
}

function testSingleKanaWordCanUseWholeWordRomajiFallback() {
  const context = createContext();
  context.setPracticeState({ romaji: 'gakusei', kanjiList: [], index: 0, readings: [] });

  assert.strictEqual(context.isPracticeFallbackCorrect('gakusei'), true);
}

testMultiKanjiFallbackRejectsWholeWordRomajiForCurrentKanji();
testPracticeFallbackAcceptsCurrentKanjiLiteral();
testPracticeFallbackAcceptsCurrentKanjiReading();
testSingleKanaWordCanUseWholeWordRomajiFallback();

console.log('write practice fallback tests passed');
