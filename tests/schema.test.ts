import { describe, expect, it } from 'vitest';

import { parseJsonReviewResponse, parseReviewResult } from '../src/review/schema.js';
import { resultFixture } from './fixtures.js';

describe('review response schema', () => {
  it('accepts a valid response', () =>
    expect(parseReviewResult(resultFixture())).toEqual(resultFixture()));
  it('rejects malformed JSON', () =>
    expect(() => parseJsonReviewResponse('{')).toThrow(/valid JSON/));
  it('rejects missing properties', () =>
    expect(() => parseReviewResult({ findings: [] })).toThrow(/schema validation/));
  it('rejects invalid severity and risk values', () =>
    expect(() => parseReviewResult({ ...resultFixture(), riskLevel: 'urgent' })).toThrow(
      /schema validation/,
    ));
});
