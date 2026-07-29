'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var email = '';
  var money = function (n) { return '$' + Math.round(+n || 0).toLocaleString('en-US'); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); }); };

  async function post(url, data) {
    var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || 'Error');
    return d;
  }
  function err(msg) { var e = $('loginErr'); e.textContent = msg; e.style.display = 'inline-block'; }

  $('sendCode').addEventListener('click', async function () {
    $('loginErr').style.display = 'none';
    email = $('pEmail').value.trim();
    if (!email) return err('Please enter your email.');
    try {
      var d = await post('/api/portal/request-code', { email: email });
      $('emailEcho').textContent = email;
      $('stepEmail').hidden = true; $('stepCode').hidden = false;
      if (d.devCode) { var h = $('devHint'); h.style.display = 'block'; h.innerHTML = '<strong>Dev mode:</strong> email isn\'t configured yet, so your code is <strong>' + d.devCode + '</strong> (in production this is emailed).'; }
    } catch (e) { err(e.message); }
  });

  $('backEmail').addEventListener('click', function (e) { e.preventDefault(); $('stepCode').hidden = true; $('stepEmail').hidden = false; });

  $('verifyCode').addEventListener('click', async function () {
    $('loginErr').style.display = 'none';
    try {
      var d = await post('/api/portal/verify', { email: email, code: $('pCode').value.trim() });
      render(d.project);
    } catch (e) { err(e.message); }
  });

  function render(p) {
    $('login').hidden = true;
    var wrap = $('project'); wrap.hidden = false;
    var steps = p.stages.map(function (s, i) {
      var done = i < p.stageIndex, on = i === p.stageIndex;
      var color = done ? 'var(--good)' : on ? 'var(--accent)' : 'var(--line)';
      return '<div style="flex:1;text-align:center;font-size:.72rem;color:' + (on ? 'var(--accent)' : done ? 'var(--good)' : 'var(--ink-faint)') +
        ';border-top:3px solid ' + color + ';padding-top:8px;font-weight:600">' + esc(s) + '</div>';
    }).join('');

    var appt = p.appt ? '<div class="card"><strong>📅 Your estimate appointment</strong><p style="margin:6px 0 0">' +
      esc(p.appt.type || 'Visit') + ' · ' + esc(p.appt.date) + ' ' + esc(p.appt.time || '') + '</p></div>' : '';

    var quote = p.price ? '<div class="card" style="background:var(--accent-2);border-color:#cddcff"><strong>Your quote is ready</strong>' +
      '<p style="font-size:1.6rem;font-weight:750;margin:6px 0">' + money(p.price) + '</p>' +
      (p.proposalToken ? '<a class="btn" href="proposal.html">Review &amp; accept proposal →</a>' : '') + '</div>'
      : '<div class="card"><strong>Estimate in progress</strong><p style="margin:6px 0 0" class="muted">We\'re preparing your quote and will notify you here and by ' +
        'phone/email. Nothing to do yet!</p></div>';

    var colors = (p.colors && p.colors.length) ? '<div class="card"><strong>Your selected colors</strong><p style="margin:6px 0 0">' +
      p.colors.map(function (c) { return esc(c.name || c); }).join(', ') + '</p></div>' : '';

    wrap.innerHTML =
      '<div class="badge-row" style="justify-content:space-between;margin-bottom:16px"><div><div class="eyebrow">My Project</div>' +
      '<h1 style="margin:0">' + esc(p.name || 'Your project') + '</h1><p class="muted" style="margin:2px 0 0">' + esc(p.address || '') + '</p></div>' +
      '<button class="btn btn--plain btn--sm" id="logoutBtn">Sign out</button></div>' +
      '<div class="card card--pad-lg"><strong>Status: ' + esc(p.stage) + '</strong>' +
      '<div style="display:flex;gap:6px;margin-top:14px">' + steps + '</div></div>' +
      '<div class="stack" style="margin-top:16px">' + quote + appt + colors +
      '<div class="card"><strong>Questions?</strong><p style="margin:6px 0 0">Call (516) 555-0100 or reply to your confirmation email.</p></div></div>';

    $('logoutBtn').addEventListener('click', async function () { await post('/api/portal/logout'); location.reload(); });
  }

  // auto-login if session exists
  (async function () {
    try { var d = await (await fetch('/api/portal/me')).json(); if (d.project) render(d.project); } catch (e) {}
  })();
})();
