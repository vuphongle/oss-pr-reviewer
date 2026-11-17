import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { evaluateManifest, evaluateReport, manifestSchema } from '../src/evaluation/evaluate.js';

const fixtureDirectory = new URL('../examples/evaluation/', import.meta.url);
async function readFixture(path: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(path, fixtureDirectory), 'utf8'));
}
async function manifest() {
  return manifestSchema.parse(await readFixture('synthetic-manifest.json'));
}

describe('offline evaluation', () => {
  it('scores supplied reports, counts duplicates/invalid anchors as false positives, and exposes unavailable measurements', async () => {
    const result = await evaluateManifest(await manifest(), readFixture);
    expect(result.totals).toEqual({
      truePositives: 1,
      falsePositives: 2,
      falseNegatives: 1,
      precision: 1 / 3,
      recall: 0.5,
      invalidAnchors: 1,
      measurements: { latencyMs: null, inputTokens: null, outputTokens: null, costUsd: null },
    });
    expect(result.cases[0].matchedLabels).toEqual(['authorization']);
    expect(result.cases[0].missedLabels).toEqual(['missing-error-handling']);
    expect(result.cases[0].falsePositiveIndexes).toEqual([1, 2]);
    expect(result.cases[1].precision).toBeNull();
    expect(result.cases[1].recall).toBeNull();
  });

  it('uses maximum one-to-one matching for overlapping labels regardless of finding order', async () => {
    const testCase = (await manifest()).cases[0];
    testCase.expected[1] = {
      ...testCase.expected[0],
      id: 'specific',
      titleContains: 'authorization check',
    };
    const report = {
      pullRequest: { headSha: testCase.reviewedHead },
      result: {
        summary: 'Fixture',
        riskLevel: 'high',
        findings: [
          {
            severity: 'high',
            category: 'security',
            file: 'src/account.ts',
            line: 12,
            title: 'Missing authorization check',
            explanation: 'Fixture',
            recommendation: 'Fixture',
          },
          {
            severity: 'high',
            category: 'security',
            file: 'src/account.ts',
            line: 12,
            title: 'Missing authorization',
            explanation: 'Fixture',
            recommendation: 'Fixture',
          },
        ],
      },
    };
    expect(evaluateReport(testCase, report).truePositives).toBe(2);
    report.result.findings.reverse();
    expect(evaluateReport(testCase, report).truePositives).toBe(2);
  });

  it('requires category and title evidence as well as an anchor and scores changed reports', async () => {
    const testCase = (await manifest()).cases[0];
    const prediction = {
      severity: 'high',
      category: 'security',
      file: 'src/account.ts',
      line: 12,
      title: 'Missing authorization check',
      explanation: 'Fixture',
      recommendation: 'Fixture',
    };
    const report = {
      pullRequest: { headSha: testCase.reviewedHead },
      result: {
        summary: 'Fixture',
        riskLevel: 'high',
        findings: [
          { ...prediction, title: 'Unrelated issue' },
          { ...prediction, category: 'bug' },
        ],
      },
    };
    const scored = evaluateReport(testCase, report);
    expect(scored).toMatchObject({
      truePositives: 0,
      falsePositives: 2,
      falseNegatives: 2,
      invalidAnchors: 0,
    });
    report.result.findings = [];
    expect(evaluateReport(testCase, report)).toMatchObject({
      falsePositives: 0,
      falseNegatives: 2,
      precision: null,
      recall: 0,
    });
  });

  it('validates manifests, unique IDs, label anchors, reports and exact reviewed heads', async () => {
    const data = await manifest();
    expect(() => manifestSchema.parse({ ...data, version: 2 })).toThrow();
    expect(() => manifestSchema.parse({ ...data, cases: [data.cases[0], data.cases[0]] })).toThrow(
      'unique',
    );
    const testCase = data.cases[0];
    expect(() =>
      manifestSchema.parse({
        ...data,
        cases: [{ ...testCase, expected: [{ ...testCase.expected[0], line: 900 }] }],
      }),
    ).toThrow('valid anchor');
    expect(() => evaluateReport(testCase, { result: { findings: [] } })).toThrow();
    const report = await readFixture(testCase.report);
    expect(() => evaluateReport({ ...testCase, reviewedHead: 'wrong' }, report)).toThrow('head');
    expect(() =>
      manifestSchema.parse({ ...data, cases: [{ ...testCase, measurements: { costUsd: -1 } }] }),
    ).toThrow();
  });

  it('distinguishes explicitly labeled old/new sides while allowing legacy reports without sides', async () => {
    const testCase = (await manifest()).cases[0];
    testCase.expected = [testCase.expected[0]];
    testCase.validAnchors[0].diffSide = 'new';
    testCase.expected[0].diffSide = 'new';
    const report = {
      pullRequest: { headSha: testCase.reviewedHead },
      result: {
        summary: 'Fixture',
        riskLevel: 'high',
        findings: [
          {
            severity: 'high',
            category: 'security',
            file: 'src/account.ts',
            line: 12,
            title: 'Missing authorization check',
            explanation: 'Fixture',
            recommendation: 'Fixture',
            diffSide: 'old',
          },
        ],
      },
    };
    expect(evaluateReport(testCase, report)).toMatchObject({ truePositives: 0, invalidAnchors: 1 });
    report.result.findings[0].diffSide = 'new';
    expect(evaluateReport(testCase, report).truePositives).toBe(1);
    delete testCase.validAnchors[0].diffSide;
    expect(
      evaluateReport(testCase, {
        ...report,
        result: { ...report.result, findings: [{ ...report.result.findings[0], diffSide: 'old' }] },
      }).truePositives,
    ).toBe(0);
    delete testCase.expected[0].diffSide;
    const legacyFinding = { ...report.result.findings[0], diffSide: undefined };
    expect(
      evaluateReport(testCase, {
        ...report,
        result: { ...report.result, findings: [legacyFinding] },
      }).truePositives,
    ).toBe(1);
  });

  it('allows file-level anchors only when explicitly allowed and computes supplied measurement totals', async () => {
    const data = await manifest();
    const testCase = data.cases[0];
    testCase.expected = [{ ...testCase.expected[0], line: null }];
    const report = {
      pullRequest: { headSha: testCase.reviewedHead },
      result: {
        summary: 'Fixture',
        riskLevel: 'high',
        findings: [
          {
            severity: 'high',
            category: 'security',
            file: 'src/account.ts',
            line: null,
            title: 'Missing authorization check',
            explanation: 'Fixture',
            recommendation: 'Fixture',
          },
        ],
      },
    };
    expect(evaluateReport(testCase, report).truePositives).toBe(1);
    testCase.validAnchors[0].allowFileLevel = false;
    expect(evaluateReport(testCase, report).invalidAnchors).toBe(1);
    const measured = await manifest();
    measured.cases.forEach((item) => {
      item.measurements = { latencyMs: 10, inputTokens: 100, outputTokens: 20, costUsd: 0.001 };
    });
    expect((await evaluateManifest(measured, readFixture)).totals.measurements).toEqual({
      latencyMs: 20,
      inputTokens: 200,
      outputTokens: 40,
      costUsd: 0.002,
    });
    delete measured.cases[1].measurements.costUsd;
    expect((await evaluateManifest(measured, readFixture)).totals.measurements.costUsd).toBeNull();
  });
});
