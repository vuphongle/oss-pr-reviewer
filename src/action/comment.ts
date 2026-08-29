import { parsePullRequestUrl } from '../github/types.js';
import { publishReviewComment } from '../github/comments.js';
import type { ReviewCommentClient, PublishedReviewComment } from '../github/comments.js';
import type { PullRequestHeadClient } from '../github/comments.js';
import type { PullRequestEvent } from './event.js';

export async function publishActionComment(
  client: ReviewCommentClient & PullRequestHeadClient,
  event: PullRequestEvent,
  report: string,
  enabled: boolean,
): Promise<PublishedReviewComment | undefined> {
  if (!enabled) return undefined;
  const parsed = parsePullRequestUrl(event.url);
  return publishReviewComment(client, parsed.repository, event.number, report, event.headSha);
}
