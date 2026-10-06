import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../dist/loader.mjs', import.meta.url);
const { encodeEvidenceDocument, renderEvidenceComment, reviewProtocol } = await import('../dist/src/protocol/services/review_protocol/index.js');
const canonical = (record) => {
  if ('repositoryName' in record || 'verdict' in record || 'eligibilityTargetCommit' in record) return renderEvidenceComment(record, { requestAuthor: 'requester', explanation: 'Policy checked.' });
  return reviewProtocol.evidence.startSentinel + '\n' + encodeEvidenceDocument(record) + '\n' + reviewProtocol.evidence.endSentinel;
};
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
  pendingReviewRequestCount: 0, completedReviewRequestCount: 1,
};
const summary = (metrics) => ({
  protocolVersion: 1, summarySchemaVersion: 2,
  reviewerNode: { repositoryId: reviewerId }, metrics,
});
const repository = (overrides = {}) => ({
  id: rootId, owner: author, full_name: 'requester/station', name: 'station',
  default_branch: 'main', fork: false, ...overrides,
});
const comment = (payload, admission = false, id = 1) => ({
  id, user: reviewer, created_at: '2026-10-01T00:00:00Z',
  body: canonical(payload),
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
    if (routes['/repos/reviewer/station/issues'].some((entry) => entry.body.startsWith('### Repository name'))) {
      assert.ok(requests.includes('/repos/requester/station'), 'Requester resolution must execute.');
    }
    const emitted = JSON.parse(await readFile(join(workspace, 'reviewer-summary.json'), 'utf8'));
    assert.equal(emitted.protocolVersion, 1);
    assert.equal(emitted.summarySchemaVersion, 2);
    assert.deepEqual(Object.keys(emitted.metrics).sort(), Object.keys(initialMetrics).sort());
    assert.equal(emitted.metrics.pendingReviewRequestCount + emitted.metrics.completedReviewRequestCount,
      emitted.metrics.validReviewRequestIssueCount);
    return emitted;
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
  }, { ...initialMetrics, reviewBackedStarCount: 0, pendingReviewRequestCount: 1, completedReviewRequestCount: 0 }],
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
  }, { ...initialMetrics, invalidReviewCommentCount: 1, reReviewRequestIssueCount: 1, validReviewRequestIssueCount: 2, completedReviewRequestCount: 2 }],
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
  }, { ...initialMetrics, reviewBackedStarCount: 0, validReviewRequestIssueCount: 0, completedReviewRequestCount: 0 }],
];
const changedCommit = 'c'.repeat(40);
function acceptTrigger(routes, number = 2, id = 3, commit = changedCommit) {
  routes[issuesPath].push(issue(number));
  routes[`/repos/reviewer/station/issues/${number}/comments`] = [];
  routes[commentsPath].push(comment({ type: 'RE_REVIEW_REQUESTED', reviewerNodeId: reviewerId,
    targetRepositoryId: targetId, requestIssueNumber: number, reason: 'TARGET_CHANGED',
    eligibilityTargetCommit: commit, reviewPolicyCommit: policyCommit }, false, id));
}
const pendingEpoch = { ...initialMetrics, reReviewRequestIssueCount: 1,
  validReviewRequestIssueCount: 2, pendingReviewRequestCount: 1 };
