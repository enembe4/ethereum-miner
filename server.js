'use strict';

/* ---- tiny .env loader (no dependency) ---- */
const fs = require('fs');
const path = require('path');
(function loadEnv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2].trim().replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
})();

/* silence node:sqlite experimental warning */
const origEmit = process.emitWarning;
process.emitWarning = (w, ...r) => { if (String(w).includes('SQLite is an experimental')) return; return origEmit.call(process, w, ...r); };

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const { all, get, run, now, token, code6 } = require('./lib/db');
const { estimateForLead, computeMargin } = require('./lib/pricing');
const { notifyOwner, sendMail } = require('./lib/mailer');
const seed = require('./lib/seed');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === 'production';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'owner';
const ADMIN_HASH = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'paint123', 10);

const STAGES = ['New Lead', 'Contacted', 'Quote Sent', 'Scheduled', 'In Progress', 'Completed', 'Lost'];

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 1000 * 60 * 60 * 12 },
}));

/* ---------------- helpers ---------------- */
const LEAD_COLS = [
  'source', 'stage', 'name', 'phone', 'email', 'address', 'contact_pref',
  'project_type', 'areas', 'sqft', 'stories', 'bedrooms', 'bathrooms',
  'ceiling', 'condition', 'timing', 'paint_provided', 'notes', 'colors',
  'est_price', 'rate', 'coats', 'crew', 'days', 'hrs_day', 'labor_rate',
  'gallons', 'gal_price', 'supplies', 'other', 'overhead_pct', 'lead_safe',
  'override_price', 'appt_type', 'appt_date', 'appt_time',
];

function createLead(data, source) {
  const est = estimateForLead(data);
  const row = {
    source: source || 'website_quote',
    stage: data.stage || 'New Lead',
    name: data.name || null, phone: data.phone || null, email: data.email || null,
    address: data.address || null, contact_pref: data.contact_pref || null,
    project_type: data.project_type || null,
    areas: data.areas ? JSON.stringify(data.areas) : null,
    sqft: data.sqft ? parseInt(data.sqft, 10) : null,
    stories: data.stories || null, bedrooms: data.bedrooms || null,
    bathrooms: data.bathrooms || null, ceiling: data.ceiling || null,
    condition: data.condition || null, timing: data.timing || null,
    paint_provided: data.paint_provided || null, notes: data.notes || null,
    colors: data.colors ? JSON.stringify(data.colors) : null,
    ...est,
    appt_type: data.appt_type || null, appt_date: data.appt_date || null,
    appt_time: data.appt_time || null,
  };
  const cols = LEAD_COLS.join(', ');
  const ph = LEAD_COLS.map(() => '?').join(', ');
  const ts = now();
  const info = run(
    `INSERT INTO leads (created_at, updated_at, token, ${cols}) VALUES (?, ?, ?, ${ph})`,
    ts, ts, token(), ...LEAD_COLS.map((c) => row[c] ?? null),
  );
  const id = info.lastInsertRowid;
  logActivity(id, 'created', `Lead created via ${row.source}`);
  if (row.est_price) logActivity(id, 'estimate', `Auto-estimate ~$${Math.round(row.est_price)}`);

  const m = computeMargin(get('SELECT * FROM leads WHERE id = ?', id));
  notifyOwner(
    `New lead: ${row.name || 'Unknown'} — ${row.project_type || 'painting'}`,
    `A new lead just came in.\n\n` +
    `Name:    ${row.name}\nPhone:   ${row.phone}\nEmail:   ${row.email}\n` +
    `Address: ${row.address}\nProject: ${row.project_type} (${row.sqft || '?'} sq ft)\n` +
    `Est. price: ~$${Math.round(row.est_price || 0)}  ·  Projected margin: ${m.margin.toFixed(0)}%\n\n` +
    `Open the pipeline to review: /admin`,
  );
  return get('SELECT * FROM leads WHERE id = ?', id);
}

function logActivity(leadId, kind, text) {
  run('INSERT INTO activity (lead_id, created_at, kind, text) VALUES (?, ?, ?, ?)', leadId, now(), kind, text);
}

/* ===================================================================
   PUBLIC API
   =================================================================== */

app.post('/api/quote', (req, res) => {
  const d = req.body || {};
  if (!d.name || !d.phone || !d.email) return res.status(400).json({ error: 'Name, phone, and email are required.' });
  const lead = createLead(d, 'website_quote');
  res.json({ ok: true, reference: lead.id }); // NOTE: intentionally no price returned to the customer
});

app.post('/api/appointments', (req, res) => {
  const d = req.body || {};
  if (!d.name || !d.phone || !d.email) return res.status(400).json({ error: 'Name, phone, and email are required.' });
  const lead = createLead({ ...d, stage: 'Scheduled' }, 'schedule');
  if (d.appt_date) logActivity(lead.id, 'appointment', `Estimate booked: ${d.appt_type || 'visit'} on ${d.appt_date} ${d.appt_time || ''}`);
  res.json({ ok: true, reference: lead.id });
});

