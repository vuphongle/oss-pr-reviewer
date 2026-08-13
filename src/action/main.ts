#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

import { executeReview } from '../cli/commands/review.js';
import { parsePullRequestEvent } from './event.js';
import { buildActionReviewOptions, parseActionInputs, redactSecrets } from './inputs.js';
import { writeActionReport } from './output.js';
import { assertActionCredentialsAvailable } from './security.js';

async function main(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error('GITHUB_EVENT_PATH is required for the GitHub Action.');
  const event = parsePullRequestEvent(JSON.parse(await readFile(eventPath, 'utf8')));
  assertActionCredentialsAvailable(event, process.env);
  const inputs = parseActionInputs({
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ACTION_MODEL: process.env.ACTION_MODEL,
    ACTION_MIN_SEVERITY: process.env.ACTION_MIN_SEVERITY,
  });

  process.env.GITHUB_TOKEN = inputs.githubToken;
  process.env.OPENAI_API_KEY = inputs.openAiApiKey;
  const report = await executeReview(buildActionReviewOptions(event, inputs));
  const reportPath = join(process.env.RUNNER_TEMP ?? process.cwd(), 'oss-pr-reviewer-report.md');
  await writeActionReport(report, reportPath, process.env.GITHUB_STEP_SUMMARY);
}

try {
  await main();
} catch (error) {
  const secrets = [process.env.GITHUB_TOKEN ?? '', process.env.OPENAI_API_KEY ?? ''];
  process.stderr.write(
    `${redactSecrets(error instanceof Error ? error.message : 'Unexpected GitHub Action error.', secrets)}\n`,
  );
  process.exitCode = 1;
}
