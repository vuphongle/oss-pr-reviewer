# oss-pr-reviewer

Review one GitHub pull request with OpenAI and save an advisory Markdown or JSON report. The CLI fetches PR metadata and patches, applies trusted base-commit rules and ignores, batches reviewable text, and validates and filters model findings. Maintainers decide what to fix or merge.

Requires Node.js 20 or newer. The checkout is version 0.4.0; this repository has not published the package to npm. Use the built CLI from a checkout:

```bash
git clone https://github.com/vuphongle/oss-pr-reviewer.git
cd oss-pr-reviewer
npm ci
npm run build
export OPENAI_API_KEY=your-key
export GITHUB_TOKEN=your-token
node dist/cli/index.js review --repo owner/repository --pr 123 --output review.md
```

`OPENAI_API_KEY` is required for live reviews. GitHub authentication is recommended for public PRs and required where repository access demands it. Keep credentials out of source control. Development tests and the offline scorer require no credentials.

```bash
node dist/cli/index.js review --url https://github.com/owner/repository/pull/123
node dist/cli/index.js review --repo owner/repository --pr 123 --min-severity high
node dist/cli/index.js review --repo owner/repository --pr 123 --output-format json --output review.json
node dist/cli/index.js review --help
```

A finding looks like this **synthetic example**, not a confirmed vulnerability:

```markdown
### HIGH - Security

**Missing authorization check**

File: `src/api/user.ts`
Line: 84

The changed handler returns user data without checking ownership.

**Recommendation**

Validate the caller's permission before returning the data.
```

See the [sample report](examples/sample-review.md) and [report interpretation](docs/review-format.md). Finding severity does not change the exit code; configuration, API, validation, or filesystem failures do.

Important limits:

- The model sees supplied metadata, repository guidance, and patches, rather than the full repository. The CLI does not clone code or run tests.
- Ignored, binary, patchless, oversized, or unavailable files reduce coverage. GitHub file-list truncation is reported as incomplete.
- Default batches allow 8 files, 30,000 characters per patch, and **40,000 usable diff characters** after reserves. Budgets approximate characters, not tokens.
- Empty findings and `riskLevel: unknown` do not establish correctness or prove that no review ran.
- JSON currently includes raw PR body and patches and has no `schemaVersion`; inspect it before sharing.
- Only OpenAI is implemented. Automated tests use mocks and do not establish model quality.

The optional [GitHub Action](docs/github-actions.md) uses `pull_request` events, produces a bounded job summary, and can publish an owned comment with explicit write permission. Summary and comments can both be shortened; the full local report is not uploaded as an artifact. Fork PRs normally cannot access repository secrets.

More detail: [configuration and defaults](docs/configuration.md), [architecture](docs/architecture.md), [security](SECURITY.md), [troubleshooting](docs/troubleshooting.md), [offline evaluation and measurement](docs/evaluation.md), and [contributing and release checklist](CONTRIBUTING.md).

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run evaluate -- examples/evaluation/synthetic-manifest.json
```

The final command scores hand-written synthetic reports to demonstrate the scorer; it makes no model-quality claim. Licensed under [MIT](LICENSE).
