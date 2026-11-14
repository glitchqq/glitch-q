/* ═══════════════════════════════════════════════════════════════════════════
   GLITCH Q — English for EVERY piece of Arabic text on the page.

   Why this file exists: the store's own texts are translated by script.js (the T dictionary + a few ternaries),
   but a lot of text sits straight in the HTML (terms, privacy, "about", footer, checkout, rewards, region
   names, "دج" next to every price …) and the language button never touched it.

   How it works (no page logic is changed):
     • In English mode every Arabic text node / placeholder / title / aria-label / alt that matches the table
       below is replaced by its English — on load, when the language is switched, AND whenever the page
       builds new HTML later (a MutationObserver translates it before the browser paints).
     • Switching back to Arabic restores the original text exactly.
     • The pairs already written in script.js (T.ar / T.en) are reused automatically, so a sentence is
       never translated twice in two different ways.
     • Text written by the store owner in the admin panel (product names, FAQ, …) has its own English fields
       there; this file never touches anything that is not an exact match of a text below.

   A new Arabic sentence added to index.html without a translation fails `node i18n.test.mjs`.
═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var AR = /[؀-ۿ]/;
  var norm = function (s) { return String(s).replace(/\s+/g, ' ').trim(); };

  /* ── 1) Arabic text exactly as written in the HTML  →  English ───────────────────────────────────── */
  var EN = {
    /* reset.html — password reset + account activation page */
    'إعادة تعيين كلمة المرور — Glitch Q': 'Reset your password — Glitch Q',
    'تفعيل الحساب — Glitch Q': 'Account activation — Glitch Q',
    'جارٍ التحقق من الرابط': 'Checking the link',
    'لحظة واحدة…': 'One moment…',
    'كلمة مرور جديدة': 'New password',
    'اختر كلمة مرور جديدة لحسابك، على ألا تقل عن 6 أحرف. هذا الرابط يعمل مرة واحدة فقط.': 'Choose a new password for your account (at least 6 characters). This link works only once.',
    'حفظ كلمة المرور': 'Save password',
    'تم تغيير كلمة المرور': 'Password changed',
    'حُفظت كلمة المرور الجديدة. يمكنك الآن تسجيل الدخول إلى حسابك بها.': 'Your new password is saved. You can now sign in to your account with it.',
    'الذهاب إلى المتجر': 'Go to the store',
    'تم تفعيل حسابك': 'Your account is activated',
    'تم تأكيد بريدك الإلكتروني. ارجع إلى المتجر وسجّل الدخول بالبريد وكلمة المرور.': 'Your e-mail is confirmed. Go back to the store and sign in with your e-mail and password.',
    'الذهاب إلى المتجر وتسجيل الدخول': 'Go to the store and sign in',
    'الرابط منتهي الصلاحية': 'The link has expired',
    'انتهت صلاحية رابط إعادة التعيين أو سبق استخدامه.': 'The reset link has expired or was already used.',
    'اطلب رابطاً جديداً من صفحة تسجيل الدخول في المتجر.': "Request a new link from the store's sign-in page.",
    'طلب رابط جديد': 'Request a new link',
    'العودة إلى المتجر': 'Back to the store',
    'كلمة المرور الجديدة': 'New password',
    'أعد كتابة كلمة المرور': 'Re-type the password',
    'تأكيد كلمة المرور': 'Confirm password',
    'تعذّر التحقق من الرابط': 'Could not verify the link',
    'حدث خطأ أثناء التحقق، وليس بالضرورة أن الرابط منتهي.': 'An error occurred during verification; the link has not necessarily expired.',
    'حاول مرة أخرى أو اطلب رابطاً جديداً.': 'Try again or request a new link.',
    'رابط التفعيل غير صالح': 'The activation link is not valid',
    'تعذّر تفعيل الحساب': 'Could not activate the account',
    'قد يكون الرابط استُخدم من قبل أو انتهت صلاحيته.': 'The link may have been used before, or it has expired.',
    'إن فعّلت حسابك سابقاً فسجّل الدخول مباشرة، وإن لم تفعّله فسجّل الدخول من المتجر وسنعرض لك زر إرسال رابط جديد.': 'If you already activated your account, just sign in. If not, sign in from the store and we will show you a button to send a new link.',
    'حدث خطأ أثناء التفعيل، وليس بالضرورة أن الرابط منتهي.': 'An error occurred during activation; the link has not necessarily expired.',
    'حاول مرة أخرى بعد قليل.': 'Please try again in a moment.',
    'تسجيل الدخول من المتجر': 'Sign in from the store',
    'كلمة المرور يجب أن تكون 6 أحرف على الأقل': 'The password must be at least 6 characters',
    'كلمتا المرور غير متطابقتين': 'The two passwords do not match',
    'جاري الحفظ...': 'Saving...',
    'انتهت صلاحية الرابط. اطلب رابطاً جديداً.': 'The link has expired. Request a new one.',
    'كلمة المرور ضعيفة جداً': 'The password is too weak',
    'حدث خطأ، حاول مرة أخرى': 'An error occurred, please try again',

    /* page title / meta */
    'Glitch Q | بطاقات PlayStation في الجزائر': 'Glitch Q | PlayStation Cards in Algeria',
    'Glitch Q — بطاقات PlayStation في الجزائر': 'Glitch Q — PlayStation Cards in Algeria',
    'بطاقات PlayStation في الجزائر': 'PlayStation Cards in Algeria',
    'Glitch Q · متجر PlayStation الرقمي في الجزائر': 'Glitch Q · Digital PlayStation Store in Algeria',

    /* consent banner */
    'قبل استخدام موقعنا، يرجى الموافقة على': 'Before using our site, please agree to the',

    /* sign-in / recovery */
    'استعادة الوصول لحسابك': 'Recover your account',
    'أدخل البريد المسجّل به وسنرسل لك رابطاً لاختيار كلمة مرور جديدة.': 'Enter your registered e-mail and we will send you a link to choose a new password.',
    'إرسال رابط الاستعادة': 'Send recovery link',
    '← العودة لتسجيل الدخول': '← Back to sign in',
    'تحقق من بريدك': 'Check your e-mail',
    'لم يصلك شيء؟ تفقّد مجلد الرسائل غير المرغوبة (Spam). الرابط صالح لمدة ساعة واحدة.': 'Nothing arrived? Check your Spam folder. The link is valid for one hour.',

    /* regions */
    'أوروبي': 'European', 'أمريكي': 'American', 'سعودي': 'Saudi', 'إماراتي': 'UAE',
    'SAR ر.س': 'SAR', 'AED د.إ': 'AED',

    /* account settings */
    'إعدادات الحساب': 'Account settings',
    'تخصيص': 'Customize',
    'الأمان': 'Security',
    'الاسم الظاهر': 'Display name',
    'يظهر في حسابك ولوحة المتصدرين (2–20 حرفاً).': 'Shown on your account and on the leaderboard (2–20 characters).',
    'الصورة الرمزية': 'Avatar',
    'اللون': 'Color',
    'القسم المفضل عند فتح المتجر': 'Favorite category when the store opens',
    'كل الأقسام': 'All categories',
    'إخفائي من لوحة المتصدرين': 'Hide me from the leaderboard',
    'لن يظهر اسمك للآخرين، وتبقى نقاطك محفوظة.': 'Your name will not be shown to others, and your points stay saved.',
    'حفظ التغييرات': 'Save changes',
    'تغيير كلمة المرور': 'Change password',
    'تنبيه الدخول من جهاز جديد': 'New-device sign-in alert',
    'نرسل لك بريداً عند تسجيل دخول إلى حسابك من جهاز جديد.': 'We e-mail you when your account is signed in from a new device.',
    'تسجيل الخروج من كل الأجهزة': 'Sign out of all devices',
    'ينهي جلسات حسابك على كل الأجهزة.': 'Ends your account sessions on every device.',

    /* order done + checkout */
    'تم استلام طلبك!': 'Order received!',
    'شكراً لثقتك بـ Glitch Q. طلبك الآن قيد المعالجة.': 'Thank you for trusting Glitch Q. Your order is now being processed.',
    'رقم الطلب': 'Order number',
    'تم استلام الطلب': 'Order received',
    'قيد التجهيز': 'Processing',
    'تسليم الكود': 'Code delivery',
    'تتبّع طلبك': 'Track your order',
    'متابعة التسوق': 'Continue shopping',
    'RIP للتحويل:': 'RIP for the transfer:',
    'التسليم يد بيد في': 'Hand delivery in',
    'ولاية تلمسان فقط': 'Tlemcen province only',
    'يد بيد في ولاية تلمسان فقط': 'Hand delivery in Tlemcen province only',
    'المجموع:': 'Total:',

    /* report a problem */
    'نوع المشكلة': 'Issue type',
    'مشكلة في الدفع': 'Payment issue',
    'لم أستلم الكود': 'I did not receive the code',
    'كود خاطئ': 'Wrong code',
    'مشكلة في الحساب': 'Account issue',
    'منتج غير صحيح': 'Wrong product',
    'أخرى': 'Other',
    'إرسال البلاغ': 'Submit report',

    /* terms */
    'آخر تحديث: يناير 2026': 'Last updated: January 2026',
    '1. القبول بالشروط': '1. Acceptance of the terms',
    'باستخدامك لموقع Glitch Q، فإنك توافق على الالتزام بهذه الشروط.': 'By using the Glitch Q website you agree to be bound by these terms.',
    '2. الخدمات المقدمة': '2. Services provided',
    'يقدم متجر Glitch Q بطاقات PlayStation الرقمية واشتراكات PS Plus والألعاب الرقمية. جميع المنتجات أصلية ومرخصة.': 'Glitch Q sells digital PlayStation cards, PS Plus subscriptions and digital games. All products are genuine and licensed.',
    '3. سياسة الدفع': '3. Payment policy',
    '• BaridiMob عبر RIP: 00799999004390466974': '• BaridiMob via RIP: 00799999004390466974',
    '• يد بيد في ولاية تلمسان فقط.': '• Hand delivery in Tlemcen province only.',
    '• يجب رفع وصل الدفع عند الشراء عبر BaridiMob.': '• A payment receipt must be uploaded when paying via BaridiMob.',
    '4. سياسة التسليم': '4. Delivery policy',
    'يتم إرسال الكود خلال 5 إلى 60 دقيقة من التحقق من الدفع.': 'The code is sent within 5 to 60 minutes after the payment is verified.',
    '5. سياسة الاسترجاع': '5. Refund policy',
    'لا يتم الاسترجاع بعد إرسال الكود': 'No refunds are given after the code is sent',
    'بأي حال.': 'under any circumstances.',
    '• في حالة الكود الخاطئ، يحق طلب الاستبدال خلال 24 ساعة بشرط عدم الاستخدام.': '• If the code is wrong, you may ask for a replacement within 24 hours, provided it has not been used.',
    '6. نظام النقاط والمكافآت': '6. Points and rewards system',
    '• النقاط تُمنح للمشتريات الحقيقية فقط.': '• Points are awarded for real purchases only.',
    '• يُحظر التلاعب بنظام الإحالات أو إنشاء حسابات وهمية.': '• Manipulating the referral system or creating fake accounts is prohibited.',
    '• المكافآت تخضع للتحقق قبل الإرسال.': '• Rewards are verified before they are delivered.',
    '7. السلوك المحظور': '7. Prohibited conduct',
    'يُحظر: إساءة استخدام الكوبونات، إنشاء حسابات وهمية، تقديم معلومات دفع مزيفة، محاولة الاحتيال على نظام الإحالات.': 'Prohibited: abusing coupons, creating fake accounts, providing false payment information, and attempting to defraud the referral system.',
    '8. حدود المسؤولية': '8. Limitation of liability',
    'لا يتحمل المتجر المسؤولية عن خسارة ناجمة عن اختيار ريجن خاطئ.': 'The store is not responsible for any loss caused by choosing the wrong region.',
    '9. التواصل': '9. Contact',
    'glitchq1q@gmail.com · واتساب: 213658996502': 'glitchq1q@gmail.com · WhatsApp: 213658996502',

    /* privacy */
    '1. المعلومات التي نجمعها': '1. Information we collect',
    '• بيانات الحساب: الاسم، البريد الإلكتروني.': '• Account data: name and e-mail address.',
    '• بيانات المعاملات: سجل الطلبات والمبالغ.': '• Transaction data: order history and amounts.',
    '• بصمة الجهاز لمنع الاحتيال.': '• Device fingerprint, to prevent fraud.',
    '2. كيف نستخدم معلوماتك': '2. How we use your information',
    '• معالجة الطلبات وإرسال الأكواد.': '• Processing orders and sending codes.',
    '• منع الاحتيال والتلاعب بنظام النقاط.': '• Preventing fraud and manipulation of the points system.',
    '• تحسين الخدمات.': '• Improving our services.',
    '3. مشاركة البيانات': '3. Data sharing',
    'لا نبيع بياناتك لأي طرف ثالث.': 'We never sell your data to any third party.',
    'نشارك فقط مع Firebase وTelegram لتشغيل الخدمات.': 'We share data only with Firebase and Telegram to run the services.',
    '4. أمان البيانات': '4. Data security',
    '• تشفير SSL لجميع الاتصالات.': '• SSL encryption for all connections.',
    '• كلمات المرور مشفرة عبر Firebase Auth.': '• Passwords are protected by Firebase Auth.',
    '5. حقوقك': '5. Your rights',
    '• حق الوصول لبياناتك والتصحيح والحذف.': '• The right to access, correct and delete your data.',
    '6. التواصل': '6. Contact',

    /* about */
    'عن الفريق': 'About the team',
    'متجر بطاقات PlayStation الرقمية في الجزائر، من تلمسان': 'The digital PlayStation card store in Algeria, from Tlemcen',
    'متجر بطاقات PlayStation الرقمية في الجزائر، من تلمسان.': 'The digital PlayStation card store in Algeria, from Tlemcen.',
    'قصتنا': 'Our story',
    'بدأت فكرة Glitch Q من شغف حقيقي بعالم الألعاب. نحن مجموعة من الشباب الجزائري الذين قرروا إنشاء منصة موثوقة تخدم مجتمع الجيمرز الجزائري.': 'Glitch Q started from a real passion for gaming. We are a group of young Algerians who set out to build a trusted platform that serves the Algerian gaming community.',
    'مهمتنا': 'Our mission',
    'تقديم أفضل بطاقات PlayStation بأسعار تنافسية مع ضمان أعلى مستوى من الأمان والسرعة.': 'To offer the best PlayStation cards at competitive prices, with the highest level of security and speed.',
    'قيمنا': 'Our values',
    'السرعة': 'Speed',
    'التسليم خلال 5 إلى 60 دقيقة بعد التحقق من الدفع': 'Delivery within 5 to 60 minutes after payment verification',
    'الدفع عبر بريدي موب أو يدًا بيد': 'Pay via BaridiMob or by hand',
    'الجودة': 'Quality',
    'أكواد أصلية تصلك على حسابك وبريدك': 'Genuine codes delivered to your account and e-mail',
    'الثقة': 'Trust',
    'خدمة عملاء دائمة': 'Customer service that is always there',
    'تواصل معنا': 'Contact us',
    'واتساب: 213658996502': 'WhatsApp: 213658996502',
    'تلمسان، الجزائر': 'Tlemcen, Algeria',

    /* home / rewards / profile / support / footer */
    'خصم على جميع البطاقات': 'Discount on all cards',
    'استخدم الكود:': 'Use code:',
    '🥉 مبتدئ': '🥉 Beginner',
    'سبين يومي مجاني — اربح نقاطاً إضافية!': 'Free daily spin — win extra points!',
    'افتح العجلة': 'Open the wheel',
    'تسجيل يومي': 'Daily check-in',
    'استلام مكافأة اليوم': "Claim today's reward",
    'المهام اليومية': 'Daily missions',
    'دعوة الأصدقاء': 'Invite friends',
    '⚠️ لا يعمل مع حسابات من نفس الجهاز أو الشبكة': '⚠️ Does not work with accounts from the same device or network',
    'مكافآت النقاط': 'Points rewards',
    'شاراتي': 'My badges',
    'لوحة الصدارة': 'Leaderboard',
    'مرحباً': 'Hello',
    'الإعدادات': 'Settings',
    'تحدث مع بوت الدعم الذكي لحل مشكلتك': 'Chat with the smart support bot to solve your issue',
    'glitchq1q@gmail.com — يفتح تطبيق البريد فوراً': 'glitchq1q@gmail.com — opens your mail app instantly',
    'روابط سريعة': 'Quick links',
    'مساعدة': 'Help',
    'واتساب المباشر': 'Direct WhatsApp',
    'طرق الدفع': 'Payment methods',

    /* placeholders */
    'مثال: ProGamer': 'e.g. ProGamer',
    'كلمة المرور الحالية': 'Current password',
    'كلمة المرور الجديدة (8 أحرف على الأقل)': 'New password (at least 8 characters)',
    'تأكيد كلمة المرور الجديدة': 'Confirm new password',
    'رقم الهاتف': 'Phone number',
    'عنوان المشكلة': 'Issue title',
    'وصف المشكلة بالتفصيل...': 'Describe the issue in detail...',
    'رقم الطلب (إن وجد)': 'Order number (if any)',
    'ابحث عن بطاقات، ألعاب، اشتراكات...': 'Search cards, games, subscriptions...'
  };

  /* ── 2) patterns for text the page builds with numbers in it ───────────────────────────────────── */
  var RX = [
    [/(\d[\d.,٫٬]*)\s*دج/g, '$1 DZD'],                       // 1,500 دج  →  1,500 DZD
    [/(^|[^؀-ۿ\w])دج(?![؀-ۿ])/g, '$1DZD']          // the bare unit
  ];

  /* ── 3) reuse every Arabic/English pair already written in script.js (T.ar / T.en) ──────────────── */
  function fromT() {
    try {
      if (typeof T === 'undefined' || !T.ar || !T.en) return;
      for (var k in T.ar) {
        if (typeof T.ar[k] === 'string' && typeof T.en[k] === 'string') {
          var n = norm(T.ar[k]);
          if (n && !Object.prototype.hasOwnProperty.call(EN, n)) EN[n] = T.en[k];
        }
      }
    } catch (e) { /* the page still works without it */ }
  }

  /* English for one piece of text, or null when there is nothing to change. Whitespace around it is kept. */
  function tr(s) {
    if (!s || !AR.test(s)) return null;
    var n = norm(s);
    if (Object.prototype.hasOwnProperty.call(EN, n)) {
      var lead = /^\s*/.exec(s)[0], trail = /\s*$/.exec(s)[0];
      return lead + EN[n] + trail;
    }
    var out = s;
    for (var i = 0; i < RX.length; i++) out = out.replace(RX[i][0], RX[i][1]);
    return out === s ? null : out;
  }

  var core = { EN: EN, RX: RX, tr: tr, norm: norm, fromT: fromT, AR: AR };
  if (typeof globalThis !== 'undefined') globalThis.gqI18n = core;
  if (typeof document === 'undefined' || !document.documentElement) return;   // (the unit test loads the tables only)

  /* ═══ the engine ═══════════════════════════════════════════════════════════════════════════════ */
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE|PRE)$/;
  var lang = 'ar', busy = false;
  var textOrig = new WeakMap(), textList = [];      /* node → { o: Arabic original, t: the English we wrote } */
  var attrOrig = new WeakMap(), attrList = [];      /* element → { attr: { o, t } } */
  var metaOrig = [];

  function skipEl(el) { return !el || SKIP.test(el.tagName) || (el.closest && el.closest('[data-no-i18n]')); }

  function doText(node) {
    var v = node.nodeValue;
    if (!v || !AR.test(v)) return;
    var p = node.parentNode;
    if (p && p.nodeType === 1 && skipEl(p)) return;
    var out = tr(v);
    if (out == null || out === v) return;
    if (!textOrig.has(node)) textList.push(node);
    textOrig.set(node, { o: v, t: out });
    node.nodeValue = out;
  }
  function doAttrs(el) {
    if (!el.getAttribute || (el.closest && el.closest('[data-no-i18n]')) || /^(SCRIPT|STYLE)$/.test(el.tagName)) return;   // (a textarea's placeholder is ours; only what the visitor typed is not)
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i], v = el.getAttribute(a);
      if (!v || !AR.test(v)) continue;
      var out = tr(v);
      if (out == null || out === v) continue;
      var rec = attrOrig.get(el);
      if (!rec) { rec = {}; attrOrig.set(el, rec); attrList.push(el); }
      rec[a] = { o: v, t: out };
      el.setAttribute(a, out);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || skipEl(root)) return;
    doAttrs(root);
    var els = root.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) doAttrs(els[i]);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) doText(n);
  }

  function doHead() {
    try {
      if (!metaOrig.length) {
        metaOrig.push({ el: null, v: document.title });
        var ms = document.querySelectorAll('meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]');
        for (var i = 0; i < ms.length; i++) metaOrig.push({ el: ms[i], v: ms[i].getAttribute('content') });
      }
      metaOrig.forEach(function (m) {
        var out = tr(m.v);
        if (out == null) return;
        if (m.el) m.el.setAttribute('content', out); else document.title = out;
      });
    } catch (e) { /* cosmetic only */ }
  }
  function undoHead() {
    metaOrig.forEach(function (m) { if (m.v == null) return; if (m.el) m.el.setAttribute('content', m.v); else document.title = m.v; });
  }

  function toEnglish() {
    busy = true;
    try { fromT(); doHead(); walk(document.body); }
    finally { busy = false; if (mo) mo.takeRecords(); }
  }
  function toArabic() {
    busy = true;
    try {
      /* put the Arabic back only where the text is still exactly what we wrote (never over something the page has just rewritten) */
      textList.forEach(function (n) { var r = textOrig.get(n); if (r && n.isConnected && n.nodeValue === r.t) n.nodeValue = r.o; });
      attrList.forEach(function (el) { var rec = attrOrig.get(el); if (rec && el.isConnected) for (var a in rec) if (el.getAttribute(a) === rec[a].t) el.setAttribute(a, rec[a].o); });
      textList = []; attrList = []; textOrig = new WeakMap(); attrOrig = new WeakMap();
      undoHead();
    } finally { busy = false; if (mo) mo.takeRecords(); }
  }
  function sync(l) {
    l = l === 'en' ? 'en' : 'ar';
    if (l === lang && l !== 'en') return;
    lang = l;
    var root = document.documentElement;
    if (root.hasAttribute('data-i18n-dir')) {            /* stand-alone pages (reset.html) have no applyTranslations() to flip the direction */
      var d = l === 'en' ? 'ltr' : 'rtl';
      if (root.getAttribute('dir') !== d) root.setAttribute('dir', d);
      if (root.getAttribute('lang') !== l) root.setAttribute('lang', l);
    }
    if (l === 'en') toEnglish(); else toArabic();
  }

  /* new HTML built later (cards, toasts, modals, notifications …) is translated before the browser paints */
  var mo = new MutationObserver(function (list) {
    if (lang !== 'en' || busy) return;
    busy = true;
    try {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'childList') { for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]); }
        else if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
      }
      if (textList.length > 4000) textList = textList.filter(function (n) { return n.isConnected; });   // forget nodes the page threw away
    } finally { busy = false; mo.takeRecords(); }
  });

  function start() {
    var saved = null;
    try { saved = localStorage.getItem('gq_lang'); } catch (e) {}
    var q = /[?&]lang=(en|ar)\b/.exec(location.search);
    var htmlLang = document.documentElement.getAttribute('lang');
    sync(q ? q[1] : (saved === 'en' || saved === 'ar') ? saved : (htmlLang === 'en' ? 'en' : 'ar'));
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    /* the language button changes <html lang>: that is our signal to translate / restore */
    new MutationObserver(function () { sync(document.documentElement.getAttribute('lang')); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    var te = document.querySelector('title');
    if (te) new MutationObserver(function () { if (lang !== 'en') return; var o = tr(document.title); if (o != null && o !== document.title) document.title = o; })
      .observe(te, { childList: true, characterData: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  core.sync = sync;
})();
