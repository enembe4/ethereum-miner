/* ------------------------------------------------------------
   Quote request — multi-step wizard (wireframe behavior)
   Demonstrates the flow. In production this posts the payload
   to the pipeline/CRM and triggers the owner-notification email.
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
    form.querySelectorAll('.q-step').forEach(function (s) {
      s.hidden = s.getAttribute('data-step') !== key;
    });
    // progress bar (only for the 4 numbered steps)
    if (stepsBar) {
      stepsBar.querySelectorAll('.steps__item').forEach(function (it) {
        var n = it.getAttribute('data-step');
        it.classList.remove('is-active', 'is-done');
        if (key === 'done') { it.classList.add('is-done'); return; }
        if (n === key) it.classList.add('is-active');
        else if (Number(n) < Number(key)) it.classList.add('is-done');
      });
    }
    // controls
    backBtn.hidden = (key === '1' || key === 'done');
    nextBtn.hidden = (key === '4' || key === 'done');
    submitBtn.hidden = (key !== '4');
    if (key === 'done') document.getElementById('controls').style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  nextBtn.addEventListener('click', function () {
    if (current < order.length - 1) { current++; show(order[current]); }
  });
  backBtn.addEventListener('click', function () {
    if (current > 0) { current--; show(order[current]); }
  });
  submitBtn.addEventListener('click', function () {
    // Wireframe: no real network call. Show confirmation.
    // Production: POST form data -> create Lead -> compute estimate -> email owner.
    current = order.indexOf('done');
    show('done');
  });

  // Chip selection (single-select groups vs multi-select)
  form.addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    var group = chip.parentElement;
    if (group.hasAttribute('data-single')) {
      group.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-on'); });
      chip.classList.add('is-on');
    } else {
      chip.classList.toggle('is-on');
    }
  });

  show('1');
})();
