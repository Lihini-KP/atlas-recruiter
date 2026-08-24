/**
 * ATLAS Recruiter — auto-emails the Self Assessment link to newly-shortlisted
 * candidates (the second, deeper questionnaire, separate from the initial
 * assessment they filled in when they first applied).
 *
 * Add this as a FOURTH FILE in the SAME Apps Script project as cv-import.gs,
 * interview-scheduler.gs, and sync-sent-offers.gs (File → New → Script), so it
 * reuses that project's identity and the getBotAccessToken()/reportRun_() helpers
 * already defined in cv-import.gs.
 *
 * Setup (one-time, in addition to the other files' setup):
 * 1. No new Script Properties needed — reuses SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
 *    CV_BOT_EMAIL, CV_BOT_PASSWORD, ATLAS_AGENT_TOKEN already set for the other files.
 * 2. Run ▸ select `installSelfAssessmentTrigger` ▸ click Run once. This both
 *    creates the installable trigger AND wipes out any duplicate/misconfigured
 *    ones already sitting on the project (see incident note below) — do this
 *    INSTEAD OF manually adding a trigger through the Triggers UI.
 *
 * --- 2026-08-19 incident note (why the self-healing code below exists) -----
 * atlas.agent_runs (agent_id 49a82f7f-bc90-4306-9b2b-4cea65a0c919) shows this
 * function ran ~24x/day (hourly, as intended) from 2026-07-24 through
 * 2026-07-29, then jumped to ~1,463 runs/day (~61x/hour, i.e. an
 * every-1-minute trigger) from 2026-07-31 through 2026-08-12 — about 60x the
 * intended call volume for two weeks straight. That is what exhausted the
 * yrztitqsjzdhamomrurl (SRV-Workspace) Supabase project's bandwidth quota
 * ("Bandwidth quota exceeded ... try reducing the rate of data transfer" on
 * the /rest/v1/candidates call). Nothing in this repo's code ever set that
 * cadence — Apps Script installable triggers are configured by hand in the
 * Apps Script UI (Triggers → Add Trigger), outside version control, so a
 * one-off wrong click (or a duplicate trigger left over from a prior test)
 * is enough to cause this, and it is invisible to code review. The fix
 * below makes the function own its own trigger: every run first collapses
 * any triggers on itself down to exactly one, at the correct interval, so a
 * stray extra/misconfigured trigger self-corrects on the very next fire
 * instead of silently compounding for weeks.
 */

// How often this job is SUPPOSED to run. Keep in sync with
// atlas.agents.expected_cadence for 'atlas-recruiter-self-assessment-sync'
// (currently 'hourly' / cadence_seconds=3600).
var SELF_ASSESSMENT_TRIGGER_HOURS = 1;

// Hard cap on rows pulled per run — a correctness backstop, not the primary
// fix (the status=eq.shortlisted&self_assessment_sent_at=is.null filter
// should already keep this small under normal cadence). Bounds worst-case
// payload size if the queue ever backs up after an outage.
var SELF_ASSESSMENT_FETCH_LIMIT = 200;

function sendSelfAssessmentEmails() {
  let sent = 0, skipped = 0;

  // Collapse any duplicate/misconfigured triggers back to exactly one, at the
  // correct cadence, on every run — see the incident note above. Cheap
  // (ScriptApp.getProjectTriggers() is a local, quota-free call) and self-
  // healing: whichever of N duplicate triggers fires first fixes the rest
  // before they get a chance to fire.
  try {
    reconcileSelfAssessmentTrigger_();
  } catch (err) {
    Logger.log('reconcileSelfAssessmentTrigger_ failed (run continues): ' + err.message);
  }

  // Prevent overlapping executions (e.g. two triggers firing seconds apart
  // during the reconcile window) from double-sending or doubling REST calls.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log('sendSelfAssessmentEmails: another run already in progress, skipping this one.');
    return;
  }

  try {
    const props = PropertiesService.getScriptProperties();
    const SUPABASE_URL = props.getProperty('SUPABASE_URL');
    const PUBLISHABLE_KEY = props.getProperty('SUPABASE_PUBLISHABLE_KEY');
    const BOT_EMAIL = props.getProperty('CV_BOT_EMAIL');
    const BOT_PASSWORD = props.getProperty('CV_BOT_PASSWORD');
    if (!SUPABASE_URL || !PUBLISHABLE_KEY || !BOT_EMAIL || !BOT_PASSWORD) {
      throw new Error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CV_BOT_EMAIL and CV_BOT_PASSWORD in Script Properties first.');
    }

    const accessToken = getBotAccessToken(SUPABASE_URL, PUBLISHABLE_KEY, BOT_EMAIL, BOT_PASSWORD);
    const candidates = fetchShortlistedAwaitingSelfAssessment(SUPABASE_URL, PUBLISHABLE_KEY, accessToken);

    candidates.forEach((candidate) => {
      if (!candidate.email) { skipped++; return; }

      const designation =
        (candidate.recruitment_requests && candidate.recruitment_requests.designation) ||
        (candidate.manual_folders && candidate.manual_folders.designation) ||
        'the position you applied for';

      sendSelfAssessmentEmail(candidate.email, candidate.full_name, designation);
      markSelfAssessmentSent(SUPABASE_URL, PUBLISHABLE_KEY, accessToken, candidate.id);
      sent++;
    });

    Logger.log('Self assessment emails sent: ' + sent + ', skipped (no email on file): ' + skipped);
    reportRun_('atlas-recruiter-self-assessment-sync', 'success', 'sent ' + sent + ', skipped ' + skipped, { sent: sent, skipped: skipped });
  } catch (err) {
    reportRun_('atlas-recruiter-self-assessment-sync', 'failed', 'Self assessment sync failed: ' + err.message, { sent: sent, skipped: skipped }, (err && err.message) ? err.message : String(err));
    throw err;
  } finally {
    lock.releaseLock();
  }
}

