// ================================================
// GAME 4: MATCH
// ================================================

let matchCards = [];
let matchSelection = [];
let matchAttempts = 0;
let matchFound = 0;
let pairCount = 0;
let matchTimeLeft = 0;
let matchTimerInterval = null;
let matchActive = false;
let matchCorrect = 0;
let matchWrong = 0;
const MATCH_RESUME_STORAGE_KEY = 'jq_resume_match';

function createMatchResumeState() {
  if (!Array.isArray(matchCards) || matchCards.length === 0) return null;
  if (!matchActive && matchFound >= pairCount) return null;

  return {
    version: 1,
    id: `match-${Date.now()}`,
    type: 'match',
    activeSetId: activeSetId || 'set-default',
    savedAt: new Date().toISOString(),
    cards: matchCards.map(card => ({
      ...card,
      revealed: card.matched ? true : false,
      animating: false,
      revealedAt: null
    })),
    selection: [],
    attempts: matchAttempts,
    found: matchFound,
    pairCount,
    timeLeft: matchTimeLeft,
    active: matchActive,
    score: Math.round((matchFound / matchAttempts) || 0),
    correct: matchCorrect,
    wrong: matchWrong
  };
}

function saveMatchResumeState() {
  const state = createMatchResumeState();
  if (!state) {
    clearMatchResumeState();
    return false;
  }
  localStorage.setItem(MATCH_RESUME_STORAGE_KEY, JSON.stringify(state));
  return state;
}

function loadMatchResumeState() {
  try {
    const raw = localStorage.getItem(MATCH_RESUME_STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state || state.version !== 1 || state.type !== 'match') return null;
    if (state.activeSetId !== (activeSetId || 'set-default')) return null;
    if (!Array.isArray(state.cards) || state.cards.length === 0) return null;
    return state;
  } catch (e) {
    clearMatchResumeState();
    return null;
  }
}

function clearMatchResumeState() {
  localStorage.removeItem(MATCH_RESUME_STORAGE_KEY);
}

function resumeMatchFromState() {
  const state = loadMatchResumeState();
  if (!state) return false;

  matchCards = state.cards.map(card => ({
    ...card,
    revealed: card.matched ? true : false,
    animating: false,
    revealedAt: null
  }));
  matchSelection = [];
  matchAttempts = state.attempts;
  matchFound = state.found;
  pairCount = state.pairCount;
  matchTimeLeft = state.timeLeft;
  matchActive = state.active;
  matchCorrect = state.correct;
  matchWrong = state.wrong;
  clearMatchResumeState();
  showScreen('screen-match');
  renderMatchBoard();
  updateMatchHUD();
  startMatchTimer();
  return true;
}

function getMatchLabel(item) {
  return item.translation || item.romaji || item.word || item.q || '---';
}

function updateMatchHUD() {
  document.getElementById('match-found').textContent = matchFound;
  document.getElementById('match-attempts').textContent = matchAttempts;
  const timerEl = document.getElementById('match-timer');
  if (timerEl) timerEl.textContent = matchTimeLeft;
}

function startMatchTimer() {
  stopMatchTimer();
  if (matchTimeLeft <= 0) return;
  matchTimerInterval = setInterval(() => {
    if (!matchActive) {
      stopMatchTimer();
      return;
    }
    matchTimeLeft = Math.max(0, matchTimeLeft - 1);
    updateMatchHUD();
    if (matchTimeLeft <= 0) {
      endMatchByTime();
    }
  }, 1000);
}

function stopMatchTimer() {
  if (matchTimerInterval) {
    clearInterval(matchTimerInterval);
    matchTimerInterval = null;
  }
}

function endMatchByTime() {
  stopMatchTimer();
  clearMatchResumeState();
  matchActive = false;
  matchTimeLeft = 0;
  matchCards = matchCards.map(card => ({ ...card, revealed: true }));
  updateMatchHUD();
  renderMatchBoard();
  
  if (settings.disableGameOver) {
    showScreen('screen-menu');
  } else {
    showToast("⏱ Time's up!", 'err');
    setTimeout(() => {
      gameOver(Math.round((matchFound / matchAttempts) || 0), 0, 'match', matchCorrect, matchWrong);
    }, 1500);
  }
}

