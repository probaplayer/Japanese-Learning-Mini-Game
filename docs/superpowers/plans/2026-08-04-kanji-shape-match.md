# Shape-Based Kanji Writing Recognition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `KanjiCanvas`'s open-set stroke classifier with a closed-set shape comparison (drawn ink vs. a `Noto Sans JP`-rendered reference glyph of the *one* expected character) so correctly-drawn kanji stop being rejected, in both the Write game and the Practice modal.

**Architecture:** New module `js/kanji-shape-match.js` with a pure, Node-testable math core (bounding-box crop, nearest-neighbor resample, dilation, Dice coefficient) plus two small browser-only functions (read canvas pixels, render a font glyph offscreen) that call into it. `js/games/game-write.js`'s two check functions swap their `KanjiCanvas` classification calls for a single call into this module, keeping every downstream XP/HP/combo/fallback code path unchanged.

**Tech Stack:** Plain browser JS (`js/`), loaded via `<script>` tags in `index.html` (no bundler, no ES modules — matches every existing file in `js/`). Tests via `node:assert` + `node:vm`, run through `node tests/run-all.js`, following the exact harness pattern already used in `tests/game-utils.test.js`.

## Global Constraints

- No stroke-order or stroke-count checking — only final drawn shape matters (from spec `docs/superpowers/specs/2026-08-04-kanji-shape-match-design.md`).
- No changes to `lib/kanji-canvas.min.js` or `lib/ref-patterns.js` — they stay wired up for stroke capture/drawing only.
- No changes to the other games (quiz/flash/match/type) or to the HP/combo/XP formulas themselves — only what feeds `matchPercent` changes.
- No new runtime dependency, dataset, or build step — the site is static, plain browser JS with no bundler.
- Applies to both the Write game (`checkWriteAnswer`) and the Practice modal (`checkWritePracticeAnswer`).

---

### Task 1: Pure shape-matching math (`js/kanji-shape-match.js`)

**Files:**
- Create: `js/kanji-shape-match.js`
- Create: `tests/kanji-shape-match.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `cropToBoundingBox(mask, width, height)` → `{ mask, width, height } | null`; `resampleNearest(mask, width, height, targetSize)` → flat array of length `targetSize*targetSize`; `dilate(mask, size)` → flat array of length `size*size`; `diceScore(maskA, maskB, size)` → number `0..1`; `scoreShapeMatch(userMask, userWidth, userHeight, refMask, refWidth, refHeight, opts)` → number `0..1`, where `opts` is `{ gridSize = 64, dilation = 1 }`. All masks are flat arrays of `0`/`1` in row-major order (index `y * width + x`). These are consumed by Task 2's `scoreDrawing`.

- [ ] **Step 1: Write the failing tests**

Create `tests/kanji-shape-match.test.js`:

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'kanji-shape-match.js'), 'utf8');

function createContext() {
  const context = { Math, Array };
  vm.createContext(context);
  vm.runInContext(
    `${source}
