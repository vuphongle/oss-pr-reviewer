import type { ReviewFinding, ReviewReportData, Severity } from '../types.js';

export function renderMarkdown(data: ReviewReportData): string {
  const { pullRequest, result, skippedFiles } = data;
  const counts = countFindings(result.findings);
  const findings = result.findings.length === 0 ? 'No significant issues were identified in the reviewed diff.' : result.findings.map(renderFinding).join('\n\n');
  const skipped = skippedFiles.length === 0 ? '- None' : skippedFiles.map((file) => `- \`${file.path}\`: ${file.reason}`).join('\n');

  return `# PR Review Report

## Pull Request

- Repository: ${pullRequest.owner}/${pullRequest.repository}
- PR: #${pullRequest.number}
- Title: ${pullRequest.title}
- Risk: ${capitalize(result.riskLevel)}

## Summary

${result.summary}

## Findings

${findings}

## Review Statistics

- Files reviewed: ${data.reviewedFileCount}
- Files skipped: ${skippedFiles.length}
- Findings: ${result.findings.length}
- Critical: ${counts.critical}
- High: ${counts.high}
- Medium: ${counts.medium}
- Low: ${counts.low}

## Skipped Files

${skipped}

> Automated AI review assists maintainer review; it does not replace human review, testing, or security auditing. Findings are based only on the supplied pull request context.
`;
}

function renderFinding(finding: ReviewFinding): string {
  return `### ${finding.severity.toUpperCase()} - ${capitalize(finding.category)}

**${finding.title}**

File: \`${finding.file}\`${finding.line ? `\nLine: ${finding.line}` : ''}

${finding.explanation}

**Recommendation**

${finding.recommendation}`;
}

function countFindings(findings: ReviewFinding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>((counts, finding) => {
    counts[finding.severity] += 1;
    return counts;
  }, { critical: 0, high: 0, medium: 0, low: 0 });
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace('-', ' ');
}
