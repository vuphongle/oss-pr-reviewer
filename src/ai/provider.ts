import type { PullRequest, ReviewResult } from '../types.js';
import type { ReviewBatch } from '../review/batching.js';
import type { ReviewBudget } from '../review/batching.js';
import type { ReviewRule } from '../config/repository.js';

export interface ReviewProvider {
  review(_input: {
    pullRequest: PullRequest;
    batch: ReviewBatch;
    reviewRules?: ReviewRule[];
    reviewBudget?: ReviewBudget;
  }): Promise<ReviewResult>;
}