// Ensures exactly one time-based trigger exists for sendSelfAssessmentEmails,
// at SELF_ASSESSMENT_TRIGGER_HOURS. Deletes any extras (the likely cause of
// the 2026-07-30..08-12 bandwidth incident — see note above) and (re)creates
// one if none exist, so this is also the one-time installer: run it directly
// from the Apps Script editor instead of using Triggers → Add Trigger by hand.
function reconcileSelfAssessmentTrigger_() {
  const triggers = ScriptApp.getProjectTriggers().filter(
    (t) => t.getHandlerFunction() === 'sendSelfAssessmentEmails'
  );

  if (triggers.length > 1) {
    Logger.log('Found ' + triggers.length + ' triggers for sendSelfAssessmentEmails, expected 1 — deleting extras.');
  }
  // Keep the first, delete the rest.
  triggers.slice(1).forEach((t) => ScriptApp.deleteTrigger(t));

  if (triggers.length === 0) {
    ScriptApp.newTrigger('sendSelfAssessmentEmails').timeBased().everyHours(SELF_ASSESSMENT_TRIGGER_HOURS).create();
    Logger.log('No trigger found for sendSelfAssessmentEmails — installed one at every ' + SELF_ASSESSMENT_TRIGGER_HOURS + 'h.');
  }
}

// One-time manual entry point — same effect as running reconcileSelfAssessmentTrigger_()
// once by hand, kept as a clearly-named function to `Run ▸ select` in the editor.
function installSelfAssessmentTrigger() {
  reconcileSelfAssessmentTrigger_();
  Logger.log('installSelfAssessmentTrigger: done. ' + ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sendSelfAssessmentEmails').length +
    ' trigger(s) now registered for sendSelfAssessmentEmails.');
}

function fetchShortlistedAwaitingSelfAssessment(url, publishableKey, accessToken) {
  const resp = UrlFetchApp.fetch(
    url + '/rest/v1/candidates?status=eq.shortlisted&self_assessment_sent_at=is.null' +
      '&select=id,email,full_name,recruitment_requests(designation),manual_folders(designation)' +
      '&order=applied_at.asc&limit=' + SELF_ASSESSMENT_FETCH_LIMIT,
    {
      method: 'get',
      headers: { apikey: publishableKey, Authorization: 'Bearer ' + accessToken, 'User-Agent': SERVER_USER_AGENT },
      muteHttpExceptions: true,
    }
  );
  const data = JSON.parse(resp.getContentText());
  if (!Array.isArray(data)) {
    // Quota errors, auth failures etc. come back as a JSON object, not an
    // array — surface them instead of silently treating them as "0 candidates".
    throw new Error('Unexpected response fetching candidates: ' + resp.getContentText());
  }
  return data;
}

function sendSelfAssessmentEmail(email, name, designationGuess) {
  const selfAssessmentUrl = APP_BASE_URL + '/self-assessment.html?position=' + encodeURIComponent(designationGuess) +
    '&name=' + encodeURIComponent(name || '') + '&email=' + encodeURIComponent(email);

  const body =
    'Dear ' + (name || 'Applicant') + ',\n\n' +
    'Congratulations — you have been shortlisted for the position of ' + designationGuess + '.\n\n' +
    'As the next step, please complete a short Self Assessment using the link below:\n' +
    selfAssessmentUrl + '\n\n' +
    'This helps us move faster towards scheduling your interview.\n\n' +
    'Kind Regards\n' +
    'Human Resources';

  MailApp.sendEmail({ to: email, subject: 'Self Assessment — Next Step in Your Application', body: body });
}

function markSelfAssessmentSent(url, publishableKey, accessToken, candidateId) {
  const resp = UrlFetchApp.fetch(url + '/rest/v1/candidates?id=eq.' + candidateId, {
    method: 'patch',
    headers: { apikey: publishableKey, Authorization: 'Bearer ' + accessToken, Prefer: 'return=minimal', 'User-Agent': SERVER_USER_AGENT },
    contentType: 'application/json',
    payload: JSON.stringify({ self_assessment_sent_at: new Date().toISOString() }),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('Marking self_assessment_sent_at failed: ' + resp.getContentText());
  }
}
