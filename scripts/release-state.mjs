import { isDeepStrictEqual } from 'node:util';

export function publicationState({ candidate, evidence, run, tag, release, publicationFailed = false, marketplaceConfirmed = false }) {
  const invalid = !evidence || evidence.formatVersion !== 1
    || evidence.state !== 'tag_verification_passed_publication_pending'
    || evidence.distributionRepository !== 'taco3064/shoal-action'
    || evidence.distributionCommit !== candidate.commit || evidence.distributionTree !== candidate.tree
    || !isDeepStrictEqual(evidence.source, candidate.source)
    || evidence.manifestDigest !== candidate.source.packageManifestSha256
    || evidence.verifiedSource?.commit !== candidate.source.sourceCommit
    || evidence.verifiedSource?.tree !== candidate.source.sourceCandidateTree
    || tag.commit !== candidate.commit
    || !/^v[0-9]+\.[0-9]+\.[0-9]+$/u.test(tag.name)
    || run?.head_sha !== candidate.commit || run?.head_branch !== tag.name
    || run?.event !== 'push' || run?.path !== '.github/workflows/release.yml'
    || run?.status !== 'completed' || run?.conclusion !== 'success'
    || String(run?.id) !== String(evidence.runId)
    || String(run?.run_attempt) !== String(evidence.runAttempt);
  if (invalid) return { state: 'candidate_verification_failed', publicationEligible: false };
  if (release && release.tag_name !== tag.name) throw new Error('Release tag does not match verified candidate.');
  const published = release && !release.draft && !release.prerelease;
  if (marketplaceConfirmed && !published) throw new Error('Marketplace confirmation requires a published stable GitHub Release.');
  const state = published && marketplaceConfirmed ? 'publication_completed'
    : publicationFailed ? 'publication_failed_retryable'
      : 'tag_verification_passed_publication_pending';
  return {
    state, publicationEligible: true, distributionCommit: candidate.commit, distributionTree: candidate.tree,
    tag: tag.name, source: candidate.source,
    retry: 'reuse_same_tag_commit_tree_source_and_payload_without_building',
    trustAdmission: 'requires_explicit_platform_approval',
  };
}
