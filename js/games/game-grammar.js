// ================================================
// GAME 7: GRAMMAR SENTENCE BUILDER
// ================================================

let grammarDeck = [];
let grammarIdx = 0;
let grammarHP = 100;
let grammarScore = 0;
let grammarCombo = 0;
let grammarCorrect = 0;
let grammarWrong = 0;
let grammarTimeLeft = 0;
let grammarTimerInterval = null;
let grammarDelayTimeout = null;
let grammarAnswer = [];
let grammarPoolChunks = [];
let grammarQuestionStartTime = 0;
let grammarDragState = null;
let grammarAnswered = false;
const GRAMMAR_RESUME_STORAGE_KEY = 'jq_resume_grammar';

function isGrammarAnswerCorrect(submitted, correct) {
  if (submitted.length !== correct.length) return false;
  return submitted.every((chunk, i) => chunk === correct[i]);
}

function createGrammarResumeState() {
  if (!Array.isArray(grammarDeck) || grammarDeck.length === 0) return null;
  if (grammarIdx >= grammarDeck.length) return null;

  // The current question has already been graded this render (correct or wrong)
  // but the player left before pressing "Next" / before auto-advance fired.
  // Persisting grammarIdx/grammarAnswer as-is would resume onto an
  // already-scored question (in the wrong-answer case, with the full correct
  // order already placed and re-triggerable) — advance the resume pointer
  // past it instead, as if "Next" had already been pressed.
  const resumeIdx = grammarAnswered ? grammarIdx + 1 : grammarIdx;
  if (resumeIdx >= grammarDeck.length) return null;

  return {
    version: 1,
    id: `grammar-${Date.now()}`,
    type: 'grammar',
    activeSetId: activeSetId || 'set-default',
    savedAt: new Date().toISOString(),
    deck: grammarDeck.map(q => ({ ...q })),
    idx: resumeIdx,
    hp: grammarHP,
    score: grammarScore,
    combo: grammarCombo,
    correct: grammarCorrect,
    wrong: grammarWrong,
    answer: grammarAnswered ? [] : [...grammarAnswer]
  };
}

function saveGrammarResumeState() {
  const state = createGrammarResumeState();
  if (!state) {
    clearGrammarResumeState();
    return false;
  }
  localStorage.setItem(GRAMMAR_RESUME_STORAGE_KEY, JSON.stringify(state));
  return state;
}

function loadGrammarResumeState() {
  try {
    const raw = localStorage.getItem(GRAMMAR_RESUME_STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state || state.version !== 1 || state.type !== 'grammar') return null;
    if (state.activeSetId !== (activeSetId || 'set-default')) return null;
    if (!Array.isArray(state.deck) || state.deck.length === 0) return null;
    if (!Number.isInteger(state.idx) || state.idx < 0 || state.idx >= state.deck.length) return null;
    return state;
  } catch (e) {
    clearGrammarResumeState();
    return null;
  }
}

function clearGrammarResumeState() {
  localStorage.removeItem(GRAMMAR_RESUME_STORAGE_KEY);
}

function resumeGrammarFromState() {
  const state = loadGrammarResumeState();
  if (!state) return false;

  grammarDeck = state.deck.map(q => ({ ...q }));
  grammarIdx = state.idx;
  grammarHP = state.hp;
  grammarScore = state.score;
  grammarCombo = state.combo;
  grammarCorrect = state.correct;
  grammarWrong = state.wrong;
  grammarAnswer = Array.isArray(state.answer) ? [...state.answer] : [];
  stopGrammarTimer();
  clearGrammarResumeState();
  showScreen('screen-grammar');
  renderGrammar(true);
  return true;
}

function startGrammar() {
  clearGrammarResumeState();
  stopGrammarTimer();
  grammarDeck = getPrioritizedDeck(questions, 'grammar').map(q => ({
    ...q,
    questionId: generateQuestionId(q)
  }));
  if (settings.questionLimitEnabled) {
    grammarDeck = grammarDeck.slice(0, settings.questionLimit);
  }
  if (grammarDeck.length === 0) {
    handleEmptyGameDeck('grammar');
    return;
  }
  grammarIdx = 0;
  grammarHP = 100;
  grammarScore = 0;
  grammarCombo = 0;
  grammarCorrect = 0;
  grammarWrong = 0;
  grammarAnswer = [];
  showScreen('screen-grammar');
  renderGrammar(false);
}

