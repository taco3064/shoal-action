export function parseNextLink(linkHeader) {
    if (!linkHeader) {
        return null;
    }
    for (const part of linkHeader.split(',')) {
        const match = part.match(/<([^>]+)>;\s*rel="next"/u);
        if (match) {
            return match[1];
        }
    }
    return null;
}
export function toComment(comment) {
    return {
        author: toUser(comment.user),
        body: comment.body ?? '',
        createdAt: comment.created_at,
        id: comment.id,
        performedViaGitHubApp: toApp(comment.performed_via_github_app),
    };
}
export function toRequesterNode(repository) {
    return {
        id: repository.id,
        isFork: repository.fork,
        owner: toUser(repository.owner),
        parentRepositoryId: repository.parent?.id ?? null,
    };
}
export function toUser(user) {
    return {
        id: user.id,
        login: user.login,
        type: user.type,
    };
}
export function isIssueResponse(value) {
    return (isIssueListResponse(value)
        && !('pull_request' in value));
}
export function isIssueListResponse(value) {
    return (isRecord(value)
        && Number.isSafeInteger(value.number)
        && value.number > 0
        && (value.state === 'open' || value.state === 'closed')
        && (value.body === undefined || value.body === null || typeof value.body === 'string')
        && (!('pull_request' in value) || isRecord(value.pull_request))
        && isUserResponse(value.user));
}
export function isCommentResponse(value) {
    return (isRecord(value)
        && Number.isSafeInteger(value.id)
        && value.id > 0
        && (value.body === undefined || value.body === null || typeof value.body === 'string')
        && typeof value.created_at === 'string'
        && isUserResponse(value.user)
        && isOptionalGitHubApp(value.performed_via_github_app));
}
export function isRepositoryResponse(value) {
    return (isRecord(value)
        && Number.isSafeInteger(value.id)
        && value.id > 0
        && typeof value.full_name === 'string'
        && value.full_name.length > 0
        && typeof value.name === 'string'
        && value.name.length > 0
        && typeof value.fork === 'boolean'
        && typeof value.default_branch === 'string'
        && isUserResponse(value.owner));
}
export function isCommitResponse(value) {
    return isRecord(value) && typeof value.sha === 'string' && value.sha.length > 0;
}
export function isWorkflowRunResponse(value) {
    return (isRecord(value)
        && typeof value.id === 'number'
        && typeof value.run_attempt === 'number'
        && typeof value.path === 'string'
        && typeof value.head_sha === 'string'
        && typeof value.created_at === 'string'
        && typeof value.updated_at === 'string'
        && isRepositoryRef(value.repository)
        && isOptionalRepositoryRef(value.head_repository));
}
function toApp(app) {
    if (!app) {
        return null;
    }
    return { slug: app.slug };
}
function isUserResponse(value) {
    return (isRecord(value)
        && typeof value.id === 'number'
        && typeof value.login === 'string'
        && typeof value.type === 'string');
}
function isOptionalGitHubApp(value) {
    return value === undefined || value === null || isGitHubAppResponse(value);
}
function isGitHubAppResponse(value) {
    return isRecord(value) && typeof value.slug === 'string';
}
function isOptionalRepositoryRef(value) {
    return value === undefined || value === null || isRepositoryRef(value);
}
function isRepositoryRef(value) {
    return isRecord(value) && typeof value.id === 'number';
}
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
