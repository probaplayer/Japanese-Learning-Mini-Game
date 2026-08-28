import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeTempQuestionsDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jq-mcp-smoke-'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    sets: [{ id: 'demo', file: 'demo.json', name: 'Demo Set', questionCount: 1, updatedAt: '2026-01-01T00:00:00.000Z' }]
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'demo.json'), JSON.stringify({
    id: 'demo', name: 'Demo Set', description: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    questions: [{ word: '学生', romaji: 'がくせい', translation: 'Student', q: 'Reading?', a: ['がくせい', 'がくぜい', 'がっせい', 'かくせい'], c: 0, ex: 'ex' }]
  }, null, 2));
  return dir;
}

async function main() {
  const questionsDir = makeTempQuestionsDir();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, '..', 'src', 'index.js')],
    env: { ...process.env, QUESTIONS_DIR: questionsDir }
  });
  const client = new Client({ name: 'smoke-test', version: '1.0.0' });
  await client.connect(transport);

  const list = await client.callTool({ name: 'list_question_sets', arguments: {} });
  const sets = JSON.parse(list.content[0].text);
  assert.strictEqual(sets.length, 1);
  assert.strictEqual(sets[0].id, 'demo');

  const created = await client.callTool({ name: 'create_question_set', arguments: { name: 'New Set', questions: [] } });
  const createdSet = JSON.parse(created.content[0].text);
  assert.strictEqual(createdSet.id, 'new-set');

  const added = await client.callTool({
    name: 'add_question',
    arguments: { setId: 'new-set', question: { word: 'a', romaji: 'a', translation: 'a', q: 'a?', a: ['1', '2', '3', '4'], c: 1, ex: 'ex' } }
  });
  assert.strictEqual(JSON.parse(added.content[0].text).index, 0);

  const fetched = await client.callTool({ name: 'get_question_set', arguments: { id: 'new-set' } });
  assert.strictEqual(JSON.parse(fetched.content[0].text).questions.length, 1);

  const updated = await client.callTool({
    name: 'update_question',
    arguments: { setId: 'new-set', index: 0, question: { word: 'b', romaji: 'b', translation: 'b', q: 'b?', a: ['1', '2', '3', '4'], c: 2, ex: 'ex' } }
  });
  assert.strictEqual(JSON.parse(updated.content[0].text).updated, 0);

  const searched = await client.callTool({ name: 'search_questions', arguments: { keyword: 'b?' } });
  const searchResponse = JSON.parse(searched.content[0].text);
  assert.strictEqual(searchResponse.totalMatches, 1);
  assert.strictEqual(searchResponse.truncated, false);
  assert.strictEqual(searchResponse.results.length, 1);
  assert.strictEqual(searchResponse.results[0].setId, 'new-set');
  assert.strictEqual(searchResponse.results[0].index, 0);

  const patched = await client.callTool({
    name: 'patch_question',
    arguments: { setId: 'new-set', patches: [{ index: 0, fields: { translation: 'Patched' } }] }
  });
  assert.deepStrictEqual(JSON.parse(patched.content[0].text).updated, [0]);

  const afterPatch = await client.callTool({ name: 'get_question_set', arguments: { id: 'new-set' } });
  const afterPatchQuestions = JSON.parse(afterPatch.content[0].text).questions;
  assert.strictEqual(afterPatchQuestions[0].translation, 'Patched');
  assert.strictEqual(afterPatchQuestions[0].word, 'b');

  const addedWithTranslations = await client.callTool({
    name: 'add_question',
    arguments: {
      setId: 'new-set',
      question: {
        word: 'c', romaji: 'c', translation: 'c', q: 'c?',
        a: ['1', '2', '3', '4'], aTranslation: ['one', 'two', 'three', 'four'], c: 0, ex: 'ex'
      }
    }
  });
  assert.strictEqual(JSON.parse(addedWithTranslations.content[0].text).index, 1);

  const afterAddWithTranslations = await client.callTool({ name: 'get_question_set', arguments: { id: 'new-set' } });
  const questionsAfterAdd = JSON.parse(afterAddWithTranslations.content[0].text).questions;
  assert.deepStrictEqual(questionsAfterAdd[1].aTranslation, ['one', 'two', 'three', 'four']);

  const badTranslationLength = await client.callTool({
    name: 'add_question',
    arguments: {
      setId: 'new-set',
      question: {
        word: 'd', romaji: 'd', translation: 'd', q: 'd?',
        a: ['1', '2', '3', '4'], aTranslation: ['only', 'two'], c: 0, ex: 'ex'
      }
    }
  });
  assert.strictEqual(badTranslationLength.isError, true);

  const badQuestion = await client.callTool({
    name: 'add_question',
    arguments: { setId: 'new-set', question: { word: 'x', romaji: 'x', translation: 'x', q: 'x?', a: ['1', '2'], c: 0, ex: 'ex' } }
  });
  assert.strictEqual(badQuestion.isError, true);

  const deletedQ = await client.callTool({ name: 'delete_question', arguments: { setId: 'new-set', index: 0 } });
  assert.strictEqual(JSON.parse(deletedQ.content[0].text).deleted, 0);

  const deletedSet = await client.callTool({ name: 'delete_question_set', arguments: { id: 'new-set' } });
  assert.strictEqual(JSON.parse(deletedSet.content[0].text).deleted, 'new-set');

  const finalList = await client.callTool({ name: 'list_question_sets', arguments: {} });
  assert.strictEqual(JSON.parse(finalList.content[0].text).length, 1);

  const createdGrammarSet = await client.callTool({
    name: 'create_question_set',
    arguments: { name: 'Grammar Set', category: 'grammar', questions: [] }
  });
  const grammarSet = JSON.parse(createdGrammarSet.content[0].text);
  assert.strictEqual(grammarSet.category, 'grammar');

  const addedGrammarQuestion = await client.callTool({
    name: 'add_question',
    arguments: {
      setId: 'grammar-set',
      question: { sentence: '私は学生です', chunks: ['私', 'は', '学生', 'です'], translation: 'Tôi là học sinh', ex: 'は đánh dấu chủ đề' }
    }
  });
  assert.strictEqual(JSON.parse(addedGrammarQuestion.content[0].text).index, 0);

  const rejectedVocabQuestionInGrammarSet = await client.callTool({
    name: 'add_question',
    arguments: {
      setId: 'grammar-set',
      question: { word: 'x', romaji: 'x', translation: 'x', q: 'x?', a: ['1', '2', '3', '4'], c: 0, ex: 'ex' }
    }
  });
  assert.strictEqual(rejectedVocabQuestionInGrammarSet.isError, true);

  // Finding 1 regression: searching with no setId across a mix of vocabulary
  // and grammar sets used to throw ("question.a is not iterable") because
  // grammar questions have no "a" field. "demo" (vocabulary, word "学生")
  // and "grammar-set" (grammar, sentence "私は学生です") both contain "学生".
  const mixedSearch = await client.callTool({ name: 'search_questions', arguments: { keyword: '学生' } });
  assert.strictEqual(mixedSearch.isError, undefined);
  const mixedSearchResponse = JSON.parse(mixedSearch.content[0].text);
  const mixedSetIds = mixedSearchResponse.results.map(r => r.setId).sort();
  assert.deepStrictEqual(mixedSetIds, ['demo', 'grammar-set']);

  // Finding 3 regression: patch_question used to reject grammar fields
  // (sentence/chunks/translation/ex) with a Zod "unrecognized key" error
  // because questionPatchFieldsShape only accepted vocabulary fields.
  const patchedGrammar = await client.callTool({
    name: 'patch_question',
    arguments: {
      setId: 'grammar-set',
      patches: [{ index: 0, fields: { sentence: '私は先生です', chunks: ['私', 'は', '先生', 'です'] } }]
    }
  });
  assert.strictEqual(patchedGrammar.isError, undefined);
  assert.deepStrictEqual(JSON.parse(patchedGrammar.content[0].text).updated, [0]);

  const afterGrammarPatch = await client.callTool({ name: 'get_question_set', arguments: { id: 'grammar-set' } });
  const grammarQuestionAfterPatch = JSON.parse(afterGrammarPatch.content[0].text).questions[0];
  assert.strictEqual(grammarQuestionAfterPatch.sentence, '私は先生です');
  assert.deepStrictEqual(grammarQuestionAfterPatch.chunks, ['私', 'は', '先生', 'です']);
  assert.strictEqual(grammarQuestionAfterPatch.translation, 'Tôi là học sinh');

  const listedRoadmaps = await client.callTool({ name: 'list_roadmaps', arguments: {} });
  assert.deepStrictEqual(JSON.parse(listedRoadmaps.content[0].text), []);

  const createdRoadmap = await client.callTool({ name: 'create_roadmap', arguments: { name: 'N3 Path' } });
  assert.deepStrictEqual(JSON.parse(createdRoadmap.content[0].text), { id: 'n3-path', name: 'N3 Path' });

  const renamedRoadmap = await client.callTool({ name: 'rename_roadmap', arguments: { id: 'n3-path', name: 'N3 Path (Renamed)' } });
  assert.strictEqual(JSON.parse(renamedRoadmap.content[0].text).name, 'N3 Path (Renamed)');

  await client.callTool({
    name: 'create_question_set',
    arguments: { id: 'n3-set', name: 'N3 Set', roadmapId: 'n3-path', questions: [] }
  });

  const deletedRoadmap = await client.callTool({ name: 'delete_roadmap', arguments: { id: 'n3-path' } });
  assert.deepStrictEqual(JSON.parse(deletedRoadmap.content[0].text), { deleted: 'n3-path' });

  const roadmapsAfterDelete = await client.callTool({ name: 'list_roadmaps', arguments: {} });
  assert.deepStrictEqual(JSON.parse(roadmapsAfterDelete.content[0].text), [{ id: 'unassigned', name: 'Chưa phân loại' }]);

  const n3SetAfterDelete = await client.callTool({ name: 'list_question_sets', arguments: {} });
  const n3SetEntry = JSON.parse(n3SetAfterDelete.content[0].text).find(s => s.id === 'n3-set');
  assert.strictEqual(n3SetEntry.roadmapId, 'unassigned');

  await client.close();
  fs.rmSync(questionsDir, { recursive: true, force: true });
  console.log('mcp server smoke test passed');
}

main().catch(e => {
  console.error('MCP SERVER SMOKE TEST FAILED:', e);
  process.exit(1);
});
