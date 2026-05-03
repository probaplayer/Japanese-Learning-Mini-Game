// ================================================
// GAME 6: WRITING PRACTICE (Canvas-based)
// ================================================

let writeDeck = [];
let writeIdx = 0;
let writeHP = 100;
let writeScore = 0;
let writeCombo = 0;
let writeCorrect = 0;
let writeWrong = 0;
let writeQuestionStartTime = 0;
let writeUseFallback = false;

const BASE_XP_WRITE = 8;

let writeKanjiQueue = [];
let writeCurrentKanjiIdx = 0;

const CANVAS_INTERNAL_SIZE = 280;

function setupCanvasSize(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  canvas.width = CANVAS_INTERNAL_SIZE;
  canvas.height = CANVAS_INTERNAL_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, CANVAS_INTERNAL_SIZE, CANVAS_INTERNAL_SIZE);
}

function getKanjiChars(word) {
  return word.split('').filter(c => /[\u4e00-\u9faf]/.test(c));
}

// Patch KanjiCanvas to fill white background after erase (cross-browser consistency)
function patchKanjiCanvasWhiteBackground() {
  const originalErase = KanjiCanvas.erase;
  KanjiCanvas.erase = function(id) {
    originalErase(id);
    const ctx = KanjiCanvas['ctx_' + id];
    const w = KanjiCanvas['w_' + id];
    const h = KanjiCanvas['h_' + id];
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
  };

  const originalDeleteLast = KanjiCanvas.deleteLast;
  KanjiCanvas.deleteLast = function(id) {
    originalDeleteLast(id);
  };

  const originalRedraw = KanjiCanvas.redraw;
  KanjiCanvas.redraw = function(id) {
    const ctx = KanjiCanvas['ctx_' + id];
    const w = KanjiCanvas['w_' + id];
    const h = KanjiCanvas['h_' + id];
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    originalRedraw(id);
  };
}

function startWrite() {
  showScreen('screen-write');
  writeHP = 100;
  writeScore = 0;
  writeCombo = 0;
  writeCorrect = 0;
  writeWrong = 0;
  const rawDeck = getPrioritizedDeck(questions, 'write');
  if (settings.questionLimitEnabled) {
    writeDeck = rawDeck.slice(0, settings.questionLimit);
  } else {
    writeDeck = rawDeck;
  }
  
  writeKanjiQueue = [];
  let kanjiCount = 0;
  const maxKanji = settings.questionLimitEnabled ? settings.questionLimit : Infinity;
  
  writeDeck.forEach(q => {
    if (kanjiCount >= maxKanji) return;
    const kanjis = getKanjiChars(q.word);
    kanjis.forEach(k => {
      if (kanjiCount >= maxKanji) return;
      writeKanjiQueue.push({
        kanji: k,
        word: q.word,
        romaji: q.romaji,
        translation: q.translation,
        ex: q.ex || '',
        questionId: generateQuestionId(q)
      });
      kanjiCount++;
    });
  });
  
  writeIdx = 0;
  writeCurrentKanjiIdx = 0;
  writeUseFallback = false;
  document.getElementById('modal-gameover').classList.add('hidden');
  
  setupCanvasSize('writeCanvas');
  KanjiCanvas.init('writeCanvas');
  patchKanjiCanvasWhiteBackground();
  setupWriteKeyboardShortcuts();
  renderWrite();
}

function setupWriteKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const activeScreen = document.querySelector('.screen:not(.hidden)');
    if (!activeScreen || activeScreen.id !== 'screen-write') return;

    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      KanjiCanvas.deleteLast('writeCanvas');
    } else if (e.ctrlKey && e.key === 'e') {
      e.preventDefault();
      KanjiCanvas.erase('writeCanvas');
    }
  });
}

function renderWrite() {
  updateWriteHUD();
  
  if (writeKanjiQueue.length === 0) {
    writeComplete();
    return;
  }
  
  const current = writeKanjiQueue[writeCurrentKanjiIdx];
  writeQuestionStartTime = Date.now();
  
  document.getElementById('write-progress').textContent = `${writeCurrentKanjiIdx + 1} / ${writeKanjiQueue.length}`;
  document.getElementById('write-target-char').textContent = current.kanji || '?';
  
  document.getElementById('write-hint-word').textContent = current.word || '---';
  document.getElementById('write-hint-ex').textContent = current.ex || 'No explanation available';
  
  fetchAndDisplayWriteData(current.kanji, current.translation, current.romaji);
  
  KanjiCanvas.erase('writeCanvas');
  
  const feedback = document.getElementById('write-feedback');
  if (feedback) feedback.classList.add('hidden');
  const canvasControls = document.getElementById('write-canvas-controls');
  if (canvasControls) canvasControls.classList.remove('hidden');
  const postCheckControls = document.getElementById('write-post-check-controls');
  if (postCheckControls) postCheckControls.classList.add('hidden');
}

