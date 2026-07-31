// ================================================
// GAME 1: QUIZ
// ================================================

let quizDeck = [];
let quizIdx = 0;
let quizHP = 100;
let quizScore = 0;
let quizCombo = 0;
let quizTimeLeft = 0;
let quizTimerInterval = null;
let quizDelayTimeout = null;
let quizCorrect = 0;
let quizWrong = 0;
let quizCurrentCorrectIndex = null;
const QUIZ_RESUME_STORAGE_KEY = 'jq_resume_quiz';

function saveGameResumeState(type) {
  if (type === 'quiz' && typeof saveQuizResumeState === 'function') return saveQuizResumeState();
  if (type === 'listen' && typeof saveListenResumeState === 'function') return saveListenResumeState();
  if (type === 'flash' && typeof saveFlashResumeState === 'function') return saveFlashResumeState();
  if (type === 'match' && typeof saveMatchResumeState === 'function') return saveMatchResumeState();
  if (type === 'type' && typeof saveTypeResumeState === 'function') return saveTypeResumeState();
  if (type === 'write' && typeof saveWriteResumeState === 'function') return saveWriteResumeState();
  return false;
}

function loadGameResumeState(type) {
  if (type === 'quiz' && typeof loadQuizResumeState === 'function') return loadQuizResumeState();
  if (type === 'listen' && typeof loadListenResumeState === 'function') return loadListenResumeState();
  if (type === 'flash' && typeof loadFlashResumeState === 'function') return loadFlashResumeState();
  if (type === 'match' && typeof loadMatchResumeState === 'function') return loadMatchResumeState();
  if (type === 'type' && typeof loadTypeResumeState === 'function') return loadTypeResumeState();
  if (type === 'write' && typeof loadWriteResumeState === 'function') return loadWriteResumeState();
  return null;
}

function clearGameResumeState(type) {
  if (type === 'quiz' && typeof clearQuizResumeState === 'function') clearQuizResumeState();
  if (type === 'listen' && typeof clearListenResumeState === 'function') clearListenResumeState();
  if (type === 'flash' && typeof clearFlashResumeState === 'function') clearFlashResumeState();
  if (type === 'match' && typeof clearMatchResumeState === 'function') clearMatchResumeState();
  if (type === 'type' && typeof clearTypeResumeState === 'function') clearTypeResumeState();
  if (type === 'write' && typeof clearWriteResumeState === 'function') clearWriteResumeState();
}

function resumeGameFromState(type) {
  if (type === 'quiz' && typeof resumeQuizFromState === 'function') return resumeQuizFromState();
  if (type === 'listen' && typeof resumeListenFromState === 'function') return resumeListenFromState();
  if (type === 'flash' && typeof resumeFlashFromState === 'function') return resumeFlashFromState();
  if (type === 'match' && typeof resumeMatchFromState === 'function') return resumeMatchFromState();
  if (type === 'type' && typeof resumeTypeFromState === 'function') return resumeTypeFromState();
  if (type === 'write' && typeof resumeWriteFromState === 'function') return resumeWriteFromState();
  return false;
}

function createQuizResumeState() {
  if (!Array.isArray(quizDeck) || quizDeck.length === 0) return null;
  if (quizIdx >= quizDeck.length) return null;

  return {
    version: 1,
    id: `quiz-${Date.now()}`,
    type: 'quiz',
    activeSetId: activeSetId || 'set-default',
    savedAt: new Date().toISOString(),
    deck: quizDeck.map(q => ({ ...q })),
    idx: quizIdx,
    hp: quizHP,
    score: quizScore,
    combo: quizCombo,
    correct: quizCorrect,
    wrong: quizWrong,
    settingsSnapshot: {
      quizTimeLimit: settings.quizTimeLimit,
      quizTimerEnabled: settings.quizTimerEnabled,
      shuffleAnswers: settings.shuffleAnswers,
      questionLimitEnabled: settings.questionLimitEnabled,
      questionLimit: settings.questionLimit
    }
  };
}

