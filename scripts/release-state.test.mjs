import assert from 'node:assert/strict';
import { publicationState } from './release-state.mjs';
const source = {
  sourceCommit: '1'.repeat(40), sourceCandidateTree: '2'.repeat(40), packageManifestSha256: '3'.repeat(64),
};
const fixture = {
  candidate: { commit: '4'.repeat(40), tree: '5'.repeat(40), source },
  evidence: {
    formatVersion: 1, state: 'tag_verification_passed_publication_pending',
    distributionRepository: 'taco3064/shoal-action', distributionCommit: '4'.repeat(40),
    distributionTree: '5'.repeat(40), source, manifestDigest: source.packageManifestSha256,
    verifiedSource: { commit: source.sourceCommit, tree: source.sourceCandidateTree }, runId: '123', runAttempt: '1',
  },
  tag: { name: 'v0.2.0', commit: '4'.repeat(40) },
  run: { id: 123, run_attempt: 1, head_sha: '4'.repeat(40), head_branch: 'v0.2.0', event: 'push',
    path: '.github/workflows/release.yml', status: 'completed', conclusion: 'success' },
  release: null,
};
assert.equal(publicationState(fixture).state, 'tag_verification_passed_publication_pending');
for (const mutate of [
  (f) => { f.run.conclusion = 'failure'; },
  (f) => { f.run.status = 'in_progress'; },
  (f) => { f.run.run_attempt = 2; },
  (f) => { f.run.path = '.github/workflows/ci.yml'; },
  (f) => { f.run.event = 'pull_request'; },
  (f) => { f.tag.commit = '6'.repeat(40); },
  (f) => { f.candidate.tree = '6'.repeat(40); },
  (f) => { f.evidence.source.sourceCommit = '6'.repeat(40); },
  (f) => { f.evidence.manifestDigest = '6'.repeat(64); },
  (f) => { f.evidence.state = 'candidate_verified'; },
]) {
  const f = JSON.parse(JSON.stringify(fixture));
  mutate(f);
  assert.equal(publicationState(f).publicationEligible, false);
}
const retry = publicationState({ ...fixture, publicationFailed: true });
assert.equal(retry.state, 'publication_failed_retryable');
assert.deepEqual(retry.source, source);
assert.equal(retry.distributionCommit, fixture.candidate.commit);
assert.equal(retry.distributionTree, fixture.candidate.tree);
assert.equal(retry.tag, fixture.tag.name);
const release = { tag_name: 'v0.2.0', draft: false, prerelease: false };
assert.equal(publicationState({ ...fixture, release }).state, 'tag_verification_passed_publication_pending');
assert.equal(publicationState({ ...fixture, release, marketplaceConfirmed: true }).state, 'publication_completed');
assert.throws(() => publicationState({ ...fixture, marketplaceConfirmed: true }));
assert.throws(() => publicationState({ ...fixture, release: { ...release, draft: true }, marketplaceConfirmed: true }));
console.log('Publication states, failed verification, changed candidates, retry identity, and owner Marketplace confirmation passed.');
