import { describe, expect, it, vi } from 'vitest';

import {
  buildActionReviewOptions,
  parseActionInputs,
  redactSecrets,
} from '../src/action/inputs.js';
import { parsePullRequestEvent } from '../src/action/event.js';
import { writeActionReport } from '../src/action/output.js';
import { writeActionOutput } from '../src/action/output.js';
import { assertActionCredentialsAvailable } from '../src/action/security.js';
import { publishActionComment } from '../src/action/comment.js';
import { OSS_PR_REVIEWER_MARKER } from '../src/github/comments.js';
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
        ACTION_POST_COMMENT: 'true',
      }),
    ).toEqual({
      githubToken: 'github-token',
      openAiApiKey: 'openai-key',
      model: 'gpt-test',
      minSeverity: 'high',
      postComment: true,
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
    expect(() =>
      parseActionInputs({
        GITHUB_TOKEN: 'github-token',
        OPENAI_API_KEY: 'openai-key',
        ACTION_POST_COMMENT: 'sometimes',
      }),
    ).toThrow(/post-comment/);
  });

  it('defaults comment publishing to disabled and accepts false explicitly', () => {
    expect(
      parseActionInputs({ GITHUB_TOKEN: 'github-token', OPENAI_API_KEY: 'openai-key' }).postComment,
    ).toBe(false);
    expect(
      parseActionInputs({
        GITHUB_TOKEN: 'github-token',
        OPENAI_API_KEY: 'openai-key',
        ACTION_POST_COMMENT: 'false',
      }).postComment,
    ).toBe(false);
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
    expect(workflow).toMatch(/vuphongle\/oss-pr-reviewer@v0\.4\.0/);
    expect(workflow).not.toMatch(/pull_request_target/);
  });

  it('documents explicit write permission for opt-in comment mode', async () => {
    const workflow = await readTextFile(
      new URL('../examples/github-actions/comment.yml', import.meta.url),
      'utf8',
    );
    expect(workflow).toMatch(/pull_request:/);
    expect(workflow).toMatch(/pull-requests: write/);
    expect(workflow).toMatch(/post-comment: true/);
    expect(workflow).toMatch(/vuphongle\/oss-pr-reviewer@v0\.4\.0/);
    expect(workflow).not.toMatch(/pull_request_target/);
  });

  it('declares opt-in comment mode and stable outputs in action.yml', async () => {
    const action = await readTextFile(new URL('../action.yml', import.meta.url), 'utf8');
    expect(action).toMatch(/post-comment:/);
    expect(action).toMatch(/default: 'false'/);
    expect(action).toMatch(/comment-action:/);
    expect(action).toMatch(/comment-id:/);
    expect(action).toMatch(/comment-url:/);
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

  it('writes stable action outputs using the GitHub output protocol', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'oss-pr-reviewer-action-output-'));
    const outputPath = join(directory, 'output');

    await writeActionOutput(outputPath, { 'comment-action': 'created', 'comment-id': '22' });

    const output = await readFile(outputPath, 'utf8');
    expect(output).toMatch(/comment-action<<.*\ncreated\n/);
    expect(output).toMatch(/comment-id<<.*\n22\n/);
  });

  it('does not call GitHub comments when comment mode is disabled', async () => {
    const client = { listComments: vi.fn() };
    await expect(
      publishActionComment(
        client as never,
        { url: 'https://github.com/octo/project/pull/7', number: 7, isFork: false },
        '## Review',
        false,
      ),
    ).resolves.toBeUndefined();
    expect(client.listComments).not.toHaveBeenCalled();
  });

  it('publishes the existing report when comment mode is enabled', async () => {
    const client = {
      listComments: vi.fn().mockResolvedValue([]),
      createComment: vi.fn().mockResolvedValue({ id: 22, htmlUrl: 'https://example.test/c/22' }),
    };
    await expect(
      publishActionComment(
        client as never,
        { url: 'https://github.com/octo/project/pull/7', number: 7, isFork: false },
        '## Review',
        true,
      ),
    ).resolves.toEqual({ action: 'created', id: 22, htmlUrl: 'https://example.test/c/22' });
    expect(client.createComment).toHaveBeenCalledWith(
      { owner: 'octo', repository: 'project' },
      7,
      `${OSS_PR_REVIEWER_MARKER}\n\n## Review`,
    );
  });
});