const completedEpoch = { ...pendingEpoch, pendingReviewRequestCount: 0, completedReviewRequestCount: 2 };
scenarios.push(
  ['Initial FAIL completes workload', (r) => {
    r[commentsPath][1] = comment(judgment({ verdict: 'FAIL', actualStarState: false }), false, 2);
    r['/users/reviewer/starred'] = [];
  }, { ...initialMetrics, reviewBackedStarCount: 0 }],
  ['invalid Initial result remains pending', (r) => {
    r[commentsPath][1] = comment(judgment({ targetCommit: 'malformed' }), false, 2);
  }, { ...initialMetrics, reviewBackedStarCount: 0, invalidReviewCommentCount: 1,
    pendingReviewRequestCount: 1, completedReviewRequestCount: 0 }],
  ['pending Re-review with open converged basis', (r) => {
    acceptTrigger(r); r[issuesPath][0].state = 'open';
  }, pendingEpoch],
  ['closed terminal no-new-basis completion without judgment', (r) => {
    acceptTrigger(r);
  }, completedEpoch],
  ['closed terminal Target drift remains pending', (r) => {
    acceptTrigger(r); r['/repos/requester/target/branches/main'].commit.sha = changedCommit;
  }, { ...pendingEpoch, reviewBackedStarCount: 0 }],
  ['closed terminal Policy drift remains pending', (r) => {
    acceptTrigger(r); r['/repos/reviewer/station/commits'][0].sha = changedCommit;
  }, { ...pendingEpoch, reviewBackedStarCount: 0 }],
  ['Re-review PASS completes workload', (r) => {
    acceptTrigger(r); r[commentsPath].push(comment(judgment({ type: 'RE_REVIEWED' }), false, 4));
  }, completedEpoch],
  ['Re-review FAIL completes workload', (r) => {
    acceptTrigger(r); r[commentsPath].push(comment(judgment({ type: 'STAR_REVOKED',
      verdict: 'FAIL', actualStarState: false }), false, 4)); r['/users/reviewer/starred'] = [];
  }, { ...completedEpoch, reviewBackedStarCount: 0 }],
  ['invalid Re-review does not complete open epoch', (r) => {
    acceptTrigger(r); r[issuesPath][0].state = 'open';
    r[commentsPath].push(comment(judgment({ type: 'RE_REVIEWED', targetCommit: 'malformed' }), false, 4));
  }, pendingEpoch],
  ['closed drifted epoch with invalid result remains pending', (r) => {
    acceptTrigger(r); r['/repos/requester/target/branches/main'].commit.sha = changedCommit;
    r[commentsPath].push(comment(judgment({ type: 'RE_REVIEWED', targetCommit: 'malformed' }), false, 4));
  }, { ...pendingEpoch, reviewBackedStarCount: 0, invalidReviewCommentCount: 1 }],
  ['multiple triggers completed by one judgment', (r) => {
    acceptTrigger(r); acceptTrigger(r, 3, 4, 'd'.repeat(40));
    r[commentsPath].push(comment(judgment({ type: 'RE_REVIEWED' }), false, 5));
  }, { ...completedEpoch, reReviewRequestIssueCount: 2, validReviewRequestIssueCount: 3,
    completedReviewRequestCount: 3 }],
  ['later epoch remains pending after completed epoch', (r) => {
    acceptTrigger(r); r[commentsPath].push(comment(judgment({ type: 'RE_REVIEWED' }), false, 4));
    acceptTrigger(r, 3, 5, 'd'.repeat(40)); r[issuesPath][0].state = 'open';
    r[commentsPath].reverse(); // Same timestamps: numeric comment ID must restore order.
  }, { ...pendingEpoch, reReviewRequestIssueCount: 2, validReviewRequestIssueCount: 3,
    completedReviewRequestCount: 2 }],
  ['superseded non-judgment close does not invent history', (r) => {
    acceptTrigger(r); acceptTrigger(r, 3, 4, 'd'.repeat(40)); r[issuesPath][0].state = 'open';
  }, { ...pendingEpoch, reReviewRequestIssueCount: 2, validReviewRequestIssueCount: 3,
    pendingReviewRequestCount: 2 }],
  ['chronology precedes numeric ID', (r) => {
    acceptTrigger(r, 2, 50);
    r[commentsPath].at(-1).created_at = '2026-10-01T01:00:00Z';
    const result = comment(judgment({ type: 'RE_REVIEWED' }), false, 4);
    result.created_at = '2026-10-01T02:00:00Z';
    r[commentsPath].push(result); r[commentsPath].reverse();
  }, completedEpoch],
  ['malformed Request excludes workload', (r) => {
    r[issuesPath][0].body = 'not a Request';
  }, { ...initialMetrics, reviewBackedStarCount: 0, validReviewRequestIssueCount: 0,
    completedReviewRequestCount: 0 }],
  ['invalid Request excludes workload', (r) => {
    r[commentsPath] = [comment({ type: 'INVALID_REQUEST' })];
  }, { ...initialMetrics, reviewBackedStarCount: 0, validReviewRequestIssueCount: 0,
    completedReviewRequestCount: 0 }],
);
for (const body of ['Review Result: PASS', 'REVIEWED', JSON.stringify(judgment()),
  'shoal-review-event:v1\n' + JSON.stringify(judgment()),
  canonical(judgment()) + canonical(judgment()),
  canonical(judgment()).replace('"formatVersion":1', '"formatVersion":99'),
  canonical(judgment()).replace('"formatVersion":1', '"formatVersion":1,"formatVersion":1')]) {
  scenarios.push(['non-authoritative / rejected envelope', (r) => {
    r[commentsPath][1].body = body; r[issuesPath][0].state = 'open';
  }, { ...initialMetrics, reviewBackedStarCount: 0, pendingReviewRequestCount: 1, completedReviewRequestCount: 0 }]);
}
for (const body of [canonical(judgment()) + canonical(judgment()),
  canonical(judgment()).replace('"formatVersion":1', '"formatVersion":99'),
  canonical(judgment()).replaceAll('shoal-evidence:v1:', 'shoal-evidence:v99:'),
  canonical(judgment()).replace('"formatVersion":1', '"formatVersion":1,"formatVersion":1'),
  canonical(judgment()).replace('<!-- shoal-evidence:v1:end -->', ''),
]) {
  scenarios.push(['F-01 closed canonical invalid result increments I once', (r) => {
    r[commentsPath][1].body = body;
    r[issuesPath][0].state = 'closed';
  }, { ...initialMetrics, reviewBackedStarCount: 0, invalidReviewCommentCount: 1,
    pendingReviewRequestCount: 1, completedReviewRequestCount: 0 }]);
}
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
  assert.deepEqual(rejected, summary({ ...initialMetrics, reviewBackedStarCount: 0, validReviewRequestIssueCount: 0, completedReviewRequestCount: 0 }), name);
  checks += 1;
  console.log(`Packaged entry point rejected: ${name}.`);
}
const manifest = JSON.parse(await readFile(join(root, 'dist/package-manifest.json'), 'utf8'));
assert.ok(manifest.files.every(({ path }) => !path.includes('.test.')));
console.log(`Packaged runtime regression PASS: ${checks} executions; exact Summary contract, read-only IO, no shipped tests.`);
