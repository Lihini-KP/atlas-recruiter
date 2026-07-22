# Recruiter — ATLAS Recruitment Agent (Alex)

Standalone app for Silk Route/Silk Foods Ceylon's recruitment workflow. Built to match the
`srv-dashboard` precedent: static HTML + Netlify functions, zero build step, no npm dependencies.

## Current scope (Phase 1)

- Recruitment request intake form (`index.html`)
- AI-generated job advertisement via Claude (`netlify/functions/generate-ad.js`), with
  platform-formatted variants for LinkedIn, TopJobs, XpressJobs, Facebook Jobs and the careers page
- Email to HR with the request details and the ad attached (`netlify/functions/notify-hr.js`)

Not yet built (deferred pending direction): recruitment folder/document storage, automated CV
inbox monitoring, candidate profiles, assessments, and the recruitment dashboard — these need a
storage/Supabase decision before they can be designed.

## Required environment variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Calls Claude to generate the job advertisement |
| `RESEND_API_KEY` | Sends the HR notification email via [Resend](https://resend.com) |
| `RESEND_FROM` | Verified sending address for outbound mail (e.g. `alex@esilkroute.com.lk`) |
| `HR_EMAIL` | Optional — defaults to `hra@esilkroute.com.lk` |

Set these in Netlify environment variables once a site is created — never commit them.

## Local development

No build step. Serve `index.html` + `netlify/functions/` with `netlify dev` once the Netlify CLI
is linked to a site, or open `index.html` directly for UI-only iteration (the two functions will
404 until a Netlify dev server or deployed site is running).

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
