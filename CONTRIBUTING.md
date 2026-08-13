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

Pull requests should explain the behavior change, test evidence, security implications, and known limitations. Keep changes small and reviewable.
