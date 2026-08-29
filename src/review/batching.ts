import type { ReviewableFile, SkippedFile } from '../types.js';

export interface ReviewBudget {
  maxDiffCharacters: number;
  maxFileCharacters: number;
  maxFilesPerBatch: number;
  reservedPromptCharacters: number;
  reservedResponseCharacters: number;
  maxPromptCharacters?: number;
  maxMetadataCharacters?: number;
  maxGuidanceCharacters?: number;
}

export const DEFAULT_MAX_PROMPT_CHARACTERS = 120_000;
export const DEFAULT_MAX_METADATA_CHARACTERS = 20_000;
export const DEFAULT_MAX_GUIDANCE_CHARACTERS = 24_000;
export const SYSTEM_PROMPT_CHARACTER_RESERVE = 2_000;

export const DEFAULT_REVIEW_BUDGET: ReviewBudget = {
  maxDiffCharacters: 60_000,
  maxFileCharacters: 30_000,
  maxFilesPerBatch: 8,
  reservedPromptCharacters: 8_000,
  reservedResponseCharacters: 12_000,
  maxPromptCharacters: DEFAULT_MAX_PROMPT_CHARACTERS,
  maxMetadataCharacters: DEFAULT_MAX_METADATA_CHARACTERS,
  maxGuidanceCharacters: DEFAULT_MAX_GUIDANCE_CHARACTERS,
} as const;

export const REVIEW_LIMITS = {
  maxDiffSize: DEFAULT_REVIEW_BUDGET.maxDiffCharacters,
  maxFileSize: DEFAULT_REVIEW_BUDGET.maxFileCharacters,
  maxFilesPerBatch: DEFAULT_REVIEW_BUDGET.maxFilesPerBatch,
} as const;

export interface ReviewBatch {
  files: ReviewableFile[];
  characterCount: number;
}

export function budgetFromLegacyLimits(limits: typeof REVIEW_LIMITS): ReviewBudget {
  return {
    maxDiffCharacters: limits.maxDiffSize,
    maxFileCharacters: limits.maxFileSize,
    maxFilesPerBatch: limits.maxFilesPerBatch,
    reservedPromptCharacters: 0,
    reservedResponseCharacters: 0,
  };
}

export function getUsableDiffCharacters(budget: ReviewBudget): number {
  const diffBudget =
    budget.maxDiffCharacters - budget.reservedPromptCharacters - budget.reservedResponseCharacters;
  const promptBudget =
    (budget.maxPromptCharacters ?? DEFAULT_MAX_PROMPT_CHARACTERS) -
    SYSTEM_PROMPT_CHARACTER_RESERVE -
    (budget.maxMetadataCharacters ?? DEFAULT_MAX_METADATA_CHARACTERS) -
    (budget.maxGuidanceCharacters ?? DEFAULT_MAX_GUIDANCE_CHARACTERS) -
    budget.reservedResponseCharacters;
  const usable = Math.min(diffBudget, promptBudget);
  if (usable <= 0) throw new Error('Review budget must reserve less context than its maximum.');
  return usable;
}

export function createBatches(
  files: ReviewableFile[],
  limits: ReviewBudget | typeof REVIEW_LIMITS = DEFAULT_REVIEW_BUDGET,
): { batches: ReviewBatch[]; skipped: SkippedFile[] } {
  const budget =
    'maxDiffCharacters' in limits
      ? limits
      : {
          maxDiffCharacters: limits.maxDiffSize,
          maxFileCharacters: limits.maxFileSize,
          maxFilesPerBatch: limits.maxFilesPerBatch,
          reservedPromptCharacters: 0,
          reservedResponseCharacters: 0,
        };
  const maxDiffCharacters = getUsableDiffCharacters(budget);
  const batches: ReviewBatch[] = [];
  const skipped: SkippedFile[] = [];
  let current: ReviewBatch = { files: [], characterCount: 0 };

  for (const file of files) {
    if (file.patch.length > budget.maxFileCharacters) {
      skipped.push({
        path: file.path,
        reason: `patch exceeds ${budget.maxFileCharacters} characters`,
      });
      continue;
    }

    if (file.patch.length > maxDiffCharacters) {
      skipped.push({
        path: file.path,
        reason: `patch exceeds ${maxDiffCharacters} character batch limit`,
      });
      continue;
    }

    const wouldExceedSize = current.characterCount + file.patch.length > maxDiffCharacters;
    const wouldExceedFiles = current.files.length >= budget.maxFilesPerBatch;
    if (current.files.length > 0 && (wouldExceedSize || wouldExceedFiles)) {
      batches.push(current);
      current = { files: [], characterCount: 0 };
    }

    current.files.push(file);
    current.characterCount += file.patch.length;
  }

  if (current.files.length > 0) batches.push(current);
  return { batches, skipped };
}
