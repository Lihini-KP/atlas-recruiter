// Alex Recruitment Agent — shared Supabase client.
// Uses the PUBLISHABLE (anon) key only — this file is loaded in the browser.
// Never put the secret key here; RLS policies (see supabase/schema.sql) are what
// actually restrict access, not the secrecy of this key.
//
// TODO: replace the two placeholders below with your project's values
// (Supabase dashboard → Project Settings → API).
const SUPABASE_URL = 'https://yrztitqsjzdhamomrurl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_B4aLeP-6Ulc_2ddAeGUYjA__xNHxNJp';

// Named `sb`, not `supabase` — the CDN bundle already declares a global called
// `supabase` (the library namespace), and a top-level `const supabase = ...` in a
// classic script silently collides with it (SyntaxError: Identifier has already
// been declared), so nothing in this file would run at all.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
