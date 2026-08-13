# Review Format

The CLI emits Markdown with pull request metadata, an overall summary and risk, findings, review statistics, skipped files, and an automation disclaimer. The report includes statistics such as files changed, files ignored by configuration, and review batches. The GitHub Action places the same report in the Actions job summary.

## Severity

- `critical`: evidence of a severe security, data-loss, or system-breaking issue.
- `high`: a likely serious bug, security problem, regression, or breaking behavior.
- `medium`: a meaningful correctness, test, error-handling, or maintainability concern.
- `low`: a lower-impact issue that is still actionable and supported by the diff.

`--min-severity` is applied deterministically after provider responses are validated. The order is `low < medium < high < critical`.

## Risk level

The provider returns one aggregate risk level for the reviewed batch. The final report uses the highest risk level returned across batches. Risk is an assessment of review context, not a guarantee about the pull request.

## Categories

Findings use one focused category: `bug`, `security`, `regression`, `breaking-change`, `tests`, `error-handling`, or `maintainability`.

Each finding includes a title, file, optional line, evidence-based explanation, and recommendation. Duplicate findings with the same file, line, title, and category are removed.

## Interpretation

Read findings as maintainer leads for further investigation. The model sees the pull request metadata, trusted-base repository guidance, and reviewable patches only. Missing context, truncated patches, generated files, binary files, deleted files, ignored files, and oversized content can limit accuracy. Automated output does not replace human review, testing, or a security audit.