this.cropToBoundingBox = cropToBoundingBox;
this.resampleNearest = resampleNearest;
this.dilate = dilate;
this.diceScore = diceScore;
this.scoreShapeMatch = scoreShapeMatch;`,
    context
  );
  return context;
}

function testCropToBoundingBoxFindsTightBox() {
  const context = createContext();
  // 4x4 grid, ink at (1,1) and (2,2)
  const mask = [
    0, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 0
  ];
  const result = context.cropToBoundingBox(mask, 4, 4);
  assert.deepStrictEqual(result, { mask: [1, 0, 0, 1], width: 2, height: 2 });
}

function testCropToBoundingBoxReturnsNullForEmptyMask() {
  const context = createContext();
  const mask = new Array(16).fill(0);
  assert.strictEqual(context.cropToBoundingBox(mask, 4, 4), null);
}

function testResampleNearestScalesUpByRepeatingCells() {
  const context = createContext();
  const mask = [1, 0, 0, 1]; // 2x2 checkerboard
  const result = context.resampleNearest(mask, 2, 2, 4);
  assert.deepStrictEqual(result, [
    1, 1, 0, 0,
    1, 1, 0, 0,
    0, 0, 1, 1,
    0, 0, 1, 1
  ]);
}

function testDilateGrowsInkIntoAllNeighbors() {
  const context = createContext();
  const mask = [
    0, 0, 0,
    0, 1, 0,
    0, 0, 0
  ];
  const result = context.dilate(mask, 3);
  assert.deepStrictEqual(result, [1, 1, 1, 1, 1, 1, 1, 1, 1]);
}

function testDiceScoreOfIdenticalMasksIsOne() {
  const context = createContext();
  const mask = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assert.strictEqual(context.diceScore(mask, mask, 4), 1);
}

function testDiceScoreOfDisjointMasksIsZero() {
  const context = createContext();
  const maskA = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const maskB = [0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assert.strictEqual(context.diceScore(maskA, maskB, 4), 0);
}

function testDiceScoreOfPartialOverlapMatchesFormula() {
  const context = createContext();
  const maskA = [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // sumA = 4
  const maskB = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // sumB = 2, intersection = 2
  const result = context.diceScore(maskA, maskB, 4);
  assert.ok(Math.abs(result - (2 * 2) / (4 + 2)) < 1e-9);
}

function testDiceScoreOfTwoEmptyMasksIsZero() {
  const context = createContext();
  const mask = new Array(16).fill(0);
  assert.strictEqual(context.diceScore(mask, mask, 4), 0);
}

function testScoreShapeMatchIsTranslationInvariant() {
  const context = createContext();
  // A 2x2 solid square at top-left of a 4x4 grid...
  const userMask = [
    1, 1, 0, 0,
    1, 1, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0
  ];
  // ...and the same 2x2 solid square at bottom-right of a 4x4 grid.
  const refMask = [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 1, 1,
    0, 0, 1, 1
  ];
  const score = context.scoreShapeMatch(userMask, 4, 4, refMask, 4, 4, { gridSize: 8, dilation: 0 });
  assert.strictEqual(score, 1);
}

function testScoreShapeMatchReturnsZeroWhenUserMaskIsEmpty() {
  const context = createContext();
  const userMask = new Array(16).fill(0);
  const refMask = [1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assert.strictEqual(context.scoreShapeMatch(userMask, 4, 4, refMask, 4, 4, {}), 0);
}

testCropToBoundingBoxFindsTightBox();
testCropToBoundingBoxReturnsNullForEmptyMask();
testResampleNearestScalesUpByRepeatingCells();
testDilateGrowsInkIntoAllNeighbors();
testDiceScoreOfIdenticalMasksIsOne();
testDiceScoreOfDisjointMasksIsZero();
testDiceScoreOfPartialOverlapMatchesFormula();
testDiceScoreOfTwoEmptyMasksIsZero();
testScoreShapeMatchIsTranslationInvariant();
testScoreShapeMatchReturnsZeroWhenUserMaskIsEmpty();
console.log('kanji-shape-match tests passed');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/kanji-shape-match.test.js`
Expected: fails immediately — `js/kanji-shape-match.js` doesn't exist yet (`ENOENT`), or once created empty, `TypeError: context.cropToBoundingBox is not a function`.

- [ ] **Step 3: Implement the pure math functions**

Create `js/kanji-shape-match.js`:

```js
// ================================================
// KANJI SHAPE MATCH — closed-set drawing comparison
// ================================================

const MATCH_THRESHOLD = 35; // 0-100 scale; tune during manual verification (Task 3)

function cropToBoundingBox(mask, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;

  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  const cropped = new Array(boxWidth * boxHeight).fill(0);
  for (let y = 0; y < boxHeight; y++) {
    for (let x = 0; x < boxWidth; x++) {
      cropped[y * boxWidth + x] = mask[(minY + y) * width + (minX + x)];
    }
  }
  return { mask: cropped, width: boxWidth, height: boxHeight };
}

function resampleNearest(mask, width, height, targetSize) {
  const out = new Array(targetSize * targetSize).fill(0);
  for (let ty = 0; ty < targetSize; ty++) {
    const sy = Math.min(height - 1, Math.floor((ty * height) / targetSize));
    for (let tx = 0; tx < targetSize; tx++) {
      const sx = Math.min(width - 1, Math.floor((tx * width) / targetSize));
      out[ty * targetSize + tx] = mask[sy * width + sx];
    }
  }
  return out;
}

function dilate(mask, size) {
  const out = new Array(size * size).fill(0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let ink = 0;
      for (let dy = -1; dy <= 1 && !ink; dy++) {
        for (let dx = -1; dx <= 1 && !ink; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < size && nx >= 0 && nx < size && mask[ny * size + nx]) {
            ink = 1;
          }
        }
      }
      out[y * size + x] = ink;
    }
  }
  return out;
}

function diceScore(maskA, maskB, size) {
  let intersection = 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < size * size; i++) {
    if (maskA[i]) sumA++;
    if (maskB[i]) sumB++;
    if (maskA[i] && maskB[i]) intersection++;
  }
  if (sumA + sumB === 0) return 0;
  return (2 * intersection) / (sumA + sumB);
}

function scoreShapeMatch(userMask, userWidth, userHeight, refMask, refWidth, refHeight, opts) {
  const options = opts || {};
  const gridSize = options.gridSize || 64;
  const dilation = options.dilation === undefined ? 1 : options.dilation;

  const userCrop = cropToBoundingBox(userMask, userWidth, userHeight);
  const refCrop = cropToBoundingBox(refMask, refWidth, refHeight);
  if (!userCrop || !refCrop) return 0;

  let userGrid = resampleNearest(userCrop.mask, userCrop.width, userCrop.height, gridSize);
  let refGrid = resampleNearest(refCrop.mask, refCrop.width, refCrop.height, gridSize);

  for (let i = 0; i < dilation; i++) {
    userGrid = dilate(userGrid, gridSize);
    refGrid = dilate(refGrid, gridSize);
  }

  return diceScore(userGrid, refGrid, gridSize);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/kanji-shape-match.test.js`
