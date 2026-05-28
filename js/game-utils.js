// ================================================
// 日本語 QUEST — Game Utilities Module
// ================================================

const LEVEL_XP_CURVE = 1.2;
const BASE_XP_REWARD = 5;

/* ── QUESTION ID HASHING ── */
function generateQuestionId(q) {
  const str = `${q.word}||${q.q}||${q.romaji}||${q.translation || ''}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `q-${Math.abs(hash).toString(36)}`;
}

/* ── PRIORITY SYSTEM ── */
const MAX_DAYS = 30;
const MAX_TIME_BONUS = 50;
const DECAY_RATE = 0.85;
const MAX_HISTORY_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FAST_CORRECT_GAME_TYPES = ['quiz', 'listen', 'flash'];
const WEAK_FAST_CORRECT_THRESHOLD = 2;
let pendingFastCorrectCooldown = null;

function getFastCorrectThresholdMs() {
  const thresholdSeconds = Math.max(1, parseInt(settings.fastCorrectThresholdSeconds || 8, 10));
  return thresholdSeconds * 1000;
}

function getScopedQuestionId(questionOrId) {
  const baseId = typeof questionOrId === 'string'
    ? questionOrId
    : generateQuestionId(questionOrId);
  if (baseId.includes('::')) return baseId;
  const setId = activeSetId || 'set-default';
  return `${setId}::${baseId}`;
}

function getQuestionStatsEntry(questionOrId, create = false) {
  const id = getScopedQuestionId(questionOrId);
  if (!questionStats[id] && create) {
    questionStats[id] = {};
  }
  return questionStats[id];
}

function getDefaultQuestionTypeStats() {
  return { incorrect: 0, correctCount: 0, totalAttempts: 0, lastSeen: null, correctStreak: 0, avgResponseTime: 0, slowCorrectCount: 0, incorrectHistory: [] };
}

function cleanIncorrectHistory(history) {
  if (!history || !Array.isArray(history)) return [];
  const now = new Date();
  const cutoff = new Date(now.getTime() - MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  return history.filter(ts => new Date(ts) >= cutoff);
}

function getEffectiveIncorrect(stats) {
  if (!stats) return 0;
  const history = stats.incorrectHistory || [];
  const cleaned = cleanIncorrectHistory(history);
  if (cleaned.length === 0) {
    return stats.incorrect || 0;
  }
  const now = new Date();
  return cleaned.reduce((sum, ts) => {
    const daysSince = Math.max(0, Math.floor((now - new Date(ts)) / (1000 * 60 * 60 * 24)));
    return sum + Math.pow(DECAY_RATE, daysSince);
  }, 0);
}

function getConfidenceLevel(correctStreak, effectiveIncorrect) {
  const score = correctStreak / (correctStreak + effectiveIncorrect + 1);
  if (score >= 0.7) return 'mastered';
  if (score >= 0.4) return 'familiar';
  if (score >= 0.1) return 'learning';
  return 'new';
}

function getQuestionMeta(questionId) {
  const scopedId = getScopedQuestionId(questionId);
  if (!questionStats[scopedId]) {
    questionStats[scopedId] = {};
  }
  if (!questionStats[scopedId]._meta) {
    questionStats[scopedId]._meta = {};
  }
  return questionStats[scopedId]._meta;
}

function isQuestionOnCooldown(questionOrId, gameType) {
  if (settings.fastCorrectCooldownEnabled === false) return false;
  const entry = getQuestionStatsEntry(questionOrId, false);
  const meta = entry?._meta;
  if (!meta) return false;

  const modeCooldown = meta.cooldowns?.[gameType];
  const modeUntil = modeCooldown?.until ? new Date(modeCooldown.until).getTime() : NaN;
  if (Number.isFinite(modeUntil) && modeUntil > Date.now()) return true;

  if (!meta.cooldownUntil) return false;
  if (meta.cooldownSourceGame && meta.cooldownSourceGame !== gameType) return false;
  const legacyUntil = new Date(meta.cooldownUntil).getTime();
  return Number.isFinite(legacyUntil) && legacyUntil > Date.now();
}

function clearExpiredCooldowns() {
  let changed = false;
  Object.keys(questionStats).forEach(id => {
    const meta = questionStats[id]?._meta;
    if (!meta) return;

    if (meta.cooldowns) {
      Object.keys(meta.cooldowns).forEach(gameType => {
        const until = new Date(meta.cooldowns[gameType]?.until).getTime();
        if (!Number.isFinite(until) || until <= Date.now()) {
          delete meta.cooldowns[gameType];
          changed = true;
        }
      });
      if (Object.keys(meta.cooldowns).length === 0) {
        delete meta.cooldowns;
      }
    }

    if (!meta.cooldownUntil) return;
    const legacyUntil = new Date(meta.cooldownUntil).getTime();
    if (!Number.isFinite(legacyUntil) || legacyUntil <= Date.now()) {
      delete meta.cooldownUntil;
      delete meta.cooldownSetAt;
      delete meta.cooldownSourceGame;
      changed = true;
    }
  });
  if (changed) saveQuestionStats();
}

function getAvailableQuestionsForGame(questionsArr, gameType) {
  if (settings.fastCorrectCooldownEnabled === false) return [...questionsArr];
  return questionsArr.filter(q => !isQuestionOnCooldown(q, gameType));
}

function applyFastCorrectCooldown(questionId, gameType, days) {
  const now = Date.now();
  const meta = getQuestionMeta(questionId);
  if (!meta.cooldowns) meta.cooldowns = {};
  meta.cooldowns[gameType] = {
    setAt: new Date(now).toISOString(),
    until: new Date(now + days * MS_PER_DAY).toISOString()
  };
  delete meta.cooldownSetAt;
  delete meta.cooldownUntil;
  delete meta.cooldownSourceGame;
  saveQuestionStats();
  return true;
}

function openFastCorrectCooldownModal(questionId, gameType, days, onClose) {
  const modal = document.getElementById('fast-correct-cooldown-modal');
  const message = document.getElementById('fast-correct-cooldown-message');
  const confirmBtn = document.getElementById('fast-correct-cooldown-confirm');
  const cancelBtn = document.getElementById('fast-correct-cooldown-cancel');
  if (!modal || !message || !confirmBtn || !cancelBtn) {
    return false;
  }

  const label = days === 1 ? '1 day' : `${days} days`;
  pendingFastCorrectCooldown = { questionId, gameType, days, onClose };
  message.textContent = `You answered this question quickly. Hide it for the next ${label}?`;

  confirmBtn.onclick = () => closeFastCorrectCooldownModal(true);
  cancelBtn.onclick = () => closeFastCorrectCooldownModal(false);
  modal.classList.remove('hidden');
  confirmBtn.focus();
  return true;
}

function closeFastCorrectCooldownModal(accepted) {
  const modal = document.getElementById('fast-correct-cooldown-modal');
  const pending = pendingFastCorrectCooldown;
  pendingFastCorrectCooldown = null;

  if (modal) modal.classList.add('hidden');
  if (!pending) return false;

  const applied = accepted
    ? applyFastCorrectCooldown(pending.questionId, pending.gameType, pending.days)
    : false;
  if (typeof pending.onClose === 'function') {
    pending.onClose(applied);
  }
  return applied;
}

function maybeApplyFastCorrectCooldown(questionId, gameType, responseTime, onClose) {
  if (settings.fastCorrectCooldownEnabled === false) return false;
  if (!FAST_CORRECT_GAME_TYPES.includes(gameType)) return false;
  if (responseTime === undefined || responseTime === null) return false;
  if (pendingFastCorrectCooldown) return false;

  if (responseTime > getFastCorrectThresholdMs()) return false;

  const stats = getQuestionStatsEntry(questionId, false)?.[gameType];
  if (getEffectiveIncorrect(stats) >= WEAK_FAST_CORRECT_THRESHOLD) return false;

  const days = Math.max(1, parseInt(settings.fastCorrectCooldownDays || 3, 10));
  return openFastCorrectCooldownModal(questionId, gameType, days, onClose);
}

function getPriorityScoreForQuestion(q, gameType, weights) {
  const stats = q ? getQuestionStatsEntry(q, false)?.[gameType] : null;
  
  const effectiveIncorrect = getEffectiveIncorrect(stats);
  const correctStreak = stats?.correctStreak || 0;
  const slowCorrectCount = stats?.slowCorrectCount || 0;
  const lastSeen = stats?.lastSeen ? new Date(stats.lastSeen) : null;
  
  let daysSinceLastSeen = MAX_DAYS;
  if (lastSeen) {
    const now = new Date();
    daysSinceLastSeen = Math.floor((now - lastSeen) / MS_PER_DAY);
    if (daysSinceLastSeen < 0) daysSinceLastSeen = 0;
    if (daysSinceLastSeen > MAX_DAYS) daysSinceLastSeen = MAX_DAYS;
  }
  
  const timeBonus = Math.min(daysSinceLastSeen * weights.timeSinceSeen, MAX_TIME_BONUS);
  const learningPenalty = correctStreak * weights.learning;
  const slowBonus = Math.min(slowCorrectCount * (weights.slowResponse || 0), 30);
  
  return (effectiveIncorrect * weights.incorrect) + timeBonus - learningPenalty + slowBonus;
}

function getPriorityScore(questionIndex, gameType, weights) {
  const q = questions[questionIndex];
  return getPriorityScoreForQuestion(q, gameType, weights);
}

function getWeights(gameType) {
  if (!settings.priority?.enabled) {
    return { incorrect: 0, timeSinceSeen: 0, learning: 0, slowResponse: 0 };
  }
  
  const perGame = settings.priority.perGame?.[gameType];
  if (perGame?.enabled === true || perGame?.enabled === 1) {
    return perGame;
  }
  
  return settings.priority.global || { incorrect: 5, timeSinceSeen: 3, learning: 2, slowResponse: 3 };
}

function getPrioritizedDeck(questionsArr, gameType) {
  clearExpiredCooldowns();
  const deckSource = getAvailableQuestionsForGame(questionsArr, gameType);
  if (deckSource.length === 0 && questionsArr.length > 0) {
    if (typeof showToast === 'function') {
      showToast('No questions available right now. Try another mode or come back later.', 'info');
    }
    return [];
  }

  const weights = getWeights(gameType);
  
  if (!weights.incorrect && !weights.timeSinceSeen && !weights.learning && !weights.slowResponse) {
    return shuffle([...deckSource]);
  }
  
  const scored = deckSource.map((q, index) => ({
    question: q,
    index: index,
    score: getPriorityScoreForQuestion(q, gameType, weights)
  }));
  
  let currentTotalWeight = scored.reduce((sum, item) => sum + Math.max(0, item.score) + 1, 0);
  
  const result = [];
  const tempIndices = [...Array(deckSource.length).keys()];
  
  while (tempIndices.length > 0 && result.length < deckSource.length) {
    let rand = Math.random() * currentTotalWeight;
    let selectedIdx = -1;
    
    for (let i = 0; i < scored.length; i++) {
      const item = scored[i];
      if (!tempIndices.includes(item.index)) continue;
      
      rand -= (Math.max(0, item.score) + 1);
      if (rand <= 0) {
        selectedIdx = item.index;
        break;
      }
    }
    
    if (selectedIdx === -1) {
      const available = tempIndices.filter(idx => 
        scored.find(s => s.index === idx && Math.max(0, s.score) + 1 > 0)
      );
      if (available.length > 0) {
        selectedIdx = available[Math.floor(Math.random() * available.length)];
      } else {
        selectedIdx = tempIndices[Math.floor(Math.random() * tempIndices.length)];
      }
    }
    
    result.push(deckSource[selectedIdx]);
    const removedItem = scored.find(s => s.index === selectedIdx);
    currentTotalWeight -= (Math.max(0, removedItem.score) + 1);
    tempIndices.splice(tempIndices.indexOf(selectedIdx), 1);
  }
  
  if (result.length === 0) {
    return shuffle([...deckSource]);
  }
  
  return result;
}

function handleEmptyGameDeck(gameType) {
  if (typeof showToast === 'function') {
    showToast('No questions available right now. Try another mode or come back later.', 'info');
  }
  if (typeof showScreen === 'function') {
    showScreen('screen-menu');
  }
  return true;
}

function updateQuestionStats(questionIdOrIndex, gameType, isCorrect, responseTime) {
  let id;
  if (typeof questionIdOrIndex === 'string') {
    id = getScopedQuestionId(questionIdOrIndex);
  } else {
    const q = questions[questionIdOrIndex];
    id = q ? getScopedQuestionId(q) : getScopedQuestionId(`q-${questionIdOrIndex}`);
  }
  if (!questionStats[id]) {
    questionStats[id] = {};
  }
  if (!questionStats[id][gameType]) {
    questionStats[id][gameType] = getDefaultQuestionTypeStats();
  }
  
  const stats = questionStats[id][gameType];
  stats.lastSeen = new Date().toISOString();
  stats.totalAttempts = (stats.totalAttempts || 0) + 1;
  
  if (!stats.incorrectHistory) stats.incorrectHistory = [];
  stats.incorrectHistory = cleanIncorrectHistory(stats.incorrectHistory);
  
  if (responseTime !== undefined) {
    const oldAvg = stats.avgResponseTime || 0;
    stats.avgResponseTime = oldAvg + (responseTime - oldAvg) / stats.totalAttempts;
  }
  
  if (isCorrect) {
    stats.correctStreak = (stats.correctStreak || 0) + 1;
    stats.correctCount = (stats.correctCount || 0) + 1;
    if (responseTime !== undefined && responseTime > getFastCorrectThresholdMs()) {
      stats.slowCorrectCount = (stats.slowCorrectCount || 0) + 1;
    }
    if (stats.correctStreak > 0 && stats.correctStreak % 3 === 0 && stats.incorrect > 0) {
      stats.incorrect = Math.max(0, stats.incorrect - 1);
      if (stats.incorrectHistory.length > 0) {
        stats.incorrectHistory.shift();
      }
    }
  } else {
    stats.incorrect = (stats.incorrect || 0) + 1;
    stats.correctStreak = 0;
    stats.incorrectHistory.push(new Date().toISOString());
  }
  
  saveQuestionStats();
}

/* ── SHUFFLE ANSWER OPTIONS ── */
function shuffleAnswerOptions(q) {
  if (!settings.shuffleAnswers) {
    return { options: [...q.a], correctIndex: q.c };
  }
  
  const indexed = q.a.map((ans, i) => ({ text: ans, wasCorrect: i === q.c }));
  const shuffled = shuffle(indexed);
  const options = shuffled.map(item => item.text);
  const correctIndex = shuffled.findIndex(item => item.wasCorrect);
  
  return { options, correctIndex };
}

/* ── LEVEL SYSTEM ── */
function getXpForLevel(level) {
  return Math.floor(XP_PER_LEVEL * Math.pow(LEVEL_XP_CURVE, level - 1));
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toString();
}

function normalizePlayerProgress() {
  if (playerLevel < 1) playerLevel = 1;
  if (playerHP < 0) playerHP = 0;
  if (playerEXP < 0) playerEXP = 0;

  let leveledUp = false;
  while (playerEXP >= getXpForLevel(playerLevel)) {
    playerEXP -= getXpForLevel(playerLevel);
    playerLevel++;
    leveledUp = true;
  }

  if (leveledUp) {
    showToast(`🎉 Level ${playerLevel}!`, 'ok');
  }

  if (playerHP <= 0) {
    if (playerLevel > 1) {
      playerLevel -= 1;
      playerHP = 100;
    } else {
      playerHP = 0;
    }
  }
}

/* ── SESSION HISTORY ── */
function recordSession(type, score, correct, wrong) {
  const session = {
    id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: type,
    score: score,
    correct: correct,
    wrong: wrong,
    timestamp: new Date().toISOString()
  };
  sessionHistory.unshift(session);
  if (sessionHistory.length > 20) {
    sessionHistory.pop();
  }
  saveSessionHistory();
}

/* ── DAILY STREAK ── */
let dailyStreak = {
  currentStreak: 0,
  lastPlayDate: null,
  longestStreak: 0,
  playDates: {}
};

function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getYesterdayDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadDailyStreak() {
  const stored = localStorage.getItem('jq_daily_streak');
  if (stored) {
    try {
      dailyStreak = { ...dailyStreak, ...JSON.parse(stored) };
    } catch (e) {
      dailyStreak = { currentStreak: 0, lastPlayDate: null, longestStreak: 0, playDates: {} };
    }
  }
}

function saveDailyStreak() {
  localStorage.setItem('jq_daily_streak', JSON.stringify(dailyStreak));
}

function recordPlayTime(minutes) {
  const today = getTodayDate();
  if (!dailyStreak.playDates[today]) {
    dailyStreak.playDates[today] = { minutes: 0, games: [] };
  }
  dailyStreak.playDates[today].minutes += minutes;
  saveDailyStreak();
  checkDailyStreak();
}

function checkDailyStreak() {
  const today = getTodayDate();
  const yesterday = getYesterdayDate();
  const todayData = dailyStreak.playDates[today];
  
  if (dailyStreak.lastPlayDate === today) return;
  
  if (todayData && todayData.minutes >= 5) {
    if (dailyStreak.lastPlayDate === yesterday) {
      dailyStreak.currentStreak++;
    } else if (dailyStreak.lastPlayDate !== today) {
      dailyStreak.currentStreak = 1;
    }
    dailyStreak.longestStreak = Math.max(dailyStreak.longestStreak, dailyStreak.currentStreak);
    dailyStreak.lastPlayDate = today;
    saveDailyStreak();
  }
}

/* ── STATS COMPUTATION ── */
function computeGameTypeStats() {
  const gameTypes = ['quiz', 'listen', 'flash', 'match', 'type', 'write'];
  const result = {};
  for (const t of gameTypes) {
    result[t] = { correct: 0, wrong: 0 };
  }
  
  questions.forEach((q) => {
    const stats = getQuestionStatsEntry(q, false);
    if (!stats) return;
    
    for (const gameType of gameTypes) {
      const typeStats = stats[gameType];
      if (!typeStats) continue;
      result[gameType].correct += typeStats.correctCount || 0;
      result[gameType].wrong += typeStats.incorrect || 0;
    }
  });
  
  return result;
}

function computeTotalStats() {
  const gameTypeStats = computeGameTypeStats();
  let totalCorrect = 0;
  let totalWrong = 0;
  
  for (const t of Object.values(gameTypeStats)) {
    totalCorrect += t.correct;
    totalWrong += t.wrong;
  }
  
  return { totalCorrect, totalWrong, gameTypeStats };
}
