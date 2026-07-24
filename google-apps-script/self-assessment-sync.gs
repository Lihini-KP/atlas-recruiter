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
 * 2. Run ▸ select `sendSelfAssessmentEmails` ▸ click Run once to test.
 * 3. Triggers → Add Trigger → function `sendSelfAssessmentEmails` → Time-driven →
 *    Hour timer → every hour → Save.
 */

function sendSelfAssessmentEmails() {
  let sent = 0, skipped = 0;

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
  }
}

function fetchShortlistedAwaitingSelfAssessment(url, publishableKey, accessToken) {
  const resp = UrlFetchApp.fetch(
    url + '/rest/v1/candidates?status=eq.shortlisted&self_assessment_sent_at=is.null' +
      '&select=id,email,full_name,recruitment_requests(designation),manual_folders(designation)',
    {
      method: 'get',
      headers: { apikey: publishableKey, Authorization: 'Bearer ' + accessToken, 'User-Agent': SERVER_USER_AGENT },
      muteHttpExceptions: true,
    }
  );
  const data = JSON.parse(resp.getContentText());
  return Array.isArray(data) ? data : [];
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
