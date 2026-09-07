# Roadmap Packages + World Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "package" grouping layer above the app's 29 flat roadmaps (with matching MCP tools), and replace the plain-button main menu with a Duolingo-style, continuously-scrolling "World Map" screen built from that grouping.

**Architecture:** `questions/manifest.json` gains a `packages` array; each `roadmaps` entry gains optional `packageId`/`order`. `mcp-server/src/questions-repo.js`/`index.js` get package CRUD + a roadmap-metadata-update tool, mirroring the existing roadmap tools byte-for-byte in style. The front end gets one new module, `js/worldmap.js`, that reuses every existing rendering primitive in `js/roadmap.js` (`getSetsForRoadmap`, `computeRoadmapProgress`, `buildRoadmapNodesHtml`, `renderRoadmapChipsHtml`) — it only adds the package layer on top. `screen-worldmap` replaces `screen-roadmap` as the app's default/boot screen; `screen-menu` keeps its existing role as the game-mode picker.

**Tech Stack:** Vanilla JS (no framework, no bundler), Node's built-in `assert` for tests (no test framework — each `*.test.js` file is a standalone script; a thrown assertion exits non-zero), `@modelcontextprotocol/sdk` + `zod` for the MCP server.

**Spec:** `docs/superpowers/specs/2026-08-28-roadmap-packages-worldmap-design.md`

## Global Constraints

- A **package** is a mode/world selector — it is never rendered as a zone. A **roadmap** is a zone. A **question set** is a node. Never conflate these.
- No sequential locking anywhere (packages, zones, or nodes) — everything stays reachable at all times.
- No Daily Quests / Badges / currency UI — there is no backing data for any of them; don't add placeholders for them.
- Every existing "◀ BACK TO MENU" button in game/Settings/Stats/Library screens keeps targeting `screen-menu`, unchanged. Only the app's boot screen and the main-nav "ROADMAP" button's target change to `screen-worldmap`.
- No new CSS color tokens — every new rule reuses existing `css/variables.css` tokens (`--accent2`, `--accent3`, `--panel`, `--border`, etc.).
- `packageId`/`order` on a roadmap, like `roadmapId` on a set, are optional with **no invented default** when omitted — a value must be explicitly given or explicitly cleared with `null`; never silently defaulted.
- Every new/touched piece of UI copy is in English (matching the existing roadmap/Library convention) except roadmap/package **names**, which stay whatever the manifest already has (Vietnamese lesson names like "N4 Bài 26").

---

### Task 1: Data migration — packages + roadmap `packageId`/`order`

**Files:**
- Modify: `questions/manifest.json`
- Modify: `tests/questions-data.test.js`

**Interfaces:**
- Produces: `manifest.packages: Array<{id, name, order}>`; every `manifest.roadmaps[]` entry gains `packageId` (string) and `order` (integer). Later tasks (front-end `packageDefinitions`, MCP package tools) depend on this shape existing in the real data file, though their own tests use hand-written fixtures and don't require it.

- [ ] **Step 1: Replace the `roadmaps` array and add the `packages` array**

In `questions/manifest.json`, replace the existing `"roadmaps"` array (currently right after the
opening `{`) — this inserts a new `"packages"` array immediately before it and adds
`packageId`/`order` to every existing roadmap entry, in place, keeping every other part of the file
(the `"sets"` array) untouched.

Replace:

```json
  "roadmaps": [
    {
      "id": "n5-path",
      "name": "N5 Path"
    },
    {
      "id": "n4-l26-path",
      "name": "N4 Bài 26"
    },
    {
      "id": "n4-l27-path",
      "name": "N4 Bài 27"
    },
    {
      "id": "n4-l28-path",
      "name": "N4 Bài 28"
    },
    {
      "id": "n4-l29-path",
      "name": "N4 Bài 29"
    },
    {
      "id": "n4-l30-path",
      "name": "N4 Bài 30"
    },
    {
      "id": "n4-l31-path",
      "name": "N4 Bài 31"
    },
    {
      "id": "n4-l32-path",
      "name": "N4 Bài 32"
    },
    {
      "id": "n4-l33-path",
      "name": "N4 Bài 33"
    },
    {
      "id": "n4-l34-path",
      "name": "N4 Bài 34"
    },
    {
      "id": "n4-l35-path",
      "name": "N4 Bài 35"
    },
    {
      "id": "n4-l36-path",
      "name": "N4 Bài 36"
    },
    {
      "id": "n4-l37-path",
      "name": "N4 Bài 37"
    },
    {
      "id": "n4-l38-path",
      "name": "N4 Bài 38"
    },
    {
      "id": "n4-l39-path",
      "name": "N4 Bài 39"
    },
    {
      "id": "n4-l40-path",
      "name": "N4 Bài 40"
    },
    {
      "id": "n4-l41-path",
      "name": "N4 Bài 41"
    },
    {
      "id": "n4-l42-path",
      "name": "N4 Bài 42"
    },
    {
      "id": "n4-l43-path",
      "name": "N4 Bài 43"
    },
    {
      "id": "n4-l44-path",
      "name": "N4 Bài 44"
    },
    {
      "id": "n4-l45-path",
      "name": "N4 Bài 45"
    },
    {
      "id": "n4-l46-path",
      "name": "N4 Bài 46"
    },
    {
      "id": "n4-l47-path",
      "name": "N4 Bài 47"
    },
    {
      "id": "n4-l48-path",
      "name": "N4 Bài 48"
    },
    {
      "id": "n4-l49-path",
      "name": "N4 Bài 49"
    },
    {
      "id": "n4-l50-path",
      "name": "N4 Bài 50"
    },
    {
      "id": "unassigned",
      "name": "Chưa phân loại"
    },
    {
      "id": "n5-l1-path",
      "name": "N5 Bài 1"
    },
    {
      "id": "n3-l1-path",
      "name": "N3 Bài 1"
    },
    {
      "id": "n3-l2-path",
      "name": "N3 Bài 2"
    }
  ],
```

with:

```json
  "packages": [
    { "id": "n5", "name": "N5", "order": 1 },
    { "id": "n4", "name": "N4", "order": 2 },
    { "id": "n3", "name": "N3", "order": 3 },
    { "id": "unassigned", "name": "Chưa phân loại", "order": 99 }
  ],
  "roadmaps": [
    {
      "id": "n5-path",
      "name": "N5 Path",
      "packageId": "n5",
      "order": 1
    },
    {
      "id": "n4-l26-path",
      "name": "N4 Bài 26",
      "packageId": "n4",
      "order": 1
    },
    {
      "id": "n4-l27-path",
      "name": "N4 Bài 27",
      "packageId": "n4",
      "order": 2
    },
    {
      "id": "n4-l28-path",
      "name": "N4 Bài 28",
      "packageId": "n4",
      "order": 3
    },
    {
      "id": "n4-l29-path",
      "name": "N4 Bài 29",
      "packageId": "n4",
      "order": 4
    },
    {
      "id": "n4-l30-path",
      "name": "N4 Bài 30",
      "packageId": "n4",
      "order": 5
    },
    {
      "id": "n4-l31-path",
      "name": "N4 Bài 31",
      "packageId": "n4",
      "order": 6
    },
    {
      "id": "n4-l32-path",
      "name": "N4 Bài 32",
      "packageId": "n4",
      "order": 7
    },
    {
      "id": "n4-l33-path",
      "name": "N4 Bài 33",
      "packageId": "n4",
      "order": 8
    },
    {
      "id": "n4-l34-path",
      "name": "N4 Bài 34",
      "packageId": "n4",
      "order": 9
    },
    {
      "id": "n4-l35-path",
      "name": "N4 Bài 35",
      "packageId": "n4",
      "order": 10
    },
    {
      "id": "n4-l36-path",
      "name": "N4 Bài 36",
      "packageId": "n4",
      "order": 11
    },
    {
      "id": "n4-l37-path",
      "name": "N4 Bài 37",
      "packageId": "n4",
      "order": 12
    },
    {
      "id": "n4-l38-path",
      "name": "N4 Bài 38",
      "packageId": "n4",
      "order": 13
    },
    {
      "id": "n4-l39-path",
      "name": "N4 Bài 39",
      "packageId": "n4",
      "order": 14
    },
    {
      "id": "n4-l40-path",
      "name": "N4 Bài 40",
      "packageId": "n4",
      "order": 15
    },
    {
      "id": "n4-l41-path",
      "name": "N4 Bài 41",
      "packageId": "n4",
      "order": 16
    },
    {
      "id": "n4-l42-path",
      "name": "N4 Bài 42",
      "packageId": "n4",
      "order": 17
    },
    {
      "id": "n4-l43-path",
      "name": "N4 Bài 43",
      "packageId": "n4",
      "order": 18
    },
    {
      "id": "n4-l44-path",
      "name": "N4 Bài 44",
      "packageId": "n4",
      "order": 19
    },
    {
      "id": "n4-l45-path",
      "name": "N4 Bài 45",
      "packageId": "n4",
      "order": 20
    },
    {
      "id": "n4-l46-path",
      "name": "N4 Bài 46",
      "packageId": "n4",
      "order": 21
    },
    {
      "id": "n4-l47-path",
      "name": "N4 Bài 47",
      "packageId": "n4",
      "order": 22
    },
    {
      "id": "n4-l48-path",
      "name": "N4 Bài 48",
      "packageId": "n4",
      "order": 23
    },
    {
      "id": "n4-l49-path",
      "name": "N4 Bài 49",
      "packageId": "n4",
      "order": 24
    },
    {
      "id": "n4-l50-path",
      "name": "N4 Bài 50",
      "packageId": "n4",
      "order": 25
    },
    {
      "id": "unassigned",
      "name": "Chưa phân loại",
      "packageId": "unassigned",
      "order": 1
    },
    {
      "id": "n5-l1-path",
      "name": "N5 Bài 1",
      "packageId": "n5",
      "order": 2
    },
    {
      "id": "n3-l1-path",
      "name": "N3 Bài 1",
      "packageId": "n3",
      "order": 1
    },
    {
      "id": "n3-l2-path",
      "name": "N3 Bài 2",
      "packageId": "n3",
      "order": 2
    }
  ],
```

