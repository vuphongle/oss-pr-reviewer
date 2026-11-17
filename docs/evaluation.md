# Offline evaluation and quality measurement

Unit tests establish deterministic parsing, batching, filtering, and output behavior. They do **not** establish model accuracy, security coverage, or production latency/cost. This offline scorer compares **supplied saved JSON reports** with supplied labels; it never calls GitHub/OpenAI or generates predictions.

## Run the synthetic starter

From the checkout, with Node.js 20+:

```bash
npm ci
npm run build
npm run evaluate -- examples/evaluation/synthetic-manifest.json
```

For machine-readable stdout without npm's script banner:

```bash
node dist/evaluation/cli.js examples/evaluation/synthetic-manifest.json > evaluation.json
```

All starter cases, labels, and reports under [examples/evaluation](../examples/evaluation/) are **hand-written SYNTHETIC fixtures**, not real PRs, model responses, or confirmed issue labels. The example deliberately includes one correct match, a duplicate, an invalid anchor, a missed expected issue, and a clean case. Its computed totals are TP=1, FP=2, FN=1, invalid anchors=1, precision=1/3, recall=1/2. Those numbers demonstrate scorer behavior only; they are not model performance. Latency, token usage, and cost are unavailable (`null`).

## Supply your own reports and labels

Save a report from the review CLI with `--output-format json --output report.json`. The scorer validates the fields it consumes (`pullRequest.headSha` and the result schema); it allows additional report fields and does not version the review JSON contract. Report body and patches may contain sensitive code. Keep private evaluation data outside public fixtures.

Create a manifest using the [starter structure](../examples/evaluation/synthetic-manifest.json):

```json
{
  "version": 1,
  "provenance": "human-labeled",
  "cases": [
    {
      "id": "case-001",
      "report": "reports/case-001.json",
      "reviewedHead": "exact-head-sha-from-the-report",
      "validAnchors": [{ "file": "src/account.ts", "lines": [11, 12], "allowFileLevel": false }],
      "expected": [
        {
          "id": "missing-authorization",
          "file": "src/account.ts",
          "line": 12,
          "category": "security",
          "titleContains": "authorization"
        }
      ]
    }
  ]
}
```

`report` paths resolve relative to the manifest directory. `reviewedHead` must match the report exactly. Use `synthetic` provenance for artificial examples and `human-labeled` only for manually labeled cases. Keep model ID, tool commit, prompt/configuration, threshold, collection date, exact PR base/head, and label rationale in a companion experiment record; the review JSON does not currently record all of these. Do not infer the model from the report or mix untracked configurations in one comparison.

Labels require unique case IDs and per-case label IDs, an exact file/line (`null` for file-level), category, and a case-insensitive title substring. Paths and categories are case-sensitive. Supply valid changed-line anchors from the exact reviewed diff, independently of model output. Anchors and expected labels optionally accept `diffSide: "old"` or `"new"` when that side is present in the supplied finding. An explicit side must match, so identical line numbers on opposite sides do not match. Omitting sides retains file/line-only matching for legacy reports; manually verify side ambiguity in those reports. `allowFileLevel` defaults to false; set it explicitly when null-line findings are acceptable. Expected labels must also have valid anchors. The scorer does not fetch a diff or validate that your anchor list is correct.

## Scoring semantics

A finding matches a label only when its valid file/line (and side when specified), category, and title substring all match. Deterministic maximum one-to-one matching handles overlapping broad/specific labels. Each prediction and label can count once. A duplicate prediction is therefore a false positive once the matching label is consumed.

- TP: matched labels/predictions.
- FP: unmatched predictions, **including** invalid anchors.
- FN: unmatched expected labels.
- Precision: `TP / (TP + FP)`; `null` when no predictions exist.
- Recall: `TP / (TP + FN)`; `null` when no expected positives exist.
- Invalid anchors: predictions outside the supplied file/line anchor set, counted separately and also in FP.

Totals use pooled counts (micro averaging). Per-case zero-based `falsePositiveIndexes`, matched label IDs, and missed IDs help inspection. Clean cases have `expected: []`; findings on these cases are false positives. The tool reports counts and precision, not a true-negative-based false-positive rate: the number of possible negative findings is undefined.

This is a strict label/anchor proxy, not semantic adjudication. A paraphrase can miss `titleContains`, and an incorrect explanation can match it. Review mismatches and explanations manually, update labels transparently, and retain the original reports. A result with zero predictions can mean skipped review, filtering, or no model findings; use [coverage statistics](review-format.md) when assessing recall. Missing/malformed reports, invalid schema, duplicate IDs, invalid expected anchors, or mismatched heads exit nonzero instead of producing a partial score. Metric values alone do not fail the command or gate a merge.

## Practical quality, latency, usage, and cost recipe

1. Curate a small consented dataset with clean PRs and reproducible bugs across relevant categories, sizes, and languages. Pin base/head, independently reproduce each positive label, record rationale and acceptable anchors, and have another maintainer adjudicate disagreements. Keep synthetic and real cases separate, and reserve held-out cases.
2. Pin tool commit, model, prompt/configuration, and severity threshold. Save each actual JSON result. Keep failed/skipped runs in the experiment record; the scorer aborts on missing reports, so silently dropping them would bias results. Record coverage and review counts alongside scores.
3. Run each experiment on the same cases; repeat when measuring model variability. Inspect precision/recall, false positives on clean cases, invalid anchors, and categories manually. Do not tune title substrings on held-out model output to inflate scores.
4. Time actual review executions externally with a monotonic clock, documenting whether retries/network/queueing are included. Optionally add `measurements.latencyMs` to each case. Report per-case measurements and sample size; compute percentiles in the experiment analysis. The scorer's total latency is a sum, not wall time for parallel runs.
5. Record actual provider input/output token usage and billed cost from provider responses or billing records when available. The current review JSON does not include these. Optional per-case `measurements` fields are `inputTokens`, `outputTokens`, and `costUsd` in addition to `latencyMs`. Values must be nonnegative, tokens integers. Document pricing date, model, cached-token/retry treatment, and calculation if deriving cost from verified usage. Do not estimate tokens from character limits or invent billing values.

Missing measurements remain `null` (unavailable), never zero. A total is available only if **every** case supplies that measurement, preventing incomplete usage/cost from looking complete. Measurement fields are user-supplied, not verified by the scorer. No live LLM evaluation has been run by the synthetic starter or unit tests.
