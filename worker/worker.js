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
    // Pictures of products are plain <img> loads (no Origin header): public, read-only, one id at a time, with its own limiter
    if (new URL(request.url).pathname.startsWith('/img/')) return handleImage(request, env);
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
        '/health':                 () => json({ ok: true, v: 16 }, 200, cors),
        '/maintenance':            () => handleMaintenance(request, env, cors),
        '/ticker':                 () => handleTicker(request, env, cors),
        '/stats/visit':            () => handleVisit(request, env, cors),
        '/reset-password':         () => handleResetPassword(request, env, cors),
        '/account/send-verification': () => handleSendVerification(request, env, cors),
        '/leaderboard':            () => handleLeaderboard(request, env, cors),
        '/coupon/validate':        () => handleCouponValidate(request, env, cors),
        '/offer':                  () => handleOffer(request, env, cors),
        '/order/create':           () => handleOrderCreate(request, env, cors, ctx),
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
        '/admin/delete-user':      () => handleAdminDeleteUser(request, env, cors),
        '/admin/unverified':       () => handleAdminUnverified(request, env, cors),
        '/admin/notify-email':     () => handleAdminNotifyEmail(request, env, cors),
        '/admin/product-image':    () => handleAdminProductImage(request, env, cors),
        '/admin/push':             () => handleAdminPush(request, env, cors),
        '/account/invoice-email':  () => handleInvoiceEmail(request, env, cors),
        '/account/claim-email':    () => handleClaimEmail(request, env, cors),
        '/account/check-email':    () => handleCheckEmail(request, env, cors),
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
  return { blob: new Blob([buf], { type }), type, bytes: buf };
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
  if (v instanceof Uint8Array) return { bytesValue: bytesToB64(v) };
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

// A suspension may be permanent (no `until`) or temporary (`until` = epoch milliseconds set by the owner's panel).
// Once `until` has passed the account works again; the owner's panel shows the expired entry so it can be cleared.
async function isBanned(env, uid) {
  try {
    const d = await fsGet(env, `banned_users/${encodeURIComponent(uid)}`);
    if (!d.exists) return false;
    const until = Number(d.data.until);
    if (until > 0 && Date.now() >= until) return false;
    return true;
  } catch { return false; }
}

function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
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
  if (prod.cur === 'item' && !(Number(prod.priceDZD) > 0)) return 0;   // a product type of the owner's own has no exchange rate: it needs its DZD price, or it cannot be bought
  const orig = Number(prod.priceDZD) || (Number(prod.val) * (RATES[prod.cur] || 220));
  if (!Number.isFinite(orig) || orig <= 0) return 0;
  return disc > 0 ? Math.floor(orig * (1 - disc / 100)) : Math.floor(orig);
}

function valueText(p) {
  if (p.cur === 'month') return `${p.val} شهر`;
  if (p.cur === 'copy') return 'نسخة';
  if (p.cur === 'item') return cleanText(p.valText || '', 30);   // a product type of the owner's own: the text he wrote for the card face
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
    ? [lines[0].name, valueText(lines[0].prod), cleanText(lines[0].prod.sub || '', 80) && `(${cleanText(lines[0].prod.sub || '', 80)})`].filter(Boolean).join(' ')
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
const RECEIPT_MAX_BYTES = 700 * 1024;   // Firestore documents are limited to 1 MiB
async function handleOrderCreate(request, env, cors, ctx) {
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

  let photo = null, receiptBytes = null, receiptType = '';
  if (pay === 'baridimob') {
    const img = await readImage(form.get('photo'));
    if (img.err) return json({ error: img.err }, 400, cors);
    photo = img.blob;
    // a copy is kept for the owner's panel when it fits in one Firestore document (the browser shrinks it first); Telegram always gets the original
    if (img.bytes.length <= RECEIPT_MAX_BYTES) { receiptBytes = img.bytes; receiptType = img.type; }
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

  const orderWrite = d => fsWrite(env, `orders/${oid}`, { fields: d, transforms: { serverTime: ['ts'] }, precondition: { exists: false } });
  let created;
  if (receiptBytes) {
    // order + receipt copy in one atomic commit; if the copy is what the database refuses, the order still goes through without it
    created = await fsCommit(env, [
      orderWrite({ ...doc, hasReceipt: true }),
      fsWrite(env, `order_receipts/${oid}`, { fields: { orderId: oid, userId: uid, mime: receiptType, size: receiptBytes.length, data: receiptBytes }, transforms: { serverTime: ['ts'] } }),
    ]);
    if (!created.ok) created = await fsCommit(env, [orderWrite(doc)]);
  } else created = await fsCommit(env, [orderWrite(doc)]);
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
    await fsCommit(env, [fsWrite(env, `orders/${oid}`, { delete: true }), fsWrite(env, `order_receipts/${oid}`, { delete: true })]);
    await releaseCoupon(env, couponUsed);
    return json({ error: 'Could not notify the store, please try again' }, 502, cors);
  }
  // the owner's phone: sound + details (best effort, after the answer is on its way; the customer never waits for it or sees its failure)
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(pushAdmin(env, {
      t: 'order', oid,
      title: `🛒 طلب جديد · ${total.toLocaleString('en-US')} دج`,
      body: `${priced.label.slice(0, 140)}\n${pay === 'baridimob' ? '💳 BaridiMob' : '🤝 تسليم باليد'}${couponUsed ? ' · 🎟️ ' + couponUsed : ''}`,
      tag: 'gq-order-' + oid,
    }));
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
   NAME FILTER — insults, sexual / blasphemous words and political names are never shown (same list as the shop: namefilter.js)
   The shop refuses such a name when it is typed; this copy is the one that cannot be bypassed from the browser: every public place
   that prints a customer's name (leaderboard, e-mails, invoices) goes through it. worker.test.mjs checks both copies are identical.
═══════════════════════════════════════ */
/* NAMEFILTER:BEGIN */
const NF=(()=>{
  const LAT={'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','8':'b','@':'a','$':'s','!':'i','€':'e','£':'l','|':'i','+':'t'};
  const HOMO={'а':'a','е':'e','о':'o','р':'p','с':'c','х':'x','у':'y','і':'i','ј':'j','ѕ':'s','ԁ':'d','ƒ':'f','ɡ':'g','α':'a','ο':'o','ν':'v','ρ':'p','ι':'i','κ':'k','τ':'t','ε':'e'};
  const base=s=>String(s==null?'':s).slice(0,200)
    .replace(/([a-zа-я])([A-ZА-Я])/g,'$1 $2')                                   /* BigAss → big ass */
    .normalize('NFKD').toLowerCase()
    .replace(/[̀-ًͯ-ٰٟـۖ-ۭ]/g,'')                          /* accents, vowel marks, tatweel */
    .replace(/[​-‏‪-‮⁠﻿­]/g,'')                                  /* zero-width / bidi */
    .replace(/ß/g,'ss').replace(/æ/g,'ae').replace(/ø/g,'o').replace(/ı/g,'i').replace(/ё/g,'е')
    .replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0))
    .replace(/[أإآٱ]/g,'ا').replace(/[ىئی]/g,'ي').replace(/[ةھہ]/g,'ه').replace(/ؤ/g,'و').replace(/ک/g,'ك');
  const sub=t=>t.replace(/[^\s]/gu,c=>HOMO[c]||LAT[c]||c);
  const squash=t=>t.replace(/[^\p{L}\p{N}]+/gu,'');
  const col=t=>t.replace(/(.)\1{2,}/gu,'$1');                                                       /* fuuuck → fuck, "ass" stays */
  const words=l=>l.split(/\s+/).filter(Boolean).map(w=>squash(base(w)));
  /* STRICT — found anywhere (after removing spaces and punctuation); each letter may be repeated (fuuuck) but a double letter stays double */
  const STRICT=words(`
    fuck shit bitch asshole bastard pussy whore slut faggot nigger niggers pornhub xvideos xnxx porno pornography blowjob handjob cumshot jerkoff dildo vagina
    masturbat orgasm hentai nudes pedophile paedophile molester wanker motherfucker cocksucker bullshit horseshit dumbass dickhead
    putain connard connasse enculer encule niquetamere ntmere couille salopard sodomie merdeux
    mierda cabron pendejo maricon chingar chingada chingatumadre hijueputa hijodeputa gilipollas
    orospu siktir sikeyim sikik pezevenk amcik yarrak
    scheisse scheiss arschloch fotze hurensohn wichser schwuchtel ficken
    cazzo vaffanculo stronzo puttana caralho buceta
    пизд блядь блять ебать ебан пидор мудак говно залуп шлюх
    كسكش حرامزاده مادرجنده پدرسگ چوتيا
    كسمك كسامك كسختك كسمه كسامه نيكمك نيكامك نيكموك نيكامو ينيك ينيكك منيوك متناك شرموط شرموطه عاهره قحبه قحاب ديوث ديوثه لوطي زانيه زانيات
    ولدزنا ابنزنا ولدالحرام ابنالحرام ولدلحرام ابنالكلب ولدالكلب ابنالقحبه بنتالقحبه ولدالقحبه ولدلقحبه
    يلعن نعلبوك نعلدين نعلمك دينمك دينامك ديناموك دينربك
    اباحي اباحيه بورنو سكسي محارم لواط اغتصاب ممحون ممحونه مهبل
    9a7ba 9ahba 7a9ba qahba kahba kahbat kehba sharmouta charmouta sharmota charmota sharmoute nikomak nikmak nikmok nikemok nikommak nikomek niktamak niktamer
    kosomak ksomak ksomok kosomek kosmak kosomok dayouth dayyouth ibnelharam ibnlharam ouldelharam ouldlharam ouldelhram ouldlhram bentlharam bentelharam
    hitler heilhitler mussolini stalin
    bouteflika boutef tebboune tebboun chengriha netanyahu zelensky zelenskyy erdogan khamenei khomeini gaddafi kadhafi hezbollah hizbollah hizballah
    daesh alqaeda alqaida taliban zionist zionism polisario
    بوتفليقه شنقريحه ماكرون نتنياهو زيلنسكي السيسي القذافي اردوغان خامنئي حزبالله داعش طالبان
    اسرائيل صهيوني صهيونيه صهيون هتلر النازيه البوليساريو
    vodka whisky whiskey cocaine hashish cannabis marijuana
    كوكايين حشيش خمرة
  `);
  /* WORD — only when it is a whole word (digits stuck on the end and "ال" in front are ignored) */
  const WORD=new Set(words(`
    cunt dick cock cum anal rape rapist sex sexy sexo nude porn tits boobs horny milf bdsm twat fag retard pedo nigga niga heroin weed meth lsd
    ass arse asses
    pute puta puto nique niquer ntm fdp pede pedes chatte bordel salope salopes batard enfoire
    merde merda
    verga culo joder marica
    amk gavat ibne
    fick figa troia porra viado
    хуй хуя хуе пизда ебал сука
    كص جنده
    كس زب زبي كسي طيز طيزي عرص خول خرا زنا نيك نيكني منيك تنيك سكس لوطي قحب زامل قضيب جنس
    zebi zobi zeb zebbi 9a7ba 9ahba 9ahba 9a7ab kos tnaka tnak khawal 3ars 3ahira zamel zaml
    hamas isil nazi nazis kkk fascist trump biden putin israel israeli macron makhzen
    ترامب بايدن بوتين نازي تبون
  `));
  /* innocent words that happen to contain a refused one once letters may repeat */
  const ALLOW=['shiitake'];
  const alt=w=>w.length>4&&w.startsWith('ال')?w.slice(2):'';
  let RX=null;
  const rx=()=>RX||(RX=new RegExp('(?:'+[...new Set(STRICT)].filter(w=>w.length>=3).map(w=>[...w].reduce((a,c)=>{const l=a[a.length-1];if(l&&l.c===c)l.n++;else a.push({c,n:1});return a;},[]).map(r=>r.n>1?r.c+'{'+r.n+',}':r.c+'+').join('')).join('|')+')','u'));
  /* true → the name must not be used / shown */
  function bad(name){
    const raw=String(name==null?'':name);
    if(!raw.trim())return false;
    const b=base(raw),s=sub(b),vs=b===s?[b]:[b,s];
    for(const v of vs){
      if(rx().test(ALLOW.reduce((a,w)=>a.split(w).join(''),squash(v))))return true;
      for(const tok of v.split(/[^\p{L}\p{N}]+/u)){
        if(!tok)continue;
        const k=col(tok),k2=k.replace(/\d+$/,'');
        for(const w of [tok,k,k2,alt(tok),alt(k),alt(k2)])if(w&&WORD.has(w))return true;
      }
    }
    return false;
  }
  return{bad,base,squash};
})();
/* NAMEFILTER:END */
const safeName = (s, fallback = '') => (NF.bad(s) ? fallback : s);

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
  /* a sign-up that never clicked its activation link is not a customer: older versions wrote its profile at sign-up, so keep those off the public board
     (fail-open: if the sign-in list cannot be read, the board is shown as before) */
  let waiting = new Set();
  try { const p = await listPendingAccounts(env); if (p.ok) waiting = new Set(p.list.map(x => x.uid)); } catch (e) { /* keep going */ }
  const top = [];
  for (const r of rows) {
    const u = r.data;
    if (waiting.has(r.id)) continue;
    if (u.prefs && u.prefs.hideLb === true) continue;
    let nick = cleanText(u.nick, 20);
    if (NICK_BLOCK.test(nick)) nick = '';                       // reserved names cannot be used to pose as the store
    const first = cleanText(u.firstName || u.name, 30), last = cleanText(u.lastName, 30);
    let name = nick || (first + (last ? ' ' + last[0] + '.' : '')) || '—';
    if (NF.bad(nick) || NF.bad(first) || NF.bad(last)) name = 'Player';   // a name the filter refuses is never shown publicly, whatever the browser wrote
    top.push({ name, points: Math.max(0, Math.floor(Number(u.points) || 0)), avatar: u.avatar && typeof u.avatar === 'object' ? { e: cleanText(u.avatar.e, 8), c: cleanText(u.avatar.c, 12) } : null });
    if (top.length >= 5) break;
  }
  _lb = top; _lbExp = Date.now() + 60000;
  return json({ ok: true, top }, 200, cors);
}

