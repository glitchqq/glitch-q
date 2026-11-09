/* ═══════════════════════════════════════════════════════════
   GLITCH Q — Cloudflare Worker v4 (security backbone)

   Everything that carries VALUE (prices, orders, coupons, points,
   rewards, referrals, order notifications) is decided HERE, on the
   server, after verifying the caller's Firebase ID token. The browser
   is never trusted for money or points.

   Secrets (Worker → Settings → Variables and Secrets, never in code):
     FIREBASE_SERVICE_ACCOUNT  BREVO_API_KEY
     TELEGRAM_BOT_TOKEN        TELEGRAM_CHAT_ID
   Optional variables:
     EXTRA_ORIGINS=http://localhost:5500   (local testing only)
     ADMIN_ALLOW_PASSWORD=true             (lets the admin use a password
                                            instead of Google sign-in)
═══════════════════════════════════════════════════════════ */

const ALLOWED_ORIGINS = [
  'https://glitchqq.github.io',
  'https://glitchq.is-a.dev',
  'https://glitchq.js.org',
];

const ADMIN_EMAIL = 'kadirom7k777@gmail.com';
const SITE_URL = 'https://glitchqq.github.io/glitch-q/';
const RATES = { EUR: 220, USD: 200, SAR: 55, AED: 56 };   // keep identical to script.js

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const extra = String(env.EXTRA_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const allowed = ALLOWED_ORIGINS.includes(origin) || extra.includes(origin);   // exact match only

    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : 'null',
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Cache-Control': 'no-store',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    // The "unsubscribe" link in a newsletter is opened by a mail app or the reader's browser, which carry no allowed Origin.
    // It is protected by a signed token (unsubToken) and its own limiter instead, and answers with a plain page.
    if (new URL(request.url).pathname === '/newsletter/unsubscribe') return handleUnsubscribe(request, env);
    // The Origin header only filters browsers (scripts can forge it), so it is never the
    // only protection: every route below validates its input and checks a verified token.
    if (!allowed) {
      return json({ error: 'Forbidden' }, 403, cors);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ── Global per-IP limiter ──
    if (hit('g:' + clientIp(request), 240, 60000)) {
      return json({ error: 'Too many requests' }, 429, cors);
    }

    try {
      const routes = {
        '/health':                 () => json({ ok: true, v: 8 }, 200, cors),
        '/maintenance':            () => handleMaintenance(request, env, cors),
        '/ticker':                 () => handleTicker(request, env, cors),
        '/stats/visit':            () => handleVisit(request, env, cors),
        '/reset-password':         () => handleResetPassword(request, env, cors),
        '/leaderboard':            () => handleLeaderboard(request, env, cors),
        '/coupon/validate':        () => handleCouponValidate(request, env, cors),
        '/offer':                  () => handleOffer(request, env, cors),
        '/order/create':           () => handleOrderCreate(request, env, cors),
        '/order/track':            () => handleOrderTrack(request, env, cors),
        '/report/create':          () => handleReportCreate(request, env, cors),
        '/rating/create':          () => handleRatingCreate(request, env, cors),
        '/newsletter/subscribe':   () => handleNewsletter(request, env, cors),
        '/account/streak':         () => handleStreak(request, env, cors),
        '/account/spin':           () => handleSpin(request, env, cors),
        '/account/rewards':        () => handleRewards(request, env, cors),
        '/account/redeem':         () => handleRedeem(request, env, cors),
        '/account/milestone':      () => handleRedeem(request, env, cors),   // old name, same handler
        '/account/referral':       () => handleReferral(request, env, cors),
        '/account/fp':             () => handleFingerprint(request, env, cors),
        '/account/revoke-sessions': () => handleRevokeSessions(request, env, cors),
        '/account/login-alert':    () => handleLoginAlert(request, env, cors),
        '/support/ping':           () => handleSupportPing(request, env, cors),
        '/admin/notify':           () => handleAdminNotify(request, env, cors),
        '/admin/send-code':        () => handleAdminSendCode(request, env, cors),
        '/admin/newsletter':       () => handleAdminNewsletter(request, env, cors),
      };
      const h = Object.prototype.hasOwnProperty.call(routes, path) ? routes[path] : null;
      if (!h) return json({ error: 'Not found' }, 404, cors);
      return await h();
    } catch (err) {
      console.error('Worker error:', err && err.message);
      return json({ error: 'Internal error' }, 500, cors);
    }
  }
};

/* ═══════════════════════════════════════
   SMALL SHARED HELPERS
═══════════════════════════════════════ */
function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

// Sliding-window counter kept in memory (best effort per Worker instance).
// Returns true when the caller is OVER the limit.
const hitStore = new Map();
function hit(key, max, windowMs) {
  const now = Date.now();
  let e = hitStore.get(key);
  if (!e || now > e.t) { e = { c: 0, t: now + windowMs }; hitStore.set(key, e); }
  e.c++;
  if (hitStore.size > 20000) { for (const [k, v] of hitStore) if (now > v.t) hitStore.delete(k); }
  return e.c > max;
}

function cleanText(s, max) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}
const RE_EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,200}\.[^\s@<>"']{2,}$/;
const RE_PHONE = /^[0-9+\s()\-]{6,20}$/;
const RE_ID = /^[A-Za-z0-9]{10,40}$/;

// Reads the request body but stops (and returns null) as soon as it exceeds maxBytes,
// so a huge or chunked upload can never fill the Worker's memory.
async function readBody(request, maxBytes) {
  const len = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (len > maxBytes) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { try { await reader.cancel(); } catch {} return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}

async function readJson(request, maxBytes = 8192) {
  try {
    const buf = await readBody(request, maxBytes);
    if (!buf) return null;
    const v = JSON.parse(new TextDecoder().decode(buf));
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}

// multipart body (order / report): size-capped, then parsed
async function readForm(request, maxBytes) {
  try {
    const buf = await readBody(request, maxBytes);
    if (!buf) return null;
    return await new Response(buf, { headers: { 'Content-Type': request.headers.get('Content-Type') || '' } }).formData();
  } catch { return null; }
}

function randomId(n = 20) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  while (out.length < n) {
    const buf = crypto.getRandomValues(new Uint8Array(n * 2));
    for (const b of buf) { if (b < 248 && out.length < n) out += chars[b % 62]; }   // 248 = 62*4: no modulo bias
  }
  return out;
}

function randomInt(maxExclusive) {           // uniform in [0, max)
  const lim = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % maxExclusive;
}

// "today" in Algeria as YYYY-MM-DD
function dzDay(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function dzDate() {
  try { return new Date().toLocaleDateString('ar-DZ', { timeZone: 'Africa/Algiers' }); }
  catch { return dzDay(); }
}

function sniffImage(bytes) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

// Validates an uploaded receipt/screenshot by its real bytes (not by the name the client gave it).
async function readImage(file) {
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') return { err: 'No photo provided' };
  if (file.size > 5 * 1024 * 1024) return { err: 'File too large' };
  if (file.size < 512) return { err: 'File too small' };
  const buf = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(buf);
  if (!type) return { err: 'Invalid file type' };
  return { blob: new Blob([buf], { type }), type };
}

/* ═══════════════════════════════════════
   TELEGRAM (owner notifications) — messages are always built on the server
═══════════════════════════════════════ */
async function tgSend(env, text, photoBlob) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
  try {
    let res;
    if (photoBlob) {
      const f = new FormData();
      f.append('chat_id', TELEGRAM_CHAT_ID);
      f.append('caption', String(text).slice(0, 1024));
      f.append('photo', photoBlob, 'receipt');
      res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: f });
    } else {
      res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: String(text).slice(0, 4000) }),   // plain text: no HTML parsing
      });
    }
    if (!res.ok) { console.error('TELEGRAM_ERROR status=' + res.status); return false; }
    return true;
  } catch (e) { console.error('TELEGRAM_FAIL ' + e.message); return false; }
}

/* ═══════════════════════════════════════
   FIRESTORE (REST, service account) — the only place that can write value fields
═══════════════════════════════════════ */
const pid = env => env.FIREBASE_PROJECT_ID || 'glitch-q';
const fsRoot = env => `projects/${pid(env)}/databases/(default)/documents`;
const fsUrl = env => `https://firestore.googleapis.com/v1/${fsRoot(env)}`;

function fsEnc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsEnc) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) fields[k] = fsEnc(x);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}
function fsDec(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsDec);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fsDec(x); return o; }
  return null;
}
function fsDecDoc(d) {
  const data = {};
  for (const [k, x] of Object.entries((d && d.fields) || {})) data[k] = fsDec(x);
  return { exists: true, id: String(d.name || '').split('/').pop(), data, updateTime: d.updateTime };
}

async function fsHeaders(env) {
  const token = await getFirebaseToken(env);
  if (!token) throw new Error('no service token');
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function fsGet(env, path) {
  const r = await fetch(`${fsUrl(env)}/${path}`, { headers: await fsHeaders(env) });
  if (r.status === 404) return { exists: false, data: {}, id: path.split('/').pop() };
  if (!r.ok) throw new Error('fsGet ' + r.status);
  return fsDecDoc(await r.json());
}

// Runs a single-collection query. filters: [[field, 'EQUAL', value]]; order: [field, 'DESCENDING']
async function fsQuery(env, collection, { filters = [], order = null, limit = 20 } = {}) {
  const sq = { from: [{ collectionId: collection }], limit };
  if (filters.length) {
    const fl = filters.map(([f, op, val]) => ({ fieldFilter: { field: { fieldPath: f }, op, value: fsEnc(val) } }));
    sq.where = fl.length === 1 ? fl[0] : { compositeFilter: { op: 'AND', filters: fl } };
  }
  if (order) sq.orderBy = [{ field: { fieldPath: order[0] }, direction: order[1] || 'ASCENDING' }];
  const r = await fetch(`${fsUrl(env)}:runQuery`, { method: 'POST', headers: await fsHeaders(env), body: JSON.stringify({ structuredQuery: sq }) });
  if (!r.ok) throw new Error('fsQuery ' + r.status);
  const rows = await r.json();
  return rows.filter(x => x.document).map(x => fsDecDoc(x.document));
}

// One write. spec: { fields, transforms, delete, precondition }
//   transforms: { inc: {field: n}, arrayUnion: {field: [..]}, serverTime: [field] }
function fsWrite(env, path, spec) {
  const name = `${fsRoot(env)}/${path}`;
  if (spec.delete) return { delete: name };
  const w = { update: { name, fields: {} } };
  const fields = spec.fields || {};
  for (const [k, v] of Object.entries(fields)) w.update.fields[k] = fsEnc(v);
  w.updateMask = { fieldPaths: Object.keys(fields) };
  const t = spec.transforms || {};
  const ut = [];
  for (const [f, n] of Object.entries(t.inc || {})) ut.push({ fieldPath: f, increment: { integerValue: String(n) } });
  for (const [f, arr] of Object.entries(t.arrayUnion || {})) ut.push({ fieldPath: f, appendMissingElements: { values: arr.map(fsEnc) } });
  for (const f of (t.serverTime || [])) ut.push({ fieldPath: f, setToServerValue: 'REQUEST_TIME' });
  if (ut.length) w.updateTransforms = ut;
  if (spec.precondition) w.currentDocument = spec.precondition;   // {exists:false} | {exists:true} | {updateTime}
  return w;
}

// returns {ok, status, retry}
async function fsCommit(env, writes) {
  const r = await fetch(`${fsUrl(env)}:commit`, { method: 'POST', headers: await fsHeaders(env), body: JSON.stringify({ writes }) });
  if (r.ok) return { ok: true };
  const body = await r.json().catch(() => ({}));
  const st = body && body.error && body.error.status;
  if (st !== 'ALREADY_EXISTS' && st !== 'NOT_FOUND') console.error('FS_COMMIT_ERROR status=' + r.status + ' ' + (st || ''));
  return { ok: false, status: r.status, code: st, retry: st === 'ABORTED' || st === 'FAILED_PRECONDITION' || st === 'ALREADY_EXISTS' || st === 'NOT_FOUND' };
}

// Optimistic read-modify-write: re-reads and retries if the document changed in between.
// build(cur) returns { fields, transforms } to write, or { abort: any } to stop without writing.
async function fsUpdate(env, path, build, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const cur = await fsGet(env, path);
    const out = await build(cur);
    if (!out || out.abort !== undefined) return { ok: false, aborted: true, abort: out ? out.abort : null, cur };
    const precondition = cur.exists ? { updateTime: cur.updateTime } : { exists: false };
    const r = await fsCommit(env, [fsWrite(env, path, { ...out, precondition })]);
    if (r.ok) return { ok: true, cur, out };
    if (!r.retry) return { ok: false, status: r.status, cur };
  }
  return { ok: false, contention: true };
}

/* ═══════════════════════════════════════
   VERIFIED CALLER (Firebase ID token)
═══════════════════════════════════════ */
function isAdminClaims(claims, env) {
  if (!claims || String(claims.email || '').toLowerCase() !== ADMIN_EMAIL || claims.email_verified !== true) return false;
  if (String(env.ADMIN_ALLOW_PASSWORD) === 'true') return true;
  return !!(claims.firebase && claims.firebase.sign_in_provider === 'google.com');   // admin must come through Google (2-step verification)
}

