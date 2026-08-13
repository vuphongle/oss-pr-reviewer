#!/usr/bin/env bash
set -euo pipefail

# Set GITHUB_TOKEN and OPENAI_API_KEY before running this example.
npx oss-pr-reviewer review \
  --repo owner/repository \
  --pr 123 \
  --min-severity medium \
  --output review.md