function saveQuizResumeState() {
  const state = createQuizResumeState();
  if (!state) {
    clearQuizResumeState();
    return false;
  }
  localStorage.setItem(QUIZ_RESUME_STORAGE_KEY, JSON.stringify(state));
  return state;
}

function loadQuizResumeState() {
  try {
    const raw = localStorage.getItem(QUIZ_RESUME_STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state || state.version !== 1 || state.type !== 'quiz') return null;
    if (state.activeSetId !== (activeSetId || 'set-default')) return null;
    if (!Array.isArray(state.deck) || state.deck.length === 0) return null;
    if (!Number.isInteger(state.idx) || state.idx < 0 || state.idx >= state.deck.length) return null;
    return state;
  } catch (e) {
    clearQuizResumeState();
    return null;
  }
}

function clearQuizResumeState() {
  localStorage.removeItem(QUIZ_RESUME_STORAGE_KEY);
}

function resumeQuizFromState() {
  const state = loadQuizResumeState();
  if (!state) return false;

  quizDeck = state.deck.map(q => ({ ...q }));
  quizIdx = state.idx;
  quizHP = state.hp;
  quizScore = state.score;
  quizCombo = state.combo;
  quizCorrect = state.correct;
  quizWrong = state.wrong;
  quizTimeLeft = settings.quizTimeLimit;
  stopQuizTimer();
  clearQuizResumeState();
  showScreen('screen-quiz');
  renderQuiz();
  return true;
}

function startQuiz() {
  clearQuizResumeState();
  quizDeck = getPrioritizedDeck(questions, 'quiz').map(q => ({
    ...q,
    questionId: generateQuestionId(q)
  }));
  if (settings.questionLimitEnabled) {
    quizDeck = quizDeck.slice(0, settings.questionLimit);
  }
  if (quizDeck.length === 0) {
    handleEmptyGameDeck('quiz');
    return;
  }
  quizIdx = 0;
  quizHP = 100;
  quizScore = 0;
  quizCombo = 0;
  quizCorrect = 0;
  quizWrong = 0;
  quizTimeLeft = settings.quizTimeLimit;
  stopQuizTimer();
  showScreen('screen-quiz');
  renderQuiz();
}

function speakQuizWord() {
  if (quizIdx >= quizDeck.length) return;
  const q = quizDeck[quizIdx];
  speakJapanese(q.word, null);
}

let quizQuestionStartTime = 0;

function renderQuiz() {
  updateQuizHUD();
  if (settings.quizTimerEnabled) {
    startQuizTimer();
  } else {
    stopQuizTimer();
  }
  if (quizIdx >= quizDeck.length) {
    quizComplete();
    return;
  }
  const q = quizDeck[quizIdx];
  quizQuestionStartTime = Date.now();

  const questionEl = document.getElementById('quiz-question');
  const practiceBtn = document.getElementById('quiz-practice-writing');
  const speakBtn = document.getElementById('quiz-speak-btn');
  questionEl.innerHTML = q.q;
  if (practiceBtn) {
    questionEl.appendChild(practiceBtn);
    practiceBtn.classList.add('hidden');
    practiceBtn.classList.remove('practice-highlight');
  }
  if (speakBtn) {
    questionEl.appendChild(speakBtn);
    speakBtn.classList.add('hidden');
  }
  document.getElementById('quiz-progress').textContent = `${quizIdx + 1} / ${quizDeck.length}`;
  document.getElementById('quiz-explanation').classList.add('hidden');
  document.getElementById('quiz-next').classList.add('hidden');
  
  const grid = document.getElementById('quiz-choices');
  grid.innerHTML = '';
  
  const { options, correctIndex, translations } = shuffleAnswerOptions(q);
  quizCurrentCorrectIndex = correctIndex;
  options.forEach((ans, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = ans;
    if (translations && translations[i]) {
      btn.dataset.translation = translations[i];
    }
    btn.onclick = () => answerQuiz(i, btn, q, correctIndex);
    grid.appendChild(btn);
  });
}

