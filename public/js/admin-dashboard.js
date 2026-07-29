'use strict';
(async function () {
  const A = window.Admin;
  const townOf = (addr) => { const m = /,\s*([^,]+?),?\s*NY/i.exec(addr || ''); return m ? m[1].trim() : (addr || '—'); };
  let leads = [];

  async function load() {
    const [metrics, list] = await Promise.all([A.api('/api/admin/metrics'), A.api('/api/admin/leads')]);
    leads = list;
    renderMetrics(metrics);
    renderBoard(metrics.stages, leads);
    renderTable(leads);
    const badge = document.getElementById('revBadge');
    if (metrics.pendingReviews > 0) { badge.textContent = metrics.pendingReviews; badge.style.display = 'inline-block'; }
  }

  function renderMetrics(m) {
    document.getElementById('metrics').innerHTML = [
      ['New leads', m.newCount], ['Pipeline value', A.money(m.pipeline)],
      ['Quotes out', m.quotes], ['Win rate', m.winRate + '%'],
    ].map(([label, val]) => `<div class="metric"><b>${val}</b><span>${label}</span></div>`).join('');
  }

  function priceOf(l) { return l.override_price > 0 ? l.override_price : (l.est_price || 0); }

  function card(l) {
    const m = l._margin;
    return `<div class="lead-card" onclick="location.href='/admin/lead.html?id=${l.id}'">
      <b>${A.esc(l.name || 'Unknown')}</b>
      <div class="meta">${A.esc(townOf(l.address))} · ${A.esc(l.project_type || '—')}${l.sqft ? ' · ' + l.sqft + ' sqft' : ''}</div>
      <div class="badge-row" style="justify-content:space-between;margin-top:8px;">
        <span class="amt">${priceOf(l) ? A.money(priceOf(l)) : '—'}</span>
        <span class="tag ${A.verdictTag(m.verdict)}">${m.margin.toFixed(0)}%</span>
      </div>
      <div class="badge-row" style="justify-content:space-between;margin-top:6px;">
        <small class="muted">${A.ago(l.created_at)} ago</small>
        <small class="muted">${A.esc(l.source.replace('website_', ''))}</small>
      </div>
    </div>`;
  }

  function renderBoard(stages, list) {
    const board = document.getElementById('board');
    board.innerHTML = stages.map((st) => {
      const col = list.filter((l) => l.stage === st);
      return `<div class="kanban__col"><h4>${st} <span>${col.length}</span></h4>${col.map(card).join('') || '<div class="muted" style="font-size:.78rem;padding:6px;">—</div>'}</div>`;
    }).join('');
  }

  function renderTable(list) {
    document.getElementById('tbody').innerHTML = list.map((l) => {
      const m = l._margin;
      return `<tr onclick="location.href='/admin/lead.html?id=${l.id}'" style="cursor:pointer;">
        <td><b>${A.esc(l.name || 'Unknown')}</b></td><td>${A.esc(townOf(l.address))}</td>
        <td>${A.esc(l.project_type || '—')}${l.sqft ? ' · ' + l.sqft : ''}</td>
        <td>${priceOf(l) ? A.money(priceOf(l)) : '—'}</td>
        <td><span class="tag ${A.verdictTag(m.verdict)}">${m.margin.toFixed(0)}%</span></td>
        <td>${A.esc(l.stage)}</td><td>${A.ago(l.created_at)}</td>
        <td><a href="/admin/lead.html?id=${l.id}">Open →</a></td></tr>`;
    }).join('');
  }

  document.getElementById('search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = leads.filter((l) => (`${l.name} ${l.address} ${l.project_type}`).toLowerCase().includes(q));
    renderTable(filtered);
  });

  try { await load(); } catch (e) { document.getElementById('board').innerHTML = '<p class="tag tag--bad">' + A.esc(e.message) + '</p>'; }
})();
