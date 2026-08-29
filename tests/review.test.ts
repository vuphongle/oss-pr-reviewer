import { describe, expect, it, vi } from 'vitest';

import { createBatches, REVIEW_LIMITS } from '../src/review/batching.js';
import { normalizeFiles } from '../src/review/normalize.js';
import { DEFAULT_REVIEW_CONCURRENCY, reviewPullRequest } from '../src/review/reviewer.js';
import { deduplicateFindings, filterFindings, severityOrder } from '../src/review/severity.js';
import { findingFixture, pullRequestFixture, resultFixture } from './fixtures.js';
import type { ReviewProvider } from '../src/ai/provider.js';
import { DEFAULT_REPOSITORY_CONFIG } from '../src/config/repository.js';

describe('severity and findings', () => {
  it('orders severities deterministically', () =>
    expect(severityOrder).toEqual({ unknown: 0, low: 1, medium: 2, high: 3, critical: 4 }));
  it('filters findings at the requested minimum', () =>
    expect(
      filterFindings(
        [
          findingFixture({ severity: 'low' }),
          findingFixture({ severity: 'critical', title: 'Critical' }),
        ],
        'high',
      ),
    ).toHaveLength(1));
  it('deduplicates identical findings while retaining distinct lines', () =>
    expect(
      deduplicateFindings([findingFixture(), findingFixture(), findingFixture({ line: 12 })]),
    ).toHaveLength(2));
});

describe('normalization and batching', () => {
  it('skips binary and patchless files', () => {
    const normalized = normalizeFiles(pullRequestFixture.files);
    expect(normalized.reviewable).toHaveLength(1);
    expect(normalized.skipped.map((file) => file.path)).toEqual([
      'assets/logo.png',
      'src/removed.ts',
    ]);
    expect(normalized.skipped[0]?.reason).toBe('binary asset');
  });
  it('creates multiple deterministic batches', () => {
    const files = Array.from({ length: 3 }, (_, index) => ({
      path: `file-${index}.ts`,
      status: 'modified',
      additions: 1,
      deletions: 0,
      patch: 'x'.repeat(10),
    }));
    const { batches } = createBatches(files, {
      ...REVIEW_LIMITS,
      maxDiffSize: 15,
      maxFilesPerBatch: 2,
    });
    expect(batches.map((batch) => batch.files.length)).toEqual([1, 1, 1]);
  });
  it('skips oversized files', () => {
    const { batches, skipped } = createBatches(
      [{ path: 'large.ts', status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(31) }],
      { ...REVIEW_LIMITS, maxFileSize: 30 },
    );
    expect(batches).toHaveLength(0);
    expect(skipped[0]?.reason).toContain('exceeds');
  });
  it('skips a single patch that exceeds the overall diff limit', () => {
    const { batches, skipped } = createBatches(
      [{ path: 'huge.ts', status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(31) }],
      { maxDiffSize: 30, maxFileSize: 40, maxFilesPerBatch: 8 },
    );
    expect(batches).toHaveLength(0);
    expect(skipped[0]?.reason).toContain('batch limit');
  });
});

