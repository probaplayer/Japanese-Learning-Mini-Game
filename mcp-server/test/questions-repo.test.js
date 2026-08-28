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

const sampleGrammarQuestion = {
  sentence: '私は学生です',
  chunks: ['私', 'は', '学生', 'です'],
  translation: 'Tôi là học sinh',
  ex: 'は đánh dấu chủ đề câu'
};

function testValidateQuestionAcceptsWellFormedGrammarQuestion() {
  assert.strictEqual(validateQuestion(sampleGrammarQuestion, 'grammar'), null);
}

function testValidateQuestionRejectsGrammarQuestionMissingChunks() {
  const bad = { ...sampleGrammarQuestion, chunks: undefined };
  assert.match(validateQuestion(bad, 'grammar'), /chunks/);
}

function testValidateQuestionRejectsGrammarQuestionWithTooFewChunks() {
  const bad = { ...sampleGrammarQuestion, chunks: ['私'] };
  assert.match(validateQuestion(bad, 'grammar'), /at least 2/);
}

function testValidateQuestionRejectsGrammarQuestionWhereChunksDontMatchSentence() {
  const bad = { ...sampleGrammarQuestion, chunks: ['私', 'は', '先生', 'です'] };
  assert.match(validateQuestion(bad, 'grammar'), /chunks.*must concatenate to sentence/);
}

function testValidateQuestionRejectsGrammarQuestionMissingTranslation() {
  const bad = { ...sampleGrammarQuestion, translation: '' };
  assert.match(validateQuestion(bad, 'grammar'), /translation/);
}

function testValidateQuestionGrammarExIsOptional() {
  const { ex, ...withoutEx } = sampleGrammarQuestion;
  assert.strictEqual(validateQuestion(withoutEx, 'grammar'), null);
}

function testCreateQuestionSetPersistsCategoryToManifestAndFile() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  const created = repo.createQuestionSet({ name: 'N5 Grammar', category: 'grammar', questions: [sampleGrammarQuestion] });
  assert.strictEqual(created.category, 'grammar');

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.sets[0].category, 'grammar');
}

function testCreateQuestionSetDefaultsCategoryToVocabulary() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  const created = repo.createQuestionSet({ name: 'Plain Set' });
  assert.strictEqual(created.category, 'vocabulary');
}

function testCreateQuestionSetDefaultsOrderToEndOfManifestAndLevelToNA() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'first', name: 'First' });
  repo.createQuestionSet({ id: 'second', name: 'Second' });

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.sets[0].order, 1);
  assert.strictEqual(manifest.sets[0].level, 'N/A');
  assert.strictEqual(manifest.sets[1].order, 2);
  assert.strictEqual(manifest.sets[1].level, 'N/A');
}

function testCreateQuestionSetPersistsExplicitOrderAndLevel() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', order: 5, level: 'N4' });

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.sets[0].order, 5);
  assert.strictEqual(manifest.sets[0].level, 'N4');
}

function testCreateQuestionSetOrderDoesNotCollideAfterDeleteThenCreate() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'a', name: 'A' });
  repo.createQuestionSet({ id: 'b', name: 'B' });
  repo.createQuestionSet({ id: 'c', name: 'C' });
  repo.deleteQuestionSet('b');

  repo.createQuestionSet({ id: 'd', name: 'D' });

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const orders = manifest.sets.map(s => s.order);
  assert.strictEqual(new Set(orders).size, orders.length, 'order values must remain unique after delete-then-create');
  assert.strictEqual(manifest.sets.find(s => s.id === 'd').order, 4);
}

function testCreateQuestionSetPersistsValidRoadmapId() {
  const dir = makeTempQuestionsDir();
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ roadmaps: [{ id: 'demo-path', name: 'Demo Path' }], sets: [] }, null, 2));
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', roadmapId: 'demo-path' });

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.sets[0].roadmapId, 'demo-path');
}

function testCreateQuestionSetRejectsUnknownRoadmapId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  assert.throws(() => repo.createQuestionSet({ id: 'demo', name: 'Demo', roadmapId: 'nope' }), /Unknown roadmapId: nope/);
}

function testCreateQuestionSetLeavesRoadmapIdUnsetWhenOmitted() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo' });

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.strictEqual('roadmapId' in manifest.sets[0], false);
}

function testUpdateQuestionSetMetadataPersistsRoadmapIdOrderLevel() {
  const dir = makeTempQuestionsDir();
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ roadmaps: [{ id: 'demo-path', name: 'Demo Path' }], sets: [] }, null, 2));
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo' });

  const updated = repo.updateQuestionSetMetadata('demo', { roadmapId: 'demo-path', order: 5, level: 'N3' });
  assert.strictEqual(updated.roadmapId, 'demo-path');
  assert.strictEqual(updated.order, 5);
  assert.strictEqual(updated.level, 'N3');

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.sets[0].roadmapId, 'demo-path');
  assert.strictEqual(manifest.sets[0].order, 5);
  assert.strictEqual(manifest.sets[0].level, 'N3');
}

