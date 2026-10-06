import { reviewProtocol } from './contract';
export function decodeEvidenceDocument(body) {
    const { startSentinel, endSentinel } = reviewProtocol.evidence;
    const markers = body.match(/<!-- shoal-evidence:[^\r\n]*? -->/gu) ?? [];
    const prefixes = body.match(/<!-- shoal-evidence:/gu) ?? [];
    if (prefixes.length === 0) {
        return { kind: 'absent' };
    }
    if (prefixes.length !== 2 || markers.length !== 2
        || markers[0] !== startSentinel || markers[1] !== endSentinel) {
        return { kind: 'invalid' };
    }
    const payload = body.slice(body.indexOf(startSentinel) + startSentinel.length, body.indexOf(endSentinel)).trim();
    try {
        const value = JSON.parse(payload);
        if (!uniqueKeys(payload) || !isObject(value)
            || Object.keys(value).sort().join(',') !== 'formatVersion,presentation,record'
            || value.formatVersion !== 1
            || !isObject(value.record) || !isObject(value.presentation)
            || !Object.entries(value.presentation).every(([key, entry]) => ['explanation', 'requestAuthor'].includes(key) && typeof entry === 'string')) {
            return { kind: 'invalid' };
        }
        return { kind: 'present', document: value };
    }
    catch {
        return { kind: 'invalid' };
    }
}
export function encodeEvidenceDocument(record, presentation = {}) {
    const document = { formatVersion: 1, record, presentation };
    // Escaping HTML also prevents presentation text from injecting machine sentinels.
    return JSON.stringify(document).replace(/[<>&]/gu, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
export function getInvalidResultEvidence(body) {
    // GitHub comments are smaller than this bound; depth is bounded separately.
    const bounded = body.slice(0, 131072);
    const markers = [...bounded.matchAll(/<!-- shoal-evidence:v\d+:(?:start|end) -->/gu)];
    const records = markers.flatMap((marker, index) => marker[0].endsWith(':start -->')
        ? readMachineFields(bounded.slice(marker.index + marker[0].length, markers[index + 1]?.index))
        : []);
    const identifiable = records.some((fields) => fields.get('type')?.some((value) => reviewProtocol.event.judgmentTypes.some((type) => type === value)));
    if (!identifiable) {
        return null;
    }
    return {
        kind: 'invalid-formal-result',
        initialReviewEvidence: records.length === 1 ? initialIdentity(records[0]) : null,
    };
}
function initialIdentity(fields) {
    const types = fields.get('type');
    const reviewer = fields.get('reviewerNodeId');
    const target = fields.get('targetRepositoryId');
    // Duplicate identities/types are ambiguous; never select a winning value.
    if (types?.length !== 1 || types[0] !== 'REVIEWED'
        || (reviewer?.length ?? 0) > 1 || (target?.length ?? 0) > 1) {
        return null;
    }
    return { reviewerNodeId: reviewer?.[0], targetRepositoryId: target?.[0] };
}
function machineTokens(payload) {
    const tokens = [];
    const token = /\s*("(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|[{}\[\]:,]|[^\s{}\[\]:,"]+)/guy;
    let match;
    while ((match = token.exec(payload)) !== null) {
        tokens.push(match[1]);
    }
    return tokens;
}
function readMachineFields(payload) {
    const tokens = machineTokens(payload);
    const scopes = [];
    const records = [];
    let fields;
    if (tokens[0] !== '{') {
        return records;
    }
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        const scope = scopes.at(-1);
        if (token === '{' || token === '[') {
            if (scopes.length >= 64) {
                break;
            }
            const directRecord = token === '{' && scopes.length === 1
                && scope?.key === 'record' && scope.valueIndex === index;
            scopes.push({ object: token === '{', directRecord, key: '', valueIndex: -1 });
            if (directRecord) {
                fields = new Map();
                records.push(fields);
            }
        }
        else if (token === '}' || token === ']') {
            if (!scope || scope.object !== (token === '}')) {
                break;
            }
            scopes.pop();
            if (scopes.length === 0) {
                break;
            }
        }
        else if (scope?.object && token.startsWith('"') && tokens[index + 1] === ':'
            && tokens[index - 1] !== ':') {
            scope.key = String(JSON.parse(token));
            scope.valueIndex = index + 2;
            if (scope.directRecord && fields
                && ['type', 'reviewerNodeId', 'targetRepositoryId'].includes(scope.key)) {
                const values = fields.get(scope.key) ?? [];
                values.push(machineScalar(tokens[index + 2]));
                fields.set(scope.key, values);
            }
        }
    }
    return records;
}
function machineScalar(token) {
    // An observed but unreadable identity is null, never an absent wildcard.
    try {
        const value = JSON.parse(token ?? 'null');
        return typeof value === 'string' || typeof value === 'number' ? value : null;
    }
    catch {
        return null;
    }
}
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function uniqueKeys(payload) {
    const tokens = payload.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|[^\s{}\[\]:,]+/gu) ?? [];
    const scopes = [];
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token === '{' || token === '[') {
            scopes.push(token === '{' ? new Set() : null);
        }
        else if (token === '}' || token === ']') {
            scopes.pop();
        }
        else if (token.startsWith('"') && tokens[index + 1] === ':') {
            const key = String(JSON.parse(token));
            const keys = scopes.at(-1);
            if (!keys || keys.has(key)) {
                return false;
            }
            keys.add(key);
        }
    }
    return true;
}