// Verifies body.idToken. Returns {claims} | {err: Response}. optional=true allows a missing token (guest).
async function who(token, env, cors, optional = false) {
  if (!token) return optional ? { claims: null } : { err: json({ error: 'Unauthorized' }, 401, cors) };
  let claims;
  try { claims = await verifyIdToken(token, pid(env)); }
  catch (e) { console.error('VERIFY_UNAVAILABLE ' + e.message); return { err: json({ error: 'Verification unavailable' }, 503, cors) }; }
  if (!claims) return { err: json({ error: 'Unauthorized' }, 401, cors) };
  return { claims };
}

async function isBanned(env, uid) {
  try { return (await fsGet(env, `banned_users/${encodeURIComponent(uid)}`)).exists; }
  catch { return false; }
}

/* ═══════════════════════════════════════
   CATALOG + PRICING (single source of truth for prices)
═══════════════════════════════════════ */
async function loadCatalog(env) {
  const [p, c, d] = await Promise.all([
    fsGet(env, 'settings/products'), fsGet(env, 'settings/categories'), fsGet(env, 'settings/discount'),
  ]);
  // same defaults as DEFAULT_CATS in script.js, used when the categories document does not exist yet
  const cats = Array.isArray(c.data.categories) ? c.data.categories : [{ id: 'psstore', enabled: true }, { id: 'psplus', enabled: true }, { id: 'games', enabled: true }];
  const products = Array.isArray(p.data.products) ? p.data.products : [];
  const td = dzDay();
  const x = d.data || {};
  const disc = (d.exists && x.active && (!x.expiry || x.expiry >= td) && x.value > 0 && x.value <= 100) ? x.value : 0;
  return { cats, products, disc };
}

function unitPrice(prod, disc) {
  const orig = Number(prod.priceDZD) || (Number(prod.val) * (RATES[prod.cur] || 220));
  if (!Number.isFinite(orig) || orig <= 0) return 0;
  return disc > 0 ? Math.floor(orig * (1 - disc / 100)) : Math.floor(orig);
}

function valueText(p) {
  if (p.cur === 'month') return `${p.val} شهر`;
  if (p.cur === 'copy') return 'نسخة';
  return `${p.val}${p.sym || ''}`;
}

// items: [{id, qty}] → {lines, subtotal, label} or {err}
function priceItems(items, cat) {
  if (!Array.isArray(items) || !items.length || items.length > 20) return { err: 'Invalid cart' };
  const merged = new Map();
  for (const it of items) {
    const id = cleanText(it && it.id, 50);
    const qty = Math.floor(Number(it && it.qty));
    if (!id || !(qty >= 1 && qty <= 10)) return { err: 'Invalid cart' };
    merged.set(id, Math.min(10, (merged.get(id) || 0) + qty));
  }
  const enabledCats = new Set(cat.cats.filter(c => c && c.enabled).map(c => c.id));
  const lines = [];
  let subtotal = 0;
  for (const [id, qty] of merged) {
    const prod = cat.products.find(p => p && p.id === id);
    if (!prod || !enabledCats.has(prod.cat)) return { err: 'Product unavailable' };
    if (prod.stock === false) return { err: 'Out of stock' };
    const unit = unitPrice(prod, cat.disc);
    if (!(unit > 0)) return { err: 'Product unavailable' };
    lines.push({ id, name: cleanText(prod.name, 120), qty, unitDZD: unit, prod });
    subtotal += unit * qty;
  }
  const label = (lines.length === 1 && lines[0].qty === 1)
    ? `${lines[0].name} ${valueText(lines[0].prod)} (${cleanText(lines[0].prod.sub || '', 80)})`
    : lines.map(l => `${l.name} x${l.qty}`).join(' + ');
  return { lines, subtotal, label: label.slice(0, 300) };
}

function couponMatches(c, code, td) {
  if (!c || !c.active) return false;
  if (String(c.code || '').toUpperCase().trim() !== code) return false;
  if (c.expiry && c.expiry < td) return false;
  if (c.maxUses && (c.usedCount || 0) >= c.maxUses) return false;
  return true;
}
function couponDiscount(c, base) {
  const v = Number(c.value) || 0;
  return c.type === 'percent' ? Math.floor(base * Math.min(v, 100) / 100) : Math.min(v, base);
}
const cleanCode = s => cleanText(s, 20).toUpperCase();

/* ═══════════════════════════════════════
   COUPON CHECK (the coupon list itself is never exposed)
═══════════════════════════════════════ */
async function handleCouponValidate(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (hit('cpn:' + clientIp(request), 20, 60000)) return json({ error: 'Too many requests' }, 429, cors);
  const body = await readJson(request, 1024);
  const code = cleanCode(body && body.code);
  if (!code) return json({ ok: false }, 200, cors);
  const d = await fsGet(env, 'settings/coupons');
  const td = dzDay();
  const c = (Array.isArray(d.data.coupons) ? d.data.coupons : []).find(x => couponMatches(x, code, td));
  if (!c) return json({ ok: false }, 200, cors);
  return json({ ok: true, code, type: c.type === 'percent' ? 'percent' : 'fixed', value: Number(c.value) || 0 }, 200, cors);
}

/* ═══════════════════════════════════════
   HOME-PAGE OFFER — only a coupon the owner explicitly marked "featured" is ever shown.
   Every other coupon code stays private.
═══════════════════════════════════════ */
let _offer = { at: 0, v: null };
async function handleOffer(request, env, cors) {
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (hit('offer:' + clientIp(request), 60, 60000)) return json({ error: 'Too many requests' }, 429, cors);
  const td = dzDay();
  if (!_offer.v || Date.now() - _offer.at > 60000) {
    const d = await fsGet(env, 'settings/coupons');
    const list = Array.isArray(d.data.coupons) ? d.data.coupons : [];
    const c = list.find(x => x && x.featured === true && couponMatches(x, String(x.code || '').toUpperCase().trim(), td));
    _offer = { at: Date.now(), v: c ? {
      ok: true,
      code: cleanCode(c.code),
      type: c.type === 'percent' ? 'percent' : 'fixed',
      value: Number(c.value) || 0,
      expiry: /^\d{4}-\d{2}-\d{2}$/.test(String(c.expiry || '')) ? c.expiry : null,
      left: c.maxUses ? Math.max(0, Number(c.maxUses) - (Number(c.usedCount) || 0)) : null,
    } : { ok: false } };
  }
  const v = _offer.v;
  if (v.ok && v.expiry && v.expiry < td) return json({ ok: false }, 200, cors);   // expired since the cached read
  return json(v, 200, cors);
}

/* ═══════════════════════════════════════
   CREATE ORDER — price, coupon, receipt and notification are all handled here
═══════════════════════════════════════ */
async function handleOrderCreate(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  const ip = clientIp(request);
  if (hit('ord:' + ip, 6, 600000)) return json({ error: 'Too many requests' }, 429, cors);
  const form = await readForm(request, 6 * 1024 * 1024);
  if (!form) return json({ error: 'Invalid or too large request' }, 413, cors);
  let data;
  try { data = JSON.parse(String(form.get('data') || '')); } catch { return json({ error: 'Invalid data' }, 400, cors); }
  if (!data || typeof data !== 'object') return json({ error: 'Invalid data' }, 400, cors);

  const a = await who(String(form.get('idToken') || ''), env, cors, true);
  if (a.err) return a.err;
  const claims = a.claims;
  if (claims && claims.email_verified !== true) return json({ error: 'Unauthorized' }, 401, cors);
  const uid = claims ? claims.sub : 'guest';
  if (claims) {
    if (hit('ordu:' + uid, 8, 600000)) return json({ error: 'Too many requests' }, 429, cors);
    if (await isBanned(env, uid)) return json({ error: 'Account suspended' }, 403, cors);
  }

  const pay = data.pay === 'hand' ? 'hand' : (data.pay === 'baridimob' ? 'baridimob' : null);
  const recv = data.recv === 'phone' ? 'phone' : (data.recv === 'email' ? 'email' : null);
  if (!pay || !recv) return json({ error: 'Invalid payment or delivery method' }, 400, cors);

  const email = cleanText(data.email, 254).toLowerCase();
  const phone = cleanText(data.phone, 20);
  if (pay === 'hand' && !RE_PHONE.test(phone)) return json({ error: 'Phone number required' }, 400, cors);
  if (pay === 'baridimob' && recv === 'phone' && !RE_PHONE.test(phone)) return json({ error: 'Phone number required' }, 400, cors);
  if (recv === 'email' && !RE_EMAIL.test(email)) return json({ error: 'Valid email required' }, 400, cors);
  const senderName = cleanText(data.name, 100);
  if (pay === 'baridimob' && senderName.length < 2) return json({ error: 'Sender name required' }, 400, cors);

  let photo = null;
  if (pay === 'baridimob') {
    const img = await readImage(form.get('photo'));
    if (img.err) return json({ error: img.err }, 400, cors);
    photo = img.blob;
  }

  const cat = await loadCatalog(env);
  const priced = priceItems(data.items, cat);
  if (priced.err) return json({ error: priced.err }, 400, cors);

  // coupon: checked and reserved atomically so the same code cannot exceed its limit
  const code = cleanCode(data.coupon);
  let discount = 0, couponUsed = null;
  if (code) {
    const td = dzDay();
    const res = await fsUpdate(env, 'settings/coupons', cur => {
      const list = Array.isArray(cur.data.coupons) ? cur.data.coupons : [];
      const i = list.findIndex(x => couponMatches(x, code, td));
      if (i === -1) return { abort: 'invalid' };
      discount = couponDiscount(list[i], priced.subtotal);
      const next = list.map((x, j) => (j === i ? { ...x, usedCount: (x.usedCount || 0) + 1 } : x));
      return { fields: { coupons: next } };
    });
    if (!res.ok) return json({ error: res.aborted ? 'Invalid coupon' : 'Please try again' }, res.aborted ? 400 : 503, cors);
    couponUsed = code;
  }
  const total = Math.max(0, priced.subtotal - discount);

  const oid = randomId(20);
  const doc = {
    product: priced.label,
    status: 'pending',
    userId: uid,
    paymentMethod: pay,
    receiveMethod: recv,
    receiveContact: recv === 'email' ? email : phone,
    totalDZD: total,
    subtotalDZD: priced.subtotal,
    discountDZD: discount,
    coupon: couponUsed,
    items: priced.lines.map(l => ({ id: l.id, name: l.name, qty: l.qty, unitDZD: l.unitDZD })),
    date: dzDate(),
    awarded: false,
  };
  if (claims && RE_EMAIL.test(String(claims.email || ''))) doc.accountEmail = String(claims.email).toLowerCase();
  if (pay === 'hand') doc.phone = phone;
  if (pay === 'baridimob') doc.senderName = senderName;

  const created = await fsCommit(env, [fsWrite(env, `orders/${oid}`, { fields: doc, transforms: { serverTime: ['ts'] }, precondition: { exists: false } })]);
  if (!created.ok) { await releaseCoupon(env, couponUsed); return json({ error: 'Could not create the order' }, 503, cors); }

  const lines = [
    pay === 'hand' ? '📦 Hand Delivery!' : '📦 New Order!',
    `🆔 ${oid}`,
    pay === 'baridimob' ? `👤 ${senderName}` : null,
    `🔑 ${uid}`,
    `🎮 ${priced.label}`,
    `💰 ${total.toLocaleString('en-US')} دج`,
    couponUsed ? `🎟️ ${couponUsed} (-${discount.toLocaleString('en-US')})` : null,
    pay === 'baridimob' ? '💳 BaridiMob' : '🤝 Tlemcen',
    recv === 'email' ? `📧 ${email}` : `📞 ${phone}`,
  ].filter(Boolean).join('\n');
  const sent = await tgSend(env, lines, photo);
  if (!sent) {                                   // the owner would never see this order: undo it and let the customer retry
    await fsCommit(env, [fsWrite(env, `orders/${oid}`, { delete: true })]);
    await releaseCoupon(env, couponUsed);
    return json({ error: 'Could not notify the store, please try again' }, 502, cors);
  }
  return json({ ok: true, orderId: oid, total, product: priced.label }, 200, cors);
}

async function releaseCoupon(env, code) {
  if (!code) return;
  try {
    await fsUpdate(env, 'settings/coupons', cur => {
      const list = Array.isArray(cur.data.coupons) ? cur.data.coupons : [];
      const i = list.findIndex(x => String(x.code || '').toUpperCase().trim() === code);
      if (i === -1) return { abort: 'gone' };
      return { fields: { coupons: list.map((x, j) => (j === i ? { ...x, usedCount: Math.max(0, (x.usedCount || 0) - 1) } : x)) } };
    });
  } catch (e) { console.error('RELEASE_COUPON_FAIL ' + e.message); }
}

