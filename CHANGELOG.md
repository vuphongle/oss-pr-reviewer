# Changelog

## 0.4.0

- Added opt-in GitHub Action PR comment output through `post-comment: true`; summary output remains the default.
- Added stable marker-based comment ownership with create-once and update-in-place behavior for repeated reviews.
- Added `comment-action`, `comment-id`, and `comment-url` Action outputs.
- Added least-privilege documentation for summary-only (`pull-requests: read`) and comment mode (`pull-requests: write`).
- Added deterministic comment-size limiting, priority-aware truncation, mention neutralization, fork guidance, and troubleshooting docs.

Comment mode does not use `pull_request_target`, execute reviewed code, delete old comments, or fail because findings are high or critical. Live GitHub/OpenAI PR comment smoke testing remains pending; validation uses deterministic mocks, synthetic events, static Action checks, and CI.

## 0.3.0

- Added an opt-in composite GitHub Action for `pull_request` events with `opened`, `synchronize`, and `reopened` actions.
- Added least-privilege, summary-only workflow guidance using `contents: read` and `pull-requests: read`.
- Added Action input validation, fork-secret limitation handling, secret redaction, and deterministic Action boundary tests.
- Added GitHub Actions usage documentation and a tagged-release workflow example.

The Action does not use `pull_request_target`, check out contributor code, post PR comments, or fail a job because a review contains high or critical findings. Live GitHub/OpenAI Action smoke testing remains pending; automated validation uses deterministic mocks, fixtures, and static workflow checks.

## 0.2.0

- Added optional trusted-base `.oss-pr-reviewer.yml` configuration with validated CLI precedence.
- Added repository custom review rules and validated glob-based ignored paths.
- Added explicit character-based context budgeting with reserved prompt/response space.
- Added changed, ignored, skipped, and batch counts to Markdown review statistics.
- Added configuration documentation and examples.

Live GitHub/OpenAI smoke testing remains pending; automated validation uses deterministic mocks and fixtures.

## 0.1.0

- Added a TypeScript CLI for reviewing GitHub pull requests by repository/PR or URL.
- Added GitHub pull request metadata and changed-file retrieval through Octokit.
- Added diff normalization, unsupported-file reporting, deterministic batching, finding validation, deduplication, severity filtering, and Markdown reports.
- Added an OpenAI review provider with structured JSON validation and prompt-injection-aware instructions.
- Added deterministic unit tests, npm quality scripts, and GitHub Actions CI.
