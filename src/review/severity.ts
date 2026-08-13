import type { ReviewFinding, Severity } from '../types.js';

export const severityOrder: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

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
