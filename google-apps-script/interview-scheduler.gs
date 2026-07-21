/**
 * ATLAS Recruiter — Interview scheduling (Google Meet + auto email invite).
 *
 * Add this as a SECOND FILE in the SAME Apps Script project as cv-import.gs (File →
 * New → Script), so it shares that project's identity (hra@esilkroute.com.lk) and
 * doesn't need separate authorization.
 *
 * Setup (one-time, in addition to cv-import.gs's setup):
 * 1. Left sidebar → Services (+ icon) → find "Calendar API" → Add. This enables the
 *    advanced Calendar service so we can request a real Google Meet link (the basic
 *    CalendarApp service can't reliably add one).
 * 2. Deploy ▸ New deployment ▸ gear icon ▸ type "Web app" ▸ Execute as "Me" ▸
 *    Who has access: "Anyone" ▸ Deploy. Authorize it when prompted.
 * 3. Copy the Web app URL it gives you (ends in /exec) — that's what the front-end
 *    (candidate-pipeline.html) calls to schedule an interview. Give this URL to
 *    whoever is wiring up the front-end constant APPS_SCRIPT_WEBAPP_URL.
 * 4. Whenever you edit this file, you must create a NEW deployment (or "Manage
 *    deployments" → edit → new version) for the change to take effect — saving the
 *    file alone does not update a live Web app deployment.
 */

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.action === 'scheduleInterview') {
      const result = scheduleInterview(body);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, ...result })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Unknown action' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

function scheduleInterview(body) {
  const { candidateEmail, candidateName, startIso, durationMinutes } = body;
  if (!candidateEmail || !startIso) {
    throw new Error('candidateEmail and startIso are required');
  }

  const duration = durationMinutes || 30;
  const start = new Date(startIso);
  const end = new Date(start.getTime() + duration * 60000);

  const event = {
    summary: 'Interview — ' + (candidateName || candidateEmail),
    description: 'Interview scheduled via ATLAS Recruiter. Please join using the Google Meet link on this invite.',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees: [{ email: candidateEmail }],
    conferenceData: {
      createRequest: {
        requestId: Utilities.getUuid(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };

  // sendUpdates: 'all' is what makes Calendar automatically email the candidate
  // their invite (with the Meet link) — no separate email-sending code needed here.
  const created = Calendar.Events.insert(event, 'primary', { sendUpdates: 'all', conferenceDataVersion: 1 });

  const meetingLink =
    created.hangoutLink ||
    (created.conferenceData && created.conferenceData.entryPoints && created.conferenceData.entryPoints[0].uri) ||
    null;

  return {
    meetingLink: meetingLink,
    eventId: created.id,
    start: created.start.dateTime,
    end: created.end.dateTime,
  };
}
