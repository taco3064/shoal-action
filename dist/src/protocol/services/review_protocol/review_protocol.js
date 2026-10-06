import { reviewProtocol } from './contract';
import { decodeEvidenceDocument, getInvalidResultEvidence, } from './evidence_document';
import { getRecognizableInitialReviewEvidence } from './initial_review_evidence';
import { isRfc3339DateTime } from './rfc3339';
const commitPattern = /^[0-9a-f]{40}$/;
const repositoryNamePattern = /^[A-Za-z0-9_.-]+$/;
const repositoryFullNamePattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export function getProtocolVersion() {
    return Number(reviewProtocol.protocolVersion);
}
export function parseProtocolComment(body) {
    const envelope = decodeEvidenceDocument(body);
    if (envelope.kind !== 'present') {
        return (envelope.kind === 'invalid' && getInvalidResultEvidence(body))
            || { kind: 'none' };
    }
    const record = envelope.document.record;
    const admission = !('type' in record) && parseAdmissionRecord(record);
    if (admission) {
        return { kind: 'admission', value: admission };
    }
    const lifecycle = parseLifecycleEvent(record);
    if (lifecycle) {
        return { kind: 'lifecycle', value: lifecycle };
    }
    const judgment = parseJudgmentEvent(record);
    if (judgment) {
        return { kind: 'judgment', value: judgment };
    }
    return isJudgmentCandidateValue(record)
        ? invalidFormalResult(record)
        : { kind: 'none' };
}
function invalidFormalResult(record) {
    return {
        initialReviewEvidence: getRecognizableInitialReviewEvidence(record),
        kind: 'invalid-formal-result',
    };
}
function parseAdmissionRecord(value) {
    if (!isRecord(value)) {
        return null;
    }
    const { reviewerNodeId, targetRepositoryId, repositoryName } = value;
    if (!isPositiveInteger(reviewerNodeId)
        || !isPositiveInteger(targetRepositoryId)
        || typeof repositoryName !== 'string') {
        return null;
    }
    if (!repositoryNamePattern.test(repositoryName)) {
        return null;
    }
    return { repositoryName, reviewerNodeId, targetRepositoryId };
}
function parseLifecycleEvent(value) {
    if (!isRecord(value) || !isLifecycleType(value.type)) {
        return null;
    }
    if (!hasRequiredFields(value, reviewProtocol.event.requiredLifecycleFields)) {
        return null;
    }
    const type = value.type;
    const { reviewerNodeId, targetRepositoryId, requestIssueNumber, eligibilityTargetCommit, reviewPolicyCommit, reason, } = value;
    if (!isPositiveInteger(reviewerNodeId)
        || !isPositiveInteger(targetRepositoryId)
        || !isPositiveInteger(requestIssueNumber)) {
        return null;
    }
    if (!isCommit(eligibilityTargetCommit)
        || !isCommit(reviewPolicyCommit)
        || !isReReviewReason(reason)) {
        return null;
    }
    const automationProvenance = parseAutomationProvenance(value.automationProvenance);
    return {
        automationProvenance,
        eligibilityTargetCommit,
        reason,
        requestIssueNumber,
        reviewPolicyCommit,
        reviewerNodeId,
        targetRepositoryId,
        type,
    };
}
function parseJudgmentEvent(value) {
    if (!isRecord(value) || !isJudgmentType(value.type)) {
        return null;
    }
    const type = value.type;
    if (!hasRequiredFields(value, reviewProtocol.event.requiredJudgmentFields)) {
        return null;
    }
    const { actualStarState, reviewPolicyCommit, reviewPolicyPath, reviewedAt, reviewerNodeId, targetCommit, targetDefaultBranch, targetRepositoryFullName, targetRepositoryId, verdict, } = value;
    if (!isPositiveInteger(reviewerNodeId)
        || !isPositiveInteger(targetRepositoryId)
        || typeof actualStarState !== 'boolean') {
        return null;
    }
    if (!isCommit(targetCommit)
        || !isCommit(reviewPolicyCommit)
        || reviewPolicyPath !== reviewProtocol.event.policyPath) {
        return null;
    }
    if (!isRepositoryFullName(targetRepositoryFullName)
        || typeof targetDefaultBranch !== 'string'
        || targetDefaultBranch.trim() === '') {
        return null;
    }
    if (!isVerdict(verdict)
        || !isRfc3339DateTime(reviewedAt)
        || !isJudgmentStarStateConsistent(type, verdict, actualStarState)) {
        return null;
    }
    return {
        actualStarState,
        reviewPolicyCommit,
        reviewPolicyPath: reviewProtocol.event.policyPath,
        reviewedAt: String(reviewedAt),
        reviewerNodeId,
        targetCommit,
        targetDefaultBranch,
        targetRepositoryFullName,
        targetRepositoryId,
        type,
        verdict,
    };
}
function parseAutomationProvenance(value) {
    if (value === undefined || value === null) {
        return null;
    }
    if (!isRecord(value)) {
        return null;
    }
    if (!hasRequiredFields(value, reviewProtocol.event.automation.requiredProvenanceFields)) {
        return null;
    }
    const { actorLogin, repositoryId, workflowPath, workflowCommit, workflowRunAttempt, workflowRunId, } = value;
    if (typeof actorLogin !== 'string'
        || !isPositiveInteger(repositoryId)
        || typeof workflowPath !== 'string'
        || !isCommit(workflowCommit)
        || !isPositiveInteger(workflowRunId)
        || !isPositiveInteger(workflowRunAttempt)) {
        return null;
    }
    return {
        actorLogin,
        repositoryId,
        workflowCommit,
        workflowPath,
        workflowRunAttempt,
        workflowRunId,
    };
}
function hasRequiredFields(value, fields) {
    return fields.every((field) => field in value);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isPositiveInteger(value) {
    return Number.isInteger(value) && Number(value) > 0;
}
function isCommit(value) {
    return typeof value === 'string' && commitPattern.test(value);
}
function isRepositoryFullName(value) {
    return (typeof value === 'string'
        && repositoryFullNamePattern.test(value));
}
function isVerdict(value) {
    return value === 'PASS' || value === 'FAIL';
}
function isJudgmentType(value) {
    return reviewProtocol.event.judgmentTypes.includes(String(value));
}
function isLifecycleType(value) {
    return (value === reviewProtocol.event.lifecycleType
        || value === 'STALE_DETECTED'
        || value === 'ENDORSEMENT_DRIFT');
}
function isReReviewReason(value) {
    return (value === 'TARGET_CHANGED'
        || value === 'POLICY_CHANGED'
        || value === 'TARGET_AND_POLICY_CHANGED');
}
function isJudgmentCandidateValue(value) {
    return Boolean(isRecord(value)
        && (isJudgmentType(value.type)
            || 'verdict' in value
            || 'actualStarState' in value));
}
function isJudgmentStarStateConsistent(type, verdict, actualStarState) {
    if (actualStarState !== (verdict === 'PASS')) {
        return false;
    }
    if (type === 'RE_REVIEWED') {
        return verdict === 'PASS' && actualStarState;
    }
    if (type === 'STAR_REVOKED' || type === 'REVOKED_EXTERNALLY') {
        return verdict === 'FAIL' && !actualStarState;
    }
    return true;
}