/* ═══════════════════════════════════════
   TRACK ORDER — returns only status/product/date (never contact details)
═══════════════════════════════════════ */
async function handleOrderTrack(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (hit('trk:' + clientIp(request), 20, 60000)) return json({ error: 'Too many requests' }, 429, cors);
  const body = await readJson(request, 1024);
  const id = cleanText(body && body.orderId, 50);
  if (!RE_ID.test(id)) return json({ ok: false }, 200, cors);
  const d = await fsGet(env, `orders/${id}`);
  if (!d.exists) return json({ ok: false }, 200, cors);
  const o = d.data;
  return json({ ok: true, status: cleanText(o.status, 20), product: cleanText(o.product, 300), date: cleanText(o.date, 40) }, 200, cors);
}

/* ═══════════════════════════════════════
   LEADERBOARD — public names/points only; honours "hide me"
═══════════════════════════════════════ */
// same list as the nickname check in account.js (the browser check alone can be bypassed)
const NICK_BLOCK = /glitch|admin|support|staff|moderator|مشرف|ادمن|أدمن|الدعم|إدارة|ادارة/i;
let _lb = null, _lbExp = 0;
async function handleLeaderboard(request, env, cors) {
  if (hit('lb:' + clientIp(request), 30, 60000)) return json({ error: 'Too many requests' }, 429, cors);
  if (_lb && Date.now() < _lbExp) return json({ ok: true, top: _lb }, 200, cors);
  const rows = await fsQuery(env, 'users', { order: ['points', 'DESCENDING'], limit: 25 });
  const top = [];
  for (const r of rows) {
    const u = r.data;
    if (u.prefs && u.prefs.hideLb === true) continue;
    let nick = cleanText(u.nick, 20);
    if (NICK_BLOCK.test(nick)) nick = '';                       // reserved names cannot be used to pose as the store
    const first = cleanText(u.firstName || u.name, 30), last = cleanText(u.lastName, 30);
    const name = nick || (first + (last ? ' ' + last[0] + '.' : '')) || '—';
    top.push({ name, points: Math.max(0, Math.floor(Number(u.points) || 0)), avatar: u.avatar && typeof u.avatar === 'object' ? { e: cleanText(u.avatar.e, 8), c: cleanText(u.avatar.c, 12) } : null });
    if (top.length >= 5) break;
  }
  _lb = top; _lbExp = Date.now() + 60000;
  return json({ ok: true, top }, 200, cors);
}

/* ═══════════════════════════════════════
   VISITS / NEWSLETTER / RATING / REPORT
═══════════════════════════════════════ */
async function handleVisit(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (hit('vis:' + clientIp(request), 10, 3600000)) return json({ ok: true }, 200, cors);
  await fsCommit(env, [fsWrite(env, 'settings/stats', { fields: {}, transforms: { inc: { visitors: 1 } } })]);
  return json({ ok: true }, 200, cors);
}

async function sha256Hex(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}

async function handleNewsletter(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (hit('nl:' + clientIp(request), 5, 600000)) return json({ error: 'Too many requests' }, 429, cors);
  const body = await readJson(request, 1024);
  const email = cleanText(body && body.email, 254).toLowerCase();
  if (!RE_EMAIL.test(email)) return json({ error: 'Invalid email' }, 400, cors);
  const id = (await sha256Hex(email)).slice(0, 40);
  await fsCommit(env, [fsWrite(env, `newsletter/${id}`, { fields: { email, date: dzDate() }, transforms: { serverTime: ['ts'] }, precondition: { exists: false } })]);   // already subscribed = silently fine
  return json({ ok: true }, 200, cors);
}

