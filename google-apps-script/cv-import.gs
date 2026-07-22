/**
 * ATLAS Recruiter — CV import from Gmail.
 *
 * Why this exists: the Gmail connector available inside Claude Code can search/read
 * email but cannot download attachment file bytes. Google Apps Script, running
 * directly inside Gmail, has full native attachment access — so this does the actual
 * automated import that the chat-side connector can't.
 *
 * Auth approach: signs in as a dedicated low-privilege "bot" account (same as a normal
 * HR login) rather than using the Supabase secret/service-role key. Supabase blocks
 * secret-key requests that look like they come from a browser, and Apps Script's
 * requests trip that heuristic no matter what headers are set — a real authenticated
 * session token doesn't have that problem, and it's safer anyway (bounded by RLS,
 * not all-powerful).
 *
 * Setup (one-time):
 * 1. In Supabase, create a Supabase Auth user for the bot (e.g.
 *    cv-import-bot@esilkroute.com.lk) with a strong password, and give it a
 *    `profiles` row with role = 'hr' (same SQL pattern used for the other accounts).
 * 2. Go to https://script.google.com while logged in as hra@esilkroute.com.lk.
 * 3. New project → delete the default `myFunction` stub → paste this whole file in.
 * 4. Project Settings (gear icon, left sidebar) → Script Properties → add:
 *      SUPABASE_URL = https://yrztitqsjzdhamomrurl.supabase.co
 *      SUPABASE_PUBLISHABLE_KEY = sb_publishable_B4aLeP-6Ulc_2ddAeGUYjA__xNHxNJp
 *      CV_BOT_EMAIL = <the bot account's email>
 *      CV_BOT_PASSWORD = <the bot account's password>
 *      ATLAS_AGENT_TOKEN = <same value as Netlify's ATLAS_AGENT_TOKEN — set here
 *        separately, Script Properties are NOT shared with Netlify env vars>
 * 5. Run ▸ select `importCvsFromGmail` ▸ click Run once to trigger the Google
 *    authorization prompt (grant it — it's your own script on your own mailbox).
 * 6. Triggers (clock icon, left sidebar) → Add Trigger → function
 *    `importCvsFromGmail` → Time-driven → Hour timer → every hour → Save.
 */

const CV_LABEL_NAME = 'ATLAS-Filed';
const SEARCH_QUERY = 'to:hra@esilkroute.com.lk has:attachment newer_than:3d -label:' + CV_LABEL_NAME;
const APP_BASE_URL = 'https://atlas-recruiter.netlify.app';
const SERVER_USER_AGENT = 'AppsScript-ATLAS-CV-Import/1.0';

function importCvsFromGmail() {
  let imported = 0, skippedDup = 0, skippedNonApp = 0;

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

    let label = GmailApp.getUserLabelByName(CV_LABEL_NAME);
    if (!label) label = GmailApp.createLabel(CV_LABEL_NAME);

    const threads = GmailApp.search(SEARCH_QUERY, 0, 50);

    threads.forEach((thread) => {
      thread.getMessages().forEach((message) => {
        const messageId = message.getId();
        const subject = message.getSubject() || '';
        const body = message.getPlainBody() || '';

        if (!looksLikeApplication(subject, body)) {
          skippedNonApp++;
          return;
        }

        if (candidateAlreadyImported(SUPABASE_URL, PUBLISHABLE_KEY, accessToken, messageId)) {
          skippedDup++;
          thread.addLabel(label);
          return;
        }

        const attachment = pickCvAttachment(message);
        if (!attachment) {
          skippedNonApp++;
          return;
        }

        const senderName = extractSenderName(message.getFrom());
        const senderEmail = extractSenderEmail(message.getFrom());

        const now = new Date();
        const ext = extensionForMimeType(attachment.getContentType());
        const slug = slugify(senderName || senderEmail || 'candidate');
        const path = 'unmatched/' + now.getFullYear() + '/' + (now.getMonth() + 1) + '/' + slug + '-' + messageId + '.' + ext;

        uploadToSupabaseStorage(SUPABASE_URL, PUBLISHABLE_KEY, accessToken, path, attachment);
        insertCandidateRow(SUPABASE_URL, PUBLISHABLE_KEY, accessToken, {
          full_name: senderName,
          email: senderEmail,
          cv_storage_path: path,
          status: 'unmatched',
          source: 'email_import',
          source_email_id: messageId,
          source_subject: subject,
        });

        // Best-effort designation guess for the immediate acknowledgement email only —
        // this is NOT treated as a confirmed match; the candidate still lands in the
        // Unmatched queue for HR to properly assign to a real open position.
        const designationGuess = extractDesignationFromSubject(subject);
        sendThankYouEmail(senderEmail, senderName, designationGuess);

        thread.addLabel(label);
        imported++;
      });
    });

    const skipped = skippedDup + skippedNonApp;
    Logger.log('Imported: ' + imported + ', duplicates skipped: ' + skippedDup + ', non-applications skipped: ' + skippedNonApp);
    reportRun_('atlas-recruiter-cv-import', 'success', 'imported ' + imported + ', skipped ' + skipped, { imported: imported, skipped: skipped });
  } catch (err) {
    const skipped = skippedDup + skippedNonApp;
    reportRun_('atlas-recruiter-cv-import', 'failed', 'CV import failed: ' + err.message, { imported: imported, skipped: skipped }, (err && err.message) ? err.message : String(err));
    throw err;
  }
}

