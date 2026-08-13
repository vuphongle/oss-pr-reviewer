import { OSS_PR_REVIEWER_MARKER } from './comment-constants.js';

export const MAX_REVIEW_COMMENT_CHARACTERS = 60_000;
const TRUNCATION_NOTICE =
  '> This comment was shortened because the complete review exceeded GitHub comment limits. See the GitHub Actions job summary for the full report.';
const MENTION_GUARD = '@\u200b';

export interface PreparedReviewComment {
  body: string;
  truncated: boolean;
}

export function prepareReviewComment(report: string): PreparedReviewComment {
  const safeReport = neutralizeMentions(report);
  const fullBody = `${OSS_PR_REVIEWER_MARKER}\n\n${safeReport}`;
  if (fullBody.length <= MAX_REVIEW_COMMENT_CHARACTERS) {
    return { body: fullBody, truncated: false };
  }

  const sections = safeReport.split(/(?=^#{2,4} )/m);
  const header = sections.shift() ?? '';
  const prioritized = sections
    .map((section, index) => ({ section, index, priority: sectionPriority(section) }))
    .sort((left, right) => right.priority - left.priority || left.index - right.index);
  const prefix = `${OSS_PR_REVIEWER_MARKER}\n\n${header.trimEnd()}\n\n`;
  const suffix = `\n\n${TRUNCATION_NOTICE}`;
  const available = MAX_REVIEW_COMMENT_CHARACTERS - prefix.length - suffix.length;
  let selected = '';
  for (const item of prioritized) {
    const candidate = `${selected}${item.section.trimEnd()}\n\n`;
    if (candidate.length > available) continue;
    selected = candidate;
  }
  if (!selected) {
    selected = truncateAtLineBoundary(
      prioritized[0]?.section ?? safeReport,
      Math.max(0, available),
    );
  }
  return { body: `${prefix}${selected.trimEnd()}${suffix}`, truncated: true };
}

function neutralizeMentions(value: string): string {
  return value.replace(/@(?=[A-Za-z0-9_])/g, MENTION_GUARD);
}

function sectionPriority(section: string): number {
  if (/critical/i.test(section)) return 5;
  if (/high/i.test(section)) return 4;
  if (/summary|risk|statistics/i.test(section)) return 3;
  if (/medium/i.test(section)) return 2;
  if (/low/i.test(section)) return 1;
  return 0;
}

function truncateAtLineBoundary(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const candidate = value.slice(0, limit);
  const boundary = candidate.lastIndexOf('\n');
  const firstBoundary = candidate.indexOf('\n');
  return boundary > firstBoundary ? candidate.slice(0, boundary) : candidate.slice(0, limit);
}
