/* Glitch Q — visual FX layer (GSAP + Lenis).
   Loaded after script.js. Purely cosmetic: if GSAP/Lenis fail to load or the
   user prefers reduced motion, the site works exactly as before. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !window.gsap) return;

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
})();
