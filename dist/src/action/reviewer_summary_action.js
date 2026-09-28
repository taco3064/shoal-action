import { GitHubClient, GitHubReadError, } from '~app/action/services/github_client';
import { computeReviewerSummary } from '~app/action/services/reviewer_summary';
import { stringifyReviewerSummary, } from '~app/protocol/services/reviewer_summary_schema';
export async function runReviewerSummaryAction(options) {
    const client = new GitHubClient(options);
    const reviewerNode = await client.getReviewerNode(options.reviewerNodeRepository);
    const issues = await client.listIssuesWithComments(options.reviewerNodeRepository);
    const summary = await computeReviewerSummary({
        issues,
        networkRootRepositoryId: options.networkRootRepositoryId,
        resolvers: client.createResolvers({
            networkRootRepositoryId: options.networkRootRepositoryId,
            networkRootRepositoryName: options.networkRootRepositoryName,
            reviewerLogin: reviewerNode.owner.login,
            reviewerNodeFullName: reviewerNode.fullName,
        }),
        reviewerNode,
    });
    return {
        filename: 'reviewer-summary.json',
        json: summary,
        text: stringifyReviewerSummary(summary),
    };
}
export { GitHubClient, GitHubReadError };
