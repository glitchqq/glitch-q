# Fonts

| Font | Use | Licence |
|---|---|---|
| IBM Plex Sans Arabic | body text | SIL OFL 1.1 (OFL-IBMPlexSansArabic.txt) |
| Chakra Petch | numbers, Latin in headings | SIL OFL 1.1 (OFL-ChakraPetch.txt) |
| Baloo Bhaijaan 2 (`display-stand-in.woff`) | stand-in for the display face when KO-Okies is absent | SIL OFL 1.1 (OFL-BalooBhaijaan2.txt) |
| **KO-Okies** (`kookies/`) | display face (headings) chosen by the owner | **Paid typeface — Protype Foundry / Ibrahim Hamdi. "Don't redistribute."** |

`assets/fonts/kookies/` is listed in `.gitignore` on purpose: this repository is public, and a web font served from a
public site is downloadable by anyone, which counts as redistribution. Put the `Kookies-*.woff` files there only after
confirming the licence you hold covers web embedding (contact: hello@protype.studio, https://protype.studio), then
`git add -f assets/fonts/kookies` when deploying. Without the files the site falls back to the OFL stand-in.
