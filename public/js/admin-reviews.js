'use strict';
(function () {
  const A = window.Admin;
  let status = 'pending';
  const stars = (n) => '★★★★★☆☆☆☆☆'.slice(5 - n, 10 - n);

  async function load() {
    const list = await A.api('/api/admin/reviews?status=' + status);
    const el = document.getElementById('list');
    if (!list.length) { el.innerHTML = `<p class="muted">No ${status} reviews.</p>`; return; }
    el.innerHTML = list.map(card).join('');
  }

  function card(r) {
    const flagged = r.flagged ? '<span class="tag tag--bad">flagged · possible spam</span>' : '';
    const actions = status === 'pending'
      ? `<button class="btn btn--sm" data-act="published" data-id="${r.id}">✓ Approve &amp; Publish</button>
         <button class="btn btn--plain btn--sm" data-act="reply" data-id="${r.id}">↩ Reply</button>
         <button class="btn btn--plain btn--sm" style="color:var(--bad);border-color:#f2c3bb;" data-act="rejected" data-id="${r.id}">✕ Reject</button>`
      : status === 'published'
      ? `<button class="btn btn--plain btn--sm" data-act="reply" data-id="${r.id}">↩ Reply</button>
         <button class="btn btn--plain btn--sm" style="color:var(--bad);border-color:#f2c3bb;" data-act="rejected" data-id="${r.id}">✕ Unpublish</button>`
      : `<button class="btn btn--sm" data-act="published" data-id="${r.id}">Restore &amp; Publish</button>`;
    return `<div class="card" style="margin-bottom:14px;">
      <div class="badge-row" style="justify-content:space-between;">
        <div><strong>${A.esc(r.name)}</strong> · <small>${A.esc(r.town || '—')}</small><br>
          <span class="stars">${stars(r.rating)}</span>
          <small class="muted"> · ${A.esc(r.project_type || '—')} · ${A.ago(r.created_at)} ago</small></div>
        ${flagged}
      </div>
      <p style="margin:12px 0;">"${A.esc(r.body)}"</p>
      ${r.reply ? `<div class="card" style="background:var(--wash);"><small class="muted">Your reply:</small><br>${A.esc(r.reply)}</div>` : ''}
      <div class="badge-row" style="margin-top:10px;">${actions}</div>
    </div>`;
  }

  document.getElementById('tabs').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    document.querySelectorAll('#tabs .chip').forEach((c) => c.classList.remove('is-on'));
    chip.classList.add('is-on'); status = chip.dataset.status; load();
  });

  document.getElementById('list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]'); if (!btn) return;
    const id = btn.dataset.id, act = btn.dataset.act;
    if (act === 'reply') {
      const reply = prompt('Public reply to this review:'); if (reply == null) return;
      await A.api('/api/admin/reviews/' + id, { method: 'PATCH', body: JSON.stringify({ reply }) });
    } else {
      await A.api('/api/admin/reviews/' + id, { method: 'PATCH', body: JSON.stringify({ status: act }) });
    }
    load();
  });

  load();
})();
