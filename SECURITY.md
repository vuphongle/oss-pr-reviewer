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
- Reports may contain code-derived text, so review output before sharing it outside the intended maintainer context.
- Provider and GitHub errors are normalized without intentionally printing credentials.
