# Roadmap ("Lộ Trình") UI, Site-Wide Animation Pass, and GitNexus Removal — Design

## Problem

1. The project's `CLAUDE.md`/`AGENTS.md` and `.claude/skills/` still document and reference
   **GitNexus** for code intelligence, but the user has moved to **CodeGraph** (a `.codegraph/`
   index + `codegraph_explore` MCP tool already indexing this repo). The GitNexus instructions,
   skill files, and local index directory are now dead weight that will actively mislead a future
   session into calling tools that no longer apply.
2. The web app has no concept linking its question sets together. Today, picking a set is a flat
   dropdown in the "📦 QUESTION SETS" screen (`index.html:126-146`, `switchQuestionSet()` in
   `js/storage.js:41`) — there is no visual sense of progression across the 7 sets (N5 core →
   N5 grammar → N4 kanji → the 4 N4 Bài 26 sets), and no unifying "journey" feel despite the game
   already having a space/retro-arcade visual identity (`#stars-bg` canvas, HP/EXP bars, streaks,
   levels).
3. Screen transitions and value changes (HP/EXP bar fills, mastery circles) currently snap
   instantly — `showScreen()` (`js/main.js:112`) does a hard `display`/class toggle with no
   transition, and `.bar-fill` width changes have no CSS transition.

## Goals

1. Remove all GitNexus artifacts and documentation from this repo; CodeGraph remains the sole
   code-intelligence tool (already working, no repo changes needed for it).
2. Add a new **"🌌 LỘ TRÌNH"** (roadmap) screen: a vertical, zigzagging path of question-set nodes
   that visually reads as climbing from ground level up into deep space, with a player
   avatar marking the currently active set and a 0–3 star rating per node reflecting best
   accuracy so far (data already available via `questionStats`).
3. Clicking a roadmap node switches to that question set and lands directly on the game menu
   (same behavior as the existing direct-selector flow) — the roadmap is a second, visual entry
   point to the same `switchQuestionSet()` path, not a replacement for it.
4. Add a small, centralized set of CSS animations (screen transitions, menu button entrance,
   stat-bar fill transitions, roadmap-specific node/avatar motion) that apply site-wide and
   respect the existing `body.animations-disabled` settings toggle.

## Non-goals

- No sequential locking/gating of nodes — every set is playable at any time, exactly as today.
  The roadmap is a navigation and motivation aid, not a progression gate.
- No changes to game mechanics, question schemas, or the MCP server's validation logic.
- No new external animation library, canvas game engine, or SVG path math — pure CSS
  keyframes/transitions toggled by JS class changes, matching the existing `css/animations.css`
  convention.
- No backend/storage schema change for `questionStats` — roadmap star ratings are computed by
  reading the existing per-question stats, not by introducing a new "per-set" stats store.

## Part A — GitNexus removal

- Delete `.claude/skills/gitnexus/` (6 files: `gitnexus-cli`, `gitnexus-debugging`,
  `gitnexus-exploring`, `gitnexus-guide`, `gitnexus-impact-analysis`, `gitnexus-refactoring`,
  each a `SKILL.md`).
- Delete the local index directory `.gitnexus/` at the repo root.
- Remove the `<!-- gitnexus:start -->` … `<!-- gitnexus:end -->` block from both `CLAUDE.md` and
  `AGENTS.md` (markers already exist, delete everything between and including them).
- Remove the `.gitnexus` line from `.gitignore`.
- No `.claude/settings.json` change needed — no GitNexus MCP server is registered there.

## Part B — Roadmap UI

### B1. Rendering approach (chosen: CSS/HTML zigzag timeline)

