import { describe, expect, it, vi } from 'vitest';

import { findReviewComment, publishReviewComment } from '../src/github/comments.js';
import { OSS_PR_REVIEWER_MARKER } from '../src/github/comment-constants.js';
import { MAX_REVIEW_COMMENT_CHARACTERS } from '../src/github/comment-safety.js';
import type { RepositoryReference } from '../src/github/types.js';

const reference: RepositoryReference = { owner: 'octo', repository: 'project' };

describe('PR comment publishing', () => {
  it('finds only the newest comment with the stable marker from the expected bot', async () => {
    const client = {
      listComments: vi.fn().mockResolvedValue([
        {
          id: 10,
          body: `${OSS_PR_REVIEWER_MARKER}\nold`,
          user: { type: 'Bot', login: 'github-actions[bot]' },
        },
        { id: 12, body: 'unrelated', user: { type: 'User' } },
        {
          id: 11,
          body: `${OSS_PR_REVIEWER_MARKER}\nnew`,
          user: { type: 'Bot', login: 'github-actions[bot]' },
        },
        { id: 13, body: `${OSS_PR_REVIEWER_MARKER}\nuser copy`, user: { type: 'User' } },
      ]),
    };

    await expect(findReviewComment(client, reference, 7)).resolves.toEqual({
      id: 11,
      body: `${OSS_PR_REVIEWER_MARKER}\nnew`,
      user: { type: 'Bot', login: 'github-actions[bot]' },
    });
  });

  it('creates one comment when no owned marker comment exists', async () => {
    const client = {
      listComments: vi.fn().mockResolvedValue([]),
      createComment: vi.fn().mockResolvedValue({ id: 22, htmlUrl: 'https://example.test/c/22' }),
      updateComment: vi.fn(),
    };

    await expect(publishReviewComment(client, reference, 7, '## Review')).resolves.toEqual({
      action: 'created',
      id: 22,
      htmlUrl: 'https://example.test/c/22',
    });
    expect(client.createComment).toHaveBeenCalledWith(
      reference,
      7,
      `${OSS_PR_REVIEWER_MARKER}\n\n## Review`,
    );
    expect(client.updateComment).not.toHaveBeenCalled();
  });

  it('updates the owned marker comment and remains idempotent on repeated runs', async () => {
    const client = {
      listComments: vi.fn().mockResolvedValue([
        {
          id: 22,
          body: `${OSS_PR_REVIEWER_MARKER}\nold`,
          user: { type: 'Bot', login: 'github-actions[bot]' },
        },
      ]),
      createComment: vi.fn(),
      updateComment: vi.fn().mockResolvedValue({ id: 22, htmlUrl: 'https://example.test/c/22' }),
    };

    await expect(publishReviewComment(client, reference, 7, '## Updated')).resolves.toEqual({
      action: 'updated',
      id: 22,
      htmlUrl: 'https://example.test/c/22',
    });
    await expect(publishReviewComment(client, reference, 7, '## Updated again')).resolves.toEqual({
      action: 'updated',
      id: 22,
      htmlUrl: 'https://example.test/c/22',
    });
    expect(client.createComment).not.toHaveBeenCalled();
    expect(client.updateComment).toHaveBeenNthCalledWith(
      1,
      reference,
      7,
      22,
      `${OSS_PR_REVIEWER_MARKER}\n\n## Updated`,
    );
    expect(client.updateComment).toHaveBeenNthCalledWith(
      2,
      reference,
      7,
      22,
      `${OSS_PR_REVIEWER_MARKER}\n\n## Updated again`,
    );
  });

  it('normalizes GitHub comment permission failures', async () => {
    const client = {
      listComments: vi.fn().mockRejectedValue({ status: 403 }),
    };

    await expect(findReviewComment(client, reference, 7)).rejects.toThrow(/comment API access/);
  });

  it('publishes a bounded, mention-safe comment body', async () => {
    const client = {
      listComments: vi.fn().mockResolvedValue([]),
      createComment: vi.fn().mockResolvedValue({ id: 22, htmlUrl: 'https://example.test/c/22' }),
      updateComment: vi.fn(),
    };
    const report = `# PR Review Report\n\n### CRITICAL - Security\n${'@maintainer critical '.repeat(4000)}`;

    await publishReviewComment(client, reference, 7, report);

    const body = client.createComment.mock.calls[0][2] as string;
    expect(body.length).toBeLessThanOrEqual(MAX_REVIEW_COMMENT_CHARACTERS);
    expect(body).toContain('@\u200bmaintainer');
    expect(body).toContain('shortened because the complete review exceeded');
  });
});
