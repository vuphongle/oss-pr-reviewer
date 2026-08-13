import { z } from 'zod';

export const severitySchema = z.enum(['low', 'medium', 'high', 'critical']);
export const categorySchema = z.enum([
  'bug',
  'security',
  'regression',
  'breaking-change',
  'tests',
  'error-handling',
  'maintainability',
]);

export const findingSchema = z.object({
  severity: severitySchema,
  category: categorySchema,
  title: z.string().min(1),
  file: z.string().min(1),
  line: z.number().int().positive().nullable(),
  explanation: z.string().min(1),
  recommendation: z.string().min(1),
});

export const reviewResultSchema = z.object({
  summary: z.string().min(1),
  riskLevel: severitySchema,
  findings: z.array(findingSchema),
});

export type ParsedReviewResult = z.infer<typeof reviewResultSchema>;

export function parseReviewResult(value: unknown): ParsedReviewResult {
  const parsed = reviewResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`AI review response failed schema validation: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }
  return parsed.data;
}

export function parseJsonReviewResponse(content: string): ParsedReviewResult {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error('AI review response was not valid JSON.');
  }
  return parseReviewResult(value);
}
