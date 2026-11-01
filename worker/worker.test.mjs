// Offline test for worker.js: Firebase, Firestore, Brevo and Telegram are replaced by in-memory fakes.
// No network, no real keys (RSA keys are generated in memory and never stored).
//   run:  TZ=UTC node worker/worker.test.mjs
import worker from './worker.js';
import { webcrypto as crypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const enc = new TextEncoder();
const b64u = b => Buffer.from(b).toString('base64url');
const genKey = () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const kp = await genKey();
const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const sa = await genKey();
const pem = '-----BEGIN PRIVATE KEY-----\n' + Buffer.from(await crypto.subtle.exportKey('pkcs8', sa.privateKey)).toString('base64') + '\n-----END PRIVATE KEY-----\n';
const env = { FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 't@t.iam', private_key: pem }), BREVO_API_KEY: 'k', TELEGRAM_BOT_TOKEN: 'bot', TELEGRAM_CHAT_ID: '1' };

async function mk(over = {}, signKey = kp.privateKey, kid = 'k1') {
  const now = Math.floor(Date.now() / 1000);
  const p = { aud: 'glitch-q', iss: 'https://securetoken.google.com/glitch-q', sub: 'u1', iat: now - 10, exp: now + 3000, email: 'a@b.com', email_verified: true, name: 'Ali Test', firebase: { sign_in_provider: 'password' }, ...over };
  const h = b64u(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })), pl = b64u(JSON.stringify(p));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signKey, enc.encode(h + '.' + pl));
  return h + '.' + pl + '.' + b64u(sig);
}

/* ───────── fake Firestore (REST shapes) ───────── */
const D = v => { if (!v) return null; if ('stringValue' in v) return v.stringValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue; if ('booleanValue' in v) return v.booleanValue; if ('timestampValue' in v) return v.timestampValue; if ('nullValue' in v) return null; if ('arrayValue' in v) return (v.arrayValue.values || []).map(D); if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, D(x)])); };
const E = v => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : typeof v === 'string' ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(E) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, E(x)])) } };
const fs = { docs: new Map(), ver: 1, commits: 0, failTelegram: false, tg: [], brevo: [], gets: 0 };
const put = (path, obj) => fs.docs.set(path, { fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, E(v)])), ver: fs.ver++ });
const get = path => { const d = fs.docs.get(path); return d ? Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, D(v)])) : undefined; };
const docJson = (path, d) => ({ name: `projects/glitch-q/databases/(default)/documents/${path}`, fields: d.fields, updateTime: '2026-01-01T00:00:00.' + String(d.ver).padStart(6, '0') + 'Z' });
const sleep = () => new Promise(r => setTimeout(r, 0));
const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...h } });
const DOCS = '/documents';

function commit(writes) {
  // validate all preconditions first (atomic)
  for (const w of writes) {
    const name = (w.update || {}).name || w.delete; const path = name.split(DOCS + '/')[1];
    const cur = fs.docs.get(path); const pc = w.currentDocument;
    if (!pc) continue;
    if (pc.exists === false && cur) return J({ error: { status: 'ALREADY_EXISTS' } }, 409);
    if (pc.exists === true && !cur) return J({ error: { status: 'NOT_FOUND' } }, 404);
    if (pc.updateTime && (!cur || docJson(path, cur).updateTime !== pc.updateTime)) return J({ error: { status: 'FAILED_PRECONDITION' } }, 400);
  }
  for (const w of writes) {
    if (w.delete) { fs.docs.delete(w.delete.split(DOCS + '/')[1]); continue; }
    const path = w.update.name.split(DOCS + '/')[1];
    const cur = fs.docs.get(path) || { fields: {}, ver: 0 };
    const fields = { ...cur.fields };
    for (const f of (w.updateMask || { fieldPaths: Object.keys(w.update.fields || {}) }).fieldPaths) { if (f in (w.update.fields || {})) fields[f] = w.update.fields[f]; else delete fields[f]; }
    for (const t of (w.updateTransforms || [])) {
      if (t.increment) fields[t.fieldPath] = { integerValue: String(Number(D(fields[t.fieldPath]) || 0) + Number(t.increment.integerValue)) };
      if (t.appendMissingElements) { const arr = (D(fields[t.fieldPath]) || []); for (const v of t.appendMissingElements.values) if (!arr.some(x => JSON.stringify(x) === JSON.stringify(D(v)))) arr.push(D(v)); fields[t.fieldPath] = E(arr); }
      if (t.setToServerValue === 'REQUEST_TIME') fields[t.fieldPath] = { timestampValue: new Date().toISOString() };
    }
    fs.docs.set(path, { fields, ver: fs.ver++ });
  }
  fs.commits++;
  return J({ writeResults: [] });
}

let calls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push({ url, init }); await sleep();
  if (url.includes('service_accounts/v1/jwk')) return J({ keys: [jwk] }, 200, { 'cache-control': 'public, max-age=3600' });
  if (url.includes('oauth2.googleapis.com/token')) return J({ access_token: 'tok' });
  if (url.includes('sendOobCode')) return J({ oobLink: 'https://glitch-q.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=abc' });
  if (url.includes('accounts:update')) return J({});
  if (url.includes('api.brevo.com')) { if (fs.failBrevo) return J({ message: 'no' }, 400); fs.brevo.push(JSON.parse(init.body)); return J({ messageId: 'm' }, 201); }
  if (url.includes('api.telegram.org')) {
    if (fs.failTelegram) return J({ ok: false }, 500);
    const isPhoto = url.endsWith('/sendPhoto');
    fs.tg.push({ photo: isPhoto, text: isPhoto ? init.body.get('caption') : JSON.parse(init.body).text, file: isPhoto ? init.body.get('photo') : null });
    return J({ ok: true });
  }
  if (url.startsWith('https://firestore.googleapis.com/v1/projects/glitch-q/databases/(default)/documents')) {
    const rest = url.split(DOCS)[1];
    if (rest === ':commit') return commit(JSON.parse(init.body).writes);
    if (rest === ':runQuery') {
      const q = JSON.parse(init.body).structuredQuery; const col = q.from[0].collectionId;
      let rows = [...fs.docs.entries()].filter(([p]) => p.startsWith(col + '/') && p.split('/').length === 2).map(([p, d]) => ({ p, d, o: Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, D(v)])) }));
      const fl = q.where ? (q.where.compositeFilter ? q.where.compositeFilter.filters : [q.where]) : [];
      for (const f of fl) { const { field, op, value } = f.fieldFilter; if (op !== 'EQUAL') throw new Error('op'); rows = rows.filter(r => r.o[field.fieldPath] === D(value)); }
      if (q.orderBy) { const { field, direction } = q.orderBy[0]; rows.sort((a, b) => (direction === 'DESCENDING' ? -1 : 1) * ((a.o[field.fieldPath] || 0) - (b.o[field.fieldPath] || 0))); }
      rows = rows.slice(0, q.limit || 100);
      return J(rows.length ? rows.map(r => ({ document: docJson(r.p, r.d) })) : [{ readTime: 'x' }]);
    }
    fs.gets++;
    const path = decodeURIComponent(rest.slice(1)); const d = fs.docs.get(path);
    return d ? J(docJson(path, d)) : J({ error: { status: 'NOT_FOUND' } }, 404);
  }
  return J({}, 404);
};

