# Roadmap Packages + World Map — Design

## Problem

`questions/manifest.json` now has 29 flat `roadmaps` entries (`n5-path`, `n4-l26-path` …
`n4-l50-path`, `n3-l1-path`, `n3-l2-path`, `unassigned`, …) — one per lesson, with no grouping. The
full-screen Roadmap and Library's Roadmaps tab both render this as one long row of 29 chips, which is
unmanageable to browse or to manage via MCP. Separately, the main menu (`screen-menu`) is a plain
vertical list of buttons; the user wants it redesigned as a Duolingo-style "World Map" (per the
attached mockup): a top HUD bar, a "Continue Quest" card, and a continuously-scrolling map made of
named zones, each zone showing its lessons as nodes on a winding path.

## Goals

1. A new grouping layer, **packages** (`questions/manifest.json` → `packages: [{id, name, order}]`),
   sits above `roadmaps`. Each roadmap gets an optional `packageId` (+ `order`, new field) placing it
   in a package. A package is a *mode/world selector* (e.g. "N5" / "N4" / "N3") — it is never itself
   drawn as a zone; a **roadmap** is the zone (matching "HIRAGANA PLAINS" in the mockup), and a
   **question set** is the node on a zone's path (unchanged from today — vocab/kanji/hán-việt/ngữ
   pháp already are the nodes rendered by `buildRoadmapNodesHtml`).
2. MCP tools to manage packages and to (re)assign a roadmap to a package, mirroring the existing
   roadmap/set tools: `list_packages`, `create_package`, `rename_package`, `delete_package`,
   `update_roadmap_metadata`. `create_roadmap` gains optional `packageId`/`order` params.
3. New default screen `screen-worldmap` (replaces `screen-roadmap`):
   - Compact HUD row (Level, EXP bar, HP bar, Streak) — moved here from `screen-menu`, restyled as
     one row instead of four.
   - Package chip row (reuses the existing chip look) — picks which package's zones are shown below.
   - **Continue Quest** card: name of the currently active question set + its roadmap (zone) name,
     "▶ START/CONTINUE" jumps to `screen-menu` (the existing game-mode picker) with that set already
     active. No invented "daily quest"/"badge" UI — there's no backing data for either.
   - A continuously-scrolling map: every roadmap in the selected package rendered as a zone (header +
     existing zigzag node track for its sets), zones stacked top-to-bottom in ascending `order`, one
     continuous connector line running through all of them.
   - No locking — every package/zone/node stays reachable at all times (unchanged behavior).
4. Library's "Roadmaps" tab gets the same package-chip-first filter (it has the identical
   "29 flat chips" problem) — small reuse of the same helpers, not a separate design.
5. Existing 29 roadmaps get an initial, sensible package assignment (see Data model) as part of this
   change's migration — the *mechanism* is fully manual/generic (via the new MCP tools), but shipping
   the feature with zero packages populated would leave the app in a half-migrated state.

## Non-goals

- No sequential locking between packages, zones, or nodes (confirmed with user).
- No Daily Quests / Badges / currency ("gold") UI — no backing data exists for any of them.
- No change to the per-roadmap node rendering itself (`buildRoadmapNodesHtml`, star/progress logic) —
  fully reused as-is.
- No change to where any existing "◀ BACK TO MENU" button (game screens, Settings, Stats, Library)
  navigates — they keep targeting `screen-menu`. Only the app's *boot* screen and the main-nav
  "ROADMAP" button's target change to `screen-worldmap`. Re-pointing every in-game back button at the
  World Map instead of the game-mode picker is a bigger, separate UX change and isn't required to
  satisfy this request.
- No rework of `screen-menu` beyond removing the HUD block it no longer needs (see UI section) —
  its nav-button list, footer (data-count/combo), and role as the game-mode picker are unchanged.

## Data model

### `questions/manifest.json`

New top-level array, sibling to `roadmaps`/`sets`:

