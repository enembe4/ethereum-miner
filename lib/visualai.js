'use strict';
/* AI-backed visualizer engine. Two capabilities, both optional and both
   degrading gracefully (the on-device instant preview always works):

   1. Color resolution — turn free text ("Benjamin Moore Hale Navy",
      "SW 7069", "Behr Blank Canvas eggshell") into an exact color spec.
      Uses Claude when ANTHROPIC_API_KEY is set; otherwise falls back to
      the curated local table.

   2. Photo re-rendering — repaint the customer's actual photo with the
      requested color, photorealistically. Claude (vision) first reads the
      photo and writes a precise edit brief; a dedicated image-editing
      model then performs the edit. Claude itself cannot output images, so
      the render step needs one of:
        GEMINI_API_KEY  -> Google gemini-2.5-flash-image   (default)
        OPENAI_API_KEY  -> OpenAI gpt-image-1
      Select explicitly with VISUAL_RENDER_PROVIDER=gemini|openai.

   Photos are processed in memory only — never written to disk or logged. */

let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) { /* dep not installed */ }

const AKEY = process.env.ANTHROPIC_API_KEY;
const COLOR_MODEL = process.env.VISUAL_COLOR_MODEL || 'claude-haiku-4-5-20251001';
const VISION_MODEL = process.env.VISUAL_VISION_MODEL || process.env.CHAT_MODEL || 'claude-opus-5';
const GKEY = process.env.GEMINI_API_KEY;
const OKEY = process.env.OPENAI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

const provider = (process.env.VISUAL_RENDER_PROVIDER || (GKEY ? 'gemini' : OKEY ? 'openai' : '')).toLowerCase();
const renderEnabled = (provider === 'gemini' && !!GKEY) || (provider === 'openai' && !!OKEY);
const claudeEnabled = !!(AKEY && Anthropic);
const client = claudeEnabled ? new Anthropic({ apiKey: AKEY }) : null;

console.log(renderEnabled
  ? `[visualizer] AI rendering enabled (${provider}${claudeEnabled ? ' + Claude vision brief' : ''}).`
  : '[visualizer] No image-edit API key — visualizer runs on-device preview only.');

/* Local fallback table — the site's curated palette. */
const LOCAL = [
  ['Benjamin Moore', 'Chantilly Lace', 'OC-65', '#F4F6F1'], ['Benjamin Moore', 'White Dove', 'OC-17', '#EFEDE1'],
  ['Benjamin Moore', 'Swiss Coffee', 'OC-45', '#EDE8D9'], ['Benjamin Moore', 'Simply White', 'OC-117', '#F6F7EE'],
  ['Benjamin Moore', 'Balboa Mist', 'OC-27', '#DDD6CA'], ['Benjamin Moore', 'Edgecomb Gray', 'HC-173', '#D8D1C0'],
  ['Sherwin-Williams', 'Accessible Beige', 'SW 7036', '#D1C7B8'], ['Sherwin-Williams', 'Agreeable Gray', 'SW 7029', '#D1CBC1'],
  ['Benjamin Moore', 'Revere Pewter', 'HC-172', '#CCC6B9'], ['Benjamin Moore', 'Pale Oak', 'OC-20', '#E1DCD1'],
  ['Benjamin Moore', 'Saybrook Sage', 'HC-114', '#A9B29A'], ['Benjamin Moore', 'October Mist', '1495', '#BCC2AD'],
  ['Benjamin Moore', 'Soft Fern', '2144-40', '#C4CBAC'], ['Benjamin Moore', 'Essex Green', 'HC-188', '#2E3D34'],
  ['Benjamin Moore', 'Boothbay Gray', 'HC-165', '#A4B2B1'], ['Benjamin Moore', 'Quiet Moments', '1563', '#C4CFC9'],
  ['Benjamin Moore', 'Van Deusen Blue', 'HC-156', '#47586B'], ['Benjamin Moore', 'Hale Navy', 'HC-154', '#434E5C'],
  ['Benjamin Moore', 'Newburyport Blue', 'HC-155', '#3C4F63'], ['Benjamin Moore', 'Kendall Charcoal', 'HC-166', '#686662'],
  ['Benjamin Moore', 'Wrought Iron', '2124-10', '#45474B'], ['Sherwin-Williams', 'Iron Ore', 'SW 7069', '#434341'],
  ['Benjamin Moore', 'Caliente', 'AF-290', '#963B33'], ['Benjamin Moore', 'Audubon Russet', 'HC-51', '#7E5749'],
].map(([brand, name, code, hex]) => ({ brand, name, code, hex }));

