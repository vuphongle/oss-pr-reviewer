import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import picomatch from 'picomatch';

import type { Severity } from '../types.js';
import type { RepositoryReference } from '../github/types.js';
import type { ReviewBudget } from '../review/batching.js';

export const MAX_RULE_DESCRIPTION_CHARACTERS = 4_000;
export const MAX_TOTAL_RULE_CHARACTERS = 20_000;

const repositoryConfigSchema = z
  .object({
    version: z.literal(1),
    review: z
      .object({
        minSeverity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      })
      .default({}),
    rules: z
      .array(
        z.object({
          id: z
            .string()
            .trim()
            .max(128)
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          description: z.string().trim().min(1).max(MAX_RULE_DESCRIPTION_CHARACTERS),
        }),
      )
      .max(100)
      .superRefine((rules, context) => {
        const totalCharacters =
          rules.reduce((total, rule) => total + `RULE ${rule.id}: ${rule.description}`.length, 0) +
          Math.max(0, rules.length - 1);
        if (totalCharacters > MAX_TOTAL_RULE_CHARACTERS) {
          context.addIssue({
            code: z.ZodIssueCode.too_big,
            maximum: MAX_TOTAL_RULE_CHARACTERS,
            type: 'string',
            inclusive: true,
            message: `combined rendered rule guidance must be at most ${MAX_TOTAL_RULE_CHARACTERS} characters`,
          });
        }
      })
      .default([]),
    ignore: z
      .object({
        paths: z
          .array(z.string().trim().min(1).refine(isValidGlob, 'must be a valid glob pattern'))
          .default([]),
      })
      .default({}),
    context: z
      .object({
        maxFilesPerBatch: z.number().int().positive().max(100).optional(),
        maxDiffCharacters: z.number().int().positive().max(500_000).optional(),
        maxFileCharacters: z.number().int().positive().max(200_000).optional(),
        reservedPromptCharacters: z.number().int().nonnegative().max(100_000).optional(),
        reservedResponseCharacters: z.number().int().nonnegative().max(100_000).optional(),
        maxPromptCharacters: z.number().int().positive().max(500_000).optional(),
        maxMetadataCharacters: z.number().int().positive().max(100_000).optional(),
        maxGuidanceCharacters: z.number().int().positive().max(100_000).optional(),
      })
      .default({}),
  })
  .strict();

export type RepositoryConfig = z.infer<typeof repositoryConfigSchema>;
export type ReviewRule = RepositoryConfig['rules'][number];

export interface RepositoryFileReader {
  getFileAtRef(
    reference: RepositoryReference,
    path: string,
    ref: string,
  ): Promise<string | undefined>;
}

export interface TrustedConfigReference {
  owner: string;
  repository: string;
  ref: string;
}

export const DEFAULT_REPOSITORY_CONFIG: RepositoryConfig = {
  version: 1,
  review: {},
  rules: [],
  ignore: { paths: [] },
  context: {},
};

export function parseRepositoryConfig(content: string): RepositoryConfig {
  let value: unknown;
  try {
    value = parseYaml(content);
  } catch (error) {
    throw new Error(
      `Repository configuration is invalid: ${error instanceof Error ? error.message : 'invalid YAML'}`,
    );
  }

  const parsed = repositoryConfigSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `Repository configuration is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'} ${issue.message}`).join('; ')}`,
    );
  }
  return parsed.data;
}

export async function loadRepositoryConfig(
  reader: RepositoryFileReader,
  reference: TrustedConfigReference,
): Promise<RepositoryConfig> {
  let content: string | undefined;
  try {
    content = await reader.getFileAtRef(
      { owner: reference.owner, repository: reference.repository },
      '.oss-pr-reviewer.yml',
      reference.ref,
    );
  } catch (error) {
    throw new Error(
      `Could not load repository configuration: ${error instanceof Error ? error.message : 'GitHub API error'}`,
    );
  }

  return content === undefined ? DEFAULT_REPOSITORY_CONFIG : parseRepositoryConfig(content);
}

export function getConfiguredMinimumSeverity(config: RepositoryConfig): Severity {
  return config.review.minSeverity ?? 'low';
}

export function getConfiguredReviewBudget(
  config: RepositoryConfig,
  defaults: ReviewBudget,
): ReviewBudget {
  return { ...defaults, ...config.context };
}

function isValidGlob(pattern: string): boolean {
  try {
    picomatch.makeRe(pattern);
    return true;
  } catch {
    return false;
  }
}
