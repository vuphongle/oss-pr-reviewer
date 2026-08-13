import { describe, expect, it } from 'vitest';

import { renderMarkdown } from '../src/report/markdown.js';
import { findingFixture, pullRequestFixture, resultFixture } from './fixtures.js';

describe('Markdown report', () => {
  it('renders an empty report with disclaimer and statistics', () => {
    const report = renderMarkdown({
      pullRequest: pullRequestFixture,
      result: resultFixture({ findings: [], riskLevel: 'low' }),
      skippedFiles: [],
      reviewedFileCount: 2,
      changedFileCount: 2,
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
      ignoredFileCount: 0,
      batchCount: 1,
    });
    expect(report).toContain('HIGH - Security');
    expect(report).toContain('Line: 11');
    expect(report).toContain('`logo.png`: binary');
    expect(report).toContain('Medium: 1');
    expect(report).toContain('Files ignored: 0');
  });
});
