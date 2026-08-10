# Multi-Roadmap + Library Integration — Design

## Problem

The roadmap feature shipped in `2026-08-10-roadmap-ui-and-gitnexus-removal-design.md` renders every
question set as a single, unbroken climbing path, and its UI text is Vietnamese ("🌌 LỘ TRÌNH",
"Đang tải lộ trình…", "câu"). The user now wants:

1. Multiple, independently-named roadmaps (e.g. "N5 Path", "N4 Path") — each question set belongs to
   one roadmap (or none), not a single flat list of all 7 sets.
2. All roadmap-facing UI text in English.
3. The existing "📦 QUESTION SETS" screen (dropdown-only) to show, below the dropdown, a mini preview
   of the selected set's roadmap with that set highlighted — plus a second tab to browse roadmaps
   directly. Because the screen now does more than pick a set, it gets renamed.

## Goals

1. Question sets are grouped into named roadmaps via a new `roadmapId` field, independent of the
   existing `level` field. A set with no `roadmapId` remains fully playable, just absent from every
   roadmap view.
2. The main-menu button and full-screen roadmap (`screen-roadmap`) become **"🌌 ROADMAP"** /
   *"Your learning journey"*, with a tab bar at the top to switch between roadmaps (auto-selecting
   the one containing the active set on entry).
3. "📦 QUESTION SETS" becomes **"📚 LIBRARY"**, gaining two tabs:
   - **Sets** (default): the existing dropdown/active-name/count/note, plus a mini roadmap preview
     of the selected set's roadmap below it, with that set's node highlighted.
   - **Roadmaps**: a chip row to pick a roadmap directly, with its mini preview below.
4. Clicking a node inside Library (either tab) switches the active set **in place** — Library stays
   open, the dropdown/tab/highlight update to match. Clicking a node on the full-screen `screen-roadmap`
   keeps its existing behavior: switch set, then jump to the main menu.
5. All new/touched roadmap-facing strings are in English.

## Non-goals

- No MCP tool to create/rename/delete roadmap *definitions* (the `roadmaps` registry itself). It's a
  small, rarely-changing list (2 entries today) hand-authored directly in `questions/manifest.json`.
  `create_question_set`'s new `roadmapId` param only lets Claude *assign a set* to an existing
  roadmap — it validates against the registry, it doesn't create entries in it.
- No sequential locking between roadmaps or within one — unchanged from the original design; every
  set stays playable regardless of roadmap membership.
- No retranslation of the rest of the app (game screens, settings, stats) — only roadmap/Library
  strings that are new or being touched by this change.
- No removal of the `level` field or its manifest/mcp-server support — it stays as descriptive
  metadata, it just stops driving the roadmap's visual grouping (superseded by `roadmapId`, which
  expresses the same grouping more flexibly).

## Data model

### `questions/manifest.json`

New top-level array, sibling to `sets`:

```json
{
  "roadmaps": [
    { "id": "n5-path", "name": "N5 Path" },
    { "id": "n4-path", "name": "N4 Path" }
  ],
  "sets": [ /* existing entries, each gaining "roadmapId" below */ ]
}
```

Each entry in `sets` gains `roadmapId` (string, matching a `roadmaps[].id`, or `null`/absent for a
set not on any roadmap):

| id | roadmapId |
|---|---|
| `n5-core` | `n5-path` |
| `n5-grammar` | `n5-path` |
| `n4-kanji` | `n4-path` |
| `n4-l26-vocab` | `n4-path` |
| `n4-l26-kanji` | `n4-path` |
| `n4-l26-kanji-hanviet` | `n4-path` |
| `n4-l26-grammar` | `n4-path` |

`order` values are unchanged (still globally unique 1-7 across the whole manifest) — filtering by
`roadmapId` before rendering a path is enough to get each roadmap's own correctly-ordered sequence;
no renumbering needed. `level` is unchanged and untouched by this feature.

### `mcp-server/src/questions-repo.js`

