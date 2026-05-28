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


let flashQuestionStartTime = 0;

function startFlash() {
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
