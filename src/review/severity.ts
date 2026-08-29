import type { ReviewFinding, Severity } from '../types.js';

export const severityOrder: Record<Severity, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function filterFindings(findings: ReviewFinding[], minimum: Severity): ReviewFinding[] {
  return findings.filter((finding) => severityOrder[finding.severity] >= severityOrder[minimum]);
}

export function deduplicateFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = [
      finding.file,
      finding.line ?? '',
      finding.title.toLowerCase(),
      finding.category,
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
