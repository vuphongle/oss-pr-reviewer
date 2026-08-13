import type { ReviewableFile, SkippedFile } from '../types.js';

export const REVIEW_LIMITS = {
  maxDiffSize: 60_000,
  maxFileSize: 30_000,
  maxFilesPerBatch: 8,
} as const;

export interface ReviewBatch {
  files: ReviewableFile[];
  characterCount: number;
}

export function createBatches(
  files: ReviewableFile[],
  limits: typeof REVIEW_LIMITS = REVIEW_LIMITS,
): { batches: ReviewBatch[]; skipped: SkippedFile[] } {
  const batches: ReviewBatch[] = [];
  const skipped: SkippedFile[] = [];
  let current: ReviewBatch = { files: [], characterCount: 0 };

  for (const file of files) {
    if (file.patch.length > limits.maxFileSize) {
      skipped.push({ path: file.path, reason: `patch exceeds ${limits.maxFileSize} characters` });
      continue;
    }

    const wouldExceedSize = current.characterCount + file.patch.length > limits.maxDiffSize;
    const wouldExceedFiles = current.files.length >= limits.maxFilesPerBatch;
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
