// Alex Recruitment Agent — shared Supabase client.
// Uses the PUBLISHABLE (anon) key only — this file is loaded in the browser.
// Never put the secret key here; RLS policies (see supabase/schema.sql) are what
// actually restrict access, not the secrecy of this key.
//
// TODO: replace the two placeholders below with your project's values
// (Supabase dashboard → Project Settings → API).
const SUPABASE_URL = 'REPLACE_WITH_SUPABASE_PROJECT_URL';
const SUPABASE_PUBLISHABLE_KEY = 'REPLACE_WITH_SUPABASE_PUBLISHABLE_KEY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
