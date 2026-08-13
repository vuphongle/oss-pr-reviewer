import { URL } from 'node:url';

export interface RepositoryReference {
  owner: string;
  repository: string;
}

export function parseRepository(value: string): RepositoryReference {
  const match = /^([^/]+)\/([^/]+)$/.exec(value.trim());
  if (!match || match[1].includes(' ') || match[2].includes(' ')) {
    throw new Error(`Invalid repository '${value}'. Expected the format owner/repository.`);
  }

  return { owner: match[1], repository: match[2] };
}

export function parsePullRequestUrl(value: string): {
  repository: RepositoryReference;
  number: number;
} {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid GitHub pull request URL '${value}'.`);
  }

  if (url.hostname !== 'github.com') {
    throw new Error(`Invalid GitHub pull request URL '${value}'. Host must be github.com.`);
  }

  const parts = url.pathname.split('/').filter(Boolean);
  const number = Number(parts[3]);
  if (parts.length !== 4 || parts[2] !== 'pull' || !Number.isSafeInteger(number) || number < 1) {
    throw new Error(
      `Invalid GitHub pull request URL '${value}'. Expected /owner/repository/pull/123.`,
    );
  }

  return { repository: parseRepository(`${parts[0]}/${parts[1]}`), number };
}
