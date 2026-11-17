import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { evaluateManifest } from './evaluate.js';

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(
      `Could not read JSON '${path}': ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

try {
  if (process.argv.length !== 3) throw new Error('Usage: npm run evaluate -- <manifest.json>');
  const manifestPath = resolve(process.argv[2]);
  const result = await evaluateManifest(await readJson(manifestPath), (path) =>
    readJson(resolve(dirname(manifestPath), path)),
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(
    `Evaluation failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
}
