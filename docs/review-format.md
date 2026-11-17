# Review format and interpretation

The default Markdown report includes PR metadata and reviewed head, summary, risk, findings, file coverage, skipped reasons, and an advisory disclaimer. The Action appends a separately bounded rendering to its job summary; see [Action output limits](github-actions.md#output-and-limitations).

`--output-format json` serializes the current `ReviewReportData` object with two-space indentation and a final newline. It contains `pullRequest`, `result`, `skippedFiles`, `reviewedFileCount`, `changedFileCount`, `fileListStatus`, `truncatedFileCount`, `ignoredFileCount`, and `batchCount`. `result` contains `summary`, `riskLevel`, and `findings`.

**The JSON currently includes the raw `pullRequest.body` and `pullRequest.files[].patch` data fetched from GitHub, including content that may have been excluded from AI input. It has no `schemaVersion`.** Treat saved JSON as potentially sensitive repository data, review it before sharing, and validate the fields your integration consumes. This is not a stable versioned interchange contract.

## Empty findings and risk

These are different outcomes:

| Outcome                                                        | Evidence in the current report                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| No reviewable patches                                          | `batchCount: 0`, `reviewedFileCount: 0`, and summary saying no reviewable text patches were available. No provider review ran. |
| Patches reviewed; provider returned zero findings              | Positive batch/reviewed counts, no final findings. A review ran.                                                               |
| Patches reviewed; every finding was below the minimum severity | Positive batch/reviewed counts, no final findings. A review ran and filtering removed its findings.                            |

All three currently produce `riskLevel: unknown`. Risk alone cannot tell them apart. The report does not retain pre-filter finding counts, so the latter two cannot be distinguished reliably from its structured fields. The Markdown sentence “No significant issues were identified in the reviewed diff” also appears for all empty-finding reports; check counts, skips, and coverage rather than treating this sentence as proof of review or correctness.

Risk is the highest surviving finding severity, or `unknown` if none survive. It does not incorporate omitted context or establish merge readiness. `--min-severity` filters deterministically after validation and deduplication.

## Findings

Severity is `critical`, `high`, `medium`, or `low`; findings cannot use `unknown`. Categories are `bug`, `security`, `regression`, `breaking-change`, `tests`, `error-handling`, and `maintainability`.

Each finding contains `severity`, `category`, `title`, `file`, `line` (positive integer or `null`), `explanation`, and `recommendation`. Duplicate findings with the same file, line, title, and category are removed. Schema validation checks shape; it does not prove that a claim is correct. Maintainers should verify each file/line anchor against the exact reviewed head and check the source evidence. The [offline evaluator](evaluation.md) can check supplied anchor labels independently.

## Coverage and context

GitHub's files endpoint returns at most 3,000 changed files. When the returned count differs from the PR changed-file count, `fileListStatus` is `incomplete`. `truncatedFileCount` counts missing files, which are separate from ordinary skipped files. `complete` describes the file list, not semantic review completeness.

Ignored paths, known binary extensions, missing patches, and oversized patches can reduce coverage. Deleted files with patches can still be reviewed. Oversized metadata is explicitly truncated in provider input; repository guidance that exceeds its configured cap is rejected. Read findings as leads to validate with source context and tests, not as a security audit or approval.