function renderGrammar(resuming) {
  const container = document.getElementById('screen-grammar');
  if (!container) return;

  if (grammarIdx >= grammarDeck.length) {
    return grammarComplete();
  }

  grammarAnswered = false;
  const q = grammarDeck[grammarIdx];
  grammarQuestionStartTime = Date.now();
  document.getElementById('grammar-progress').textContent = `${grammarIdx + 1} / ${grammarDeck.length}`;
  document.getElementById('grammar-translation').textContent = q.translation || '';
  document.getElementById('grammar-explanation').classList.add('hidden');
  document.getElementById('grammar-next').classList.add('hidden');

  if (!resuming) {
    grammarAnswer = [];
  }

  const remaining = [...q.chunks];
  grammarAnswer.forEach(chunk => {
    const pos = remaining.indexOf(chunk);
    if (pos !== -1) remaining.splice(pos, 1);
  });
  grammarPoolChunks = shuffle(remaining);

  updateGrammarHUD();
  if (settings.quizTimerEnabled) {
    startGrammarTimer();
  } else {
    stopGrammarTimer();
  }

  renderGrammarChips();
}

function renderGrammarChips() {
  const pool = document.getElementById('grammar-pool');
  const answerRow = document.getElementById('grammar-answer-row');
  pool.innerHTML = '';
  answerRow.innerHTML = '';

  grammarPoolChunks.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-btn grammar-chip';
    btn.textContent = text;
    btn.onclick = () => moveChunkToAnswer(i);
    pool.appendChild(btn);
  });

  grammarAnswer.forEach((text) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-btn grammar-chip grammar-chip-placed';
    btn.textContent = text;
    btn.onclick = () => moveChunkToPool(Array.from(answerRow.children).indexOf(btn));
    attachGrammarDragHandlers(btn);
    answerRow.appendChild(btn);
  });
}

function moveChunkToAnswer(poolIndex) {
  const [text] = grammarPoolChunks.splice(poolIndex, 1);
  grammarAnswer.push(text);
  renderGrammarChips();
  if (grammarAnswer.length === grammarDeck[grammarIdx].chunks.length) {
    checkGrammarAnswer();
  }
}

function moveChunkToPool(answerIndex) {
  const [text] = grammarAnswer.splice(answerIndex, 1);
  grammarPoolChunks.push(text);
  renderGrammarChips();
}

function attachGrammarDragHandlers(btn) {
  btn.addEventListener('pointerdown', (e) => {
    grammarDragState = { pointerId: e.pointerId };
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('dragging');
  });
  btn.addEventListener('pointermove', (e) => {
    if (!grammarDragState || grammarDragState.pointerId !== e.pointerId) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const targetChip = target ? target.closest('.grammar-chip-placed') : null;
    if (!targetChip || targetChip === btn) return;
    const answerRow = document.getElementById('grammar-answer-row');
    const children = Array.from(answerRow.children);
    const fromIndex = children.indexOf(btn);
    const toIndex = children.indexOf(targetChip);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    if (fromIndex < toIndex) {
      answerRow.insertBefore(btn, targetChip.nextSibling);
    } else {
      answerRow.insertBefore(btn, targetChip);
    }
    grammarAnswer = Array.from(answerRow.children).map(el => el.textContent);
  });
  const endDrag = (e) => {
    if (!grammarDragState || grammarDragState.pointerId !== e.pointerId) return;
    btn.classList.remove('dragging');
    grammarDragState = null;
  };
  btn.addEventListener('pointerup', endDrag);
  btn.addEventListener('pointercancel', endDrag);
}

function checkGrammarAnswer() {
  grammarAnswered = true;
  stopGrammarTimer();
  const q = grammarDeck[grammarIdx];
  const responseTime = Date.now() - grammarQuestionStartTime;
  const correct = isGrammarAnswerCorrect(grammarAnswer, q.chunks);

  document.querySelectorAll('.grammar-chip').forEach(b => { b.disabled = true; });

  let cooldownPrompted = false;
  if (correct) {
    grammarCombo++;
    grammarCorrect++;
    const points = Math.floor(BASE_XP_REWARD * Math.max(1, grammarCombo) * 1.5);
    grammarScore += points;
    playerEXP += points;
    updateQuestionStats(q.questionId, 'grammar', true, responseTime);
    cooldownPrompted = maybeApplyFastCorrectCooldown(q.questionId, 'grammar', responseTime, (applied) => {
      if (applied && grammarIdx < grammarDeck.length) {
        nextGrammar();
      } else {
        document.getElementById('grammar-next').classList.remove('hidden');
      }
    });
    showToast(`✅ Correct! +${points} EXP`, 'ok');
  } else {
    if (!settings.disableGameOver) {
      grammarHP = Math.max(0, grammarHP - 20);
    }
    grammarCombo = 0;
    grammarWrong++;
    updateQuestionStats(q.questionId, 'grammar', false, responseTime);
    showToast('❌ Wrong order!', 'err');
    document.getElementById('screen-grammar').classList.add('shake');
    setTimeout(() => document.getElementById('screen-grammar').classList.remove('shake'), 400);
    grammarAnswer = [...q.chunks];
    grammarPoolChunks = [];
    renderGrammarChips();
    document.querySelectorAll('.grammar-chip').forEach(b => { b.disabled = true; });
  }

  const explanation = document.getElementById('grammar-explanation');
  explanation.textContent = q.ex ? `${q.sentence} — ${q.ex}` : q.sentence;
  explanation.classList.remove('hidden');
  document.getElementById('grammar-next').classList.toggle('hidden', correct && cooldownPrompted);
  updateGrammarHUD();

  if (grammarHP <= 0) {
    setTimeout(() => {
      showToast('💀 Out of health! Game over.', 'err');
      showGrammarGameOver();
    }, 1000);
  }
}