/* ───────── helpers ───────── */
const ORIGIN = 'https://glitchqq.github.io';
let ipn = 0;
const fresh = () => '10.0.' + (Math.floor(++ipn / 250)) + '.' + (ipn % 250);
async function call(path, body, { origin = ORIGIN, method = 'POST', ip = fresh(), form } = {}) {
  const headers = { Origin: origin, 'CF-Connecting-IP': ip };
  let req;
  if (form) req = new Request('https://w.example' + path, { method, headers, body: form });
  else { headers['Content-Type'] = 'application/json'; req = new Request('https://w.example' + path, { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined }); }
  const r = await worker.fetch(req, env, { waitUntil() {} });
  let j = {}; try { j = await r.json(); } catch {}
  return [r.status, j];
}
const png = (n = 700) => new Blob([Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]), Buffer.alloc(n, 7)])], { type: 'image/png' });
async function order(data, { token, photo, ip } = {}) {
  const f = new FormData(); f.append('data', JSON.stringify(data));
  if (token) f.append('idToken', token);
  if (photo) f.append('photo', photo, 'r.png');
  return call('/order/create', null, { form: f, ip });
}

let pass = 0, fail = 0;
let _skew = 0; const _realNow = Date.now.bind(Date); Date.now = () => _realNow() + _skew; const _bump = () => { _skew += 120000; };
const ck = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  → ' + x)); c ? pass++ : fail++; };

function seed() {
  fs.docs.clear(); fs.tg = []; fs.brevo = []; fs.failTelegram = false;
  put('settings/categories', { categories: [{ id: 'psn', enabled: true }, { id: 'off', enabled: false }] });
  put('settings/products', { products: [
    { id: 'p1', cat: 'psn', name: 'PSN', val: 10, cur: 'EUR', sym: '€', sub: 'USA' },
    { id: 'p2', cat: 'psn', name: 'Plus', val: 3, cur: 'month', sub: 'EU', priceDZD: 4000 },
    { id: 'p3', cat: 'psn', name: 'Old', val: 5, cur: 'USD', sym: '$', sub: 'US', stock: false },
    { id: 'p4', cat: 'off', name: 'Hidden', val: 5, cur: 'USD', sym: '$', sub: 'US' },
    { id: 'p5', cat: 'psn', name: 'Free', val: 0, cur: 'EUR', sym: '€', sub: 'x' },
  ] });
  put('settings/discount', { active: false, value: 0 });
  put('settings/coupons', { coupons: [
    { code: 'TEN', type: 'percent', value: 10, active: true },
    { code: 'FIX500', type: 'fixed', value: 500, active: true },
    { code: 'ONCE', type: 'percent', value: 50, active: true, maxUses: 1, usedCount: 0 },
    { code: 'OLD', type: 'percent', value: 50, active: true, expiry: '2020-01-01' },
    { code: 'OFF', type: 'percent', value: 50, active: false },
  ] });
  for (const u of ['u1', 'u2', 'u3']) put('users/' + u, { points: 5, totalSpend: 0, orders: 0, streak: 0, claimedMilestones: [], notifications: [], uid_short: u.padEnd(12, 'x'), firstName: 'F' + u, lastName: 'L' + u });
}

/* ───────── constants must match the storefront ───────── */
{
  const src = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
  const grab = re => re.exec(src)[0];
  const ctx = {};
  vm.runInNewContext(grab(/const RATES=[^\n]+/).replace('const ', 'this.') + ';' + grab(/const MILESTONES=\[[\s\S]*?\n\];/).replace('const ', 'this.') + ';' + grab(/const SPIN_SEGMENTS=\[[\s\S]*?\n\];/).replace('const ', 'this.'), ctx);
  const w = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  const wRates = vm.runInNewContext('(' + /const RATES = (\{[^}]+\})/.exec(w)[1] + ')');
  ck('RATES identical in worker and script.js', JSON.stringify(wRates) === JSON.stringify(ctx.RATES), JSON.stringify([wRates, ctx.RATES]));
  const adminSrc = readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
  const aRates = vm.runInNewContext('(' + /const PF_RATES=(\{[^}]+\})/.exec(adminSrc)[1] + ')');
  ck('RATES identical in worker and the admin price hint (admin.js)', JSON.stringify(aRates) === JSON.stringify(wRates), JSON.stringify([aRates, wRates]));
  const wMs = vm.runInNewContext(/const MILESTONES = (\[[\s\S]*?\n\]);/.exec(w)[1]);
  ck('MILESTONES (id/pts/minSpend) identical', JSON.stringify(wMs.map(m => [m.id, m.pts, m.minSpend])) === JSON.stringify(ctx.MILESTONES.map(m => [m.id, m.pts, m.minSpend])));
  const wSp = vm.runInNewContext(/const SPIN_SEGMENTS = (\[[\s\S]*?\n\]);/.exec(w)[1]);
  ck('SPIN_SEGMENTS (pts/prob order) identical', JSON.stringify(wSp.map(m => [m.pts, m.prob])) === JSON.stringify(ctx.SPIN_SEGMENTS.map(m => [m.pts, m.prob])));
}

{ // Google rotates signing keys: a token signed by a key published AFTER the cache was filled must still verify
  const rot = await genKey(); const jwk2 = { ...(await crypto.subtle.exportKey('jwk', rot.publicKey)), kid: 'k2', alg: 'RS256', use: 'sig' };
  const before = globalThis.fetch; let served = [jwk];
  globalThis.fetch = async (u, i) => String(u).includes('service_accounts/v1/jwk') ? J({ keys: served }, 200, { 'cache-control': 'public, max-age=3600' }) : before(u, i);
  await call('/account/streak', { idToken: await mk({ sub: 'rot0' }) });                    // fills the cache with k1 only
  served = [jwk, jwk2];
  const tk = await mk({ sub: 'rot1' }, rot.privateKey, 'k2'); seed(); put('users/rot1', { points: 5 });
  // (the refresh is rate-limited to every 5 minutes, so move the clock past that for the test)
  const realNow = Date.now; Date.now = () => realNow() + 301000;
  const [st] = await call('/account/streak', { idToken: tk });
  Date.now = realNow; globalThis.fetch = before;
  ck('key rotation: token signed with a newly published key verifies after one refresh', st === 200, st); }

/* ───────── access control basics ───────── */
seed();
let [s, j] = await call('/health', null, { method: 'GET' }); ck('health ok', s === 200 && j.ok);
[s] = await call('/health', null, { method: 'GET', origin: 'https://evil.example' }); ck('foreign Origin → 403', s === 403);
[s] = await call('/health', null, { method: 'GET', origin: 'https://glitchqq.github.io.evil.com' }); ck('lookalike Origin (prefix attack) → 403', s === 403, s);
[s] = await call('/health', null, { method: 'GET', origin: '' }); ck('no Origin → 403', s === 403, s);
[s] = await call('/telegram', {}); ck('/telegram route removed', s === 404, s);
[s] = await call('/firestore/users/u1', null, { method: 'GET' }); ck('/firestore proxy removed', s === 404, s);
[s] = await call('/constructor', null, { method: 'GET' }); ck('prototype keys are not routes', s === 404, s);

