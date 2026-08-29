import { describe, expect, it } from 'vitest';
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import { parsePullRequestUrl, parseRepository } from '../src/github/types.js';
import { executeReview } from '../src/cli/commands/review.js';
import type { ReviewProvider } from '../src/ai/provider.js';
import { pullRequestFixture, resultFixture } from './fixtures.js';

describe('CLI input parsing', () => {
  it('keeps the CLI version aligned with release metadata', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(packageJson.version).toBe('0.4.0');
  });
  it('parses owner/repository', () =>
    expect(parseRepository('octo/project')).toEqual({ owner: 'octo', repository: 'project' }));
  it('rejects malformed repositories', () =>
    expect(() => parseRepository('octo/project/extra')).toThrow(/Expected/));
  it('parses a GitHub pull request URL', () =>
    expect(parsePullRequestUrl('https://github.com/octo/project/pull/123')).toEqual({
      repository: { owner: 'octo', repository: 'project' },
      number: 123,
    }));
  it('rejects malformed URLs', () =>
    expect(() => parsePullRequestUrl('https://gitlab.com/octo/project/pull/123')).toThrow(
      /github.com/,
    ));
  it('rejects conflicting CLI inputs before network work', async () => {
    await expect(
      executeReview({
        repo: 'octo/project',
        pr: '1',
        url: 'https://github.com/octo/project/pull/1',
        minSeverity: 'low',
      }),
    ).rejects.toThrow(/either/);
  });
  it('requires the OpenAI key before making the GitHub request', async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await expect(
        executeReview({ repo: 'octo/project', pr: '1', minSeverity: 'low' }),
      ).rejects.toThrow(/OPENAI_API_KEY is required/);
    } finally {
      if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    }
  });
});

describe('CLI output format', () => {
  it('renders Markdown by default and JSON when output-format=json is set', async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';
    const github = {
      getPullRequest: async () => pullRequestFixture,
      getFileAtRef: async () => undefined,
    };
    const provider: ReviewProvider = { review: async () => resultFixture() };
    try {
      const markdown = await executeReview(
        {
          repo: 'example/project',
          pr: '12',
          outputFormat: 'markdown',
          github: github as never,
          provider,
        },
      );
      expect(markdown).toContain('# PR Review Report');

      const json = await executeReview(
        {
          repo: 'example/project',
          pr: '12',
          outputFormat: 'json',
          github: github as never,
          provider,
        },
      );
      expect(() => JSON.parse(json)).not.toThrow();
      expect(JSON.parse(json).pullRequest.number).toBe(12);
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });
});
