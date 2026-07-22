// Alex Recruitment Agent — client-side helper for ATLAS two-way approval tasks
// (Stage 2). Posts to OUR OWN atlas-task proxy (never the SPINE secret — that stays
// server-side in netlify/functions/atlas-task.js), using the current Supabase
// session's access_token so the proxy can verify the caller before forwarding.
//
// BEST-EFFORT ONLY: every failure mode here is caught and logged, never thrown, so
// a SPINE outage can never block a requisition submit, HR approval, or offer action.
//
// Include after lib/supabase-client.js (needs `sb` for the session):
//   <script src="lib/supabase-client.js"></script>
//   ...
//   <script src="lib/atlas-task.js"></script>

async function postAtlasTask(payload) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      console.warn('ATLAS task skipped: no active session');
      return null;
    }

    const res = await fetch('/.netlify/functions/atlas-task', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn('ATLAS task request failed:', res.status);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.warn('ATLAS task request failed:', err);
    return null;
  }
}