/* ═══════════════════════════════════════
   PRODUCT PICTURES — the owner uploads a picture from his device; each one is kept in its own Firestore document
   (product_images/<id>, owner/Worker only by the catch-all rule) and served from here at GET /img/<id> with a one-year cache.
   The id is the hash of the bytes: the same picture is stored once, and an id can never be guessed to read anything else.
═══════════════════════════════════════ */
const IMG_MAX_BYTES = 190 * 1024;                       // the panel shrinks pictures before sending (≈ 60–150 KB); a Firestore document holds 1 MiB
const RE_IMG_ID = /^[a-f0-9]{24}$/;
const _imgCache = new Map();                            // id → {type, bytes, exp}: saves a database read per request inside one Worker instance
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function handleAdminProductImage(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  const body = await readJson(request, IMG_MAX_BYTES * 2);
  if (!body) return json({ error: 'Invalid data or too large' }, 400, cors);
  const a = await who(body.idToken, env, cors, false);
  if (a.err) return a.err;
  if (!isAdminClaims(a.claims, env)) return json({ error: 'Forbidden' }, 403, cors);
  if (hit('pimg', 40, 600000)) return json({ error: 'Too many requests' }, 429, cors);
  const m = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(body.data || ''));
  if (!m) return json({ error: 'Invalid picture' }, 400, cors);
  let bytes;
  try { bytes = b64ToBytes(m[1]); } catch { return json({ error: 'Invalid picture' }, 400, cors); }
  if (bytes.length < 200 || bytes.length > IMG_MAX_BYTES) return json({ error: 'Picture too large (max 190 KB after shrinking)' }, 413, cors);
  const type = sniffImage(bytes);                       // the real bytes decide, not the label the browser put on them
  if (!type) return json({ error: 'Invalid picture' }, 400, cors);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const id = [...h.slice(0, 12)].map(x => x.toString(16).padStart(2, '0')).join('');
  const w = await fsCommit(env, [fsWrite(env, `product_images/${id}`, { fields: { mime: type, size: bytes.length, b64: bytesToB64(bytes) }, transforms: { serverTime: ['ts'] } })]);
  if (!w.ok) return json({ error: 'Could not save the picture' }, 503, cors);
  return json({ ok: true, id, url: `${new URL(request.url).origin}/img/${id}`, size: bytes.length }, 200, cors);
}
// public: <img> tags send no Origin header, so this is answered before the Origin filter (like the unsubscribe link); nothing but one picture can be read
async function handleImage(request, env) {
  const base = { 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" };
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: base });
  const id = new URL(request.url).pathname.slice(5);
  if (!RE_IMG_ID.test(id)) return new Response('Not found', { status: 404, headers: base });
  if (hit('img:' + clientIp(request), 240, 60000)) return new Response('Too many requests', { status: 429, headers: base });
  let hitc = _imgCache.get(id);
  if (!hitc || hitc.exp < Date.now()) {
    let d;
    try { d = await fsGet(env, `product_images/${id}`); } catch { return new Response('Try again', { status: 503, headers: base }); }
    if (!d.exists || typeof d.data.b64 !== 'string') return new Response('Not found', { status: 404, headers: base });
    const bytes = b64ToBytes(d.data.b64);
    const type = sniffImage(bytes);
    if (!type) return new Response('Not found', { status: 404, headers: base });
    hitc = { type, bytes, exp: Date.now() + 600000 };
    if (_imgCache.size >= 24) _imgCache.delete(_imgCache.keys().next().value);
    _imgCache.set(id, hitc);
  }
  return new Response(request.method === 'HEAD' ? null : hitc.bytes, { status: 200, headers: { ...base, 'Content-Type': hitc.type, 'Content-Length': String(hitc.bytes.length), 'Cache-Control': 'public, max-age=31536000, immutable' } });
}