function localLookup(q) {
  const s = String(q || '').toLowerCase().trim();
  if (!s) return null;
  const hexm = /#?([0-9a-f]{6})\b/i.exec(s);
  if (hexm) return { brand: 'Custom', name: 'Custom color', code: '#' + hexm[1].toUpperCase(), hex: '#' + hexm[1].toUpperCase(), source: 'hex' };
  const hit = LOCAL.find((c) =>
    s.includes(c.name.toLowerCase()) ||
    s.replace(/[\s-]/g, '').includes(c.code.toLowerCase().replace(/[\s-]/g, '')));
  return hit ? Object.assign({ source: 'local' }, hit) : null;
}

const RESOLVE_TOOL = [{
  name: 'resolved_color',
  description: 'Report the paint color the user asked for.',
  input_schema: {
    type: 'object',
    properties: {
      brand: { type: 'string', description: 'Manufacturer, e.g. Benjamin Moore, Sherwin-Williams, Behr, PPG, Valspar, Farrow & Ball' },
      name: { type: 'string', description: 'Official color name' },
      code: { type: 'string', description: 'Official color number/code if it exists, e.g. HC-154, SW 7069' },
      hex: { type: 'string', description: 'Closest sRGB hex for a wall painted this color in neutral daylight, format #RRGGBB' },
      confident: { type: 'boolean', description: 'false if you are unsure this color exists as described' },
    },
    required: ['brand', 'name', 'hex', 'confident'],
  },
}];

/* Free text -> color spec. Claude when available, local table otherwise. */
async function resolveColor(query) {
  const q = String(query || '').slice(0, 200).trim();
  if (!q) throw Object.assign(new Error('Empty color query.'), { status: 400 });
  const local = localLookup(q);
  if (!claudeEnabled) {
    if (local) return local;
    throw Object.assign(new Error('Color not in the local palette. Try a name from the swatch list, a code like "SW 7069", or a hex value — or the owner can enable AI color lookup.'), { status: 404 });
  }
  try {
    const resp = await client.messages.create({
      model: COLOR_MODEL, max_tokens: 300,
      system: 'You identify retail paint colors from major brands (Benjamin Moore, Sherwin-Williams, Behr, PPG, Valspar, Farrow & Ball, Dunn-Edwards, etc). Given a user query, report the single best matching real color via the resolved_color tool. If the query names a brand and code, trust it. If nothing plausible matches, set confident=false with your best guess.',
      tools: RESOLVE_TOOL, tool_choice: { type: 'tool', name: 'resolved_color' },
      messages: [{ role: 'user', content: q }],
    });
    const tu = resp.content.find((b) => b.type === 'tool_use');
    const c = tu && tu.input;
    if (c && /^#[0-9a-fA-F]{6}$/.test(c.hex || '')) {
      return { brand: c.brand, name: c.name, code: c.code || '', hex: c.hex.toUpperCase(), confident: c.confident !== false, source: 'ai' };
    }
    throw new Error('bad tool output');
  } catch (e) {
    if (local) return local;               // degrade mid-flight, never dead-end
    throw Object.assign(new Error('Could not resolve that color right now — try a swatch from the list or a hex value.'), { status: 502 });
  }
}

