import { writeFile } from 'node:fs/promises';

import { requireOpenAiKey, loadConfig } from '../../config/index.js';
import { OpenAiReviewProvider } from '../../ai/client.js';
import type { ReviewProvider } from '../../ai/provider.js';
import { GithubClient } from '../../github/client.js';
import type { RepositoryFileReader } from '../../config/repository.js';
import { parsePullRequestUrl, parseRepository } from '../../github/types.js';
import { renderMarkdown } from '../../report/markdown.js';
import { renderJson } from '../../report/json.js';
import {
  DEFAULT_MAX_REVIEW_BATCHES,
  reviewPullRequest,
  validateMaxBatches,
} from '../../review/reviewer.js';
import type { ReviewReportData, Severity } from '../../types.js';
import type { RepositoryConfig } from '../../config/repository.js';
import { getConfiguredMinimumSeverity, loadRepositoryConfig } from '../../config/repository.js';

export type ReportFormat = 'markdown' | 'json';

export interface ReviewCommandOptions {
  repo?: string;
  pr?: string;
  url?: string;
  output?: string;
  outputFormat?: ReportFormat;
  model?: string;
  minSeverity?: Severity;
  maxBatches?: number;
  github?: Pick<GithubClient, 'getPullRequest'> & RepositoryFileReader;
  provider?: ReviewProvider;
}

export async function executeReview(options: ReviewCommandOptions): Promise<string> {
  return (await executeReviewWithMetadata(options)).report;
}

export async function executeReviewWithMetadata(
  options: ReviewCommandOptions,
): Promise<{ report: string; data: ReviewReportData }> {
  const input = resolveInput(options);
  const maxBatches = options.maxBatches ?? DEFAULT_MAX_REVIEW_BATCHES;
  validateMaxBatches(maxBatches);
  const config = loadConfig();
  const openAiApiKey = requireOpenAiKey(config);
  const github = options.github ?? new GithubClient({ token: config.githubToken });
  const pullRequest = await github.getPullRequest(input.repository, input.number);
  const repositoryConfig = await loadRepositoryConfig(github, {
    owner: pullRequest.owner,
    repository: pullRequest.repository,
    ref: pullRequest.baseSha,
  });
  const provider = options.provider ?? new OpenAiReviewProvider(openAiApiKey, options.model);
  const execution = await reviewPullRequest(
    pullRequest,
    provider,
    resolveMinimumSeverity(options.minSeverity, repositoryConfig),
    repositoryConfig,
    maxBatches,
  );
  const data: ReviewReportData = { pullRequest, ...execution };
  const report = renderReport(data, options.outputFormat ?? 'markdown');

  if (options.output) {
    try {
      await writeFile(options.output, report, 'utf8');
    } catch (error) {
      throw new Error(
        `Could not write report to '${options.output}': ${error instanceof Error ? error.message : 'unknown filesystem error'}`,
      );
    }
  }

  return { report, data };
}

export function renderReport(
  data: Parameters<typeof renderMarkdown>[0],
  format: ReportFormat,
): string {
  return format === 'json' ? renderJson(data) : renderMarkdown(data);
}

export function resolveMinimumSeverity(
  cliValue: Severity | undefined,
  repositoryConfig: RepositoryConfig,
): Severity {
  return cliValue ?? getConfiguredMinimumSeverity(repositoryConfig);
}

function resolveInput(options: ReviewCommandOptions): {
  repository: ReturnType<typeof parseRepository>;
  number: number;
} {
  if (options.url && (options.repo || options.pr)) {
    throw new Error('Use either --url or the --repo and --pr pair, not both.');
  }
  if (options.url) return parsePullRequestUrl(options.url);
  if (!options.repo || !options.pr)
    throw new Error('Provide either --url or both --repo and --pr.');

  const number = Number(options.pr);
  if (!/^\d+$/.test(options.pr) || !Number.isSafeInteger(number) || number < 1) {
    throw new Error(`Invalid pull request number '${options.pr}'. Expected a positive integer.`);
  }
  return { repository: parseRepository(options.repo), number };
}
