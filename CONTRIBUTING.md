# Contributing

## Prerequisites

- Node.js 20 LTS or newer
- npm
- A GitHub token and OpenAI API key are needed only for live CLI reviews; unit tests use mocks.

## Setup

```bash
git clone https://github.com/vuphongle/oss-pr-reviewer.git
cd oss-pr-reviewer
npm install
cp .env.example .env
```

Do not commit `.env` or credentials.

## Branch and pull request workflow

Start from the latest `main` and create a focused branch using the convention `feat/<name>`, `fix/<name>`, `docs/<name>`, `test/<name>`, or `chore/<name>`. Keep unrelated work out of the branch. Open a pull request against `main`; maintainers make the final merge decision.

## Development commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run format
npm run format:check
```

Add deterministic unit coverage for new behavior. Do not make tests call GitHub or OpenAI. Update README and the relevant `docs/` page when public behavior changes.

When changing repository configuration, preserve the trusted-base-commit boundary and add tests for invalid input, CLI precedence, rules, ignored paths, and budget behavior.

Pull requests should explain the behavior change, test evidence, security implications, and known limitations. Keep changes small and reviewable.

## Evaluation

Use the [offline scorer and measurement recipe](docs/evaluation.md) to compare saved reports with explicit labels. The starter dataset is synthetic; passing its tests does not establish model quality. Keep private PR content, credentials, and unverified “ground truth” out of public fixtures.

## Release checklist

The checkout is version 0.4.0 and this repository has not published the package to npm. A build or successful mock test run is not evidence that a live CLI or Action release works.

1. From a clean release checkout, run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Run `npm audit` and triage dependency advisories, distinguishing development tooling from shipped runtime paths; an advisory count alone does not prove exploitability. Record unresolved risks rather than applying unreviewed major upgrades. Review the final diff and update version/changelog/docs consistently. Do not commit generated `dist/` unless repository policy changes.
2. Run `npm pack --dry-run` to inspect the included files, then `npm pack` to create the actual tarball. Confirm `dist/cli/index.js`, compiled runtime modules, dependency metadata, declarations, license, and README are present as expected. The package's `files` list includes `dist`; checkout-only docs/examples are not guaranteed to ship.
3. Install that exact tarball into a temporary directory (`npm install /absolute/path/to/oss-pr-reviewer-<version>.tgz`) and run `./node_modules/.bin/oss-pr-reviewer --help`. This validates package shape/entry point; it is not a live review test. The offline `npm run evaluate` recipe is for a source checkout, not a new installed command.
4. Manually smoke-test the packaged CLI against a small consented PR with real credentials: save Markdown and JSON, verify exact reviewed head, expected coverage/skips, threshold behavior, and failure handling. Inspect output for sensitive content before sharing. Record commit, package hash, model, date, commands, and observed results; do not replace this with mocked test evidence.
5. Manually smoke-test the Action from the intended release commit in a controlled repository: summary-only mode, explicit comment create/update, stale-head handling after a push, permission/credential failures, and fork-secret restrictions. Check bounded summary/comment behavior and confirm the full local report is not assumed to be an uploaded artifact. Remove any test comments you own when appropriate.
6. Confirm the version does not collide with an existing npm release/tag and that the intended `v<version>` Git tag points to the reviewed commit. Create/push the tag and publish the tarball only as the authorized release action; neither `npm pack` nor a GitHub tag publishes to npm. Verify the resulting package/tag and update Action examples to the actual released version or reviewed commit. Do not move an existing release tag silently.

Record which checks were automated, which live smoke tests were performed, and any remaining manual gaps in release notes. Keep publication separate from preparing/reviewing the candidate.
