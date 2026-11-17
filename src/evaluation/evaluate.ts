import { z } from 'zod';

import { categorySchema, findingSchema, reviewResultSchema } from '../review/schema.js';

const text = z.string().trim().min(1);
const line = z.number().int().positive().nullable();
const diffSide = z.enum(['old', 'new']).optional();
const anchorSchema = z
  .object({
    file: text,
    lines: z.array(z.number().int().positive()),
    allowFileLevel: z.boolean().default(false),
    diffSide,
  })
  .strict();
const labelSchema = z
  .object({
    id: text,
    file: text,
    line,
    category: categorySchema,
    titleContains: text,
    diffSide,
  })
  .strict();
const measurementsSchema = z
  .object({
    latencyMs: z.number().finite().nonnegative().optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    costUsd: z.number().finite().nonnegative().optional(),
  })
  .strict();
const caseSchema = z
  .object({
    id: text,
    report: text,
    reviewedHead: text,
    validAnchors: z.array(anchorSchema),
    expected: z.array(labelSchema),
    measurements: measurementsSchema.default({}),
  })
  .strict();

export const manifestSchema = z
  .object({
    version: z.literal(1),
    provenance: z.enum(['synthetic', 'human-labeled']),
    cases: z.array(caseSchema).min(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    const checkUnique = (values: string[], path: (string | number)[]) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path, message: 'must be unique' });
      }
    };
    checkUnique(
      manifest.cases.map(({ id }) => id),
      ['cases'],
    );
    manifest.cases.forEach((testCase, index) => {
      checkUnique(
        testCase.expected.map(({ id }) => id),
        ['cases', index, 'expected'],
      );
      checkUnique(
        testCase.validAnchors.map(({ file, diffSide }) => `${file}:${diffSide ?? 'either'}`),
        ['cases', index, 'validAnchors'],
      );
      testCase.expected.forEach((label, labelIndex) => {
        if (!hasValidAnchor(label, testCase.validAnchors)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['cases', index, 'expected', labelIndex],
            message: 'expected label must have a valid anchor',
          });
        }
      });
    });
  });

// Validate the report fields used by this scorer. Extra report fields are accepted;
// this does not introduce a schema version or contract for the review command.
const reportSchema = z.object({
  pullRequest: z.object({ headSha: text }),
  result: reviewResultSchema.extend({ findings: z.array(findingSchema.extend({ diffSide })) }),
});

export type EvaluationManifest = z.infer<typeof manifestSchema>;
type EvaluationCase = EvaluationManifest['cases'][number];
type Anchor = { file: string; line: number | null; diffSide?: 'old' | 'new' };

function hasValidAnchor(finding: Anchor, anchors: EvaluationCase['validAnchors']): boolean {
  return anchors.some(
    (anchor) =>
      anchor.file === finding.file &&
      (anchor.diffSide === undefined || anchor.diffSide === finding.diffSide) &&
      (finding.line === null ? anchor.allowFileLevel : anchor.lines.includes(finding.line)),
  );
}

export function evaluateReport(testCase: EvaluationCase, value: unknown) {
  const report = reportSchema.parse(value);
  if (report.pullRequest.headSha !== testCase.reviewedHead) {
    throw new Error(`Case '${testCase.id}': report head does not match reviewedHead.`);
  }
  const findings = report.result.findings;
  const valid = findings.map((finding) => hasValidAnchor(finding, testCase.validAnchors));
  const candidates = findings.map((finding, index) =>
    valid[index]
      ? testCase.expected.flatMap((label, labelIndex) =>
          finding.file === label.file &&
          finding.line === label.line &&
          finding.category === label.category &&
          (label.diffSide === undefined || label.diffSide === finding.diffSide) &&
          finding.title.toLowerCase().includes(label.titleContains.toLowerCase())
            ? [labelIndex]
            : [],
        )
      : [],
  );

  // Maximum one-to-one matching avoids order-dependent scores for overlapping titles.
  const matched = new Map<number, number>();
  const match = (findingIndex: number, seen: Set<number>): boolean => {
    for (const labelIndex of candidates[findingIndex]) {
      if (seen.has(labelIndex)) continue;
      seen.add(labelIndex);
      const previous = matched.get(labelIndex);
      if (previous === undefined || match(previous, seen)) {
        matched.set(labelIndex, findingIndex);
        return true;
      }
    }
    return false;
  };
  findings.forEach((_, index) => match(index, new Set()));
  const truePositives = matched.size;
  const falsePositives = findings.length - truePositives;
  const falseNegatives = testCase.expected.length - truePositives;
  return {
    id: testCase.id,
    ...score(truePositives, falsePositives, falseNegatives),
    invalidAnchors: valid.filter((isValid) => !isValid).length,
    matchedLabels: testCase.expected.filter((_, index) => matched.has(index)).map(({ id }) => id),
    missedLabels: testCase.expected.filter((_, index) => !matched.has(index)).map(({ id }) => id),
    falsePositiveIndexes: findings.flatMap((_, index) =>
      [...matched.values()].includes(index) ? [] : [index],
    ),
    measurements: {
      latencyMs: testCase.measurements.latencyMs ?? null,
      inputTokens: testCase.measurements.inputTokens ?? null,
      outputTokens: testCase.measurements.outputTokens ?? null,
      costUsd: testCase.measurements.costUsd ?? null,
    },
  };
}

function score(truePositives: number, falsePositives: number, falseNegatives: number) {
  return {
    truePositives,
    falsePositives,
    falseNegatives,
    precision:
      truePositives + falsePositives === 0
        ? null
        : truePositives / (truePositives + falsePositives),
    recall:
      truePositives + falseNegatives === 0
        ? null
        : truePositives / (truePositives + falseNegatives),
  };
}

export async function evaluateManifest(
  value: unknown,
  loadReport: (path: string) => Promise<unknown>,
) {
  const manifest = manifestSchema.parse(value);
  const cases: ReturnType<typeof evaluateReport>[] = [];
  for (const testCase of manifest.cases) {
    cases.push(evaluateReport(testCase, await loadReport(testCase.report)));
  }
  const sum = (field: 'truePositives' | 'falsePositives' | 'falseNegatives' | 'invalidAnchors') =>
    cases.reduce((total, result) => total + result[field], 0);
  const measurementTotal = (field: keyof EvaluationCase['measurements']) =>
    cases.every((result) => result.measurements[field] !== null)
      ? cases.reduce((total, result) => total + (result.measurements[field] ?? 0), 0)
      : null;
  return {
    version: 1,
    provenance: manifest.provenance,
    cases,
    totals: {
      ...score(sum('truePositives'), sum('falsePositives'), sum('falseNegatives')),
      invalidAnchors: sum('invalidAnchors'),
      measurements: {
        latencyMs: measurementTotal('latencyMs'),
        inputTokens: measurementTotal('inputTokens'),
        outputTokens: measurementTotal('outputTokens'),
        costUsd: measurementTotal('costUsd'),
      },
    },
  };
}
