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
