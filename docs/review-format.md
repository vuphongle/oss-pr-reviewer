# Review Format

The CLI emits a structured report with pull request metadata, an overall summary and risk, findings, review statistics, skipped files, and an automation disclaimer. The report includes statistics such as files changed, files ignored by configuration, and review batches. The GitHub Action places the same report in the Actions job summary.

By default the report is rendered as Markdown. `--output-format json` emits the same `ReviewReportData` shape as deterministic JSON for CI integration and downstream tooling. The JSON contains `pullRequest`, `result` (with `summary`, `riskLevel`, and `findings`), `skippedFiles`, and the same count fields as the Markdown statistics block. `fileListStatus` is `complete` or `incomplete`, while `truncatedFileCount` records changed files that GitHub did not return. Findings with `riskLevel: unknown` mean no review was performed (no reviewable patches or all findings filtered out).

## Severity

- `unknown`: no review was performed for this pull request (no reviewable text patches, or every finding was filtered out by the minimum severity).
- `critical`: evidence of a severe security, data-loss, or system-breaking issue.
- `high`: a likely serious bug, security problem, regression, or breaking behavior.
- `medium`: a meaningful correctness, test, error-handling, or maintainability concern.
- `low`: a lower-impact issue that is still actionable and supported by the diff.

`--min-severity` is applied deterministically after provider responses are validated. The order is `unknown < low < medium < high < critical`. Findings cannot be reported at the `unknown` level.

## Risk level

Risk is derived from the filtered findings, so a report with no surviving findings (no reviewable patches or every finding below `--min-severity`) reports `riskLevel: unknown`. When findings survive filtering, the final report uses the highest severity among them. Risk is an assessment of review context, not a guarantee about the pull request.

## Categories

Findings use one focused category: `bug`, `security`, `regression`, `breaking-change`, `tests`, `error-handling`, or `maintainability`.

Each finding includes a title, file, optional line, evidence-based explanation, and recommendation. Duplicate findings with the same file, line, title, and category are removed.

## Interpretation

Read findings as maintainer leads for further investigation. The model sees the pull request metadata, trusted-base repository guidance, and reviewable patches only. Missing context, truncated patches, generated files, binary files, deleted files, ignored files, and oversized content can limit accuracy. Automated output does not replace human review, testing, or a security audit.

GitHub returns at most 3,000 files from the pull-request files endpoint. The reviewer compares that response with GitHub's authoritative changed-file count. If files are unavailable, the report continues but displays a prominent incomplete-review warning and a separate unavailable-file count. Unavailable files are not represented as ordinary skipped files, and the tool does not imply that pagination recovered them.