/* ═══════════════════════════════════════
   NEWSLETTER — unsubscribe links + the owner's composer
   Subscribers live in newsletter/{id} (id = first 40 hex chars of sha256(email), see handleNewsletter).
   The unsubscribe token is HMAC-SHA256(id) keyed from the Worker's own FIREBASE_SERVICE_ACCOUNT secret, so no new secret is
   needed and a link cannot be forged or used for any other subscriber.
═══════════════════════════════════════ */
const NL = { subjMax: 120, preMax: 140, bodyMax: 6000, labelMax: 40, sendDefault: 250, sendCap: 1000, chunk: 100 };
const RE_NL_ID = /^[A-Za-z0-9_-]{8,64}$/;

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map(x => x.toString(16).padStart(2, '0')).join('');
}
const unsubSecret = env => env.FIREBASE_SERVICE_ACCOUNT ? 'glitchq-unsub-v1|' + env.FIREBASE_SERVICE_ACCOUNT : '';
async function unsubToken(env, id) {
  const sec = unsubSecret(env);
  return sec ? (await hmacHex(sec, 'unsub|' + id)).slice(0, 32) : '';
}
function sameStr(a, b) {
  a = String(a); b = String(b);
  if (!a || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function unsubLink(env, origin, id) {
  return `${origin}/newsletter/unsubscribe?i=${encodeURIComponent(id)}&t=${await unsubToken(env, id)}`;
}

function unsubPage(kind, action) {
  const T = {
    ask:  ['إلغاء الاشتراك من النشرة', 'هل تريد التوقف عن استلام النشرة البريدية؟ لن تصلك رسائل ترويجية بعد ذلك، أما رسائل طلباتك وأكوادك فتبقى تصلك كالمعتاد.'],
    done: ['تم إلغاء اشتراكك', 'لن تصلك النشرة البريدية بعد الآن. يمكنك الاشتراك من جديد في أي وقت من المتجر.'],
    bad:  ['الرابط غير صالح', 'هذا الرابط غير صحيح أو انتهت صلاحيته. لإلغاء الاشتراك استخدم الرابط الموجود في آخر رسالة وصلتك.'],
    busy: ['محاولات كثيرة', 'انتظر بضع دقائق ثم حاول مرة أخرى.'],
  }[kind];
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escHtml(T[0])}</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:#050507;color:#F4F4F7;font-family:${MAIL_FONT};direction:rtl}
.c{width:min(420px,100%);background:#0F0F14;border:1px solid #24242E;border-radius:20px;overflow:hidden}.s{height:4px;background:linear-gradient(90deg,#F5223F 88%,#FF5C6C 88% 94%,#35E0F2 94%)}
.b{padding:30px 26px;text-align:right}h1{margin:0 0 10px;font-size:22px;line-height:1.5}p{margin:0 0 22px;font-size:14.5px;line-height:1.9;color:#C9C9D6}
button,a.l{display:block;width:100%;padding:14px;border:0;border-radius:12px;background:#D4062A;color:#fff;font:700 16px ${MAIL_FONT};text-align:center;text-decoration:none;cursor:pointer}
.w{font-family:Arial,Helvetica,sans-serif;font-weight:800;letter-spacing:3px;font-size:13px;color:#9A9AA8;margin-bottom:14px;direction:ltr;text-align:right}</style></head>
<body><div class="c"><div class="s"></div><div class="b"><div class="w">GLITCH Q</div><h1>${escHtml(T[0])}</h1><p>${escHtml(T[1])}</p>
${kind === 'ask' ? `<form method="post" action="${escHtml(action)}"><button type="submit">نعم، ألغِ اشتراكي</button></form>` : `<a class="l" href="${SITE_URL}">العودة إلى المتجر</a>`}</div></div></body></html>`;
}

// GET  → a confirmation page (so a mail scanner that merely opens the link cannot unsubscribe anyone)
// POST → unsubscribes: the page's button, or a mail app's one-click request to the same URL
async function handleUnsubscribe(request, env) {
  const H = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
  const page = (kind, status, action) => new Response(unsubPage(kind, action), { status, headers: H });
  if (request.method !== 'GET' && request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, POST' } });
  if (hit('unsub:' + clientIp(request), 30, 600000)) return page('busy', 429);
  const u = new URL(request.url);
  const id = String(u.searchParams.get('i') || ''), tok = String(u.searchParams.get('t') || '');
  if (!RE_NL_ID.test(id) || !sameStr(tok, await unsubToken(env, id))) return page('bad', 400);
  if (request.method === 'GET') return page('ask', 200, `${u.pathname}?i=${encodeURIComponent(id)}&t=${tok}`);
  const r = await fsCommit(env, [fsWrite(env, `newsletter/${id}`, { delete: true })]);   // deleting a missing document is fine: already unsubscribed
  if (!r.ok) return new Response('Try again', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return page('done', 200);
}

// Owner-only. mode: preview (returns the HTML, sends nothing) · test (one e-mail to the owner) · send (to subscribers, in chunks).
function nlClean(s, max) { return cleanText(s, max).replace(/\{\{|\}\}|\{%|%\}/g, ''); }
function nlBody(s) {
  return String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‎‏‪-‮]/g, '')
    .replace(/\{\{|\}\}|\{%|%\}/g, '').split('\n').map(l => l.replace(/[ \t]+$/g, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, NL.bodyMax);
}
async function sendNewsletterBatch(env, mail, recipients) {
  if (!env.BREVO_API_KEY) return { ok: false, why: 'Email not configured' };
  const versions = recipients.map(r => ({ to: [{ email: r.email }], params: { unsub: r.link } }));
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: { name: 'Glitch Q', email: 'glitchq1q@gmail.com' }, subject: mail.subject,
      htmlContent: buildNewsletterEmail({ ...mail, unsubUrl: '{{params.unsub}}' }), textContent: buildNewsletterText({ ...mail, unsubUrl: '{{params.unsub}}' }),
      messageVersions: versions, tags: ['newsletter'] }),
  });
  if (!res.ok) {
    const eb = await res.json().catch(() => ({}));
    console.error('NL_BREVO_ERROR status=' + res.status + ' body=' + JSON.stringify(eb));
    return { ok: false, why: res.status === 402 || res.status === 429 || /limit|quota|credit/i.test(JSON.stringify(eb)) ? 'Email sending limit reached' : 'Email provider refused the message' };
  }
  return { ok: true };
}
async function handleAdminNewsletter(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  const body = await readJson(request, 16384);
  if (!body) return json({ error: 'Invalid data' }, 400, cors);
  const a = await who(body.idToken, env, cors, false);
  if (a.err) return a.err;
  if (!isAdminClaims(a.claims, env)) return json({ error: 'Forbidden' }, 403, cors);
  const mode = String(body.mode || '');
  if (!['preview', 'test', 'send'].includes(mode)) return json({ error: 'Bad mode' }, 400, cors);

  const mail = { subject: nlClean(body.subject, NL.subjMax), preheader: nlClean(body.preheader, NL.preMax), text: nlBody(body.body), ctaLabel: nlClean(body.ctaLabel, NL.labelMax), ctaUrl: String(body.ctaUrl || '').trim() };
  if (mail.subject.length < 3) return json({ error: 'Subject required' }, 400, cors);
  if (mail.text.length < 10) return json({ error: 'Message is too short' }, 400, cors);
  if (mail.ctaUrl || mail.ctaLabel) {
    if (!mail.ctaLabel || !/^https:\/\/[^\s"'<>\\]{4,500}$/i.test(mail.ctaUrl)) return json({ error: 'The button needs a label and an https link' }, 400, cors);
  }
  if (mode === 'preview') return json({ ok: true, html: buildNewsletterEmail({ ...mail, unsubUrl: '#' }) }, 200, cors);
  if (!unsubSecret(env)) return json({ error: 'Email not configured' }, 503, cors);
  const origin = new URL(request.url).origin;

  if (mode === 'test') {
    if (hit('nltest', 10, 600000)) return json({ error: 'Too many requests' }, 429, cors);
    const to = String(a.claims.email).toLowerCase();
    const id = (await sha256Hex(to)).slice(0, 40);
    const r = await sendNewsletterBatch(env, { ...mail, subject: '[تجربة] ' + mail.subject }, [{ email: to, link: await unsubLink(env, origin, id) }]);
    if (!r.ok) return json({ error: r.why }, 502, cors);
    return json({ ok: true, to: maskEmail(to) }, 200, cors);
  }

  // send: each campaign is identified by the page (a hash of its content). A subscriber who already got THIS campaign is skipped,
  // so the owner can press "send" again the next day to continue after Brevo's daily limit, without anyone receiving it twice.
  if (hit('nlsend', 12, 3600000)) return json({ error: 'Too many requests' }, 429, cors);
  const campaign = String(body.campaign || '');
  if (!/^[A-Za-z0-9]{6,40}$/.test(campaign)) return json({ error: 'Campaign id required' }, 400, cors);
  const max = Math.min(NL.sendCap, Math.max(1, Math.floor(Number(body.max)) || NL.sendDefault));
  const rows = await fsQuery(env, 'newsletter', { limit: 5000 });
  const valid = rows.filter(r => RE_NL_ID.test(r.id) && RE_EMAIL.test(String(r.data.email || '')));
  const todo = valid.filter(r => r.data.lastCampaign !== campaign);
  const pick = todo.slice(0, max);
  let sent = 0;
  for (let i = 0; i < pick.length; i += NL.chunk) {
    const part = pick.slice(i, i + NL.chunk);
    const r = await sendNewsletterBatch(env, mail, await Promise.all(part.map(async x => ({ email: String(x.data.email).toLowerCase(), link: await unsubLink(env, origin, x.id) }))));
    if (!r.ok) return json({ ok: false, error: r.why, sent, remaining: todo.length - sent, total: valid.length }, 502, cors);
    const m = await fsCommit(env, part.map(x => fsWrite(env, `newsletter/${x.id}`, { fields: { lastCampaign: campaign, lastSent: dzDate() }, precondition: { exists: true } })));
    if (!m.ok) console.error('NL_MARK_FAILED');
    sent += part.length;
  }
  return json({ ok: true, sent, remaining: todo.length - sent, already: valid.length - todo.length, total: valid.length }, 200, cors);
}

async function handleRatingCreate(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (hit('rt:' + clientIp(request), 5, 3600000)) return json({ error: 'Too many requests' }, 429, cors);
  const body = await readJson(request, 2048);
  if (!body) return json({ error: 'Invalid data' }, 400, cors);
  const rating = Math.floor(Number(body.rating));
  if (!(rating >= 1 && rating <= 5)) return json({ error: 'Invalid rating' }, 400, cors);
  const a = await who(body.idToken, env, cors, true);
  if (a.err) return a.err;
  const uid = a.claims ? a.claims.sub : 'guest';
  const userName = a.claims ? cleanText(a.claims.name || '', 60) : '';
  await fsCommit(env, [fsWrite(env, `ratings/${randomId(20)}`, {
    fields: { rating, comment: cleanText(body.comment, 300), userId: uid, userName, date: dzDate(), hidden: false },
    transforms: { serverTime: ['ts'] }, precondition: { exists: false },
  })]);
  if (a.claims) await fsCommit(env, [fsWrite(env, `users/${uid}`, { fields: {}, transforms: { inc: { ratings: 1 } }, precondition: { exists: true } })]);
  return json({ ok: true }, 200, cors);
}

async function handleReportCreate(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (hit('rep:' + clientIp(request), 5, 3600000)) return json({ error: 'Too many requests' }, 429, cors);
  const form = await readForm(request, 6 * 1024 * 1024);
  if (!form) return json({ error: 'Invalid or too large request' }, 413, cors);
  let data;
  try { data = JSON.parse(String(form.get('data') || '')); } catch { return json({ error: 'Invalid data' }, 400, cors); }
  const title = cleanText(data && data.title, 100), category = cleanText(data && data.category, 40);
  const desc = cleanText(data && data.desc, 1000), orderId = cleanText(data && data.orderId, 50);
  if (!title || !category || desc.length < 20) return json({ error: 'Incomplete report' }, 400, cors);
  const a = await who(String(form.get('idToken') || ''), env, cors, true);
  if (a.err) return a.err;
  const uid = a.claims ? a.claims.sub : 'guest';
  const userName = a.claims ? cleanText(a.claims.name || '', 60) : '';
  let photo = null;
  const f = form.get('photo');
  if (f && typeof f !== 'string') { const img = await readImage(f); if (!img.err) photo = img.blob; }
  await fsCommit(env, [fsWrite(env, `reports/${randomId(20)}`, {
    fields: { title, category, desc, orderId, userId: uid, userName, status: 'open', date: dzDate() },
    transforms: { serverTime: ['ts'] }, precondition: { exists: false },
  })]);
  await tgSend(env, `🚨 New Report!\n👤 ${userName || 'Guest'}\n🔑 ${uid}\n📌 ${title}\n📂 ${category}\n📝 ${desc.slice(0, 300)}\n🆔 ${orderId || '—'}`, photo);
  return json({ ok: true }, 200, cors);
}

/* ═══════════════════════════════════════
   POINTS & REWARDS — decided by the server only
═══════════════════════════════════════ */
// Free points (daily check-in, wheel) are small on purpose AND locked: they can only be redeemed
// up to the customer's reward pool, which is filled exclusively from profit on delivered orders.
const STREAK_BONUS = [1, 1, 1, 2, 2, 2, 3];
// order and weights must match SPIN_SEGMENTS in script.js
const SPIN_SEGMENTS = [
  { pts: 1, prob: 35 }, { pts: 2, prob: 30 }, { pts: 3, prob: 20 }, { pts: 5, prob: 10 },
  { pts: 8, prob: 4 }, { pts: 15, prob: 1 }, { pts: 0, prob: 0 },
];

/* ───── Profit-funded rewards ─────
   settings/economics (owner-only document) holds the cost prices and the reward rules; it is never sent to browsers.
   users/{uid}.rewardPool (DZD) grows ONLY when the owner delivers an order (admin.js: share of that order's profit)
   and shrinks when a reward is redeemed. A reward can be redeemed only if BOTH the point balance and the pool cover it,
   so what a customer has cost the store in free cards can never exceed what the store earned from that customer.
   Keep ECON_DEFAULTS / normEcon identical to econ.js (worker.test.mjs checks that they agree). */
const ECON_DEFAULTS = {
  marginPct: 5, earnPct: 40, refPct: 40, refMaxPts: 80, refMinOrderDZD: 2000, ptDZD: 10,
  rewards: [
    { id: 'r5', name: 'بطاقة PS Store 5€', nameEn: 'PS Store 5€ card', priceDZD: 1600 },
    { id: 'r15', name: 'بطاقة PS Store 15€', nameEn: 'PS Store 15€ card', priceDZD: 4500 },
    { id: 'r20', name: 'بطاقة PS Store 20€', nameEn: 'PS Store 20€ card', priceDZD: 6200 },
    { id: 'r50', name: 'بطاقة PS Store 50€', nameEn: 'PS Store 50€ card', priceDZD: 14900 },
  ],
};
function econNum(v, def, min, max) { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; }
function normEcon(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const D = ECON_DEFAULTS;
  const e = {
    marginPct: econNum(r.marginPct, D.marginPct, 0, 60),
    earnPct: Math.floor(econNum(r.earnPct, D.earnPct, 0, 70)),
    refPct: Math.floor(econNum(r.refPct, D.refPct, 0, 70)),
    refMaxPts: Math.floor(econNum(r.refMaxPts, D.refMaxPts, 0, 5000)),
    refMinOrderDZD: Math.floor(econNum(r.refMinOrderDZD, D.refMinOrderDZD, 0, 1e6)),
    ptDZD: Math.floor(econNum(r.ptDZD, D.ptDZD, 1, 1000)),
  };
  if (e.earnPct + e.refPct > 90) e.refPct = Math.max(0, 90 - e.earnPct);            // the store always keeps at least 10% of the profit
  const list = Array.isArray(r.rewards) ? r.rewards : D.rewards;
  e.rewards = [];
  const seen = new Set();
  for (const x of list.slice(0, 12)) {
    const id = cleanText(x && x.id, 20), price = Math.floor(Number(x && x.priceDZD));
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(id) || seen.has(id) || !(price >= 1 && price <= 1e6)) continue;
    seen.add(id);
    e.rewards.push({ id, name: cleanText(x.name, 80) || id, nameEn: cleanText(x.nameEn, 80) || cleanText(x.name, 80) || id, priceDZD: price });
  }
  return e;
}
async function loadEcon(env) {
  try { const d = await fsGet(env, 'settings/economics'); return normEcon(d.exists ? d.data : null); }
  catch { return normEcon(null); }
}
const rewardPts = (rw, e) => Math.ceil(rw.priceDZD / e.ptDZD);
function redeemablePts(u, e) {
  const pts = Math.max(0, Math.floor(Number(u.points) || 0)), pool = Math.max(0, Number(u.rewardPool) || 0);
  return Math.min(pts, Math.floor(pool / e.ptDZD));
}

// common gate for the /account/* routes: POST + verified + email verified + not banned
async function account(request, env, cors, { maxBody = 2048 } = {}) {
  if (request.method !== 'POST') return { err: json({ error: 'Method not allowed' }, 405, cors) };
  const body = await readJson(request, maxBody);
  if (!body) return { err: json({ error: 'Invalid data' }, 400, cors) };
  const a = await who(body.idToken, env, cors, false);
  if (a.err) return a;
  if (a.claims.email_verified !== true) return { err: json({ error: 'Unauthorized' }, 401, cors) };
  if (hit('acc:' + a.claims.sub, 30, 60000)) return { err: json({ error: 'Too many requests' }, 429, cors) };
  if (await isBanned(env, a.claims.sub)) return { err: json({ error: 'Account suspended' }, 403, cors) };
  return { claims: a.claims, body, uid: a.claims.sub };
}

// lastLogin is stored as YYYY-MM-DD (Algeria). Older accounts hold the browser's toDateString() form, so read both.
function normDay(v) {
  v = String(v || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = Date.parse(v + ' 00:00:00 GMT');
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}

async function handleStreak(request, env, cors) {
  const g = await account(request, env, cors); if (g.err) return g.err;
  const today = dzDay(), yesterday = dzDay(-1);
  const res = await fsUpdate(env, `users/${g.uid}`, cur => {
    if (!cur.exists) return { abort: 'nouser' };
    const last = normDay(cur.data.lastLogin);
    if (last === today) return { abort: 'done' };
    const streak = last === yesterday ? (Number(cur.data.streak) || 0) + 1 : 1;
    const bonus = STREAK_BONUS[Math.min(streak - 1, STREAK_BONUS.length - 1)];
    return { fields: { streak, lastLogin: today }, transforms: { inc: { points: bonus } }, _bonus: bonus, _streak: streak };
  });
  if (res.aborted) return json({ ok: false, reason: res.abort }, res.abort === 'done' ? 200 : 404, cors);
  if (!res.ok) return json({ error: 'Please try again' }, 503, cors);
  return json({ ok: true, bonus: res.out._bonus, streak: res.out._streak, lastLogin: today, points: (Number(res.cur.data.points) || 0) + res.out._bonus }, 200, cors);
}

async function handleSpin(request, env, cors) {
  const g = await account(request, env, cors); if (g.err) return g.err;
  const now = Date.now();
  const total = SPIN_SEGMENTS.reduce((s, p) => s + p.prob, 0);
  let r = randomInt(total * 100) / 100, idx = 0;
  for (let i = 0; i < SPIN_SEGMENTS.length; i++) { r -= SPIN_SEGMENTS[i].prob; if (r < 0) { idx = i; break; } }
  const prize = SPIN_SEGMENTS[idx];
  const res = await fsUpdate(env, `users/${g.uid}`, cur => {
    if (!cur.exists) return { abort: 'nouser' };
    const last = Number(cur.data.lastSpinAt) || 0;
    if (now - last < 86400000) return { abort: { reason: 'wait', remainingMs: 86400000 - (now - last) } };
    return { fields: { lastSpinAt: now }, transforms: { inc: { spins: 1, ...(prize.pts > 0 ? { points: prize.pts } : {}) } } };
  });
  if (res.aborted) {
    const ab = res.abort;
    if (ab && ab.reason === 'wait') return json({ ok: false, reason: 'wait', remainingMs: ab.remainingMs }, 200, cors);
    return json({ ok: false, reason: 'nouser' }, 404, cors);
  }
  if (!res.ok) return json({ error: 'Please try again' }, 503, cors);
  return json({ ok: true, index: idx, pts: prize.pts, points: (Number(res.cur.data.points) || 0) + prize.pts, spins: (Number(res.cur.data.spins) || 0) + 1 }, 200, cors);
}

// What the customer may redeem right now. Nothing here reveals cost prices or margins.
async function handleRewards(request, env, cors) {
  const g = await account(request, env, cors); if (g.err) return g.err;
  const [e, u] = await Promise.all([loadEcon(env), fsGet(env, `users/${g.uid}`)]);
  if (!u.exists) return json({ ok: false, reason: 'nouser' }, 404, cors);
  const points = Math.max(0, Math.floor(Number(u.data.points) || 0)), red = redeemablePts(u.data, e);
  return json({
    ok: true, points, redeemablePts: red, lockedPts: points - red, ptDZD: e.ptDZD, refMaxPts: e.refMaxPts, refMinOrderDZD: e.refMinOrderDZD,
    rewards: e.rewards.map(r => ({ id: r.id, name: r.name, nameEn: r.nameEn, pts: rewardPts(r, e) })),
  }, 200, cors);
}

async function handleRedeem(request, env, cors) {
  const g = await account(request, env, cors); if (g.err) return g.err;
  const e = await loadEcon(env);
  const rw = e.rewards.find(r => r.id === cleanText(g.body.id, 20));
  if (!rw) return json({ error: 'Unknown reward' }, 400, cors);
  const need = rewardPts(rw, e), worth = need * e.ptDZD;
  const res = await fsUpdate(env, `users/${g.uid}`, cur => {
    if (!cur.exists) return { abort: 'nouser' };
    if (Math.floor(Number(cur.data.points) || 0) < need) return { abort: 'points' };
    if ((Number(cur.data.rewardPool) || 0) < worth) return { abort: 'locked' };            // enough points, but the store has not earned enough from this customer yet
    const notif = { title: `🎁 ${rw.name}`, code: 'سيتم إرسال المكافأة لك خلال 24 ساعة.', date: dzDate(), read: false };
    return { fields: {}, transforms: { inc: { points: -need, rewardPool: -worth, redeemed: 1 }, arrayUnion: { notifications: [notif] } } };
  });
  if (res.aborted) return json({ ok: false, reason: res.abort }, 200, cors);
  if (!res.ok) return json({ error: 'Please try again' }, 503, cors);
  const left = { points: Math.floor(Number(res.cur.data.points) || 0) - need, rewardPool: (Number(res.cur.data.rewardPool) || 0) - worth };
  // a claim for the owner to fulfil (owner-only collection); a failed write is not fatal because the Telegram message below carries the same facts
  const cid = randomId(20);
  await fsCommit(env, [fsWrite(env, `reward_claims/${cid}`, { fields: { userId: g.uid, name: cleanText(g.claims.name || '', 60), email: cleanText(g.claims.email || '', 120), rewardId: rw.id, reward: rw.name, pts: need, worthDZD: worth, status: 'pending', date: new Date().toISOString() }, precondition: { exists: false } })]);
  await tgSend(env, `🏆 Reward Claimed!\n👤 ${cleanText(g.claims.name || '', 60)}\n🔑 ${g.uid}\n🎁 ${rw.name}\n📊 Points: ${need} (≈ ${worth.toLocaleString('en-US')} دج)\n🆔 claim ${cid}`);
  return json({ ok: true, points: left.points, redeemablePts: Math.min(left.points, Math.floor(left.rewardPool / e.ptDZD)) }, 200, cors);
}

// Records who invited this account. The inviter is rewarded later, when the invited
// customer's first order is completed by the store (see admin.html) — never at sign-up.
async function handleReferral(request, env, cors) {
  const g = await account(request, env, cors); if (g.err) return g.err;
  const ref = cleanText(g.body.ref, 12);
  if (!/^[A-Za-z0-9]{6,12}$/.test(ref) || ref === g.uid.slice(0, 12)) return json({ ok: false }, 200, cors);
  const rows = await fsQuery(env, 'users', { filters: [['uid_short', 'EQUAL', ref]], limit: 1 });
  if (!rows.length || rows[0].id === g.uid) return json({ ok: false }, 200, cors);
  const refUid = rows[0].id;
  const res = await fsUpdate(env, `users/${g.uid}`, cur => {
    if (!cur.exists) return { abort: 'nouser' };
    if (cur.data.referredBy) return { abort: 'already' };
    return { fields: { referredBy: refUid } };
  });
  if (res.aborted) return json({ ok: false, reason: res.abort }, 200, cors);
  if (!res.ok) return json({ error: 'Please try again' }, 503, cors);
  return json({ ok: true }, 200, cors);
}

// Multi-account heuristic: flags many accounts sharing one device fingerprint (for the owner to review).
async function handleFingerprint(request, env, cors) {
  const g = await account(request, env, cors); if (g.err) return g.err;
  const fp = cleanText(g.body.fp, 16);
  if (!/^[a-f0-9]{16}$/.test(fp)) return json({ ok: false }, 200, cors);
  if (hit('fp:' + g.uid, 2, 3600000)) return json({ ok: true }, 200, cors);
  await fsCommit(env, [fsWrite(env, `users/${g.uid}`, { fields: { fingerprint: fp }, precondition: { exists: true } })]);
  const rows = await fsQuery(env, 'users', { filters: [['fingerprint', 'EQUAL', fp]], limit: 10 });
  const others = rows.map(r => r.id).filter(id => id !== g.uid);
  if (rows.length > 2 && others.length >= 2) {
    await fsCommit(env, [fsWrite(env, `abuse_flags/${randomId(20)}`, {
      fields: { userId: g.uid, fingerprint: fp, suspectedAlts: others.slice(0, 5), date: new Date().toISOString(), reason: 'multiple_accounts' },
      precondition: { exists: false },
    })]);
    await tgSend(env, `⚠️ Multi-account!\n🔑 ${g.uid}\n🖥️ ${fp}\n👥 ${others.slice(0, 3).join(', ')}`);
  }
  return json({ ok: true }, 200, cors);
}

// "Talk to a human" button: tells the owner someone asked for help (text is built here, never taken from the browser).
async function handleSupportPing(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (hit('sup:' + clientIp(request), 3, 600000)) return json({ ok: true }, 200, cors);
  const body = await readJson(request, 2048);
  const a = await who(body && body.idToken, env, cors, true);
  if (a.err) return a.err;
  const uid = a.claims ? a.claims.sub : 'guest';
  const name = a.claims ? cleanText(a.claims.name || '', 60) : 'Guest';
  await tgSend(env, `🆘 Support Request!\n👤 ${name}\n🔑 ${uid}\n⏰ ${new Date().toISOString()}`);
  return json({ ok: true }, 200, cors);
}

async function handleAdminNotify(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  const body = await readJson(request, 4096);
  if (!body) return json({ error: 'Invalid data' }, 400, cors);
  const a = await who(body.idToken, env, cors, false);
  if (a.err) return a.err;
  if (!isAdminClaims(a.claims, env)) return json({ error: 'Forbidden' }, 403, cors);
  const ok = await tgSend(env, cleanText(body.text, 1500));
  return json({ ok }, ok ? 200 : 502, cors);
}

/* ═══════════════════════════════════════
   E-MAIL A DELIVERED CODE TO THE CUSTOMER (store owner only)
   The recipient comes from the stored order / profile, never from the browser,
   unless the owner is sending a one-off code with no order or customer attached.
═══════════════════════════════════════ */
const RE_UID = /^[A-Za-z0-9_-]{1,128}$/;
function maskEmail(e) {
  const [u, d] = String(e).split('@');
  return (u.length <= 2 ? u[0] + '*' : u.slice(0, 2) + '***') + '@' + d;
}
async function sendBrevo(env, { to, subject, html, text }) {
  if (!env.BREVO_API_KEY) return { ok: false, why: 'Email not configured' };
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: { name: 'Glitch Q', email: 'glitchq1q@gmail.com' }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
  });
  if (!res.ok) {
    const eb = await res.json().catch(() => ({}));
    console.error('CODE_BREVO_ERROR status=' + res.status + ' body=' + JSON.stringify(eb));
    return { ok: false, why: 'Email provider refused the message' };
  }
  return { ok: true };
}
async function handleAdminSendCode(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  const body = await readJson(request, 4096);
  if (!body) return json({ error: 'Invalid data' }, 400, cors);
  const a = await who(body.idToken, env, cors, false);
  if (a.err) return a.err;
  if (!isAdminClaims(a.claims, env)) return json({ error: 'Forbidden' }, 403, cors);
  if (hit('sendcode', 60, 600000)) return json({ error: 'Too many requests' }, 429, cors);

  const code = cleanText(body.code, 300);
  if (!code) return json({ error: 'Code required' }, 400, cors);
  let product = cleanText(body.product, 200);
  const orderId = RE_UID.test(String(body.orderId || '')) ? String(body.orderId) : '';
  const userId = RE_UID.test(String(body.userId || '')) ? String(body.userId) : '';
  const okMail = v => RE_EMAIL.test(String(v || '').trim().toLowerCase()) ? String(v).trim().toLowerCase() : '';

  let to = '';
  let until = '';
  if (orderId) {
    const o = await fsGet(env, `orders/${orderId}`);
    if (!o.exists) return json({ error: 'Order not found' }, 404, cors);
    const d = o.data;
    until = String(d.codeValidUntil || '');   /* set when the order was delivered, so a re-send never extends the deadline */
    product = product || cleanText(d.product, 200);
    if (d.receiveMethod === 'email') to = okMail(d.receiveContact);
    if (!to) to = okMail(d.accountEmail);
    if (!to && RE_UID.test(String(d.userId || '')) && d.userId !== 'guest') {
      const u = await fsGet(env, `users/${d.userId}`);
      if (u.exists) to = okMail(u.data.email);
    }
  } else if (userId) {
    const u = await fsGet(env, `users/${userId}`);
    if (u.exists) to = okMail(u.data.email);
  } else {
    to = okMail(body.to);
  }
  if (!to) return json({ error: 'No email address for this customer' }, 422, cors);

  const sent = await sendBrevo(env, {
    to,
    subject: 'طلبك جاهز — الكود الخاص بك | Glitch Q',
    html: buildCodeEmail({ product, code, orderId, validity: codeValidity(until) }),
    text: buildCodeText({ product, code, orderId, validity: codeValidity(until) }),
  });
  if (!sent.ok) return json({ error: sent.why }, 502, cors);
  return json({ ok: true, to: maskEmail(to) }, 200, cors);
}
/* ═══════════════════════════════════════
   PASSWORD RESET — Firebase link + Brevo email
═══════════════════════════════════════ */
// Rate limit for reset: 1 request per email per 5 minutes
const resetStore = new Map();

async function handleResetPassword(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400, cors); }

  const email = (body.email || '').trim().toLowerCase().slice(0, 254);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Invalid email' }, 400, cors);
  }
  // per-IP cap so the endpoint cannot be used to flood someone's inbox or burn the mail quota
  if (hit('rst:' + clientIp(request), 5, 600000)) return json({ ok: true }, 200, cors);

  // Rate limit: 1 reset per email per 2 minutes
  const resetKey = `reset_${email}`;
  const now = Date.now();
  const lastReset = resetStore.get(resetKey);
  if (lastReset && now - lastReset < 2 * 60 * 1000) {
    return json({ ok: true }, 200, cors);
  }
  resetStore.set(resetKey, now);

  // Generate Firebase password reset link via Admin API
  let resetLink;
  try {
    const adminToken = await getAdminToken(env);
    if (!adminToken) return json({ ok: true }, 200, cors);

    const fbRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/glitch-q/accounts:sendOobCode`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
          'X-Firebase-Client': 'fire-admin-node/12.0.0',
          'X-Goog-User-Project': 'glitch-q',
        },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email,
          returnOobLink: true,
        }),
      }
    );
    const fbData = await fbRes.json();
    console.log('OOB_RESPONSE status=' + fbRes.status + ' keys=' + Object.keys(fbData).join(',') + ' hasLink=' + !!fbData.oobLink);
    if (!fbRes.ok || !fbData.oobLink) {
      console.error('OOB_ERROR status=' + fbRes.status + ' body=' + JSON.stringify(fbData));
      return json({ ok: true }, 200, cors);
    }

    // Extract oobCode and point to our reset page on Firebase Hosting
    const fbUrl = new URL(fbData.oobLink);
    const oobCode = fbUrl.searchParams.get('oobCode');
    if (!oobCode) return json({ ok: true }, 200, cors);

    resetLink = `${MAIL_SITE}reset.html?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`;
  } catch (e) {
    console.error('Firebase reset error:', e.message);
    return json({ ok: true }, 200, cors);
  }

  // Build branded email (HTML + plain-text alternative)
  const emailHtml = buildResetEmail(resetLink);
  const emailText = buildResetText(resetLink);

  // Send via Brevo (Sendinblue) Transactional Email API
  try {
    const brevoKey = env.BREVO_API_KEY;
    if (!brevoKey) throw new Error('BREVO_API_KEY not set');
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Glitch Q', email: 'glitchq1q@gmail.com' },
        to: [{ email }],
        subject: 'إعادة تعيين كلمة المرور | Glitch Q',
        htmlContent: emailHtml,
        textContent: emailText,
      }),
    });
    const brevoBody = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('BREVO_ERROR status=' + res.status + ' body=' + JSON.stringify(brevoBody));
    } else {
      console.log('BREVO_OK messageId=' + (brevoBody.messageId || 'unknown'));
    }
  } catch (e) {
    console.error('Brevo send error:', e.message);
  }

  return json({ ok: true }, 200, cors);
}

