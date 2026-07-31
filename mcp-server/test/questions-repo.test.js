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

function testValidateQuestionAcceptsValidATranslation() {
  const withTranslations = { ...sampleQuestion, aTranslation: ['Học sinh', 'sai 1', 'sai 2', 'sai 3'] };
  assert.strictEqual(validateQuestion(withTranslations), null);
}

function testValidateQuestionRejectsWrongLengthATranslation() {
  const bad = { ...sampleQuestion, aTranslation: ['only', 'two'] };
  assert.match(validateQuestion(bad), /aTranslation.*exactly 4 non-empty strings/);
}

function testValidateQuestionRejectsEmptyStringInATranslation() {
  const bad = { ...sampleQuestion, aTranslation: ['ok', '', 'ok', 'ok'] };
  assert.match(validateQuestion(bad), /aTranslation.*exactly 4 non-empty strings/);
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

function testSearchQuestionsMatchesWordAndAnswerChoice() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', questions: [sampleQuestion] });

  const byWord = repo.searchQuestions('学生').results;
  assert.strictEqual(byWord.length, 1);
  assert.strictEqual(byWord[0].setId, 'demo');
  assert.strictEqual(byWord[0].index, 0);
  assert.strictEqual(byWord[0].question.word, '学生');

  const byAnswerChoice = repo.searchQuestions('がっせい').results;
  assert.strictEqual(byAnswerChoice.length, 1);
  assert.strictEqual(byAnswerChoice[0].index, 0);
}

function testSearchQuestionsIsCaseInsensitiveOnTranslation() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', questions: [sampleQuestion] });

  const results = repo.searchQuestions('STUDENT').results;
  assert.strictEqual(results.length, 1);
}

function testSearchQuestionsScopedToSetIdVsAcrossAllSets() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'set-a', name: 'Set A', questions: [sampleQuestion] });
  repo.createQuestionSet({
    id: 'set-b', name: 'Set B',
    questions: [{ ...sampleQuestion, word: '先生', translation: 'Teacher' }]
  });

  const onlyA = repo.searchQuestions('Student', 'set-a').results;
  assert.strictEqual(onlyA.length, 1);
  assert.strictEqual(onlyA[0].setId, 'set-a');

  const acrossAll = repo.searchQuestions('e').results; // "Student" and "Teacher" both contain "e"
  assert.strictEqual(acrossAll.length, 2);
  const setIds = acrossAll.map(r => r.setId).sort();
  assert.deepStrictEqual(setIds, ['set-a', 'set-b']);
}

function testSearchQuestionsErrorsOnUnknownSetId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  assert.throws(() => repo.searchQuestions('Student', 'nope'), /Question set not found: nope/);
}

function testSearchQuestionsReturnsEmptyArrayForNoMatch() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', questions: [sampleQuestion] });
  assert.deepStrictEqual(repo.searchQuestions('zzz-no-match').results, []);
  assert.strictEqual(repo.searchQuestions('zzz-no-match').totalMatches, 0);
}

function testSearchQuestionsTruncatesToLimit() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  const questions = Array.from({ length: 5 }, (_, i) => ({ ...sampleQuestion, translation: `Student ${i}` }));
  repo.createQuestionSet({ id: 'demo', name: 'Demo', questions });

  const capped = repo.searchQuestions('Student', 'demo', 2);
  assert.strictEqual(capped.totalMatches, 5);
  assert.strictEqual(capped.truncated, true);
  assert.strictEqual(capped.results.length, 2);

  const uncapped = repo.searchQuestions('Student', 'demo', 10);
  assert.strictEqual(uncapped.totalMatches, 5);
  assert.strictEqual(uncapped.truncated, false);
  assert.strictEqual(uncapped.results.length, 5);
}

function testPatchQuestionUpdatesOnlyGivenFields() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', questions: [sampleQuestion] });

  const result = repo.patchQuestion('demo', [{ index: 0, fields: { translation: 'Changed' } }]);
  assert.deepStrictEqual(result, [0]);

  const question = repo.getQuestionSet('demo').questions[0];
  assert.strictEqual(question.translation, 'Changed');
  assert.strictEqual(question.word, sampleQuestion.word);
  assert.strictEqual(question.q, sampleQuestion.q);
}

function testPatchQuestionAppliesMultiplePatchesInOneCall() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({
    id: 'demo', name: 'Demo',
    questions: [sampleQuestion, { ...sampleQuestion, word: '先生', translation: 'Teacher' }]
  });

  const result = repo.patchQuestion('demo', [
    { index: 0, fields: { translation: 'Student (changed)' } },
    { index: 1, fields: { translation: 'Teacher (changed)' } }
  ]);
  assert.deepStrictEqual(result, [0, 1]);

  const questions = repo.getQuestionSet('demo').questions;
  assert.strictEqual(questions[0].translation, 'Student (changed)');
  assert.strictEqual(questions[1].translation, 'Teacher (changed)');
}

function testPatchQuestionIsAtomicOnInvalidIndex() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', questions: [sampleQuestion] });

  assert.throws(
    () => repo.patchQuestion('demo', [
      { index: 0, fields: { translation: 'Should not stick' } },
      { index: 5, fields: { translation: 'Out of range' } }
    ]),
    /Question index out of range: 5/
  );

  const question = repo.getQuestionSet('demo').questions[0];
  assert.strictEqual(question.translation, sampleQuestion.translation);
}

function testPatchQuestionRejectsUnknownField() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', questions: [sampleQuestion] });

  assert.throws(
    () => repo.patchQuestion('demo', [{ index: 0, fields: { bogus: 'nope' } }]),
    /unexpected fields/
  );
  assert.strictEqual(repo.getQuestionSet('demo').questions[0].translation, sampleQuestion.translation);
}

function testPatchQuestionRejectsOutOfRangeCorrectIndexField() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', questions: [sampleQuestion] });

  assert.throws(
    () => repo.patchQuestion('demo', [{ index: 0, fields: { c: 4 } }]),
    /between 0 and 3/
  );
}

function testPatchQuestionErrorsOnUnknownSetId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  assert.throws(
    () => repo.patchQuestion('nope', [{ index: 0, fields: { translation: 'x' } }]),
    /Question set not found: nope/
  );
}

testValidateQuestionAcceptsWellFormedQuestion();
testValidateQuestionRejectsWrongAnswerCount();
testValidateQuestionRejectsOutOfRangeCorrectIndex();
testValidateQuestionAcceptsValidATranslation();
testValidateQuestionRejectsWrongLengthATranslation();
testValidateQuestionRejectsEmptyStringInATranslation();
testSlugifyNormalizesNames();
testCreateListGetQuestionSet();
testCreateQuestionSetRejectsDuplicateId();
testAddUpdateDeleteQuestion();
testAddQuestionRejectsInvalidShape();
testDeleteQuestionSetRemovesFileAndManifestEntry();
testSearchQuestionsMatchesWordAndAnswerChoice();
testSearchQuestionsIsCaseInsensitiveOnTranslation();
testSearchQuestionsScopedToSetIdVsAcrossAllSets();
testSearchQuestionsErrorsOnUnknownSetId();
testSearchQuestionsReturnsEmptyArrayForNoMatch();
testSearchQuestionsTruncatesToLimit();
testPatchQuestionUpdatesOnlyGivenFields();
testPatchQuestionAppliesMultiplePatchesInOneCall();
testPatchQuestionIsAtomicOnInvalidIndex();
testPatchQuestionRejectsUnknownField();
testPatchQuestionRejectsOutOfRangeCorrectIndexField();
testPatchQuestionErrorsOnUnknownSetId();

console.log('questions-repo tests passed');
