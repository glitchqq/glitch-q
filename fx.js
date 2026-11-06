/* Glitch Q — motion layer. Vanilla JS, no libraries, no network.
   Purely cosmetic: if this file never runs (or the visitor prefers reduced motion) the store works the same,
   because nothing is hidden until this script marks it. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  if (reduce) return;
  var doc = document;

  /* ---------- scroll reveal: cards, headings and panels slide up as they enter ---------- */
  var SEL = '.sec-hdr, .pc, .cat-c, .how-it, .b3-card, .sup-card, .feat, .nl-inner, .pts-card';
  var io = ('IntersectionObserver' in window)
    ? new IntersectionObserver(function (entries) {
        var n = 0;
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.style.setProperty('--d', (n++ * 0.07).toFixed(2) + 's');
          e.target.classList.add('in');
          io.unobserve(e.target);
        });
      }, { threshold: 0.06, rootMargin: '0px 0px -4% 0px' })
    : null;

  function prep(el) {
    if (!io || el.__fx) return;
    el.__fx = 1;
    el.classList.add('rv');
    io.observe(el);
    /* safety net: a card can never stay hidden */
    setTimeout(function () { el.classList.add('in'); }, 5000);
  }
  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches && root.matches(SEL)) prep(root);
    if (root.querySelectorAll) root.querySelectorAll(SEL).forEach(prep);
  }
  function boot() {
    var wrap = doc.getElementById('pageWrap') || doc.body;
    new MutationObserver(function (muts) { muts.forEach(function (m) { m.addedNodes.forEach(scan); }); })
      .observe(wrap, { childList: true, subtree: true });
    scan(wrap);

    /* ---------- the world behind the page: drifting embers + stars, and a scroll rail ---------- */
    (function world() {
      var coarse = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
      var cv = doc.createElement('canvas');
      cv.className = 'world'; cv.setAttribute('aria-hidden', 'true');
      doc.body.insertBefore(cv, doc.body.firstChild);
      var g = cv.getContext('2d');
      if (!g) { cv.remove(); return; }
      var rail = doc.createElement('div');
      rail.className = 'rail'; rail.setAttribute('aria-hidden', 'true'); rail.innerHTML = '<i></i>';
      doc.body.appendChild(rail);
      var W = 0, H = 0, parts = [], stars = [], last = 0, scene = doc.getElementById('heroScene');
      function mk(init) {
        return { x: Math.random() * W, y: init ? Math.random() * H : H + 12, r: Math.random() * 2 + 0.7, vy: -(Math.random() * 0.32 + 0.1),
                 sw: Math.random() * 6.28, a: Math.random() * 0.5 + 0.25, hot: Math.random() < 0.22 };
      }
      function seed() {
        W = cv.width = innerWidth; H = cv.height = innerHeight;
        var n = Math.min(coarse ? 24 : 60, Math.round(W * H / 28000));
        parts = []; for (var i = 0; i < n; i++) parts.push(mk(true));
        stars = []; for (var j = 0; j < (coarse ? 36 : 90); j++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1 + 0.25, tw: Math.random() * 6.28, d: Math.random() * 0.5 + 0.1 });
      }
      seed();
      var rt = 0;
      window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(seed, 200); });
      function setRail() {
        var max = Math.max(1, doc.documentElement.scrollHeight - innerHeight);
        rail.style.setProperty('--sp', Math.min(1, Math.max(0, window.scrollY / max)).toFixed(4));
      }
      window.addEventListener('scroll', setRail, { passive: true }); setRail();
      function frame(now) {
        requestAnimationFrame(frame);
        if (doc.hidden || now - last < 33) return;
        last = now;
        /* the pinned hero is opaque: nothing to paint while it covers the screen */
        if (scene && scene.offsetParent) { var r = scene.getBoundingClientRect(); if (r.top <= 110 && r.bottom >= innerHeight) return; }
        var sy = window.scrollY, t = now * 0.001;
        g.clearRect(0, 0, W, H);
        g.globalCompositeOperation = 'source-over';
        for (var i = 0; i < stars.length; i++) {
          var s = stars[i], y = ((s.y - sy * s.d * 0.08) % H + H) % H;
          g.fillStyle = 'rgba(255,255,255,' + (0.12 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.3 + s.tw))).toFixed(3) + ')';
          g.fillRect(s.x, y, s.r, s.r);
        }
        g.globalCompositeOperation = 'lighter';
        for (var k = 0; k < parts.length; k++) {
          var p = parts[k];
          p.y += p.vy; p.x += Math.sin(t * 0.6 + p.sw) * 0.18;
          if (p.y < -12) { parts[k] = p = mk(false); }
          var col = p.hot ? '255,150,60' : '255,42,72';
          g.fillStyle = 'rgba(' + col + ',' + (p.a * 0.12).toFixed(3) + ')';
          g.beginPath(); g.arc(p.x, p.y, p.r * 4, 0, 6.2832); g.fill();
          g.fillStyle = 'rgba(' + col + ',' + p.a.toFixed(3) + ')';
          g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.2832); g.fill();
        }
      }
      requestAnimationFrame(frame);
    })();

    if (!fine) return;

    /* ---------- tilt: product cards lean toward the pointer ---------- */
    wrap.addEventListener('pointermove', function (e) {
      var c = e.target.closest && e.target.closest('.pc');
      if (!c || c.classList.contains('pc-unavail')) return;
      var r = c.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      c.style.setProperty('--ry', (x * 9).toFixed(2) + 'deg');
      c.style.setProperty('--rx', (-y * 9).toFixed(2) + 'deg');
    }, { passive: true });
    wrap.addEventListener('pointerout', function (e) {
      var c = e.target.closest && e.target.closest('.pc');
      if (c && !c.contains(e.relatedTarget)) { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); }
    }, { passive: true });

    /* ---------- magnetic hero buttons ---------- */
    doc.addEventListener('pointermove', function (e) {
      var b = e.target.closest && e.target.closest('.btn-hero-p, .btn-hero-o');
      if (!b) return;
      var r = b.getBoundingClientRect();
      b.style.setProperty('--mx', ((e.clientX - r.left - r.width / 2) * 0.14).toFixed(1) + 'px');
      b.style.setProperty('--my', ((e.clientY - r.top - r.height / 2) * 0.22).toFixed(1) + 'px');
    }, { passive: true });
    doc.addEventListener('pointerout', function (e) {
      var b = e.target.closest && e.target.closest('.btn-hero-p, .btn-hero-o');
      if (b && !b.contains(e.relatedTarget)) { b.style.removeProperty('--mx'); b.style.removeProperty('--my'); }
    }, { passive: true });

    /* ---------- reticle cursor (the real cursor stays visible) ---------- */
    var cur = doc.createElement('div');
    cur.className = 'cur'; cur.setAttribute('aria-hidden', 'true'); cur.innerHTML = '<i></i>';
    doc.body.appendChild(cur);
    var tx = -100, ty = -100, cx = -100, cy = -100, raf = 0;
    function loop() {
      cx += (tx - cx) * 0.22; cy += (ty - cy) * 0.22;
      cur.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
      raf = (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.3) ? requestAnimationFrame(loop) : 0;
    }
    doc.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY; cur.classList.add('on');
      var hot = e.target.closest && e.target.closest('a,button,.pc,.cat-c,.sup-card,input,select,textarea,[onclick],[role="button"]');
      cur.classList.toggle('hot', !!hot);
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
    doc.addEventListener('pointerdown', function () { cur.classList.add('down'); });
    doc.addEventListener('pointerup', function () { cur.classList.remove('down'); });
    doc.documentElement.addEventListener('pointerleave', function () { cur.classList.remove('on'); });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();

  /* ---------- page transition: cut to black, then wipe the new page in ---------- */
  var wipe = null;
  function playWipe() {
    if (!wipe) {
      wipe = doc.createElement('div'); wipe.className = 'wipe'; wipe.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(wipe);
    }
    wipe.classList.remove('run');
    void wipe.offsetWidth;
    wipe.classList.add('run');
    clearTimeout(playWipe.t);
    playWipe.t = setTimeout(function () { wipe.classList.remove('run'); }, 800);
  }
  function wrapGoPage() {
    var orig = window.goPage;
    if (typeof orig !== 'function' || orig.__fx) return false;
    var wrapped = function (name) {
      var cur = (typeof S !== 'undefined' && S) ? S.currentPage : null;
      var r = orig.apply(this, arguments);
      if (cur && name && cur !== name && ['home', 'shop', 'rewards', 'profile', 'support'].indexOf(name) > -1) {
        window.scrollTo(0, 0);
        playWipe();
      }
      return r;
    };
    wrapped.__fx = 1;
    window.goPage = wrapped;
    return true;
  }
  if (!wrapGoPage()) window.addEventListener('load', wrapGoPage);
})();
