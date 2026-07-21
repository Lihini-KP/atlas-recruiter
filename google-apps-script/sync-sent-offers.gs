/**
 * ATLAS Recruiter — detects offer letters sent MANUALLY through Gmail (not through the
 * app's "Send Offer Letter" button) and records a summary in the same `offers` table,
 * so they still show up correctly in the Offer Letter tab's summary column.
 *
 * Add this as a THIRD FILE in the SAME Apps Script project as cv-import.gs and
 * interview-scheduler.gs (File → New → Script), so it reuses that project's identity
 * and the getBotAccessToken() helper already defined in cv-import.gs.
 *
 * Setup (one-time, in addition to the other two files' setup):
 * 1. Project Settings → Script Properties → add:
 *      ANTHROPIC_API_KEY = <same key used in Netlify>
 * 2. Run ▸ select `syncSentOffers` ▸ click Run once to authorize (grants access to
 *    your Sent mail, in addition to what cv-import.gs already authorized).
 * 3. Triggers → Add Trigger → function `syncSentOffers` → Time-driven → Hour timer →
 *    every hour → Save.
 */

function syncSentOffers() {
  const props = PropertiesService.getScriptProperties();
  const SUPABASE_URL = props.getProperty('SUPABASE_URL');
  const PUBLISHABLE_KEY = props.getProperty('SUPABASE_PUBLISHABLE_KEY');
  const BOT_EMAIL = props.getProperty('CV_BOT_EMAIL');
  const BOT_PASSWORD = props.getProperty('CV_BOT_PASSWORD');
  const ANTHROPIC_API_KEY = props.getProperty('ANTHROPIC_API_KEY');
  if (!SUPABASE_URL || !PUBLISHABLE_KEY || !BOT_EMAIL || !BOT_PASSWORD || !ANTHROPIC_API_KEY) {
    throw new Error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CV_BOT_EMAIL, CV_BOT_PASSWORD and ANTHROPIC_API_KEY in Script Properties first.');
  }

  const accessToken = getBotAccessToken(SUPABASE_URL, PUBLISHABLE_KEY, BOT_EMAIL, BOT_PASSWORD);

  const candidates = fetchCandidatesAwaitingOfferSync(SUPABASE_URL, PUBLISHABLE_KEY, accessToken);
  let recorded = 0, skipped = 0;

  candidates.forEach((candidate) => {
    if (!candidate.email) { skipped++; return; }

    const query = 'in:sent to:' + candidate.email + ' newer_than:30d';
    const threads = GmailApp.search(query, 0, 5);
    let found = null;

    for (const thread of threads) {
      const messages = thread.getMessages();
      for (const message of messages) {
        const text = (message.getSubject() + ' ' + message.getPlainBody()).toLowerCase();
        if (text.indexOf('offer') !== -1 && (text.indexOf('salary') !== -1 || text.indexOf('position') !== -1 || text.indexOf('pleased') !== -1)) {
          found = message;
          break;
        }
      }
      if (found) break;
    }

    if (!found) { skipped++; return; }

    const extracted = extractOfferDetails(ANTHROPIC_API_KEY, found.getPlainBody());
    insertOfferRecord(SUPABASE_URL, PUBLISHABLE_KEY, accessToken, {
      candidate_id: candidate.id,
      salary: extracted.salary,
      designation: extracted.designation,
      joining_date: extracted.joining_date,
      benefits: extracted.benefits,
      notice_period: extracted.notice_period,
      probation: extracted.probation,
      sent_at: found.getDate().toISOString(),
    });
    recorded++;
  });

  Logger.log('Recorded: ' + recorded + ', skipped (no matching sent email found): ' + skipped);
}

function fetchCandidatesAwaitingOfferSync(url, publishableKey, accessToken) {
  // Candidates marked ready for an offer, that don't already have an offers row —
  // avoids re-recording (and re-searching Gmail for) the same person every hour.
  const resp = UrlFetchApp.fetch(
    url + '/rest/v1/candidates?offer_selection=eq.selected&select=id,email,full_name,offers(id)',
    {
      method: 'get',
      headers: { apikey: publishableKey, Authorization: 'Bearer ' + accessToken, 'User-Agent': SERVER_USER_AGENT },
      muteHttpExceptions: true,
    }
  );
  const data = JSON.parse(resp.getContentText());
  if (!Array.isArray(data)) return [];
  return data.filter((c) => !c.offers || c.offers.length === 0);
}

function extractOfferDetails(apiKey, emailBody) {
  const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: 'Read this offer-letter email and return ONLY valid JSON (no markdown fences), with this exact shape: ' +
          '{"salary": string, "designation": string, "joining_date": string, "benefits": string, "notice_period": string, "probation": string}. ' +
          'Use "Not specified" for anything not mentioned. joining_date should be in YYYY-MM-DD format if a date is found, else "Not specified".\n\n' +
          'Email:\n' + emailBody,
      }],
    }),
    muteHttpExceptions: true,
  });

  const data = JSON.parse(resp.getContentText());
  const rawText = (data.content && data.content[0] && data.content[0].text) || '{}';
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    return { salary: 'Not specified', designation: 'Not specified', joining_date: null, benefits: 'Not specified', notice_period: 'Not specified', probation: 'Not specified' };
  }
}

function insertOfferRecord(url, publishableKey, accessToken, row) {
  const resp = UrlFetchApp.fetch(url + '/rest/v1/offers', {
    method: 'post',
    headers: { apikey: publishableKey, Authorization: 'Bearer ' + accessToken, Prefer: 'return=minimal', 'User-Agent': SERVER_USER_AGENT },
    contentType: 'application/json',
    payload: JSON.stringify(row),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('Offer insert failed: ' + resp.getContentText());
  }
}
