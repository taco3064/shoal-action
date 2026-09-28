import { reviewProtocol } from './contract';
import { getRecognizableInitialReviewEvidence } from './initial_review_evidence';
import { isRfc3339DateTime } from './rfc3339';
const commitPattern = /^[0-9a-f]{40}$/;
const repositoryNamePattern = /^[A-Za-z0-9_.-]+$/;
const repositoryFullNamePattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export function getProtocolVersion() {
    return Number(reviewProtocol.protocolVersion);
}
export function parseProtocolComment(body) {
    const admissionEnvelope = parseMarkerJson(body, reviewProtocol.admission.marker);
    if (admissionEnvelope.kind === 'present') {
        const admission = admissionEnvelope.parsed
            ? parseAdmissionRecord(admissionEnvelope.parsed)
            : null;
        if (admission) {
            return { kind: 'admission', value: admission };
        }
        return isFormalResultCandidate(admissionEnvelope.payloadText, admissionEnvelope.parsed)
            ? invalidFormalResult(admissionEnvelope.payloadText, admissionEnvelope.parsed)
            : { kind: 'none' };
    }
    const eventEnvelope = parseMarkerJson(body, reviewProtocol.event.marker);
    if (eventEnvelope.kind !== 'present') {
        const candidateBody = getFormalResultCandidateBody(body);
        return isFormalResultCandidate(candidateBody)
            ? invalidFormalResult(candidateBody)
            : { kind: 'none' };
    }
    if (!eventEnvelope.parsed) {
        return isFormalResultCandidate(eventEnvelope.payloadText)
            ? invalidFormalResult(eventEnvelope.payloadText)
            : { kind: 'none' };
    }
    const lifecycle = parseLifecycleEvent(eventEnvelope.parsed);
    if (lifecycle) {
        return { kind: 'lifecycle', value: lifecycle };
    }
    const judgment = parseJudgmentEvent(eventEnvelope.parsed);
    if (judgment) {
        return { kind: 'judgment', value: judgment };
    }
    return isJudgmentCandidateValue(eventEnvelope.parsed)
        ? invalidFormalResult(eventEnvelope.payloadText, eventEnvelope.parsed)
        : { kind: 'none' };
}
function invalidFormalResult(payloadText, parsed) {
    return {
        initialReviewEvidence: getRecognizableInitialReviewEvidence(payloadText, parsed),
        kind: 'invalid-formal-result',
    };
}
function parseMarkerJson(body, marker) {
    const prefix = `${marker}\n`;
    if (!body.startsWith(prefix)) {
        return { kind: 'absent' };
    }
    const payloadText = body.slice(prefix.length).trim();
    if (!payloadText) {
        return { kind: 'present', payloadText, parsed: null };
    }
    try {
        return { kind: 'present', payloadText, parsed: JSON.parse(payloadText) };
    }
    catch {
        return { kind: 'present', payloadText, parsed: null };
    }
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
function isFormalResultCandidate(body, parsed) {
    if (isJudgmentCandidateValue(parsed ?? parseLooseJson(body))) {
        return true;
    }
    return looksLikeStructuredFormalResultText(body);
}
function parseLooseJson(body) {
    try {
        return JSON.parse(body);
    }
    catch {
        return null;
    }
}
function isJudgmentCandidateValue(value) {
    return Boolean(isRecord(value)
        && (isJudgmentType(value.type)
            || 'verdict' in value
            || 'actualStarState' in value));
}
function looksLikeStructuredFormalResultText(value) {
    const normalized = value.trim();
    const firstLine = normalized
        .split('\n')
        .map((line) => line.trim())
        .find(Boolean);
    if (!firstLine) {
        return false;
    }
    if (/^Review Result:\s*(PASS|FAIL)\b/u.test(firstLine)) {
        return true;
    }
    if (reviewProtocol.event.judgmentTypes.includes(firstLine)) {
        return true;
    }
    return (normalized.startsWith('{')
        && /(?:^|[\n{,])\s*"(type|verdict|actualStarState)"\s*:/u.test(normalized));
}
function getFormalResultCandidateBody(body) {
    const trimmed = body.trim();
    const markers = [
        reviewProtocol.event.marker,
        reviewProtocol.admission.marker,
    ];
    for (const marker of markers) {
        if (trimmed.startsWith(marker)) {
            return stripFirstLine(trimmed);
        }
    }
    return trimmed;
}
function stripFirstLine(value) {
    const newlineIndex = value.indexOf('\n');
    return newlineIndex === -1
        ? ''
        : value.slice(newlineIndex + 1).trim();
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
