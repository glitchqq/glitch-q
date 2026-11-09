# Builds the app icon (favicon, apple-touch, 512), the link-preview image and the e-mail logo from one source.
# Needs Python 3 + Playwright (Chromium).  Run:  python3 build-icons.py   (from this folder)
import asyncio, pathlib
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
FONTS = (HERE / '..' / 'fonts').resolve()
RING = 'M78 44H118L150 76V116L118 148H78L46 116V76Z'          # chamfered Q ring — same cut corners as the wordmark's Q

def icon_svg(size=200, rx=46):
    """Crimson tile, white Q ring, gold blade. rx=0 gives the full-bleed square iOS wants (it rounds the corners itself)."""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="{size}" height="{size}"><defs>
<linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF2D4D"/><stop offset=".55" stop-color="#D1092B"/><stop offset="1" stop-color="#7E0518"/></linearGradient>
<radialGradient id="h" cx=".28" cy=".1" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF1BF"/><stop offset=".5" stop-color="#F7BE45"/><stop offset="1" stop-color="#C98512"/></linearGradient>
<mask id="k" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200"><rect width="200" height="200" fill="#fff"/><path d="M110 108L158 156" stroke="#000" stroke-width="42"/></mask></defs>
<rect width="200" height="200" rx="{rx}" fill="url(#t)"/><rect width="200" height="200" rx="{rx}" fill="url(#h)"/>
<g mask="url(#k)"><path d="{RING}" fill="none" stroke="#fff" stroke-width="24" stroke-linejoin="round"/></g>
<path d="M108 106L156 154" stroke="url(#g)" stroke-width="26" stroke-linecap="round" fill="none"/></svg>'''

def og_html():
    lockup = (HERE / 'glitchq-lockup.svg').read_text(encoding='utf-8')
    return f'''<!doctype html><meta charset="utf-8"><style>
@font-face{{font-family:P;src:url("file://{FONTS}/IBMPlexSansArabic-Bold.woff");font-weight:700}}
@font-face{{font-family:P;src:url("file://{FONTS}/IBMPlexSansArabic-Medium.woff");font-weight:500}}
*{{box-sizing:border-box;margin:0}}
body{{width:1200px;height:630px;background:#050507;color:#fff;font-family:P,sans-serif;position:relative;overflow:hidden;direction:rtl}}
.g1{{position:absolute;inset:0;background:radial-gradient(760px 520px at 18% 92%,rgba(225,6,44,.55),transparent 70%),radial-gradient(520px 380px at 88% 8%,rgba(225,6,44,.22),transparent 70%)}}
.grid{{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 4px)}}
.in{{position:absolute;inset:0;padding:70px 84px;display:flex;flex-direction:column;justify-content:center;gap:26px}}
.lk{{width:430px;direction:ltr}} .lk svg{{width:430px;height:auto;display:block}}
h1{{font-size:78px;line-height:1.25;font-weight:700}} h1 b{{color:#FF3B57}}
p{{font-size:32px;font-weight:500;color:#C9C9D4}}
.pill{{display:inline-flex;gap:14px;font-size:26px;font-weight:700;color:#fff}}
.pill span{{padding:9px 24px;border-radius:999px;background:rgba(225,6,44,.18);border:2px solid rgba(255,59,87,.6)}}
.ic{{position:absolute;left:84px;top:50%;transform:translateY(-50%) rotate(-6deg);width:250px;filter:drop-shadow(0 30px 60px rgba(225,6,44,.55))}}
</style><div class="g1"></div><div class="grid"></div>
<div class="ic">{icon_svg(250)}</div>
<div class="in"><div class="lk">{lockup}</div><h1>بطاقات PlayStation<br><b>بالدينار الجزائري</b></h1><p>ادفع عبر بريدي موب · يصلك الكود خلال 5 – 60 دقيقة</p></div>'''

def mail_header_html():
    """E-mail header banner: OPAQUE near-black plate with the lockup baked in, so the logo stays readable even when a mail
    app (Gmail dark mode, Outlook…) recolours or drops the cell background behind it. 600x96 CSS px, exported @2x."""
    lockup = (HERE / 'glitchq-lockup.svg').read_text(encoding='utf-8').replace('<svg ', '<svg style="display:block;width:250px;height:auto" ', 1)
    return f'''<!doctype html><meta charset="utf-8"><style>
*{{margin:0;box-sizing:border-box}}
body{{width:600px;height:96px;background:#0A0A0E;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}}
.g{{position:absolute;inset:0;background:radial-gradient(420px 120px at 50% 130%,rgba(225,6,44,.45),transparent 70%)}}
.s{{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.03) 0 1px,transparent 1px 4px)}}
.l{{position:relative;direction:ltr}}
</style><div class="g"></div><div class="s"></div><div class="l">{lockup}</div>'''

async def main():
    (HERE / 'favicon.svg').write_text(icon_svg(), encoding='utf-8')
    (HERE / 'glitchq-icon.svg').write_text(icon_svg(), encoding='utf-8')
    async with async_playwright() as p:
        b = await p.chromium.launch()
        async def png(html, out, w, h, scale=1, transparent=True):
            pg = await b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=scale)
            await pg.set_content(html); await pg.wait_for_timeout(400)
            await pg.screenshot(path=str(HERE / out), omit_background=transparent); await pg.close()
        wrap = lambda svg: f'<body style="margin:0;background:transparent">{svg}</body>'
        await png(wrap(icon_svg(32)), 'favicon-32.png', 32, 32)
        await png(wrap(icon_svg(180, 0)), 'apple-touch-icon.png', 180, 180)
        await png(wrap(icon_svg(512)), 'icon-512.png', 512, 512)
        await png(og_html(), 'og-image.png', 1200, 630, transparent=False)
        lock = (HERE / 'glitchq-lockup.svg').read_text(encoding='utf-8').replace('<svg ', '<svg style="display:block;width:680px;height:auto" ', 1)
        await png(f'<body style="margin:0;background:transparent;width:680px">{lock}</body>', 'logo-email.png', 680, 140)
        await png(mail_header_html(), 'mail-header.png', 600, 96, scale=2, transparent=False)
        await b.close()
asyncio.run(main())
