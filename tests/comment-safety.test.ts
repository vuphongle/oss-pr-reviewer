import { describe, expect, it } from 'vitest';

import {
  MAX_REVIEW_COMMENT_CHARACTERS,
  prepareReviewComment,
} from '../src/github/comment-safety.js';

describe('PR comment safety', () => {
  it('keeps normal reports unchanged apart from the stable marker wrapper', () => {
    expect(prepareReviewComment('## Summary\nNo findings.')).toEqual({
      body: '<!-- oss-pr-reviewer -->\n\n## Summary\nNo findings.',
      truncated: false,
    });
  });

  it('neutralizes mention-like text without changing the review meaning', () => {
    const result = prepareReviewComment('Contact @maintainer about `@org/team`.');
    expect(result.body).toContain('@​maintainer');
    expect(result.body).toContain('@​org/team');
  });

  it('retains the report header and highest-priority sections within the limit', () => {
    const critical = '### CRITICAL - Security\n\nCritical evidence '.repeat(1000);
    const low = '### LOW - Maintainability\n\nLow detail '.repeat(1000);
    const result = prepareReviewComment(
      `# PR Review Report\n\n## Risk\nCritical\n\n${critical}\n${low}`,
    );

    expect(result.truncated).toBe(true);
    expect(result.body.length).toBeLessThanOrEqual(MAX_REVIEW_COMMENT_CHARACTERS);
    expect(result.body).toContain('CRITICAL');
    expect(result.body).toContain('shortened because the complete review exceeded');
  });
});