`createQuestionSet({ ..., roadmapId, ... })` accepts an optional `roadmapId`. If provided, it must
match an existing `roadmaps[].id` in the manifest — throw a clear error (`` `Unknown roadmapId: ${x}.
Known roadmaps: ${...}` ``) if not. If omitted, the manifest entry simply has no `roadmapId` (not
defaulted to anything — unlike `order`/`level`, there is no sensible universal default for "which
roadmap", and leaving it unset is a valid, supported state). Persisted into the manifest entry only,
same as `order`/`level` — never duplicated into the set's own JSON file.

`mcp-server/src/index.js`'s `create_question_set` tool schema gains `roadmapId: z.string().optional()`.

### `js/storage.js`

`fetchQuestionsManifest()` currently returns `manifest.sets` directly; it changes to return the whole
parsed `manifest` object (its one caller, `initQuestionSets()`, updates to destructure `sets` and
`roadmaps` off it). `initQuestionSets()` populates a new global `roadmapDefinitions` (array of
`{id, name}`, defaulting to `[]` if the manifest has no `roadmaps` key — keeps old/hand-edited
manifests without the field from throwing).

## Shared rendering core (`js/roadmap.js` rework)

The three surfaces that render a roadmap (full-screen, Library's Sets-tab preview, Library's
Roadmaps-tab preview) share one node-list builder and one per-set progress/star computation
(`computeSetProgress`/`starsForProgress`/`renderStarString`, unchanged from the original design) —
only the container size, which roadmap is shown, which set is highlighted, and what a click does
differ.

### New/changed globals

- `let roadmapDefinitions = [];` (`js/main.js`, alongside `questionSets`) — populated by
  `initQuestionSets()`.
- `let activeRoadmapTabId = null;` (`js/roadmap.js`) — which roadmap tab the full-screen view shows.
- `let activeLibraryRoadmapId = null;` (`js/roadmap.js`) — which roadmap chip the Library
  Roadmaps-tab shows.

### New helpers

- `getSetsForRoadmap(roadmapId)` — `questionSets.filter(s => s.roadmapId === roadmapId)`, sorted
  **descending** by `order` (same "ground at the bottom, climbing up" convention as the original
  design — order 1 renders last in the DOM, ending up visually at the bottom).
- `buildRoadmapNodesHtml(setsForRoadmap, progressById, { highlightSetId, compact, clickHandler })` —
  returns the concatenated `<button class="roadmap-node ...">` fragments (no section labels —
  dropped, since a single roadmap is already one coherent group; see CSS section). `progressById` is
  a `Map<setId, {progress, stars}>` the caller has already computed. `compact` (bool) omits the
  `roadmap-node-left`/`roadmap-node-right` alternation and adds no `--i` stagger (mini previews don't
  need the zigzag or entrance stagger — see CSS). `clickHandler` is the function name string embedded
  into the node's `onclick` (`'launchRoadmapNode'` for the full screen, `'selectRoadmapNodeInPlace'`
  for both Library tabs).
- `computeRoadmapProgress(setsForRoadmap)` — `async`, returns `Map<setId, {progress, stars}>` by
  calling `getRoadmapQuestionsForSet`/`computeSetProgress`/`starsForProgress` per set (unchanged
  functions). Extracted from the original `renderRoadmap()` so all three render paths reuse it
  without duplicating the fetch/compute loop.
- `renderRoadmapChipsHtml(definitions, selectedId, onSelectFnName)` — returns the concatenated
  `<button class="roadmap-tab ...">` fragments for a tab/chip bar, one per `{id, name}` in
  `definitions`, the one matching `selectedId` getting an `active` class, each calling
  `onSelectFnName('${id}')` on click. Shared by the full screen's tab bar (`onSelectFnName:
  'selectRoadmapTab'`) and Library's Roadmaps-tab chip row (`onSelectFnName: 'selectLibraryRoadmap'`).

### Full-screen roadmap (`renderRoadmap()`, rewritten)

1. Compute progress for **every** set once (`computeRoadmapProgress(questionSets)`), same
   loading/try-catch pattern as today.
2. Pick `activeRoadmapTabId`: keep the current value if still valid; otherwise default to the
   roadmap containing `activeSetId`, falling back to `roadmapDefinitions[0]?.id`, falling back to
   `null` if there are zero roadmap definitions. When `null`, leave `#roadmap-tabs` empty and render
   `<div class="roadmap-loading">No roadmaps configured yet.</div>` into `#roadmap-track` instead of
   step 3-4 below (reuses the existing `.roadmap-loading` class, no new CSS needed for this state).
