'use strict';
/* Google Calendar sync — LOG-ONLY until the GOOGLE_* vars in .env are set
   (setup steps documented there). Talks straight to the Calendar REST API
   with an OAuth refresh token; no SDK dependency. Failures are logged and
   never block a booking. */

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
const CAL_ID_RAW = process.env.GOOGLE_CALENDAR_ID || 'primary';
const CAL_ID = encodeURIComponent(CAL_ID_RAW);
const TZ = process.env.BUSINESS_TZ || 'America/New_York';
const enabled = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN);

console.log(enabled
  ? '[calendar] Google Calendar sync enabled.'
  : '[calendar] No Google credentials — calendar sync in LOG-ONLY mode.');

/* Bookable slots: label shown on the site -> 24h start time. 90-minute visits. */
const SLOTS = { '8:00a': '08:00', '9:30a': '09:30', '11:00a': '11:00', '1:00p': '13:00', '2:30p': '14:30', '4:00p': '16:00' };
const APPT_MIN = 90;

let tok = { value: null, exp: 0 };
async function accessToken() {
  if (tok.value && Date.now() < tok.exp - 60000) return tok.value;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error('Google token refresh failed: HTTP ' + r.status);
  const d = await r.json();
  tok = { value: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return tok.value;
}

function addMinutes(hhmm, min) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + min;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

/* Google accepts a naive local dateTime + explicit timeZone — no server-TZ dependence. */
function slotWindow(date, slotLabel) {
  const start = SLOTS[slotLabel] || '09:00';
  return {
    start: { dateTime: `${date}T${start}:00`, timeZone: TZ },
    end: { dateTime: `${date}T${addMinutes(start, APPT_MIN)}:00`, timeZone: TZ },
  };
}

async function createEvent(lead) {
  if (!lead.appt_date) return null;
  const summary = `Estimate — ${lead.name || 'lead'} (${lead.project_type || 'painting'})`;
  if (!enabled) {
    console.log(`[calendar] log-only: would create "${summary}" on ${lead.appt_date} ${lead.appt_time || ''}`);
    return null;
  }
  const body = {
    summary,
    location: lead.address || undefined,
    description: `${lead.appt_type || 'Estimate visit'}\nPhone: ${lead.phone || '—'}\nEmail: ${lead.email || '—'}\nLead #${lead.id} → /admin/lead.html?id=${lead.id}`,
    ...slotWindow(lead.appt_date, lead.appt_time),
  };
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${CAL_ID}/events`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('Calendar event create failed: HTTP ' + r.status);
  return (await r.json()).id;
}

async function updateEvent(lead) {
  if (!lead.gcal_event_id) return createEvent(lead);
  if (!enabled) {
    console.log(`[calendar] log-only: would move event for lead #${lead.id} to ${lead.appt_date} ${lead.appt_time || ''}`);
    return lead.gcal_event_id;
  }
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${CAL_ID}/events/${lead.gcal_event_id}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify(slotWindow(lead.appt_date, lead.appt_time)),
  });
  if (!r.ok) throw new Error('Calendar event update failed: HTTP ' + r.status);
  return lead.gcal_event_id;
}

/* Busy windows for the availability feed. Empty when not connected. */
async function busyWindows(timeMinISO, timeMaxISO) {
  if (!enabled) return [];
  const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin: timeMinISO, timeMax: timeMaxISO, items: [{ id: CAL_ID_RAW }] }),
  });
  if (!r.ok) throw new Error('freeBusy failed: HTTP ' + r.status);
  const d = await r.json();
  return (d.calendars && d.calendars[CAL_ID_RAW] && d.calendars[CAL_ID_RAW].busy) || [];
}

module.exports = { enabled, SLOTS, APPT_MIN, TZ, createEvent, updateEvent, busyWindows };
