import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createPublisher } from '../src/publish.js';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function makeFixtureRepoWithOrigin() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jq-publish-'));
  const bareOrigin = path.join(root, 'origin.git');
  const repoRoot = path.join(root, 'repo');
  fs.mkdirSync(bareOrigin);
  fs.mkdirSync(repoRoot);
  fs.mkdirSync(path.join(repoRoot, 'questions'));

  git(bareOrigin, ['init', '--bare', '-q']);
  git(repoRoot, ['init', '-q']);
  git(repoRoot, ['config', 'user.email', 'test@example.com']);
  git(repoRoot, ['config', 'user.name', 'Test']);
  git(repoRoot, ['remote', 'add', 'origin', bareOrigin]);
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'hello\n');
  fs.writeFileSync(path.join(repoRoot, 'questions', 'manifest.json'), '{"sets":[]}\n');
  git(repoRoot, ['add', 'README.md', 'questions/manifest.json']);
  git(repoRoot, ['commit', '-q', '-m', 'initial']);
  git(repoRoot, ['branch', '-M', 'main']);
  git(repoRoot, ['push', '-q', '-u', 'origin', 'main']);

  return { repoRoot, bareOrigin };
}

function testStatusSeparatesQuestionsChangesFromOtherChanges() {
  const { repoRoot } = makeFixtureRepoWithOrigin();
  fs.appendFileSync(path.join(repoRoot, 'questions', 'manifest.json'), '\n');
  const publisher = createPublisher({ repoRoot });
  const status = publisher.status();
  assert.strictEqual(status.questionsChanges.length, 1);
  assert.strictEqual(status.otherChanges.length, 0);
}

function testPublishRefusesWhenUnrelatedFilesAreDirty() {
  const { repoRoot } = makeFixtureRepoWithOrigin();
  fs.appendFileSync(path.join(repoRoot, 'questions', 'manifest.json'), '\n');
  fs.appendFileSync(path.join(repoRoot, 'README.md'), 'unrelated change\n');
  const publisher = createPublisher({ repoRoot });
  assert.throws(() => publisher.publish('should fail'), /unrelated uncommitted changes/);
}

function testPublishRefusesWhenNothingChangedUnderQuestions() {
  const { repoRoot } = makeFixtureRepoWithOrigin();
  const publisher = createPublisher({ repoRoot });
  assert.throws(() => publisher.publish('nothing to do'), /No changes under questions\//);
}

function testPublishRefusesWhenNotOnMainBranch() {
  const { repoRoot } = makeFixtureRepoWithOrigin();
  git(repoRoot, ['checkout', '-q', '-b', 'some-other-branch']);
  fs.appendFileSync(path.join(repoRoot, 'questions', 'manifest.json'), '\n');
  const publisher = createPublisher({ repoRoot });
  assert.throws(() => publisher.publish('should fail'), /current branch is "some-other-branch", expected "main"/);
}

function testPublishCommitsAndPushesToOrigin() {
  const { repoRoot, bareOrigin } = makeFixtureRepoWithOrigin();
  fs.writeFileSync(path.join(repoRoot, 'questions', 'new-set.json'), '{"id":"new-set","questions":[]}\n');
  fs.writeFileSync(path.join(repoRoot, 'questions', 'manifest.json'), '{"sets":[{"id":"new-set"}]}\n');
  const publisher = createPublisher({ repoRoot });

  const result = publisher.publish('test: add new-set');
  assert.ok(result.commitHash);

  const localLog = git(repoRoot, ['log', '--oneline', '-1']);
  assert.ok(localLog.includes('test: add new-set'));

  const originLog = git(bareOrigin, ['log', '--oneline', '-1', 'main']);
  assert.ok(originLog.includes('test: add new-set'), `expected push to reach origin, got: ${originLog}`);

  const statusAfter = publisher.status();
  assert.strictEqual(statusAfter.questionsChanges.length, 0);
}

testStatusSeparatesQuestionsChangesFromOtherChanges();
testPublishRefusesWhenUnrelatedFilesAreDirty();
testPublishRefusesWhenNothingChangedUnderQuestions();
testPublishRefusesWhenNotOnMainBranch();
testPublishCommitsAndPushesToOrigin();

console.log('publish tests passed');
