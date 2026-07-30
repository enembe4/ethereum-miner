/* ------------------------------------------------------------
   Website chat — self-injecting floating widget.
   Two modes, decided by GET /api/chat/config:
     • AI mode  — real Claude conversation via /api/chat/message;
                  Claude answers questions and files the lead itself.
     • Scripted — guided capture (no API key configured, or AI errors
                  mid-conversation); still files a lead via /api/chat.
   ------------------------------------------------------------ */
(function () {
  if (window.__npcChat) return; window.__npcChat = true;

  /* Matches the "Gallery" system in css/site.css: monochrome neutrals,
     square corners, tiny widely-tracked caps, no fills but black. */
  var css = `
  .npc-fab{position:fixed;right:26px;bottom:74px;z-index:70;padding:14px 20px;border-radius:0;
    background:#1a1a1a;color:#fff;border:1px solid #1a1a1a;cursor:pointer;
    font:500 .62rem/1 inherit;letter-spacing:.18em;text-transform:uppercase}
  .npc-fab:hover{background:transparent;color:#1a1a1a}
  @media(min-width:761px){.npc-fab{bottom:26px}}
  .npc-panel{position:fixed;right:26px;bottom:132px;z-index:71;width:352px;max-width:calc(100vw - 52px);
    background:#fff;border:1px solid #1a1a1a;border-radius:0;
    display:none;flex-direction:column;overflow:hidden;font-family:inherit}
  @media(min-width:761px){.npc-panel{bottom:86px}}
  .npc-panel.open{display:flex}
  .npc-head{background:#1a1a1a;color:#fff;padding:17px 18px;display:flex;justify-content:space-between;align-items:center;
    font:500 .66rem/1.2 inherit;letter-spacing:.18em;text-transform:uppercase}
  .npc-head small{color:rgba(255,255,255,.6);display:block;margin-top:6px;
    font-size:.58rem;font-weight:400;letter-spacing:.14em;text-transform:uppercase}
  .npc-body{padding:18px;height:308px;overflow-y:auto;background:#faf9f7;display:flex;flex-direction:column;gap:10px}
  .npc-msg{max-width:86%;padding:11px 14px;border-radius:0;font-size:.9rem;line-height:1.55;white-space:pre-wrap}
  .npc-bot{background:#fff;border:1px solid #e2dfda;color:#4a4744;align-self:flex-start}
  .npc-me{background:#1a1a1a;color:#fff;align-self:flex-end}
  .npc-typing{opacity:.5;font-style:italic}
  .npc-foot{display:flex;gap:10px;padding:14px 18px;border-top:1px solid #e2dfda;background:#fff;align-items:center}
  .npc-foot input{flex:1;padding:10px 0;border:0;border-bottom:1px solid #e2dfda;border-radius:0;
    font:inherit;font-size:.9rem;color:#1a1a1a;background:transparent}
  .npc-foot input:focus{outline:none;border-bottom-color:#1a1a1a}
  .npc-foot button{padding:11px 18px;border:1px solid #1a1a1a;border-radius:0;background:#1a1a1a;color:#fff;cursor:pointer;
    font:500 .6rem/1 inherit;letter-spacing:.18em;text-transform:uppercase;white-space:nowrap}
  .npc-foot button:hover{background:transparent;color:#1a1a1a}
  .npc-quick{display:flex;flex-wrap:wrap;gap:8px}
  .npc-quick button{background:transparent;border:1px solid #e2dfda;color:#4a4744;border-radius:0;padding:9px 14px;
    font:500 .58rem/1 inherit;letter-spacing:.16em;text-transform:uppercase;cursor:pointer}
  .npc-quick button:hover{border-color:#1a1a1a;color:#1a1a1a}`;
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  var fab = el('button', 'npc-fab', 'Chat'); fab.setAttribute('aria-label', 'Chat with us');
  var panel = el('div', 'npc-panel');
  panel.innerHTML =
    '<div class="npc-head"><div>Chat with us <small>Typically replies in seconds</small></div>' +
    '<span style="cursor:pointer" id="npcX">✕</span></div>' +
    '<div class="npc-body" id="npcBody"></div>' +
    '<div class="npc-foot"><input id="npcInput" placeholder="Type a message…" autocomplete="off"><button id="npcSend">Send</button></div>';
  document.body.appendChild(fab); document.body.appendChild(panel);

  var body = panel.querySelector('#npcBody');
  var input = panel.querySelector('#npcInput');

  var mode = null;                 // 'ai' | 'scripted' (decided on open)
  var history = [];                // AI mode: [{role, content}]
  var transcript = [];             // scripted mode: plain log for the lead note
  var lead = { need: '', name: '', phone: '', email: '' };
  var state = 'need';
  var busy = false;

  function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt) e.textContent = txt; return e; }
  function scroll() { body.scrollTop = body.scrollHeight; }
  function bot(text, quick) {
    var m = el('div', 'npc-msg npc-bot', text); body.appendChild(m); transcript.push('Bot: ' + text);
    if (quick) { var q = el('div', 'npc-quick'); quick.forEach(function (label) { var b = el('button', '', label); b.onclick = function () { handle(label); }; q.appendChild(b); }); body.appendChild(q); }
    scroll();
  }
  function me(text) { var m = el('div', 'npc-msg npc-me', text); body.appendChild(m); transcript.push('You: ' + text); scroll(); }
  function typing(on) {
    var t = document.getElementById('npcTyping');
    if (on && !t) { t = el('div', 'npc-msg npc-bot npc-typing', '…'); t.id = 'npcTyping'; body.appendChild(t); scroll(); }
    if (!on && t) t.remove();
  }

  /* ---- AI mode ---- */
  async function aiSend(text) {
    history.push({ role: 'user', content: text });
    busy = true; typing(true);
    try {
      var r = await fetch('/api/chat/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
      var d = await r.json();
      typing(false); busy = false;
      if (!r.ok || d.mode === 'scripted') throw new Error(d.error || 'no ai');
      history.push({ role: 'assistant', content: d.text });
      bot(d.text, d.leadRef ? ['Get a free quote'] : null);
    } catch (e) {
      // Degrade to the guided flow mid-conversation rather than going silent.
      typing(false); busy = false; mode = 'scripted';
      scriptedReply(text);
    }
  }

  /* ---- Scripted mode (fallback / no API key) ---- */
  function scriptedReply(text) {
    if (state === 'need') { lead.need = text; state = 'name'; return bot("Happy to help with that! What's your name?"); }
    if (state === 'name') { lead.name = text; state = 'phone'; return bot('Thanks, ' + text.split(' ')[0] + ". What's the best phone number to reach you?"); }
    if (state === 'phone') { lead.phone = text; state = 'email'; return bot('Great. And your email? (optional — type "skip")'); }
    if (state === 'email') {
      if (!/skip/i.test(text)) lead.email = text;
      state = 'done'; scriptedSubmit();
      return bot("Perfect — I've passed your details to the team. We'll reach out shortly. Anything else?");
    }
    return bot('Thanks! A team member will follow up. You can also call (516) 555-0100 or get a full quote anytime.', ['Get a free quote']);
  }
  async function scriptedSubmit() {
    try {
      await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: lead.name, phone: lead.phone, email: lead.email, need: lead.need, transcript: transcript.join('\n') }) });
    } catch (e) { /* non-fatal */ }
  }

  /* ---- shared plumbing ---- */
  function handle(text) {
    if (text === 'Get a free quote') { location.href = 'quote.html'; return; }
    if (busy) return;
    me(text);
    if (mode === 'ai') aiSend(text);
    else setTimeout(function () { scriptedReply(text); }, 250);
  }

  function open() {
    panel.classList.add('open');
    if (!body.children.length) {
      if (mode === null) {
        fetch('/api/chat/config').then(function (r) { return r.json(); })
          .then(function (d) { mode = d.ai ? 'ai' : 'scripted'; })
          .catch(function () { mode = 'scripted'; });
      }
      bot('What can we help you paint?', ['Interior', 'Exterior', 'Cabinets', 'Get a quote']);
    }
    input.focus();
  }
  fab.onclick = function () { panel.classList.contains('open') ? panel.classList.remove('open') : open(); };
  panel.querySelector('#npcX').onclick = function () { panel.classList.remove('open'); };
  panel.querySelector('#npcSend').onclick = send;
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  function send() { var t = input.value.trim(); if (!t) return; input.value = ''; if (t === 'Get a quote') { location.href = 'quote.html'; return; } handle(t); }
})();
