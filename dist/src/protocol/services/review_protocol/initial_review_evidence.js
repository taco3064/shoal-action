export function getRecognizableInitialReviewEvidence(payloadText, parsed) {
    const value = parsed ?? parsePayload(payloadText);
    if (isRecord(value)) {
        return value.type === 'REVIEWED'
            ? {
                reviewerNodeId: value.reviewerNodeId,
                targetRepositoryId: value.targetRepositoryId,
            }
            : null;
    }
    const text = payloadText.trim();
    if (text.split('\n', 1)[0] === 'REVIEWED') {
        return {};
    }
    return getDamagedObjectEvidence(text);
}
function getDamagedObjectEvidence(text) {
    if (!text.startsWith('{')) {
        return null;
    }
    const fields = {};
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (quoted && char === '\\') {
            escaped = true;
            continue;
        }
        if (char === '"') {
            if (!quoted && depth === 1) {
                const match = /^"(type|reviewerNodeId|targetRepositoryId)"\s*:\s*(?:"([^"\\]*)"|(-?\d+))/u.exec(text.slice(index));
                if (match) {
                    fields[match[1]] = match[3] === undefined
                        ? match[2]
                        : Number(match[3]);
                }
            }
            quoted = !quoted;
            continue;
        }
        if (!quoted && (char === '{' || char === '[')) {
            depth += 1;
        }
        else if (!quoted && (char === '}' || char === ']')) {
            depth -= 1;
        }
    }
    return fields.type === 'REVIEWED'
        ? {
            reviewerNodeId: fields.reviewerNodeId,
            targetRepositoryId: fields.targetRepositoryId,
        }
        : null;
}
function parsePayload(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
