# GitHub Actions

`oss-pr-reviewer` v0.4.0 includes an opt-in composite GitHub Action for advisory pull request reviews. It reuses the existing CLI and review engine, then appends the generated Markdown report to the workflow job summary through `GITHUB_STEP_SUMMARY`. Comment publishing is separately opt-in.

## Enable the Action

Add a workflow such as [examples/github-actions/basic.yml](../examples/github-actions/basic.yml):

```yaml
name: AI PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: read

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: vuphongle/oss-pr-reviewer@v0.4.0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

The example uses the tagged release rather than `main`. Pin the Action to a reviewed release or commit according to your repository's dependency policy.

## Choose an Output Mode

Summary-only mode is the default and needs only read permissions:

```yaml
permissions:
  contents: read
  pull-requests: read
```

It never writes to the pull request. To opt in to an update-in-place pull request comment, use [examples/github-actions/comment.yml](../examples/github-actions/comment.yml):

```yaml
permissions:
  contents: read
  pull-requests: write

steps:
  - uses: vuphongle/oss-pr-reviewer@v0.4.0
    with:
      github-token: ${{ secrets.GITHUB_TOKEN }}
      openai-api-key: ${{ secrets.OPENAI_API_KEY }}
      post-comment: true
```

`post-comment` accepts only `true` or `false` and defaults to `false`. Comment mode creates one tool-owned comment on the first run and updates it on later `synchronize` runs. It uses the invisible marker `<!-- oss-pr-reviewer -->`, only targets expected bot-authored comments, and does not delete older duplicates.

## Inputs

| Input            | Required | Default                    | Purpose                                                                         |
| ---------------- | -------- | -------------------------- | ------------------------------------------------------------------------------- |
| `github-token`   | yes      | none                       | Token used to read PR metadata, patches, and trusted base-branch configuration. |
| `openai-api-key` | yes      | none                       | Key used for the OpenAI review request.                                         |
| `model`          | no       | `gpt-4o-mini`              | OpenAI model name.                                                              |
| `min-severity`   | no       | repository config or `low` | Finding threshold. CLI/Action input overrides repository configuration.         |
| `post-comment`   | no       | `false`                    | Create or update the owned PR comment. Requires `pull-requests: write`.         |

The Action is advisory. A high or critical finding does not fail the job; configuration, API, or runtime failures do. If explicitly enabled comment publishing fails, the Action reports the error and exits non-zero after writing the complete job summary.

## Permissions and Secrets

Use the narrow permissions shown above:

```yaml
permissions:
  contents: read
  pull-requests: read
```

Store `OPENAI_API_KEY` as a repository or organization secret. The Action does not print secrets or place them in reports. Summary-only mode does not request write permissions; comment mode requires only `pull-requests: write` in addition to `contents: read`.

The Action does not use `pull_request_target`. It runs the trusted Action checkout and does not check out or execute the reviewed contributor branch.

## Fork Pull Requests

GitHub normally withholds repository secrets from workflows triggered by `pull_request` events from forks. That means `OPENAI_API_KEY` is unavailable for an untrusted fork workflow in the normal setup. Do not expose the key by switching casually to `pull_request_target` or by executing fork code.

Maintainers can review fork changes using a separate, explicitly approved workflow design, but that is outside this release. The Action does not bypass GitHub's secret protections.

## Repository Configuration

The existing `.oss-pr-reviewer.yml` is loaded from the pull request base commit. Repository rules, ignored paths, and context budgets continue to use v0.2 trust boundaries. The PR branch cannot silently activate a different policy for its own review.

## Output and Limitations

The full report is always appended to the Actions job summary. Comment mode reuses the report, applies a 60,000-character safety limit, preserves higher-priority findings when shortening, neutralizes mention-like text, and adds a truncation notice when needed. It does not create annotations or enforce a merge policy. Live GitHub/OpenAI credentials are not needed for repository tests, but a real Action run requires valid secrets and network access.

## Troubleshooting

- **Permission denied:** add `pull-requests: write` only when `post-comment: true`; keep `pull-requests: read` for summary-only mode.
- **Fork pull request:** GitHub normally withholds repository secrets from `pull_request` workflows triggered by forks. Do not switch to `pull_request_target` as a workaround.
- **Comment not created:** check that `post-comment` is exactly `true`, the token is available, and the workflow runs in the repository context with the documented permission.
- **Shortened comment:** the complete report remains in the job summary; the PR comment is bounded for GitHub's practical comment limits.
