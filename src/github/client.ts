import { Octokit } from '@octokit/rest';
import { Buffer } from 'node:buffer';

import type { PullRequest } from '../types.js';
import type { RepositoryReference } from './types.js';
import type { RepositoryFileReader } from '../config/repository.js';

interface GithubClientOptions {
  token?: string;
  octokit?: Octokit;
}

export class GithubClient implements RepositoryFileReader {
  private readonly octokit: Octokit;

  constructor(options: GithubClientOptions = {}) {
    this.octokit =
      options.octokit ?? new Octokit(options.token ? { auth: options.token } : undefined);
  }

  async getPullRequest(reference: RepositoryReference, number: number): Promise<PullRequest> {
    try {
      const [pullResponse, filesResponse] = await Promise.all([
        this.octokit.pulls.get({
          owner: reference.owner,
          repo: reference.repository,
          pull_number: number,
        }),
        this.octokit.paginate(this.octokit.pulls.listFiles, {
          owner: reference.owner,
          repo: reference.repository,
          pull_number: number,
          per_page: 100,
        }),
      ]);

      return {
        owner: reference.owner,
        repository: reference.repository,
        number,
        title: pullResponse.data.title,
        body: pullResponse.data.body ?? '',
        baseSha: pullResponse.data.base.sha,
        files: filesResponse.map((file) => ({
          path: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch,
          previousPath: file.previous_filename,
        })),
      };
    } catch (error) {
      throw normalizeGithubError(error);
    }
  }

  async getFileAtRef(
    reference: RepositoryReference,
    path: string,
    ref: string,
  ): Promise<string | undefined> {
    try {
      const response = await this.octokit.repos.getContent({
        owner: reference.owner,
        repo: reference.repository,
        path,
        ref,
      });
      if (!('content' in response.data) || response.data.type !== 'file') return undefined;
      return Buffer.from(response.data.content, 'base64').toString('utf8');
    } catch (error) {
      const candidate = error as { status?: number };
      if (candidate.status === 404) return undefined;
      throw normalizeGithubError(error);
    }
  }
}

function normalizeGithubError(error: unknown): Error {
  const candidate = error as { status?: number; message?: string };
  if (candidate.status === 401)
    return new Error('GitHub authentication failed. Check GITHUB_TOKEN.');
  if (candidate.status === 403)
    return new Error(
      'GitHub denied the request, possibly due to rate limiting. Use GITHUB_TOKEN and retry later.',
    );
  if (candidate.status === 404)
    return new Error('GitHub pull request was not found or is not accessible.');
  return new Error(
    `GitHub API request failed${candidate.message ? `: ${candidate.message}` : '.'}`,
  );
}
