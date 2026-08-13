export function assertActionCredentialsAvailable(
  event: { isFork: boolean },
  environment: { OPENAI_API_KEY?: string },
): void {
  if (event.isFork && !environment.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is unavailable for this fork pull request. GitHub does not expose repository secrets to pull_request workflows from forks.',
    );
  }
}