/* ═══════════════════════════════════════
   INVOICES — for an order that has been delivered (status "done"). The page draws the invoice itself from the customer's own order
   (invoice.js); this route is only the e-mail copy, built here from the stored order, never from anything the browser sends.
   The delivered gift codes are NEVER printed on an invoice (anyone who sees a shared invoice could spend them).
═══════════════════════════════════════ */
const INVOICE_MAILS_PER_DAY = 60;                       // shared Brevo quota (~300/day): order codes and resets keep the rest
const invMaskEmail = (e) => { const s = String(e || ''); const at = s.lastIndexOf('@'); return at < 1 ? '' : s.slice(0, Math.min(2, at)) + '***' + s.slice(at); };
const maskPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length < 4 ? '' : '*'.repeat(Math.max(3, d.length - 3)) + d.slice(-3); };
const PAY_LABEL = { baridimob: 'BaridiMob', hand: 'Cash — hand delivery' };
function buildInvoiceData(oid, o, u, cat, accountEmail) {
  const prods = new Map((cat.products || []).map(p => [String(p.id), p]));
  const lines = (Array.isArray(o.items) ? o.items : []).slice(0, 40).map(l => {
    const p = prods.get(String(l.id)) || {};
    const qty = Math.max(1, Math.floor(Number(l.qty) || 1)), unit = Math.max(0, Math.floor(Number(l.unitDZD) || 0));
    return { name: cleanText(l.name, 80) || '—', region: cleanText(p.sub, 40) || '—', qty, unit, total: qty * unit };
  });
  const first = cleanText(u.firstName || '', 40), last = cleanText(u.lastName || '', 40);
  let customer = [first, last].filter(Boolean).join(' ') || cleanText(u.name, 80);
  if (!customer || NF.bad(customer)) customer = 'Customer';
  const contact = cleanText(o.receiveContact, 254);
  const email = o.receiveMethod === 'email';
  return {
    id: oid, date: cleanText(o.date, 10), customer, email: accountEmail || cleanText(o.accountEmail, 254) || cleanText(u.email, 254),
    lines, subtotal: Math.max(0, Math.floor(Number(o.subtotalDZD) || 0)), discount: Math.max(0, Math.floor(Number(o.discountDZD) || 0)), coupon: cleanText(o.coupon, 40),
    total: Math.max(0, Math.floor(Number(o.totalDZD) || 0)),
    pay: PAY_LABEL[o.paymentMethod] || '—', status: o.status === 'done' ? 'PAID' : '—',
    delivery: email ? `Email · ${invMaskEmail(contact)}` : (o.paymentMethod === 'hand' ? 'Hand delivery · Tlemcen' : `Phone · ${maskPhone(contact)}`),
  };
}
const dzd = (n) => `${Number(n).toLocaleString('en-US')} دج`;
function buildInvoiceEmail(inv) {
  const t = MAIL_TONE.crimson;
  const cell = (s, extra = '') => `<td dir="auto" valign="top" style="padding:10px 8px;border-bottom:1px solid ${MC.line};font-family:${MAIL_FONT};font-size:13px;line-height:1.6;color:${MC.h};${extra}">${s}</td>`;
  const head = (s, extra = '') => `<td dir="auto" style="padding:10px 8px;background-color:#7A0A1E;font-family:${MAIL_FONT};font-size:12px;font-weight:700;color:#FFFFFF;${extra}">${s}</td>`;
  const rows = inv.lines.map(l => `<tr>${cell(`<span dir="auto" style="unicode-bidi:isolate;">${escHtml(l.name)}</span><div style="font-size:11px;color:${MC.dim};">${escHtml(l.region)}</div>`)}${cell(String(l.qty), 'text-align:center;')}${cell(escHtml(dzd(l.unit)), 'text-align:center;white-space:nowrap;')}${cell(`<strong>${escHtml(dzd(l.total))}</strong>`, 'text-align:left;white-space:nowrap;')}</tr>`).join('');
  const sum = (label, val, strong) => `<tr><td colspan="3" dir="rtl" style="padding:8px;font-family:${MAIL_FONT};font-size:${strong ? 15 : 13}px;color:${strong ? '#FFFFFF' : MC.dim};text-align:right;${strong ? 'font-weight:800;' : ''}">${label}</td><td style="padding:8px;font-family:${MAIL_FONT};font-size:${strong ? 16 : 13}px;font-weight:800;color:${strong ? t.ink : MC.h};text-align:left;white-space:nowrap;">${escHtml(val)}</td></tr>`;
  const table = `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MC.box}" style="background-color:${MC.box};border:1px solid ${MC.line};border-radius:12px;border-collapse:separate;overflow:hidden;">
    <tr>${head('المنتج / Product')}${head('الكمية', 'text-align:center;')}${head('السعر', 'text-align:center;')}${head('المجموع', 'text-align:left;')}</tr>${rows}
    ${inv.discount > 0 ? sum(`خصم${inv.coupon ? ` (${escHtml(inv.coupon)})` : ''}`, '− ' + dzd(inv.discount), false) : ''}${sum('الإجمالي / Total', dzd(inv.total), true)}</table>`;
  const body = [
    mH1('فاتورة طلبك'),
    mP('هذه نسخة من فاتورة طلبك المُسلَّم. لن تجد فيها أكواد البطاقات (حفاظاً على أمانها).'),
    mFacts([['رقم الطلب', `<span dir="ltr" style="font-family:${MAIL_MONO};">${escHtml(inv.id)}</span>`], ['التاريخ', escHtml(inv.date)], ['الزبون', escHtml(inv.customer)], ['الإيميل', `<span dir="ltr">${escHtml(inv.email)}</span>`]]),
    mGap(16), table, mGap(16),
    mFacts([['طريقة الدفع', escHtml(inv.pay)], ['حالة الدفع', escHtml(inv.status)], ['التسليم', escHtml(inv.delivery)]]),
    mGap(18), mButton(escHtml(SITE_URL), 'فتح المتجر', t), mGap(18),
  ].join('\n');
  return mailShell({ tone: 'crimson', label: 'فاتورة', title: `فاتورة طلبك — Glitch Q`, preheader: `الإجمالي ${dzd(inv.total)} — الطلب ${inv.id}`, body, note: 'أُرسلت هذه الفاتورة بناءً على طلب صاحب الحساب في Glitch Q. للدعم: glitchq1q@gmail.com' });
}
function buildInvoiceText(inv) {
  return [`فاتورة طلبك — Glitch Q`, `رقم الطلب: ${inv.id}`, `التاريخ: ${inv.date}`, `الزبون: ${inv.customer}`, '',
    ...inv.lines.map(l => `${l.name} (${l.region}) × ${l.qty} = ${dzd(l.total)}`),
    inv.discount > 0 ? `خصم${inv.coupon ? ' ' + inv.coupon : ''}: −${dzd(inv.discount)}` : '', `الإجمالي: ${dzd(inv.total)}`, '',
    `الدفع: ${inv.pay} — ${inv.status}`, `التسليم: ${inv.delivery}`, '', 'للدعم: glitchq1q@gmail.com', '(أكواد البطاقات غير مطبوعة في الفاتورة حفاظاً على أمانها)'].filter(x => x !== '').join('\n');
}
async function handleInvoiceEmail(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (hit('invip:' + clientIp(request), 12, 3600000)) return json({ error: 'Too many requests' }, 429, cors);
  const body = await readJson(request, 2048);
  if (!body) return json({ error: 'Invalid data' }, 400, cors);
  const a = await who(body.idToken, env, cors, true);
  if (a.err) return a.err;
  const claims = a.claims;
  if (!claims || claims.email_verified !== true) return json({ error: 'Unauthorized' }, 401, cors);
  const uid = claims.sub;
  if (hit('invu:' + uid, 12, 3600000)) return json({ error: 'Too many requests' }, 429, cors);
  const oid = String(body.orderId || '');
  if (!RE_ID.test(oid)) return json({ error: 'Invalid order' }, 400, cors);
  const to = String(body.email || '').trim().toLowerCase().slice(0, 254);
  if (!RE_EMAIL.test(to)) return json({ error: 'Invalid email', code: 'bad_format' }, 400, cors);
  if (await isBanned(env, uid)) return json({ error: 'Account suspended' }, 403, cors);
  const o = await fsGet(env, `orders/${oid}`);
  if (!o.exists || o.data.userId !== uid) return json({ error: 'Order not found' }, 404, cors);          // someone else's order looks exactly like a missing one
  if (o.data.status !== 'done') return json({ error: 'The invoice is available after the order is delivered', code: 'not_delivered' }, 409, cors);
  const chk = await checkEmailAddress(to);
  if (!chk.ok) return json({ error: 'Invalid email', code: chk.code, suggest: chk.suggest }, 400, cors);
  // durable limits (the in-memory ones above are per Worker instance): per customer, per destination address, and the shared mail quota
  const day = dzDay();
  if (await dHit(env, `invu_${uid}_${day}`, 10, 129600)) return json({ error: 'Too many requests' }, 429, cors);
  if (await dHit(env, `invt_${await emailKeyId(to)}_${day}`, 3, 129600)) return json({ error: 'Too many requests' }, 429, cors);
  if (await dHit(env, `invall_${day}`, INVOICE_MAILS_PER_DAY, 129600)) return json({ error: 'Daily e-mail limit reached, please download the invoice instead', code: 'quota' }, 503, cors);
  const [u, cat] = await Promise.all([fsGet(env, `users/${uid}`), loadCatalog(env)]);
  const inv = buildInvoiceData(oid, o.data, u.exists ? u.data : {}, cat, String(claims.email || '').toLowerCase());
  const r = await sendBrevo(env, { to, subject: `فاتورة طلبك | Glitch Q`, html: buildInvoiceEmail(inv), text: buildInvoiceText(inv) });
  if (!r.ok) return json({ error: 'Could not send the e-mail' }, 502, cors);
  return json({ ok: true }, 200, cors);
}

/* ═══════════════════════════════════════
   OWNER PHONE ALERTS — Web Push (RFC 8030 delivery, RFC 8292 VAPID, RFC 8291 message encryption)
   A new order wakes the owner's phone with the system notification sound, even when the panel is closed.
   · the VAPID key pair is made once by the Worker and kept in admin_push/_vapid (the database's catch-all rule = owner only)
   · each phone/browser the owner enables is one document admin_push/<hash of its endpoint> (at most PUSH_MAX_DEVICES)
   · the message is encrypted for that device only: the push service (Google / Apple / Mozilla / Microsoft) relays bytes it cannot read
   · it carries the order id, product, total and payment method — never a customer's name, phone or e-mail
   · it is best effort: an order never fails because a push failed (Telegram stays the guaranteed channel)
═══════════════════════════════════════ */
const PUSH_MAX_DEVICES = 5;
// only the real push services — the Worker never POSTs to an address the caller chose freely
const RE_PUSH_HOST = /^(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|(?:[a-z0-9-]+\.)*push\.apple\.com|(?:[a-z0-9-]+\.)*notify\.windows\.com)$/;
function pushEndpointOk(ep) {
  if (typeof ep !== 'string' || ep.length > 800) return false;
  let u; try { u = new URL(ep); } catch { return false; }
  return u.protocol === 'https:' && !u.port && !u.username && !u.password && RE_PUSH_HOST.test(u.hostname);
}
const u8b64u = u8 => bytesToB64(u8).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const u8cat = (...parts) => { const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };

let _vapid = null;
async function pushKeys(env, create) {
  if (_vapid) return _vapid;
  const d = await fsGet(env, 'admin_push/_vapid');
  let rec = d.exists && d.data.d && d.data.x && d.data.y ? d.data : null;
  if (!rec && create) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const j = await crypto.subtle.exportKey('jwk', kp.privateKey);
    const fresh = { d: j.d, x: j.x, y: j.y };
    const w = await fsCommit(env, [fsWrite(env, 'admin_push/_vapid', { fields: fresh, transforms: { serverTime: ['ts'] }, precondition: { exists: false } })]);
    if (w.ok) rec = fresh;
    else { const again = await fsGet(env, 'admin_push/_vapid'); if (again.exists && again.data.d) rec = again.data; }   // another request made it first
  }
  if (!rec) return null;
  const priv = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: rec.d, x: rec.x, y: rec.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const pub = new Uint8Array(65); pub[0] = 4; pub.set(b64urlToBytes(rec.x), 1); pub.set(b64urlToBytes(rec.y), 33);
  _vapid = { priv, pubB64: u8b64u(pub) };
  return _vapid;
}

// RFC 8291 "aes128gcm": one record, no padding (the last-record delimiter 0x02 is the only extra byte)
async function pushEncrypt(sub, payload) {
  const uaPub = b64urlToBytes(sub.p256dh), auth = b64urlToBytes(sub.auth);
  if (uaPub.length !== 65 || uaPub[0] !== 4 || auth.length !== 16) throw new Error('bad subscription keys');
  const te = new TextEncoder();
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = await crypto.subtle.importKey('raw', await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256), 'HKDF', false, ['deriveBits']);
  const ikm = await crypto.subtle.importKey('raw', await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: auth, info: u8cat(te.encode('WebPush: info\0'), uaPub, asPub) }, secret, 256), 'HKDF', false, ['deriveBits']);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await crypto.subtle.importKey('raw', await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('Content-Encoding: aes128gcm\0') }, ikm, 128), 'AES-GCM', false, ['encrypt']);
  const nonce = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('Content-Encoding: nonce\0') }, ikm, 96);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cek, u8cat(payload, Uint8Array.of(2))));
  const head = new Uint8Array(21); head.set(salt); new DataView(head.buffer).setUint32(16, 4096); head[20] = 65;
  return u8cat(head, asPub, ct);
}

// RFC 8292: a short-lived signed token that names the push service, so it knows which server is calling
async function vapidHeader(env, endpoint) {
  const k = await pushKeys(env, true);
  if (!k) throw new Error('no vapid key');
  const h = b64url({ typ: 'JWT', alg: 'ES256' });
  const c = b64url({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:' + ADMIN_EMAIL });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k.priv, new TextEncoder().encode(h + '.' + c)));   // raw r||s = what ES256 wants
  return `vapid t=${h}.${c}.${u8b64u(sig)}, k=${k.pubB64}`;
}

async function pushSubs(env) {
  const rows = await fsQuery(env, 'admin_push', { limit: PUSH_MAX_DEVICES + 5 });
  return rows.filter(r => r.id !== '_vapid' && pushEndpointOk(r.data.endpoint) && r.data.p256dh && r.data.auth).slice(0, PUSH_MAX_DEVICES + 5)
    .map(r => ({ id: r.id, endpoint: r.data.endpoint, p256dh: r.data.p256dh, auth: r.data.auth, label: String(r.data.label || ''), ts: r.data.ts || null }));
}

async function pushSendOne(env, sub, bytes, ttl) {
  const host = new URL(sub.endpoint).hostname;
  try {
    const r = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'TTL': String(ttl), 'Urgency': 'high', 'Authorization': await vapidHeader(env, sub.endpoint) },
      body: await pushEncrypt(sub, bytes),
    });
    if (r.status === 404 || r.status === 410) return { id: sub.id, host, status: r.status, ok: false, gone: true };   // the device unsubscribed or was uninstalled
    if (!r.ok) console.error('PUSH_ERROR host=' + host + ' status=' + r.status);
    return { id: sub.id, host, status: r.status, ok: r.ok, gone: false };
  } catch (e) { console.error('PUSH_FAIL host=' + host + ' ' + e.message); return { id: sub.id, host, status: 0, ok: false, gone: false }; }
}

