const assert = require('assert');
const fs = require('fs');
const path = require('path');

const questionsDir = path.join(__dirname, '..', 'questions');

function testManifestHasAtLeastOneSet() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  assert.ok(Array.isArray(manifest.sets));
  assert.ok(manifest.sets.length >= 1);
}

function testEachManifestEntryMatchesItsFile() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  manifest.sets.forEach(entry => {
    const filePath = path.join(questionsDir, entry.file);
    assert.ok(fs.existsSync(filePath), `Missing question set file: ${entry.file}`);
    const set = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.strictEqual(set.id, entry.id);
    assert.strictEqual(set.questions.length, entry.questionCount, `questionCount mismatch for ${entry.id}`);
  });
}

function testEveryQuestionHasRequiredShape() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  manifest.sets.forEach(entry => {
    const set = JSON.parse(fs.readFileSync(path.join(questionsDir, entry.file), 'utf8'));
    set.questions.forEach((q, i) => {
      assert.strictEqual(typeof q.word, 'string', `${entry.id}[${i}].word`);
      assert.strictEqual(typeof q.romaji, 'string', `${entry.id}[${i}].romaji`);
      assert.strictEqual(typeof q.translation, 'string', `${entry.id}[${i}].translation`);
      assert.strictEqual(typeof q.q, 'string', `${entry.id}[${i}].q`);
      assert.ok(Array.isArray(q.a) && q.a.length === 4, `${entry.id}[${i}].a`);
      assert.ok(Number.isInteger(q.c) && q.c >= 0 && q.c <= 3, `${entry.id}[${i}].c`);
    });
  });
}

testManifestHasAtLeastOneSet();
testEachManifestEntryMatchesItsFile();
testEveryQuestionHasRequiredShape();

console.log('questions data tests passed');
