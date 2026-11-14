// Translation completeness test — run with:  node i18n.test.mjs
//
// The store is written in Arabic; i18n-en.js turns every Arabic piece of text into English when the visitor picks English.
// This test fails if a piece of Arabic text in the pages has no English, so a new sentence can never ship half-translated.
//
// It checks (no browser, no network, no dependencies):
//   1. every Arabic text node / placeholder / title / aria-label / alt / <meta> text in index.html and reset.html has a translation,
//      and the translation contains no Arabic;
//   2. every Arabic string literal in reset.html's own script (messages it sets at run time) has a translation;
//   3. every UI string in script.js's T.ar table has an English counterpart (T.en, or the dictionary in i18n-en.js);
//   4. the dictionary itself: no Arabic left in an English value, no key written twice, "N دج" → "N DZD".
//
// What it cannot see — text that only exists after the shop talks to Firestore (product names/descriptions typed by the admin in
// Arabic only). Those fields have English twins in the admin panel (nameEn / descEn / qEn / aEn); see README.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => readFileSync(join(here, f), 'utf8');
const AR = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; failures.push(msg); } }

/* ── load the engine's tables the way the browser does (no document → it only exposes gqI18n) ───────────────────────────── */
const ctx = vm.createContext({});
vm.runInContext(read('i18n-en.js'), ctx, { filename: 'i18n-en.js' });
const I = ctx.gqI18n;
ok(!!I && typeof I.tr === 'function', 'i18n-en.js did not expose gqI18n');

/* ── T.ar / T.en from script.js: cut the `const T={…};` block out with a small scanner that understands strings ───────────── */
function cutObject(src, startRe) {
  const m = startRe.exec(src); if (!m) return null;
  let i = src.indexOf('{', m.index + m[0].length - 1), depth = 0, q = null;
  const start = i;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
}
let T = null;
try {
  const block = cutObject(read('script.js'), /\bconst\s+T\s*=\s*\{/);
  T = vm.runInNewContext('(' + block + ')', {}, { timeout: 2000 });
} catch (e) { ok(false, 'could not read the T table from script.js: ' + e.message); }
if (T) { ctx.T = T; I.fromT(); }

/* ── 1+2. the pages ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&middot;': '·' };
const dec = s => s.replace(/&(amp|lt|gt|quot|nbsp|middot|#39);/g, m => ENT[m]);

function pageSegments(html) {
  const segs = [];
  const scripts = [];
  let body = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (m, js) => { scripts.push(js); return ' '; })
                 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
                 .replace(/<!--[\s\S]*?-->/g, ' ');
  // elements the page opts out of translation are skipped (none today)
  body = body.replace(/<([a-z0-9]+)\b[^>]*\bdata-no-i18n\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  for (const m of body.matchAll(/(?:^|>)([^<>]+)(?=<|$)/g)) { const t = dec(m[1]); if (AR.test(t)) segs.push(['text', t]); }
  for (const m of body.matchAll(/\b(placeholder|title|aria-label|alt)\s*=\s*"([^"]*)"/gi)) { const t = dec(m[2]); if (AR.test(t)) segs.push([m[1], t]); }
  for (const m of body.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/(name|property)\s*=\s*"(description|og:title|og:description|twitter:title|twitter:description)"/i.test(tag)) continue;
    const c = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag); if (c && AR.test(c[1])) segs.push(['meta', dec(c[1])]);
  }
  const ti = /<title>([^<]*)<\/title>/i.exec(body); if (ti && AR.test(ti[1])) segs.push(['title', dec(ti[1])]);
  return { segs, scripts };
}

function scriptLiterals(js) {              // Arabic string literals of an inline script (each one is shown to the visitor by the page)
  const out = [];
  for (const m of js.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const s = m[1] ?? m[2] ?? m[3];
    if (s && AR.test(s)) out.push(s);
  }
  return out;
}
function arabicPieces(s) {                 // a literal such as '<span class="spinner"></span> جاري الحفظ...' or 'a<br>b' → the visible Arabic runs
  return dec(s).split(/<[^>]*>/).map(x => x.trim()).filter(x => AR.test(x));
}

for (const file of ['index.html', 'reset.html']) {
  const html = read(file);
  const { segs, scripts } = pageSegments(html);
  ok(segs.length > 0, file + ': found no Arabic text at all (parser broke?)');
  for (const [kind, t] of segs) {
    const en = I.tr(t);
    ok(en != null, `${file}: no English for ${kind}: «${t.trim().slice(0, 90)}»`);
    if (en != null) ok(!AR.test(en), `${file}: the English for «${t.trim().slice(0, 60)}» still has Arabic`);
  }
  if (file === 'reset.html') {
    for (const js of scripts) for (const lit of scriptLiterals(js)) for (const piece of arabicPieces(lit)) {
      const en = I.tr(piece);
      ok(en != null, `reset.html script: no English for «${piece.slice(0, 90)}»`);
      if (en != null) ok(!AR.test(en), `reset.html script: English for «${piece.slice(0, 60)}» still has Arabic`);
    }
  }
}

/* ── 3. script.js's own bilingual table ─────────────────────────────────────────────────────────────────────────────────── */
if (T && T.ar && T.en) {
  let n = 0;
  for (const k of Object.keys(T.ar)) {
    const a = T.ar[k]; if (typeof a !== 'string' || !AR.test(a)) continue;
    n++;
    const e = T.en[k];
    const good = (typeof e === 'string' && e.trim() && !AR.test(e)) || (I.tr(a) != null && !AR.test(I.tr(a)));
    ok(good, `script.js T.en is missing / still Arabic for key "${k}": «${a.slice(0, 60)}»`);
  }
  ok(n > 100, 'T.ar looks too small (' + n + ' strings) — did the table move?');
}

/* ── 4. the dictionary ──────────────────────────────────────────────────────────────────────────────────────────────────── */
const src = read('i18n-en.js');
const eb = cutObject(src, /\bvar\s+EN\s*=\s*\{/);
ok(!!eb, 'could not find the EN dictionary in i18n-en.js');
if (eb) {
  const seen = new Map();
  for (const m of eb.matchAll(/^\s*'((?:[^'\\]|\\.)+)'\s*:/gm)) {
    const key = m[1].replace(/\\'/g, "'");
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  for (const [k, c] of seen) ok(c === 1, `i18n-en.js: the key «${k.slice(0, 60)}» is written ${c} times`);
  for (const [k, v] of Object.entries(I.EN)) {
    ok(typeof v === 'string' && v.length > 0, `i18n-en.js: empty English for «${k.slice(0, 60)}»`);
    ok(!AR.test(v), `i18n-en.js: English value for «${k.slice(0, 60)}» contains Arabic`);
  }
}
ok(I.tr('1,500 دج') === '1,500 DZD', 'price "1,500 دج" should become "1,500 DZD", got ' + I.tr('1,500 دج'));
ok(I.tr('2500 دج') === '2500 DZD' && I.tr('دج') === 'DZD', 'the DZD unit rule is broken');
ok(I.tr('  ') === null && I.tr('hello') === null, 'tr() must leave text without Arabic alone');

console.log(`i18n: ${pass} checks passed, ${fail} failed`);
if (fail) {
  const shown = failures.slice(0, 60);
  shown.forEach(f => console.log('  ✗ ' + f));
  if (failures.length > shown.length) console.log(`  … and ${failures.length - shown.length} more`);
  process.exit(1);
}
