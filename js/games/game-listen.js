// ================================================
// GAME 5: LISTENING QUIZ
// ================================================

let listenDeck = [];
let listenIdx = 0;
let listenHP = 100;
let listenScore = 0;
let listenCombo = 0;
let listenTimeLeft = 0;
let listenTimerInterval = null;
let listenDelayTimeout = null;
let listenCorrect = 0;
let listenWrong = 0;
const LISTEN_RESUME_STORAGE_KEY = 'jq_resume_listen';

function createListenResumeState() {
  if (!Array.isArray(listenDeck) || listenDeck.length === 0) return null;
  if (listenIdx >= listenDeck.length) return null;

  return {
    version: 1,
    id: `listen-${Date.now()}`,
    type: 'listen',
    activeSetId: activeSetId || 'set-default',
    savedAt: new Date().toISOString(),
    deck: listenDeck.map(q => ({ ...q })),
    idx: listenIdx,
    hp: listenHP,
    score: listenScore,
    combo: listenCombo,
    correct: listenCorrect,
    wrong: listenWrong
  };
}

function saveListenResumeState() {
  const state = createListenResumeState();
  if (!state) {
    clearListenResumeState();
    return false;
  }
  localStorage.setItem(LISTEN_RESUME_STORAGE_KEY, JSON.stringify(state));
  return state;
}

function loadListenResumeState() {
  try {
    const raw = localStorage.getItem(LISTEN_RESUME_STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state || state.version !== 1 || state.type !== 'listen') return null;
    if (state.activeSetId !== (activeSetId || 'set-default')) return null;
    if (!Array.isArray(state.deck) || state.deck.length === 0) return null;
    if (!Number.isInteger(state.idx) || state.idx < 0 || state.idx >= state.deck.length) return null;
    return state;
  } catch (e) {
    clearListenResumeState();
    return null;
  }
}

function clearListenResumeState() {
  localStorage.removeItem(LISTEN_RESUME_STORAGE_KEY);
}

function resumeListenFromState() {
  const state = loadListenResumeState();
  if (!state) return false;

  listenDeck = state.deck.map(q => ({ ...q }));
  listenIdx = state.idx;
  listenHP = state.hp;
  listenScore = state.score;
  listenCombo = state.combo;
  listenCorrect = state.correct;
  listenWrong = state.wrong;
  listenTimeLeft = settings.quizTimeLimit;
  stopListenTimer();
  clearListenResumeState();
  showScreen('screen-listen');
  renderListen();
  return true;
}

function startListen() {
  clearListenResumeState();
  stopListenTimer();
  listenDeck = getPrioritizedDeck(questions, 'listen').map(q => ({
    ...q,
    questionId: generateQuestionId(q)
  }));
  if (settings.questionLimitEnabled) {
    listenDeck = listenDeck.slice(0, settings.questionLimit);
  }
  if (listenDeck.length === 0) {
    handleEmptyGameDeck('listen');
    return;
  }
  listenIdx = 0;
  listenHP = 100;
  listenScore = 0;
  listenCombo = 0;
  listenCorrect = 0;
  listenWrong = 0;
  showScreen('screen-listen');
  renderListen();
}

let listenQuestionStartTime = 0;

function renderListen() {
  const container = document.getElementById('screen-listen');
  if (!container) return;

  if (listenIdx >= listenDeck.length) {
    return listenComplete();
  }

  const q = listenDeck[listenIdx];
  listenQuestionStartTime = Date.now();
  document.getElementById('listen-progress').textContent = `${listenIdx + 1} / ${listenDeck.length}`;
  document.getElementById('listen-audio-status').textContent = '';
  document.getElementById('listen-explanation').classList.add('hidden');
  document.getElementById('listen-next').classList.add('hidden');
  
  const practiceBtn = document.getElementById('listen-practice-writing');
  if (practiceBtn) {
    practiceBtn.classList.add('hidden');
    practiceBtn.classList.remove('practice-highlight');
  }
  
  updateListenHUD();
  if (settings.quizTimerEnabled) {
    startListenTimer();
  } else {
    stopListenTimer();
  }

  const choices = document.getElementById('listen-choices');
  choices.innerHTML = '';

  const { options, correctIndex } = shuffleAnswerOptions(q);
  options.forEach((answer, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-btn listen-choice-btn';
    btn.textContent = answer;
    btn.onclick = () => answerListen(index, btn, q, correctIndex);
    choices.appendChild(btn);
  });

  playListenAudio(q.word);
}

