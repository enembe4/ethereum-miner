'use strict';
/* Shared helpers for the admin screens. */
window.Admin = (function () {
  async function api(url, opts) {
    const r = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
    if (r.status === 401) { location.href = '/admin/login'; throw new Error('unauthorized'); }
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || ('HTTP ' + r.status)); }
    return r.status === 204 ? null : r.json();
  }
  const money = (n) => '$' + Math.round(+n || 0).toLocaleString('en-US');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ago = (iso) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm';
    if (s < 86400) return Math.round(s / 3600) + 'h';
    return Math.round(s / 86400) + 'd';
  };
  const verdictTag = (v) => v === 'Healthy' ? 'tag--good' : v === 'Thin' ? 'tag--warn' : 'tag--bad';
  async function logout() { await api('/admin/logout', { method: 'POST' }); location.href = '/admin/login'; }
  function qs(k) { return new URLSearchParams(location.search).get(k); }
  return { api, money, esc, ago, verdictTag, logout, qs };
})();
