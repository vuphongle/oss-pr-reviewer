import type { PullRequest, ReviewFinding, ReviewResult } from '../src/types.js';

export const pullRequestFixture: PullRequest = {
  owner: 'example',
  repository: 'project',
  number: 12,
  title: 'Validate account access',
  body: 'Adds an authorization check.',
  baseSha: 'base-sha',
  headSha: 'head-sha',
  changedFileCount: 3,
  files: [
    {
      path: 'src/api/account.ts',
      status: 'modified',
      additions: 5,
      deletions: 1,
      patch:
        '@@ -10,2 +10,6 @@\n+export function getAccount(id: string) {\n+  return database.get(id);\n+}',
    },
    { path: 'assets/logo.png', status: 'modified', additions: 0, deletions: 0 },
    { path: 'src/removed.ts', status: 'deleted', additions: 0, deletions: 4 },
  ],
};

export const findingFixture = (overrides: Partial<ReviewFinding> = {}): ReviewFinding => ({
  severity: 'high',
  category: 'security',
  title: 'Missing authorization check',
  file: 'src/api/account.ts',
  line: 11,
  explanation: 'The changed endpoint does not verify access to the requested account.',
  recommendation: 'Validate the caller permissions before reading the account.',
  ...overrides,
});

export const resultFixture = (overrides: Partial<ReviewResult> = {}): ReviewResult => ({
  summary: 'The change needs maintainer review.',
  riskLevel: 'high',
  findings: [findingFixture()],
  ...overrides,
});
