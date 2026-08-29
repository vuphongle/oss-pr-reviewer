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
          data: { title: 'Title', body: null, base: { sha: 'base-sha' }, changed_files: 1 },
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
      changedFileCount: 1,
    });
    expect(pullRequest.files[0]).toMatchObject({ path: 'src/a.ts', patch: '@@', additions: 2 });
  });

  it('retains the authoritative changed-file count when GitHub truncates the file list', async () => {
    const octokit = {
      pulls: {
        get: vi.fn().mockResolvedValue({
          data: {
            title: 'Large change',
            body: '',
            base: { sha: 'base-sha' },
            changed_files: 3001,
          },
        }),
        listFiles: vi.fn(),
      },
      paginate: vi.fn().mockResolvedValue([
        {
          filename: 'src/available.ts',
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: '+available',
        },
      ]),
    };

    const pullRequest = await new GithubClient({ octokit: octokit as never }).getPullRequest(
      reference,
      4,
    );

    expect(pullRequest.changedFileCount).toBe(3001);
    expect(pullRequest.files).toHaveLength(1);
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

  it('retries transient GitHub API failures', async () => {
    const getContent = vi
      .fn()
      .mockRejectedValueOnce({ status: 502, message: 'bad gateway' })
      .mockResolvedValueOnce({ data: { type: 'file', content: Buffer.from('ok').toString('base64') } });
    const octokit = { repos: { getContent } } as never;
    await expect(
      new GithubClient({ octokit, retry: { maxRetries: 1, backoffMs: () => 0 } }).getFileAtRef(
        reference,
        '.oss-pr-reviewer.yml',
        'base-sha',
      ),
    ).resolves.toBe('ok');
    expect(getContent).toHaveBeenCalledTimes(2);
  });

  it('does not retry GitHub 404 responses when reading files', async () => {
    const getContent = vi.fn().mockRejectedValue({ status: 404 });
    const octokit = { repos: { getContent } } as never;
    await expect(
      new GithubClient({ octokit, retry: { maxRetries: 3, backoffMs: () => 0 } }).getFileAtRef(
        reference,
        '.oss-pr-reviewer.yml',
        'base-sha',
      ),
    ).resolves.toBeUndefined();
    expect(getContent).toHaveBeenCalledOnce();
  });

  it('normalizes PR comment list, create, and update API calls', async () => {
    const octokit = {
      issues: {
        listComments: vi.fn(),
        createComment: vi.fn().mockResolvedValue({
          data: { id: 22, html_url: 'https://github.test/comments/22' },
        }),
        updateComment: vi.fn().mockResolvedValue({
          data: { id: 22, html_url: 'https://github.test/comments/22' },
        }),
      },
      paginate: vi.fn().mockResolvedValue([
        {
          id: 22,
          body: '<!-- oss-pr-reviewer -->\nreport',
          html_url: 'https://github.test/comments/22',
          user: { type: 'Bot', login: 'github-actions[bot]' },
        },
      ]),
    };
    const client = new GithubClient({ octokit: octokit as never });

    await expect(client.listComments(reference, 7)).resolves.toMatchObject([
      {
        id: 22,
        body: '<!-- oss-pr-reviewer -->\nreport',
        user: { type: 'Bot', login: 'github-actions[bot]' },
      },
    ]);
    await expect(client.createComment(reference, 7, 'body')).resolves.toEqual({
      id: 22,
      htmlUrl: 'https://github.test/comments/22',
    });
    await expect(client.updateComment(reference, 7, 22, 'updated')).resolves.toEqual({
      id: 22,
      htmlUrl: 'https://github.test/comments/22',
    });
    expect(octokit.paginate).toHaveBeenCalledWith(octokit.issues.listComments, {
      owner: 'octo',
      repo: 'project',
      issue_number: 7,
      per_page: 100,
    });
    expect(octokit.issues.createComment).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'project',
      issue_number: 7,
      body: 'body',
    });
    expect(octokit.issues.updateComment).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'project',
      comment_id: 22,
      body: 'updated',
    });
  });
});
