# Source of the Glitch Q logo geometry (Python 3, no dependencies). Import the functions and write the SVGs you need; see README.md.
# Glitch Q — logo generator (custom letterforms: centre-line paths, one stroke weight, mitred 45° chamfers)
SW = 14; H = 100
INK, INK2, WHITE = '#0A0C10', '#151A26', '#F4F6FB'
GOLD = ('#FFEBB0', '#F4B63E', '#B27610')
CY, RD, CO = '#35E0F2', '#FF4D5E', '#3D6BFF'

def Gp(w): return f'M{w} 7H25L7 25V75L25 93H{w-7}V64H{w*0.5:.1f}'
def Cp(w): return f'M{w} 7H25L7 25V75L25 93H{w}'
def Lp(w): return f'M7 0V93H{w}'
def Ip(w): return 'M7 0V100'
def Tp(w): return f'M0 7H{w}M{w/2} 7V100'
def Hp(w): return f'M7 0V100M{w-7} 0V100M7 64H{w-7}'
LET = {'G': (66, Gp), 'L': (54, Lp), 'I': (14, Ip), 'T': (62, Tp), 'C': (62, Cp), 'H': (64, Hp)}
QW = 78
Q_RING = f'M25 7H{QW-25}L{QW-7} 25V75L{QW-25} 93H25L7 75V25Z'
Q_TAIL = f'M36 62H58L102 106H80Z'      # flat-cut 45° slash from inside the counter, out through the lower-right corner

def wm_letters(txt, gap, color):
    out, x = [], 0
    for ch in txt:
        w, f = LET[ch]
        out.append(f'<path transform="translate({x:.1f} 0)" d="{f(w)}"/>'); x += w + gap
    return f'<g fill="none" stroke="{color}" stroke-width="{SW}" stroke-linejoin="miter" stroke-miterlimit="4">{"".join(out)}</g>', x - gap

def q_art(x, ring, tail, uid, knock=True):
    """Q ring + gold slash. The ring is cut away around the slash so the slash reads as a separate blade."""
    m = f' mask="url(#k{uid})"' if knock else ''
    return (f'<g transform="translate({x} 0)"><g fill="none" stroke="{ring}" stroke-width="{SW}" stroke-linejoin="miter" stroke-miterlimit="4"{m}><path d="{Q_RING}"/></g>'
            f'<path d="{Q_TAIL}" fill="{tail}"/></g>')

def defs(uid, qx=0):
    return (f'<linearGradient id="g{uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{GOLD[0]}"/><stop offset=".5" stop-color="{GOLD[1]}"/><stop offset="1" stop-color="{GOLD[2]}"/></linearGradient>'
            f'<mask id="k{uid}" maskUnits="userSpaceOnUse" x="-50" y="-50" width="400" height="260"><rect x="-50" y="-50" width="400" height="260" fill="#fff"/>'
            f'<path d="{Q_TAIL}" fill="#000" stroke="#000" stroke-width="5" stroke-linejoin="miter"/></mask>')

def sliced(make, width, bands, shifts, ghost, uid, ghost_on=1):
    """make(ring, tail, word) → svg for one copy. Renders three horizontal bands; the middle one slides and gets RGB fringes."""
    clips, parts = [], []
    for i, ((y0, y1), dx) in enumerate(zip(bands, shifts)):
        top = -60 if i == 0 else y0; bot = 260 if i == len(bands) - 1 else y1
        clips.append(f'<clipPath id="c{uid}{i}"><rect x="-80" y="{top}" width="{width+260}" height="{bot-top}"/></clipPath>')
        if i == ghost_on:
            parts.append(f'<g clip-path="url(#c{uid}{i})"><g transform="translate({dx-ghost} 0)">{make(CY, CY, CY)}</g><g transform="translate({dx+ghost} 0)">{make(RD, RD, RD)}</g><g transform="translate({dx} 0)">{make(None, None, None)}</g></g>')
        else:
            parts.append(f'<g clip-path="url(#c{uid}{i})"><g transform="translate({dx} 0)">{make(None, None, None)}</g></g>')
    return f'<defs>{"".join(clips)}</defs>{"".join(parts)}'

def svg(w, h, body, bg=None, vb=None):
    r = f'<rect width="100%" height="100%" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb or f"0 0 {w} {h}"}" width="{w}" height="{h}">{r}{body}</svg>'

