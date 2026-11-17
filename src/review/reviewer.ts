import type {
  PullRequest,
  RejectedFinding,
  ReviewResult,
  Severity,
  SkippedFile,
} from '../types.js';
import type { RepositoryConfig } from '../config/repository.js';
import { DEFAULT_REPOSITORY_CONFIG, getConfiguredReviewBudget } from '../config/repository.js';
import { createBatches, DEFAULT_REVIEW_BUDGET } from './batching.js';
import type { ReviewBatch } from './batching.js';
import { filterIgnoredFiles } from './ignore.js';
import { normalizeFiles } from './normalize.js';
import { deduplicateFindings, filterFindings, severityOrder } from './severity.js';
import { validateFindings } from './validate.js';
import type { ReviewProvider } from '../ai/provider.js';

export interface ReviewExecution {
  result: ReviewResult;
  skippedFiles: SkippedFile[];
  reviewedFileCount: number;
  changedFileCount: number;
  fileListStatus: 'complete' | 'incomplete';
  truncatedFileCount: number;
  ignoredFileCount: number;
  batchCount: number;
  rejectedFindings?: RejectedFinding[];
}

export const DEFAULT_REVIEW_CONCURRENCY = 4;
export const DEFAULT_MAX_REVIEW_BATCHES = 20;

export function validateMaxBatches(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('max-batches must be a positive safe integer.');
  }
}

export async function reviewPullRequest(
  pullRequest: PullRequest,
  provider: ReviewProvider,
  minimumSeverity: Severity = 'low',
  repositoryConfig: RepositoryConfig = DEFAULT_REPOSITORY_CONFIG,
  maxBatches = DEFAULT_MAX_REVIEW_BATCHES,
): Promise<ReviewExecution> {
  validateMaxBatches(maxBatches);
  const truncatedFileCount = Math.max(0, pullRequest.changedFileCount - pullRequest.files.length);
  const fileListStatus =
    pullRequest.changedFileCount === pullRequest.files.length ? 'complete' : 'incomplete';
  const ignored = filterIgnoredFiles(pullRequest.files, repositoryConfig.ignore.paths);
  const normalized = normalizeFiles(ignored.files);
  const reviewBudget = getConfiguredReviewBudget(repositoryConfig, DEFAULT_REVIEW_BUDGET);
  const batched = createBatches(normalized.reviewable, reviewBudget);
  if (batched.batches.length > maxBatches) {
    throw new Error(
      `Review requires ${batched.batches.length} batches, exceeding the ${maxBatches} batch limit. No provider requests were made. Narrow the diff or explicitly raise --max-batches.`,
    );
  }
  const skippedFiles = [...ignored.skipped, ...normalized.skipped, ...batched.skipped];

  if (batched.batches.length === 0) {
    return {
      result: {
        summary: 'No reviewable text patches were available in this pull request.',
        riskLevel: 'unknown',
        findings: [],
      },
      skippedFiles,
      reviewedFileCount: 0,
      changedFileCount: pullRequest.changedFileCount,
      fileListStatus,
      truncatedFileCount,
      ignoredFileCount: ignored.skipped.length,
      batchCount: 0,
    };
  }

  const results = await reviewBatches(
    batched.batches,
    provider,
    pullRequest,
    repositoryConfig.rules,
    reviewBudget,
  );
  const validated = results.map((result, index) =>
    validateFindings(result.findings, batched.batches[index]),
  );
  const rejectedFindings = validated.flatMap((result) => result.rejectedFindings);
  const findings = filterFindings(
    deduplicateFindings(validated.flatMap((result) => result.findings)),
    minimumSeverity,
  );
  const riskLevel =
    findings.length === 0
      ? 'unknown'
      : findings.reduce<Severity>(
          (highest, finding) =>
            severityOrder[finding.severity] > severityOrder[highest] ? finding.severity : highest,
          'low',
        );
  const summary = results
    .map((result) => result.summary.trim())
    .filter(Boolean)
    .join(' ');

  return {
    result: { summary, riskLevel, findings },
    skippedFiles,
    reviewedFileCount: normalized.reviewable.length - batched.skipped.length,
    changedFileCount: pullRequest.changedFileCount,
    fileListStatus,
    truncatedFileCount,
    ignoredFileCount: ignored.skipped.length,
    batchCount: batched.batches.length,
    rejectedFindings,
  };
}

async function reviewBatches(
  batches: ReviewBatch[],
  provider: ReviewProvider,
  pullRequest: PullRequest,
  reviewRules: RepositoryConfig['rules'],
  reviewBudget: ReturnType<typeof getConfiguredReviewBudget>,
): Promise<ReviewResult[]> {
  const results = new Array<ReviewResult>(batches.length);
  let nextIndex = 0;
  let failed = false;
  let firstError: unknown;

  const worker = async (): Promise<void> => {
    while (!failed) {
      const index = nextIndex++;
      if (index >= batches.length) return;

      try {
        results[index] = await provider.review({
          pullRequest,
          batch: batches[index],
          reviewRules,
          reviewBudget,
        });
      } catch (error) {
        failed = true;
        firstError = error;
        return;
      }
    }
  };

  const workerCount = Math.min(DEFAULT_REVIEW_CONCURRENCY, batches.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failed) throw firstError;
  return results;
}
