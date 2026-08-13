import { describe, expect, it } from 'vitest';

import { createBatches, REVIEW_LIMITS } from '../src/review/batching.js';
import { normalizeFiles } from '../src/review/normalize.js';
import { reviewPullRequest } from '../src/review/reviewer.js';
import { deduplicateFindings, filterFindings, severityOrder } from '../src/review/severity.js';
import { findingFixture, pullRequestFixture, resultFixture } from './fixtures.js';
import type { ReviewProvider } from '../src/ai/provider.js';

describe('severity and findings', () => {
  it('orders severities deterministically', () =>
    expect(severityOrder).toEqual({ low: 0, medium: 1, high: 2, critical: 3 }));
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
  });
});
