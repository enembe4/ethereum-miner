'use strict';
/* Seeds a few demo leads + reviews the first time the DB is empty, so the
   pipeline board and moderation queue have something to show. Real
   submissions from the site populate everything from then on. */
const { get, run, now, token } = require('./db');
const { estimateForLead } = require('./pricing');

const DEMO_LEADS = [
  { name: 'Jane Homeowner', phone: '(516) 555-0123', email: 'jane@email.com', address: '123 Maple St, Garden City, NY 11530', contact_pref: 'Call', project_type: 'Interior', areas: ['Whole house', 'Trim & doors', 'Ceilings'], sqft: 1800, stories: '1', bedrooms: '3', bathrooms: '2', ceiling: 'Standard (8 ft)', condition: 'Some patching needed', timing: 'Within a month', paint_provided: 'Turnkey (we supply)', notes: 'Two accent walls in living room. Have a dog.', stage: 'New Lead' },
  { name: 'Marco P.', phone: '(516) 555-0155', email: 'marco@email.com', address: '9 Ocean Ave, Massapequa, NY 11758', contact_pref: 'Text', project_type: 'Exterior', areas: ['Whole house'], sqft: 2200, stories: '2', condition: 'Good — light prep', timing: 'ASAP', stage: 'New Lead' },
  { name: 'Dana R.', phone: '(516) 555-0177', email: 'dana@email.com', address: '44 Elm Rd, Levittown, NY 11756', project_type: 'Cabinets only', sqft: 500, condition: 'Good — light prep', stage: 'New Lead' },
  { name: 'Steven K.', phone: '(516) 555-0188', email: 'steven@email.com', address: '7 Birch Ln, Hicksville, NY 11801', project_type: 'Interior + Exterior', sqft: 2400, stories: '2', condition: 'Some patching needed', stage: 'Contacted' },
  { name: 'Priya N.', phone: '(516) 555-0199', email: 'priya@email.com', address: '2 Willow Ct, Mineola, NY 11501', project_type: 'Interior', sqft: 1600, stories: '1', condition: 'Good — light prep', stage: 'Quote Sent' },
  { name: 'Chen Residence', phone: '(516) 555-0201', email: 'chen@email.com', address: '18 Shore Dr, Long Beach, NY 11561', project_type: 'Interior + Exterior', sqft: 2600, stories: '2', condition: 'Some patching needed', stage: 'In Progress' },
  { name: "O'Brien Home", phone: '(516) 555-0210', email: 'obrien@email.com', address: '55 Stewart Ave, Garden City, NY 11530', project_type: 'Interior', sqft: 1700, stories: '1', condition: 'Good — light prep', stage: 'Completed' },
];

const DEMO_REVIEWS = [
  { name: 'Michael D.', town: 'Hicksville', email: 'michael.d@email.com', rating: 5, project_type: 'Interior', body: 'The crew showed up on time, taped everything, and the walls look flawless. Fair price and no mess left behind. Would hire again.', status: 'pending' },
  { name: 'Sofia R.', town: 'Valley Stream', email: 'sofia.r@email.com', rating: 4, project_type: 'Exterior', body: 'Great finish, though they ran a day over the estimate. Communication could have been a bit better mid-job.', status: 'pending' },
  { name: 'Anonymous', town: null, email: null, rating: 1, project_type: null, body: 'Generic complaint with a link http://spam.example — auto-flagged.', status: 'pending' },
  { name: 'The Alvarez Family', town: 'Rockville Centre', email: 'alvarez@email.com', rating: 5, project_type: 'Interior', body: 'Transformed our whole first floor. Clean, professional, and the color consultation was a huge help.', status: 'published' },
  { name: 'Tom & Lisa', town: 'Freeport', email: 'tl@email.com', rating: 5, project_type: 'Exterior', body: 'Our house looks brand new. Prep work was thorough and the price matched the quote exactly.', status: 'published' },
];

function seedIfEmpty() {
  const count = get('SELECT COUNT(*) c FROM leads').c;
  if (count > 0) return;
  console.log('[seed] empty DB — inserting demo leads + reviews');

  for (const d of DEMO_LEADS) {
    const est = estimateForLead(d);
    const ts = now();
    const info = run(
      `INSERT INTO leads (created_at, updated_at, token, source, stage, name, phone, email, address, contact_pref,
        project_type, areas, sqft, stories, bedrooms, bathrooms, ceiling, condition, timing, paint_provided, notes,
        est_price, rate, coats, crew, days, hrs_day, labor_rate, gallons, gal_price, supplies, other, overhead_pct, lead_safe, override_price)
       VALUES (?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ts, ts, token(), 'website_quote', d.stage || 'New Lead', d.name, d.phone, d.email, d.address || null, d.contact_pref || null,
      d.project_type || null, d.areas ? JSON.stringify(d.areas) : null, d.sqft || null, d.stories || null, d.bedrooms || null,
      d.bathrooms || null, d.ceiling || null, d.condition || null, d.timing || null, d.paint_provided || null, d.notes || null,
      est.est_price, est.rate, est.coats, est.crew, est.days, est.hrs_day, est.labor_rate, est.gallons, est.gal_price,
      est.supplies, est.other, est.overhead_pct, est.lead_safe, est.override_price,
    );
    run('INSERT INTO activity (lead_id, created_at, kind, text) VALUES (?,?,?,?)', info.lastInsertRowid, ts, 'created', 'Demo lead created');
  }

  for (const r of DEMO_REVIEWS) {
    run('INSERT INTO reviews (created_at, name, town, email, rating, project_type, body, status, flagged) VALUES (?,?,?,?,?,?,?,?,?)',
      now(), r.name, r.town, r.email, r.rating, r.project_type, r.body, r.status, /https?:\/\//.test(r.body) ? 1 : 0);
  }
}

module.exports = { seedIfEmpty };