/* ═══════════════════════════════════════
   ACCOUNT SECURITY — every call proves who it is with the caller's Firebase ID token.
   The token is verified here (signature, issuer, audience, expiry) against Google's
   public keys; the uid always comes from the verified token, never from the request body.
═══════════════════════════════════════ */
let _jwks = null;
let _jwksExp = 0;
let _jwksAt = 0;

async function getJwks(force = false) {
  if (!force && _jwks && Date.now() < _jwksExp) return _jwks;
  _jwksAt = Date.now();
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!r.ok) throw new Error('jwks status ' + r.status);
  const d = await r.json();
  _jwks = Array.isArray(d.keys) ? d.keys : [];
  const m = /max-age=(\d+)/.exec(r.headers.get('Cache-Control') || '');
  _jwksExp = Date.now() + Math.min(m ? parseInt(m[1], 10) * 1000 : 3600000, 6 * 3600 * 1000);
  return _jwks;
}

function b64urlToBytes(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

// Returns the verified claims, or null when the token is not valid. Throws only if Google's keys cannot be fetched.
async function verifyIdToken(idToken, projectId) {
  if (typeof idToken !== 'string' || idToken.length > 4096) return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  } catch { return null; }
  if (!header || header.alg !== 'RS256' || !header.kid) return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) return null;
  if (payload.iss !== 'https://securetoken.google.com/' + projectId) return null;
  if (typeof payload.sub !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(payload.sub)) return null;   // used in database paths: letters, digits, _ and - only
  if (!(payload.exp > now)) return null;
  if (!(payload.iat <= now + 300)) return null;
  let jwk = (await getJwks()).find(k => k.kid === header.kid);
  // Google rotates its signing keys: an unknown key id triggers ONE refresh (at most every 5 minutes)
  if (!jwk && Date.now() - _jwksAt > 300000) jwk = (await getJwks(true)).find(k => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1])
  );
  return ok ? payload : null;
}

