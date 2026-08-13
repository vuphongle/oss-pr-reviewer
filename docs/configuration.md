# Repository Configuration

v0.2 supports an optional `.oss-pr-reviewer.yml` file at the repository root. Configuration is read from the pull request's trusted base commit, not from the pull request head. This prevents a pull request from changing the review policy used to inspect its own changes.

## Example

```yaml
version: 1

review:
  minSeverity: medium
```

The currently supported settings are:

- `version`: must be `1`.
- `review.minSeverity`: optional `low`, `medium`, `high`, or `critical` value.

If the file is absent, v0.1 behavior is preserved and the default minimum severity is `low`. Invalid YAML, unsupported keys, unsupported versions, or invalid values fail the review with an actionable configuration error; they are not silently ignored.

## Precedence

For settings exposed by both interfaces, the value is selected in this order:

```text
CLI option -> repository configuration -> application default
```

For example, `--min-severity high` overrides `review.minSeverity: medium`.

## Security boundary

Configuration is repository-defined guidance, not a system instruction. It cannot change prompt-injection protections, request secrets, execute commands, or override the review safety policy. Future configuration fields will be validated before they reach the review engine.