```json
{
  "packages": [
    { "id": "n5", "name": "N5", "order": 1 },
    { "id": "n4", "name": "N4", "order": 2 },
    { "id": "n3", "name": "N3", "order": 3 },
    { "id": "unassigned", "name": "Chưa phân loại", "order": 99 }
  ],
  "roadmaps": [
    { "id": "n5-path", "name": "N5 Path", "packageId": "n5", "order": 1 },
    { "id": "n5-l1-path", "name": "N5 Bài 1", "packageId": "n5", "order": 2 },
    { "id": "n4-l26-path", "name": "N4 Bài 26", "packageId": "n4", "order": 1 },
    ...
    { "id": "n4-l50-path", "name": "N4 Bài 50", "packageId": "n4", "order": 25 },
    { "id": "n3-l1-path", "name": "N3 Bài 1", "packageId": "n3", "order": 1 },
    { "id": "n3-l2-path", "name": "N3 Bài 2", "packageId": "n3", "order": 2 },
    { "id": "unassigned", "name": "Chưa phân loại", "packageId": "unassigned", "order": 1 }
  ]
}
```

Full migration table for every existing roadmap:

| roadmap id | packageId | order |
|---|---|---|
| `n5-path` | `n5` | 1 |
| `n5-l1-path` | `n5` | 2 |
| `n4-l26-path` … `n4-l50-path` | `n4` | 1 … 25 (`= lesson number − 25`) |
| `n3-l1-path` | `n3` | 1 |
| `n3-l2-path` | `n3` | 2 |
| `unassigned` | `unassigned` | 1 |

`order` within `n5`/`n3` is a best-guess default (lesson-based path before the older bulk path for
N5; lesson number for N3) — easy to correct later with `update_roadmap_metadata`, not load-bearing.

### `mcp-server/src/questions-repo.js`

- New constants `UNASSIGNED_PACKAGE_ID = 'unassigned'`, `UNASSIGNED_PACKAGE_NAME = 'Chưa phân loại'`
  (mirrors the existing `UNASSIGNED_ROADMAP_ID`/`_NAME` pair — different registry, so no id clash).
- `assertKnownPackageId(manifest, packageId)` — same shape as `assertKnownRoadmapId`.
- `findPackage(manifest, id)`, `listPackages()` — mirror `findRoadmap`/`listRoadmaps`.
- `createPackage({ id, name, order })` — mirrors `createRoadmap`: slugify id-or-name, reject
  duplicates, push `{id, name, ...(order !== undefined ? {order} : {})}`. `order` optional integer,
  no default invented when omitted (same "unset is valid" convention as everywhere else in this
  design) — an unordered package just sorts last (`?? 0`) in the chip row.
- `renamePackage(id, name)` — mirrors `renameRoadmap`. There is no `update_package_metadata` tool to
  change `order` after creation — packages are few (4 today) and rarely reordered, so editing
  `order` directly in the manifest covers it; adding a dedicated tool later is a small, additive
  change if this proves inconvenient.
- `deletePackage(id)` — mirrors `deleteRoadmap`: any roadmap still assigned to this package is
  reassigned to `unassigned` (auto-creating that package entry if missing, exactly like
  `deleteRoadmap` does for `unassigned` roadmap/sets). Deleting the `unassigned` package itself while
  roadmaps still reference it throws, same guard as today's `deleteRoadmap`.
- `createRoadmap({ id, name, packageId, order })` — extends the existing `createRoadmap`. `packageId`
  optional; when given, validated with `assertKnownPackageId`. `order` optional integer; no default
  invented when omitted (matches how `roadmapId` on a set is optional-with-no-default) — a roadmap
  with no `order` simply sorts last (`?? 0` at render time, same convention `getSetsForRoadmap`
  already uses for missing `order` on sets).
- `updateRoadmapMetadata(id, { packageId, order })` — new function, mirrors
  `updateQuestionSetMetadata`: looks up the roadmap by id, `packageId: null` clears the field,
  a string validates against `assertKnownPackageId` and sets it; `order` (integer) sets directly;
  omitted fields are left untouched. No `updatedAt` (roadmap entries don't carry one today, unlike
  sets — not introduced here either, out of scope).

### `mcp-server/src/index.js`

New tools, registered next to the existing `*_roadmap` tools:

```js
server.registerTool('list_packages', { ... }, guarded(() => repo.listPackages()));
server.registerTool('create_package', { inputSchema: { id: z.string().optional(), name: z.string().min(1) } }, ...);
server.registerTool('rename_package', { inputSchema: { id: z.string(), name: z.string().min(1) } }, ...);
server.registerTool('delete_package', { inputSchema: { id: z.string() } }, ...);
server.registerTool('update_roadmap_metadata', {
  inputSchema: { id: z.string(), packageId: z.string().nullable().optional(), order: z.number().int().optional() }
}, guarded(({ id, packageId, order }) => repo.updateRoadmapMetadata(id, { packageId, order })));
```

