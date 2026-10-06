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
// Recognition is only a diagnostic for rejected evidence. It supplies no record,
// admission identity or workload completion, and never reads presentation prose.
export function hasIdentifiableResultEvidence(body) {
    const markers = [...body.matchAll(/<!-- shoal-evidence:v\d+:(?:start|end) -->/gu)];
    return markers.some((marker, index) => {
        const next = markers[index + 1];
        if (!marker[0].endsWith(':start -->')) {
            return false;
        }
        const payload = completeMachineObject(body.slice(marker.index + marker[0].length, next?.index));
        try {
            JSON.parse(payload);
            return containsResultType(payload);
        }
        catch {
            return false;
        }
    });
}
function completeMachineObject(payload) {
    const tokens = payload.trim().match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|[^\s{}\[\]:,]+/gu) ?? [];
    let depth = 0;
    if (tokens[0] !== '{') {
        return '';
    }
    for (let index = 0; index < tokens.length; index += 1) {
        if (tokens[index] === '{' || tokens[index] === '[') {
            depth += 1;
        }
        else if (tokens[index] === '}' || tokens[index] === ']') {
            depth -= 1;
            if (depth === 0) {
                return tokens.slice(0, index + 1).join(' ');
            }
        }
    }
    return '';
}
function containsResultType(payload) {
    const tokens = payload.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|[^\s{}\[\]:,]+/gu) ?? [];
    const scopes = [];
    // JSON.parse already established syntax. Inspect every direct record.type,
    // including duplicate keys, without selecting a winning ambiguous record.
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        const scope = scopes.at(-1);
        if (token === '{' || token === '[') {
            const path = scope ? [...scope.path, scope.object ? scope.key : '[]'] : [];
            scopes.push({ path, key: '', object: token === '{' });
        }
        else if (token === '}' || token === ']') {
            scopes.pop();
        }
        else if (token.startsWith('"') && scope?.object) {
            const value = String(JSON.parse(token));
            if (tokens[index + 1] === ':') {
                scope.key = value;
            }
            else if (scope.path.length === 1 && scope.path[0] === 'record'
                && scope.key === 'type'
                && reviewProtocol.event.judgmentTypes.some((type) => type === value)) {
                return true;
            }
        }
    }
    return false;
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