app.post('/api/chat', (req, res) => {
  const d = req.body || {};
  if (!d.name || !d.phone) return res.status(400).json({ error: 'Name and phone are required.' });
  const lead = createLead({
    name: d.name, phone: d.phone, email: d.email || null,
    project_type: d.project_type || 'Interior',
    notes: (d.need ? `Chat: ${d.need}` : 'Captured via website chat.'),
  }, 'chat');
  if (d.transcript) logActivity(lead.id, 'chat', `Transcript:\n${String(d.transcript).slice(0, 2000)}`);
  res.json({ ok: true, reference: lead.id });
});

/* Reviews: submit (public) + list approved (public) */
app.post('/api/reviews', (req, res) => {
  const d = req.body || {};
  if (!d.name || !d.body || !d.rating) return res.status(400).json({ error: 'Name, rating, and review are required.' });
  const flagged = /https?:\/\//i.test(d.body) ? 1 : 0;
  run(
    'INSERT INTO reviews (created_at, name, town, email, rating, project_type, body, status, flagged) VALUES (?,?,?,?,?,?,?,?,?)',
    now(), d.name, d.town || null, d.email || null, Math.max(1, Math.min(5, parseInt(d.rating, 10) || 5)),
    d.project_type || null, d.body, 'pending', flagged,
  );
  notifyOwner('New review pending approval', `${d.name} (${d.town || '—'}) left a ${d.rating}★ review:\n\n"${d.body}"\n\nApprove it in /admin/reviews.html`);
  res.json({ ok: true });
});

app.get('/api/reviews', (_req, res) => {
  const rows = all("SELECT name, town, rating, project_type, body, reply, created_at FROM reviews WHERE status = 'published' ORDER BY created_at DESC LIMIT 60");
  res.json(rows);
});

/* ===================================================================
   CUSTOMER PORTAL (email + one-time code)
   =================================================================== */
const STAGE_IDX = (s) => Math.max(0, STAGES.indexOf(s));

function sanitizePortal(l) {
  const idx = STAGE_IDX(l.stage);
  const quoteVisible = idx >= STAGES.indexOf('Quote Sent') && l.stage !== 'Lost';
  return {
    name: l.name, address: l.address, project_type: l.project_type,
    stage: l.stage, stageIndex: idx, stages: STAGES.slice(0, 6),
    colors: l.colors ? JSON.parse(l.colors) : null,
    appt: l.appt_date ? { type: l.appt_type, date: l.appt_date, time: l.appt_time } : null,
    price: quoteVisible ? (l.override_price > 0 ? l.override_price : l.est_price) : null,
    proposalToken: quoteVisible ? l.token : null,
  };
}

app.post('/api/portal/request-code', (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const lead = email && get('SELECT * FROM leads WHERE lower(email) = ? ORDER BY created_at DESC LIMIT 1', email);
  if (lead) {
    const code = code6();
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    run('INSERT INTO portal_codes (email, code, expires_at, attempts) VALUES (?,?,?,0) ON CONFLICT(email) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at, attempts=0', email, code, expires);
    sendMail(email, 'Your Nassau Painting Co. access code', `Your one-time code is: ${code}\nIt expires in 15 minutes.`);
    // dev convenience so it's testable before SMTP is configured:
    return res.json({ ok: true, ...(PROD ? {} : { devCode: code }) });
  }
  res.json({ ok: true }); // don't reveal whether the email exists
});

app.post('/api/portal/verify', (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const code = String((req.body || {}).code || '').trim();
  const rec = get('SELECT * FROM portal_codes WHERE email = ?', email);
  if (!rec || rec.attempts >= 5) return res.status(400).json({ error: 'Invalid or expired code.' });
  if (new Date(rec.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'Code expired.' });
  if (rec.code !== code) {
    run('UPDATE portal_codes SET attempts = attempts + 1 WHERE email = ?', email);
    return res.status(400).json({ error: 'Invalid code.' });
  }
  run('DELETE FROM portal_codes WHERE email = ?', email);
  req.session.portalEmail = email;
  const lead = get('SELECT * FROM leads WHERE lower(email) = ? ORDER BY created_at DESC LIMIT 1', email);
  res.json({ ok: true, project: sanitizePortal(lead) });
});

app.get('/api/portal/me', (req, res) => {
  // 200 with project:null when not signed in — avoids noisy console 401s on the login page.
  if (!req.session.portalEmail) return res.json({ project: null });
  const lead = get('SELECT * FROM leads WHERE lower(email) = ? ORDER BY created_at DESC LIMIT 1', req.session.portalEmail);
  res.json({ project: lead ? sanitizePortal(lead) : null });
});

app.post('/api/portal/logout', (req, res) => { delete req.session.portalEmail; res.json({ ok: true }); });

/* ===================================================================
   ADMIN AUTH
   =================================================================== */
function requireApiAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}
function requirePageAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect('/admin/login');
}

