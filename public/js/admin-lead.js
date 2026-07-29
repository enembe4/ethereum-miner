'use strict';
(async function () {
  const A = window.Admin;
  const id = A.qs('id');
  const $ = (x) => document.getElementById(x);
  const STAGES = ['New Lead', 'Contacted', 'Quote Sent', 'Scheduled', 'In Progress', 'Completed', 'Lost'];
  const COST_FIELDS = ['sqft', 'rate', 'coats', 'crew', 'days', 'hrs_day', 'labor_rate', 'gallons', 'gal_price', 'supplies', 'other', 'overhead_pct', 'override_price'];
  let lead = null;

  if (!id) { $('leadName').textContent = 'No lead selected'; return; }

  function fill() {
    $('leadName').textContent = lead.name || 'Unknown';
    $('stage').innerHTML = STAGES.map((s) => `<option${s === lead.stage ? ' selected' : ''}>${s}</option>`).join('');

    $('client').innerHTML = kv({
      Name: lead.name, Phone: `${lead.phone || '—'} · prefers ${lead.contact_pref || '—'}`,
      Email: lead.email, Address: lead.address,
      Submitted: new Date(lead.created_at).toLocaleString(), Source: (lead.source || '').replace('website_', ''),
    });
    $('project').innerHTML = kv({
      Type: lead.project_type, Areas: (lead.areas || []).join(' · ') || '—',
      Size: lead.sqft ? `${lead.sqft} sq ft · ${lead.stories || '?'} story` : '—',
      'Bed / bath': `${lead.bedrooms || '?'} / ${lead.bathrooms || '?'}`,
      Ceilings: lead.ceiling, Condition: lead.condition, Timing: lead.timing,
      Paint: lead.paint_provided, Colors: lead.colors ? lead.colors.map((c) => c.name || c).join(', ') : '—',
      Notes: lead.notes,
    });

    COST_FIELDS.forEach((f) => { const el = $(f); if (el) el.value = lead[f] == null ? '' : lead[f]; });
    $('lead_safe').checked = !!lead.lead_safe;
    recalc();
  }
  const kv = (o) => Object.entries(o).map(([k, v]) => `<dt>${k}</dt><dd>${A.esc(v || '—')}</dd>`).join('');

  /* Mirror of lib/pricing.js computeMargin — kept in sync intentionally. */
  function recalc() {
    const n = (x) => parseFloat($(x).value) || 0;
    const price = n('override_price') > 0 ? n('override_price') : n('sqft') * n('rate');
    const laborHrs = n('crew') * n('days') * n('hrs_day');
    const labor = laborHrs * n('labor_rate');
    const paint = n('gallons') * n('gal_price');
    const materials = n('supplies') + n('other');
    const overhead = price * (n('overhead_pct') / 100);
    const base = labor + paint + materials + overhead;
    const leadSafe = $('lead_safe').checked ? base * 0.10 : 0;
    const cost = base + leadSafe;
    const profit = price - cost;
    const margin = price > 0 ? (profit / price) * 100 : 0;
    const eff = laborHrs > 0 ? profit / laborHrs : 0;

    $('oPrice').textContent = A.money(price);
    $('oLabor').textContent = A.money(labor);
    $('oPaint').textContent = A.money(paint);
    $('oMat').textContent = A.money(materials + leadSafe);
    $('oOh').textContent = A.money(overhead);
    $('oCost').textContent = A.money(cost);
    $('oProfit').textContent = A.money(profit);
    $('oProfit').style.color = profit >= 0 ? 'var(--good)' : 'var(--bad)';
    $('oMargin').textContent = margin.toFixed(1) + '%';
    $('oHourly').textContent = A.money(eff) + ' /hr';
    const v = $('verdict');
    const verdict = margin >= 40 ? 'Healthy' : margin >= 25 ? 'Thin' : 'Reconsider';
    v.className = 'tag ' + A.verdictTag(verdict); v.textContent = verdict;
  }

  function collect() {
    const body = { stage: $('stage').value, lead_safe: $('lead_safe').checked ? 1 : 0 };
    COST_FIELDS.forEach((f) => { const val = $(f).value; body[f] = val === '' ? null : Number(val); });
    return body;
  }

  async function save() {
    const r = await A.api('/api/admin/leads/' + id, { method: 'PATCH', body: JSON.stringify(collect()) });
    lead = r.lead;
    const note = $('savedNote'); note.style.display = 'block'; setTimeout(() => note.style.display = 'none', 1600);
    renderActivity(await (await A.api('/api/admin/leads/' + id)).activity);
  }

  function renderActivity(list) {
    $('activity').innerHTML = list.map((a) => `<li style="padding:8px 0;border-bottom:1px dashed var(--line-soft);">
      <strong>${A.esc(labelKind(a.kind))}</strong> ${A.esc(a.text)}
      <span class="muted"> · ${new Date(a.created_at).toLocaleString()}</span></li>`).join('');
  }
  const labelKind = (k) => ({ created: 'Created', estimate: 'Auto-estimate', stage: 'Stage', note: 'Note', appointment: 'Appointment', chat: 'Chat', quote: 'Quote' }[k] || k);

  // events
  ['input', 'change'].forEach((ev) => document.getElementById('main').addEventListener(ev, (e) => {
    if (e.target.matches('input,select')) recalc();
  }));
  $('saveBtn').addEventListener('click', save);
  $('saveBtn2').addEventListener('click', save);
  $('sendQuote').addEventListener('click', async (e) => {
    e.preventDefault();
    $('stage').value = 'Quote Sent';
    await save();
    await A.api('/api/admin/leads/' + id + '/activity', { method: 'POST', body: JSON.stringify({ kind: 'quote', text: `Quote sent · ${$('oPrice').textContent}` }) });
    location.href = '/proposal.html?id=' + id;
  });
  $('addNote').addEventListener('click', async () => {
    const text = $('noteText').value.trim(); if (!text) return;
    const r = await A.api('/api/admin/leads/' + id + '/activity', { method: 'POST', body: JSON.stringify({ text }) });
    $('noteText').value = ''; renderActivity(r.activity);
  });

  try {
    const data = await A.api('/api/admin/leads/' + id);
    lead = data.lead; fill(); renderActivity(data.activity);
  } catch (e) { $('leadName').textContent = 'Error: ' + e.message; }
})();
