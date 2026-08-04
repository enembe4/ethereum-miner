'use strict';
/* Email notifications. Runs in "log only" mode until SMTP_* is configured,
   so new-lead alerts and portal codes are visible in the server console now
   and become real emails the moment you add credentials + a recipient. */
const nodemailer = require('nodemailer');

const {
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
  SMTP_FROM = 'Etay Exteriors <no-reply@etayexteriors.com>',
  OWNER_EMAIL,
} = process.env;

let transport = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  console.log('[mailer] SMTP configured — emails will be sent.');
} else {
  console.log('[mailer] No SMTP configured — running in LOG-ONLY mode.');
}

async function sendMail(to, subject, text) {
  if (!to) { console.log(`[mailer:skip] no recipient for "${subject}"`); return false; }
  if (!transport) {
    console.log('\n──────── EMAIL (log only) ────────');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text);
    console.log('──────────────────────────────────\n');
    return false;
  }
  try {
    await transport.sendMail({ from: SMTP_FROM, to, subject, text });
    return true;
  } catch (e) {
    console.error('[mailer] send failed:', e.message);
    return false;
  }
}

/* Alert the business owner about pipeline activity. */
function notifyOwner(subject, text) {
  return sendMail(OWNER_EMAIL || '', subject, text);
}

module.exports = { sendMail, notifyOwner, hasTransport: () => !!transport };
