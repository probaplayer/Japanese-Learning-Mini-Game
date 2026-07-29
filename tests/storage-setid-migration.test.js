const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
const gameUtilsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'game-utils.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');

function createContext(store) {
  const context = {
    console,
    questions: [],
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); }
    },
    document: {
      addEventListener() {},
      getElementById() { return null; }
    }
  };
  vm.createContext(context);
  // NOTE: mainSource declares `let activeSetId = null;` at top level, which is a
  // lexical binding local to this vm context's global scope — it does NOT become
  // a property of the sandbox object, so setting context.activeSetId beforehand
  // would be shadowed/ignored. Reassign it with a plain statement in the same
  // runInContext call (same lexical scope) so the assignment actually sticks.
  vm.runInContext(
    `${mainSource}
${gameUtilsSource}
${storageSource}
activeSetId = 'n5-core';
this.runLoadQuestionStats = loadQuestionStats;
this.getQuestionStats = () => questionStats;`,
    context
  );
  context.store = store;
  return context;
}

function testRescopesLegacySetDefaultKeysToActiveSetId() {
  const store = {
    jq_question_stats: JSON.stringify({ 'set-default::q-abc': { quiz: { correctCount: 1 } } })
  };
  const context = createContext(store);

  context.runLoadQuestionStats();

  const stats = context.getQuestionStats();
  assert.ok(stats['n5-core::q-abc'], 'expected stats to be rescoped under n5-core::q-abc');
  assert.strictEqual(stats['n5-core::q-abc'].quiz.correctCount, 1);
  assert.strictEqual(stats['set-default::q-abc'], undefined, 'legacy set-default:: key should be removed');
  assert.strictEqual(context.store['jq_setid_migrated'], 'true');

  const persisted = JSON.parse(context.store['jq_question_stats']);
  assert.ok(persisted['n5-core::q-abc'], 'migration should be persisted to localStorage');
  assert.strictEqual(persisted['set-default::q-abc'], undefined);
}

function testDoesNotReRunWhenAlreadyMigrated() {
  const store = {
    jq_setid_migrated: 'true',
    jq_question_stats: JSON.stringify({ 'set-default::q-abc': { quiz: { correctCount: 1 } } })
  };
  const context = createContext(store);

  context.runLoadQuestionStats();

  const stats = context.getQuestionStats();
  assert.ok(stats['set-default::q-abc'], 'already-migrated flag should prevent rescoping from running again');
  assert.strictEqual(stats['n5-core::q-abc'], undefined);
}

testRescopesLegacySetDefaultKeysToActiveSetId();
testDoesNotReRunWhenAlreadyMigrated();

console.log('storage set-id migration tests passed');