{ // a chunked upload with no Content-Length must be cut off at the cap, not buffered
  let sent = 0; const chunk = new Uint8Array(1024 * 1024);
  const body = new ReadableStream({ pull(c) { if (sent >= 12) c.close(); else { sent++; c.enqueue(chunk); } } });
  const req = new Request('https://w.example/order/create', { method: 'POST', headers: { Origin: ORIGIN, 'CF-Connecting-IP': fresh(), 'Content-Type': 'multipart/form-data; boundary=x' }, body, duplex: 'half' });
  const r = await worker.fetch(req, env, { waitUntil() {} });
  ck('order: 12 MB chunked upload without Content-Length → 413 (stops reading at the cap)', r.status === 413 && sent < 12, r.status + ' read=' + sent + 'MB'); }
[s] = await call('/account/streak', { idToken: await mk({ sub: 'a/b' }) }); ck('token whose uid contains "/" is refused (database path safety)', s === 401, s);

/* ───────── order/create ───────── */
seed();
const T1 = await mk({ sub: 'u1' });
let un = 0; const U = async () => { const id = 'fresh' + (++un); put('users/' + id, { points: 5 }); return mk({ sub: id }); };   // a new account per call: the per-account limiter is tested separately
const base = { items: [{ id: 'p1', qty: 1 }], pay: 'hand', recv: 'phone', phone: '0555123456' };
[s, j] = await order({ ...base, total: 1, price: 1, totalDZD: 1, status: 'done', userId: 'u2' }, { token: T1 });
ck('order: created, total computed by server (10€ × 220 = 2200) ignoring client total', s === 200 && j.total === 2200, JSON.stringify([s, j]));
let o = get('orders/' + j.orderId);
ck('order: userId from token (not body), status pending, awarded:false', o && o.userId === 'u1' && o.status === 'pending' && o.awarded === false, JSON.stringify(o));
ck('order: product label built by server', o.product === 'PSN 10€ (USA)', o.product);
ck('order: no points given at creation', get('users/u1').points === 5 && get('users/u1').totalSpend === 0);
ck('order: telegram notified once, plain text built by server', fs.tg.length === 1 && fs.tg[0].text.includes(j.orderId) && fs.tg[0].text.includes('2,200') && fs.tg[0].text.includes('0555123456'), JSON.stringify(fs.tg));
ck('order: server timestamp field set', typeof o.ts === 'string');

[s, j] = await order({ ...base, items: [{ id: 'p2', qty: 2 }, { id: 'p1', qty: 1 }] }, { token: await U() });
o = get('orders/' + j.orderId);
ck('order: cart total = 2×4000 + 2200 = 10200', s === 200 && j.total === 10200 && o.items.length === 2, JSON.stringify([s, j]));
for (const [name, items] of [['qty 0', [{ id: 'p1', qty: 0 }]], ['qty 11', [{ id: 'p1', qty: 11 }]], ['qty -1', [{ id: 'p1', qty: -1 }]], ['qty NaN', [{ id: 'p1', qty: 'x' }]], ['unknown id', [{ id: 'nope', qty: 1 }]], ['out of stock', [{ id: 'p3', qty: 1 }]], ['disabled category', [{ id: 'p4', qty: 1 }]], ['zero price', [{ id: 'p5', qty: 1 }]], ['empty cart', []], ['21 lines', Array.from({ length: 21 }, (_, i) => ({ id: 'p' + i, qty: 1 }))], ['not an array', 'p1']]) {
  [s] = await order({ ...base, items }, { token: await U() }); ck('order rejected: ' + name, s === 400, s);
}
const countOrders = () => [...fs.docs.keys()].filter(k => k.startsWith('orders/')).length;
const before = countOrders();
[s, j] = await order({ ...base, items: [{ id: 'p1', qty: 3 }, { id: 'p1', qty: 9 }] }, { token: await U() });
ck('order: duplicate lines are merged and capped at qty 10 (10 × 2200 = 22000)', s === 200 && j.total === 22000, JSON.stringify([s, j]));
[s] = await order({ ...base, pay: 'x' }, { token: await U() }); ck('order rejected: bad pay method', s === 400);
[s] = await order({ ...base, phone: '<script>' }, { token: await U() }); ck('order rejected: bad phone', s === 400);
[s] = await order({ ...base, recv: 'email', email: 'nope' }, { token: await U() }); ck('order rejected: bad email', s === 400);
[s] = await order({ ...base, recv: 'email', email: 'x@y.com' }, { token: await U() }); ck('order ok: email delivery', s === 200, s);

// BaridiMob receipt checks
const bm = { items: [{ id: 'p1', qty: 1 }], pay: 'baridimob', recv: 'email', email: 'x@y.com', name: 'Ali <b>X</b>' };
[s] = await order(bm, { token: await U() }); ck('baridimob: no receipt → 400', s === 400);
[s] = await order(bm, { token: await U(), photo: new Blob([Buffer.alloc(800, 65)], { type: 'image/png' }) }); ck('baridimob: fake image (wrong bytes, png content-type) → 400', s === 400, s);
[s] = await order(bm, { token: await U(), photo: new Blob([Buffer.from('<script>alert(1)</script>'.padEnd(800, ' '))], { type: 'image/png' }) }); ck('baridimob: html disguised as png → 400', s === 400);
[s] = await order({ ...bm, name: '' }, { token: await U(), photo: png() }); ck('baridimob: missing sender name → 400', s === 400);
[s] = await order(bm, { token: await U(), photo: png(6 * 1024 * 1024) }); ck('baridimob: >5MB → 400/413', s === 400 || s === 413, s);
fs.tg = [];
[s, j] = await order(bm, { token: await U(), photo: png() });
ck('baridimob: valid receipt → 200 and sent as photo with server caption', s === 200 && fs.tg.length === 1 && fs.tg[0].photo && fs.tg[0].text.includes('BaridiMob') && fs.tg[0].text.includes(j.orderId), JSON.stringify([s, j, fs.tg.map(x => x.photo)]));
ck('baridimob: order stores senderName and no photo bytes', get('orders/' + j.orderId).senderName === 'Ali <b>X</b>' && !JSON.stringify(get('orders/' + j.orderId)).includes('PNG'));

// identity
[s] = await order(base, { token: 'a.b.c' }); ck('order: garbage token → 401 (not treated as guest)', s === 401);
[s] = await order(base, { token: await mk({ sub: 'u1', email_verified: false }) }); ck('order: unverified-email account → 401', s === 401);
[s] = await order(base, { token: await mk({}, (await genKey()).privateKey) }); ck('order: forged token → 401', s === 401);
put('banned_users/u3', { reason: 'x' });
[s] = await order(base, { token: await mk({ sub: 'u3' }) }); ck('order: banned user → 403', s === 403);
[s, j] = await order(base, {}); ck('order: guest allowed, userId=guest', s === 200 && get('orders/' + j.orderId).userId === 'guest', s);
[s] = await call('/order/create', {}, { origin: 'https://evil.example' }); ck('order: foreign origin → 403', s === 403);
[s] = await call('/order/create', null, { method: 'GET' }); ck('order: GET → 405', s === 405);

// rate limit per IP
{ const ip = '9.9.9.9'; let last; for (let i = 0; i < 8; i++) [last] = await order(base, { ip }); ck('order: per-IP limit kicks in (429)', last === 429, last); }

{ const t = await mk({ sub: 'limited' }); put('users/limited', { points: 5 }); let last; for (let i = 0; i < 10; i++) [last] = await order(base, { token: t }); ck('order: per-account limit kicks in (429) even from changing IPs', last === 429, last); }

