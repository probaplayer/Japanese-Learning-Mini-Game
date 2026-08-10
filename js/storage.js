// ================================================
// 日本語 QUEST — Storage Module
// ================================================

/* ── QUESTION SETS (loaded from questions/ folder) ── */
async function fetchQuestionsManifest() {
  const res = await fetch('questions/manifest.json');
  if (!res.ok) throw new Error(`Failed to load questions/manifest.json (${res.status})`);
  const manifest = await res.json();
  if (!manifest || !Array.isArray(manifest.sets)) throw new Error('Invalid manifest.json: missing "sets" array');
  return manifest;
}

async function fetchQuestionSetFile(file) {
  const res = await fetch(`questions/${file}`);
  if (!res.ok) throw new Error(`Failed to load questions/${file} (${res.status})`);
  const set = await res.json();
  if (!set || !Array.isArray(set.questions)) throw new Error(`Invalid question set file: questions/${file}`);
  return set;
}

function saveActiveSetId() {
  if (activeSetId) localStorage.setItem('jq_active_set', activeSetId);
}

async function initQuestionSets() {
  const manifest = await fetchQuestionsManifest();
  questionSets = manifest.sets;
  roadmapDefinitions = Array.isArray(manifest.roadmaps) ? manifest.roadmaps : [];
  if (questionSets.length === 0) {
    questions = [];
    activeSetId = null;
    return;
  }
  const storedActiveId = localStorage.getItem('jq_active_set');
  const meta = questionSets.find(s => s.id === storedActiveId) || questionSets[0];
  const set = await fetchQuestionSetFile(meta.file);
  activeSetId = meta.id;
  questions = set.questions;
  saveActiveSetId();
}

async function switchQuestionSet(id) {
  const meta = questionSets.find(s => s.id === id);
  if (!meta) return;
  const set = await fetchQuestionSetFile(meta.file);
  activeSetId = id;
  questions = set.questions;
  saveActiveSetId();
  if (typeof initQuestionStats === 'function') initQuestionStats(questions);
  refreshQuestionSetUI();
  updateMenuUI();
}

function getActiveQuestionSet() {
  const meta = questionSets.find(s => s.id === activeSetId);
  return { id: activeSetId, name: meta ? meta.name : 'Unknown Set', questions };
}

function refreshQuestionSetUI() {
  const selector = document.getElementById('question-set-selector');
  const activeNameEl = document.getElementById('active-set-name');

  if (selector) {
    selector.innerHTML = questionSets.map(set => `<option value="${escapeHtml(set.id)}"${set.id === activeSetId ? ' selected' : ''}>${escapeHtml(set.name)} (${set.questionCount})</option>`).join('');
  }
  if (activeNameEl) {
    const meta = questionSets.find(s => s.id === activeSetId);
    activeNameEl.textContent = meta ? meta.name : 'No active set';
  }
  if (document.getElementById('current-count')) {
    document.getElementById('current-count').textContent = questions.length;
  }
}

/* ── PLAYER PROGRESS ── */
function saveToStorage() {
  normalizePlayerProgress();
  localStorage.setItem('jq_hp', playerHP);
  localStorage.setItem('jq_exp', playerEXP);
  localStorage.setItem('jq_level', playerLevel);
  localStorage.setItem('jq_combo', playerCombo);
  localStorage.setItem('jq_settings', JSON.stringify(settings));
  saveQuestionStats();
  saveDailyStreak();
}

function loadPlayerProgressFromStorage() {
  playerHP = parseInt(localStorage.getItem('jq_hp') ?? 100, 10);
  playerEXP = parseInt(localStorage.getItem('jq_exp') ?? 0, 10);
  playerLevel = parseInt(localStorage.getItem('jq_level') ?? 1, 10);
  playerCombo = parseInt(localStorage.getItem('jq_combo') ?? 0, 10);
  normalizePlayerProgress();
}

function mergePlainObjects(defaults, overrides) {
  const result = { ...defaults };
  if (!overrides || typeof overrides !== 'object') return result;
  Object.keys(overrides).forEach(key => {
    const defaultValue = defaults ? defaults[key] : undefined;
    const overrideValue = overrides[key];
    if (
      defaultValue &&
      overrideValue &&
      typeof defaultValue === 'object' &&
      typeof overrideValue === 'object' &&
      !Array.isArray(defaultValue) &&
      !Array.isArray(overrideValue)
    ) {
      result[key] = mergePlainObjects(defaultValue, overrideValue);
    } else {
      result[key] = overrideValue;
    }
  });
  return result;
}

function loadSettingsFromStorage() {
  const s = localStorage.getItem('jq_settings');
  if (s) {
    try {
      const parsed = JSON.parse(s);
      settings = mergePlainObjects(settings, parsed);
    } catch (e) {
      settings = { ...settings };
    }
  }
}

function saveSettingsToStorage() {
  localStorage.setItem('jq_settings', JSON.stringify(settings));
}