function renderMatchBoard() {
  const board = document.getElementById('match-board');
  board.innerHTML = matchCards.map(card => `
    <button class="tile-card ${card.revealed ? 'revealed ' : ''}${card.matched ? 'matched' : ''}${card.animating ? ' match-animation' : ''}"
      onclick="handleMatchCard('${card.cardId}')"
      ${card.revealed || card.matched || !matchActive ? 'disabled' : ''}>
      ${card.revealed || card.matched ? card.text : ' ? '}
    </button>`).join('');
}

function startMatch() {
  clearMatchResumeState();
  const prioritizedItems = getPrioritizedDeck(questions, 'match');
  let items = prioritizedItems;
  if (settings.questionLimitEnabled) {
    items = items.slice(0, settings.questionLimit);
  }
  if (items.length === 0) {
    handleEmptyGameDeck('match');
    return;
  }
  pairCount = Math.min(settings.matchPairCount || 6, items.length);
  const matchItems = items.slice(0, pairCount);
  matchCards = shuffle(matchItems.flatMap((item, index) => ([
    { cardId: `word-${index}`, pairId: index, kind: 'word', text: item.word, revealed: false, matched: false, animating: false, questionId: generateQuestionId(item) },
    { cardId: `label-${index}`, pairId: index, kind: 'label', text: getMatchLabel(item), revealed: false, matched: false, animating: false, questionId: generateQuestionId(item) }
  ])));
  matchSelection = [];
  matchAttempts = 0;
  matchFound = 0;
  matchCorrect = 0;
  matchWrong = 0;
  matchActive = true;
  matchTimeLeft = settings.matchTimeLimit;
  showScreen('screen-match');
  renderMatchBoard();
  updateMatchHUD();
  startMatchTimer();
}

function handleMatchCard(cardId) {
  const card = matchCards.find(c => c.cardId === cardId);
  if (!card || card.matched || card.revealed || matchSelection.length === 2 || !matchActive) return;
  card.revealed = true;
  card.revealedAt = Date.now();
  matchSelection.push(card);
  renderMatchBoard();

  if (matchSelection.length === 2) {
    matchAttempts++;
    updateMatchHUD();
    const [first, second] = matchSelection;
    if (first.pairId === second.pairId && first.kind !== second.kind) {
      first.matched = second.matched = true;
      first.animating = second.animating = true;
      renderMatchBoard();
      matchFound++;
      matchCorrect++;
      updateQuestionStats(first.questionId, 'match', true, Math.max(0, Date.now() - Math.min(first.revealedAt || Date.now(), second.revealedAt || Date.now())));
      matchSelection = [];
      showToast('✅ Correct match!', 'ok');
      updateMatchHUD();
      setTimeout(() => {
        first.animating = false;
        second.animating = false;
        renderMatchBoard();
      }, 600);
      if (matchFound === pairCount) {        
        stopMatchTimer();
        matchActive = false;
        clearMatchResumeState();
        gameOver(Math.round((matchFound / matchAttempts) || 0), 0, 'match', matchCorrect, matchWrong, true);
        setTimeout(() => showToast('🎉 Complete!', 'ok'), 300);
        saveToStorage();
        if (gameStartTime) {
          const elapsed = (Date.now() - gameStartTime) / 60000;
          recordPlayTime(elapsed);
        }
      }
    } else {
      matchWrong++;
      const responseTime = Math.max(0, Date.now() - Math.min(first.revealedAt || Date.now(), second.revealedAt || Date.now()));
      updateQuestionStats(first.questionId, 'match', false, responseTime);
      if (second.questionId !== first.questionId) {
        updateQuestionStats(second.questionId, 'match', false, responseTime);
      }
      setTimeout(() => {
        first.revealed = false;
        second.revealed = false;
        matchSelection = [];
        renderMatchBoard();
      }, 800);
    }
  }
}
