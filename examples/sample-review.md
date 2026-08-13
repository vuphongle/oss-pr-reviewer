# PR Review Report

## Pull Request

- Repository: example/payments-service
- PR: #42
- Title: Add refund endpoint authorization
- Risk: High

## Summary

The change adds a refund endpoint, but the authorization check appears to validate only that the request is authenticated. A maintainer should verify that the caller is allowed to refund the target payment before merging.

## Findings

### HIGH - Security

**Refund endpoint does not verify payment ownership**

File: `src/http/refunds.ts`
Line: 58

The new endpoint checks for a signed-in user but does not compare that user's permissions with the payment being refunded. A caller who knows another payment ID may be able to initiate a refund.

**Recommendation**

Load the payment and enforce the existing merchant or account authorization policy before creating the refund.

## Review Statistics

- Files reviewed: 4
- Files skipped: 1
- Findings: 1
- Critical: 0
- High: 1
- Medium: 0
- Low: 0

## Skipped Files

- `assets/refund-flow.png`: binary asset

> This synthetic example demonstrates report structure. Automated AI review assists maintainer review; it does not replace human review, testing, or security auditing.