// ATLAS agent-run reporting (Stage 2). Mirrors SPINE's reportAgentRun one-shot helper
// (netlify/functions/_lib/agent-report.mjs in the spine repo): POST to
// atlas-agent-run?action=log with { agent_key, status, summary, metrics }, status is
// one of success|failed|partial (NOT 'error'). Wrapped in try/catch — a reporting
// hiccup must NEVER break the actual import/sync run. `error` is optional — pass the
// real failure reason on the failed path so ATLAS shows more than the summary string.
function reportRun_(agentKey, status, summary, metrics, error) {
  try {
    const token = PropertiesService.getScriptProperties().getProperty('ATLAS_AGENT_TOKEN');
    if (!token) {
      Logger.log('reportRun_ skipped: ATLAS_AGENT_TOKEN not set in Script Properties');
      return;
    }
    const payload = { agent_key: agentKey, status: status, summary: summary, metrics: metrics };
    if (error) payload.error = error;
    UrlFetchApp.fetch('https://srv-spine.netlify.app/.netlify/functions/atlas-agent-run?action=log', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } catch (err) {
    Logger.log('reportRun_ failed (run itself is unaffected): ' + err.message);
  }
}

function getBotAccessToken(url, publishableKey, email, password) {
  const resp = UrlFetchApp.fetch(url + '/auth/v1/token?grant_type=password', {
    method: 'post',
    headers: { apikey: publishableKey, 'User-Agent': SERVER_USER_AGENT },
    contentType: 'application/json',
    payload: JSON.stringify({ email: email, password: password }),
    muteHttpExceptions: true,
  });
  const data = JSON.parse(resp.getContentText());
  if (!data.access_token) {
    throw new Error('Bot login failed: ' + resp.getContentText());
  }
  return data.access_token;
}

function looksLikeApplication(subject, body) {
  const text = (subject + ' ' + body).toLowerCase();
  const positive = ['cv', 'resume', 'résumé', 'application for', 'applying for', 'job application'];
  const negative = [
    'reminder', 'overdue', 'task commander', 'weekly review', 'workforce report',
    'employment history check', 'reference check', 'background check',
  ];
  if (negative.some((n) => text.indexOf(n) !== -1)) return false;
  return positive.some((p) => text.indexOf(p) !== -1);
}

function pickCvAttachment(message) {
  const attachments = message.getAttachments();
  const pdf = attachments.find((a) => a.getContentType() === 'application/pdf');
  if (pdf) return pdf;
  return (
    attachments.find((a) => {
      const t = a.getContentType();
      return t === 'application/msword' || t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }) || null
  );
}

function extensionForMimeType(mimeType) {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'application/msword') return 'doc';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  return 'bin';
}

function extractDesignationFromSubject(subject) {
  let s = subject.trim();
  const prefixes = [
    /^cv\s+submission\s+for\s+/i,
    /^cv\s+for\s+/i,
    /^application\s+for\s+/i,
    /^job\s+application\s+for\s+/i,
    /^re:\s*/i,
  ];
  prefixes.forEach((p) => { s = s.replace(p, ''); });
  // Trim a trailing " - Candidate Name" style suffix some subjects include.
  s = s.replace(/\s*[-–—]\s*[A-Z][a-zA-Z.'\s]{2,40}$/, '');
  return s.trim() || 'the position you applied for';
}

function sendThankYouEmail(email, name, designationGuess) {
  if (!email) return;
  const assessmentUrl = APP_BASE_URL + '/assessment.html?position=' + encodeURIComponent(designationGuess) +
    '&name=' + encodeURIComponent(name || '') + '&email=' + encodeURIComponent(email);

  const body =
    'Dear ' + (name || 'Applicant') + ',\n\n' +
    'Thank you for applying for the position of ' + designationGuess + ' at our organization.\n\n' +
    'We have successfully received your application.\n\n' +
    'As the next step, please complete our short Candidate Assessment Form using the link below:\n' +
    assessmentUrl + '\n\n' +
    'This information helps us process your application faster.\n\n' +
    'Thank you again for your interest in joining our team.\n\n' +
    'Kind Regards\n' +
    'Human Resources';

  MailApp.sendEmail({ to: email, subject: 'Thank You for Applying', body: body });
}

function extractSenderName(from) {
  const match = from.match(/^"?([^"<]*)"?\s*<.*>$/);
  return match ? match[1].trim() : from;
}

function extractSenderEmail(from) {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

function slugify(text) {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function candidateAlreadyImported(url, publishableKey, accessToken, messageId) {
  const resp = UrlFetchApp.fetch(
    url + '/rest/v1/candidates?source_email_id=eq.' + encodeURIComponent(messageId) + '&select=id',
    {
      method: 'get',
      headers: { apikey: publishableKey, Authorization: 'Bearer ' + accessToken, 'User-Agent': SERVER_USER_AGENT },
      muteHttpExceptions: true,
    }
  );
  const data = JSON.parse(resp.getContentText());
  return Array.isArray(data) && data.length > 0;
}

function uploadToSupabaseStorage(url, publishableKey, accessToken, path, blob) {
  const resp = UrlFetchApp.fetch(url + '/storage/v1/object/cvs/' + path, {
    method: 'post',
    headers: { apikey: publishableKey, Authorization: 'Bearer ' + accessToken, 'User-Agent': SERVER_USER_AGENT, 'x-upsert': 'true' },
    contentType: blob.getContentType(),
    payload: blob.getBytes(),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('Storage upload failed: ' + resp.getContentText());
  }
}

function insertCandidateRow(url, publishableKey, accessToken, row) {
  const resp = UrlFetchApp.fetch(url + '/rest/v1/candidates', {
    method: 'post',
    headers: { apikey: publishableKey, Authorization: 'Bearer ' + accessToken, Prefer: 'return=minimal', 'User-Agent': SERVER_USER_AGENT },
    contentType: 'application/json',
    payload: JSON.stringify(row),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('Candidate insert failed: ' + resp.getContentText());
  }
}
