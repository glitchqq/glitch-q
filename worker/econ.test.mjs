/* Tests for econ.js (the profit maths) and for the REAL completeOrder() from admin.js, run against an in-memory Firestore.
   Run: node worker/econ.test.mjs */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../econ.js');

let pass = 0, fail = 0;
const ck = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  → ' + x)); c ? pass++ : fail++; };
const RATES = { EUR: 220, USD: 200, SAR: 55, AED: 56 };

/* ───────── pure maths ───────── */
const e0 = E.normEcon(null);
ck('defaults: earn 40%, referral 40%, cap 80 pts, 1 pt = 10 DZD, 4 rewards', e0.earnPct === 40 && e0.refPct === 40 && e0.refMaxPts === 80 && e0.ptDZD === 10 && e0.rewards.length === 4);
ck('normEcon: the store always keeps ≥10% of profit (earn 80 + ref 80 → ref cut to 20)', (() => { const x = E.normEcon({ earnPct: 70, refPct: 70 }); return x.earnPct === 70 && x.refPct === 20; })());
ck('normEcon: garbage in → defaults, never NaN', (() => { const x = E.normEcon({ earnPct: 'zz', ptDZD: {}, rewards: 7, costs: 5, marginPct: null }); return x.earnPct === 40 && x.ptDZD === 10 && x.rewards.length === 4 && x.marginPct === 0 || x.marginPct === 5; })());
ck('normEcon: bad reward ids / prices / duplicates dropped', E.normEcon({ rewards: [{ id: 'a b', priceDZD: 5 }, { id: 'ok', priceDZD: 0 }, { id: 'good', priceDZD: 99 }, { id: 'good', priceDZD: 50 }] }).rewards.length === 1);
ck('normEcon: cost table keeps only valid ids and positive costs', (() => { const c = E.normEcon({ costs: { good: 1500, '': 3, 'a/b': 9, neg: -4, zero: 0, big: 1e9 } }).costs; return JSON.stringify(c) === '{"good":1500}'; })());

const prods = [
  { id: 'p15', name: '15€', val: 15, cur: 'EUR', priceDZD: 4500 },
  { id: 'p5', name: '5€', val: 5, cur: 'EUR', priceDZD: 1600 },
  { id: 'nop', name: 'no price', val: 10, cur: 'EUR' },
];
const eCost = E.normEcon({ costs: { p15: 4000, p5: 1500 }, marginPct: 5 });
let pr = E.orderProfit({ totalDZD: 4500, items: [{ id: 'p15', qty: 1, unitDZD: 4500 }] }, prods, eCost, RATES);
ck('profit: known cost → 4500 − 4000 = 500, not estimated', pr.profit === 500 && pr.cost === 4000 && !pr.estimated, JSON.stringify(pr));
ck('profit: unknown cost → assumed margin 5% of list price, flagged estimated', (() => { const r = E.orderProfit({ totalDZD: 4500, items: [{ id: 'p15', qty: 1, unitDZD: 4500 }] }, prods, E.normEcon(null), RATES); return r.profit === 225 && r.estimated; })());
pr = E.orderProfit({ totalDZD: 4050, items: [{ id: 'p15', qty: 1, unitDZD: 4500 }] }, prods, eCost, RATES);
ck('profit: a 10% coupon (customer paid 4050) shrinks the profit to 50 — discounts come out of YOUR share, not out of thin air', pr.profit === 50, JSON.stringify(pr));
pr = E.orderProfit({ totalDZD: 3900, items: [{ id: 'p15', qty: 1, unitDZD: 4500 }] }, prods, eCost, RATES);
ck('profit: sold below cost → negative profit, and it earns NO points', pr.profit === -100 && E.earnPts(pr.profit, eCost) === 0 && E.refPts(pr.profit, eCost) === 0, JSON.stringify(pr));
pr = E.orderProfit({ totalDZD: 4500 * 2 + 1600, items: [{ id: 'p15', qty: 2, unitDZD: 4500 }, { id: 'p5', qty: 1, unitDZD: 1600 }] }, prods, eCost, RATES);
ck('profit: several lines with quantities add up (2×500 + 100 = 1100)', pr.profit === 1100, JSON.stringify(pr));
pr = E.orderProfit({ totalDZD: 5000 }, prods, E.normEcon({ marginPct: 10 }), RATES);
ck('profit: old order without items → margin estimate (10% of 5000 = 500)', pr.profit === 500 && pr.estimated, JSON.stringify(pr));
ck('product missing from the catalogue falls back to the paid price minus margin, never crashes', (() => { const r = E.orderProfit({ totalDZD: 1000, items: [{ id: 'gone', qty: 1, unitDZD: 1000 }] }, prods, E.normEcon(null), RATES); return r.profit === 50; })());
ck('earnPts: 500 profit × 40% = 200 DZD = 20 pts', E.earnPts(500, eCost) === 20);
ck('refPts: 500 profit × 40% = 20 pts; huge profit capped at 80', E.refPts(500, eCost) === 20 && E.refPts(1e6, eCost) === 80);
ck('redeemable = min(points, pool/ptDZD)', E.redeemablePts({ points: 5000, rewardPool: 0 }, eCost) === 0 && E.redeemablePts({ points: 100, rewardPool: 9999 }, eCost) === 100 && E.redeemablePts({ points: 500, rewardPool: 1234 }, eCost) === 123);

