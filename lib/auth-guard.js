// Alex Recruitment Agent — auth guard for internal pages.
// Include after supabase-client.js. Redirects to login.html if there's no session,
// otherwise fetches the caller's profiles row and resolves window.authReady with it.
//
// Usage in a page:
//   <script src="lib/supabase-client.js"></script>
//   <script src="lib/sso.js"></script>
//   <script src="lib/auth-guard.js"></script>
//   <script>
//     window.authReady.then((profile) => { window.currentProfile = profile; /* render */ });
//   </script>

window.authReady = (async () => {
  let { data: { session } } = await sb.auth.getSession();

  if (!session) {
    // No session yet — give the SPINE SSO bridge (lib/sso.js) a chance to redeem a
    // #srv_token into a real session before giving up and sending the user to login.
    if (window.ssoReady) {
      try { await window.ssoReady; } catch {}
    }
    ({ data: { session } } = await sb.auth.getSession());
  }

  if (!session) {
    location.href = 'login.html';
    return null;
  }

  const { data: profile, error } = await sb
    .from('profiles')
    .select('id, full_name, email, role, department')
    .eq('id', session.user.id)
    .single();

  if (error || !profile) {
    // Signed in to Supabase Auth but no profiles row provisioned yet.
    document.body.innerHTML =
      '<p style="padding:32px;font-family:sans-serif">Your account has no ATLAS profile yet. Ask an admin to create one for you.</p>';
    throw error || new Error('No profile found');
  }

  window.currentProfile = profile;
  return profile;
})();

async function atlasSignOut() {
  await sb.auth.signOut();
  location.href = 'login.html';
}
