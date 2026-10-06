export function getRecognizableInitialReviewEvidence(record) {
    return record.type === 'REVIEWED'
        ? {
            reviewerNodeId: record.reviewerNodeId,
            targetRepositoryId: record.targetRepositoryId,
        }
        : null;
}
