import type { ReviewFinding, ReviewReportData, Severity } from '../types.js';

export function renderMarkdown(data: ReviewReportData): string {
  const { pullRequest, result, skippedFiles } = data;
  const counts = countFindings(result.findings);
  const findings =
    result.findings.length === 0
      ? data.rejectedFindings?.length
        ? 'No findings with supported locations remain. Provider findings were rejected; maintainer review is required.'
        : 'No significant issues were identified in the reviewed diff.'
      : result.findings.map(renderFinding).join('\n\n');
  const skipped =
    skippedFiles.length === 0
      ? '- None'
      : skippedFiles.map((file) => `- \`${file.path}\`: ${file.reason}`).join('\n');
  const completenessWarning =
    data.fileListStatus === 'incomplete'
      ? `\n> [!WARNING]\n> GitHub returned ${pullRequest.files.length} of ${data.changedFileCount} changed files. This review is incomplete: ${data.truncatedFileCount} files were unavailable and are not included in the skipped-files list.\n`
      : '';

  const rejected = data.rejectedFindings ?? [];
  const rejectionNotice = rejected.length
    ? `\n> [!WARNING]\n> ${rejected.length} provider finding(s) were excluded because their locations could not be supported by the supplied batch. Location checks do not verify the correctness of retained findings.\n\n## Rejected Findings\n\n${rejected.map(({ finding, reason }) => `- \`${finding.file}\`${finding.line === null ? '' : `:${finding.line}`}: ${reason}`).join('\n')}\n`
    : '';

  return `# PR Review Report

## Pull Request

- Repository: ${pullRequest.owner}/${pullRequest.repository}
- PR: #${pullRequest.number}
- Title: ${pullRequest.title}
- Reviewed head: \`${pullRequest.headSha}\`
- Risk: ${capitalize(result.riskLevel)}
- File list: ${capitalize(data.fileListStatus)}
${completenessWarning}

## Summary

${result.summary}

## Findings

${findings}

## Review Statistics

- Files reviewed: ${data.reviewedFileCount}
- Files changed: ${data.changedFileCount}
- Files unavailable: ${data.truncatedFileCount}
- Files ignored: ${data.ignoredFileCount}
- Files skipped: ${skippedFiles.length}
- Review batches: ${data.batchCount}
- Findings: ${result.findings.length}
- Rejected findings: ${rejected.length}
- Critical: ${counts.critical}
- High: ${counts.high}
- Medium: ${counts.medium}
- Low: ${counts.low}

## Skipped Files

${skipped}
${rejectionNotice}
> Automated AI review assists maintainer review; it does not replace human review, testing, or security auditing. Findings are based only on the supplied pull request context.
`;
}

function renderFinding(finding: ReviewFinding): string {
  return `### ${finding.severity.toUpperCase()} - ${capitalize(finding.category)}

**${finding.title}**

File: \`${finding.file}\`${finding.line ? `\nLine: ${finding.line}${finding.diffSide ? ` (${finding.diffSide} diff side)` : ''}` : ''}

${finding.explanation}

**Recommendation**

${finding.recommendation}`;
}

function countFindings(findings: ReviewFinding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>(
    (counts, finding) => {
      counts[finding.severity] += 1;
      return counts;
    },
    { unknown: 0, critical: 0, high: 0, medium: 0, low: 0 },
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace('-', ' ');
}
