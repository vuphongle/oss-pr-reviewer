# oss-pr-reviewer

AI-powered CLI for reviewing GitHub pull requests, detecting potential bugs, security risks, regressions, and missing tests, with structured Markdown reports for open-source maintainers.

## Overview

`oss-pr-reviewer` assists a maintainer with a focused review of one GitHub pull request. It fetches pull request metadata and changed-file patches, normalizes reviewable content, splits large changes into deterministic batches, asks OpenAI for structured findings, validates and merges the responses, and writes a Markdown report.

It is an assistant, not an approval system. It never claims that a pull request is guaranteed correct, secure, safe, or bug-free.

## Why oss-pr-reviewer?

Pull request review often starts with the same context-gathering work: finding the changed files, identifying patches that need human attention, and turning review notes into a shareable artifact. This CLI keeps that workflow local and explicit so maintainers can inspect the generated report and make the final decision themselves.

## Features

- Review by `--repo owner/repository --pr 123` or a GitHub pull request URL.
- Fetch pull request metadata and changed files with Octokit.
- Skip binary, patchless, and oversized files with reasons in the report.
- Batch large text diffs with fixed limits: 60,000 characters, 30,000 characters per file, and 8 files per batch.
- Validate OpenAI JSON responses with Zod.
- Deduplicate identical findings and apply deterministic severity filtering.
- Print Markdown to stdout or write it to `--output`.
- Run lint, typecheck, tests, and build in GitHub Actions without secrets.

## How It Works

```text
Pull request -> GitHub fetch -> normalize -> batch -> AI analysis
  -> validate -> merge/deduplicate/filter -> Markdown report
```

See [docs/architecture.md](docs/architecture.md) for module boundaries.

## Installation

The package requires Node.js 20 LTS or newer.

From a checkout:

```bash
npm install
npm run build
```

For a published package, install it globally with npm. The repository is the source of truth for the initial release while publication is maintained separately.

## Quick Start

```bash
export GITHUB_TOKEN=your-github-token
export OPENAI_API_KEY=your-openai-key

npx oss-pr-reviewer review \
  --repo owner/repository \
  --pr 123 \
  --min-severity medium \
  --output review.md
```

Authenticated GitHub access is recommended to avoid anonymous API rate limits. The CLI does not require a token for every public repository request, but GitHub may reject or limit unauthenticated access.

## Configuration

Copy `.env.example` to `.env` or provide environment variables directly:

```bash
GITHUB_TOKEN=
OPENAI_API_KEY=
```

`OPENAI_API_KEY` is required for an AI review. Never commit `.env` or place real credentials in examples, issues, reports, or logs.

## CLI Usage

```bash
oss-pr-reviewer --help
oss-pr-reviewer review --help

oss-pr-reviewer review --repo owner/repository --pr 123
oss-pr-reviewer review --url https://github.com/owner/repository/pull/123
oss-pr-reviewer review --repo owner/repository --pr 123 --model gpt-4o-mini
oss-pr-reviewer review --repo owner/repository --pr 123 --min-severity high
oss-pr-reviewer review --repo owner/repository --pr 123 --output review.md
```

`--repo` and `--pr` must be supplied together. `--url` is mutually exclusive with that pair. Supported minimum severities are `low`, `medium`, `high`, and `critical`. A high or critical finding does not make the process fail; configuration, API, filesystem, and validation failures return a non-zero exit code.

## Sample Review Report

```markdown
# PR Review Report

## Findings

### HIGH - Security

**Missing authorization check**

File: `src/api/user.ts`
Line: 84

The changed endpoint does not appear to validate the caller's permissions.

**Recommendation**

Validate permissions before processing the request.
```

The full report also includes pull request metadata, summary, statistics, skipped files, and a disclaimer. See [docs/review-format.md](docs/review-format.md).

## Architecture

The CLI depends on a small `ReviewProvider` interface, so the review engine does not contain OpenAI SDK details. v0.1.0 ships one provider: OpenAI. Review content is treated as untrusted data, and changed code is never executed. See [docs/architecture.md](docs/architecture.md).

## Review Philosophy

The prompt prioritizes correctness, regressions, security, breaking behavior, tests, error handling, and meaningful maintainability issues. It asks for evidence-based findings and excludes formatting complaints, naming preferences, stylistic nitpicks, speculation, and duplicates. Human maintainers remain responsible for validating context and deciding what to change or merge.

## Security Considerations

Keep tokens in the environment, use authenticated GitHub access where possible, and treat generated reports as potentially containing code-derived text. Repository content can contain prompt injection attempts; the system prompt explicitly treats it as data. The CLI does not clone the repository, execute code, or run shell commands derived from a pull request. See [SECURITY.md](SECURITY.md).

## Limitations

- Only OpenAI is implemented in v0.1.0.
- The tool reviews supplied pull request metadata and patches rather than the full repository.
- GitHub-truncated, missing, generated, binary, deleted, or oversized content can be skipped or reduce review context.
- It does not post comments, create annotations, clone repositories, run tests, or replace human/security review.
- Live API usage requires network access and valid credentials; automated tests use mocks.

## Development and Testing

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

Contributions should follow [CONTRIBUTING.md](CONTRIBUTING.md). CI runs the same quality gates on pushes and pull requests.

## Roadmap

These are possible future directions, not v0.1.0 features:

- **v0.2:** repository configuration, custom review rules, improved context/token estimation, and additional provider support.
- **v0.3:** a GitHub Action, automatic PR comments, inline annotations, and repository-level configuration.

## License

Released under the [MIT License](LICENSE).
