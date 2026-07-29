/* ------------------------------------------------------------
   Quote request — multi-step wizard. Collects the intake and
   POSTs it to /api/quote, which creates a lead in the pipeline
   and notifies the owner. No price is ever returned to the user.
   ------------------------------------------------------------ */
(function () {
  var form = document.getElementById('quoteForm');
  if (!form) return;

  var order = ['1', '2', '3', '4', 'done'];
  var current = 0;

  var stepsBar = document.getElementById('steps');
  var backBtn = document.getElementById('backBtn');
  var nextBtn = document.getElementById('nextBtn');
  var submitBtn = document.getElementById('submitBtn');

  function show(key) {
    form.querySelectorAll('.q-step').forEach(function (s) { s.hidden = s.getAttribute('data-step') !== key; });
    if (stepsBar) {
      stepsBar.querySelectorAll('.steps__item').forEach(function (it) {
        var n = it.getAttribute('data-step');
        it.classList.remove('is-active', 'is-done');
        if (key === 'done') { it.classList.add('is-done'); return; }
        if (n === key) it.classList.add('is-active');
        else if (Number(n) < Number(key)) it.classList.add('is-done');
      });
    }
    backBtn.hidden = (key === '1' || key === 'done');
    nextBtn.hidden = (key === '4' || key === 'done');
    submitBtn.hidden = (key !== '4');
    if (key === 'done') document.getElementById('controls').style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  nextBtn.addEventListener('click', function () { if (current < order.length - 1) { current++; show(order[current]); } });
  backBtn.addEventListener('click', function () { if (current > 0) { current--; show(order[current]); } });

  // chip selection
  form.addEventListener('click', function (e) {
    var chip = e.target.closest('.chip'); if (!chip) return;
    var group = chip.parentElement;
    if (group.hasAttribute('data-single')) {
      group.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-on'); });
      chip.classList.add('is-on');
    } else { chip.classList.toggle('is-on'); }
  });

  function chipVal(field) {
    var g = form.querySelector('[data-field="' + field + '"]'); if (!g) return null;
    var on = g.querySelector('.chip.is-on'); return on ? on.textContent.trim() : null;
  }
  function chipMulti(field) {
    var g = form.querySelector('[data-field="' + field + '"]'); if (!g) return [];
    return [].slice.call(g.querySelectorAll('.chip.is-on')).map(function (c) { return c.textContent.trim(); });
  }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  function collect() {
    var colors = null;
    try { colors = JSON.parse(localStorage.getItem('npc_colors') || 'null'); } catch (e) {}
    return {
      project_type: chipVal('project_type'), areas: chipMulti('areas'),
      sqft: val('f_sqft'), stories: val('f_stories'), bedrooms: val('f_bedrooms'),
      bathrooms: val('f_bathrooms'), ceiling: val('f_ceiling'), condition: chipVal('condition'),
      timing: chipVal('timing'), paint_provided: chipVal('paint_provided'), notes: val('f_notes'),
      name: val('f_name'), phone: val('f_phone'), email: val('f_email'), address: val('f_address'),
      contact_pref: chipVal('contact_pref'), colors: colors,
    };
  }

  submitBtn.addEventListener('click', async function () {
    var err = document.getElementById('formErr'); err.style.display = 'none';
    var data = collect();
    if (!data.name || !data.phone || !data.email || !data.address) {
      err.textContent = 'Please fill in your name, phone, email, and address.'; err.style.display = 'inline-block'; return;
    }
    submitBtn.disabled = true; submitBtn.textContent = 'Submitting…';
    try {
      var r = await fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Something went wrong.');
      try { localStorage.removeItem('npc_colors'); } catch (e) {}
      var ref = document.getElementById('refLine'); if (ref && d.reference) ref.textContent = 'Reference #' + d.reference;
      current = order.indexOf('done'); show('done');
    } catch (e) {
      err.textContent = e.message; err.style.display = 'inline-block';
      submitBtn.disabled = false; submitBtn.textContent = 'Submit Request →';
    }
  });

  show('1');
})();
