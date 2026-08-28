import fs from 'node:fs';
import path from 'node:path';

const UNASSIGNED_ROADMAP_ID = 'unassigned';
const UNASSIGNED_ROADMAP_NAME = 'Chưa phân loại';

const QUESTION_FIELDS = ['word', 'romaji', 'translation', 'q', 'a', 'c', 'ex', 'aTranslation'];
const GRAMMAR_QUESTION_FIELDS = ['sentence', 'chunks', 'translation', 'ex'];

function validateVocabularyQuestion(question) {
  for (const field of ['word', 'romaji', 'translation', 'q', 'ex']) {
    if (typeof question[field] !== 'string' || question[field].length === 0) {
      return `Question field "${field}" must be a non-empty string`;
    }
  }
  if (!Array.isArray(question.a) || question.a.length !== 4 || question.a.some(opt => typeof opt !== 'string')) {
    return 'Question field "a" must be an array of exactly 4 strings';
  }
  if (!Number.isInteger(question.c) || question.c < 0 || question.c > 3) {
    return 'Question field "c" must be an integer between 0 and 3';
  }
  if (question.aTranslation !== undefined) {
    const at = question.aTranslation;
    if (!Array.isArray(at) || at.length !== 4 || at.some(opt => typeof opt !== 'string' || opt.length === 0)) {
      return 'Question field "aTranslation" must be an array of exactly 4 non-empty strings';
    }
  }
  const extraFields = Object.keys(question).filter(k => !QUESTION_FIELDS.includes(k));
  if (extraFields.length > 0) {
    return `Question has unexpected fields: ${extraFields.join(', ')}`;
  }
  return null;
}

function validateGrammarQuestion(question) {
  if (typeof question.sentence !== 'string' || question.sentence.length === 0) {
    return 'Question field "sentence" must be a non-empty string';
  }
  if (!Array.isArray(question.chunks) || question.chunks.length < 2 || question.chunks.some(c => typeof c !== 'string' || c.length === 0)) {
    return 'Question field "chunks" must be an array of at least 2 non-empty strings';
  }
  if (question.chunks.join('') !== question.sentence) {
    return 'Question field "chunks" must concatenate to sentence';
  }
  if (typeof question.translation !== 'string' || question.translation.length === 0) {
    return 'Question field "translation" must be a non-empty string';
  }
  if (question.ex !== undefined && (typeof question.ex !== 'string' || question.ex.length === 0)) {
    return 'Question field "ex" must be a non-empty string when present';
  }
  const extraFields = Object.keys(question).filter(k => !GRAMMAR_QUESTION_FIELDS.includes(k));
  if (extraFields.length > 0) {
    return `Question has unexpected fields: ${extraFields.join(', ')}`;
  }
  return null;
}

export function validateQuestion(question, category = 'vocabulary') {
  if (!question || typeof question !== 'object') {
    return 'Question must be an object';
  }
  return category === 'grammar' ? validateGrammarQuestion(question) : validateVocabularyQuestion(question);
}

export function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function assertKnownRoadmapId(manifest, roadmapId) {
  const knownRoadmaps = Array.isArray(manifest.roadmaps) ? manifest.roadmaps : [];
  if (!knownRoadmaps.some(r => r.id === roadmapId)) {
    throw new Error(`Unknown roadmapId: ${roadmapId}. Known roadmaps: ${knownRoadmaps.map(r => r.id).join(', ') || '(none)'}`);
  }
}

