'use strict';
/* In-app automation engine. Runs hourly; each rule fires at most once per
   lead (tracked in automation_log, so restarts never double-send). All
   messaging honors the mailer's log-only mode until SMTP is configured. */
const { all, get, run, now } = require('./db');
const { sendMail, notifyOwner } = require('./mailer');

const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

function once(leadId, kind) {
  if (get('SELECT 1 FROM automation_log WHERE lead_id = ? AND kind = ?', leadId, kind)) return false;
  run('INSERT INTO automation_log (lead_id, kind, created_at) VALUES (?,?,?)', leadId, kind, now());
  return true;
}
function note(leadId, text) {
  run('INSERT INTO activity (lead_id, created_at, kind, text) VALUES (?,?,?,?)', leadId, now(), 'automation', text);
}

function tick() {
  // 1 · Appointment reminder — customer gets a heads-up the day before the visit.
  const tomorrow = ymd(new Date(Date.now() + 86400000));
  for (const l of all("SELECT * FROM leads WHERE appt_date = ? AND stage != 'Lost'", tomorrow)) {
    if (!l.email || !once(l.id, 'appt_reminder')) continue;
    sendMail(l.email, 'Reminder: your estimate visit is tomorrow',
      `Hi ${l.name},\n\nA quick reminder that your ${l.appt_type || 'estimate visit'} is tomorrow (${l.appt_date}) at ${l.appt_time || 'the scheduled time'}.\n` +
      'Need to reschedule? Just call (516) 555-0100.\n\n— Nassau Painting Co.');
    note(l.id, 'Appointment reminder emailed to customer');
  }

  // 2 · Stale-lead nudge — owner alert when a New Lead sits uncontacted 3+ days.
  const cutoff = new Date(Date.now() - 3 * 86400000).toISOString();
  for (const l of all("SELECT * FROM leads WHERE stage = 'New Lead' AND created_at < ?", cutoff)) {
    if (!once(l.id, 'stale_nudge')) continue;
    notifyOwner(`Lead going cold: ${l.name || 'Unknown'}`,
      `${l.name || 'A lead'} (${l.phone || 'no phone'}) submitted on ${l.created_at.slice(0, 10)} and is still in "New Lead".\n` +
      `Open: /admin/lead.html?id=${l.id}`);
    note(l.id, 'Owner nudged — 3+ days without contact');
  }

  // 3 · Review request — fires once when a job reaches Completed.
  for (const l of all("SELECT * FROM leads WHERE stage = 'Completed'")) {
    if (!l.email || !once(l.id, 'review_request')) continue;
    sendMail(l.email, 'How did we do?',
      `Hi ${l.name},\n\nThanks for choosing Nassau Painting Co.! If you have a minute, we'd love to hear how it went — ` +
      'your review helps neighbors find us:\n\nhttps://YOUR-DOMAIN/testimonials.html#submit\n\n— The Nassau Painting team');
    note(l.id, 'Review request emailed to customer');
  }
}

function start() {
  tick();
  setInterval(tick, 60 * 60 * 1000).unref();
  console.log('[automations] hourly engine running: appointment reminders · stale-lead nudges · review requests');
}

module.exports = { start, tick };
