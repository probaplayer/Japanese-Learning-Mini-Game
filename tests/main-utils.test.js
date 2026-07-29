const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

function createContext(randomValues = []) {
  const math = Object.create(Math);
  let randomIndex = 0;
  math.random = () => {
    const value = randomValues[randomIndex] ?? 0;
    randomIndex += 1;
    return value;
  };

  const context = {
    console,
    Math: math,
    document: {
      addEventListener() {}
    }
  };

  vm.createContext(context);
  vm.runInContext(
    `${source}
this.escapeHtml = escapeHtml;
this.shuffle = shuffle;`,
    context
  );
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

testEscapeHtmlHandlesUnsafeAndEmptyValues();
testShuffleMutatesAndReturnsSameArrayWithFisherYatesSwaps();

console.log('main-utils tests passed');
