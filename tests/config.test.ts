import process from 'node:process';

import { describe, expect, it, vi } from 'vitest';

import { loadRepositoryConfig, parseRepositoryConfig } from '../src/config/repository.js';
import { executeReview, resolveMinimumSeverity } from '../src/cli/commands/review.js';
import { pullRequestFixture, resultFixture } from './fixtures.js';

describe('repository configuration', () => {
  it('parses a versioned minimum severity configuration', () => {
    expect(
      parseRepositoryConfig(
        'version: 1\nreview:\n  minSeverity: medium\nrules:\n  - id: require-tests\n    description: Changes need tests.\nignore:\n  paths:\n    - docs/**\n',
      ),
    ).toEqual({
      version: 1,
      review: { minSeverity: 'medium' },
      rules: [{ id: 'require-tests', description: 'Changes need tests.' }],
      ignore: { paths: ['docs/**'] },
      context: {},
    });
  });

  it('rejects unsupported versions and invalid severities', () => {
    expect(() => parseRepositoryConfig('version: 2')).toThrow(/version/);
    expect(() => parseRepositoryConfig('version: 1\nreview:\n  minSeverity: urgent')).toThrow(
      /minSeverity/,
    );
  });

  it('rejects unknown configuration keys', () => {
    expect(() => parseRepositoryConfig('version: 1\nunsupported: true')).toThrow(/unsupported/);
  });

  it.each([
    {
      object: 'review',
      content: 'version: 1\nreview:\n  minSeverty: high',
      error: /review .*minSeverty/,
    },
    {
      object: 'ignore',
      content: 'version: 1\nignore:\n  path: [private/**]',
      error: /ignore .*path/,
    },
    {
      object: 'context',
      content: 'version: 1\ncontext:\n  maxFilesPerBach: 10',
      error: /context .*maxFilesPerBach/,
    },
    {
      object: 'rule entry',
      content:
        'version: 1\nrules:\n  - id: require-tests\n    description: Changes need tests.\n    descriptin: Misspelled guidance.',
      error: /rules\.0 .*descriptin/,
    },
  ])('rejects misspelled keys in $object with their object path', ({ content, error }) => {
    expect(() => parseRepositoryConfig(content)).toThrow(error);
  });

  it('rejects malformed custom rules and ignore paths', () => {
    expect(() =>
      parseRepositoryConfig('version: 1\nrules:\n  - id: bad id\n    description: ok'),
    ).toThrow(/rules/);
    expect(() => parseRepositoryConfig('version: 1\nignore:\n  paths: [123]')).toThrow(/paths/);
  });

  it('rejects oversized individual and aggregate rule guidance', () => {
    expect(() =>
      parseRepositoryConfig(
        `version: 1\nrules:\n  - id: too-long\n    description: ${'x'.repeat(4_001)}`,
      ),
    ).toThrow(/rules/);
    expect(() =>
      parseRepositoryConfig(
        `version: 1\nrules:\n${Array.from({ length: 6 }, (_, index) => `  - id: rule-${index}\n    description: ${'x'.repeat(4_000)}`).join('\n')}`,
      ),
    ).toThrow(/combined rendered rule guidance/);
  });

  it('uses defaults when the trusted base branch has no config file', async () => {
    const reader = { getFileAtRef: vi.fn().mockResolvedValue(undefined) };
    await expect(
      loadRepositoryConfig(reader, { owner: 'octo', repository: 'project', ref: 'base-sha' }),
    ).resolves.toEqual({ version: 1, review: {}, rules: [], ignore: { paths: [] }, context: {} });
    expect(reader.getFileAtRef).toHaveBeenCalledWith(
      { owner: 'octo', repository: 'project' },
      '.oss-pr-reviewer.yml',
      'base-sha',
    );
  });

  it('loads config from the supplied trusted ref', async () => {
    const reader = {
      getFileAtRef: vi.fn().mockResolvedValue('version: 1\nreview:\n  minSeverity: high'),
    };
    await expect(
      loadRepositoryConfig(reader, { owner: 'octo', repository: 'project', ref: 'base-sha' }),
    ).resolves.toEqual({
      version: 1,
      review: { minSeverity: 'high' },
      rules: [],
      ignore: { paths: [] },
      context: {},
    });
  });

  it('does not silently accept invalid trusted configuration', async () => {
    const reader = { getFileAtRef: vi.fn().mockResolvedValue('version: 1\nreview: [invalid]') };
    await expect(
      loadRepositoryConfig(reader, { owner: 'octo', repository: 'project', ref: 'base-sha' }),
    ).rejects.toThrow(/configuration/);
  });

  it('rejects a misspelled trusted ignore key before invoking the provider', async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';
    const review = vi.fn().mockResolvedValue(resultFixture());
    const github = {
      getPullRequest: vi.fn().mockResolvedValue(pullRequestFixture),
      getFileAtRef: vi.fn().mockResolvedValue('version: 1\nignore:\n  path: [private/**]'),
    };
    try {
      await expect(
        executeReview({ repo: 'example/project', pr: '12', github, provider: { review } }),
      ).rejects.toThrow(/ignore .*path/);
      expect(review).not.toHaveBeenCalled();
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });

  it('gives an explicit CLI value precedence over repository configuration', () => {
    expect(
      resolveMinimumSeverity('critical', { version: 1, review: { minSeverity: 'medium' } }),
    ).toBe('critical');
    expect(
      resolveMinimumSeverity(undefined, { version: 1, review: { minSeverity: 'medium' } }),
    ).toBe('medium');
    expect(resolveMinimumSeverity(undefined, { version: 1, review: {} })).toBe('low');
  });

  it('validates and exposes context budget overrides', () => {
    const config = parseRepositoryConfig(
      'version: 1\ncontext:\n  maxFilesPerBatch: 10\n  reservedResponseCharacters: 15000',
    );
    expect(config.context).toEqual({ maxFilesPerBatch: 10, reservedResponseCharacters: 15000 });
  });

  it('validates total prompt and separate metadata/guidance caps', () => {
    const config = parseRepositoryConfig(
      'version: 1\ncontext:\n  maxPromptCharacters: 90000\n  maxMetadataCharacters: 12000\n  maxGuidanceCharacters: 16000',
    );
    expect(config.context).toEqual({
      maxPromptCharacters: 90000,
      maxMetadataCharacters: 12000,
      maxGuidanceCharacters: 16000,
    });
  });
});
