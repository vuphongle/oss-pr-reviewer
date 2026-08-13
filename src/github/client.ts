import { Octokit } from '@octokit/rest';

import type { PullRequest } from '../types.js';
import type { RepositoryReference } from './types.js';

interface GithubClientOptions {
  token?: string;
  octokit?: Octokit;
}

export class GithubClient {
  private readonly octokit: Octokit;

  constructor(options: GithubClientOptions = {}) {
    this.octokit = options.octokit ?? new Octokit(options.token ? { auth: options.token } : undefined);
  }

  async getPullRequest(reference: RepositoryReference, number: number): Promise<PullRequest> {
    try {
      const [pullResponse, filesResponse] = await Promise.all([
        this.octokit.pulls.get({ owner: reference.owner, repo: reference.repository, pull_number: number }),
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
}

function normalizeGithubError(error: unknown): Error {
  const candidate = error as { status?: number; message?: string };
  if (candidate.status === 401) return new Error('GitHub authentication failed. Check GITHUB_TOKEN.');
  if (candidate.status === 403) return new Error('GitHub denied the request, possibly due to rate limiting. Use GITHUB_TOKEN and retry later.');
  if (candidate.status === 404) return new Error('GitHub pull request was not found or is not accessible.');
  return new Error(`GitHub API request failed${candidate.message ? `: ${candidate.message}` : '.'}`);
}
