# Runtime reliability

OpenAI review requests keep the default model `gpt-4o-mini`. Each batch uses one
explicit retry layer: `maxRetries: 2` permits at most three HTTP attempts, with SDK
retries disabled even for an injected OpenAI client.

Each attempt has a 60,000 ms timeout. This is not a total review deadline: retries,
backoff waits, and additional batches add time. Each request sends
`max_completion_tokens: 4096`; this is a per-request output cap, not an aggregate PR
token or cost budget. Truncated, refused, filtered, and empty responses fail with
explicit errors. Custom models must support the Chat Completions parameters used
by the provider, including `max_completion_tokens`.

Default retry waits honor `retry-after-ms` or `Retry-After` (seconds or HTTP date)
up to 60 seconds. Longer hints return a retry-later error instead of retrying early.
`x-should-retry: false` stops retries. Without a valid delay hint, exponential
backoff starts at one second and caps at eight seconds. Connection failures and
HTTP 408, 409, 429, and 5xx responses are retryable, subject to the retry limit and
provider retry headers.

Programmatic callers can pass `OpenAiReviewOptions` as the fourth argument to
`OpenAiReviewProvider`; these options are not CLI flags or Action inputs:

| Option                | Default                 | Behavior                                                                                                         |
| --------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `maxRetries`          | `2`                     | Number of retries after the initial attempt.                                                                     |
| `timeoutMs`           | `60000`                 | Timeout for each attempt.                                                                                        |
| `maxCompletionTokens` | `4096`                  | Value sent as `max_completion_tokens`.                                                                           |
| `backoffMs`           | Default scheduler above | Overrides the retry delay scheduler.                                                                             |
| `onUsage`             | Unset                   | Receives actual provider `CompletionUsage` when present, including responses rejected during content validation. |

The usage callback receives token usage only, without prompts or credentials. It
does not estimate missing usage, create CLI usage reports, or measure whole-PR
costs. Retry counts must be nonnegative safe integers; timeout and output-token
bounds must be positive safe integers.

Repository configuration rejects unknown keys in `review`, `ignore`, `context`,
and individual `rules` objects. For example, `review.minSeverty` fails validation
instead of silently falling back to the default severity.

The composite Action binds `comment-action`, `comment-id`, and `comment-url` to the
named `review` step's outputs, making them available to calling workflow steps.
