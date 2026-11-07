/* Glitch Q — store economics (pure functions, no I/O). Used by the owner's panel (admin.js) and by the tests.
   The Worker keeps its own copy of normEcon / rewardPts / redeemablePts because it is deployed as one pasted file;
   worker.test.mjs runs both on the same inputs and fails if they ever disagree.

   THE RULE this file exists to protect — the store never pays for a reward out of its own pocket:
     · a customer's reward pool (DZD) grows only on a DELIVERED order, by a share of that order's PROFIT;
     · points earned from orders are worth exactly what went into the pool (1 point = ptDZD of retail value);
     · a reward is redeemed at its RETAIL price, while the store's real cost for it is lower, so every redemption
       leaves the store at least as well off as it was before the customer ever bought anything;
     · free points (daily check-in, wheel) add to the balance but not to the pool, so they stay locked until
       real purchases unlock them. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GQEcon = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULTS = {
    marginPct: 5,          // profit margin assumed for a product whose cost price has not been entered (kept LOW on purpose)
    earnPct: 40,           // % of an order's profit given back to the buyer, as points
    refPct: 40,            // % of the friend's FIRST order profit given to the person who invited him
    refMaxPts: 80,         // hard cap of points per invited friend (must stay well below the cheapest reward)
    refMinOrderDZD: 2000,  // the friend's first order must be at least this to count
    ptDZD: 10,             // 1 point = 10 DZD of retail value
    rewards: [
      { id: 'r5', name: 'بطاقة PS Store 5€', nameEn: 'PS Store 5€ card', priceDZD: 1600 },
      { id: 'r15', name: 'بطاقة PS Store 15€', nameEn: 'PS Store 15€ card', priceDZD: 4500 },
      { id: 'r20', name: 'بطاقة PS Store 20€', nameEn: 'PS Store 20€ card', priceDZD: 6200 },
      { id: 'r50', name: 'بطاقة PS Store 50€', nameEn: 'PS Store 50€ card', priceDZD: 14900 }
    ]
  };

  function num(v, def, min, max) { var n = Number(v); return isFinite(n) ? Math.min(max, Math.max(min, n)) : def; }
  function txt(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }   // same as the Worker's cleanText

  /* Same rules as the Worker's normEcon, plus the private cost table (the Worker never needs it). */
  function normEcon(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var e = {
      marginPct: num(r.marginPct, DEFAULTS.marginPct, 0, 60),
      earnPct: Math.floor(num(r.earnPct, DEFAULTS.earnPct, 0, 70)),
      refPct: Math.floor(num(r.refPct, DEFAULTS.refPct, 0, 70)),
      refMaxPts: Math.floor(num(r.refMaxPts, DEFAULTS.refMaxPts, 0, 5000)),
      refMinOrderDZD: Math.floor(num(r.refMinOrderDZD, DEFAULTS.refMinOrderDZD, 0, 1e6)),
      ptDZD: Math.floor(num(r.ptDZD, DEFAULTS.ptDZD, 1, 1000))
    };
    if (e.earnPct + e.refPct > 90) e.refPct = Math.max(0, 90 - e.earnPct);   // the store always keeps at least 10% of the profit
    var list = Array.isArray(r.rewards) ? r.rewards : DEFAULTS.rewards;
    e.rewards = [];
    var seen = {};
    list.slice(0, 12).forEach(function (x) {
      var id = txt(x && x.id, 20), price = Math.floor(Number(x && x.priceDZD));
      if (!/^[A-Za-z0-9_-]{1,20}$/.test(id) || seen[id] || !(price >= 1 && price <= 1e6)) return;
      seen[id] = 1;
      e.rewards.push({ id: id, name: txt(x.name, 80) || id, nameEn: txt(x.nameEn, 80) || txt(x.name, 80) || id, priceDZD: price,
        prodId: /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/.test(String(x.prodId || '')) ? String(x.prodId) : '' });   // prodId only helps the owner's panel check the reward against its cost
    });
    e.costs = {};
    var c = r.costs && typeof r.costs === 'object' ? r.costs : {};
    Object.keys(c).slice(0, 600).forEach(function (k) {
      var v = Math.floor(Number(c[k]));
      if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/.test(k) && v >= 1 && v <= 1e7) e.costs[k] = v;
    });
    return e;
  }

  function listPrice(prod, rates) {
    var p = Number(prod && prod.priceDZD);
    if (p > 0) return p;
    return (Number(prod && prod.val) || 0) * ((rates && rates[prod && prod.cur]) || 220);
  }

  /* What one unit of a product costs the store: the entered cost, or (if none) list price minus the assumed margin. */
  function unitCost(prod, e, rates) {
    var real = e.costs && e.costs[prod && prod.id];
    if (real > 0) return { cost: real, known: true };
    return { cost: Math.round(listPrice(prod, rates) * (1 - e.marginPct / 100)), known: false };
  }

  /* Profit of ONE order = what the customer really paid (after discounts and coupon) minus what the items cost.
     `estimated` is true when at least one line used the assumed margin instead of a real cost. */
  function orderProfit(order, prods, e, rates) {
    var o = order || {}, revenue = Math.max(0, Number(o.totalDZD) || 0), cost = 0, estimated = false;
    var items = Array.isArray(o.items) ? o.items : [];
    if (!items.length) {
      cost = Math.round(revenue * (1 - e.marginPct / 100)); estimated = true;
    } else {
      items.forEach(function (it) {
        var qty = Math.max(1, Math.floor(Number(it && it.qty) || 1));
        var prod = (prods || []).filter(function (p) { return p && p.id === it.id; })[0];
        var uc;
        if (prod) uc = unitCost(prod, e, rates);
        else if (e.costs && e.costs[it.id] > 0) uc = { cost: e.costs[it.id], known: true };
        else uc = { cost: Math.round((Number(it.unitDZD) || 0) * (1 - e.marginPct / 100)), known: false };
        if (!uc.known) estimated = true;
        cost += uc.cost * qty;
      });
    }
    return { revenue: revenue, cost: cost, profit: revenue - cost, estimated: estimated };
  }

  /* Points the buyer earns on a delivered order (never from a loss-making order). */
  function earnPts(profit, e) { return Math.floor(Math.max(0, profit) * e.earnPct / 100 / e.ptDZD); }

  /* Points the referrer earns when the invited friend's first order is delivered, capped per friend. */
  function refPts(profit, e) { return Math.min(e.refMaxPts, Math.floor(Math.max(0, profit) * e.refPct / 100 / e.ptDZD)); }

  function rewardPts(rw, e) { return Math.ceil(rw.priceDZD / e.ptDZD); }

  /* Balance the customer can actually spend: limited by BOTH the point balance and the profit-funded pool. */
  function redeemablePts(u, e) {
    var pts = Math.max(0, Math.floor(Number(u && u.points) || 0)), pool = Math.max(0, Number(u && u.rewardPool) || 0);
    return Math.min(pts, Math.floor(pool / e.ptDZD));
  }

  /* One row per product for the "what do I really earn" table. */
  function simulate(prods, e, rates) {
    return (prods || []).map(function (p) {
      var price = Math.floor(listPrice(p, rates)), uc = unitCost(p, e, rates), profit = price - uc.cost;
      return { id: p.id, name: p.name, price: price, cost: uc.cost, known: uc.known, profit: profit,
               marginPct: price > 0 ? Math.round(profit / price * 1000) / 10 : 0,
               pts: earnPts(profit, e), refPts: refPts(profit, e) };
    });
  }

  /* Plain-language problems with a configuration (empty list = safe). */
  function audit(e, prods, rates) {
    var out = [];
    var cheapest = e.rewards.length ? Math.min.apply(null, e.rewards.map(function (r) { return rewardPts(r, e); })) : 0;
    if (e.earnPct + e.refPct > 90) out.push({ level: 'err', msg: 'مجموع نسبتي النقاط والإحالة يتجاوز 90% من الربح.' });
    if (cheapest && e.refMaxPts >= cheapest * 0.6) out.push({ level: 'warn', msg: 'سقف نقاط الإحالة (' + e.refMaxPts + ') قريب من سعر أرخص مكافأة (' + cheapest + ' نقطة): صديقان قد يكفيان لبطاقة. خفّضه ليبقى أقل من ' + Math.floor(cheapest * 0.6) + '.' });
    (e.rewards || []).forEach(function (r) {
      var linked = (prods || []).filter(function (p) { return p.id === r.prodId; })[0];
      if (linked && e.costs[linked.id] && r.priceDZD < e.costs[linked.id]) out.push({ level: 'err', msg: 'سعر المكافأة «' + r.name + '» أقل من تكلفتها عليك.' });
    });
    var rows = simulate(prods, e, rates), unknown = rows.filter(function (x) { return !x.known; }).length;
    if (unknown) out.push({ level: 'info', msg: unknown + ' منتج بلا سعر تكلفة: الأرباح تقديرية بهامش ' + e.marginPct + '%. أدخل التكلفة الحقيقية لتصير النقاط دقيقة.' });
    rows.filter(function (x) { return x.profit <= 0; }).forEach(function (x) { out.push({ level: 'err', msg: 'المنتج «' + x.name + '» لا يربحك شيئاً (سعر البيع ≤ التكلفة).' }); });
    return out;
  }

  return { DEFAULTS: DEFAULTS, normEcon: normEcon, listPrice: listPrice, unitCost: unitCost, orderProfit: orderProfit,
           earnPts: earnPts, refPts: refPts, rewardPts: rewardPts, redeemablePts: redeemablePts, simulate: simulate, audit: audit };
});
