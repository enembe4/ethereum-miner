# Nassau County Painting Co. — Website + Lead Pipeline

A working site for a residential painting company in Nassau County, NY, with a
public marketing site, a lead-capture → CRM pipeline, moderated reviews, a
customer portal, and a guided chat assistant. Built as a single, self-contained
**Node + Express** app using the built-in `node:sqlite` (no external database or
native build step).

## Quick start

```bash
npm install
npm start            # http://localhost:3000
```

On first run the database is created and seeded with demo leads + reviews so the
pipeline isn't empty. Configuration is optional — copy `.env.example` to `.env`
to change the admin password, set the notification email, wire up SMTP, etc.

- **Public site:** http://localhost:3000/
- **Admin (login required):** http://localhost:3000/admin  ·  default `owner` / `paint123`

## What's here

### Public site (`public/`)
Landing page, services, gallery, multi-step **quote request**, **testimonials**
(view + submit), **color visualizer**, **financing** (with a live payment
estimator), **self-scheduling**, per-town **service-area** template, digital
**proposal**, and the **customer portal**. A guided **chat** widget floats on
every page. A sticky click-to-call bar shows on mobile.

### Backend / pipeline
- **Lead intake** — the quote form, the scheduler, and the chat widget all POST
  to the API, which creates a lead, auto-computes an estimate + projected margin,
  and emails the owner (or logs it until email is configured). **The customer is
  never shown a price** — only a "we'll be in touch" confirmation.
- **Admin pipeline** (`/admin`, login-gated) — a lifecycle board (New Lead →
  Contacted → Quote Sent → Scheduled → In Progress → Completed → Lost), a table
  view, and metrics.
- **Lead detail** — a live **profitability calculator**: adjust sq ft, crew,
  days, paint, supplies, overhead, and a pre-1978 lead-safe toggle, and price,
  cost, gross profit, margin %, and effective crew rate recompute instantly with
  a healthy/thin/reconsider verdict. Save persists to the pipeline; "Send quote"
  advances the lead and opens the proposal. Activity log included.
- **Review moderation** — submitted reviews are **pending** until you approve
  them; approved reviews appear on the public testimonials page. Approve / reply
  / reject, with light spam + job-match cues.
- **Customer portal** — customers sign in with their email + a one-time code
  (logged to the server console until SMTP is configured) to track their project
  status, appointment, selected colors, and — only once you've sent a quote —
  their price + proposal.

## Architecture

```
server.js              Express app: static hosting, public API, portal, gated /admin
lib/
  db.js                node:sqlite schema + query helpers
  pricing.js           estimate + margin math (source of truth; mirrored client-side)
  mailer.js            notifications (nodemailer; log-only until SMTP set)
  calendar.js          Google Calendar sync (log-only until GOOGLE_* set)
  automations.js       hourly engine: reminders, stale-lead nudges, review asks
  seed.js              demo data on first run
public/                the public website (served at /)
  *.html               pages
  js/                  quote.js, chat.js, portal.js, admin-*.js, …
  css/wireframe.css    shared design system
admin/                 login-gated pages (served at /admin only after auth)
  login.html, index.html, lead.html, reviews.html
data/app.db            SQLite (gitignored, created on first run)
.env.example           configuration template
```

Security notes: `/admin` is served only behind session auth (username + password,
hashed with bcrypt); admin APIs return 401 when unauthenticated. The portal is a
separate email-code session and only ever exposes safe fields (never internal
cost/margin, and never a price before you've sent the quote).

## Configuration (`.env`)

| Var | Purpose |
|-----|---------|
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Admin login (password is hashed at startup) |
| `SESSION_SECRET` | Signs session cookies — set a long random value in production |
| `OWNER_EMAIL` | Where new-lead / new-review alerts go (TBD) |
| `SMTP_*` | Outbound email; blank = log-only mode (alerts + portal codes print to console) |
| `ANTHROPIC_API_KEY` | Optional — hook to upgrade the chat assistant to Claude later |

## Calendar & automations

**Google Calendar sync** — booked estimates are pushed to your Google Calendar
(with the customer's details and a link back to the lead), rescheduling in Admin
moves the event, and the public scheduler only offers slots that are actually
free: business hours Mon–Sat, minus already-booked estimates, minus your Google
busy times. Double-booking is rejected server-side. Runs in log-only mode until
the `GOOGLE_*` vars are set — the 5-minute setup is documented in `.env.example`.

**Automation engine** (`lib/automations.js`, runs hourly; each rule fires once
per lead, tracked in `automation_log`, so restarts never double-send):
- Appointment **reminder email** to the customer the day before their visit
- **Stale-lead nudge** to you when a New Lead sits uncontacted for 3+ days
- **Review request** email when a job is marked Completed

All of it honors the mailer's log-only mode until SMTP is configured.

## AI chat assistant
With `ANTHROPIC_API_KEY` set in `.env`, the website chat is a real Claude
assistant (`lib/chatai.js`): it answers questions about services, the service
area, and the process; it is hard-ruled to **never quote a price** (estimates
only come from you); and once it has a name + phone it files the lead into the
pipeline itself via a `save_lead` tool call. Degradation is graceful at every
layer — no key means the guided scripted flow runs instead, and an API error
mid-conversation silently falls back to it too. Model is configurable via
`CHAT_MODEL` (default `claude-opus-5`).

## Double-booking protection (calendar)
Three layers keep a filled slot unbookable: (1) the scheduler only renders
slots that are free after subtracting booked estimates and Google busy times;
(2) the server rejects any submission whose slot is already booked in-app
(409); (3) at the moment of booking, the server **re-checks Google Calendar
freeBusy** for that exact window, so an event that landed on your calendar
after the page loaded still blocks the booking. If Google is unreachable the
check fails open (bookings continue, guarded by layers 1–2) rather than
letting an outage stop new business.

## Still to wire (next round)
- The digital **proposal** page is currently a representative template; next step
  is to load it from real lead data by token and record acceptance/e-sign.
- Real photos, logo, brand colors, and copy (you'll supply).
- Notification email recipient + SMTP credentials.
- Production hardening: persistent session store, HTTPS, real photo uploads.

## Wireframe note
Pages still carry a dark "◧ Wireframe" dev banner (with quick links to every
screen, including the login-gated admin). It's a development aid and is removed
for production; the customer-facing navigation never links to the admin.