- [ ] **Step 2: Add referential-integrity tests to `tests/questions-data.test.js`**

Add these two functions right after `testEverySetRoadmapIdReferencesAKnownRoadmap` (which already exists in the file) and before `testGrammarQuestionsHaveChunksMatchingSentence`:

```js
function testEveryPackageHasUniqueIdAndNonEmptyName() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  const packages = manifest.packages || [];
  const ids = packages.map(p => p.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'package ids must be unique');
  packages.forEach(p => {
    assert.ok(typeof p.name === 'string' && p.name.length > 0, `${p.id}.name must be a non-empty string`);
  });
}

function testEveryRoadmapPackageIdReferencesAKnownPackage() {
  const manifest = JSON.parse(fs.readFileSync(path.join(questionsDir, 'manifest.json'), 'utf8'));
  const packageIds = new Set((manifest.packages || []).map(p => p.id));
  (manifest.roadmaps || []).forEach(entry => {
    if (entry.packageId === undefined) return;
    assert.ok(packageIds.has(entry.packageId), `${entry.id}.packageId "${entry.packageId}" must reference a known package`);
  });
}
```

Then add both calls right after the existing `testEverySetRoadmapIdReferencesAKnownRoadmap();` invocation line (near the bottom of the file, just before `testGrammarQuestionsHaveChunksMatchingSentence();`):

```js
testEveryPackageHasUniqueIdAndNonEmptyName();
testEveryRoadmapPackageIdReferencesAKnownPackage();
```

- [ ] **Step 3: Run the test and verify it passes**

Run: `node tests/questions-data.test.js`
Expected: prints `questions data tests passed` and exits 0.

- [ ] **Step 4: Commit**

```bash
git add questions/manifest.json tests/questions-data.test.js
git commit -m "feat: group existing roadmaps into N5/N4/N3/unassigned packages"
```

---

### Task 2: MCP repo — package CRUD + `updateRoadmapMetadata` + `createRoadmap` extension

