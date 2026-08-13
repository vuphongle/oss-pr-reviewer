import { describe, expect, it, vi } from 'vitest';

import OpenAI from 'openai';

import { OpenAiReviewProvider } from '../src/ai/client.js';
import { pullRequestFixture } from './fixtures.js';
import type { ReviewBatch } from '../src/review/batching.js';

const batch: ReviewBatch = { files: [{ path: 'src/a.ts', status: 'modified', additions: 1, deletions: 0, patch: '+return true;' }], characterCount: 13 };

describe('OpenAI provider boundary', () => {
  it('parses a valid structured response', async () => {
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ summary: 'Looks risky.', riskLevel: 'medium', findings: [] }) } }] });
    const client = { chat: { completions: { create } } } as unknown as OpenAI;
    const result = await new OpenAiReviewProvider('test-key', 'test-model', client).review({ pullRequest: pullRequestFixture, batch });
    expect(result.riskLevel).toBe('medium');
    expect(create).toHaveBeenCalledOnce();
  });
  it('rejects malformed structured responses', async () => {
    const client = { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'not json' } }] }) } } } as unknown as OpenAI;
    await expect(new OpenAiReviewProvider('test-key', 'test-model', client).review({ pullRequest: pullRequestFixture, batch })).rejects.toThrow(/valid JSON/);
  });
  it('normalizes API failures without exposing the key', async () => {
    const client = { chat: { completions: { create: vi.fn().mockRejectedValue({ status: 429, message: 'limit' }) } } } as unknown as OpenAI;
    await expect(new OpenAiReviewProvider('secret-key', 'test-model', client).review({ pullRequest: pullRequestFixture, batch })).rejects.toThrow(/rate limit/);
  });
});
