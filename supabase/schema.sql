-- Alex Recruitment Agent — Phase 0 schema
-- Run this in the Supabase SQL editor (or `supabase db push` once the CLI is linked).
-- Tables for later phases are declared now so the ERD is whole, but stay unused until
-- their phase lands (advertisements, candidates, assessments, ai_analysis, interviews,
-- offers, hires).

-- ── Enums ────────────────────────────────────────────────────────────────────
create type profile_role as enum (
  'department_manager', 'hr', 'ceo', 'interviewer', 'it', 'finance', 'admin'
);

create type employment_type as enum (
  'Permanent', 'Contract', 'Internship', 'Part Time', 'Temporary'
);

create type request_priority as enum ('Low', 'Medium', 'High', 'Urgent');

create type request_reason as enum (
  'New Position', 'Replacement', 'Expansion', 'Internal Transfer', 'Other'
);

create type request_status as enum (
  'draft', 'pending_approval', 'approved', 'rejected', 'on_hold', 'completed'
);

create type candidate_status as enum (
  'unmatched', 'applied', 'assessment_pending', 'assessment_completed', 'shortlisted',
  'interview_scheduled', 'interviewed', 'rejected', 'offer_sent', 'hired'
);

-- ── Core tables ──────────────────────────────────────────────────────────────
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique, -- e.g. 'SFC', 'SRV', 'AN' — used for logo lookup + folder paths
  created_at timestamptz not null default now()
);

insert into companies (name, code) values
  ('Silk Food Ceylon (Pvt) Ltd', 'SFC'),
  ('Silk Route Ventures (Pvt) Ltd', 'SRV'),
  ('Ancient Nutraceuticals (Pvt) Ltd', 'AN');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role profile_role not null,
  department text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recruitment_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  department text not null,
  designation text not null,
  vacancies int not null default 1,
  employment_type employment_type not null,
  work_location text not null,
  reporting_manager text not null,
  salary_range text,
  required_experience text not null,
  required_qualifications text not null,
  preferred_gender text,
  preferred_age_range text,
  requested_by uuid not null references profiles(id),
  request_date date not null default current_date,
  priority request_priority not null default 'Medium',
  reason request_reason not null,
  reason_other_text text,
  additional_remarks text,
  status request_status not null default 'draft',
  hr_reviewed_by uuid references profiles(id),
  hr_reviewed_at timestamptz,
  ceo_approved_by uuid references profiles(id),
  ceo_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- ── Placeholder tables for later phases (unused until their phase) ──────────
create table advertisements (
  id uuid primary key default gen_random_uuid(),
  recruitment_request_id uuid not null references recruitment_requests(id),
  company_intro text,
  responsibilities text[],
  qualifications text[],
  skills text[],
  benefits text[],
  closing_date date,
  platform_variants jsonb,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table candidates (
  id uuid primary key default gen_random_uuid(),
  recruitment_request_id uuid references recruitment_requests(id), -- null until matched (e.g. an emailed CV before HR assigns it)
  first_name text,
  last_name text,
  full_name text,
  nic_passport text,
  email text,
  phone text,
  address text,
  cv_storage_path text,
  status candidate_status not null default 'applied',
  source text, -- e.g. 'email_import', 'application_portal'
  source_email_id text, -- Gmail message id, for de-duplication on re-runs
  source_subject text,
  location text, -- AI-extracted from the CV (see analyze-candidate-cv.js)
  education text, -- AI-extracted from the CV
  experience_summary text, -- AI-extracted from the CV
  cv_analyzed_at timestamptz,
  applied_at timestamptz not null default now()
);

create table assessments (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id),
  answers jsonb not null,
  submitted_at timestamptz not null default now()
);

create table ai_analysis (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id),
  overall_match numeric,
  technical_match numeric,
  experience_match numeric,
  qualification_match numeric,
  skill_match numeric,
  communication_score numeric,
  leadership_score numeric,
  culture_fit text,
  risk_level text,
  strengths text[],
  weaknesses text[],
  missing_skills text[],
  recommendation text,
  created_at timestamptz not null default now()
);

