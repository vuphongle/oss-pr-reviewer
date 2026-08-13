import type { PullRequest, ReviewResult, Severity, SkippedFile } from '../types.js';
import type { RepositoryConfig } from '../config/repository.js';
import { DEFAULT_REPOSITORY_CONFIG } from '../config/repository.js';
import { createBatches } from './batching.js';
import { filterIgnoredFiles } from './ignore.js';
import { normalizeFiles } from './normalize.js';
import { deduplicateFindings, filterFindings, severityOrder } from './severity.js';
import type { ReviewProvider } from '../ai/provider.js';

export interface ReviewExecution {
  result: ReviewResult;
  skippedFiles: SkippedFile[];
  reviewedFileCount: number;
}

export async function reviewPullRequest(
  pullRequest: PullRequest,
  provider: ReviewProvider,
  minimumSeverity: Severity = 'low',
  repositoryConfig: RepositoryConfig = DEFAULT_REPOSITORY_CONFIG,
): Promise<ReviewExecution> {
  const ignored = filterIgnoredFiles(pullRequest.files, repositoryConfig.ignore.paths);
  const normalized = normalizeFiles(ignored.files);
  const batched = createBatches(normalized.reviewable);
  const skippedFiles = [...ignored.skipped, ...normalized.skipped, ...batched.skipped];

  if (batched.batches.length === 0) {
    return {
      result: {
        summary: 'No reviewable text patches were available in this pull request.',
        riskLevel: 'low',
        findings: [],
      },
      skippedFiles,
      reviewedFileCount: 0,
    };
  }

  const results = await Promise.all(
    batched.batches.map((batch) =>
      provider.review({ pullRequest, batch, reviewRules: repositoryConfig.rules }),
    ),
  );
  const findings = filterFindings(
    deduplicateFindings(results.flatMap((result) => result.findings)),
    minimumSeverity,
  );
  const riskLevel = results.reduce<Severity>(
    (highest, result) =>
      severityOrder[result.riskLevel] > severityOrder[highest] ? result.riskLevel : highest,
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
  };
}
