/* ------------------------------------------------------------
   Lead profitability calculator (wireframe behavior)
   Live-recalculates cost, price, profit, and margin as the
   owner tweaks any input. Numbers are illustrative defaults;
   real rate cards live in Settings in production.
   ------------------------------------------------------------ */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  if (!$('sqft')) return;

  var ids = ['sqft','rate','coats','crew','days','hrsday','laborRate',
             'gallons','galPrice','supplies','other','overhead','override','leadSafe'];

  function money(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function num(id) { var el = $(id); return parseFloat(el.value) || 0; }

  function recalc() {
    var sqft = num('sqft');
    var rate = num('rate');
    var coats = num('coats');

    // Customer-facing price (auto), unless overridden
    var auto = sqft * rate;
    var override = num('override');
    var price = override > 0 ? override : auto;

    // Suggested gallons: ~1 gal / 350 sqft / coat (heuristic)
    var suggested = Math.max(1, Math.ceil((sqft / 350) * coats));
    var galEl = $('galSuggest'); if (galEl) galEl.textContent = '~' + suggested;

    // Costs
    var laborHrs = num('crew') * num('days') * num('hrsday');
    var labor = laborHrs * num('laborRate');
    var paint = num('gallons') * num('galPrice');
    var materials = num('supplies') + num('other');
    var overhead = price * (num('overhead') / 100);

    var baseCost = labor + paint + materials + overhead;
    var leadSafe = $('leadSafe') && $('leadSafe').checked ? baseCost * 0.10 : 0;
    var cost = baseCost + leadSafe;

    var profit = price - cost;
    var margin = price > 0 ? (profit / price) * 100 : 0;
    var effHourly = laborHrs > 0 ? profit / laborHrs : 0;

    // Write outputs
    $('oPrice').textContent = money(price);
    $('oLabor').textContent = money(labor);
    $('oPaint').textContent = money(paint);
    $('oMat').textContent = money(materials + leadSafe);
    $('oOh').textContent = money(overhead);
    $('oCost').textContent = money(cost);
    $('oProfit').textContent = money(profit);
    $('oMargin').textContent = margin.toFixed(1) + '%';
    $('oHourly').textContent = money(effHourly) + ' /hr';

    // Verdict badge
    var v = $('verdict');
    v.className = 'tag';
    if (margin >= 40) { v.classList.add('tag--good'); v.textContent = 'Healthy'; }
    else if (margin >= 25) { v.classList.add('tag--warn'); v.textContent = 'Thin'; }
    else { v.classList.add('tag--bad'); v.textContent = 'Reconsider'; }

    // Profit line color cue
    $('oProfit').style.color = profit >= 0 ? 'var(--good)' : 'var(--bad)';
  }

  ids.forEach(function (id) {
    var el = $(id); if (!el) return;
    el.addEventListener('input', recalc);
    el.addEventListener('change', recalc);
  });

  recalc();
})();
