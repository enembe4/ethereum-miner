/* ------------------------------------------------------------
   Site-wide motion & journey layer. Progressive enhancement:
   with JS off (or prefers-reduced-motion on) every page is
   fully readable — this file only adds, never gates.

     · Scroll reveals — content rises in quietly as it enters
     · Stat counters — figures count up on first sight
     · Hero parallax — the photograph drifts slower than the page
     · Nav — tightens once you scroll
     · Before/after sliders — [data-ba] drag/keyboard compare
     · Marquee — the towns ribbon drifts continuously
     · Journey — every page ends with one clear next step
     · Quote — colors saved in the visualizer surface in the form
   ------------------------------------------------------------ */
(function () {
  'use strict';
  var motionOK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- scroll reveals ---------- */
  if (motionOK && 'IntersectionObserver' in window) {
    var candidates = document.querySelectorAll(
      '.sec-head, .pagehead > .wrap, .grid > *, .facts > *, .rule-list li, .split__copy, .card--framed, .footer__cols > *'
    );
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('rv-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    candidates.forEach(function (el) {
      // stagger siblings so grids cascade instead of arriving as a block
      var i = 0, sib = el;
      while ((sib = sib.previousElementSibling) && i < 5) i++;
      el.style.transitionDelay = (i * 70) + 'ms';
      el.classList.add('rv');
      io.observe(el);
    });
  }

  /* ---------- stat counters ---------- */
  if (motionOK && 'IntersectionObserver' in window) {
    var nums = document.querySelectorAll('.pill-stat b');
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        cio.unobserve(en.target);
        var el = en.target, m = /^([\d.,]+)(.*)$/.exec(el.textContent.trim());
        if (!m) return;
        var target = parseFloat(m[1].replace(/,/g, '')), suffix = m[2];
        var decimals = (m[1].split('.')[1] || '').length;
        var t0 = null;
        function frame(t) {
          if (!t0) t0 = t;
          var k = Math.min(1, (t - t0) / 950);
          k = 1 - Math.pow(1 - k, 3); // ease-out cubic
          var v = (target * k).toFixed(decimals);
          el.textContent = (+v).toLocaleString('en-US', { minimumFractionDigits: decimals }) + suffix;
          if (k < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
    }, { threshold: 0.6 });
    nums.forEach(function (el) { cio.observe(el); });
  }

  /* ---------- hero parallax ---------- */
  var heroImg = document.querySelector('.hero__media img');
  if (heroImg && motionOK && window.innerWidth > 900) {
    heroImg.style.transform = 'scale(1.08)';
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () {
        var y = Math.min(window.scrollY, window.innerHeight);
        heroImg.style.transform = 'scale(1.08) translate3d(0,' + (y * 0.14) + 'px,0)';
        ticking = false;
      });
    }, { passive: true });
  }

  /* ---------- nav state ---------- */
  var nav = document.querySelector('.nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('nav--scrolled', window.scrollY > 10); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- before / after sliders ---------- */
  function initBA(ba) {
    var handle = ba.querySelector('.ba__handle');
    function set(pct) {
      pct = Math.max(2, Math.min(98, pct));
      ba.style.setProperty('--ba', pct + '%');
      if (handle) handle.setAttribute('aria-valuenow', Math.round(pct));
    }
    function fromEvent(e) {
      var r = ba.getBoundingClientRect();
      set((e.clientX - r.left) / r.width * 100);
    }
    ba.addEventListener('pointerdown', function (e) {
      e.preventDefault(); fromEvent(e);
      var move = function (ev) { fromEvent(ev); };
      var up = function () {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    if (handle) handle.addEventListener('keydown', function (e) {
      var now = parseFloat(ba.style.getPropertyValue('--ba')) || 50;
      if (e.key === 'ArrowLeft') { set(now - 3); e.preventDefault(); }
      if (e.key === 'ArrowRight') { set(now + 3); e.preventDefault(); }
    });
    set(50);
  }
  document.querySelectorAll('[data-ba]').forEach(initBA);
  window.NPCSite = { initBA: initBA }; // for dynamically created sliders (AI render result)

  /* ---------- marquee ---------- */
  document.querySelectorAll('.marquee__track').forEach(function (track) {
    if (!motionOK) { track.classList.add('is-static'); return; }
    track.innerHTML += track.innerHTML; // seamless loop needs the content twice
  });

  /* ---------- journey: one clear next step per page ---------- */
  var JOURNEY = {
    'services.html': { href: 'visualizer.html', label: 'Next · The Color Visualizer', title: 'See these colors on your own home', body: 'Upload a photo and repaint it before you commit to anything.' },
    'gallery.html': { href: 'visualizer.html', label: 'Next · The Color Visualizer', title: 'Try these looks on your house', body: 'Tap a wall in your own photo and preview the exact colors.' },
    'visualizer.html': { href: 'quote.html', label: 'Next · Your Estimate', title: 'Price the exact finish', body: 'Your saved colors attach to the request — two minutes, no obligation.' },
    'testimonials.html': { href: 'quote.html', label: 'Next · Your Estimate', title: 'Join your neighbors', body: 'A realistic, no-pressure estimate in about two minutes.' },
    'financing.html': { href: 'quote.html', label: 'Next · Your Estimate', title: 'Get the number first', body: 'Know your project cost, then decide how to pay for it.' },
    'service-area.html': { href: 'schedule.html', label: 'Next · Book a Visit', title: 'Pick a time that suits you', body: 'In-home or video walkthrough — booked in under a minute.' },
  };
  var page = location.pathname.split('/').pop() || 'index.html';
  var j = JOURNEY[page];
  var footer = document.querySelector('.footer');
  if (j && footer) {
    var sec = document.createElement('section');
    sec.className = 'journey';
    sec.innerHTML =
      '<div class="wrap journey__inner">' +
      '<div><div class="eyebrow">' + j.label + '</div>' +
      '<h2 class="journey__title"><a href="' + j.href + '">' + j.title + '</a></h2>' +
      '<p class="muted" style="margin:0;">' + j.body + '</p></div>' +
      '<a class="btn btn--ghost btn--lg" href="' + j.href + '">Continue</a>' +
      '</div>';
    footer.parentNode.insertBefore(sec, footer);
  }

  /* ---------- quote form: surface saved visualizer colors ---------- */
  var colorsSlot = document.getElementById('savedColors');
  if (colorsSlot) {
    var saved = [];
    try { saved = JSON.parse(localStorage.getItem('npc_colors') || '[]') || []; } catch (e) {}
    if (saved.length) {
      colorsSlot.hidden = false;
      var row = colorsSlot.querySelector('[data-colors]');
      if (row) row.innerHTML = saved.map(function (c) {
        return '<span class="vz-saved" style="cursor:default;"><span class="vz-saved__dot" style="background:' +
          (c.hex || '#ccc') + '"></span>' + c.name + (c.code ? ' · ' + c.code : '') + '</span>';
      }).join('');
    }
  }
})();
