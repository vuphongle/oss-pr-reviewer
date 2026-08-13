import type { PullRequest, ReviewResult } from '../types.js';
import type { ReviewBatch } from '../review/batching.js';

export interface ReviewProvider {
  review(_input: { pullRequest: PullRequest; batch: ReviewBatch }): Promise<ReviewResult>;
}