create table interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id),
  interview_type text,
  interviewers uuid[],
  scheduled_date date,
  scheduled_time time,
  meeting_link text,
  scorecard jsonb,
  overall_score numeric,
  recommendation text,
  created_at timestamptz not null default now()
);

create table offers (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id),
  salary text,
  designation text,
  department text,
  reporting_manager text,
  joining_date date,
  benefits text,
  notice_period text,
  probation text,
  pdf_storage_path text,
  sent_at timestamptz,
  accepted boolean,
  created_at timestamptz not null default now()
);

create table hires (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id),
  employee_id text,
  employee_folder_path text,
  onboarding_checklist jsonb,
  notified_hr boolean not null default false,
  notified_it boolean not null default false,
  notified_finance boolean not null default false,
  notified_manager boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Grants ───────────────────────────────────────────────────────────────────
-- RLS policies restrict WHICH rows a role can touch, but Postgres still requires a
-- base-level GRANT before a role can attempt the operation at all. Tables created via
-- the Supabase Table Editor UI get this automatically; tables created via raw SQL
-- (like this file) don't, and every query 403s with "permission denied" until granted.
grant usage on schema public to authenticated, anon;
grant select on public.companies to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.recruitment_requests to authenticated;
grant select, insert on public.audit_log to authenticated;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table companies enable row level security;
alter table profiles enable row level security;
alter table recruitment_requests enable row level security;
alter table audit_log enable row level security;

create policy "companies readable by any authenticated user"
  on companies for select
  using (auth.role() = 'authenticated');

-- security definer so this bypasses RLS internally — a policy on `profiles` that
-- queries `profiles` again via a plain subquery causes infinite recursion in Postgres.
create or replace function public.current_user_role()
returns profile_role
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create policy "profiles readable by self, hr, admin"
  on profiles for select
  using (
    id = auth.uid()
    or current_user_role() in ('hr', 'admin')
  );

create policy "recruitment_requests readable by requester, hr, ceo, admin"
  on recruitment_requests for select
  using (
    requested_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('hr', 'ceo', 'admin'))
  );

create policy "department_manager and admin can insert requests"
  on recruitment_requests for insert
  with check (
    current_user_role() = 'admin'
    or (requested_by = auth.uid() and current_user_role() = 'department_manager')
  );

create policy "hr can approve/reject/hold requests"
  on recruitment_requests for update
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('hr', 'admin'))
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('hr', 'admin'))
  );

create policy "audit_log insert by any authenticated user, read by hr/admin"
  on audit_log for insert
  with check (auth.role() = 'authenticated');

create policy "audit_log readable by hr, admin"
  on audit_log for select
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('hr', 'admin'))
  );

-- ── Phase 1: generated advertisement posters ─────────────────────────────────
alter table advertisements add column if not exists company_code text;
alter table advertisements add column if not exists designation text;
alter table advertisements add column if not exists poster_storage_path text;

grant select, insert on public.advertisements to authenticated;

create policy "advertisements readable by hr, admin"
  on advertisements for select
  using (current_user_role() in ('hr', 'admin'));

create policy "advertisements insertable by hr, admin"
  on advertisements for insert
  with check (current_user_role() in ('hr', 'admin'));

-- public bucket: generated job-ad posters are meant to be shared externally anyway
insert into storage.buckets (id, name, public)
values ('advertisements', 'advertisements', true)
on conflict (id) do nothing;

create policy "public read advertisements bucket"
  on storage.objects for select
  using (bucket_id = 'advertisements');

create policy "hr admin can upload to advertisements bucket"
  on storage.objects for insert
  with check (
    bucket_id = 'advertisements'
    and public.current_user_role() in ('hr', 'admin')
  );