async function authenticate(request, env, cors) {
  if (request.method !== 'POST') return { err: json({ error: 'Method not allowed' }, 405, cors) };
  let body;
  try { body = await request.json(); }
  catch { return { err: json({ error: 'Invalid JSON' }, 400, cors) }; }
  let claims;
  try { claims = await verifyIdToken(body && body.idToken, env.FIREBASE_PROJECT_ID || 'glitch-q'); }
  catch (e) { console.error('VERIFY_UNAVAILABLE ' + e.message); return { err: json({ error: 'Verification unavailable' }, 503, cors) }; }
  if (!claims) return { err: json({ error: 'Unauthorized' }, 401, cors) };
  return { claims, body };
}

// small per-uid throttle (in-memory, best effort per Worker instance)
const acctStore = new Map();
function throttled(key, ms) {
  const now = Date.now();
  const last = acctStore.get(key);
  if (last && now - last < ms) return true;
  acctStore.set(key, now);
  if (acctStore.size > 5000) { for (const [k, t] of acctStore) if (now - t > 3600000) acctStore.delete(k); }
  return false;
}

/* Sign out of every device: revoke the account's refresh tokens (Firebase "validSince").
   Other devices lose access when their short-lived ID token (≤ 1 hour) next refreshes. */
async function handleRevokeSessions(request, env, cors) {
  const a = await authenticate(request, env, cors);
  if (a.err) return a.err;
  const uid = a.claims.sub;
  if (throttled('revoke_' + uid, 30000)) return json({ error: 'Too many requests' }, 429, cors);

  const PROJECT_ID = env.FIREBASE_PROJECT_ID || 'glitch-q';
  const adminToken = await getAdminToken(env);
  if (!adminToken) return json({ error: 'Server not ready' }, 500, cors);

  const init = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
      'X-Goog-User-Project': PROJECT_ID,
    },
    body: JSON.stringify({ localId: uid, validSince: String(Math.floor(Date.now() / 1000)) }),
  };
  let res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, init);
  if (res.status === 404) res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:update', init);
  if (!res.ok) {
    const eb = await res.json().catch(() => ({}));
    console.error('REVOKE_ERROR status=' + res.status + ' body=' + JSON.stringify(eb));
    return json({ error: 'Failed' }, 502, cors);
  }
  console.log('REVOKE_OK uid=' + uid.slice(0, 8));
  return json({ ok: true }, 200, cors);
}

/* New-device login alert. Sent only when the account owner switched it on (read from their
   profile here on the server) and only to the verified email address of the token. */
async function handleLoginAlert(request, env, cors) {
  const a = await authenticate(request, env, cors);
  if (a.err) return a.err;
  const { claims } = a;
  const uid = claims.sub;
  const email = String(claims.email || '').toLowerCase();
  if (!email || claims.email_verified !== true) return json({ ok: true, sent: false }, 200, cors);
  if (throttled('alert_' + uid, 5 * 60 * 1000)) return json({ ok: true, sent: false }, 200, cors);

  const PROJECT_ID = env.FIREBASE_PROJECT_ID || 'glitch-q';
  const fsToken = await getFirebaseToken(env);
  if (!fsToken) return json({ error: 'Server not ready' }, 500, cors);
  const docRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
    { headers: { 'Authorization': `Bearer ${fsToken}` } }
  );
  if (!docRes.ok) return json({ error: 'Profile unavailable' }, 502, cors);
  const doc = await docRes.json().catch(() => ({}));
  const enabled = doc?.fields?.prefs?.mapValue?.fields?.loginAlerts?.booleanValue === true;
  if (!enabled) return json({ ok: true, sent: false }, 200, cors);

  const brevoKey = env.BREVO_API_KEY;
  if (!brevoKey) return json({ error: 'Email not configured' }, 500, cors);

  const cf = request.cf || {};
  const device = describeUA(request.headers.get('User-Agent'));
  const place = [cf.city, cf.country].filter(Boolean).join('، ') || 'غير معروف';
  let when;
  try { when = new Date().toLocaleString('ar-DZ', { timeZone: 'Africa/Algiers', dateStyle: 'medium', timeStyle: 'short' }) + ' (توقيت الجزائر)'; }
  catch { when = new Date().toISOString(); }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Glitch Q', email: 'glitchq1q@gmail.com' },
      to: [{ email }],
      subject: 'تنبيه أمني: تسجيل دخول جديد إلى حسابك | Glitch Q',
      htmlContent: buildLoginAlertEmail({ device, place, when }),
      textContent: buildLoginAlertText({ device, place, when }),
    }),
  });
  if (!res.ok) {
    const eb = await res.json().catch(() => ({}));
    console.error('ALERT_BREVO_ERROR status=' + res.status + ' body=' + JSON.stringify(eb));
    return json({ error: 'Email failed' }, 502, cors);
  }
  return json({ ok: true, sent: true }, 200, cors);
}

function describeUA(ua) {
  ua = String(ua || '');
  const os = /Windows/i.test(ua) ? 'Windows' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'جهاز غير معروف';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'متصفح';
  return `${br} على ${os}`;
}

/* ═══════════════════════════════════════
   MAINTENANCE + TICKER (public settings, cached briefly)
═══════════════════════════════════════ */
const _pub = {};
async function publicSetting(env, doc) {
  const c = _pub[doc];
  if (c && Date.now() < c.exp) return c.data;
  const d = await fsGet(env, 'settings/' + doc);
  _pub[doc] = { data: d.data || {}, exp: Date.now() + 15000 };
  return _pub[doc].data;
}
async function handleMaintenance(request, env, cors) {
  try { return json({ maintenance: (await publicSetting(env, 'maintenance')).active === true }, 200, cors); }
  catch { return json({ maintenance: false }, 200, cors); }
}
async function handleTicker(request, env, cors) {
  try { return json({ text: cleanText((await publicSetting(env, 'ticker')).text, 500) }, 200, cors); }
  catch { return json({ text: '' }, 200, cors); }
}

/* ═══════════════════════════════════════
   FIREBASE ADMIN TOKEN (for Auth API)
═══════════════════════════════════════ */
let _cachedAdminToken = null;
let _adminTokenExpiry = 0;

async function getAdminToken(env) {
  if (_cachedAdminToken && Date.now() < _adminTokenExpiry) {
    return _cachedAdminToken;
  }
  try {
    const SA = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
      iss: SA.client_email,
      sub: SA.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform',
    }));
    const sigInput = `${header}.${payload}`;
    const privateKey = await importKey(SA.private_key);
    const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, new TextEncoder().encode(sigInput));
    const jwt = `${sigInput}.${b64url(sig)}`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    const tokenData = await tokenRes.json();
    if (tokenData.access_token) {
      _cachedAdminToken = tokenData.access_token;
      _adminTokenExpiry = Date.now() + (3500 * 1000);
      return _cachedAdminToken;
    }
    return null;
  } catch (e) {
    console.error('Admin token error:', e.message);
    return null;
  }
}

/* ═══════════════════════════════════════
   FIREBASE AUTH (Service Account JWT)
═══════════════════════════════════════ */
let _cachedToken = null;
let _tokenExpiry = 0;

async function getFirebaseToken(env) {
  if (_cachedToken && Date.now() < _tokenExpiry) {
    return _cachedToken;
  }

  try {
    const SA = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const now = Math.floor(Date.now() / 1000);

    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
      iss: SA.client_email,
      sub: SA.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/datastore',
    }));

    const sigInput = `${header}.${payload}`;
    const privateKey = await importKey(SA.private_key);
    const sig = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      privateKey,
      new TextEncoder().encode(sigInput)
    );

    const jwt = `${sigInput}.${b64url(sig)}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });

    const tokenData = await tokenRes.json();

    if (tokenData.access_token) {
      _cachedToken = tokenData.access_token;
      _tokenExpiry = Date.now() + (3500 * 1000);
      return _cachedToken;
    }

    return null;
  } catch (e) {
    console.error('Token error:', e.message);
    return null;
  }
}

async function importKey(pem) {
  const pemBody = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8', der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

function b64url(input) {
  const str = input instanceof ArrayBuffer
    ? String.fromCharCode(...new Uint8Array(input))
    : (typeof input === 'string' ? input : JSON.stringify(input));
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

/* ═══════════════════════════════════════
   EMAIL TEMPLATES — one shell, three letters.
   Light by default, real dark mode through prefers-color-scheme
   (Apple Mail, iOS Mail, Outlook apps, Thunderbird). Gmail applies its own inversion,
   which is why every surface here sets an explicit background and the header/ticket are
   already dark. Tables + inline styles only; no remote images (blocked by default in
   most clients), no emoji icons, no text on gradients.
   Rule: every value that comes from a user, an order or a request goes through escHtml
   before it reaches a template helper; helpers take TRUSTED html.
═══════════════════════════════════════ */
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Code validity (store policy): a delivered code is valid from the day it is delivered until the LAST DAY of
   that calendar month, Algeria time (UTC+1, no daylight saving). Delivered in November → valid to 30 November;
   delivered in January → to 31 January; from the 1st of the next month it counts as expired.
   admin.js has the same arithmetic for the in-site notification (parity is checked in worker.test.mjs). */
const DZ_MONTHS = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
function algNow(ms) { const d = new Date(ms + 3600000); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; }
function monthEndISO(ms = Date.now()) {
  const t = algNow(ms);
  const last = new Date(Date.UTC(t.y, t.m + 1, 0)).getUTCDate();
  return `${t.y}-${String(t.m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}
// `untilISO` is the date stored on the order when it was delivered (so a re-send never extends it); without it, this month's end.
function codeValidity(untilISO, ms = Date.now()) {
  let iso = String(untilISO || '');
  const ok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!ok || +ok[2] < 1 || +ok[2] > 12 || +ok[3] < 28 || +ok[3] > 31) iso = monthEndISO(ms);
  const [y, m, d] = iso.split('-').map(Number);
  const t = algNow(ms);
  const daysLeft = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(t.y, t.m, t.d)) / 86400000);
  return { iso, year: y, monthName: DZ_MONTHS[m - 1], lastDay: d, daysLeft };
}
function arDays(n) { return n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? `${n} أيام` : `${n} يوماً`; }

const MAIL_SITE = 'https://glitchqq.github.io/glitch-q/';
// The only image in any mail: a banner with an OPAQUE dark plate and the GLITCH Q lockup baked in (assets/logo/build-icons.py),
// so the logo stays readable whatever a mail app does to the cell colours behind it. Alt text covers blocked images.
const MAIL_HEADER = MAIL_SITE + 'assets/logo/mail-header.png';
const MAIL_FONT = "-apple-system,'Segoe UI',Tahoma,'Noto Sans Arabic',Arial,sans-serif";
const MAIL_MONO = "'SF Mono',Consolas,Menlo,'Courier New',monospace";

/* The letters are DARK-NATIVE — the storefront's crimson/black — so mail apps that force a dark mode (Gmail, Outlook.com…)
   have nothing to invert, and light-mode readers still get the store's look.
   Reading order: Gmail and some other apps DROP `dir` from <html>/<body>, which scrambles Arabic sentences that contain
   Latin words. So every block carries its own dir="rtl" + direction:rtl, and Latin words sit in an isolated span. */
const MC = { page: '#050507', plate: '#0A0A0E', card: '#0F0F14', box: '#16161D', line: '#24242E', line2: '#34343F', h: '#F4F4F7', p: '#C9C9D6', dim: '#9A9AA8' };
const MAIL_TONE = {
  crimson: { bar: '#F5223F', btn: '#D4062A', btnText: '#FFFFFF', ink: '#FF8A98', tint: '#240A10', line: '#5A1623' },
  mint:    { bar: '#28C88A', btn: '#28C88A', btnText: '#04140D', ink: '#4BE0A5', tint: '#0C221A', line: '#1B4A39' },
  gold:    { bar: '#F4B63E', btn: '#F4B63E', btnText: '#1A1300', ink: '#F4B63E', tint: '#241B09', line: '#5A4518' },
  red:     { ink: '#FF8A96', tint: '#2A1015', line: '#5A2230' },
};

