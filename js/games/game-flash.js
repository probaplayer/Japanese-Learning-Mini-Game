// ================================================
// GAME 2: FLASHCARD
// ================================================

function speakFlashWord() {
  if (flashIdx >= flashDeck.length) return;
  const q = flashDeck[flashIdx];
  speakJapanese(q.word, null);
}

let flashDeck = [];
let flashIdx = 0;
let flashKnown = 0;
let flashUnknown = 0;
const FLASH_RESUME_STORAGE_KEY = 'jq_resume_flash';


let flashQuestionStartTime = 0;

function createFlashResumeState() {
  if (!Array.isArray(flashDeck) || flashDeck.length === 0) return null;
  if (flashIdx >= flashDeck.length) return null;

  return {
    version: 1,
    id: `flash-${Date.now()}`,
    type: 'flash',
    activeSetId: activeSetId || 'set-default',
    savedAt: new Date().toISOString(),
    deck: flashDeck.map(q => ({ ...q })),
    idx: flashIdx,
    known: flashKnown,
    unknown: flashUnknown,
    score: flashKnown * 5,
    correct: flashKnown,
    wrong: flashUnknown
  };
}

function saveFlashResumeState() {
  const state = createFlashResumeState();
  if (!state) {
    clearFlashResumeState();
    return false;
  }
  localStorage.setItem(FLASH_RESUME_STORAGE_KEY, JSON.stringify(state));
  return state;
}

function loadFlashResumeState() {
  try {
    const raw = localStorage.getItem(FLASH_RESUME_STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state || state.version !== 1 || state.type !== 'flash') return null;
    if (state.activeSetId !== (activeSetId || 'set-default')) return null;
    if (!Array.isArray(state.deck) || state.deck.length === 0) return null;
    if (!Number.isInteger(state.idx) || state.idx < 0 || state.idx >= state.deck.length) return null;
    return state;
  } catch (e) {
    clearFlashResumeState();
    return null;
  }
}

function clearFlashResumeState() {
  localStorage.removeItem(FLASH_RESUME_STORAGE_KEY);
}

function resumeFlashFromState() {
  const state = loadFlashResumeState();
  if (!state) return false;

  flashDeck = state.deck.map(q => ({ ...q }));
  flashIdx = state.idx;
  flashKnown = state.known;
  flashUnknown = state.unknown;
  clearFlashResumeState();
  showScreen('screen-flash');
  renderCard();
  return true;
}

function startFlash() {
  clearFlashResumeState();
  flashDeck = getPrioritizedDeck(questions, 'flash').map(q => ({
    ...q,
    questionId: generateQuestionId(q)
  }));
  if (settings.questionLimitEnabled) {
    flashDeck = flashDeck.slice(0, settings.questionLimit);
  }
  if (flashDeck.length === 0) {
    handleEmptyGameDeck('flash');
    return;
  }
  flashIdx = 0;
  flashKnown = 0;
  flashUnknown = 0;
  showScreen('screen-flash');
  renderCard();
}

function renderCard() {
  updateFlashHUD();
  const card = document.getElementById('card-inner');
  card.classList.remove('flipped');
  document.getElementById('flash-actions').classList.add('hidden');

  const speakBtn = document.getElementById('flash-speak-btn');
  if (speakBtn) speakBtn.classList.add('hidden');

  if (flashIdx >= flashDeck.length) {
    flashComplete();
    return;
  }

  const q = flashDeck[flashIdx];
  flashQuestionStartTime = Date.now();
  document.getElementById('card-word').textContent = q.word;
  document.getElementById('card-reading').textContent = q.a[q.c];
  document.getElementById('card-explanation').textContent = q.ex || '';
}

function flipCard() {
  const card = document.getElementById('card-inner');
  if (card.classList.contains('flipped')) return;
  card.classList.add('flipped');
  document.getElementById('flash-actions').classList.remove('hidden');

  const speakBtn = document.getElementById('flash-speak-btn');
  if (speakBtn) speakBtn.classList.remove('hidden');
}

function markCard(level) {
  const responseTime = Date.now() - flashQuestionStartTime;
  const q = flashDeck[flashIdx];
  let cooldownPrompted = false;

  switch (level) {
    case 'new':
    case 'learning':
      flashUnknown++;
      updateQuestionStats(q.questionId, 'flash', false, responseTime);
      break;
    case 'familiar':
      flashKnown++;
      playerEXP += Math.floor(BASE_XP_REWARD * 1.5);
      updateQuestionStats(q.questionId, 'flash', true, responseTime);
      cooldownPrompted = maybeApplyFastCorrectCooldown(q.questionId, 'flash', responseTime, (applied) => {
        if (applied) {
          flashIdx++;
          renderCard();
        }
      });
      break;
    case 'mastered':
      flashKnown++;
      playerEXP += Math.floor(BASE_XP_REWARD * 2.5);
      updateQuestionStats(q.questionId, 'flash', true, responseTime);
      cooldownPrompted = maybeApplyFastCorrectCooldown(q.questionId, 'flash', responseTime, (applied) => {
        if (applied) {
          flashIdx++;
          renderCard();
        }
      });
      break;
  }
  if (cooldownPrompted) return;
  flashIdx++;
  renderCard();
}

function flashComplete() {
  clearFlashResumeState();
  gameOver(flashKnown * 5, 0, 'flash', flashKnown, flashUnknown, true);
  saveToStorage();
  showToast(`📚 Complete! ✅${flashKnown}  ❌${flashUnknown}`, 'ok');
  if (gameStartTime) {
    const elapsed = (Date.now() - gameStartTime) / 60000;
    recordPlayTime(elapsed);
  }
  setTimeout(() => showScreen('screen-menu'), 1000);
}

function updateFlashHUD() {
  document.getElementById('flash-known').textContent = flashKnown;
  document.getElementById('flash-unknown').textContent = flashUnknown;
  document.getElementById('flash-progress-txt').textContent = `${flashIdx}/${flashDeck.length}`;
  const pct = flashDeck.length ? (flashIdx / flashDeck.length * 100) : 0;
  document.getElementById('flash-bar').style.width = `${pct}%`;
}
