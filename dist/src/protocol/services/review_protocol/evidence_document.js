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
