# Deploying Etay Paint Co. to a public URL

The app is one Node process with SQLite on disk — it needs a host with a
persistent disk, not a static/serverless platform. Everything below is already
configured in this repo; your part is creating the account and paying.

## Recommended: Render (~$7.25/month, ~10 minutes)

1. Go to https://render.com and sign up (the GitHub button is easiest).
2. Click **New +** → **Blueprint**.
3. Connect the `enembe4/ethereum-miner` repository. Render finds `render.yaml`
   and shows the "etay-exteriors" service with its disk.
4. It prompts for the secret values:
   - `ADMIN_PASSWORD` — your admin login password. Pick a strong one.
   - `OWNER_EMAIL` — where new-lead alerts go.
   - `ANTHROPIC_API_KEY` — from https://console.anthropic.com → API Keys.
     Powers the chat assistant, any-brand color lookup, and the surface
     mapping that keeps paint off the furniture.
   - `GEMINI_API_KEY` — from https://aistudio.google.com → Get API key.
     Powers the photorealistic AI renders. Leave blank to launch without it.
5. Click **Apply**. First build takes 2–3 minutes.
6. Your site is live at `https://etay-paint-co.onrender.com` (Render shows
   the exact URL; it may carry a random suffix).

Costs: Starter service $7/mo + 1GB disk ~$0.25/mo. AI usage is pay-as-you-go
on your Anthropic/Google keys — pennies per chat or render at this scale.

### After it's live — 5-minute checklist
- Open `/admin`, log in (`owner` + the password you set), confirm the
  pipeline loads.
- Open `/visualizer.html`, upload a photo, tap a wall — the status line
  should say Claude mapped the surfaces. Type a color ("SW 7069") in AI
  Render and generate one if you set the Gemini key.
- Submit a test quote from the public site; confirm it appears in the
  pipeline.
- Startup logs (Render → Logs) show what's enabled:
  `[chat] Claude assistant enabled`, `[visualizer] AI rendering enabled`.

### Custom domain (optional)
Render → your service → Settings → Custom Domains → add
`www.etaypaintco.com`, then create the CNAME record it shows you at your
domain registrar. TLS is automatic.

## Alternative: Railway (~$5/month)
New Project → Deploy from GitHub repo → pick this repo (it uses the
`Dockerfile`). Add a **Volume** mounted at `/data`, set `DATA_DIR=/data`,
`NODE_ENV=production`, `SESSION_SECRET` (any long random string), plus the
same four secrets as above. Networking → Generate Domain.

## Notes
- Sessions are in-memory: a deploy or restart signs the admin out (leads and
  reviews are safe on the disk). Fine for a single owner; a session store can
  be added later.
- The database seeds demo leads on first boot so the pipeline isn't empty.
  Delete them from the admin as real leads arrive, or wipe the disk's
  `app.db` to reset everything.
- Keep `SMTP_*` unset to start — email runs in log-only mode (portal codes
  and alerts print to the logs). Wire real SMTP when ready per `.env.example`.
