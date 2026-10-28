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
        '/health':                 () => json({ ok: true, v: 4 }, 200, cors),
        '/maintenance':            () => handleMaintenance(request, env, cors),
        '/ticker':                 () => handleTicker(request, env, cors),
        '/stats/visit':            () => handleVisit(request, env, cors),
        '/reset-password':         () => handleResetPassword(request, env, cors),
        '/leaderboard':            () => handleLeaderboard(request, env, cors),
        '/coupon/validate':        () => handleCouponValidate(request, env, cors),
        '/order/create':           () => handleOrderCreate(request, env, cors),
        '/order/track':            () => handleOrderTrack(request, env, cors),
        '/report/create':          () => handleReportCreate(request, env, cors),
        '/rating/create':          () => handleRatingCreate(request, env, cors),
        '/newsletter/subscribe':   () => handleNewsletter(request, env, cors),
        '/account/streak':         () => handleStreak(request, env, cors),
        '/account/spin':           () => handleSpin(request, env, cors),
        '/account/milestone':      () => handleMilestone(request, env, cors),
        '/account/referral':       () => handleReferral(request, env, cors),
        '/account/fp':             () => handleFingerprint(request, env, cors),
        '/account/revoke-sessions': () => handleRevokeSessions(request, env, cors),
        '/account/login-alert':    () => handleLoginAlert(request, env, cors),
        '/support/ping':           () => handleSupportPing(request, env, cors),
        '/admin/notify':           () => handleAdminNotify(request, env, cors),
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
const STREAK_BONUS = [1, 1, 2, 2, 3, 3, 5];
// order and weights must match SPIN_SEGMENTS in script.js
const SPIN_SEGMENTS = [
  { pts: 2, prob: 35 }, { pts: 3, prob: 30 }, { pts: 5, prob: 20 }, { pts: 10, prob: 10 },
  { pts: 20, prob: 4 }, { pts: 50, prob: 1 }, { pts: 0, prob: 0 },
];
// must match MILESTONES in script.js
const MILESTONES = [
  { id: 'm100', pts: 100, minSpend: 50000, name: 'مكافأة 100 نقطة', desc: 'بطاقة PS Store 5€ مجانية' },
  { id: 'm300', pts: 300, minSpend: 150000, name: 'مكافأة 300 نقطة', desc: 'PS Plus Essential شهر مجاني' },
  { id: 'm600', pts: 600, minSpend: 300000, name: 'مكافأة 600 نقطة', desc: 'بطاقة PS Store 20€ مجانية' },
  { id: 'm1000', pts: 1000, minSpend: 600000, name: 'مكافأة 1000 نقطة', desc: 'PS Plus Extra 3 أشهر مجانية' },
];

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