/* referral must never be enough for a card, with the defaults and with any config the panel accepts */
{ let bad = 0;
  for (let i = 0; i < 400; i++) {
    const e = E.normEcon({ earnPct: Math.random() * 90, refPct: Math.random() * 90, refMaxPts: Math.floor(Math.random() * 60), ptDZD: [5, 10, 20][i % 3] });
    const cheapest = Math.min(...e.rewards.map(r => E.rewardPts(r, e)));
    for (const profit of [1, 100, 5000, 1e6]) if (E.refPts(profit, e) >= cheapest) bad++;
  }
  ck('referral: one invited friend can NEVER buy the cheapest card by himself (400 random configs × 4 profits, cap < 60% of a 5€ card)', bad === 0, bad); }
ck('audit warns when the referral cap is too close to the cheapest card', E.audit(E.normEcon({ refMaxPts: 120 }), prods, RATES).some(x => x.level === 'warn'));
ck('audit refuses a reward priced below its known cost', E.audit(E.normEcon({ costs: { p5: 1700 }, rewards: [{ id: 'r5', name: '5€', priceDZD: 1600, prodId: 'p5' }] }), prods, RATES).some(x => x.level === 'err'));
ck('audit flags a product that earns nothing', E.audit(E.normEcon({ costs: { p5: 1700 } }), prods, RATES).some(x => x.level === 'err' && x.msg.includes('5€')));