function playListenAudio(text) {
  const status = document.getElementById('listen-audio-status');
  if (!status) return;

  if (!text) {
    status.textContent = 'No audio text available.';
    return;
  }

  if (!('speechSynthesis' in window)) {
    status.textContent = 'Audio not supported in this browser.';
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.9;
  utterance.onstart = () => {
    status.textContent = '🔊 Playing audio...';
  };
  utterance.onend = () => {
    status.textContent = 'Listen to the Japanese word, then choose the correct reading.';
  };
  utterance.onerror = () => {
    status.textContent = '❌ Audio playback failed.';
  };
  window.speechSynthesis.speak(utterance);
}

function replayListenAudio() {
  if (listenIdx >= listenDeck.length) return;
  const q = listenDeck[listenIdx];
  playListenAudio(q.word);
}

function answerListen(choice, btn, q, correctIndex) {
  stopListenTimer();
  const responseTime = Date.now() - listenQuestionStartTime;
  const buttons = document.querySelectorAll('.listen-choice-btn');
  buttons.forEach(b => b.disabled = true);

  const isCorrect = choice === correctIndex;
  let cooldownPrompted = false;
  if (isCorrect) {
    btn.classList.add('correct');
    listenCombo++;
    listenCorrect++;
    const points = Math.floor(BASE_XP_REWARD * Math.max(1, listenCombo) * 1.5);
    listenScore += points;
    playerEXP += points;
    updateQuestionStats(listenDeck[listenIdx].questionId, 'listen', true, responseTime);
    cooldownPrompted = maybeApplyFastCorrectCooldown(listenDeck[listenIdx].questionId, 'listen', responseTime, (applied) => {
      if (applied && listenIdx < listenDeck.length) {
        nextListen();
      } else {
        document.getElementById('listen-next').classList.remove('hidden');
      }
    });
    showToast(`✅ Correct! +${points} EXP`, 'ok');
  } else {
    btn.classList.add('wrong');
    if (!settings.disableGameOver) {
      listenHP = Math.max(0, listenHP - 20);
    }
    listenCombo = 0;
    listenWrong++;
    updateQuestionStats(listenDeck[listenIdx].questionId, 'listen', false, responseTime);
    showToast('❌ Wrong answer!', 'err');
    document.getElementById('screen-listen').classList.add('shake');
    setTimeout(() => document.getElementById('screen-listen').classList.remove('shake'), 400);
    
    const practiceBtn = document.getElementById('listen-practice-writing');
    if (practiceBtn) {
      practiceBtn.dataset.word = q.word;
      practiceBtn.dataset.romaji = q.romaji;
      practiceBtn.dataset.translation = q.translation;
      practiceBtn.classList.remove('hidden');
      practiceBtn.classList.add('practice-highlight');
    }
  }

  const correctButton = buttons[correctIndex];
  if (correctButton) correctButton.classList.add('correct');

  const explanation = document.getElementById('listen-explanation');
  explanation.textContent = q.ex || q.translation || 'No explanation available.';
  explanation.classList.remove('hidden');
  document.getElementById('listen-next').classList.toggle('hidden', isCorrect && cooldownPrompted);
  document.getElementById('listen-score').textContent = listenScore;
  document.getElementById('listen-combo').textContent = listenCombo;
  document.getElementById('listen-hpbar').style.width = `${Math.max(0, listenHP)}%`;

  if (listenHP <= 0) {
    setTimeout(() => {
      showToast('💀 Out of health! Game over.', 'err');
      showListenGameOver();
    }, 1000);
  }
}

function clearListenDelayTimeout() {
  if (listenDelayTimeout) {
    clearTimeout(listenDelayTimeout);
    listenDelayTimeout = null;
  }
}

function stopListenTimer() {
  if (listenTimerInterval) {
    clearInterval(listenTimerInterval);
    listenTimerInterval = null;
  }
  clearListenDelayTimeout();
}

function startListenTimer() {
  stopListenTimer();
  if (!settings.quizTimerEnabled) return;
  listenTimeLeft = settings.quizTimeLimit;
  updateListenHUD();
  listenTimerInterval = setInterval(() => {
    listenTimeLeft = Math.max(0, listenTimeLeft - 1);
    updateListenHUD();
    if (listenTimeLeft <= 0) {
      handleListenTimeout();
    }
  }, 1000);
}

function updateListenHUD() {
  document.getElementById('listen-score').textContent = listenScore;
  document.getElementById('listen-combo').textContent = listenCombo;
  const timerEl = document.getElementById('listen-timer');
  if (timerEl) {
    timerEl.textContent = settings.quizTimerEnabled ? String(listenTimeLeft).padStart(2, '0') : '--';
  }
  document.getElementById('listen-hpbar').style.width = `${Math.max(0, listenHP)}%`;
}

function handleListenTimeout() {
  stopListenTimer();
  if (listenIdx >= listenDeck.length) return;

  listenCombo = 0;

  document.getElementById('screen-listen').classList.add('shake');
  setTimeout(() => document.getElementById('screen-listen').classList.remove('shake'), 400);


  const buttons = document.querySelectorAll('.listen-choice-btn');
  buttons.forEach(b => b.disabled = true);

  const q = listenDeck[listenIdx];
  const correctButton = buttons[q.c];
  if (correctButton) correctButton.classList.add('correct');

  const explanation = document.getElementById('listen-explanation');
  explanation.textContent = q.ex || q.translation || 'No explanation available.';
  explanation.classList.remove('hidden');
  document.getElementById('listen-next').classList.remove('hidden');

  if (!settings.disableGameOver) {
    listenHP = Math.max(0, listenHP - 20);
  }
  updateListenHUD();
  if (!settings.disableGameOver && listenHP <= 0) {
    showToast('💀 Time’s up! Game over.', 'err');
    listenDelayTimeout = setTimeout(() => {
      listenDelayTimeout = null;
      showListenGameOver();
    }, 900);
    return;
  }

  showToast('⏱ Time’s up! Wrong answer.', 'err');
  updateQuestionStats(listenDeck[listenIdx].questionId, 'listen', false, undefined);
  listenWrong++;
  listenDelayTimeout = setTimeout(() => {
    listenDelayTimeout = null;
    nextListen();
  }, 900);
}

function nextListen() {
  listenIdx++;
  if (listenIdx < listenDeck.length) {
    renderListen();
  } else {
    listenComplete();
  }
}

function listenComplete() {
  stopListenTimer();
  clearListenResumeState();
  gameOver(listenScore, listenCombo, 'listen', listenCorrect, listenWrong, true);
  playerCombo = Math.max(playerCombo, listenCombo);
  saveToStorage();
  showToast(`🎉 Complete! Score: ${listenScore}`, 'ok');
  if (gameStartTime) {
    const elapsed = (Date.now() - gameStartTime) / 60000;
    recordPlayTime(elapsed);
  }
  setTimeout(() => showScreen('screen-menu'), 800);
}

function showListenGameOver() {
  stopListenTimer();
  clearListenResumeState();
  gameOver(listenScore, listenCombo, 'listen', listenCorrect, listenWrong);
  const el = document.getElementById('listen-go-score');
  if (el) el.textContent = listenScore;
  document.getElementById('listen-gameover')?.classList.remove('hidden');
}

function restartListen() {
  document.getElementById('listen-gameover')?.classList.add('hidden');
  startListen();
}
