import type { RejectedFinding, ReviewFinding, ReviewableFile } from '../types.js';
import type { ReviewBatch } from './batching.js';

/** Check location evidence only; this does not establish a finding's correctness. */
export function validateFindings(
  findings: ReviewFinding[],
  batch: ReviewBatch,
): { findings: ReviewFinding[]; rejectedFindings: RejectedFinding[] } {
  const accepted: ReviewFinding[] = [];
  const rejectedFindings: RejectedFinding[] = [];
  for (const finding of findings) {
    const file = batch.files.find(
      (candidate) =>
        candidate.path === finding.file ||
        (candidate.status === 'renamed' && candidate.previousPath === finding.file),
    );
    if (!file) {
      rejectedFindings.push({ finding, reason: 'file-not-in-batch' });
    } else {
      const evidence = diffLines(file);
      const isOldPath = finding.file !== file.path;
      const allowsOld = file.status !== 'added';
      const allowsNew = !isOldPath && file.status !== 'removed' && file.status !== 'deleted';
      const onOld = finding.line !== null && allowsOld && evidence.old.has(finding.line);
      const onNew = finding.line !== null && allowsNew && evidence.new.has(finding.line);
      if (
        finding.line !== null &&
        (!Number.isSafeInteger(finding.line) || finding.line < 1 || (!onOld && !onNew))
      ) {
        rejectedFindings.push({ finding, reason: 'line-not-in-diff' });
      } else {
        accepted.push({
          ...finding,
          file: file.path,
          diffSide: finding.line === null ? undefined : onNew ? 'new' : 'old',
        });
      }
    }
  }
  return { findings: accepted, rejectedFindings };
}

function diffLines(file: ReviewableFile): { old: Set<number>; new: Set<number> } {
  const lines = { old: new Set<number>(), new: new Set<number>() };
  let oldLine: number | undefined;
  let newLine: number | undefined;
  for (const line of file.patch.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      continue;
    }
    if (oldLine === undefined || newLine === undefined) continue;
    if (line.startsWith(' ')) {
      if (oldLine > 0) lines.old.add(oldLine);
      if (newLine > 0) lines.new.add(newLine);
      oldLine++;
      newLine++;
    } else if (line.startsWith('-')) {
      if (oldLine > 0) lines.old.add(oldLine);
      oldLine++;
    } else if (line.startsWith('+')) {
      if (newLine > 0) lines.new.add(newLine);
      newLine++;
    } else if (!line.startsWith('\\')) {
      oldLine = undefined;
      newLine = undefined;
    }
  }
  return lines;
}
