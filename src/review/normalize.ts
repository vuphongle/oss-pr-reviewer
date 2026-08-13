import type { ChangedFile, NormalizedFiles, ReviewableFile, SkippedFile } from '../types.js';

const binaryExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.woff', '.woff2']);

export function normalizeFiles(files: ChangedFile[]): NormalizedFiles {
  const reviewable: ReviewableFile[] = [];
  const skipped: SkippedFile[] = [];

  for (const file of files) {
    const extension = file.path.includes('.') ? `.${file.path.split('.').pop()!.toLowerCase()}` : '';
    if (binaryExtensions.has(extension)) {
      skipped.push({ path: file.path, reason: 'binary or generated asset' });
      continue;
    }
    if (!file.patch) {
      skipped.push({ path: file.path, reason: file.status === 'deleted' ? 'deleted file has no patch' : 'GitHub did not provide a patch' });
      continue;
    }
    reviewable.push({
      path: file.path,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch,
      previousPath: file.previousPath,
    });
  }

  return { reviewable, skipped };
}