// discount
put('settings/discount', { active: true, value: 10, expiry: '2999-01-01' });
[s, j] = await order({ ...base }, { token: await U() }); ck('order: active site discount 10% → 1980', s === 200 && j.total === 1980, JSON.stringify(j));
put('settings/discount', { active: true, value: 10, expiry: '2000-01-01' });
[s, j] = await order({ ...base }, { token: await U() }); ck('order: expired discount ignored → 2200', j.total === 2200, JSON.stringify(j));
put('settings/discount', { active: true, value: 500 });
[s, j] = await order({ ...base }, { token: await U() }); ck('order: absurd discount value (500%) ignored', j.total === 2200, JSON.stringify(j));
put('settings/discount', { active: false, value: 0 });

// coupons
[s, j] = await order({ ...base, coupon: 'ten' }, { token: await U() });
ck('coupon: percent applied (2200 → 1980), case-insensitive, used count +1', s === 200 && j.total === 1980 && get('settings/coupons').coupons.find(c => c.code === 'TEN').usedCount === 1, JSON.stringify(j));
[s, j] = await order({ ...base, coupon: 'FIX500' }, { token: await U() }); ck('coupon: fixed applied (2200 → 1700)', j.total === 1700, JSON.stringify(j));
for (const c of ['OLD', 'OFF', 'NOPE', '<img>']) { [s] = await order({ ...base, coupon: c }, { token: await U() }); ck('coupon rejected: ' + c, s === 400, s); }
// maxUses race: two simultaneous orders on a 1-use coupon
{ const rs = await Promise.all([order({ ...base, coupon: 'ONCE' }, { token: await mk({ sub: 'u1' }) }), order({ ...base, coupon: 'ONCE' }, { token: await mk({ sub: 'u2' }) }), order({ ...base, coupon: 'ONCE' }) ]);
  const okc = rs.filter(r => r[0] === 200).length;
  ck('coupon: single-use code cannot be used twice concurrently', okc === 1 && get('settings/coupons').coupons.find(c => c.code === 'ONCE').usedCount === 1, JSON.stringify(rs.map(r => r[0])) + ' used=' + get('settings/coupons').coupons.find(c => c.code === 'ONCE').usedCount); }

// telegram down → order rolled back and coupon released
{ put('settings/coupons', { coupons: [{ code: 'TEN', type: 'percent', value: 10, active: true, maxUses: 5, usedCount: 2 }] });
  const n = countOrders(); fs.failTelegram = true;
  [s] = await order({ ...base, coupon: 'TEN' }, { token: await U() });
  ck('telegram failure → 502, order removed, coupon released', s === 502 && countOrders() === n && get('settings/coupons').coupons[0].usedCount === 2, JSON.stringify([s, countOrders() - n, get('settings/coupons').coupons[0].usedCount]));
  fs.failTelegram = false; }

/* ───────── coupon/validate, order/track ───────── */
seed();
[s, j] = await call('/coupon/validate', { code: 'ten' }); ck('coupon/validate: valid → type/value only', s === 200 && j.ok && j.type === 'percent' && j.value === 10 && Object.keys(j).sort().join() === 'code,ok,type,value', JSON.stringify(j));
[s, j] = await call('/coupon/validate', { code: 'OLD' }); ck('coupon/validate: expired → ok:false', j.ok === false);
[s, j] = await call('/coupon/validate', { code: 'x'.repeat(5000) }); ck('coupon/validate: huge body rejected safely', s === 200 && j.ok === false, JSON.stringify([s, j]));
{ const ip = '8.8.8.8'; let last; for (let i = 0; i < 25; i++) [last] = await call('/coupon/validate', { code: 'A' + i }, { ip }); ck('coupon/validate: brute-force limited (429)', last === 429, last); }
[s, j] = await order(base, { token: await U() });
const oid = j.orderId; fs.docs.get('orders/' + oid).fields.status = { stringValue: 'done' };
[s, j] = await call('/order/track', { orderId: oid });
ck('track: returns only status/product/date', s === 200 && j.ok && Object.keys(j).sort().join() === 'date,ok,product,status' && j.status === 'done', JSON.stringify(j));
ck('track: no phone/email/userId leaked', !JSON.stringify(j).includes('0555') && !JSON.stringify(j).includes('u1'));
[s, j] = await call('/order/track', { orderId: 'nope' }); ck('track: unknown id → ok:false', j.ok === false);
[s, j] = await call('/order/track', { orderId: '../users/u1' }); ck('track: path-traversal id rejected', j.ok === false && !('status' in j));

/* ───────── leaderboard ───────── */
seed();
put('users/a', { points: 900, nick: 'Zed', firstName: 'Aa', lastName: 'Bb', email: 'secret@x.com', uid_short: 'a' });
put('users/b', { points: 800, firstName: 'Bob', lastName: 'Smith', prefs: { hideLb: true } });
put('users/imp', { points: 100, nick: 'Glitch Support', firstName: 'Real', lastName: 'Person' });
put('users/c', { points: 700, firstName: 'Cara', lastName: 'Doe', avatar: { e: '🦊', c: '#fff' } });
for (const [i, u] of ['d', 'e'].entries()) put('users/' + u, { points: 600 - i, firstName: u.toUpperCase(), lastName: 'Q' });
[s, j] = await call('/leaderboard', null, { method: 'GET' });
ck('leaderboard: hidden user excluded, nick used', s === 200 && j.top.length === 5 && j.top[0].name === 'Zed' && !j.top.some(x => x.name.startsWith('Bob')), JSON.stringify(j));
ck('leaderboard: reserved nickname ("Glitch Support") is replaced by the real first name + initial', j.top.some(x => x.name === 'Real P.') && !JSON.stringify(j).includes('Glitch'), JSON.stringify(j));
ck('leaderboard: shows "First L." only; no email/uid/last name', j.top[1].name === 'Cara D.' && !JSON.stringify(j).includes('secret') && !JSON.stringify(j).includes('Doe'), JSON.stringify(j.top[1]));

/* ───────── streak / spin / milestone ───────── */
seed();
const tok = sub => mk({ sub });
[s] = await call('/account/streak', {}); ck('streak: no token → 401', s === 401);
[s] = await call('/account/streak', { idToken: await mk({ sub: 'u1', email_verified: false }) }); ck('streak: unverified → 401', s === 401);
[s, j] = await call('/account/streak', { idToken: await tok('u1') });
ck('streak: first claim → +1, streak 1', s === 200 && j.ok && j.bonus === 1 && j.streak === 1 && get('users/u1').points === 6 && get('users/u1').lastLogin === dzToday(), JSON.stringify([j, get('users/u1')]));
[s, j] = await call('/account/streak', { idToken: await tok('u1') }); ck('streak: second claim same day refused', j.ok === false && j.reason === 'done' && get('users/u1').points === 6, JSON.stringify(j));
function dzToday(off = 0) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + off * 86400000)); }
put('users/u2', { points: 10, streak: 6, lastLogin: dzToday(-1) });
[s, j] = await call('/account/streak', { idToken: await tok('u2') }); ck('streak: consecutive day → streak 7, bonus 5', j.ok && j.streak === 7 && j.bonus === 5 && get('users/u2').points === 15, JSON.stringify(j));
put('users/u3', { points: 10, streak: 6, lastLogin: dzToday(-3) });
[s, j] = await call('/account/streak', { idToken: await tok('u3') }); ck('streak: gap resets to 1', j.streak === 1 && j.bonus === 1, JSON.stringify(j));
{ const legacy = new Date(dzToday(-1) + 'T12:00:00Z').toDateString();   // what older accounts stored: the browser's toDateString()
  put('users/u3', { points: 10, streak: 2, lastLogin: legacy });
  [s, j] = await call('/account/streak', { idToken: await tok('u3') }); ck('streak: legacy browser-format date for yesterday (' + legacy + ') keeps the streak → 3', j.ok && j.streak === 3, JSON.stringify(j)); }
