import { reviewProtocol } from './contract';
import { encodeEvidenceDocument } from './evidence_document';
export function renderEvidenceComment(record, presentation = {}) {
    const human = renderHuman(record, presentation);
    const payload = encodeEvidenceDocument(record, presentation);
    const { startSentinel, endSentinel } = reviewProtocol.evidence;
    return `${human}\n\n<details>\n<summary>Formal Shoal evidence</summary>\n\n${startSentinel}\n${payload}\n${endSentinel}\n\n</details>`;
}
function renderHuman(record, presentation) {
    if (!('type' in record)) {
        if (!presentation.requestAuthor
            || !/^[A-Za-z0-9-]+$/u.test(presentation.requestAuthor)) {
            throw new Error('Admission requires the authoritative Request author login.');
        }
        return `## Request admitted\n\nTarget: ${escapeText(presentation.requestAuthor)}/${escapeText(record.repositoryName)}\n\nThis Issue is the Canonical Review Thread for this Target (repository ID ${record.targetRepositoryId}).`;
    }
    if ('verdict' in record) {
        return `## Review Result: ${record.verdict}\n\nEvent: ${record.type}\n\nTarget Repository: ${escapeText(record.targetRepositoryFullName)}\n\nTarget commit: ${record.targetCommit}\n\nReview Policy commit: ${record.reviewPolicyCommit}\n\nActual Star state: ${record.actualStarState ? 'starred' : 'not starred'}\n\nReview time: ${escapeText(record.reviewedAt)}\n\n### Explanation\n\n${escapeText(presentation.explanation ?? '')}`;
    }
    return `## ${record.type}\n\nTarget repository ID: ${record.targetRepositoryId}\n\nRequest Issue: #${record.requestIssueNumber}\n\nEligibility Target commit: ${record.eligibilityTargetCommit}\n\nReview Policy commit: ${record.reviewPolicyCommit}\n\nReason: ${record.reason}`;
}
function escapeText(value) {
    return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
        .replace(/[\\`*_{}\[\]()#+.!|~-]/gu, '\\$&');
}
