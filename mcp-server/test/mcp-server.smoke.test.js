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

  await client.close();
  fs.rmSync(questionsDir, { recursive: true, force: true });
  console.log('mcp server smoke test passed');
}

main().catch(e => {
  console.error('MCP SERVER SMOKE TEST FAILED:', e);
  process.exit(1);
});
