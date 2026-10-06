import assert from 'node:assert/strict';
import { register } from 'node:module';

// Supplemental compatibility probes import only the distributed modules.
// Workload behavior is separately proved through dist/main.mjs.
register('../dist/loader.mjs', import.meta.url);
const { validateReviewerSummary } = await import('../dist/src/protocol/services/reviewer_summary_schema/index.js');
const { allowedSummaryWorkflows, legacyReviewerSummaryContract: v1,
  currentReviewerSummaryContract: v2 } = await import('../dist/src/protocol/services/network_compatibility/index.js');
assert.deepEqual(v1, { protocolVersion: 1, summarySchemaVersion: 1 });
assert.deepEqual(v2, { protocolVersion: 1, summarySchemaVersion: 2 });
const legacy = { protocolVersion: 1, summarySchemaVersion: 1,
  reviewerNode: { repositoryId: 200 }, metrics: {
    reviewBackedStarCount: 1, validReviewRequestIssueCount: 2,
    reReviewRequestIssueCount: 1, invalidReviewCommentCount: 0,
  } };
const current = { ...legacy, summarySchemaVersion: 2, metrics: { ...legacy.metrics,
  pendingReviewRequestCount: 1, completedReviewRequestCount: 1 } };
assert.deepEqual(validateReviewerSummary(current, v2), current);
// Exact historical bindings retain their own schemas; no future generation is admitted.
const schema2Digests = new Set([
  '0dee3b797307225e38b475e0456cff6434ca53c4b0580fb3f4a11dfdc5eece35',
  'b9162cae864bbd6e00745346f37f701fe5c003d3367cc3dc37c6fb394f9d8105',
  'f6cda44c7e6e12117dac3c1f1c145bb69283eb3cfe66690ba67adddd3b4e89bd',
]);
assert.deepEqual([...allowedSummaryWorkflows.keys()].sort(), [
  ...schema2Digests,
  '3b66f6c4afb545bbf1ad847aed96d0dd8c336e6df100c6b898250a0bddf58fd6',
  '616eea6f7ce06c0991f0023768c02c79a99d53aeb2f845c0934461720546a999',
  'd586ab618c894d9729e21d7105becb0ca805df576198353293b1f77818927e99',
  '70d1011d0b1a6a68677bc891a408f2b73af868a89d283bffdfefa2fd24a6b9d2',
].sort());
for (const [digest, binding] of allowedSummaryWorkflows) {
  if (schema2Digests.has(digest)) {
    assert.deepEqual(binding.reviewerSummary, v2);
    assert.equal(binding.actionCommit, digest.startsWith('0dee3b79')
      ? '47e1c3ab5762d66e6f49c3f2a15c133a9785679c'
      : '4918e1afe85f15f8fe263eaf2866cd02a1f70a62');
    assert.deepEqual(validateReviewerSummary(current, binding.reviewerSummary), current);
    assert.throws(() => validateReviewerSummary(legacy, binding.reviewerSummary));
    continue;
  }
  assert.deepEqual(binding.reviewerSummary, v1, digest);
  assert.equal(binding.actionCommit, digest.startsWith('70d1011d')
    ? 'e1824eaa4766891a6fe56bb1ea2dfb3f13541e73' : 'b4d72405ebc03afc35d29093302b5593e1ddff1b');
  assert.deepEqual(validateReviewerSummary(legacy, binding.reviewerSummary), legacy);
  assert.throws(() => validateReviewerSummary(current, binding.reviewerSummary));
}
assert.throws(() => validateReviewerSummary(legacy, v2));
assert.throws(() => validateReviewerSummary({ ...legacy, summarySchemaVersion: 99 }, v1));
assert.throws(() => validateReviewerSummary({ ...current, protocolVersion: 2 }, v2));
assert.throws(() => validateReviewerSummary(current, { protocolVersion: 1, summarySchemaVersion: 99 }));
for (const key of ['pendingReviewRequestCount', 'completedReviewRequestCount']) {
  const missing = structuredClone(current); delete missing.metrics[key];
  assert.throws(() => validateReviewerSummary(missing, v2));
  for (const value of [-1, 0.5, null, '1']) {
    assert.throws(() => validateReviewerSummary({ ...current, metrics: { ...current.metrics, [key]: value } }, v2));
  }
}
for (const metrics of [
  { ...current.metrics, pendingReviewRequestCount: 2 },
  { ...current.metrics, score: 100 },
  { ...current.metrics, reReviewRequestIssueCount: 3 },
  { ...current.metrics, reviewBackedStarCount: 2 },
]) assert.throws(() => validateReviewerSummary({ ...current, metrics }, v2));
assert.throws(() => validateReviewerSummary({ ...legacy, metrics: current.metrics }, v1));
const missingLegacy = structuredClone(legacy); delete missingLegacy.metrics.invalidReviewCommentCount;
assert.throws(() => validateReviewerSummary(missingLegacy, v1));
console.log('Distributed schema compatibility PASS: exact v1/v2 keys, trust-selected contracts, no legacy padding, unchanged workflow bindings, invariant negatives.');