// msg: { t, title, body, oid?, tag? } → every enabled device. Never throws.
async function pushAdmin(env, msg, ttl = 6 * 3600) {
  try {
    const subs = await pushSubs(env);
    if (!subs.length) return { sent: 0, failed: 0, devices: 0, results: [] };
    const bytes = new TextEncoder().encode(JSON.stringify(msg));
    if (bytes.length > 3000) return { sent: 0, failed: subs.length, devices: subs.length, results: [] };
    const results = await Promise.all(subs.map(s => pushSendOne(env, s, bytes, ttl)));
    const dead = results.filter(r => r.gone);
    if (dead.length) await fsCommit(env, dead.map(r => fsWrite(env, `admin_push/${r.id}`, { delete: true })));
    return { sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, devices: subs.length, results };
  } catch (e) { console.error('PUSH_ALL_FAIL ' + e.message); return { sent: 0, failed: 0, devices: 0, results: [], error: true }; }
}

// POST /admin/push { idToken, action: key | subscribe | unsubscribe | list | test }
async function handleAdminPush(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  const body = await readJson(request, 4096);
  if (!body) return json({ error: 'Invalid data' }, 400, cors);
  const a = await who(body.idToken, env, cors, false);
  if (a.err) return a.err;
  if (!isAdminClaims(a.claims, env)) return json({ error: 'Forbidden' }, 403, cors);
  if (hit('apush', 60, 600000)) return json({ error: 'Too many requests' }, 429, cors);
  const act = String(body.action || '');
  try {
    if (act === 'key') {
      const k = await pushKeys(env, true);
      if (!k) return json({ error: 'Could not prepare the key' }, 503, cors);
      return json({ ok: true, key: k.pubB64 }, 200, cors);
    }
    if (act === 'list') {
      const subs = await pushSubs(env);
      return json({ ok: true, max: PUSH_MAX_DEVICES, devices: subs.map(s => ({ id: s.id, host: new URL(s.endpoint).hostname, label: s.label })) }, 200, cors);
    }
    if (act === 'subscribe' || act === 'unsubscribe') {
      const s = body.subscription || {};
      const endpoint = act === 'subscribe' ? s.endpoint : (body.endpoint || s.endpoint);
      if (!pushEndpointOk(endpoint)) return json({ error: 'Unsupported push service' }, 400, cors);
      const id = (await sha256Hex(endpoint)).slice(0, 24);
      if (act === 'unsubscribe') {
        const w = await fsCommit(env, [fsWrite(env, `admin_push/${id}`, { delete: true })]);
        return w.ok ? json({ ok: true }, 200, cors) : json({ error: 'Could not remove it' }, 503, cors);
      }
      const keys = s.keys || {};
      let okKeys = false;
      try { okKeys = typeof keys.p256dh === 'string' && typeof keys.auth === 'string' && b64urlToBytes(keys.p256dh).length === 65 && b64urlToBytes(keys.auth).length === 16; } catch { okKeys = false; }
      if (!okKeys) return json({ error: 'Invalid subscription' }, 400, cors);
      const others = (await pushSubs(env)).filter(x => x.id !== id);
      if (others.length >= PUSH_MAX_DEVICES) return json({ error: 'Too many devices — remove one first' }, 409, cors);
      const w = await fsCommit(env, [fsWrite(env, `admin_push/${id}`, { fields: { endpoint, p256dh: keys.p256dh, auth: keys.auth, label: cleanText(body.label, 60) }, transforms: { serverTime: ['ts'] } })]);
      return w.ok ? json({ ok: true, id }, 200, cors) : json({ error: 'Could not save it' }, 503, cors);
    }
    if (act === 'test') {
      if (hit('apush-test', 12, 600000)) return json({ error: 'Too many requests' }, 429, cors);
      const r = await pushAdmin(env, { t: 'test', title: '✅ Glitch Q', body: 'الإشعارات تعمل — هكذا سيصلك كل طلب جديد.', tag: 'gq-test' }, 300);
      return json({ ok: true, devices: r.devices, sent: r.sent, failed: r.failed, results: r.results.map(x => ({ host: x.host, status: x.status })) }, 200, cors);
    }
  } catch (e) { console.error('ADMIN_PUSH_FAIL ' + e.message); return json({ error: 'Internal error' }, 500, cors); }
  return json({ error: 'Unknown action' }, 400, cors);
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
  if (await pointsPaused(env)) return json({ ok: false, reason: 'paused' }, 200, cors);
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
  if (await pointsPaused(env)) return json({ ok: false, reason: 'paused' }, 200, cors);
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
  const [e, u, paused] = await Promise.all([loadEcon(env), fsGet(env, `users/${g.uid}`), pointsPaused(env)]);
  if (!u.exists) return json({ ok: false, reason: 'nouser' }, 404, cors);
  const points = Math.max(0, Math.floor(Number(u.data.points) || 0)), red = redeemablePts(u.data, e);
  return json({
    ok: true, paused, points, redeemablePts: red, lockedPts: points - red, ptDZD: e.ptDZD, refMaxPts: e.refMaxPts, refMinOrderDZD: e.refMinOrderDZD,
    rewards: e.rewards.map(r => ({ id: r.id, name: r.name, nameEn: r.nameEn, pts: rewardPts(r, e) })),
  }, 200, cors);
}

async function handleRedeem(request, env, cors) {
  const g = await account(request, env, cors); if (g.err) return g.err;
  if (await pointsPaused(env)) return json({ ok: false, reason: 'paused' }, 200, cors);
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
const MAX_CODES_PER_MAIL = 20;
async function handleAdminSendCode(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  const body = await readJson(request, 12288);
  if (!body) return json({ error: 'Invalid data' }, 400, cors);
  const a = await who(body.idToken, env, cors, false);
  if (a.err) return a.err;
  if (!isAdminClaims(a.claims, env)) return json({ error: 'Forbidden' }, 403, cors);
  if (hit('sendcode', 60, 600000)) return json({ error: 'Too many requests' }, 429, cors);

  // one e-mail can carry several codes (e.g. a 20€ order delivered as four 5€ cards); `code` (a single string) is still accepted
  const rawCodes = Array.isArray(body.codes) ? body.codes : [body.code];
  if (rawCodes.length > MAX_CODES_PER_MAIL) return json({ error: 'Too many codes' }, 400, cors);
  const codes = [...new Set(rawCodes.map(c => cleanText(c, 300)).filter(Boolean))];
  if (!codes.length) return json({ error: 'Code required' }, 400, cors);
  const code = codes[0];
  const note = cleanText(body.note, 200);
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
    subject: codes.length > 1 ? `طلبك جاهز — أكوادك (${codes.length}) | Glitch Q` : 'طلبك جاهز — الكود الخاص بك | Glitch Q',
    html: buildCodeEmail({ product, code, codes, note, orderId, validity: codeValidity(until) }),
    text: buildCodeText({ product, code, codes, note, orderId, validity: codeValidity(until) }),
  });
  if (!sent.ok) return json({ error: sent.why }, 502, cors);
  return json({ ok: true, to: maskEmail(to), count: codes.length }, 200, cors);
}
/* ═══════════════════════════════════════
   ONE ACCOUNT PER E-MAIL INBOX
   Firebase already refuses the same address twice, but "a.b@gmail.com", "ab@gmail.com" and "ab+x@gmail.com" are three different
   strings for Firebase and ONE inbox for Gmail. The Worker reduces an address to the inbox it really reaches and keeps a registry
   `email_keys/{sha256(inbox)} → { uid }` (owner/Worker only, by the catch-all rule). A second sign-up for the same inbox is refused
   and the half-created duplicate is removed. Existing accounts are never blocked at login: they just fill the registry.
═══════════════════════════════════════ */
const PLUS_DOMAINS = new Set(['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'pm.me', 'fastmail.com']);
function canonEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return e;
  let local = e.slice(0, at), dom = e.slice(at + 1);
  if (dom === 'googlemail.com') dom = 'gmail.com';
  if (dom === 'gmail.com') { const l = local.split('+')[0].replace(/\./g, ''); if (l) local = l; }
  else if (PLUS_DOMAINS.has(dom)) { const l = local.split('+')[0]; if (l) local = l; }
  return local + '@' + dom;
}
const emailKeyId = async email => (await sha256Hex(canonEmail(email))).slice(0, 40);

// Deletes a Firebase Authentication user through the Identity Toolkit admin API. {ok} | {ok:false, code}
async function authDeleteUser(env, uid) {
  const adminToken = await getAdminToken(env);
  if (!adminToken) return { ok: false, code: 'NO_ADMIN_TOKEN' };
  const PROJECT_ID = pid(env);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'X-Goog-User-Project': PROJECT_ID },
    body: JSON.stringify({ localId: uid }),
  });
  if (res.ok) return { ok: true };
  const eb = await res.json().catch(() => ({}));
  const code = String((eb && eb.error && (eb.error.message || eb.error.status)) || res.status).slice(0, 60);
  if (/USER_NOT_FOUND/.test(code)) return { ok: true, gone: true };
  console.error('AUTH_DELETE_ERROR status=' + res.status + ' ' + code);
  return { ok: false, code };
}

/* ═══════════════════════════════════════
   IS THIS E-MAIL ADDRESS REAL?  (sign-up pre-check, repeated server-side after the account is created)
   What can honestly be proven without sending a message: the address is well formed, it is not a throw-away inbox, it is not a
   typo of a famous provider, and its domain really exists and accepts mail (a DNS MX lookup through Cloudflare's resolver).
   Whether the MAILBOX itself exists can only be proven by the activation link, which stays mandatory: an account whose e-mail
   was not confirmed cannot sign in. If the DNS lookup cannot be completed the address is let through (the link still decides).
═══════════════════════════════════════ */
const DISPOSABLE_DOMAINS = new Set(('mailinator.com guerrillamail.com guerrillamail.net guerrillamail.org guerrillamail.biz guerrillamail.de guerrillamail.info guerrillamailblock.com ' +
  'sharklasers.com grr.la spam4.me pokemail.net 10minutemail.com 10minutemail.net 20minutemail.com tempmail.com temp-mail.org temp-mail.io tempmail.net tempmailo.com tempail.com ' +
  'yopmail.com yopmail.fr yopmail.net cool.fr.nf jetable.org trashmail.com trashmail.net trashmail.de trash-mail.com getnada.com nada.email dispostable.com maildrop.cc mailnesia.com ' +
  'mailcatch.com mintemail.com throwawaymail.com fakeinbox.com fakemail.net emailondeck.com mohmal.com burnermail.io spamgourmet.com mytemp.email tmail.ws tmpmail.org tmpmail.net ' +
  'moakt.com mailtemp.net inboxkitten.com discard.email discardmail.com mail.tm 1secmail.com 1secmail.net 1secmail.org harakirimail.com mailsac.com emailfake.com tempinbox.com ' +
  'mvrht.net byom.de anonbox.net spambox.us mailforspam.com tempr.email dropmail.me emltmp.com luxusmail.org gettempmail.com tempmailer.com owlymail.com mail7.io ' +
  'tempmailaddress.com temporary-mail.net throwam.com spamex.com getairmail.com mailpoof.com tempmailnow.com fexpost.com fexbox.org tmailor.com').split(' '));
