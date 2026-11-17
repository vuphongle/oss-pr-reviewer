# Review integrity and limits

## Total batch limit

The CLI and GitHub Action allow at most **20 scheduled review batches per pull request** by default. Batches are computed after ignored files, missing patches, and oversized patches have been excluded. If a review requires more batches, it fails before any provider review requests are made, reporting the required count and configured limit. It does not silently review only the first 20 batches.

Narrow the diff or explicitly raise the CLI limit:

```sh
oss-pr-reviewer review --repo octo/project --pr 12 --max-batches 30
```

`--max-batches` must be a positive safe integer. Programmatic callers can set `ReviewCommandOptions.maxBatches`; the Action inherits the default and has no input to override it. This limit controls scheduled batches, not retry attempts, tokens, or monetary spend. Up to four batches can run concurrently.

## Acquired revision and publication

File acquisition reads PR metadata before and after fetching the complete available paginated file list. The base SHA, head SHA, and changed-file count must match across those reads. A mismatch discards that file list and starts another acquisition, with at most **three attempts** before the review fails.

Transient read errors are retried, including PR metadata, head checks, configuration reads, and comment lists. If a later pagination page fails transiently, the entire listing is restarted and the partial result is discarded. Comment creation is not blindly retried. GitHub's file-list limit still applies: when the returned list is shorter than the authoritative changed-file count, the report marks the review incomplete and counts unavailable files.

The report's `pullRequest.headSha` identifies the revision actually acquired for review. The Action passes that SHA to publication, rather than using the webhook event SHA. Immediately before creating or updating its comment, publication compares the current PR head with the reviewed head and skips the write if they differ. An older event may therefore review a newer revision, but a report cannot pass this check solely because the current head matches the older event.

These are matching-read checks, not atomic snapshots or conditional writes. A revision can change and change back between reads; the PR can also change after the final publication check. The checks do not provide an atomic GitHub snapshot or publication guarantee.

Internal CLI integrations that need the acquired revision can use the structured helper:

```ts
import { executeReviewWithMetadata } from './dist/cli/commands/review.js';

const { report, data } = await executeReviewWithMetadata({
  repo: 'octo/project',
  pr: '12',
  maxBatches: 20,
});
const reviewedHeadSha = data.pullRequest.headSha;
```

`executeReview(options)` continues to return the rendered report string. Both helpers use the same credential requirements and output-file behavior.

## Finding location evidence

Each provider finding is checked against the batch that produced it before results are merged, deduplicated, and filtered by severity. A path in another batch is insufficient. A numbered finding must identify a positive integer line actually represented in the supplied patch; a hunk header's range alone is insufficient.

Added lines use new coordinates and deleted lines use old coordinates. Supplied context lines are eligible too, so validation does not restrict findings to changed lines. A `null` line is retained for a file-level finding when the file belongs to the batch. For a renamed file, an actual previous path is accepted with old-side line evidence, then normalized to the current path. Added and removed files use their applicable diff side.

Reports may include these additive fields:

| Field                        | Meaning                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `result.findings[].diffSide` | Optional `"old"` or `"new"` coordinate for a retained numbered finding. New coordinates are preferred when the number has evidence on both sides. Absent for file-level findings.           |
| `rejectedFindings`           | Optional array of `{ finding, reason }` records excluded from normal findings. Reasons are `"file-not-in-batch"` and `"line-not-in-diff"`. Consumers should accept this field being absent. |

For example, an excluded record preserves the provider finding and explains why it was excluded:

```json
{
  "rejectedFindings": [
    {
      "finding": {
        "severity": "high",
        "category": "bug",
        "title": "Provider claim",
        "file": "outside-batch.ts",
        "line": null,
        "explanation": "Provider explanation",
        "recommendation": "Provider recommendation"
      },
      "reason": "file-not-in-batch"
    }
  ]
}
```

Markdown reports show retained line coordinates, rejection counts, reasons, and a warning when findings were excluded. If all findings are excluded, the findings section explains that no findings with supported locations remain and requests maintainer review. Location validation establishes only that the cited location was supplied to the provider; it does not establish that the claimed issue is correct. File-level findings, summaries, and retained findings still require maintainer judgment.
