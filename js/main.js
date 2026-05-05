// ================================================
// 日本語 QUEST — Main Module
// ================================================

let questions = [];
let questionSets = [];
let activeSetId = null;
let playerHP = 100;
let playerEXP = 0;
let playerLevel = 1;
let playerCombo = 0;
let dataPage = 1;
const XP_PER_LEVEL = 500;
let questionStats = {};
let sessionHistory = [];
let currentScreen = '';
let currentGameType = null;
let settings = {
  quizTimerEnabled: false,
  quizTimeLimit: 20,
  typeGameSpeed: 'medium',
  typeSpawnInterval: 'medium',
  typeHintsEnabled: true,
  matchTimeLimit: 60,
  scanlinesEnabled: false,
  disableGameOver: false,
  animationEnabled: true,
  questionLimitEnabled: false,
  questionLimit: 20,
  shuffleAnswers: true,
  matchPairCount: 6,
  priority: {
    enabled: true,
    global: { incorrect: 8, timeSinceSeen: 3, learning: 2, slowResponse: 3 },
    perGame: {
      quiz: { enabled: null, incorrect: 8, timeSinceSeen: 3, learning: 2, slowResponse: 3 },
      listen: { enabled: null, incorrect: 8, timeSinceSeen: 3, learning: 2, slowResponse: 3 },
      flash: { enabled: null, incorrect: 8, timeSinceSeen: 3, learning: 2, slowResponse: 3 },
      match: { enabled: null, incorrect: 8, timeSinceSeen: 3, learning: 2, slowResponse: 3 },
      type: { enabled: null, incorrect: 8, timeSinceSeen: 3, learning: 2, slowResponse: 3 },
      write: { enabled: null, incorrect: 8, timeSinceSeen: 3, learning: 2, slowResponse: 3 }
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initStars();
  loadSettingsFromStorage();
  loadFromStorage();
  loadQuestionStats();
  loadSessionHistory();
  loadDailyStreak();
  applyScanlinesVisibility();
  updateAnimationBodyClass();
  
  const firebaseConfig = loadFirebaseConfig();
  if (firebaseConfig) {
    initializeFirebase(firebaseConfig);
    showFirebaseSetsButton(true);
  }
  
  updateMenuUI();
  showScreen('screen-menu');
});

/* ══════════════════════════════════════════════
   STARS BACKGROUND
══════════════════════════════════════════════ */
function initStars() {
  const canvas = document.getElementById('stars-bg');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    drawStars();
  });

  const stars = Array.from({ length: 160 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.4 + 0.2,
    a: Math.random(),
    speed: Math.random() * 0.02 + 0.005
  }));

  function drawStars() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => {
      s.a += s.speed;
      ctx.globalAlpha = 0.2 + 0.8 * Math.abs(Math.sin(s.a));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(drawStars);
  }
  drawStars();
}

/* ══════════════════════════════════════════════
   SCREEN MANAGEMENT
══════════════════════════════════════════════ */
function showScreen(id) {
  const prevScreen = currentScreen;
  currentScreen = id;
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const el = document.getElementById(id);
  el.style.display = 'flex';
  el.classList.add('active');
  if (prevScreen === 'screen-match' && id !== 'screen-match') {
    if (typeof stopMatchTimer === 'function') stopMatchTimer();
  }
  if (id === 'screen-data') {
    refreshQuestionSetUI();
    refreshDataPreview();
  }
  if (id === 'screen-menu') updateMenuUI();
  if (id === 'screen-settings') renderSettingsScreen();
  if (id === 'screen-stats') renderStatsScreen();
}