const MAIL_TYPOS = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'gmaill.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmeil.com': 'gmail.com', 'gmail.comm': 'gmail.com', 'gmail.co': 'gmail.com', 'gimail.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotnail.com': 'hotmail.com',
  'yahooo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yahho.com': 'yahoo.com', 'yaho.com': 'yahoo.com',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'outloook.com': 'outlook.com', 'iclould.com': 'icloud.com', 'icloud.con': 'icloud.com', 'live.con': 'live.com',
};
const RE_MAIL_DOMAIN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const mailDomainCache = new Map();   // domain -> { v: 'ok'|'none', until }
async function dohAnswers(name, type) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 2500);
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' }, signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || typeof j.Status !== 'number') return null;
    return { status: j.Status, answers: Array.isArray(j.Answer) ? j.Answer : [] };
  } catch { return null; } finally { clearTimeout(timer); }
}
/* 'ok' = it receives mail · 'none' = the domain does not exist or says it takes no mail · 'unknown' = could not be checked */
async function mailDomainStatus(domain) {
  const c = mailDomainCache.get(domain);
  if (c && c.until > Date.now()) return c.v;
  const mx = await dohAnswers(domain, 'MX');
  if (!mx) return 'unknown';
  let v;
  if (mx.status === 3) v = 'none';
  else if (mx.status !== 0) return 'unknown';
  else {
    const recs = mx.answers.filter(a => a.type === 15).map(a => String(a.data || '').trim());
    if (recs.length) v = recs.every(d => /^\d+\s+\.?$/.test(d)) ? 'none' : 'ok';        // "0 ." is the explicit "this domain takes no mail" record
    else {                                                                              // no MX: mail servers fall back to the address records
      const [a4, a6] = await Promise.all([dohAnswers(domain, 'A'), dohAnswers(domain, 'AAAA')]);
      if (!a4 && !a6) return 'unknown';
      v = ((a4 && a4.answers.some(x => x.type === 1)) || (a6 && a6.answers.some(x => x.type === 28))) ? 'ok' : 'none';
    }
  }
  if (mailDomainCache.size > 2000) mailDomainCache.clear();
  mailDomainCache.set(domain, { v, until: Date.now() + (v === 'ok' ? 6 * 3600000 : 600000) });
  return v;
}
/* -> { ok: true, checked: bool } | { ok: false, code: 'bad_format'|'typo'|'disposable'|'bad_domain', suggest? } */
async function checkEmailAddress(raw) {
  const email = String(raw || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (email.length > 254 || at < 1 || !RE_EMAIL.test(email)) return { ok: false, code: 'bad_format' };
  const local = email.slice(0, at);
  let domain = email.slice(at + 1);
  try { domain = new URL('http://' + domain).hostname; } catch { return { ok: false, code: 'bad_format' }; }   // punycode for non-ASCII names
  if (!RE_MAIL_DOMAIN.test(domain) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return { ok: false, code: 'bad_format' };
  if (MAIL_TYPOS[domain]) return { ok: false, code: 'typo', suggest: local + '@' + MAIL_TYPOS[domain] };
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) if (DISPOSABLE_DOMAINS.has(parts.slice(i).join('.'))) return { ok: false, code: 'disposable' };
  const st = await mailDomainStatus(domain);
  if (st === 'none') return { ok: false, code: 'bad_domain' };
  return { ok: true, checked: st === 'ok' };
}
async function handleCheckEmail(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (hit('chk:' + clientIp(request), 30, 600000)) return json({ error: 'Too many requests' }, 429, cors);
  const body = await readJson(request, 1024);
  if (!body) return json({ error: 'Invalid data' }, 400, cors);
  return json(await checkEmailAddress(body.email), 200, cors);
}
/* A brand-new, unverified, empty account is removed again. Anything else (verified, has orders…) is left alone. */
async function removeFreshAccount(env, claims, uid) {
  const mine = await fsGet(env, `users/${uid}`);
  const fresh = claims.email_verified !== true && (!mine.exists || ((Number(mine.data.orders) || 0) === 0 && (Number(mine.data.totalSpend) || 0) === 0));
  if (!fresh) return false;
  const del = await authDeleteUser(env, uid);
  if (del.ok) await fsCommit(env, [fsWrite(env, `users/${uid}`, { delete: true })]);
  else console.error('FRESH_CLEANUP_FAILED uid=' + uid.slice(0, 8) + ' ' + del.code);
  return del.ok;
}

async function handleClaimEmail(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (hit('clm:' + clientIp(request), 20, 600000)) return json({ error: 'Too many requests' }, 429, cors);
  const body = await readJson(request, 2048);
  if (!body) return json({ error: 'Invalid data' }, 400, cors);
  const a = await who(body.idToken, env, cors, false);
  if (a.err) return a.err;
  const claims = a.claims, uid = claims.sub;
  if (hit('clmu:' + uid, 10, 600000)) return json({ error: 'Too many requests' }, 429, cors);
  const email = String(claims.email || '').toLowerCase();
  if (!RE_EMAIL.test(email)) return json({ ok: true, skipped: true }, 200, cors);
  const register = body.mode === 'register';
  if (register) {                                        // the pre-check in the browser can be skipped by a script: it is enforced here too
    const chk = await checkEmailAddress(email);
    if (!chk.ok) { await removeFreshAccount(env, claims, uid); return json({ ok: false, code: chk.code, suggest: chk.suggest }, 422, cors); }
  }
  const key = await emailKeyId(email);
  const path = `email_keys/${key}`;

  let owner = null;                                      // uid of ANOTHER live account that already holds this inbox
  for (let i = 0; i < 3 && !owner; i++) {
    const cur = await fsGet(env, path);
    if (cur.exists && cur.data.uid === uid) return json({ ok: true }, 200, cors);
    if (cur.exists) {
      const o = await fsGet(env, `users/${cur.data.uid}`);
      if (o.exists) { owner = String(cur.data.uid); break; }
      // the account that held it is gone: take the address over
      const r = await fsCommit(env, [fsWrite(env, path, { fields: { uid, email, ts: Date.now() }, precondition: { updateTime: cur.updateTime } })]);
      if (r.ok) return json({ ok: true }, 200, cors);
      continue;
    }
    if (register) {                                      // not in the registry yet: older accounts may still hold the exact same address
      const same = await fsQuery(env, 'users', { filters: [['email', 'EQUAL', email]], limit: 5 });
      const other = same.find(d => d.id !== uid);
      if (other) { owner = other.id; break; }
    }
    const r = await fsCommit(env, [fsWrite(env, path, { fields: { uid, email, ts: Date.now() }, precondition: { exists: false } })]);
    if (r.ok) return json({ ok: true }, 200, cors);
  }
  if (!owner) return json({ error: 'Please try again' }, 503, cors);

  if (!register) {
    // A second account on the same inbox that was NOT created through the sign-up form (it can be made by calling Firebase directly) is
    // refused at sign-in when it is newer than the account that owns the inbox and has no orders. It is never deleted here; older
    // accounts and accounts that bought something are never refused (they show in the owner's duplicates list instead).
    try {
      const [mine, theirs] = await Promise.all([fsGet(env, `users/${uid}`), fsGet(env, `users/${owner}`)]);
      const tMine = mine.exists ? Date.parse(mine.data.created) : NaN, tTheirs = theirs.exists ? Date.parse(theirs.data.created) : NaN;
      const empty = mine.exists && (Number(mine.data.orders) || 0) === 0 && (Number(mine.data.totalSpend) || 0) === 0;
      if (empty && Number.isFinite(tMine) && Number.isFinite(tTheirs) && tMine > tTheirs) return json({ ok: false, code: 'email_taken' }, 409, cors);
    } catch (e) { console.error('DUP_LOGIN_CHECK_FAILED ' + (e && e.message)); }
    return json({ ok: true, duplicate: true }, 200, cors);
  }

  await removeFreshAccount(env, claims, uid);
  return json({ ok: false, code: 'email_taken' }, 409, cors);
}

/* ═══════════════════════════════════════
   DELETE A CUSTOMER ACCOUNT (store owner only)
   Removes the sign-in (Firebase Authentication) FIRST, then the profile. Orders are accounting records and stay.
   If the service account is not allowed to delete sign-ins, nothing is touched unless the owner chose `dataOnly`:
   then the profile is removed and the sign-in is blocked with a permanent suspension instead.
═══════════════════════════════════════ */
async function handleAdminDeleteUser(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  const body = await readJson(request, 2048);
  if (!body) return json({ error: 'Invalid data' }, 400, cors);
  const a = await who(body.idToken, env, cors, false);
  if (a.err) return a.err;
  if (!isAdminClaims(a.claims, env)) return json({ error: 'Forbidden' }, 403, cors);
  if (hit('deluser', 30, 600000)) return json({ error: 'Too many requests' }, 429, cors);

  const uid = String(body.uid || '');
  if (!RE_UID.test(uid)) return json({ error: 'Invalid uid' }, 400, cors);
  if (uid === a.claims.sub) return json({ error: 'The owner account cannot be deleted' }, 403, cors);
  const u = await fsGet(env, `users/${uid}`);
  const email = u.exists ? String(u.data.email || '').toLowerCase() : '';
  if (email === ADMIN_EMAIL) return json({ error: 'The owner account cannot be deleted' }, 403, cors);
  const want = String(body.confirm || '').trim().toLowerCase();
  if (want !== (email || uid.toLowerCase())) return json({ error: 'Confirmation does not match' }, 400, cors);

  const dataOnly = body.dataOnly === true;
  let authDeleted = false;
  if (!dataOnly) {
    const del = await authDeleteUser(env, uid);
    if (!del.ok) return json({ error: 'auth_delete_failed', detail: del.code }, 502, cors);
    authDeleted = true;
  }
  const writes = [fsWrite(env, `users/${uid}`, { delete: true })];
  if (dataOnly) writes.push(fsWrite(env, `banned_users/${uid}`, { fields: { reason: 'حساب محذوف', date: dzDate(), until: 0 } }));
  else writes.push(fsWrite(env, `banned_users/${uid}`, { delete: true }));
  if (email) {
    const kid = await emailKeyId(email);
    const k = await fsGet(env, `email_keys/${kid}`);
    if (k.exists && k.data.uid === uid) writes.push(fsWrite(env, `email_keys/${kid}`, { delete: true }));
  }
  writes.push(fsWrite(env, `admin_log/${randomId(20)}`, { fields: { action: 'delete-user', uid, email, authDeleted, dataOnly, by: a.claims.sub }, transforms: { serverTime: ['ts'] } }));
  const r = await fsCommit(env, writes);
  if (!r.ok) return json({ error: 'Could not remove the profile', authDeleted }, 503, cors);
  await tgSend(env, `🗑️ Account deleted\n🔑 ${uid}\n📧 ${email || '—'}\n${authDeleted ? '✅ sign-in removed' : '⛔ sign-in blocked (data only)'}`);
  return json({ ok: true, authDeleted }, 200, cors);
}

/* ═══════════════════════════════════════
   SIGN-UPS THAT WERE NEVER ACTIVATED (store owner only)
   A Firebase account exists the moment someone signs up, even with a made-up address. It cannot sign in until the activation link
   is clicked, and since v13 the browser no longer writes a customer profile before that. This route lets the owner's panel
     • "list":  learn which accounts are still waiting for activation, so the panel can keep them out of the customer list/counts;
     • "purge": delete the ones older than `hours` (min 1): their sign-in, profile document (if any) and inbox registry entry.
   Never touched: activated accounts, disabled accounts, the owner, non-password sign-ins, and any profile that has orders/spend.
   At most PURGE_PER_CALL accounts per call (the panel repeats the call) to stay under the Worker's sub-request limit.
═══════════════════════════════════════ */
const PENDING_MAX_UIDS = 3000;
const PURGE_PER_CALL = 8;
async function listPendingAccounts(env) {
  const adminToken = await getAdminToken(env);
  if (!adminToken) return { ok: false, code: 'NO_ADMIN_TOKEN' };
  const PROJECT_ID = pid(env);
  const list = [];
  let pageToken = '', pages = 0;
  do {
    const url = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet?maxResults=500` + (pageToken ? '&nextPageToken=' + encodeURIComponent(pageToken) : '');
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${adminToken}`, 'X-Goog-User-Project': PROJECT_ID } });
    if (!res.ok) {
      const eb = await res.json().catch(() => ({}));
      const code = String((eb && eb.error && (eb.error.message || eb.error.status)) || res.status).slice(0, 60);
      console.error('AUTH_LIST_ERROR status=' + res.status + ' ' + code);
      return { ok: false, code };
    }
    const j = await res.json().catch(() => ({}));
    for (const u of (Array.isArray(j.users) ? j.users : [])) {
      if (!u || !RE_UID.test(String(u.localId || ''))) continue;
      if (u.emailVerified === true || u.disabled === true) continue;
      const email = String(u.email || '').toLowerCase();
      if (!email || email === ADMIN_EMAIL) continue;
      const viaPassword = (Array.isArray(u.providerUserInfo) && u.providerUserInfo.some(x => x && x.providerId === 'password')) || !!u.passwordHash;
      if (!viaPassword) continue;
      list.push({ uid: String(u.localId), email, created: Number(u.createdAt) || 0 });
      if (list.length >= PENDING_MAX_UIDS) break;
    }
    pageToken = String(j.nextPageToken || '');
    pages++;
  } while (pageToken && pages < 10 && list.length < PENDING_MAX_UIDS);
  return { ok: true, list, truncated: !!pageToken };
}
async function handleAdminUnverified(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  const body = await readJson(request, 8192);
  if (!body) return json({ error: 'Invalid data' }, 400, cors);
  const a = await who(body.idToken, env, cors, false);
  if (a.err) return a.err;
  if (!isAdminClaims(a.claims, env)) return json({ error: 'Forbidden' }, 403, cors);
  if (hit('unver', 120, 600000)) return json({ error: 'Too many requests' }, 429, cors);

  const hours = Math.max(1, Math.min(24 * 365, Math.floor(Number(body.hours)) || 24));
  const cutoff = Date.now() - hours * 3600000;
  const listed = await listPendingAccounts(env);
  if (!listed.ok) return json({ error: 'auth_list_failed', detail: listed.code }, 502, cors);
  const all = listed.list;

  if (body.action !== 'purge') {
    const old = all.filter(x => x.created && x.created <= cutoff);
    return json({ ok: true, count: all.length, uids: all.map(x => x.uid), old: old.length, hours, truncated: listed.truncated, sample: old.slice(0, 5).map(x => maskEmail(x.email)) }, 200, cors);
  }

  const except = new Set((Array.isArray(body.except) ? body.except : []).slice(0, 300).map(String).filter(x => RE_UID.test(x)));
  const old = all.filter(x => x.created && x.created <= cutoff && !except.has(x.uid));
  const batch = old.slice(0, PURGE_PER_CALL);
  let deleted = 0, failed = 0, failCode = '';
  const keptUids = [], writes = [];
  for (const u of batch) {
    const mine = await fsGet(env, `users/${u.uid}`);
    if (mine.exists && ((Number(mine.data.orders) || 0) > 0 || (Number(mine.data.totalSpend) || 0) > 0)) { keptUids.push(u.uid); continue; }
    const del = await authDeleteUser(env, u.uid);
    if (!del.ok) { failed++; failCode = del.code; break; }
    deleted++;
    writes.push(fsWrite(env, `users/${u.uid}`, { delete: true }));
    const kid = await emailKeyId(u.email);
    const k = await fsGet(env, `email_keys/${kid}`);
    if (k.exists && k.data.uid === u.uid) writes.push(fsWrite(env, `email_keys/${kid}`, { delete: true }));
  }
  if (!deleted && failed) return json({ error: 'auth_delete_failed', detail: failCode }, 502, cors);
  if (deleted) {
    writes.push(fsWrite(env, `admin_log/${randomId(20)}`, { fields: { action: 'purge-unverified', deleted, hours, by: a.claims.sub }, transforms: { serverTime: ['ts'] } }));
    const r = await fsCommit(env, writes);
    if (!r.ok) console.error('PURGE_COMMIT_FAILED');
    await tgSend(env, `🧹 Removed ${deleted} never-activated sign-up(s) older than ${hours}h`);
  }
  return json({ ok: true, deleted, kept: keptUids.length, keptUids, failed, remaining: old.length - batch.length, pending: all.length - deleted }, 200, cors);
}

