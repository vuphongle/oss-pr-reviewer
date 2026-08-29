import type { RepositoryReference } from './types.js';
import { prepareReviewComment } from './comment-safety.js';
import { OSS_PR_REVIEWER_MARKER } from './comment-constants.js';

export { OSS_PR_REVIEWER_MARKER } from './comment-constants.js';
const OWNED_COMMENT_AUTHORS = new Set(['github-actions[bot]', 'oss-pr-reviewer[bot]']);

export interface ReviewComment {
  id: number;
  body: string;
  user?: { type?: string; login?: string };
  htmlUrl?: string;
}

export interface ReviewCommentClient {
  listComments(reference: RepositoryReference, pullRequestNumber: number): Promise<ReviewComment[]>;
  createComment(
    reference: RepositoryReference,
    pullRequestNumber: number,
    body: string,
  ): Promise<Pick<ReviewComment, 'id' | 'htmlUrl'>>;
  updateComment(
    reference: RepositoryReference,
    pullRequestNumber: number,
    commentId: number,
    body: string,
  ): Promise<Pick<ReviewComment, 'id' | 'htmlUrl'>>;
}

export interface PullRequestHeadClient {
  getPullRequestHeadSha(reference: RepositoryReference, pullRequestNumber: number): Promise<string>;
}

export interface PublishedReviewComment {
  action: 'created' | 'updated';
  id: number;
  htmlUrl?: string;
}

export async function findReviewComment(
  client: Pick<ReviewCommentClient, 'listComments'>,
  reference: RepositoryReference,
  pullRequestNumber: number,
): Promise<ReviewComment | undefined> {
  try {
    const comments = await client.listComments(reference, pullRequestNumber);
    return comments
      .filter(
        (comment) =>
          comment.user?.type === 'Bot' &&
          typeof comment.user.login === 'string' &&
          OWNED_COMMENT_AUTHORS.has(comment.user.login) &&
          comment.body.startsWith(OSS_PR_REVIEWER_MARKER),
      )
      .sort((left, right) => right.id - left.id)[0];
  } catch (error) {
    throw normalizeCommentError(error);
  }
}

export async function publishReviewComment(
  client: ReviewCommentClient & PullRequestHeadClient,
  reference: RepositoryReference,
  pullRequestNumber: number,
  report: string,
  reviewedHeadSha: string,
): Promise<PublishedReviewComment | undefined> {
  const body = prepareReviewComment(report).body;
  const existing = await findReviewComment(client, reference, pullRequestNumber);
  try {
    const currentHeadSha = await client.getPullRequestHeadSha(reference, pullRequestNumber);
    if (currentHeadSha !== reviewedHeadSha) return undefined;
    if (existing) {
      const updated = await client.updateComment(reference, pullRequestNumber, existing.id, body);
      return { action: 'updated', id: updated.id, htmlUrl: updated.htmlUrl };
    }
    const created = await client.createComment(reference, pullRequestNumber, body);
    return { action: 'created', id: created.id, htmlUrl: created.htmlUrl };
  } catch (error) {
    throw normalizeCommentError(error);
  }
}

function normalizeCommentError(error: unknown): Error {
  const candidate = error as { status?: number; message?: string };
  if (candidate.status === 401)
    return new Error('GitHub comment API authentication failed. Check GITHUB_TOKEN.');
  if (candidate.status === 403)
    return new Error(
      'GitHub comment API access was denied. Comment mode requires pull-requests: write permission.',
    );
  if (candidate.status === 404)
    return new Error('GitHub pull request comment endpoint was not found or is not accessible.');
  return new Error(
    `GitHub comment API request failed${candidate.message ? `: ${candidate.message}` : '.'}`,
  );
}
