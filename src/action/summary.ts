import { Buffer } from 'node:buffer';

export const DEFAULT_SUMMARY_BUDGET_BYTES = 900 * 1024;
export const SUMMARY_TRUNCATION_NOTICE =
  '> This job summary was shortened because the complete review exceeded the summary size limit. The complete report is not shown here.';

const FINDING_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];

export function boundSummary(report: string, budgetBytes = DEFAULT_SUMMARY_BUDGET_BYTES): string {
  if (budgetBytes <= 0) throw new Error('Summary budget must be positive.');

  const normalized = report.trimEnd();
  const complete = `${normalized}\n`;
  if (byteLength(complete) <= budgetBytes) return complete;

  const sections = splitReport(normalized);
  const notice = `\n\n${SUMMARY_TRUNCATION_NOTICE}\n`;
  if (byteLength(notice) > budgetBytes) return truncateUtf8(notice, budgetBytes);
  const findings = sortFindings(sections.findings);
  const available = Math.max(0, budgetBytes - byteLength(notice));
  const priorityFinding = findings.find((finding) => findingPriority(finding) <= 1);
  const reservedPriority = priorityFinding ? byteLength(priorityFinding) + 2 : 0;
  const heading = `${sections.findingsHeading}`;
  const headerBudget = Math.max(
    0,
    available - byteLength(heading) - 2 - Math.min(reservedPriority, Math.floor(available / 2)),
  );
  const boundedHeader = truncateUtf8(sections.header, headerBudget).trimEnd();
  let selected = boundedHeader ? `${boundedHeader}\n\n${heading}` : heading;

  const chunks = [sections.findingsIntro, ...findings, sections.supporting].filter(Boolean);
  for (const chunk of chunks) {
    const candidate = `${selected}\n\n${chunk}`;
    if (byteLength(`${candidate}${notice}`) <= budgetBytes) selected = candidate;
  }

  const bounded = truncateUtf8(selected, available).trimEnd();
  return `${bounded}${notice}`;
}

interface ReportSections {
  header: string;
  findingsHeading: string;
  findingsIntro: string;
  findings: string[];
  supporting: string;
}

function splitReport(report: string): ReportSections {
  const lines = report.split('\n');
  const findingsIndex = lines.findIndex((line) => line === '## Findings');
  if (findingsIndex < 0) {
    return {
      header: truncateUtf8(report, report.length),
      findingsHeading: '',
      findingsIntro: '',
      findings: [],
      supporting: '',
    };
  }

  const supportingIndex = lines.findIndex(
    (line, index) => index > findingsIndex && /^## (Review Statistics|Skipped Files)$/.test(line),
  );
  const findingsEnd = supportingIndex >= 0 ? supportingIndex : lines.length;
  const header = lines.slice(0, findingsIndex).join('\n').trim();
  const findingsLines = lines.slice(findingsIndex + 1, findingsEnd);
  const findingBlocks: string[][] = [];
  let current: string[] = [];
  for (const line of findingsLines) {
    if (line.startsWith('### ') && current.length > 0) {
      findingBlocks.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) findingBlocks.push(current);

  const findings = findingBlocks
    .map((block) => block.join('\n').trim())
    .filter((block) => block.length > 0 && !/^No significant issues/.test(block));
  const findingsIntro = findingBlocks
    .filter((block) => !block.some((line) => line.startsWith('### ')))
    .map((block) => block.join('\n').trim())
    .filter(Boolean)
    .join('\n\n');
  const supporting = supportingIndex >= 0 ? lines.slice(supportingIndex).join('\n').trim() : '';

  return { header, findingsHeading: '## Findings', findingsIntro, findings, supporting };
}

function sortFindings(findings: string[]): string[] {
  return findings
    .map((finding, index) => ({ finding, index, priority: findingPriority(finding) }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map(({ finding }) => finding);
}

function findingPriority(finding: string): number {
  const heading = finding.match(/^### ([A-Z]+)/m)?.[1] ?? 'UNKNOWN';
  const priority = FINDING_PRIORITIES.indexOf(heading);
  return priority < 0 ? FINDING_PRIORITIES.length : priority;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  if (byteLength(value) <= maxBytes) return value;
  return Buffer.from(value, 'utf8').subarray(0, maxBytes).toString('utf8');
}