A scrollable vertical column of node buttons, alternating left/right, connected by CSS-drawn
lines, layered over the existing full-page `#stars-bg` starfield canvas with an added gradient
overlay (warm ground tones at the bottom → deep indigo/violet at the top). Rejected alternatives:
an SVG `<path>`-based winding route (nicer curves, but real coordinate math for an app with no
prior SVG layout code) and a full canvas-drawn scene (best visual ceiling, but reintroduces
hit-testing/accessibility problems the DOM already solves for free). The zigzag timeline matches
this codebase's existing pattern of plain DOM + CSS keyframes and needs no new rendering system.

### B2. Data model — `questions/manifest.json`

Each entry in `sets` gains two fields:

```json
{ "id": "n5-core", "file": "n5-core.json", "name": "N5 Core Vocabulary", "category": "vocabulary",
  "order": 1, "level": "N5", "questionCount": 400, "updatedAt": "..." }
```

| Field | Type | Notes |
|---|---|---|
| `order` | integer | Roadmap sequence, ascending = further up the path. Ties broken by array order. |
| `level` | string | Groups nodes under a section label on the roadmap (e.g. `"N5"`, `"N4"`). Purely cosmetic grouping, not a gate. |

Assigned values for the 7 existing sets (bottom → top):

| id | order | level |
|---|---|---|
| `n5-core` | 1 | N5 |
| `n5-grammar` | 2 | N5 |
| `n4-kanji` | 3 | N4 |
| `n4-l26-vocab` | 4 | N4 |
| `n4-l26-kanji` | 5 | N4 |
| `n4-l26-kanji-hanviet` | 6 | N4 |
| `n4-l26-grammar` | 7 | N4 |

Missing `order`/`level` on any future hand-edited entry falls back to `order = <array length + 1>`
(sorts to the end) and `level = 'N/A'` (grouped under a catch-all section) wherever read — no
migration required, same fallback pattern already used for `category`.

### B3. `mcp-server/src/questions-repo.js` + MCP tool schema

- `createQuestionSet({ id, name, description, category, order, level, questions })`: accepts
  optional `order` (number) and `level` (string). When `order` is omitted, defaults to
  `manifest.sets.length + 1` (append to the end of the roadmap) so Claude-authored sets never
  silently vanish from the path. When `level` is omitted, defaults to `'N/A'`.
- Both fields are persisted into the manifest entry (mirroring how `category` already is);
  they are **not** duplicated into the set file itself — order/level are manifest-only
  (roadmap-positioning) concerns, unlike `category` which the game engine also reads at runtime
  from the loaded set.
- `mcp-server/src/index.js`'s `create_question_set` tool schema gains
  `order: z.number().int().optional()` and `level: z.string().optional()`.

### B4. New screen — `screen-roadmap` (`index.html`)

Added alongside `screen-data`, following the existing screen markup pattern:

```html
<div id="screen-roadmap" class="screen screen-roadmap">
  <div class="roadmap-header">
    <h2 class="panel-title">🌌 LỘ TRÌNH</h2>
    <button class="back-btn" onclick="showScreen('screen-menu')">◀ BACK TO MENU</button>
  </div>
  <div class="roadmap-track" id="roadmap-track"><!-- rendered by renderRoadmap() --></div>
</div>
```

Per-node markup (rendered, not static):

```html
<div class="roadmap-section-label">🌍 N5</div>
<button class="roadmap-node roadmap-node-left" data-set-id="n5-core" onclick="launchRoadmapNode('n5-core')">
  <span class="roadmap-node-icon">📖</span>
  <span class="roadmap-node-name">N5 Core Vocabulary</span>
  <span class="roadmap-node-stars">★★☆</span>
  <span class="roadmap-avatar" aria-hidden="true">🚀</span> <!-- only on the active-set node -->
</button>
```

### B5. `js/main.js` (or new `js/roadmap.js`, loaded after `storage.js`) — `renderRoadmap()`

1. Read `questionSets` (already loaded globally at init), sort a copy by `order` ascending, group
   by `level` in that order.
