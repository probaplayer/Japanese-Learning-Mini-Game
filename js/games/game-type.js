// ================================================
// GAME 3: FALLING TYPING
// ================================================

let typingLoop = null;
let fallingWords = [];
let typeHP = 100;
let typeScore = 0;
let typeCombo = 0;
let typeCorrect = 0;
let typeWrong = 0;
let typeInput = '';
let typeDeck = [];
let spawnTimer = 0;
let spawnInterval = 0;
let gameSpeed = 0;
let typeCanvas;
let typeCtx;
let canvasW = 0;
let canvasH = 0;
let isStartGame = false;
let typeQuestionStartTime = 0;
const TYPE_RESUME_STORAGE_KEY = 'jq_resume_type';

function createTypeResumeState() {
  if (!Array.isArray(typeDeck) || !Array.isArray(fallingWords)) return null;
  if (typeHP <= 0 && !settings.disableGameOver) return null;
  if (typeDeck.length === 0 && fallingWords.filter(w => !w.done).length === 0) return null;

  return {
    version: 1,
    id: `type-${Date.now()}`,
    type: 'type',
    activeSetId: activeSetId || 'set-default',
    savedAt: new Date().toISOString(),
    deck: typeDeck.map(q => ({ ...q })),
    fallingWords: fallingWords.filter(w => !w.done).map(w => ({ ...w, startedAt: Date.now() })),
    hp: typeHP,
    score: typeScore,
    combo: typeCombo,
    correct: typeCorrect,
    wrong: typeWrong,
    spawnTimer,
    spawnInterval,
    gameSpeed
  };
}

function saveTypeResumeState() {
  const state = createTypeResumeState();
  if (!state) {
    clearTypeResumeState();
    return false;
  }
  localStorage.setItem(TYPE_RESUME_STORAGE_KEY, JSON.stringify(state));
  return state;
}

function loadTypeResumeState() {
  try {
    const raw = localStorage.getItem(TYPE_RESUME_STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state || state.version !== 1 || state.type !== 'type') return null;
    if (state.activeSetId !== (activeSetId || 'set-default')) return null;
    if (!Array.isArray(state.deck) || !Array.isArray(state.fallingWords)) return null;
    return state;
  } catch (e) {
    clearTypeResumeState();
    return null;
  }
}

function clearTypeResumeState() {
  localStorage.removeItem(TYPE_RESUME_STORAGE_KEY);
}

function setupTypingCanvasForRun() {
  typeCanvas = document.getElementById('type-canvas');
  typeCtx = typeCanvas.getContext('2d');

  const rect = typeCanvas.getBoundingClientRect();
  typeCanvas.width = rect.width || 700;
  typeCanvas.height = rect.height || 380;
  canvasW = typeCanvas.width;
  canvasH = typeCanvas.height;

  document.getElementById('modal-gameover').classList.add('hidden');
  document.getElementById('type-target').textContent = '---';

  const inp = document.getElementById('type-input');
  inp.value = '';
  inp.focus();
  inp.oninput = onTypeInput;
}

function resumeTypeFromState() {
  const state = loadTypeResumeState();
  if (!state) return false;

  showScreen('screen-type');
  isStartGame = true;
  typeHP = state.hp;
  typeScore = state.score;
  typeCombo = state.combo;
  typeCorrect = state.correct;
  typeWrong = state.wrong;
  typeDeck = state.deck.map(q => ({ ...q }));
  fallingWords = state.fallingWords.map(w => ({ ...w, startedAt: Date.now(), done: false }));
  spawnTimer = state.spawnTimer;
  spawnInterval = state.spawnInterval;
  gameSpeed = state.gameSpeed;
  setupTypingCanvasForRun();
  clearTypeResumeState();
  if (typingLoop) cancelAnimationFrame(typingLoop);
  typingLoop = requestAnimationFrame(typeGameLoop);
  updateTypeHUD();
  return true;
}

