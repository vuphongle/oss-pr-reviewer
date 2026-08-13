import picomatch from 'picomatch';

import type { ChangedFile, SkippedFile } from '../types.js';

export interface IgnoredFilesResult {
  files: ChangedFile[];
  skipped: SkippedFile[];
}

export function filterIgnoredFiles(files: ChangedFile[], patterns: string[]): IgnoredFilesResult {
  if (patterns.length === 0) return { files, skipped: [] };
  const isIgnored = picomatch(patterns);
  const kept: ChangedFile[] = [];
  const skipped: SkippedFile[] = [];

  for (const file of files) {
    if (isIgnored(file.path)) {
      skipped.push({ path: file.path, reason: 'ignored by repository configuration' });
    } else {
      kept.push(file);
    }
  }

  return { files: kept, skipped };
}
