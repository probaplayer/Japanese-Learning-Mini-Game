// ================================================
// 日本語 QUEST — Roadmap Module
// ================================================

const roadmapQuestionsCache = new Map();
let activeRoadmapTabId = null;
let activeLibraryRoadmapId = null;
let roadmapProgressCache = new Map();

function computeSetProgress(setId, questionsArr) {
  let correct = 0;
  let wrong = 0;
  questionsArr.forEach(q => {
    const key = `${setId}::${generateQuestionId(q)}`;
    const stats = questionStats[key];
    if (!stats) return;
    Object.keys(stats).forEach(gameType => {
      if (gameType === '_meta') return;
      const typeStats = stats[gameType];
      correct += typeStats.correctCount || 0;
      wrong += typeStats.incorrect || 0;
    });
  });
  const total = correct + wrong;
  return { correct, wrong, total, accuracy: total > 0 ? correct / total : 0 };
}

function starsForProgress(progress) {
  if (progress.total === 0) return 0;
  if (progress.accuracy < 0.5) return 1;
  if (progress.accuracy < 0.8) return 2;
  return 3;
}

function renderStarString(stars) {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars);
}

async function getRoadmapQuestionsForSet(meta) {
  if (meta.id === activeSetId) return questions;
  if (roadmapQuestionsCache.has(meta.id)) return roadmapQuestionsCache.get(meta.id);
  const set = await fetchQuestionSetFile(meta.file);
  roadmapQuestionsCache.set(meta.id, set.questions);
  return set.questions;
}

function getSetsForRoadmap(roadmapId) {
  return questionSets.filter(s => s.roadmapId === roadmapId).sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
}

async function computeRoadmapProgress(setsForRoadmap) {
  const progressById = new Map();
  await Promise.all(setsForRoadmap.map(async meta => {
    const setQuestions = await getRoadmapQuestionsForSet(meta);
    const progress = computeSetProgress(meta.id, setQuestions);
    progressById.set(meta.id, { progress, stars: starsForProgress(progress) });
  }));
  return progressById;
}

function buildRoadmapNodesHtml(setsForRoadmap, progressById, { highlightSetId, compact, clickHandler }) {
  let html = '';
  setsForRoadmap.forEach((meta, i) => {
    const entry = progressById.get(meta.id) || { progress: { total: 0 }, stars: 0 };
    const { progress, stars } = entry;
    const side = compact ? '' : (i % 2 === 0 ? 'roadmap-node-left' : 'roadmap-node-right');
    const playedClass = progress.total > 0 ? 'roadmap-node-played' : '';
    const isHighlighted = meta.id === highlightSetId;
    const highlightClass = isHighlighted ? 'roadmap-node-highlighted' : '';
    const showAvatar = isHighlighted && !compact;
    const categoryIcon = meta.category === 'grammar' ? '🧩' : '📖';
    const styleAttr = compact ? '' : ` style="--i:${i}"`;
    html += `
      <button class="roadmap-node ${side} ${playedClass} ${highlightClass}"${styleAttr} data-set-id="${escapeHtml(meta.id)}" onclick="${clickHandler}(this, '${escapeHtml(meta.id)}')">
        ${showAvatar ? '<span class="roadmap-avatar" aria-hidden="true">🚀</span>' : ''}
        <span class="roadmap-node-icon">${categoryIcon}</span>
        <span class="roadmap-node-body">
          <span class="roadmap-node-name">${escapeHtml(meta.name)}</span>
          <span class="roadmap-node-meta">${meta.questionCount} questions · ${renderStarString(stars)}</span>
        </span>
      </button>`;
  });
  return html;
}

function renderRoadmapChipsHtml(definitions, selectedId, onSelectFnName) {
  return definitions.map(def => {
    const activeClass = def.id === selectedId ? 'roadmap-tab-active' : '';
    return `<button class="roadmap-tab ${activeClass}" onclick="${onSelectFnName}('${escapeHtml(def.id)}')">${escapeHtml(def.name)}</button>`;
  }).join('');
}

function pickDefaultRoadmapId(fallbackId) {
  if (fallbackId && roadmapDefinitions.some(d => d.id === fallbackId)) return fallbackId;
  const activeMeta = questionSets.find(s => s.id === activeSetId);
  if (activeMeta && activeMeta.roadmapId && roadmapDefinitions.some(d => d.id === activeMeta.roadmapId)) {
    return activeMeta.roadmapId;
  }
  return roadmapDefinitions.length > 0 ? roadmapDefinitions[0].id : null;
}

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
  if (nodeEl) nodeEl.classList.add('roadmap-node-launch');
  const avatarEl = document.querySelector('#roadmap-track .roadmap-avatar');
  if (avatarEl) avatarEl.classList.add('roadmap-avatar-launch');
  switchQuestionSet(id);
  setTimeout(() => showScreen('screen-menu'), 300);
}

async function renderLibrarySetsTab() {
  const container = document.getElementById('library-set-roadmap');
  if (!container) return;
  const meta = questionSets.find(s => s.id === activeSetId);
  if (!meta || !meta.roadmapId) {
    container.innerHTML = '<div class="roadmap-loading">This set isn\'t part of a roadmap yet.</div>';
    return;
  }
  container.innerHTML = '<div class="roadmap-loading">Loading roadmap…</div>';
  try {
    const sets = getSetsForRoadmap(meta.roadmapId);
    const progressById = await computeRoadmapProgress(sets);
    container.innerHTML = buildRoadmapNodesHtml(sets, progressById, { highlightSetId: activeSetId, compact: true, clickHandler: 'selectRoadmapNodeInPlace' });
  } catch (e) {
    console.error('Failed to render library set roadmap:', e);
    container.innerHTML = '<div class="roadmap-loading">❌ Failed to load the roadmap. Please try again.</div>';
  }
}

function selectRoadmapNodeInPlace(nodeEl, id) {
  if (nodeEl) nodeEl.classList.add('roadmap-node-launch');
  switchQuestionSet(id);
}

function selectLibraryTab(tab) {
  const setsTab = document.getElementById('library-sets-tab');
  const roadmapsTab = document.getElementById('library-roadmaps-tab');
  const setsBtn = document.getElementById('library-tab-btn-sets');
  const roadmapsBtn = document.getElementById('library-tab-btn-roadmaps');
  if (setsTab) setsTab.classList.toggle('hidden', tab !== 'sets');
  if (roadmapsTab) roadmapsTab.classList.toggle('hidden', tab !== 'roadmaps');
  if (setsBtn) setsBtn.classList.toggle('library-tab-active', tab === 'sets');
  if (roadmapsBtn) roadmapsBtn.classList.toggle('library-tab-active', tab === 'roadmaps');
  if (tab === 'sets') renderLibrarySetsTab();
  if (tab === 'roadmaps' && typeof renderLibraryRoadmapsTab === 'function') renderLibraryRoadmapsTab();
}

function refreshLibraryRoadmapPreview() {
  const setsTab = document.getElementById('library-sets-tab');
  const roadmapsTab = document.getElementById('library-roadmaps-tab');
  if (setsTab && !setsTab.classList.contains('hidden')) renderLibrarySetsTab();
  if (roadmapsTab && !roadmapsTab.classList.contains('hidden') && typeof renderLibraryRoadmapsTab === 'function') renderLibraryRoadmapsTab();
}

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
