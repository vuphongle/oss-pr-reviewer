# Architecture

`oss-pr-reviewer` is a single-process CLI. It fetches only the requested pull request, trusted-base configuration, and changed-file patches; it does not clone or execute the repository.

```text
GitHub pull_request event
  |
Composite Action (optional)
  |
CLI
  |
GitHub Client
  |
Trusted base-branch configuration
  |
PR normalization
  |
Path ignores
  |
Context budget
  |
Deterministic batching
  |
Review engine
  |
OpenAI provider
  |
Zod validation
  |
Finding merge / deduplicate / filter
  |
Markdown renderer
  |
  +--> GITHUB_STEP_SUMMARY (always)
  |
  +--> Optional PR comment adapter (create/update)
```

## Boundaries

- `src/cli/` validates command options, loads configuration, runs the workflow, and handles user-facing errors.
- `src/github/` owns Octokit access and converts GitHub responses into the internal pull request model. API failures are normalized into concise errors.
- `src/config/repository.ts` validates optional `.oss-pr-reviewer.yml` content loaded from the pull request base SHA. PR-head configuration is never used as active policy.
- `src/review/ignore.ts` applies repository glob exclusions before normalization. Ignored files remain visible in skipped-file reporting.
- `src/review/normalize.ts` removes binary and patchless files from AI input while preserving skip reasons for the report.
- `src/review/batching.ts` applies centralized diff, file, batch, and reserved-context limits through `ReviewBudget`.
- `src/review/batching.ts` exposes an explicit character-based budget with reserved prompt/response space while retaining the v0.1 legacy batching shape.
- `src/review/reviewer.ts` processes batches with a four-worker pool, preserves input order, and stops scheduling new batches after a provider failure while allowing active calls to settle.
- `src/ai/` contains the OpenAI SDK boundary. The rest of the review engine depends on the small `ReviewProvider` interface.
- `src/review/schema.ts` validates every provider response before it enters the merge pipeline.
- `src/report/` renders the final report without making claims that automated review is definitive.
- `action.yml` is a thin composite Action. It builds and runs only the trusted Action checkout, parses supported pull request event metadata, and appends the existing Markdown report to the job summary.
- `src/action/` contains testable Action-boundary code for event parsing, input validation, secret redaction, fork limitations, and summary output. It does not duplicate review logic.
- `src/github/comments.ts` owns marker-based comment discovery and create/update behavior, including a best-effort current-head check immediately before publication. `src/github/comment-safety.ts` bounds and sanitizes comment output without changing the full summary report.

Custom rule descriptions are passed as untrusted user-context guidance. They cannot replace or modify the system review policy.

The review prompt labels all pull request content as untrusted data. No changed code is executed, and no repository content outside the supplied pull request is sent to the provider.

The documented workflows use `pull_request` and tagged Action releases. Summary-only mode uses read permissions; comment mode explicitly adds `pull-requests: write`. Fork pull requests normally cannot receive repository secrets; the Action does not use `pull_request_target` as a workaround.
