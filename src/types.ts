export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type ReviewCategory =
  | 'bug'
  | 'security'
  | 'regression'
  | 'breaking-change'
  | 'tests'
  | 'error-handling'
  | 'maintainability';

export type RiskLevel = Severity;

export interface PullRequest {
  owner: string;
  repository: string;
  number: number;
  title: string;
  body: string;
  baseSha: string;
  files: ChangedFile[];
}

export interface ChangedFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  previousPath?: string;
}

export interface ReviewableFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
  previousPath?: string;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

export interface NormalizedFiles {
  reviewable: ReviewableFile[];
  skipped: SkippedFile[];
}

export interface ReviewFinding {
  severity: Severity;
  category: ReviewCategory;
  title: string;
  file: string;
  line: number | null;
  explanation: string;
  recommendation: string;
}

export interface ReviewResult {
  summary: string;
  riskLevel: RiskLevel;
  findings: ReviewFinding[];
}

export interface ReviewReportData {
  pullRequest: PullRequest;
  result: ReviewResult;
  skippedFiles: SkippedFile[];
  reviewedFileCount: number;
  changedFileCount: number;
  ignoredFileCount: number;
  batchCount: number;
}