# ───────── A · SLICE — one glitch line runs through the whole lockup ─────────
def lockup_A(fg=WHITE, uid='A'):
    wm_w = wm_letters('GLITCH', 20, fg)[1]
    qx = wm_w + 40
    def make(fgc, tailc, _):
        return wm_letters('GLITCH', 20, fgc or fg)[0] + q_art(qx, fgc or fg, tailc or f'url(#g{uid})', uid)
    total = qx + QW + 30
    body = f'<defs>{defs(uid)}</defs>' + sliced(make, total, ((0, 38), (38, 54), (54, 160)), (0, 9, 0), 5, uid)
    return body, total

def icon_A(size=200, uid='IA', tile=True):
    """Q on a chamfered cobalt tile — the app-icon / favicon / avatar version."""
    s = size / 200
    def make(fgc, tailc, _):
        return q_art(0, fgc or WHITE, tailc or f'url(#g{uid})', uid)
    q = f'<g transform="translate(30 36) scale(1.3)">' + f'<defs>{defs(uid)}</defs>' + sliced(make, QW, ((0, 38), (38, 54), (54, 160)), (0, 8, 0), 4, uid) + '</g>'
    t = ''
    if tile:
        t = (f'<defs><linearGradient id="t{uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4F7BFF"/><stop offset="1" stop-color="#1B3FC4"/></linearGradient></defs>'
             f'<path d="M44 0H156L200 44V156L156 200H44L0 156V44Z" fill="url(#t{uid})"/><path d="M44 5H156L195 44V156L156 195H44L5 156V44Z" fill="none" stroke="#FFFFFF" stroke-opacity=".18" stroke-width="2"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="{size}" height="{size}">{t}{q}</svg>'

# ───────── B · CREST — obsidian + gold, a clan-badge emblem ─────────
def octa(s, c, inset=0):
    a, b = inset, s - inset
    return f'M{a+c} {a}H{b-c}L{b} {a+c}V{b-c}L{b-c} {b}H{a+c}L{a} {b-c}V{a+c}Z'

def crest_B(uid='B'):
    S = 240
    def make(fgc, tailc, _):
        return q_art(0, fgc or WHITE, tailc or f'url(#g{uid})', uid)
    q = (f'<g transform="translate({(S-QW*1.25)/2-4:.1f} 52) scale(1.25)"><defs>{defs(uid)}</defs>'
         + sliced(make, QW, ((0, 38), (38, 54), (54, 160)), (0, 8, 0), 4, uid) + '</g>')
    frame = (f'<defs><radialGradient id="r{uid}" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#202843"/><stop offset="1" stop-color="{INK}"/></radialGradient>'
             f'<linearGradient id="f{uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{GOLD[0]}"/><stop offset=".45" stop-color="{GOLD[1]}"/><stop offset="1" stop-color="{GOLD[2]}"/></linearGradient></defs>'
             f'<path d="{octa(S,56)}" fill="url(#r{uid})" stroke="url(#f{uid})" stroke-width="7" stroke-linejoin="miter"/>'
             f'<path d="{octa(S,46,16)}" fill="none" stroke="url(#f{uid})" stroke-width="1.6" stroke-opacity=".75"/>'
             f'<path d="M{S/2-16} 3.5H{S/2+16}" stroke="{INK}" stroke-width="9"/><path d="M{S/2-9} 3.5L{S/2} 14L{S/2+9} 3.5Z" fill="url(#f{uid})"/>'
             f'<path d="M{S/2-16} {S-3.5}H{S/2+16}" stroke="{INK}" stroke-width="9"/><path d="M{S/2-9} {S-3.5}L{S/2} {S-14}L{S/2+9} {S-3.5}Z" fill="url(#f{uid})"/>')
    return frame + q, S

def wordmark_small(scale=.36, fg=WHITE, uid='W'):
    g, w = wm_letters('GLITCH', 22, fg)
    qx = w + 44
    q = f'<defs>{defs(uid)}</defs>' + q_art(qx, fg, f'url(#g{uid})', uid)
    return f'<g transform="scale({scale})">{g}{q}</g>', (qx + QW + 24) * scale

# ───────── C · PIXEL — the Q on an arcade grid ─────────
PQ = ['..#####..',
      '.#######.',
      '###...###',
      '###...###',
      '###...###',
      '###...###',
      '.####.###',
      '..#####.#',
      '.......##']
def pixel_Q(px=14, uid='C', ring=WHITE):
    out = []
    shift = {3: 1, 4: 1}                               # the glitched rows slide one cell
    for r, row in enumerate(PQ):
        for c, ch in enumerate(row):
            if ch != '#': continue
            x = (c + shift.get(r, 0)) * px; y = r * px
            gold = (r, c) in {(5, 5), (6, 5), (6, 6), (7, 6), (7, 7), (8, 7), (8, 8), (7, 8)}
            col = f'url(#g{uid})' if gold else ring
            if r in shift:
                out.append(f'<rect x="{x-px}" y="{y}" width="{px}" height="{px}" fill="{CY}" opacity=".9"/><rect x="{x+px}" y="{y}" width="{px}" height="{px}" fill="{RD}" opacity=".9"/>')
            out.append(f'<rect x="{x}" y="{y}" width="{px}" height="{px}" fill="{col}"/>')
    for (c, r, col) in [(11, 3, CY), (12, 4, RD), (11, 5, CY), (13, 2, RD)]:    # stray pixels leaving the band
        out.append(f'<rect x="{c*px}" y="{r*px}" width="{px}" height="{px}" fill="{col}"/>')
    return f'<defs>{defs(uid)}</defs>' + ''.join(out)

GLY = {  # 5x7 pixel capitals for the wordmark
 'G': ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.####'],
 'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
 'I': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
 'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
 'C': ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
 'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
}
def pixel_word(txt='GLITCH', px=10, color=WHITE, gap=1):
    out, x = [], 0
    for ch in txt:
        for r, row in enumerate(GLY[ch]):
            for c, v in enumerate(row):
                if v == '#':
                    out.append(f'<rect x="{(x+c)*px}" y="{r*px}" width="{px}" height="{px}" fill="{color}"/>')
        x += 5 + gap
    return ''.join(out), (x - gap) * px

if __name__ == '__main__':
    print('lib ok')

# ───────── C · FOIL — calm wordmark, ONE glitchy Q (holographic gift-card foil, cut by dissolving scanlines) ─────────
def foil_defs(uid):
    slits = [(64, 1.3), (72, 1.9), (80, 2.5), (88, 3.1), (96, 3.7)]
    cuts = ''.join(f'<rect x="-10" y="{y}" width="110" height="{h}" fill="#000"/>' for y, h in slits)
    return (f'<linearGradient id="fo{uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7DF3FF"/><stop offset=".45" stop-color="#5B86FF"/><stop offset=".8" stop-color="#7CF2C5"/><stop offset="1" stop-color="#FFEBB0"/></linearGradient>'
            f'<mask id="fm{uid}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="150"><rect x="-20" y="-20" width="140" height="150" fill="#fff"/>{cuts}'
            f'<path d="{Q_TAIL}" fill="#000" stroke="#000" stroke-width="9" stroke-linejoin="miter"/></mask>')

def q_foil(x, uid, ring_extra=True):
    return (f'<g transform="translate({x} 0)"><g fill="none" stroke="url(#fo{uid})" stroke-width="{SW}" stroke-linejoin="miter" stroke-miterlimit="4" mask="url(#fm{uid})"><path d="{Q_RING}"/></g>'
            f'<path d="{Q_TAIL}" fill="url(#g{uid})"/></g>')

def lockup_C(fg=WHITE, uid='C'):
    g, w = wm_letters('GLITCH', 22, fg)
    qx = w + 44
    return f'<defs>{defs(uid)}{foil_defs(uid)}</defs>{g}{q_foil(qx, uid)}', qx + QW + 24

def icon_C(size=200, uid='IC'):
    s = f'<defs>{defs(uid)}{foil_defs(uid)}<linearGradient id="t{uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1A2033"/><stop offset="1" stop-color="{INK}"/></linearGradient><linearGradient id="b{uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7DF3FF"/><stop offset=".5" stop-color="#5B86FF"/><stop offset="1" stop-color="#F4B63E"/></linearGradient></defs>'
    s += f'<path d="M44 0H156L200 44V156L156 200H44L0 156V44Z" fill="url(#t{uid})"/><path d="M44 4H156L196 44V156L156 196H44L4 156V44Z" fill="none" stroke="url(#b{uid})" stroke-width="3"/>'
    s += f'<g transform="translate(30 36) scale(1.3)">{q_foil(0, uid)}</g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="{size}" height="{size}">{s}</svg>'

# horizontal lockup for B: crest + chamfered wordmark
def lockup_B(fg=WHITE, uid='BL'):
    crest, S = crest_B(uid)
    g, w = wm_letters('GLITCH', 20, fg)
    qx = w + 40
    tail = f'<defs>{defs(uid+"w")}</defs>' + q_art(qx, fg, f'url(#g{uid}w)', uid + 'w')
    sc = .6
    total = 120 + 36 + (qx + QW + 24) * sc
    return (f'<g transform="scale(.5)">{crest}</g><g transform="translate(156 {60-50*sc:.1f}) scale({sc})">{g}{tail}</g>'), total
