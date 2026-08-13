import { z } from 'zod';
import { parse as parseYaml } from 'yaml';

import type { Severity } from '../types.js';
import type { RepositoryReference } from '../github/types.js';

const repositoryConfigSchema = z
  .object({
    version: z.literal(1),
    review: z
      .object({
        minSeverity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      })
      .default({}),
  })
  .strict();

export type RepositoryConfig = z.infer<typeof repositoryConfigSchema>;

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

export const DEFAULT_REPOSITORY_CONFIG: RepositoryConfig = { version: 1, review: {} };

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
