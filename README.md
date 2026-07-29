# Nassau County Painting Co. — Website Wireframes

Low-fidelity, **clickable wireframes** for a residential painting company serving
Nassau County, NY. The goal at this stage is to agree on **structure, flow, and
functionality** before adding real photography, brand colors, and visual polish.

> These are intentionally grayscale "boxes and labels." Placeholder image tiles
> (`IMAGE`, `PROJECT`, `PHOTO`) mark where your real photos will go.

## How to view

No build step — just open the files in a browser:

```
open index.html        # or double-click it
```

Each page has a dark **wireframe banner** at the top with links to every screen
(including the backend Admin), so you can click through the whole experience.

## The three core requirements

| # | Requirement | Where it lives |
|---|-------------|----------------|
| 1 | Landing page + image gallery | `index.html`, `gallery.html` |
| 2 | Quote → pipeline management | `quote.html` (public intake) → `admin/` (backend CRM) |
| 3 | Moderated testimonials | `testimonials.html` (submit) → `admin/reviews.html` (approve) |

### 1 · Landing + gallery
`index.html` — hero, trust bar, services, filterable gallery preview, "how it
works," why-us, testimonials preview, service-area, and repeated quote CTAs.
`gallery.html` — full portfolio grid with type filters and a before/after slider.

### 2 · Quote generator → pipeline (the important part)
- **`quote.html`** — a 4-step form that feels fast ("instant") but is deliberately
  **light on friction**: project type → home size/dimensions → details → contact.
  It collects **name, phone, email, address + high-level dimensions** and shows a
  confirmation — **never a price**, exactly as requested.
- **`admin/index.html`** — pipeline dashboard. Every submission becomes a card in
  a **lifecycle board** (New Lead → Contacted → Quote Sent → Scheduled →
  In Progress → Completed → Lost), with an auto-estimated price + projected margin.
- **`admin/lead.html`** — the lead detail with a **live profitability calculator**.
  Adjust square footage, crew size, days, paint, supplies, overhead, and a
  pre-1978 lead-safe toggle; price, cost, gross profit, margin %, and effective
  crew hourly rate all recalculate instantly with a healthy/thin/reconsider
  verdict. Includes an activity log for tracking the client lifecycle.

### 3 · Moderated reviews
`testimonials.html` has a public "Leave a Review" form. Submissions do **not**
publish automatically — they land in **`admin/reviews.html`**, a moderation queue
where you approve, edit, reply, or reject (with light spam/verification cues).

## Pricing model (calibrated to Nassau County research)
The estimator math is illustrative and **calibratable**. Research notes baked into
the design: interior rates are typically quoted per **wall+ceiling surface area**
(~$3.50–5.00/sq ft mid-band on Long Island), exterior per **home footprint**
(+~50%/story), **labor ≈ 70% of cost**, NY metro runs **~30% above national**, and
**pre-1978 homes add ~8–12%** for EPA lead-safe prep (common on LI). Real rate
cards will live in Admin ▸ Settings.

## File structure
```
index.html              Landing page
services.html           Services detail
gallery.html            Portfolio / gallery
quote.html              Multi-step quote request (lead intake)
testimonials.html       Public reviews + submit form
visualizer.html         Color visualizer (preview colors on your photo)
financing.html          Financing + live monthly-payment estimator
schedule.html           Self-schedule an estimate visit
service-area.html       Per-town SEO landing template + areas index
proposal.html           Digital proposal / e-sign (what customers receive)
admin/
  index.html            Pipeline dashboard (lifecycle board + table)
  lead.html             Lead detail + profitability calculator
  reviews.html          Review moderation queue
css/wireframe.css       Shared low-fidelity design system
js/quote.js             Multi-step form behavior
js/admin.js             Live margin/profitability calculator
assets/                 (real images land here later)
```

## Proposed features now wireframed (round 2)
These were on the "proposals" list and are now clickable so you can react to them
in context:
- **Color visualizer** (`visualizer.html`) — likely a Sherwin-Williams/Benjamin
  Moore embed; picked colors ride along with the quote.
- **Financing** (`financing.html`) — Wisetack/Hearth-style; the payment estimator
  works (drag the slider, pick a term).
- **Self-scheduling** (`schedule.html`) — pick a date/time for an in-home, video,
  or photo estimate; a booking creates a lead in the pipeline.
- **Per-town service-area pages** (`service-area.html`) — one reusable template
  that generates a page per Nassau town for local SEO.
- **E-sign digital proposal** (`proposal.html`) — the customer-facing quote that
  "Send this quote" on the Lead Detail links to; accept + e-sign advances the lead.
- **Sticky click-to-call bar** — shows on mobile across the public site.

## Open decisions parked for later
- **Notification email** for new leads — TBD (recipient not yet chosen).
- **Real photos, logo, brand colors, copy** — you'll supply; wired in next.
- **Backend implementation** — these are front-end wireframes; the CRM, email,
  auth, and data storage get built once the flow is approved.

## Not-yet-built ideas (see proposals)
Color visualizer embed, customer financing, online self-scheduling, e-sign
proposals, per-town service-area pages, sticky click-to-call, live chat, and a
customer project portal — researched and proposed for you to prioritize.
