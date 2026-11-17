import { describe, expect, it, vi } from 'vitest';
import { Octokit } from '@octokit/rest';
import { Buffer } from 'node:buffer';

import { GithubClient } from '../src/github/client.js';
import type { RepositoryReference } from '../src/github/types.js';

const reference: RepositoryReference = { owner: 'octo', repository: 'project' };

describe('GitHub client', () => {
  it('normalizes pull request and file API responses', async () => {
    const octokit = {
      pulls: {
        get: vi.fn().mockResolvedValue({
          data: {
            title: 'Title',
            body: null,
            base: { sha: 'base-sha' },
            head: { sha: 'head-sha' },
            changed_files: 1,
          },
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
      headSha: 'head-sha',
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
            head: { sha: 'head-sha' },
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

  it('reads the current pull request head SHA for stale publication checks', async () => {
    const octokit = {
      pulls: {
        get: vi.fn().mockResolvedValue({ data: { head: { sha: 'current-head' } } }),
      },
    };

    await expect(
      new GithubClient({ octokit: octokit as never }).getPullRequestHeadSha(reference, 4),
    ).resolves.toBe('current-head');
    expect(octokit.pulls.get).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'project',
      pull_number: 4,
    });
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
      .mockResolvedValueOnce({
        data: { type: 'file', content: Buffer.from('ok').toString('base64') },
      });
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

describe('GitHub stable snapshot acquisition', () => {
  const metadata = (head = 'head', base = 'base') => ({
    data: { title: 'PR', body: '', head: { sha: head }, base: { sha: base }, changed_files: 1 },
  });
  const file = { filename: 'stable.ts', status: 'added', additions: 1, deletions: 0, patch: '+ok' };

  it.each(['head', 'base'])(
    'discards files when the %s changes during acquisition',
    async (changed) => {
      const first = metadata();
      const stable = changed === 'head' ? metadata('next') : metadata('head', 'next');
      const get = vi.fn().mockResolvedValueOnce(first).mockResolvedValue(stable);
      const paginate = vi
        .fn()
        .mockResolvedValueOnce([{ ...file, filename: 'mixed.ts' }])
        .mockResolvedValue([file]);
      const octokit = { pulls: { get, listFiles: vi.fn() }, paginate };
      const result = await new GithubClient({ octokit: octokit as never }).getPullRequest(
        reference,
        4,
      );
      expect(result.files.map(({ path }) => path)).toEqual(['stable.ts']);
      expect(result.headSha).toBe(stable.data.head.sha);
      expect(result.baseSha).toBe(stable.data.base.sha);
      expect(get).toHaveBeenCalledTimes(4);
      expect(paginate).toHaveBeenCalledTimes(2);
    },
  );

  it('fails after three changing snapshots instead of reviewing a mixed diff', async () => {
    let revision = 0;
    const get = vi.fn().mockImplementation(async () => metadata(String(revision++)));
    const paginate = vi.fn().mockResolvedValue([file]);
    const octokit = { pulls: { get, listFiles: vi.fn() }, paginate };
    await expect(
      new GithubClient({ octokit: octokit as never }).getPullRequest(reference, 4),
    ).rejects.toThrow(/changed during file acquisition/);
    expect(get).toHaveBeenCalledTimes(6);
    expect(paginate).toHaveBeenCalledTimes(3);
  });

  it('retries transient metadata and head reads but never blindly retries comment creation', async () => {
    const get = vi.fn().mockRejectedValueOnce({ status: 502 }).mockResolvedValue(metadata());
    const createComment = vi.fn().mockRejectedValue({ status: 502 });
    const octokit = {
      pulls: { get, listFiles: vi.fn() },
      paginate: vi.fn().mockResolvedValue([file]),
      issues: { createComment },
    };
    const client = new GithubClient({ octokit: octokit as never, retry: { backoffMs: () => 0 } });
    await expect(client.getPullRequest(reference, 4)).resolves.toMatchObject({ headSha: 'head' });
    get.mockRejectedValueOnce({ status: 502 });
    await expect(client.getPullRequestHeadSha(reference, 4)).resolves.toBe('head');
    expect(get).toHaveBeenCalledTimes(5);
    await expect(client.createComment(reference, 4, 'report')).rejects.toThrow(
      /temporarily unavailable/,
    );
    expect(createComment).toHaveBeenCalledOnce();
  });
});

describe('native Octokit pagination retry', () => {
  it.each(['files', 'comments'])(
    'restarts %s pagination after a later page fails without duplicate results',
    async (kind) => {
      const pages: number[] = [];
      let failed = false;
      const octokit = new Octokit({
        request: {
          fetch: async (input: Parameters<typeof globalThis.fetch>[0]) => {
            const url = new globalThis.URL(String(input));
            if (url.pathname === '/repos/octo/project/pulls/4') {
              return new globalThis.Response(
                JSON.stringify({
                  title: 'PR',
                  base: { sha: 'base' },
                  head: { sha: 'head' },
                  changed_files: 2,
                }),
                { headers: { 'content-type': 'application/json' } },
              );
            }
            const page = Number(url.searchParams.get('page') ?? 1);
            pages.push(page);
            if (page === 2 && !failed) {
              failed = true;
              return new globalThis.Response(JSON.stringify({ message: 'bad gateway' }), {
                status: 502,
                headers: { 'content-type': 'application/json' },
              });
            }
            const data =
              kind === 'files'
                ? [
                    {
                      filename: `file-${page}.ts`,
                      status: 'added',
                      additions: 1,
                      deletions: 0,
                      patch: '+ok',
                    },
                  ]
                : [{ id: page, body: `comment-${page}` }];
            return new globalThis.Response(JSON.stringify(data), {
              headers: {
                'content-type': 'application/json',
                ...(page === 1
                  ? {
                      link: `<https://api.github.com${url.pathname}?per_page=100&page=2>; rel="next"`,
                    }
                  : {}),
              },
            });
          },
        },
      });
      const client = new GithubClient({ octokit, retry: { maxRetries: 1, backoffMs: () => 0 } });
      const results =
        kind === 'files'
          ? (await client.getPullRequest(reference, 4)).files
          : await client.listComments(reference, 4);
      expect(results).toHaveLength(2);
      expect(pages).toEqual([1, 2, 1, 2]);
    },
  );
});
