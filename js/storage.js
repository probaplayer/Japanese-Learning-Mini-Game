// ================================================
// 日本語 QUEST — Storage Module
// ================================================

/* ── STORAGE ── */
function saveToStorage() {
  updateActiveSetFromQuestions();
  localStorage.setItem('jq_questions', JSON.stringify(questions));
  saveQuestionSetsToStorage();
  normalizePlayerProgress();
  localStorage.setItem('jq_hp', playerHP);
  localStorage.setItem('jq_exp', playerEXP);
  localStorage.setItem('jq_level', playerLevel);
  localStorage.setItem('jq_combo', playerCombo);
  localStorage.setItem('jq_settings', JSON.stringify(settings));
  saveQuestionStats();
  saveDailyStreak();
}

function saveQuestionSetsToStorage() {
  localStorage.setItem('jq_question_sets', JSON.stringify(questionSets));
  localStorage.setItem('jq_active_set', activeSetId);
}

function getActiveQuestionSet() {
  let set = questionSets.find(s => s.id === activeSetId);
  if (!set) set = questionSets[0] || null;
  if (set && set.id !== activeSetId) activeSetId = set.id;
  return set;
}

function syncQuestionsFromActiveSet() {
  const set = getActiveQuestionSet();
  questions = set ? set.questions : [];
  if (typeof initQuestionStats === 'function') {
    initQuestionStats(questions);
  }
}

function updateActiveSetFromQuestions() {
  const set = getActiveQuestionSet();
  if (!set) return;
  if (questions !== set.questions) {
    set.questions = questions;
  }
  set.updatedAt = new Date().toISOString();
}

function loadFromStorage() {
  const storedSets = localStorage.getItem('jq_question_sets');
  const storedActiveSet = localStorage.getItem('jq_active_set');

  if (storedSets) {
    try {
      questionSets = JSON.parse(storedSets) || [];
    } catch (e) {
      questionSets = [];
    }
    activeSetId = storedActiveSet;
  } else {
    const q = localStorage.getItem('jq_questions');
    if (q) {
      try {
        const parsed = JSON.parse(q);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const now = new Date().toISOString();
          questionSets = [{
            id: `set-${Date.now()}`,
            name: 'Saved Set',
            questions: parsed,
            createdAt: now,
            updatedAt: now
          }];
          activeSetId = questionSets[0].id;
        }
      } catch (e) {
        questionSets = [];
      }
    }
  }

  if (!questionSets || questionSets.length === 0) {
    const now = new Date().toISOString();
    questionSets = [{
      id: 'set-default',
      name: 'Default Set',
      questions: [...SAMPLE_DATA],
      createdAt: now,
      updatedAt: now
    }];
    activeSetId = questionSets[0].id;
  }

  if (!questionSets.some(s => s.id === activeSetId)) {
    activeSetId = questionSets[0].id;
  }

  playerHP = parseInt(localStorage.getItem('jq_hp') ?? 100, 10);
  playerEXP = parseInt(localStorage.getItem('jq_exp') ?? 0, 10);
  playerLevel = parseInt(localStorage.getItem('jq_level') ?? 1, 10);
  playerCombo = parseInt(localStorage.getItem('jq_combo') ?? 0, 10);

  syncQuestionsFromActiveSet();
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
  const gameTypes = ['quiz', 'listen', 'flash', 'match', 'type', 'write'];
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

function createQuestionSet(name, items = []) {
  const id = `set-${Date.now()}`;
  const now = new Date().toISOString();
  const set = {
    id,
    name: name ? name.trim() : 'Untitled Set',
    questions: Array.isArray(items) ? items : [],
    createdAt: now,
    updatedAt: now
  };
  questionSets.push(set);
  activeSetId = id;
  syncQuestionsFromActiveSet();
  saveQuestionSetsToStorage();
  return set;
}

function renameQuestionSet(id, name) {
  const set = questionSets.find(s => s.id === id);
  if (!set) return;
  if (!name || !name.trim()) return;
  set.name = name.trim();
  set.updatedAt = new Date().toISOString();
  saveQuestionSetsToStorage();
  refreshQuestionSetUI();
}

function deleteQuestionSet(id) {
  if (questionSets.length <= 1) {
    alert('Cannot delete the last question set.');
    return;
  }
  const index = questionSets.findIndex(s => s.id === id);
  if (index === -1) return;
  if (!confirm('Delete this question set?')) return;
  questionSets.splice(index, 1);
  if (!questionSets.some(s => s.id === activeSetId)) {
    activeSetId = questionSets[0].id;
  }
  syncQuestionsFromActiveSet();
  saveToStorage();
  refreshQuestionSetUI();
  refreshDataPreview();
  updateMenuUI();
}

function switchQuestionSet(id) {
  if (!questionSets.some(s => s.id === id)) return;
  activeSetId = id;
  syncQuestionsFromActiveSet();
  saveToStorage();
  refreshQuestionSetUI();
  refreshDataPreview();
  updateMenuUI();
}

function refreshQuestionSetUI() {
  const selector = document.getElementById('question-set-selector');
  const activeNameEl = document.getElementById('active-set-name');
  const activeSet = getActiveQuestionSet();

  if (selector) {
    selector.innerHTML = questionSets.map(set => `<option value="${escapeHtml(set.id)}"${set.id === activeSet?.id ? ' selected' : ''}>${escapeHtml(set.name)}</option>`).join('');
  }
  if (activeNameEl) {
    activeNameEl.textContent = activeSet ? activeSet.name : 'No active set';
  }
  if (activeSet && document.getElementById('current-count')) {
    document.getElementById('current-count').textContent = activeSet.questions.length;
  }
}

function promptCreateQuestionSet() {
  const name = prompt('Enter a name for the new question set:', `Set ${questionSets.length + 1}`);
  if (!name) return;
  createQuestionSet(name.trim(), []);
  refreshQuestionSetUI();
  refreshDataPreview();
}

function promptRenameQuestionSet() {
  const activeSet = getActiveQuestionSet();
  if (!activeSet) return;
  const name = prompt('Enter new name for this question set:', activeSet.name);
  if (!name || !name.trim()) return;
  renameQuestionSet(activeSet.id, name.trim());
}

function deleteActiveQuestionSet() {
  const activeSet = getActiveQuestionSet();
  if (!activeSet) return;
  deleteQuestionSet(activeSet.id);
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
