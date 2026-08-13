import { writeFile } from 'node:fs/promises';

import { requireOpenAiKey, loadConfig } from '../../config/index.js';
import { OpenAiReviewProvider } from '../../ai/client.js';
import { GithubClient } from '../../github/client.js';
import { parsePullRequestUrl, parseRepository } from '../../github/types.js';
import { renderMarkdown } from '../../report/markdown.js';
import { reviewPullRequest } from '../../review/reviewer.js';
import type { Severity } from '../../types.js';

export interface ReviewCommandOptions {
  repo?: string;
  pr?: string;
  url?: string;
  output?: string;
  model?: string;
  minSeverity: Severity;
}

export async function executeReview(options: ReviewCommandOptions): Promise<string> {
  const input = resolveInput(options);
  const config = loadConfig();
  const github = new GithubClient({ token: config.githubToken });
  const pullRequest = await github.getPullRequest(input.repository, input.number);
  const provider = new OpenAiReviewProvider(requireOpenAiKey(config), options.model);
  const execution = await reviewPullRequest(pullRequest, provider, options.minSeverity);
  const report = renderMarkdown({ pullRequest, ...execution });

  if (options.output) {
    try {
      await writeFile(options.output, report, 'utf8');
    } catch (error) {
      throw new Error(`Could not write report to '${options.output}': ${error instanceof Error ? error.message : 'unknown filesystem error'}`);
    }
  }

  return report;
}

function resolveInput(options: ReviewCommandOptions): { repository: ReturnType<typeof parseRepository>; number: number } {
  if (options.url && (options.repo || options.pr)) {
    throw new Error('Use either --url or the --repo and --pr pair, not both.');
  }
  if (options.url) return parsePullRequestUrl(options.url);
  if (!options.repo || !options.pr) throw new Error('Provide either --url or both --repo and --pr.');

  const number = Number(options.pr);
  if (!/^\d+$/.test(options.pr) || !Number.isSafeInteger(number) || number < 1) {
    throw new Error(`Invalid pull request number '${options.pr}'. Expected a positive integer.`);
  }
  return { repository: parseRepository(options.repo), number };
}
