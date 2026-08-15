#!/usr/bin/env node

import { Command } from 'commander';
import process from 'node:process';

import { executeReview } from './commands/review.js';
import type { Severity } from '../types.js';

const severities: Severity[] = ['low', 'medium', 'high', 'critical'];

const program = new Command()
  .name('oss-pr-reviewer')
  .description(
    'AI-powered CLI for reviewing GitHub pull requests with structured Markdown reports.',
  )
  .version('0.4.0');

program
  .command('review')
  .description('Fetch and review a GitHub pull request')
  .option('--repo <owner/repository>', 'repository identifier; requires --pr')
  .option('--pr <number>', 'pull request number; requires --repo')
  .option('--url <url>', 'GitHub pull request URL')
  .option('--output <path>', 'write report to a file instead of only stdout')
  .option('--output-format <format>', 'report format (markdown, json)', 'markdown')
  .option('--model <model-name>', 'OpenAI model name', 'gpt-4o-mini')
  .option('--min-severity <severity>', 'minimum finding severity (low, medium, high, critical)')
  .action(
    async (options: {
      repo?: string;
      pr?: string;
      url?: string;
      output?: string;
      outputFormat?: string;
      model?: string;
      minSeverity?: string;
    }) => {
      if (options.minSeverity && !severities.includes(options.minSeverity as Severity)) {
        throw new Error(
          `Unsupported severity '${options.minSeverity}'. Choose low, medium, high, or critical.`,
        );
      }
      const outputFormat = options.outputFormat ?? 'markdown';
      if (outputFormat !== 'markdown' && outputFormat !== 'json') {
        throw new Error(
          `Unsupported output format '${outputFormat}'. Choose markdown or json.`,
        );
      }
      const report = await executeReview({
        ...options,
        minSeverity: options.minSeverity as Severity | undefined,
        outputFormat,
      });
      if (!options.output) process.stdout.write(report);
    },
  );

try {
  await program.parseAsync();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Unexpected error'}\n`);
  process.exitCode = 1;
}
