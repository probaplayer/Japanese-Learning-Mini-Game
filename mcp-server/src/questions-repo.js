import fs from 'node:fs';
import path from 'node:path';

const QUESTION_FIELDS = ['word', 'romaji', 'translation', 'q', 'a', 'c', 'ex'];

export function validateQuestion(question) {
  if (!question || typeof question !== 'object') {
    return 'Question must be an object';
  }
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
  const extraFields = Object.keys(question).filter(k => !QUESTION_FIELDS.includes(k));
  if (extraFields.length > 0) {
    return `Question has unexpected fields: ${extraFields.join(', ')}`;
  }
  return null;
}

export function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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

  function createQuestionSet({ id, name, description = '', questions = [] }) {
    const manifest = readManifest();
    const setId = id ? slugify(id) : slugify(name);
    if (!setId) throw new Error('Could not derive a valid id from the provided name/id');
    if (findEntry(manifest, setId)) throw new Error(`Question set id already exists: ${setId}`);
    for (const q of questions) {
      const error = validateQuestion(q);
      if (error) throw new Error(error);
    }
    const now = new Date().toISOString();
    const file = `${setId}.json`;
    const set = { id: setId, name, description, createdAt: now, updatedAt: now, questions };
    writeSetFile(file, set);
    manifest.sets.push({ id: setId, file, name, questionCount: questions.length, updatedAt: now });
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

  function updateManifestEntry(manifest, id, set) {
    const entry = findEntry(manifest, id);
    entry.questionCount = set.questions.length;
    entry.updatedAt = set.updatedAt;
    entry.name = set.name;
  }

  function addQuestion(setId, question) {
    const error = validateQuestion(question);
    if (error) throw new Error(error);
    const manifest = readManifest();
    const entry = findEntry(manifest, setId);
    if (!entry) throw new Error(`Question set not found: ${setId}`);
    const set = readSetFile(entry.file);
    set.questions.push(question);
    set.updatedAt = new Date().toISOString();
    writeSetFile(entry.file, set);
    updateManifestEntry(manifest, setId, set);
    writeManifest(manifest);
    return set.questions.length - 1;
  }

  function updateQuestion(setId, index, question) {
    const error = validateQuestion(question);
    if (error) throw new Error(error);
    const manifest = readManifest();
    const entry = findEntry(manifest, setId);
    if (!entry) throw new Error(`Question set not found: ${setId}`);
    const set = readSetFile(entry.file);
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

  function searchQuestions(keyword, setId) {
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
    const results = [];
    for (const entry of entries) {
      const set = readSetFile(entry.file);
      set.questions.forEach((question, index) => {
        const haystack = [question.word, question.romaji, question.translation, question.q, question.ex, ...question.a]
          .join('\n')
          .toLowerCase();
        if (haystack.includes(needle)) {
          results.push({ setId: entry.id, index, question });
        }
      });
    }
    return results;
  }

  function patchQuestion(setId, patches) {
    const manifest = readManifest();
    const entry = findEntry(manifest, setId);
    if (!entry) throw new Error(`Question set not found: ${setId}`);
    const set = readSetFile(entry.file);

    const merged = patches.map(({ index, fields }) => {
      if (index < 0 || index >= set.questions.length) throw new Error(`Question index out of range: ${index}`);
      const question = { ...set.questions[index], ...fields };
      const error = validateQuestion(question);
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
    addQuestion,
    updateQuestion,
    deleteQuestion,
    searchQuestions,
    patchQuestion
  };
}
