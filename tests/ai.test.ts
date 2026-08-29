import { describe, expect, it, vi } from 'vitest';

import OpenAI from 'openai';

import { OpenAiReviewProvider } from '../src/ai/client.js';
import { pullRequestFixture } from './fixtures.js';
import type { ReviewBatch } from '../src/review/batching.js';

const batch: ReviewBatch = {
  files: [
    { path: 'src/a.ts', status: 'modified', additions: 1, deletions: 0, patch: '+return true;' },
  ],
  characterCount: 13,
};

describe('OpenAI provider boundary', () => {
  it('parses a valid structured response', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: 'Looks risky.',
              riskLevel: 'medium',
              findings: [],
            }),
          },
        },
      ],
    });
    const client = { chat: { completions: { create } } } as unknown as OpenAI;
    const result = await new OpenAiReviewProvider('test-key', 'test-model', client).review({
      pullRequest: pullRequestFixture,
      batch,
    });
    expect(result.riskLevel).toBe('medium');
    expect(create).toHaveBeenCalledOnce();
  });
  it('rejects malformed structured responses', async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'not json' } }] }),
        },
      },
    } as unknown as OpenAI;
    await expect(
      new OpenAiReviewProvider('test-key', 'test-model', client).review({
        pullRequest: pullRequestFixture,
        batch,
      }),
    ).rejects.toThrow(/valid JSON/);
  });
  it('normalizes API failures without exposing the key', async () => {
    const client = {
      chat: {
        completions: { create: vi.fn().mockRejectedValue({ status: 429, message: 'limit' }) },
      },
    } as unknown as OpenAI;
    await expect(
      new OpenAiReviewProvider('secret-key', 'test-model', client, { maxRetries: 0 }).review({
        pullRequest: pullRequestFixture,
        batch,
      }),
    ).rejects.toThrow(/rate limit/);
  });

  describe('retry behaviour', () => {
    it('retries 429 responses up to the configured limit', async () => {
      const create = vi
        .fn()
        .mockRejectedValueOnce({ status: 429, message: 'limit' })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: JSON.stringify({ summary: 'ok', riskLevel: 'low', findings: [] }),
              },
            },
          ],
        });
      const client = {
        chat: { completions: { create } },
      } as unknown as OpenAI;
      const result = await new OpenAiReviewProvider('test-key', 'test-model', client, {
        maxRetries: 2,
        backoffMs: () => 0,
      }).review({ pullRequest: pullRequestFixture, batch });
      expect(create).toHaveBeenCalledTimes(2);
      expect(result.riskLevel).toBe('low');
    });

    it('retries 5xx responses up to the configured limit', async () => {
      const create = vi
        .fn()
        .mockRejectedValueOnce({ status: 503, message: 'unavailable' })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: JSON.stringify({ summary: 'ok', riskLevel: 'low', findings: [] }),
              },
            },
          ],
        });
      const client = {
        chat: { completions: { create } },
      } as unknown as OpenAI;
      await new OpenAiReviewProvider('test-key', 'test-model', client, {
        maxRetries: 2,
        backoffMs: () => 0,
      }).review({ pullRequest: pullRequestFixture, batch });
      expect(create).toHaveBeenCalledTimes(2);
    });

    it('does not retry 4xx responses other than 429', async () => {
      const create = vi.fn().mockRejectedValue({ status: 401, message: 'auth' });
      const client = {
        chat: { completions: { create } },
      } as unknown as OpenAI;
      await expect(
        new OpenAiReviewProvider('test-key', 'test-model', client, {
          maxRetries: 3,
          backoffMs: () => 0,
        }).review({ pullRequest: pullRequestFixture, batch }),
      ).rejects.toThrow(/authentication/);
      expect(create).toHaveBeenCalledOnce();
    });

    it('throws after exhausting retries', async () => {
      const create = vi.fn().mockRejectedValue({ status: 429, message: 'limit' });
      const client = {
        chat: { completions: { create } },
      } as unknown as OpenAI;
      await expect(
        new OpenAiReviewProvider('test-key', 'test-model', client, {
          maxRetries: 2,
          backoffMs: () => 0,
        }).review({ pullRequest: pullRequestFixture, batch }),
      ).rejects.toThrow(/rate limit/);
      expect(create).toHaveBeenCalledTimes(3);
    });

    it('uses the supplied backoff scheduler between attempts', async () => {
      const create = vi
        .fn()
        .mockRejectedValueOnce({ status: 429, message: 'limit' })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: JSON.stringify({ summary: 'ok', riskLevel: 'low', findings: [] }),
              },
            },
          ],
        });
      const client = {
        chat: { completions: { create } },
      } as unknown as OpenAI;
      const backoffMs = vi.fn().mockReturnValue(0);
      await new OpenAiReviewProvider('test-key', 'test-model', client, {
        maxRetries: 1,
        backoffMs,
      }).review({ pullRequest: pullRequestFixture, batch });
      expect(backoffMs).toHaveBeenCalledWith(1, expect.objectContaining({ status: 429 }));
    });
  });
});
