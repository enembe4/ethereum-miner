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
  var grad = null;                 // Uint8Array edge strength (Sobel) — fills stop at edges
  var tvar = null;                 // Uint8Array local texture (std dev) — fills avoid busy areas
  var mask = null;                 // Uint8Array 0..255 selection alpha
  var undoStack = [];
  var paint = COLORS[6];           // Accessible Beige
  var tolerance = 30;
  var busy = false;
  var mode = 'tap';                // 'tap' | 'brush' | 'erase'
  /* Semantic surface map (Claude vision via the server, when available):
     a coarse grid of classes gating the fill so a tap on the wall can
     never grow onto furniture, whatever the colors are. */
  var seg = { grid: null, cols: 0, rows: 0, boundary: null, epoch: 0 };

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
  /* Region grow from a seed. Three signals decide each pixel:
       color   — chroma-weighted distance to the seed (luma forgiven ~3x,
                 because walls shade but hold their hue)
       edges   — the tolerance collapses across strong gradients, so growth
                 stops at trim lines and furniture silhouettes
       texture — busy areas (plants, shelves, fabric) shrink it further
     And when the Claude surface map is present, growth is confined to the
     class that was tapped: wall stays wall, whatever the colors say. */
  function grow(sx, sy) {
    var d = base.data, out = new Uint8Array(W * H);
    var si = (sy * W + sx) * 4;
    var sr = d[si], sg = d[si + 1], sb = d[si + 2];
    var tolL = tolerance * 3.2, tolC = tolerance * 1.15;
    var seedClass = seg.grid ? cellClass(sx, sy) : 0;
    var stack = [sy * W + sx];
    out[sy * W + sx] = 255;
    while (stack.length) {
      var p = stack.pop(), px = p % W, py = (p / W) | 0;
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
        // edge + texture aware: tolerance collapses across edges (trim,
        // furniture silhouettes) and tightens in busy texture (fabric,
        // plants, shelves)
        var kk = (1 - Math.min(1, grad[q] / 45) * .95) * (1 - Math.min(1, tvar[q] / 30) * .75);
        if (dl > tolL * kk || dc > tolC * kk) continue;
        if (seg.grid) {
          var qx = q % W, qy = (q / W) | 0;
          if (cellClass(qx, qy) !== seedClass) {
            // different surface per Claude: only cross inside a boundary
            // cell, and only for a near-exact color match (soft edges)
            if (!cellBoundary(qx, qy) || dl > tolL * .4 || dc > tolC * .4) continue;
          }
        }
        out[q] = 255; stack.push(q);
      }
    }
    return out;
  }

  /* ---- Claude surface map plumbing ---- */
  function cellClass(x, y) {
    var c = Math.min(seg.cols - 1, (x * seg.cols / W) | 0);
    var r = Math.min(seg.rows - 1, (y * seg.rows / H) | 0);
    return seg.grid[r].charCodeAt(c);
  }
  function cellBoundary(x, y) {
    var c = Math.min(seg.cols - 1, (x * seg.cols / W) | 0);
    var r = Math.min(seg.rows - 1, (y * seg.rows / H) | 0);
    return seg.boundary[r * seg.cols + c] === 1;
  }
  function setSegmentation(data) {
    if (!data || !Array.isArray(data.grid)) { seg.grid = null; return; }
    seg.grid = data.grid; seg.cols = data.cols; seg.rows = data.rows;
    seg.boundary = new Uint8Array(seg.cols * seg.rows);
    for (var r = 0; r < seg.rows; r++) {
      for (var c = 0; c < seg.cols; c++) {
        var me = seg.grid[r].charCodeAt(c);
        if ((c > 0 && seg.grid[r].charCodeAt(c - 1) !== me) ||
            (c < seg.cols - 1 && seg.grid[r].charCodeAt(c + 1) !== me) ||
            (r > 0 && seg.grid[r - 1].charCodeAt(c) !== me) ||
            (r < seg.rows - 1 && seg.grid[r + 1].charCodeAt(c) !== me)) {
          seg.boundary[r * seg.cols + c] = 1;
        }
      }
    }
  }
  function requestSegmentation() {
    setSegmentation(null);
    var epoch = ++seg.epoch;
    if (!/^https?:$/.test(location.protocol)) return;   // static demo: no backend
    // downscale for the vision call
    var full = document.createElement('canvas'); full.width = W; full.height = H;
    full.getContext('2d').putImageData(base, 0, 0);
    var sw = Math.min(768, W), sh = Math.round(H * sw / W);
    var off = document.createElement('canvas'); off.width = sw; off.height = sh;
    off.getContext('2d').drawImage(full, 0, 0, sw, sh);
    var cols = 28, rows = Math.max(6, Math.min(30, Math.round(cols * sh / sw)));
    fetch('/api/visualizer/segment', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: off.toDataURL('image/jpeg', .85), cols: cols, rows: rows }),
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || epoch !== seg.epoch) return;
        setSegmentation(d);
        say('Claude mapped the surfaces in this photo — taps now stay on what you touch (walls, cabinets, doors…).');
      })
      .catch(function () { /* color-based selection carries on */ });
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
    analyze();
    mask = new Uint8Array(W * H);
    undoStack = [];
    canvas.hidden = false;
    var empty = $('vzEmpty'); if (empty) empty.hidden = true;
    var tools = $('vzTools'); if (tools) tools.hidden = false;
    injectModeChips();
    render();
    say('Tap a wall, siding or door to paint it. Brush and Erase fine-tune any selection.');
    requestSegmentation();
    canvas.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* Edge + texture maps, computed once per photo. Fills stop at strong
     edges (trim lines, furniture silhouettes) and hesitate in busy texture
     (plants, bookshelves, patterned fabric) — the two places a pure color
     fill leaks. */
  function analyze() {
    grad = new Uint8Array(W * H);
    var x, y, p;
    for (y = 1; y < H - 1; y++) {
      for (x = 1; x < W - 1; x++) {
        p = y * W + x;
        var gx = luma[p - W + 1] + 2 * luma[p + 1] + luma[p + W + 1]
               - luma[p - W - 1] - 2 * luma[p - 1] - luma[p + W - 1];
        var gy = luma[p + W - 1] + 2 * luma[p + W] + luma[p + W + 1]
               - luma[p - W - 1] - 2 * luma[p - W] - luma[p - W + 1];
        var g = (Math.abs(gx) + Math.abs(gy)) >> 2;
        grad[p] = g > 255 ? 255 : g;
      }
    }
    // local std dev via separable box means of x and x^2 (radius 3)
    var mean = boxBlurF(luma, 3);
    var sq = new Float32Array(W * H);
    for (p = 0; p < W * H; p++) sq[p] = luma[p] * luma[p];
    var meansq = boxBlurF(sq, 3);
    tvar = new Uint8Array(W * H);
    for (p = 0; p < W * H; p++) {
      var v = Math.sqrt(Math.max(0, meansq[p] - mean[p] * mean[p]));
      tvar[p] = v > 255 ? 255 : v;
    }
  }
  function boxBlurF(src, r) {
    var tmp = new Float32Array(W * H), out = new Float32Array(W * H);
    var span = r * 2 + 1, x, y, acc;
    for (y = 0; y < H; y++) {
      acc = 0;
      for (x = -r; x <= r; x++) acc += src[y * W + Math.min(W - 1, Math.max(0, x))];
      for (x = 0; x < W; x++) {
        tmp[y * W + x] = acc / span;
        acc += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)];
      }
    }
    for (x = 0; x < W; x++) {
      acc = 0;
      for (y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (y = 0; y < H; y++) {
        out[y * W + x] = acc / span;
        acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
      }
    }
    return out;
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
  /* Mode chips (Tap / Brush / Erase) are injected by the engine so the
     site and the demo stay in lockstep through the synced script. */
  function injectModeChips() {
    if ($('vzModes')) return;
    var tools = $('vzTools'); if (!tools) return;
    var row = document.createElement('div');
    row.className = 'chips'; row.id = 'vzModes';
    row.innerHTML =
      '<span class="chip is-on" data-mode="tap" title="Tap a surface to select it">Tap Select</span>' +
      '<span class="chip" data-mode="brush" title="Drag to add to the selection">Brush</span>' +
      '<span class="chip" data-mode="erase" title="Drag to remove from the selection">Erase</span>';
    var status = $('vzStatus');
    status.parentNode.insertBefore(row, status.nextSibling);
    row.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip'); if (!chip) return;
      row.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-on'); });
      chip.classList.add('is-on');
      mode = chip.getAttribute('data-mode');
      canvas.style.cursor = mode === 'tap' ? 'crosshair' : 'cell';
      canvas.style.touchAction = mode === 'tap' ? 'manipulation' : 'none';
      say(mode === 'tap' ? 'Tap a surface to select it.'
        : mode === 'brush' ? 'Drag over the photo to add to the selection.'
        : 'Drag over painted areas to erase the selection.');
    });
  }

  function canvasXY(e) {
    var r = canvas.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) / r.width * W),
            Math.round((e.clientY - r.top) / r.height * H)];
  }

  var stroking = false, renderQueued = false;
  function queueRender() {
    if (renderQueued) return; renderQueued = true;
    requestAnimationFrame(function () { renderQueued = false; render(); });
  }
  function dab(x, y, erase) {
    var R = Math.max(10, Math.round(W / 55)), R2 = R * R;
    for (var dy = -R; dy <= R; dy++) {
      var yy = y + dy; if (yy < 0 || yy >= H) continue;
      for (var dx = -R; dx <= R; dx++) {
        var xx = x + dx; if (xx < 0 || xx >= W) continue;
        var d2 = dx * dx + dy * dy; if (d2 > R2) continue;
        var a = Math.round(255 * Math.pow(1 - Math.sqrt(d2) / R, .7));
        var p = yy * W + xx;
        if (erase) { if (255 - a < mask[p]) mask[p] = 255 - a < 0 ? 0 : 255 - a; }
        else if (a > mask[p]) mask[p] = a;
      }
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (!base || busy) return;
    var xy = canvasXY(e), x = xy[0], y = xy[1];
    if (x < 0 || y < 0 || x >= W || y >= H) return;

    if (mode !== 'tap') {
      if (undoStack.length >= UNDO_CAP) undoStack.shift();
      undoStack.push(mask.slice());
      stroking = true;
      canvas.setPointerCapture(e.pointerId);
      dab(x, y, mode === 'erase'); queueRender();
      return;
    }

    busy = true; say('Painting…');
    // let the status paint before the fill work starts
    setTimeout(function () {
      if (undoStack.length >= UNDO_CAP) undoStack.shift();
      undoStack.push(mask.slice());
      var region = feather(grow(x, y));
      for (var p = 0; p < W * H; p++) if (region[p] > mask[p]) mask[p] = region[p];
      render();
      busy = false;
      say(paint.name + ' applied. Tap more surfaces, switch colors, or fine-tune with Brush and Erase.');
    }, 20);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!stroking) return;
    var xy = canvasXY(e);
    dab(xy[0], xy[1], mode === 'erase'); queueRender();
  });
  ['pointerup', 'pointercancel'].forEach(function (t) {
    canvas.addEventListener(t, function () { stroking = false; });
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

  /* ---------------- AI render ----------------
     Server-backed: Claude resolves any brand color and reads the photo, a
     dedicated image-edit model performs the repaint. The panel hides itself
     when there is no server (static demo) and explains itself when the
     server is up but no render key is configured. */
  var aiPanel = $('vzAiPanel');
  var aiState = { on: false, color: null };
  function aiSay(msg) { var el = $('vzAiStatus'); if (el) el.textContent = msg || ''; }

  if (aiPanel) (function () {
    fetch('/api/visualizer/status').then(function (r) { return r.json(); }).then(function (st) {
      aiPanel.hidden = false;
      aiState.on = !!st.ai;
      if (!st.ai) {
        var note = $('vzAiNote'); if (note) note.hidden = false;
        var go = $('vzAiGo'); if (go) go.disabled = true;
      }
    }).catch(function () { /* no backend (static demo) — panel stays hidden */ });

    var q = $('vzAiQuery'), resolveBtn = $('vzAiResolve'), found = $('vzAiFound'), goBtn = $('vzAiGo');

    function resolve() {
      var text = (q.value || '').trim();
      if (!text) { aiSay('Type a color — brand plus name or code.'); return; }
      aiSay('Looking up "' + text + '"…');
      fetch('/api/visualizer/resolve-color', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) { aiSay(res.d.error || 'Could not find that color.'); found.hidden = true; return; }
          var c = res.d;
          aiState.color = c;
          $('vzAiChip').style.background = c.hex;
          $('vzAiName').textContent = c.name + (c.confident === false ? ' (best guess)' : '');
          $('vzAiCode').textContent = c.brand + (c.code ? ' · ' + c.code : '') + ' · ' + c.hex;
          found.hidden = false;
          aiSay('');
          // make it the active instant-preview color too
          setPaint({ name: c.name, code: c.code || c.hex, hex: c.hex, fam: c.brand });
        })
        .catch(function () { aiSay('Color lookup is unavailable right now.'); });
    }
    if (resolveBtn) resolveBtn.addEventListener('click', resolve);
    if (q) q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); resolve(); } });

    function aiSurface() {
      var on = document.querySelector('#vzAiSurf .chip.is-on');
      return on ? on.getAttribute('data-surf') : 'walls';
    }
    var surfWrap = $('vzAiSurf');
    if (surfWrap) surfWrap.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip'); if (!chip) return;
      surfWrap.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-on'); });
      chip.classList.add('is-on');
    });

    if (goBtn) goBtn.addEventListener('click', function () {
      if (!aiState.on) return;
      if (!base) { aiSay('Load a photo first — upload above.'); return; }
      if (!aiState.color) { aiSay('Find a color first.'); return; }
      // send the clean base photo (not the instant-preview overlay)
      var off = document.createElement('canvas'); off.width = W; off.height = H;
      off.getContext('2d').putImageData(base, 0, 0);
      var dataURL = off.toDataURL('image/jpeg', .9);
      goBtn.disabled = true;
      aiSay('Rendering — a studio-quality repaint takes 10–30 seconds…');
      fetch('/api/visualizer/render', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataURL, color: aiState.color, surfaces: aiSurface() }),
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          goBtn.disabled = false;
          if (!res.ok) { aiSay(res.d.error || 'Rendering failed — please try again.'); return; }
          aiSay('Done. Drag the line to compare.');
          var wrap = $('vzAiResult');
          wrap.innerHTML =
            '<div class="ba ba--frame" data-ba style="margin-top:16px;">' +
            '<div class="ba__after"><img src="' + res.d.image + '" alt="AI render — after"></div>' +
            '<div class="ba__before" style="clip-path:inset(0 calc(100% - var(--ba)) 0 0);"><img src="' + dataURL + '" alt="Original photo" style="filter:none;"></div>' +
            '<div class="ba__handle" role="slider" tabindex="0" aria-label="Compare original and render" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"></div>' +
            '<span class="ba__tag ba__tag--b">Original</span><span class="ba__tag ba__tag--a">' + aiState.color.name + '</span>' +
            '</div>' +
            '<div class="badge-row" style="gap:10px;margin-top:12px;">' +
            '<a class="btn btn--sm btn--plain" id="vzAiDl" download="nassau-painting-ai-render.png">Download Render</a>' +
            '<button class="btn btn--sm btn--plain" id="vzAiUse" type="button">Open in Instant Preview</button></div>';
          $('vzAiDl').href = res.d.image;
          if (window.NPCSite) window.NPCSite.initBA(wrap.querySelector('[data-ba]'));
          $('vzAiUse').addEventListener('click', function () {
            var img = new Image();
            img.onload = function () { accept(img); };
            img.src = res.d.image;
          });
          wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        })
        .catch(function () { goBtn.disabled = false; aiSay('Rendering failed — please try again.'); });
    });
  })();

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

  /* Small public surface: lets tests (and future segmentation backends)
     inject a surface map directly. */
  window.NPCViz = {
    setSegmentation: setSegmentation,
    hasSegmentation: function () { return !!seg.grid; },
  };
})();
