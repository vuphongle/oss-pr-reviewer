import { describe, expect, it } from 'vitest';

import {
  createBatches,
  DEFAULT_REVIEW_BUDGET,
  getUsableDiffCharacters,
} from '../src/review/batching.js';
import { parseRepositoryConfig } from '../src/config/repository.js';
import { buildReviewPrompt, REVIEW_SYSTEM_PROMPT } from '../src/review/prompt.js';
import { pullRequestFixture } from './fixtures.js';

describe('review context budgeting', () => {
  it('reserves prompt and response space from the diff budget', () => {
    expect(
      getUsableDiffCharacters({
        maxDiffCharacters: 100,
        maxFileCharacters: 80,
        maxFilesPerBatch: 4,
        reservedPromptCharacters: 20,
        reservedResponseCharacters: 30,
      }),
    ).toBe(50);
  });

  it('uses a deterministic default budget', () => {
    expect(DEFAULT_REVIEW_BUDGET).toEqual({
      maxDiffCharacters: 60_000,
      maxFileCharacters: 30_000,
      maxFilesPerBatch: 8,
      reservedPromptCharacters: 8_000,
      reservedResponseCharacters: 12_000,
      maxPromptCharacters: 120_000,
      maxMetadataCharacters: 20_000,
      maxGuidanceCharacters: 24_000,
    });
    expect(getUsableDiffCharacters(DEFAULT_REVIEW_BUDGET)).toBe(40_000);
  });

  it('packs files against the usable diff budget and reports batch count', () => {
    const result = createBatches(
      [
        { path: 'a.ts', status: 'modified', additions: 1, deletions: 0, patch: 'a'.repeat(20) },
        { path: 'b.ts', status: 'modified', additions: 1, deletions: 0, patch: 'b'.repeat(20) },
        { path: 'c.ts', status: 'modified', additions: 1, deletions: 0, patch: 'c'.repeat(20) },
      ],
      {
        maxDiffCharacters: 70,
        maxFileCharacters: 30,
        maxFilesPerBatch: 8,
        reservedPromptCharacters: 10,
        reservedResponseCharacters: 10,
      },
    );
    expect(result.batches.map((batch) => batch.files.map((file) => file.path))).toEqual([
      ['a.ts', 'b.ts'],
      ['c.ts'],
    ]);
  });

  it('rejects budgets whose reserved context exceeds the maximum', () => {
    expect(() =>
      getUsableDiffCharacters({
        maxDiffCharacters: 10,
        maxFileCharacters: 10,
        maxFilesPerBatch: 1,
        reservedPromptCharacters: 6,
        reservedResponseCharacters: 5,
      }),
    ).toThrow(/budget/);
  });

  it.each([
    {
      name: 'default budget',
      context: {},
      fileCount: 16,
      pathLength: 4_000,
      patchLength: 5_000,
      expectedBatchSizes: [6, 6, 4],
    },
    {
      name: '100-file budget',
      context: {
        maxFilesPerBatch: 100,
        maxDiffCharacters: 500_000,
        maxFileCharacters: 200_000,
      },
      fileCount: 100,
      pathLength: 230,
      patchLength: 620,
      expectedBatchSizes: [70, 30],
    },
    {
      name: 'custom total prompt cap',
      context: {
        maxFilesPerBatch: 100,
        maxDiffCharacters: 500_000,
        maxFileCharacters: 200_000,
        maxPromptCharacters: 100_000,
      },
      fileCount: 100,
      pathLength: 230,
      patchLength: 620,
      expectedBatchSizes: [47, 47, 6],
    },
  ])('fits rendered files and capped context with $name', (testCase) => {
    const config = parseRepositoryConfig(
      JSON.stringify({
        version: 1,
        context: testCase.context,
        rules: Array.from({ length: 5 }, (_, index) => ({
          id: `rule-${index}`,
          description: 'r'.repeat(index === 0 ? 3_987 : 3_986),
        })),
      }),
    );
    const budget = { ...DEFAULT_REVIEW_BUDGET, ...config.context };
    const files = Array.from({ length: testCase.fileCount }, (_, index) => ({
      path: `file-${index}.ts`.padStart(testCase.pathLength, 'p'),
      status: 'modified',
      additions: 1,
      deletions: 0,
      patch: 'x'.repeat(testCase.patchLength),
    }));
    const pullRequest = { ...pullRequestFixture, body: 'b'.repeat(20_000), files };
    const result = createBatches(files, budget);

    for (const batch of result.batches) {
      const prompt = buildReviewPrompt(pullRequest, batch, config.rules, budget);
      expect(prompt).toContain('[PR metadata truncated to fit the configured context budget');
      expect(
        REVIEW_SYSTEM_PROMPT.length + prompt.length + budget.reservedResponseCharacters,
      ).toBeLessThanOrEqual(budget.maxPromptCharacters!);
    }
    expect(result.batches.map((batch) => batch.files.length)).toEqual(testCase.expectedBatchSizes);
    expect(result.batches.flatMap((batch) => batch.files)).toEqual(files);
    expect(result.batches.map((batch) => batch.characterCount)).toEqual(
      testCase.expectedBatchSizes.map((size) => size * testCase.patchLength),
    );
    expect(result.skipped).toEqual([]);
    expect(createBatches(files, budget)).toEqual(result);
  });

  it('skips a lone rendered file that cannot fit without dropping later files', () => {
    const files = [
      { path: 'p'.repeat(230), status: 'modified', additions: 1, deletions: 0, patch: 'x' },
      { path: 'small.ts', status: 'modified', additions: 1, deletions: 0, patch: 'y' },
    ];
    const budget = {
      ...DEFAULT_REVIEW_BUDGET,
      maxDiffCharacters: 500_000,
      maxPromptCharacters: 58_260,
    };
    const result = createBatches(files, budget);

    expect(result.skipped).toEqual([
      {
        path: files[0]!.path,
        reason: 'rendered file exceeds 260 character prompt limit',
      },
    ]);
    expect(result.batches.flatMap((batch) => batch.files)).toEqual([files[1]]);
    expect(createBatches(files, budget)).toEqual(result);
  });

  it('counts separators between rendered files at the prompt boundary', () => {
    const files = ['a.ts', 'b.ts'].map((path) => ({
      path,
      status: 'modified',
      additions: 1,
      deletions: 0,
      patch: 'x',
    }));
    const result = createBatches(files, {
      ...DEFAULT_REVIEW_BUDGET,
      reservedPromptCharacters: 0,
      reservedResponseCharacters: 0,
      maxMetadataCharacters: 100,
      maxGuidanceCharacters: 100,
      // Each rendered file takes 36 characters, with two characters between files.
      maxPromptCharacters: 2_273,
    });

    expect(result.batches.map((batch) => batch.files.map((file) => file.path))).toEqual([
      ['a.ts'],
      ['b.ts'],
    ]);
    expect(result.skipped).toEqual([]);
  });
});