[s, j] = await Promise.all([call('/account/streak', { idToken: await tok('u1') }), call('/account/streak', { idToken: await tok('u1') })]).then(r => [0, r]);
ck('streak: concurrent double-claim paid once', get('users/u1').points === 6, get('users/u1').points);

seed();
[s, j] = await call('/account/spin', { idToken: await tok('u1') });
ck('spin: server picks prize, points credited, index valid', s === 200 && j.ok && j.index >= 0 && j.index < 7 && get('users/u1').points === 5 + j.pts, JSON.stringify(j));
const idx1 = j.index;
[s, j] = await call('/account/spin', { idToken: await tok('u1') }); ck('spin: second spin within 24h refused with remaining time', j.ok === false && j.reason === 'wait' && j.remainingMs > 80000000, JSON.stringify(j));
{ const rs = await Promise.all([1, 2, 3, 4].map(async () => call('/account/spin', { idToken: await tok('u2') }))); ck('spin: 4 concurrent spins → exactly one succeeds', rs.filter(r => r[1].ok).length === 1, JSON.stringify(rs.map(r => r[1].ok))); }
{ // distribution
  const counts = new Array(7).fill(0); const N = 3000;
  for (let i = 0; i < N; i++) { const u = 'sp' + i; put('users/' + u, { points: 0 }); const [, r] = await call('/account/spin', { idToken: await mk({ sub: u }) }, { ip: fresh() }); counts[r.index]++; }
  const w = [35, 30, 20, 10, 4, 1, 0]; const dev = counts.map((c, i) => Math.abs(c / N * 100 - w[i]));
  ck('spin: prize distribution matches weights (±3%)  ' + counts.join('/'), dev.every(d => d < 3) && counts[6] === 0, JSON.stringify(dev)); }

seed();
put('users/u1', { points: 150, totalSpend: 60000, claimedMilestones: [], notifications: [] });
[s, j] = await call('/account/milestone', { idToken: await tok('u1'), id: 'zzz' }); ck('milestone: unknown id → 400', s === 400);
[s, j] = await call('/account/milestone', { idToken: await tok('u1'), id: 'm300' }); ck('milestone: not enough points → refused', j.ok === false && j.reason === 'points' && get('users/u1').points === 150);
put('users/u2', { points: 500, totalSpend: 1000, claimedMilestones: [], notifications: [] });
[s, j] = await call('/account/milestone', { idToken: await tok('u2'), id: 'm100' }); ck('milestone: enough points but no real spending → refused', j.ok === false && j.reason === 'spend' && get('users/u2').points === 500, JSON.stringify(j));
{ const rs = await Promise.all([1, 2, 3].map(async () => call('/account/milestone', { idToken: await tok('u1'), id: 'm100' })));
  const u = get('users/u1');
  ck('milestone: concurrent triple claim → paid once (points 150→50, one notification)', rs.filter(r => r[1].ok).length === 1 && u.points === 50 && u.claimedMilestones.length === 1 && u.notifications.length === 1, JSON.stringify([rs.map(r => r[1]), u.points])); }
ck('milestone: owner notified via telegram', fs.tg.some(x => x.text.includes('Reward Claimed')));
[s, j] = await call('/account/milestone', { idToken: await tok('u1'), id: 'm100' }); ck('milestone: later re-claim refused', j.reason === 'claimed');

/* ───────── referral ───────── */
seed();
[s, j] = await call('/account/referral', { idToken: await tok('u2'), ref: 'u1xxxxxxxxxx' });
ck('referral: link recorded as referredBy only (no points granted yet)', j.ok && get('users/u2').referredBy === 'u1' && get('users/u1').points === 5, JSON.stringify([j, get('users/u2')]));
[s, j] = await call('/account/referral', { idToken: await tok('u2'), ref: 'u3xxxxxxxxxx' }); ck('referral: second referrer refused', j.ok === false && get('users/u2').referredBy === 'u1');
[s, j] = await call('/account/referral', { idToken: await tok('u3'), ref: 'u3xxxxxxxxxx' }); ck('referral: self-referral refused', j.ok === false && !get('users/u3').referredBy);
[s, j] = await call('/account/referral', { idToken: await tok('u3'), ref: 'unknownabcde' }); ck('referral: unknown code refused', j.ok === false);
[s, j] = await call('/account/referral', { idToken: await tok('u3'), ref: '../../x' }); ck('referral: malformed code refused', j.ok === false);

/* ───────── fingerprint ───────── */
seed();
for (const u of ['u1', 'u2', 'u3']) await call('/account/fp', { idToken: await tok(u), fp: 'abcdef0123456789' });
ck('fp: 3 accounts on one device → abuse flag + telegram', [...fs.docs.keys()].some(k => k.startsWith('abuse_flags/')) && fs.tg.some(x => x.text.includes('Multi-account')));
[s, j] = await call('/account/fp', { idToken: await tok('u1'), fp: 'nothex!' }); ck('fp: bad format ignored', j.ok === false);

/* ───────── newsletter / rating / report / visit ───────── */
seed();
[s] = await call('/newsletter/subscribe', { email: 'bad' }); ck('newsletter: bad email → 400', s === 400);
[s, j] = await call('/newsletter/subscribe', { email: 'A@B.com' }); const n1 = [...fs.docs.keys()].filter(k => k.startsWith('newsletter/')).length;
[s, j] = await call('/newsletter/subscribe', { email: 'a@b.com' }); const n2 = [...fs.docs.keys()].filter(k => k.startsWith('newsletter/')).length;
ck('newsletter: stored once, duplicates ignored (case-insensitive)', s === 200 && n1 === 1 && n2 === 1);
[s] = await call('/rating/create', { rating: 9 }); ck('rating: out of range → 400', s === 400);
[s, j] = await call('/rating/create', { rating: 5, comment: 'ممتاز <b>x</b>', idToken: await tok('u1') });
ck('rating: stored with verified uid; user ratings +1', s === 200 && [...fs.docs.entries()].some(([k, v]) => k.startsWith('ratings/') && D(v.fields.userId) === 'u1') && get('users/u1').ratings === 1);
[s] = await call('/rating/create', { rating: 5, idToken: 'bad.token.x' }); ck('rating: bad token → 401', s === 401);
{ const f = new FormData(); f.append('data', JSON.stringify({ title: 'T', category: 'c', desc: 'x'.repeat(30), orderId: 'o1' })); f.append('idToken', await tok('u1')); f.append('photo', png(), 'a.png');
  fs.tg = []; [s] = await call('/report/create', null, { form: f }); ck('report: stored + telegram photo', s === 200 && fs.tg.length === 1 && fs.tg[0].photo && [...fs.docs.keys()].some(k => k.startsWith('reports/'))); }
{ const f = new FormData(); f.append('data', JSON.stringify({ title: 'T', category: 'c', desc: 'short' })); [s] = await call('/report/create', null, { form: f }); ck('report: too short → 400', s === 400); }
[s] = await call('/stats/visit', {}); [s] = await call('/stats/visit', {}, { ip: '5.5.5.5' }); ck('visit: counter incremented atomically', get('settings/stats').visitors === 2, JSON.stringify(get('settings/stats')));

