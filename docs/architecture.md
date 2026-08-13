# Architecture

`oss-pr-reviewer` is a single-process CLI. It fetches only the requested pull request and changed-file patches; it does not clone or execute the repository.

```text
CLI
  |
GitHub Client
  |
Trusted base-branch configuration
  |
PR normalization
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
```

## Boundaries

- `src/cli/` validates command options, loads configuration, runs the workflow, and handles user-facing errors.
- `src/github/` owns Octokit access and converts GitHub responses into the internal pull request model. API failures are normalized into concise errors.
- `src/config/repository.ts` validates optional `.oss-pr-reviewer.yml` content loaded from the pull request base SHA. PR-head configuration is never used as active policy.
- `src/review/normalize.ts` removes binary and patchless files from AI input while preserving skip reasons for the report.
- `src/review/batching.ts` applies the centralized `maxDiffSize`, `maxFileSize`, and `maxFilesPerBatch` limits.
- `src/ai/` contains the OpenAI SDK boundary. The rest of the review engine depends on the small `ReviewProvider` interface.
- `src/review/schema.ts` validates every provider response before it enters the merge pipeline.
- `src/report/` renders the final report without making claims that automated review is definitive.

The review prompt labels all pull request content as untrusted data. No changed code is executed, and no repository content outside the supplied pull request is sent to the provider.
