// ================================================
// 日本語 QUEST — World Map Module
// ================================================

let activeWorldMapPackageId = null;

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
    activeWorldMapPackageId = pickDefaultWorldMapPackageId(activeWorldMapPackageId);
    if (!activeWorldMapPackageId) {
      track.innerHTML = '<div class="roadmap-loading">No packages configured yet.</div>';
      return;
    }
    if (chipsEl) chipsEl.innerHTML = renderRoadmapChipsHtml(sortedPackageDefinitions(), activeWorldMapPackageId, 'selectWorldMapPackage');
    renderContinueQuestCard();
    await loadWorldMapPackageProgress(activeWorldMapPackageId);
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
    const activeEl = track.querySelector(`.roadmap-node[data-set-id="${activeSetId}"]`) || track.querySelector('.worldmap-zone:last-child .roadmap-node:last-child');
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

async function selectWorldMapPackage(id) {
  activeWorldMapPackageId = id;
  const chipsEl = document.getElementById('worldmap-package-chips');
  if (chipsEl) chipsEl.innerHTML = renderRoadmapChipsHtml(sortedPackageDefinitions(), activeWorldMapPackageId, 'selectWorldMapPackage');
  const track = document.getElementById('worldmap-track');
  if (track) track.innerHTML = '<div class="roadmap-loading">Loading world map…</div>';
  await loadWorldMapPackageProgress(activeWorldMapPackageId);
  renderWorldMapZones();
}

function renderContinueQuestCard() {
  const el = document.getElementById('worldmap-continue-quest');
  if (!el) return;
  const activeMeta = questionSets.find(s => s.id === activeSetId);
  const roadmap = activeMeta ? roadmapDefinitions.find(r => r.id === activeMeta.roadmapId) : null;
  el.innerHTML = buildContinueQuestCardHtml(activeMeta, roadmap ? roadmap.name : null);
}
