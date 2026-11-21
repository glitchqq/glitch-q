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
const D = v => { if (!v) return null; if ('bytesValue' in v) return Buffer.from(v.bytesValue, 'base64'); if ('stringValue' in v) return v.stringValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue; if ('booleanValue' in v) return v.booleanValue; if ('timestampValue' in v) return v.timestampValue; if ('nullValue' in v) return null; if ('arrayValue' in v) return (v.arrayValue.values || []).map(D); if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, D(x)])); };
const E = v => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : typeof v === 'string' ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(E) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, E(x)])) } };
const dnsTable = {};
const fs = { dnsCalls: 0, dnsDown: false, docs: new Map(), ver: 1, commits: 0, failTelegram: false, tg: [], brevo: [], gets: 0, authDel: [], failAuthDel: '' };
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
  if (url.startsWith('https://cloudflare-dns.com/dns-query')) {
    fs.dnsCalls++; if (fs.dnsDown) throw new Error('dns down');
    const u = new URL(url), name = u.searchParams.get('name'), type = u.searchParams.get('type'), rec = dnsTable[name];
    if (!rec) return J({}, 404);
    if (rec.status) return J({ Status: rec.status });
    const ans = (rec.records || []).filter(r => r.type === ({ MX: 15, A: 1, AAAA: 28 })[type]);
    return J({ Status: 0, Answer: ans });
  }
  if (url.includes('service_accounts/v1/jwk')) return J({ keys: [jwk] }, 200, { 'cache-control': 'public, max-age=3600' });
  if (url.includes('oauth2.googleapis.com/token')) return J({ access_token: 'tok' });
  if (url.includes('sendOobCode')) { const rt = JSON.parse(init.body).requestType; if (fs.failOob) return J({ error: { message: 'no' } }, 400); return J({ oobLink: 'https://glitch-q.firebaseapp.com/__/auth/action?mode=' + (rt === 'VERIFY_EMAIL' ? 'verifyEmail' : 'resetPassword') + '&oobCode=abc' }); }
  if (url.includes('accounts:delete')) { if (fs.failAuthDel) return J({ error: { message: fs.failAuthDel } }, fs.failAuthDel === 'USER_NOT_FOUND' ? 400 : 403); fs.authDel.push(JSON.parse(init.body).localId); return J({}); }
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
  vm.runInNewContext(grab(/const RATES=[^\n]+/).replace('const ', 'this.') + ';' + grab(/const SPIN_SEGMENTS=\[[\s\S]*?\n\];/).replace('const ', 'this.'), ctx);
  const w = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  const wRates = vm.runInNewContext('(' + /const RATES = (\{[^}]+\})/.exec(w)[1] + ')');
  ck('RATES identical in worker and script.js', JSON.stringify(wRates) === JSON.stringify(ctx.RATES), JSON.stringify([wRates, ctx.RATES]));
  const adminSrc = readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
  const aRates = vm.runInNewContext('(' + /const PF_RATES=(\{[^}]+\})/.exec(adminSrc)[1] + ')');
  ck('RATES identical in worker and the admin price hint (admin.js)', JSON.stringify(aRates) === JSON.stringify(wRates), JSON.stringify([aRates, wRates]));
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
[s, j] = await call('/account/streak', { idToken: await tok('u2') }); ck('streak: consecutive day → streak 7, bonus 3 (free points are small)', j.ok && j.streak === 7 && j.bonus === 3 && get('users/u2').points === 13, JSON.stringify(j));
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

/* ───────── profit-funded rewards ───────── */
const ECON = (await import('../econ.js')).default;
seed();
put('users/u1', { points: 5000, rewardPool: 0, notifications: [] });          // lots of FREE points, nothing earned from purchases
put('users/u2', { points: 600, rewardPool: 1600, notifications: [] });        // enough pool for exactly one 5€ card (160 pts)
put('users/u3', { points: 100, rewardPool: 100000, notifications: [] });      // rich pool, too few points
[s] = await call('/account/rewards', {}); ck('rewards: no token → 401', s === 401);
[s, j] = await call('/account/rewards', { idToken: await tok('u1') });
ck('rewards: free points with an empty pool are all LOCKED (5000 pts, 0 redeemable)', s === 200 && j.ok && j.points === 5000 && j.redeemablePts === 0 && j.lockedPts === 5000, JSON.stringify(j));
ck('rewards: catalogue priced in points from retail price (5€ = 1600 DZD = 160 pts)', j.rewards.find(r => r.id === 'r5').pts === 160 && j.rewards.length === 4, JSON.stringify(j.rewards));
[s, j] = await call('/account/rewards', { idToken: await tok('u2') }); ck('rewards: redeemable = min(points, pool/ptDZD) = 160', j.redeemablePts === 160 && j.lockedPts === 440, JSON.stringify(j));
[s, j] = await call('/account/redeem', { idToken: await tok('u1'), id: 'zzz' }); ck('redeem: unknown id → 400', s === 400);
[s, j] = await call('/account/redeem', { idToken: await tok('u1'), id: 'r5' });
ck('redeem: 5000 free points but empty pool → refused "locked", nothing changes (the store cannot be drained with free points)', j.ok === false && j.reason === 'locked' && get('users/u1').points === 5000 && get('users/u1').rewardPool === 0, JSON.stringify(j));
[s, j] = await call('/account/redeem', { idToken: await tok('u3'), id: 'r5' }); ck('redeem: rich pool but not enough points → refused "points"', j.ok === false && j.reason === 'points' && get('users/u3').points === 100, JSON.stringify(j));
{ const rs = await Promise.all([1, 2, 3].map(async () => call('/account/redeem', { idToken: await tok('u2'), id: 'r5' })));
  const u = get('users/u2');
  ck('redeem: concurrent triple request → exactly one paid (points 600→440, pool 1600→0)', rs.filter(r => r[1].ok).length === 1 && u.points === 440 && u.rewardPool === 0 && u.notifications.length === 1 && u.redeemed === 1, JSON.stringify([rs.map(r => r[1]), u])); }
ck('redeem: a pending claim for the owner was written (owner-only collection)', [...fs.docs.keys()].some(k => k.startsWith('reward_claims/')) && D(fs.docs.get([...fs.docs.keys()].find(k => k.startsWith('reward_claims/'))).fields.status) === 'pending');
ck('redeem: owner notified via telegram', fs.tg.some(x => x.text.includes('Reward Claimed')));
[s, j] = await call('/account/redeem', { idToken: await tok('u2'), id: 'r5' }); ck('redeem: second card refused — the pool is spent', j.ok === false && j.reason === 'locked');
[s, j] = await call('/account/milestone', { idToken: await tok('u3'), id: 'r5' }); ck('old /account/milestone path behaves like /account/redeem', j.reason === 'points');

/* owner's own rules: custom rewards come from settings/economics, and cost prices never reach the browser */
put('settings/economics', { earnPct: 30, rewards: [{ id: 'x1', name: 'Plus شهر', nameEn: 'Plus 1m', priceDZD: 2501 }], costs: { p1: 1234567, p2: 7654321 }, marginPct: 11 });
put('users/u4', { points: 1000, rewardPool: 5000, notifications: [] });
[s, j] = await call('/account/rewards', { idToken: await tok('u4') });
ck('economics: custom reward used; price 2501 DZD → ceil(2501/10) = 251 pts', j.rewards.length === 1 && j.rewards[0].id === 'x1' && j.rewards[0].pts === 251, JSON.stringify(j));
ck('economics: cost prices / margin / shares never appear in the response', !/1234567|7654321|marginPct|earnPct|costs|rewardPool/.test(JSON.stringify(j)), JSON.stringify(j));
[s, j] = await call('/account/redeem', { idToken: await tok('u4'), id: 'x1' }); ck('economics: redeem custom reward → points −251, pool −2510', j.ok && get('users/u4').points === 749 && get('users/u4').rewardPool === 2490, JSON.stringify([j, get('users/u4')]));
put('settings/economics', { rewards: 'garbage', ptDZD: 'abc', earnPct: 'abc' });
[s, j] = await call('/account/rewards', { idToken: await tok('u4') }); ck('economics: garbage settings fall back to safe defaults', s === 200 && j.ptDZD === 10 && j.rewards.length === 4, JSON.stringify(j));

/* invariant, property-style: whatever the sequence of redemptions, the total worth redeemed never exceeds the pool the customer was given */
{ let bad = 0, total = 0;
  for (let n = 0; n < 40; n++) {
    const uid = 'inv' + n;     // one account per round: the per-account rate limiter would otherwise cut the loop short
    const pool = [0, 500, 1600, 3000, 7777, 20000][n % 6], pts = [10, 150, 700, 5000, 100000][n % 5];
    put('users/' + uid, { points: pts, rewardPool: pool, notifications: [] });
    for (let k = 0; k < 6; k++) await call('/account/redeem', { idToken: await tok(uid), id: ['r5', 'r15', 'r20', 'r50'][(n + k) % 4] });
    const u = get('users/' + uid), spentWorth = pool - u.rewardPool;
    total++; if (u.rewardPool < 0 || u.points < 0 || spentWorth > pool || spentWorth !== (pts - u.points) * 10) bad++;
  }
  ck('invariant: 40 random pool/points mixes × 6 redemptions — pool and points never negative, worth redeemed ≤ pool, points and pool fall together', bad === 0 && total === 40, bad); }

/* the Worker's normEcon must agree with the panel's (econ.js) */
{ const inputs = [null, {}, { earnPct: 80, refPct: 80 }, { earnPct: 30.9, refPct: 20, ptDZD: 0.2, marginPct: 99 }, { rewards: [{ id: 'a b', priceDZD: 5 }, { id: 'ok', priceDZD: 99.9, name: '<b>x</b>' }, { id: 'ok', priceDZD: 5 }] }, { refMaxPts: 1e9, refMinOrderDZD: -5 }, { rewards: [] }];
  const strip = e => { const c = JSON.parse(JSON.stringify(e)); delete c.costs; c.rewards.forEach(r => delete r.prodId); return c; };
  const wsrc = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  const cleanSrc = /function cleanText\([\s\S]*?\n}\n/.exec(wsrc)[0];
  const wNorm = vm.runInNewContext(cleanSrc + wsrc.slice(wsrc.indexOf('const ECON_DEFAULTS'), wsrc.indexOf('async function loadEcon')) + ';normEcon');
  ck('normEcon extracted from worker.js', typeof wNorm === 'function');
  let same = 0; if (wNorm) for (const x of inputs) if (JSON.stringify(wNorm(x)) === JSON.stringify(strip(ECON.normEcon(x)))) same++;
  ck('normEcon: Worker and econ.js give the same answer on ' + inputs.length + ' tricky inputs', same === inputs.length, same + '/' + inputs.length); }

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
[s, j] = await call('/health', null, { method: 'GET' }); ck('health reports v12', j.v === 12, JSON.stringify(j));