/* ═══════════════════════════════════════
   E-MAIL A NOTIFICATION (store owner only). The in-site notification is written by the owner's panel; this adds the e-mail copy.
   Recipients are user ids: the address is read from the stored profile here, never taken from the browser.
   Brevo's free plan (~300/day) is shared with order codes, resets and verification mails, so notification mail has its own daily
   ceiling and a request stops (and says so) when it is used up.
═══════════════════════════════════════ */
const NOTIF_MAILS_PER_DAY = 150;
const NOTIF_MAILS_PER_CALL = 15;
async function reserveNotifMail(env, want) {
  const key = 'notifmail_' + dzDay();
  let granted = 0, left = 0;
  try {
    const r = await fsUpdate(env, `rate_limits/${key}`, cur => {
      const now = Date.now();
      const live = cur.exists && Number(cur.data.until) > now;
      const n = live ? (Number(cur.data.n) || 0) : 0;
      granted = Math.max(0, Math.min(want, NOTIF_MAILS_PER_DAY - n));
      left = NOTIF_MAILS_PER_DAY - n - granted;
      if (!granted) return { abort: 'over' };
      return { fields: { n: n + granted, until: live ? Number(cur.data.until) : now + 36 * 3600 * 1000 } };
    });
    if (!r.ok) return { granted: 0, left: r.aborted ? 0 : -1 };
  } catch (e) { console.error('NOTIF_BUDGET_FAIL ' + e.message); return { granted: 0, left: -1 }; }
  return { granted, left };
}
function buildNotifEmail({ title, lines, name }) {
  const t = MAIL_TONE.crimson;
  const hello = name ? `<p dir="rtl" style="margin:0 0 14px;${MB}font-size:15px;line-height:1.9;color:${MC.p};">أهلاً <strong style="color:#FFFFFF;"><span dir="auto" style="unicode-bidi:isolate;">${escHtml(name)}</span></strong>،</p>` : '';
  const body = [
    mH1(`<span dir="auto" style="unicode-bidi:isolate;">${escHtml(title)}</span>`),
    hello,
    ...lines.map(l => mP(`<span dir="auto" style="unicode-bidi:isolate;">${escHtml(l)}</span>`)),
    mGap(6),
    mButton(escHtml(SITE_URL), 'فتح المتجر', t),
    mGap(18),
  ].join('\n');
  return mailShell({
    tone: 'crimson',
    label: 'رسالة من المتجر',
    title: `${title} — Glitch Q`,
    preheader: lines[0] || title,
    body,
    note: 'وصلتك هذه الرسالة لأنك مسجّل في متجر Glitch Q. ستجد الإشعار نفسه داخل حسابك في الموقع (أيقونة الجرس).',
  });
}
function buildNotifText({ title, lines, name }) {
  return `${title} — Glitch Q\n\n${name ? `أهلاً ${name}،\n` : ''}${lines.join('\n')}\n\nافتح المتجر: ${SITE_URL}\n\nوصلتك هذه الرسالة لأنك مسجّل في متجر Glitch Q. ستجد الإشعار نفسه داخل حسابك في الموقع.\n\nGlitch Q`;
}
async function handleAdminNotifyEmail(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  const body = await readJson(request, 12 * 1024);
  if (!body) return json({ error: 'Invalid data' }, 400, cors);
  const a = await who(body.idToken, env, cors, false);
  if (a.err) return a.err;
  if (!isAdminClaims(a.claims, env)) return json({ error: 'Forbidden' }, 403, cors);
  if (hit('notifmail', 120, 600000)) return json({ error: 'Too many requests' }, 429, cors);

  const title = cleanText(body.title, 120);
  const lines = String(body.text == null ? '' : body.text).split(/\r?\n/).slice(0, 20).map(l => cleanText(l, 500)).filter(Boolean);
  const uids = [...new Set((Array.isArray(body.uids) ? body.uids : []).map(String).filter(x => RE_UID.test(x)))].slice(0, NOTIF_MAILS_PER_CALL);
  if (!title || !uids.length) return json({ error: 'Title and recipients required' }, 400, cors);

  const budget = await reserveNotifMail(env, uids.length);
  if (!budget.granted) return json({ ok: true, sent: 0, failed: 0, noEmail: 0, limited: uids.length, left: Math.max(0, budget.left), busy: budget.left < 0 }, 200, cors);
  let sent = 0, failed = 0, noEmail = 0;
  const go = uids.slice(0, budget.granted);
  for (const uid of go) {
    let u;
    try { u = await fsGet(env, `users/${uid}`); } catch { failed++; continue; }
    const to = u.exists && RE_EMAIL.test(String(u.data.email || '').trim()) ? String(u.data.email).trim().toLowerCase() : '';
    if (!to) { noEmail++; continue; }
    const name = cleanText(u.data.firstName || '', 40);
    const r = await sendBrevo(env, { to, subject: `${title} | Glitch Q`, html: buildNotifEmail({ title, lines, name }), text: buildNotifText({ title, lines, name }) });
    if (r.ok) sent++; else failed++;
  }
  return json({ ok: true, sent, failed, noEmail, limited: uids.length - go.length, left: budget.left }, 200, cors);
}

