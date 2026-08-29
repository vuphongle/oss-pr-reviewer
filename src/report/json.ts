import type { ReviewReportData } from '../types.js';

export function renderJson(data: ReviewReportData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}
