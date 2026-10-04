import { allowedCanonicalReviewRequestFormDigests, allowedSummaryWorkflows, } from '../network_compatibility';
// Both public Network Projection and authenticated onboarding consume this
// exact platform predicate. Canonical Root publication does not grant trust.
export function stationReadiness(input) {
    const reasons = [];
    if (!input.hasIssues) {
        reasons.push('issues_disabled');
    }
    if (!input.formDigest
        || !allowedCanonicalReviewRequestFormDigests.has(input.formDigest)) {
        reasons.push('review_request_surface_missing_or_unsupported');
    }
    if (!input.workflowDigest || !allowedSummaryWorkflows.has(input.workflowDigest)) {
        reasons.push('summary_workflow_missing_or_unsupported');
    }
    return { ready: reasons.length === 0, reasons };
}