function startTyping() {
  clearTypeResumeState();
  showScreen('screen-type');
  isStartGame = true;
  typeHP = 100;
  typeScore = 0;
  typeCombo = 0;
  typeCorrect = 0;
  typeWrong = 0;
  fallingWords = [];
  typeDeck = getPrioritizedDeck(questions, 'type').map((q) => ({ ...q, questionId: generateQuestionId(q) }));
  if (settings.questionLimitEnabled) {
    typeDeck = typeDeck.slice(0, settings.questionLimit);
  }
  if (typeDeck.length === 0) {
    handleEmptyGameDeck('type');
    return;
  }
  spawnTimer = 0;
  spawnInterval = getTypeSpawnInterval();
  gameSpeed = getTypeGameSpeed();

  typeCanvas = document.getElementById('type-canvas');
  typeCtx = typeCanvas.getContext('2d');

  const rect = typeCanvas.getBoundingClientRect();
  typeCanvas.width = rect.width || 700;
  typeCanvas.height = rect.height || 380;
  canvasW = typeCanvas.width;
  canvasH = typeCanvas.height;

  document.getElementById('modal-gameover').classList.add('hidden');
  document.getElementById('type-target').textContent = '—';

  const inp = document.getElementById('type-input');
  inp.value = '';
  inp.focus();
  inp.oninput = onTypeInput;

  if (typingLoop) cancelAnimationFrame(typingLoop);
  typingLoop = requestAnimationFrame(typeGameLoop);
  updateTypeHUD();
}

function getTypeTarget(w) {
  return w.romaji;
}

function spawnWord() {
  if (typeDeck.length === 0) typeDeck = getPrioritizedDeck(questions, 'type').map((q) => ({ ...q, questionId: generateQuestionId(q) }));
  if (typeDeck.length === 0) return;
  const q = typeDeck.pop();
  const x = Math.random() * (canvasW - 140) + 20;
  fallingWords.push({
    word: q.word,
    romaji: q.romaji,
    translation: q.translation || '',
    hint: getTypeHint(q),
    questionId: q.questionId,
    startedAt: Date.now(),
    x,
    y: -30,
    speed: gameSpeed + Math.random() * 0.4,
    color: pickColor(),
    done: false
  });
}

