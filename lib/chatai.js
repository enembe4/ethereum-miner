'use strict';
/* Claude-powered chat assistant. Active when ANTHROPIC_API_KEY is set in .env;
   without it the widget runs its scripted fallback (no behavior change).
   The assistant qualifies visitors and files a lead via the save_lead tool.
   Business rule enforced in the system prompt: it NEVER quotes a price. */

let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) { /* dep not installed */ }

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CHAT_MODEL || 'claude-opus-5';
const enabled = !!(KEY && Anthropic);
const client = enabled ? new Anthropic({ apiKey: KEY }) : null;

console.log(enabled
  ? `[chat] Claude assistant enabled (${MODEL}).`
  : '[chat] No ANTHROPIC_API_KEY — chat runs in guided (scripted) mode.');

const SYSTEM = `You are the friendly assistant on the Nassau Painting Co. website — a residential painting company serving Nassau County, Long Island, NY (Garden City, Hempstead, Massapequa, Levittown, Hicksville, Freeport, Rockville Centre, Long Beach, Mineola, Oyster Bay, Glen Cove, Valley Stream, and nearby towns).

Facts you may share:
- Services: interior painting, exterior painting, cabinet refinishing, power washing, drywall repair, wallpaper removal, commercial work.
- Licensed & insured; 2-year workmanship warranty; free estimates; fixed written quotes (no surprise charges); financing available.
- Hours Mon–Sat 8am–6pm. Phone (516) 555-0100. Free quote form at /quote.html; estimate booking at /schedule.html.

Hard rules:
- NEVER quote, estimate, or hint at a price, price range, or rate — not even a ballpark. Every estimate is prepared personally by the owner after reviewing the project. If asked about price, explain that and offer the free quote form or to take their details.
- Keep replies to one to three short, warm sentences. No markdown, no lists, no emoji beyond an occasional friendly one.
- Your goal: answer questions helpfully, then collect the visitor's name and phone number (email too if offered) and what they need painted. Once you have at least name + phone, call the save_lead tool exactly once, then confirm the team will reach out within one business day. Do not call it twice.
- If a question is outside painting or this business, politely steer back or offer the phone number.
- The conversation begins after you have already greeted the visitor with "What can we help you paint?".`;

const TOOLS = [{
  name: 'save_lead',
  description: 'Save the visitor as a lead in the company CRM. Call it as soon as you have at least their name and phone number, exactly once per conversation.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: "Visitor's full name" },
      phone: { type: 'string', description: 'Phone number as given' },
      email: { type: 'string', description: 'Email if provided' },
      project_type: { type: 'string', enum: ['Interior', 'Exterior', 'Interior + Exterior', 'Cabinets only', 'Commercial'], description: 'Best match for what they described' },
      need: { type: 'string', description: 'One-line summary of what they want done' },
    },
    required: ['name', 'phone'],
  },
}];

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return null;
  const msgs = raw.slice(-24)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs.length ? msgs : null;
}

async function createMessage(messages) {
  // Preferred: server-side refusal fallback ("default" routes by category).
  try {
    return await client.beta.messages.create({
      model: MODEL,
      max_tokens: 1024,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });
  } catch (e) {
    if (e && e.status === 400) {
      // Org/beta doesn't accept the fallback param — plain call.
      return client.messages.create({
        model: MODEL, max_tokens: 1024,
        output_config: { effort: 'low' },
        system: SYSTEM, tools: TOOLS, messages,
      });
    }
    throw e;
  }
}

/* Run one assistant turn. onLead(input) -> lead id; called when Claude saves a lead. */
async function reply(history, onLead) {
  const messages = sanitizeHistory(history);
  if (!messages) throw Object.assign(new Error('Invalid chat history.'), { status: 400 });

  let leadRef = null;
  for (let hop = 0; hop < 3; hop++) {
    const resp = await createMessage(messages);

    if (resp.stop_reason === 'refusal') {
      return { text: "That's outside what I can help with here — give us a call at (516) 555-0100 and a real person will help.", leadRef };
    }

    const toolUse = resp.content.find((b) => b.type === 'tool_use' && b.name === 'save_lead');
    if (resp.stop_reason === 'tool_use' && toolUse) {
      try { leadRef = await onLead(toolUse.input || {}); } catch (e) { console.error('[chat] save_lead failed:', e.message); }
      messages.push({ role: 'assistant', content: resp.content });
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: leadRef ? `Lead saved. Reference #${leadRef}.` : 'Lead could not be saved — apologize and give the phone number.' }],
      });
      continue; // let Claude confirm to the visitor
    }

    const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    return { text: text || 'Thanks! Our team will follow up shortly.', leadRef };
  }
  return { text: 'Thanks! Your details are in — our team will follow up shortly.', leadRef };
}

module.exports = { enabled, MODEL, reply };