**Files:**
- Modify: `mcp-server/src/questions-repo.js`
- Test: `mcp-server/test/questions-repo.test.js`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces (added to `createQuestionsRepo(baseDir)`'s returned object): `listPackages()`, `createPackage({id, name, order})`, `renamePackage(id, name)`, `deletePackage(id)`, `updateRoadmapMetadata(id, {packageId, order})`. `createRoadmap({id, name, packageId, order})` signature extended (previously `{id, name}`). Task 3 (MCP tool registration) calls all of these by name.

- [ ] **Step 1: Write the failing tests**

In `mcp-server/test/questions-repo.test.js`, insert the following function definitions right after `testDeleteRoadmapBlocksDeletingUnassignedFallbackWhileInUse() { ... }` (the last roadmap-test function, currently ending the file's roadmap-test block) and before the blank line that precedes `testValidateQuestionAcceptsWellFormedQuestion();`:

```js
function testCreateRoadmapPersistsValidPackageIdAndOrder() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createPackage({ id: 'n3', name: 'N3' });

  const created = repo.createRoadmap({ id: 'n3-path', name: 'N3 Path', packageId: 'n3', order: 1 });
  assert.strictEqual(created.packageId, 'n3');
  assert.strictEqual(created.order, 1);
}

function testCreateRoadmapRejectsUnknownPackageId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  assert.throws(
    () => repo.createRoadmap({ name: 'N3 Path', packageId: 'nope' }),
    /Unknown packageId: nope/
  );
}

function testCreateRoadmapLeavesPackageIdUnsetWhenOmitted() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  const created = repo.createRoadmap({ name: 'N3 Path' });
  assert.strictEqual('packageId' in created, false);
}

function testUpdateRoadmapMetadataPersistsPackageIdAndOrder() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createPackage({ id: 'n3', name: 'N3' });
  repo.createRoadmap({ id: 'n3-path', name: 'N3 Path' });

  const updated = repo.updateRoadmapMetadata('n3-path', { packageId: 'n3', order: 5 });
  assert.strictEqual(updated.packageId, 'n3');
  assert.strictEqual(updated.order, 5);
  assert.strictEqual(repo.listRoadmaps()[0].packageId, 'n3');
}

function testUpdateRoadmapMetadataRejectsUnknownPackageId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createRoadmap({ id: 'n3-path', name: 'N3 Path' });
  assert.throws(
    () => repo.updateRoadmapMetadata('n3-path', { packageId: 'nope' }),
    /Unknown packageId: nope/
  );
}

function testUpdateRoadmapMetadataClearsPackageIdWithNull() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createPackage({ id: 'n3', name: 'N3' });
  repo.createRoadmap({ id: 'n3-path', name: 'N3 Path', packageId: 'n3' });

  const updated = repo.updateRoadmapMetadata('n3-path', { packageId: null });
  assert.strictEqual('packageId' in updated, false);
}

function testUpdateRoadmapMetadataErrorsOnUnknownRoadmapId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  assert.throws(() => repo.updateRoadmapMetadata('nope', { order: 1 }), /Roadmap not found: nope/);
}

function testListPackagesReturnsEmptyArrayWhenNoneConfigured() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  assert.deepStrictEqual(repo.listPackages(), []);
}

function testCreatePackageAddsEntryAndDerivesIdFromName() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  const created = repo.createPackage({ name: 'N3' });
  assert.strictEqual(created.id, 'n3');
  assert.strictEqual(created.name, 'N3');
  assert.deepStrictEqual(repo.listPackages(), [{ id: 'n3', name: 'N3' }]);
}

function testCreatePackageAcceptsExplicitIdAndOrder() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  const created = repo.createPackage({ id: 'custom-id', name: 'N3', order: 3 });
  assert.strictEqual(created.id, 'custom-id');
  assert.strictEqual(created.order, 3);
}

function testCreatePackageRejectsDuplicateId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createPackage({ name: 'N3' });
  assert.throws(() => repo.createPackage({ id: 'n3', name: 'N3 Again' }), /already exists/);
}

function testRenamePackageUpdatesName() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createPackage({ id: 'n3', name: 'N3' });

  const renamed = repo.renamePackage('n3', 'N3 (Renamed)');
  assert.strictEqual(renamed.name, 'N3 (Renamed)');
  assert.strictEqual(repo.listPackages()[0].name, 'N3 (Renamed)');
}

function testRenamePackageErrorsOnUnknownId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  assert.throws(() => repo.renamePackage('nope', 'New Name'), /Package not found: nope/);
}

function testDeletePackageRemovesEntryWhenNoRoadmapsAssigned() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createPackage({ id: 'n3', name: 'N3' });

  repo.deletePackage('n3');
  assert.deepStrictEqual(repo.listPackages(), []);
}

function testDeletePackageErrorsOnUnknownId() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  assert.throws(() => repo.deletePackage('nope'), /Package not found: nope/);
}

function testDeletePackageReassignsAssignedRoadmapsToUnassignedFallback() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createPackage({ id: 'n3', name: 'N3' });
  repo.createRoadmap({ id: 'n3-path', name: 'N3 Path', packageId: 'n3' });

  repo.deletePackage('n3');

  const packageIds = repo.listPackages().map(p => p.id);
  assert.deepStrictEqual(packageIds, ['unassigned']);
  const entry = repo.listRoadmaps().find(r => r.id === 'n3-path');
  assert.strictEqual(entry.packageId, 'unassigned');
}

function testDeletePackageCreatesUnassignedFallbackIfMissing() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createPackage({ id: 'n3', name: 'N3' });
  repo.createRoadmap({ id: 'n3-path', name: 'N3 Path', packageId: 'n3' });

  repo.deletePackage('n3');

  const fallback = repo.listPackages().find(p => p.id === 'unassigned');
  assert.ok(fallback, 'expected an "unassigned" fallback package to be created');
  assert.strictEqual(fallback.name, 'Chưa phân loại');
}

function testDeletePackageDoesNotDuplicateFallbackIfAlreadyPresent() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createPackage({ id: 'unassigned', name: 'Chưa phân loại' });
  repo.createPackage({ id: 'n3', name: 'N3' });
  repo.createRoadmap({ id: 'n3-path', name: 'N3 Path', packageId: 'n3' });

  repo.deletePackage('n3');

  const packageIds = repo.listPackages().map(p => p.id);
  assert.deepStrictEqual(packageIds, ['unassigned']);
}

function testDeletePackageBlocksDeletingUnassignedFallbackWhileInUse() {
  const dir = makeTempQuestionsDir();
  const repo = createQuestionsRepo(dir);
  repo.createPackage({ id: 'unassigned', name: 'Chưa phân loại' });
  repo.createRoadmap({ id: 'n3-path', name: 'N3 Path', packageId: 'unassigned' });

  assert.throws(() => repo.deletePackage('unassigned'), /still assigned/);
}
```

Then add these invocation lines right after the existing `testDeleteRoadmapBlocksDeletingUnassignedFallbackWhileInUse();` line (in the invocation block near the bottom of the file) and before the blank line that precedes `testValidateQuestionAcceptsWellFormedQuestion();`:

```js
testCreateRoadmapPersistsValidPackageIdAndOrder();
testCreateRoadmapRejectsUnknownPackageId();
testCreateRoadmapLeavesPackageIdUnsetWhenOmitted();
testUpdateRoadmapMetadataPersistsPackageIdAndOrder();
testUpdateRoadmapMetadataRejectsUnknownPackageId();
testUpdateRoadmapMetadataClearsPackageIdWithNull();
testUpdateRoadmapMetadataErrorsOnUnknownRoadmapId();
testListPackagesReturnsEmptyArrayWhenNoneConfigured();
testCreatePackageAddsEntryAndDerivesIdFromName();
testCreatePackageAcceptsExplicitIdAndOrder();
testCreatePackageRejectsDuplicateId();
testRenamePackageUpdatesName();
testRenamePackageErrorsOnUnknownId();
testDeletePackageRemovesEntryWhenNoRoadmapsAssigned();
testDeletePackageErrorsOnUnknownId();
testDeletePackageReassignsAssignedRoadmapsToUnassignedFallback();
testDeletePackageCreatesUnassignedFallbackIfMissing();
testDeletePackageDoesNotDuplicateFallbackIfAlreadyPresent();
testDeletePackageBlocksDeletingUnassignedFallbackWhileInUse();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node mcp-server/test/questions-repo.test.js`
Expected: FAIL — `TypeError: repo.createPackage is not a function` (or similar, for whichever call runs first).

- [ ] **Step 3: Implement the repo changes**

In `mcp-server/src/questions-repo.js`, replace:

```js
const UNASSIGNED_ROADMAP_ID = 'unassigned';
const UNASSIGNED_ROADMAP_NAME = 'Chưa phân loại';
```

with:

```js
const UNASSIGNED_ROADMAP_ID = 'unassigned';
const UNASSIGNED_ROADMAP_NAME = 'Chưa phân loại';
const UNASSIGNED_PACKAGE_ID = 'unassigned';
const UNASSIGNED_PACKAGE_NAME = 'Chưa phân loại';
```

Replace:

```js
function assertKnownRoadmapId(manifest, roadmapId) {
  const knownRoadmaps = Array.isArray(manifest.roadmaps) ? manifest.roadmaps : [];
  if (!knownRoadmaps.some(r => r.id === roadmapId)) {
    throw new Error(`Unknown roadmapId: ${roadmapId}. Known roadmaps: ${knownRoadmaps.map(r => r.id).join(', ') || '(none)'}`);
  }
}
```

with:

```js
function assertKnownRoadmapId(manifest, roadmapId) {
  const knownRoadmaps = Array.isArray(manifest.roadmaps) ? manifest.roadmaps : [];
  if (!knownRoadmaps.some(r => r.id === roadmapId)) {
    throw new Error(`Unknown roadmapId: ${roadmapId}. Known roadmaps: ${knownRoadmaps.map(r => r.id).join(', ') || '(none)'}`);
  }
}

function assertKnownPackageId(manifest, packageId) {
  const knownPackages = Array.isArray(manifest.packages) ? manifest.packages : [];
  if (!knownPackages.some(p => p.id === packageId)) {
    throw new Error(`Unknown packageId: ${packageId}. Known packages: ${knownPackages.map(p => p.id).join(', ') || '(none)'}`);
  }
}
```

Replace the whole `createRoadmap` function:

```js
  function createRoadmap({ id, name }) {
    const manifest = readManifest();
    if (!Array.isArray(manifest.roadmaps)) manifest.roadmaps = [];
    const roadmapId = id ? slugify(id) : slugify(name);
    if (!roadmapId) throw new Error('Could not derive a valid id from the provided name/id');
    if (findRoadmap(manifest, roadmapId)) throw new Error(`Roadmap id already exists: ${roadmapId}`);
    const entry = { id: roadmapId, name };
    manifest.roadmaps.push(entry);
    writeManifest(manifest);
    return entry;
  }
```

with:

```js
  function createRoadmap({ id, name, packageId, order }) {
    const manifest = readManifest();
    if (!Array.isArray(manifest.roadmaps)) manifest.roadmaps = [];
    const roadmapId = id ? slugify(id) : slugify(name);
    if (!roadmapId) throw new Error('Could not derive a valid id from the provided name/id');
    if (findRoadmap(manifest, roadmapId)) throw new Error(`Roadmap id already exists: ${roadmapId}`);
    if (packageId !== undefined) assertKnownPackageId(manifest, packageId);
    const entry = { id: roadmapId, name };
    if (packageId !== undefined) entry.packageId = packageId;
    if (order !== undefined) {
      if (!Number.isInteger(order)) throw new Error('order must be an integer');
      entry.order = order;
    }
    manifest.roadmaps.push(entry);
    writeManifest(manifest);
    return entry;
  }
```

Replace:

```js
  function deleteRoadmap(id) {
    const manifest = readManifest();
    const entry = findRoadmap(manifest, id);
    if (!entry) throw new Error(`Roadmap not found: ${id}`);

    const assignedSets = manifest.sets.filter(s => s.roadmapId === id);
    if (assignedSets.length > 0) {
      if (id === UNASSIGNED_ROADMAP_ID) {
        throw new Error(`Cannot delete roadmap "${id}": still assigned to ${assignedSets.length} question set(s)`);
      }
      if (!findRoadmap(manifest, UNASSIGNED_ROADMAP_ID)) {
        manifest.roadmaps.push({ id: UNASSIGNED_ROADMAP_ID, name: UNASSIGNED_ROADMAP_NAME });
      }
      const now = new Date().toISOString();
      assignedSets.forEach(s => {
        s.roadmapId = UNASSIGNED_ROADMAP_ID;
        s.updatedAt = now;
      });
    }

    manifest.roadmaps = manifest.roadmaps.filter(r => r.id !== id);
    writeManifest(manifest);
  }

  function searchQuestions(keyword, setId, limit = 50) {
```

with:

```js
  function deleteRoadmap(id) {
    const manifest = readManifest();
    const entry = findRoadmap(manifest, id);
    if (!entry) throw new Error(`Roadmap not found: ${id}`);

    const assignedSets = manifest.sets.filter(s => s.roadmapId === id);
    if (assignedSets.length > 0) {
      if (id === UNASSIGNED_ROADMAP_ID) {
        throw new Error(`Cannot delete roadmap "${id}": still assigned to ${assignedSets.length} question set(s)`);
      }
      if (!findRoadmap(manifest, UNASSIGNED_ROADMAP_ID)) {
        manifest.roadmaps.push({ id: UNASSIGNED_ROADMAP_ID, name: UNASSIGNED_ROADMAP_NAME });
      }
      const now = new Date().toISOString();
      assignedSets.forEach(s => {
        s.roadmapId = UNASSIGNED_ROADMAP_ID;
        s.updatedAt = now;
      });
    }

    manifest.roadmaps = manifest.roadmaps.filter(r => r.id !== id);
    writeManifest(manifest);
  }

  function updateRoadmapMetadata(id, { packageId, order } = {}) {
    const manifest = readManifest();
    const entry = findRoadmap(manifest, id);
    if (!entry) throw new Error(`Roadmap not found: ${id}`);

    if (packageId !== undefined) {
      if (packageId === null) {
        delete entry.packageId;
      } else {
        assertKnownPackageId(manifest, packageId);
        entry.packageId = packageId;
      }
    }
    if (order !== undefined) {
      if (!Number.isInteger(order)) throw new Error('order must be an integer');
      entry.order = order;
    }

    writeManifest(manifest);
    return entry;
  }

  function findPackage(manifest, id) {
    const packages = Array.isArray(manifest.packages) ? manifest.packages : [];
    return packages.find(p => p.id === id);
  }

  function listPackages() {
    const manifest = readManifest();
    return Array.isArray(manifest.packages) ? manifest.packages : [];
  }

  function createPackage({ id, name, order }) {
    const manifest = readManifest();
    if (!Array.isArray(manifest.packages)) manifest.packages = [];
    const packageId = id ? slugify(id) : slugify(name);
    if (!packageId) throw new Error('Could not derive a valid id from the provided name/id');
    if (findPackage(manifest, packageId)) throw new Error(`Package id already exists: ${packageId}`);
    const entry = { id: packageId, name };
    if (order !== undefined) {
      if (!Number.isInteger(order)) throw new Error('order must be an integer');
      entry.order = order;
    }
    manifest.packages.push(entry);
    writeManifest(manifest);
    return entry;
  }

  function renamePackage(id, name) {
    const manifest = readManifest();
    const entry = findPackage(manifest, id);
    if (!entry) throw new Error(`Package not found: ${id}`);
    entry.name = name;
    writeManifest(manifest);
    return entry;
  }

  function deletePackage(id) {
    const manifest = readManifest();
    const entry = findPackage(manifest, id);
    if (!entry) throw new Error(`Package not found: ${id}`);

    const assignedRoadmaps = (manifest.roadmaps || []).filter(r => r.packageId === id);
    if (assignedRoadmaps.length > 0) {
      if (id === UNASSIGNED_PACKAGE_ID) {
        throw new Error(`Cannot delete package "${id}": still assigned to ${assignedRoadmaps.length} roadmap(s)`);
      }
      if (!findPackage(manifest, UNASSIGNED_PACKAGE_ID)) {
        manifest.packages.push({ id: UNASSIGNED_PACKAGE_ID, name: UNASSIGNED_PACKAGE_NAME });
      }
      assignedRoadmaps.forEach(r => {
        r.packageId = UNASSIGNED_PACKAGE_ID;
      });
    }

    manifest.packages = manifest.packages.filter(p => p.id !== id);
    writeManifest(manifest);
  }

  function searchQuestions(keyword, setId, limit = 50) {
```

Replace the final `return { ... };` statement:

```js
  return {
    listQuestionSets,
    getQuestionSet,
    createQuestionSet,
    deleteQuestionSet,
    updateQuestionSetMetadata,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    searchQuestions,
    patchQuestion,
    listRoadmaps,
    createRoadmap,
    renameRoadmap,
    deleteRoadmap
  };
```

with:

```js
  return {
    listQuestionSets,
    getQuestionSet,
    createQuestionSet,
    deleteQuestionSet,
    updateQuestionSetMetadata,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    searchQuestions,
    patchQuestion,
    listRoadmaps,
    createRoadmap,
    renameRoadmap,
    deleteRoadmap,
    updateRoadmapMetadata,
    listPackages,
    createPackage,
    renamePackage,
    deletePackage
  };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node mcp-server/test/questions-repo.test.js`
Expected: prints `questions-repo tests passed` and exits 0.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/questions-repo.js mcp-server/test/questions-repo.test.js
git commit -m "feat: add package CRUD and roadmap metadata updates to questions repo"
```

---

### Task 3: MCP tool registration + smoke test

**Files:**
- Modify: `mcp-server/src/index.js`
- Test: `mcp-server/test/mcp-server.smoke.test.js`

**Interfaces:**
- Consumes: `repo.listPackages`, `repo.createPackage`, `repo.renamePackage`, `repo.deletePackage`, `repo.updateRoadmapMetadata`, extended `repo.createRoadmap` (all from Task 2).
- Produces: MCP tools `list_packages`, `create_package`, `rename_package`, `delete_package`, `update_roadmap_metadata`; `create_roadmap` tool gains `packageId`/`order` params.

- [ ] **Step 1: Write the failing smoke-test assertions**

In `mcp-server/test/mcp-server.smoke.test.js`, insert the following right after the existing roadmap block's last line (`assert.strictEqual(n3SetEntry.roadmapId, 'unassigned');`) and before `await client.close();`:

```js
  const listedPackages = await client.callTool({ name: 'list_packages', arguments: {} });
  assert.deepStrictEqual(JSON.parse(listedPackages.content[0].text), []);

  const createdPackage = await client.callTool({ name: 'create_package', arguments: { name: 'N3', order: 1 } });
  assert.deepStrictEqual(JSON.parse(createdPackage.content[0].text), { id: 'n3', name: 'N3', order: 1 });

  const renamedPackage = await client.callTool({ name: 'rename_package', arguments: { id: 'n3', name: 'N3 (Renamed)' } });
  assert.strictEqual(JSON.parse(renamedPackage.content[0].text).name, 'N3 (Renamed)');

  const createdRoadmapWithPackage = await client.callTool({
    name: 'create_roadmap',
    arguments: { id: 'n3-path-2', name: 'N3 Path 2', packageId: 'n3', order: 1 }
  });
  assert.deepStrictEqual(
    JSON.parse(createdRoadmapWithPackage.content[0].text),
    { id: 'n3-path-2', name: 'N3 Path 2', packageId: 'n3', order: 1 }
  );

  const updatedRoadmapMetadata = await client.callTool({
    name: 'update_roadmap_metadata',
    arguments: { id: 'n3-path-2', order: 2 }
  });
  assert.strictEqual(JSON.parse(updatedRoadmapMetadata.content[0].text).order, 2);

  const deletedPackage = await client.callTool({ name: 'delete_package', arguments: { id: 'n3' } });
  assert.deepStrictEqual(JSON.parse(deletedPackage.content[0].text), { deleted: 'n3' });

  const packagesAfterDelete = await client.callTool({ name: 'list_packages', arguments: {} });
  assert.deepStrictEqual(JSON.parse(packagesAfterDelete.content[0].text), [{ id: 'unassigned', name: 'Chưa phân loại' }]);

  const n3Path2AfterDelete = await client.callTool({ name: 'list_roadmaps', arguments: {} });
  const n3Path2Entry = JSON.parse(n3Path2AfterDelete.content[0].text).find(r => r.id === 'n3-path-2');
  assert.strictEqual(n3Path2Entry.packageId, 'unassigned');
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `node mcp-server/test/mcp-server.smoke.test.js`
Expected: FAIL — the `list_packages` tool call returns an MCP "Unknown tool" error (`isError: true` or a thrown rejection), since the tool isn't registered yet.

- [ ] **Step 3: Register the new tools**

In `mcp-server/src/index.js`, replace the `create_roadmap` tool registration:

```js
server.registerTool(
  'create_roadmap',
  {
    title: 'Create roadmap',
    description: 'Create a new roadmap and register it in the manifest',
    inputSchema: { id: z.string().optional(), name: z.string().min(1) }
  },
  guarded((args) => repo.createRoadmap(args))
);
```

with:

```js
server.registerTool(
  'create_roadmap',
  {
    title: 'Create roadmap',
    description: 'Create a new roadmap and register it in the manifest',
    inputSchema: {
      id: z.string().optional(),
      name: z.string().min(1),
      packageId: z.string().optional(),
      order: z.number().int().optional()
    }
  },
  guarded((args) => repo.createRoadmap(args))
);
```

Then insert the following right after the `delete_roadmap` tool registration block and before the `publish` tool registration:

```js
server.registerTool(
  'update_roadmap_metadata',
  {
    title: 'Update roadmap metadata',
    description: 'Update the packageId or order of an existing roadmap in the manifest. Pass packageId: null to remove the roadmap from its package; omit a field to leave it unchanged.',
    inputSchema: {
      id: z.string(),
      packageId: z.string().nullable().optional(),
      order: z.number().int().optional()
    }
  },
  guarded(({ id, packageId, order }) => repo.updateRoadmapMetadata(id, { packageId, order }))
);

server.registerTool(
  'list_packages',
  { title: 'List packages', description: 'List all packages with id and name' },
  guarded(() => repo.listPackages())
);

server.registerTool(
  'create_package',
  {
    title: 'Create package',
    description: 'Create a new package and register it in the manifest',
    inputSchema: { id: z.string().optional(), name: z.string().min(1), order: z.number().int().optional() }
  },
  guarded((args) => repo.createPackage(args))
);

server.registerTool(
  'rename_package',
  {
    title: 'Rename package',
    description: 'Update the display name of an existing package',
    inputSchema: { id: z.string(), name: z.string().min(1) }
  },
  guarded(({ id, name }) => repo.renamePackage(id, name))
);

server.registerTool(
  'delete_package',
  {
    title: 'Delete package',
    description: 'Delete a package from the manifest. Any roadmap still assigned to it is reassigned to the "unassigned" fallback package (created automatically if missing).',
    inputSchema: { id: z.string() }
  },
  guarded(({ id }) => {
    repo.deletePackage(id);
    return { deleted: id };
  })
);
```

- [ ] **Step 4: Run the smoke test to verify it passes**

Run: `node mcp-server/test/mcp-server.smoke.test.js`
Expected: prints `mcp server smoke test passed` and exits 0.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/index.js mcp-server/test/mcp-server.smoke.test.js
git commit -m "feat: register list/create/rename/delete_package and update_roadmap_metadata MCP tools"
```

---

### Task 4: Front-end data plumbing — `packageDefinitions`

**Files:**
- Modify: `js/main.js`
- Modify: `js/storage.js`
- Test: `tests/init-question-sets.test.js`

**Interfaces:**
- Produces: global `let packageDefinitions = []` (populated from `manifest.packages` by `initQuestionSets()`, same convention as the existing `roadmapDefinitions`). Task 5's `js/worldmap.js` reads this global directly.

- [ ] **Step 1: Write the failing tests**

In `tests/init-question-sets.test.js`, change the `getState` line inside the `vm.runInContext` template string from:

```js
this.getState = () => ({ questions, questionSets, activeSetId, roadmapDefinitions });`,
```

to:

```js
this.getState = () => ({ questions, questionSets, activeSetId, roadmapDefinitions, packageDefinitions });`,
```

Then add these two functions right after `testRoadmapDefinitionsPopulateFromManifest` and before the final `(async () => { ... })();` block:

```js
async function testPackageDefinitionsDefaultsToEmptyArrayWhenManifestOmitsIt() {
  const context = createContext(RESPONSES);
  await context.runInitQuestionSets();
  const state = context.getState();
  assert.deepStrictEqual(Array.from(state.packageDefinitions), []);
}

async function testPackageDefinitionsPopulateFromManifest() {
  const responsesWithPackages = {
    ...RESPONSES,
    'questions/manifest.json': { ...MANIFEST, packages: [{ id: 'n5', name: 'N5' }] }
  };
  const context = createContext(responsesWithPackages);
  await context.runInitQuestionSets();
  const state = context.getState();
  assert.deepStrictEqual(state.packageDefinitions, [{ id: 'n5', name: 'N5' }]);
}
```

Add both calls inside the final `(async () => { ... })();` block, right after `await testRoadmapDefinitionsPopulateFromManifest();` and before `console.log('init question sets tests passed');`:

```js
  await testPackageDefinitionsDefaultsToEmptyArrayWhenManifestOmitsIt();
  await testPackageDefinitionsPopulateFromManifest();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/init-question-sets.test.js`
Expected: FAIL — `ReferenceError: packageDefinitions is not defined`.

- [ ] **Step 3: Add the global and populate it**

In `js/main.js`, replace:

```js
let questions = [];
let questionSets = [];
let roadmapDefinitions = [];
let activeSetId = null;
```

with:

```js
let questions = [];
let questionSets = [];
let roadmapDefinitions = [];
let packageDefinitions = [];
let activeSetId = null;
```

In `js/storage.js`, replace:

```js
async function initQuestionSets() {
  const manifest = await fetchQuestionsManifest();
  questionSets = manifest.sets;
  roadmapDefinitions = Array.isArray(manifest.roadmaps) ? manifest.roadmaps : [];
```

with:

```js
async function initQuestionSets() {
  const manifest = await fetchQuestionsManifest();
  questionSets = manifest.sets;
  roadmapDefinitions = Array.isArray(manifest.roadmaps) ? manifest.roadmaps : [];
  packageDefinitions = Array.isArray(manifest.packages) ? manifest.packages : [];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/init-question-sets.test.js`
Expected: prints `init question sets tests passed` and exits 0.

- [ ] **Step 5: Commit**

```bash
git add js/main.js js/storage.js tests/init-question-sets.test.js
git commit -m "feat: load packageDefinitions from manifest.json"
```

---

### Task 5: `js/worldmap.js` — pure rendering logic

**Files:**
- Create: `js/worldmap.js`
- Test: Create `tests/worldmap.test.js`

**Interfaces:**
- Consumes: `roadmapDefinitions`, `packageDefinitions`, `questionSets`, `activeSetId` (globals, Task 4 + existing); `getSetsForRoadmap`, `computeRoadmapProgress`, `buildRoadmapNodesHtml`, `renderRoadmapChipsHtml`, `roadmapProgressCache` (all from `js/roadmap.js`, unchanged); `escapeHtml`, `showScreen` (from `js/main.js`, unchanged).
- Produces: `getRoadmapsForPackage(packageId)`, `pickDefaultWorldMapPackageId(fallbackId)`, `buildWorldMapZonesHtml(roadmapsForPackage, progressById, highlightSetId)`, `buildContinueQuestCardHtml(activeMeta, roadmapName)` — all pure, plus the DOM-orchestration functions that call them (`renderWorldMap`, `renderWorldMapZones`, `selectWorldMapPackage`, `renderContinueQuestCard`), all defined in this same file but exercised only via the browser in Task 6, matching how `js/roadmap.js`'s own `renderRoadmap`-style functions were never unit tested either — only pure builders are. Task 7 (Library package filter) also calls `getRoadmapsForPackage` and `pickDefaultWorldMapPackageId`.

- [ ] **Step 1: Write the failing tests**

Create `tests/worldmap.test.js`:

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const gameUtilsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'game-utils.js'), 'utf8');
const roadmapSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'roadmap.js'), 'utf8');
const worldmapSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'worldmap.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

function createContext() {
  const context = {
    console,
    questions: [],
    questionSets: [],
    roadmapDefinitions: [],
    packageDefinitions: [],
    activeSetId: null,
    questionStats: {},
    settings: { shuffleAnswers: true },
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    window: { addEventListener() {} }
  };
  context.window.document = context.document;
  vm.createContext(context);
  vm.runInContext(
    `${mainSource}
${gameUtilsSource}
${roadmapSource}
${worldmapSource}
this.setQuestionSets = (value) => { questionSets = value; };
this.setRoadmapDefinitions = (value) => { roadmapDefinitions = value; };
this.setPackageDefinitions = (value) => { packageDefinitions = value; };
this.setActiveSetId = (value) => { activeSetId = value; };
this.getRoadmapsForPackage = getRoadmapsForPackage;
this.pickDefaultWorldMapPackageId = pickDefaultWorldMapPackageId;
this.buildWorldMapZonesHtml = buildWorldMapZonesHtml;
this.buildContinueQuestCardHtml = buildContinueQuestCardHtml;`,
    context
  );
  return context;
}

function testGetRoadmapsForPackageFiltersAndSortsAscending() {
  const context = createContext();
  context.setRoadmapDefinitions([
    { id: 'r1', packageId: 'n4', order: 2 },
    { id: 'r2', packageId: 'n3', order: 1 },
    { id: 'r3', packageId: 'n4', order: 1 }
  ]);
  const result = context.getRoadmapsForPackage('n4');
  assert.deepStrictEqual(result.map(r => r.id), ['r3', 'r1']);
}

function testPickDefaultWorldMapPackageIdKeepsValidFallback() {
  const context = createContext();
  context.setPackageDefinitions([{ id: 'n4', order: 1 }, { id: 'n3', order: 2 }]);
  assert.strictEqual(context.pickDefaultWorldMapPackageId('n3'), 'n3');
}

function testPickDefaultWorldMapPackageIdIgnoresInvalidFallback() {
  const context = createContext();
  context.setPackageDefinitions([{ id: 'n4', order: 1 }]);
  assert.strictEqual(context.pickDefaultWorldMapPackageId('nope'), 'n4');
}

function testPickDefaultWorldMapPackageIdUsesActiveSetsRoadmapPackage() {
  const context = createContext();
  context.setPackageDefinitions([{ id: 'n4', order: 1 }, { id: 'n3', order: 2 }]);
  context.setRoadmapDefinitions([{ id: 'n3-path', packageId: 'n3' }]);
  context.setQuestionSets([{ id: 'set-a', roadmapId: 'n3-path' }]);
  context.setActiveSetId('set-a');
  assert.strictEqual(context.pickDefaultWorldMapPackageId(null), 'n3');
}

function testPickDefaultWorldMapPackageIdFallsBackToLowestOrder() {
  const context = createContext();
  context.setPackageDefinitions([{ id: 'n4', order: 2 }, { id: 'n3', order: 1 }]);
  assert.strictEqual(context.pickDefaultWorldMapPackageId(null), 'n3');
}

function testPickDefaultWorldMapPackageIdReturnsNullWhenNoPackages() {
  const context = createContext();
  context.setPackageDefinitions([]);
  assert.strictEqual(context.pickDefaultWorldMapPackageId(null), null);
}

function testBuildWorldMapZonesHtmlRendersOneZonePerRoadmapWithProgressSummary() {
  const context = createContext();
  context.setRoadmapDefinitions([{ id: 'r1', name: 'Bài 1', packageId: 'n4', order: 1 }]);
  context.setQuestionSets([
    { id: 'a', roadmapId: 'r1', name: 'Set A', category: 'vocabulary', questionCount: 5, order: 1 },
    { id: 'b', roadmapId: 'r1', name: 'Set B', category: 'grammar', questionCount: 5, order: 2 }
  ]);
  const progressById = new Map([
    ['a', { progress: { total: 3 }, stars: 3 }],
    ['b', { progress: { total: 0 }, stars: 0 }]
  ]);
  const html = context.buildWorldMapZonesHtml(context.getRoadmapsForPackage('n4'), progressById, null);
  assert.ok(html.includes('worldmap-zone-active'));
  assert.ok(html.includes('Bài 1'));
  assert.ok(html.includes('1/2'));
  assert.ok(html.includes('Set A'));
  assert.ok(html.includes('Set B'));
}

function testBuildWorldMapZonesHtmlMarksZoneCompleteWhenAllSetsMastered() {
  const context = createContext();
  context.setRoadmapDefinitions([{ id: 'r1', name: 'Bài 1', packageId: 'n4', order: 1 }]);
  context.setQuestionSets([{ id: 'a', roadmapId: 'r1', name: 'Set A', category: 'vocabulary', questionCount: 5, order: 1 }]);
  const progressById = new Map([['a', { progress: { total: 5 }, stars: 3 }]]);
  const html = context.buildWorldMapZonesHtml(context.getRoadmapsForPackage('n4'), progressById, null);
  assert.ok(html.includes('worldmap-zone-complete'));
  assert.ok(html.includes('1/1'));
}

function testBuildWorldMapZonesHtmlMarksZoneUntouchedWhenNothingPlayed() {
  const context = createContext();
  context.setRoadmapDefinitions([{ id: 'r1', name: 'Bài 1', packageId: 'n4', order: 1 }]);
  context.setQuestionSets([{ id: 'a', roadmapId: 'r1', name: 'Set A', category: 'vocabulary', questionCount: 5, order: 1 }]);
  const html = context.buildWorldMapZonesHtml(context.getRoadmapsForPackage('n4'), new Map(), null);
  assert.ok(html.includes('worldmap-zone-untouched'));
  assert.ok(html.includes('0/1'));
}

function testBuildContinueQuestCardHtmlShowsSetAndZoneName() {
  const context = createContext();
  const html = context.buildContinueQuestCardHtml({ id: 'a', name: 'Set A' }, 'Bài 1');
  assert.ok(html.includes('Set A'));
  assert.ok(html.includes('Bài 1'));
  assert.ok(html.includes("showScreen('screen-menu')"));
}

function testBuildContinueQuestCardHtmlShowsEmptyStateWhenNoActiveSet() {
  const context = createContext();
  const html = context.buildContinueQuestCardHtml(null, null);
  assert.ok(html.includes('Pick a lesson to begin'));
}

testGetRoadmapsForPackageFiltersAndSortsAscending();
testPickDefaultWorldMapPackageIdKeepsValidFallback();
testPickDefaultWorldMapPackageIdIgnoresInvalidFallback();
testPickDefaultWorldMapPackageIdUsesActiveSetsRoadmapPackage();
testPickDefaultWorldMapPackageIdFallsBackToLowestOrder();
testPickDefaultWorldMapPackageIdReturnsNullWhenNoPackages();
testBuildWorldMapZonesHtmlRendersOneZonePerRoadmapWithProgressSummary();
testBuildWorldMapZonesHtmlMarksZoneCompleteWhenAllSetsMastered();
testBuildWorldMapZonesHtmlMarksZoneUntouchedWhenNothingPlayed();
testBuildContinueQuestCardHtmlShowsSetAndZoneName();
testBuildContinueQuestCardHtmlShowsEmptyStateWhenNoActiveSet();

console.log('world map tests passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/worldmap.test.js`
Expected: FAIL — `Error: Cannot find module '../js/worldmap.js'` (the file doesn't exist yet).

- [ ] **Step 3: Create `js/worldmap.js`**

```js
// ================================================
// 日本語 QUEST — World Map Module
// ================================================

let activeWorldMapPackageId = null;

function getRoadmapsForPackage(packageId) {
  return roadmapDefinitions
    .filter(r => r.packageId === packageId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function pickDefaultWorldMapPackageId(fallbackId) {
  if (fallbackId && packageDefinitions.some(p => p.id === fallbackId)) return fallbackId;
  const activeMeta = questionSets.find(s => s.id === activeSetId);
  const activeRoadmap = activeMeta ? roadmapDefinitions.find(r => r.id === activeMeta.roadmapId) : null;
  if (activeRoadmap && activeRoadmap.packageId && packageDefinitions.some(p => p.id === activeRoadmap.packageId)) {
    return activeRoadmap.packageId;
  }
  const sorted = [...packageDefinitions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return sorted.length > 0 ? sorted[0].id : null;
}

function buildWorldMapZonesHtml(roadmapsForPackage, progressById, highlightSetId) {
  return roadmapsForPackage.map(roadmap => {
    const setsForRoadmap = getSetsForRoadmap(roadmap.id);
    const totalCount = setsForRoadmap.length;
    let masteredCount = 0;
    let anyPlayed = false;
    setsForRoadmap.forEach(s => {
      const entry = progressById.get(s.id) || { progress: { total: 0 }, stars: 0 };
      if (entry.stars === 3) masteredCount++;
      if (entry.progress.total > 0) anyPlayed = true;
    });
    const stateClass = totalCount > 0 && masteredCount === totalCount
      ? 'worldmap-zone-complete'
      : anyPlayed ? 'worldmap-zone-active' : 'worldmap-zone-untouched';
    return `
      <section class="worldmap-zone ${stateClass}">
        <header class="worldmap-zone-header">
          <span class="worldmap-zone-name">${escapeHtml(roadmap.name)}</span>
          <span class="worldmap-zone-progress">${masteredCount}/${totalCount}</span>
        </header>
        ${buildRoadmapNodesHtml(setsForRoadmap, progressById, { highlightSetId, compact: false, clickHandler: 'launchRoadmapNode' })}
      </section>`;
  }).join('');
}

function buildContinueQuestCardHtml(activeMeta, roadmapName) {
  if (!activeMeta) {
    return '<div class="roadmap-loading">Pick a lesson to begin.</div>';
  }
  return `
    <div class="worldmap-continue-quest-info">
      <span class="worldmap-continue-quest-zone">${escapeHtml(roadmapName || 'Unassigned')}</span>
      <span class="worldmap-continue-quest-name">${escapeHtml(activeMeta.name)}</span>
    </div>
    <button class="action-btn btn-green worldmap-continue-quest-btn" onclick="showScreen('screen-menu')">▶ CONTINUE</button>`;
}

async function renderWorldMap() {
  const chipsEl = document.getElementById('worldmap-package-chips');
  const track = document.getElementById('worldmap-track');
  if (!track) return;
  track.innerHTML = '<div class="roadmap-loading">Loading world map…</div>';
  if (chipsEl) chipsEl.innerHTML = '';

  try {
    roadmapProgressCache = await computeRoadmapProgress(questionSets);
    activeWorldMapPackageId = pickDefaultWorldMapPackageId(activeWorldMapPackageId);
    if (!activeWorldMapPackageId) {
      track.innerHTML = '<div class="roadmap-loading">No packages configured yet.</div>';
      return;
    }
    if (chipsEl) chipsEl.innerHTML = renderRoadmapChipsHtml(packageDefinitions, activeWorldMapPackageId, 'selectWorldMapPackage');
    renderContinueQuestCard();
    renderWorldMapZones();
  } catch (e) {
    console.error('Failed to render world map:', e);
    track.innerHTML = '<div class="roadmap-loading">❌ Failed to load the world map. Please try again.</div>';
    if (typeof showToast === 'function') showToast('❌ Failed to load world map', 'err');
  }
}

function renderWorldMapZones() {
  const track = document.getElementById('worldmap-track');
  if (!track) return;
  track.innerHTML = buildWorldMapZonesHtml(getRoadmapsForPackage(activeWorldMapPackageId), roadmapProgressCache, activeSetId);

  requestAnimationFrame(() => {
    const activeEl = track.querySelector(`.roadmap-node[data-set-id="${activeSetId}"]`) || track.querySelector('.roadmap-node:last-child');
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function selectWorldMapPackage(id) {
  activeWorldMapPackageId = id;
  const chipsEl = document.getElementById('worldmap-package-chips');
  if (chipsEl) chipsEl.innerHTML = renderRoadmapChipsHtml(packageDefinitions, activeWorldMapPackageId, 'selectWorldMapPackage');
  renderWorldMapZones();
}

function renderContinueQuestCard() {
  const el = document.getElementById('worldmap-continue-quest');
  if (!el) return;
  const activeMeta = questionSets.find(s => s.id === activeSetId);
  const roadmap = activeMeta ? roadmapDefinitions.find(r => r.id === activeMeta.roadmapId) : null;
  el.innerHTML = buildContinueQuestCardHtml(activeMeta, roadmap ? roadmap.name : null);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/worldmap.test.js`
Expected: prints `world map tests passed` and exits 0.

- [ ] **Step 5: Commit**

```bash
git add js/worldmap.js tests/worldmap.test.js
git commit -m "feat: add js/worldmap.js with package-scoped multi-zone rendering"
```

---

### Task 6: World Map screen — markup, CSS, wiring; retire the single-roadmap full screen

**Files:**
- Modify: `index.html`
- Modify: `js/main.js`
- Modify: `js/roadmap.js`
- Modify: `css/roadmap.css`

**Interfaces:**
- Consumes: `renderWorldMap` (Task 5), `updateMenuUI` (existing, unchanged — its DOM targets just move screens).
- Produces: `#screen-worldmap` as the app's default/boot screen. No new exported functions (this task is markup/wiring plus deleting the now-dead single-roadmap screen code).

- [ ] **Step 1: Add the `<script>` tag for `js/worldmap.js`**

In `index.html`, replace:

```html
  <script src="js/roadmap.js"></script>
  <script src="js/settings.js"></script>
```

with:

```html
  <script src="js/roadmap.js"></script>
  <script src="js/worldmap.js"></script>
  <script src="js/settings.js"></script>
```

- [ ] **Step 2: Replace the `#screen-roadmap` markup with `#screen-worldmap`**

Replace:

```html
  <!-- ROADMAP -->
  <div id="screen-roadmap" class="screen screen-roadmap">
    <div class="panel roadmap-panel">
      <h2 class="panel-title">🌌 ROADMAP</h2>
      <div class="roadmap-tabs" id="roadmap-tabs"></div>
      <div class="roadmap-track" id="roadmap-track"></div>
      <button class="back-btn" onclick="showScreen('screen-menu')">◀ BACK TO MENU</button>
    </div>
  </div>
```

with:

```html
  <!-- WORLD MAP -->
  <div id="screen-worldmap" class="screen screen-roadmap">
    <div class="panel roadmap-panel">
      <h2 class="panel-title">🗺️ WORLD MAP</h2>
      <div class="worldmap-hud" id="worldmap-hud">
        <div class="stat-row">
          <span class="stat-label">🔰 LVL</span>
          <span class="stat-val" id="menu-level">1</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">❤ HP</span>
          <div class="bar-track"><div class="bar-fill hp-fill" id="menu-hp"></div></div>
        </div>
        <div class="stat-row">
          <span class="stat-label">⭐ EXP</span>
          <div class="bar-track"><div class="bar-fill exp-fill" id="menu-exp"></div></div>
        </div>
        <div class="stat-row">
          <span class="stat-label">🔥 Streak</span>
          <span class="stat-val" id="menu-streak">0</span>
        </div>
      </div>
      <div class="roadmap-tabs" id="worldmap-package-chips"></div>
      <div class="worldmap-continue-quest" id="worldmap-continue-quest"></div>
      <div class="roadmap-track" id="worldmap-track"></div>
      <button class="back-btn" onclick="showScreen('screen-menu')">☰ MENU</button>
    </div>
  </div>
```

- [ ] **Step 3: Remove `screen-menu`'s now-redundant HUD block and rename its ROADMAP nav button**

Replace:

```html
      <div class="hp-exp-bar">
        <div class="stat-row">
          <span class="stat-label">❤ HP</span>
          <div class="bar-track"><div class="bar-fill hp-fill" id="menu-hp"></div></div>

        </div>

        <div class="stat-row">
          <span class="stat-label">⭐ EXP</span>
          <div class="bar-track"><div class="bar-fill exp-fill" id="menu-exp"></div></div>

        </div>
        <div class="stat-row level-row">
          <span class="stat-label">🔰 LVL</span>
          <span class="stat-val" id="menu-level">1</span>
        </div>
        <div class="stat-row level-row">
          <span class="stat-label">🔥 Streak</span>
          <span class="stat-val" id="menu-streak">0</span>
        </div>
      </div>

      <div class="menu-btn-container scrollbar-hide">
```

with:

```html
      <div class="menu-btn-container scrollbar-hide">
```

Replace:

```html
          <button class="menu-btn btn-roadmap" onclick="showScreen('screen-roadmap')">
            <span class="btn-icon">🌌</span>
            <span class="btn-text">ROADMAP<br><small>Your learning journey</small></span>
            <span class="btn-arrow">▶</span>
          </button>
```

with:

```html
          <button class="menu-btn btn-roadmap" onclick="showScreen('screen-worldmap')">
            <span class="btn-icon">🗺️</span>
            <span class="btn-text">WORLD MAP<br><small>Your learning journey</small></span>
            <span class="btn-arrow">▶</span>
          </button>
```

- [ ] **Step 4: Point the boot sequence and `showScreen` hook at the new screen**

In `js/main.js`, replace:

```js
  updateMenuUI();
  showScreen('screen-menu');
});
```

with:

```js
  updateMenuUI();
  showScreen('screen-worldmap');
});
```

Replace:

```js
  if (id === 'screen-settings') renderSettingsScreen();
  if (id === 'screen-stats') renderStatsScreen();
  if (id === 'screen-roadmap') renderRoadmap();
}
```

with:

```js
  if (id === 'screen-settings') renderSettingsScreen();
  if (id === 'screen-stats') renderStatsScreen();
  if (id === 'screen-worldmap') { updateMenuUI(); renderWorldMap(); }
}
```

- [ ] **Step 5: Delete the now-dead single-roadmap full-screen code from `js/roadmap.js`**

These functions rendered `#screen-roadmap`'s `#roadmap-tabs`/`#roadmap-track`, which no longer exist —
everything else in `js/roadmap.js` stays (`computeSetProgress`, `starsForProgress`,
`renderStarString`, `getRoadmapQuestionsForSet`, `getSetsForRoadmap`, `computeRoadmapProgress`,
`buildRoadmapNodesHtml`, `renderRoadmapChipsHtml`, `pickDefaultRoadmapId`, `launchRoadmapNode`,
`selectRoadmapNodeInPlace`, and the whole Library-tab group are all still used, either by
`js/worldmap.js` or by Library).

Replace:

```js
const roadmapQuestionsCache = new Map();
let activeRoadmapTabId = null;
let activeLibraryRoadmapId = null;
let roadmapProgressCache = new Map();
```

with:

```js
const roadmapQuestionsCache = new Map();
let activeLibraryRoadmapId = null;
let roadmapProgressCache = new Map();
```

Replace:

```js
async function renderRoadmap() {
  const tabsEl = document.getElementById('roadmap-tabs');
  const track = document.getElementById('roadmap-track');
  if (!track) return;
  track.innerHTML = '<div class="roadmap-loading">Loading roadmap…</div>';
  if (tabsEl) tabsEl.innerHTML = '';

  try {
    activeRoadmapTabId = pickDefaultRoadmapId(null);
    if (!activeRoadmapTabId) {
      track.innerHTML = '<div class="roadmap-loading">No roadmaps configured yet.</div>';
      return;
    }
    if (tabsEl) tabsEl.innerHTML = renderRoadmapChipsHtml(roadmapDefinitions, activeRoadmapTabId, 'selectRoadmapTab');

    roadmapProgressCache = await computeRoadmapProgress(questionSets);
    renderRoadmapTrack();
  } catch (e) {
    console.error('Failed to render roadmap:', e);
    track.innerHTML = '<div class="roadmap-loading">❌ Failed to load the roadmap. Please try again.</div>';
    if (typeof showToast === 'function') showToast('❌ Failed to load roadmap', 'err');
  }
}

function renderRoadmapTrack() {
  const track = document.getElementById('roadmap-track');
  if (!track) return;
  const sets = getSetsForRoadmap(activeRoadmapTabId);
  track.innerHTML = buildRoadmapNodesHtml(sets, roadmapProgressCache, { highlightSetId: activeSetId, compact: false, clickHandler: 'launchRoadmapNode' });

  requestAnimationFrame(() => {
    const activeEl = track.querySelector(`.roadmap-node[data-set-id="${activeSetId}"]`) || track.querySelector('.roadmap-node:last-child');
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function selectRoadmapTab(id) {
  activeRoadmapTabId = id;
  const tabsEl = document.getElementById('roadmap-tabs');
  if (tabsEl) tabsEl.innerHTML = renderRoadmapChipsHtml(roadmapDefinitions, activeRoadmapTabId, 'selectRoadmapTab');
  renderRoadmapTrack();
}

function launchRoadmapNode(nodeEl, id) {
```

with:

```js
function launchRoadmapNode(nodeEl, id) {
```

- [ ] **Step 6: Add World Map CSS**

Append to `css/roadmap.css`:

```css
/* ─── World Map ──────────────────────────────────── */
.worldmap-hud {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  background: var(--panel);
  border: 2px solid var(--border);
  border-radius: var(--radius);
  font-family: var(--font-px);
  font-size: 8px;
  color: var(--text-dim);
}
.worldmap-hud .stat-row { flex: 1 1 140px; gap: 6px; }
.worldmap-hud .bar-track { height: 8px; }

.worldmap-continue-quest {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  background: var(--panel);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
}
.worldmap-continue-quest-info { display: flex; flex-direction: column; gap: 4px; }
.worldmap-continue-quest-zone { font-family: var(--font-px); font-size: 9px; color: var(--text-dim); }
.worldmap-continue-quest-name { font-family: var(--font-jp); font-size: 15px; font-weight: 700; }
.worldmap-continue-quest-btn { flex-shrink: 0; }

.worldmap-zone { display: flex; flex-direction: column; gap: 20px; margin-bottom: 12px; }
.worldmap-zone-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: var(--panel);
  border: 2px solid var(--border);
  border-left-width: 5px;
  border-radius: var(--radius);
}
.worldmap-zone-name { font-family: var(--font-jp); font-size: 13px; font-weight: 700; }
.worldmap-zone-progress { font-family: var(--font-px); font-size: 9px; color: var(--text-dim); }
.worldmap-zone-complete .worldmap-zone-header { border-left-color: var(--accent3); box-shadow: var(--glow-g); }
.worldmap-zone-active .worldmap-zone-header { border-left-color: var(--accent2); }
.worldmap-zone-untouched .worldmap-zone-header { border-left-color: var(--border); }

@media (min-width: 1024px) {
  .worldmap-hud { font-size: 10.5px; padding: 15px 24px; }
  .worldmap-continue-quest-zone { font-size: 12px; }
  .worldmap-continue-quest-name { font-size: 19.5px; }
  .worldmap-zone-name { font-size: 16.5px; }
  .worldmap-zone-progress { font-size: 12px; }
}
```

- [ ] **Step 7: Run the full front-end test suite**

Run: `node tests/run-all.js`
Expected: all files pass, ending with `<N> test files passed` (existing `tests/roadmap.test.js` must still pass unmodified — it only tests the functions kept in Step 5).

- [ ] **Step 8: Manual smoke test in a browser**

Serve the app (e.g. `npx serve .` or any static file server from the repo root) and open it:
1. Confirm the app boots directly into the World Map (title "🗺️ WORLD MAP"), not the old button-list menu.
2. Confirm the HUD row shows real Level/HP/EXP/Streak values (not stuck at defaults if you have existing progress in this browser's localStorage).
3. Confirm package chips read "N5 / N4 / N3 / Chưa phân loại" and clicking each swaps the zones below instantly (no loading flash).
4. Pick "N4": confirm 25 stacked zones appear, each showing "N4 Bài NN" and an "M/4" mastered count, each with its own 4-node path.
5. Confirm "Continue Quest" shows your currently active set's name and zone, and its ▶ CONTINUE button lands on the game-mode picker (`screen-menu`) with that set still active.
6. Click a node deep in the N4 scroll: confirm it switches the active set and navigates to the game-mode picker, exactly like the old roadmap screen's node click did.
7. From the game-mode picker, click "🗺️ WORLD MAP": confirm it returns to the World Map.
8. Confirm every other screen's "◀ BACK TO MENU" button still returns to the game-mode picker (`screen-menu`), unchanged.

- [ ] **Step 9: Commit**

```bash
git add index.html js/main.js js/roadmap.js css/roadmap.css
git commit -m "feat: replace the single-roadmap full screen with a package-scoped World Map"
```

---

### Task 7: Library's Roadmaps tab — package filter

**Files:**
- Modify: `index.html`
- Modify: `js/roadmap.js`

**Interfaces:**
- Consumes: `getRoadmapsForPackage`, `pickDefaultWorldMapPackageId` (Task 5), `packageDefinitions` (Task 4).
- Produces: no new exports — `renderLibraryRoadmapsTab`'s existing signature/role is unchanged from the outside (still called by `selectLibraryTab('roadmaps')`), it just filters by package internally now.

- [ ] **Step 1: Add the package-chip container to the Library markup**

In `index.html`, replace:

```html
      <div id="library-roadmaps-tab" class="hidden">
        <div id="library-roadmap-chips" class="roadmap-tabs"></div>
        <div class="roadmap-track roadmap-track-mini" id="library-roadmap-preview"></div>
      </div>
```

with:

```html
      <div id="library-roadmaps-tab" class="hidden">
        <div id="library-package-chips" class="roadmap-tabs"></div>
        <div id="library-roadmap-chips" class="roadmap-tabs"></div>
        <div class="roadmap-track roadmap-track-mini" id="library-roadmap-preview"></div>
      </div>
```

- [ ] **Step 2: Filter Library's roadmap chips by the selected package**

In `js/roadmap.js`, replace:

```js
let activeLibraryRoadmapId = null;
```

with:

```js
let activeLibraryRoadmapId = null;
let activeLibraryPackageId = null;
```

Replace the whole `renderLibraryRoadmapsTab` function and the `selectLibraryRoadmap` function that follows it:

```js
async function renderLibraryRoadmapsTab() {
  const chipsEl = document.getElementById('library-roadmap-chips');
  const container = document.getElementById('library-roadmap-preview');
  if (!container) return;
  activeLibraryRoadmapId = pickDefaultRoadmapId(activeLibraryRoadmapId);
  if (!activeLibraryRoadmapId) {
    if (chipsEl) chipsEl.innerHTML = '';
    container.innerHTML = '<div class="roadmap-loading">No roadmaps configured yet.</div>';
    return;
  }
  if (chipsEl) chipsEl.innerHTML = renderRoadmapChipsHtml(roadmapDefinitions, activeLibraryRoadmapId, 'selectLibraryRoadmap');
  container.innerHTML = '<div class="roadmap-loading">Loading roadmap…</div>';
  try {
    const sets = getSetsForRoadmap(activeLibraryRoadmapId);
    const progressById = await computeRoadmapProgress(sets);
    container.innerHTML = buildRoadmapNodesHtml(sets, progressById, { highlightSetId: activeSetId, compact: true, clickHandler: 'selectRoadmapNodeInPlace' });
  } catch (e) {
    console.error('Failed to render library roadmaps tab:', e);
    container.innerHTML = '<div class="roadmap-loading">❌ Failed to load the roadmap. Please try again.</div>';
  }
}

function selectLibraryRoadmap(id) {
  activeLibraryRoadmapId = id;
  renderLibraryRoadmapsTab();
}
```

with:

```js
async function renderLibraryRoadmapsTab() {
  const packageChipsEl = document.getElementById('library-package-chips');
  const chipsEl = document.getElementById('library-roadmap-chips');
  const container = document.getElementById('library-roadmap-preview');
  if (!container) return;

  activeLibraryPackageId = pickDefaultWorldMapPackageId(activeLibraryPackageId);
  if (!activeLibraryPackageId) {
    if (packageChipsEl) packageChipsEl.innerHTML = '';
    if (chipsEl) chipsEl.innerHTML = '';
    container.innerHTML = '<div class="roadmap-loading">No packages configured yet.</div>';
    return;
  }
  if (packageChipsEl) packageChipsEl.innerHTML = renderRoadmapChipsHtml(packageDefinitions, activeLibraryPackageId, 'selectLibraryPackage');

  const roadmapsInPackage = getRoadmapsForPackage(activeLibraryPackageId);
  if (!activeLibraryRoadmapId || !roadmapsInPackage.some(r => r.id === activeLibraryRoadmapId)) {
    activeLibraryRoadmapId = roadmapsInPackage.length > 0 ? roadmapsInPackage[0].id : null;
  }
  if (!activeLibraryRoadmapId) {
    if (chipsEl) chipsEl.innerHTML = '';
    container.innerHTML = '<div class="roadmap-loading">No roadmaps in this package yet.</div>';
    return;
  }
  if (chipsEl) chipsEl.innerHTML = renderRoadmapChipsHtml(roadmapsInPackage, activeLibraryRoadmapId, 'selectLibraryRoadmap');
  container.innerHTML = '<div class="roadmap-loading">Loading roadmap…</div>';
  try {
    const sets = getSetsForRoadmap(activeLibraryRoadmapId);
    const progressById = await computeRoadmapProgress(sets);
    container.innerHTML = buildRoadmapNodesHtml(sets, progressById, { highlightSetId: activeSetId, compact: true, clickHandler: 'selectRoadmapNodeInPlace' });
  } catch (e) {
    console.error('Failed to render library roadmaps tab:', e);
    container.innerHTML = '<div class="roadmap-loading">❌ Failed to load the roadmap. Please try again.</div>';
  }
}

function selectLibraryPackage(id) {
  activeLibraryPackageId = id;
  activeLibraryRoadmapId = null;
  renderLibraryRoadmapsTab();
}

function selectLibraryRoadmap(id) {
  activeLibraryRoadmapId = id;
  renderLibraryRoadmapsTab();
}
```

- [ ] **Step 3: Run the full front-end test suite**

Run: `node tests/run-all.js`
Expected: all files pass (this task adds no new automated tests — `renderLibraryRoadmapsTab`/`selectLibraryRoadmap`/`selectLibraryPackage` are DOM-orchestration functions, matching the existing convention of only unit-testing the pure builders they call, all of which are already covered by `tests/roadmap.test.js` and `tests/worldmap.test.js`).

- [ ] **Step 4: Manual smoke test in a browser**

1. Open Library, switch to the "Roadmaps" tab.
2. Confirm a package chip row appears above the roadmap chip row.
3. Pick "N4": confirm the roadmap chip row below now shows only N4's ~25 lessons (not all 29).
4. Pick a lesson chip, confirm its mini preview renders below.
5. Switch to "N3": confirm the roadmap chip row updates to N3's 2 lessons and auto-selects the first one.

- [ ] **Step 5: Commit**

```bash
git add index.html js/roadmap.js
git commit -m "feat: filter Library's Roadmaps tab by package"
```
