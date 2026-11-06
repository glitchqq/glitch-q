# Fonts

| Font | Use | Licence |
|---|---|---|
| IBM Plex Sans Arabic | body text | SIL OFL 1.1 (OFL-IBMPlexSansArabic.txt) |
| Chakra Petch | numbers, Latin in headings | SIL OFL 1.1 (OFL-ChakraPetch.txt) |
| Baloo Bhaijaan 2 (`display-stand-in.woff`) | stand-in for the display face when KO-Okies is absent | SIL OFL 1.1 (OFL-BalooBhaijaan2.txt) |
| **KO-Okies** (`kookies/`) | display face (headings) chosen by the owner | **Paid typeface — Protype Foundry / Ibrahim Hamdi. "Don't redistribute."** |

`assets/fonts/kookies/` is committed with the owner's explicit approval: the owner states they bought KO-Okies and asked for it
to be served on the site. Two things to know, because this repository is **public**:

- The font's own name table says: "KO-Okies is a paid typeface. Don't redistribute or re-sell." (Protype Foundry, hello@protype.studio).
  The OS/2 `fsType` flag is 8 (editable embedding: embedding is technically permitted), but that flag is not a licence.
- A web font served from a public site, or committed to a public repo, can be downloaded by anyone. Keep the licence receipt
  (Gumroad/Protype order e-mail) and, if it does not mention web/website use, ask Protype for a web licence in writing.

The `.woff` files are converted from the purchased desktop OTFs (only the four weights used). If the files are ever removed,
the site falls back to the OFL stand-in with no layout break.
