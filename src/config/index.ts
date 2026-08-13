import 'dotenv/config';
import process from 'node:process';

import { z } from 'zod';

const envSchema = z.object({
  GITHUB_TOKEN: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
});

export interface AppConfig {
  githubToken?: string;
  openaiApiKey?: string;
}

export function loadConfig(env: typeof process.env = process.env): AppConfig {
  const parsed = envSchema.parse({
    GITHUB_TOKEN: env.GITHUB_TOKEN || undefined,
    OPENAI_API_KEY: env.OPENAI_API_KEY || undefined,
  });

  return {
    githubToken: parsed.GITHUB_TOKEN,
    openaiApiKey: parsed.OPENAI_API_KEY,
  };
}

export function requireOpenAiKey(config: AppConfig): string {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is required to run an AI review. Set it in the environment or .env.');
  }

  return config.openaiApiKey;
}