// Reveals the per-choice translation (if any) beneath each answer button.
// Shared by answerQuiz (answered) and handleQuizTimeout (timed out) so both
// terminal states of a quiz question show the same translation UI.
function revealChoiceTranslations(allBtns) {
  allBtns.forEach(b => {
    if (b.dataset.translation && !b.querySelector('.choice-translation')) {
      const translationEl = document.createElement('span');
      translationEl.className = 'choice-translation';
      translationEl.textContent = b.dataset.translation;
      b.appendChild(translationEl);
    }
  });
}

function answerQuiz(chosen, btn, q, correctIndex) {
  stopQuizTimer();
  const responseTime = Date.now() - quizQuestionStartTime;
  const quizChoices = document.getElementById('quiz-choices');
  const allBtns = quizChoices ? quizChoices.querySelectorAll('.choice-btn') : document.querySelectorAll('.choice-btn');
  allBtns.forEach(b => { b.disabled = true; });
  revealChoiceTranslations(allBtns);
  const correct = chosen === correctIndex;

  if (allBtns[correctIndex]) {
    allBtns[correctIndex].classList.add('correct');
  }

  let cooldownPrompted = false;
  if (correct) {
    quizCombo++;
    quizCorrect++;
    const pts = Math.floor(BASE_XP_REWARD * Math.max(1, quizCombo) * 1.5);
    quizScore += pts;
    playerEXP += pts;
    updateQuestionStats(quizDeck[quizIdx].questionId, 'quiz', true, responseTime);
    cooldownPrompted = maybeApplyFastCorrectCooldown(quizDeck[quizIdx].questionId, 'quiz', responseTime, (applied) => {
      if (applied && quizIdx < quizDeck.length) {
        nextQuiz();
      } else {
        document.getElementById('quiz-next').classList.remove('hidden');
      }
    });
    showToast(`✅ Correct! +${pts} EXP 🔥 x${quizCombo}`, 'ok');
    showComboPopup(`+${pts} ⭐`, btn.getBoundingClientRect().left, btn.getBoundingClientRect().top);
  } else {
    btn.classList.add('wrong');
    quizCombo = 0;
    quizWrong++;
    if (!settings.disableGameOver) {
      quizHP = Math.max(0, quizHP - 20);
    }
    updateQuestionStats(quizDeck[quizIdx].questionId, 'quiz', false, responseTime);
    showToast('❌ Wrong!', 'err');
    document.getElementById('screen-quiz').classList.add('shake');
    setTimeout(() => document.getElementById('screen-quiz').classList.remove('shake'), 400);
    
    const practiceBtn = document.getElementById('quiz-practice-writing');
    if (practiceBtn) {
      practiceBtn.dataset.word = q.word;
      practiceBtn.dataset.romaji = q.romaji;
      practiceBtn.dataset.translation = q.translation;
      practiceBtn.classList.remove('hidden');
      practiceBtn.classList.add('practice-highlight');
    }
  }

  if (q.ex) {
    const exBox = document.getElementById('quiz-explanation');
    exBox.textContent = q.ex;
    exBox.classList.remove('hidden');
  }
  document.getElementById('quiz-next').classList.toggle('hidden', correct && cooldownPrompted);

  const speakBtn = document.getElementById('quiz-speak-btn');
  if (speakBtn) speakBtn.classList.remove('hidden');

  updateQuizHUD();

  if (!settings.disableGameOver && quizHP <= 0) {
    showToast('💀 Out of health! Game over.', 'err')
    gameOver(quizScore, quizCombo, 'quiz', quizCorrect, quizWrong, false);
  }
}

function nextQuiz() {
  quizIdx++;
  renderQuiz();
}

