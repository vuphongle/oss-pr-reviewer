# Security Policy

## Reporting a vulnerability

Please do not post API keys, access tokens, private pull request contents, or an exploit in a public issue. If GitHub private vulnerability reporting is enabled for this repository, use the repository's **Security** tab to create a private report. Otherwise, open a minimal issue asking maintainers for a private reporting channel without including sensitive details.

Include the affected version or commit, reproduction steps, impact, relevant logs with secrets removed, and a proposed mitigation if available.

## Supported versions

Only the latest release line is actively supported. Security fixes may be backported at maintainer discretion.

## Security boundaries

- Store `GITHUB_TOKEN` and `OPENAI_API_KEY` outside source control; `.env` is ignored.
- Pull request titles, descriptions, filenames, documentation, and patches are untrusted data and are explicitly separated from review instructions.
- The CLI never executes changed code or arbitrary shell commands from a pull request.
- The reusable Action is intended for the `pull_request` event with least-privilege `contents: read` and `pull-requests: read` permissions. It does not use `pull_request_target`, which has a different trust model and can expose secrets to untrusted workflow context.
- GitHub does not expose repository secrets to workflows triggered by pull requests from forks. Fork reviews therefore need an explicit maintainer-approved credential strategy; the Action does not bypass this restriction.
- The Action runs the trusted Action checkout only. It does not check out or execute the contributor's pull request, and it appends the Markdown report to `GITHUB_STEP_SUMMARY` rather than posting comments by default.
- Reports may contain code-derived text, so review output before sharing it outside the intended maintainer context.
- Provider and GitHub errors are normalized without intentionally printing credentials.
