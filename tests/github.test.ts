import { describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';

import { GithubClient } from '../src/github/client.js';
import type { RepositoryReference } from '../src/github/types.js';

const reference: RepositoryReference = { owner: 'octo', repository: 'project' };

describe('GitHub client', () => {
  it('normalizes pull request and file API responses', async () => {
    const octokit = {
      pulls: {
        get: vi.fn().mockResolvedValue({
          data: { title: 'Title', body: null, base: { sha: 'base-sha' } },
        }),
        listFiles: vi.fn(),
      },
      paginate: vi.fn().mockResolvedValue([
        {
          filename: 'src/a.ts',
          status: 'modified',
          additions: 2,
          deletions: 1,
          patch: '@@',
          previous_filename: undefined,
        },
      ]),
    };
    const pullRequest = await new GithubClient({ octokit: octokit as never }).getPullRequest(
      reference,
      4,
    );
    expect(pullRequest).toMatchObject({
      owner: 'octo',
      repository: 'project',
      number: 4,
      title: 'Title',
      body: '',
    });
    expect(pullRequest.files[0]).toMatchObject({ path: 'src/a.ts', patch: '@@', additions: 2 });
  });

  it('normalizes authentication, rate limit, and not-found failures', async () => {
    for (const [status, message] of [
      [401, 'authentication'],
      [403, 'rate limiting'],
      [404, 'not found'],
    ] as const) {
      const octokit = {
        pulls: { get: vi.fn().mockRejectedValue({ status }), listFiles: vi.fn() },
        paginate: vi.fn(),
      };
      await expect(
        new GithubClient({ octokit: octokit as never }).getPullRequest(reference, 4),
      ).rejects.toThrow(message);
    }
  });

  it('reads and decodes a file from a trusted ref', async () => {
    const octokit = {
      repos: {
        getContent: vi.fn().mockResolvedValue({
          data: { type: 'file', content: Buffer.from('version: 1').toString('base64') },
        }),
      },
    };
    await expect(
      new GithubClient({ octokit: octokit as never }).getFileAtRef(
        reference,
        '.oss-pr-reviewer.yml',
        'base-sha',
      ),
    ).resolves.toBe('version: 1');
    expect(octokit.repos.getContent).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'project',
      path: '.oss-pr-reviewer.yml',
      ref: 'base-sha',
    });
  });

  it('treats a missing config file as absent', async () => {
    const octokit = { repos: { getContent: vi.fn().mockRejectedValue({ status: 404 }) } };
    await expect(
      new GithubClient({ octokit: octokit as never }).getFileAtRef(
        reference,
        '.oss-pr-reviewer.yml',
        'base-sha',
      ),
    ).resolves.toBeUndefined();
  });
});