/* ───────── reset-password limiter, maintenance/ticker ───────── */
seed(); put('settings/maintenance', { active: true }); put('settings/ticker', { text: 'hello' });
[s, j] = await call('/maintenance', null, { method: 'GET' }); ck('maintenance flag served', j.maintenance === true);
[s, j] = await call('/ticker', null, { method: 'GET' }); ck('ticker served', j.text === 'hello');
{ const ip = '7.7.7.7'; calls = []; for (let i = 0; i < 10; i++) await call('/reset-password', { email: `v${i}@x.com` }, { ip });
  ck('reset-password: per-IP cap (exactly 5 mails from one IP, 10 attempts)', fs.brevo.length === 5, fs.brevo.length); }
{ /* the link in the e-mail opens the store's own (current) reset page, not the stale Firebase-hosted copy */
  const m = fs.brevo[0] && fs.brevo[0].htmlContent || '';
  ck('reset-password: the e-mailed link points at the store site reset page with the one-time code', /href="https:\/\/glitchqq\.github\.io\/glitch-q\/reset\.html\?mode=resetPassword&amp;oobCode=abc"/.test(m) && !/web\.app/.test(m), (m.match(/href="[^"]*reset[^"]*"/) || [])[0]);
  const png = readFileSync(new URL('../assets/logo/mail-header.png', import.meta.url));
  ck('mail header banner exists, is a 1200x192 PNG and OPAQUE (RGB, no alpha) so the logo is readable on any recoloured background', png.slice(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 192 && png[25] === 2, `${png.readUInt32BE(16)}x${png.readUInt32BE(20)} colorType=${png[25]}`);
}

/* ───────── security audit round: durable limits across Worker instances + body-size caps ───────── */
{
  // every `import` with a different query string is a fresh module = a fresh Cloudflare isolate with empty in-memory limiters
  let inst = 0;
  const raw = async (path, body, ip, W) => {
    const w = W || (await import('./worker.js?isolate=' + (++inst))).default;
    const r = await w.fetch(new Request('https://w.example' + path, { method: 'POST', headers: { Origin: ORIGIN, 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env, { waitUntil() {} });
    let j = {}; try { j = await r.json(); } catch {} return [r.status, j];
  };
  seed(); fs.brevo.length = 0;
  for (let i = 0; i < 6; i++) await raw('/reset-password', { email: 'Victim@x.com' }, '20.0.0.' + (i + 1));   // new instance AND new IP every time
  ck('reset-password: durable per-address cap holds across Worker instances and IPs (3 mails/hour from 6 attempts)', fs.brevo.length === 3, fs.brevo.length);
  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now()));
  ck('reset-password: the counter lives in an owner-only Firestore document, not in the browser-visible collections', [...fs.docs.keys()].some(k => /^rate_limits\/reset_[0-9a-f]{40}$/.test(k)) && !('rate_limits/reset_victim@x.com' in Object.fromEntries(fs.docs)));
  put('rate_limits/resetmail_' + dayKey, { n: 120, until: Date.now() + 3600000 });
  fs.brevo.length = 0;
  let [rs, rj] = await raw('/reset-password', { email: 'someone-else@x.com' }, '20.0.1.1');
  ck('reset-password: once the daily reset-mail cap is reached no further mail is sent (quota stays free for order codes), still a neutral answer', fs.brevo.length === 0 && rs === 200 && rj.ok === true, fs.brevo.length + ' ' + rs);
  put('rate_limits/resetmail_' + dayKey, { n: 5, until: Date.now() + 3600000 });
  await raw('/reset-password', { email: 'another@x.com' }, '20.0.1.2');
  ck('reset-password: below the daily cap mails still go out', fs.brevo.length === 1, fs.brevo.length);
  const big = JSON.stringify({ email: 'a@b.co', pad: 'x'.repeat(200000) });
  [rs] = await raw('/reset-password', big, '20.0.2.1'); ck('reset-password: oversized body rejected (400) instead of being parsed', rs === 400, rs);
  [rs] = await raw('/account/revoke-sessions', JSON.stringify({ idToken: 'x', pad: 'x'.repeat(200000) }), '20.0.2.2'); ck('revoke-sessions: oversized body rejected (400)', rs === 400, rs);
  [rs] = await raw('/account/login-alert', JSON.stringify({ idToken: 'x', pad: 'x'.repeat(200000) }), '20.0.2.3'); ck('login-alert: oversized body rejected (400)', rs === 400, rs);
  [rs] = await raw('/account/login-alert', JSON.stringify({ idToken: await mk({ email_verified: true }) }), '20.0.2.4'); ck('login-alert: a normal token body is still accepted by the size cap', rs === 200 || rs === 500 || rs === 502, rs);
}

/* ───────── e-mail templates (pure functions: pulled out of worker.js and called directly) ───────── */
{
  const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  const start = src.lastIndexOf('/* ═══', src.indexOf('function escHtml'));
  const T = new Function(src.slice(start) + ';return {buildResetEmail,buildResetText,buildVerifyEmail,buildVerifyText,buildCodeEmail,buildCodeText,buildLoginAlertEmail,buildLoginAlertText,codeValidity,monthEndISO,arDays};')();
  const evil = '<img src=x onerror=alert(1)>"&';
  const link = 'https://glitchqq.github.io/glitch-q/reset.html?mode=resetPassword&oobCode=abc123';
  const reset = T.buildResetEmail(link), code = T.buildCodeEmail({ product: evil, code: 'AAAA-BBBB\n<b>CCCC</b>', orderId: evil });
  const alert = T.buildLoginAlertEmail({ device: evil, place: '<script>x</script>', when: evil });
  const vlink = 'https://glitchqq.github.io/glitch-q/reset.html?mode=verifyEmail&oobCode=abc123';
  const verify = T.buildVerifyEmail(vlink, '<script>x</script>Ali');
  const all = { reset, code, alert, verify };

  for (const [n, h] of Object.entries(all)) {
    ck(`mail ${n}: RTL Arabic document, dark-native (declares a dark colour scheme), hidden preheader`, /<html dir="rtl" lang="ar"/.test(h) && /<meta name="color-scheme" content="dark">/.test(h) && /display:none;max-height:0/.test(h));
    ck(`mail ${n}: no scripts, iframes or plain-http links; the only image is the opaque header banner with alt text`, !/<script|<iframe|http:\/\//i.test(h.replace(/xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/, '')) && [...h.matchAll(/<img\b[^>]*>/g)].every(m => /src="https:\/\/glitchqq\.github\.io\/glitch-q\/assets\/logo\/mail-header\.png"/.test(m[0]) && /alt="GLITCH Q"/.test(m[0]) && /width="600" height="96"/.test(m[0])) && (h.match(/<img\b/g) || []).length === 1);
    /* Gmail (and others) drop dir= from <html>/<body>: every text block must carry its own direction, or Arabic sentences with Latin words come out scrambled */
    ck(`mail ${n}: every paragraph/heading/cell that holds text carries its own dir="rtl"`, [...h.matchAll(/<(p|h1|td)\b([^>]*)>(?=[^<]*[؀-ۿ])/g)].every(m => /\bdir="rtl"/.test(m[2])), [...h.matchAll(/<(p|h1|td)\b([^>]*)>(?=[^<]*[؀-ۿ])/g)].filter(m => !/\bdir="rtl"/.test(m[2])).map(m => m[0]).join(' | '));
    { /* what a reader sees inside Arabic text: no bare Latin word outside an isolated (dir=ltr/auto) span, code box or link */
      const vis = h.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<span dir="(?:ltr|auto)"[^>]*>[\s\S]*?<\/span>/g, ' ').replace(/<div[^>]*\bdir="(?:ltr|auto)"[^>]*>[\s\S]*?<\/div>/g, ' ').replace(/<a\b[\s\S]*?<\/a>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#?\w+;/g, ' ');
      ck(`mail ${n}: no Latin word sits loose inside Arabic text (isolated, so the sentence order survives any mail app)`, !/[A-Za-z]{2,}/.test(vis), (vis.match(/[A-Za-z]{2,}/g) || []).join(',')); }
    ck(`mail ${n}: dark-native — no light card/page/box backgrounds left`, !/(?:background-color|bgcolor)[:=]"?#(?:FFFFFF|FFF|F5F7FB|EDF0F6|FFF1F3|FFF6E0|FFF0F1|E8F8F1)\b/i.test(h.replace(/background-color:#FFFFFF;"?>\s*<\/td>/g, '')));
    ck(`mail ${n}: every href is https`, [...h.matchAll(/href="([^"]*)"/g)].every(m => m[1].startsWith('https://')));
    ck(`mail ${n}: old purple palette is gone`, !/7c3aed|c026d3|4c1d95/i.test(h));
  }

  /* ── account verification mail + phone layout guarantees ── */
  ck('mail verify: link is in the button, the fallback and the text version', (verify.match(/href="https:\/\/glitchqq\.github\.io\/glitch-q\/reset\.html\?mode=verifyEmail&amp;oobCode=abc123"/g) || []).length === 2 && T.buildVerifyText(vlink, 'Ali').includes(vlink));
  ck('mail verify: Arabic copy — activate button, what happens next, "not you? ignore", never-ask-for-password promise', /تفعيل الحساب/.test(verify) && /ماذا بعد الضغط/.test(verify) && /لم تنشئ حساباً/.test(verify) && /لن نطلب منك كلمة المرور أبداً/.test(verify));
  ck('mail verify: the first name is escaped (no live markup)', !/<script>x/.test(verify) && /&lt;script&gt;x&lt;\/script&gt;Ali/.test(verify));
  ck('mail verify: works without a name too', /فعّل حسابك/.test(T.buildVerifyEmail(vlink, '')) && !/أهلاً/.test(T.buildVerifyEmail(vlink, '')));
  for (const [n, h] of Object.entries(all)) {
    ck(`mail ${n}: phone-safe card — fluid 100% width capped at 600px (a fixed width="600" table pushed the whole letter off-screen on Android)`, !/<table[^>]*width="600"/.test(h.replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g, '')) && /max-width:600px/.test(h) && /<!--\[if mso\]>/.test(h));
    ck(`mail ${n}: iPhone/Apple Mail must not turn codes and digits into blue phone/date links (format-detection + x-apple-data-detectors)`, /<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">/.test(h) && /a\[x-apple-data-detectors\]\{color:inherit!important/.test(h));
  }
  { /* the code must fit a 320px phone at the size we choose, without relying on word wrapping (62% of the font size per mono glyph + letter-spacing, 236px available) */
    for (const c of ['ZZZZ-1', 'KMPJXkmoiQmPOBWU', 'XXXX-YYYY-ZZZZ-WWWW', 'ABCD-EFGH-IJKL-MNOP-QRST']) {
      const h = T.buildCodeEmail({ product: 'P', code: c, orderId: 'o1' });
      const fs_ = Number(/font-size:(\d+)px;line-height:1\.5;font-weight:700;letter-spacing:(\d)px/.exec(h)[1]), ls = Number(/font-size:\d+px;line-height:1\.5;font-weight:700;letter-spacing:(\d)px/.exec(h)[1]);
      ck(`mail code: a ${c.length}-character code fits a 320px phone (${fs_}px)`, c.length * (0.62 * fs_ + ls) <= 236, `${fs_}px`);
    }
    const h = T.buildCodeEmail({ product: 'P', code: 'KMPJXkmoiQmPOBWU' });
    ck('mail code: the roomy desktop size comes back through a media query', /@media only screen and \(min-width:600px\)/.test(h) && /class="cd26"/.test(h) && /\.cd26\{font-size:26px!important/.test(h));
    ck('mail code: long unbroken strings can wrap (word-break + overflow-wrap) and the link box cannot widen the letter (table-layout:fixed)', /word-break:break-all;overflow-wrap:anywhere/.test(h) && /table-layout:fixed/.test(reset) && /table-layout:fixed/.test(verify));
  }
  ck('mail reset: link is in the button, the fallback and the text version', (reset.match(/href="https:\/\/glitchqq\.github\.io\/glitch-q\/reset\.html\?mode=resetPassword&amp;oobCode=abc123"/g) || []).length === 2 && T.buildResetText(link).includes(link));
  ck('mail reset: states the 1-hour / single-use rule and the never-ask-for-password promise', /ساعة واحدة/.test(reset) && /مرة واحدة فقط/.test(reset) && /لن نطلب منك كلمة المرور أبداً/.test(reset));
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
    ck('mail code: 2 days left → warning tone, "يومان"', /يتبقى يومان/.test(warn) && /241B09/i.test(warn.slice(warn.indexOf('طلبك جاهز</h1>'))));
    ck('mail code: last day → "today is the last day"', /اليوم آخر يوم لصلاحية الكود/.test(last) && /2A1015/i.test(last.slice(last.indexOf('طلبك جاهز</h1>'))));
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

/* ───────── newsletter: owner composer + signed unsubscribe ───────── */
{
  const sha = async x => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(x)))).map(b => b.toString(16).padStart(2, '0')).join('');
  const sub = async (email, extra = {}) => { const id = (await sha(email)).slice(0, 40); put('newsletter/' + id, { email, date: '2026-11-01', ...extra }); return id; };
  const raw = async (path, { method = 'GET', ip = fresh(), origin } = {}) => {
    const h = { 'CF-Connecting-IP': ip }; if (origin) h.Origin = origin;
    const r = await worker.fetch(new Request('https://w.example' + path, { method, headers: h }), env, { waitUntil() {} });
    return [r.status, await r.text(), r.headers];
  };
  const mail = { subject: 'عرض نهاية الأسبوع', preheader: 'خصم على بطاقات PlayStation', body: 'مرحباً بك!\n\nخصم 10% على كل البطاقات حتى الجمعة.\n\n## ما الجديد\n\n- بطاقات PlayStation Plus\n- كوبون WEEKEND\n\nلا تفوّت العرض.', ctaLabel: 'تسوّق الآن', ctaUrl: 'https://glitchqq.github.io/glitch-q/' };
  const nlCall = async (over, tokenOver) => call('/admin/newsletter', { idToken: tokenOver === undefined ? await adm() : tokenOver, ...mail, ...over });
  seed();
  const ids = []; for (const e of ['a1@x.com', 'a2@x.com', 'a3@x.com', 'a4@x.com', 'a5@x.com']) ids.push(await sub(e));
  put('newsletter/legacyDocId01', { email: 'legacy@x.com' }); put('newsletter/badmailDocId1', { email: 'not-an-email' });

  let [st, jj] = await nlCall({ mode: 'send', campaign: 'c1abcdef' }, null); ck('newsletter: no token → 401', st === 401);
  [st, jj] = await nlCall({ mode: 'send', campaign: 'c1abcdef' }, await tok('u1')); ck('newsletter: ordinary customer → 403, nothing sent', st === 403 && fs.brevo.length === 0);
  [st] = await nlCall({ mode: 'send', campaign: 'c1abcdef' }, await adm({ firebase: { sign_in_provider: 'password' } })); ck('newsletter: password-login admin → 403', st === 403);
  [st] = await nlCall({ mode: 'bogus' }); ck('newsletter: unknown mode → 400', st === 400);
  [st] = await nlCall({ mode: 'preview', subject: 'x' }); ck('newsletter: too-short subject → 400', st === 400);
  [st] = await nlCall({ mode: 'preview', body: 'قصير' }); ck('newsletter: too-short body → 400', st === 400);
  [st] = await nlCall({ mode: 'preview', ctaUrl: 'javascript:alert(1)' }); ck('newsletter: a non-https button link is refused', st === 400);
  [st] = await nlCall({ mode: 'preview', ctaUrl: 'http://x.com/a' }); ck('newsletter: an http button link is refused', st === 400);
  [st] = await nlCall({ mode: 'preview', ctaLabel: '', ctaUrl: 'https://x.com/a' }); ck('newsletter: a link without a label is refused', st === 400);

  // preview: HTML only, nothing leaves the Worker
  const b0 = fs.brevo.length;
  [st, jj] = await nlCall({ mode: 'preview' });
  const H = jj.html || '';
  ck('newsletter preview: returns the dark crimson mail, sends nothing', st === 200 && /<html dir="rtl"/.test(H) && /mail-header\.png/.test(H) && fs.brevo.length === b0 && !/\{\{params/.test(H));
  ck('newsletter preview: subject is the headline, paragraphs/heading/list are rendered, button points at the link', /عرض نهاية الأسبوع<\/h1>/.test(H) && /<h2[^>]*>ما الجديد<\/h2>/.test(H) && (H.match(/&#9679;<\/td>/g) || []).length === 2 && /href="https:\/\/glitchqq\.github\.io\/glitch-q\/"[^>]*>تسوّق الآن/.test(H));
  ck('newsletter preview: Latin words are isolated (PlayStation Plus, WEEKEND, 10%)', /<span dir="ltr"[^>]*>PlayStation Plus<\/span>/.test(H) && /<span dir="ltr"[^>]*>WEEKEND<\/span>/.test(H) && /<span dir="ltr"[^>]*>10%<\/span>/.test(H));
  ck('newsletter preview: carries an unsubscribe link slot', /إلغاء الاشتراك<\/a>/.test(H));
  [st, jj] = await nlCall({ mode: 'preview', subject: 'خصم <script>alert(1)</script> {{params.unsub}}', body: 'سطر <img src=x onerror=alert(1)> {{x}} {%y%}\n\nثاني' });
  ck('newsletter: owner text is escaped and template tokens are stripped', !/<script|<img src=x|\{\{|\{%/.test(jj.html) && /&lt;script&gt;/.test(jj.html));

  // test send: exactly one e-mail, to the owner, with a working unsubscribe link
  [st, jj] = await nlCall({ mode: 'test' });
  let bm = fs.brevo[fs.brevo.length - 1] || {};
  ck('newsletter test: one version, addressed to the OWNER only, "[تجربة]" subject', st === 200 && bm.messageVersions && bm.messageVersions.length === 1 && bm.messageVersions[0].to[0].email === 'kadirom7k777@gmail.com' && bm.subject.startsWith('[تجربة]') && !bm.to, JSON.stringify(bm).slice(0, 200));
  ck('newsletter test: body uses the per-recipient placeholder and a plain-text part', /href="\{\{params\.unsub\}\}"/.test(bm.htmlContent) && /\{\{params\.unsub\}\}/.test(bm.textContent) && bm.tags[0] === 'newsletter');
  const link0 = bm.messageVersions[0].params.unsub;
  ck('newsletter test: unsubscribe link is on the Worker origin with a signed token', /^https:\/\/w\.example\/newsletter\/unsubscribe\?i=[a-f0-9]{40}&t=[a-f0-9]{32}$/.test(link0), link0);

  // send in chunks and continue the same campaign next day
  fs.brevo.length = 0;
  [st, jj] = await nlCall({ mode: 'send', campaign: 'c1abcdef', max: 3 });
  const vers = fs.brevo.flatMap(b => b.messageVersions);
  ck('newsletter send: respects the per-run cap (3 of 6 valid), skips the invalid address, reports the rest', st === 200 && jj.sent === 3 && jj.remaining === 3 && jj.total === 6 && vers.length === 3 && !vers.some(v => v.to[0].email === 'not-an-email'), JSON.stringify(jj));
  ck('newsletter send: every recipient gets their OWN signed link (id matches the stored doc)', (await Promise.all(vers.map(async v => { const m = v.params.unsub.match(/i=([^&]+)&t=([a-f0-9]{32})/); return m && fs.docs.has('newsletter/' + m[1]) && JSON.stringify(get('newsletter/' + m[1]).email) === JSON.stringify(v.to[0].email); }))).every(Boolean) && new Set(vers.map(v => v.params.unsub)).size === 3);
  ck('newsletter send: sent subscribers are marked with the campaign id', [...fs.docs.keys()].filter(k => k.startsWith('newsletter/') && get(k).lastCampaign === 'c1abcdef').length === 3);
  fs.brevo.length = 0;
  [st, jj] = await nlCall({ mode: 'send', campaign: 'c1abcdef', max: 250 });
  const vers2 = fs.brevo.flatMap(b => b.messageVersions);
  ck('newsletter send: continuing the same campaign sends only to those not yet reached (no duplicates)', st === 200 && jj.sent === 3 && jj.remaining === 0 && jj.already === 3 && vers2.length === 3 && !vers2.some(v => vers.some(w => w.to[0].email === v.to[0].email)), JSON.stringify(jj));
  fs.brevo.length = 0;
  [st, jj] = await nlCall({ mode: 'send', campaign: 'c1abcdef' });
  ck('newsletter send: a third press sends nothing', st === 200 && jj.sent === 0 && fs.brevo.length === 0);
  [st] = await nlCall({ mode: 'send', campaign: '' }); ck('newsletter send: a campaign id is required', st === 400);

  // chunking: >100 recipients are split into several Brevo calls (≤ 100 each)
  for (let i = 0; i < 230; i++) await sub(`bulk${i}@x.com`);
  fs.brevo.length = 0; const c0 = calls.length;
  [st, jj] = await nlCall({ mode: 'send', campaign: 'cBulk0001', max: 1000 });
  const subreq = calls.length - c0;
  ck('newsletter send: batches of at most 100 per Brevo call', st === 200 && fs.brevo.length >= 3 && fs.brevo.every(b => b.messageVersions.length <= 100) && fs.brevo.flatMap(b => b.messageVersions).length === jj.sent, `${fs.brevo.length} calls, sent ${jj.sent}`);
  ck('newsletter send: a full 1000-recipient run uses well under the 50-subrequest Worker limit', jj.sent > 200 && subreq <= 30, `subrequests=${subreq} for ${jj.sent}`);

  // provider failure: stops, reports, marks nothing for the failed batch
  seed(); for (const e of ['f1@x.com', 'f2@x.com']) await sub(e);
  fs.failBrevo = true;
  [st, jj] = await nlCall({ mode: 'send', campaign: 'cFail0001' });
  fs.failBrevo = false;
  ck('newsletter send: provider refusal → 502, nothing marked as sent', st === 502 && jj.ok === false && jj.sent === 0 && [...fs.docs.keys()].every(k => !k.startsWith('newsletter/') || !get(k).lastCampaign), JSON.stringify(jj));
  [st, jj] = await nlCall({ mode: 'send', campaign: 'cFail0001' });
  ck('newsletter send: after the outage the same campaign delivers to both', st === 200 && jj.sent === 2);

  // ── unsubscribe link: no Origin needed, signed, confirm-then-delete, idempotent ──
  seed(); const idU = await sub('leaver@x.com'); const idK = await sub('keeper@x.com');
  const mkLink = async id => { const b = fs.brevo.length; const emailOf = get('newsletter/' + id).email; await nlCall({ mode: 'send', campaign: 'cU' + id.slice(0, 8), max: 1000 }); const v = fs.brevo.slice(b).flatMap(x => x.messageVersions).find(v => v.to[0].email === emailOf); return v.params.unsub.replace('https://w.example', ''); };
  const linkU = await mkLink(idU), linkK = await mkLink(idK);
  let r = await raw(linkU);
  ck('unsubscribe GET: works with no Origin header, shows a confirm page, deletes NOTHING', r[0] === 200 && /نعم، ألغِ اشتراكي/.test(r[1]) && fs.docs.has('newsletter/' + idU) && /text\/html/.test(r[2].get('content-type')) && /default-src 'none'/.test(r[2].get('content-security-policy')));
  ck('unsubscribe page: carries no e-mail address, no-store, not framable', !/leaver@x\.com/.test(r[1]) && r[2].get('cache-control') === 'no-store' && r[2].get('x-frame-options') === 'DENY');
  r = await raw(linkU, { method: 'POST' });
  ck('unsubscribe POST: removes that subscriber only', r[0] === 200 && /تم إلغاء اشتراكك/.test(r[1]) && !fs.docs.has('newsletter/' + idU) && fs.docs.has('newsletter/' + idK));
  r = await raw(linkU, { method: 'POST' }); ck('unsubscribe POST again: still fine (idempotent)', r[0] === 200 && /تم إلغاء اشتراكك/.test(r[1]));
  r = await raw(linkK.replace(/t=[a-f0-9]{32}/, 't=' + '0'.repeat(32)), { method: 'POST' }); ck('unsubscribe: a wrong token is refused and deletes nothing', r[0] === 400 && fs.docs.has('newsletter/' + idK));
  r = await raw(linkU.replace(/i=[^&]+/, 'i=' + idK), { method: 'POST' }); ck("unsubscribe: someone else's id with this token is refused", r[0] === 400 && fs.docs.has('newsletter/' + idK));
  r = await raw('/newsletter/unsubscribe?i=' + idK, { method: 'POST' }); ck('unsubscribe: missing token is refused', r[0] === 400 && fs.docs.has('newsletter/' + idK));
  r = await raw(linkK, { method: 'PUT' }); ck('unsubscribe: other methods → 405', r[0] === 405);
  { let last; const ip = '9.9.9.9'; for (let i = 0; i < 32; i++) last = await raw(linkK.replace(/t=[a-f0-9]{32}/, 't=bad'), { ip }); ck('unsubscribe: per-IP limiter answers 429 after 30 tries', last[0] === 429); }
  r = await raw('/newsletter/subscribe', { method: 'POST' }); ck('other routes still demand an allowed Origin (only unsubscribe is exempt)', r[0] === 403);
  [st] = await call('/newsletter/subscribe', { email: 'leaver@x.com' }); ck('a person who unsubscribed can subscribe again', st === 200 && fs.docs.has('newsletter/' + idU));
}

/* ───────── account verification route (/account/send-verification) ───────── */
{
  let inst = 0;
  const rawV = async (body, ip, extra = {}) => {
    const w = (await import('./worker.js?vfy=' + (++inst))).default;
    const r = await w.fetch(new Request('https://w.example/account/send-verification', { method: 'POST', headers: { Origin: ORIGIN, 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env, { waitUntil() {} });
    let j = {}; try { j = await r.json(); } catch {} return [r.status, j];
  };
  const unverified = (over = {}) => mk({ sub: 'vu' + (++inst), email: 'new' + inst + '@x.com', email_verified: false, name: 'Psn Wap', ...over });
  seed(); fs.brevo.length = 0; calls = [];
  let [rs, rj] = await rawV({ idToken: 'garbage' }, '30.0.0.1');
  ck('send-verification: a forged/garbage token is refused (401) and nothing is sent', rs === 401 && fs.brevo.length === 0, rs);
  [rs, rj] = await rawV({}, '30.0.0.2'); ck('send-verification: no token → 401', rs === 401 && fs.brevo.length === 0, rs);
  [rs, rj] = await rawV({ idToken: await mk({ email_verified: true }) }, '30.0.0.3');
  ck('send-verification: an already verified account → {ok, already} and no mail', rs === 200 && rj.already === true && fs.brevo.length === 0, rs + ' ' + JSON.stringify(rj));
  [rs] = await rawV({ idToken: await unverified({ firebase: { sign_in_provider: 'google.com' } }) }, '30.0.0.4');
  ck('send-verification: only e-mail/password accounts get this mail', rs === 400 && fs.brevo.length === 0, rs);
  [rs] = await rawV({ idToken: await unverified({ email: '' }) }, '30.0.0.5');
  ck('send-verification: a token without an e-mail address is refused', rs === 422 && fs.brevo.length === 0, rs);

  calls = []; fs.brevo.length = 0;
  const tok = await unverified({ email: 'Psnwap@Gmail.com' });
  [rs, rj] = await rawV({ idToken: tok }, '30.0.1.1');
  const oob = calls.find(c => c.url.includes('sendOobCode'));
  ck('send-verification: asks Firebase for a VERIFY_EMAIL link for the token\'s own address (lower-cased), never one taken from the body', rs === 200 && rj.ok === true && oob && JSON.parse(oob.init.body).requestType === 'VERIFY_EMAIL' && JSON.parse(oob.init.body).email === 'psnwap@gmail.com' && JSON.parse(oob.init.body).returnOobLink === true, oob && oob.init.body);
  const m = fs.brevo[0];
  ck('send-verification: sends the branded Arabic mail to that address only, link on the store\'s own page', fs.brevo.length === 1 && m.to.length === 1 && m.to[0].email === 'psnwap@gmail.com' && /فعّل حسابك/.test(m.subject) && /href="https:\/\/glitchqq\.github\.io\/glitch-q\/reset\.html\?mode=verifyEmail&amp;oobCode=abc"/.test(m.htmlContent) && !/firebaseapp\.com/.test(m.htmlContent) && /أهلاً/.test(m.htmlContent), m && m.subject);
  ck('send-verification: the greeting uses the first name from the token', m && />Psn<\/span>/.test(m.htmlContent), '');
  ck('send-verification: the body cannot redirect the mail (extra fields such as "email"/"to" are ignored)', await (async () => {
    fs.brevo.length = 0; const t2 = await unverified({ email: 'real@x.com' });
    await rawV({ idToken: t2, email: 'victim@x.com', to: 'victim@x.com' }, '30.0.1.2');
    return fs.brevo.length === 1 && fs.brevo[0].to[0].email === 'real@x.com';
  })());

  { /* limits: one account every 30 s, one address 5 per hour (durable), shared daily cap answers 503 so the browser falls back to Firebase's own mail */
    seed(); fs.brevo.length = 0;
    const t3 = await mk({ sub: 'same-uid', email: 'same@x.com', email_verified: false });
    const w = (await import('./worker.js?vfy-same')).default;
    const call3 = async ip => { const r = await w.fetch(new Request('https://w.example/account/send-verification', { method: 'POST', headers: { Origin: ORIGIN, 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: t3 }) }), env, { waitUntil() {} }); return r.status; };
    const a1 = await call3('30.1.0.1'), s1 = await call3('30.1.0.2'), s2 = await call3('30.1.0.3');   // one Worker instance: first → mail, then throttled
    ck('send-verification: the same account cannot trigger mails faster than every 30 seconds on one instance (429)', a1 === 200 && s1 === 429 && s2 === 429 && fs.brevo.length === 1, a1 + ' ' + s1 + ' ' + s2 + ' mails=' + fs.brevo.length);
    seed(); fs.brevo.length = 0; const sts = [];
    for (let i = 0; i < 7; i++) { _bump(); sts.push((await rawV({ idToken: await mk({ sub: 'u' + i + 'x' + (++inst), email: 'flood@x.com', email_verified: false }) }, '30.2.0.' + (i + 1)))[0]); }
    ck('send-verification: durable per-address cap — 7 attempts from different accounts/IPs/instances → 5 mails, then 429', fs.brevo.length === 5 && sts.slice(5).every(x => x === 429), fs.brevo.length + ' ' + sts.join(','));
    ck('send-verification: the counter lives in an owner-only document (rate_limits/verify_<hash>)', [...fs.docs.keys()].some(k => /^rate_limits\/verify_[0-9a-f]{40}$/.test(k)));
    const dayKey2 = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now()));
    seed(); fs.brevo.length = 0; put('rate_limits/verifymail_' + dayKey2, { n: 100, until: Date.now() + 3600000 });
    [rs] = await rawV({ idToken: await unverified() }, '30.3.0.1');
    ck('send-verification: when the shared daily mail cap is used up → 503 (the page falls back to Firebase\'s own mail) and no Brevo call', rs === 503 && fs.brevo.length === 0, rs + ' ' + fs.brevo.length);
    seed(); fs.brevo.length = 0; fs.failOob = true;
    [rs] = await rawV({ idToken: await unverified() }, '30.3.0.2'); fs.failOob = false;
    ck('send-verification: Firebase refusing to create a link → 502, no mail', rs === 502 && fs.brevo.length === 0, rs);
    seed(); fs.brevo.length = 0; fs.failBrevo = true;
    [rs] = await rawV({ idToken: await unverified() }, '30.3.0.3'); fs.failBrevo = false;
    ck('send-verification: mail provider refusing the message → 502 (the page falls back)', rs === 502, rs);
    [rs] = await rawV(JSON.stringify({ idToken: 'x', pad: 'x'.repeat(200000) }), '30.3.0.4');
    ck('send-verification: oversized body rejected (400)', rs === 400, rs);
    const r = await call('/account/send-verification', null, { method: 'GET' });
    ck('send-verification: GET → 405', r[0] === 405, r[0]);
    const r2 = await call('/account/send-verification', {}, { origin: 'https://evil.example' });
    ck('send-verification: foreign Origin → 403', r2[0] === 403, r2[0]);
  }
}

/* ───────── round 7: temporary suspensions, receipt copy, one account per inbox, delete a customer, notification e-mail ───────── */
{
  const adminTok = () => mk({ sub: 'adm', email: 'kadirom7k777@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } });
  const keys = () => [...fs.docs.keys()].filter(k => k.startsWith('email_keys/'));
  const dayK = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now()));

  /* — temporary suspension — */
  seed();
  put('banned_users/tb1', { reason: 'x', until: Date.now() + 3600000 });   // running
  put('banned_users/tb2', { reason: 'x', until: Date.now() - 1000 });      // ended
  put('banned_users/tb3', { reason: 'x', until: 0 });                      // permanent
  put('banned_users/tb4', { reason: 'x' });                                // permanent (older record without a duration)
  for (const u of ['tb1', 'tb2', 'tb3', 'tb4']) put('users/' + u, { points: 5, lastLogin: '', streak: 0 });
  const st = [];
  for (const u of ['tb1', 'tb2', 'tb3', 'tb4']) st.push((await call('/account/streak', { idToken: await tok(u) }))[0]);
  ck('suspension: running → 403, ended → works again, permanent (until 0 / no until) → 403', st[0] === 403 && st[1] === 200 && st[2] === 403 && st[3] === 403, st.join(','));
  [s] = await order(base, { token: await mk({ sub: 'tb1' }) }); ck('suspension: a customer under a running temporary ban cannot order', s === 403, s);
  [s] = await order(base, { token: await mk({ sub: 'tb2' }) }); ck('suspension: after the ban ended the customer can order again', s === 200, s);

  /* — the receipt copy kept for the owner's panel — */
  seed(); fs.tg = [];
  [s, j] = await order(bm, { token: await U(), photo: png(40000) });
  let rc = get('order_receipts/' + j.orderId), od = get('orders/' + j.orderId);
  ck('receipt: a small receipt is kept for the panel (order_receipts/<orderId>) and the order is flagged', s === 200 && od.hasReceipt === true && rc && rc.mime === 'image/png' && rc.size === 40012 && Buffer.isBuffer(rc.data) && rc.data.length === 40012 && rc.orderId === j.orderId, JSON.stringify([s, od, rc && { ...rc, data: '…' }]));
  ck('receipt: Telegram still gets the photo', fs.tg.length === 1 && fs.tg[0].photo);
  ck('receipt: the stored bytes are the uploaded image (PNG signature intact)', rc.data[0] === 0x89 && rc.data[1] === 0x50 && rc.data[2] === 0x4E && rc.data[3] === 0x47);
  fs.tg = [];
  [s, j] = await order(bm, { token: await U(), photo: png(900 * 1024) });
  ck('receipt: a photo too big for one document (900 KB) → order still succeeds, goes to Telegram, no copy, no flag', s === 200 && fs.tg.length === 1 && !get('order_receipts/' + j.orderId) && get('orders/' + j.orderId).hasReceipt === undefined, JSON.stringify([s, get('orders/' + j.orderId)]));
  [s, j] = await order(base, { token: await U() });
  ck('receipt: hand delivery has no receipt document', s === 200 && !get('order_receipts/' + j.orderId) && get('orders/' + j.orderId).hasReceipt === undefined);
  fs.failTelegram = true; const before = [...fs.docs.keys()].filter(k => k.startsWith('order_receipts/')).length;
  [s] = await order(bm, { token: await U(), photo: png(30000) }); fs.failTelegram = false;
  ck('receipt: Telegram down → order refused AND its receipt copy removed (no orphan)', s === 502 && [...fs.docs.keys()].filter(k => k.startsWith('order_receipts/')).length === before, s);

  /* — one account per inbox — */
  seed(); fs.authDel = [];
  const reg = async (sub, email, o = {}, mode = 'register') => call('/account/claim-email', { idToken: await mk({ sub, email, email_verified: false, ...o }), mode });
  const mkUser = (u, email, x = {}) => put('users/' + u, { points: 5, orders: 0, totalSpend: 0, email, ...x });
  mkUser('ca', 'john.smith@gmail.com');
  [s, j] = await reg('ca', 'john.smith@gmail.com'); ck('inbox: first sign-up claims the address', s === 200 && j.ok === true && keys().length === 1, JSON.stringify([s, j]));
  [s, j] = await reg('ca', 'john.smith@gmail.com'); ck('inbox: the same account claiming again is fine (idempotent)', s === 200 && keys().length === 1, s);
  mkUser('cb', 'johnsmith+shop@gmail.com');
  [s, j] = await reg('cb', 'johnsmith+shop@gmail.com');
  ck('inbox: same Gmail inbox written differently (dots removed, +tag) → 409 email_taken', s === 409 && j.code === 'email_taken', JSON.stringify([s, j]));
  ck('inbox: the duplicate account is removed (sign-in deleted + profile deleted), the first one is untouched', fs.authDel.includes('cb') && !get('users/cb') && !!get('users/ca') && !fs.authDel.includes('ca'), JSON.stringify([fs.authDel, !!get('users/cb')]));
  mkUser('cc', 'JohnSmith@googlemail.com'); [s, j] = await reg('cc', 'JohnSmith@googlemail.com'); ck('inbox: googlemail.com and capital letters count as the same Gmail inbox → 409', s === 409, s);
  mkUser('cd', 'john.smith@outlook.com'); [s] = await reg('cd', 'john.smith@outlook.com'); ck('inbox: the same name at another provider is a different inbox → allowed', s === 200, s);
  mkUser('ce', 'john.smith+x@outlook.com'); [s] = await reg('ce', 'john.smith+x@outlook.com'); ck('inbox: Outlook +tag is the same inbox as the plain address → 409', s === 409, s);
  mkUser('cf', 'a.b@yahoo.com'); [s] = await reg('cf', 'a.b@yahoo.com'); mkUser('cg', 'ab@yahoo.com'); const [s2] = await reg('cg', 'ab@yahoo.com');
  ck('inbox: dots are only ignored for Gmail (a.b@yahoo.com and ab@yahoo.com are different people) → both allowed', s === 200 && s2 === 200, [s, s2]);
  put('users/old1', { email: 'old@x.com', points: 40, orders: 2, totalSpend: 9000 }); mkUser('cn', 'old@x.com');
  [s, j] = await reg('cn', 'old@x.com'); ck('inbox: an older account that is not in the registry yet still blocks the exact same address', s === 409 && !get('users/cn') && !!get('users/old1'), JSON.stringify([s, j]));
  const n0 = fs.authDel.length;
  mkUser('cv', 'verified.dup@gmail.com'); put('users/first', { email: 'verifieddup@gmail.com', points: 5, orders: 0, totalSpend: 0 }); await reg('first', 'verifieddup@gmail.com');
  [s] = await reg('cv', 'verified.dup@gmail.com', { email_verified: true });
  ck('inbox: a VERIFIED account is never removed automatically, even when it collides (409, nothing deleted)', s === 409 && !!get('users/cv') && fs.authDel.length === n0, [s, fs.authDel.length - n0]);
  mkUser('cw', 'verified.dup2@gmail.com', { orders: 3, totalSpend: 5000 }); await reg('cw', 'verified.dup2@gmail.com', { email_verified: true });
  mkUser('cx', 'verifieddup2@gmail.com', { orders: 1, totalSpend: 100 });
  [s] = await reg('cx', 'verifieddup2@gmail.com'); ck('inbox: an account that already has orders is never removed automatically', s === 409 && !!get('users/cx'), s);
  mkUser('cb2', 'johnsmith+zzz@gmail.com');
  [s, j] = await reg('cb2', 'johnsmith+zzz@gmail.com', { email_verified: true }, 'login');
  ck('inbox: at LOGIN an existing duplicate is not blocked or deleted — it is only reported (duplicate:true)', s === 200 && j.duplicate === true && !!get('users/cb2'), JSON.stringify([s, j]));
  put('email_keys/' + keys()[0].split('/')[1], { uid: 'ghost', email: 'gone@x.com', ts: 1 });
  mkUser('cy', 'john.smith@gmail.com'); [s, j] = await reg('cy', 'john.smith@gmail.com');
  ck('inbox: a registry entry whose account no longer exists is taken over', s === 200 && j.ok === true, JSON.stringify([s, j]));
  fs.failAuthDel = 'PERMISSION_DENIED'; mkUser('cz', 'johnsmith+q@gmail.com'); [s, j] = await reg('cz', 'johnsmith+q@gmail.com'); fs.failAuthDel = '';
  ck('inbox: if the sign-in cannot be deleted the sign-up is still refused (409) and the profile is kept for the owner to clean', s === 409 && !!get('users/cz'), s);
  [s] = await call('/account/claim-email', {}); ck('inbox: no token → 401', s === 401, s);
  [s] = await call('/account/claim-email', { idToken: await mk({ sub: 'zz9', email: 'not-an-email' }) }); ck('inbox: token without a usable e-mail → ok/skipped, nothing written', s === 200, s);

  /* — delete a customer — */
  seed(); fs.authDel = []; fs.tg = [];
  mkUser('du1', 'du@x.com', { points: 80 }); put('banned_users/du1', { reason: 'x' }); put('orders/o_du', { userId: 'du1', product: 'P', status: 'done' });
  await reg('du1', 'du@x.com');
  const dk = keys().length;
  const del = async (o, t) => call('/admin/delete-user', { idToken: t === undefined ? await adminTok() : t, ...o });
  [s] = await del({ uid: 'du1', confirm: 'du@x.com' }, ''); ck('delete user: no token → 401', s === 401, s);
  [s] = await del({ uid: 'du1', confirm: 'du@x.com' }, await tok('u1')); ck('delete user: ordinary customer → 403', s === 403, s);
  [s] = await del({ uid: 'du1', confirm: 'du@x.com' }, await mk({ sub: 'adm', email: 'kadirom7k777@gmail.com', email_verified: true, firebase: { sign_in_provider: 'password' } })); ck('delete user: password-login admin → 403', s === 403, s);
  [s] = await del({ uid: 'du1', confirm: 'wrong@x.com' }); ck('delete user: confirmation text must match the e-mail → 400, nothing touched', s === 400 && !!get('users/du1') && fs.authDel.length === 0, s);
  [s] = await del({ uid: '../users/du1', confirm: 'x' }); ck('delete user: path-like uid → 400', s === 400, s);
  [s] = await del({ uid: 'adm', confirm: 'adm' }); ck('delete user: the owner cannot delete himself → 403', s === 403, s);
  put('users/own', { email: 'kadirom7k777@gmail.com', points: 1 }); [s] = await del({ uid: 'own', confirm: 'kadirom7k777@gmail.com' }); ck('delete user: a profile carrying the owner e-mail is protected → 403', s === 403 && !!get('users/own'), s);
  fs.failAuthDel = 'PERMISSION_DENIED';
  [s, j] = await del({ uid: 'du1', confirm: 'du@x.com' });
  ck('delete user: sign-in deletion refused by Google → 502 auth_delete_failed and NOTHING is removed', s === 502 && j.error === 'auth_delete_failed' && !!get('users/du1') && !!get('banned_users/du1'), JSON.stringify([s, j]));
  fs.failAuthDel = '';
  [s, j] = await del({ uid: 'du1', confirm: 'DU@x.com ' });
  ck('delete user: success → sign-in deleted, profile and registry entry removed, old ban removed', s === 200 && j.authDeleted === true && fs.authDel.includes('du1') && !get('users/du1') && !get('banned_users/du1') && keys().length === dk - 1, JSON.stringify([s, j, keys().length, dk]));
  ck('delete user: the customer\'s orders are kept (accounting)', !!get('orders/o_du'));
  ck('delete user: an audit entry is written (admin_log) and the owner is told on Telegram', [...fs.docs.keys()].some(k => k.startsWith('admin_log/')) && fs.tg.some(x => x.text.includes('Account deleted') && x.text.includes('du1')), JSON.stringify(fs.tg.map(x => x.text)));
  mkUser('du2', 'du2@x.com'); fs.failAuthDel = 'PERMISSION_DENIED';
  [s, j] = await del({ uid: 'du2', confirm: 'du2@x.com', dataOnly: true }); fs.failAuthDel = '';
  ck('delete user: data-only fallback removes the profile and blocks the sign-in with a permanent suspension', s === 200 && j.authDeleted === false && !get('users/du2') && get('banned_users/du2') && get('banned_users/du2').until === 0, JSON.stringify([s, j, get('banned_users/du2')]));
  mkUser('du3', 'du3@x.com'); fs.failAuthDel = 'USER_NOT_FOUND';
  [s, j] = await del({ uid: 'du3', confirm: 'du3@x.com' }); fs.failAuthDel = '';
  ck('delete user: a sign-in that is already gone counts as deleted', s === 200 && !get('users/du3'), JSON.stringify([s, j]));
  [s, j] = await del({ uid: 'nodoc1', confirm: 'nodoc1' }); ck('delete user: an orphan sign-in with no profile can be removed by typing its uid', s === 200 && fs.authDel.includes('nodoc1'), JSON.stringify([s, j]));

  /* — notification e-mail — */
  seed(); fs.brevo = [];
  put('users/n1', { email: 'n1@x.com', firstName: 'Sara', points: 5 }); put('users/n2', { email: 'n2@x.com', firstName: '', points: 5 }); put('users/n3', { points: 5 });
  const nm = async (o, t) => call('/admin/notify-email', { idToken: t === undefined ? await adminTok() : t, ...o });
  [s] = await nm({ uids: ['n1'], title: 'Hi', text: 'x' }, ''); ck('notify e-mail: no token → 401', s === 401, s);
  [s] = await nm({ uids: ['n1'], title: 'Hi', text: 'x' }, await tok('u1')); ck('notify e-mail: ordinary customer → 403', s === 403 && fs.brevo.length === 0, s);
  [s] = await nm({ uids: ['n1'], text: 'x' }); ck('notify e-mail: no title → 400', s === 400, s);
  [s] = await nm({ uids: [], title: 'T' }); ck('notify e-mail: no recipients → 400', s === 400, s);
  [s, j] = await nm({ uids: ['n1', 'n2', 'n3', 'missing'], title: 'عرض <b>خاص</b>', text: 'السطر الأول\nالسطر الثاني <img src=x onerror=alert(1)>', to: 'attacker@evil.com', email: 'attacker@evil.com' });
  ck('notify e-mail: sent to the stored profile addresses only; profiles without an address are counted, not mailed', s === 200 && j.sent === 2 && j.noEmail === 2 && fs.brevo.map(b => b.to[0].email).sort().join() === 'n1@x.com,n2@x.com', JSON.stringify([s, j, fs.brevo.map(b => b.to)]));
  ck('notify e-mail: an address typed in the request is ignored', !JSON.stringify(fs.brevo).includes('attacker@evil.com'));
  ck('notify e-mail: the subject is "<title> | Glitch Q" (plain text, one line)', fs.brevo.every(b => b.subject === 'عرض <b>خاص</b> | Glitch Q'), fs.brevo[0].subject);
  ck('notify e-mail: no raw tags from the owner\'s text reach the HTML', !/<img src=x/.test(fs.brevo[0].htmlContent) && !/<b>خاص/.test(fs.brevo[0].htmlContent) && fs.brevo[0].htmlContent.includes('&lt;img'), '');
  ck('notify e-mail: branded template (GLITCH Q header, both lines, store link) and a plain-text part', fs.brevo[0].htmlContent.includes('GLITCH Q') && fs.brevo[0].htmlContent.includes('السطر الثاني') && fs.brevo[0].htmlContent.includes('glitchqq.github.io/glitch-q') && fs.brevo[0].textContent.includes('السطر الأول') && fs.brevo.find(b => b.to[0].email === 'n1@x.com').htmlContent.includes('Sara'), '');
  const ids = Array.from({ length: 30 }, (_, i) => { put('users/m' + i, { email: 'm' + i + '@x.com', points: 5 }); return 'm' + i; });
  fs.brevo = []; [s, j] = await nm({ uids: ids, title: 'T', text: 'x' });
  ck('notify e-mail: one request handles at most 15 recipients (keeps within the Worker\'s per-request limits)', s === 200 && j.sent === 15 && fs.brevo.length === 15, JSON.stringify([s, j]));
  seed(); fs.brevo = []; for (let i = 0; i < 5; i++) put('users/q' + i, { email: 'q' + i + '@x.com', points: 5 });
  put('rate_limits/notifmail_' + dayK, { n: 148, until: Date.now() + 3600000 });
  [s, j] = await nm({ uids: ['q0', 'q1', 'q2', 'q3', 'q4'], title: 'T', text: 'x' });
  ck('notify e-mail: the daily ceiling (150) is shared by every request — only the remaining 2 are sent, the rest reported as limited', s === 200 && j.sent === 2 && j.limited === 3 && j.left === 0 && fs.brevo.length === 2, JSON.stringify([s, j]));
  [s, j] = await nm({ uids: ['q2'], title: 'T', text: 'x' });
  ck('notify e-mail: once the ceiling is used nothing more is sent that day', s === 200 && j.sent === 0 && j.limited === 1 && fs.brevo.length === 2, JSON.stringify([s, j]));
  seed(); fs.brevo = []; put('users/f1', { email: 'f1@x.com', points: 5 }); fs.failBrevo = true;
  [s, j] = await nm({ uids: ['f1'], title: 'T', text: 'x' }); fs.failBrevo = false;
  ck('notify e-mail: the mail provider refusing is reported as failed (the in-site notification is separate)', s === 200 && j.failed === 1 && j.sent === 0, JSON.stringify([s, j]));
  [s] = await call('/admin/notify-email', null, { method: 'GET' }); ck('notify e-mail: GET → 405', s === 405, s);
  [s] = await call('/admin/delete-user', null, { method: 'GET' }); ck('delete user: GET → 405', s === 405, s);

  /* — a product type of the owner's own (cur:'item'): priced from priceDZD, labelled from its own text — */
  seed();
  put('settings/products', { products: [
    { id: 'item-nf', cat: 'psn', name: 'Netflix', val: 1, cur: 'item', valText: '15$', sub: 'Global', priceDZD: 3500 },
    { id: 'item-bare', cat: 'psn', name: 'Hoodie', val: 1, cur: 'item', sub: '', priceDZD: 5000 },
    { id: 'item-free', cat: 'psn', name: 'NoPrice', val: 1, cur: 'item', sub: '' },
    { id: 'p1', cat: 'psn', name: 'PSN', val: 10, cur: 'EUR', sym: '€', sub: 'USA' },
  ] });
  [s, j] = await order({ ...base, items: [{ id: 'item-nf', qty: 1 }] }, { token: await U() });
  ck('custom product: ordered at its own DZD price, label "<name> <card text> (<sub>)"', s === 200 && j.total === 3500 && get('orders/' + j.orderId).product === 'Netflix 15$ (Global)', JSON.stringify([s, j, get('orders/' + j.orderId)]));
  [s, j] = await order({ ...base, items: [{ id: 'item-bare', qty: 1 }] }, { token: await U() });
  ck('custom product: no card text and no sub → label is just the name (no stray "()")', s === 200 && j.total === 5000 && get('orders/' + j.orderId).product === 'Hoodie', JSON.stringify([s, get('orders/' + j.orderId)]));
  [s] = await order({ ...base, items: [{ id: 'item-free', qty: 1 }] }, { token: await U() });
  ck('custom product: without a price it cannot be bought (never free)', s === 400, s);
  [s, j] = await order({ ...base, items: [{ id: 'p1', qty: 1 }] }, { token: await U() });
  ck('custom product: existing card labels are unchanged ("PSN 10€ (USA)")', s === 200 && get('orders/' + j.orderId).product === 'PSN 10€ (USA)', JSON.stringify(get('orders/' + j.orderId)));
}

/* ───────── the panel's duplicate finder must use the very same "which inbox is this" rule as the Worker ───────── */
{
  const wsrc = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  const asrc = readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
  const cut = (src, from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); if (a < 0 || b < 0) throw new Error('marker missing: ' + from); return src.slice(a, b); };
  const wCanon = vm.runInNewContext(cut(wsrc, 'const PLUS_DOMAINS', 'const emailKeyId') + ';canonEmail');
  const aCanon = vm.runInNewContext(cut(asrc, 'const PLUS_DOMAINS', 'function tsMs') + ';canonEmail');
  const samples = ['John.Smith@Gmail.com', 'johnsmith+shop@gmail.com', 'j.o.h.n.smith@googlemail.com', '+x@gmail.com', 'a.b@yahoo.com', 'ab@yahoo.com', 'x+tag@outlook.com', 'x+tag@hotmail.com', 'X@ICLOUD.COM', 'a+b+c@proton.me', 'plain@example.org', 'weird+@gmail.com', '  spaced@gmail.com ', 'no-at-sign', '', 'a@b'];
  const diff = samples.filter(x => wCanon(x) !== aCanon(x));
  ck('canonEmail is identical in worker.js and admin.js (' + samples.length + ' samples)', diff.length === 0, JSON.stringify(diff.map(x => [x, wCanon(x), aCanon(x)])));
  ck('canonEmail: the Gmail forms of one inbox collapse to one value, other providers keep their dots', wCanon('John.Smith@Gmail.com') === 'johnsmith@gmail.com' && wCanon('johnsmith+shop@googlemail.com') === 'johnsmith@gmail.com' && wCanon('a.b@yahoo.com') === 'a.b@yahoo.com' && wCanon('x+tag@outlook.com') === 'x@outlook.com', [wCanon('John.Smith@Gmail.com'), wCanon('a.b@yahoo.com')].join());
}

/* ───────── round 8: is the e-mail real, one inbox = one account at sign-in too ───────── */
{
  Object.assign(dnsTable, {
    'good.example':   { records: [{ type: 15, data: '10 mx.good.example.' }] },
    'noexist.example': { status: 3 },
    'nullmx.example': { records: [{ type: 15, data: '0 .' }] },
    'aonly.example':  { records: [{ type: 1, data: '192.0.2.10' }] },
    'bare.example':   { records: [] },
    'flaky.example':  { status: 2 },
  });
  const chk = async (email, o) => call('/account/check-email', { email }, o);
  let s, j;
  [s, j] = await chk('user@good.example'); ck('email check: a real domain with MX records → ok and checked', s === 200 && j.ok === true && j.checked === true, JSON.stringify([s, j]));
  [s, j] = await chk('  User@GOOD.example '); ck('email check: spaces and capitals are normalised', j.ok === true, JSON.stringify(j));
  const base0 = fs.dnsCalls; await chk('a@good.example'); await chk('b@good.example');
  ck('email check: a domain already looked up is served from memory (no second DNS call)', fs.dnsCalls === base0, fs.dnsCalls - base0);
  for (const bad of ['plainaddress', 'a@b', '@good.example', 'a b@good.example', 'a..b@good.example', '.a@good.example', 'a@-bad.example', 'a@good', 'a@@good.example', '<x>@good.example']) {
    [s, j] = await chk(bad); ck('email check: malformed "' + bad + '" → bad_format', s === 200 && j.ok === false && j.code === 'bad_format', JSON.stringify([s, j]));
  }
  [s, j] = await chk('x@mailinator.com'); ck('email check: a throw-away inbox is refused', j.ok === false && j.code === 'disposable', JSON.stringify(j));
  [s, j] = await chk('x@sub.mailinator.com'); ck('email check: a sub-domain of a throw-away provider is refused too', j.code === 'disposable', JSON.stringify(j));
  [s, j] = await chk('x@YOPMAIL.com'); ck('email check: capitals do not hide a throw-away domain', j.code === 'disposable', JSON.stringify(j));
  [s, j] = await chk('ali@gmial.com'); ck('email check: a typo of Gmail is refused with the corrected address', j.ok === false && j.code === 'typo' && j.suggest === 'ali@gmail.com', JSON.stringify(j));
  [s, j] = await chk('ali@hotmial.com'); ck('email check: a typo of Hotmail is refused with the corrected address', j.code === 'typo' && j.suggest === 'ali@hotmail.com', JSON.stringify(j));
  [s, j] = await chk('x@noexist.example'); ck('email check: a domain that does not exist (NXDOMAIN) is refused', j.ok === false && j.code === 'bad_domain', JSON.stringify(j));
  [s, j] = await chk('x@nullmx.example'); ck('email check: a domain that publishes "takes no mail" (null MX) is refused', j.code === 'bad_domain', JSON.stringify(j));
  [s, j] = await chk('x@bare.example'); ck('email check: a domain with neither MX nor address records is refused', j.code === 'bad_domain', JSON.stringify(j));
  [s, j] = await chk('x@aonly.example'); ck('email check: no MX but an address record (mail falls back to it) → accepted', j.ok === true, JSON.stringify(j));
  [s, j] = await chk('x@flaky.example'); ck('email check: resolver error (SERVFAIL) → let through, marked unchecked (the activation link still decides)', j.ok === true && j.checked === false, JSON.stringify(j));
  [s, j] = await chk('x@unlisted.example'); ck('email check: resolver answers with an HTTP error → let through', j.ok === true && j.checked === false, JSON.stringify(j));
  fs.dnsDown = true; [s, j] = await chk('x@down.example'); fs.dnsDown = false; ck('email check: resolver unreachable → let through', s === 200 && j.ok === true, JSON.stringify([s, j]));
  [s] = await call('/account/check-email', { email: 'a@good.example' }, { origin: 'https://evil.example' }); ck('email check: foreign Origin → 403', s === 403, s);
  [s] = await call('/account/check-email', {}, { method: 'GET' }); ck('email check: GET → 405', s === 405, s);
  [s, j] = await chk(12345); ck('email check: a non-string e-mail is just refused as malformed', s === 200 && j.ok === false, JSON.stringify([s, j]));
  [s, j] = await chk('x'.repeat(300) + '@good.example'); ck('email check: an absurdly long address is refused', j.code === 'bad_format', JSON.stringify(j));
  const ip = '203.0.113.7'; let last = 0; for (let i = 0; i < 40; i++) { [last] = await call('/account/check-email', { email: 'a@good.example' }, { ip }); }
  ck('email check: rate limited per IP (429 after 30 in 10 minutes)', last === 429, last);

  /* the same rules are enforced again after the account exists (a script can skip the browser pre-check) */
  seed(); fs.authDel = [];
  const reg = async (sub, email, o = {}, mode = 'register') => call('/account/claim-email', { idToken: await mk({ sub, email, email_verified: false, ...o }), mode });
  const mkUser = (u, email, x = {}) => put('users/' + u, { points: 5, orders: 0, totalSpend: 0, email, ...x });
  const nkeys = () => [...fs.docs.keys()].filter(k => k.startsWith('email_keys/')).length;
  mkUser('r1', 'ghost@noexist.example'); [s, j] = await reg('r1', 'ghost@noexist.example');
  ck('sign-up: an address whose domain does not exist → 422 bad_domain, the fresh account is deleted, nothing registered', s === 422 && j.code === 'bad_domain' && fs.authDel.includes('r1') && !get('users/r1') && nkeys() === 0, JSON.stringify([s, j, fs.authDel]));
  mkUser('r2', 'tmp@mailinator.com'); [s, j] = await reg('r2', 'tmp@mailinator.com'); ck('sign-up: a throw-away inbox → 422 disposable and the account is deleted', s === 422 && j.code === 'disposable' && !get('users/r2'), JSON.stringify([s, j]));
  mkUser('r3', 'ali@gmial.com'); [s, j] = await reg('r3', 'ali@gmial.com'); ck('sign-up: a typo domain → 422 typo with the suggestion', s === 422 && j.code === 'typo' && j.suggest === 'ali@gmail.com', JSON.stringify([s, j]));
  const n0 = fs.authDel.length;
  mkUser('r4', 'old@noexist.example', { orders: 2, totalSpend: 5000 }); [s, j] = await reg('r4', 'old@noexist.example');
  ck('sign-up: a bad domain on an account that already has orders is refused but NEVER deleted', s === 422 && !!get('users/r4') && fs.authDel.length === n0, JSON.stringify([s, fs.authDel.length - n0]));
  mkUser('r5', 'old2@noexist.example'); [s] = await reg('r5', 'old2@noexist.example', { email_verified: true });
  ck('sign-up: a verified account is never deleted automatically either', s === 422 && !!get('users/r5'), s);
  mkUser('r6', 'veteran@noexist.example'); [s, j] = await reg('r6', 'veteran@noexist.example', { email_verified: true }, 'login');
  ck('sign-in: an existing customer is never refused because of the domain check (only sign-up is checked)', s === 200, JSON.stringify([s, j]));
  mkUser('r7', 'real@good.example'); [s, j] = await reg('r7', 'real@good.example'); ck('sign-up: a real address passes and claims its inbox', s === 200 && j.ok === true && nkeys() === 2, JSON.stringify([s, j, nkeys()]));   // 2 = the veteran's login claim + this one

  /* sign-in: a NEWER, EMPTY account on an inbox that belongs to an older account is refused (not deleted) */
  seed(); fs.authDel = [];
  mkUser('o1', 'first.person@gmail.com', { created: '2026-01-01T10:00:00.000Z' }); [s] = await reg('o1', 'first.person@gmail.com');
  mkUser('o2', 'firstperson+b@gmail.com', { created: '2026-06-01T10:00:00.000Z' });
  [s, j] = await reg('o2', 'firstperson+b@gmail.com', { email_verified: true }, 'login');
  ck('sign-in: a newer empty account on the same inbox → 409 email_taken, but nothing is deleted', s === 409 && j.code === 'email_taken' && !!get('users/o2') && !fs.authDel.includes('o2'), JSON.stringify([s, j, fs.authDel]));
  mkUser('o3', 'first.person+shop@gmail.com', { created: '2026-06-02T10:00:00.000Z', orders: 1, totalSpend: 3000 });
  [s, j] = await reg('o3', 'first.person+shop@gmail.com', { email_verified: true }, 'login');
  ck('sign-in: the same newer duplicate but WITH an order is never refused (only reported)', s === 200 && j.duplicate === true, JSON.stringify([s, j]));
  mkUser('o4', 'f.irstperson@gmail.com', { created: '2025-01-01T10:00:00.000Z' });
  [s, j] = await reg('o4', 'f.irstperson@gmail.com', { email_verified: true }, 'login');
  ck('sign-in: an OLDER account than the registered owner is never refused', s === 200 && j.duplicate === true, JSON.stringify([s, j]));
  mkUser('o5', 'first.person+x@gmail.com'); [s, j] = await reg('o5', 'first.person+x@gmail.com', { email_verified: true }, 'login');
  ck('sign-in: an account without a creation date is never refused (cannot tell which is newer)', s === 200 && j.duplicate === true, JSON.stringify([s, j]));
  [s, j] = await reg('o1', 'first.person@gmail.com', { email_verified: true }, 'login'); ck('sign-in: the owner of the inbox signs in normally', s === 200 && j.ok === true && !j.duplicate, JSON.stringify([s, j]));

  /* — several codes in ONE delivery (a 20€ order sent as four 5€ cards) — */
  seed(); fs.brevo = [];
  put('orders/oM', { userId: 'u1', product: 'PSN 20€', status: 'processing', receiveMethod: 'email', receiveContact: 'buyer@x.com', codeValidUntil: '2026-11-30' });
  const adm8 = () => mk({ sub: 'adm', email: 'kadirom7k777@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } });
  const send = async (o, t) => call('/admin/send-code', { idToken: t === undefined ? await adm8() : t, orderId: 'oM', ...o });
  [s, j] = await send({ codes: ['AAAA-1111-AAAA', 'BBBB-2222-BBBB', 'CCCC-3333-CCCC', 'DDDD-4444-DDDD'], note: '4 بطاقات × 5€ = 20€' });
  let m8 = fs.brevo[fs.brevo.length - 1] || {};
  ck('multi-code: four codes go out in ONE e-mail and the reply says how many', s === 200 && j.ok && j.count === 4 && fs.brevo.length === 1, JSON.stringify([s, j, fs.brevo.length]));
  ck('multi-code: the e-mail carries every code, numbered "n من 4", and the subject says 4', ['AAAA-1111-AAAA', 'BBBB-2222-BBBB', 'CCCC-3333-CCCC', 'DDDD-4444-DDDD'].every(c => m8.htmlContent.includes(c)) && m8.htmlContent.includes('الكود 1 من 4') && m8.htmlContent.includes('الكود 4 من 4') && /\(4\)/.test(m8.subject), m8.subject);
  ck('multi-code: the owner\'s note is shown in the mail', m8.htmlContent.includes('4 بطاقات × 5€ = 20€'));
  ck('multi-code: the plain-text version lists them as 1) 2) 3) 4)', /1\) AAAA-1111-AAAA/.test(m8.textContent) && /4\) DDDD-4444-DDDD/.test(m8.textContent) && m8.textContent.includes('4 بطاقات'), (m8.textContent || '').slice(0, 200));
  ck('multi-code: the activation steps tell the customer to redeem each code separately', m8.htmlContent.includes('كل كود على حدة') || m8.htmlContent.includes('لكل كود على حدة'));
  ck('multi-code: still goes to the e-mail stored on the order', m8.to[0].email === 'buyer@x.com');
  [s, j] = await send({ codes: ['SAME-1', 'SAME-1', 'OTHER-2'] }); m8 = fs.brevo[fs.brevo.length - 1];
  ck('multi-code: the same code typed twice is sent once (2 codes, not 3)', s === 200 && j.count === 2 && (m8.htmlContent.match(/SAME-1/g) || []).length === 1, JSON.stringify(j));
  [s, j] = await send({ codes: ['<img src=x onerror=alert(1)>', 'OK-1'], note: '<script>alert(2)</script>' }); m8 = fs.brevo[fs.brevo.length - 1];
  ck('multi-code: HTML in a code or in the note is escaped', s === 200 && !m8.htmlContent.includes('<img src=x') && !m8.htmlContent.includes('<script>alert(2)') && m8.htmlContent.includes('&lt;img'), (m8.htmlContent.match(/.{20}onerror.{20}/) || [''])[0]);
  const n20 = fs.brevo.length; [s, j] = await send({ codes: Array.from({ length: 20 }, (_, i) => 'C' + i + '-XXXX') });
  ck('multi-code: 20 codes is the limit and is accepted', s === 200 && j.count === 20 && fs.brevo.length === n20 + 1, JSON.stringify([s, j]));
  const n21 = fs.brevo.length; [s] = await send({ codes: Array.from({ length: 21 }, (_, i) => 'D' + i) });
  ck('multi-code: 21 codes → 400 and nothing is sent', s === 400 && fs.brevo.length === n21, s);
  [s] = await send({ codes: [] }); ck('multi-code: an empty list → 400', s === 400, s);
  [s] = await send({ codes: ['  ', '', null] }); ck('multi-code: only blanks → 400', s === 400, s);
  [s] = await send({ codes: ['A-1', 'B-2'] }, ''); ck('multi-code: no token → 401', s === 401, s);
  [s] = await send({ codes: ['A-1', 'B-2'] }, await tok('u1')); ck('multi-code: an ordinary customer → 403', s === 403, s);
  const n1 = fs.brevo.length; [s, j] = await send({ code: 'LEGACY-ONE' }); m8 = fs.brevo[fs.brevo.length - 1];
  ck('multi-code: the old single "code" field still works and looks like before (no "n من m")', s === 200 && j.count === 1 && fs.brevo.length === n1 + 1 && !m8.htmlContent.includes('من 1') && m8.htmlContent.includes('LEGACY-ONE') && !/\(1\)/.test(m8.subject), m8.subject);
  [s, j] = await send({ codes: ['X'.repeat(300)] }); m8 = fs.brevo[fs.brevo.length - 1]; ck('multi-code: a 300-character code is kept whole', s === 200 && m8.htmlContent.includes('X'.repeat(300)), s);

  /* — the owner's "pause the points system" switch (settings/maintenance.pointsOff) — */
  seed(); _bump();
  put('users/u1', { points: 5, streak: 0, lastLogin: '2020-01-01', spins: 0, rewardPool: 0, orders: 0, totalSpend: 0 });
  put('users/u9', { points: 5, uid_short: 'ABCDEF123456' });
  put('settings/maintenance', { active: false, pointsOff: true }); _bump();
  const u1 = () => get('users/u1');
  [s, j] = await call('/account/streak', { idToken: await tok('u1') }); ck('points paused: the daily streak gives nothing', s === 200 && j.ok === false && j.reason === 'paused' && u1().points === 5 && !u1().streak, JSON.stringify([s, j, u1().points]));
  [s, j] = await call('/account/spin', { idToken: await tok('u1') }); ck('points paused: the wheel does not spin and does not start its 24-hour wait', j.ok === false && j.reason === 'paused' && !u1().lastSpinAt && u1().points === 5, JSON.stringify([j, u1().lastSpinAt]));
  const claims0 = [...fs.docs.keys()].filter(k => k.startsWith('reward_claims/')).length;
  put('users/u1', { ...u1(), points: 99999, rewardPool: 9999999 });
  [s, j] = await call('/account/redeem', { idToken: await tok('u1'), id: 'any' }); ck('points paused: nothing can be redeemed even with a huge balance, and no claim is created', j.ok === false && j.reason === 'paused' && u1().points === 99999 && [...fs.docs.keys()].filter(k => k.startsWith('reward_claims/')).length === claims0, JSON.stringify(j));
  [s, j] = await call('/account/rewards', { idToken: await tok('u1') }); ck('points paused: the rewards page still loads the balance and says it is paused', s === 200 && j.ok === true && j.paused === true && j.points === 99999, JSON.stringify([s, j.paused, j.points]));
  [s, j] = await call('/account/referral', { idToken: await tok('u1'), ref: 'ABCDEF123456' }); ck('points paused: an invitation link is still recorded (the bonus is only paid by a later order, never during the pause)', j.ok === true && u1().referredBy === 'u9', JSON.stringify(j));
  put('settings/maintenance', { active: false, pointsOff: false }); _bump(); put('users/u1', { ...u1(), points: 5, rewardPool: 0 });
  [s, j] = await call('/account/streak', { idToken: await tok('u1') }); ck('points resumed: the streak works again', j.ok === true && u1().points > 5, JSON.stringify(j));
  fs.docs.delete('settings/maintenance'); _bump(); put('users/u1', { ...u1(), lastLogin: '2020-01-01' });
  [s, j] = await call('/account/streak', { idToken: await tok('u1') }); ck('points: with no maintenance document at all the system is ON (default)', j.ok === true, JSON.stringify(j));
  /* fail closed: if the switch cannot be read the points stay stopped */
  { put('users/u1', { ...u1(), lastLogin: '2020-01-01', points: 5 }); _bump();
    const real = globalThis.fetch; globalThis.fetch = async (u, ...a) => String(u).includes('/documents/settings/maintenance') ? new Response('{"error":"boom"}', { status: 500 }) : real(u, ...a);
    try { [s, j] = await call('/account/streak', { idToken: await tok('u1') }); } finally { globalThis.fetch = real; }
    ck('points: if the pause switch cannot be read the system fails CLOSED (nothing is granted)', j.ok === false && j.reason === 'paused' && u1().points === 5, JSON.stringify([s, j, u1().points])); }
}

/* ───────── round 8: hostile-input sweep over EVERY route ─────────
   Not one request, with any token (none / customer / owner) and any method, may crash the Worker (HTTP 5xx), leak an error
   message or stack trace, or change a document it has no business with. */
{
  const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  const routeBlock = src.slice(src.indexOf('const routes = {'), src.indexOf('const h = Object.prototype.hasOwnProperty'));
  const paths = [...routeBlock.matchAll(/^\s+'(\/[a-z0-9\/-]+)':/gm)].map(m => m[1]);
  ck('fuzz: the sweep found the whole route table (≥ 30 routes)', paths.length >= 30, paths.length);
  paths.push('/', '/admin', '/admin/../health', '/%2e%2e/health', '/__proto__', '/constructor', '/toString', '/account/', '/ADMIN/NOTIFY');
  seed(); fs.brevo = [];
  put('users/u1', { email: 'u1@x.com', points: 5, orders: 0, totalSpend: 0, notifications: [] });
  put('settings/maintenance', { active: false });
  const before = new Map([...fs.docs].map(([k, v]) => [k, JSON.stringify(v)]));
  const tokens = [undefined, await tok('u1'), await mk({ sub: 'adm', email: 'kadirom7k777@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } })];
  const big = 'A'.repeat(2_000_000), deep = '['.repeat(4000) + ']'.repeat(4000);
  const bodies = [
    {}, { email: ['a@b.com'], code: { $gt: '' }, codes: 'notarray', uids: 'x', orderId: { a: 1 }, title: 12, text: [1, 2] },
    JSON.parse('{"__proto__":{"isAdmin":true,"email_verified":true},"constructor":{"prototype":{"polluted":1}},"idToken":"x"}'),
    { email: 'a\u0000@b.com', name: '\ud800', text: '‮'.repeat(50), title: '<script>alert(1)</script>' },
    { orderId: '../../users/adm', userId: 'a/b', uid: '..%2F..', uids: ['../x', 'a/b', 7, null], id: '../../../x', ref: '../'.repeat(10) },
    { items: [{ id: 'p5', qty: -1 }, { id: 'p5', qty: 1e309 }, { id: '__proto__', qty: 1 }, null, 'x'], coupon: { a: 1 }, pay: 'x', recv: 'x', total: 'NaN', totalDZD: -5 },
    { items: Array.from({ length: 500 }, () => ({ id: 'p5', qty: 1 })), codes: Array.from({ length: 5000 }, (_, i) => 'C' + i) },
    { email: 'x'.repeat(100000) + '@good.example', note: 'y'.repeat(100000), message: 'z'.repeat(100000) },
    { rating: 99, stars: -3, text: null, orderId: null, productId: [], ids: 'all', target: { $ne: 1 } },
  ];
  const raws = ['', '{{{{', 'null', '[]', '"str"', '123', 'true', deep, big, '{"a":' + '1'.repeat(300000) + '}', '\u0000\u0001\u0002'];
  const methods = ['POST', 'GET', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'];
  let n = 0, five = [], leaks = [], nonJson = [];
  const hit1 = async (path, method, body, ct) => {
    const headers = { Origin: ORIGIN, 'CF-Connecting-IP': fresh() }; if (ct) headers['Content-Type'] = ct;
    let r, txt = '';
    try { r = await worker.fetch(new Request('https://w.example' + path, { method, headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(method) ? undefined : body }), env, { waitUntil() {} }); txt = await r.text(); }
    catch (e) { five.push(method + ' ' + path + ' THREW ' + String(e && e.message).slice(0, 80)); return; }
    n++;
    if (r.status >= 500) five.push(`${method} ${path} → ${r.status} ${String(body).slice(0, 60)}`);
    if (/\bat [\w.<>$]+ \(|node:internal|TypeError|ReferenceError|RangeError|SyntaxError|undefined is not|\.mjs:|worker\.js:\d/.test(txt)) leaks.push(`${method} ${path}: ${txt.slice(0, 120)}`);
  };
  for (const path of paths) {
    for (const m of methods) await hit1(path, m, undefined);
    for (const raw of raws) { await hit1(path, 'POST', raw, 'application/json'); }
    await hit1(path, 'POST', 'a=b&c=d', 'application/x-www-form-urlencoded');
    await hit1(path, 'POST', '--x\r\nContent-Disposition: form-data; name="data"\r\n\r\n{bad\r\n--x--', 'multipart/form-data; boundary=x');
    await hit1(path, 'POST', '--x\r\n', 'multipart/form-data');
    for (const t of tokens) for (const b of bodies) await hit1(path, 'POST', JSON.stringify(t ? { ...b, idToken: t } : b), 'application/json');
  }
  ck(`fuzz: ${n} hostile requests over ${paths.length} routes — not one caused an HTTP 5xx or an unhandled exception`, five.length === 0, five.slice(0, 5).join(' | '));
  ck('fuzz: not one response leaked a stack trace or an internal error message', leaks.length === 0, leaks.slice(0, 3).join(' | '));
  ck('fuzz: the prototype of Object was not polluted', ({}).polluted === undefined && ({}).isAdmin === undefined && ({}).email_verified === undefined);
  const changed = [...fs.docs].filter(([k, v]) => before.get(k) !== JSON.stringify(v)).map(([k]) => k).filter(k => !/^(rate_limits|stats|visits|admin_log)\//.test(k));
  const created = [...fs.docs.keys()].filter(k => !before.has(k) && !/^(rate_limits|stats|visits|admin_log)\//.test(k));
  ck('fuzz: no document outside counters/logs was created or modified by garbage input (the only legitimate writes are the owner-token cases listed)', changed.length + created.length <= 40, JSON.stringify([...changed, ...created].slice(0, 12)));
  ck('fuzz: a customer token never modified another user\'s profile', !changed.some(k => k.startsWith('users/') && k !== 'users/u1'), JSON.stringify(changed.filter(k => k.startsWith('users/'))));
  console.log('   fuzz detail: requests=' + n + ' routes=' + paths.length + ' changedDocs=' + JSON.stringify(changed.slice(0, 8)) + ' createdDocs=' + JSON.stringify(created.slice(0, 8)));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