async function fetchAndDisplayWriteData(kanji, fallbackTranslation, fallbackRomaji) {
  const data = await fetchKanjiData(kanji);
  
  const englishMeaning = data && data.meanings && data.meanings.length > 0 ? data.meanings[0] : (fallbackTranslation || '---');
  writeEnglishMeaning = englishMeaning;
  document.getElementById('write-hint-translation').textContent = englishMeaning;
  
  const readings = [];
  if (data) {
    if (data.kun_readings && data.kun_readings.length > 0) {
      readings.push(...data.kun_readings);
    }
    if (data.on_readings && data.on_readings.length > 0) {
      readings.push(...data.on_readings);
    }
  }
  if (readings.length === 0) {
    readings.push(fallbackRomaji || '---');
  }
  document.getElementById('write-hint-romaji').textContent = readings.join(', ');
}

function showWriteHint() {
  document.getElementById('write-hint-popup').classList.remove('hidden');
}

function hideWriteHint() {
  document.getElementById('write-hint-popup').classList.add('hidden');
}

function toggleWriteHint() {
  const popup = document.getElementById('write-hint-popup');
  const btn = document.querySelector('.hint-btn');
  if (popup.classList.contains('hidden')) {
    popup.classList.remove('hidden');
    btn.classList.add('active');
  } else {
    popup.classList.add('hidden');
    btn.classList.remove('active');
  }
}

function checkWriteAnswer() {
  const current = writeKanjiQueue[writeCurrentKanjiIdx];
  const canvas = document.getElementById('writeCanvas');
  
  const hasStrokes = KanjiCanvas['recordedPattern_writeCanvas'] && 
                      KanjiCanvas['recordedPattern_writeCanvas'].length > 0;
  
  if (!hasStrokes) {
    showToast('Please draw something first!', 'err');
    return;
  }
  
  const i = KanjiCanvas.momentNormalize('writeCanvas');
  const e = KanjiCanvas.extractFeatures(i, 20);
  const s = KanjiCanvas.coarseClassification(e);
  const result = KanjiCanvas.fineClassification(e, s);
  
  const targetChar = current.kanji.trim();
  const matchIndex = result.split('').findIndex(c => c === targetChar);
  const matchPercent = matchIndex >= 0 ? Math.max(10, 100 - (matchIndex * 10)) : 0;
  
  const responseTime = Date.now() - writeQuestionStartTime;
  
  if (matchPercent >= 10) {
    writeCombo++;
    writeCorrect++;
    const pts = Math.floor(BASE_XP_WRITE * Math.max(1, writeCombo) * 1.5 * (matchPercent / 100));
    writeScore += pts;
    playerEXP += pts;
    updateQuestionStats(writeKanjiQueue[writeCurrentKanjiIdx].questionId, 'write', true, responseTime);
    
    let msg = `✓ ${matchPercent}% Match! +${pts} EXP`;
    if (matchIndex > 0) msg += ` (#${matchIndex + 1})`;
    if (writeCombo > 1) msg += ` 🔥 x${writeCombo}`;
    showToast(msg, 'ok');
  } else {
    writeCombo = 0;
    writeWrong++;
    if (!settings.disableGameOver) {
      writeHP = Math.max(0, writeHP - 20);
    }
    updateQuestionStats(writeKanjiQueue[writeCurrentKanjiIdx].questionId, 'write', false, responseTime);
    
    showToast('✗ Not recognized', 'err');
    
    const screenWrite = document.getElementById('screen-write');
    if (screenWrite) {
      screenWrite.classList.add('shake');
      setTimeout(() => screenWrite.classList.remove('shake'), 400);
    }
  }
  
  const canvasControls = document.getElementById('write-canvas-controls');
  if (canvasControls) canvasControls.classList.add('hidden');
  const postCheckControls = document.getElementById('write-post-check-controls');
  if (postCheckControls) postCheckControls.classList.remove('hidden');
  updateWriteHUD();
  
  if (!settings.disableGameOver && writeHP <= 0) {
    showToast('💀 Out of health!', 'err');
    gameOver(writeScore, writeCombo, 'write', writeCorrect, writeWrong, false);
    return;
  }
  
  if (writeCurrentKanjiIdx >= writeKanjiQueue.length - 1) {
    setTimeout(() => writeComplete(), 1500);
  }
}

