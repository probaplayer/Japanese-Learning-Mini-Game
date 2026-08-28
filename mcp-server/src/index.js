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
  ex: z.string().min(1),
  aTranslation: z.array(z.string().min(1)).length(4).optional()
};

const grammarQuestionShape = {
  sentence: z.string().min(1),
  chunks: z.array(z.string().min(1)).min(2),
  translation: z.string().min(1),
  ex: z.string().min(1).optional()
};

const anyQuestionShape = z.union([z.object(questionShape), z.object(grammarQuestionShape)]);

const questionPatchFieldsShape = z.union([
  z.object(questionShape).partial().strict(),
  z.object(grammarQuestionShape).partial().strict()
]).refine(fields => Object.keys(fields).length > 0, { message: 'fields must include at least one field to update' });

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
  'search_questions',
  {
    title: 'Search questions',
    description: 'Find questions by keyword across one or all question sets, matching word/romaji/translation/q/ex and answer choices. Results are capped (default 50, max 200) — check the returned "truncated" flag and narrow the keyword or set if true.',
    inputSchema: {
      keyword: z.string().min(1),
      setId: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(50)
    }
  },
  guarded(({ keyword, setId, limit }) => repo.searchQuestions(keyword, setId, limit))
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
      category: z.enum(['vocabulary', 'grammar']).optional(),
      order: z.number().int().optional(),
      level: z.string().optional(),
      roadmapId: z.string().optional(),
      questions: z.array(anyQuestionShape).optional()
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
  'update_question_set_metadata',
  {
    title: 'Update question set metadata',
    description: 'Update the roadmapId, order, or level of an existing question set in the manifest. Does not touch the set\'s questions or file. Pass roadmapId: null to remove the set from its roadmap; omit a field to leave it unchanged.',
    inputSchema: {
      id: z.string(),
      roadmapId: z.string().nullable().optional(),
      order: z.number().int().optional(),
      level: z.string().optional()
    }
  },
  guarded(({ id, roadmapId, order, level }) => repo.updateQuestionSetMetadata(id, { roadmapId, order, level }))
);

server.registerTool(
  'add_question',
  {
    title: 'Add question',
    description: 'Append a question to an existing question set',
    inputSchema: { setId: z.string(), question: anyQuestionShape }
  },
  guarded(({ setId, question }) => ({ index: repo.addQuestion(setId, question) }))
);

server.registerTool(
  'update_question',
  {
    title: 'Update question',
    description: 'Replace the question at the given index within a question set',
    inputSchema: { setId: z.string(), index: z.number().int().min(0), question: anyQuestionShape }
  },
  guarded(({ setId, index, question }) => {
    repo.updateQuestion(setId, index, question);
    return { updated: index };
  })
);

server.registerTool(
  'patch_question',
  {
    title: 'Patch question(s)',
    description: 'Update only the given fields of one or more questions in a set, atomically — either every patch applies or none are written',
    inputSchema: {
      setId: z.string(),
      patches: z.array(z.object({
        index: z.number().int().min(0),
        fields: questionPatchFieldsShape
      })).min(1)
    }
  },
  guarded(({ setId, patches }) => ({ updated: repo.patchQuestion(setId, patches) }))
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
  'list_roadmaps',
  { title: 'List roadmaps', description: 'List all roadmaps with id and name' },
  guarded(() => repo.listRoadmaps())
);

server.registerTool(
  'create_roadmap',
  {
    title: 'Create roadmap',
    description: 'Create a new roadmap and register it in the manifest',
    inputSchema: { id: z.string().optional(), name: z.string().min(1) }
  },
  guarded((args) => repo.createRoadmap(args))
);

server.registerTool(
  'rename_roadmap',
  {
    title: 'Rename roadmap',
    description: 'Update the display name of an existing roadmap',
    inputSchema: { id: z.string(), name: z.string().min(1) }
  },
  guarded(({ id, name }) => repo.renameRoadmap(id, name))
);

server.registerTool(
  'delete_roadmap',
  {
    title: 'Delete roadmap',
    description: 'Delete a roadmap from the manifest. Any question set still assigned to it is reassigned to the "unassigned" fallback roadmap (created automatically if missing).',
    inputSchema: { id: z.string() }
  },
  guarded(({ id }) => {
    repo.deleteRoadmap(id);
    return { deleted: id };
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