/* ══════════════════════════════════════════════
   MENU UI
══════════════════════════════════════════════ */
function updateMenuUI() {
  document.getElementById('menu-hp-val').textContent = playerHP;
  document.getElementById('menu-exp-val').textContent = `${formatNumber(playerEXP)}/${formatNumber(getXpForLevel(playerLevel))}`;
  document.getElementById('menu-hp').style.width = `${Math.max(0, playerHP)}%`;
  document.getElementById('menu-exp').style.width = `${Math.min(100, (playerEXP / getXpForLevel(playerLevel)) * 100)}%`;
  const levelEl = document.getElementById('menu-level');
  if (levelEl) levelEl.textContent = playerLevel;
  document.getElementById('menu-combo').textContent = playerCombo;
  document.getElementById('data-count').textContent = `${questions.length} loaded questions`;
  const streakEl = document.getElementById('menu-streak');
  if (streakEl) streakEl.textContent = dailyStreak.currentStreak;
}

/* ══════════════════════════════════════════════
   TOAST + COMBO POPUP
══════════════════════════════════════════════ */
let toastTimer;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast toast-${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2000);
}

function showComboPopup(text, x, y) {
  const el = document.createElement('div');
  el.className = 'combo-popup';
  el.textContent = text;
  el.style.left = (x || window.innerWidth / 2) + 'px';
  el.style.top = (y || window.innerHeight / 2) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

/* ══════════════════════════════════════════════
   GAME ROUTER
══════════════════════════════════════════════ */
function startGame(type) {
  if (questions.length === 0) {
    showToast('❌ No questions available! Please import data.', 'err');
    return;
  }
  gameStartTime = Date.now();
  if (type === 'quiz') startQuiz();
  if (type === 'listen') startListen();
  if (type === 'flash') startFlash();
  if (type === 'type') startTyping();
  if (type === 'match') startMatch();
  if (type === 'write') startWrite();
}

function exitGame() {
  if (typeof typingLoop !== 'undefined' && typingLoop) {
    cancelAnimationFrame(typingLoop);
    typingLoop = null;
  }
  if (typeof stopQuizTimer === 'function') {
    stopQuizTimer();
  }
  if (typeof stopListenTimer === 'function') {
    stopListenTimer();
  }
  if (gameStartTime) {
    const elapsed = (Date.now() - gameStartTime) / 60000;
    recordPlayTime(elapsed);
  }
  saveToStorage();
  document.getElementById('modal-gameover').classList.add('hidden');
  showScreen('screen-menu');
}

let gameStartTime = null;

/* ══════════════════════════════════════════════
   UTILS
 ══════════════════════════════════════════════ */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function speakJapanese(text, statusEl) {
  if (!text) return;
  if (!('speechSynthesis' in window)) {
    if (statusEl) statusEl.textContent = 'Audio not supported.';
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ══════════════════════════════════════════════
  GAME LOGIC
══════════════════════════════════════════════ */
const dictionaryGame = {
  'quiz': () => { restartGame(() => { startQuiz(); }); },
  'listen': () => { restartGame(() => { startListen(); }); },
  'flash': () => { restartGame(() => { startFlash(); }); },
  'type': () => { restartGame(() => { startTyping(); }); },
  'match': () => { restartGame(() => { startMatch(); }); },
  'write': () => { restartGame(() => { startWrite(); }); }
}

function gameOver(score, combo, type, correct, wrong, completed = false) {
  if (completed) {
    recordSession(type, score, correct, wrong);
    playerCombo = Math.max(playerCombo, combo);
    playerEXP += score;
    saveToStorage();
    return;
  }

  if (settings.disableGameOver) {
    playerCombo = Math.max(playerCombo, combo);
    playerEXP += score;
    saveToStorage();
    return;
  }

  playerHP = Math.max(0, playerHP - 30);
  playerCombo = Math.max(playerCombo, combo);
  playerEXP += score;
  saveToStorage();
  
  const goTitle = document.getElementById('go-title');
  if (goTitle) {
    goTitle.textContent = 'GAME OVER';
  }
  document.getElementById('go-score').textContent = score;
  document.getElementById('modal-gameover').classList.remove('hidden');

  const oldBtn_restart = document.getElementById("btn-restart");
  const newBtn_restart = oldBtn_restart.cloneNode(true);
  oldBtn_restart.replaceWith(newBtn_restart);

  document.getElementById('btn-restart').addEventListener('click', dictionaryGame[type]);
}

function restartGame(onRestart) {
  document.getElementById('modal-gameover').classList.add('hidden');
  if (onRestart) onRestart();
}

/* ══════════════════════════════════════════════
  STATS SCREEN
══════════════════════════════════════════════ */
function renderStatsScreen() {
  loadSessionHistory();
  const { totalCorrect, totalWrong, gameTypeStats } = computeTotalStats();
  const totalAnswers = totalCorrect + totalWrong;
  const overallAccuracy = totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0;
  
  const gameNames = { quiz: '📝 Quiz', listen: '🎧 Listening', flash: '🃏 Flashcard', match: '🧩 Match', type: '⌨ Falling Words', write: '✍️ Writing' };
  const gameColors = { quiz: '#0a84ff', listen: '#ff00c8', flash: '#bf5af2', match: '#ffd60a', type: '#ff2d55', write: '#30d158' };
  
  let gameTypeRows = '';
  for (const type of ['quiz', 'listen', 'flash', 'match', 'type', 'write']) {
    const stats = gameTypeStats[type] || { correct: 0, wrong: 0 };
    const typeTotal = stats.correct + stats.wrong;
    const typeAccuracy = typeTotal > 0 ? Math.round((stats.correct / typeTotal) * 100) : 0;
    const color = gameColors[type];
    
    gameTypeRows += `
      <tr>
        <td style="color: ${color}">${gameNames[type]}</td>
        <td style="color: #30d158">${stats.correct}</td>
        <td style="color: #ff2d55">${stats.wrong}</td>
        <td>${typeTotal}</td>
        <td>
          <div class="stats-accuracy-bar">
            <div class="stats-accuracy-fill" style="width: ${typeAccuracy}%; background: ${color}"></div>
          </div>
          <span class="stats-accuracy-text">${typeAccuracy}%</span>
        </td>
      </tr>`;
  }
  
  const historyEl = document.getElementById('stats-history');
  if (historyEl) {
    if (sessionHistory.length === 0) {
      historyEl.innerHTML = '<div class="stats-empty">No sessions recorded yet.</div>';
    } else {
      const sortedSessions = [...sessionHistory].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const gameIcons = { quiz: '📝', listen: '🎧', flash: '🃏', match: '🧩', type: '⌨', write: '✍️' };
      let historyHtml = '<div class="session-history-list">';
      sortedSessions.forEach(session => {
        const total = session.correct + session.wrong;
        const accuracy = total > 0 ? Math.round((session.correct / total) * 100) : 0;
        const date = new Date(session.timestamp);
        const formattedDate = date.toLocaleDateString('vi-VN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const icon = gameIcons[session.type] || '🎮';
        const accuracyColor = accuracy >= 80 ? '#30d158' : accuracy >= 50 ? '#ffd60a' : '#ff2d55';
        historyHtml += `
          <div class="session-history-item">
            <div class="session-history-icon">${icon}</div>
            <div class="session-history-info">
              <div class="session-history-type">${gameNames[session.type] || session.type}</div>
              <div class="session-history-date">${formattedDate}</div>
            </div>
            <div class="session-history-stats">
              <div class="session-history-score">+${session.score} ⭐</div>
              <div class="session-history-accuracy" style="color: ${accuracyColor}">${session.correct}/${total} (${accuracy}%)</div>
            </div>
          </div>`;
      });
      historyHtml += '</div>';
      historyEl.innerHTML = historyHtml;
    }
  }
  
  const summaryEl = document.getElementById('stats-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="stats-summary-grid">
        <div class="stats-summary-card">
          <div class="stats-summary-label">Total Answers</div>
          <div class="stats-summary-value">${totalAnswers}</div>
        </div>
        <div class="stats-summary-card stats-card-correct">
          <div class="stats-summary-label">Correct</div>
          <div class="stats-summary-value" style="color: #30d158">${totalCorrect}</div>
        </div>
        <div class="stats-summary-card stats-card-wrong">
          <div class="stats-summary-label">Wrong</div>
          <div class="stats-summary-value" style="color: #ff2d55">${totalWrong}</div>
        </div>
        <div class="stats-summary-card stats-card-accuracy">
          <div class="stats-summary-label">Accuracy Rate</div>
          <div class="stats-summary-value" style="color: ${overallAccuracy >= 80 ? '#30d158' : overallAccuracy >= 50 ? '#ffd60a' : '#ff2d55'}">${overallAccuracy}%</div>
          <div class="stats-accuracy-bar stats-summary-bar">
            <div class="stats-accuracy-fill" style="width: ${overallAccuracy}%; background: ${overallAccuracy >= 80 ? '#30d158' : overallAccuracy >= 50 ? '#ffd60a' : '#ff2d55'}"></div>
          </div>
        </div>
        <div class="stats-summary-card">
          <div class="stats-summary-label">Level</div>
          <div class="stats-summary-value">🔰 ${playerLevel}</div>
        </div>
        <div class="stats-summary-card">
          <div class="stats-summary-label">Best Combo</div>
          <div class="stats-summary-value">🔥 ${playerCombo}x</div>
        </div>
        <div class="stats-summary-card">
          <div class="stats-summary-label">Sessions Played</div>
          <div class="stats-summary-value">${sessionHistory.length}</div>
        </div>
        <div class="stats-summary-card">
          <div class="stats-summary-label">Current EXP</div>
          <div class="stats-summary-value">⭐ ${playerEXP}/${getXpForLevel(playerLevel)}</div>
        </div>
      </div>`;
  }
  
  const tableEl = document.getElementById('stats-game-types');
  if (tableEl) {
    tableEl.innerHTML = `
      <div class="table-scroll">
        <table class="stats-table">
          <thead>
            <tr>
              <th>Game Mode</th>
              <th>Correct</th>
              <th>Wrong</th>
              <th>Total</th>
              <th>Accuracy</th>
            </tr>
          </thead>
          <tbody>${gameTypeRows}</tbody>
        </table>
      </div>`;
  }
  
  const masteryEl = document.getElementById('stats-mastery');
  if (masteryEl) {
    let mastered = 0, learning = 0, newItems = 0;
    const gameTypes = ['quiz', 'listen', 'flash', 'match', 'type', 'write'];
    
    questions.forEach((q, index) => {
      const id = generateQuestionId(q);
      const stats = questionStats[id];
      if (!stats) {
        newItems++;
        return;
      }
      
      let highestLevel = 'new';
      let hasAnyAttempts = false;
      const levelOrder = { 'new': 0, 'learning': 1, 'familiar': 2, 'mastered': 3 };
      
      for (const gameType of gameTypes) {
        const typeStats = stats[gameType];
        if (typeStats && typeStats.totalAttempts > 0) {
          hasAnyAttempts = true;
          const effectiveIncorrect = getEffectiveIncorrect(typeStats);
          const level = getConfidenceLevel(typeStats.correctStreak || 0, effectiveIncorrect);
          if (levelOrder[level] > levelOrder[highestLevel]) {
            highestLevel = level;
          }
        }
      }
      
      if (hasAnyAttempts) {
        if (highestLevel === 'mastered') {
          mastered++;
        } else {
          learning++;
        }
      } else {
        newItems++;
      }
    });
    
    const totalQ = questions.length || 1;
    masteryEl.innerHTML = `
      <div class="stats-mastery-grid">
        <div class="stats-mastery-item">
          <div class="mastery-circle mastery-mastered" style="--progress: ${Math.round((mastered / totalQ) * 100)}">
            <span>${mastered}</span>
          </div>
          <div class="mastery-label">Mastered</div>
        </div>
        <div class="stats-mastery-item">
          <div class="mastery-circle mastery-learning" style="--progress: ${Math.round((learning / totalQ) * 100)}">
            <span>${learning}</span>
          </div>
          <div class="mastery-label">Learning</div>
        </div>
        <div class="stats-mastery-item">
          <div class="mastery-circle mastery-new" style="--progress: ${Math.round((newItems / totalQ) * 100)}">
            <span>${newItems}</span>
          </div>
          <div class="mastery-label">New</div>
        </div>
      </div>`;
  }
}
