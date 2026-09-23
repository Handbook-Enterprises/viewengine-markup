// Types only: a value import would load `cloudflare:workers`, which `bun test` cannot resolve.
import type { AuthorizationError, AuthRequest, OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import type { McpProps } from './account-mcp';
import { userFromCookieHeader } from './auth';

/**
 * OAuth for the account-wide `/mcp`, on top of the magic-link login that
 * already exists. `@cloudflare/workers-oauth-provider` owns the protocol —
 * discovery, client registration, PKCE, tokens. This file owns the one part it
 * leaves to the app: who the user is and whether they allow the client.
 *
 *   /authorize, signed out → email form. The magic link lands on /auth/verify,
 *                            which reads NEXT_COOKIE and comes straight back.
 *   /authorize, signed in  → "Allow <client>?" The POST re-parses the original
 *                            query, so nothing the page carried is trusted.
 */

import { NEXT_COOKIE } from './auth/next';

const isAuthorizationError = (error: unknown): error is AuthorizationError =>
  error instanceof Error && error.name === 'AuthorizationError';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);

function page(title: string, body: string, headers: HeadersInit = {}): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escape(title)} · ViewEngine Markup</title><link rel="icon" href="/favicon.svg">
<style>
:root{--accent:#0e6f81;--fg:#111;--muted:#666;--bg:#f6f8f9;--card:#fff;--line:#e3e8eb}
@media (prefers-color-scheme:dark){:root{--accent:#58b4c4;--fg:#eee;--muted:#999;--bg:#0f1417;--card:#172024;--line:#26343a}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;padding:16px;box-sizing:border-box}
main{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px;max-width:380px;width:100%}
h1{font-size:18px;margin:0 0 8px}p{margin:0 0 16px;color:var(--muted)}b{color:var(--fg)}
input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--line);border-radius:8px;font:inherit;background:transparent;color:inherit;margin-bottom:12px}
button{width:100%;padding:10px;border:0;border-radius:8px;background:var(--accent);color:#fff;font:inherit;font-weight:600;cursor:pointer}
button.secondary{background:transparent;color:var(--muted);margin-top:8px}
</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function signInPage(next: string, secure: boolean): Response {
  const cookie = `${NEXT_COOKIE}=${encodeURIComponent(next)}; Path=/; Max-Age=900; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  return page(
    'Sign in',
    `<h1>Sign in to connect your agent</h1>
<p>We'll email you a sign-in link. Open it in this browser and you'll come straight back here.</p>
<form id="f"><input type="email" name="email" placeholder="you@viewengine.ai" required autofocus><button>Email me a link</button></form>
<p id="m" role="status" style="margin:12px 0 0"></p>
<script>
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = document.getElementById('m');
  const r = await fetch('/auth/request', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: e.target.email.value }) });
  const j = await r.json().catch(() => ({}));
  m.textContent = r.ok ? 'Check your inbox for the sign-in link.' : (j.error || 'Something went wrong.');
});
</script>`,
    { 'Set-Cookie': cookie },
  );
}

function consentPage(action: string, clientName: string, email: string): Response {
  return page(
    'Allow access',
    `<h1>Allow ${escape(clientName)}?</h1>
<p>It will be able to list your boards, open new ones, and read, comment on and resolve annotations as <b>${escape(email)}</b>.</p>
<form method="post" action="${escape(action)}"><button name="decision" value="allow">Allow</button>
<button class="secondary" name="decision" value="deny">Cancel</button></form>`,
  );
}

function errorRedirect(oauthRequest: AuthRequest & { issuer?: string }, code: string): Response {
  const redirect = new URL(oauthRequest.redirectUri);
  redirect.searchParams.set('error', code);
  if (oauthRequest.state) redirect.searchParams.set('state', oauthRequest.state);
  if (oauthRequest.issuer) redirect.searchParams.set('iss', oauthRequest.issuer);
  return Response.redirect(redirect.toString(), 302);
}

export async function handleAuthorize({
  request,
  env,
}: {
  request: Request;
  env: { DB: D1Database; OAUTH_PROVIDER: OAuthHelpers };
}): Promise<Response> {
  const url = new URL(request.url);
  // Parse from a GET of the same URL on both legs, so the POST cannot smuggle
  // in a different client or redirect than the one the user was shown.
  let oauthRequest: AuthRequest;
  try {
    oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(new Request(url.toString()));
  } catch (error) {
    if (!isAuthorizationError(error)) throw error;
    if (!error.redirectUri) return page('Error', `<h1>Can't connect</h1><p>${escape(error.description)}</p>`);
    const redirect = new URL(error.redirectUri);
    redirect.searchParams.set('error', error.code);
    redirect.searchParams.set('error_description', error.description);
    if (error.state) redirect.searchParams.set('state', error.state);
    if (error.issuer) redirect.searchParams.set('iss', error.issuer);
    return Response.redirect(redirect.toString(), 302);
  }

  const client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);
  if (!client) return page('Error', "<h1>Can't connect</h1><p>Unknown OAuth client.</p>");

  const user = await userFromCookieHeader({ header: request.headers.get('cookie'), db: env.DB });
  const here = `${url.pathname}${url.search}`;
  if (!user) return signInPage(here, url.protocol === 'https:');

  if (request.method !== 'POST') return consentPage(here, client.clientName || 'This app', user.email);

  // The session cookie is SameSite=Lax, so a cross-site POST arrives signed out
  // and never gets here; the Origin check is the second lock on the same door.
  if (request.headers.get('origin') !== url.origin) return new Response('Bad origin', { status: 403 });
  const form = await request.formData();
  if (form.get('decision') !== 'allow') return errorRedirect(oauthRequest, 'access_denied');

  const props: McpProps = { userId: user.id, email: user.email };
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthRequest,
    userId: user.id,
    metadata: { clientName: client.clientName },
    scope: oauthRequest.scope,
    props,
  });
  return Response.redirect(redirectTo, 302);
}
