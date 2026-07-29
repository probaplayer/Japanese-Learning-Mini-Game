import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createQuestionsRepo } from './questions-repo.js';
import { createPublisher } from './publish.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.REPO_ROOT || path.resolve(__dirname, '..', '..');
const questionsDir = process.env.QUESTIONS_DIR || path.join(repoRoot, 'questions');
const repo = createQuestionsRepo(questionsDir);
const publisher = createPublisher({ repoRoot, questionsRelDir: 'questions' });

const questionShape = {
  word: z.string().min(1),
  romaji: z.string().min(1),
  translation: z.string().min(1),
  q: z.string().min(1),
  a: z.array(z.string()).length(4),
  c: z.number().int().min(0).max(3),
  ex: z.string().min(1)
};

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(message) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function guarded(fn) {
  return async (args) => {
    try {
      return ok(await fn(args));
    } catch (e) {
      return err(e.message);
    }
  };
}

const server = new McpServer({ name: 'japanese-quest-questions', version: '1.0.0' });

server.registerTool(
  'list_question_sets',
  { title: 'List question sets', description: 'List all question sets with id, name, and question count' },
  guarded(() => repo.listQuestionSets())
);

server.registerTool(
  'get_question_set',
  { title: 'Get question set', description: 'Get the full contents of one question set by id', inputSchema: { id: z.string() } },
  guarded(({ id }) => repo.getQuestionSet(id))
);

server.registerTool(
  'create_question_set',
  {
    title: 'Create question set',
    description: 'Create a new question set file and register it in the manifest',
    inputSchema: {
      id: z.string().optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      questions: z.array(z.object(questionShape)).optional()
    }
  },
  guarded((args) => repo.createQuestionSet(args))
);

server.registerTool(
  'delete_question_set',
  { title: 'Delete question set', description: 'Delete a question set file and remove it from the manifest', inputSchema: { id: z.string() } },
  guarded(({ id }) => {
    repo.deleteQuestionSet(id);
    return { deleted: id };
  })
);

server.registerTool(
  'add_question',
  {
    title: 'Add question',
    description: 'Append a question to an existing question set',
    inputSchema: { setId: z.string(), question: z.object(questionShape) }
  },
  guarded(({ setId, question }) => ({ index: repo.addQuestion(setId, question) }))
);

server.registerTool(
  'update_question',
  {
    title: 'Update question',
    description: 'Replace the question at the given index within a question set',
    inputSchema: { setId: z.string(), index: z.number().int().min(0), question: z.object(questionShape) }
  },
  guarded(({ setId, index, question }) => {
    repo.updateQuestion(setId, index, question);
    return { updated: index };
  })
);

server.registerTool(
  'delete_question',
  {
    title: 'Delete question',
    description: 'Remove the question at the given index within a question set',
    inputSchema: { setId: z.string(), index: z.number().int().min(0) }
  },
  guarded(({ setId, index }) => {
    repo.deleteQuestion(setId, index);
    return { deleted: index };
  })
);

server.registerTool(
  'publish',
  {
    title: 'Publish question sets',
    description: 'Commit changes under questions/ and push to origin/main so GitHub Pages redeploys',
    inputSchema: { message: z.string().min(1) }
  },
  guarded(({ message }) => publisher.publish(message))
);

const transport = new StdioServerTransport();
await server.connect(transport);
