import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';
import { createQuestionsRepo, validateQuestion, slugify } from '../src/questions-repo.js';

function makeTempQuestionsDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jq-questions-'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ sets: [] }, null, 2));
  return dir;
}

const sampleQuestion = {
  word: '学生', romaji: 'がくせい', translation: 'Student', q: 'Reading?',
  a: ['がくせい', 'がくぜい', 'がっせい', 'かくせい'], c: 0, ex: 'ex'
};

function testValidateQuestionAcceptsWellFormedQuestion() {
  assert.strictEqual(validateQuestion(sampleQuestion), null);
}

function testValidateQuestionRejectsWrongAnswerCount() {
  const bad = { ...sampleQuestion, a: ['a', 'b'] };
  assert.match(validateQuestion(bad), /exactly 4 strings/);
}

function testValidateQuestionRejectsOutOfRangeCorrectIndex() {
  const bad = { ...sampleQuestion, c: 4 };
  assert.match(validateQuestion(bad), /between 0 and 3/);
}

function testSlugifyNormalizesNames() {
  assert.strictEqual(slugify('N5 Vocabulary!'), 'n5-vocabulary');
  assert.strictEqual(slugify('  --Trailing--  '), 'trailing');
}

function testCreateListGetQuestionSet() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);

  const created = repo.createQuestionSet({ name: 'N5 Vocab', questions: [sampleQuestion] });
  assert.strictEqual(created.id, 'n5-vocab');

  const list = repo.listQuestionSets();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].questionCount, 1);

  const fetched = repo.getQuestionSet('n5-vocab');
  assert.strictEqual(fetched.questions.length, 1);
  assert.strictEqual(fetched.questions[0].word, '学生');
}

function testCreateQuestionSetRejectsDuplicateId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ name: 'Set A' });
  assert.throws(() => repo.createQuestionSet({ id: 'set-a', name: 'Set A Again' }), /already exists/);
}

function testAddUpdateDeleteQuestion() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo' });

  const index = repo.addQuestion('demo', sampleQuestion);
  assert.strictEqual(index, 0);
  assert.strictEqual(repo.getQuestionSet('demo').questions.length, 1);
  assert.strictEqual(repo.listQuestionSets()[0].questionCount, 1);

  const updated = { ...sampleQuestion, translation: 'Changed' };
  repo.updateQuestion('demo', 0, updated);
  assert.strictEqual(repo.getQuestionSet('demo').questions[0].translation, 'Changed');

  repo.deleteQuestion('demo', 0);
  assert.strictEqual(repo.getQuestionSet('demo').questions.length, 0);
  assert.strictEqual(repo.listQuestionSets()[0].questionCount, 0);
}

function testAddQuestionRejectsInvalidShape() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo' });
  assert.throws(() => repo.addQuestion('demo', { ...sampleQuestion, a: ['only', 'two'] }), /exactly 4 strings/);
}

function testDeleteQuestionSetRemovesFileAndManifestEntry() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo' });
  assert.ok(fs.existsSync(path.join(dir, 'demo.json')));

  repo.deleteQuestionSet('demo');
  assert.strictEqual(fs.existsSync(path.join(dir, 'demo.json')), false);
  assert.strictEqual(repo.listQuestionSets().length, 0);
}

testValidateQuestionAcceptsWellFormedQuestion();
testValidateQuestionRejectsWrongAnswerCount();
testValidateQuestionRejectsOutOfRangeCorrectIndex();
testSlugifyNormalizesNames();
testCreateListGetQuestionSet();
testCreateQuestionSetRejectsDuplicateId();
testAddUpdateDeleteQuestion();
testAddQuestionRejectsInvalidShape();
testDeleteQuestionSetRemovesFileAndManifestEntry();

console.log('questions-repo tests passed');