2. For each set, ensure its question file is loaded once: reuse the already-fetched active set's
   `questions` array when `set.id === activeSetId`; otherwise call the existing
   `fetchQuestionSetFile(set.file)` and cache the result in a module-level
   `const roadmapQuestionsCache = new Map()` keyed by set id, so re-entering the roadmap screen
   doesn't refetch.
3. For each set's question list, compute accuracy **without** calling `getQuestionStatsEntry`
   directly — that helper scopes lookups through `getScopedQuestionId()`, which prefixes with the
   *global* `activeSetId`, not the set actually being examined. Looking up a non-active set's
   stats through it would silently read the wrong (or empty) bucket. Instead build the storage key
   the same way `getScopedQuestionId` does, but with the target set's own id:
   `` `${targetSetId}::${generateQuestionId(q)}` ``, and read `questionStats[thatKey]` directly.
   Sum `correctCount`/`incorrect` across all game-type sub-objects (skip the `_meta` key) to get
   `accuracy = correct / (correct + wrong)`, `0` if no attempts. Map to stars: `0` attempts → 0★;
   `<50%` → 1★; `<80%` → 2★; `≥80%` → 3★ (same 50/80 thresholds already used for coloring in
   `renderStatsScreen`).
4. Build the `#roadmap-track` innerHTML: section label whenever `level` changes, then one
   `.roadmap-node` per set (alternating `roadmap-node-left`/`roadmap-node-right` by index),
   a category icon (📖 for `category === 'vocabulary'`, 🧩 for `category === 'grammar'` — the
   only two categories the data model supports today, per `questions-repo.js`'s
   `validateQuestion`), name, star string, question count.
5. Place `.roadmap-avatar` (🚀) inside the node whose `id === activeSetId` (falls back to the
   first node in `order` if `activeSetId` is unset).
6. After render, `requestAnimationFrame` a smooth `scrollIntoView({ behavior: 'smooth', block:
   'center' })` on the active node so the player doesn't have to hunt for their position.
7. Hook into `showScreen()` (`js/main.js:112`): add `if (id === 'screen-roadmap')
   renderRoadmap();`, matching the existing per-screen hook pattern already used for
   `screen-data`/`screen-settings`/`screen-stats`.

### B6. Node click behavior — `launchRoadmapNode(id)`

```js
function launchRoadmapNode(id) {
  const nodeEl = document.querySelector(`.roadmap-node[data-set-id="${id}"]`);
  if (nodeEl) nodeEl.classList.add('roadmap-node-launch'); // brief CSS animation, see B7
  switchQuestionSet(id); // existing function: js/storage.js:41 — updates activeSetId, refetches
                          // questions, calls refreshQuestionSetUI() + updateMenuUI()
  setTimeout(() => showScreen('screen-menu'), 220); // let the launch animation play out first
}
```

This reuses `switchQuestionSet()` unmodified — it already does everything needed (set questions,
persist `activeSetId`, reset question stats view, refresh the data-screen selector). No changes
to `js/storage.js` beyond what B3 covers.

### B7. Main menu button (`index.html`)

New button inserted **before** the existing QUIZ button (first in `.main-nav`):

```html
<button class="menu-btn btn-roadmap" onclick="showScreen('screen-roadmap')">
  <span class="btn-icon">🌌</span>
  <span class="btn-text">LỘ TRÌNH<br><small>Hành trình học tập</small></span>
  <span class="btn-arrow">▶</span>
</button>
```

The existing "📦 QUESTION SETS" button and its dropdown-based `screen-data` flow are unchanged.

## Part C — Site-wide animation pass

All new keyframes live in `css/animations.css` (existing file); all new selectors get a matching
`body.animations-disabled .selector { animation: none !important; transition: none; }` line in
`css/base.css`, following the exact convention already there (`base.css:30-34`).