function testUpdateQuestionSetMetadataRejectsUnknownRoadmapId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo' });
  assert.throws(() => repo.updateQuestionSetMetadata('demo', { roadmapId: 'nope' }), /Unknown roadmapId: nope/);
}

function testUpdateQuestionSetMetadataClearsRoadmapIdWithNull() {
  const dir = makeTempQuestionsDir();
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ roadmaps: [{ id: 'demo-path', name: 'Demo Path' }], sets: [] }, null, 2));
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', roadmapId: 'demo-path' });

  repo.updateQuestionSetMetadata('demo', { roadmapId: null });

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.strictEqual('roadmapId' in manifest.sets[0], false);
}

function testUpdateQuestionSetMetadataLeavesUnspecifiedFieldsUnchanged() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo', order: 3, level: 'N4' });

  repo.updateQuestionSetMetadata('demo', { level: 'N3' });

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.sets[0].order, 3);
  assert.strictEqual(manifest.sets[0].level, 'N3');
}

function testUpdateQuestionSetMetadataErrorsOnUnknownSetId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  assert.throws(() => repo.updateQuestionSetMetadata('nope', { order: 1 }), /Question set not found: nope/);
}

function testUpdateQuestionSetMetadataRejectsNonIntegerOrder() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo', name: 'Demo' });
  assert.throws(() => repo.updateQuestionSetMetadata('demo', { order: 'first' }), /order must be an integer/);
}

function testSearchQuestionsAcrossMixedVocabularyAndGrammarSetsDoesNotThrow() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'vocab-set', name: 'Vocab Set', category: 'vocabulary', questions: [sampleQuestion] });
  repo.createQuestionSet({ id: 'grammar-set', name: 'Grammar Set', category: 'grammar', questions: [sampleGrammarQuestion] });

  // Finding 1 regression: with no setId, searchQuestions used to spread
  // question.a (undefined on grammar questions) and throw "question.a is
  // not iterable" before ever reaching the vocabulary matches.
  assert.doesNotThrow(() => repo.searchQuestions('a'));

  const byWord = repo.searchQuestions('学生');
  const setIds = byWord.results.map(r => r.setId).sort();
  assert.deepStrictEqual(setIds, ['grammar-set', 'vocab-set'], 'should find matches in both the vocabulary set (word) and the grammar set (sentence)');

  const byTranslation = repo.searchQuestions('học sinh');
  assert.strictEqual(byTranslation.results.length, 1);
  assert.strictEqual(byTranslation.results[0].setId, 'grammar-set');

  const byChunkText = repo.searchQuestions('です');
  assert.strictEqual(byChunkText.results.length, 1);
  assert.strictEqual(byChunkText.results[0].setId, 'grammar-set');
}

function testAddQuestionValidatesAgainstSetsOwnCategory() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createQuestionSet({ id: 'demo-grammar', name: 'Demo Grammar', category: 'grammar' });

  const index = repo.addQuestion('demo-grammar', sampleGrammarQuestion);
  assert.strictEqual(index, 0);
  assert.throws(() => repo.addQuestion('demo-grammar', sampleQuestion), /sentence/);
}

function testListRoadmapsReturnsEmptyArrayWhenNoneConfigured() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  assert.deepStrictEqual(repo.listRoadmaps(), []);
}

function testCreateRoadmapAddsEntryAndDerivesIdFromName() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  const created = repo.createRoadmap({ name: 'N3 Path' });
  assert.strictEqual(created.id, 'n3-path');
  assert.strictEqual(created.name, 'N3 Path');
  assert.deepStrictEqual(repo.listRoadmaps(), [{ id: 'n3-path', name: 'N3 Path' }]);
}

function testCreateRoadmapAcceptsExplicitId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  const created = repo.createRoadmap({ id: 'custom-id', name: 'N3 Path' });
  assert.strictEqual(created.id, 'custom-id');
}

function testCreateRoadmapRejectsDuplicateId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createRoadmap({ name: 'N3 Path' });
  assert.throws(() => repo.createRoadmap({ id: 'n3-path', name: 'N3 Path Again' }), /already exists/);
}

function testRenameRoadmapUpdatesName() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createRoadmap({ id: 'n3-path', name: 'N3 Path' });

  const renamed = repo.renameRoadmap('n3-path', 'N3 Path (Renamed)');
  assert.strictEqual(renamed.name, 'N3 Path (Renamed)');
  assert.strictEqual(repo.listRoadmaps()[0].name, 'N3 Path (Renamed)');
}

function testRenameRoadmapErrorsOnUnknownId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  assert.throws(() => repo.renameRoadmap('nope', 'New Name'), /Roadmap not found: nope/);
}

function testDeleteRoadmapRemovesEntryWhenNoSetsAssigned() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createRoadmap({ id: 'n3-path', name: 'N3 Path' });

  repo.deleteRoadmap('n3-path');
  assert.deepStrictEqual(repo.listRoadmaps(), []);
}