Expected: `kanji-shape-match tests passed` printed, exit code 0.

- [ ] **Step 5: Run the full root test suite**

`tests/run-all.js` auto-discovers every `*.test.js` file in `tests/` (via `fs.readdirSync` + filter, no manual registration needed) — the new file is picked up automatically.

Run: `node tests/run-all.js`
Expected: all test files pass, including `kanji-shape-match tests passed`.

- [ ] **Step 6: Commit**

```bash
git add js/kanji-shape-match.js tests/kanji-shape-match.test.js
git commit -m "feat: add pure shape-matching math for closed-set kanji recognition"
```

---

### Task 2: Browser-only extraction/render functions

**Files:**
- Modify: `js/kanji-shape-match.js` (append to the file created in Task 1)
- Modify: `index.html` (add script tag)

**Interfaces:**
- Consumes: `scoreShapeMatch` from Task 1 (same file, no import needed).
- Produces: `extractInkMask(canvasEl)` → `{ mask, width, height }`; `renderGlyphMask(char, width, height)` → `Promise<{ mask, width, height }>`; `scoreDrawing(drawingCanvasEl, targetChar)` → `Promise<number>` (0-100 integer). Consumed by Task 3's `checkWriteAnswer`/`checkWritePracticeAnswer`.

There is no automated test for this task — it requires a real `<canvas>` and font rendering, and this repo has no DOM/browser test harness (same situation as the earlier per-answer-translations UI work). Verify manually per Step 3.

- [ ] **Step 1: Append the browser-only functions**

Append to `js/kanji-shape-match.js` (after `scoreShapeMatch`):

```js
function extractInkMask(canvasEl) {
  const ctx = canvasEl.getContext('2d');
  const width = canvasEl.width;
  const height = canvasEl.height;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const mask = new Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    const brightness = (r + g + b) / 3;
    mask[i] = brightness < 200 ? 1 : 0;
  }
  return { mask, width, height };
}

async function renderGlyphMask(char, width, height) {
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.floor(height * 0.8)}px "Noto Sans JP"`;
  ctx.fillText(char, width / 2, height / 2);
  return extractInkMask(canvas);
}

async function scoreDrawing(drawingCanvasEl, targetChar) {
  const userMask = extractInkMask(drawingCanvasEl);
  const refMask = await renderGlyphMask(targetChar, drawingCanvasEl.width, drawingCanvasEl.height);
  const dice = scoreShapeMatch(
    userMask.mask, userMask.width, userMask.height,
    refMask.mask, refMask.width, refMask.height
  );
  return Math.round(dice * 100);
}
```

- [ ] **Step 2: Wire the script into the page**

In `index.html`, find the `<script src="lib/kanji-canvas.min.js"></script>` tag (around line 650) and add a new script tag for `js/kanji-shape-match.js` right after it, before `js/games/game-write.js` is loaded:

```html
<script src="js/kanji-shape-match.js"></script>
```

- [ ] **Step 3: Manually verify in the browser**

1. Serve the repo root with a static file server (e.g. `npx serve .`) and open the game over `http://` (not `file://`, which can block the `fetch()` used to load `questions/manifest.json`).
2. Start the Write game (or open the Practice modal), draw any kanji stroke on the canvas.
3. Open devtools console and run:
   ```js
   await scoreDrawing(document.getElementById('writeCanvas'), '学')
   ```
   (substitute `'学'` with whichever character makes sense for what's currently on screen — the exact character doesn't matter for this check).
4. Confirm it resolves to a number between 0 and 100 with no thrown errors. Try it again after erasing the canvas (`KanjiCanvas.erase('writeCanvas')` then re-run) — confirm the score changes when the drawing is closer to vs. further from the target character (e.g. drawing the actual target character should score noticeably higher than drawing an unrelated scribble).

- [ ] **Step 4: Commit**

```bash
git add js/kanji-shape-match.js index.html
git commit -m "feat: add browser-side ink extraction and glyph rendering for shape matching"
```

---

### Task 3: Integrate into the Write game and Practice modal

