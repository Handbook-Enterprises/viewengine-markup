/**
 * Where a magic-link sign-in returns to when it started on an agent's OAuth
 * screen (`/authorize`, src/oauth.ts). Kept apart from oauth.ts so the auth
 * routes do not pull the OAuth provider, which needs `cloudflare:workers`, into
 * code that runs under `bun test`.
 */
export const NEXT_COOKIE = 'ml_next';

/** Only ever a path back into /authorize, so the cookie cannot become an open redirect. */
export function safeNext(value: string | undefined): string | null {
  return value?.startsWith('/authorize?') ? value : null;
}