// ── small building blocks (all take trusted html) ────────────────────────
const MB = `font-family:${MAIL_FONT};direction:rtl;text-align:right;`;            // every text block starts from this
const lat = (s) => `<span dir="ltr" style="unicode-bidi:isolate;">${s}</span>`;     // a Latin word inside Arabic text
const mGap = (h) => `<div style="height:${h}px;line-height:${h}px;font-size:1px;">&nbsp;</div>`;
const mH1 = (s) => `<h1 dir="rtl" class="h1" style="margin:0 0 12px;${MB}font-size:26px;line-height:1.45;font-weight:800;color:${MC.h};">${s}</h1>`;
const mP = (s, style = '') => `<p dir="rtl" style="margin:0 0 18px;${MB}font-size:15px;line-height:1.95;color:${MC.p};${style}">${s}</p>`;
const mSmall = (s) => `<p dir="rtl" style="margin:0 0 8px;${MB}font-size:12.5px;line-height:1.8;color:${MC.dim};">${s}</p>`;
const mHr = () => `<div style="height:1px;line-height:1px;font-size:1px;background-color:${MC.line};">&nbsp;</div>`;
const mEyebrow = (label, t) => `<p dir="rtl" style="margin:0 0 14px;${MB}font-size:13px;line-height:1.6;font-weight:700;color:${t.ink};"><span style="color:${t.bar};">&#9679;</span>&nbsp; ${escHtml(label)}</p>`;
const mBox = (inner, pad = '16px 18px') => `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td dir="rtl" bgcolor="${MC.box}" style="background-color:${MC.box};border:1px solid ${MC.line};border-radius:12px;padding:${pad};${MB}">${inner}</td></tr></table>`;
const mTintBox = (t, inner) => `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td dir="rtl" bgcolor="${t.tint}" style="background-color:${t.tint};border:1px solid ${t.line};border-radius:12px;padding:16px 18px;${MB}">${inner}</td></tr></table>`;
const mNote = (t, html) => mTintBox(t, `<div dir="rtl" style="${MB}font-size:14px;line-height:1.9;color:${t.ink};">${html}</div>`);

// The gradient layer keeps Gmail's dark-mode colour shifting from turning the button salmon (it leaves background-images alone).
function mButton(href, label, t) {
  const bg = `background-color:${t.btn};background-image:linear-gradient(${t.btn},${t.btn});`;
  return `<table role="presentation" dir="rtl" class="btn-t" cellpadding="0" cellspacing="0" border="0"><tr>
  <td dir="rtl" class="btn-td" align="center" bgcolor="${t.btn}" style="${bg}border-radius:12px;">
    <a class="btn-a" href="${href}" target="_blank" style="display:inline-block;padding:15px 38px;font-family:${MAIL_FONT};font-size:16px;line-height:1.3;font-weight:700;color:${t.btnText};text-decoration:none;border-radius:12px;">${label}</a>
  </td></tr></table>`;
}

function mSteps(items, t) {
  return `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0">${items.map((s, i) => `
  <tr>
    <td dir="rtl" width="40" valign="top" style="padding:0 0 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="28" height="28" align="center" valign="middle" bgcolor="${t.tint}" style="width:28px;height:28px;background-color:${t.tint};border:1px solid ${t.line};border-radius:14px;font-family:${MAIL_FONT};font-size:13px;line-height:26px;font-weight:800;color:${t.ink};text-align:center;">${i + 1}</td>
      </tr></table>
    </td>
    <td dir="rtl" valign="top" style="padding:3px 0 12px;${MB}font-size:14.5px;line-height:1.8;color:${MC.p};">${s}</td>
  </tr>`).join('')}
  </table>`;
}

// label/value rows inside one bordered panel
function mFacts(rows) {
  return `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MC.box}" style="background-color:${MC.box};border:1px solid ${MC.line};border-radius:12px;border-collapse:separate;">${rows.map(([label, valueHtml], i) => {
    const line = i < rows.length - 1 ? `border-bottom:1px solid ${MC.line};` : '';
    return `
  <tr>
    <td dir="rtl" width="34%" valign="top" style="${line}padding:13px 18px;${MB}font-size:13px;line-height:1.7;color:${MC.dim};">${label}</td>
    <td dir="rtl" valign="top" style="${line}padding:13px 18px;${MB}font-size:14.5px;line-height:1.7;font-weight:700;color:${MC.h};"><span dir="auto" style="unicode-bidi:isolate;">${valueHtml}</span></td>
  </tr>`;
  }).join('')}
  </table>`;
}

function mailShell({ tone, label, title, preheader, body, note, extraFoot = '' }) {
  const t = MAIL_TONE[tone];
  const year = new Date().getFullYear();
  const F = MAIL_FONT;
  const pad = '&#847;&zwnj;&nbsp;'.repeat(40);
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<meta name="x-apple-disable-message-reformatting">
<title>${escHtml(title)}</title>
<style>
  :root{color-scheme:dark;supported-color-schemes:dark}
  body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  a{text-decoration:none}
  @media only screen and (max-width:520px){
    .wrap{padding:10px 6px!important}
    .px{padding-left:20px!important;padding-right:20px!important}
    .h1{font-size:23px!important;line-height:1.45!important}
    .btn-t{width:100%!important}
    .btn-a{display:block!important;padding-left:12px!important;padding-right:12px!important}
    .code-lg{font-size:19px!important;letter-spacing:1px!important}
  }
</style>
</head>
<body dir="rtl" bgcolor="${MC.page}" style="margin:0;padding:0;background-color:${MC.page};direction:rtl;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${MC.page};font-size:1px;line-height:1px;">${escHtml(preheader)}${pad}</div>
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MC.page}" style="background-color:${MC.page};">
<tr><td dir="rtl" class="wrap" align="center" style="padding:28px 12px;">

  <table role="presentation" dir="rtl" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${MC.card}" style="width:600px;max-width:100%;background-color:${MC.card};border:1px solid ${MC.line};border-radius:18px;border-collapse:separate;overflow:hidden;">

    <!-- Header: one opaque banner image — near-black plate + the GLITCH Q lockup (alt text if images are blocked) -->
    <tr><td align="center" bgcolor="${MC.plate}" style="background-color:${MC.plate};padding:0;font-size:0;line-height:0;">
      <a href="${MAIL_SITE}" target="_blank" style="text-decoration:none;"><img src="${MAIL_HEADER}" width="600" height="96" alt="GLITCH Q" style="display:block;border:0;outline:none;width:100%;max-width:600px;height:auto;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:96px;font-weight:800;letter-spacing:4px;color:#FFFFFF;text-align:center;"></a>
    </td></tr>

    <!-- Accent strip: this letter's colour, then the two split channels -->
    <tr><td style="font-size:0;line-height:0;height:4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="88%" height="4" bgcolor="${t.bar}" style="height:4px;font-size:0;line-height:0;background-color:${t.bar};">&nbsp;</td>
        <td width="6%" height="4" bgcolor="#FF5C6C" style="height:4px;font-size:0;line-height:0;background-color:#FF5C6C;">&nbsp;</td>
        <td width="6%" height="4" bgcolor="#35E0F2" style="height:4px;font-size:0;line-height:0;background-color:#35E0F2;">&nbsp;</td>
      </tr></table>
    </td></tr>

    <!-- Body -->
    <tr><td dir="rtl" class="px" style="padding:34px 32px 14px;${MB}">
${mEyebrow(label, t)}
${body}
    </td></tr>

    <!-- Footer -->
    <tr><td dir="rtl" class="px" bgcolor="${MC.plate}" style="background-color:${MC.plate};border-top:1px solid ${MC.line};padding:22px 32px 26px;${MB}">
      <p dir="rtl" style="margin:0 0 12px;${MB}font-size:12.5px;line-height:1.8;color:${MC.dim};">${note}</p>
      ${extraFoot}
      <p dir="rtl" style="margin:0;${MB}font-size:11.5px;line-height:1.9;color:${MC.dim};"><span dir="ltr" style="unicode-bidi:isolate;font-family:Arial,Helvetica,sans-serif;font-weight:800;letter-spacing:2px;color:${MC.h};">GLITCH Q</span><br>متجر بطاقات ${lat('PlayStation')} في الجزائر<br>رسالة تلقائية، يرجى عدم الرد عليها &middot; &copy; ${year}</p>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}

/* ── 1) password reset ───────────────────────────────────────────────── */
function buildResetEmail(resetLink) {
  const link = escHtml(resetLink);
  const t = MAIL_TONE.crimson;
  const cell = (k, v, side) => `<td dir="rtl" width="50%" valign="top" style="${side}padding:14px 18px;${MB}"><div style="font-size:12px;line-height:1.6;color:${MC.dim};">${k}</div><div style="font-size:15px;line-height:1.7;font-weight:700;color:${MC.h};">${v}</div></td>`;
  const body = [
    mH1('إعادة تعيين كلمة المرور'),
    mP('وصلنا طلب لتعيين كلمة مرور جديدة لحسابك. اضغط الزر أدناه لاختيارها.'),
    mButton(link, 'اختيار كلمة مرور جديدة', t),
    mGap(24),
    `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MC.box}" style="background-color:${MC.box};border:1px solid ${MC.line};border-radius:12px;border-collapse:separate;"><tr>${cell('مدة الصلاحية', 'ساعة واحدة', `border-left:1px solid ${MC.line};`)}${cell('الاستخدام', 'مرة واحدة فقط', '')}</tr></table>`,
    mGap(24),
    mSmall('إذا لم يعمل الزر، انسخ هذا الرابط والصقه في المتصفح:'),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${MC.box}" style="background-color:${MC.box};border:1px solid ${MC.line};border-radius:10px;padding:12px 14px;font-family:${MAIL_MONO};font-size:11.5px;line-height:1.7;direction:ltr;text-align:left;word-break:break-all;"><a href="${link}" target="_blank" style="color:${t.ink};text-decoration:underline;">${link}</a></td></tr></table>`,
    mGap(28),
    mHr(),
    mGap(22),
    `<p dir="rtl" style="margin:0 0 4px;${MB}font-size:15px;line-height:1.8;font-weight:800;color:${MC.h};">لم تطلب هذا؟</p>`,
    mP('تجاهل الرسالة؛ كلمة مرورك لن تتغير ولن يحدث شيء في حسابك. وإن وصلتك رسائل كهذه باستمرار فغيّر كلمة مرور بريدك الإلكتروني.', 'font-size:14px;'),
    mP('<strong style="color:#FFFFFF;">لن نطلب منك كلمة المرور أبداً</strong> — لا عبر الإيميل ولا واتساب ولا أي رسالة أخرى.', 'font-size:14px;'),
  ].join('\n');
  return mailShell({
    tone: 'crimson',
    label: 'أمان الحساب',
    title: 'إعادة تعيين كلمة المرور — Glitch Q',
    preheader: 'اضغط الزر لاختيار كلمة مرور جديدة — الرابط صالح لمدة ساعة واحدة ويعمل مرة واحدة فقط.',
    body,
    note: 'وصلتك هذه الرسالة لأن أحداً طلب إعادة تعيين كلمة المرور لحساب مرتبط بهذا البريد.',
  });
}

function buildResetText(resetLink) {
  return `إعادة تعيين كلمة المرور — Glitch Q

وصلنا طلب لتعيين كلمة مرور جديدة لحسابك.
افتح الرابط التالي واختر كلمة المرور الجديدة:

${resetLink}

- الرابط صالح لمدة ساعة واحدة ويعمل مرة واحدة فقط.

لم تطلب هذا؟
تجاهل الرسالة؛ كلمة مرورك لن تتغير ولن يحدث شيء في حسابك. وإن وصلتك رسائل كهذه باستمرار فغيّر كلمة مرور بريدك الإلكتروني.

لن نطلب منك كلمة المرور أبداً — لا عبر الإيميل ولا واتساب ولا أي رسالة أخرى.

Glitch Q`;
}

/* ── 2) order delivered: the code ────────────────────────────────────── */
function validityCopy(v) {
  const full = `${v.lastDay} ${v.monthName} ${v.year}`;
  if (v.daysLeft < 0) return { tone: 'red', title: 'انتهت مدة صلاحية هذا الكود', sub: `كانت تنتهي بنهاية ${v.monthName} ${v.year}. تواصل مع الدعم إن احتجت مساعدة.`, full };
  if (v.daysLeft === 0) return { tone: 'red', title: 'اليوم آخر يوم لصلاحية الكود', sub: 'فعّله قبل منتصف الليل (توقيت الجزائر)، وبعدها يُعتبر الكود منتهياً.', full };
  return {
    tone: v.daysLeft <= 3 ? 'gold' : 'mint',
    title: `صالح للاستخدام حتى نهاية ${v.monthName}`,
    sub: `يتبقى ${arDays(v.daysLeft)} — آخر موعد ${full}. بعد هذا التاريخ يُعتبر الكود منتهياً.`,
    full,
  };
}

