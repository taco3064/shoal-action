import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise the distributed Action entry point; all behavior comes from dist/.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const author = { id: 10, login: 'requester', type: 'User' };
const reviewer = { id: 20, login: 'reviewer', type: 'User' };
const rootId = 100;
const reviewerId = 200;
const targetId = 300;
const targetCommit = 'a'.repeat(40);
const policyCommit = 'b'.repeat(40);
const initialMetrics = {
  invalidReviewCommentCount: 0, reReviewRequestIssueCount: 0,
  reviewBackedStarCount: 1, validReviewRequestIssueCount: 1,
};
const summary = (metrics) => ({
  protocolVersion: 1, summarySchemaVersion: 1,
  reviewerNode: { repositoryId: reviewerId }, metrics,
});
const repository = (overrides = {}) => ({
  id: rootId, owner: author, full_name: 'requester/station', name: 'station',
  default_branch: 'main', fork: false, ...overrides,
});
const comment = (payload, admission = false, id = 1) => ({
  id, user: reviewer, created_at: '2026-10-01T00:00:00Z',
  body: `${admission ? 'shoal-review-admission:v1' : 'shoal-review-event:v1'}\n${JSON.stringify(payload)}`,
});
const judgment = (overrides = {}) => ({
  type: 'REVIEWED', reviewerNodeId: reviewerId, targetRepositoryId: targetId,
  targetRepositoryFullName: 'requester/target', targetDefaultBranch: 'main',
  targetCommit, reviewPolicyPath: 'README.md', reviewPolicyCommit: policyCommit,
  verdict: 'PASS', actualStarState: true, reviewedAt: '2026-10-01T00:00:00Z',
  ...overrides,
});
const issue = (number = 1) => ({
  number, state: 'closed', user: author,
  body: '### Repository name\n\ntarget\n\n### Invitation message\n\n_No response_',
});
function fixture(candidate) {
  return {
    '/repos/reviewer/station': repository({ id: reviewerId, owner: reviewer, full_name: 'reviewer/station' }),
    '/repos/reviewer/station/issues': [issue()],
    '/repos/reviewer/station/issues/1/comments': [
      comment({ reviewerNodeId: reviewerId, targetRepositoryId: targetId, repositoryName: 'target' }, true),
      comment(judgment(), false, 2),
    ],
    '/repos/reviewer/station/commits': [{ sha: policyCommit }],
    '/repos/requester/station': candidate,
    '/users/requester/repos': [],
    '/repos/requester/target': repository({ id: targetId, name: 'target', full_name: 'requester/target' }),
    '/repos/requester/target/branches/main': { commit: { sha: targetCommit } },
    '/users/reviewer/starred': [repository({ id: targetId })],
  };
}
async function run(candidate, mutate = () => {}) {
  const routes = fixture(candidate);
  mutate(routes);
  const failures = [];
  const requests = [];
  const workspace = await mkdtemp(join(tmpdir(), 'shoal-action-runtime-'));
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://fixture.invalid').pathname;
    requests.push(path);
    if (request.method !== 'GET' || request.headers.authorization || !(path in routes)) {
      failures.push(`Unexpected request: ${request.method} ${path}`);
      response.writeHead(500).end();
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    const value = routes[path];
    response.writeHead(value === null ? 404 : 200).end(JSON.stringify(value));
  });
  try {
    await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
    const result = await new Promise((resolveResult, reject) => {
      const child = spawn(process.execPath, [join(root, 'dist/main.mjs')], {
        cwd: workspace,
        env: {
          ...process.env,
          GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
          GITHUB_WORKSPACE: workspace, GITHUB_REPOSITORY: 'reviewer/station',
          GITHUB_TOKEN: '', INPUT_GITHUB_TOKEN: '', INPUT_REVIEWER_NODE_REPOSITORY: '',
          INPUT_NETWORK_ROOT_REPOSITORY_ID: String(rootId),
          INPUT_NETWORK_ROOT_REPOSITORY_NAME: 'station',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stdout.resume();
      child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
      const timer = setTimeout(() => child.kill(), 15000);
      child.on('error', reject);
      child.on('close', (code) => { clearTimeout(timer); resolveResult({ code, stderr }); });
    });
    assert.deepEqual(failures, []);
    assert.equal(result.code, 0, result.stderr);
    assert.ok(requests.includes('/repos/requester/station'), 'Requester resolution must execute.');
    return JSON.parse(await readFile(join(workspace, 'reviewer-summary.json'), 'utf8'));
  } finally {
    server.closeAllConnections();
    await new Promise((closed) => server.close(closed));
    await rm(workspace, { recursive: true, force: true });
  }
}

let checks = 0;
const commentsPath = '/repos/reviewer/station/issues/1/comments';
const issuesPath = '/repos/reviewer/station/issues';
const scenarios = [
  ['Initial Review', () => {}, initialMetrics],
  ['Manual Review', (r) => r[commentsPath].shift(), initialMetrics],
  ['admitted pending Request', (r) => {
    r[commentsPath].pop(); r[issuesPath][0].state = 'open';
  }, { ...initialMetrics, reviewBackedStarCount: 0 }],
  ['Re-review and invalid formal result', (r) => {
    r[issuesPath].push(issue(2));
    r['/repos/reviewer/station/issues/2/comments'] = [];
    r[commentsPath].push(
      comment({ type: 'RE_REVIEW_REQUESTED', reviewerNodeId: reviewerId,
        targetRepositoryId: targetId, requestIssueNumber: 2, reason: 'TARGET_CHANGED',
        eligibilityTargetCommit: targetCommit, reviewPolicyCommit: policyCommit }, false, 3),
      comment(judgment({ type: 'RE_REVIEWED' }), false, 4),
      comment(judgment({ type: 'RE_REVIEWED', targetCommit: 'malformed' }), false, 5),
    );
  }, { ...initialMetrics, invalidReviewCommentCount: 1, reReviewRequestIssueCount: 1, validReviewRequestIssueCount: 2 }],
  ['unaccepted duplicate trigger', (r) => {
    r[issuesPath].push(issue(2));
    r['/repos/reviewer/station/issues/2/comments'] = [comment({ type: 'NO_NEW_REVIEW_BASIS' })];
  }, initialMetrics],
  ['actual Star absent', (r) => { r['/users/reviewer/starred'] = []; }, { ...initialMetrics, reviewBackedStarCount: 0 }],
  ['Target commit changed', (r) => {
    r['/repos/requester/target/branches/main'].commit.sha = 'c'.repeat(40);
  }, { ...initialMetrics, reviewBackedStarCount: 0 }],
  ['Policy commit changed', (r) => {
    r['/repos/reviewer/station/commits'][0].sha = 'c'.repeat(40);
  }, { ...initialMetrics, reviewBackedStarCount: 0 }],
  ['self-review', (r) => {
    r['/repos/reviewer/station'].owner = author;
    r[commentsPath].forEach((entry) => { entry.user = author; });
    r['/users/requester/starred'] = r['/users/reviewer/starred'];
  }, { ...initialMetrics, reviewBackedStarCount: 0, validReviewRequestIssueCount: 0 }],
];
for (const [name, mutate, metrics] of scenarios) {
  // Root really is non-fork with no parent; the direct fork differs only in Membership.
  const actualRoot = await run(repository(), mutate);
  const actualFork = await run(repository({ id: 400, fork: true, parent: { id: rootId } }), mutate);
  assert.deepEqual(actualRoot, summary(metrics), name);
  assert.deepEqual(actualFork, actualRoot, `${name}: Root/fork equivalence`);
  checks += 2;
  console.log(`Packaged entry point: ${name} Root/direct-fork PASS.`);
}
for (const [name, overrides] of [
  ['Organization Root', { owner: { ...author, type: 'Organization' } }],
  ['Organization fork', { id: 400, fork: true, parent: { id: rootId }, owner: { ...author, type: 'Organization' } }],
  ['Root owner/author mismatch', { owner: { ...author, id: 99 } }],
  ['fork owner/author mismatch', { id: 400, fork: true, parent: { id: rootId }, owner: { ...author, id: 99 } }],
  ['downstream fork', { id: 400, fork: true, parent: { id: 999 }, source: { id: rootId } }],
  ['unrelated fork', { id: 400, fork: true, parent: { id: 999 } }],
  ['unrelated non-fork', { id: 400 }],
  ['fork without parent', { id: 400, fork: true }],
]) {
  const rejected = await run(repository(overrides));
  assert.deepEqual(rejected, summary({ ...initialMetrics, reviewBackedStarCount: 0, validReviewRequestIssueCount: 0 }), name);
  checks += 1;
  console.log(`Packaged entry point rejected: ${name}.`);
}
const manifest = JSON.parse(await readFile(join(root, 'dist/package-manifest.json'), 'utf8'));
assert.ok(manifest.files.every(({ path }) => !path.includes('.test.')));
console.log(`Packaged runtime regression PASS: ${checks} executions; exact Summary contract, read-only IO, no shipped tests.`);