-- ── CV Folder: candidates + CV storage ───────────────────────────────────────
-- 'unmatched' already added to candidate_status above; recruitment_request_id is
-- nullable and source/source_email_id/source_subject columns added for existing
-- installs that ran the original (pre-CV-Folder) version of this file.
alter table candidates alter column recruitment_request_id drop not null;
alter table candidates add column if not exists source text;
alter table candidates add column if not exists source_email_id text;
alter table candidates add column if not exists source_subject text;

grant select, insert, update on public.candidates to authenticated;

create policy "candidates readable by hr, admin"
  on candidates for select
  using (current_user_role() in ('hr', 'admin'));

create policy "candidates insertable by hr, admin"
  on candidates for insert
  with check (current_user_role() in ('hr', 'admin'));

create policy "candidates updatable by hr, admin"
  on candidates for update
  using (current_user_role() in ('hr', 'admin'))
  with check (current_user_role() in ('hr', 'admin'));

-- private bucket: CVs contain candidate PII, unlike the public job-ad posters
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;

create policy "hr admin can read cvs bucket"
  on storage.objects for select
  using (bucket_id = 'cvs' and public.current_user_role() in ('hr', 'admin'));

create policy "hr admin can upload to cvs bucket"
  on storage.objects for insert
  with check (bucket_id = 'cvs' and public.current_user_role() in ('hr', 'admin'));

-- needed for x-upsert:true overwriting an existing object at the same path
create policy "hr admin can update cvs bucket"
  on storage.objects for update
  using (bucket_id = 'cvs' and public.current_user_role() in ('hr', 'admin'))
  with check (bucket_id = 'cvs' and public.current_user_role() in ('hr', 'admin'));

-- ── Candidate Assessment summary view ────────────────────────────────────────
grant select, insert on public.assessments to authenticated;

create policy "assessments readable by hr, admin"
  on assessments for select
  using (current_user_role() in ('hr', 'admin'));

create policy "assessments insertable by hr, admin"
  on assessments for insert
  with check (current_user_role() in ('hr', 'admin'));

-- ── Candidate Pipeline: AI-extracted CV fields ───────────────────────────────
alter table candidates add column if not exists location text;
alter table candidates add column if not exists education text;
alter table candidates add column if not exists experience_summary text;
alter table candidates add column if not exists cv_analyzed_at timestamptz;

-- ── Candidate Pipeline: interview selection + scheduling ─────────────────────
alter table candidates add column if not exists interview_selection text; -- 'selected' | 'not_selected'

-- ── Interview tab: post-interview decision, routes to Offer Letter tab ───────
alter table candidates add column if not exists offer_selection text; -- 'selected' | 'not_selected'

grant select, insert, update on public.interviews to authenticated;

create policy "interviews readable by hr, admin"
  on interviews for select
  using (current_user_role() in ('hr', 'admin'));

create policy "interviews insertable by hr, admin"
  on interviews for insert
  with check (current_user_role() in ('hr', 'admin'));

create policy "interviews updatable by hr, admin"
  on interviews for update
  using (current_user_role() in ('hr', 'admin'))
  with check (current_user_role() in ('hr', 'admin'));

-- ── Offer Letter tab: sent-offer record, shown as a summary in that column ──
grant select, insert on public.offers to authenticated;

create policy "offers readable by hr, admin"
  on offers for select
  using (current_user_role() in ('hr', 'admin'));

create policy "offers insertable by hr, admin"
  on offers for insert
  with check (current_user_role() in ('hr', 'admin'));

-- ── CV Folder: manual folders for designations with no approved recruitment
-- request yet, so HR can still file/group emailed CVs by role.
create table manual_folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  designation text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table candidates add column if not exists manual_folder_id uuid references manual_folders(id);

alter table manual_folders enable row level security;

grant select, insert on public.manual_folders to authenticated;

create policy "manual_folders readable by hr, admin"
  on manual_folders for select
  using (current_user_role() in ('hr', 'admin'));

create policy "manual_folders insertable by hr, admin"
  on manual_folders for insert
  with check (current_user_role() in ('hr', 'admin'));
