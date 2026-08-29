import { describe, expect, it } from 'vitest';

import { renderMarkdown } from '../src/report/markdown.js';
import { renderJson } from '../src/report/json.js';
import { findingFixture, pullRequestFixture, resultFixture } from './fixtures.js';

describe('Markdown report', () => {
  it('renders an empty report with disclaimer and statistics', () => {
    const report = renderMarkdown({
      pullRequest: pullRequestFixture,
      result: resultFixture({ findings: [], riskLevel: 'low' }),
      skippedFiles: [],
      reviewedFileCount: 2,
      changedFileCount: 2,
      fileListStatus: 'complete',
      truncatedFileCount: 0,
      ignoredFileCount: 0,
      batchCount: 1,
    });
    expect(report).toContain('No significant issues');
    expect(report).toContain('Files reviewed: 2');
    expect(report).toContain('Files changed: 2');
    expect(report).toContain('Review batches: 1');
    expect(report).toContain('does not replace human review');
  });
  it('renders finding details and skipped files', () => {
    const report = renderMarkdown({
      pullRequest: pullRequestFixture,
      result: resultFixture({
        findings: [findingFixture(), findingFixture({ severity: 'medium', title: 'Missing test' })],
      }),
      skippedFiles: [{ path: 'logo.png', reason: 'binary' }],
      reviewedFileCount: 1,
      changedFileCount: 2,
      fileListStatus: 'complete',
      truncatedFileCount: 0,
      ignoredFileCount: 0,
      batchCount: 1,
    });
    expect(report).toContain('HIGH - Security');
    expect(report).toContain('Line: 11');
    expect(report).toContain('`logo.png`: binary');
    expect(report).toContain('Medium: 1');
    expect(report).toContain('Files ignored: 0');
  });
  it('renders an unknown risk when no review was performed', () => {
    const report = renderMarkdown({
      pullRequest: pullRequestFixture,
      result: resultFixture({ findings: [], riskLevel: 'unknown' }),
      skippedFiles: [{ path: 'image.png', reason: 'binary asset' }],
      reviewedFileCount: 0,
      changedFileCount: 1,
      fileListStatus: 'complete',
      truncatedFileCount: 0,
      ignoredFileCount: 0,
      batchCount: 0,
    });
    expect(report).toContain('- Risk: Unknown');
    expect(report).toContain('No significant issues');
  });
  it('prominently marks truncated GitHub file lists as incomplete', () => {
    const report = renderMarkdown({
      pullRequest: { ...pullRequestFixture, changedFileCount: 3001 },
      result: resultFixture({ findings: [] }),
      skippedFiles: [],
      reviewedFileCount: 1,
      changedFileCount: 3001,
      fileListStatus: 'incomplete',
      truncatedFileCount: 2998,
      ignoredFileCount: 0,
      batchCount: 1,
    });

    expect(report).toContain('> [!WARNING]');
    expect(report).toContain('GitHub returned 3 of 3001 changed files');
    expect(report).toContain('This review is incomplete');
    expect(report).toContain('Files unavailable: 2998');
    expect(report).toContain('## Skipped Files\n\n- None');
  });
});

describe('JSON report', () => {
  const baseData = {
    pullRequest: pullRequestFixture,
    result: resultFixture({
      findings: [
        findingFixture(),
        findingFixture({ severity: 'medium', title: 'Missing test' }),
      ],
    }),
    skippedFiles: [{ path: 'logo.png', reason: 'binary' }],
    reviewedFileCount: 1,
    changedFileCount: 2,
    fileListStatus: 'complete' as const,
    truncatedFileCount: 0,
    ignoredFileCount: 0,
    batchCount: 1,
  };

  it('serializes the full ReviewReportData shape to pretty JSON', () => {
    const json = renderJson(baseData);
    const parsed = JSON.parse(json) as typeof baseData;
    expect(parsed.pullRequest).toEqual(pullRequestFixture);
    expect(parsed.result.findings).toHaveLength(2);
    expect(parsed.skippedFiles).toEqual([{ path: 'logo.png', reason: 'binary' }]);
    expect(parsed.reviewedFileCount).toBe(1);
    expect(parsed.changedFileCount).toBe(2);
    expect(parsed.fileListStatus).toBe('complete');
    expect(parsed.truncatedFileCount).toBe(0);
    expect(parsed.batchCount).toBe(1);
  });

  it('preserves unknown risk level for empty reviews', () => {
    const json = renderJson({ ...baseData, result: resultFixture({ findings: [], riskLevel: 'unknown' }) });
    expect(JSON.parse(json).result.riskLevel).toBe('unknown');
  });

  it('emits deterministic two-space indentation', () => {
    const json = renderJson(baseData);
    expect(json).toContain('\n  "pullRequest":');
    expect(json.endsWith('\n')).toBe(true);
  });
});
