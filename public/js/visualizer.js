/* ------------------------------------------------------------
   Color Visualizer — a real, working paint preview.

   Everything runs in the browser: the photo never leaves the
   device. Tap a surface and the engine grows a selection from
   that point (chroma-weighted flood fill, so a wall's shadow
   gradient stays one surface), feathers the mask edge, then
   recolors it with a luminance-preserving blend so texture,
   trim shadows and light falloff survive the new color.

   Selections persist across color changes — pick the wall once,
   then flip through the palette. "Add to my quote" writes the
   chosen colors to localStorage (npc_colors), which the quote
   form already attaches to the lead.
   ------------------------------------------------------------ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('vzCanvas');
  if (!canvas) return;

  /* ---------------- palette ---------------- */
  var COLORS = [
    { name: 'Chantilly Lace', code: 'BM OC-65', hex: '#F4F6F1', fam: 'Whites' },
    { name: 'White Dove', code: 'BM OC-17', hex: '#EFEDE1', fam: 'Whites' },
    { name: 'Swiss Coffee', code: 'BM OC-45', hex: '#EDE8D9', fam: 'Whites' },
    { name: 'Simply White', code: 'BM OC-117', hex: '#F6F7EE', fam: 'Whites' },
    { name: 'Balboa Mist', code: 'BM OC-27', hex: '#DDD6CA', fam: 'Neutrals' },
    { name: 'Edgecomb Gray', code: 'BM HC-173', hex: '#D8D1C0', fam: 'Neutrals' },
    { name: 'Accessible Beige', code: 'SW 7036', hex: '#D1C7B8', fam: 'Neutrals' },
    { name: 'Agreeable Gray', code: 'SW 7029', hex: '#D1CBC1', fam: 'Neutrals' },
    { name: 'Revere Pewter', code: 'BM HC-172', hex: '#CCC6B9', fam: 'Neutrals' },
    { name: 'Pale Oak', code: 'BM OC-20', hex: '#E1DCD1', fam: 'Neutrals' },
    { name: 'Saybrook Sage', code: 'BM HC-114', hex: '#A9B29A', fam: 'Greens' },
    { name: 'October Mist', code: 'BM 1495', hex: '#BCC2AD', fam: 'Greens' },
    { name: 'Soft Fern', code: 'BM 2144-40', hex: '#C4CBAC', fam: 'Greens' },
    { name: 'Essex Green', code: 'BM HC-188', hex: '#2E3D34', fam: 'Greens' },
    { name: 'Boothbay Gray', code: 'BM HC-165', hex: '#A4B2B1', fam: 'Blues' },
    { name: 'Quiet Moments', code: 'BM 1563', hex: '#C4CFC9', fam: 'Blues' },
    { name: 'Van Deusen Blue', code: 'BM HC-156', hex: '#47586B', fam: 'Blues' },
    { name: 'Hale Navy', code: 'BM HC-154', hex: '#434E5C', fam: 'Blues' },
    { name: 'Newburyport Blue', code: 'BM HC-155', hex: '#3C4F63', fam: 'Blues' },
    { name: 'Kendall Charcoal', code: 'BM HC-166', hex: '#686662', fam: 'Statement' },
    { name: 'Wrought Iron', code: 'BM 2124-10', hex: '#45474B', fam: 'Statement' },
    { name: 'Iron Ore', code: 'SW 7069', hex: '#434341', fam: 'Statement' },
    { name: 'Caliente', code: 'BM AF-290', hex: '#963B33', fam: 'Statement' },
    { name: 'Audubon Russet', code: 'BM HC-51', hex: '#7E5749', fam: 'Statement' },
  ];
  var SAMPLES = [
    { label: 'Living room', url: 'https://images.pexels.com/photos/271753/pexels-photo-271753.jpeg?auto=compress&cs=tinysrgb&w=1400' },
    { label: 'Exterior', url: 'https://images.pexels.com/photos/1029599/pexels-photo-1029599.jpeg?auto=compress&cs=tinysrgb&w=1400' },
  ];
  var MAXDIM = 1400;    // working resolution cap
  var UNDO_CAP = 12;

  /* ---------------- state ---------------- */
  var ctx = canvas.getContext('2d', { willReadFrequently: true });
  var W = 0, H = 0;
  var base = null;                 // ImageData of the untouched photo
  var luma = null;                 // Uint8Array per-pixel luminance of base
  var mask = null;                 // Uint8Array 0..255 selection alpha
  var undoStack = [];
  var paint = COLORS[6];           // Accessible Beige
  var tolerance = 30;
  var busy = false;

  var status = $('vzStatus');
  function say(msg) { if (status) status.textContent = msg; }

  /* ---------------- color math ---------------- */
  function hexRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgbHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) {
      s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function hslRgb(h, s, l) {
    if (!s) { var v = Math.round(l * 255); return [v, v, v]; }
    var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) {
      t = (t + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }

  /* Paint LUT: luminance (0..255) -> recolored RGB. The pixel keeps most of
     its own light; the paint contributes hue, chroma and a nudge of its own
     lightness so deep colors read deep and whites read bright. */
  function buildLUT(hex) {
    var rgb = hexRgb(hex), hsl = rgbHsl(rgb[0], rgb[1], rgb[2]);
    var lut = new Uint8Array(256 * 3);
    for (var i = 0; i < 256; i++) {
      var L = (i / 255) * .78 + hsl[2] * .22;
      var c = hslRgb(hsl[0], hsl[1], Math.min(1, Math.max(0, L)));
      lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2];
    }
    return lut;
  }
  var LUT = buildLUT(paint.hex);

  /* ---------------- selection ---------------- */
  /* Region grow from a seed. Distance is chroma-weighted against the seed
     color: walls swing widely in brightness (shadow gradients) but hold their
     hue, so luma differences are forgiven ~3x more than chroma differences. */
  function grow(sx, sy) {
    var d = base.data, out = new Uint8Array(W * H);
    var si = (sy * W + sx) * 4;
    var sr = d[si], sg = d[si + 1], sb = d[si + 2];
    var tolL = tolerance * 3.2, tolC = tolerance * 1.15;
    var stack = [sy * W + sx];
    out[sy * W + sx] = 255;
    while (stack.length) {
      var p = stack.pop(), px = p % W, py = (p / W) | 0, i = p * 4;
      var neighbors = [
        px > 0 ? p - 1 : -1, px < W - 1 ? p + 1 : -1,
        py > 0 ? p - W : -1, py < H - 1 ? p + W : -1,
      ];
      for (var k = 0; k < 4; k++) {
        var q = neighbors[k];
        if (q < 0 || out[q]) continue;
        var j = q * 4;
        var r = d[j], g = d[j + 1], b = d[j + 2];
        var dl = Math.abs((r + g + b) - (sr + sg + sb)) / 3;
        var dc = Math.abs((r - g) - (sr - sg)) + Math.abs((b - g) - (sb - sg));
        if (dl <= tolL && dc <= tolC) { out[q] = 255; stack.push(q); }
      }
    }
    return out;
  }

  /* Cheap separable box blur on the mask — feathers the cut edge. */
  function feather(m) {
    var r = 2, tmp = new Uint8Array(W * H), x, y, i, acc, span = r * 2 + 1;
    for (y = 0; y < H; y++) {
      acc = 0;
      for (x = -r; x <= r; x++) acc += m[y * W + Math.min(W - 1, Math.max(0, x))];
      for (x = 0; x < W; x++) {
        tmp[y * W + x] = acc / span;
        var add = Math.min(W - 1, x + r + 1), sub = Math.max(0, x - r);
        acc += m[y * W + add] - m[y * W + sub];
      }
    }
    var out = new Uint8Array(W * H);
    for (x = 0; x < W; x++) {
      acc = 0;
      for (y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (y = 0; y < H; y++) {
        out[y * W + x] = acc / span;
        var addY = Math.min(H - 1, y + r + 1), subY = Math.max(0, y - r);
        acc += tmp[addY * W + x] - tmp[subY * W + x];
      }
    }
    return out;
  }

  /* ---------------- render ---------------- */
  function render() {
    if (!base) return;
    var out = ctx.createImageData(W, H), o = out.data, d = base.data;
    for (var p = 0, i = 0; p < W * H; p++, i += 4) {
      var m = mask[p];
      if (!m) { o[i] = d[i]; o[i + 1] = d[i + 1]; o[i + 2] = d[i + 2]; }
      else {
        var t = m / 255, li = luma[p] * 3;
        o[i] = d[i] + (LUT[li] - d[i]) * t;
        o[i + 1] = d[i + 1] + (LUT[li + 1] - d[i + 1]) * t;
        o[i + 2] = d[i + 2] + (LUT[li + 2] - d[i + 2]) * t;
      }
      o[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }

  /* ---------------- photo loading ---------------- */
  function accept(img) {
    var w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
    var s = Math.min(1, MAXDIM / Math.max(w, h));
    W = Math.max(1, Math.round(w * s)); H = Math.max(1, Math.round(h * s));
    canvas.width = W; canvas.height = H;
    ctx.drawImage(img, 0, 0, W, H);
    try { base = ctx.getImageData(0, 0, W, H); }
    catch (e) {
      base = null; canvas.hidden = true;
      say('That image can’t be edited here (cross-origin). Please upload a photo instead.');
      return;
    }
    /* Per-pixel luminance 0..255; render() multiplies by 3 for the LUT's
       RGB byte stride. */
    luma = new Uint8Array(W * H);
    var d = base.data;
    for (var p = 0, i = 0; p < W * H; p++, i += 4) {
      luma[p] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    }
    mask = new Uint8Array(W * H);
    undoStack = [];
    canvas.hidden = false;
    var empty = $('vzEmpty'); if (empty) empty.hidden = true;
    var tools = $('vzTools'); if (tools) tools.hidden = false;
    render();
    say('Tap a wall, siding or door to paint it — tap again to add more surfaces.');
    canvas.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    say('Loading photo…');
    if (window.createImageBitmap) {
      createImageBitmap(file, { imageOrientation: 'from-image' })
        .then(accept)
        .catch(function () { loadFileLegacy(file); });
    } else loadFileLegacy(file);
  }
  function loadFileLegacy(file) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () { accept(img); URL.revokeObjectURL(url); };
    img.src = url;
  }
  function loadURL(url) {
    say('Loading sample…');
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () { accept(img); };
    img.onerror = function () { say('Sample unavailable right now — upload your own photo instead.'); };
    img.src = url;
  }

  /* ---------------- interactions ---------------- */
  canvas.addEventListener('pointerdown', function (e) {
    if (!base || busy) return;
    var r = canvas.getBoundingClientRect();
    var x = Math.round((e.clientX - r.left) / r.width * W);
    var y = Math.round((e.clientY - r.top) / r.height * H);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    busy = true; say('Painting…');
    // let the status paint before the fill work starts
    setTimeout(function () {
      if (undoStack.length >= UNDO_CAP) undoStack.shift();
      undoStack.push(mask.slice());
      var region = feather(grow(x, y));
      for (var p = 0; p < W * H; p++) if (region[p] > mask[p]) mask[p] = region[p];
      render();
      busy = false;
      say(paint.name + ' applied. Tap more surfaces, switch colors, or adjust the reach slider.');
    }, 20);
  });

  var undoBtn = $('vzUndo'), clearBtn = $('vzClear'), dlBtn = $('vzDownload');
  if (undoBtn) undoBtn.addEventListener('click', function () {
    if (!undoStack.length) return;
    mask = undoStack.pop(); render();
    say('Undone.');
  });
  if (clearBtn) clearBtn.addEventListener('click', function () {
    if (!base) return;
    undoStack.push(mask.slice());
    mask = new Uint8Array(W * H); render();
    say('Cleared — back to your original photo.');
  });
  if (dlBtn) dlBtn.addEventListener('click', function () {
    if (!base) return;
    try {
      var a = document.createElement('a');
      a.download = 'nassau-painting-preview.jpg';
      a.href = canvas.toDataURL('image/jpeg', .92);
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { say('Download blocked in this preview — try a screenshot instead.'); }
  });

  var tol = $('vzTol');
  if (tol) tol.addEventListener('input', function () {
    tolerance = +tol.value;
  });

  var file = $('vzFile');
  if (file) file.addEventListener('change', function () { loadFile(file.files[0]); file.value = ''; });
  var file2 = $('vzFile2');
  if (file2) file2.addEventListener('change', function () { loadFile(file2.files[0]); file2.value = ''; });

  // drag & drop onto the stage
  var frame = $('vzFrame');
  if (frame) {
    ['dragover', 'dragenter'].forEach(function (t) {
      frame.addEventListener(t, function (e) { e.preventDefault(); frame.classList.add('is-drag'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      frame.addEventListener(t, function (e) { e.preventDefault(); frame.classList.remove('is-drag'); });
    });
    frame.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });
  }

  /* ---------------- palette UI ---------------- */
  var swWrap = $('vzSwatches'), famWrap = $('vzFams'), search = $('vzSearch');
  var selName = $('vzSelName'), selCode = $('vzSelCode'), selChip = $('vzSelChip');
  var fam = 'All';

  function drawSwatches() {
    if (!swWrap) return;
    var q = (search && search.value || '').toLowerCase();
    swWrap.innerHTML = '';
    COLORS.forEach(function (c) {
      if (fam !== 'All' && c.fam !== fam) return;
      if (q && (c.name + ' ' + c.code).toLowerCase().indexOf(q) < 0) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (c === paint ? ' is-on' : '');
      b.style.background = c.hex;
      b.title = c.name + ' · ' + c.code;
      b.setAttribute('aria-label', c.name);
      b.addEventListener('click', function () { setPaint(c); });
      swWrap.appendChild(b);
    });
  }
  function setPaint(c) {
    paint = c; LUT = buildLUT(c.hex);
    if (selName) selName.textContent = c.name;
    if (selCode) selCode.textContent = c.code + ' · ' + c.fam;
    if (selChip) selChip.style.background = c.hex;
    drawSwatches();
    if (base) { render(); say(c.name + ' — applied to your selection.'); }
  }
  if (famWrap) famWrap.addEventListener('click', function (e) {
    var chip = e.target.closest('.chip'); if (!chip) return;
    famWrap.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-on'); });
    chip.classList.add('is-on');
    fam = chip.getAttribute('data-fam') || 'All';
    drawSwatches();
  });
  if (search) search.addEventListener('input', drawSwatches);

  /* ---------------- saved colors -> quote ---------------- */
  var savedWrap = $('vzSaved'), addBtn = $('vzAdd');
  function getSaved() {
    try { return JSON.parse(localStorage.getItem('npc_colors') || '[]') || []; } catch (e) { return []; }
  }
  function setSaved(list) {
    try { localStorage.setItem('npc_colors', JSON.stringify(list)); } catch (e) {}
    drawSaved();
  }
  function drawSaved() {
    if (!savedWrap) return;
    var list = getSaved();
    savedWrap.innerHTML = '';
    if (!list.length) { savedWrap.innerHTML = '<small class="muted">Nothing saved yet.</small>'; return; }
    list.forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'vz-saved';
      b.innerHTML = '<span class="vz-saved__dot" style="background:' + (c.hex || '#ccc') + '"></span>' +
        c.name + (c.code ? ' · ' + c.code : '') + '<span class="vz-saved__x" aria-hidden="true">×</span>';
      b.title = 'Remove';
      b.addEventListener('click', function () { var l = getSaved(); l.splice(i, 1); setSaved(l); });
      savedWrap.appendChild(b);
    });
  }
  if (addBtn) addBtn.addEventListener('click', function () {
    var list = getSaved();
    if (!list.some(function (c) { return c.code === paint.code; })) {
      list.push({ name: paint.name, code: paint.code, hex: paint.hex });
      setSaved(list);
    }
    say(paint.name + ' saved — it will ride along with your quote request.');
  });
  drawSaved();

  /* ---------------- samples ---------------- */
  var sampWrap = $('vzSamples');
  if (sampWrap) SAMPLES.forEach(function (s) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn--sm btn--plain';
    b.textContent = s.label;
    b.addEventListener('click', function () { loadURL(s.url); });
    sampWrap.appendChild(b);
  });

  setPaint(paint);
})();
