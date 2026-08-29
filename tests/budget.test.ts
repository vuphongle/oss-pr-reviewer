import { describe, expect, it } from 'vitest';

import {
  createBatches,
  DEFAULT_REVIEW_BUDGET,
  getUsableDiffCharacters,
} from '../src/review/batching.js';

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
});