`create_roadmap`'s `inputSchema` gains `packageId: z.string().optional()`, `order: z.number().int().optional()`.

## Front-end changes

### `js/storage.js`

`initQuestionSets()` gains one line, same pattern as `roadmapDefinitions`:
```js
packageDefinitions = Array.isArray(manifest.packages) ? manifest.packages : [];
```

### `js/main.js`

- New global: `let packageDefinitions = [];` (alongside `questionSets`/`roadmapDefinitions`).
- `showScreen(id)`: replace the `if (id === 'screen-roadmap') renderRoadmap();` hook with
  `if (id === 'screen-worldmap') { updateMenuUI(); renderWorldMap(); }`. `updateMenuUI()` is called
  here (in addition to its existing call on `'screen-menu'`) because the HP/EXP/Level/Streak elements
  it updates (`#menu-hp`, `#menu-exp`, `#menu-level`, `#menu-streak`) are moving into the World Map
  screen's markup — `updateMenuUI()` itself needs no code change since it targets elements by id,
  regardless of which screen currently contains them.
- `DOMContentLoaded` handler: `showScreen('screen-menu')` → `showScreen('screen-worldmap')`.

### `js/worldmap.js` (new file)

A new module, parallel to `js/roadmap.js`, reusing its exports (`getSetsForRoadmap`,
`computeRoadmapProgress`, `buildRoadmapNodesHtml`, `renderRoadmapChipsHtml`, `launchRoadmapNode`)
rather than duplicating them:

- `let activeWorldMapPackageId = null;` (module-local, mirrors `activeRoadmapTabId`).
- `getRoadmapsForPackage(packageId)` — `roadmapDefinitions.filter(r => r.packageId === packageId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))`.
  **Ascending** order (top-to-bottom reading, zone 1 first) — deliberately the opposite convention
  from `getSetsForRoadmap`'s descending sort (which keeps the existing "climb up from the bottom"
  feel *inside* one zone's own node path unchanged).
- `pickDefaultWorldMapPackageId(fallbackId)` — same shape as `pickDefaultRoadmapId`: keep the current
  selection if still valid, else the package containing the active set's roadmap, else the
  lowest-`order` package, else `null`.
- `renderWorldMap()`:
  1. `roadmapProgressCache = await computeRoadmapProgress(questionSets)` — same call the full-screen
     roadmap makes today (progress for every set, not just the selected package — already the
     existing cost/pattern, not a regression).
  2. `activeWorldMapPackageId = pickDefaultWorldMapPackageId(activeWorldMapPackageId)`; if `null`,
     render the existing `.roadmap-loading` empty state and stop.
  3. Render package chips into `#worldmap-package-chips` via
     `renderRoadmapChipsHtml(packageDefinitions, activeWorldMapPackageId, 'selectWorldMapPackage')`
     (reused unmodified — it only ever needed `{id, name}` + a selected id + a click handler name).
  4. Render the Continue Quest card (`renderContinueQuestCard()`).
  5. Render zones (`renderWorldMapZones()`).
  6. Scroll the active-set node into view (same `requestAnimationFrame` pattern as `renderRoadmapTrack`).
- `renderWorldMapZones()`: for each roadmap in `getRoadmapsForPackage(activeWorldMapPackageId)`, build
  ```html
  <section class="worldmap-zone">
    <header class="worldmap-zone-header">
      <span class="worldmap-zone-name">${roadmap.name}</span>
      <span class="worldmap-zone-progress">${masteredCount}/${totalCount}</span>
    </header>
    ${buildRoadmapNodesHtml(setsForThisRoadmap, roadmapProgressCache, { highlightSetId: activeSetId, compact: false, clickHandler: 'launchRoadmapNode' })}
  </section>
  ```
  and concatenate into `#worldmap-track`. `masteredCount` = number of that roadmap's sets whose
  cached `stars === 3`; `totalCount` = its set count. Zone header border/accent color: `--accent3`
  (green) when `masteredCount === totalCount && totalCount > 0`, `--accent2` (yellow) when
  `masteredCount > 0` or any set has `progress.total > 0`, else `--border` (untouched). Clicking a
  node reuses `launchRoadmapNode` unmodified (switch active set, `showScreen('screen-menu')`).
