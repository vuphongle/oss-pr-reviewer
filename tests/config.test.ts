import { describe, expect, it, vi } from 'vitest';

import { loadRepositoryConfig, parseRepositoryConfig } from '../src/config/repository.js';
import { resolveMinimumSeverity } from '../src/cli/commands/review.js';

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

  it('rejects malformed custom rules and ignore paths', () => {
    expect(() =>
      parseRepositoryConfig('version: 1\nrules:\n  - id: bad id\n    description: ok'),
    ).toThrow(/rules/);
    expect(() => parseRepositoryConfig('version: 1\nignore:\n  paths: [123]')).toThrow(/paths/);
  });

  it('uses defaults when the trusted base branch has no config file', async () => {
    const reader = { getFileAtRef: vi.fn().mockResolvedValue(undefined) };
    await expect(
      loadRepositoryConfig(reader, { owner: 'octo', repository: 'project', ref: 'base-sha' }),
    ).resolves.toEqual({ version: 1, review: {}, rules: [], ignore: { paths: [] } });
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
    });
  });

  it('does not silently accept invalid trusted configuration', async () => {
    const reader = { getFileAtRef: vi.fn().mockResolvedValue('version: 1\nreview: [invalid]') };
    await expect(
      loadRepositoryConfig(reader, { owner: 'octo', repository: 'project', ref: 'base-sha' }),
    ).rejects.toThrow(/configuration/);
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
});
