import { appendFile, writeFile } from 'node:fs/promises';

export async function writeActionReport(
  report: string,
  reportPath: string,
  summaryPath?: string,
): Promise<void> {
  await writeFile(reportPath, report, 'utf8');
  if (summaryPath) await appendFile(summaryPath, `${report.trimEnd()}\n`, 'utf8');
}
