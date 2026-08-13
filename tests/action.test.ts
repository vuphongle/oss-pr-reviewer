import { describe, expect, it } from 'vitest';

import {
  buildActionReviewOptions,
  parseActionInputs,
  redactSecrets,
} from '../src/action/inputs.js';
import { parsePullRequestEvent } from '../src/action/event.js';
import { writeActionReport } from '../src/action/output.js';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('GitHub Action inputs', () => {
  it('parses required credentials and optional review settings', () => {
    expect(
      parseActionInputs({
        GITHUB_TOKEN: 'github-token',
        OPENAI_API_KEY: 'openai-key',
        ACTION_MODEL: 'gpt-test',
        ACTION_MIN_SEVERITY: 'high',
      }),
    ).toEqual({
      githubToken: 'github-token',
      openAiApiKey: 'openai-key',
      model: 'gpt-test',
      minSeverity: 'high',
    });
  });

  it('rejects missing credentials and unsupported severity', () => {
    expect(() => parseActionInputs({ OPENAI_API_KEY: 'openai-key' })).toThrow(/GITHUB_TOKEN/);
    expect(() =>
      parseActionInputs({
        GITHUB_TOKEN: 'github-token',
        OPENAI_API_KEY: 'openai-key',
        ACTION_MIN_SEVERITY: 'urgent',
      }),
    ).toThrow(/severity/);
  });

  it('maps action inputs to the existing review command contract', () => {
    expect(
      buildActionReviewOptions(
        { url: 'https://github.com/octo/project/pull/12' },
        { githubToken: 'github-token', openAiApiKey: 'openai-key', minSeverity: 'medium' },
      ),
    ).toEqual({
      url: 'https://github.com/octo/project/pull/12',
      minSeverity: 'medium',
    });
  });

  it('redacts action secrets from generated output and errors', () => {
    expect(redactSecrets('token=github-token key=openai-key', ['github-token', 'openai-key'])).toBe(
      'token=[REDACTED] key=[REDACTED]',
    );
  });
});

describe('GitHub pull request event', () => {
  it('extracts supported pull request metadata', () => {
    expect(
      parsePullRequestEvent({
        action: 'synchronize',
        pull_request: {
          number: 12,
          html_url: 'https://github.com/octo/project/pull/12',
        },
      }),
    ).toEqual({
      url: 'https://github.com/octo/project/pull/12',
      number: 12,
    });
  });

  it('rejects unsupported actions and missing pull request metadata', () => {
    expect(() =>
      parsePullRequestEvent({
        action: 'closed',
        pull_request: { number: 12, html_url: 'https://github.com/octo/project/pull/12' },
      }),
    ).toThrow(/opened, synchronize, or reopened/);
    expect(() => parsePullRequestEvent({ action: 'opened' })).toThrow(/pull_request/);
  });
});

describe('GitHub Action report output', () => {
  it('writes the report and appends the same Markdown to the job summary', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'oss-pr-reviewer-action-'));
    const reportPath = join(directory, 'report.md');
    const summaryPath = join(directory, 'summary.md');

    await writeActionReport('# Report\n', reportPath, summaryPath);

    await expect(readFile(reportPath, 'utf8')).resolves.toBe('# Report\n');
    await expect(readFile(summaryPath, 'utf8')).resolves.toBe('# Report\n');
  });
});
