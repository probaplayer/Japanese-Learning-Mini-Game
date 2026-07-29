import { execFileSync } from 'node:child_process';

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

export function createPublisher({ repoRoot, questionsRelDir = 'questions' }) {
  function status() {
    const porcelain = git(repoRoot, ['status', '--porcelain']);
    const lines = porcelain.split('\n').filter(Boolean);
    const prefix = `${questionsRelDir.replace(/\\/g, '/')}/`;
    const questionsChanges = lines.filter(l => l.slice(3).startsWith(prefix));
    const otherChanges = lines.filter(l => !l.slice(3).startsWith(prefix));
    return { questionsChanges, otherChanges };
  }

  function publish(message) {
    const branch = git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    if (branch !== 'main') {
      throw new Error(`Refusing to publish: current branch is "${branch}", expected "main"`);
    }
    const { questionsChanges, otherChanges } = status();
    if (questionsChanges.length === 0) {
      throw new Error(`No changes under ${questionsRelDir}/ to publish`);
    }
    if (otherChanges.length > 0) {
      throw new Error(`Refusing to publish: unrelated uncommitted changes outside ${questionsRelDir}/: ${otherChanges.map(l => l.slice(3)).join(', ')}`);
    }
    git(repoRoot, ['add', questionsRelDir]);
    git(repoRoot, ['commit', '-m', message]);
    git(repoRoot, ['pull', '--rebase', 'origin', 'main']);
    git(repoRoot, ['push', 'origin', 'main']);
    return { commitHash: git(repoRoot, ['rev-parse', 'HEAD']).trim() };
  }

  return { status, publish };
}
