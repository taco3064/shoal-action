export function isValidRequesterNode(requesterNode, author, networkRootRepositoryId) {
    return Boolean(requesterNode
        && requesterNode.owner.type === 'User'
        && requesterNode.owner.id === author.id
        && (requesterNode.id === networkRootRepositoryId
            || (requesterNode.isFork
                && requesterNode.parentRepositoryId === networkRootRepositoryId)));
}