function quizComplete() {
  stopQuizTimer();
  clearQuizResumeState();
  if (!settings.disableGameOver) {
    playerHP = Math.max(0, playerHP - (100 - quizHP));
  }
  playerCombo = Math.max(playerCombo, quizCombo);
  gameOver(quizScore, quizCombo, 'quiz', quizCorrect, quizWrong, true);
  saveToStorage();
  showToast(`🎉 Complete! Score: ${quizScore}`, 'ok');
  if (gameStartTime) {
    const elapsed = (Date.now() - gameStartTime) / 60000;
    recordPlayTime(elapsed);
  }
  setTimeout(() => showScreen('screen-menu'), 800);
}

function updateQuizHUD() {
  document.getElementById('quiz-hp').textContent = quizHP;
  document.getElementById('quiz-score').textContent = quizScore;
  document.getElementById('quiz-combo').textContent = quizCombo;
  const timerEl = document.getElementById('quiz-timer');
  if (timerEl) {
    timerEl.textContent = settings.quizTimerEnabled ? String(quizTimeLeft).padStart(2, '0') : '--';
  }
  document.getElementById('quiz-hpbar').style.width = `${Math.max(0, quizHP)}%`;
}

function startQuizTimer() {
  stopQuizTimer();
  if (!settings.quizTimerEnabled) return;
  quizTimeLeft = settings.quizTimeLimit;
  updateQuizHUD();
  quizTimerInterval = setInterval(() => {
    quizTimeLeft = Math.max(0, quizTimeLeft - 1);
    updateQuizHUD();
    if (quizTimeLeft <= 0) {
      handleQuizTimeout();
    }
  }, 1000);
}

function clearQuizDelayTimeout() {
  if (quizDelayTimeout) {
    clearTimeout(quizDelayTimeout);
    quizDelayTimeout = null;
  }
}

function stopQuizTimer() {
  if (quizTimerInterval) {
    clearInterval(quizTimerInterval);
    quizTimerInterval = null;
  }
  clearQuizDelayTimeout();
}

function handleQuizTimeout() {
  stopQuizTimer();
  if (quizIdx >= quizDeck.length) return;

  const quizChoices = document.getElementById('quiz-choices');
  const allBtns = quizChoices ? quizChoices.querySelectorAll('.choice-btn') : document.querySelectorAll('.choice-btn');
  allBtns.forEach(b => b.disabled = true);
  revealChoiceTranslations(allBtns);

  document.getElementById('screen-quiz').classList.add('shake');
  setTimeout(() => document.getElementById('screen-quiz').classList.remove('shake'), 400);

  quizCombo = 0;
  if (!settings.disableGameOver) {
    quizHP = Math.max(0, quizHP - 20);
  }
  updateQuizHUD();

  const current = quizDeck[quizIdx];
  if (current) {
    // Highlight the SHUFFLED correct index (as rendered), not current.c
    // (the unshuffled index) — buttons may be in shuffled order.
    const correctBtnIndex = typeof quizCurrentCorrectIndex === 'number' ? quizCurrentCorrectIndex : current.c;
    if (allBtns[correctBtnIndex]) {
      allBtns[correctBtnIndex].classList.add('correct');
    }
    if (current.ex) {
      const exBox = document.getElementById('quiz-explanation');
      exBox.textContent = current.ex;
      exBox.classList.remove('hidden');
    }
  }
  document.getElementById('quiz-next').classList.remove('hidden');

  if (!settings.disableGameOver && quizHP <= 0) {
    showToast('Time\x27s up! Game over.', 'err');
    gameOver(quizScore, quizCombo, 'quiz', quizCorrect, quizWrong);
    // quizDelayTimeout = setTimeout(() => {
    //   quizComplete();
    //   quizDelayTimeout = null;
    // }, 900);
    return;
  }

  showToast('⏱ Time’s up! Wrong answer.', 'err');
  updateQuestionStats(quizDeck[quizIdx].questionId, 'quiz', false, undefined);
  quizWrong++;
  quizDelayTimeout = setTimeout(() => {
    quizDelayTimeout = null;
    quizIdx++;
    if (quizIdx >= quizDeck.length) {
      quizComplete();
    } else {
      renderQuiz();
    }
  }, 900);
}
