# Recruiter — ATLAS Recruitment Agent (Alex)

Standalone app for Silk Route/Silk Foods Ceylon's recruitment workflow. Static HTML +
Netlify functions, zero build step, no npm dependencies. Supabase (Postgres + Auth +
Storage, RLS-enforced) is the datastore. A companion Google Apps Script project
handles the Gmail-side automation that Netlify functions can't do directly.

## Modules (in pipeline order)

| Page | What it does |
|---|---|
| `index.html` | New Recruitment Request — intake form (`department_manager`/`admin`) |
| `hr-review.html` | HR Review — approve/reject/hold a request; on approval, generates a job-ad poster image client-side (`lib/generate-poster.js` + `lib/poster-templates.js` + `lib/company-styles.js`) from HR-entered fields |
| `advertisement.html` | Advertisement — view/manage generated posters and their platform variants (LinkedIn, TopJobs, XpressJobs, Facebook Jobs, careers page) |
| `cv-folder.html` | CV Folder — triage CVs auto-imported from Gmail (see `google-apps-script/cv-import.gs`) into the right recruitment request or a manual folder |
| `assessment.html` | Public candidate-facing assessment form (no auth) — submits via `netlify/functions/submit-assessment.js`, which emails HR |
| `candidate-assessment.html` | HR-facing view of submitted assessments, plus AI CV field extraction (location/education/experience) via `netlify/functions/analyze-candidate-cv.js` |
| `candidate-pipeline.html` | Candidate Pipeline — kanban across recruitment stages; triggers interview scheduling (`google-apps-script/interview-scheduler.gs`, deployed as its own web app) |
| `interview.html` | Interview — scorecards and interview outcome, routes to Offer Letter on selection |
| `offer-letter.html` | Offer Letter — generates/sends the offer PDF; manually-sent offers (outside the app) are also caught and recorded via `google-apps-script/sync-sent-offers.gs` |
| `dashboard.html` | Recruitment Dashboard — overview/KPIs |
| `module-pending.html` | "Coming Soon" placeholder used by Hiring, Onboarding, and Reports — **these three are still stubs**, not built yet |

Navigation and role gating live in `lib/sidebar.js`. Auth is Supabase-session-based via
`lib/supabase-client.js` + `lib/auth-guard.js` + `login.html`.

## Tech

- Static HTML pages, no framework, no bundler.
- `netlify/functions/` — plain CommonJS (`exports.handler`) Netlify Functions, `node_bundler = "esbuild"`.
- Supabase: schema + RLS policies live in `supabase/schema.sql` — a single evolving file (see its header comment). It is **not** applied automatically by any CI/deploy step in this repo; it's run manually against the project (Supabase SQL editor, or `supabase db push` once the CLI is linked).
- `google-apps-script/` — three files sharing one Apps Script project, running as a Gmail-side bot account (`hra@esilkroute.com.lk`):
  - `cv-import.gs` — polls Gmail for CV submissions, downloads attachments (something the chat-side Gmail connector can't do), creates/matches candidates, sends the applicant a thank-you email.
  - `interview-scheduler.gs` — deployed separately as a web app; creates a Google Meet + calendar invite when `candidate-pipeline.html` schedules an interview.
  - `sync-sent-offers.gs` — detects offer letters sent manually through Gmail (outside the app) and records them so they still appear in the Offer Letter tab.

## Local development

No build step. Serve the HTML + `netlify/functions/` with `netlify dev` once the
Netlify CLI is linked to a site, or open a page directly for UI-only iteration
(functions will 404 until a dev server or deployed site is running).

Tests: `node --test` (runs `netlify/functions/_lib/*.test.js` — launch-token
verification and the SPINE task-body builder).

## Required environment variables

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL, used server-side by functions that call Supabase directly |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key for server-side functions (`sso-bridge.js`, `atlas-recruiter-pulse.js`, `analyze-candidate-cv.js`) — bypasses RLS, never exposed client-side |
| `ANTHROPIC_API_KEY` | Calls Claude for AI CV field extraction (`netlify/functions/analyze-candidate-cv.js`); also set in Apps Script Script Properties for offer-email parsing in `sync-sent-offers.gs` |
| `RESEND_API_KEY` | Sends candidate/HR notification emails via [Resend](https://resend.com) (`submit-assessment.js`, `send-candidate-thankyou.js`) |
| `RESEND_FROM` | Verified sending address for outbound mail (e.g. `alex@esilkroute.com.lk`) |
| `HR_EMAIL` | Optional — defaults to `hra@esilkroute.com.lk` |
| `SSO_DEFAULT_ROLE` | Optional — role assigned to a profile auto-created via SPINE SSO; defaults to `hr` |

Set these in Netlify environment variables once a site is created — never commit them.

## SPINE integration secrets

Set these in Netlify environment variables (names only — values are set out-of-band by
whoever holds SPINE's env, never committed here):

| Variable | Purpose |
|---|---|
| `ATLAS_BRIDGE_SECRET` | HMAC secret SPINE signs launch tokens with, verified by `netlify/functions/sso-bridge.js` — **required now** |
| `APP_TASK_SECRET` | Shared secret SPINE's `app-task` endpoint checks via `x-app-secret`, used by `netlify/functions/atlas-task.js` to push requisition/offer approval tasks — **required for Stage 2** |
| `ATLAS_AGENT_TOKEN` | Bearer token for SPINE's `atlas-agent-run` endpoint, used by `netlify/functions/atlas-recruiter-pulse.js` (daily KPI pulse) — **required for Stage 2** |
| `RECRUITMENT_APPROVER_EMAIL` | Optional — who requisition/offer approval tasks are assigned to. Defaults to `sahan@esilkroute.com.lk` |

**`ATLAS_AGENT_TOKEN` must ALSO be set in the Google Apps Script project's Script
Properties** (Project Settings → Script Properties), separately from the Netlify env
var above — the two are not shared. It's read by the `reportRun_()` helper in
`google-apps-script/cv-import.gs` (reused by `sync-sent-offers.gs`) to report the
CV-import and offer-sync bot runs to ATLAS.

What SPINE integration actually covers here:

- **SSO (Pattern C, Stage 1)** — a SPINE tile launch drops a one-time `#srv_token`;
  `netlify/functions/sso-bridge.js` verifies it and mints a Supabase magic-link
  token, redeemed client-side by `lib/sso.js` before `lib/auth-guard.js`'s normal
  login check runs.
- **Two-way ATLAS approval tasks (Stage 2)** — `lib/atlas-task.js` (client) calls
  `netlify/functions/atlas-task.js` (server, holds `APP_TASK_SECRET`) to open/resolve
  approval tasks in SPINE for recruitment-request and offer-letter approvals.
- **Agent-run reporting** — both the daily pulse (`atlas-recruiter-pulse.js`) and the
  Apps Script bots (`cv-import.gs`, `sync-sent-offers.gs`) report their runs to
  SPINE's `atlas-agent-run` endpoint.
- **Daily SAGE pulse** — `netlify/functions/atlas-recruiter-pulse.js`, scheduled via
  `netlify.toml` (`schedule = "@daily"`), reports flat recruitment KPIs to ATLAS.
