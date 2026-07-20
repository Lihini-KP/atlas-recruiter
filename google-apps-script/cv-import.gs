/**
 * ATLAS Recruiter — CV import from Gmail.
 *
 * Why this exists: the Gmail connector available inside Claude Code can search/read
 * email but cannot download attachment file bytes. Google Apps Script, running
 * directly inside Gmail, has full native attachment access — so this does the actual
 * automated import that the chat-side connector can't.
 *
 * Setup (one-time):
 * 1. Go to https://script.google.com while logged in as hra@esilkroute.com.lk.
 * 2. New project → delete the default `myFunction` stub → paste this whole file in.
 * 3. Project Settings (gear icon, left sidebar) → Script Properties → add:
 *      SUPABASE_URL = https://yrztitqsjzdhamomrurl.supabase.co
 *      SUPABASE_SERVICE_ROLE_KEY = <the secret key — never paste it into the script
 *      body itself, only into this Script Properties field>
 * 4. Run ▸ select `importCvsFromGmail` ▸ click Run once to trigger the Google
 *    authorization prompt (grant it — it's your own script on your own mailbox).
 * 5. Triggers (clock icon, left sidebar) → Add Trigger → function
 *    `importCvsFromGmail` → Time-driven → Hour timer → every hour → Save.
 */

const CV_LABEL_NAME = 'ATLAS-Filed';
const SEARCH_QUERY = 'to:hra@esilkroute.com.lk has:attachment newer_than:3d -label:' + CV_LABEL_NAME;

function importCvsFromGmail() {
  const props = PropertiesService.getScriptProperties();
  const SUPABASE_URL = props.getProperty('SUPABASE_URL');
  const SERVICE_KEY = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Script Properties first.');
  }

  let label = GmailApp.getUserLabelByName(CV_LABEL_NAME);
  if (!label) label = GmailApp.createLabel(CV_LABEL_NAME);

  const threads = GmailApp.search(SEARCH_QUERY, 0, 50);
  let imported = 0, skippedDup = 0, skippedNonApp = 0;

  threads.forEach((thread) => {
    thread.getMessages().forEach((message) => {
      const messageId = message.getId();
      const subject = message.getSubject() || '';
      const body = message.getPlainBody() || '';

      if (!looksLikeApplication(subject, body)) {
        skippedNonApp++;
        return;
      }

      if (candidateAlreadyImported(SUPABASE_URL, SERVICE_KEY, messageId)) {
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

      uploadToSupabaseStorage(SUPABASE_URL, SERVICE_KEY, path, attachment);
      insertCandidateRow(SUPABASE_URL, SERVICE_KEY, {
        full_name: senderName,
        email: senderEmail,
        cv_storage_path: path,
        status: 'unmatched',
        source: 'email_import',
        source_email_id: messageId,
        source_subject: subject,
      });

      thread.addLabel(label);
      imported++;
    });
  });

  Logger.log('Imported: ' + imported + ', duplicates skipped: ' + skippedDup + ', non-applications skipped: ' + skippedNonApp);
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

function candidateAlreadyImported(url, key, messageId) {
  const resp = UrlFetchApp.fetch(
    url + '/rest/v1/candidates?source_email_id=eq.' + encodeURIComponent(messageId) + '&select=id',
    {
      method: 'get',
      headers: { apikey: key, Authorization: 'Bearer ' + key },
      muteHttpExceptions: true,
    }
  );
  const data = JSON.parse(resp.getContentText());
  return Array.isArray(data) && data.length > 0;
}

function uploadToSupabaseStorage(url, key, path, blob) {
  const resp = UrlFetchApp.fetch(url + '/storage/v1/object/cvs/' + path, {
    method: 'post',
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    contentType: blob.getContentType(),
    payload: blob.getBytes(),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('Storage upload failed: ' + resp.getContentText());
  }
}

function insertCandidateRow(url, key, row) {
  const resp = UrlFetchApp.fetch(url + '/rest/v1/candidates', {
    method: 'post',
    headers: { apikey: key, Authorization: 'Bearer ' + key, Prefer: 'return=minimal' },
    contentType: 'application/json',
    payload: JSON.stringify(row),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('Candidate insert failed: ' + resp.getContentText());
  }
}