describe('review pipeline', () => {
  it('merges, deduplicates, and filters provider findings', async () => {
    const provider: ReviewProvider = {
      review: async () =>
        resultFixture({
          findings: [findingFixture(), findingFixture({ severity: 'low', title: 'Style only' })],
        }),
    };
    const execution = await reviewPullRequest(pullRequestFixture, provider, 'high');
    expect(execution.result.findings).toHaveLength(1);
    expect(execution.skippedFiles).toHaveLength(2);
    expect(execution.reviewedFileCount).toBe(1);
    expect(execution.changedFileCount).toBe(3);
    expect(execution.ignoredFileCount).toBe(0);
    expect(execution.batchCount).toBe(1);
  });
  it('returns a useful empty result when no patches are reviewable', async () => {
    const provider: ReviewProvider = { review: async () => resultFixture() };
    const execution = await reviewPullRequest(
      {
        ...pullRequestFixture,
        files: [{ path: 'image.png', status: 'modified', additions: 0, deletions: 0 }],
      },
      provider,
    );
    expect(execution.result.findings).toEqual([]);
    expect(execution.result.summary).toContain('No reviewable');
    expect(execution.reviewedFileCount).toBe(0);
    expect(execution.changedFileCount).toBe(1);
    expect(execution.batchCount).toBe(0);
  });

  it('reports unknown risk when no patches were available for AI review', async () => {
    const provider: ReviewProvider = { review: async () => resultFixture() };
    const execution = await reviewPullRequest(
      {
        ...pullRequestFixture,
        files: [{ path: 'image.png', status: 'modified', additions: 0, deletions: 0 }],
      },
      provider,
    );
    expect(execution.result.riskLevel).toBe('unknown');
  });

  it('derives risk from filtered findings, not raw provider output', async () => {
    const provider: ReviewProvider = {
      review: async () =>
        resultFixture({
          riskLevel: 'critical',
          findings: [findingFixture({ severity: 'low' })],
        }),
    };
    const execution = await reviewPullRequest(pullRequestFixture, provider, 'high');
    expect(execution.result.findings).toEqual([]);
    expect(execution.result.riskLevel).toBe('unknown');
  });

  it('keeps the highest risk from findings that pass the severity filter', async () => {
    const provider: ReviewProvider = {
      review: async () =>
        resultFixture({
          riskLevel: 'low',
          findings: [
            findingFixture({ severity: 'low', title: 'Style' }),
            findingFixture({ severity: 'critical', title: 'Critical' }),
          ],
        }),
    };
    const execution = await reviewPullRequest(pullRequestFixture, provider, 'medium');
    expect(execution.result.findings).toHaveLength(1);
    expect(execution.result.riskLevel).toBe('critical');
  });

  it('passes repository rules to the provider and reports ignored files', async () => {
    const review = vi.fn().mockResolvedValue(resultFixture({ findings: [] }));
    const provider: ReviewProvider = { review };
    const execution = await reviewPullRequest(
      {
        ...pullRequestFixture,
        files: [
          ...pullRequestFixture.files,
          {
            path: 'src/payment.ts',
            status: 'modified',
            additions: 1,
            deletions: 0,
            patch: '+return true;',
          },
        ],
      },
      provider,
      'low',
      {
        ...DEFAULT_REPOSITORY_CONFIG,
        rules: [{ id: 'require-tests', description: 'Changes to source need tests.' }],
        ignore: { paths: ['src/api/**'] },
      },
    );
    expect(execution.skippedFiles).toContainEqual({
      path: 'src/api/account.ts',
      reason: 'ignored by repository configuration',
    });
    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewRules: [{ id: 'require-tests', description: 'Changes to source need tests.' }],
      }),
    );
  });

  it('limits concurrent provider calls and preserves batch order', async () => {
    const files = Array.from({ length: 10 }, (_, index) => ({
      path: `batch-${index}.ts`,
      status: 'modified',
      additions: 1,
      deletions: 0,
      patch: 'x',
    }));
    let active = 0;
    let maxActive = 0;
    const provider: ReviewProvider = {
      review: async ({ batch }) => {
        const index = Number(batch.files[0]?.path.match(/batch-(\d+)/)?.[1]);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => globalThis.setTimeout(resolve, 10 - index));
        active -= 1;
        return resultFixture({ summary: `batch ${index}`, findings: [] });
      },
    };
    const execution = await reviewPullRequest(
      { ...pullRequestFixture, files },
      provider,
      'low',
      {
        ...DEFAULT_REPOSITORY_CONFIG,
        context: {
          maxFilesPerBatch: 1,
          maxDiffCharacters: 10,
          maxFileCharacters: 10,
          reservedPromptCharacters: 0,
          reservedResponseCharacters: 0,
        },
      },
    );

    expect(maxActive).toBeLessThanOrEqual(DEFAULT_REVIEW_CONCURRENCY);
    expect(execution.result.summary).toBe(
      'batch 0 batch 1 batch 2 batch 3 batch 4 batch 5 batch 6 batch 7 batch 8 batch 9',
    );
  });

  it('stops scheduling new batches after the first provider failure', async () => {
    const files = Array.from({ length: 10 }, (_, index) => ({
      path: `batch-${index}.ts`,
      status: 'modified',
      additions: 1,
      deletions: 0,
      patch: 'x',
    }));
    const calls: number[] = [];
    const provider: ReviewProvider = {
      review: async ({ batch }) => {
        const index = Number(batch.files[0]?.path.match(/batch-(\d+)/)?.[1]);
        calls.push(index);
        if (index === 1) throw new Error('provider failed');
        await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
        return resultFixture({ findings: [] });
      },
    };

    await expect(
      reviewPullRequest(
        { ...pullRequestFixture, files },
        provider,
        'low',
        {
          ...DEFAULT_REPOSITORY_CONFIG,
          context: {
            maxFilesPerBatch: 1,
            maxDiffCharacters: 10,
            maxFileCharacters: 10,
            reservedPromptCharacters: 0,
            reservedResponseCharacters: 0,
          },
        },
      ),
    ).rejects.toThrow('provider failed');
    expect(calls.sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });
});
