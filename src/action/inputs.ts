import type { Severity } from '../types.js';
import type { ReviewCommandOptions } from '../cli/commands/review.js';
import type { PullRequestEvent } from './event.js';

const severities: Severity[] = ['low', 'medium', 'high', 'critical'];

export interface ActionInputs {
  githubToken: string;
  openAiApiKey: string;
  model?: string;
  minSeverity?: Severity;
}

export interface ActionEnvironment {
  GITHUB_TOKEN?: string;
  OPENAI_API_KEY?: string;
  ACTION_MODEL?: string;
  ACTION_MIN_SEVERITY?: string;
}

export function parseActionInputs(environment: ActionEnvironment): ActionInputs {
  const githubToken = environment.GITHUB_TOKEN?.trim();
  const openAiApiKey = environment.OPENAI_API_KEY?.trim();
  if (!githubToken) throw new Error('GITHUB_TOKEN is required for the GitHub Action.');
  if (!openAiApiKey) throw new Error('OPENAI_API_KEY is required for the GitHub Action.');

  const model = environment.ACTION_MODEL?.trim() || undefined;
  const rawSeverity = environment.ACTION_MIN_SEVERITY?.trim() || undefined;
  if (rawSeverity && !severities.includes(rawSeverity as Severity)) {
    throw new Error(
      `Unsupported Action severity '${rawSeverity}'. Choose low, medium, high, or critical.`,
    );
  }

  return {
    githubToken,
    openAiApiKey,
    model,
    minSeverity: rawSeverity as Severity | undefined,
  };
}

export function buildActionReviewOptions(
  event: PullRequestEvent,
  inputs: Pick<ActionInputs, 'model' | 'minSeverity'>,
): ReviewCommandOptions {
  return {
    url: event.url,
    model: inputs.model,
    minSeverity: inputs.minSeverity,
  };
}

export function redactSecrets(value: string, secrets: string[]): string {
  return secrets
    .filter(Boolean)
    .reduce((redacted, secret) => redacted.split(secret).join('[REDACTED]'), value);
}