/* Claude vision: read the photo, write the edit brief the renderer will follow. */
async function editBrief(imgB64, mime, color, surfaces) {
  if (!claudeEnabled) return null;
  try {
    const resp = await client.messages.create({
      model: VISION_MODEL, max_tokens: 400,
      output_config: { effort: 'low' },
      system: 'You brief a photo-editing model for a painting company. Look at the photo and the requested repaint. Reply with 2-4 plain sentences describing exactly which visible surfaces to repaint and everything that must stay untouched (trim, built-ins, ceiling, floors, furniture, lighting). Name concrete objects you can see. No preamble.',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: imgB64 } },
          { type: 'text', text: `Repaint the ${surfaces} in ${color.brand} "${color.name}"${color.code ? ' ' + color.code : ''} (${color.hex}).` },
        ],
      }],
    });
    return resp.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim() || null;
  } catch (e) {
    console.error('[visualizer] vision brief failed (continuing without):', e.message);
    return null;
  }
}

function renderPrompt(color, surfaces, brief) {
  return [
    `Professional architectural photo edit for a painting contractor. Repaint ONLY the ${surfaces} of this photo in ${color.brand} "${color.name}"${color.code ? ' (' + color.code + ')' : ''}, sRGB approximately ${color.hex}, eggshell sheen.`,
    brief ? `Scene notes: ${brief}` : '',
    'Everything else must remain pixel-identical to the original photograph: same camera angle and geometry, same lighting direction, shadows and reflections, same furniture, flooring, ceiling, trim, doors, windows, view and decorations. The result must look like the same photograph taken after a flawless professional repaint — not a restyle, not a re-imagining.',
  ].filter(Boolean).join('\n');
}

async function geminiEdit(imgB64, mime, prompt) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': GKEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: imgB64 } }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const parts = (((d.candidates || [])[0] || {}).content || {}).parts || [];
  const img = parts.find((p) => p.inlineData && p.inlineData.data);
  if (!img) throw new Error('gemini returned no image');
  return { mime: img.inlineData.mimeType || 'image/png', b64: img.inlineData.data };
}

async function openaiEdit(imgB64, mime, prompt) {
  const boundary = '----npc' + Math.random().toString(36).slice(2);
  const CRLF = '\r\n';
  const field = (n, v) => `--${boundary}${CRLF}Content-Disposition: form-data; name="${n}"${CRLF}${CRLF}${v}${CRLF}`;
  const head = `--${boundary}${CRLF}Content-Disposition: form-data; name="image"; filename="photo.${mime === 'image/png' ? 'png' : 'jpg'}"${CRLF}Content-Type: ${mime}${CRLF}${CRLF}`;
  const body = Buffer.concat([
    Buffer.from(field('model', OPENAI_MODEL) + field('prompt', prompt) + field('size', 'auto') + head),
    Buffer.from(imgB64, 'base64'),
    Buffer.from(`${CRLF}--${boundary}--${CRLF}`),
  ]);
  const r = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OKEY}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const b64 = d.data && d.data[0] && d.data[0].b64_json;
  if (!b64) throw new Error('openai returned no image');
  return { mime: 'image/png', b64 };
}

/* Full pipeline: dataURL in, rendered dataURL out. */
async function render({ image, color, surfaces }) {
  if (!renderEnabled) {
    throw Object.assign(new Error('AI rendering is not configured yet.'), { status: 503 });
  }
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(image || ''));
  if (!m) throw Object.assign(new Error('Send the photo as a base64 image data URL (jpeg/png/webp).'), { status: 400 });
  const mime = m[1], b64 = m[2];
  if (b64.length > 13 * 1024 * 1024) throw Object.assign(new Error('Photo too large — please use an image under ~9MB.'), { status: 413 });
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color.hex || '')) {
    throw Object.assign(new Error('Missing resolved color.'), { status: 400 });
  }
  const surf = String(surfaces || 'walls').slice(0, 80);

  const brief = await editBrief(b64, mime, color, surf);
  const prompt = renderPrompt(color, surf, brief);
  const out = provider === 'gemini' ? await geminiEdit(b64, mime, prompt) : await openaiEdit(b64, mime, prompt);
  return { image: `data:${out.mime};base64,${out.b64}`, brief: brief || undefined };
}

function status() {
  return { ai: renderEnabled, provider: renderEnabled ? provider : null, colorLookup: claudeEnabled ? 'ai' : 'local' };
}

module.exports = { status, resolveColor, render };
