// Alex Recruitment Agent — SPINE SSO bootstrap (Pattern C, Stage 1).
// Redeems a one-time #srv_token fragment (dropped by a SPINE tile launch) for a real,
// persisted Supabase session, before auth-guard.js's "no session" redirect runs.
// Include after lib/supabase-client.js (needs `sb`) and before lib/auth-guard.js:
//
//   <script src="lib/supabase-client.js"></script>
//   <script src="lib/sso.js"></script>
//   <script src="lib/auth-guard.js"></script>
//
// If there's no #srv_token (the normal case — most page loads), this resolves immediately
// and auth-guard.js's existing login flow is untouched.

window.ssoReady = (async () => {
  const h = new URLSearchParams(location.hash.slice(1));
  const tok = h.get('srv_token');
  if (!tok) return;

  // Strip the token from the URL immediately — before any network call or redirect — so
  // it never lingers in browser history, address bar, or gets forwarded as a referrer.
  history.replaceState(null, '', location.pathname + location.search);

  try {
    const res = await fetch('/.netlify/functions/sso-bridge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tok }),
    });
    if (!res.ok) {
      console.warn('SPINE SSO: bridge rejected the launch token, falling back to normal login');
      return;
    }

    const { token_hash } = await res.json();
    if (!token_hash) {
      console.warn('SPINE SSO: bridge did not return a session token, falling back to normal login');
      return;
    }

    const { error } = await sb.auth.verifyOtp({ token_hash, type: 'magiclink' });
    if (error) {
      console.warn('SPINE SSO: session verification failed, falling back to normal login');
    }
  } catch {
    // A failure here just means the user falls through to the normal login page —
    // never log the token itself.
    console.warn('SPINE SSO: bridge request failed, falling back to normal login');
  }
})();