function testDeleteRoadmapErrorsOnUnknownId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  assert.throws(() => repo.deleteRoadmap('nope'), /Roadmap not found: nope/);
}

function testDeleteRoadmapReassignsAssignedSetsToUnassignedFallback() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createRoadmap({ id: 'n3-path', name: 'N3 Path' });
  repo.createQuestionSet({ id: 'demo', name: 'Demo', roadmapId: 'n3-path' });

  repo.deleteRoadmap('n3-path');

  const roadmapIds = repo.listRoadmaps().map(r => r.id);
  assert.deepStrictEqual(roadmapIds, ['unassigned']);
  const entry = repo.listQuestionSets().find(s => s.id === 'demo');
  assert.strictEqual(entry.roadmapId, 'unassigned');
}

function testDeleteRoadmapCreatesUnassignedFallbackIfMissing() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createRoadmap({ id: 'n3-path', name: 'N3 Path' });
  repo.createQuestionSet({ id: 'demo', name: 'Demo', roadmapId: 'n3-path' });

  repo.deleteRoadmap('n3-path');

  const fallback = repo.listRoadmaps().find(r => r.id === 'unassigned');
  assert.ok(fallback, 'expected an "unassigned" fallback roadmap to be created');
  assert.strictEqual(fallback.name, 'Chưa phân loại');
}

function testDeleteRoadmapDoesNotDuplicateFallbackIfAlreadyPresent() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createRoadmap({ id: 'unassigned', name: 'Chưa phân loại' });
  repo.createRoadmap({ id: 'n3-path', name: 'N3 Path' });
  repo.createQuestionSet({ id: 'demo', name: 'Demo', roadmapId: 'n3-path' });

  repo.deleteRoadmap('n3-path');

  const roadmapIds = repo.listRoadmaps().map(r => r.id);
  assert.deepStrictEqual(roadmapIds, ['unassigned']);
}

function testDeleteRoadmapBlocksDeletingUnassignedFallbackWhileInUse() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createRoadmap({ id: 'unassigned', name: 'Chưa phân loại' });
  repo.createQuestionSet({ id: 'demo', name: 'Demo', roadmapId: 'unassigned' });

  assert.throws(() => repo.deleteRoadmap('unassigned'), /still assigned/);
}

testListRoadmapsReturnsEmptyArrayWhenNoneConfigured();
testCreateRoadmapAddsEntryAndDerivesIdFromName();
testCreateRoadmapAcceptsExplicitId();
testCreateRoadmapRejectsDuplicateId();
testRenameRoadmapUpdatesName();
testRenameRoadmapErrorsOnUnknownId();
testDeleteRoadmapRemovesEntryWhenNoSetsAssigned();
testDeleteRoadmapErrorsOnUnknownId();
testDeleteRoadmapReassignsAssignedSetsToUnassignedFallback();
testDeleteRoadmapCreatesUnassignedFallbackIfMissing();
testDeleteRoadmapDoesNotDuplicateFallbackIfAlreadyPresent();
testDeleteRoadmapBlocksDeletingUnassignedFallbackWhileInUse();

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
testValidateQuestionAcceptsWellFormedGrammarQuestion();
testValidateQuestionRejectsGrammarQuestionMissingChunks();
testValidateQuestionRejectsGrammarQuestionWithTooFewChunks();
testValidateQuestionRejectsGrammarQuestionWhereChunksDontMatchSentence();
testValidateQuestionRejectsGrammarQuestionMissingTranslation();
testValidateQuestionGrammarExIsOptional();
testCreateQuestionSetPersistsCategoryToManifestAndFile();
testCreateQuestionSetDefaultsCategoryToVocabulary();
testAddQuestionValidatesAgainstSetsOwnCategory();
testSearchQuestionsAcrossMixedVocabularyAndGrammarSetsDoesNotThrow();
testCreateQuestionSetDefaultsOrderToEndOfManifestAndLevelToNA();
testCreateQuestionSetPersistsExplicitOrderAndLevel();
testCreateQuestionSetOrderDoesNotCollideAfterDeleteThenCreate();
testCreateQuestionSetPersistsValidRoadmapId();
testCreateQuestionSetRejectsUnknownRoadmapId();
testCreateQuestionSetLeavesRoadmapIdUnsetWhenOmitted();
testUpdateQuestionSetMetadataPersistsRoadmapIdOrderLevel();
testUpdateQuestionSetMetadataRejectsUnknownRoadmapId();
testUpdateQuestionSetMetadataClearsRoadmapIdWithNull();
testUpdateQuestionSetMetadataLeavesUnspecifiedFieldsUnchanged();
testUpdateQuestionSetMetadataErrorsOnUnknownSetId();
testUpdateQuestionSetMetadataRejectsNonIntegerOrder();

console.log('questions-repo tests passed');
