# Repository configuration

The optional root `.oss-pr-reviewer.yml` is loaded from the PR's **base commit**, including in the Action. A PR cannot activate its own changed review policy. See the [example](../examples/oss-pr-reviewer.yml).

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
  maxFilesPerBatch: 8
```

CLI options override repository settings, which override defaults. With no file, minimum severity is `low`, rules and ignore patterns are empty, and the context defaults below apply. `version` must be `1`. Minimum severity accepts `low`, `medium`, `high`, or `critical`.

## Context defaults and valid ranges

All values are integers measured in characters, except file count. Ranges are inclusive.

| Setting                      | Default | Valid range |
| ---------------------------- | ------: | ----------: |
| `maxFilesPerBatch`           |       8 |       1–100 |
| `maxDiffCharacters`          |  60,000 |   1–500,000 |
| `maxFileCharacters`          |  30,000 |   1–200,000 |
| `reservedPromptCharacters`   |   8,000 |   0–100,000 |
| `reservedResponseCharacters` |  12,000 |   0–100,000 |
| `maxPromptCharacters`        | 120,000 |   1–500,000 |
| `maxMetadataCharacters`      |  20,000 |   1–100,000 |
| `maxGuidanceCharacters`      |  24,000 |   1–100,000 |

The usable diff budget is the smaller of:

```text
maxDiffCharacters - reservedPromptCharacters - reservedResponseCharacters
maxPromptCharacters - 2,000 system reserve - maxMetadataCharacters
  - maxGuidanceCharacters - reservedResponseCharacters
```

Defaults therefore allow `min(60,000 - 8,000 - 12,000, 120,000 - 2,000 - 20,000 - 24,000 - 12,000) = 40,000` diff characters per batch. This is not a 60,000-character usable diff allowance. A nonpositive usable budget fails; an oversized individual patch is skipped, not split. Actual rendered prompt size plus response reserve is also checked before the provider request. Oversized metadata is truncated with a note; oversized guidance fails. Character counts do not predict model tokens or billing.

## Rules, ignores, and validation

`rules` accepts at most 100 entries. Each trimmed ID must be kebab-case and at most 128 characters; each trimmed description must contain 1–4,000 characters. Combined rendered `RULE id: description` guidance, including separators, is limited to 20,000 characters, independently of `maxGuidanceCharacters`.

`ignore.paths` accepts nonempty glob patterns compiled with picomatch. Matching files are excluded **before** unsupported-file normalization and batching, and appear in skipped-file reporting. Generated files are not automatically ignored: configure paths explicitly.

Invalid YAML, unsupported versions, unknown top-level keys, and invalid values fail validation. Use only the supported settings above and check nested key spelling. Rules are untrusted review guidance, not system instructions, and cannot execute code or grant access to secrets.