**Files:**
- Modify: `js/games/game-write.js:286-353` (`checkWriteAnswer`)
- Modify: `js/games/game-write.js:635-682` (`checkWritePracticeAnswer`)

**Interfaces:**
- Consumes: `scoreDrawing(canvasEl, targetChar)` and `MATCH_THRESHOLD` from Task 2 (global scope, same page, no import needed).
- Produces: no new exported interface — this is the leaf integration point.

There is no automated test for this task (same reasoning as the earlier per-answer-translations `game-quiz.js` UI work — no DOM/browser test harness in this repo for rendering/game-loop code). Verify manually per Step 3.

- [ ] **Step 1: Replace `checkWriteAnswer`**

In `js/games/game-write.js`, replace the entire function at lines 286-353 (`function checkWriteAnswer() { ... }`) with:

```js
async function checkWriteAnswer() {
  const current = writeKanjiQueue[writeCurrentKanjiIdx];
  const canvas = document.getElementById('writeCanvas');

  const hasStrokes = KanjiCanvas['recordedPattern_writeCanvas'] &&
                      KanjiCanvas['recordedPattern_writeCanvas'].length > 0;

  if (!hasStrokes) {
    showToast('Please draw something first!', 'err');
    return;
  }

  const targetChar = current.kanji.trim();
  const matchPercent = await scoreDrawing(canvas, targetChar);

  const responseTime = Date.now() - writeQuestionStartTime;

  if (matchPercent >= MATCH_THRESHOLD) {
    writeCombo++;
    writeCorrect++;
    const pts = Math.floor(BASE_XP_WRITE * Math.max(1, writeCombo) * 1.5 * (matchPercent / 100));
    writeScore += pts;
    playerEXP += pts;
    updateQuestionStats(writeKanjiQueue[writeCurrentKanjiIdx].questionId, 'write', true, responseTime);

    let msg = `✓ ${matchPercent}% Match! +${pts} EXP`;
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
```

(Removed: the `matchIndex` position-based percent calculation and its `(#N)` suffix in the toast message — there's no longer a "candidate position" concept with shape matching, only a continuous similarity percentage.)

- [ ] **Step 2: Replace `checkWritePracticeAnswer`**

In the same file, replace the entire function at lines 635-682 (`function checkWritePracticeAnswer() { ... }`) with:

```js
async function checkWritePracticeAnswer() {
  const currentKanji = practiceKanjiList[practiceCurrentIdx];

  if (practiceUseFallback) {
    checkWritePracticeFallback();
    return;
  }

  const canvas = document.getElementById('practiceCanvas');

  const hasStrokes = KanjiCanvas['recordedPattern_practiceCanvas'] &&
                      KanjiCanvas['recordedPattern_practiceCanvas'].length > 0;

  if (!hasStrokes) {
    showToast('Please draw something first!', 'err');
    return;
  }

  const targetChar = currentKanji.trim();
  const matchPercent = await scoreDrawing(canvas, targetChar);

  if (matchPercent >= MATCH_THRESHOLD) {
    showToast(`✓ ${matchPercent}% Match!`, 'ok');

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
```

(Removed: the `practice-candidates` element population — it displayed the raw `KanjiCanvas` classifier candidate string, which no longer exists as a concept once classification is replaced by a single similarity score. The element stays in its default `hidden` state from `index.html:627`.)

- [ ] **Step 3: Manually verify in the browser**

1. Serve the repo root over `http://` as in Task 2.
2. **Write game:** Start a Write game run. For the kanji shown, draw it correctly (matching stroke shapes as best you can, ignoring stroke order/count) — confirm it's now recognized as correct with a plausible % match. Repeat with a kanji you previously found the old system rejected — confirm it's now accepted.
3. **Wrong-answer check:** Deliberately draw a different, unrelated kanji (or a scribble) — confirm it's rejected ("✗ Not recognized") and HP/combo respond as before.
4. **Practice modal:** Open the practice modal for a multi-kanji word, repeat the correct-draw and wrong-draw checks there; confirm auto-advance to the next kanji still happens on a correct match, and the fallback-to-typing button still works when you deliberately trigger a low score.
5. **Threshold tuning:** If step 2 or 3 shows too many false rejects or false accepts, adjust `MATCH_THRESHOLD` in `js/kanji-shape-match.js` (currently `35`) and re-run steps 2-3 until the balance feels right.
6. Confirm no console errors appear during any of the above.

- [ ] **Step 4: Run the full root test suite**

Run: `node tests/run-all.js`
Expected: all test files pass (this task has no new automated tests, but confirms the integration didn't break anything the suite covers, e.g. resume-state tests that touch `game-write.js`).

- [ ] **Step 5: Commit**

```bash
git add js/games/game-write.js
git commit -m "feat: use closed-set shape matching for kanji writing recognition"
```