/* ───────── support ping ───────── */
seed(); fs.tg = [];
[s, j] = await call('/support/ping', { idToken: await tok('u1'), text: '<b>injected</b>' }); ck('support ping: owner notified with server-built text', s === 200 && fs.tg.length === 1 && fs.tg[0].text.includes('Support Request') && !fs.tg[0].text.includes('injected'), JSON.stringify(fs.tg));
[s] = await call('/support/ping', { idToken: 'bad.tok.en' }); ck('support ping: bad token → 401', s === 401);
{ const ip = '6.6.6.6'; fs.tg = []; for (let i = 0; i < 8; i++) await call('/support/ping', {}, { ip }); ck('support ping: per-IP cap (3 messages max)', fs.tg.length === 3, fs.tg.length); }

/* ───────── admin notify ───────── */
seed();
const adm = (over = {}) => mk({ sub: 'adm', email: 'kadirom7k777@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...over });
[s] = await call('/admin/notify', { text: 'hi' }); ck('admin: no token → 401', s === 401);
[s] = await call('/admin/notify', { idToken: await tok('u1'), text: 'hi' }); ck('admin: normal user → 403', s === 403);
[s] = await call('/admin/notify', { idToken: await adm({ email: 'evil@x.com' }), text: 'hi' }); ck('admin: other email → 403', s === 403);
[s] = await call('/admin/notify', { idToken: await adm({ email_verified: false }), text: 'hi' }); ck('admin: unverified email → 403', s === 403);
[s] = await call('/admin/notify', { idToken: await adm({ firebase: { sign_in_provider: 'password' } }), text: 'hi' }); ck('admin: password login refused (Google 2-step required) → 403', s === 403);
[s] = await call('/admin/notify', { idToken: await adm(), text: 'hello owner' }); ck('admin: Google-signed admin → ok + telegram', s === 200 && fs.tg.some(x => x.text === 'hello owner'), s);
env.ADMIN_ALLOW_PASSWORD = 'true';
[s] = await call('/admin/notify', { idToken: await adm({ firebase: { sign_in_provider: 'password' } }), text: 'x' }); ck('admin: ADMIN_ALLOW_PASSWORD=true relaxes provider check', s === 200, s);
delete env.ADMIN_ALLOW_PASSWORD;

/* ───────── e-mail a delivered code (owner only) ───────── */
seed(); fs.brevo = [];
put('users/u1', { email: 'acct1@x.com', points: 5 }); put('users/u2', { email: 'acct2@x.com', points: 5 });
put('orders/oE', { product: 'PSN 10 EUR', userId: 'u1', receiveMethod: 'email', receiveContact: 'buyer@x.com', accountEmail: 'acct1@x.com', status: 'pending' });
put('orders/oP', { product: 'Plus', userId: 'u1', receiveMethod: 'phone', receiveContact: '0555123456', accountEmail: 'acct1@x.com', status: 'pending' });
const farD = new Date(Date.now() + 40 * 864e5 + 36e5), farEnd = new Date(Date.UTC(farD.getUTCFullYear(), farD.getUTCMonth() + 1, 0)), farISO = farEnd.getUTCFullYear() + '-' + String(farEnd.getUTCMonth() + 1).padStart(2, '0') + '-' + String(farEnd.getUTCDate()).padStart(2, '0');
put('orders/oV', { product: 'Valid', userId: 'u1', receiveMethod: 'email', receiveContact: 'val@x.com', status: 'done', codeValidUntil: farISO });
put('orders/oOld', { product: 'Legacy', userId: 'u2', receiveMethod: 'phone', receiveContact: '0555000000', status: 'pending' });
put('orders/oG', { product: 'Guest', userId: 'guest', receiveMethod: 'phone', receiveContact: '0555000001', status: 'pending' });
[s] = await call('/admin/send-code', { orderId: 'oE', code: 'AAAA-BBBB' }); ck('send-code: no token → 401', s === 401);
[s] = await call('/admin/send-code', { idToken: await tok('u1'), orderId: 'oE', code: 'AAAA' }); ck('send-code: ordinary customer → 403', s === 403);
[s] = await call('/admin/send-code', { idToken: await adm({ firebase: { sign_in_provider: 'password' } }), orderId: 'oE', code: 'AAAA' }); ck('send-code: password-login admin → 403', s === 403);
ck('send-code: refused calls send no e-mail', fs.brevo.length === 0, fs.brevo.length);
[s, j] = await call('/admin/send-code', { idToken: await adm(), orderId: 'oE', code: 'AAAA-BBBB-CCCC' });
ck('send-code: e-mail order → goes to the e-mail the customer typed', s === 200 && j.ok && fs.brevo.length === 1 && fs.brevo[0].to[0].email === 'buyer@x.com', JSON.stringify([s, fs.brevo.map(m => m.to)]));
ck('send-code: reply masks the address', j.to === 'bu***@x.com', j.to);
ck('send-code: mail has the code, product and order id', /AAAA-BBBB-CCCC/.test(fs.brevo[0].htmlContent) && /PSN 10 EUR/.test(fs.brevo[0].htmlContent) && /oE/.test(fs.brevo[0].htmlContent) && /AAAA-BBBB-CCCC/.test(fs.brevo[0].textContent));
ck('send-code: sender is the store address', fs.brevo[0].sender.email === 'glitchq1q@gmail.com');
[s, j] = await call('/admin/send-code', { idToken: await adm(), orderId: 'oE', code: 'X', to: 'attacker@evil.com' });
ck('send-code: a "to" in the request cannot redirect an order\'s code', s === 200 && fs.brevo[1].to[0].email === 'buyer@x.com', fs.brevo[1] && fs.brevo[1].to[0].email);
{ const n0 = fs.brevo.length; await call('/admin/send-code', { idToken: await adm(), orderId: 'oV', code: 'VV-1' }); const m = fs.brevo[n0];
  const MN = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'][farEnd.getUTCMonth()];
  ck('send-code: the deadline stored on the order is the one in the mail (HTML + text)', !!m && m.htmlContent.includes(`صالح للاستخدام حتى نهاية ${MN}`) && m.htmlContent.includes(`${farEnd.getUTCDate()} ${MN} ${farEnd.getUTCFullYear()}`) && m.textContent.includes(`آخر موعد ${farEnd.getUTCDate()} ${MN}`), m && m.textContent.slice(0, 400)); fs.brevo.splice(n0, 1); /* keep later index-based checks aligned */ }
await call('/admin/send-code', { idToken: await adm(), orderId: 'oP', code: 'PH-1' });
ck('send-code: phone-contact order → account e-mail saved on the order', fs.brevo[2].to[0].email === 'acct1@x.com', fs.brevo[2] && fs.brevo[2].to[0].email);
await call('/admin/send-code', { idToken: await adm(), orderId: 'oOld', code: 'OLD-1' });
ck('send-code: legacy order without saved e-mail → falls back to the customer profile', fs.brevo[3].to[0].email === 'acct2@x.com', fs.brevo[3] && fs.brevo[3].to[0].email);
[s, j] = await call('/admin/send-code', { idToken: await adm(), orderId: 'oG', code: 'G-1' }); ck('send-code: guest phone order with no e-mail anywhere → 422, nothing sent', s === 422 && fs.brevo.length === 4, [s, fs.brevo.length]);
[s] = await call('/admin/send-code', { idToken: await adm(), orderId: 'nope', code: 'G-1' }); ck('send-code: unknown order → 404', s === 404, s);
[s] = await call('/admin/send-code', { idToken: await adm(), orderId: '../users/u1', code: 'G-1' }); ck('send-code: path-like order id is ignored (no path traversal) → 422', s === 422, s);
[s] = await call('/admin/send-code', { idToken: await adm(), orderId: 'oE', code: '   ' }); ck('send-code: empty code → 400', s === 400, s);
await call('/admin/send-code', { idToken: await adm(), orderId: 'oE', code: '<img src=x onerror=alert(1)>', product: '<b>Hi</b>' });
{ const m = fs.brevo[fs.brevo.length - 1]; ck('send-code: HTML in code/product is escaped in the mail', !/<img src=x|<b>Hi/.test(m.htmlContent) && /&lt;img/.test(m.htmlContent)); }
await call('/admin/send-code', { idToken: await adm(), userId: 'u2', code: 'U-1', product: 'Manual' });
ck('send-code: manual send by customer id uses the profile e-mail', fs.brevo[fs.brevo.length - 1].to[0].email === 'acct2@x.com');
const nb = fs.brevo.length;
await call('/admin/send-code', { idToken: await adm(), to: 'someone@x.com', code: 'M-1' });
ck('send-code: one-off to a typed address works for the owner', fs.brevo.length === nb + 1 && fs.brevo[nb].to[0].email === 'someone@x.com');
[s] = await call('/admin/send-code', { idToken: await adm(), to: 'not-an-email', code: 'M-1' }); ck('send-code: invalid typed address → 422', s === 422, s);
fs.failBrevo = true; [s] = await call('/admin/send-code', { idToken: await adm(), orderId: 'oE', code: 'F-1' }); fs.failBrevo = false;
ck('send-code: mail provider failure is reported (502), not hidden', s === 502, s);

/* ───────── order stores the verified account e-mail; home-page offer ───────── */
seed();
{ const t1 = await mk({ sub: 'u1', email: 'Acct1@X.com', email_verified: true });
  [s, j] = await order({ ...base }, { token: t1 }); const o = get('orders/' + j.orderId) || {};
  ck('order: verified account e-mail is stored on the order (lower-cased) for code delivery', s === 200 && o.accountEmail === 'acct1@x.com', JSON.stringify([s, o.accountEmail])); }
seed(); _bump();
put('settings/coupons', { coupons: [
  { code: 'SECRET1', type: 'percent', value: 10, active: true },
  { code: 'WINTER', type: 'percent', value: 25, active: true, featured: true, expiry: '2999-01-01', maxUses: 10, usedCount: 4, created: '2026-01-01', note: 'internal' },
  { code: 'OLDF', type: 'percent', value: 90, active: true, featured: true, expiry: '2020-01-01' },
] });
[s, j] = await call('/offer', null, { method: 'GET' });
ck('offer: only the featured, valid coupon is shown', s === 200 && j.ok && j.code === 'WINTER' && j.type === 'percent' && j.value === 25 && j.expiry === '2999-01-01' && j.left === 6, JSON.stringify(j));
ck('offer: no other coupon code or internal field leaks', !/SECRET1|OLDF|internal|usedCount|created/.test(JSON.stringify(j)), JSON.stringify(j));
seed(); _bump();
[s, j] = await call('/offer', null, { method: 'GET' }); ck('offer: nothing featured → ok:false (the page hides the card)', s === 200 && j.ok === false, JSON.stringify(j));
seed(); _bump(); put('settings/coupons', { coupons: [{ code: 'OFFX', type: 'fixed', value: 300, active: false, featured: true }] });
[s, j] = await call('/offer', null, { method: 'GET' }); ck('offer: featured but switched off → ok:false', j.ok === false, JSON.stringify(j));
seed(); _bump(); put('settings/coupons', { coupons: [{ code: 'FULL', type: 'fixed', value: 300, active: true, featured: true, maxUses: 2, usedCount: 2 }] });
[s, j] = await call('/offer', null, { method: 'GET' }); ck('offer: featured but fully used → ok:false', j.ok === false, JSON.stringify(j));
{ const ip = '9.9.9.9'; let last = 0; for (let i = 0; i < 70; i++) [last] = await call('/offer', null, { method: 'GET', ip }); ck('offer: per-IP rate limit', last === 429, last); }
[s, j] = await call('/health', null, { method: 'GET' }); ck('health reports v5', j.v === 5, JSON.stringify(j));

/* ───────── reset-password limiter, maintenance/ticker ───────── */
seed(); put('settings/maintenance', { active: true }); put('settings/ticker', { text: 'hello' });
[s, j] = await call('/maintenance', null, { method: 'GET' }); ck('maintenance flag served', j.maintenance === true);
[s, j] = await call('/ticker', null, { method: 'GET' }); ck('ticker served', j.text === 'hello');
{ const ip = '7.7.7.7'; calls = []; for (let i = 0; i < 10; i++) await call('/reset-password', { email: `v${i}@x.com` }, { ip });
  ck('reset-password: per-IP cap (exactly 5 mails from one IP, 10 attempts)', fs.brevo.length === 5, fs.brevo.length); }

/* ───────── e-mail templates (pure functions: pulled out of worker.js and called directly) ───────── */
{
  const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  const start = src.lastIndexOf('/* ═══', src.indexOf('function escHtml'));
  const T = new Function(src.slice(start) + ';return {buildResetEmail,buildResetText,buildCodeEmail,buildCodeText,buildLoginAlertEmail,buildLoginAlertText,codeValidity,monthEndISO,arDays};')();
  const evil = '<img src=x onerror=alert(1)>"&';
  const link = 'https://glitch-q.web.app/reset.html?mode=resetPassword&oobCode=abc123';
  const reset = T.buildResetEmail(link), code = T.buildCodeEmail({ product: evil, code: 'AAAA-BBBB\n<b>CCCC</b>', orderId: evil });
  const alert = T.buildLoginAlertEmail({ device: evil, place: '<script>x</script>', when: evil });
  const all = { reset, code, alert };

  for (const [n, h] of Object.entries(all)) {
    ck(`mail ${n}: RTL Arabic document, dark-mode block, preheader`, /<html dir="rtl" lang="ar"/.test(h) && /prefers-color-scheme:dark/.test(h) && /display:none;max-height:0/.test(h));
    ck(`mail ${n}: no scripts, remote images or plain-http links`, !/<script|<img|<iframe|http:\/\//i.test(h.replace(/xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/, '')));
    ck(`mail ${n}: every href is https`, [...h.matchAll(/href="([^"]*)"/g)].every(m => m[1].startsWith('https://')));
    ck(`mail ${n}: old purple palette is gone`, !/7c3aed|c026d3|4c1d95/i.test(h));
  }
  ck('mail reset: link is in the button, the fallback and the text version', (reset.match(/href="https:\/\/glitch-q\.web\.app\/reset\.html\?mode=resetPassword&amp;oobCode=abc123"/g) || []).length === 2 && T.buildResetText(link).includes(link));
  ck('mail reset: states the 1-hour / single-use rule and the never-ask-for-password promise', /ساعة واحدة/.test(reset) && /مرة واحدة فقط/.test(reset) && /لن يطلب منك كلمة المرور أبداً/.test(reset));
  ck('mail code: product, order id and code are escaped (no live markup)', !/<img src=x|<b>CCCC/.test(code) && /&lt;img src=x onerror=alert\(1\)&gt;&quot;&amp;/.test(code) && /&lt;b&gt;CCCC&lt;\/b&gt;/.test(code));
  ck('mail code: multi-line codes keep their line breaks', /white-space:pre-wrap/.test(code) && /AAAA-BBBB\n&lt;b&gt;/.test(code));
  ck('mail code: the preheader never contains the code', !/AAAA-BBBB/.test(code.slice(0, code.indexOf('</div>'))));
  ck('mail code: numbered redemption steps + region reminder', /استرداد الرموز/.test(code) && /تأكد من المنطقة/.test(code));
  { const plain = T.buildCodeEmail({ product: 'PSN 10 EUR', code: 'ZZZZ-1111-2222' }); ck('mail code: without an order id the order row is omitted', !/رقم الطلب/.test(plain.replace(/وأرسل رقم الطلب/g, ''))); }
  ck('mail alert: device / place / time are escaped', !/<script>x|<img src=x/.test(alert) && /&lt;script&gt;x&lt;\/script&gt;/.test(alert));
  ck('mail alert: says the place is approximate and gives the "not you" steps', /الموقع تقريبي/.test(alert) && /تسجيل الخروج من كل الأجهزة/.test(alert));
  /* validity: delivered in month X → valid to the LAST day of X, Algeria time (UTC+1) */
  const at = (iso) => Date.parse(iso);
  { const v = T.codeValidity('', at('2026-11-05T12:00:00Z'));
    ck('validity: delivered in November → until 30 November, 25 days left on the 5th', v.iso === '2026-11-30' && v.monthName === 'نوفمبر' && v.lastDay === 30 && v.daysLeft === 25, JSON.stringify(v)); }
  ck('validity: January has 31 days', T.codeValidity('', at('2027-01-10T08:00:00Z')).iso === '2027-01-31');
  ck('validity: leap-year February → 29', T.monthEndISO(at('2028-02-10T08:00:00Z')) === '2028-02-29' && T.monthEndISO(at('2027-02-10T08:00:00Z')) === '2027-02-28');
  ck('validity: 23:30 UTC on 31 Jan is already 1 Feb in Algiers → deadline is end of February', T.monthEndISO(at('2027-01-31T23:30:00Z')) === '2027-02-28');
  ck('validity: 22:30 UTC on 31 Dec is still 31 Dec in Algiers → last day, 0 left', (() => { const v = T.codeValidity('', at('2026-12-31T22:30:00Z')); return v.iso === '2026-12-31' && v.daysLeft === 0; })());
  { const v = T.codeValidity('2026-11-30', at('2026-12-02T10:00:00Z')); ck('validity: a stored deadline is kept on re-send (not extended into the new month)', v.iso === '2026-11-30' && v.daysLeft === -2, JSON.stringify(v)); }
  ck('validity: a garbage stored date falls back to this month\'s end', T.codeValidity('2026-13-45', at('2026-11-05T12:00:00Z')).iso === '2026-11-30');
  ck('validity: Arabic day plurals', [T.arDays(1), T.arDays(2), T.arDays(5), T.arDays(25)].join('|') === 'يوم واحد|يومان|5 أيام|25 يوماً');
  { const m = T.buildCodeEmail({ product: 'P', code: 'ZZZZ-1', orderId: 'o1', validity: T.codeValidity('', at('2026-11-05T12:00:00Z')) });
    ck('mail code: shows the deadline, days left and the "after this it is expired" rule', /30 نوفمبر 2026/.test(m) && /يتبقى 25 يوماً/.test(m) && /صالح للاستخدام حتى نهاية نوفمبر/.test(m) && /يُعتبر الكود منتهياً/.test(m));
    ck('mail code: preheader carries the deadline but not the code', /صالح حتى 30 نوفمبر 2026/.test(m.slice(0, m.indexOf('</div>'))) && !/ZZZZ-1/.test(m.slice(0, m.indexOf('</div>'))));
    ck('mail code: calendar tile shows the last day number', />30<\/div>/.test(m));
    ck('mail code text: has the deadline', T.buildCodeText({ product: 'P', code: 'ZZZZ-1', validity: T.codeValidity('', at('2026-11-05T12:00:00Z')) }).includes('آخر موعد 30 نوفمبر 2026')); }
  { const warn = T.buildCodeEmail({ product: 'P', code: 'C', validity: T.codeValidity('', at('2026-11-28T12:00:00Z')) });
    const last = T.buildCodeEmail({ product: 'P', code: 'C', validity: T.codeValidity('', at('2026-11-30T12:00:00Z')) });
    const gone = T.buildCodeEmail({ product: 'P', code: 'C', validity: T.codeValidity('2026-11-30', at('2026-12-02T12:00:00Z')) });
    ck('mail code: 2 days left → warning tone, "يومان"', /يتبقى يومان/.test(warn) && /FFF6E0/i.test(warn.slice(warn.indexOf('طلبك جاهز</h1>'))));
    ck('mail code: last day → "today is the last day"', /اليوم آخر يوم لصلاحية الكود/.test(last) && /FFF0F1/i.test(last.slice(last.indexOf('طلبك جاهز</h1>'))));
    ck('mail code: already past the deadline → says expired', /انتهت مدة صلاحية هذا الكود/.test(gone) && !/يتبقى/.test(gone)); }
  { /* admin.js computes the same date for the notification the customer sees */
    const adm = readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
    const fn = /function codeUntil\(ms\)\{[^\n]*\}/.exec(adm);
    const codeUntil = fn && new Function(fn[0] + ';return codeUntil;')();
    const probes = ['2026-01-31T23:30:00Z', '2026-02-10T08:00:00Z', '2028-02-29T22:59:00Z', '2028-02-29T23:00:00Z', '2026-11-30T23:30:00Z', '2026-12-31T22:59:59Z', '2026-12-31T23:00:00Z', '2027-06-15T12:00:00Z'];
    ck('validity: admin.js codeUntil() agrees with the Worker on every probe date', !!codeUntil && probes.every(d => codeUntil(Date.parse(d)) === T.monthEndISO(Date.parse(d))), probes.map(d => codeUntil && codeUntil(Date.parse(d)) + '/' + T.monthEndISO(Date.parse(d))).join(' ')); 
    ck('validity: completing an order stores the deadline once (never overwritten)', /if\(!o\.codeValidUntil\)upd0\.codeValidUntil=\(notif&&notif\.until\)\|\|codeUntil\(\)/.test(adm)); }
  ck('mail text versions carry the same facts', T.buildCodeText({ product: 'P', code: 'C-1', orderId: 'O1' }).includes('C-1') && T.buildLoginAlertText({ device: 'D', place: 'Pl', when: 'W' }).includes('الجهاز: D'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