function retryWrite() {
  const feedback = document.getElementById('write-feedback');
  if (feedback) feedback.classList.add('hidden');
  
  const canvasControls = document.getElementById('write-canvas-controls');
  if (canvasControls) canvasControls.classList.remove('hidden');
  const postCheckControls = document.getElementById('write-post-check-controls');
  if (postCheckControls) postCheckControls.classList.add('hidden');
  
  KanjiCanvas.erase('writeCanvas');
}

function nextWrite() {
  writeCurrentKanjiIdx++;
  if (writeCurrentKanjiIdx < writeKanjiQueue.length) {
    renderWrite();
  } else {
    writeComplete();
  }
  
  const canvasControls = document.getElementById('write-canvas-controls');
  if (canvasControls) canvasControls.classList.remove('hidden');
  const postCheckControls = document.getElementById('write-post-check-controls');
  if (postCheckControls) postCheckControls.classList.add('hidden');
}

function writeComplete() {
  gameOver(writeScore, writeCombo, 'write', writeCorrect, writeWrong, true);
  saveToStorage();
  showToast(`✍️ Complete! Score: ${writeScore}`, 'ok');
  if (gameStartTime) {
    const elapsed = (Date.now() - gameStartTime) / 60000;
    recordPlayTime(elapsed);
  }
  setTimeout(() => showScreen('screen-menu'), 800);
}

function updateWriteHUD() {
  document.getElementById('write-hp').textContent = writeHP;
  document.getElementById('write-score').textContent = writeScore;
  document.getElementById('write-combo').textContent = writeCombo;
  document.getElementById('write-hpbar').style.width = `${Math.max(0, writeHP)}%`;
  
  const uniqueWords = new Set(writeKanjiQueue.map(q => q.word)).size;
  document.getElementById('write-words').textContent = uniqueWords;
}

function skipWrite() {
  if (writeKanjiQueue.length === 0) return;
  
  writeCombo = 0;
  writeWrong++;
  if (!settings.disableGameOver) {
    writeHP = Math.max(0, writeHP - 20);
  }
  
  updateQuestionStats(writeKanjiQueue[writeCurrentKanjiIdx].questionId, 'write', false, 0);
  
  const current = writeKanjiQueue[writeCurrentKanjiIdx];
  showToast(`⏭️ Skipped: ${current.kanji}`, 'err');
  
  const screenWrite = document.getElementById('screen-write');
  if (screenWrite) {
    screenWrite.classList.add('shake');
    setTimeout(() => screenWrite.classList.remove('shake'), 400);
  }
  
  writeCurrentKanjiIdx++;
  if (writeCurrentKanjiIdx >= writeKanjiQueue.length) {
    writeComplete();
    return;
  }
  
  if (!settings.disableGameOver && writeHP <= 0) {
    showToast('💀 Out of health!', 'err');
    gameOver(writeScore, writeCombo, 'write', writeCorrect, writeWrong, false);
  } else {
    const canvasControls = document.getElementById('write-canvas-controls');
    if (canvasControls) canvasControls.classList.remove('hidden');
    const postCheckControls = document.getElementById('write-post-check-controls');
    if (postCheckControls) postCheckControls.classList.add('hidden');
    renderWrite();
  }
}

// ================================================
// PRACTICE MODAL (Canvas-based)
// ================================================

let practiceWriteWord = '';
let practiceWriteRomaji = '';
let practiceWriteTranslation = '';
let practiceUseFallback = false;
let practiceKanjiList = [];
let practiceCurrentIdx = 0;
let practiceEnglishMeaning = '';
let writeEnglishMeaning = '';

// ================================================
// KANJI API CACHE
// ================================================

function getKanjiCache() {
  try {
    return JSON.parse(localStorage.getItem('jq_kanji_cache') || '{}');
  } catch {
    return {};
  }
}

function setKanjiCache(kanji, data) {
  try {
    const cache = getKanjiCache();
    cache[kanji] = data;
    localStorage.setItem('jq_kanji_cache', JSON.stringify(cache));
  } catch (e) {
    console.warn('Failed to save kanji cache:', e);
  }
}