async function handleMilestone(request, env, cors) {
  const g = await account(request, env, cors); if (g.err) return g.err;
  const ms = MILESTONES.find(m => m.id === cleanText(g.body.id, 20));
  if (!ms) return json({ error: 'Unknown reward' }, 400, cors);
  const res = await fsUpdate(env, `users/${g.uid}`, cur => {
    if (!cur.exists) return { abort: 'nouser' };
    const claimed = Array.isArray(cur.data.claimedMilestones) ? cur.data.claimedMilestones : [];
    if (claimed.includes(ms.id)) return { abort: 'claimed' };
    if ((Number(cur.data.points) || 0) < ms.pts) return { abort: 'points' };
    if ((Number(cur.data.totalSpend) || 0) < ms.minSpend) return { abort: 'spend' };
    const notif = { title: `🎁 ${ms.name}`, code: `سيتم إرسال ${ms.desc} لك خلال 24 ساعة.`, date: dzDate(), read: false };
    return { fields: {}, transforms: { inc: { points: -ms.pts }, arrayUnion: { claimedMilestones: [ms.id], notifications: [notif] } }, _spend: Number(cur.data.totalSpend) || 0 };
  });
  if (res.aborted) return json({ ok: false, reason: res.abort }, 200, cors);
  if (!res.ok) return json({ error: 'Please try again' }, 503, cors);
  await tgSend(env, `🏆 Reward Claimed!\n👤 ${cleanText(g.claims.name || '', 60)}\n🔑 ${g.uid}\n🎁 ${ms.name}\n💳 ${ms.desc}\n📊 Points: ${ms.pts}\n💰 Spent: ${res.out._spend.toLocaleString('en-US')} دج`);
  return json({ ok: true, points: (Number(res.cur.data.points) || 0) - ms.pts }, 200, cors);
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

    resetLink = `https://glitch-q.web.app/reset.html?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`;
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
        subject: 'إعادة تعيين كلمة المرور — Glitch Q 🔑',
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

async function getJwks() {
  if (_jwks && Date.now() < _jwksExp) return _jwks;
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
  const jwk = (await getJwks()).find(k => k.kid === header.kid);
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
      subject: 'تسجيل دخول جديد إلى حسابك — Glitch Q 🔔',
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
   EMAIL TEMPLATE — light-first; no text on gradients
   (so Gmail dark-mode inversion keeps it readable)
═══════════════════════════════════════ */
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildResetEmail(resetLink) {
  const link = escHtml(resetLink);
  const year = new Date().getFullYear();
  const font = "Tahoma,'Segoe UI',Arial,sans-serif";
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>إعادة تعيين كلمة المرور — Glitch Q</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f1fb;" bgcolor="#f4f1fb">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f1fb;font-size:1px;line-height:1px;">اضغط الزر لاختيار كلمة مرور جديدة لحسابك في Glitch Q — الرابط صالح لمدة ساعة واحدة.&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f1fb" style="background-color:#f4f1fb;">
<tr><td align="center" style="padding:28px 12px;">

  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:560px;max-width:100%;background-color:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4dcf5;">

    <!-- Accent stripe (decorative only: no text sits on a gradient) -->
    <tr><td height="6" bgcolor="#c026d3" style="height:6px;font-size:0;line-height:0;background-color:#c026d3;background-image:linear-gradient(90deg,#7c3aed,#c026d3);">&nbsp;</td></tr>

    <!-- Header -->
    <tr><td align="center" bgcolor="#4c1d95" style="background-color:#4c1d95;padding:34px 24px 30px;">
      <div style="font-family:${font};font-size:30px;line-height:1.2;font-weight:800;letter-spacing:6px;color:#ffffff;direction:ltr;">GLITCH <span style="color:#f5d0fe;">Q</span></div>
      <div style="font-family:${font};font-size:13px;line-height:1.6;color:#ede9fe;margin-top:8px;">عالم الجيمينج بلا حدود</div>
    </td></tr>

    <!-- Body -->
    <tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:34px 32px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
        <td align="center" valign="middle" width="68" height="68" bgcolor="#f3e8ff" style="width:68px;height:68px;background-color:#f3e8ff;border-radius:34px;font-size:30px;line-height:68px;text-align:center;">&#128272;</td>
      </tr></table>
      <h1 style="font-family:${font};margin:20px 0 10px;font-size:23px;line-height:1.5;font-weight:800;color:#1e1b3a;text-align:center;">إعادة تعيين كلمة المرور</h1>
      <p style="font-family:${font};margin:0 0 6px;font-size:15px;line-height:2;color:#4b4668;text-align:center;">وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك في <strong style="color:#7c3aed;">Glitch Q</strong>.<br>اضغط الزر أدناه لاختيار كلمة مرور جديدة.</p>
    </td></tr>

    <!-- Button -->
    <tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:22px 32px 10px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
        <td align="center" bgcolor="#7c3aed" style="background-color:#7c3aed;border-radius:12px;">
          <a href="${link}" target="_blank" style="display:inline-block;font-family:${font};font-size:16px;line-height:1.4;font-weight:800;color:#ffffff;text-decoration:none;padding:16px 46px;border-radius:12px;">إعادة تعيين كلمة المرور</a>
        </td>
      </tr></table>
    </td></tr>

    <!-- Expiry note -->
    <tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:18px 32px 6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="#faf5ff" style="background-color:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;padding:12px 16px;font-family:${font};font-size:13px;line-height:1.8;color:#5b21b6;text-align:center;">&#9201; الرابط صالح لمدة <strong>ساعة واحدة</strong> ويعمل مرة واحدة فقط.</td>
      </tr></table>
    </td></tr>

    <!-- Fallback link -->
    <tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:18px 32px 6px;">
      <p style="font-family:${font};margin:0 0 6px;font-size:12px;line-height:1.8;color:#6b6585;text-align:center;">إذا لم يعمل الزر، انسخ الرابط التالي والصقه في المتصفح:</p>
      <p style="font-family:Consolas,Menlo,monospace;margin:0;font-size:11px;line-height:1.7;color:#7c3aed;text-align:center;word-break:break-all;direction:ltr;"><a href="${link}" target="_blank" style="color:#7c3aed;text-decoration:underline;">${link}</a></p>
    </td></tr>

    <!-- Security -->
    <tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:22px 32px 30px;">
      <div style="height:1px;line-height:1px;font-size:1px;background-color:#ece6f8;margin-bottom:18px;">&nbsp;</div>
      <p style="font-family:${font};margin:0;font-size:13px;line-height:1.9;color:#6b6585;text-align:center;">&#128737; لم تطلب هذا؟ تجاهل هذه الرسالة وستبقى كلمة مرورك كما هي، ولن يتغير شيء في حسابك.</p>
    </td></tr>

    <!-- Footer -->
    <tr><td align="center" bgcolor="#f8f5ff" style="background-color:#f8f5ff;border-top:1px solid #ece6f8;padding:20px 24px;">
      <p style="font-family:${font};margin:0 0 4px;font-size:13px;line-height:1.7;font-weight:700;color:#4c1d95;">Glitch Q — بطاقات PlayStation في الجزائر</p>
      <p style="font-family:${font};margin:0;font-size:11px;line-height:1.7;color:#8a85a0;">هذه رسالة تلقائية، يرجى عدم الرد عليها. &copy; ${year} Glitch Q</p>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}

function buildLoginAlertEmail({ device, place, when }) {
  const SITE = 'https://glitchqq.github.io/glitch-q/';
  const year = new Date().getFullYear();
  const font = "Tahoma,'Segoe UI',Arial,sans-serif";
  const row = (label, value) => `<tr>
        <td bgcolor="#faf5ff" style="background-color:#faf5ff;border-bottom:1px solid #ece6f8;padding:12px 16px;font-family:${font};font-size:13px;line-height:1.7;color:#6b6585;text-align:right;width:34%;">${label}</td>
        <td bgcolor="#faf5ff" style="background-color:#faf5ff;border-bottom:1px solid #ece6f8;padding:12px 16px;font-family:${font};font-size:14px;line-height:1.7;font-weight:700;color:#1e1b3a;text-align:right;">${escHtml(value)}</td>
      </tr>`;
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>تسجيل دخول جديد — Glitch Q</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f1fb;" bgcolor="#f4f1fb">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f1fb;font-size:1px;line-height:1px;">تم تسجيل دخول إلى حسابك من جهاز جديد. إذا لم تكن أنت فأمّن حسابك الآن.&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f1fb" style="background-color:#f4f1fb;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:560px;max-width:100%;background-color:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4dcf5;">
    <tr><td height="6" bgcolor="#c026d3" style="height:6px;font-size:0;line-height:0;background-color:#c026d3;background-image:linear-gradient(90deg,#7c3aed,#c026d3);">&nbsp;</td></tr>
    <tr><td align="center" bgcolor="#4c1d95" style="background-color:#4c1d95;padding:30px 24px 26px;">
      <div style="font-family:${font};font-size:28px;line-height:1.2;font-weight:800;letter-spacing:6px;color:#ffffff;direction:ltr;">GLITCH <span style="color:#f5d0fe;">Q</span></div>
    </td></tr>
    <tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:30px 32px 6px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
        <td align="center" valign="middle" width="64" height="64" bgcolor="#fef3c7" style="width:64px;height:64px;background-color:#fef3c7;border-radius:32px;font-size:28px;line-height:64px;text-align:center;">&#128276;</td>
      </tr></table>
      <h1 style="font-family:${font};margin:18px 0 10px;font-size:22px;line-height:1.5;font-weight:800;color:#1e1b3a;text-align:center;">تسجيل دخول جديد إلى حسابك</h1>
      <p style="font-family:${font};margin:0;font-size:15px;line-height:2;color:#4b4668;text-align:center;">لاحظنا تسجيل دخول إلى حسابك في <strong style="color:#7c3aed;">Glitch Q</strong> من جهاز لم نعرفه من قبل:</p>
    </td></tr>
    <tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:18px 32px 6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #ece6f8;border-radius:12px;border-collapse:separate;overflow:hidden;">
        ${row('الجهاز', device)}
        ${row('الموقع التقريبي', place)}
        ${row('الوقت', when)}
      </table>
    </td></tr>
    <tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:16px 32px 4px;">
      <p style="font-family:${font};margin:0;font-size:14px;line-height:2;color:#1e1b3a;text-align:center;"><strong>كنت أنت؟</strong> لا تحتاج لفعل أي شيء.</p>
    </td></tr>
    <tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:8px 32px 6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="#fef2f2" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 16px;font-family:${font};font-size:13px;line-height:1.9;color:#991b1b;text-align:right;"><strong>لم تكن أنت؟</strong><br>1) ادخل إلى حسابك ← <strong>إعدادات الحساب</strong> وغيّر كلمة المرور فوراً.<br>2) اضغط <strong>تسجيل الخروج من كل الأجهزة</strong>.</td>
      </tr></table>
    </td></tr>
    <tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:20px 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
        <td align="center" bgcolor="#7c3aed" style="background-color:#7c3aed;border-radius:12px;">
          <a href="${SITE}" target="_blank" style="display:inline-block;font-family:${font};font-size:15px;line-height:1.4;font-weight:800;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:12px;">فتح Glitch Q</a>
        </td>
      </tr></table>
    </td></tr>
    <tr><td align="center" bgcolor="#f8f5ff" style="background-color:#f8f5ff;border-top:1px solid #ece6f8;padding:18px 24px;">
      <p style="font-family:${font};margin:0 0 4px;font-size:12px;line-height:1.7;color:#6b6585;">وصلتك هذه الرسالة لأنك فعّلت «تنبيه الدخول من جهاز جديد» في إعدادات حسابك، ويمكنك إيقافه في أي وقت.</p>
      <p style="font-family:${font};margin:0;font-size:11px;line-height:1.7;color:#8a85a0;">هذه رسالة تلقائية، يرجى عدم الرد عليها. &copy; ${year} Glitch Q</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

function buildLoginAlertText({ device, place, when }) {
  return `تسجيل دخول جديد إلى حسابك — Glitch Q

لاحظنا تسجيل دخول إلى حسابك من جهاز لم نعرفه من قبل:
الجهاز: ${device}
الموقع التقريبي: ${place}
الوقت: ${when}

كنت أنت؟ لا تحتاج لفعل أي شيء.
لم تكن أنت؟ ادخل إلى حسابك ← إعدادات الحساب، غيّر كلمة المرور فوراً ثم اضغط «تسجيل الخروج من كل الأجهزة».

وصلتك هذه الرسالة لأنك فعّلت «تنبيه الدخول من جهاز جديد» ويمكنك إيقافه في أي وقت.
Glitch Q`;
}

function buildResetText(resetLink) {
  return `إعادة تعيين كلمة المرور — Glitch Q

وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك في Glitch Q.
افتح الرابط التالي لاختيار كلمة مرور جديدة (صالح لمدة ساعة واحدة ويعمل مرة واحدة فقط):

${resetLink}

لم تطلب هذا؟ تجاهل هذه الرسالة وستبقى كلمة مرورك كما هي.

Glitch Q`;
}
