import OpenAI from 'openai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OpenAiReviewProvider } from '../src/ai/client.js';
import { pullRequestFixture } from './fixtures.js';

const input = {
  pullRequest: pullRequestFixture,
  batch: { files: pullRequestFixture.files.slice(0, 1), characterCount: 100 },
};
const completion = {
  id: 'completion-test',
  model: 'gpt-4o-mini',
  choices: [
    {
      finish_reason: 'stop',
      message: { content: JSON.stringify({ summary: 'ok', riskLevel: 'low', findings: [] }) },
    },
  ],
};

function rateLimit(headers: Record<string, string> = {}): globalThis.Response {
  return globalThis.Response.json({ error: { message: 'limited' } }, { status: 429, headers });
}

describe('OpenAI SDK HTTP boundary', () => {
  afterEach(() => vi.useRealTimers());

  it('makes only three HTTP requests for continuous 429s, even with SDK retries configured', async () => {
    const fetch = vi.fn().mockImplementation(async () => rateLimit());
    const client = new OpenAI({ apiKey: 'test-key', maxRetries: 2, fetch });
    const provider = new OpenAiReviewProvider('test-key', undefined, client, {
      backoffMs: () => 0,
    });
    await expect(provider.review(input)).rejects.toThrow(/rate limit/);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('sends a finite output cap and exposes only actual provider usage when present', async () => {
    const usage = { prompt_tokens: 123, completion_tokens: 45, total_tokens: 168 };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(globalThis.Response.json({ ...completion, usage }))
      .mockResolvedValueOnce(globalThis.Response.json(completion));
    const client = new OpenAI({ apiKey: 'test-key', fetch });
    const onUsage = vi.fn();
    const provider = new OpenAiReviewProvider('test-key', undefined, client, { onUsage });
    await provider.review(input);
    await provider.review(input);
    const request = JSON.parse(fetch.mock.calls[0][1].body);
    expect(request).toMatchObject({ model: 'gpt-4o-mini', max_completion_tokens: 4096 });
    expect(request.messages[0].role).toBe('system');
    expect(request.messages[1].role).toBe('user');
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(usage);
  });

  it.each([
    ['retry-after-ms', '250', 250],
    ['retry-after', '2', 2000],
    ['retry-after', 'Tue, 17 Nov 2026 00:00:03 GMT', 3000],
    ['retry-after-ms', '0', 0],
  ])('honors %s: %s before the next HTTP request', async (header, value, delay) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17T00:00:00Z'));
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(rateLimit({ [header]: value }))
      .mockResolvedValueOnce(globalThis.Response.json(completion));
    const client = new OpenAI({ apiKey: 'test-key', fetch });
    const result = new OpenAiReviewProvider('test-key', undefined, client).review(input);
    if (delay > 0) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(fetch).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
    } else {
      await vi.advanceTimersByTimeAsync(0);
    }
    await expect(result).resolves.toMatchObject({ riskLevel: 'low' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([{ 'x-should-retry': 'false' }, { 'retry-after': '120' }])(
    'does not retry early when the provider prevents immediate retries: %j',
    async (headers) => {
      const fetch = vi.fn().mockImplementation(async () => rateLimit(headers));
      const client = new OpenAI({ apiKey: 'test-key', fetch });
      await expect(
        new OpenAiReviewProvider('test-key', undefined, client, { backoffMs: () => 0 }).review(
          input,
        ),
      ).rejects.toThrow(/rate limit|retry delay/);
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it('applies the default 60 second request timeout to an injected SDK client', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(
      async (_url, options: NonNullable<Parameters<typeof globalThis.fetch>[1]>) =>
        new Promise<globalThis.Response>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const client = new OpenAI({ apiKey: 'test-key', fetch, timeout: 600_000 });
    const result = new OpenAiReviewProvider('test-key', undefined, client, {
      maxRetries: 0,
    }).review(input);
    const rejected = expect(result).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
  });

  it('allows explicit request bounds without changing the default model', async () => {
    const fetch = vi.fn().mockResolvedValue(globalThis.Response.json(completion));
    const client = new OpenAI({ apiKey: 'test-key', fetch });
    await new OpenAiReviewProvider('test-key', undefined, client, {
      timeoutMs: 5000,
      maxCompletionTokens: 512,
    }).review(input);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      model: 'gpt-4o-mini',
      max_completion_tokens: 512,
    });
  });
});