export function createQuestionsRepo(baseDir) {
  const manifestPath = path.join(baseDir, 'manifest.json');

  function readManifest() {
    if (!fs.existsSync(manifestPath)) {
      return { sets: [] };
    }
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  function writeManifest(manifest) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  }

  function readSetFile(file) {
    const filePath = path.join(baseDir, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Question set file not found: ${file}`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  function writeSetFile(file, set) {
    fs.writeFileSync(path.join(baseDir, file), JSON.stringify(set, null, 2) + '\n', 'utf8');
  }

  function findEntry(manifest, id) {
    return manifest.sets.find(s => s.id === id);
  }

  function listQuestionSets() {
    return readManifest().sets;
  }

  function getQuestionSet(id) {
    const manifest = readManifest();
    const entry = findEntry(manifest, id);
    if (!entry) throw new Error(`Question set not found: ${id}`);
    return readSetFile(entry.file);
  }

  function createQuestionSet({ id, name, description = '', category = 'vocabulary', order, level, roadmapId, questions = [] }) {
    const manifest = readManifest();
    const setId = id ? slugify(id) : slugify(name);
    if (!setId) throw new Error('Could not derive a valid id from the provided name/id');
    if (findEntry(manifest, setId)) throw new Error(`Question set id already exists: ${setId}`);
    if (roadmapId !== undefined) assertKnownRoadmapId(manifest, roadmapId);
    for (const q of questions) {
      const error = validateQuestion(q, category);
      if (error) throw new Error(error);
    }
    const now = new Date().toISOString();
    const file = `${setId}.json`;
    const set = { id: setId, name, description, category, createdAt: now, updatedAt: now, questions };
    writeSetFile(file, set);
    const resolvedOrder = Number.isInteger(order) ? order : Math.max(0, ...manifest.sets.map(s => s.order ?? 0)) + 1;
    const resolvedLevel = typeof level === 'string' && level.length > 0 ? level : 'N/A';
    const entry = { id: setId, file, name, category, order: resolvedOrder, level: resolvedLevel, questionCount: questions.length, updatedAt: now };
    if (roadmapId !== undefined) entry.roadmapId = roadmapId;
    manifest.sets.push(entry);
    writeManifest(manifest);
    return set;
  }

  function deleteQuestionSet(id) {
    const manifest = readManifest();
    const entry = findEntry(manifest, id);
    if (!entry) throw new Error(`Question set not found: ${id}`);
    const filePath = path.join(baseDir, entry.file);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    manifest.sets = manifest.sets.filter(s => s.id !== id);
    writeManifest(manifest);
  }

  function updateQuestionSetMetadata(id, { roadmapId, order, level } = {}) {
    const manifest = readManifest();
    const entry = findEntry(manifest, id);
    if (!entry) throw new Error(`Question set not found: ${id}`);

    if (roadmapId !== undefined) {
      if (roadmapId === null) {
        delete entry.roadmapId;
      } else {
        assertKnownRoadmapId(manifest, roadmapId);
        entry.roadmapId = roadmapId;
      }
    }
    if (order !== undefined) {
      if (!Number.isInteger(order)) throw new Error('order must be an integer');
      entry.order = order;
    }
    if (level !== undefined) {
      if (typeof level !== 'string' || level.length === 0) throw new Error('level must be a non-empty string');
      entry.level = level;
    }

    entry.updatedAt = new Date().toISOString();
    writeManifest(manifest);
    return entry;
  }

  function updateManifestEntry(manifest, id, set) {
    const entry = findEntry(manifest, id);
    entry.questionCount = set.questions.length;
    entry.updatedAt = set.updatedAt;
    entry.name = set.name;
  }

  function addQuestion(setId, question) {
    const manifest = readManifest();
    const entry = findEntry(manifest, setId);
    if (!entry) throw new Error(`Question set not found: ${setId}`);
    const set = readSetFile(entry.file);
    const error = validateQuestion(question, set.category || 'vocabulary');
    if (error) throw new Error(error);
    set.questions.push(question);
    set.updatedAt = new Date().toISOString();
    writeSetFile(entry.file, set);
    updateManifestEntry(manifest, setId, set);
    writeManifest(manifest);
    return set.questions.length - 1;
  }

  function updateQuestion(setId, index, question) {
    const manifest = readManifest();
    const entry = findEntry(manifest, setId);
    if (!entry) throw new Error(`Question set not found: ${setId}`);
    const set = readSetFile(entry.file);
    const error = validateQuestion(question, set.category || 'vocabulary');
    if (error) throw new Error(error);
    if (index < 0 || index >= set.questions.length) throw new Error(`Question index out of range: ${index}`);
    set.questions[index] = question;
    set.updatedAt = new Date().toISOString();
    writeSetFile(entry.file, set);
    updateManifestEntry(manifest, setId, set);
    writeManifest(manifest);
  }

  function deleteQuestion(setId, index) {
    const manifest = readManifest();
    const entry = findEntry(manifest, setId);
    if (!entry) throw new Error(`Question set not found: ${setId}`);
    const set = readSetFile(entry.file);
    if (index < 0 || index >= set.questions.length) throw new Error(`Question index out of range: ${index}`);
    set.questions.splice(index, 1);
    set.updatedAt = new Date().toISOString();
    writeSetFile(entry.file, set);
    updateManifestEntry(manifest, setId, set);
    writeManifest(manifest);
  }

  function listRoadmaps() {
    const manifest = readManifest();
    return Array.isArray(manifest.roadmaps) ? manifest.roadmaps : [];
  }

  function findRoadmap(manifest, id) {
    const roadmaps = Array.isArray(manifest.roadmaps) ? manifest.roadmaps : [];
    return roadmaps.find(r => r.id === id);
  }

  function createRoadmap({ id, name }) {
    const manifest = readManifest();
    if (!Array.isArray(manifest.roadmaps)) manifest.roadmaps = [];
    const roadmapId = id ? slugify(id) : slugify(name);
    if (!roadmapId) throw new Error('Could not derive a valid id from the provided name/id');
    if (findRoadmap(manifest, roadmapId)) throw new Error(`Roadmap id already exists: ${roadmapId}`);
    const entry = { id: roadmapId, name };
    manifest.roadmaps.push(entry);
    writeManifest(manifest);
    return entry;
  }

  function renameRoadmap(id, name) {
    const manifest = readManifest();
    const entry = findRoadmap(manifest, id);
    if (!entry) throw new Error(`Roadmap not found: ${id}`);
    entry.name = name;
    writeManifest(manifest);
    return entry;
  }

  function deleteRoadmap(id) {
    const manifest = readManifest();
    const entry = findRoadmap(manifest, id);
    if (!entry) throw new Error(`Roadmap not found: ${id}`);

    const assignedSets = manifest.sets.filter(s => s.roadmapId === id);
    if (assignedSets.length > 0) {
      if (id === UNASSIGNED_ROADMAP_ID) {
        throw new Error(`Cannot delete roadmap "${id}": still assigned to ${assignedSets.length} question set(s)`);
      }
      if (!findRoadmap(manifest, UNASSIGNED_ROADMAP_ID)) {
        manifest.roadmaps.push({ id: UNASSIGNED_ROADMAP_ID, name: UNASSIGNED_ROADMAP_NAME });
      }
      const now = new Date().toISOString();
      assignedSets.forEach(s => {
        s.roadmapId = UNASSIGNED_ROADMAP_ID;
        s.updatedAt = now;
      });
    }

    manifest.roadmaps = manifest.roadmaps.filter(r => r.id !== id);
    writeManifest(manifest);
  }

  function searchQuestions(keyword, setId, limit = 50) {
    const needle = keyword.toLowerCase();
    const manifest = readManifest();
    let entries;
    if (setId) {
      const entry = findEntry(manifest, setId);
      if (!entry) throw new Error(`Question set not found: ${setId}`);
      entries = [entry];
    } else {
      entries = manifest.sets;
    }
    const matches = [];
    for (const entry of entries) {
      const set = readSetFile(entry.file);
      set.questions.forEach((question, index) => {
        const haystack = [
          question.word,
          question.romaji,
          question.translation,
          question.q,
          question.ex,
          question.sentence,
          question.chunks ? question.chunks.join(' ') : '',
          ...(question.a || [])
        ]
          .join('\n')
          .toLowerCase();
        if (haystack.includes(needle)) {
          matches.push({ setId: entry.id, index, question });
        }
      });
    }
    const totalMatches = matches.length;
    const truncated = totalMatches > limit;
    return { totalMatches, truncated, results: matches.slice(0, limit) };
  }

  function patchQuestion(setId, patches) {
    const manifest = readManifest();
    const entry = findEntry(manifest, setId);
    if (!entry) throw new Error(`Question set not found: ${setId}`);
    const set = readSetFile(entry.file);

    const merged = patches.map(({ index, fields }) => {
      if (index < 0 || index >= set.questions.length) throw new Error(`Question index out of range: ${index}`);
      const question = { ...set.questions[index], ...fields };
      const error = validateQuestion(question, set.category || 'vocabulary');
      if (error) throw new Error(`Patch for index ${index}: ${error}`);
      return { index, question };
    });

    merged.forEach(({ index, question }) => {
      set.questions[index] = question;
    });
    set.updatedAt = new Date().toISOString();
    writeSetFile(entry.file, set);
    updateManifestEntry(manifest, setId, set);
    writeManifest(manifest);
    return merged.map(m => m.index);
  }

  return {
    listQuestionSets,
    getQuestionSet,
    createQuestionSet,
    deleteQuestionSet,
    updateQuestionSetMetadata,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    searchQuestions,
    patchQuestion,
    listRoadmaps,
    createRoadmap,
    renameRoadmap,
    deleteRoadmap
  };
}
