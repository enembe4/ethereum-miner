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

## Stock photography
The public pages carry curated stock photos matching the brand direction —
warm, familial, classic colonial / Cape Cod homes, tree-lined Northeast
streets, bright airy interiors. All are from **Pexels** (license: free for
commercial use, no attribution — https://www.pexels.com/license/). They are
hot-linked from the Pexels CDN so they work immediately; each one degrades to
its labeled placeholder if it ever fails to load. Before production launch run
`bash scripts/fetch-images.sh` (any machine with normal internet) to download
them into `public/assets/` and rewrite pages to the self-hosted copies. Each
photo's review page is `https://www.pexels.com/photo/x-{id}/` using the id
from the script. Swap in your own project photos as you collect them — that's
the end state; the stock set is the launch look.

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

## Design system
The public site and admin share one stylesheet, `public/css/site.css` — the
**"Gallery"** system, drawn from the Restoration Hardware sourcebook. Six rules
carry the whole thing:

1. **One typeface.** Jost (a geometric sans) at weights 200–500. Weight, size
   and tracking do all the work; Cormorant Garamond appears only in pull quotes.
2. **No colour.** Warm neutral greys and black — `#1A1A1A` ink on `#FFFFFF`,
   banded with `#FAF9F7` and `#F2F0EC`. There is deliberately **no brand accent**:
   action is black. (`--good/--warn/--bad` exist for admin state only.)
3. **Tiny widely-tracked caps for structure, large light type for voice.** Labels,
   buttons, nav and captions are ~10px uppercase at `.18em`–`.24em`; headlines are
   200-weight and large. Nothing sits in between.
4. **Photography runs edge to edge and is never framed.** No borders, no radius —
   `.split` puts a full-bleed image against a half-width column of copy.
5. **No fills but black.** Buttons are hairline rectangles; the primary fills
   black and inverts on hover. Cards are unframed by default (`.card--framed`
   opts back in for forms and data).
6. **Whitespace is the loudest element** — 118px section padding, 620px+ image
   halves, and tonal bands instead of rules to separate sections.

Square corners everywhere, no shadows, no emoji, no decorative icons, and no
directional arrows in labels. The customer-facing navigation never links to the
admin.

### Motion & journey layer (`public/js/site.js`)
Progressive enhancement on every public page — with JS off (or
`prefers-reduced-motion` on) nothing is hidden or lost:
- **Scroll reveals** — headers, grid items and claim lists rise in quietly with
  a small sibling stagger; armed only when motion is allowed, forced visible in
  print.
- **Stat counters** — the trust-bar figures count up on first sight.
- **Hero parallax** — the photograph drifts slower than the page (desktop only).
- **Nav** — tightens once you scroll.
- **Before/after sliders** — any `[data-ba]` block gets drag + arrow-key
  comparison (used on the homepage gallery and the gallery's featured plate;
  the "before" side is the same frame with a weathered filter until real
  before/after photo pairs exist).
- **Towns marquee** — a slow ribbon of service towns under the hero; static
  wrap under reduced motion.
- **Journey hand-off** — each page ends with exactly one injected next step
  (services → visualizer → quote, financing → quote, …) so the site reads as a
  path, not a menu.

### Color Visualizer (`public/js/visualizer.js` + `lib/visualai.js`)
Two tiers, and the page presents them honestly:

**AI Render** (server-backed, optional) — the customer types any color from any
major brand ("Benjamin Moore Hale Navy", "SW 7069", "Behr Blank Canvas", a hex).
Claude resolves it to an exact spec (`/api/visualizer/resolve-color`, with a
local-table fallback when no key is set), then reads the uploaded photo and
writes a precise edit brief, and a dedicated image-editing model performs the
photorealistic repaint (`/api/visualizer/render`). Claude cannot output images,
so the render step needs `GEMINI_API_KEY` (gemini-2.5-flash-image, default) or
`OPENAI_API_KEY` (gpt-image-1) — see `.env.example`. The result comes back as
an original-vs-render drag slider, downloadable, and can be opened in the
instant preview for further tapping. Photos are processed in memory only —
never stored or logged. Without a render key the panel explains itself and the
instant preview carries the page; with no backend at all (the static demo) the
panel hides entirely.

**Instant Preview** (always available, on-device) — tap a wall and a
chroma-weighted flood fill finds the surface, feathers the mask, and recolors
it through a luminance-preserving LUT so texture and lighting survive.
Selections persist across color changes; undo/clear/reach-slider/download
included. The photo never leaves the device.

Both tiers feed the funnel: "Add to my quote" stores picks in `localStorage`
(`npc_colors`), the quote form surfaces them, and they attach to the lead.

**Fonts are self-hosted.** `scripts/fetch-fonts.sh` downloads the woff2 files
into `public/assets/fonts/` and generates `public/css/fonts.css`, which
`site.css` imports — so there is no Google Fonts dependency at runtime. Re-run it
after changing the `FAMILIES` line in that script.

## Clickable demo (`demo/index.html`)
A single self-contained page that simulates the entire site — every customer
page plus the owner admin — with no server, no database and no network access.
Open it directly in a browser, or publish it as a link for people to click
through. Both webfonts and the chat widget's stylesheet are inlined, so it works
offline and under a strict CSP.

It is generated from the real design system, so it can't drift:

```bash
python3 scripts/build-demo.py     # re-inlines site.css + chat.js CSS + fonts
```

That regenerates only the page's `<style>` block; the markup and simulation
script are left alone. Edit `public/css/site.css`, re-run it, and the demo
matches the site again.
