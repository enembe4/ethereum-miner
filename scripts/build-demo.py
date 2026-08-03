#!/usr/bin/env python3
"""Rebuild demo/index.html against the current design system.

demo/index.html is a single self-contained page that simulates the whole site —
customer pages plus the owner admin — with no server, no database and no network
access. It exists so the design can be clicked through and shared as a link.

The page is published to a host with a strict CSP that blocks every external
origin, so this script inlines everything it needs:

  · public/css/site.css              the real design system, verbatim
  · the chat widget's stylesheet     lifted out of public/js/chat.js
  · the two webfonts                 latin subsets, base64 data URIs (~85KB)

Only the <style> block is regenerated. The page's markup and simulation script
are left untouched, so editing site.css and re-running this is enough to keep
the demo faithful to the real site.

    python3 scripts/build-demo.py
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGET = ROOT / 'demo' / 'index.html'
FONTDIR = ROOT / 'public' / 'assets' / 'fonts'

# Latin subsets only — the demo is English, and the other subsets would triple
# the page weight for glyphs it never renders. Run scripts/fetch-fonts.sh first.
LATIN_SUBSET = {
    'Jost': ('92zatBhPNqw73oTd4jQmfxI.woff2', (200, 500)),
    'Cormorant Garamond': ('co3bmX5slCNuHLi8bLeY9MK7whWMhyjYqXtKky2F7g.woff2', (300, 400)),
}

DEMO_CSS = """
/* ---------- DEMO CHROME (not part of the real site) ---------- */
.demo-strip {
  position:sticky; top:0; z-index:80; background:var(--ink); color:rgba(255,255,255,.72);
  display:flex; align-items:center; gap:16px; padding:11px 26px;
  font:500 .6rem/1 var(--font); letter-spacing:var(--track-sm); text-transform:uppercase;
}
.demo-strip .spacer { flex:1; }
.demo-strip button {
  background:transparent; color:rgba(255,255,255,.7); border:1px solid rgba(255,255,255,.28);
  padding:8px 15px; font:500 .58rem/1 var(--font); letter-spacing:var(--track-sm);
  text-transform:uppercase; cursor:pointer; border-radius:0;
}
.demo-strip button:hover { color:#fff; border-color:rgba(255,255,255,.6); }
.demo-strip button.on { background:#fff; color:var(--ink); border-color:#fff; }
.demo-strip button:focus-visible, .btn:focus-visible, .chip:focus-visible,
.slot:focus-visible, .swatch:focus-visible { outline:1px solid var(--ink); outline-offset:3px; }
/* the site nav sits under the demo strip, not at the top of the viewport */
.nav { top:38px; }

/* ---------- CSS-drawn house (stands in for photography) ---------- */
.house {
  background:linear-gradient(#eceae6 0 58%, #e0ddd6 58% 100%);
  min-height:520px; position:relative; overflow:hidden;
}
.house .body { position:absolute; left:14%; right:14%; bottom:12%; height:52%; background:#fbfaf8; border:1px solid #ddd9d2; }
.house .roof { position:absolute; left:9%; right:9%; bottom:64%; height:0;
  border-left:8vw solid transparent; border-right:8vw solid transparent; border-bottom:78px solid #3a3835; }
@media (min-width:1000px){ .house .roof { border-left-width:96px; border-right-width:96px; } }
.house .door { position:absolute; left:46%; width:8%; bottom:12%; height:24%; background:var(--vz-door,#3a3835); border:1px solid rgba(0,0,0,.16); }
.house .win { position:absolute; width:11%; height:16%; bottom:34%; background:#e7e9ea; border:3px solid var(--vz-trim,#ffffff); box-shadow:0 0 0 1px #d4d0c8; }
.house .win.w1 { left:22%; } .house .win.w2 { right:22%; }
.house .win.w3 { left:22%; bottom:16%; } .house .win.w4 { right:22%; bottom:16%; }
.house .shutter { position:absolute; width:2.6%; height:16%; bottom:34%; background:var(--vz-shutter,#3a3835); }
.house .sh1 { left:19%; } .house .sh2 { left:33.4%; } .house .sh3 { right:33.4%; } .house .sh4 { right:19%; }
.house .lawn-label {
  position:absolute; left:20px; bottom:16px; font:500 .58rem/1 var(--font);
  letter-spacing:var(--track-sm); text-transform:uppercase; color:#6a665f;
}

/* ---------- colour plates in the visualizer ---------- */
.swtile { border:0; display:flex; flex-direction:column; min-height:210px; background:transparent; }
.swtile .field-color { flex:1; min-height:170px; }
.swtile figcaption {
  padding:14px 0 0; font:500 .6rem/1 var(--font); letter-spacing:var(--track-sm);
  text-transform:uppercase; color:var(--ink); border-top:0;
}
.swtile figcaption small { display:block; margin-top:6px; letter-spacing:.1em; color:var(--ink-faint); font-weight:400; text-transform:none; }
figure.swtile { margin:0; }

.admin-wrap { background:var(--wash); }
.lead-card.fresh { border-color:var(--ink); border-left-width:2px; }

.toast {
  position:fixed; left:26px; bottom:26px; z-index:90; background:var(--ink); color:#fff;
  padding:18px 22px; font-size:.86rem; max-width:330px; border:0;
  opacity:0; transform:translateY(8px); transition:opacity .25s,transform .25s; pointer-events:none;
}
.toast.show { opacity:1; transform:none; }
.toast b {
  display:block; font:500 .58rem/1 var(--font); letter-spacing:var(--track-sm);
  text-transform:uppercase; color:rgba(255,255,255,.6); margin-bottom:7px;
}
"""


def font_block():
    out = ['/* Latin subsets inlined so the page needs no external origin. */']
    for family, (filename, (lo, hi)) in LATIN_SUBSET.items():
        path = FONTDIR / filename
        if not path.exists():
            sys.exit(f'missing {path.relative_to(ROOT)} — run scripts/fetch-fonts.sh first')
        b64 = base64.b64encode(path.read_bytes()).decode()
        out.append(
            f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{lo} {hi};"
            f"font-display:swap;src:url(data:font/woff2;base64,{b64}) format('woff2');}}"
        )
    return '\n'.join(out)


def site_css():
    css = (ROOT / 'public' / 'css' / 'site.css').read_text(encoding='utf-8')
    # fonts.css is a sibling file that does not exist inside a single-file page;
    # font_block() inlines the same faces instead.
    return re.sub(r"@import url\('fonts\.css'\);\n", '', css)


def chat_css():
    """The site injects the chat widget's stylesheet from js/chat.js at runtime.
    The demo reimplements the widget but reuses the class names, so lift that
    stylesheet across rather than maintaining a second copy."""
    js = (ROOT / 'public' / 'js' / 'chat.js').read_text(encoding='utf-8')
    m = re.search(r'var css = `(.*?)`;', js, re.S)
    if not m:
        sys.exit('could not find the chat stylesheet in public/js/chat.js')
    return '/* ---------- CHAT WIDGET (lifted from js/chat.js) ---------- */\n' + m.group(1)


def main():
    if not TARGET.exists():
        sys.exit(f'{TARGET.relative_to(ROOT)} not found')
    page = TARGET.read_text(encoding='utf-8')
    m = re.search(r'<style>.*?</style>', page, re.S)
    if not m:
        sys.exit('no <style> block found in demo/index.html')
    style = ('<style>\n' + font_block() + '\n' + site_css() + '\n'
             + chat_css() + '\n' + DEMO_CSS + '\n</style>')
    page = page[:m.start()] + style + page[m.end():]
    # Sync the visualizer engine verbatim from the real site so the demo's
    # paint tool is the same code customers get.
    engine = (ROOT / 'public' / 'js' / 'visualizer.js').read_text(encoding='utf-8')
    page = re.sub(
        r'(/\* VZ-ENGINE-START[^\n]*\*/\n).*?(/\* VZ-ENGINE-END \*/)',
        lambda mm: mm.group(1) + engine + mm.group(2),
        page, count=1, flags=re.S)
    TARGET.write_text(page, encoding='utf-8')
    print(f'rebuilt {TARGET.relative_to(ROOT)} ({TARGET.stat().st_size // 1024}KB)')


if __name__ == '__main__':
    main()
