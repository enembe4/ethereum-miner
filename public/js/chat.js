/* ------------------------------------------------------------
   Website chat — guided lead capture. Self-injects a floating
   widget. Runs a scripted qualifying flow now; the reply()
   function is the single hook to swap in Claude later (see the
   /api/chat/ai TODO in server.js).
   ------------------------------------------------------------ */
(function () {
  if (window.__npcChat) return; window.__npcChat = true;

  var css = `
  .npc-fab{position:fixed;right:18px;bottom:74px;z-index:70;width:56px;height:56px;border-radius:50%;
    background:#2f6fed;color:#fff;border:none;cursor:pointer;font-size:24px;box-shadow:0 4px 16px rgba(0,0,0,.25)}
  @media(min-width:761px){.npc-fab{bottom:18px}}
  .npc-panel{position:fixed;right:18px;bottom:140px;z-index:71;width:330px;max-width:calc(100vw - 36px);
    background:#fff;border:1px solid #c9c9cf;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.22);
    display:none;flex-direction:column;overflow:hidden;font-family:inherit}
  @media(min-width:761px){.npc-panel{bottom:84px}}
  .npc-panel.open{display:flex}
  .npc-head{background:#1d1d1f;color:#fff;padding:12px 14px;font-weight:600;display:flex;justify-content:space-between;align-items:center}
  .npc-head small{color:#9fe6b0;font-weight:400;display:block;font-size:.72rem}
  .npc-body{padding:12px;height:300px;overflow-y:auto;background:#f4f4f6;display:flex;flex-direction:column;gap:8px}
  .npc-msg{max-width:82%;padding:8px 11px;border-radius:12px;font-size:.9rem;line-height:1.35}
  .npc-bot{background:#fff;border:1px solid #e3e3e7;align-self:flex-start;border-bottom-left-radius:3px}
  .npc-me{background:#2f6fed;color:#fff;align-self:flex-end;border-bottom-right-radius:3px}
  .npc-foot{display:flex;gap:6px;padding:10px;border-top:1px solid #e3e3e7;background:#fff}
  .npc-foot input{flex:1;padding:9px 11px;border:1px solid #c9c9cf;border-radius:8px;font:inherit}
  .npc-foot button{padding:9px 13px;border:none;border-radius:8px;background:#2f6fed;color:#fff;cursor:pointer}
  .npc-quick{display:flex;flex-wrap:wrap;gap:6px}
  .npc-quick button{background:#eef3fe;border:1px solid #cddcff;color:#2f6fed;border-radius:100px;padding:6px 11px;font-size:.82rem;cursor:pointer}`;
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  var fab = el('button', 'npc-fab', '💬'); fab.setAttribute('aria-label', 'Chat with us');
  var panel = el('div', 'npc-panel');
  panel.innerHTML =
    '<div class="npc-head"><div>Chat with us <small>Typically replies in a few minutes</small></div>' +
    '<span style="cursor:pointer" id="npcX">✕</span></div>' +
    '<div class="npc-body" id="npcBody"></div>' +
    '<div class="npc-foot"><input id="npcInput" placeholder="Type a message…" autocomplete="off"><button id="npcSend">Send</button></div>';
  document.body.appendChild(fab); document.body.appendChild(panel);

  var body = panel.querySelector('#npcBody');
  var input = panel.querySelector('#npcInput');
  var transcript = [];
  var lead = { need: '', name: '', phone: '', email: '' };
  var state = 'need';

  function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt) e.textContent = txt; return e; }
  function bot(text, quick) {
    var m = el('div', 'npc-msg npc-bot', text); body.appendChild(m); transcript.push('Bot: ' + text);
    if (quick) { var q = el('div', 'npc-quick'); quick.forEach(function (label) { var b = el('button', '', label); b.onclick = function () { handle(label); }; q.appendChild(b); }); body.appendChild(q); }
    body.scrollTop = body.scrollHeight;
  }
  function me(text) { var m = el('div', 'npc-msg npc-me', text); body.appendChild(m); transcript.push('You: ' + text); body.scrollTop = body.scrollHeight; }

  // Scripted assistant. Swap this state machine for a Claude call when ready.
  function reply(text) {
    if (state === 'need') { lead.need = text; state = 'name'; return bot("Happy to help with that! What's your name?"); }
    if (state === 'name') { lead.name = text; state = 'phone'; return bot('Thanks, ' + text.split(' ')[0] + '. What\'s the best phone number to reach you?'); }
    if (state === 'phone') { lead.phone = text; state = 'email'; return bot('Great. And your email? (optional — type "skip")'); }
    if (state === 'email') {
      if (!/skip/i.test(text)) lead.email = text; state = 'done'; submit();
      return bot("Perfect — I've passed your details to the team. We'll reach out shortly with next steps. Anything else?");
    }
    return bot('Thanks! A team member will follow up. You can also call (516) 555-0100 or get a full quote anytime.', ['Get a free quote']);
  }
  function handle(text) {
    if (text === 'Get a free quote') { location.href = 'quote.html'; return; }
    me(text); setTimeout(function () { reply(text); }, 250);
  }

  async function submit() {
    try {
      await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: lead.name, phone: lead.phone, email: lead.email, need: lead.need, transcript: transcript.join('\n') }) });
    } catch (e) { /* wireframe: ignore */ }
  }

  function open() {
    panel.classList.add('open');
    if (!body.children.length) bot('Hi! 👋 What can we help you paint?', ['Interior', 'Exterior', 'Cabinets', 'Get a quote']);
  }
  fab.onclick = function () { panel.classList.contains('open') ? panel.classList.remove('open') : open(); };
  panel.querySelector('#npcX').onclick = function () { panel.classList.remove('open'); };
  panel.querySelector('#npcSend').onclick = send;
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  function send() { var t = input.value.trim(); if (!t) return; input.value = ''; if (t === 'Get a quote') { location.href = 'quote.html'; return; } handle(t); }
})();
