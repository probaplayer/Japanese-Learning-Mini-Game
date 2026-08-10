// ================================================
// 日本語 QUEST — Roadmap Module
// ================================================

const ROADMAP_LEVEL_ICONS = { N5: '🌍', N4: '🪐' };
const ROADMAP_DEFAULT_LEVEL_ICON = '🌌';
const roadmapQuestionsCache = new Map();

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

async function renderRoadmap() {
  const track = document.getElementById('roadmap-track');
  if (!track) return;
  track.innerHTML = '<div class="roadmap-loading">Đang tải lộ trình…</div>';

  try {
    const sorted = [...questionSets].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
    const entries = await Promise.all(sorted.map(async meta => {
      const setQuestions = await getRoadmapQuestionsForSet(meta);
      const progress = computeSetProgress(meta.id, setQuestions);
      return { meta, progress, stars: starsForProgress(progress) };
    }));

    let html = '';
    let lastLevel = null;
    entries.forEach((entry, i) => {
      const { meta, progress, stars } = entry;
      const level = meta.level || 'N/A';
      if (level !== lastLevel) {
        const levelIcon = ROADMAP_LEVEL_ICONS[level] || ROADMAP_DEFAULT_LEVEL_ICON;
        html += `<div class="roadmap-section-label">${levelIcon} ${escapeHtml(level)}</div>`;
        lastLevel = level;
      }
      const side = i % 2 === 0 ? 'roadmap-node-left' : 'roadmap-node-right';
      const playedClass = progress.total > 0 ? 'roadmap-node-played' : '';
      const isActive = meta.id === activeSetId;
      const categoryIcon = meta.category === 'grammar' ? '🧩' : '📖';
      html += `
        <button class="roadmap-node ${side} ${playedClass}" style="--i:${i}" data-set-id="${escapeHtml(meta.id)}" onclick="launchRoadmapNode('${escapeHtml(meta.id)}')">
          ${isActive ? '<span class="roadmap-avatar" aria-hidden="true">🚀</span>' : ''}
          <span class="roadmap-node-icon">${categoryIcon}</span>
          <span class="roadmap-node-body">
            <span class="roadmap-node-name">${escapeHtml(meta.name)}</span>
            <span class="roadmap-node-meta">${meta.questionCount} câu · ${renderStarString(stars)}</span>
          </span>
        </button>`;
    });

    track.innerHTML = html;

    requestAnimationFrame(() => {
      const activeEl = track.querySelector(`.roadmap-node[data-set-id="${activeSetId}"]`) || track.querySelector('.roadmap-node:last-child');
      if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  } catch (e) {
    console.error('Failed to render roadmap:', e);
    track.innerHTML = '<div class="roadmap-loading">❌ Không thể tải lộ trình. Vui lòng thử lại.</div>';
    if (typeof showToast === 'function') showToast('❌ Failed to load roadmap', 'err');
  }
}

function launchRoadmapNode(id) {
  const nodeEl = document.querySelector(`.roadmap-node[data-set-id="${id}"]`);
  if (nodeEl) nodeEl.classList.add('roadmap-node-launch');
  const avatarEl = document.querySelector('.roadmap-avatar');
  if (avatarEl) avatarEl.classList.add('roadmap-avatar-launch');
  switchQuestionSet(id);
  setTimeout(() => showScreen('screen-menu'), 300);
}
