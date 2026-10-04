import { parseProtocolComment } from '~app/protocol/services/review_protocol';
import { getInvalidFormalResultIncrement, isJudgmentLifecycleValid, isPriorInitialReviewEvidence, } from './review_lifecycle';
export async function analyzeReviewThread(input, issue, targetRepositoryId) {
    const result = {
        invalidFormalResultCount: 0,
        lifecycleEvents: [],
        orderedEvidence: [],
        validJudgments: [],
    };
    let hasPriorInitialReviewEvidence = false;
    const comments = [...issue.comments].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id - right.id);
    for (const comment of comments) {
        const parsed = parseProtocolComment(comment.body);
        const priorInitial = hasPriorInitialReviewEvidence;
        hasPriorInitialReviewEvidence ||= isPriorInitialReviewEvidence(parsed, comment, input.reviewerNode, targetRepositoryId);
        if (parsed.kind === 'invalid-formal-result') {
            result.invalidFormalResultCount += getInvalidFormalResultIncrement(issue);
            continue;
        }
        if (parsed.kind === 'judgment') {
            if (comment.author.id !== input.reviewerNode.owner.id
                || parsed.value.reviewerNodeId !== input.reviewerNode.id
                || parsed.value.targetRepositoryId !== targetRepositoryId
                || !isJudgmentLifecycleValid(parsed.value, priorInitial)) {
                result.invalidFormalResultCount += getInvalidFormalResultIncrement(issue);
                continue;
            }
            result.validJudgments.push(parsed.value);
            result.orderedEvidence.push(parsed);
            continue;
        }
        if (parsed.kind !== 'lifecycle' || !priorInitial
            || parsed.value.reviewerNodeId !== input.reviewerNode.id
            || parsed.value.targetRepositoryId !== targetRepositoryId) {
            continue;
        }
        if (comment.author.id === input.reviewerNode.owner.id
            || await input.resolvers.isAllowedLifecycleAutomation(comment, parsed.value, input.reviewerNode)) {
            result.lifecycleEvents.push(parsed.value);
            result.orderedEvidence.push(parsed);
        }
    }
    return result;
}