function pickColor() {
  const colors = ['#ffd60a', '#30d158', '#0a84ff', '#bf5af2', '#ff9f0a', '#64d2ff'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function getTypeSpawnInterval() {
  const map = { slow: 1200, medium: 900, fast: 600 };
  return map[settings.typeSpawnInterval] || 900;
}

function getTypeGameSpeed() {
  const map = { slow: 0.08, medium: 0.12, fast: 0.18 };
  return map[settings.typeGameSpeed] || 0.12;
}

function getTypeHint(q) {
  if (!settings.typeHintsEnabled) return '';
  if (q.translation) return q.translation;
  if (q.romaji) return wanakana.toHiragana(q.romaji.trim().toLowerCase());
  return '';
}

function getTypeModeLabel() {
  const map = { slow: 'Slow', medium: 'Medium', fast: 'Fast' };
  return map[settings.typeGameSpeed] || 'Medium';
}

function typeGameLoop() {
  if (typeHP <= 0 && !settings.disableGameOver) {
    gameOverTyping(typeScore, typeCombo);
    return;
  }

  const baseInterval = getTypeSpawnInterval();
  const baseSpeed = getTypeGameSpeed();
  spawnInterval = Math.max(220, baseInterval - Math.floor(typeScore / 50) * 10);
  if (isStartGame == true) {
    isStartGame = false;
    spawnInterval = 0;
  }

  gameSpeed = baseSpeed + Math.floor(typeScore / 100) * 0.05;

  spawnTimer++;
  if (spawnTimer >= spawnInterval) {
    spawnWord();
    spawnTimer = 0;
  }

  typeCtx.clearRect(0, 0, canvasW, canvasH);
  drawGrid();

  fallingWords = fallingWords.filter(w => !w.done);
  fallingWords.forEach(w => {
    w.y += w.speed;
    if (w.y > canvasH + 20) {
      const responseTime = Date.now() - (w.startedAt || Date.now());
      updateQuestionStats(w.questionId, 'type', false, responseTime);
      if (!settings.disableGameOver) {
        typeHP = Math.max(0, typeHP - 15);
        typeCombo = 0;
        typeWrong++;
        updateTypeHUD();
        shakeScreen();
        
        if (typeHP <= 0) {
          gameOverTyping(typeScore, typeCombo, false);
          return;
        }
      }
      w.done = true;
    } else {
      drawWord(w);
    }
  });

  typingLoop = requestAnimationFrame(typeGameLoop);
}

function drawGrid() {
  typeCtx.strokeStyle = 'rgba(42,42,74,.5)';
  typeCtx.lineWidth = 1;
  for (let x = 0; x < canvasW; x += 40) {
    typeCtx.beginPath();
    typeCtx.moveTo(x, 0);
    typeCtx.lineTo(x, canvasH);
    typeCtx.stroke();
  }
  typeCtx.strokeStyle = 'rgba(255,45,85,.35)';
  typeCtx.lineWidth = 2;
  typeCtx.setLineDash([8, 4]);
  typeCtx.beginPath();
  typeCtx.moveTo(0, canvasH - 40);
  typeCtx.lineTo(canvasW, canvasH - 40);
  typeCtx.stroke();
  typeCtx.setLineDash([]);
}

function drawWord(w) {
  typeCtx.save();
  const isTarget = fallingWords.indexOf(w) === 0;

  typeCtx.shadowColor = w.color;
  typeCtx.shadowBlur = isTarget ? 18 : 8;

  typeCtx.font = 'bold 22px "Noto Sans JP", sans-serif';
  typeCtx.fillStyle = w.color;
  typeCtx.fillText(w.word, w.x, w.y);

  typeCtx.shadowBlur = 4;
  if (settings.typeHintsEnabled && w.romaji) {
    typeCtx.font = '11px "Press Start 2P", monospace';
    typeCtx.fillStyle = 'rgba(200,200,255,.5)';
    typeCtx.fillText(w.romaji, w.x, w.y + 18);
  }

  if (w.hint && settings.typeHintsEnabled) {
    typeCtx.font = '9px "Press Start 2P", monospace';
    typeCtx.fillStyle = 'rgba(200,200,255,.3)';
    typeCtx.fillText(w.hint, w.x, w.y + 28);
  }

  typeCtx.restore();

  const target = fallingWords[0];
  if (!target) return;

  const displayText = target.word;
  document.getElementById('type-target').textContent = (target.hint && settings.typeHintsEnabled)
    ? `${displayText} — ${target.hint}`
    : displayText;
}

function onTypeInput(e) {
  const val = e.target.value.trim().toLowerCase();
  typeInput = val;

  const inp = document.getElementById('type-input');
  if (!val) {
    inp.className = '';
    return;
  }

  const target = fallingWords[0];
  if (!target) return;

  const targetRomaji = target.romaji;
  const inputHiragana = wanakana.toHiragana(val);
  const targetHiragana = wanakana.toHiragana(targetRomaji);
  
  if (inputHiragana === targetHiragana) {
    const responseTime = Date.now() - (target.startedAt || Date.now());
    typeCombo++;
    typeCorrect++;
    const pts = Math.floor(BASE_XP_REWARD * Math.max(1, typeCombo) * 1.5);
    typeScore += pts;
    playerEXP += pts;
    updateQuestionStats(target.questionId, 'type', true, responseTime);
    target.done = true;
    inp.value = '';
    inp.className = 'match-ok';
    setTimeout(() => inp.className = '', 300);
    showComboPopup(`+${pts} ${typeCombo > 1 ? 'x' + typeCombo : ''}`, target.x, target.y);
    if (typeCombo > 1) showToast('COMBO x' + typeCombo + '!', 'ok');
    updateTypeHUD();
  } else if (targetHiragana.startsWith(inputHiragana)) {
    inp.className = '';
  } else {
    inp.className = 'match-err';
  }
}

function updateTypeHUD() {
  document.getElementById('type-hp').textContent = typeHP;
  document.getElementById('type-score').textContent = typeScore;
  document.getElementById('type-combo').textContent = typeCombo;
  const modeEl = document.getElementById('type-mode');
  if (modeEl) modeEl.textContent = getTypeModeLabel();
  document.getElementById('type-hpbar').style.width = Math.max(0, typeHP) + '%';
}

function gameOverTyping(score, combo, completed = true) {
  cancelAnimationFrame(typingLoop);
  typingLoop = null;
  clearTypeResumeState();
  gameOver(score, combo, 'type', typeCorrect, typeWrong, completed);
  saveToStorage();
  if (gameStartTime) {
    const elapsed = (Date.now() - gameStartTime) / 60000;
    recordPlayTime(elapsed);
  }
}

function shakeScreen() {
  const el = document.getElementById('screen-type');
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 400);
}