app.get('/admin/login', (_req, res) => res.sendFile(path.join(__dirname, 'admin', 'login.html')));
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && bcrypt.compareSync(String(password || ''), ADMIN_HASH)) {
    req.session.admin = { username };
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Incorrect username or password.' });
});
app.post('/admin/logout', (req, res) => { delete req.session.admin; res.json({ ok: true }); });
app.get('/api/admin/me', requireApiAuth, (req, res) => res.json({ username: req.session.admin.username }));

/* ===================================================================
   ADMIN API (protected)
   =================================================================== */
function withMargin(l) {
  const m = computeMargin(l);
  return { ...l, areas: l.areas ? JSON.parse(l.areas) : [], colors: l.colors ? JSON.parse(l.colors) : null, _margin: m };
}

app.get('/api/admin/metrics', requireApiAuth, (_req, res) => {
  const leads = all('SELECT * FROM leads');
  const active = leads.filter((l) => l.stage !== 'Lost' && l.stage !== 'Completed');
  const newCount = leads.filter((l) => l.stage === 'New Lead').length;
  const quotes = leads.filter((l) => l.stage === 'Quote Sent').length;
  const pipeline = active.reduce((s, l) => s + (l.override_price > 0 ? l.override_price : l.est_price || 0), 0);
  const won = leads.filter((l) => ['Scheduled', 'In Progress', 'Completed'].includes(l.stage)).length;
  const decided = leads.filter((l) => ['Scheduled', 'In Progress', 'Completed', 'Lost'].includes(l.stage)).length;
  const winRate = decided ? Math.round((won / decided) * 100) : 0;
  const pendingReviews = get("SELECT COUNT(*) c FROM reviews WHERE status = 'pending'").c;
  res.json({ newCount, pipeline, quotes, winRate, stages: STAGES, pendingReviews, total: leads.length });
});

app.get('/api/admin/leads', requireApiAuth, (_req, res) => {
  res.json(all('SELECT * FROM leads ORDER BY created_at DESC').map(withMargin));
});

app.get('/api/admin/leads/:id', requireApiAuth, (req, res) => {
  const l = get('SELECT * FROM leads WHERE id = ?', req.params.id);
  if (!l) return res.status(404).json({ error: 'Not found' });
  res.json({ lead: withMargin(l), activity: all('SELECT * FROM activity WHERE lead_id = ? ORDER BY created_at DESC', l.id) });
});

const EDITABLE = ['stage', 'rate', 'coats', 'crew', 'days', 'hrs_day', 'labor_rate', 'gallons', 'gal_price', 'supplies', 'other', 'overhead_pct', 'lead_safe', 'override_price', 'sqft', 'appt_date', 'appt_time', 'appt_type'];

app.patch('/api/admin/leads/:id', requireApiAuth, (req, res) => {
  const l = get('SELECT * FROM leads WHERE id = ?', req.params.id);
  if (!l) return res.status(404).json({ error: 'Not found' });
  const updates = [], vals = [];
  for (const k of EDITABLE) {
    if (k in (req.body || {})) { updates.push(`${k} = ?`); vals.push(req.body[k]); }
  }
  if (updates.length) {
    run(`UPDATE leads SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`, ...vals, now(), l.id);
  }
  if (req.body.stage && req.body.stage !== l.stage) logActivity(l.id, 'stage', `Stage → ${req.body.stage}`);
  res.json({ lead: withMargin(get('SELECT * FROM leads WHERE id = ?', l.id)) });
});

app.post('/api/admin/leads/:id/activity', requireApiAuth, (req, res) => {
  const l = get('SELECT * FROM leads WHERE id = ?', req.params.id);
  if (!l) return res.status(404).json({ error: 'Not found' });
  const text = String((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'Empty note' });
  logActivity(l.id, req.body.kind || 'note', text);
  res.json({ activity: all('SELECT * FROM activity WHERE lead_id = ? ORDER BY created_at DESC', l.id) });
});

app.get('/api/admin/reviews', requireApiAuth, (req, res) => {
  const status = req.query.status || 'pending';
  res.json(all('SELECT * FROM reviews WHERE status = ? ORDER BY created_at DESC', status));
});

app.patch('/api/admin/reviews/:id', requireApiAuth, (req, res) => {
  const r = get('SELECT * FROM reviews WHERE id = ?', req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  const fields = [], vals = [];
  if ('status' in req.body) { fields.push('status = ?'); vals.push(req.body.status); }
  if ('reply' in req.body) { fields.push('reply = ?'); vals.push(req.body.reply); }
  if ('body' in req.body) { fields.push('body = ?'); vals.push(req.body.body); }
  if (fields.length) run(`UPDATE reviews SET ${fields.join(', ')} WHERE id = ?`, ...vals, r.id);
  res.json({ ok: true });
});

/* ===================================================================
   STATIC — protected admin, then public
   =================================================================== */
app.use('/admin', requirePageAuth, express.static(path.join(__dirname, 'admin')));
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  seed.seedIfEmpty();
  console.log(`\n▸ Nassau Painting site running:  http://localhost:${PORT}`);
  console.log(`▸ Admin (login required):        http://localhost:${PORT}/admin   [${ADMIN_USERNAME} / ${process.env.ADMIN_PASSWORD ? '••••••' : 'paint123 (default)'}]`);
});
