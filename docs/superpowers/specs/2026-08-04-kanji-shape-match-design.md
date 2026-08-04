# Design: shape-based kanji writing recognition (`kanji-shape-match`)

## Problem

The Write game (`js/games/game-write.js`) and its Practice modal both check the
player's drawn kanji using `KanjiCanvas`'s built-in classifier
(`momentNormalize` → `extractFeatures` → `coarseClassification` →
`fineClassification`), matching the drawing against `lib/ref-patterns.js`, a
fixed reference database covering `KanjiCanvas`'s whole known-character
vocabulary. This is an *open-set* recognizer: it has to guess which of
thousands of characters was drawn, and it's sensitive to stroke shape/
proportion variance even when the drawn kanji is objectively correct. Today's
acceptance logic already checks for the target character at *any* position in
the classifier's candidate string (`js/games/game-write.js:298-305`,
`:654-664` — not just top-3 as an older, already-superseded spec assumed), so
there's no remaining leniency to add on the acceptance side; the ceiling is in
the classifier itself.

The user reports drawing kanji correctly and still getting "not recognized."

## Goals

- Score a drawn kanji against the *one* character the player was asked to
  draw, not against `KanjiCanvas`'s whole vocabulary — sidestepping open-set
  misclassification entirely.
- Apply to both the Write game (`checkWriteAnswer`) and the Practice modal
  (`checkWritePracticeAnswer`), which hit the same underlying problem.
- Judge final drawn shape only — stroke order and stroke count are
  irrelevant, matching what the user actually wants ("I drew it right").
- Feed the existing `matchPercent` / XP / "not recognized" → typing-fallback
  flow unchanged; only how `matchPercent` is computed changes.
- No new runtime dependency, dataset, or build step — the site is static,
  plain browser JS with no bundler.

## Non-goals

- No stroke-order or stroke-count checking (would need a stroke-path dataset
  like KanjiVG — explicitly out of scope per user decision).
- No changes to `lib/kanji-canvas.min.js` or `lib/ref-patterns.js` — they
  stay wired up for stroke capture/drawing (undo, erase, canvas init). Their
  classification codepath becomes unused by this change but removing them is
  a separate cleanup, not part of this design.
- No changes to the other games (quiz/flash/match/type) or to HP/combo/XP
  formulas beyond feeding them a continuous score instead of today's stepped
  `100 - matchIndex*10` value.
- No changes to the typing-fallback UI/UX itself (`checkWritePracticeFallback`
  etc.) — only what triggers it.

## Design

### New module: `js/kanji-shape-match.js`

Split into two layers so the core algorithm is unit-testable without a real
DOM/canvas:

**Pure functions (Node-testable, operate on plain arrays):**

- `cropToBoundingBox(mask, width, height)` — given a binary ink mask (1 =
  ink, 0 = background) and its dimensions, return the tightest bounding box
  containing all `1`s (plus the cropped sub-mask and its dimensions). An
  all-zero mask returns a sentinel (e.g. `null`) the caller treats as "no
  ink" (already guarded upstream by the existing `hasStrokes` check).
- `resampleNearest(mask, width, height, targetSize)` — nearest-neighbor
  resize of a cropped mask into a fixed `targetSize × targetSize` grid (e.g.
  64×64). Dependency-free array math, no canvas involved.
- `dilate(mask, size)` — one pass over a `size × size` binary grid; a cell
  becomes ink if it or any of its 8 neighbors is ink. Used to absorb
  stroke-width/precision differences between freehand drawing and the font's
  clean vector strokes.
- `diceScore(maskA, maskB, size)` — Dice coefficient
  `2 × |A ∩ B| / (|A| + |B|)` over two same-size binary grids. Returns `0`
  when both masks are empty (avoids divide-by-zero).
- `scoreShapeMatch(userMask, userW, userH, refMask, refW, refH, opts)` —
  composes the above: crop both to bounding box, resample both to
  `opts.gridSize` (default 64), dilate both by `opts.dilation` (default 1),
  return the Dice score (`0..1`).

**Browser-only functions (manually verified, same convention as today's
`game-quiz.js` rendering — no existing DOM test harness in this repo):**

- `extractInkMask(canvasEl)` — read `ctx.getImageData`, classify each pixel
  as ink (non-white, allowing for anti-aliased near-white pixels via a
  brightness threshold) or background, return a flat binary mask plus width/
  height.
- `renderGlyphMask(char, width, height)` — draw `char` centered on an
  offscreen canvas of the given size using `Noto Sans JP` (already loaded
  site-wide via the Google Fonts link in `index.html:8`), then run it through
  `extractInkMask`. Awaits `document.fonts.ready` first so a not-yet-loaded
  font can't silently render as tofu and produce a false low score.
- `scoreDrawing(drawingCanvasEl, targetChar)` — the integration entry point:
  calls `extractInkMask` on the drawing canvas and `renderGlyphMask` for
  `targetChar` at the same dimensions, then `scoreShapeMatch`, returning a
  `0..100` integer (`Math.round(diceScore * 100)`).

### Threshold

A single exported constant, e.g. `MATCH_THRESHOLD = 35` (0-100 scale, tuned
during manual verification below). Scores at or above the threshold are
"recognized" and feed the existing correct-answer path with
`matchPercent = scoreDrawing(...)`; scores below trigger the existing
"not recognized" / typing-fallback path — same control flow as today, just
driven by a continuous score instead of a stepped one from candidate
position.

No separate stroke-count/ink-density guard is needed: a trivial scribble
only overlaps a small fraction of the reference glyph's ink (which typically
fills 20-40% of its own bounding box), so the Dice score stays low on its
own.

### Integration (`js/games/game-write.js`)

- `checkWriteAnswer()` (currently lines ~298-305): replace the
  `KanjiCanvas.momentNormalize/extractFeatures/coarseClassification/
  fineClassification` + `matchIndex`/`matchPercent` computation with:
  `const matchPercent = scoreDrawing(document.getElementById('writeCanvas'), current.kanji.trim());`
  Everything downstream (XP formula, combo, HP, messaging) is unchanged —
  it already only consumes `matchPercent`.
- `checkWritePracticeAnswer()` (currently lines ~654-664): same replacement,
  targeting `practiceCanvas`.
- `index.html`: add `<script src="js/kanji-shape-match.js"></script>` before
  `js/games/game-write.js`.

## Testing

- New `tests/kanji-shape-match.test.js` (Node + `node:assert`, following the
  existing `tests/*.test.js` convention): covers `cropToBoundingBox`,
  `resampleNearest`, `dilate`, and `diceScore` on small synthetic masks (e.g.
  4×4 or 8×8 grids) — identical masks → score `1`, disjoint masks → score
  `0`, known partial overlap → expected fraction, empty mask → no
  divide-by-zero.
- Manual verification (no DOM test harness exists for canvas rendering in
  this repo, same as the earlier per-answer-translations UI work): serve the
  site over `http://`, draw several known-good kanji in both the Write game
  and Practice modal — including one the user says currently fails — and
  confirm they're now recognized; draw an unrelated/wrong kanji and confirm
  it's rejected; draw a trivial scribble and confirm it's rejected. Use this
  pass to tune `MATCH_THRESHOLD` if 35 proves too strict or too lenient.

## Files touched

- New: `js/kanji-shape-match.js`
- New: `tests/kanji-shape-match.test.js`
- Modify: `js/games/game-write.js` — `checkWriteAnswer()`,
  `checkWritePracticeAnswer()`
- Modify: `index.html` — add script tag
