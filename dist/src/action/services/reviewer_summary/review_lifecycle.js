import { parseRequestPayload } from '~app/protocol/services/review_protocol';
export function countInvalidFormalResults(threads) {
    return threads.reduce((count, thread) => count + thread.invalidFormalResultCount, 0);
}
export function getCurrentAdmittedRequest(request, admission) {
    const parsed = request && parseRequestPayload(request.issue.body);
    return request
        && request.target.id === admission.targetRepositoryId
        && parsed?.repositoryName.toLowerCase()
            === admission.repositoryName.toLowerCase()
        ? request
        : null;
}
export function getInvalidFormalResultIncrement(issue) {
    return issue.state === 'closed' ? 1 : 0;
}
export function isJudgmentLifecycleValid(judgment, hasPriorInitialReviewEvidence) {
    return hasPriorInitialReviewEvidence
        ? judgment.type !== 'REVIEWED'
        : judgment.type === 'REVIEWED';
}
export function isPriorInitialReviewEvidence(parsed, comment, reviewerNode, targetRepositoryId) {
    if (comment.author.id !== reviewerNode.owner.id) {
        return false;
    }
    if (parsed.kind === 'invalid-formal-result') {
        const evidence = parsed.initialReviewEvidence;
        return Boolean(evidence
            && (evidence.reviewerNodeId === undefined
                || evidence.reviewerNodeId === reviewerNode.id)
            && (evidence.targetRepositoryId === undefined
                || evidence.targetRepositoryId === targetRepositoryId));
    }
    return parsed.kind === 'judgment'
        && parsed.value.type === 'REVIEWED'
        && parsed.value.reviewerNodeId === reviewerNode.id
        && parsed.value.targetRepositoryId === targetRepositoryId;
}
