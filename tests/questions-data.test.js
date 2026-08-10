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
  manifest.sets.filter(entry => entry.category !== 'grammar').forEach(entry => {
    const set = JSON.parse(fs.readFileSync(path.join(questionsDir, entry.file), 'utf8'));
    set.questions.forEach((q, i) => {
      assert.strictEqual(typeof q.word, 'string', `${entry.id}[${i}].word`);
      assert.strictEqual(typeof q.romaji, 'string', `${entry.id}[${i}].romaji`);
      assert.strictEqual(typeof q.translation, 'string', `${entry.id}[${i}].translation`);
      assert.strictEqual(typeof q.q, 'string', `${entry.id}[${i}].q`);
      assert.ok(Array.isArray(q.a) && q.a.length === 4, `${entry.id}[${i}].a`);
      assert.ok(Number.isInteger(q.c) && q.c >= 0 && q.c <= 3, `${entry.id}[${i}].c`);
      if (q.aTranslation !== undefined) {
        assert.ok(
          Array.isArray(q.aTranslation) && q.aTranslation.length === 4 &&
          q.aTranslation.every(t => typeof t === 'string' && t.length > 0),
          `${entry.id}[${i}].aTranslation must be an array of exactly 4 non-empty strings when present`
        );
      }
    });
  });
}

function testEveryManifestEntryHasAKnownCategory() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  manifest.sets.forEach(entry => {
    assert.ok(['vocabulary', 'grammar'].includes(entry.category), `${entry.id}.category must be vocabulary or grammar`);
    const set = JSON.parse(fs.readFileSync(path.join(questionsDir, entry.file), 'utf8'));
    assert.strictEqual(set.category, entry.category, `${entry.id}: set file category must match manifest`);
  });
}

function testEveryManifestEntryHasUniqueOrderAndNonEmptyLevel() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  const orders = manifest.sets.map(entry => entry.order);
  manifest.sets.forEach(entry => {
    assert.ok(Number.isInteger(entry.order), `${entry.id}.order must be an integer`);
    assert.ok(typeof entry.level === 'string' && entry.level.length > 0, `${entry.id}.level must be a non-empty string`);
  });
  assert.strictEqual(new Set(orders).size, orders.length, 'manifest entry "order" values must be unique');
}

function testEverySetRoadmapIdReferencesAKnownRoadmap() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  const roadmapIds = new Set((manifest.roadmaps || []).map(r => r.id));
  manifest.sets.forEach(entry => {
    if (entry.roadmapId === undefined) return;
    assert.ok(roadmapIds.has(entry.roadmapId), `${entry.id}.roadmapId "${entry.roadmapId}" must reference a known roadmap`);
  });
}

function testGrammarQuestionsHaveChunksMatchingSentence() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  manifest.sets.filter(entry => entry.category === 'grammar').forEach(entry => {
    const set = JSON.parse(fs.readFileSync(path.join(questionsDir, entry.file), 'utf8'));
    set.questions.forEach((q, i) => {
      assert.strictEqual(typeof q.sentence, 'string', `${entry.id}[${i}].sentence`);
      assert.ok(Array.isArray(q.chunks) && q.chunks.length >= 2, `${entry.id}[${i}].chunks`);
      assert.strictEqual(q.chunks.join(''), q.sentence, `${entry.id}[${i}] chunks must concatenate to sentence`);
      assert.strictEqual(typeof q.translation, 'string', `${entry.id}[${i}].translation`);
    });
  });
}

testManifestHasAtLeastOneSet();
testEachManifestEntryMatchesItsFile();
testEveryQuestionHasRequiredShape();
testEveryManifestEntryHasAKnownCategory();
testGrammarQuestionsHaveChunksMatchingSentence();
testEveryManifestEntryHasUniqueOrderAndNonEmptyLevel();
testEverySetRoadmapIdReferencesAKnownRoadmap();

console.log('questions data tests passed');
