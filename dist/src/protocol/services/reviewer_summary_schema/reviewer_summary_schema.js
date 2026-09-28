import { getProtocolVersion } from '../review_protocol';
export const summarySchemaVersion = 1;
export function createReviewerSummary(repositoryId, metrics) {
    return {
        metrics: assertPrimitiveMetrics(metrics),
        protocolVersion: getProtocolVersion(),
        reviewerNode: {
            repositoryId: assertPositiveInteger(repositoryId, 'reviewerNode.repositoryId'),
        },
        summarySchemaVersion,
    };
}
export function validateReviewerSummary(value) {
    if (!isRecord(value)) {
        throw new Error('Reviewer Summary must be a JSON object.');
    }
    if (value.protocolVersion !== getProtocolVersion()) {
        throw new Error('Reviewer Summary protocolVersion is unsupported.');
    }
    if (value.summarySchemaVersion !== summarySchemaVersion) {
        throw new Error('Reviewer Summary summarySchemaVersion is unsupported.');
    }
    if (!isRecord(value.reviewerNode)) {
        throw new Error('Reviewer Summary reviewerNode must be an object.');
    }
    return createReviewerSummary(assertPositiveInteger(value.reviewerNode.repositoryId, 'reviewerNode.repositoryId'), parseMetrics(value.metrics));
}
export function stringifyReviewerSummary(summary) {
    const validated = validateReviewerSummary(summary);
    return `${JSON.stringify(validated, null, 2)}\n`;
}
function parseMetrics(value) {
    if (!isRecord(value)) {
        throw new Error('Reviewer Summary metrics must be an object.');
    }
    const keys = Object.keys(value).sort();
    const expectedKeys = [
        'invalidReviewCommentCount',
        'reReviewRequestIssueCount',
        'reviewBackedStarCount',
        'validReviewRequestIssueCount',
    ];
    if (keys.join('\n') !== expectedKeys.join('\n')) {
        throw new Error('Reviewer Summary metrics must contain exactly the primitive MVP metrics.');
    }
    return assertPrimitiveMetrics({
        invalidReviewCommentCount: value.invalidReviewCommentCount,
        reReviewRequestIssueCount: value.reReviewRequestIssueCount,
        reviewBackedStarCount: value.reviewBackedStarCount,
        validReviewRequestIssueCount: value.validReviewRequestIssueCount,
    });
}
function assertPrimitiveMetrics(metrics) {
    const primitiveMetrics = {
        invalidReviewCommentCount: assertNonNegativeInteger(metrics.invalidReviewCommentCount, 'metrics.invalidReviewCommentCount'),
        reReviewRequestIssueCount: assertNonNegativeInteger(metrics.reReviewRequestIssueCount, 'metrics.reReviewRequestIssueCount'),
        reviewBackedStarCount: assertNonNegativeInteger(metrics.reviewBackedStarCount, 'metrics.reviewBackedStarCount'),
        validReviewRequestIssueCount: assertNonNegativeInteger(metrics.validReviewRequestIssueCount, 'metrics.validReviewRequestIssueCount'),
    };
    assertPrimitiveMetricInvariants(primitiveMetrics);
    return primitiveMetrics;
}
function assertPrimitiveMetricInvariants(metrics) {
    if (metrics.reReviewRequestIssueCount
        > metrics.validReviewRequestIssueCount) {
        throw new Error('metrics.reReviewRequestIssueCount must not exceed '
            + 'metrics.validReviewRequestIssueCount.');
    }
    const initialReviewRequestCount = metrics.validReviewRequestIssueCount
        - metrics.reReviewRequestIssueCount;
    if (metrics.reviewBackedStarCount > initialReviewRequestCount) {
        throw new Error('metrics.reviewBackedStarCount must not exceed initial review requests.');
    }
}
function assertPositiveInteger(value, field) {
    if (!Number.isInteger(value) || Number(value) <= 0) {
        throw new Error(`${field} must be a positive integer.`);
    }
    return Number(value);
}
function assertNonNegativeInteger(value, field) {
    if (!Number.isInteger(value) || Number(value) < 0) {
        throw new Error(`${field} must be a non-negative integer.`);
    }
    return Number(value);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
