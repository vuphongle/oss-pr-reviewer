# Repository Configuration

`oss-pr-reviewer` supports the optional `.oss-pr-reviewer.yml` file at the repository root. Configuration is read from the pull request's trusted base commit, not from the pull request head. This prevents a pull request from changing the review policy used to inspect its own changes. The same behavior is used by the GitHub Action.

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
  maxPromptCharacters: 120000
  maxMetadataCharacters: 20000
  maxGuidanceCharacters: 24000
  reservedResponseCharacters: 15000
```

The currently supported settings are:

- `version`: must be `1`.
- `review.minSeverity`: optional `low`, `medium`, `high`, or `critical` value.
- `rules`: optional list of stable kebab-case `id` values and non-empty review `description` text. Each description is limited to 4,000 characters and the combined rendered guidance is limited to 20,000 characters; oversized rules fail configuration validation.
- `ignore.paths`: optional list of validated glob patterns. Matching files are not sent to the AI provider and are reported as ignored.
- `context`: optional numeric context-budget overrides. Supported values are `maxFilesPerBatch`, `maxDiffCharacters`, `maxFileCharacters`, `reservedPromptCharacters`, `reservedResponseCharacters`, `maxPromptCharacters`, `maxMetadataCharacters`, and `maxGuidanceCharacters`. The total prompt cap includes the system prompt, bounded metadata, guidance, diff, and reserved response characters. Pull request metadata over its cap is truncated with an explicit note; guidance over its cap fails before the provider request.

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

The context budget is character-based rather than tokenizer-based. The usable diff budget is constrained by the configured maximum diff size, reserved prompt/response characters, and the total prompt cap after reserving system, metadata, and guidance space. Files exceeding file or usable-diff limits are skipped with a reason; no token usage is fabricated.
