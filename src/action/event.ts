import { parsePullRequestUrl } from '../github/types.js';

const supportedActions = new Set(['opened', 'synchronize', 'reopened']);

export interface PullRequestEvent {
  url: string;
  number: number;
  isFork: boolean;
  headSha: string;
}

export function parsePullRequestEvent(value: unknown): PullRequestEvent {
  if (!value || typeof value !== 'object') {
    throw new Error('GitHub event is missing pull_request metadata.');
  }

  const event = value as {
    action?: unknown;
    pull_request?: {
      number?: unknown;
      html_url?: unknown;
      base?: { repo?: { full_name?: unknown } };
      head?: { repo?: { full_name?: unknown }; sha?: unknown };
    };
  };
  if (typeof event.action !== 'string' || !supportedActions.has(event.action)) {
    throw new Error('This Action supports only opened, synchronize, or reopened pull requests.');
  }
  if (!event.pull_request || typeof event.pull_request.html_url !== 'string') {
    throw new Error('GitHub event is missing pull_request metadata.');
  }
  const headSha = event.pull_request.head?.sha;
  if (typeof headSha !== 'string' || !headSha) {
    throw new Error('GitHub event is missing pull_request head SHA.');
  }

  const parsed = parsePullRequestUrl(event.pull_request.html_url);
  if (event.pull_request.number !== undefined && event.pull_request.number !== parsed.number) {
    throw new Error('GitHub event pull request number does not match its URL.');
  }
  const baseName = event.pull_request.base?.repo?.full_name;
  const headName = event.pull_request.head?.repo?.full_name;
  const isFork =
    typeof baseName === 'string' && typeof headName === 'string' && baseName !== headName;
  return { url: event.pull_request.html_url, number: parsed.number, isFork, headSha };
}
