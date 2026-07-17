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
  'applied', 'assessment_pending', 'assessment_completed', 'shortlisted',
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
  recruitment_request_id uuid not null references recruitment_requests(id),
  first_name text,
  last_name text,
  full_name text,
  nic_passport text,
  email text,
  phone text,
  address text,
  cv_storage_path text,
  status candidate_status not null default 'applied',
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

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table companies enable row level security;
alter table profiles enable row level security;
alter table recruitment_requests enable row level security;
alter table audit_log enable row level security;

create policy "companies readable by any authenticated user"
  on companies for select
  using (auth.role() = 'authenticated');

create policy "profiles readable by self, hr, admin"
  on profiles for select
  using (
    id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('hr', 'admin'))
  );

create policy "recruitment_requests readable by requester, hr, ceo, admin"
  on recruitment_requests for select
  using (
    requested_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('hr', 'ceo', 'admin'))
  );

create policy "department_manager can insert their own requests"
  on recruitment_requests for insert
  with check (
    requested_by = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('department_manager', 'admin'))
  );

create policy "hr can move draft/pending_approval requests"
  on recruitment_requests for update
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('hr', 'admin'))
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('hr', 'admin'))
  );

create policy "ceo can approve/reject pending requests"
  on recruitment_requests for update
  using (
    status = 'pending_approval'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ceo', 'admin'))
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ceo', 'admin'))
  );

create policy "audit_log insert by any authenticated user, read by hr/admin"
  on audit_log for insert
  with check (auth.role() = 'authenticated');

create policy "audit_log readable by hr, admin"
  on audit_log for select
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('hr', 'admin'))
  );
