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
}

const DEFAULT_MAX_RETRIES = 2;

export class OpenAiReviewProvider implements ReviewProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly backoffMs: (attempt: number, error: unknown) => number;

  constructor(
    apiKey: string,
    model = 'gpt-4o-mini',
    client?: OpenAI,
    options: OpenAiReviewOptions = {},
  ) {
    this.client = client ?? new OpenAI({ apiKey });
    this.model = model;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffMs = options.backoffMs ?? exponentialBackoff;
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
      response = await retry(this.maxRetries, this.backoffMs, () =>
        this.client.chat.completions.create({
          model: this.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages,
        }),
      );
    } catch (error) {
      throw normalizeOpenAiError(error);
    }

    const content = response.choices[0]?.message.content;
    if (!content) throw new Error('AI review response was empty.');
    return parseJsonReviewResponse(content);
  }
}

export function normalizeOpenAiError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith('AI review response')) return error;
  const candidate = error as { status?: number; message?: string };
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
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries || !isRetryable(error)) throw error;
      await sleep(backoffMs(attempt + 1, error));
    }
  }
  throw lastError;
}

export function isRetryable(error: unknown): boolean {
  const candidate = error as { status?: number };
  return candidate.status === 429 || (typeof candidate.status === 'number' && candidate.status >= 500);
}

function exponentialBackoff(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), 8000);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
