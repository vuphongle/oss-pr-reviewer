import { describe, expect, it } from 'vitest';

import {
  buildActionReviewOptions,
  parseActionInputs,
  redactSecrets,
} from '../src/action/inputs.js';
import { parsePullRequestEvent } from '../src/action/event.js';
import { writeActionReport } from '../src/action/output.js';
import { assertActionCredentialsAvailable } from '../src/action/security.js';
import { readFile as readTextFile } from 'node:fs/promises';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';

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
      isFork: false,
    });
  });

  it('marks pull requests from fork repositories without changing the event source', () => {
    expect(
      parsePullRequestEvent({
        action: 'opened',
        pull_request: {
          number: 12,
          html_url: 'https://github.com/octo/project/pull/12',
          base: { repo: { full_name: 'octo/project' } },
          head: { repo: { full_name: 'contributor/project' } },
        },
      }).isFork,
    ).toBe(true);
  });

  it('recognizes same-repository pull requests as non-fork events', () => {
    expect(
      parsePullRequestEvent({
        action: 'reopened',
        pull_request: {
          number: 12,
          html_url: 'https://github.com/octo/project/pull/12',
          base: { repo: { full_name: 'octo/project' } },
          head: { repo: { full_name: 'octo/project' } },
        },
      }).isFork,
    ).toBe(false);
  });

  it('explains why fork workflows cannot review without an OpenAI secret', () => {
    expect(() =>
      assertActionCredentialsAvailable(
        { url: 'https://github.com/octo/project/pull/12', number: 12, isFork: true },
        {},
      ),
    ).toThrow(/does not expose repository secrets to pull_request workflows from forks/);
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

describe('GitHub Action security documentation', () => {
  it('documents fork secret limitations and the pull_request trust model', async () => {
    const security = await readTextFile(new URL('../SECURITY.md', import.meta.url), 'utf8');
    expect(security).toMatch(/pull_request/);
    expect(security).toMatch(/fork/i);
    expect(security).toMatch(/pull_request_target/);
    expect(security).toMatch(/GITHUB_STEP_SUMMARY/);
  });

  it('keeps the documented workflow on pull_request with read-only permissions', async () => {
    const workflow = await readTextFile(
      new URL('../examples/github-actions/basic.yml', import.meta.url),
      'utf8',
    );
    expect(workflow).toMatch(/pull_request:/);
    expect(workflow).toMatch(/contents: read/);
    expect(workflow).toMatch(/pull-requests: read/);
    expect(workflow).toMatch(/vuphongle\/oss-pr-reviewer@v0\.3\.0/);
    expect(workflow).not.toMatch(/pull_request_target/);
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
