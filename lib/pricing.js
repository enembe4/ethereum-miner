'use strict';
/* Single source of truth for the estimate + margin math.
   Calibrated to Nassau County research (see README). The client-side
   calculator in /js/admin-lead.js mirrors computeMargin() for live UI. */

const BASE_RATE = {              // all-in $/sq ft of floor area (calibratable)
  'Interior': 3.00,
  'Exterior': 3.50,
  'Interior + Exterior': 5.50,
  'Cabinets only': 6.00,
  'Commercial': 3.25,
};
const COND_MULT = {
  'Good — light prep': 1.00,
  'Some patching needed': 1.08,
  'Heavy repair / water damage': 1.20,
  'Not sure': 1.05,
};
const CEIL_MULT = {
  'Standard (8 ft)': 1.00, '9 ft': 1.05, '10 ft+': 1.10, 'Vaulted / mixed': 1.15,
};
const STORY_MULT = { '1': 1.00, '1.5': 1.10, '2': 1.25, '3+': 1.40 };

const round = (n, step = 1) => Math.round(n / step) * step;
const involvesExterior = (t) => t === 'Exterior' || t === 'Interior + Exterior';

/* Build the estimate + seed a sensible editable cost model from a raw submission. */
function estimateForLead(input) {
  const sqft = Math.max(0, parseInt(input.sqft, 10) || 0);
  const type = input.project_type || 'Interior';
  const coats = 2;

  const base = BASE_RATE[type] ?? 3.25;
  let mult = (COND_MULT[input.condition] ?? 1.0) * (CEIL_MULT[input.ceiling] ?? 1.0);
  if (involvesExterior(type)) mult *= (STORY_MULT[input.stories] ?? 1.0);

  const rate = Math.round(base * mult * 100) / 100;      // effective all-in $/sqft
  const est_price = round(sqft * rate, 25);              // nearest $25

  // seed defaults for the editable calculator
  const crew = sqft > 2600 ? 3 : 2;
  const days = Math.max(1, round((sqft / 600) * (coats / 2) * 2) / 2); // .5 granularity
  const gallons = Math.max(1, Math.ceil((sqft / 350) * coats));

  return {
    est_price, rate, coats,
    crew, days, hrs_day: 8, labor_rate: 45,
    gallons, gal_price: 45, supplies: 150, other: 100,
    overhead_pct: 5, lead_safe: 0, override_price: null,
  };
}

/* The margin breakdown for a stored lead (owner-editable inputs). */
function computeMargin(l) {
  const sqft = +l.sqft || 0, rate = +l.rate || 0;
  const price = (+l.override_price > 0) ? +l.override_price : sqft * rate;

  const laborHrs = (+l.crew || 0) * (+l.days || 0) * (+l.hrs_day || 0);
  const labor = laborHrs * (+l.labor_rate || 0);
  const paint = (+l.gallons || 0) * (+l.gal_price || 0);
  const materials = (+l.supplies || 0) + (+l.other || 0);
  const overhead = price * ((+l.overhead_pct || 0) / 100);

  const base = labor + paint + materials + overhead;
  const leadSafe = l.lead_safe ? base * 0.10 : 0;
  const cost = base + leadSafe;

  const profit = price - cost;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const effHourly = laborHrs > 0 ? profit / laborHrs : 0;
  const verdict = margin >= 40 ? 'Healthy' : margin >= 25 ? 'Thin' : 'Reconsider';

  return { price, labor, paint, materials, overhead, leadSafe, cost, profit, margin, effHourly, verdict, laborHrs };
}

module.exports = { estimateForLead, computeMargin, BASE_RATE };
