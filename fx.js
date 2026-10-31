/* Glitch Q — visual FX layer (GSAP + Lenis).
   Purely cosmetic. GSAP and Lenis are fetched here, asynchronously, AFTER the app has started, so a slow
   or blocked CDN can never delay the store. If they are not ready within 2.5s (or the user prefers
   reduced motion) the effects are skipped and the site works exactly the same. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  var t0 = Date.now();
  function load(src, cb) {
    var s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = function () { cb(true); };
    s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }
  function go() {
    load('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js', function (ok) {
      if (!ok || !window.gsap) return;
      load('https://cdn.jsdelivr.net/npm/lenis@1/dist/lenis.min.js', function () {
        if (Date.now() - t0 > 2500) return;   // too late: an animation starting now would flash content
        start();
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();

  function start() {

  /* ---------- Smooth scroll (Lenis) ---------- */
  var lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({
      lerp: 0.1,
      // let modals / scrollable overlays scroll natively
      prevent: function (node) {
        return node.closest && node.closest('.modal-ov, .modal-box, [data-lenis-prevent]');
      }
    });
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);

    // goPage() uses window.scrollTo({behavior:'smooth'}); route it through Lenis instead
    var origGoPage = window.goPage;
    if (typeof origGoPage === 'function') {
      window.goPage = function () {
        var r = origGoPage.apply(this, arguments);
        lenis.scrollTo(0, { immediate: true, force: true });
        return r;
      };
    }
  }

  /* ---------- Hero entrance ---------- */
  var heroParts = document.querySelectorAll('.hero-cnt > *');
  if (heroParts.length) {
    gsap.from(heroParts, { opacity: 0, y: 24, duration: 0.7, stagger: 0.1, ease: 'power3.out', delay: 0.15 });
  }

  /* ---------- Scroll reveal for dynamically rendered cards ---------- */
  var SEL = '.pc, .cat-c, .b3-card, .sup-card';
  var io = ('IntersectionObserver' in window)
    ? new IntersectionObserver(function (entries) {
        var batch = [];
        entries.forEach(function (e) {
          if (e.isIntersecting) { batch.push(e.target); io.unobserve(e.target); }
        });
        if (batch.length) {
          gsap.to(batch, {
            opacity: 1, y: 0, duration: 0.55, stagger: 0.07, ease: 'power2.out',
            overwrite: true, clearProps: 'transform,opacity'
          });
        }
      }, { threshold: 0.08 })
    : null;

  function prep(el) {
    if (!io || el.__fx) return;
    el.__fx = 1;
    gsap.set(el, { opacity: 0, y: 28 });
    io.observe(el);
    // safety net: never leave a card invisible
    setTimeout(function () { if (el.style.opacity === '0') gsap.set(el, { opacity: 1, y: 0, clearProps: 'transform,opacity' }); }, 4000);
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches && root.matches(SEL)) prep(root);
    if (root.querySelectorAll) root.querySelectorAll(SEL).forEach(prep);
  }

  var wrap = document.getElementById('pageWrap') || document.body;
  new MutationObserver(function (muts) {
    muts.forEach(function (m) { m.addedNodes.forEach(scan); });
  }).observe(wrap, { childList: true, subtree: true });
  scan(wrap);
  }
})();