function buildCodeEmail({ product, code, orderId, validity }) {
  const t = MAIL_TONE.mint;
  const v = validity || codeValidity();
  const vc = validityCopy(v);
  const vt = MAIL_TONE[vc.tone];
  const raw = String(code == null ? '' : code);
  const longest = Math.max(1, ...raw.split(/\r?\n/).map((l) => l.length));
  const size = longest <= 19 ? 26 : longest <= 30 ? 20 : 16;
  const ticket = `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#08080B" style="background-color:#08080B;border:1px solid ${MC.line2};border-radius:14px;border-collapse:separate;">
      <tr><td dir="rtl" align="center" style="padding:20px 22px 16px;font-family:${MAIL_FONT};direction:rtl;text-align:center;">
        <div style="font-size:12px;line-height:1.6;color:${MC.dim};">المنتج</div>
        <div dir="auto" style="font-size:17px;line-height:1.7;font-weight:700;color:${MC.h};">${escHtml(product || '—')}</div>
      </td></tr>
      <tr><td style="padding:0 22px;"><div style="height:0;line-height:0;font-size:0;border-top:1px dashed ${MC.line2};">&nbsp;</div></td></tr>
      <tr><td dir="rtl" align="center" style="padding:18px 22px 22px;font-family:${MAIL_FONT};direction:rtl;text-align:center;">
        <div style="font-size:12px;line-height:1.6;color:${MC.dim};margin-bottom:6px;">الكود</div>
        <div class="${size === 26 ? 'code-lg' : ''}" dir="ltr" style="font-family:${MAIL_MONO};font-size:${size}px;line-height:1.5;font-weight:700;letter-spacing:${size === 26 ? 2 : 1}px;color:${t.ink};text-align:center;white-space:pre-wrap;word-break:break-all;-webkit-user-select:all;user-select:all;">${escHtml(raw)}</div>
      </td></tr>${orderId ? `
      <tr><td dir="rtl" align="center" bgcolor="${MC.card}" style="background-color:${MC.card};border-top:1px solid ${MC.line};border-radius:0 0 13px 13px;padding:11px 22px;font-family:${MAIL_FONT};direction:rtl;text-align:center;font-size:12px;line-height:1.7;color:${MC.dim};">رقم الطلب &nbsp;<span dir="ltr" style="unicode-bidi:isolate;font-family:${MAIL_MONO};color:${MC.p};">${escHtml(orderId)}</span></td></tr>` : ''}
    </table>`;
  // validity band: a dark calendar tile with the last day of the month + what it means
  const validityBand = `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td dir="rtl" bgcolor="${vt.tint}" style="background-color:${vt.tint};border:1px solid ${vt.line};border-radius:12px;padding:14px 16px;">
        <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td dir="rtl" width="64" valign="middle" style="width:64px;">
            <table role="presentation" width="56" cellpadding="0" cellspacing="0" border="0" bgcolor="${MC.page}" style="width:56px;background-color:${MC.page};border:1px solid ${vt.line};border-radius:10px;border-collapse:separate;"><tr><td align="center" style="padding:7px 0 8px;font-family:${MAIL_FONT};">
              <div style="font-size:11px;line-height:1.4;font-weight:700;color:${vt.ink};">${escHtml(v.monthName)}</div>
              <div style="font-size:24px;line-height:1.15;font-weight:800;color:#FFFFFF;">${v.lastDay}</div>
            </td></tr></table>
          </td>
          <td dir="rtl" valign="middle" style="padding-right:4px;${MB}">
            <div style="font-size:15px;line-height:1.7;font-weight:800;color:${vt.ink};">${escHtml(vc.title)}</div>
            <div style="font-size:13px;line-height:1.8;color:${MC.p};">${escHtml(vc.sub)}</div>
          </td>
        </tr></table>
      </td></tr></table>`;
  const body = [
    mH1('طلبك جاهز'),
    mP('شكراً لشرائك من متجرنا. كودك أدناه، وهو جاهز للاستخدام الآن.'),
    ticket,
    mGap(10),
    mSmall('لتنسخ الكود: اضغط عليه مطولاً على الجوال، أو حدّده بالماوس على الكمبيوتر.'),
    mGap(14),
    validityBand,
    mGap(12),
    mNote(MAIL_TONE.gold, '<strong>لا تشارك الكود مع أحد</strong> — من يملكه يستطيع استخدامه.'),
    mGap(26),
    `<p dir="rtl" style="margin:0 0 14px;${MB}font-size:16px;line-height:1.6;font-weight:800;color:${MC.h};">طريقة التفعيل على ${lat('PlayStation')}</p>`,
    mSteps([
      `افتح <strong style="color:#FFFFFF;">${lat('PlayStation Store')}</strong> من جهازك أو من المتصفح.`,
      `اختر <strong style="color:#FFFFFF;">«استرداد الرموز»</strong> ${lat('(Redeem Codes)')}`,
      'أدخل الكود أعلاه ثم أكّد.',
    ], t),
    mGap(6),
    mNote(t, `<strong>تأكد من المنطقة:</strong> بطاقات ${lat('PlayStation')} مرتبطة بمنطقة محددة، فيجب أن تطابق منطقة حسابك منطقة البطاقة قبل إدخال الكود.`),
    mGap(26),
    mP(`الكود لا يعمل؟ راسلنا من صفحة الدعم في الموقع${orderId ? ' وأرسل رقم الطلب' : ''}، وسنتابع معك.`, 'font-size:14px;'),
    mButton(MAIL_SITE, 'العودة إلى المتجر', t),
    mGap(10),
  ].join('\n');
  return mailShell({
    tone: 'mint',
    label: 'تسليم الطلب',
    title: 'طلبك جاهز — Glitch Q',
    preheader: v.daysLeft >= 0 ? `كودك جاهز وصالح حتى ${vc.full}. افتح الرسالة لنسخه وتفعيله.` : 'كودك جاهز. افتح الرسالة لنسخه وتفعيله.',
    body,
    note: 'وصلتك هذه الرسالة لأن طلباً مرتبطاً بهذا البريد تم تسليمه من متجرنا.',
  });
}

function buildCodeText({ product, code, orderId, validity }) {
  const vc = validityCopy(validity || codeValidity());
  return `طلبك جاهز — Glitch Q

المنتج: ${product || '—'}${orderId ? `\nرقم الطلب: ${orderId}` : ''}

الكود:
${code}

${vc.title}
${vc.sub}

لا تشارك الكود مع أحد — من يملكه يستطيع استخدامه.

طريقة التفعيل على PlayStation:
1) افتح PlayStation Store من جهازك أو من المتصفح.
2) اختر «استرداد الرموز» (Redeem Codes).
3) أدخل الكود ثم أكّد.

تأكد من المنطقة: بطاقات PlayStation مرتبطة بمنطقة محددة، فيجب أن تطابق منطقة حسابك منطقة البطاقة قبل إدخال الكود.

الكود لا يعمل؟ راسلنا من صفحة الدعم في الموقع${orderId ? ' وأرسل رقم الطلب' : ''}.

Glitch Q`;
}

/* ── 3) new-device login alert ───────────────────────────────────────── */
function buildLoginAlertEmail({ device, place, when }) {
  const t = MAIL_TONE.gold;
  const red = MAIL_TONE.red;
  const body = [
    mH1('تسجيل دخول جديد إلى حسابك'),
    mP('سُجّل دخول إلى حسابك من جهاز لم نتعرّف عليه من قبل:'),
    mFacts([
      ['الجهاز', escHtml(device)],
      ['الموقع التقريبي', escHtml(place)],
      ['الوقت', escHtml(when)],
    ]),
    mGap(8),
    mSmall('الموقع تقريبي ويُستنتج من عنوان الشبكة، وقد لا يطابق مكانك الفعلي.'),
    mGap(16),
    mBox(`<div dir="rtl" style="font-size:15px;line-height:1.8;font-weight:800;color:${MC.h};">كنت أنت؟</div><div dir="rtl" style="font-size:14px;line-height:1.9;color:${MC.p};">لا تحتاج لأي إجراء.</div>`),
    mGap(12),
    mTintBox(red, `<div dir="rtl" style="${MB}font-size:15px;line-height:1.8;font-weight:800;color:${red.ink};margin-bottom:12px;">لم تكن أنت؟ تحرّك الآن</div>${mSteps([
      'افتح حسابك ← <strong style="color:#FFFFFF;">إعدادات الحساب</strong> وغيّر كلمة المرور.',
      'اضغط <strong style="color:#FFFFFF;">«تسجيل الخروج من كل الأجهزة»</strong>.',
      'إن كنت تستخدم كلمة المرور نفسها في مكان آخر، فغيّرها هناك أيضاً.',
    ], red)}`),
    mGap(26),
    mButton(MAIL_SITE, 'فتح حسابي', t),
    mGap(10),
  ].join('\n');
  return mailShell({
    tone: 'gold',
    label: 'تنبيه أمني',
    title: 'تسجيل دخول جديد — Glitch Q',
    preheader: 'سُجّل دخول إلى حسابك من جهاز جديد. إن لم تكن أنت فأمّن حسابك الآن.',
    body,
    note: 'وصلتك هذه الرسالة لأنك فعّلت «تنبيه الدخول من جهاز جديد» في إعدادات حسابك، ويمكنك إيقافه في أي وقت.',
  });
}

function buildLoginAlertText({ device, place, when }) {
  return `تسجيل دخول جديد إلى حسابك — Glitch Q

سُجّل دخول إلى حسابك من جهاز لم نتعرّف عليه من قبل:
الجهاز: ${device}
الموقع التقريبي: ${place} (يُستنتج من عنوان الشبكة وقد لا يطابق مكانك الفعلي)
الوقت: ${when}

كنت أنت؟ لا تحتاج لأي إجراء.

لم تكن أنت؟
1) افتح حسابك ← إعدادات الحساب وغيّر كلمة المرور.
2) اضغط «تسجيل الخروج من كل الأجهزة».
3) إن كنت تستخدم كلمة المرور نفسها في مكان آخر، فغيّرها هناك أيضاً.

وصلتك هذه الرسالة لأنك فعّلت «تنبيه الدخول من جهاز جديد» ويمكنك إيقافه في أي وقت.
Glitch Q`;
}


/* ── 4) newsletter (written by the owner in the admin panel) ─────────── */
// Latin words/numbers inside Arabic text are isolated so the sentence order survives any mail app; everything is escaped first-class.
const NL_WORD = "[A-Za-z0-9](?:[A-Za-z0-9._'’&+\\-\\/:@#]*[A-Za-z0-9])?%?";
const NL_LATIN = new RegExp(NL_WORD + '(?: ' + NL_WORD + ')*', 'g');
function nlMix(raw) {
  raw = String(raw); let out = '', last = 0, m; NL_LATIN.lastIndex = 0;
  while ((m = NL_LATIN.exec(raw))) { out += escHtml(raw.slice(last, m.index)) + lat(escHtml(m[0])); last = m.index + m[0].length; }
  return out + escHtml(raw.slice(last));
}
const mH2 = (s) => `<h2 dir="rtl" style="margin:10px 0 8px;${MB}font-size:18px;line-height:1.6;font-weight:800;color:${MC.h};">${s}</h2>`;
const mList = (items) => `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">${items.map(s => `
  <tr><td dir="rtl" width="22" valign="top" style="padding:0 0 8px;font-family:${MAIL_FONT};font-size:12px;line-height:2.3;color:${MAIL_TONE.crimson.bar};">&#9679;</td><td dir="rtl" valign="top" style="padding:0 0 8px;${MB}font-size:15px;line-height:1.9;color:${MC.p};">${s}</td></tr>`).join('')}
</table>`;
// blank line = new paragraph · "## " = sub-heading · lines that all start with "- " = a list
function nlBlocks(text) {
  return String(text).replace(/\r/g, '').split(/\n{2,}/).map(b => b.trim()).filter(Boolean).map(b => {
    if (/^##\s+/.test(b)) return mH2(nlMix(b.replace(/^##\s+/, '')));
    const lines = b.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.every(l => /^[-•*]\s+/.test(l))) return mList(lines.map(l => nlMix(l.replace(/^[-•*]\s+/, ''))));
    return mP(lines.map(nlMix).join('<br>'));
  }).join('\n');
}
function buildNewsletterEmail({ subject, preheader, text, ctaLabel, ctaUrl, unsubUrl }) {
  const t = MAIL_TONE.crimson;
  const body = [
    mH1(nlMix(subject)),
    nlBlocks(text),
    ctaLabel && ctaUrl ? `${mGap(10)}\n${mButton(escHtml(ctaUrl), nlMix(ctaLabel), t)}` : '',
    mGap(10),
  ].join('\n');
  return mailShell({
    tone: 'crimson',
    label: 'جديد من المتجر',
    title: subject,
    preheader: preheader || String(text).replace(/\s+/g, ' ').slice(0, 110),
    body,
    note: 'وصلتك هذه الرسالة لأنك اشتركت في النشرة البريدية للمتجر.',
    extraFoot: `<p dir="rtl" style="margin:0 0 14px;${MB}font-size:12.5px;line-height:1.8;color:${MC.dim};">لا تريد استلام النشرة؟ <a href="${escHtml(unsubUrl)}" target="_blank" style="color:${MC.p};text-decoration:underline;">إلغاء الاشتراك</a></p>`,
  });
}
function buildNewsletterText({ subject, text, ctaLabel, ctaUrl, unsubUrl }) {
  return `${subject}

${text}${ctaLabel && ctaUrl ? `\n\n${ctaLabel}: ${ctaUrl}` : ''}

—
لإلغاء الاشتراك من النشرة: ${unsubUrl}
Glitch Q`;
}
