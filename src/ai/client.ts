import OpenAI from 'openai';

import type { PullRequest, ReviewResult } from '../types.js';
import type { ReviewBatch } from '../review/batching.js';
import type { ReviewBudget } from '../review/batching.js';
import { buildReviewPrompt, REVIEW_SYSTEM_PROMPT } from '../review/prompt.js';
import { parseJsonReviewResponse } from '../review/schema.js';
import type { ReviewProvider } from './provider.js';

export interface OpenAiReviewOptions {
  maxRetries?: number;
  backoffMs?: (attempt: number, error: unknown) => number;
  timeoutMs?: number;
  maxCompletionTokens?: number;
  onUsage?: (usage: OpenAI.Completions.CompletionUsage) => void;
}

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_COMPLETION_TOKENS = 4_096;
const MAX_RETRY_DELAY_MS = 60_000;

export class OpenAiReviewProvider implements ReviewProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly backoffMs: (attempt: number, error: unknown) => number;
  private readonly timeoutMs: number;
  private readonly maxCompletionTokens: number;
  private readonly onUsage?: OpenAiReviewOptions['onUsage'];

  constructor(
    apiKey: string,
    model = 'gpt-4o-mini',
    client?: OpenAI,
    options: OpenAiReviewOptions = {},
  ) {
    this.client = client ?? new OpenAI({ apiKey, maxRetries: 0 });
    this.model = model;
    this.maxRetries = integerOption('maxRetries', options.maxRetries ?? DEFAULT_MAX_RETRIES, 0);
    this.backoffMs = options.backoffMs ?? exponentialBackoff;
    this.timeoutMs = integerOption('timeoutMs', options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1);
    this.maxCompletionTokens = integerOption(
      'maxCompletionTokens',
      options.maxCompletionTokens ?? DEFAULT_MAX_COMPLETION_TOKENS,
      1,
    );
    this.onUsage = options.onUsage;
  }

  async review(input: {
    pullRequest: PullRequest;
    batch: ReviewBatch;
    reviewRules?: import('../config/repository.js').ReviewRule[];
    reviewBudget?: ReviewBudget;
  }): Promise<ReviewResult> {
    const messages = [
      { role: 'system' as const, content: REVIEW_SYSTEM_PROMPT },
      {
        role: 'user' as const,
        content: buildReviewPrompt(
          input.pullRequest,
          input.batch,
          input.reviewRules,
          input.reviewBudget,
        ),
      },
    ];

    let response;
    try {
      response = await retry(
        this.maxRetries,
        this.backoffMs,
        () =>
          this.client.chat.completions.create(
            {
              model: this.model,
              temperature: 0,
              response_format: { type: 'json_object' },
              max_completion_tokens: this.maxCompletionTokens,
              messages,
            },
            // Override even injected clients so SDK retries cannot multiply our retry limit.
            { maxRetries: 0, timeout: this.timeoutMs },
          ),
        isOpenAiRetryable,
      );
    } catch (error) {
      throw normalizeOpenAiError(error);
    }

    if (response.usage) this.onUsage?.(response.usage);
    const choice = response.choices[0];
    if (choice?.finish_reason === 'length') {
      throw new Error(
        'AI review response exceeded the output token limit. Reduce the batch size or raise maxCompletionTokens.',
      );
    }
    if (choice?.message.refusal || choice?.finish_reason === 'content_filter') {
      throw new Error('AI review response was refused or blocked by the provider.');
    }
    const content = choice?.message.content;
    if (!content?.trim()) throw new Error('AI review response was empty.');
    return parseJsonReviewResponse(content);
  }
}

export function normalizeOpenAiError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith('AI review response')) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError)
    return new Error('OpenAI review request timed out. Retry later or raise timeoutMs.');
  const candidate = (error ?? {}) as {
    status?: number;
    message?: string;
    headers?: globalThis.Headers;
  };
  if ((retryAfterMs(candidate.headers) ?? 0) > MAX_RETRY_DELAY_MS)
    return new Error('OpenAI requested a retry delay longer than 60 seconds. Retry later.');
  if (candidate.status === 401)
    return new Error('OpenAI authentication failed. Check OPENAI_API_KEY.');
  if (candidate.status === 429) return new Error('OpenAI rate limit reached. Retry later.');
  if (typeof candidate.status === 'number' && candidate.status >= 500)
    return new Error('OpenAI service is temporarily unavailable. Retry later.');
  return new Error(
    `OpenAI review request failed${candidate.message ? `: ${candidate.message}` : '.'}`,
  );
}

export async function retry<T>(
  maxRetries: number,
  backoffMs: (attempt: number, error: unknown) => number,
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean = isRetryable,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries || !shouldRetry(error)) throw error;
      await sleep(backoffMs(attempt + 1, error));
    }
  }
  throw lastError;
}

export function isRetryable(error: unknown): boolean {
  const candidate = (error ?? {}) as { status?: number };
  return (
    candidate.status === 429 || (typeof candidate.status === 'number' && candidate.status >= 500)
  );
}

function isOpenAiRetryable(error: unknown): boolean {
  const candidate = (error ?? {}) as { status?: number; headers?: globalThis.Headers };
  if (candidate.headers?.get('x-should-retry') === 'false') return false;
  // A longer server delay is surfaced to the caller instead of retrying before it expires.
  if ((retryAfterMs(candidate.headers) ?? 0) > MAX_RETRY_DELAY_MS) return false;
  return (
    candidate.headers?.get('x-should-retry') === 'true' ||
    error instanceof OpenAI.APIConnectionError ||
    candidate.status === 408 ||
    candidate.status === 409 ||
    isRetryable(error)
  );
}

function exponentialBackoff(attempt: number, error: unknown): number {
  const candidate = (error ?? {}) as { headers?: globalThis.Headers };
  return retryAfterMs(candidate.headers) ?? Math.min(1000 * 2 ** (attempt - 1), 8000);
}

function retryAfterMs(headers?: globalThis.Headers): number | undefined {
  const milliseconds = headers?.get('retry-after-ms');
  if (milliseconds?.trim()) {
    const delay = Number(milliseconds);
    if (Number.isFinite(delay) && delay >= 0) return delay;
  }
  const retryAfter = headers?.get('retry-after');
  if (!retryAfter?.trim()) return undefined;
  const seconds = Number(retryAfter);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined;
}

function integerOption(name: string, value: number, minimum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`OpenAI ${name} must be an integer of at least ${minimum}.`);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
