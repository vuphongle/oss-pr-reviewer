import { Octokit } from '@octokit/rest';
import { Buffer } from 'node:buffer';

import type { PullRequest } from '../types.js';
import type { RepositoryReference } from './types.js';
import type { RepositoryFileReader } from '../config/repository.js';
import type { ReviewComment, ReviewCommentClient } from './comments.js';
import { retry, isRetryable } from '../ai/client.js';

export interface GithubRetryOptions {
  maxRetries?: number;
  backoffMs?: (attempt: number, error: unknown) => number;
}

interface GithubClientOptions {
  token?: string;
  octokit?: Octokit;
  retry?: GithubRetryOptions;
}

const DEFAULT_MAX_RETRIES = 2;
const MAX_SNAPSHOT_ATTEMPTS = 3;
const exponentialBackoff = (attempt: number): number => Math.min(1000 * 2 ** (attempt - 1), 8000);

export class GithubClient implements RepositoryFileReader, ReviewCommentClient {
  private readonly octokit: Octokit;
  private readonly maxRetries: number;
  private readonly backoffMs: (attempt: number, error: unknown) => number;

  constructor(options: GithubClientOptions = {}) {
    this.octokit =
      options.octokit ?? new Octokit(options.token ? { auth: options.token } : undefined);
    this.maxRetries = options.retry?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffMs = options.retry?.backoffMs ?? exponentialBackoff;
  }

  private read<T>(operation: () => Promise<T>): Promise<T> {
    return retry(this.maxRetries, this.backoffMs, operation);
  }

  async getPullRequest(reference: RepositoryReference, number: number): Promise<PullRequest> {
    try {
      const parameters = {
        owner: reference.owner,
        repo: reference.repository,
        pull_number: number,
      };
      for (let attempt = 0; attempt < MAX_SNAPSHOT_ATTEMPTS; attempt++) {
        const before = await this.read(() => this.octokit.pulls.get(parameters));
        // Retry the entire pagination on a transient page failure. A failed traversal
        // is discarded, so restarting cannot append duplicate pages to the result.
        const filesResponse = await this.read(() =>
          this.octokit.paginate(this.octokit.pulls.listFiles, { ...parameters, per_page: 100 }),
        );
        const pullResponse = await this.read(() => this.octokit.pulls.get(parameters));
        if (
          before.data.base.sha !== pullResponse.data.base.sha ||
          before.data.head.sha !== pullResponse.data.head.sha ||
          before.data.changed_files !== pullResponse.data.changed_files
        )
          continue;

        return {
          owner: reference.owner,
          repository: reference.repository,
          number,
          title: pullResponse.data.title,
          body: pullResponse.data.body ?? '',
          baseSha: pullResponse.data.base.sha,
          headSha: pullResponse.data.head.sha,
          changedFileCount: pullResponse.data.changed_files,
          files: filesResponse.map((file) => ({
            path: file.filename,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
            patch: file.patch,
            previousPath: file.previous_filename,
          })),
        };
      }
      throw new Error(
        'Pull request changed during file acquisition. Retry when its base and head are stable.',
      );
    } catch (error) {
      throw normalizeGithubError(error);
    }
  }

  async getPullRequestHeadSha(reference: RepositoryReference, number: number): Promise<string> {
    try {
      const response = await this.read(() =>
        this.octokit.pulls.get({
          owner: reference.owner,
          repo: reference.repository,
          pull_number: number,
        }),
      );
      return response.data.head.sha;
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
      const response = await retry(this.maxRetries, this.backoffMs, () =>
        this.octokit.repos.getContent({
          owner: reference.owner,
          repo: reference.repository,
          path,
          ref,
        }),
      );
      if (!('content' in response.data) || response.data.type !== 'file') return undefined;
      return Buffer.from(response.data.content, 'base64').toString('utf8');
    } catch (error) {
      const candidate = error as { status?: number };
      if (candidate.status === 404) return undefined;
      throw normalizeGithubError(error);
    }
  }

  async listComments(
    reference: RepositoryReference,
    pullRequestNumber: number,
  ): Promise<ReviewComment[]> {
    try {
      const comments = await this.read(() =>
        this.octokit.paginate(this.octokit.issues.listComments, {
          owner: reference.owner,
          repo: reference.repository,
          issue_number: pullRequestNumber,
          per_page: 100,
        }),
      );
      return comments.map((comment) => ({
        id: comment.id,
        body: comment.body ?? '',
        htmlUrl: comment.html_url,
        user: comment.user
          ? { type: comment.user.type, login: comment.user.login ?? undefined }
          : undefined,
      }));
    } catch (error) {
      throw normalizeGithubError(error);
    }
  }

  async createComment(
    reference: RepositoryReference,
    pullRequestNumber: number,
    body: string,
  ): Promise<Pick<ReviewComment, 'id' | 'htmlUrl'>> {
    try {
      const response = await this.octokit.issues.createComment({
        owner: reference.owner,
        repo: reference.repository,
        issue_number: pullRequestNumber,
        body,
      });
      return { id: response.data.id, htmlUrl: response.data.html_url };
    } catch (error) {
      throw normalizeGithubError(error);
    }
  }

  async updateComment(
    reference: RepositoryReference,
    pullRequestNumber: number,
    commentId: number,
    body: string,
  ): Promise<Pick<ReviewComment, 'id' | 'htmlUrl'>> {
    try {
      const response = await this.octokit.issues.updateComment({
        owner: reference.owner,
        repo: reference.repository,
        comment_id: commentId,
        body,
      });
      return { id: response.data.id, htmlUrl: response.data.html_url };
    } catch (error) {
      throw normalizeGithubError(error);
    }
  }
}

export function normalizeGithubError(error: unknown): Error {
  const candidate = error as { status?: number; message?: string };
  if (candidate.status === 401)
    return new Error('GitHub authentication failed. Check GITHUB_TOKEN.');
  if (candidate.status === 403)
    return new Error(
      'GitHub denied the request, possibly due to rate limiting. Use GITHUB_TOKEN and retry later.',
    );
  if (candidate.status === 404)
    return new Error('GitHub pull request was not found or is not accessible.');
  if (isRetryable(error))
    return new Error('GitHub service is temporarily unavailable. Retry later.');
  return new Error(
    `GitHub API request failed${candidate.message ? `: ${candidate.message}` : '.'}`,
  );
}