function nextGrammar() {
  grammarIdx++;
  if (grammarIdx < grammarDeck.length) {
    renderGrammar(false);
  } else {
    grammarComplete();
  }
}

function updateGrammarHUD() {
  document.getElementById('grammar-score').textContent = grammarScore;
  document.getElementById('grammar-combo').textContent = grammarCombo;
  const timerEl = document.getElementById('grammar-timer');
  if (timerEl) {
    timerEl.textContent = settings.quizTimerEnabled ? String(grammarTimeLeft).padStart(2, '0') : '--';
  }
  document.getElementById('grammar-hpbar').style.width = `${Math.max(0, grammarHP)}%`;
}

function startGrammarTimer() {
  stopGrammarTimer();
  if (!settings.quizTimerEnabled) return;
  grammarTimeLeft = settings.quizTimeLimit;
  updateGrammarHUD();
  grammarTimerInterval = setInterval(() => {
    grammarTimeLeft = Math.max(0, grammarTimeLeft - 1);
    updateGrammarHUD();
    if (grammarTimeLeft <= 0) {
      handleGrammarTimeout();
    }
  }, 1000);
}

function clearGrammarDelayTimeout() {
  if (grammarDelayTimeout) {
    clearTimeout(grammarDelayTimeout);
    grammarDelayTimeout = null;
  }
}

function stopGrammarTimer() {
  if (grammarTimerInterval) {
    clearInterval(grammarTimerInterval);
    grammarTimerInterval = null;
  }
  clearGrammarDelayTimeout();
}

function handleGrammarTimeout() {
  stopGrammarTimer();
  if (grammarIdx >= grammarDeck.length) return;

  grammarAnswered = true;
  const q = grammarDeck[grammarIdx];
  document.querySelectorAll('.grammar-chip').forEach(b => { b.disabled = true; });
  document.getElementById('screen-grammar').classList.add('shake');
  setTimeout(() => document.getElementById('screen-grammar').classList.remove('shake'), 400);

  grammarCombo = 0;
  grammarAnswer = [...q.chunks];
  grammarPoolChunks = [];
  renderGrammarChips();
  document.querySelectorAll('.grammar-chip').forEach(b => { b.disabled = true; });

  const explanation = document.getElementById('grammar-explanation');
  explanation.textContent = q.ex ? `${q.sentence} — ${q.ex}` : q.sentence;
  explanation.classList.remove('hidden');
  document.getElementById('grammar-next').classList.remove('hidden');

  if (!settings.disableGameOver) {
    grammarHP = Math.max(0, grammarHP - 20);
  }
  updateGrammarHUD();
  if (!settings.disableGameOver && grammarHP <= 0) {
    showToast('💀 Time’s up! Game over.', 'err');
    grammarDelayTimeout = setTimeout(() => {
      grammarDelayTimeout = null;
      showGrammarGameOver();
    }, 900);
    return;
  }

  showToast('⏱ Time’s up! Wrong answer.', 'err');
  updateQuestionStats(q.questionId, 'grammar', false, undefined);
  grammarWrong++;
  grammarDelayTimeout = setTimeout(() => {
    grammarDelayTimeout = null;
    nextGrammar();
  }, 900);
}

function grammarComplete() {
  stopGrammarTimer();
  clearGrammarResumeState();
  gameOver(grammarScore, grammarCombo, 'grammar', grammarCorrect, grammarWrong, true);
  playerCombo = Math.max(playerCombo, grammarCombo);
  saveToStorage();
  showToast(`🎉 Complete! Score: ${grammarScore}`, 'ok');
  if (gameStartTime) {
    const elapsed = (Date.now() - gameStartTime) / 60000;
    recordPlayTime(elapsed);
  }
  setTimeout(() => showScreen('screen-menu'), 800);
}

function showGrammarGameOver() {
  stopGrammarTimer();
  clearGrammarResumeState();
  gameOver(grammarScore, grammarCombo, 'grammar', grammarCorrect, grammarWrong);
  const el = document.getElementById('grammar-go-score');
  if (el) el.textContent = grammarScore;
  document.getElementById('grammar-gameover')?.classList.remove('hidden');
}

function restartGrammar() {
  document.getElementById('grammar-gameover')?.classList.add('hidden');
  startGrammar();
}