function detectSetIdRescopeNeeded() {
  return Object.keys(questionStats).some(key => key.startsWith('set-default::'));
}

function migrateStatsToNewSetId() {
  const targetSetId = activeSetId || 'set-default';
  const legacyPrefix = 'set-default::';
  const legacyKeys = Object.keys(questionStats).filter(key => key.startsWith(legacyPrefix));
  legacyKeys.forEach(key => {
    const suffix = key.slice(legacyPrefix.length);
    const newKey = `${targetSetId}::${suffix}`;
    if (!questionStats[newKey]) {
      questionStats[newKey] = questionStats[key];
    }
    delete questionStats[key];
  });
}

function detectLegacyStats() {
  return Object.keys(questionStats).some(key => /^q-\d+$/.test(key));
}

function migrateStatsToHashBased() {
  const legacyKeys = Object.keys(questionStats).filter(key => /^q-\d+$/.test(key));
  const migrated = {};
  legacyKeys.forEach(key => {
    const index = parseInt(key.replace('q-', ''), 10);
    if (index >= 0 && index < questions.length) {
      const newId = getScopedQuestionId(questions[index]);
      migrated[newId] = questionStats[key];
    }
  });
  Object.keys(migrated).forEach(id => {
    questionStats[id] = migrated[id];
  });
  legacyKeys.forEach(key => delete questionStats[key]);
  initQuestionStats(questions);
  saveQuestionStats();
}

function loadQuestionStats() {
  const alreadySetIdMigrated = localStorage.getItem('jq_setid_migrated') === 'true';
  const alreadyMigrated = localStorage.getItem('jq_stats_migrated') === 'true';
  const stored = localStorage.getItem('jq_question_stats');
  if (stored) {
    try {
      questionStats = JSON.parse(stored);
      seedIncorrectHistory();
    } catch (e) {
      questionStats = {};
    }
  }
  if (!alreadySetIdMigrated && detectSetIdRescopeNeeded()) {
    try {
      migrateStatsToNewSetId();
      saveQuestionStats();
      localStorage.setItem('jq_setid_migrated', 'true');
    } catch (e) {
      console.warn('Set-id rescope migration failed:', e);
      localStorage.setItem('jq_setid_migrated', 'true');
    }
  }
  if (!alreadyMigrated && detectLegacyStats()) {
    try {
      migrateStatsToHashBased();
      localStorage.setItem('jq_stats_migrated', 'true');
    } catch (e) {
      console.warn('Stats migration failed, initializing empty stats:', e);
      questionStats = {};
      localStorage.setItem('jq_stats_migrated', 'true');
    }
  }
  initQuestionStats(questions);
}

function seedIncorrectHistory() {
  Object.keys(questionStats).forEach(id => {
    const qStats = questionStats[id];
    Object.keys(qStats).forEach(game => {
      if (game.startsWith('_')) return;
      const stats = qStats[game];
      if (stats.incorrect > 0 && (!stats.incorrectHistory || stats.incorrectHistory.length === 0)) {
        stats.incorrectHistory = stats.lastSeen ? [stats.lastSeen] : [];
      } else if (!stats.incorrectHistory) {
        stats.incorrectHistory = [];
      }
    });
  });
}

function saveQuestionStats() {
  localStorage.setItem('jq_question_stats', JSON.stringify(questionStats));
}

function loadSessionHistory() {
  const stored = localStorage.getItem('jq_session_history');
  if (stored) {
    try {
      sessionHistory = JSON.parse(stored);
    } catch (e) {
      sessionHistory = [];
    }
  }
}

function saveSessionHistory() {
  localStorage.setItem('jq_session_history', JSON.stringify(sessionHistory));
}

function initQuestionStats(questionsArr) {
  const gameTypes = ['quiz', 'listen', 'flash', 'match', 'type', 'write', 'grammar'];
  questionsArr.forEach((q) => {
    const legacyId = generateQuestionId(q);
    const id = getScopedQuestionId(q);
    if (!questionStats[id] && questionStats[legacyId]) {
      questionStats[id] = questionStats[legacyId];
    }
    if (!questionStats[id]) {
      questionStats[id] = {};
    }
    gameTypes.forEach(game => {
      if (!questionStats[id][game]) {
        questionStats[id][game] = getDefaultQuestionTypeStats();
      }
    });
  });
}

function cleanupQuestionStats(deletedIndex) {
  const q = questions[deletedIndex];
  if (!q) return;
  const id = getScopedQuestionId(q);
  delete questionStats[id];
  saveQuestionStats();
}

function applyScanlinesVisibility() {
  const scanlines = document.querySelector('.scanlines');
  if (!scanlines) return;
  scanlines.style.display = settings.scanlinesEnabled ? 'block' : 'none';
}

function updateAnimationBodyClass() {
  if (settings.animationEnabled === false) {
    document.body.classList.add('animations-disabled');
  } else {
    document.body.classList.remove('animations-disabled');
  }
}