3. Render the tab bar (one chip per `roadmapDefinitions` entry, active chip styled) into a new
   `#roadmap-tabs` container (sibling of `#roadmap-track`, added to `index.html` right above it).
4. Render the track: `buildRoadmapNodesHtml(getSetsForRoadmap(activeRoadmapTabId), progressMap,
   { highlightSetId: activeSetId, compact: false, clickHandler: 'launchRoadmapNode' })`.
5. Keep the existing `requestAnimationFrame` scroll-into-view (target: the active-set node, or the
   track's last child as fallback).

`selectRoadmapTab(id)` (chip `onclick`): sets `activeRoadmapTabId = id`, re-renders the tab bar and
track from the **already-computed** progress map (no re-fetch, so switching tabs is instant).

### Library screen (new)

Two new render functions, both computing their own progress map independently (Library may be
entered without ever visiting the full-screen roadmap first, so it can't assume the other's cache is
warm — though the underlying per-question-set fetch is itself cached in `roadmapQuestionsCache`, so
visiting both is still cheap):

- `renderLibrarySetsTab()`: called by `refreshQuestionSetUI()` (see below) whenever the active set
  changes or the Sets tab is (re)shown. Reads the currently-selected-in-the-dropdown set's
  `roadmapId`. If unset, writes `<div class="roadmap-loading">This set isn't part of a roadmap
  yet.</div>` into `#library-set-roadmap` (reusing the existing `.roadmap-loading` class for this
  empty state, same as the full screen's) and stops. Otherwise: `computeRoadmapProgress(getSetsForRoadmap(roadmapId))`,
  then `buildRoadmapNodesHtml(..., { highlightSetId: selectedSetId, compact: true,
  clickHandler: 'selectRoadmapNodeInPlace' })` into `#library-set-roadmap`.
- `renderLibraryRoadmapsTab()`: renders the roadmap chip row into `#library-roadmap-chips` (reusing
  the same chip-rendering logic as the full-screen tab bar — factor the chip-HTML generation into a
  shared `renderRoadmapChipsHtml(definitions, selectedId, onSelectFnName)` helper used by both).
  Defaults `activeLibraryRoadmapId` the same way as the full screen (containing `activeSetId`, else
  first roadmap, else empty-state). Renders `buildRoadmapNodesHtml(getSetsForRoadmap(activeLibraryRoadmapId),
  ..., { highlightSetId: activeSetId, compact: true, clickHandler: 'selectRoadmapNodeInPlace' })`
  into `#library-roadmap-preview` — `highlightSetId` is only meaningful if `activeSetId` actually
  belongs to the currently-shown roadmap; `buildRoadmapNodesHtml` simply won't match it otherwise
  (no avatar rendered, which is correct — nothing wrong is displayed).

`selectLibraryTab('sets' | 'roadmaps')`: toggles the `hidden` class on `#library-sets-tab` /
`#library-roadmaps-tab` and the tab buttons' active state; calls the corresponding render function.
Library always opens on the Sets tab (`showScreen('screen-library')`'s hook calls
`selectLibraryTab('sets')`, matching the "always defaults to Sets" decision — no last-tab memory).

`selectRoadmapNodeInPlace(id)`: the Library-only click handler. Same visual launch treatment as
`launchRoadmapNode` (adds `roadmap-node-launch` to the clicked node, `roadmap-avatar-launch` to
wherever `.roadmap-avatar` currently is) but calls only `switchQuestionSet(id)` — no `showScreen()`
call, no `setTimeout`. `switchQuestionSet()` already calls `refreshQuestionSetUI()`
(`js/storage.js:49`), which is extended (one added line, guarded by `typeof` like the existing
`initQuestionStats` check) to also call `refreshLibraryRoadmapPreview()`
(`js/roadmap.js`) — a small dispatcher that re-renders whichever Library tab is currently visible
(no-op if neither tab's containers exist in the DOM, i.e. Library was never opened this session).
This one hook keeps the dropdown, the Sets-tab mini preview, and the Roadmaps-tab mini preview all in
sync no matter which of the three surfaces (dropdown, Sets-tab node, Roadmaps-tab node) triggered the
switch — none of them need their own bespoke "also refresh the other two" logic.

## Markup (`index.html`)

- Main-menu button (`btn-roadmap`): icon/text become `🌌 ROADMAP` / `<small>Your learning journey</small>`.
- Main-menu button (`btn-data`): icon/text become `📚 LIBRARY` / `<small>Choose a set</small>`
  (subtitle unchanged — still accurate). The `id`/`class`/`onclick` target renames
  `screen-data` → `screen-library` everywhere (button `onclick`, the screen `id`, and the
  `if (id === 'screen-library') { ... }` hook in `showScreen()`). The screen's CSS class stays
  `screen-data` (used purely as an internal style-scoping hook by ~15 existing rules in
  `css/extra.css`) — only the outward-facing `id` and visible text change, so none of that existing
  CSS needs touching.
- `#screen-library`'s panel gains, right after the `<h2 class="panel-title">📚 LIBRARY</h2>`:
  a tab bar (`<div class="library-tabs">` with two buttons, `onclick="selectLibraryTab('sets')"` /
  `('roadmaps')`), then two content containers:
  - `#library-sets-tab`: the existing dropdown/label/note markup (moved inside, unchanged), plus a
    new `<div class="roadmap-track roadmap-track-mini" id="library-set-roadmap"></div>` after it.
  - `#library-roadmaps-tab` (starts `hidden`): `<div id="library-roadmap-chips" class="roadmap-tabs"></div>`
    then `<div class="roadmap-track roadmap-track-mini" id="library-roadmap-preview"></div>`.
- `#screen-roadmap`'s panel gains `<div class="roadmap-tabs" id="roadmap-tabs"></div>` right above
  the existing `#roadmap-track`, and its title becomes `🌌 ROADMAP`.
- `<script src="js/roadmap.js">` tag position is unchanged.

## CSS

- New `.roadmap-tabs` (flex row, wraps) / `.roadmap-tab` (pill button) — used for both the
  full-screen roadmap's tab bar and Library's Roadmaps-tab chip row (same visual language, same
  markup shape, one shared class pair). Active tab gets an accent border/background; reuses existing
  tokens (`--accent2`, `--panel`, `--border`) rather than introducing new ones.
- New `.roadmap-track-mini` modifier, scoped overrides only (no separate node markup path):
  - `.roadmap-track-mini { gap: 14px; padding: 10px 0; }`
  - `.roadmap-track-mini .roadmap-node { width: 100%; max-width: none; margin: 0; padding: 8px 10px; }`
    (mini nodes never get the `roadmap-node-left`/`-right` classes in the first place — see
    `buildRoadmapNodesHtml`'s `compact` flag — so no zigzag override is needed here, just full-width)
  - `.roadmap-track-mini .roadmap-node::after { height: 14px; bottom: -14px; }` (shorter connector to
    match the smaller gap)
  - `.roadmap-track-mini .roadmap-avatar { top: -20px; font-size: 18px; }`
  - `.roadmap-track-mini .roadmap-node-icon { font-size: 16px; }`,
    `.roadmap-track-mini .roadmap-node-name { font-size: 11px; }`,
    `.roadmap-track-mini .roadmap-node-meta { font-size: 8px; }`
  - `.roadmap-track-mini .roadmap-node { animation: none; }` — suppresses the `cardEnter` entrance
    animation entirely for mini nodes (it's otherwise unconditional on the base `.roadmap-node`
    rule). A preview panel embedded in a settings-like screen shouldn't replay an entrance animation
    every time its data refreshes mid-session (e.g. after every node click); `compact` mode also
    simply never sets the `--i` custom property, since it's now moot.
- `.roadmap-section-label` CSS rule is deleted — dead now that no renderer ever adds that class
  (grouping is expressed by which roadmap tab is selected, not by an in-track label).
- `ROADMAP_LEVEL_ICONS`/`ROADMAP_DEFAULT_LEVEL_ICON` constants in `js/roadmap.js` are deleted for the
  same reason (their only consumer, the section-label renderer, is gone).
- `.btn-roadmap` gets its own accent color (currently missing — the original feature shipped without
  one, `css/menu.css` has `::before`/`:hover` rules for every other menu button but not this one):
  `.btn-roadmap::before { background: #a78bfa; }` /
  `.btn-roadmap:hover { border-color: #a78bfa; box-shadow: inset 0 0 30px rgba(167,139,250,.08); }`
  — a violet accent, distinct from every existing button color, fitting the space theme. This is a
  drive-by fix on a button this change is already editing, not new scope.
- All `animations-disabled` overrides already present for `.roadmap-node`/`.roadmap-avatar`/etc.
  continue to cover the mini variant automatically (same class names, no new animated selector is
  introduced by the mini modifier beyond what's already overridden — the mini nodes simply don't
  carry the animating classes at all, per the point above).

## English copy changes

| Old (Vietnamese) | New (English) | Location |
|---|---|---|
| `🌌 LỘ TRÌNH` (button + screen title) | `🌌 ROADMAP` | `index.html` |
| *(no subtitle existed)* | `Your learning journey` | `index.html`, new button subtitle |
| `📦 QUESTION SETS` (button + screen title) | `📚 LIBRARY` | `index.html` |
| `Đang tải lộ trình…` | `Loading roadmap…` | `js/roadmap.js` |
| `❌ Không thể tải lộ trình. Vui lòng thử lại.` | `❌ Failed to load the roadmap. Please try again.` | `js/roadmap.js` |
| `${count} câu · ${stars}` | `${count} questions · ${stars}` | `js/roadmap.js` (`roadmap-node-meta`) |
| *(new)* | `This set isn't part of a roadmap yet.` | `js/roadmap.js`, Sets-tab empty state |
| *(new)* | Tab labels `Sets`, `Roadmaps` | `index.html` |

`showToast('❌ Failed to load roadmap', 'err')` was already English; unchanged. No other existing
Vietnamese copy in the app (menu, games, settings, stats) is touched — out of scope per Non-goals.

## Testing

- **`mcp-server/test/questions-repo.test.js`**: extend with `createQuestionSet` tests — persists a
  valid `roadmapId` into the manifest entry; throws a clear error for an unknown `roadmapId`; omitting
  `roadmapId` leaves the manifest entry without one (no default invented).
- **`tests/questions-data.test.js`**: extend to assert every `sets[].roadmapId`, when present, matches
  an id in the manifest's `roadmaps[]` array (referential integrity, catches a typo'd assignment).
- **`tests/roadmap.test.js`**: add unit tests (same `vm`-context harness already used there) for
  `getSetsForRoadmap` (filters correctly, descending `order`) and `buildRoadmapNodesHtml` (compact
  vs. non-compact class differences, correct `clickHandler` embedded in `onclick`, highlight applied
  only to the matching set).
- **`tests/init-question-sets.test.js`**: extend with a case asserting `roadmapDefinitions` populates
  from `manifest.roadmaps` and defaults to `[]` when the manifest omits that key (backward
  compatibility with the existing fixture, which has no `roadmaps` key).
- **Manual smoke test**: open the app; confirm the main-menu buttons read "🌌 ROADMAP" / "📚 LIBRARY";
  enter Roadmap, confirm the tab bar shows "N5 Path"/"N4 Path" and switching tabs is instant with no
  loading flash; enter Library's Sets tab, pick a set, confirm the mini roadmap below it highlights
  that set; switch to Library's Roadmaps tab, pick a chip, click a node there, confirm Library stays
  open and the Sets tab (if switched back to) now shows the newly-active set highlighted too.

## Risks / open questions resolved during brainstorming

- `roadmapId` is a new, independent field rather than reusing `level` for grouping (resolved: user
  explicitly wants roadmaps that don't have to mirror JLPT level 1:1, even though today's two
  roadmaps happen to align with N5/N4).
- Exactly two roadmaps today, split along existing level boundaries (resolved: user chose the simpler
  2-roadmap split over a 3-way split that would have separated the N4 Bài 26 sets from `n4-kanji`).
- Roadmap *names* are authored in English, consistent with the rest of the retranslated roadmap UI
  (resolved: user chose this over keeping Vietnamese names under an English chrome).
- Node clicks inside Library never navigate away — only the full-screen roadmap does (resolved: user
  chose "stay and update" for an embedded/browsing context, distinct from the full screen's
  "launch into the game" intent).
- No MCP tooling for managing the `roadmaps` registry itself, only for assigning existing sets to an
  existing roadmap (resolved: registry is small and rarely changes; scoped out to limit this change's
  size).