/* ═══════════════════════════════════════
   PASSWORD RESET — Firebase link + Brevo email
═══════════════════════════════════════ */
// Rate limit for reset: 1 request per email per 5 minutes
const resetStore = new Map();

// Durable counter (Firestore document rate_limits/{key}, owner/Worker only by the catch-all rule). The in-memory hit() above lives
// inside ONE Worker instance, and Cloudflare runs many, so it cannot protect a shared quota (Brevo's free plan sends ~300 mails/day for
// everything: order codes, resets, alerts). Returns true when the caller is OVER the limit. If Firestore itself fails it answers
// false (the in-memory limiter still applies) rather than blocking every customer.
async function dHit(env, key, max, windowSec) {
  try {
    const r = await fsUpdate(env, `rate_limits/${key}`, cur => {
      const now = Date.now();
      const live = cur.exists && Number(cur.data.until) > now;
      const n = live ? (Number(cur.data.n) || 0) : 0;
      if (n >= max) return { abort: 'over' };
      return { fields: { n: n + 1, until: live ? Number(cur.data.until) : now + windowSec * 1000 } };
    });
    if (r.aborted || r.contention) return true;
    return false;
  } catch (e) { console.error('DHIT_FAIL ' + e.message); return false; }
}
const RESET_PER_EMAIL = { max: 3, windowSec: 3600 };   // one victim cannot be flooded
const RESET_MAILS_PER_DAY = 120;                       // keeps at least half of Brevo's daily quota free for order codes

async function handleResetPassword(request, env, cors) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  const body = await readJson(request, 1024);   // size-capped like every other route
  if (!body) return json({ error: 'Invalid JSON' }, 400, cors);

  const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
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
  // durable per-address limit (the in-memory one above resets whenever the Worker instance changes)
  if (await dHit(env, 'reset_' + (await sha256Hex(email)).slice(0, 40), RESET_PER_EMAIL.max, RESET_PER_EMAIL.windowSec)) return json({ ok: true }, 200, cors);

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

  // Only a real account reaches this point (an unknown address stopped above). A daily cap on reset mails protects the shared mail quota.
  if (await dHit(env, 'resetmail_' + dzDay(), RESET_MAILS_PER_DAY, 90000)) { console.error('RESET_DAILY_CAP_REACHED'); return json({ ok: true }, 200, cors); }

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
   ACCOUNT VERIFICATION — Firebase link + our own branded Brevo mail
   (replaces Firebase's plain English "Verify your email for project-…" message)
═══════════════════════════════════════ */
const VERIFY_PER_EMAIL = { max: 5, windowSec: 3600 };   // one address cannot be flooded
const VERIFY_MAILS_PER_DAY = 100;                       // reset (120) + this stay under Brevo's ~300/day, leaving room for order codes

async function handleSendVerification(request, env, cors) {
  const a = await authenticate(request, env, cors);       // the caller proves who they are with their own (unverified) ID token
  if (a.err) return a.err;
  const { claims } = a;
  const uid = claims.sub;
  const email = String(claims.email || '').trim().toLowerCase().slice(0, 254);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'No email address' }, 422, cors);
  if (claims.email_verified === true) return json({ ok: true, already: true }, 200, cors);
  if (!claims.firebase || claims.firebase.sign_in_provider !== 'password') return json({ error: 'Not applicable' }, 400, cors);

  if (hit('vfy:' + clientIp(request), 10, 600000)) return json({ error: 'Too many requests' }, 429, cors);
  if (throttled('verify_' + uid, 30000)) return json({ error: 'Too many requests' }, 429, cors);
  if (await dHit(env, 'verify_' + (await sha256Hex(email)).slice(0, 40), VERIFY_PER_EMAIL.max, VERIFY_PER_EMAIL.windowSec)) return json({ error: 'Too many requests' }, 429, cors);
  // 503 (not 429) when the shared daily quota is used up: the browser then falls back to Firebase's own message instead of leaving the customer with nothing
  if (await dHit(env, 'verifymail_' + dzDay(), VERIFY_MAILS_PER_DAY, 90000)) { console.error('VERIFY_DAILY_CAP_REACHED'); return json({ error: 'Mail quota reached' }, 503, cors); }

  let verifyLink;
  try {
    const adminToken = await getAdminToken(env);
    if (!adminToken) return json({ error: 'Server not ready' }, 500, cors);
    const PROJECT_ID = env.FIREBASE_PROJECT_ID || 'glitch-q';
    const fbRes = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:sendOobCode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'X-Firebase-Client': 'fire-admin-node/12.0.0', 'X-Goog-User-Project': PROJECT_ID },
      body: JSON.stringify({ requestType: 'VERIFY_EMAIL', email, returnOobLink: true }),
    });
    const fbData = await fbRes.json().catch(() => ({}));
    if (!fbRes.ok || !fbData.oobLink) { console.error('VERIFY_OOB_ERROR status=' + fbRes.status + ' body=' + JSON.stringify(fbData)); return json({ error: 'Failed' }, 502, cors); }
    const oobCode = new URL(fbData.oobLink).searchParams.get('oobCode');
    if (!oobCode) return json({ error: 'Failed' }, 502, cors);
    verifyLink = `${MAIL_SITE}reset.html?mode=verifyEmail&oobCode=${encodeURIComponent(oobCode)}`;   // the store's own page confirms it (applyActionCode)
  } catch (e) {
    console.error('Verify link error:', e.message);
    return json({ error: 'Failed' }, 502, cors);
  }

  const firstName = String(claims.name || '').trim().split(/\s+/)[0];
  const sent = await sendBrevo(env, {
    to: email,
    subject: 'فعّل حسابك | Glitch Q',
    html: buildVerifyEmail(verifyLink, firstName),
    text: buildVerifyText(verifyLink, firstName),
  });
  if (!sent.ok) return json({ error: sent.why }, 502, cors);
  console.log('VERIFY_MAIL_OK uid=' + uid.slice(0, 8));
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
  const body = await readJson(request, 8192);   // an ID token is at most 4096 characters; the cap stops oversized uploads
  if (!body) return { err: json({ error: 'Invalid JSON' }, 400, cors) };
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
  if (docRes.status === 404) return json({ ok: true, sent: false }, 200, cors);      // no profile document (e.g. the owner's Google account): nothing to alert about
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
/* Owner's "pause the points system" switch: settings/maintenance.pointsOff (the one public document the owner can already write; no rule change).
   Read through the 15-second cache. If the setting cannot be read the system counts as PAUSED: a kill switch must fail closed. */
async function pointsPaused(env) {
  try { return (await publicSetting(env, 'maintenance')).pointsOff === true; } catch { return true; }
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
const mH1 = (s) => `<h1 dir="rtl" class="h1" style="margin:0 0 12px;${MB}font-size:23px;line-height:1.45;font-weight:800;color:${MC.h};">${s}</h1>`;
const mP = (s, style = '') => `<p dir="rtl" style="margin:0 0 18px;${MB}font-size:15px;line-height:1.95;color:${MC.p};${style}">${s}</p>`;
const mSmall = (s) => `<p dir="rtl" style="margin:0 0 8px;${MB}font-size:12.5px;line-height:1.8;color:${MC.dim};">${s}</p>`;
const mHr = () => `<div style="height:1px;line-height:1px;font-size:1px;background-color:${MC.line};">&nbsp;</div>`;
const mEyebrow = (label, t) => `<p dir="rtl" style="margin:0 0 14px;${MB}font-size:13px;line-height:1.6;font-weight:700;color:${t.ink};"><span style="color:${t.bar};">&#9679;</span>&nbsp; ${escHtml(label)}</p>`;
const mBox = (inner, pad = '16px 18px') => `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td dir="rtl" bgcolor="${MC.box}" style="background-color:${MC.box};border:1px solid ${MC.line};border-radius:12px;padding:${pad};${MB}">${inner}</td></tr></table>`;
const mTintBox = (t, inner) => `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td dir="rtl" bgcolor="${t.tint}" style="background-color:${t.tint};border:1px solid ${t.line};border-radius:12px;padding:16px 18px;${MB}">${inner}</td></tr></table>`;
const mNote = (t, html) => mTintBox(t, `<div dir="rtl" style="${MB}font-size:14px;line-height:1.9;color:${t.ink};">${html}</div>`);

// A long one-time link in a box. table-layout:fixed keeps the letter exactly as wide as the screen even if a mail app ignores word-break.
const mLinkBox = (link, t) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;"><tr><td bgcolor="${MC.box}" style="background-color:${MC.box};border:1px solid ${MC.line};border-radius:10px;padding:12px 14px;font-family:${MAIL_MONO};font-size:11.5px;line-height:1.7;direction:ltr;text-align:left;word-break:break-all;overflow-wrap:anywhere;overflow:hidden;"><a href="${link}" target="_blank" style="color:${t.ink};text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${link}</a></td></tr></table>`;

// The gradient layer keeps Gmail's dark-mode colour shifting from turning the button salmon (it leaves background-images alone).
function mButton(href, label, t) {
  const bg = `background-color:${t.btn};background-image:linear-gradient(${t.btn},${t.btn});`;
  return `<table role="presentation" dir="rtl" class="btn-t" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>
  <td dir="rtl" class="btn-td" align="center" bgcolor="${t.btn}" style="${bg}border-radius:12px;">
    <a class="btn-a" href="${href}" target="_blank" style="display:block;padding:15px 12px;font-family:${MAIL_FONT};font-size:16px;line-height:1.3;font-weight:700;color:${t.btnText};text-decoration:none;border-radius:12px;">${label}</a>
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
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
<title>${escHtml(title)}</title>
<style>
  :root{color-scheme:dark;supported-color-schemes:dark}
  body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  a{text-decoration:none}
  a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important}
  @media only screen and (min-width:600px){
    .wrap{padding:28px 12px!important}
    .px{padding-left:32px!important;padding-right:32px!important}
    .h1{font-size:26px!important}
    .btn-t{width:auto!important}
    .btn-a{display:inline-block!important;padding-left:38px!important;padding-right:38px!important}
    .cd26{font-size:26px!important;letter-spacing:2px!important}
    .cd20{font-size:20px!important;letter-spacing:1px!important}
    .cd16{font-size:16px!important;letter-spacing:1px!important}
    .tk{padding-left:22px!important;padding-right:22px!important}
  }
</style>
</head>
<body dir="rtl" bgcolor="${MC.page}" style="margin:0;padding:0;background-color:${MC.page};direction:rtl;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${MC.page};font-size:1px;line-height:1px;">${escHtml(preheader)}${pad}</div>
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MC.page}" style="background-color:${MC.page};">
<tr><td dir="rtl" class="wrap" align="center" style="padding:20px 6px;">

  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MC.card}" style="width:100%;max-width:600px;background-color:${MC.card};border:1px solid ${MC.line};border-radius:18px;border-collapse:separate;overflow:hidden;">

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
    <tr><td dir="rtl" class="px" style="padding:30px 20px 14px;${MB}">
