import { appendFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { boundSummary } from './summary.js';

export async function writeActionReport(
  report: string,
  reportPath: string,
  summaryPath?: string,
): Promise<void> {
  await writeFile(reportPath, report, 'utf8');
  if (summaryPath) await appendFile(summaryPath, boundSummary(report), 'utf8');
}

export async function writeActionOutput(
  outputPath: string | undefined,
  values: Record<string, string>,
): Promise<void> {
  if (!outputPath) return;
  const lines = Object.entries(values).map(([name, value]) => {
    const delimiter = `oss_pr_reviewer_${randomUUID()}`;
    return `${name}<<${delimiter}\n${value}\n${delimiter}`;
  });
  await appendFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
}
