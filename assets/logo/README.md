# Glitch Q — logo kit

The mark is a custom wordmark (not a font): chamfered monoline letters, one glitch slice that cuts the whole
lockup, and a gold blade for the Q's tail.

| File | Use |
|---|---|
| `glitchq-lockup.svg` | Full logo on dark backgrounds (white letters) |
| `glitchq-lockup-ink.svg` | Full logo on light backgrounds (ink letters) |
| `glitchq-mark.svg` / `glitchq-mark-ink.svg` | The Q alone (white / ink) |
| `glitchq-icon.svg`, `favicon.svg` | Cobalt chamfered tile with the Q — avatars, app icon, favicon |
| `favicon-32.png`, `apple-touch-icon.png` (180), `icon-512.png` | PNG exports of the icon |
| `logo-email.png` | White lockup, transparent, 680 px wide — the e-mail header (shown at 170 px) |
| `og-image.png` | 1200×630 link preview |

Colours: ink `#0A0C10` · white `#F4F6FB` · cobalt `#3D6BFF` · gold `#F4B63E` (blade gradient `#FFEBB0 → #F4B63E → #B27610`) · glitch fringes red `#FF4D5E` and cyan `#35E0F2`.

Rules: keep clear space of one letter-stroke (14 units) on every side; don't recolour the blade or the fringes; don't stretch; below 120 px wide use the icon instead of the lockup.

`logo-email.png` is loaded by the e-mails from `https://glitchqq.github.io/glitch-q/assets/logo/logo-email.png`, so this folder must be published (merged to `main`) **before** the Worker with the new templates is deployed; until then the header shows the text "GLITCH Q" instead.
