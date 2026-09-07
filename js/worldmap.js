// ================================================
// 日本語 QUEST — World Map Module
// ================================================

let activeWorldMapPackageId = null;
let expandedZoneIds = new Set();
let worldMapIndexOpen = false;
let selectedIndexRoadmapId = null;
let selectedIndexSetId = null;

function getRoadmapsForPackage(packageId) {
  return roadmapDefinitions
    .filter(r => r.packageId === packageId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function sortedPackageDefinitions() {
  return [...packageDefinitions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function pickDefaultWorldMapPackageId(fallbackId) {
  if (fallbackId && packageDefinitions.some(p => p.id === fallbackId)) return fallbackId;
  const activeMeta = questionSets.find(s => s.id === activeSetId);
  const activeRoadmap = activeMeta ? roadmapDefinitions.find(r => r.id === activeMeta.roadmapId) : null;
  if (activeRoadmap && activeRoadmap.packageId && packageDefinitions.some(p => p.id === activeRoadmap.packageId)) {
    return activeRoadmap.packageId;
  }
  const sorted = sortedPackageDefinitions();
  return sorted.length > 0 ? sorted[0].id : null;
}

async function loadWorldMapPackageProgress(packageId) {
  const setsToLoad = getRoadmapsForPackage(packageId)
    .flatMap(r => getSetsForRoadmap(r.id))
    .filter(s => !roadmapProgressCache.has(s.id));
  if (setsToLoad.length === 0) return;
  const freshProgress = await computeRoadmapProgress(setsToLoad);
  freshProgress.forEach((value, key) => roadmapProgressCache.set(key, value));
}

function buildWorldMapZonesHtml(roadmapsForPackage, progressById, highlightSetId, expandedIds = new Set()) {
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
    const collapsedClass = expandedIds.has(roadmap.id) ? '' : 'worldmap-zone-collapsed';
    return `
      <section class="worldmap-zone ${stateClass} ${collapsedClass}" data-roadmap-id="${escapeHtml(roadmap.id)}">
        <header class="worldmap-zone-header" onclick="toggleWorldMapZone('${escapeHtml(roadmap.id)}')">
          <span class="worldmap-zone-name">${escapeHtml(roadmap.name)}</span>
          <span class="worldmap-zone-progress">${masteredCount}/${totalCount}</span>
          <span class="worldmap-zone-toggle" aria-hidden="true">▾</span>
        </header>
        ${buildRoadmapNodesHtml(setsForRoadmap, progressById, { highlightSetId, compact: false, clickHandler: 'launchRoadmapNode' })}
      </section>`;
  }).join('');
}

function buildWorldMapIndexEntries() {
  return roadmapDefinitions.map(roadmap => ({
    roadmapId: roadmap.id,
    roadmapName: roadmap.name,
    packageId: roadmap.packageId,
    sets: getSetsForRoadmap(roadmap.id).map(s => ({ id: s.id, name: s.name }))
  }));
}

function buildWorldMapIndexHtml(entries, query, selectedRoadmapId, selectedSetId) {
  const needle = query.trim().toLowerCase();
  const filtered = entries
    .map(entry => {
      const roadmapMatches = entry.roadmapName.toLowerCase().includes(needle);
      const sets = roadmapMatches ? entry.sets : entry.sets.filter(s => s.name.toLowerCase().includes(needle));
      return { ...entry, sets };
    })
    .filter(entry => entry.sets.length > 0);

  if (filtered.length === 0) {
    return '<div class="roadmap-loading">No results.</div>';
  }

  return filtered.map(entry => {
    const roadmapActiveClass = !selectedSetId && entry.roadmapId === selectedRoadmapId ? 'worldmap-index-item-active' : '';
    return `
    <div class="worldmap-index-group">
      <button class="worldmap-index-roadmap ${roadmapActiveClass}" onclick="navigateWorldMapIndex('${escapeHtml(entry.roadmapId)}')">${escapeHtml(entry.roadmapName)}</button>
      ${entry.sets.map(s => {
        const setActiveClass = s.id === selectedSetId ? 'worldmap-index-item-active' : '';
        return `<button class="worldmap-index-set ${setActiveClass}" onclick="navigateWorldMapIndex('${escapeHtml(entry.roadmapId)}', '${escapeHtml(s.id)}')">${escapeHtml(s.name)}</button>`;
      }).join('')}
    </div>`;
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
    <button class="action-btn btn-green worldmap-continue-quest-btn" onclick="showScreen('screen-play')">▶ CONTINUE</button>`;
}

async function renderWorldMap() {
  const chipsEl = document.getElementById('worldmap-package-chips');
  const track = document.getElementById('worldmap-track');
  if (!track) return;
  track.innerHTML = '<div class="roadmap-loading">Loading world map…</div>';
  if (chipsEl) chipsEl.innerHTML = '';

  const activeMeta = questionSets.find(s => s.id === activeSetId);
  if (activeMeta && activeMeta.roadmapId) expandedZoneIds.add(activeMeta.roadmapId);
  filterWorldMapIndex('');

  try {
    activeWorldMapPackageId = pickDefaultWorldMapPackageId(activeWorldMapPackageId);
    if (!activeWorldMapPackageId) {
      track.innerHTML = '<div class="roadmap-loading">No packages configured yet.</div>';
      return;
    }
    if (chipsEl) chipsEl.innerHTML = renderRoadmapChipsHtml(sortedPackageDefinitions(), activeWorldMapPackageId, 'selectWorldMapPackage');
    renderContinueQuestCard();
    await loadWorldMapPackageProgress(activeWorldMapPackageId);
    renderWorldMapZones();
    scrollWorldMapToActiveNode();
  } catch (e) {
    console.error('Failed to render world map:', e);
    track.innerHTML = '<div class="roadmap-loading">❌ Failed to load the world map. Please try again.</div>';
    if (typeof showToast === 'function') showToast('❌ Failed to load world map', 'err');
  }
}

function renderWorldMapZones() {
  const track = document.getElementById('worldmap-track');
  if (!track) return;
  track.innerHTML = buildWorldMapZonesHtml(getRoadmapsForPackage(activeWorldMapPackageId), roadmapProgressCache, activeSetId, expandedZoneIds);
}

function scrollWorldMapToActiveNode() {
  const track = document.getElementById('worldmap-track');
  if (!track) return;
  requestAnimationFrame(() => {
    const activeEl = track.querySelector(`.roadmap-node[data-set-id="${activeSetId}"]`) || track.querySelector('.worldmap-zone:last-child .roadmap-node:last-child');
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function toggleWorldMapZone(roadmapId) {
  if (expandedZoneIds.has(roadmapId)) expandedZoneIds.delete(roadmapId);
  else expandedZoneIds.add(roadmapId);
  renderWorldMapZones();
}

async function selectWorldMapPackage(id) {
  activeWorldMapPackageId = id;
  const chipsEl = document.getElementById('worldmap-package-chips');
  if (chipsEl) chipsEl.innerHTML = renderRoadmapChipsHtml(sortedPackageDefinitions(), activeWorldMapPackageId, 'selectWorldMapPackage');
  const track = document.getElementById('worldmap-track');
  if (track) track.innerHTML = '<div class="roadmap-loading">Loading world map…</div>';
  await loadWorldMapPackageProgress(activeWorldMapPackageId);
  renderWorldMapZones();
  scrollWorldMapToActiveNode();
}

function filterWorldMapIndex(query) {
  const listEl = document.getElementById('worldmap-index-list');
  if (!listEl) return;
  listEl.innerHTML = buildWorldMapIndexHtml(buildWorldMapIndexEntries(), query, selectedIndexRoadmapId, selectedIndexSetId);
}

function toggleWorldMapIndex(forceState) {
  worldMapIndexOpen = typeof forceState === 'boolean' ? forceState : !worldMapIndexOpen;
  const indexEl = document.getElementById('worldmap-index');
  const backdropEl = document.getElementById('worldmap-index-backdrop');
  if (indexEl) indexEl.classList.toggle('worldmap-index-open', worldMapIndexOpen);
  if (backdropEl) backdropEl.classList.toggle('worldmap-index-open', worldMapIndexOpen);
}

function closeWorldMapIndex() {
  toggleWorldMapIndex(false);
}

async function navigateWorldMapIndex(roadmapId, setId) {
  const roadmap = roadmapDefinitions.find(r => r.id === roadmapId);
  if (!roadmap) return;

  selectedIndexRoadmapId = roadmapId;
  selectedIndexSetId = setId || null;
  const searchInput = document.getElementById('worldmap-index-search');
  filterWorldMapIndex(searchInput ? searchInput.value : '');

  if (roadmap.packageId !== activeWorldMapPackageId) {
    activeWorldMapPackageId = roadmap.packageId;
    const chipsEl = document.getElementById('worldmap-package-chips');
    if (chipsEl) chipsEl.innerHTML = renderRoadmapChipsHtml(sortedPackageDefinitions(), activeWorldMapPackageId, 'selectWorldMapPackage');
    await loadWorldMapPackageProgress(activeWorldMapPackageId);
  }

  expandedZoneIds.add(roadmapId);
  renderWorldMapZones();
  closeWorldMapIndex();

  requestAnimationFrame(() => {
    const track = document.getElementById('worldmap-track');
    if (!track) return;
    const target = setId
      ? track.querySelector(`.roadmap-node[data-set-id="${setId}"]`)
      : track.querySelector(`.worldmap-zone[data-roadmap-id="${roadmapId}"] .worldmap-zone-header`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function renderContinueQuestCard() {
  const el = document.getElementById('worldmap-continue-quest');
  if (!el) return;
  const activeMeta = questionSets.find(s => s.id === activeSetId);
  const roadmap = activeMeta ? roadmapDefinitions.find(r => r.id === activeMeta.roadmapId) : null;
  el.innerHTML = buildContinueQuestCardHtml(activeMeta, roadmap ? roadmap.name : null);
}