${mEyebrow(label, t)}
${body}
    </td></tr>

    <!-- Footer -->
    <tr><td dir="rtl" class="px" bgcolor="${MC.plate}" style="background-color:${MC.plate};border-top:1px solid ${MC.line};padding:22px 20px 26px;${MB}">
      <p dir="rtl" style="margin:0 0 12px;${MB}font-size:12.5px;line-height:1.8;color:${MC.dim};">${note}</p>
      ${extraFoot}
      <p dir="rtl" style="margin:0;${MB}font-size:11.5px;line-height:1.9;color:${MC.dim};"><span dir="ltr" style="unicode-bidi:isolate;font-family:Arial,Helvetica,sans-serif;font-weight:800;letter-spacing:2px;color:${MC.h};">GLITCH Q</span><br>متجر بطاقات ${lat('PlayStation')} في الجزائر<br>رسالة تلقائية، يرجى عدم الرد عليها &middot; &copy; ${year}</p>
    </td></tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->

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
    mLinkBox(link, t),
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

/* ── 1b) account verification ────────────────────────────────────────── */
// (this part of the file is also evaluated on its own by the template tests, so it must not lean on helpers defined above it)
const mailName = (s) => safeName(String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30));
function buildVerifyEmail(verifyLink, firstName) {
  const link = escHtml(verifyLink);
  const t = MAIL_TONE.crimson;
  const name = mailName(firstName);
  const body = [
    mH1('فعّل حسابك'),
    mP(`${name ? `أهلاً <strong style="color:#FFFFFF;"><span dir="auto" style="unicode-bidi:isolate;">${escHtml(name)}</span></strong>، ` : ''}شكراً لتسجيلك في متجر ${lat('Glitch Q')}. اضغط الزر أدناه لتأكيد بريدك الإلكتروني وتفعيل حسابك.`),
    mButton(link, 'تفعيل الحساب', t),
    mGap(26),
    `<p dir="rtl" style="margin:0 0 14px;${MB}font-size:16px;line-height:1.6;font-weight:800;color:${MC.h};">ماذا بعد الضغط؟</p>`,
    mSteps([
      'تفتح صفحة تؤكد تفعيل حسابك.',
      'ارجع إلى المتجر وسجّل الدخول بالبريد وكلمة المرور.',
      'اطلب بطاقاتك وتابع طلباتك ونقاطك من حسابك.',
    ], t),
    mGap(10),
    mSmall('إذا لم يعمل الزر، انسخ هذا الرابط والصقه في المتصفح:'),
    mLinkBox(link, t),
    mGap(28),
    mHr(),
    mGap(22),
    `<p dir="rtl" style="margin:0 0 4px;${MB}font-size:15px;line-height:1.8;font-weight:800;color:${MC.h};">لم تنشئ حساباً؟</p>`,
    mP('تجاهل الرسالة؛ لن يُفعَّل أي حساب ولن يحدث شيء. الرابط يعمل مرة واحدة، وصلاحيته محدودة.', 'font-size:14px;'),
    mP('<strong style="color:#FFFFFF;">لن نطلب منك كلمة المرور أبداً</strong> — لا عبر الإيميل ولا واتساب ولا أي رسالة أخرى.', 'font-size:14px;'),
  ].join('\n');
  return mailShell({
    tone: 'crimson',
    label: 'تفعيل الحساب',
    title: 'فعّل حسابك — Glitch Q',
    preheader: 'خطوة أخيرة: اضغط الزر لتأكيد بريدك الإلكتروني وتفعيل حسابك في المتجر.',
    body,
    note: 'وصلتك هذه الرسالة لأن أحداً سجّل حساباً في متجرنا بهذا البريد الإلكتروني.',
  });
}

function buildVerifyText(verifyLink, firstName) {
  const name = mailName(firstName);
  return `فعّل حسابك — Glitch Q

${name ? `أهلاً ${name}،\n` : ''}شكراً لتسجيلك في متجر Glitch Q.
افتح الرابط التالي لتأكيد بريدك الإلكتروني وتفعيل حسابك:

${verifyLink}

بعد التفعيل: ارجع إلى المتجر وسجّل الدخول بالبريد وكلمة المرور.
- الرابط يعمل مرة واحدة، وصلاحيته محدودة.

لم تنشئ حساباً؟
تجاهل الرسالة؛ لن يُفعَّل أي حساب ولن يحدث شيء.

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

function buildCodeEmail({ product, code, codes, note, orderId, validity }) {
  const t = MAIL_TONE.mint;
  const v = validity || codeValidity();
  const vc = validityCopy(v);
  const vt = MAIL_TONE[vc.tone];
  const list = (Array.isArray(codes) && codes.length ? codes : [code]).map(c => String(c == null ? '' : c));
  const many = list.length > 1;
  // one cell per code: the size is worked out from THAT code's length so a long one still fits a 320px phone
  const codeCell = (raw, label, last) => {
    const longest = Math.max(1, ...raw.split(/\r?\n/).map((l) => l.length));
    const desk = longest <= 19 ? 26 : longest <= 30 ? 20 : 16;                       // desktop size (media query ≥600px)
    const phoneAvail = 236;                                                          // px for the code on a 320px phone: 320 − paddings − borders
    let size = 11;
    for (let fs = Math.min(desk, 26); fs >= 11; fs--) { if (longest * (0.62 * fs + (fs >= 20 ? 2 : 1)) <= phoneAvail) { size = fs; break; } }
    return `
      <tr><td dir="rtl" align="center" class="tk" style="padding:${many ? '14px 14px 14px' : '18px 14px 22px'};font-family:${MAIL_FONT};direction:rtl;text-align:center;">
        <div style="font-size:12px;line-height:1.6;color:${MC.dim};margin-bottom:6px;">${label}</div>
        <div class="cd${desk}" dir="ltr" style="font-family:${MAIL_MONO};font-size:${size}px;line-height:1.5;font-weight:700;letter-spacing:${size >= 20 ? 2 : 1}px;color:${t.ink};text-align:center;white-space:pre-wrap;word-break:break-all;overflow-wrap:anywhere;-webkit-user-select:all;user-select:all;">${escHtml(raw)}</div>
      </td></tr>${many && !last ? `
      <tr><td class="tk" style="padding:0 14px;"><div style="height:0;line-height:0;font-size:0;border-top:1px dashed ${MC.line2};">&nbsp;</div></td></tr>` : ''}`;
  };
  const cells = list.map((c, i) => codeCell(c, many ? `الكود ${i + 1} من ${list.length}` : 'الكود', i === list.length - 1)).join('');
  const ticket = `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#08080B" style="background-color:#08080B;border:1px solid ${MC.line2};border-radius:14px;border-collapse:separate;">
      <tr><td dir="rtl" align="center" class="tk" style="padding:20px 14px 16px;font-family:${MAIL_FONT};direction:rtl;text-align:center;">
        <div style="font-size:12px;line-height:1.6;color:${MC.dim};">المنتج</div>
        <div dir="auto" style="font-size:17px;line-height:1.7;font-weight:700;color:${MC.h};">${escHtml(product || '—')}</div>
      </td></tr>
      <tr><td class="tk" style="padding:0 14px;"><div style="height:0;line-height:0;font-size:0;border-top:1px dashed ${MC.line2};">&nbsp;</div></td></tr>${cells}${orderId ? `
      <tr><td dir="rtl" align="center" bgcolor="${MC.card}" style="background-color:${MC.card};border-top:1px solid ${MC.line};border-radius:0 0 13px 13px;padding:11px 14px;font-family:${MAIL_FONT};direction:rtl;text-align:center;font-size:12px;line-height:1.7;color:${MC.dim};">رقم الطلب &nbsp;<span dir="ltr" style="unicode-bidi:isolate;font-family:${MAIL_MONO};color:${MC.p};word-break:break-all;overflow-wrap:anywhere;">${escHtml(orderId)}</span></td></tr>` : ''}
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
    mP(many ? `شكراً لشرائك من متجرنا. أكوادك (${list.length}) أدناه، وكلها جاهزة للاستخدام الآن.` : 'شكراً لشرائك من متجرنا. كودك أدناه، وهو جاهز للاستخدام الآن.'),
    ...(note ? [mNote(t, `<span dir="auto" style="unicode-bidi:isolate;">${escHtml(note)}</span>`), mGap(10)] : []),
    ticket,
    mGap(10),
    mSmall(many ? 'لتنسخ كوداً: اضغط عليه مطولاً على الجوال، أو حدّده بالماوس على الكمبيوتر.' : 'لتنسخ الكود: اضغط عليه مطولاً على الجوال، أو حدّده بالماوس على الكمبيوتر.'),
    mGap(14),
    validityBand,
    mGap(12),
    mNote(MAIL_TONE.gold, '<strong>لا تشارك الكود مع أحد</strong> — من يملكه يستطيع استخدامه.'),
    mGap(26),
    `<p dir="rtl" style="margin:0 0 14px;${MB}font-size:16px;line-height:1.6;font-weight:800;color:${MC.h};">طريقة التفعيل على ${lat('PlayStation')}</p>`,
    mSteps([
      `افتح <strong style="color:#FFFFFF;">${lat('PlayStation Store')}</strong> من جهازك أو من المتصفح.`,
      `اختر <strong style="color:#FFFFFF;">«استرداد الرموز»</strong> ${lat('(Redeem Codes)')}`,
      many ? 'أدخل أحد الأكواد أعلاه ثم أكّد، وكرّر الخطوات لكل كود على حدة.' : 'أدخل الكود أعلاه ثم أكّد.',
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
    preheader: many ? (v.daysLeft >= 0 ? `أكوادك (${list.length}) جاهزة وصالحة حتى ${vc.full}. افتح الرسالة لنسخها وتفعيلها.` : `أكوادك (${list.length}) جاهزة. افتح الرسالة لنسخها وتفعيلها.`) : (v.daysLeft >= 0 ? `كودك جاهز وصالح حتى ${vc.full}. افتح الرسالة لنسخه وتفعيله.` : 'كودك جاهز. افتح الرسالة لنسخه وتفعيله.'),
    body,
    note: 'وصلتك هذه الرسالة لأن طلباً مرتبطاً بهذا البريد تم تسليمه من متجرنا.',
  });
}

function buildCodeText({ product, code, codes, note, orderId, validity }) {
  const vc = validityCopy(validity || codeValidity());
  const list = (Array.isArray(codes) && codes.length ? codes : [code]).map(c => String(c == null ? '' : c));
  const codeBlock = list.length > 1 ? `الأكواد (${list.length}):\n` + list.map((c, i) => `${i + 1}) ${c}`).join('\n') : `الكود:\n${list[0]}`;
  return `طلبك جاهز — Glitch Q

المنتج: ${product || '—'}${orderId ? `\nرقم الطلب: ${orderId}` : ''}${note ? `\n${note}` : ''}

${codeBlock}

${vc.title}
${vc.sub}

لا تشارك الكود مع أحد — من يملكه يستطيع استخدامه.

طريقة التفعيل على PlayStation:
1) افتح PlayStation Store من جهازك أو من المتصفح.
2) اختر «استرداد الرموز» (Redeem Codes).
3) أدخل الكود (إن كانت عدة أكواد فأدخل كل كود على حدة) ثم أكّد.

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
