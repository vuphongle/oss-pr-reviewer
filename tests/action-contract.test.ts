import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

describe('composite Action output contract', () => {
  it('binds every public comment output to the step that writes GITHUB_OUTPUT', async () => {
    const action = parse(await readFile(new URL('../action.yml', import.meta.url), 'utf8')) as {
      outputs: Record<string, { value: string }>;
      runs: { steps: { id?: string; run?: string }[] };
    };
    for (const output of ['comment-action', 'comment-id', 'comment-url']) {
      const binding = action.outputs[output].value;
      const match = /^\$\{\{ steps\.([\w-]+)\.outputs\['([\w-]+)'\] \}\}$/.exec(binding);
      expect(match, `${output} must bind a step output`).not.toBeNull();
      expect(match?.[2]).toBe(output);
      const writer = action.runs.steps.find((step) => step.id === match?.[1]);
      expect(writer?.run).toContain('dist/action/main.js');
    }
  });
});
