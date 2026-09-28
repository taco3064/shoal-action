import { reviewProtocol } from './contract';
const repositoryNamePattern = /^[A-Za-z0-9_.-]+$/;
export function parseRequestPayload(body) {
    const normalized = body.replace(/\r\n/g, '\n').trim();
    const sections = parseRequestSections(normalized);
    if (!sections) {
        return null;
    }
    const repositoryLines = sections.repository
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    if (repositoryLines.length !== 1
        || !repositoryNamePattern.test(repositoryLines[0])) {
        return null;
    }
    if (repositoryLines[0].includes('/')
        || repositoryLines[0] === '.'
        || repositoryLines[0] === '..') {
        return null;
    }
    const invitationMessage = sections.invitation
        && sections.invitation !== reviewProtocol.request.emptyInvitation
        ? sections.invitation
        : null;
    return {
        invitationMessage,
        repositoryName: repositoryLines[0],
    };
}
function parseRequestSections(body) {
    const allowedHeadings = new Set([
        reviewProtocol.request.repositoryHeading,
        reviewProtocol.request.invitationHeading,
    ]);
    const sections = new Map();
    let heading = null;
    for (const line of body.split('\n')) {
        if (line.startsWith('### ')) {
            heading = line.slice(4).trim();
            if (!allowedHeadings.has(heading) || sections.has(heading)) {
                return null;
            }
            sections.set(heading, '');
            continue;
        }
        if (!heading) {
            if (line.trim()) {
                return null;
            }
            continue;
        }
        sections.set(heading, `${sections.get(heading) ?? ''}${line}\n`);
    }
    const repository = sections.get(reviewProtocol.request.repositoryHeading);
    if (repository === undefined) {
        return null;
    }
    return {
        invitation: (sections.get(reviewProtocol.request.invitationHeading) ?? '').trim(),
        repository: repository.trim(),
    };
}
