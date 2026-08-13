import OpenAI from 'openai';

import type { PullRequest, ReviewResult } from '../types.js';
import type { ReviewBatch } from '../review/batching.js';
import { buildReviewPrompt, REVIEW_SYSTEM_PROMPT } from '../review/prompt.js';
import { parseJsonReviewResponse } from '../review/schema.js';
import type { ReviewProvider } from './provider.js';

export class OpenAiReviewProvider implements ReviewProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model = 'gpt-4o-mini', client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey });
    this.model = model;
  }

  async review(input: { pullRequest: PullRequest; batch: ReviewBatch }): Promise<ReviewResult> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: REVIEW_SYSTEM_PROMPT },
          { role: 'user', content: buildReviewPrompt(input.pullRequest, input.batch) },
        ],
      });
      const content = response.choices[0]?.message.content;
      if (!content) throw new Error('AI review response was empty.');
      return parseJsonReviewResponse(content);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('AI review response')) throw error;
      const candidate = error as { status?: number; message?: string };
      if (candidate.status === 401) throw new Error('OpenAI authentication failed. Check OPENAI_API_KEY.');
      if (candidate.status === 429) throw new Error('OpenAI rate limit reached. Retry later.');
      throw new Error(`OpenAI review request failed${candidate.message ? `: ${candidate.message}` : '.'}`);
    }
  }
}