- `selectWorldMapPackage(id)`: sets `activeWorldMapPackageId = id`, re-renders chips + zones from the
  already-computed `roadmapProgressCache` (no re-fetch — same instant-switch pattern as
  `selectRoadmapTab`).
- `renderContinueQuestCard()`: reads `questionSets.find(s => s.id === activeSetId)` and its
  `roadmapDefinitions` entry; renders name + zone name into `#worldmap-continue-quest`, or a
  "Pick a lesson to begin" empty state if there's no active set (only possible when `questionSets`
  is empty). The button's `onclick="showScreen('screen-menu')"` — `activeSetId` is already the
  active set, so no `switchQuestionSet` call is needed.

### `index.html`

- Add `<script src="js/worldmap.js"></script>` right after `<script src="js/roadmap.js"></script>`.
- `#screen-roadmap` → `#screen-worldmap` (id, and every reference: the main-nav button's `onclick`,
  the `showScreen()` hook). Title `🌌 ROADMAP` → `🗺️ WORLD MAP`. CSS class `screen-roadmap` is kept
  (background gradient styling, no rename needed — same precedent as keeping `screen-data`'s class
  when `screen-library` was introduced).
- `#screen-worldmap`'s panel markup:
  ```html
  <div class="worldmap-hud" id="worldmap-hud"> <!-- Level / EXP bar / HP bar / Streak, one row --> </div>
  <div class="roadmap-tabs" id="worldmap-package-chips"></div>
  <div class="worldmap-continue-quest" id="worldmap-continue-quest"></div>
  <div class="roadmap-track" id="worldmap-track"></div>
  ```
  (`#roadmap-tabs`/`#roadmap-track` ids are freed up since the full-screen single-roadmap view they
  belonged to no longer exists as its own screen. In `js/roadmap.js`, delete `renderRoadmap()`,
  `renderRoadmapTrack()`, `selectRoadmapTab()`, and the module-local `let activeRoadmapTabId` — the
  only things that rendered the now-removed single-roadmap full screen. Keep everything else in that
  file: `computeSetProgress`, `starsForProgress`, `renderStarString`, `getRoadmapQuestionsForSet`,
  `getSetsForRoadmap`, `computeRoadmapProgress`, `buildRoadmapNodesHtml`, `renderRoadmapChipsHtml`,
  `pickDefaultRoadmapId`, `launchRoadmapNode`, `selectRoadmapNodeInPlace`, and the whole Library-tab
  group (`renderLibrarySetsTab`, `selectLibraryTab`, `refreshLibraryRoadmapPreview`,
  `renderLibraryRoadmapsTab`, `selectLibraryRoadmap`) — all still in active use, either by
  `js/worldmap.js` or by Library.)
- `#screen-menu`'s `.hp-exp-bar` block is removed (moved to World Map, see above). Its main-nav
  "ROADMAP" button becomes "🗺️ WORLD MAP" / `onclick="showScreen('screen-worldmap')"`.
- `#screen-library`'s Roadmaps tab (`#library-roadmaps-tab`) gains a package chip row above the
  existing roadmap chip row: `<div id="library-package-chips" class="roadmap-tabs"></div>` before
  `#library-roadmap-chips`. In `js/roadmap.js`:
  - New module-local `let activeLibraryPackageId = null;` (alongside `activeLibraryRoadmapId`).
  - `renderLibraryRoadmapsTab()` gains a first step: `activeLibraryPackageId =
    pickDefaultWorldMapPackageId(activeLibraryPackageId)` (from `js/worldmap.js`), then renders
    `#library-package-chips` via `renderRoadmapChipsHtml(packageDefinitions, activeLibraryPackageId,
    'selectLibraryPackage')`. The roadmap chip row it already renders into `#library-roadmap-chips`
    switches from iterating all of `roadmapDefinitions` to iterating
    `getRoadmapsForPackage(activeLibraryPackageId)` only. `activeLibraryRoadmapId`'s own
    default-picking (`pickDefaultRoadmapId`) is unchanged, since it still just needs to land on *some*
    valid roadmap id — now simply chosen from a shorter, package-filtered list.
  - New `selectLibraryPackage(id)`: sets `activeLibraryPackageId = id`, resets `activeLibraryRoadmapId
    = null` (the previously-selected roadmap may not belong to the new package), calls
    `renderLibraryRoadmapsTab()`.