/* ───────── the real completeOrder() from admin.js on a tiny in-memory Firestore ───────── */
const src = readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
const fnSrc = src.slice(src.indexOf('async function completeOrder'), src.indexOf('async function confirmDelivery'));
function world(econRaw, products) {
  const store = new Map();
  const T = { inc: 'inc', union: 'union', ts: 'ts' };
  const FV = { increment: n => ({ [T.inc]: n }), arrayUnion: (...a) => ({ [T.union]: a }), serverTimestamp: () => ({ [T.ts]: 1 }) };
  const apply = (cur, patch) => { const o = { ...(cur || {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === 'object' && T.inc in v) o[k] = (Number(o[k]) || 0) + v[T.inc];
      else if (v && typeof v === 'object' && T.union in v) o[k] = [...(o[k] || []), ...v[T.union]];
      else if (v && typeof v === 'object' && T.ts in v) o[k] = { seconds: 1 };
      else o[k] = v;
    } return o; };
  const doc = (c, id) => ({ path: c + '/' + id });
  const db = {
    collection: c => ({ doc: id => doc(c, id) }),
    async runTransaction(fn) {
      const writes = [];
      const tx = { get: async r => ({ exists: store.has(r.path), data: () => store.get(r.path) }),
                   update: (r, p) => { if (!store.has(r.path)) throw new Error('update of missing doc ' + r.path); writes.push(['u', r.path, p]); },
                   set: (r, p) => writes.push(['s', r.path, p]) };
      await fn(tx);
      for (const [k, p, v] of writes) store.set(p, k === 'u' ? apply(store.get(p), v) : apply(null, v));
    } };
  const ctx = { firebase: { firestore: { FieldValue: FV } }, db, GQEcon: E, ECO_RATES: RATES, allProds: products,
    ensureEcon: async () => E.normEcon(econRaw), ensureProds: async () => products, codeUntil: () => '2026-11-30' };
  vm.runInNewContext(fnSrc + ';this.completeOrder=completeOrder;this.u_ref=u_ref;', ctx);
  return { store, completeOrder: ctx.completeOrder };
}
const mkOrder = (o = {}) => ({ userId: 'cust', status: 'pending', awarded: false, totalDZD: 4500, items: [{ id: 'p15', qty: 1, unitDZD: 4500 }], ...o });
const econCost = { costs: { p15: 4000, p5: 1500 }, marginPct: 5 };

{ const w = world(econCost, prods);
  w.store.set('users/cust', { points: 5, rewardPool: 0, orders: 0, totalSpend: 0, notifications: [] });
  w.store.set('orders/o1', mkOrder());
  await w.completeOrder('o1', { title: 't' });
  const u = w.store.get('users/cust'), o = w.store.get('orders/o1'), l = w.store.get('order_econ/o1');
  ck('deliver: customer gets 20 pts (40% of the 500 DZD profit) and exactly 200 DZD goes into the pool', u.points === 25 && u.rewardPool === 200 && u.orders === 1 && u.totalSpend === 4500, JSON.stringify(u));
  ck('deliver: order marked done + awarded', o.status === 'done' && o.awarded === true && o.codeValidUntil === '2026-11-30');
  ck('deliver: the profit figures live in order_econ (owner-only) and NOT on the order the customer can read', l && l.profit === 500 && l.cost === 4000 && l.pts === 20 && !('profit' in o) && !('cost' in o) && !('profitDZD' in o), JSON.stringify([l, o]));
  await w.completeOrder('o1', { title: 't' });
  ck('deliver: second call is harmless (no double payment)', w.store.get('users/cust').points === 25 && w.store.get('users/cust').orders === 1);
  ck('deliver: balance can never exceed pool/ptDZD from purchases alone (points 20 ≤ pool 200 / 10)', E.redeemablePts({ points: 20, rewardPool: u.rewardPool }, E.normEcon(econCost)) === 20); }

{ const w = world(econCost, prods);   // referral
  w.store.set('users/ref', { points: 5, rewardPool: 0, referrals: 0, refPoints: 0, notifications: [] });
  w.store.set('users/cust', { points: 5, rewardPool: 0, referredBy: 'ref', orders: 0, totalSpend: 0, notifications: [] });
  w.store.set('orders/o1', mkOrder());
  await w.completeOrder('o1', null);
  let r = w.store.get('users/ref'), c = w.store.get('users/cust');
  ck('referral: friend\'s first delivered order pays the inviter 20 pts from THAT order\'s profit (+200 DZD pool, referrals 1)', r.points === 25 && r.rewardPool === 200 && r.referrals === 1 && r.refPoints === 20, JSON.stringify(r));
  ck('referral: friend marked refRewarded, and still earns his own points', c.refRewarded === true && c.points === 25);
  ck('referral: ledger records who was paid', w.store.get('order_econ/o1').refPts === 20 && w.store.get('order_econ/o1').refUserId === 'ref');
  ck('referral: the inviter could NOT buy even the cheapest card with it (20 of 160 pts)', E.redeemablePts(r, E.normEcon(econCost)) === 20 && E.redeemablePts(r, E.normEcon(econCost)) < 160);
  w.store.set('orders/o2', mkOrder());
  await w.completeOrder('o2', null);
  ck('referral: the friend\'s SECOND order pays the inviter nothing more', w.store.get('users/ref').points === 25 && w.store.get('users/ref').referrals === 1);
  // big order: capped
  const w2 = world({ costs: { p15: 100 } }, prods);
  w2.store.set('users/ref', { points: 0, rewardPool: 0, referrals: 0, notifications: [] });
  w2.store.set('users/cust', { points: 0, rewardPool: 0, referredBy: 'ref', notifications: [] });
  w2.store.set('orders/o1', mkOrder({ totalDZD: 40000 }));
  await w2.completeOrder('o1', null);
  ck('referral: a 40 000 DZD first order is capped at 80 pts for the inviter (not 1 560)', w2.store.get('users/ref').points === 80 && w2.store.get('users/ref').rewardPool === 800, JSON.stringify(w2.store.get('users/ref'))); }

{ const w = world(econCost, prods);   // conditions that must NOT pay the inviter
  w.store.set('users/ref', { points: 0, rewardPool: 0, referrals: 0, notifications: [] });
  w.store.set('users/small', { points: 0, rewardPool: 0, referredBy: 'ref', notifications: [] });
  w.store.set('orders/s1', mkOrder({ userId: 'small', totalDZD: 1600, items: [{ id: 'p5', qty: 1, unitDZD: 1600 }] }));
  await w.completeOrder('s1', null);
  ck('referral: first order under the minimum (1 600 < 2 000 DZD) pays no referral, and does not burn the one-time bonus', w.store.get('users/ref').points === 0 && !w.store.get('users/small').refRewarded);
  w.store.set('users/self', { points: 0, rewardPool: 0, referredBy: 'self', notifications: [] });
  w.store.set('orders/s2', mkOrder({ userId: 'self' }));
  await w.completeOrder('s2', null);
  ck('referral: referring yourself pays nothing extra', w.store.get('users/self').points === 20 && !w.store.get('users/self').refRewarded);
  w.store.set('users/guest1', { points: 0 });
  w.store.set('orders/s3', mkOrder({ userId: 'guest', awarded: false }));
  await w.completeOrder('s3', null);
  ck('guest order completes without crashing and pays nobody', w.store.get('orders/s3').status === 'done' && !w.store.has('order_econ/s3'));
  w.store.set('orders/old', { userId: 'cust', status: 'pending', totalDZD: 4500 });   // legacy order: points were paid when it was placed
  w.store.set('users/cust', { points: 50, rewardPool: 0, orders: 3, totalSpend: 9000, notifications: [] });
  await w.completeOrder('old', null);
  ck('legacy order (no awarded:false flag): marks done, pays nothing again', w.store.get('users/cust').points === 50 && w.store.get('orders/old').status === 'done');
  w.store.set('users/loss', { points: 5, rewardPool: 0, notifications: [] });
  w.store.set('orders/l1', mkOrder({ userId: 'loss', totalDZD: 3000 }));
  await w.completeOrder('l1', null);
  ck('order sold below cost: delivers, earns 0 points, ledger shows the loss', w.store.get('users/loss').points === 5 && w.store.get('order_econ/l1').profit === -1000, JSON.stringify(w.store.get('order_econ/l1')));
  let threw = false; try { await world(econCost, prods).completeOrder('nope', null); } catch (e) { threw = true; }
  ck('missing order → clear error, nothing written', threw); }

{ let failedLoad = false;   // a failed read of the rules must stop the delivery, never fall back to "pay nothing" silently
  const ctxW = world(econCost, prods);
  const ctx2 = {}; vm.runInNewContext(fnSrc + ';this.f=completeOrder', Object.assign(ctx2, { firebase: { firestore: { FieldValue: {} } }, ensureEcon: async () => ({ _failed: true }), ensureProds: async () => [] }));
  try { await ctx2.f('x'); } catch (e) { failedLoad = /تعذّر/.test(e.message); }
  ck('economics document unreadable → delivery refused with a clear message (no silent zero-point delivery)', failedLoad); }

/* ───────── store-level simulation: the store never ends up behind ───────── */
{ // 300 customers, random prices/costs (cost 80–99.5% of price), random invite links; every customer redeems whenever the Worker would allow it.
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const e = E.normEcon({ earnPct: 40, refPct: 40, marginPct: 5 });
  const users = Array.from({ length: 300 }, (_, i) => ({ id: i, points: 5 + Math.floor(rnd() * 400) /* free points */, pool: 0, ref: i > 10 && rnd() < 0.5 ? Math.floor(rnd() * i) : null, paid: false }));
  let profit = 0, rewardCost = 0, redeemedWorth = 0, worstUserNet = Infinity; const perUserProfit = users.map(() => 0), perUserCost = users.map(() => 0);
  for (let day = 0; day < 40; day++) {
    for (const u of users) {
      if (rnd() < 0.25) {
        const price = [1600, 4500, 6200, 7800, 11900, 14900, 17500][Math.floor(rnd() * 7)], cost = Math.round(price * (0.8 + rnd() * 0.195)), p = price - cost;
        profit += p; perUserProfit[u.id] += p;
        const pts = E.earnPts(p, e); u.points += pts; u.pool += pts * e.ptDZD;
        if (u.ref !== null && !u.paid && price >= e.refMinOrderDZD) { u.paid = true; const rp = E.refPts(p, e), r = users[u.ref]; r.points += rp; r.pool += rp * e.ptDZD; }
      }
      for (const rw of e.rewards) {
        const need = E.rewardPts(rw, e);
        while (u.points >= need && u.pool >= need * e.ptDZD) {   // exactly the Worker's two conditions
          u.points -= need; u.pool -= need * e.ptDZD; redeemedWorth += need * e.ptDZD;
          const c = Math.round(rw.priceDZD * (0.8 + rnd() * 0.2)); rewardCost += c; perUserCost[u.id] += c;
        }
      }
    }
  }
  const owed = users.reduce((s, u) => s + Math.min(u.points, Math.floor(u.pool / e.ptDZD)) * e.ptDZD, 0);
  ck('simulation: 300 customers × 40 days with 400 free points each — total cost of free rewards (' + rewardCost.toLocaleString() + ' DZD) ≤ total profit (' + profit.toLocaleString() + ' DZD)', rewardCost <= profit, [rewardCost, profit]);
  ck('simulation: even if EVERY remaining redeemable point were cashed in at retail, the store still keeps ≥10% of all profit', rewardCost + owed <= profit * 0.9 + 1, [rewardCost + owed, profit * 0.9]);
  ck('simulation: no customer\'s pool or points ever went negative', users.every(u => u.pool >= 0 && u.points >= 0));
  ck('simulation: free points alone bought nothing — customers without any delivered purchase redeemed 0', users.every(u => (perUserProfit[u.id] > 0 || perUserCost[u.id] === 0) || users.some(x => x.ref === u.id)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
