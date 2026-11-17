import { describe, expect, it, vi } from 'vitest';

import { validateFindings } from '../src/review/validate.js';
import { DEFAULT_MAX_REVIEW_BATCHES, reviewPullRequest } from '../src/review/reviewer.js';
import { DEFAULT_REPOSITORY_CONFIG } from '../src/config/repository.js';
import { renderMarkdown } from '../src/report/markdown.js';
import { renderJson } from '../src/report/json.js';
import { findingFixture, pullRequestFixture, resultFixture } from './fixtures.js';

const file = {
  path: 'current.ts',
  status: 'renamed',
  previousPath: 'old.ts',
  additions: 1,
  deletions: 1,
  patch: '@@ -10,3 +20,3 @@\n unchanged\n-old\n+new\n context\n\\ No newline at end of file',
};
const batch = { files: [file], characterCount: file.patch.length };

const config = {
  ...DEFAULT_REPOSITORY_CONFIG,
  context: { ...DEFAULT_REPOSITORY_CONFIG.context, maxFilesPerBatch: 1 },
};

describe('provider finding location evidence', () => {
  it('retains additions, deletions, context, and file-level findings with explicit diff coordinates', () => {
    const result = validateFindings(
      [20, 21, 11, 12, null].map((line) => findingFixture({ file: file.path, line })),
      batch,
    );
    expect(result.rejectedFindings).toEqual([]);
    expect(result.findings.map(({ line, diffSide }) => [line, diffSide])).toEqual([
      [20, 'new'],
      [21, 'new'],
      [11, 'old'],
      [12, 'old'],
      [null, undefined],
    ]);
  });

  it('accepts actual rename aliases only with old-side evidence and canonicalizes their path', () => {
    const result = validateFindings(
      [10, 21, null].map((line) => findingFixture({ file: 'old.ts', line })),
      batch,
    );
    expect(result.findings.map(({ file, line, diffSide }) => [file, line, diffSide])).toEqual([
      ['current.ts', 10, 'old'],
      ['current.ts', null, undefined],
    ]);
    expect(result.rejectedFindings.map(({ reason }) => reason)).toEqual(['line-not-in-diff']);
    expect(
      validateFindings([findingFixture({ file: 'old.ts', line: null })], {
        ...batch,
        files: [{ ...file, status: 'modified' }],
      }).rejectedFindings[0].reason,
    ).toBe('file-not-in-batch');
  });

  it.each([0, -1, 1.5, Number.NaN, 999])('rejects impossible or invalid line %s', (line) => {
    const result = validateFindings([findingFixture({ file: file.path, line })], batch);
    expect(result.findings).toEqual([]);
    expect(result.rejectedFindings[0].reason).toBe('line-not-in-diff');
  });

  it('does not trust hunk ranges or unnumbered patches as actual line evidence', () => {
    for (const patch of ['@@ -1,100 +1,100 @@\n+only supplied line', '+unnumbered']) {
      expect(
        validateFindings([findingFixture({ file: file.path, line: 50 })], {
          ...batch,
          files: [{ ...file, patch }],
        }).findings,
      ).toEqual([]);
    }
  });

  it.each(['removed', 'deleted', 'added'])('handles %s file coordinates', (status) => {
    const patch = status === 'added' ? '@@ -0,0 +1,1 @@\n+new' : '@@ -5,1 +0,0 @@\n-old';
    const line = status === 'added' ? 1 : 5;
    const result = validateFindings([findingFixture({ file: file.path, line })], {
      ...batch,
      files: [{ ...file, status, patch }],
    });
    expect(result.findings[0].diffSide).toBe(status === 'added' ? 'new' : 'old');
  });

  it('rejects another batch file before merge and exposes rejection details in both reports', async () => {
    const files = [file, { ...file, path: 'second.ts', previousPath: undefined }];
    const execution = await reviewPullRequest(
      { ...pullRequestFixture, files, changedFileCount: 2 },
      {
        review: async ({ batch }) =>
          resultFixture({
            findings: [
              findingFixture({
                file: batch.files[0].path === file.path ? 'second.ts' : file.path,
                line: null,
              }),
              findingFixture({ file: batch.files[0].path, line: 999 }),
            ],
          }),
      },
      'low',
      config,
    );
    expect(execution.result.findings).toEqual([]);
    expect(execution.result.riskLevel).toBe('unknown');
    expect(execution.rejectedFindings?.map(({ reason }) => reason)).toEqual([
      'file-not-in-batch',
      'line-not-in-diff',
      'file-not-in-batch',
      'line-not-in-diff',
    ]);
    const data = { pullRequest: { ...pullRequestFixture, files }, ...execution };
    expect(renderMarkdown(data)).toContain('Rejected findings: 4');
    expect(renderMarkdown(data)).toContain('file-not-in-batch');
    expect(renderMarkdown(data)).not.toContain('No significant issues were identified');
    expect(JSON.parse(renderJson(data)).rejectedFindings).toHaveLength(4);
  });
});

describe('total provider request budget', () => {
  it('rejects over-budget PRs before any calls and permits an explicit higher limit', async () => {
    const files = Array.from({ length: DEFAULT_MAX_REVIEW_BATCHES + 1 }, (_, index) => ({
      ...file,
      path: `file-${index}.ts`,
    }));
    const pullRequest = { ...pullRequestFixture, files, changedFileCount: files.length };
    const provider = { review: vi.fn().mockResolvedValue(resultFixture({ findings: [] })) };
    await expect(reviewPullRequest(pullRequest, provider, 'low', config)).rejects.toThrow(
      /21 batches.*20 batch limit.*No provider requests/,
    );
    expect(provider.review).not.toHaveBeenCalled();
    await expect(
      reviewPullRequest(pullRequest, provider, 'low', config, 21),
    ).resolves.toMatchObject({ batchCount: 21 });
    expect(provider.review).toHaveBeenCalledTimes(21);
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects invalid max-batches %s before provider work',
    async (limit) => {
      const provider = { review: vi.fn() };
      await expect(
        reviewPullRequest(pullRequestFixture, provider, 'low', config, limit),
      ).rejects.toThrow(/positive safe integer/);
      expect(provider.review).not.toHaveBeenCalled();
    },
  );
});