### CSS (`css/roadmap.css`)

- `.worldmap-hud`: flex row, wraps on narrow screens; reuses `--font-px`/`--panel`/`--border` tokens
  — one compact row replacing the four stacked rows `.hp-exp-bar` used.
- `.worldmap-continue-quest`: panel card (`--panel`, `--border`, `--radius-lg`), name/zone text +
  a start button styled like `.action-btn.btn-green` (existing button, green glow) — no new button
  component needed.
- `.worldmap-zone` + `.worldmap-zone-header`: header row above each zone's existing
  `.roadmap-node`-based track; border-left accent color set inline per zone (green/yellow/neutral,
  see above) reusing `--accent3`/`--accent2`/`--border` — no new color tokens.
- `#worldmap-track` reuses the existing `.roadmap-track` class (flex column, gap, connector line via
  `.roadmap-node::after`) unmodified — zones are just more content inside the same scroll container.

## Testing

- **`mcp-server/test/questions-repo.test.js`**: add tests for `createPackage`/`renamePackage`/
  `deletePackage` (including the reassign-to-`unassigned` behavior on delete, mirroring the existing
  `deleteRoadmap` tests) and for `updateRoadmapMetadata` (sets/clears `packageId`, validates against
  known packages, sets `order`). Extend `createRoadmap` tests: accepts valid `packageId`, rejects an
  unknown one, `order` persists when given and is left unset when omitted.
- **`tests/questions-data.test.js`**: add `testEveryRoadmapPackageIdReferencesAKnownPackage` (same
  shape as the existing `testEverySetRoadmapIdReferencesAKnownRoadmap`) to catch a typo'd migration
  assignment.
- **`tests/roadmap.test.js`** (or a new `tests/worldmap.test.js` using the same `vm`-context harness):
  add `getRoadmapsForPackage` (filters correctly, ascending `order`) and a render test confirming
  `renderWorldMapZones`'s output contains one `.worldmap-zone` per roadmap in the selected package, in
  ascending order, each containing the right sets' nodes.
- **`tests/init-question-sets.test.js`**: extend with a case asserting `packageDefinitions` populates
  from `manifest.packages` and defaults to `[]` when absent (backward compatibility, matching the
  existing `roadmapDefinitions` test).
- **Manual smoke test**: app boots into World Map; HUD row shows real Level/EXP/HP/Streak; package
  chips show N5/N4/N3/Chưa phân loại; selecting "N4" shows 25 stacked zones each with its 4 nodes;
  Continue Quest shows the persisted active set and its zone name, and its button lands on the
  existing game-mode picker with that set already active; clicking a node deep in the N4 scroll
  switches the active set and navigates to the game-mode picker exactly like today's roadmap node
  click; Library's Roadmaps tab shows the same package-chip-then-roadmap-chip flow.

## Risks / decisions resolved during brainstorming

- Node granularity: a node is a **question set**, unchanged from today — not a roadmap (resolved
  after an initial misunderstanding; the user confirmed roadmaps are the map's *zones*, not its
  nodes).
- Package's role: a **mode/world selector**, never itself rendered as a zone (resolved).
- Zone layout: **all zones in the selected package stack in one continuous scroll**, not one zone at
  a time behind a secondary picker (resolved — matches the mockup's implied scroll-for-more).
- No sequential locking of packages or zones (resolved — free navigation, matching current behavior).
- Sidebar scope: **Continue Quest + real HUD stats only** — no Daily Quests/Badges, since neither has
  backing data today (resolved).
- Initial package membership for the 29 existing roadmaps is seeded by JLPT level as part of this
  change (resolved as a one-time migration convenience) even though the ongoing mechanism for
  assigning roadmaps to packages is fully manual, via the new MCP tools — not derived from any
  automatic rule in code.
- Theme: no palette/font change — existing `variables.css` tokens (dark bg, neon accents, pixel +
  Noto Sans JP fonts) already match the mockup's visual language; only layout/composition is new.