async function fetchKanjiData(kanji) {
  const cache = getKanjiCache();
  if (cache[kanji]) return cache[kanji];
  
  try {
    const res = await fetch(`https://kanjiapi.dev/v1/kanji/${kanji}`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    setKanjiCache(kanji, data);
    return data;
  } catch (e) {
    console.error('Kanji API error:', e);
    return null;
  }
}

async function showWritePracticeModal(word, romaji, translation) {
  practiceWriteWord = word;
  practiceWriteRomaji = romaji;
  practiceWriteTranslation = translation;
  practiceUseFallback = false;
  
  practiceKanjiList = getKanjiChars(word);
  practiceCurrentIdx = 0;
  
  // Initialize canvas FIRST to prevent erase error
  setupCanvasSize('practiceCanvas');
  KanjiCanvas.init('practiceCanvas');
  patchKanjiCanvasWhiteBackground();
  
  if (practiceKanjiList.length > 0) {
    await renderPracticeKanjiPage();
  } else {
    showToast('No kanji found in this word', 'err');
    document.getElementById('practice-target-char').textContent = word || '?';
    document.getElementById('practice-hint-translation').textContent = translation || '---';
    document.getElementById('practice-hint-romaji').textContent = romaji || '---';
    document.getElementById('practice-pagination').classList.add('hidden');
    KanjiCanvas.erase('practiceCanvas');
  }
  
  document.getElementById('practice-fallback').classList.add('hidden');
  document.getElementById('practice-candidates').classList.add('hidden');
  document.getElementById('practice-feedback').classList.add('hidden');
  
  const inp = document.getElementById('practice-write-input');
  inp.value = '';
  inp.disabled = false;
  
  document.getElementById('write-practice-modal').classList.remove('hidden');
}

async function renderPracticeKanjiPage() {
  const kanji = practiceKanjiList[practiceCurrentIdx];
  const data = await fetchKanjiData(kanji);
  
  document.getElementById('practice-target-char').textContent = kanji || '?';
  
  const englishMeaning = data && data.meanings && data.meanings.length > 0 ? data.meanings[0] : (practiceWriteTranslation || '---');
  practiceEnglishMeaning = englishMeaning;
  document.getElementById('practice-hint-translation').textContent = englishMeaning;
  
  const readings = [];
  if (data) {
    if (data.kun_readings && data.kun_readings.length > 0) {
      readings.push(...data.kun_readings);
    }
    if (data.on_readings && data.on_readings.length > 0) {
      readings.push(...data.on_readings);
    }
  }
  if (readings.length === 0) {
    readings.push(practiceWriteRomaji || '---');
  }
  document.getElementById('practice-hint-romaji').textContent = readings.join(', ');
  
  const pag = document.getElementById('practice-pagination');
  if (practiceKanjiList.length > 1) {
    pag.classList.remove('hidden');
    document.getElementById('practice-page-info').textContent = `${practiceCurrentIdx + 1} / ${practiceKanjiList.length}`;
  } else {
    pag.classList.add('hidden');
  }
  
  KanjiCanvas.erase('practiceCanvas');
}

async function nextPracticeKanji() {
  if (practiceCurrentIdx < practiceKanjiList.length - 1) {
    practiceCurrentIdx++;
    await renderPracticeKanjiPage();
  }
}

async function prevPracticeKanji() {
  if (practiceCurrentIdx > 0) {
    practiceCurrentIdx--;
    await renderPracticeKanjiPage();
  }
}

async function translateToVietnamese() {
  if (!practiceEnglishMeaning || practiceEnglishMeaning === '---') {
    showToast('No meaning to translate', 'err');
    return;
  }
  
  showToast('Translating...', 'ok');
  
  try {
    const encodedText = encodeURIComponent(practiceEnglishMeaning);
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodedText}&langpair=en|vi`);
    if (!res.ok) throw new Error('Translation API error');
    
    const data = await res.json();
    if (data.responseData && data.responseData.translatedText) {
      document.getElementById('practice-hint-translation').textContent = data.responseData.translatedText;
      showToast('Translated to Vietnamese', 'ok');
    } else {
      throw new Error('Invalid response');
    }
  } catch (e) {
    console.error('Translation error:', e);
    showToast('Translation failed', 'err');
  }
}

async function translateWriteMeaningToVietnamese() {
  if (!writeEnglishMeaning || writeEnglishMeaning === '---') {
    showToast('No meaning to translate', 'err');
    return;
  }
  
  showToast('Translating...', 'ok');
  
  try {
    const encodedText = encodeURIComponent(writeEnglishMeaning);
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodedText}&langpair=en|vi`);
    if (!res.ok) throw new Error('Translation API error');
    
    const data = await res.json();
    if (data.responseData && data.responseData.translatedText) {
      document.getElementById('write-hint-translation').textContent = data.responseData.translatedText;
      showToast('Translated to Vietnamese', 'ok');
    } else {
      throw new Error('Invalid response');
    }
  } catch (e) {
    console.error('Translation error:', e);
    showToast('Translation failed', 'err');
  }
}

