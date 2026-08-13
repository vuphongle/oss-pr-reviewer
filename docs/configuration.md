# Repository Configuration

v0.2 supports an optional `.oss-pr-reviewer.yml` file at the repository root. Configuration is read from the pull request's trusted base commit, not from the pull request head. This prevents a pull request from changing the review policy used to inspect its own changes.

## Example

```yaml
version: 1

review:
  minSeverity: medium

rules:
  - id: require-tests
    description: Changes under src/ should normally include corresponding tests.

ignore:
  paths:
    - docs/**
    - '**/*.generated.ts'

context:
  maxFilesPerBatch: 10
  reservedResponseCharacters: 15000
```

The currently supported settings are:

- `version`: must be `1`.
- `review.minSeverity`: optional `low`, `medium`, `high`, or `critical` value.
- `rules`: optional list of stable kebab-case `id` values and non-empty review `description` text.
- `ignore.paths`: optional list of validated glob patterns. Matching files are not sent to the AI provider and are reported as ignored.
- `context`: optional numeric context-budget overrides. Supported values are `maxFilesPerBatch`, `maxDiffCharacters`, `maxFileCharacters`, `reservedPromptCharacters`, and `reservedResponseCharacters`.

If the file is absent, v0.1 behavior is preserved and the default minimum severity is `low`. Invalid YAML, unsupported keys, unsupported versions, or invalid values fail the review with an actionable configuration error; they are not silently ignored.

## Precedence

For settings exposed by both interfaces, the value is selected in this order:

```text
CLI option -> repository configuration -> application default
```

For example, `--min-severity high` overrides `review.minSeverity: medium`.

## Security boundary

Configuration is repository-defined guidance, not a system instruction. It cannot change prompt-injection protections, request secrets, execute commands, or override the review safety policy. Future configuration fields will be validated before they reach the review engine.

Custom rule descriptions are inserted into a clearly labeled untrusted guidance section in the review request. Path ignores are applied before unsupported-file normalization and batching.

The context budget is character-based rather than tokenizer-based. The usable diff budget is the configured maximum diff size minus reserved prompt and response characters. Files exceeding file or usable-diff limits are skipped with a reason; no token usage is fabricated.