1. **Screen transitions** — `showScreen()` adds a `.screen-transitioning` class to the newly
   shown element right after `classList.add('active')`, removed via a `transitionend` listener
   (or a fixed `setTimeout` matching the CSS duration, mirroring how `stopMatchTimer` cleanup is
   already handled inline in that function). New CSS: `.screen.screen-transitioning { animation:
   screenFadeUp .35s ease; }` with a `screenFadeUp` keyframe (fade + slight translateY, same shape
   as the existing `slideIn`/`cardEnter` keyframes).
2. **Menu button stagger-in** — `.main-nav .menu-btn` gets `animation: slideIn .3s ease both;` with
   `animation-delay` set via `nth-child(n)` steps (existing `slideIn` keyframe, no new one needed),
   triggered every time `screen-menu` becomes active.
3. **Stat bar transitions** — `.bar-fill` (`menu-hp`, `menu-exp`, `css/menu.css:20`) already has
   `transition: width .5s ease`, so no change needed there. `.mastery-circle`'s `--progress`
   conic-gradient (`css/extra.css:737-745`) is excluded from this pass: `renderStatsScreen()`
   rebuilds its container via full `innerHTML` replacement on every render, so there is no
   persistent element for a CSS transition to animate from — fixing that would require restructuring
   that render function, which is out of scope here.
4. **Roadmap node entrance** — `.roadmap-node` gets `animation: cardEnter .4s ease both;` with a
   staggered `animation-delay` per index (reuses the existing `cardEnter` keyframe verbatim).
5. **Avatar idle + travel** — `.roadmap-avatar` gets a continuous `avatarFloat` keyframe (small
   vertical bob, infinite loop) plus a one-shot `.roadmap-node-launch .roadmap-avatar {
   animation: avatarLaunch .2s ease-out; }` triggered by the class added in B6.
6. **Connector glow** — the "traveled" segment of the connecting line (all nodes up to and
   including the active one, in `order`) gets a `connectorGlow` pulse keyframe; untraveled
   segments stay static/dim. Purely visual — computed the same way stars are (accuracy > 0 across
   any game type on that set), not a gate.

## Testing

- **Manual smoke test** (no build step, per `AGENTS.md`): open `index.html` via a static server,
  click "🌌 LỘ TRÌNH" from the main menu, confirm all 7 nodes render grouped under "N5"/"N4"
  labels in the assigned `order`, confirm the avatar sits on the currently active set, click a
  different node and confirm it lands on `screen-menu` with that set's games filtered correctly
  (existing `updateMenuUI()` category filter, unchanged).
- **`mcp-server/test/questions-repo.test.js`**: extend with a `createQuestionSet` test asserting
  `order` defaults to `manifest.sets.length + 1` when omitted and `level` defaults to `'N/A'`;
  assert both are round-tripped into the manifest entry when explicitly provided.
- **`tests/init-question-sets.test.js`** (or a new `tests/roadmap.test.js` following the existing
  DOM-less harness pattern used by `main-utils.test.js`): unit-test the star-rating computation
  function in isolation (given a stats fixture, returns the expected 0–3 star count at the
  50%/80% boundaries).
- **Reduced-motion check**: toggle "disable animations" in Settings, re-open the roadmap, confirm
  no CSS animation/transition plays (all new selectors covered by the `animations-disabled`
  override list in `css/base.css`).

## Risks / open questions resolved during brainstorming

- No sequential locking (resolved: user chose free navigation — roadmap is motivational/visual,
  not a gate).
- Node order/grouping is explicit manifest metadata (`order`/`level`), not auto-inferred from
  name/id string patterns (resolved: user chose explicit fields for precision and easy extension
  when new sets are added later).
- Clicking a node jumps straight to the game menu, no intermediate preview screen (resolved: user
  chose parity with the existing direct-selector flow, per the original request that "choosing a
  question-set shows the games first").
- Star ratings are shown per node purely for motivation, computed from existing `questionStats`,
  no new storage (resolved: user opted in explicitly, "vậy mới có cảm giác leo lên vũ trụ").