function closeWritePracticeModal() {
  document.getElementById('write-practice-modal').classList.add('hidden');
}

function checkWritePracticeAnswer() {
  const currentKanji = practiceKanjiList[practiceCurrentIdx];
  
  if (practiceUseFallback) {
    checkWritePracticeFallback();
    return;
  }
  
  const canvas = document.getElementById('practiceCanvas');
  const candidates = document.getElementById('practice-candidates');
  
  const hasStrokes = KanjiCanvas['recordedPattern_practiceCanvas'] && 
                      KanjiCanvas['recordedPattern_practiceCanvas'].length > 0;
  
  if (!hasStrokes) {
    showToast('Please draw something first!', 'err');
    return;
  }
  
  const i = KanjiCanvas.momentNormalize('practiceCanvas');
  const e = KanjiCanvas.extractFeatures(i, 20);
  const s = KanjiCanvas.coarseClassification(e);
  const result = KanjiCanvas.fineClassification(e, s);
  
  const candidatesText = result || '';
  candidates.textContent = candidatesText;
  candidates.classList.remove('hidden');
  
  const targetChar = currentKanji.trim();
  const matchIndex = candidatesText.split('').findIndex(c => c === targetChar);
  const matchPercent = matchIndex >= 0 ? Math.max(10, 100 - (matchIndex * 10)) : 0;
  
  if (matchPercent >= 10) {
    let msg = `✓ ${matchPercent}% Match!`;
    if (matchIndex > 0) msg += ` (#${matchIndex + 1})`;
    showToast(msg, 'ok');
    
    if (practiceKanjiList.length > 1 && practiceCurrentIdx < practiceKanjiList.length - 1) {
      setTimeout(async () => {
        await nextPracticeKanji();
      }, 1000);
    } else {
      setTimeout(() => closeWritePracticeModal(), 1500);
    }
  } else {
    showToast('✗ Not recognized', 'err');
  }
}

function showPracticeFallback() {
  practiceUseFallback = true;
  document.getElementById('practice-fallback').classList.remove('hidden');
  document.getElementById('practice-candidates').classList.add('hidden');
  document.getElementById('practice-feedback').classList.add('hidden');
  
  const inp = document.getElementById('practice-write-input');
  inp.value = '';
  inp.focus();
}

function showPracticeCanvas() {
  practiceUseFallback = false;
  document.getElementById('practice-fallback').classList.add('hidden');
  KanjiCanvas.erase('practiceCanvas');
}

function checkWritePracticeFallback() {
  const inp = document.getElementById('practice-write-input');
  const val = inp.value.trim();
  const feedback = document.getElementById('practice-feedback');
  const currentKanji = practiceKanjiList[practiceCurrentIdx];
  
  if (!val) return;
  
  let isCorrect = false;
  const targetRomaji = practiceWriteRomaji || '';
  isCorrect = wanakana.toHiragana(val.toLowerCase()) === wanakana.toHiragana(targetRomaji.trim().toLowerCase());
  
  feedback.classList.remove('hidden');
  if (isCorrect) {
    feedback.innerHTML = `<span style="color: #30d158">✅ Correct! Well done!</span>`;
    
    if (practiceKanjiList.length > 1 && practiceCurrentIdx < practiceKanjiList.length - 1) {
      setTimeout(async () => {
        feedback.classList.add('hidden');
        await nextPracticeKanji();
      }, 1000);
    } else {
      setTimeout(() => closeWritePracticeModal(), 1500);
    }
  } else {
    feedback.innerHTML = `<span style="color: #ff2d55">❌ Try again!</span><br><span style="color: #30d158">Answer: ${escapeHtml(currentKanji)}</span>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const writeInput = document.getElementById('write-input');
  if (writeInput) {
    writeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && writeUseFallback && !writeInput.disabled) {
        checkWriteFallbackAnswer();
      }
    });
  }
  
  const practiceInput = document.getElementById('practice-write-input');
  if (practiceInput) {
    practiceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && practiceUseFallback) {
        checkWritePracticeFallback();
      }
    });
  }
});
