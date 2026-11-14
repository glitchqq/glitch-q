/* ═══════════════════════════════════════════
   GLITCH Q — script.js v10.0 FINAL RELEASE
   Security hardened + Full bilingual AR/EN
   Cloudflare Proxy: glitchq-proxy
═══════════════════════════════════════════ */
'use strict';

/* ── storage that never throws ─────────────────────────────────────────────────────────────────────────────────────────────
   Some browsers refuse localStorage altogether (Safari "Block all cookies", in-app browsers of social apps, locked-down
   corporate profiles, quota full). Touching it there throws — and a throw while this file loads leaves a dead page.
   These wrappers keep the same API, fall back to memory for the visit, and never throw. */
function mkStore(kind){
  const mem={};let live=true;
  const raw=()=>window[kind];
  try{raw().getItem('gq_probe');}catch(e){live=false;}
  return{
    getItem(k){if(live){try{const v=raw().getItem(k);if(v!==null)return v;}catch(e){live=false;}}return Object.prototype.hasOwnProperty.call(mem,k)?mem[k]:null;},
    setItem(k,v){mem[k]=String(v);if(live){try{raw().setItem(k,String(v));}catch(e){}}},
    removeItem(k){delete mem[k];if(live){try{raw().removeItem(k);}catch(e){}}}
  };
}
const LS=mkStore('localStorage'),SS=mkStore('sessionStorage');
/* JSON.parse that gives the fallback back instead of throwing (a corrupted saved cart must not brick the shop) */
function jparse(v,d){try{const x=JSON.parse(v);return x==null?d:x;}catch(e){return d;}}
/* copy to clipboard: modern API first, then the old select-and-copy trick (iOS Safari, in-app browsers, plain http); resolves true/false */
function copyText(txt){
  txt=String(txt==null?'':txt);
  const legacy=()=>{
    try{
      const ta=document.createElement('textarea');
      ta.value=txt;ta.setAttribute('readonly','');ta.setAttribute('aria-hidden','true');
      ta.style.cssText='position:fixed;top:0;inset-inline-start:0;opacity:0;font-size:16px;pointer-events:none';
      document.body.appendChild(ta);ta.focus();ta.select();ta.setSelectionRange(0,txt.length);
      const ok=document.execCommand('copy');ta.remove();return ok;
    }catch(e){return false;}
  };
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText&&window.isSecureContext){
      return navigator.clipboard.writeText(txt).then(()=>true,()=>legacy());
    }
  }catch(e){}
  return Promise.resolve(legacy());
}

/* ── FIREBASE ── */
const _FC={
  apiKey:"AIzaSyDuMvn6UePhPf7hWIOkuQKOEoDEwogdIso",
  authDomain:"glitch-q.firebaseapp.com",
  projectId:"glitch-q",
  storageBucket:"glitch-q.firebasestorage.app",
  messagingSenderId:"34566279347",
  appId:"1:34566279347:web:8dfea7d9a884c1e8c060c6"
};
firebase.initializeApp(_FC);
const auth=firebase.auth();
const db=firebase.firestore();

/* ══ WORKER URL المحدّث ══ */
const WORKER="https://glitchq-proxy.kadirom7k777.workers.dev";
/* ══ Worker calls: prices, orders, coupons, points and rewards are decided on the server; the browser only asks ══ */
async function wkCall(path,payload,opt){
  opt=opt||{};const auth=opt.auth!==false;
  try{
    let tok='';
    if(auth&&S.user){try{tok=await S.user.getIdToken();}catch(e){}}
    let body,headers={};
    if(opt.form){body=new FormData();body.append('data',JSON.stringify(payload||{}));if(tok)body.append('idToken',tok);for(const k in (opt.files||{}))if(opt.files[k])body.append(k,opt.files[k]);}
    else{headers['Content-Type']='application/json';body=JSON.stringify(Object.assign({},payload||{},tok?{idToken:tok}:{}));}
    const r=await fetch(WORKER+path,{method:'POST',headers,body});
    let data={};try{data=await r.json();}catch(e){}
    return{status:r.status,ok:r.ok,data};
  }catch(e){return{status:0,ok:false,data:{}};}
}
function algiersDay(){try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Algiers',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}catch(e){return new Date().toISOString().slice(0,10);}}
const WA_N="213658996502";
const EMAIL_ADDR="glitchq1q@gmail.com";
const ADMIN_EMAIL="kadirom7k777@gmail.com";
const RATES=Object.freeze({EUR:220,USD:200,SAR:55,AED:56});

/* ══════════════════════════════════════════
   TRANSLATIONS
══════════════════════════════════════════ */
const T={
  ar:{
    nav_home:'الرئيسية',nav_shop:'المتجر',nav_subs:'الاشتراكات',
    nav_games:'شحن الألعاب',nav_rewards:'النقاط والمكافآت',nav_support:'الدعم',
    hero_welcome:'Glitch Q · متجر PlayStation الرقمي في الجزائر',hero_h1a:'بطاقات PlayStation',hero_h1b:'بالدينار الجزائري',
    hero_tagline:'اختر البطاقة، ادفع عبر بريدي موب أو يدًا بيد، ويصلك الكود على حسابك وبريدك.',
    hero_desc:'التسليم خلال 5 إلى 60 دقيقة بعد التحقق من الدفع.',
    hero_shop:'تسوق الآن',hero_explore:'كيف يعمل الشراء',
    feat_pay:'بريدي موب أو يد بيد',feat_pay_sub:'يد بيد في تلمسان فقط',
    feat_fast:'تسليم خلال 5–60 دقيقة',feat_fast_sub:'بعد التحقق من الدفع',
    feat_orig:'أكواد أصلية',feat_orig_sub:'تصلك على حسابك وبريدك',
    feat_sup:'دعم عبر واتساب',feat_sup_sub:'نتابع معك برقم طلبك',
    feat_pts:'نقاط مكافآت',feat_pts_sub:'اكسب كل عملية شراء',
    sec_how:'كيف يعمل الشراء',
    how1_t:'اختر البطاقة',how1_s:'حدّد القيمة والريجن المناسبين لحسابك على PlayStation.',
    how2_t:'ادفع وارفع الوصل',how2_s:'عبر بريدي موب، أو يدًا بيد في تلمسان، ثم أرفق صورة الوصل.',
    how3_t:'استلم الكود',how3_s:'يصلك على حسابك وبريدك. الكود صالح حتى آخر يوم من شهر الاستلام.',
    nav_account:'حسابي',nav_points:'النقاط',
    terms_agree:'أوافق على',terms_link:'الشروط والأحكام',terms_and:'و',privacy_link:'سياسة الخصوصية',
    sec_featured:'بطاقات مميزة',sec_cats:'تصفح الفئات',
    sec_leaders:'أفضل المتصدرين',sec_missions:'مهام يومية',
    sec_offer:'عرض خاص',see_all:'عرض الكل',
    shop_title:'المتجر',shop_sub:'اختر من بين مجموعة واسعة من المنتجات',
    shop_all:'الكل',shop_empty:'لا توجد منتجات في هذه الفئة',
    shop_search_empty:'لا نتائج لـ',
    prod_oos:'نفذ مؤقتاً',prod_order:'اطلب الآن',prod_cart:'أضف للسلة',
    prod_val:'القيمة',month:'شهر',copy:'نسخة رقمية',
    cart_title:'السلة',cart_empty:'السلة فارغة',
    cart_total:'المجموع',cart_checkout:'متابعة الشراء',
    co_title:'إتمام الطلب',co_cpn:'كوبون الخصم (اختياري)',
    co_apply:'تطبيق',co_total:'المبلغ الإجمالي',
    co_baridimob:'BaridiMob',co_hand:'يد بيد',
    co_rip:'RIP للتحويل',co_name:'الاسم الكامل (كما في بريدي موب)',
    co_upload:'ارفع صورة الوصل (max 5MB)',
    co_hand_note:'التسليم يد بيد في ولاية تلمسان فقط. اكتب رقم هاتفك وسنتواصل معك للاتفاق على مكان التسليم.',
    co_hand_phone:'رقم هاتفك للتواصل والاتفاق على مكان التسليم',
    co_phone:'رقم هاتفك',co_email_recv:'البريد لاستلام الكود',
    co_submit:'إرسال الطلب',co_email_tab:'إيميل',co_phone_tab:'هاتف',
    login_title:'تسجيل الدخول',login_sub:'سجل دخولك لتجميع النقاط والمكافآت',
    login_email:'البريد الإلكتروني',login_pass:'كلمة المرور',
    login_btn:'دخول',login_forgot:'هل تواجه مشكلة في تسجيل الدخول؟',
    login_guest:'تسوق كزائر',login_no_acc:'ليس لديك حساب؟',login_reg:'سجل الآن',
    reg_title:'إنشاء حساب',reg_sub:'احصل على 5 نقاط ترحيبية فوراً!',
    reg_first:'الاسم',reg_last:'اللقب',reg_pass:'كلمة المرور (6+)',
    reg_conf:'تأكيد كلمة المرور',reg_btn:'إنشاء الحساب',
    reg_have_acc:'لديك حساب؟',reg_login:'سجل دخولك',
    verify_title:'تحقق من إيميلك',
    verify_sub:'أرسلنا لك رابط التفعيل. افتح بريدك واضغط الرابط.',
    verify_resend:'إعادة الإرسال',verify_login:'تسجيل الدخول',
    region_title:'اختر ريجنك',region_sub:'حدد ريجن PlayStation لعرض الأسعار الصحيحة',
    rw_title:'النقاط والمكافآت',rw_pts_hint:'كل طلب يُسلَّم يمنحك نقاطاً · والنقاط المجانية تُفتح بمشترياتك',
    rw_ms_desc:'استبدل نقاطك ببطاقات مجانية. المتاح للاستبدال يعتمد على مشترياتك السابقة.',
    ref_link_title:'رابط الدعوة الخاص بك',
    ref_desc:'شارك رابطك مع أصدقائك. عندما يُتمّ صديقك أول عملية شراء تحصل على نقاط إضافية.',ref_cap:'حتى {n} نقطة لكل صديق',
    ref_warning:'لا يعمل مع حسابات من نفس الجهاز أو الشبكة',
    ref_copy:'نسخ',ref_friends:'صديق مدعو',ref_pts_label:'نقطة من الدعوات',
    ref_login_hint:'سجل دخولك لعرض رابطك',
    prof_title:'حسابي',prof_login:'سجل دخولك',
    prof_login_sub:'لتجميع النقاط وتتبع طلباتك',
    prof_login_btn:'دخول / تسجيل',prof_orders:'آخر طلباتك',
    prof_logout:'تسجيل الخروج',prof_track:'تتبع',
    prof_region:'الريجن',prof_rate:'تقييم',prof_rewards:'مكافآت',
    pts_label:'نقطة',
    sup_title:'الدعم الفني',sup_sub:'نحن هنا لمساعدتك في أي وقت',
    sup_card1:'الدعم الفني',sup_card1s:'تحدث مع بوت الدعم الذكي',
    sup_card2:'الإبلاغ عن مشكلة',sup_card2s:'أرسل بلاغاً مفصلاً للإدارة',
    sup_card3:'تتبع الطلبات',sup_card3s:'تتبع حالة طلبك برقم الطلب',
    sup_card4:'الأسئلة الشائعة',sup_card4s:'إجابات على أكثر الأسئلة شيوعاً',
    sup_card5:'واتساب',sup_card5s:'تواصل معنا مباشرة — يفتح المحادثة فوراً',
    sup_card6:'البريد الإلكتروني',sup_card6s:'glitchq1q@gmail.com',
    consent_title:'مرحباً بك في Glitch Q!',
    consent_accept:'قبول والمتابعة',consent_reject:'رفض',
    spin_title:'Lucky Spin',spin_sub:'دوّر العجلة واربح نقاطاً! سبين واحد يومياً',
    spin_btn:'أدِر العجلة',
    bot_title:'مساعد الدعم الفني',bot_sub:'سأساعدك في حل مشكلتك',
    human_btn:'تواصل مع الدعم البشري',
    report_title:'الإبلاغ عن مشكلة',report_sub:'سيتم إرسال بلاغك مباشرة إلى الإدارة',
    report_attach:'إرفاق صورة (اختياري)',
    rating_title:'قيّم تجربتك',rating_comment:'تعليق اختياري...',
    rating_submit:'إرسال التقييم',rating_skip:'تخطي',
    track_title:'تتبع طلبك',track_placeholder:'رقم الطلب...',track_btn:'تتبع',
    track_not_found:'رقم الطلب غير موجود',track_error:'حدث خطأ',
    faq_title:'الأسئلة الشائعة',
    nl_title:'اشترك في نشرتنا البريدية',
    nl_sub:'احصل على آخر العروض والخصومات الحصرية',
    nl_placeholder:'بريدك الإلكتروني...',nl_btn:'اشتراك',
    notif_title:'الإشعارات',notif_empty:'لا توجد إشعارات',
    choose_region:'اختر الريجن',
    f_copy:'GLITCH Q 2026 © جميع الحقوق محفوظة',
    f_brand:'متجر بطاقات PlayStation الرقمية في الجزائر، من تلمسان.',
    offer_title:'عرض خاص',offer_desc:'خصم على جميع البطاقات\nاستخدم الكود:',
    offer_shop:'تسوق الآن',all_missions:'عرض جميع المهام',
    leaders_spin:'Lucky Spin للنقاط',
    my_acc:'حسابي',my_pts:'نقاطي',track_order:'تتبع طلب',logout_txt:'خروج',
    loading_txt:'جاري التحميل...',loading_init:'تهيئة المتجر...',
    loading_data:'تحميل البيانات...',loading_done:'أهلاً بك!',
    order_pend:'🆕 قيد المراجعة',order_proc:'قيد المعالجة',
    order_done:'تم التسليم',order_rej:'مرفوض',
    or_text:'أو',send_support_placeholder:'اكتب مشكلتك...',
    t_added_cart:'أضيف للسلة',t_oos:'المنتج نفذ مؤقتاً',
    t_login_first:'سجل دخولك أولاً',t_region_done:'ريجن',
    t_copied:'تم النسخ',t_spin_daily:'سبين واحد يومياً فقط!',
    t_spin_next:'السبين القادم بعد',t_sending:'جاري الإرسال...',
    t_order_sent:'تم إرسال طلبك! سيصلك الكود قريباً',
    t_pts:'نقطة',t_lang_changed:'تم تغيير اللغة',
    t_consent_ok:'شكراً على موافقتك! مرحباً بك في Glitch Q',
    t_subscribed:'تم الاشتراك!',t_email_invalid:'أدخل إيميلاً صحيحاً',
    t_terms_required:'يجب الموافقة على الشروط والأحكام',
    t_name_required:'أدخل الاسم واللقب',t_pass_mismatch:'كلمة المرور غير متطابقة',
    t_pass_short:'6 أحرف على الأقل',t_email_exists:'الإيميل مسجل مسبقاً',
    t_weak_pass:'كلمة مرور ضعيفة',t_login_error:'خطأ في البريد أو كلمة المرور',
    t_verify_first:'فعّل حسابك من إيميلك أولاً',t_verify_sent:'أرسلنا لك رابط التفعيل — تفقّد بريدك',t_acct_unverified:'حسابك مسجّل لكن غير مفعّل — أرسلنا لك رابط التفعيل من جديد',t_verify_fail:'تعذّر إرسال رسالة التفعيل الآن، اضغط «إعادة الإرسال» بعد قليل',t_already_verified:'حسابك مفعّل بالفعل، سجّل الدخول',
    t_reg_done:'تم التسجيل! تحقق من إيميلك',
    t_reset_sent:'تم إرسال رابط التعيين',t_reset_error:'إيميل غير موجود',
    t_no_email:'أدخل إيميلك',t_logged_out:'تم تسجيل الخروج',
    t_welcome:'أهلاً بك!',t_coupon_invalid:'كوبون غير صحيح',
    t_enter_cpn:'أدخل الكوبون',t_rip_copied:'تم نسخ الـ RIP',
    t_name_full:'أدخل اسمك الكامل',t_upload_receipt:'أرفق صورة الوصل',
    t_img_invalid:'صورة غير صالحة',t_phone_required:'أدخل رقم هاتفك',
    t_too_many:'طلبات كثيرة، حاول بعد دقيقة',t_conn_error:'تحقق من الاتصال',
    t_streak_done:'استلمت مكافأتك اليوم بالفعل!',
    t_streak_reward:'مكافأة اليوم!',t_badge_new:'شارة جديدة',
    t_ref_copied:'تم نسخ رابط الدعوة!',
    t_ref_self:'لا يمكن الإحالة من نفس الجهاز',
    t_ref_done:'تم تسجيل دعوتك! سيحصل صاحبك على نقاط بعد أول عملية شراء لك',
    t_ms_pts:'تحتاج نقاطاً أكثر للحصول على هذه المكافأة',t_rw_locked:'نقاطك مقفلة: تُفتح مع مشترياتك المُسلَّمة',t_rw_ok:'تم الاستبدال! سنرسل المكافأة خلال 24 ساعة',rw_bal:'رصيدك',rw_avail:'متاح للاستبدال',rw_lock:'مقفل (يُفتح بمشترياتك)',rw_need:'تحتاج',rw_more:'نقطة أخرى',rw_redeem:'🎁 استبدل',rw_locked_btn:'🔒 مقفلة',rw_cost:'تكلفتها',rw_loading:'جاري التحميل…',
    t_ms_claimed:'استلمت هذه المكافأة مسبقاً',
    t_ms_spend:'يجب أن تصرف على الأقل',
    t_ms_notify:'يمكنك الآن استلام',t_ms_notify2:'اذهب لقسم المكافآت',
    t_ms_error:'حدث خطأ',t_redirect_human:'تم توجيهك للدعم البشري',
    t_report_title_req:'أدخل عنوان المشكلة',
    t_report_cat_req:'اختر نوع المشكلة',
    t_report_desc_req:'أدخل وصفاً تفصيلياً (20 حرف على الأقل)',
    t_report_sent:'تم إرسال بلاغك! سنتواصل معك قريباً',
    t_report_error:'حدث خطأ، حاول مرة أخرى',
    t_star_select:'اختر النجوم',t_rating_done:'شكراً!',
    t_choose_prod:'اختر منتجاً أولاً',
    t_maintenance:'الموقع في وضع الصيانة. نعود قريباً',
    t_error:'حدث خطأ',t_banned:'تم تعليق حسابك.',
    t_processing:'جاري المعالجة...',
  },
  en:{
    nav_home:'Home',nav_shop:'Shop',nav_subs:'Subscriptions',
    nav_games:'Game Credits',nav_rewards:'Points & Rewards',nav_support:'Support',
    hero_welcome:'Glitch Q · PlayStation digital store, Algeria',hero_h1a:'PlayStation cards',hero_h1b:'priced in DZD',
    hero_tagline:'Pick a card, pay with BaridiMob or in person, and get your code in your account and inbox.',
    hero_desc:'Delivered 5 to 60 minutes after your payment is verified.',
    hero_shop:'Shop now',hero_explore:'How buying works',
    feat_pay:'BaridiMob or in person',feat_pay_sub:'In person in Tlemcen only',
    feat_fast:'Delivered in 5–60 min',feat_fast_sub:'After payment is verified',
    feat_orig:'Genuine codes',feat_orig_sub:'Sent to your account and inbox',
    feat_sup:'Support on WhatsApp',feat_sup_sub:'We follow up with your order no.',
    feat_pts:'Reward points',feat_pts_sub:'Earn on every order',
    sec_how:'How buying works',
    how1_t:'Pick a card',how1_s:'Choose the value and the region that matches your PlayStation account.',
    how2_t:'Pay and upload the receipt',how2_s:'BaridiMob, or in person in Tlemcen, then attach a photo of the receipt.',
    how3_t:'Get your code',how3_s:'It arrives in your account and inbox. The code is valid until the last day of the month you receive it.',
    nav_account:'Account',nav_points:'Points',
    terms_agree:'I agree to the',terms_link:'Terms',terms_and:'and',privacy_link:'Privacy Policy',
    sec_featured:'Featured Cards',sec_cats:'Browse Categories',
    sec_leaders:'Top Players',sec_missions:'Daily Missions',
    sec_offer:'Special Offer',see_all:'View All',
    shop_title:'Shop',shop_sub:'Choose from a wide range of products',
    shop_all:'All',shop_empty:'No products in this category',
    shop_search_empty:'No results for',
    prod_oos:'Out of Stock',prod_order:'Order Now',prod_cart:'Add to Cart',
    prod_val:'Value',month:'Month',copy:'Digital Copy',
    cart_title:'Cart',cart_empty:'Cart is empty',
    cart_total:'Total',cart_checkout:'Proceed to Checkout',
    co_title:'Complete Order',co_cpn:'Discount Coupon (optional)',
    co_apply:'Apply',co_total:'Total Amount',
    co_baridimob:'BaridiMob',co_hand:'Hand Delivery',
    co_rip:'Transfer RIP',co_name:'Full Name (as in BaridiMob)',
    co_upload:'Upload receipt image (max 5MB)',
    co_hand_note:'Hand delivery in Tlemcen only. Enter your phone number and we will contact you to agree on the meeting place.',
    co_hand_phone:'Your phone number (to agree on the meeting place)',
    co_phone:'Your phone number',co_email_recv:'Email to receive code',
    co_submit:'Submit Order',co_email_tab:'Email',co_phone_tab:'Phone',
    login_title:'Sign In',login_sub:'Sign in to collect points and rewards',
    login_email:'Email address',login_pass:'Password',
    login_btn:'Sign In',login_forgot:'Having trouble signing in?',
    login_guest:'Shop as Guest',login_no_acc:"Don't have an account?",login_reg:'Register Now',
    reg_title:'Create Account',reg_sub:'Get 5 welcome points instantly!',
    reg_first:'First Name',reg_last:'Last Name',reg_pass:'Password (6+)',
    reg_conf:'Confirm Password',reg_btn:'Create Account',
    reg_have_acc:'Already have an account?',reg_login:'Sign In',
    verify_title:'Verify Your Email',
    verify_sub:'We sent you a verification link. Open your email and click it.',
    verify_resend:'Resend Email',verify_login:'Sign In',
    region_title:'Choose Your Region',region_sub:'Select your PlayStation region',
    rw_title:'Points & Rewards',rw_pts_hint:'Every delivered order earns points · free points unlock with your purchases',
    rw_ms_desc:'Redeem your points for free cards. What you can redeem depends on your past purchases.',
    ref_link_title:'Your Referral Link',
    ref_desc:'Share your link with friends. When a friend completes a first purchase you earn bonus points.',ref_cap:'Up to {n} points per friend',
    ref_warning:'Does not work with accounts from the same device',
    ref_copy:'Copy',ref_friends:'Friends invited',ref_pts_label:'Points from referrals',
    ref_login_hint:'Sign in to view your link',
    prof_title:'My Account',prof_login:'Sign In',
    prof_login_sub:'To collect points and track your orders',
    prof_login_btn:'Sign In / Register',prof_orders:'Recent Orders',
    prof_logout:'Sign Out',prof_track:'Track',
    prof_region:'Region',prof_rate:'Rate',prof_rewards:'Rewards',
    pts_label:'points',
    sup_title:'Support',sup_sub:'We are here to help you anytime',
    sup_card1:'Technical Support',sup_card1s:'Chat with our smart support bot',
    sup_card2:'Report an Issue',sup_card2s:'Send a detailed report to management',
    sup_card3:'Track Orders',sup_card3s:'Track your order status',
    sup_card4:'FAQ',sup_card4s:'Answers to common questions',
    sup_card5:'WhatsApp',sup_card5s:'Contact us directly',
    sup_card6:'Email',sup_card6s:'glitchq1q@gmail.com',
    consent_title:'Welcome to Glitch Q!',
    consent_accept:'Accept & Continue',consent_reject:'Decline',
    spin_title:'Lucky Spin',spin_sub:'Spin the wheel and win points! One spin per day',
    spin_btn:'Spin the Wheel',
    bot_title:'Support Assistant',bot_sub:'I will help you solve your issue',
    human_btn:'Contact Human Support',
    report_title:'Report an Issue',report_sub:'Your report will be sent to management',
    report_attach:'Attach image (optional)',
    rating_title:'Rate Your Experience',rating_comment:'Optional comment...',
    rating_submit:'Submit Rating',rating_skip:'Skip',
    track_title:'Track Your Order',track_placeholder:'Order number...',track_btn:'Track',
    track_not_found:'Order number not found',track_error:'An error occurred',
    faq_title:'FAQ',
    nl_title:'Subscribe to our Newsletter',
    nl_sub:'Get the latest offers and exclusive discounts',
    nl_placeholder:'Your email address...',nl_btn:'Subscribe',
    notif_title:'Notifications',notif_empty:'No notifications',
    choose_region:'Choose Region',
    f_copy:'GLITCH Q 2026 © All Rights Reserved',
    f_brand:'PlayStation digital cards for Algeria, from Tlemcen.',
    offer_title:'Special Offer',offer_desc:'Discount on all cards\nUse code:',
    offer_shop:'Shop Now',all_missions:'View All Missions',
    leaders_spin:'Lucky Spin for Points',
    my_acc:'My Account',my_pts:'My Points',track_order:'Track Order',logout_txt:'Sign Out',
    loading_txt:'Loading...',loading_init:'Initializing store...',
    loading_data:'Loading data...',loading_done:'Welcome!',
    order_pend:'🆕 Under Review',order_proc:'Processing',
    order_done:'Delivered',order_rej:'Rejected',
    or_text:'or',send_support_placeholder:'Type your issue...',
    t_added_cart:'Added to cart',t_oos:'Product is out of stock',
    t_login_first:'Please sign in first',t_region_done:'Region',
    t_copied:'Copied',t_spin_daily:'One spin per day only!',
    t_spin_next:'Next spin in',t_sending:'Sending...',
    t_order_sent:'Order sent! Your code will arrive shortly',
    t_pts:'points',t_lang_changed:'Language changed',
    t_consent_ok:'Thank you! Welcome to Glitch Q',
    t_subscribed:'Subscribed!',t_email_invalid:'Enter a valid email',
    t_terms_required:'You must agree to the terms',
    t_name_required:'Enter first and last name',t_pass_mismatch:'Passwords do not match',
    t_pass_short:'At least 6 characters',t_email_exists:'Email already registered',
    t_weak_pass:'Weak password',t_login_error:'Invalid email or password',
    t_verify_first:'Please verify your email first',t_verify_sent:'We sent you the activation link — check your inbox',t_acct_unverified:'Your account exists but is not activated — we sent the activation link again',t_verify_fail:'Could not send the activation e-mail right now, press Resend in a moment',t_already_verified:'Your account is already activated, please sign in',
    t_reg_done:'Registered! Check your email',
    t_reset_sent:'Password reset link sent',t_reset_error:'Email not found',
    t_no_email:'Enter your email',t_logged_out:'Signed out',
    t_welcome:'Welcome!',t_coupon_invalid:'Invalid coupon',
    t_enter_cpn:'Enter coupon code',t_rip_copied:'RIP copied',
    t_name_full:'Enter your full name',t_upload_receipt:'Upload receipt image',
    t_img_invalid:'Invalid image',t_phone_required:'Enter your phone number',
    t_too_many:'Too many requests, try again in a minute',t_conn_error:'Check your connection',
    t_streak_done:"Already claimed today's reward!",
    t_streak_reward:"✅ Today's reward!",t_badge_new:'New Badge',
    t_ref_copied:'Referral link copied!',
    t_ref_self:'Cannot refer from same device',
    t_ref_done:'Referral registered! Your friend earns points after your first purchase',
    t_ms_pts:'You need more points for this reward',t_rw_locked:'Your points are locked: they unlock with your delivered purchases',t_rw_ok:'Redeemed! We will send the reward within 24 hours',rw_bal:'Balance',rw_avail:'Redeemable',rw_lock:'Locked (unlocks with purchases)',rw_need:'Need',rw_more:'more points',rw_redeem:'🎁 Redeem',rw_locked_btn:'🔒 Locked',rw_cost:'Costs',rw_loading:'Loading…',
    t_ms_claimed:'Already claimed this reward',
    t_ms_spend:'You must spend at least',
    t_ms_notify:'You can now claim',t_ms_notify2:'Go to Rewards section',
    t_ms_error:'An error occurred',t_redirect_human:'Redirected to human support',
    t_report_title_req:'Enter issue title',
    t_report_cat_req:'Select issue type',
    t_report_desc_req:'Enter detailed description (min 20 chars)',
    t_report_sent:'Report submitted! We will contact you soon',
    t_report_error:'An error occurred, please try again',
    t_star_select:'Select stars',t_rating_done:'Thank you!',
    t_choose_prod:'Choose a product first',
    t_maintenance:'Site is under maintenance. Back soon',
    t_error:'An error occurred',t_banned:'Your account has been suspended.',
    t_processing:'Processing...',
  }
};

function t(key){return T[S?.lang||'ar']?.[key]||T['ar']?.[key]||key;}

/* ══════════════════════════════════════════
   APPLY TRANSLATIONS
══════════════════════════════════════════ */
function applyTranslations(){
  const lang=S.lang;
  const html=document.getElementById('htmlTag');
  if(html){html.setAttribute('lang',lang);html.setAttribute('dir',lang==='ar'?'rtl':'ltr');}
  const st=(id,val)=>{const el=document.getElementById(id);if(el&&val!==undefined)el.textContent=val;};
  const sp=(id,attr,val)=>{const el=document.getElementById(id);if(el)el.setAttribute(attr,val);};

  st('langLbl',lang.toUpperCase());

  // Nav
  const navItems=document.querySelectorAll('.nav-ul li a');
  const navKeys=['nav_home','nav_shop','nav_rewards'];
  navItems.forEach((a,i)=>{if(navKeys[i])a.textContent=t(navKeys[i]);});
  const nav5=document.querySelector('.nav-ul li:last-child a');
  if(nav5)nav5.innerHTML=`${t('nav_support')} <span class="nav-live">·</span>`;

  // Hero
  st('heroWelcome',t('hero_welcome'));st('heroTagline',t('hero_tagline'));
  st('heroDesc',t('hero_desc'));st('heroShopBtn',t('hero_shop'));
  st('heroExploreBtn',t('hero_explore'));
  st('heroH1a',t('hero_h1a'));st('heroH1b',t('hero_h1b'));
  {const e=document.getElementById('heroH1b');if(e&&e.parentElement)e.parentElement.dataset.t=t('hero_h1b');}
  st('howTitle',t('sec_how'));
  {const e=document.getElementById('regTermsText');if(e)e.innerHTML=`${t('terms_agree')} <button type="button" onclick="openM('termsModal')" class="consent-link">${t('terms_link')}</button> ${t('terms_and')} <button type="button" onclick="openM('privacyModal')" class="consent-link">${t('privacy_link')}</button>`;}
  [1,2,3].forEach(i=>{st('how'+i+'T',t('how'+i+'_t'));st('how'+i+'S',t('how'+i+'_s'));st('hs'+i+'T',t('how'+i+'_t'));st('hs'+i+'S',t('how'+i+'_s'));});
  ['nav_home','nav_shop','nav_points','nav_support','nav_account'].forEach((k,i)=>st('tb'+i,t(k)));

  // Features
  st('feat1T',t('feat_pay'));st('feat1S',t('feat_pay_sub'));
  st('feat2T',t('feat_fast'));st('feat2S',t('feat_fast_sub'));
  st('feat3T',t('feat_orig'));st('feat3S',t('feat_orig_sub'));
  st('feat4T',t('feat_sup'));st('feat4S',t('feat_sup_sub'));

  // Home sections
  st('featuredTitle',t('sec_featured'));st('seeAllBtn',t('see_all'));
  st('catsTitle',t('sec_cats'));st('leadersTitle',t('sec_leaders'));
  st('missionsTitle',t('sec_missions'));st('offerTitle',t('offer_title'));renderOffer();
  st('offerShopBtn',t('offer_shop'));st('allMissionsBtn',t('all_missions'));
  st('spinForPtsBtn',t('leaders_spin'));

  // Newsletter
  st('nlTitle',t('nl_title'));st('nlSub',t('nl_sub'));st('nlBtn',t('nl_btn'));
  sp('nlEmail','placeholder',t('nl_placeholder'));

  // Shop
  st('shopTitle',t('shop_title'));st('shopSub',t('shop_sub'));

  // Rewards
  st('rewardsTitle',t('rw_title'));
  const rwHint=document.querySelector('#pg-rewards .pts-card p');
  if(rwHint)rwHint.textContent=t('rw_pts_hint');
  const msDesc=document.querySelector('#pg-rewards .rw-sec p');
  if(msDesc)msDesc.textContent=t('rw_ms_desc');
  st('refLinkTitle2',t('ref_link_title'));
  const refDescEl=document.querySelector('.ref-desc');
  if(refDescEl)refDescEl.innerHTML=`${t('ref_desc')}<br><small style="color:var(--dim)">${t('ref_warning')}</small>`;
  st('copyRefText',t('ref_copy'));
  if(!S.user){const rlt=document.getElementById('refLinkTxt');if(rlt)rlt.textContent=t('ref_login_hint');}

  // Profile
  st('profileTitle',t('prof_title'));
  const nlb=document.querySelector('#notLoggedBox h3');if(nlb)nlb.textContent=t('prof_login');
  const nlbp=document.querySelector('#notLoggedBox p');if(nlbp)nlbp.textContent=t('prof_login_sub');
  const nlbBtn=document.querySelector('#notLoggedBox button');if(nlbBtn)nlbBtn.textContent=t('prof_login_btn');
  const pht=document.querySelector('.prof-hist-ttl');if(pht)pht.textContent=t('prof_orders');
  const logBtn=document.querySelector('#profBox .btn-danger');if(logBtn)logBtn.textContent=t('prof_logout');
  const ptsLbl=document.querySelector('.prof-pts .pl');if(ptsLbl)ptsLbl.textContent=t('pts_label');
  [['profTrack','prof_track'],['profRegion','prof_region'],['profRate','prof_rate'],['profRewards','prof_rewards']].forEach(([id,k])=>st(id,t(k)));   /* by id (was by position: broke when a button was added) */

  // Support
  st('supportTitle',t('sup_title'));st('supportSub',t('sup_sub'));
  const supCards=document.querySelectorAll('.sup-card');
  const supData=[['sup_card1','sup_card1s'],['sup_card2','sup_card2s'],['sup_card3','sup_card3s'],['sup_card4','sup_card4s'],['sup_card5','sup_card5s'],['sup_card6','sup_card6s']];
  supCards.forEach((c,i)=>{if(supData[i]){const h=c.querySelector('h3');const p=c.querySelector('p');if(h)h.textContent=t(supData[i][0]);if(p)p.textContent=t(supData[i][1]);}});

  // Auth
  st('loginTitle',t('login_title'));st('loginSub',t('login_sub'));
  sp('loginEmail','placeholder',t('login_email'));sp('loginPass','placeholder',t('login_pass'));
  st('loginBtn',t('login_btn'));st('forgotLbl',t('login_forgot'));applyResetTexts();try{window.acctApplyTexts&&window.acctApplyTexts();}catch(e){}st('profAcc',S.lang==='en'?'Settings':'الإعدادات');
  st('guestBtn',t('login_guest'));st('noAccText',t('login_no_acc'));st('goRegBtn',t('login_reg'));
  st('regTitle',t('reg_title'));st('regSub',t('reg_sub'));
  sp('regEmail','placeholder',t('login_email'));sp('regFirst','placeholder',t('reg_first'));sp('regLast','placeholder',t('reg_last'));
  sp('regPass','placeholder',t('reg_pass'));sp('regConf','placeholder',t('reg_conf'));
  st('regBtn',t('reg_btn'));st('haveAccText',t('reg_have_acc'));st('goLoginBtn',t('reg_login'));
  st('verifyTitle',t('verify_title'));st('verifySub',t('verify_sub'));
  st('resendBtn',t('verify_resend'));st('backLoginBtn',t('verify_login'));

  // Modals
  st('regionTitle',t('region_title'));st('regionSub',t('region_sub'));
  st('trackTitle',t('track_title'));sp('trkInput','placeholder',t('track_placeholder'));
  st('trackBtn',t('track_btn'));
  st('ratingTitle',t('rating_title'));sp('ratingCmt','placeholder',t('rating_comment'));
  st('ratingSubmitBtn',t('rating_submit'));st('ratingSkipBtn',t('rating_skip'));
  st('spinTitle',t('spin_title'));st('spinSub',t('spin_sub'));st('spinBtn',t('spin_btn'));
  st('botTitle',t('bot_title'));st('botSub',t('bot_sub'));
  sp('supportInp','placeholder',t('send_support_placeholder'));st('humanBtnText',t('human_btn'));
  st('reportTitle',t('report_title'));st('reportSub',t('report_sub'));st('rptUpHint',t('report_attach'));
  st('coTitle',t('co_title'));sp('cpnInp','placeholder',t('co_cpn'));st('applyBtn',t('co_apply'));
  st('ripLabel',t('co_rip'));st('handLabel',t('co_hand'));
  sp('senderN','placeholder',t('co_name'));st('uploadHint',t('co_upload'));
  st('handNote',t('co_hand_note'));sp('handPhone','placeholder',t('co_hand_phone'));
  sp('recvEmail','placeholder',t('co_email_recv'));sp('recvPhone','placeholder',t('co_phone'));
  st('emailLabel',t('co_email_tab'));st('phoneLabel',t('co_phone_tab'));
  const submitLbl=document.getElementById('submitLabel');if(submitLbl)submitLbl.textContent=t('co_submit');
  st('cartTitle2',t('cart_title'));st('cartEmptyText',t('cart_empty'));
  const cartTotalLbl=document.querySelector('#cartFoot .total-row span');if(cartTotalLbl)cartTotalLbl.textContent=t('cart_total')+':';
  const checkoutBtn=document.querySelector('#cartFoot button');if(checkoutBtn)checkoutBtn.textContent=t('cart_checkout');
  st('consentTitle',t('consent_title'));st('consentAcceptBtn',t('consent_accept'));
  const cRej=document.querySelector('.consent-reject');if(cRej)cRej.textContent=t('consent_reject');
  st('notifPanelTitle',t('notif_title'));st('faqTitle',t('faq_title'));

  // Header buttons
  const lbH=document.getElementById('loginBtnH');if(lbH)lbH.textContent=t('login_btn');
  const rbH=document.getElementById('regBtnH');if(rbH)rbH.textContent=lang==='en'?'Register':'إنشاء حساب';
  st('myAccText',t('my_acc'));st('myPtsText',t('my_pts'));
  st('trackOrderText',t('track_order'));st('logoutText',t('logout_txt'));

  // Search
  sp('searchInp','placeholder',lang==='en'?'Search cards, games, subscriptions...':'ابحث عن بطاقات، ألعاب، اشتراكات...');

  // Footer
  const fBrand=document.querySelector('.f-brand p');if(fBrand)fBrand.textContent=t('f_brand');
  const fCopy=document.querySelector('.f-bottom span');if(fCopy)fCopy.textContent=t('f_copy');

  // Profile region badge
  const rb=document.getElementById('profRegBadge');
  if(rb&&!S.region)rb.textContent=t('choose_region');

  // Claim streak btn
  const claimBtn=document.getElementById('claimBtn');
  if(claimBtn)claimBtn.textContent=lang==='en'?"Claim Today's Reward":'استلام مكافأة اليوم';

  // Re-render missions
  if(S.udata){renderMissions('missionsWrap');renderMissions('missionsWrapRw');}
}

/* ══════════════════════════════════════════
   SECURITY
══════════════════════════════════════════ */
const RL={
  _s:{},
  ok(k='_',max=3,ms=60000){
    const n=Date.now();
    if(!this._s[k])this._s[k]={c:0,t:0};
    const r=this._s[k];
    if(n>r.t){r.c=0;r.t=n+ms;}
    if(r.c>=max)return false;
    r.c++;return true;
  }
};

/* a value inside a quoted argument of an inline handler: JS-escaped, then HTML-escaped (san alone is not enough: the browser decodes attributes before running them) */
function jsq(v){return JSON.stringify(String(v==null?'':v)).slice(1,-1).replace(/&/g,'\\u0026').replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/'/g,'\\u0027').replace(/"/g,'&quot;');}
function san(input){
  if(input===null||input===undefined)return'';
  return String(input)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#x27;').replace(/\//g,'&#x2F;')
    .replace(/javascript:/gi,'').replace(/on\w+\s*=/gi,'').replace(/data:/gi,'')
    .trim().slice(0,2000);
}
function isValidEmail(e){return/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);}
function isValidUrl(u){if(!u)return true;try{const x=new URL(u);return['https:','http:'].includes(x.protocol);}catch{return false;}}

/* ══ STATE ══ */
let PRODS=[],CATS=[],DISC={active:false,value:0};
const S={
  lang:LS.getItem('gq_lang')||'ar',
  region:LS.getItem('gq_reg')||null,
  cur:LS.getItem('gq_cur')||'EUR',
  sym:LS.getItem('gq_sym')||'€',
  user:null,udata:null,
  cart:(()=>{const c=jparse(LS.getItem('gq_cart'),[]);return Array.isArray(c)?c:[];})(),
  selProd:null,cpn:null,stars:0,
  pay:'baridimob',recv:'email',
  spinning:false,ready:false,
  currentPage:'home',currentCat:'all',
  _total:0,
};
let spinRotation=0;
let currentSupportFlow='start';
const $=id=>document.getElementById(id);
const setText=(id,txt)=>{const el=$(id);if(el)el.textContent=txt;};

/* Clickjacking protection */
if(window.top!==window.self){try{window.top.location=window.self.location;}catch(e){document.body.style.display='none';}}

/* ══ DEFAULT DATA ══ */
const DEFAULT_CATS=[
  {id:'psstore',name:'بطاقات PlayStation',nameEn:'PlayStation Cards',icon:'<i class="fa-brands fa-playstation"></i>',bg:'linear-gradient(135deg,#6B0516,#E1062C)',enabled:true,order:1},
  {id:'psplus',name:'اشتراكات PS Plus',nameEn:'PS Plus Subscriptions',icon:'👑',bg:'linear-gradient(135deg,#b45309,#f59e0b)',enabled:true,order:2},
  {id:'games',name:'ألعاب رقمية',nameEn:'Digital Games',icon:'🎮',bg:'linear-gradient(135deg,#203a43,#2c5364)',enabled:true,order:3},
];
const DEFAULT_PRODS=[];
const BADGES=[
  {id:'newcomer',icon:'🌟',name:'مبتدئ',nameEn:'Newcomer',check:_=>true},
  {id:'firstbuy',icon:'🛒',name:'أول طلب',nameEn:'First Order',check:u=>(u.orders||0)>=1},
  {id:'fan5',icon:'🎮',name:'محب',nameEn:'Fan',check:u=>(u.orders||0)>=5},
  {id:'fan10',icon:'🎯',name:'متمرس',nameEn:'Pro',check:u=>(u.orders||0)>=10},
  {id:'reviewer',icon:'⭐',name:'المُقيِّم',nameEn:'Reviewer',check:u=>(u.ratings||0)>=1},
  {id:'spinner',icon:'🎰',name:'المحظوظ',nameEn:'Lucky',check:u=>(u.spins||0)>=1},
  {id:'pts500',icon:'💎',name:'100 نقطة',nameEn:'100 Points',check:u=>(u.points||0)>=100},
  {id:'streak7',icon:'🔥',name:'أسبوع',nameEn:'Week',check:u=>(u.streak||0)>=7},
  {id:'sharer',icon:'📣',name:'المُروِّج',nameEn:'Promoter',check:u=>(u.shares||0)>=1},
  {id:'referrer',icon:'👥',name:'الداعية',nameEn:'Referrer',check:u=>(u.referrals||0)>=1},
];
const FAQ_DATA=[
  {q:'كيف أشتري بطاقة PlayStation؟',qEn:'How do I buy a PlayStation card?',a:'اختر البطاقة من المتجر، اضغط "اطلب الآن"، ادفع عبر BaridiMob أو يد بيد، وارفع وصل الدفع. سيصلك الكود خلال 5-60 دقيقة.',aEn:'Choose the card from the store, click "Order Now", pay via BaridiMob or hand delivery, and upload the receipt. The code will arrive within 5-60 minutes.'},
  {q:'ما هو الريجن وكيف أختاره؟',qEn:'What is a region and how do I choose it?',a:'الريجن هو منطقة حساب PlayStation. EU للأوروبية، US للأمريكية.',aEn:'The region is your PlayStation account region. EU for European, US for American.'},
  {q:'كم يستغرق استلام الكود؟',qEn:'How long does it take to receive the code?',a:'عادةً 5 إلى 60 دقيقة من التحقق من الدفع.',aEn:'Usually 5 to 60 minutes after payment verification.'},
  {q:'ما مدة صلاحية الكود؟',qEn:'How long is a code valid?',a:'من يوم استلامه حتى آخر يوم من نفس الشهر. فإن وصلك الكود في نوفمبر فهو صالح حتى 30 نوفمبر، ومن غرة ديسمبر لا يعمل.',aEn:'From the day you receive it until the last day of that same month. A code received in November is valid until 30 November and stops working from 1 December.'},
  {q:'هل يمكن الاسترجاع بعد إرسال الكود؟',qEn:'Can I get a refund after the code is sent?',a:'لا. بمجرد إرسال الكود لا يتم الاسترجاع.',aEn:'No. Once the code is sent, no refunds are possible.'},
  {q:'ما هي طرق الدفع المتاحة؟',qEn:'What payment methods are available?',a:'BaridiMob: RIP 00799999004390466974\nيد بيد: في ولاية تلمسان فقط.',aEn:'BaridiMob: RIP 00799999004390466974\nHand delivery: In Tlemcen only.'},
  {q:'كيف أتواصل معكم؟',qEn:'How can I contact you?',a:'واتساب: 213658996502\nإيميل: glitchq1q@gmail.com',aEn:'WhatsApp: 213658996502\nEmail: glitchq1q@gmail.com'},
  {q:'كيف تعمل نقاط المكافآت؟',qEn:'How do reward points work?',a:'كل طلب يُسلَّم يمنحك نقاطاً من أرباحنا عليه، وتستبدلها ببطاقات مجانية من قسم المكافآت. النقاط المجانية (الدخول اليومي والعجلة) تُفتح تدريجياً مع مشترياتك. دعوة صديق تمنحك نقاطاً عندما يُتمّ أول عملية شراء.',aEn:'Every delivered order earns you points from what we make on it, and you redeem them for free cards in the Rewards section. Free points (daily check-in, wheel) unlock gradually with your purchases. Inviting a friend earns you points when he completes his first purchase.'},
  {q:'ماذا أفعل إذا كان الكود خاطئاً؟',qEn:'What if the code is wrong?',a:'تواصل معنا فوراً عبر واتساب مع رقم طلبك.',aEn:'Contact us immediately via WhatsApp with your order number.'},
];
/* Reward catalogue and balances come from the Worker (/account/rewards): profit-funded, see worker.js */
let RW=null,RW_T=0;
const SPIN_SEGMENTS=[
  {pts:1,label:'نقطة',labelEn:'1 Point',color:'#1B2A5C',prob:35},
  {pts:2,label:'نقطتان',labelEn:'2 Points',color:'#141E30',prob:30},
  {pts:3,label:'3 نقاط',labelEn:'3 Points',color:'#2146B5',prob:20},
  {pts:5,label:'5 نقاط',labelEn:'5 Points',color:'#4A3410',prob:10},
  {pts:8,label:'8 نقاط',labelEn:'8 Points',color:'#141E30',prob:4},
  {pts:15,label:'15 نقطة',labelEn:'15 Points',color:'#5C1F2A',prob:1},
  {pts:0,label:'حاول غداً',labelEn:'Try Tomorrow',color:'#161A22',prob:0},
];
const SUPPORT_FLOWS={
  start:{msg:'مرحباً! أنا بوت الدعم الفني لـ Glitch Q\nكيف يمكنني مساعدتك اليوم؟',msgEn:"Hello! I'm the Glitch Q support bot\nHow can I help you today?",opts:['لم أستلم كودي','كودي خاطئ','مشكلة في الدفع','سؤال عن الريجن','مشكلة في الحساب','أخرى'],optsEn:['Did not receive my code','Wrong code','Payment issue','Region question','Account issue','Other']},
  'لم أستلم كودي':{msg:'عذراً! الكود يصل عادةً خلال 5-60 دقيقة.\nهل مرّت أكثر من ساعة على تأكيد الدفع؟',msgEn:'Sorry! The code usually arrives within 5-60 minutes.\nHas more than an hour passed since payment confirmation?',opts:['نعم مرّت أكثر من ساعة','لا سأنتظر قليلاً','كيف أعرف حالة طلبي؟'],optsEn:['Yes, more than an hour','No, I will wait','How do I check my order?']},
  'نعم مرّت أكثر من ساعة':{msg:'يجب التواصل مع الدعم البشري مباشرة.',msgEn:'You need to contact human support directly.',opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support'],human:true},
  'كيف أعرف حالة طلبي؟':{msg:'من قسم الدعم > تتبع الطلبات، أدخل رقم الطلب.',msgEn:'From Support > Track Orders, enter your order number.',opts:['شكراً فهمت','لا يزال عندي مشكلة'],optsEn:['Thanks','Still have an issue']},
  'لا يزال عندي مشكلة':{msg:'دعني أوصّلك بفريق الدعم.',msgEn:'Let me connect you with support.',opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support'],human:true},
  'لا سأنتظر قليلاً':{msg:'جيد! إذا لم يصل خلال ساعة تواصل معنا.',msgEn:"Okay! If it doesn't arrive within an hour, contact us.",opts:['حسناً','أريد التواصل البشري'],optsEn:['Okay','I want human support']},
  'كودي خاطئ':{msg:'تأكد من:\n1️⃣ لا مسافة زيادة\n2️⃣ الريجن صحيح\n3️⃣ لم يُستخدم مسبقاً',msgEn:"Make sure:\n1️⃣ No extra spaces\n2️⃣ Correct region\n3️⃣ Code not used before",opts:['نعم لا يعمل','سأعيد المحاولة'],optsEn:['Yes, still not working','I will try again']},
  'نعم لا يعمل':{msg:'سنحل هذا فوراً.',msgEn:"We'll fix this immediately.",opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support'],human:true},
  'سأعيد المحاولة':{msg:'حسناً! إذا استمرت المشكلة تواصل معنا.',msgEn:'Okay! If it persists, contact us.',opts:['شكراً فهمت'],optsEn:['Thanks']},
  'مشكلة في الدفع':{msg:'أي نوع من المشكلة؟',msgEn:'What type of issue?',opts:['لا أعرف كيف أدفع','دفعت مرتين','مشكلة أخرى'],optsEn:["Don't know how to pay","Paid twice","Other issue"]},
  'لا أعرف كيف أدفع':{msg:'BaridiMob:\n1️⃣ افتح التطبيق\n2️⃣ تحويل فوري\n3️⃣ RIP: 00799999004390466974\n4️⃣ ارفع الوصل',msgEn:'BaridiMob:\n1️⃣ Open app\n2️⃣ Instant Transfer\n3️⃣ RIP: 00799999004390466974\n4️⃣ Upload receipt',opts:['نعم شكراً!'],optsEn:['Yes, thanks!']},
  'دفعت مرتين':{msg:'تحتاج مراجعة عاجلة. تواصل فوراً.',msgEn:'Needs urgent review. Contact us immediately.',opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support'],human:true},
  'مشكلة أخرى':{msg:'اكتب مشكلتك.',msgEn:'Write your issue.',opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support']},
  'سؤال عن الريجن':{msg:'🇪🇺 EU = أوروبية\n🇺🇸 US = أمريكية\n🇸🇦 SA = سعودية\n🇦🇪 AE = إماراتية',msgEn:'🇪🇺 EU = European\n🇺🇸 US = American\n🇸🇦 SA = Saudi\n🇦🇪 AE = UAE',opts:['نعم شكراً!','كيف أعرف ريجني؟'],optsEn:['Yes, thanks!','How do I know my region?']},
  'كيف أعرف ريجني؟':{msg:'PlayStation Settings > Account > Account Information',msgEn:'PlayStation Settings > Account > Account Information',opts:['شكراً فهمت'],optsEn:['Thanks']},
  'مشكلة في الحساب':{msg:'ما المشكلة؟',msgEn:'What is the issue?',opts:['نسيت كلمة المرور','لم يصل إيميل التفعيل','لا أستطيع الدخول'],optsEn:['Forgot password','No verification email',"Can't sign in"]},
  'نسيت كلمة المرور':{msg:'اضغط "هل تواجه مشكلة في تسجيل الدخول؟" أسفل زر الدخول لاستعادة حسابك.',msgEn:"Tap 'Having trouble signing in?' under the Sign In button to recover your account.",opts:['شكراً فهمت'],optsEn:['Thanks']},
  'لم يصل إيميل التفعيل':{msg:'تحقق من مجلد Spam.',msgEn:'Check your Spam folder.',opts:['التواصل مع الدعم البشري','شكراً فهمت'],optsEn:['Contact human support','Thanks']},
  'لا أستطيع الدخول':{msg:'جرّب مسح ذاكرة التخزين المؤقت.',msgEn:'Try clearing your browser cache.',opts:['التواصل مع الدعم البشري','شكراً فهمت'],optsEn:['Contact human support','Thanks']},
  'أخرى':{msg:'اكتب مشكلتك في مربع النص.',msgEn:'Write your issue in the text box.',opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support']},
  'التواصل مع الدعم البشري':{msg:'سيتم تحويلك الآن للدعم البشري',msgEn:'You will now be redirected to human support',opts:[],optsEn:[],human:true},
  'Contact human support':{msg:'سيتم تحويلك الآن',msgEn:'Redirecting to human support',opts:[],optsEn:[],human:true},
  'شكراً فهمت':{msg:'على الرحب! أنا هنا إذا احتجت مساعدة',msgEn:"You're welcome! I'm here if you need more help",opts:['عودة للبداية'],optsEn:['Back to start']},
  'نعم شكراً!':{msg:'يسعدني أنني ساعدتك!',msgEn:'Glad I could help!',opts:['عودة للبداية'],optsEn:['Back to start']},
  'حسناً':{msg:'بالتوفيق!',msgEn:'Good luck!',opts:['عودة للبداية'],optsEn:['Back to start']},
  'عودة للبداية':{msg:'كيف يمكنني مساعدتك؟',msgEn:'How can I help you?',opts:['لم أستلم كودي','كودي خاطئ','مشكلة في الدفع','سؤال عن الريجن','مشكلة في الحساب','أخرى'],optsEn:['Did not receive my code','Wrong code','Payment issue','Region question','Account issue','Other']},
  'Yes, thanks!':{msg:'يسعدني أنني ساعدتك!',msgEn:'Glad I could help!',opts:['عودة للبداية'],optsEn:['Back to start']},
  'Thanks':{msg:'على الرحب والسعة!',msgEn:"You're welcome!",opts:['عودة للبداية'],optsEn:['Back to start']},
  'Back to start':{msg:'كيف يمكنني مساعدتك؟',msgEn:'How can I help you?',opts:['لم أستلم كودي','كودي خاطئ','مشكلة في الدفع','سؤال عن الريجن','مشكلة في الحساب','أخرى'],optsEn:['Did not receive my code','Wrong code','Payment issue','Region question','Account issue','Other']},
  'Yes, more than an hour':{msg:'يجب التواصل مع الدعم البشري.',msgEn:'You need to contact human support.',opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support'],human:true},
  'No, I will wait':{msg:'جيد! إذا لم يصل خلال ساعة تواصل معنا.',msgEn:"Okay! If it doesn't arrive, contact us.",opts:['حسناً'],optsEn:['Okay']},
  'Still have an issue':{msg:'دعني أوصّلك بفريق الدعم.',msgEn:'Let me connect you with support.',opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support'],human:true},
  'Yes, still not working':{msg:'سنحل هذا فوراً.',msgEn:"We'll fix this immediately.",opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support'],human:true},
  'I will try again':{msg:'حسناً! إذا استمرت المشكلة تواصل معنا.',msgEn:'Okay! If it persists, contact us.',opts:['شكراً فهمت'],optsEn:['Thanks']},
  'How do I check my order?':{msg:'من قسم الدعم > تتبع الطلبات.',msgEn:'From Support > Track Orders.',opts:['شكراً فهمت'],optsEn:['Thanks']},
  'I want human support':{msg:'سيتم تحويلك للدعم البشري.',msgEn:'Redirecting to human support.',opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support'],human:true},
  'How do I know my region?':{msg:'PlayStation Settings > Account > Account Information',msgEn:'PlayStation Settings > Account > Account Information',opts:['شكراً فهمت'],optsEn:['Thanks']},
  'Forgot password':{msg:"اضغط 'هل تواجه مشكلة في تسجيل الدخول؟' أسفل زر الدخول لاستعادة حسابك.",msgEn:"Tap 'Having trouble signing in?' under the Sign In button to recover your account.",opts:['شكراً فهمت'],optsEn:['Thanks']},
  'No verification email':{msg:'تحقق من مجلد Spam.',msgEn:'Check your Spam folder.',opts:['التواصل مع الدعم البشري','شكراً فهمت'],optsEn:['Contact human support','Thanks']},
  "Can't sign in":{msg:'جرّب مسح ذاكرة التخزين المؤقت.',msgEn:'Try clearing your browser cache.',opts:['التواصل مع الدعم البشري','شكراً فهمت'],optsEn:['Contact human support','Thanks']},
  "Don't know how to pay":{msg:'BaridiMob:\n1️⃣ افتح التطبيق\n2️⃣ RIP: 00799999004390466974\n3️⃣ ارفع الوصل',msgEn:'BaridiMob:\n1️⃣ Open app\n2️⃣ RIP: 00799999004390466974\n3️⃣ Upload receipt',opts:['نعم شكراً!'],optsEn:['Yes, thanks!']},
  'Paid twice':{msg:'تواصل فوراً مع الدعم.',msgEn:'Contact support immediately.',opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support'],human:true},
  'Other issue':{msg:'اكتب مشكلتك.',msgEn:'Write your issue.',opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support']},
  'Other':{msg:'اكتب مشكلتك في مربع النص.',msgEn:'Write your issue.',opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support']},
  'Region question':{msg:'🇪🇺 EU · 🇺🇸 US · 🇸🇦 SA · 🇦🇪 AE',msgEn:'🇪🇺 EU · 🇺🇸 US · 🇸🇦 SA · 🇦🇪 AE',opts:['نعم شكراً!','كيف أعرف ريجني؟'],optsEn:['Yes, thanks!','How do I know my region?']},
  'Account issue':{msg:'ما المشكلة في حسابك؟',msgEn:'What is the issue with your account?',opts:['نسيت كلمة المرور','لم يصل إيميل التفعيل'],optsEn:['Forgot password','No verification email']},
  'Wrong code':{msg:'تأكد من الريجن الصحيح والكود لم يُستخدم.',msgEn:'Make sure the region is correct and code not used.',opts:['نعم لا يعمل'],optsEn:['Yes, still not working']},
  'Payment issue':{msg:'أي نوع من المشكلة؟',msgEn:'What type of issue?',opts:['لا أعرف كيف أدفع','دفعت مرتين'],optsEn:["Don't know how to pay","Paid twice"]},
  'Did not receive my code':{msg:'الكود يصل عادةً خلال 5-60 دقيقة.',msgEn:'The code usually arrives within 5-60 minutes.',opts:['نعم مرّت أكثر من ساعة','لا سأنتظر قليلاً'],optsEn:['Yes, more than an hour','No, I will wait']},
};

/* ══ FEEDBACK ══
   No more banners at the top of the page. Feedback now lives where the action happened:
   • a modal is open  → inline alert at the top of that modal (next to the form)
   • no modal is open → small bottom snackbar (errors, warnings and reward events only)
   Trivial confirmations (language, consent, region, welcome…) no longer notify at all. */
function topModalBox(){
  const open=[...document.querySelectorAll('.modal-ov:not(.hidden)')];
  const ov=open[open.length-1];
  return ov?ov.querySelector('.modal-box'):null;
}
function clearInlineAlerts(root){(root||document).querySelectorAll('.inl-alert').forEach(n=>n.remove());}
function toast(msg,type='tinfo'){
  msg=String(msg==null?'':msg).slice(0,160);if(!msg)return;
  const box=topModalBox();
  if(box){
    clearInlineAlerts(box);
    const el=document.createElement('div');
    el.className=`inl-alert ${type}`;el.setAttribute('role',type==='terr'?'alert':'status');
    const dot=document.createElement('span');dot.className='ia-dot';
    const txt=document.createElement('span');txt.className='ia-txt';txt.textContent=msg;
    el.appendChild(dot);el.appendChild(txt);
    const anchor=box.querySelector(':scope > .modal-x');
    box.insertBefore(el,anchor?anchor.nextSibling:box.firstChild);
    try{box.scrollTop=0;}catch(e){}
    if(type!=='terr')setTimeout(()=>{if(el.isConnected){el.classList.add('out');setTimeout(()=>el.remove(),300);}},6000);
    return;
  }
  /* page level: silent for plain info, snackbar for everything that matters */
  if(type==='tinfo')return;
  const c=$('toastWrap');if(!c)return;
  [...c.children].forEach(n=>{if(n.dataset.m===msg)n.remove();});
  while(c.children.length>=2)c.firstChild.remove();
  const el=document.createElement('div');el.className=`toast ${type}`;el.dataset.m=msg;
  el.setAttribute('role',type==='terr'?'alert':'status');
  const dot=document.createElement('span');dot.className='ia-dot';
  const txt=document.createElement('span');txt.textContent=msg;txt.style.flex='1';
  el.appendChild(dot);el.appendChild(txt);
  let gone=false;
  function dismiss(){if(gone)return;gone=true;el.classList.remove('show');setTimeout(()=>el.remove(),250);}
  el.addEventListener('click',dismiss);
  c.appendChild(el);
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('show')));
  setTimeout(dismiss,type==='terr'?5000:3200);
}

/* ══ MODALS ══ */
const VALID_MODALS=['authModal','regionModal','trackModal','checkoutModal','ratingModal','spinModal','supportModal','reportModal','termsModal','privacyModal','faqModal','aboutModal','prodModal','cartModal','orderDoneModal','accountModal'];
function openM(id){
  if(!VALID_MODALS.includes(id))return;
  clearInlineAlerts($(id));
  if(id==='accountModal'&&!(window.acctOpen&&window.acctOpen()))return;   /* needs a signed-in customer */
  if(id==='regionModal')renderRegionModal();
  $(id)?.classList.remove('hidden');
  if(id==='faqModal')renderFAQ();
  if(id==='supportModal')initSupportBot();
  if(id==='cartModal')renderCart();
  if(id==='spinModal'){buildSpinWheel();initSpinTimer();}
  if(navigator.vibrate)navigator.vibrate([8]);
}
function closeM(id){clearInlineAlerts($(id));$(id)?.classList.add('hidden');}
function showPane(id){clearInlineAlerts($('authModal'));['loginPane','regPane','verifyPane','resetPane'].forEach(p=>$(p)?.classList.add('hidden'));$(id)?.classList.remove('hidden');}
window.openM=openM;window.closeM=closeM;window.showPane=showPane;
document.addEventListener('click',e=>{if(e.target.classList.contains('modal-ov')&&!e.target.classList.contains('hidden'))e.target.classList.add('hidden');});

/* ══ CONTACT ══ */
function openWhatsApp(msg){window.open(`https://wa.me/${WA_N}?text=${encodeURIComponent(String(msg||'Hello Glitch Q 🎮').slice(0,2000))}`,'_blank','noopener,noreferrer');}
function openEmail(sub,body){window.location.href=`mailto:${EMAIL_ADDR}?subject=${encodeURIComponent((sub||'Contact').slice(0,200))}&body=${encodeURIComponent((body||'').slice(0,2000))}`;}
window.openWhatsApp=openWhatsApp;window.openEmail=openEmail;

/* ══ PAGES ══ */
function goPage(name){
  if(!['home','shop','rewards','profile','support'].includes(name))return;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.nav-ul li').forEach(l=>l.classList.remove('on'));
  $(`pg-${name}`)?.classList.add('on');S.currentPage=name;
  window.scrollTo({top:0,behavior:'smooth'});
  document.querySelectorAll('#tabbar button').forEach(b=>b.classList.toggle('on',b.dataset.pg===name));
  const map={home:0,shop:1,rewards:2,support:3};
  const idx=map[name];if(idx!==undefined)document.querySelectorAll('.nav-ul li')[idx]?.classList.add('on');
  if(name==='shop'){renderCatFilterBar();renderShopProds();}
  if(name==='rewards')renderRewardsPage();
  if(name==='profile')renderProfilePage();
}
window.goPage=goPage;

/* ══ LANG ══ */
function toggleLang(){
  S.lang=S.lang==='ar'?'en':'ar';
  LS.setItem('gq_lang',S.lang);
  applyTranslations();
  renderHome();
  if(S.currentPage==='shop'){renderCatFilterBar();renderShopProds();}
  if(S.currentPage==='rewards')renderRewardsPage();
  if(S.currentPage==='profile')renderProfilePage();
}
window.toggleLang=toggleLang;
/* The account menu is pinned to the viewport (not to its button) and clamped inside it, so on a phone — where the button sits
   at the screen edge — it can never be cut off or split by the edge. */
function placeUDrop(){
  const d=$('uDrop'),b=$('uMenuBtn');if(!d||!b||d.classList.contains('hidden'))return;
  const vw=document.documentElement.clientWidth,r=b.getBoundingClientRect(),m=8;
  d.style.position='fixed';d.style.maxWidth=(vw-m*2)+'px';
  const w=d.offsetWidth,rtl=document.documentElement.dir!=='ltr';
  let left=rtl?r.right-w:r.left;                       // end-aligned with the button, like a normal dropdown
  left=Math.max(m,Math.min(left,vw-w-m));              // …then kept fully on screen
  d.style.left=left+'px';d.style.right='auto';d.style.top=(r.bottom+8)+'px';
}
function toggleUMenu(){const d=$('uDrop');if(!d)return;d.classList.toggle('hidden');placeUDrop();}
window.addEventListener('resize',placeUDrop);window.addEventListener('scroll',placeUDrop,{passive:true});
window.toggleUMenu=toggleUMenu;
document.addEventListener('click',e=>{if(!e.target.closest('#uMenuWrap'))$('uDrop')?.classList.add('hidden');});

/* ══ CONSENT ══ */
function initConsent(){
  if(LS.getItem('gq_consent'))return;
  $('consentBanner')?.classList.remove('hidden');
  const chkT=$('chkTerms'),chkP=$('chkPrivacy'),btn=$('consentAcceptBtn');
  function upd(){if(btn)btn.disabled=!(chkT?.checked&&chkP?.checked);}
  chkT?.addEventListener('change',upd);chkP?.addEventListener('change',upd);
}
window.acceptConsent=function(){
  LS.setItem('gq_consent','1');
  $('consentBanner')?.classList.add('hidden');
  maybePromptRegion();   /* region comes right after consent, never before */
};
/* ══ REGIONS (controlled from the admin panel: settings/regions) ══
   enabled=false  → the picker is hidden and everyone is on defaultRegion (today: EU only)
   available[x]   → false greys the region out ("unavailable") so it cannot be chosen */
const REGIONS={
  eu:{c:'EUR',s:'€',ar:'أوروبي',en:'European',f:'🇪🇺'},
  us:{c:'USD',s:'$',ar:'أمريكي',en:'American',f:'🇺🇸'},
  sa:{c:'SAR',s:'ر.س',ar:'سعودي',en:'Saudi',f:'🇸🇦'},
  ae:{c:'AED',s:'د.إ',ar:'إماراتي',en:'Emirati',f:'🇦🇪'}
};
function normRegCfg(x){
  const o={enabled:false,defaultRegion:'eu',available:{eu:true,us:false,sa:false,ae:false}};
  if(x&&typeof x==='object'){
    o.enabled=x.enabled===true;
    if(x.available&&typeof x.available==='object')Object.keys(REGIONS).forEach(k=>{o.available[k]=x.available[k]===true;});
    if(typeof x.defaultRegion==='string'&&REGIONS[x.defaultRegion])o.defaultRegion=x.defaultRegion;
  }
  if(!o.available[o.defaultRegion]){
    const first=Object.keys(REGIONS).find(k=>o.available[k]);
    if(first)o.defaultRegion=first;else{o.defaultRegion='eu';o.available.eu=true;}
  }
  return o;
}
function readCachedRegCfg(){try{return normRegCfg(JSON.parse(LS.getItem('gq_regcfg')||'null'));}catch(e){return normRegCfg(null);}}
let REG_CFG=readCachedRegCfg();
function setRegion(r,persist,auto){
  const m=REGIONS[r];if(!m)return;
  S.region=r;S.cur=m.c;S.sym=m.s;S.regAuto=!!auto;
  /* auto = default applied while the picker is off: kept in memory only, so it is never mistaken for the customer's own choice */
  if(auto)LS.removeItem('gq_reg');else LS.setItem('gq_reg',r);
  LS.setItem('gq_cur',m.c);LS.setItem('gq_sym',m.s);
  if(persist&&S.user)db.collection('users').doc(S.user.uid).update({region:r,currency:m.c,symbol:m.s}).catch(()=>{});
}
function applyRegionConfig(cfg){
  REG_CFG=cfg;
  $('profRegionBtn')?.classList.toggle('hidden',!cfg.enabled);
  $('profRegBadge')?.classList.toggle('hidden',!cfg.enabled);
  if(!cfg.enabled){
    if(S.region!==cfg.defaultRegion||!S.regAuto)setRegion(cfg.defaultRegion,false,true);   /* picker off → default region for everyone */
  }else if(S.regAuto){
    const ur=S.udata&&S.udata.region;                                             /* picker just turned on and this customer never chose here: */
    if(ur&&cfg.available[ur])setRegion(ur,false,false);                           /* use the region saved on their account, */
    else{S.region=null;S.regAuto=false;}                                          /* otherwise ask */
  }else if(S.region&&!cfg.available[S.region]){
    S.region=null;LS.removeItem('gq_reg');                              /* chosen region became unavailable → ask again */
  }
  maybePromptRegion();
}
function maybePromptRegion(){
  if(!LS.getItem('gq_consent'))return;                                  /* consent always comes first */
  if(!REG_CFG.enabled){if(!S.region)setRegion(REG_CFG.defaultRegion,false,true);return;}
  if(!S.region)openM('regionModal');
}
function renderRegionModal(){
  const en=S.lang==='en';
  document.querySelectorAll('#regionModal .reg-btn').forEach(b=>{
    const k=b.dataset.r,ok=!!REG_CFG.available[k];
    b.disabled=!ok;b.classList.toggle('off',!ok);b.classList.toggle('sel',S.region===k);b.setAttribute('aria-disabled',String(!ok));
    let tag=b.querySelector('.rsoon');
    if(!ok){if(!tag){tag=document.createElement('span');tag.className='rsoon';b.appendChild(tag);}tag.textContent=en?'Unavailable for now':'غير متوفر حالياً';}
    else if(tag)tag.remove();
  });
}
window.maybePromptRegion=maybePromptRegion;

window.rejectConsent=function(){
  const msg=S.lang==='en'?'If you decline, you cannot use the site. Are you sure?':'إذا رفضت لن تتمكن من استخدام الموقع. هل أنت متأكد؟';
  if(confirm(msg)){
    const notice=S.lang==='en'?'Cannot use site without agreeing.':'لا يمكن استخدام الموقع بدون الموافقة.';
    document.body.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#050507;color:#9AA3B5;font-family:'IBM Plex Sans Arabic',sans-serif;text-align:center"><div><p>${notice}</p><button onclick="location.reload()" style="margin-top:20px;padding:10px 24px;background:#D4062A;color:#fff;border:none;border-radius:2px;cursor:pointer;font-family:'IBM Plex Sans Arabic',sans-serif">إعادة</button></div></div>`;
  }
};

/* ══ LOADER ══ */
function runLoader(){
  const bar=$('ldBar'),txt=$('ldTxt');let p=0;
  const iv=setInterval(()=>{p+=Math.random()*25+15;if(!S.ready&&p>90)p=90;if(p>100)p=100;   /* waits at 90% until the store has rendered */
    if(bar)bar.style.width=p+'%';
    if(txt)txt.textContent=p<25?t('loading_txt'):p<55?t('loading_init'):p<85?t('loading_data'):t('loading_done');
    if(p>=100){clearInterval(iv);setTimeout(()=>$('loader')?.classList.add('gone'),250);}
  },90);
}

/* ══ CONFETTI ══ */
function fireConfetti(n=60){
  const COLS=['#F5223F','#F4B63E','#35E0F2','#28C88A','#FF4D5E'];
  if(!document.getElementById('cfKf')){const s=document.createElement('style');s.id='cfKf';s.textContent='@keyframes cfFall{to{transform:translateY(100vh) rotateZ(720deg);opacity:0}}';document.head.appendChild(s);}
  for(let i=0;i<Math.min(n,80);i++){setTimeout(()=>{const el=document.createElement('div');el.style.cssText=`position:fixed;width:8px;height:8px;border-radius:2px;pointer-events:none;z-index:99990;left:${Math.random()*100}vw;top:-20px;background:${COLS[Math.floor(Math.random()*COLS.length)]};animation:cfFall ${1.5+Math.random()*1.5}s ease-in ${Math.random()*.5}s forwards`;document.body.appendChild(el);setTimeout(()=>el.remove(),3500);},i*18);}
}
/* ══════════════════════════════════════════
   SETTINGS & FIREBASE
══════════════════════════════════════════ */
/* The last good copy of the public catalogue is kept on the device: the next visit paints instantly from it
   while the fresh copy is fetched in the background (display only — the Worker always prices orders itself). */
const SETTINGS_CACHE_KEY='gq_settings_v1';
function readSettingsCache(){try{const c=JSON.parse(LS.getItem(SETTINGS_CACHE_KEY)||'null');if(c&&Array.isArray(c.cats)&&Array.isArray(c.prods)&&c.prods.length&&Date.now()-c.ts<7*864e5)return c;}catch(e){}return null;}
function writeSettingsCache(){try{LS.setItem(SETTINGS_CACHE_KEY,JSON.stringify({ts:Date.now(),cats:CATS,prods:PRODS,disc:DISC}));}catch(e){}}
async function loadSettings(){
  /* all documents are fetched in parallel (was one-by-one: up to ~6s on slow networks) */
  const get=n=>db.collection('settings').doc(n).get().catch(()=>null);
  const [dCats,dProds,dDisc,dMaint,dReg]=await Promise.all(['categories','products','discount','maintenance','regions'].map(get));   /* the coupon list is never downloaded: codes are checked by the server */
  try{CATS=dCats&&dCats.exists&&Array.isArray(dCats.data().categories)?dCats.data().categories:DEFAULT_CATS;}catch(e){CATS=DEFAULT_CATS;}
  let realCatalog=false;
  try{if(dProds&&dProds.exists&&Array.isArray(dProds.data().products)&&dProds.data().products.length){PRODS=dProds.data().products;realCatalog=true;}else PRODS=DEFAULT_PRODS;}catch(e){PRODS=DEFAULT_PRODS;}
  try{const d=dDisc;if(d&&d.exists){const x=d.data(),td=new Date().toISOString().split('T')[0];DISC=(x.active&&(!x.expiry||x.expiry>=td)&&x.value>0&&x.value<=100)?{active:true,value:x.value}:{active:false,value:0};}}catch(e){}
  try{if(dReg){const cfg=normRegCfg(dReg.exists?dReg.data():null);try{LS.setItem('gq_regcfg',JSON.stringify(cfg));}catch(e){}applyRegionConfig(cfg);}}catch(e){}
  try{const d=dMaint;if(d&&d.exists&&d.data().active){document.body.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#050507;color:#9AA3B5;font-family:'IBM Plex Sans Arabic',sans-serif;text-align:center"><div><h2 style="color:#F4F6FB;font-family:'Reem Kufi',sans-serif;letter-spacing:.14em;margin-bottom:12px">GLITCH Q</h2><p style="font-size:16px">${t('t_maintenance')}</p></div></div>`;return false;}}catch(e){}
  if(realCatalog)writeSettingsCache();
  return true;
}

function calcPrice(prod){
  const orig=prod.priceDZD||(prod.val*(RATES[prod.cur||'EUR']||220));
  return DISC.active&&DISC.value>0?Math.floor(orig*(1-DISC.value/100)):orig;
}
function getCatName(catId){const cat=CATS.find(c=>c.id===catId);if(!cat)return catId||'';return S.lang==='en'?(cat.nameEn||cat.name||catId):(cat.name||catId);}
function getValText(prod){if(prod.cur==='month')return`${prod.val} ${t('month')}`;if(prod.cur==='copy')return t('copy');return`${prod.val}${prod.sym||''}`;}

/* ══════════════════════════════════════════
   HOME
══════════════════════════════════════════ */
function renderHome(){
  renderHeroFan();renderHomeProds();renderHomeCats();renderLeaderboard();
  renderMissions('missionsWrap');initOffer();initMissionTimer();
}

function renderHomeProds(){
  const g=$('homeProdsGrid');if(!g)return;g.innerHTML='';
  const enabled=CATS.filter(c=>c.enabled).map(c=>c.id);
  PRODS.filter(p=>enabled.includes(p.cat)).slice(0,8).forEach(prod=>g.appendChild(buildProdCard(prod)));
}

/* A category's pictogram: the known ones get a brand glyph; anything an admin added keeps the icon they chose
   (an <i> Font Awesome tag is allowed, a plain emoji is shown as text). */
function catGlyph(cat){
  if(cat.id==='psstore')return '<i class="fa-brands fa-playstation"></i>';
  if(cat.id==='psplus')return '<span class="gf-plus">+</span>';
  if(cat.id==='games')return '<i class="fa-solid fa-gamepad"></i>';
  const ic=String(cat.icon||'');
  return /^<i class="[a-z0-9 -]+"><\/i>$/i.test(ic)?ic:(san(ic)||'<i class="fa-solid fa-layer-group"></i>');
}
function renderHomeCats(){
  const g=$('homeCatsGrid');if(!g)return;g.innerHTML='';
  CATS.filter(c=>c.enabled).sort((a,b)=>(a.order||0)-(b.order||0)).forEach(cat=>{
    const el=document.createElement('button');el.className='cat-c';el.dataset.cat=String(cat.id||'');
    const cnt=PRODS.filter(p=>p.cat===cat.id&&p.stock!==false).length;
    const name=S.lang==='en'?(cat.nameEn||cat.name):(cat.name||cat.id);
    const prod_word=S.lang==='en'?'products':'منتج';
    el.innerHTML=`<div class="cat-ico">${catGlyph(cat)}</div><span>${san(name)}</span><small>${cnt} ${prod_word}</small>`;
    el.addEventListener('click',()=>{goPage('shop');filterByCat(cat.id);});
    g.appendChild(el);
  });
}

/* ══════════════════════════════════════════
   PRODUCT CARD
══════════════════════════════════════════ */
/* The face of a card: a gift-card layout (value, category, brand glyph, one glitch band) so products read
   as the thing they are even when the admin has not uploaded a picture. */
function prodTone(prod){return prod.img==='ps'?'t-ps':prod.img==='plus'?'t-plus':'t-game';}
function prodGlyph(prod){return prod.img==='ps'?'<i class="fa-brands fa-playstation"></i>':prod.img==='plus'?'<span class="gf-plus">+</span>':'<i class="fa-solid fa-gamepad"></i>';}
function prodHasImg(prod){return !!(prod.imgUrl&&isValidUrl(prod.imgUrl));}
function prodFaceHTML(prod){
  if(prodHasImg(prod))return `<img src="${san(prod.imgUrl)}" alt="${san(prod.name)}" loading="lazy">`;
  const v=String(getValText(prod)),m=v.match(/^\s*([\d.,]+)\s*(.*)$/);
  const val=m?`<span class="n">${san(m[1])}</span>${m[2]?`<span class="u">${san(m[2])}</span>`:''}`:`<span class="n txt">${san(v)}</span>`;
  return `<span class="gf-top">${san(getCatName(prod.cat))}</span><b class="gf-val">${val}</b><span class="gf-ico">${prodGlyph(prod)}</span><span class="gf-band"></span>`;
}

function buildProdCard(prod){
  const price=calcPrice(prod);const orig=prod.priceDZD||(prod.val*(RATES[prod.cur||'EUR']||220));
  const card=document.createElement('div');card.className='pc'+(prod.stock===false?' pc-unavail':'');
  const disc=DISC.active&&prod.stock!==false;
  card.innerHTML=`
    <div class="pc-in">
      <div class="pc-img gface ${prodTone(prod)}${prodHasImg(prod)?' has-img':''}">
        ${prod.badge?`<div class="pc-badge ${prod.badge==='Premium'?'gold':prod.badge==='New'?'new':''}">${san(prod.badge)}</div>`:''}
        ${disc?`<div class="pc-badge pc-disc">-${DISC.value}%</div>`:''}
        ${prod.stock===false?`<div class="pc-oos-overlay">${t('prod_oos')}</div>`:''}
        ${prodFaceHTML(prod)}
      </div>
      <div class="pc-body">
        <div class="pc-type">${san(getCatName(prod.cat))}</div>
        <div class="pc-name">${san(prod.name)}</div>
        <div class="pc-sub">${san(prod.sub||'')}</div>
        <div class="pc-dzd"><b>${price.toLocaleString('en-US')}</b> دج${disc?` <s>${orig.toLocaleString('en-US')}</s>`:''}</div>
      </div>
      ${prod.stock!==false?`<button class="pc-cart" onclick="event.stopPropagation();addToCart('${jsq(prod.id)}')" aria-label="${t('prod_cart')}"><i class="fa-solid fa-cart-shopping"></i></button>`:''}
    </div>
  `;
  card.addEventListener('click',()=>{if(prod.stock!==false)openProdDetail(prod);});
  return card;
}

/* Hero: a fan of three real, in-stock products from different categories when the catalogue is there;
   otherwise the brand mark stands alone. */
function renderHeroFan(){
  const art=$('heroArt'),fan=$('heroFan');if(!art||!fan)return;
  fan.innerHTML='';
  const enabled=CATS.filter(c=>c.enabled).map(c=>c.id),seen=new Set(),pick=[];
  PRODS.filter(p=>enabled.includes(p.cat)&&p.stock!==false).forEach(p=>{if(pick.length<3&&!seen.has(p.cat)){seen.add(p.cat);pick.push(p);}});
  PRODS.filter(p=>enabled.includes(p.cat)&&p.stock!==false).forEach(p=>{if(pick.length<3&&!pick.includes(p))pick.push(p);});
  art.classList.toggle('has-fan',pick.length>0);
  const slots=pick.length===1?[0]:pick.length===2?[1,2]:[1,0,2];     /* 0 = centre, 1/2 = sides */
  pick.forEach((p,i)=>{
    const b=document.createElement('button');b.type='button';b.className='hf hf'+slots[i];
    b.setAttribute('aria-label',p.name||'');
    b.innerHTML=`<span class="gface ${prodTone(p)}${prodHasImg(p)?' has-img':''}">${prodFaceHTML(p)}</span><span class="hf-cap"><b>${san(p.name)}</b><i>${calcPrice(p).toLocaleString('en-US')} دج</i></span>`;
    b.addEventListener('click',()=>openProdDetail(p));
    fan.appendChild(b);
  });
}

/* ══════════════════════════════════════════
   PRODUCT DETAIL
══════════════════════════════════════════ */
function openProdDetail(prod){
  S.selProd=prod;
  const price=calcPrice(prod);const orig=prod.priceDZD||(prod.val*(RATES[prod.cur||'EUR']||220));
  const valText=getValText(prod);
  const desc=S.lang==='en'?(prod.descEn||prod.desc||''):(prod.desc||'');
  const mc=$('prodModalContent');if(!mc)return;
  mc.innerHTML=`
    <div class="pd-top">
      <div class="pc-img gface pd-face ${prodTone(prod)}${prodHasImg(prod)?' has-img':''}">${prodFaceHTML(prod)}</div>
      <div class="pd-info">
        <div class="pd-cat">${san(getCatName(prod.cat))}</div>
        <h3 class="pd-name">${san(prod.name)}</h3>
        <div class="pd-sub">${san(prod.sub||'')}</div>
        ${desc?`<p class="pd-desc">${san(desc)}</p>`:''}
        <div class="pd-price">${price.toLocaleString('en-US')} دج</div>
        ${DISC.active?`<div class="pd-old">${orig.toLocaleString('en-US')} دج</div>`:''}
        <div class="pd-val">${t('prod_val')}: <strong>${san(valText)}</strong></div>
      </div>
    </div>
    <div class="pd-acts">
      <button onclick="addToCart('${jsq(prod.id)}');closeM('prodModal')" class="btn-o"><i class="fa-solid fa-cart-shopping"></i> ${t('prod_cart')}</button>
      <button onclick="closeM('prodModal');openCheckoutForProd('${jsq(prod.id)}')" class="btn-p"><i class="fa-solid fa-bolt"></i> ${t('prod_order')}</button>
    </div>
  `;
  openM('prodModal');
}

function openCheckoutForProd(prodId){
  const prod=PRODS.find(p=>p.id===prodId);if(!prod||prod.stock===false)return;
  S.selProd=prod;S.cpn=null;S._cpnDisc=0;const price=calcPrice(prod);S._total=price;
  const valText=getValText(prod);
  const ci=$('coProdInfo');
  if(ci)ci.innerHTML=`<div class="co-pname">${san(prod.name)} — ${san(valText)}</div><div class="co-pprice">${san(prod.sub||'')} · ${price.toLocaleString('en-US')} دج</div>`;
  setText('coTotal',price.toLocaleString('en-US')+' دج');
  const cr=$('cpnRes');if(cr)cr.textContent='';const ci2=$('cpnInp');if(ci2)ci2.value='';if(S._offerCode&&ci2)ci2.value=S._offerCode;
  openM('checkoutModal');
}
window.openCheckoutForProd=openCheckoutForProd;

/* ══════════════════════════════════════════
   SHOP
══════════════════════════════════════════ */
function renderCatFilterBar(){
  const bar=$('catFilterBar');if(!bar)return;bar.innerHTML='';
  const allBtn=document.createElement('button');allBtn.className='cfb'+(S.currentCat==='all'?' on':'');
  allBtn.textContent=t('shop_all');allBtn.onclick=()=>filterByCat('all');bar.appendChild(allBtn);
  CATS.filter(c=>c.enabled).sort((a,b)=>(a.order||0)-(b.order||0)).forEach(cat=>{
    const btn=document.createElement('button');btn.className='cfb'+(S.currentCat===cat.id?' on':'');
    btn.textContent=S.lang==='en'?(cat.nameEn||cat.name):(cat.name||cat.id);
    btn.onclick=()=>filterByCat(cat.id);bar.appendChild(btn);
  });
}

function filterByCat(catId){
  S.currentCat=catId;
  document.querySelectorAll('.cfb').forEach(b=>{
    b.classList.toggle('on',catId==='all'?b.textContent===t('shop_all'):CATS.find(c=>c.id===catId&&b.textContent===(S.lang==='en'?c.nameEn:c.name))!=null);
  });
  renderShopProds();
}
window.filterByCat=filterByCat;

function renderShopProds(){
  const g=$('shopProdsGrid');if(!g)return;g.innerHTML='';
  const enabled=CATS.filter(c=>c.enabled).map(c=>c.id);
  let filtered=PRODS.filter(p=>enabled.includes(p.cat));
  if(S.currentCat!=='all')filtered=filtered.filter(p=>p.cat===S.currentCat);
  if(!filtered.length){g.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--mid)"><i class="fa-solid fa-box-open" style="font-size:36px;opacity:.3;display:block;margin-bottom:12px"></i><p>${t('shop_empty')}</p></div>`;return;}
  filtered.forEach(prod=>g.appendChild(buildProdCard(prod)));
}

/* ══════════════════════════════════════════
   CART
══════════════════════════════════════════ */
function addToCart(prodId){
  if(!prodId||typeof prodId!=='string'||prodId.length>50)return;
  const prod=PRODS.find(p=>p.id===prodId);
  if(!prod){toast(t('t_error'),'terr');return;}
  if(prod.stock===false){toast(t('t_oos'),'twarn');return;}
  const ex=S.cart.find(c=>c.id===prodId);
  if(ex)ex.qty=(ex.qty||1)+1;else S.cart.push({id:prodId,name:prod.name,sub:prod.sub,price:calcPrice(prod),qty:1,img:prod.img||null});
  if(S.cart.length>20)S.cart=S.cart.slice(0,20);
  LS.setItem('gq_cart',JSON.stringify(S.cart));updateCartBadge();
  bumpCart();if(navigator.vibrate)navigator.vibrate([8,20]);
}
/* cart feedback without a banner: the cart button pulses and the badge pops */
function bumpCart(){
  [$('cartBadge'),$('cartBadge')?.closest('button')].forEach(el=>{
    if(!el)return;el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');
    setTimeout(()=>el.classList.remove('bump'),600);
  });
}
window.addToCart=addToCart;

function updateCartBadge(){
  const tot=S.cart.reduce((s,c)=>s+(c.qty||1),0);
  const b=$('cartBadge');if(b){b.textContent=tot;b.classList.toggle('hidden',tot===0);}
}

function renderCart(){
  const items=$('cartItems'),empty=$('cartEmpty'),foot=$('cartFoot');if(!items)return;
  if(!S.cart.length){items.innerHTML='';empty?.classList.remove('hidden');foot?.classList.add('hidden');return;}
  empty?.classList.add('hidden');foot?.classList.remove('hidden');items.innerHTML='';let tot=0;
  S.cart.forEach((c,i)=>{
    tot+=c.price*(c.qty||1);const el=document.createElement('div');el.className='ci';
    const ico=c.img==='ps'?'<i class="fa-brands fa-playstation"></i>':c.img==='plus'?'👑':'🎮';
    el.innerHTML=`<div class="ci-img">${ico}</div><div class="ci-info"><div class="ci-name">${san(c.name||'')}</div><div class="ci-price">${(c.price*(c.qty||1)).toLocaleString('en-US')} دج${c.qty>1?` (x${c.qty})`:''}</div></div><button class="ci-rm" onclick="removeFromCart(${i})">✕</button>`;
    items.appendChild(el);
  });
  setText('cartTotV',tot.toLocaleString('en-US')+' دج');
}
window.removeFromCart=i=>{if(i<0||i>=S.cart.length)return;S.cart.splice(i,1);LS.setItem('gq_cart',JSON.stringify(S.cart));updateCartBadge();renderCart();};

function goCheckout(){
  if(!S.cart.length)return;closeM('cartModal');
  const tot=S.cart.reduce((s,c)=>s+(c.price*(c.qty||1)),0);S._total=tot;S.selProd=null;S.cpn=null;S._cpnDisc=0;
  const ci=$('coProdInfo');
  if(ci)ci.innerHTML=`<div class="co-pname">${S.cart.map(c=>`${san(c.name||'')} x${c.qty||1}`).join(' + ')}</div><div class="co-pprice">${tot.toLocaleString('en-US')} دج</div>`;
  setText('coTotal',tot.toLocaleString('en-US')+' دج');
  const cr=$('cpnRes');if(cr)cr.textContent='';const ci2=$('cpnInp');if(ci2)ci2.value='';if(S._offerCode&&ci2)ci2.value=S._offerCode;
  openM('checkoutModal');
}
window.goCheckout=goCheckout;

/* ══════════════════════════════════════════
   COUPON
══════════════════════════════════════════ */
window.applyCpn=async()=>{
  const inp=$('cpnInp'),res=$('cpnRes');if(!inp||!res)return;
  const code=inp.value.trim().toUpperCase().slice(0,20);
  if(!code){res.innerHTML=`<span style="color:var(--red)">${t('t_enter_cpn')}</span>`;return;}
  if(S._cpnDisc){S._total=(S._total||0)+S._cpnDisc;S._cpnDisc=0;}          /* never stack a coupon on an already-discounted total */
  const r=await wkCall('/coupon/validate',{code},{auth:false});
  if(r.data&&r.data.ok){
    S.cpn={code:r.data.code,type:r.data.type,value:r.data.value};const base=S._total||0;
    const dc=S.cpn.type==='percent'?Math.floor(base*Math.min(S.cpn.value,100)/100):Math.min(S.cpn.value,base);
    S._total=Math.max(0,base-dc);S._cpnDisc=dc;
    const discTxt=S.lang==='en'?`Discount ${S.cpn.value}${S.cpn.type==='percent'?'%':' DZD'}`:`خصم ${S.cpn.value}${S.cpn.type==='percent'?'%':' دج'}`;
    res.innerHTML=`<span style="color:var(--green)">✅ ${discTxt}</span>`;
    setText('coTotal',S._total.toLocaleString('en-US')+' دج');
  }else{
    S.cpn=null;S._cpnDisc=0;setText('coTotal',(S._total||0).toLocaleString('en-US')+' دج');
    res.innerHTML=`<span style="color:var(--red)">${r.status===429?t('t_too_many'):t('t_coupon_invalid')}</span>`;
  }
};
window.applyOfferCode=()=>{if(S._offer)S._offerCode=S._offer.code;copyText(S._offerCode||'');if(S.cart.length){goCheckout();}else{goPage('shop');toast(t('t_choose_prod'),'twarn');}};

/* ══════════════════════════════════════════
   PAYMENT
══════════════════════════════════════════ */
window.setPay=m=>{if(!['baridimob','hand'].includes(m))return;S.pay=m;$('tabBaridi').classList.toggle('on',m==='baridimob');$('tabHand').classList.toggle('on',m==='hand');$('baridiF').classList.toggle('hidden',m!=='baridimob');$('handF').classList.toggle('hidden',m!=='hand');
  /* hand delivery: the only contact needed is ONE phone number, so the e-mail/phone choice and its fields are hidden */
  const hand=m==='hand';$('recvTabs').classList.toggle('hidden',hand);
  $('emailF').classList.toggle('hidden',hand||S.recv!=='email');$('phoneF').classList.toggle('hidden',hand||S.recv!=='phone');};
window.setRecv=m=>{if(!['email','phone'].includes(m))return;S.recv=m;$('recvEM').classList.toggle('on',m==='email');$('recvPH').classList.toggle('on',m==='phone');$('emailF').classList.toggle('hidden',m!=='email');$('phoneF').classList.toggle('hidden',m!=='phone');};
window.copyRIP=()=>copyText('00799999004390466974').then(ok=>{if(ok)toast(t('t_rip_copied'),'tok');});
window.onFile=ev=>{const f=ev.target.files[0];if(!f)return;$('upH').classList.add('hidden');$('upD').classList.remove('hidden');setText('upDN',f.name.slice(0,30));};
window.clearUp=()=>{if($('recFile'))$('recFile').value='';$('upD')?.classList.add('hidden');$('upH')?.classList.remove('hidden');};
window.onRptFile=ev=>{const f=ev.target.files[0];if(!f)return;$('rptUpH')?.classList.add('hidden');$('rptUpD')?.classList.remove('hidden');setText('rptUpDN',f.name.slice(0,30));};
window.clearRptUp=()=>{if($('rptFile'))$('rptFile').value='';$('rptUpD')?.classList.add('hidden');$('rptUpH')?.classList.remove('hidden');};

async function validImg(file){
  if(!file||file.size>5*1024*1024||file.size<512)return false;
  const ext=file.name.split('.').pop()?.toLowerCase();
  if(!['jpg','jpeg','png','gif','webp'].includes(ext))return false;
  try{const buf=await file.slice(0,12).arrayBuffer();const b=new Uint8Array(buf);if(b[0]===0xFF&&b[1]===0xD8)return true;if(b[0]===0x89&&b[1]===0x50)return true;if(b[0]===0x47&&b[1]===0x49)return true;if(b[0]===0x52&&b[1]===0x49&&b[8]===0x57)return true;return false;}catch{return false;}
}

/* ══════════════════════════════════════════
   SUBMIT ORDER
══════════════════════════════════════════ */
window.submitOrder=async()=>{
  if(!RL.ok('order',3,60000)){toast(t('t_too_many'),'twarn');return;}
  const items=S.selProd?[{id:S.selProd.id,qty:1}]:S.cart.map(c=>({id:c.id,qty:c.qty||1}));
  if(!items.length)return;
  const rE=($('recvEmail')?.value||'').trim().slice(0,254);
  const rP=($('recvPhone')?.value||'').trim().slice(0,20);
  const hand=S.pay==='hand';
  const data={items,coupon:S.cpn?.code||'',pay:S.pay,recv:hand?'phone':S.recv};
  let files={};
  if(!hand&&S.recv==='email'){if(!isValidEmail(rE)){toast(t('t_email_invalid'),'terr');return;}data.email=rE;}
  if(S.pay==='baridimob'){
    const name=san(($('senderN')?.value||'').trim()).slice(0,100);
    const fi=$('recFile');
    if(!name){toast(t('t_name_full'),'terr');return;}
    if(!fi?.files?.length){toast(t('t_upload_receipt'),'terr');return;}
    const ok=await validImg(fi.files[0]);if(!ok){toast(t('t_img_invalid'),'terr');return;}
    if(S.recv==='phone'){if(!rP){toast(t('t_phone_required'),'terr');return;}data.phone=rP;}
    data.name=name;files={photo:fi.files[0]};
  }else{
    const phone=($('handPhone')?.value||'').trim().slice(0,20);
    if(!phone){toast(t('t_phone_required'),'terr');return;}
    data.phone=phone;
  }
  setSubmitting(true);
  try{
    const r=await wkCall('/order/create',data,{form:true,files});
    if(r.data&&r.data.ok){await onOrderSuccess(r.data.orderId,r.data.total,r.data.product);}
    else if(r.status===0)toast(t('t_conn_error'),'terr');
    else if(r.status===429)toast(t('t_too_many'),'twarn');
    else if(r.status===401){toast(t('t_login_first'),'terr');openM('authModal');}
    else if(r.status===403)toast(t('t_banned'),'terr');
    else toast(String((r.data&&r.data.error)||t('t_error')).slice(0,100),'terr');
  }catch(e){toast(t('t_conn_error'),'terr');}finally{setSubmitting(false);}
};

function setSubmitting(on){
  const b=$('submitOrderBtn'),l=$('submitLabel');if(!b)return;
  b.disabled=on;b.classList.toggle('loading',on);
  if(l){
    if(on){l.dataset.o=l.textContent;l.textContent=S.lang==='en'?'Sending your order...':'جاري إرسال طلبك...';}
    else if(l.dataset.o){l.textContent=l.dataset.o;delete l.dataset.o;}
  }
}

/* order confirmation: a proper status screen instead of a banner */
function showOrderDone(oid,total,prodName){
  const en=S.lang==='en';S._lastOrder=oid;
  setText('odTitle',en?'Order received!':'تم استلام طلبك!');
  setText('odSub',en?'Thank you for trusting Glitch Q. Your order is now being processed.':'شكراً لثقتك بـ Glitch Q. طلبك الآن قيد المعالجة.');
  setText('odIdLbl',en?'Order number':'رقم الطلب');setText('odId',oid);
  setText('odProd',prodName||'');setText('odTot',(total||0).toLocaleString('en-US')+' دج');
  setText('od1t',en?'Order received':'تم استلام الطلب');setText('od1s',en?'We have your order and payment details':'وصلنا طلبك وبيانات الدفع');
  setText('od2t',en?'Being prepared':'قيد التجهيز');setText('od2s',en?'We are reviewing the payment and preparing your code':'نراجع الدفع ونجهّز الكود الخاص بك');
  setText('od3t',en?'Code delivered':'تسليم الكود');setText('od3s',en?'Usually within 5-60 minutes via your chosen method':'غالباً خلال 5-60 دقيقة عبر وسيلة الاستلام التي اخترتها');
  setText('odCopy',en?'Copy':'نسخ');setText('odTrack',en?'Track your order':'تتبّع طلبك');
  setText('odRate',en?'Rate your experience':'قيّم تجربتك');setText('odClose',en?'Continue shopping':'متابعة التسوق');
  openM('orderDoneModal');
}
window.copyOrderId=()=>{
  const b=$('odCopy'),en=S.lang==='en';if(!S._lastOrder)return;
  copyText(S._lastOrder).then(ok=>{if(ok&&b){b.textContent=en?'Copied ✓':'تم النسخ ✓';setTimeout(()=>{b.textContent=en?'Copy':'نسخ';},1600);}});
};
window.trackFromDone=()=>{closeM('orderDoneModal');const i=$('trkInput');if(i&&S._lastOrder)i.value=S._lastOrder;openM('trackModal');if(S._lastOrder)window.trackOrder?.();};
window.rateFromDone=()=>{closeM('orderDoneModal');openM('ratingModal');};

async function onOrderSuccess(oid,total,prodName){
  fireConfetti();
  if(navigator.vibrate)navigator.vibrate([20,50,20,50,100]);
  copyText(oid);                                                                   /* best effort — never holds the order screen back */
  S.cart=[];LS.setItem('gq_cart',JSON.stringify(S.cart));updateCartBadge();
  closeM('checkoutModal');S.selProd=null;S._total=0;S.cpn=null;S._cpnDisc=0;clearUp();
  showOrderDone(oid,total,prodName);
  loadHistory();
}

/* order history comes from the customer's own orders (read-only for them) */
async function loadHistory(){
  if(!S.user)return;
  try{
    const snap=await db.collection('orders').where('userId','==',S.user.uid).limit(30).get();
    const rows=snap.docs.map(d=>d.data()).sort((a,b)=>((b.ts&&b.ts.toMillis?b.ts.toMillis():0)-(a.ts&&a.ts.toMillis?a.ts.toMillis():0)));
    S.history=rows.slice(0,20).map(o=>`${o.product||''} — ${o.date||''}`);
    updProfUI();
  }catch(e){}
}

/* ══════════════════════════════════════════
   AUTH
══════════════════════════════════════════ */
let _regBusy=false;                  /* true while the sign-up / resend code runs: the listener below must not sign the brand-new (still unverified) account out under its feet */
let _vCred=null;                     /* e-mail + password of the account waiting for activation (memory only), used by the Resend button */
auth.onAuthStateChanged(async fbU=>{
  if(_regBusy)return;
  if(fbU){
    await fbU.reload().catch(()=>{});const cur=auth.currentUser;if(!cur){resetSess();return;}
    const url=new URLSearchParams(window.location.search);
    if(url.get('mode')==='verifyEmail'){if(cur.emailVerified){window.history.replaceState({},'','');await endSess(cur);}return;}
    if(!cur.emailVerified){await auth.signOut();resetSess();return;}
    await endSess(cur);
  }else resetSess();
});

async function endSess(fbU){
  S.user=fbU;
  try{
    const snap=await db.collection('users').doc(fbU.uid).get();
    const banned=await db.collection('banned_users').doc(fbU.uid).get();
    if(banned.exists){await auth.signOut();toast(t('t_banned'),'terr');resetSess();return;}
    if(snap.exists){
      S.udata=snap.data();
      if(!S.region&&S.udata.region&&REG_CFG.enabled&&REG_CFG.available[S.udata.region]){S.region=S.udata.region;S.regAuto=false;S.cur=S.udata.currency||'EUR';S.sym=S.udata.symbol||'€';LS.setItem('gq_reg',S.region);LS.setItem('gq_cur',S.cur);LS.setItem('gq_sym',S.sym);}
    }else{
      S.udata={points:5,notifications:[],favorites:[],orders:0,ratings:0,spins:0,gifts:0,shares:0,streak:0,referrals:0,totalSpend:0,lastLogin:null,badges:['newcomer'],claimedMilestones:[],uid_short:fbU.uid.slice(0,12),email:fbU.email||'',name:fbU.displayName||'',created:new Date()};
      await db.collection('users').doc(fbU.uid).set(S.udata);
    }
  }catch(e){S.udata={points:0,history:[],notifications:[],favorites:[],orders:0,ratings:0,spins:0,gifts:0,shares:0,streak:0,referrals:0,totalSpend:0,badges:[],claimedMilestones:[]};}
  closeM('authModal');updHeaderUI();updProfUI();loadNotifs();bumpVisitor();
  checkAchievements();checkMilestones();
  try{window.acctOnLogin&&window.acctOnLogin();}catch(e){}                    /* optional new-device alert + saved preferences */
  loadHistory();
  checkAbuse();
  const url=new URLSearchParams(window.location.search);if(url.get('ref'))processReferral();
  maybePromptRegion();
}

function resetSess(){S.user=null;S.udata=null;S.history=null;if(S.ready){updHeaderUI();updProfUI();}}
async function bumpVisitor(){const k='vst_'+new Date().toDateString();if(SS.getItem(k))return;SS.setItem(k,'1');wkCall('/stats/visit',{},{auth:false});}

$('loginForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!RL.ok('login',5,60000)){toast(t('t_too_many'),'twarn');return;}
  const email=($('loginEmail')?.value||'').trim().slice(0,254);const pass=$('loginPass')?.value||'';
  if(!email||!pass||!isValidEmail(email))return;
  if(email===ADMIN_EMAIL){toast(t('t_login_error'),'terr');return;}
  try{const c=await auth.signInWithEmailAndPassword(email,pass);if(!c.user.emailVerified){_vCred={email,pass};await auth.signOut();toast(t('t_verify_first'),'terr');showPane('verifyPane');return;}}
  catch(e){toast(t('t_login_error'),'terr');}
});

$('regForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!RL.ok('register',3,300000)){toast(t('t_too_many'),'twarn');return;}
  const chk=$('regTermsChk');if(!chk?.checked){toast(t('t_terms_required'),'terr');return;}
  const first=san(($('regFirst')?.value||'').trim()).slice(0,50);
  const last=san(($('regLast')?.value||'').trim()).slice(0,50);
  const email=($('regEmail')?.value||'').trim().toLowerCase().slice(0,254);   /* Firebase stores addresses in lower case: the profile rules compare against that */
  const pass=$('regPass')?.value||'';const conf=$('regConf')?.value||'';
  if(!first||!last){toast(t('t_name_required'),'terr');return;}
  if(!isValidEmail(email)){toast(t('t_email_invalid'),'terr');return;}
  if(email===ADMIN_EMAIL){toast(t('t_login_error'),'terr');return;}
  if(pass!==conf){toast(t('t_pass_mismatch'),'terr');return;}
  if(pass.length<6){toast(t('t_pass_short'),'terr');return;}
  if(_regBusy)return;
  _regBusy=true;
  let cred;
  try{cred=await auth.createUserWithEmailAndPassword(email,pass);}
  catch(err){
    try{
      if(err.code==='auth/email-already-in-use'){
        /* a first attempt may have created the account and then shown an error: if it is the same person and still not activated, simply send the activation link again */
        const r=await recoverUnverified(email,pass);
        if(r==='sent'){_vCred={email,pass};toast(t('t_acct_unverified'),'tok');showPane('verifyPane');}
        else toast(t('t_email_exists'),'terr');
      }else toast(err.code==='auth/weak-password'?t('t_weak_pass'):t('t_error'),'terr');
    }finally{_regBusy=false;}
    return;
  }
  /* From here the account EXISTS. Nothing below may tell the customer that registration failed. */
  try{
    _vCred={email,pass};
    try{await cred.user.updateProfile({displayName:`${first} ${last}`});}catch(e){}
    /* best effort: if this write does not land, the first activated login creates the profile document */
    try{await db.collection('users').doc(cred.user.uid).set({firstName:first,lastName:last,name:`${first} ${last}`,email,points:5,notifications:[],favorites:[],orders:0,ratings:0,spins:0,gifts:0,shares:0,streak:0,referrals:0,totalSpend:0,lastLogin:null,badges:['newcomer'],claimedMilestones:[],uid_short:cred.user.uid.slice(0,12),region:S.region||null,created:new Date()});}catch(e){}
    const r=await sendVerification(cred.user);
    if(r==='fail')toast(t('t_verify_fail'),'twarn');else if(r==='wait')toast(t('t_too_many'),'twarn');
    try{await auth.signOut();}catch(e){}
    showPane('verifyPane');
  }finally{_regBusy=false;}
});

/* Activation e-mail: our own branded Arabic message first (Worker → Brevo); Firebase's plain English one only if the Worker cannot be reached.
   Returns 'ok' | 'wait' (limit reached) | 'fail'. */
async function sendVerification(user){
  let tok='';try{tok=await user.getIdToken();}catch(e){}
  if(tok){
    try{
      const r=await fetch(WORKER+'/account/send-verification',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:tok})});
      if(r.ok)return 'ok';
      if(r.status===429)return 'wait';
    }catch(e){}
  }
  try{await user.sendEmailVerification();return 'ok';}
  catch(e){return e&&e.code==='auth/too-many-requests'?'wait':'fail';}
}
async function recoverUnverified(email,pass){
  try{
    const c=await auth.signInWithEmailAndPassword(email,pass);
    await c.user.reload().catch(()=>{});
    if(c.user.emailVerified){await auth.signOut();return 'verified';}
    const r=await sendVerification(c.user);
    await auth.signOut();
    return r==='fail'?'fail':'sent';
  }catch(e){return 'no';}
}

/* ══ PASSWORD RESET — standalone screen ══ */
const RESET_TX={
  ar:{title:'استعادة الوصول لحسابك',sub:'أدخل البريد المسجّل به وسنرسل لك رابطاً لاختيار كلمة مرور جديدة.',ph:'البريد الإلكتروني',btn:'إرسال رابط الاستعادة',back:'← العودة لتسجيل الدخول',
      doneTitle:'تحقق من بريدك',doneSub:e=>`إذا كان ${e} مسجلاً لدينا، فسيصلك رابط إعادة تعيين كلمة المرور خلال دقائق.`,tip:'لم يصلك شيء؟ تفقّد مجلد الرسائل غير المرغوبة (Spam). الرابط صالح لمدة ساعة واحدة.',
      resend:'إعادة الإرسال',resendIn:n=>`إعادة الإرسال بعد ${n} ث`,sending:'جاري الإرسال...',bad:'أدخل بريداً إلكترونياً صحيحاً',fail:'تعذّر إرسال الرابط الآن، حاول بعد قليل.',many:'محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة.'},
  en:{title:'Recover your account',sub:'Enter the email you registered with and we will send you a link to choose a new password.',ph:'Email address',btn:'Send recovery link',back:'← Back to sign in',
      doneTitle:'Check your inbox',doneSub:e=>`If ${e} is registered with us, you will receive a password reset link within minutes.`,tip:"Didn't get it? Check your Spam folder. The link is valid for one hour.",
      resend:'Resend',resendIn:n=>`Resend in ${n}s`,sending:'Sending...',bad:'Enter a valid email address',fail:'Could not send the link right now, please try again shortly.',many:'Too many attempts, please wait a moment.'}
};
let _resetTimer=null,_resetEmail='';
function applyResetTexts(){
  const x=RESET_TX[S.lang==='en'?'en':'ar'];
  setText('resetTitle',x.title);setText('resetSub',x.sub);setText('resetBtn',x.btn);
  setText('resetBack',x.back);setText('resetBack2',x.back);
  setText('resetDoneTitle',x.doneTitle);setText('resetDoneTip',x.tip);
  const ei=$('resetEmail');if(ei)ei.placeholder=x.ph;
  if(_resetEmail)setText('resetDoneSub',x.doneSub(_resetEmail));
  if(!_resetTimer)setText('resetResend',x.resend);
}
window.openReset=()=>{
  const x=$('resetEmail'),le=($('loginEmail')?.value||'').trim();
  if(x&&le&&!x.value)x.value=le;                              /* carry over what was typed on the login screen */
  $('resetStepForm')?.classList.remove('hidden');$('resetStepDone')?.classList.add('hidden');
  applyResetTexts();showPane('resetPane');setTimeout(()=>x?.focus(),120);
};
async function sendResetLink(email){
  const r=await fetch(WORKER+'/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
  if(!r.ok)throw new Error('worker');
}
function startResendCooldown(sec){
  const b=$('resetResend'),x=RESET_TX[S.lang==='en'?'en':'ar'];if(!b)return;
  clearInterval(_resetTimer);let n=sec;b.disabled=true;b.textContent=x.resendIn(n);
  _resetTimer=setInterval(()=>{n--;if(n<=0){clearInterval(_resetTimer);_resetTimer=null;b.disabled=false;b.textContent=x.resend;}else b.textContent=x.resendIn(n);},1000);
}
$('resetForm')?.addEventListener('submit',async ev=>{
  ev.preventDefault();
  const x=RESET_TX[S.lang==='en'?'en':'ar'],btn=$('resetBtn');
  const email=($('resetEmail')?.value||'').trim().slice(0,254);
  if(!email||!isValidEmail(email)){toast(x.bad,'terr');return;}
  if(!RL.ok('reset',3,600000)){toast(x.many,'twarn');return;}
  btn.disabled=true;btn.textContent=x.sending;
  try{
    await sendResetLink(email);
    _resetEmail=email;setText('resetDoneSub',x.doneSub(email));
    $('resetStepForm').classList.add('hidden');$('resetStepDone').classList.remove('hidden');
    startResendCooldown(60);
  }catch(e){toast(x.fail,'terr');}
  finally{btn.disabled=false;btn.textContent=x.btn;}
});
$('resetResend')?.addEventListener('click',async()=>{
  const x=RESET_TX[S.lang==='en'?'en':'ar'];
  if(!_resetEmail||!RL.ok('reset',3,600000)){toast(x.many,'twarn');return;}
  try{await sendResetLink(_resetEmail);startResendCooldown(60);}catch(e){toast(x.fail,'terr');}
});
/* kept for any old caller */
window.resetPass=window.openReset;
window.resendVerif=async()=>{
  const btn=$('resendBtn');if(btn&&btn.disabled)return;
  const e=(_vCred&&_vCred.email)||($('regEmail')?.value||'').trim().toLowerCase()||($('loginEmail')?.value||'').trim().toLowerCase();
  const p=(_vCred&&_vCred.pass)||$('regPass')?.value||$('loginPass')?.value||'';
  if(!e||!p){showPane('loginPane');return;}
  if(!RL.ok('resendverif',4,600000)){toast(t('t_too_many'),'twarn');return;}
  const label=btn?btn.textContent:'';if(btn)btn.disabled=true;
  _regBusy=true;
  try{
    const c=await auth.signInWithEmailAndPassword(e,p);
    await c.user.reload().catch(()=>{});
    if(c.user.emailVerified){await auth.signOut();toast(t('t_already_verified'),'tok');showPane('loginPane');return;}
    const r=await sendVerification(c.user);
    await auth.signOut();
    toast(r==='ok'?t('t_verify_sent'):r==='wait'?t('t_too_many'):t('t_verify_fail'),r==='ok'?'tok':'twarn');
  }catch(x){toast(t('t_error'),'terr');}
  finally{
    _regBusy=false;
    if(btn){let n=45;btn.textContent=label+' ('+n+')';const iv=setInterval(()=>{n--;if(n<=0){clearInterval(iv);btn.disabled=false;btn.textContent=label;}else btn.textContent=label+' ('+n+')';},1000);}
  }
};
window.doLogout=async()=>{await auth.signOut();S.user=null;S.udata=null;updHeaderUI();updProfUI();};

/* ══ HEADER UI ══ */
function updHeaderUI(){
  const lB=$('loginBtnH'),rB=$('regBtnH'),uW=$('uMenuWrap');
  if(S.user&&S.udata){lB?.classList.add('hidden');rB?.classList.add('hidden');uW?.classList.remove('hidden');setText('uNameH',san(S.user.displayName||S.udata.name||'').split(' ')[0].slice(0,20));}
  else{lB?.classList.remove('hidden');rB?.classList.remove('hidden');uW?.classList.add('hidden');}
  if(lB)lB.textContent=t('login_btn');if(rB)rB.textContent=S.lang==='en'?'Register':'إنشاء حساب';
}

/* ══ REGION ══ */
document.addEventListener('click',e=>{
  const rb=e.target.closest('.reg-btn');if(!rb)return;
  const r=rb.dataset.r;
  if(!REGIONS[r]||!REG_CFG.available[r]||rb.disabled)return;      /* unavailable regions cannot be chosen */
  setRegion(r,true);
  closeM('regionModal');                                          /* no banner: the modal simply closes */
  renderHome();if(S.currentPage==='shop')renderShopProds();
  const rb2=$('profRegBadge');if(rb2)rb2.textContent=`${r.toUpperCase()} (${REGIONS[r].s})`;
});

/* ══ PROFILE ══ */
function renderProfilePage(){
  const nb=$('notLoggedBox'),pb=$('profBox');
  if(!S.user||!S.udata){nb?.classList.remove('hidden');pb?.classList.add('hidden');return;}
  nb?.classList.add('hidden');pb?.classList.remove('hidden');updProfUI();
}
function updProfUI(){
  if(!S.user||!S.udata)return;
  setText('profName',san(S.user.displayName||S.udata.name||''));
  try{window.acctApplyProfile&&window.acctApplyProfile();}catch(e){}
  setText('profPts',(S.udata.points||0).toLocaleString('en-US'));
  const rb=$('profRegBadge');if(rb)rb.textContent=S.region?`${S.region.toUpperCase()} (${S.sym})`:t('choose_region');
  const hl=$('profHistList');
  if(hl){hl.innerHTML='';(S.history||S.udata.history||[]).slice(0,5).forEach(h=>{const d=document.createElement('div');d.className='hi';d.innerHTML=`<span>${san(h)}</span><i class="fa-solid fa-clock" style="color:var(--violet);font-size:11px"></i>`;hl.appendChild(d);});}
}

/* ══ REWARDS PAGE ══ */
function renderRewardsPage(){
  if(!S.udata)return;
  const pts=S.udata.points||0;setText('rwPts',pts.toLocaleString('en-US'));
  const{lvl,progress}=getLevel(pts);
  const lb=$('rwLvlBadge');if(lb){lb.textContent=`${lvl.icon} ${S.lang==='en'?lvl.nameEn:lvl.name}`;lb.className='lvl-badge '+lvl.cls;}
  const pf=$('rwPtsBar');if(pf)pf.style.width=progress+'%';
  renderBadges();renderStreak();loadLbRw();initSpinTimerRw();
  renderMissions('missionsWrapRw');renderMilestones();initReferral();loadRewards();
}

function getLevel(pts){
  const lvls=[{min:0,name:'مبتدئ',nameEn:'Beginner',icon:'🥉',cls:'lvl-br'},{min:30,name:'فضي',nameEn:'Silver',icon:'🥈',cls:'lvl-si'},{min:100,name:'ذهبي',nameEn:'Gold',icon:'🥇',cls:'lvl-go'},{min:250,name:'بلاتيني',nameEn:'Platinum',icon:'💎',cls:'lvl-pl'},{min:500,name:'ألماسي',nameEn:'Diamond',icon:'👑',cls:'lvl-di'}];
  let lvl=lvls[0],idx=0;for(let i=lvls.length-1;i>=0;i--){if(pts>=lvls[i].min){lvl=lvls[i];idx=i;break;}}
  const nxt=idx<lvls.length-1?lvls[idx+1].min:500;const progress=idx===lvls.length-1?100:Math.min(((pts-lvl.min)/(nxt-lvl.min))*100,100);
  return{lvl,progress};
}

function renderBadges(){
  const g=$('badgesGrid');if(!g)return;g.innerHTML='';const earned=S.udata?.badges||[];
  BADGES.forEach(b=>{const unlocked=earned.includes(b.id)||b.check(S.udata||{});const el=document.createElement('div');el.className='bdg'+(unlocked?'':' locked');el.innerHTML=`<span class="bdg-ico">${b.icon}</span><span class="bdg-nm">${san(S.lang==='en'?b.nameEn:b.name)}</span>`;g.appendChild(el);});
}

function renderStreak(){
  const row=$('streakRow');if(!row)return;const streak=S.udata?.streak||0;row.innerHTML='';
  [1,2,3,4,5,6,7].forEach((d,i)=>{const el=document.createElement('div');el.className=`sday${i<streak?' done':''}${i===streak?' today':''}`;el.innerHTML=`<i class="fa-solid ${i<streak?'fa-check':i===streak?'fa-circle-dot':'fa-circle'}"></i><span>${d}</span>`;row.appendChild(el);});
}

async function fetchLeaderboard(){
  if(S._lb&&Date.now()<S._lbExp)return S._lb;
  const r=await wkCall('/leaderboard',{},{auth:false});
  if(r.data&&r.data.ok&&Array.isArray(r.data.top)){S._lb=r.data.top;S._lbExp=Date.now()+60000;return S._lb;}
  return null;
}
async function paintLeaderboard(id,crown){
  const list=$(id);if(!list)return;
  const top=await fetchLeaderboard();if(!top)return;
  list.innerHTML='';const medals=['lb-r1','lb-r2','lb-r3'];
  top.forEach((u,i)=>{const el=document.createElement('div');el.className='lb-it';el.innerHTML=`<div class="lb-rank ${medals[i]||''}">${i+1}</div><div class="lb-name">${san(u.name||'')}</div><div class="lb-pts">${(u.points||0).toLocaleString('en-US')} ${t('t_pts')}</div>${crown&&i===0?'<span>👑</span>':''}`;list.appendChild(el);});
}
async function loadLbRw(){return paintLeaderboard('lbListRw',true);}
async function renderLeaderboard(){return paintLeaderboard('lbList',false);}

/* ══ MISSIONS ══ */
function renderMissions(containerId){
  const wrap=$(containerId);if(!wrap)return;wrap.innerHTML='';
  const en=S.lang==='en',cap=(typeof RW!=='undefined'&&RW&&RW.refMaxPts>0)?RW.refMaxPts:0;
  /* every mission says exactly what it pays: `chip` is the short badge, `ptsTxt` the sentence under the name */
  const missions=[
    {id:'login',icon:'fa-calendar-check',color:'var(--cyan)',name:'تسجيل دخول يومي',nameEn:'Daily Login',
      chip:'+1 – 3',ptsTxt:en?'1 to 3 points every day · the streak raises it':'من 1 إلى 3 نقاط كل يوم · وتزيد مع الأيام المتتالية',
      check:()=>S.udata?.lastLogin===algiersDay(),prog:()=>({done:S.udata?.lastLogin===algiersDay()?1:0,total:1})},
    {id:'buy',icon:'fa-cart-shopping',color:'var(--violet)',name:'إجراء عملية شراء',nameEn:'Make a Purchase',
      chip:en?'Every order':'كل طلب',ptsTxt:en?'Points from our profit on every delivered order · bigger orders earn more':'نقاط من أرباحنا على كل طلب يُسلَّم · كلما كبر الطلب زادت النقاط',
      check:()=>(S.udata?.orders||0)>0,prog:()=>({done:Math.min(S.udata?.orders||0,1),total:1})},
    {id:'ref',icon:'fa-user-plus',color:'var(--pink)',name:'دعوة صديق يشتري',nameEn:'Invite a friend who buys',
      chip:cap?'≤ '+cap:(en?'Bonus':'مكافأة'),
      ptsTxt:cap?(en?`Up to ${cap} points when your friend's first order is delivered`:`حتى ${cap} نقطة عند تسليم أول طلب لصديقك`):(en?'Bonus points when your friend\'s first order is delivered':'نقاط إضافية عند تسليم أول طلب لصديقك'),
      check:()=>(S.udata?.referrals||0)>=1,prog:()=>({done:Math.min(S.udata?.referrals||0,1),total:1})},
  ];
  missions.forEach(m=>{
    const prog=m.prog();const isDone=m.check();
    const el=document.createElement('div');el.className='mission-it'+(isDone?' done':'');
    const name=en?m.nameEn:m.name;
    el.innerHTML=`<div class="mi-l"><i class="fa-solid ${m.icon}" style="color:${m.color}"></i><div class="mi-txt"><span>${san(name)}</span><small>${san(m.ptsTxt)}</small></div></div><div class="mi-r"><bdi class="mi-pts" dir="ltr">${san(m.chip)}${/\d/.test(m.chip)?' <em>'+(en?'pts':'نقطة')+'</em>':''}</bdi>${isDone?'<i class="fa-solid fa-check-circle mi-status-done"></i>':`<div class="mi-status-no"><span>${prog.done}/${prog.total}</span><div class="mi-prog-bar"><div class="mi-prog-fill" style="width:${Math.floor((prog.done/prog.total)*100)}%"></div></div></div>`}</div>`;
    wrap.appendChild(el);
  });
}

/* ══ NOTIFICATIONS ══ */

/* Delivered codes are valid until the last day of the delivery month (Algeria time). `until` = "YYYY-MM-DD" saved with the notification. */
const DZ_MONTHS_AR=['جانفي','فيفري','مارس','أفريل','ماي','جوان','جويلية','أوت','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DZ_MONTHS_EN=['January','February','March','April','May','June','July','August','September','October','November','December'];
function codeUntilHTML(iso){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||''));if(!m)return '';
  const dz=new Date(Date.now()+3600000),today=dz.getUTCFullYear()+'-'+String(dz.getUTCMonth()+1).padStart(2,'0')+'-'+String(dz.getUTCDate()).padStart(2,'0');
  const en=S.lang==='en',txt=`${+m[3]} ${(en?DZ_MONTHS_EN:DZ_MONTHS_AR)[+m[2]-1]||''} ${m[1]}`;
  return String(iso)<today?`<div class="ni-until exp">⛔ ${en?'Code expired':'انتهت صلاحية الكود'} (${san(txt)})</div>`:`<div class="ni-until">⏳ ${en?'Valid until':'صالح حتى'} ${san(txt)}</div>`;
}
function loadNotifs(){
  if(!S.user||!S.udata)return;const notifs=S.udata.notifications||[];
  const unread=notifs.filter(n=>!n.read).length;
  const b=$('notifBadge');if(b){b.textContent=unread;b.classList.toggle('hidden',unread===0);}
  const list=$('notifList');if(!list)return;list.innerHTML='';
  if(!notifs.length){list.innerHTML=`<div class="ni-empty">${t('notif_empty')}</div>`;return;}
  [...notifs].reverse().forEach(n=>{const d=document.createElement('div');d.className='ni'+(n.read?'':' unread');d.innerHTML=`<div class="ni-ttl">${san(n.title||'')}</div>${n.code?`<div class="ni-code">${san(n.code)}</div>`:''}${codeUntilHTML(n.until)}<div class="ni-date">${san(n.date||'')}</div>`;list.appendChild(d);});
}
/* Opening the panel = the customer has seen them: the badge clears at once and the "read" flag is saved to the account
   (a transaction, so a notification the store adds at the same moment is never overwritten). The new ones stay highlighted
   until the panel is closed. If saving fails the flag stays unread and the next opening tries again. */
let _nMarking=false;
async function markNotifsRead(){
  if(!S.user||!S.udata||_nMarking)return;
  if(!(S.udata.notifications||[]).some(n=>n&&!n.read))return;
  _nMarking=true;
  const b=$('notifBadge');if(b){b.textContent='0';b.classList.add('hidden');}
  try{
    const ref=db.collection('users').doc(S.user.uid);
    const mark=a=>(a||[]).map(n=>n&&!n.read?{...n,read:true}:n);
    await db.runTransaction(async tx=>{const snap=await tx.get(ref);tx.update(ref,{notifications:mark((snap.data()||{}).notifications)});});
    S.udata.notifications=mark(S.udata.notifications);
  }catch(e){}
  _nMarking=false;
}
function toggleNotif(){
  const p=$('notifPanel');if(!p)return;
  const opening=p.classList.contains('hidden');
  if(opening){p.classList.remove('hidden');markNotifsRead();}else closeNotif();
}
function closeNotif(){const p=$('notifPanel');if(!p||p.classList.contains('hidden'))return;p.classList.add('hidden');loadNotifs();}
window.toggleNotif=toggleNotif;window.closeNotif=closeNotif;
document.addEventListener('click',e=>{if(!e.target.closest('#notifPanel')&&!e.target.closest('#notifBtn'))closeNotif();});

/* ══ TRACK ORDER ══ */
window.trackOrder=async()=>{
  const inp=$('trkInput'),res=$('trkRes');if(!inp||!res)return;
  const oid=inp.value.trim().slice(0,50);if(!oid){res.innerHTML=`<div class="stbox st-pend">${S.lang==='en'?'Enter order number':'أدخل رقم الطلب'}</div>`;return;}
  if(!RL.ok('track',5,60000))return;
  const r=await wkCall('/order/track',{orderId:oid},{auth:false});
  if(r.data&&r.data.ok){const o=r.data;const m={pending:{t:t('order_pend'),c:'st-pend'},processing:{t:t('order_proc'),c:'st-proc'},done:{t:t('order_done'),c:'st-done'},rejected:{t:t('order_rej'),c:'st-rej'}};const st=m[o.status]||m.pending;res.innerHTML=`<div class="stbox ${st.c}"><strong>${st.t}</strong><br><small>${san(o.product||'')}</small><br><small>📅 ${san(o.date||'')}</small></div>`;}
  else if(r.status===200)res.innerHTML=`<div class="stbox st-rej">${t('track_not_found')}</div>`;
  else res.innerHTML=`<div class="stbox st-pend">${t('track_error')}</div>`;
};

/* ══ RATING ══ */
function initStars(){document.querySelectorAll('.starb').forEach(s=>{s.addEventListener('click',()=>{S.stars=parseInt(s.dataset.v)||0;document.querySelectorAll('.starb').forEach((x,i)=>x.classList.toggle('lit',i<S.stars));});});}
window.submitRating=async()=>{
  if(S.stars<1||S.stars>5){toast(t('t_star_select'),'terr');return;}
  if(!RL.ok('rating',2,60000)){toast(t('t_too_many'),'twarn');return;}
  const cmt=san(($('ratingCmt')?.value||'')).slice(0,300);
  try{
    const r=await wkCall('/rating/create',{rating:S.stars,comment:cmt});
    if(!(r.data&&r.data.ok))throw new Error('rating');
    if(S.user&&S.udata){S.udata.ratings=(S.udata.ratings||0)+1;checkAchievements();}
    toast(t('t_rating_done'),'tok');closeM('ratingModal');if($('ratingCmt'))$('ratingCmt').value='';S.stars=0;document.querySelectorAll('.starb').forEach(s=>s.classList.remove('lit'));
  }catch(e){toast(t('t_error'),'terr');}
};

/* ══ SPIN WHEEL ══ */
function buildSpinWheel(){
  const canvas=$('spinCanvas');if(!canvas)return;
  const size=Math.min(300,window.innerWidth*.8);canvas.width=size;canvas.height=size;canvas.style.width=size+'px';canvas.style.height=size+'px';drawWheel(canvas,0);
}

function drawWheel(canvas,rotation){
  const ctx=canvas.getContext('2d');const cx=canvas.width/2,cy=canvas.height/2,r=cx-4;
  const segAngle=(2*Math.PI)/SPIN_SEGMENTS.length;ctx.clearRect(0,0,canvas.width,canvas.height);
  SPIN_SEGMENTS.forEach((seg,i)=>{
    const startA=rotation+i*segAngle-Math.PI/2;const endA=startA+segAngle;const midA=startA+segAngle/2;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,startA,endA);ctx.closePath();ctx.fillStyle=seg.color;ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,startA,endA);ctx.closePath();ctx.stroke();
    ctx.save();ctx.translate(cx,cy);ctx.rotate(midA);ctx.fillStyle='#F4F6FB';
    ctx.font=`900 ${Math.max(12,Math.floor(canvas.width/23))}px 'IBM Plex Sans Arabic',sans-serif`;ctx.textAlign='right';ctx.textBaseline='middle';
    const label=S.lang==='en'?(seg.labelEn||seg.label):seg.label;
    ctx.fillText(label,r*.82,0);if(seg.pts>0){ctx.font=`${Math.max(10,Math.floor(canvas.width/30))}px Arial`;ctx.fillStyle='#F4B63E';ctx.fillText('★',r*.82+16,-1);}
    ctx.restore();
  });
  const ringGrad=ctx.createLinearGradient(0,0,canvas.width,canvas.height);ringGrad.addColorStop(0,'#F5223F');ringGrad.addColorStop(.5,'#35E0F2');ringGrad.addColorStop(1,'#F5223F');
  ctx.beginPath();ctx.arc(cx,cy,r,0,2*Math.PI);ctx.strokeStyle=ringGrad;ctx.lineWidth=5;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,r-8,0,2*Math.PI);ctx.strokeStyle='rgba(255,255,255,.08)';ctx.lineWidth=1;ctx.stroke();
  const cGrad=ctx.createRadialGradient(cx,cy,0,cx,cy,28);cGrad.addColorStop(0,'#181C25');cGrad.addColorStop(1,'#050507');
  ctx.beginPath();ctx.arc(cx,cy,28,0,2*Math.PI);ctx.fillStyle=cGrad;ctx.fill();ctx.strokeStyle='#F5223F';ctx.lineWidth=3;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,28,0,2*Math.PI);ctx.strokeStyle='rgba(245,34,63,.35)';ctx.lineWidth=7;ctx.stroke();
}


function initSpinTimer(){
  const update=()=>{const ls=LS.getItem('gq_lastSpin');if(ls){const rem=parseInt(ls)+86400000-Date.now();if(rem>0){const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000);setText('spinTimer',`${t('t_spin_next')} ${h}${S.lang==='en'?'h':'س'} ${m}${S.lang==='en'?'m':'د'}`);const btn=$('spinBtn');if(btn){btn.disabled=true;btn.style.opacity='.5';}return;}}setText('spinTimer','');const btn=$('spinBtn');if(btn){btn.disabled=false;btn.style.opacity='1';btn.textContent=t('spin_btn');}};
  update();setInterval(update,60000);
}
function initSpinTimerRw(){const ls=LS.getItem('gq_lastSpin');if(ls){const rem=parseInt(ls)+86400000-Date.now();if(rem>0){const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000);setText('spinTimerRw',`${t('t_spin_next')} ${h}${S.lang==='en'?'h':'س'} ${m}${S.lang==='en'?'m':'د'}`);return;}}setText('spinTimerRw','');}

window.doSpin=async function(){
  if(S.spinning)return;const ls=LS.getItem('gq_lastSpin');
  if(ls&&Date.now()-parseInt(ls)<86400000){toast(t('t_spin_daily'),'twarn');return;}
  if(!S.user){toast(t('t_login_first'),'terr');openM('authModal');return;}
  S.spinning=true;const btn=$('spinBtn');if(btn){btn.disabled=true;btn.style.opacity='.5';}
  if($('spinPrize'))$('spinPrize').textContent='';
  const r=await wkCall('/account/spin',{});
  if(!(r.data&&r.data.ok)){
    S.spinning=false;if(btn){btn.disabled=false;btn.style.opacity='1';}
    if(r.data&&r.data.reason==='wait'){LS.setItem('gq_lastSpin',String(Date.now()-(86400000-(r.data.remainingMs||86400000))));initSpinTimer();toast(t('t_spin_daily'),'twarn');}
    else toast(t('t_error'),'terr');
    return;
  }
  const prizeIdx=Math.max(0,Math.min(SPIN_SEGMENTS.length-1,r.data.index|0));const prize=SPIN_SEGMENTS[prizeIdx];
  const segAngle=360/SPIN_SEGMENTS.length;const targetSegCenter=prizeIdx*segAngle+segAngle/2;
  const spins=5+Math.floor(Math.random()*3);const targetDeg=spins*360+(360-targetSegCenter);
  const duration=4500;const startTime=performance.now();const startRot=spinRotation;const canvas=$('spinCanvas');
  function easeOut(t_){return 1-Math.pow(1-t_,4);}
  function animate(now){const elapsed=now-startTime;const progress=Math.min(elapsed/duration,1);const eased=easeOut(progress);const currentDeg=startRot+targetDeg*eased;if(canvas)drawWheel(canvas,(currentDeg*Math.PI)/180);if(progress<1){requestAnimationFrame(animate);}else{spinRotation=(startRot+targetDeg)%360;onSpinDone(prize,r.data);}}
  requestAnimationFrame(animate);
};

async function onSpinDone(prize,srv){
  S.spinning=false;LS.setItem('gq_lastSpin',Date.now().toString());
  /* the server decides the prize: if its table ever differs from this wheel (old Worker, new site), show what it really paid */
  if(srv&&Number.isFinite(srv.pts)&&srv.pts!==prize.pts){prize={pts:srv.pts,label:srv.pts>0?(srv.pts+' نقاط'):'حاول غداً',labelEn:srv.pts>0?(srv.pts+' Points'):'Try Tomorrow'};}
  const label=S.lang==='en'?(prize.labelEn||prize.label):prize.label;
  const prizeEl=$('spinPrize');if(prizeEl)prizeEl.textContent=`🎉 ${S.lang==='en'?'You won':'ربحت'} ${label}!`;
  if(srv&&Number.isFinite(srv.points)){S.udata.points=srv.points;S.udata.spins=srv.spins;}
  if(prize.pts>0){updProfUI();checkAchievements();checkMilestones();toast(`+${prize.pts} ${t('t_pts')} ⚡`,'tok');fireConfetti(30);}
  else toast(S.lang==='en'?'Better luck tomorrow! 🍀':'حظاً أوفر غداً! 🍀','twarn');
  initSpinTimer();const btn=$('spinBtn');if(btn){btn.disabled=false;btn.style.opacity='1';}
}

/* ══ STREAK ══ */
window.claimStreak=async()=>{
  if(!S.user){openM('authModal');return;}
  const r=await wkCall('/account/streak',{});
  if(r.data&&r.data.ok){
    S.udata.streak=r.data.streak;S.udata.lastLogin=r.data.lastLogin;S.udata.points=r.data.points;
    toast(`${t('t_streak_reward')} +${r.data.bonus} ${t('t_pts')} 🔥`,'tok');if(navigator.vibrate)navigator.vibrate([10,30,10,50]);fireConfetti(20);renderRewardsPage();checkAchievements();
    const btn=$('claimBtn');if(btn){btn.disabled=true;btn.style.opacity='.5';}
  }else if(r.data&&r.data.reason==='done'){S.udata.lastLogin=algiersDay();toast(t('t_streak_done'),'twarn');renderRewardsPage();}
  else toast(t('t_error'),'terr');
};

/* ══ ACHIEVEMENTS ══ */
async function checkAchievements(){
  if(!S.user||!S.udata)return;const earned=new Set(S.udata.badges||[]);const newOnes=[];
  BADGES.forEach(b=>{if(!earned.has(b.id)&&b.check(S.udata)){newOnes.push(b.id);earned.add(b.id);}});
  if(newOnes.length){S.udata.badges=[...earned];await db.collection('users').doc(S.user.uid).update({badges:[...earned]}).catch(()=>{});newOnes.forEach(id=>{const b=BADGES.find(x=>x.id===id);if(b)setTimeout(()=>toast(`${b.icon} ${t('t_badge_new')}: ${S.lang==='en'?b.nameEn:b.name}!`,'twarn'),500);});}
}
/* ══════════════════════════════════════════
   MILESTONES
══════════════════════════════════════════ */
async function loadRewards(force){
  if(!S.user||!S.udata)return;
  if(!force&&RW&&Date.now()-RW_T<20000){renderMilestones();initReferral();return;}
  const r=await wkCall('/account/rewards',{});
  const d=r.data;
  if(d&&d.ok&&Array.isArray(d.rewards)&&Number.isFinite(d.points)&&Number.isFinite(d.redeemablePts)){RW={points:d.points,redeemablePts:d.redeemablePts,lockedPts:Math.max(0,d.points-d.redeemablePts),ptDZD:d.ptDZD||10,refMaxPts:Number(d.refMaxPts)||0,refMinOrderDZD:Number(d.refMinOrderDZD)||0,rewards:d.rewards.filter(x=>x&&typeof x.id==='string'&&Number.isFinite(x.pts)&&x.pts>0)};RW_T=Date.now();S.udata.points=d.points;}
  renderMilestones();initReferral();renderMissions('missionsWrap');renderMissions('missionsWrapRw');
}
function renderMilestones(){
  const container=$('milestonesGrid');if(!container)return;
  const en=S.lang==='en';container.innerHTML='';
  if(!RW){container.innerHTML=`<p style="font-size:12px;color:var(--mid)">${t('rw_loading')}</p>`;return;}
  const sum=document.createElement('div');sum.className='ms-sum';
  sum.innerHTML=`<div><b>${RW.points.toLocaleString('en-US')}</b><span>${t('rw_bal')}</span></div><div class="ok"><b>${RW.redeemablePts.toLocaleString('en-US')}</b><span>${t('rw_avail')}</span></div><div class="lk"><b>${RW.lockedPts.toLocaleString('en-US')}</b><span>${t('rw_lock')}</span></div>`;
  container.appendChild(sum);
  RW.rewards.forEach(rw=>{
    const can=RW.redeemablePts>=rw.pts,haveEnough=RW.points>=rw.pts;
    const el=document.createElement('div');el.className='milestone-it'+(can?'':' locked');
    const name=en?(rw.nameEn||rw.name):rw.name;
    const miss=Math.max(0,rw.pts-RW.redeemablePts);
    const reqTxt=can?`${t('rw_cost')} ${rw.pts.toLocaleString('en-US')} ${t('t_pts')}`:`${t('rw_need')} ${miss.toLocaleString('en-US')} ${t('rw_more')}${haveEnough?' · '+t('t_rw_locked'):''}`;
    el.innerHTML=`
      <div class="ms-ico">🎁</div>
      <div class="ms-info">
        <div class="ms-name">${san(name)}</div>
        <div class="ms-desc">${rw.pts.toLocaleString('en-US')} ${t('t_pts')}</div>
        <div class="ms-req">${san(reqTxt)}</div>
        <div class="mi-prog-bar" style="margin-top:6px"><div class="mi-prog-fill" style="width:${Math.min(100,Math.floor(RW.redeemablePts/rw.pts*100))}%"></div></div>
      </div>
      <button class="ms-status ${can?'claim':'locked'}" ${can?`onclick="claimMilestone('${jsq(rw.id)}')"`:''} style="${!can?'cursor:default':''}">${can?t('rw_redeem'):t('rw_locked_btn')}</button>
    `;
    container.appendChild(el);
  });
}

window.claimMilestone=async function(rwId){
  if(!S.user||!S.udata){toast(t('t_login_first'),'terr');return;}
  if(!RL.ok('milestone',5,60000)){toast(t('t_too_many'),'twarn');return;}
  const rw=RW&&RW.rewards.find(x=>x.id===rwId);if(!rw)return;
  const r=await wkCall('/account/redeem',{id:rwId});
  if(r.data&&r.data.ok){
    S.udata.points=r.data.points;
    toast(t('t_rw_ok'),'tok');fireConfetti(50);
    await loadRewards(true);updProfUI();
  }else if(r.data&&r.data.reason==='points')toast(t('t_ms_pts'),'twarn');
  else if(r.data&&r.data.reason==='locked'){toast(t('t_rw_locked'),'twarn');loadRewards(true);}
  else toast(t('t_ms_error'),'terr');
};

/* the old "you can claim now" toasts are gone: what is redeemable depends on the Worker's answer, fetched on the rewards page */
function checkMilestones(){}

/* ══════════════════════════════════════════
   REFERRAL SYSTEM
══════════════════════════════════════════ */
function initReferral(){
  if(!S.user)return;
  const refId=S.user.uid.slice(0,12);
  const refUrl=`${location.origin}${location.pathname}?ref=${refId}`;
  const el=$('refLinkTxt');if(el)el.textContent=refUrl;
  setText('refCount',S.udata?.referrals||0);
  setText('refPts',(S.udata?.refPoints||0).toLocaleString('en-US'));
  const rd=$('refDesc');if(rd)rd.innerHTML=`${t('ref_desc')}${RW?`<br><strong style="color:var(--violet)">${t('ref_cap').replace('{n}',RW.refMaxPts.toLocaleString('en-US'))}</strong>`:''}<br><small style="color:var(--dim)">${t('ref_warning')}</small>`;
}

window.copyRefLink=function(){
  if(!S.user)return;
  const refUrl=`${location.origin}${location.pathname}?ref=${S.user.uid.slice(0,12)}`;
  copyText(refUrl).then(ok=>{if(ok)toast(t('t_ref_copied'),'tok');});
};

async function processReferral(){
  const url=new URLSearchParams(window.location.search);const ref=url.get('ref');
  if(!ref||!S.user||typeof ref!=='string'||ref.length>12)return;
  if(ref===S.user.uid.slice(0,12))return;
  const k=`gq_ref_${S.user.uid}`;if(LS.getItem(k))return;
  const r=await wkCall('/account/referral',{ref});
  if(r.data&&r.data.ok){LS.setItem(k,'1');toast(t('t_ref_done'),'tok');}
  else if(r.data&&(r.data.reason==='already'))LS.setItem(k,'1');
}

async function getFingerprint(){
  const data=[navigator.userAgent,navigator.language,screen.width,screen.height,Intl.DateTimeFormat().resolvedOptions().timeZone,navigator.hardwareConcurrency||'',navigator.deviceMemory||''].join('|');
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function checkAbuse(){
  if(!S.user)return;
  try{const fp=await getFingerprint();wkCall('/account/fp',{fp:fp.slice(0,16)});}catch(e){}
}

/* ══════════════════════════════════════════
   TIMERS
══════════════════════════════════════════ */
/* The home-page offer shows ONLY a coupon the owner marked "featured" in the admin panel (real code, real discount, real expiry). */
let _offerTimer=null;
async function initOffer(){
  try{const r=await wkCall('/offer',{},{auth:false});S._offer=(r.data&&r.data.ok)?r.data:null;}catch(e){S._offer=null;}
  renderOffer();
}
function renderOffer(){
  const card=$('offerCard');if(!card)return;
  clearInterval(_offerTimer);
  const o=S._offer;
  if(!o){card.classList.add('hidden');return;}
  const en=S.lang==='en';
  const endMs=o.expiry?Date.parse(o.expiry+'T23:59:59+01:00'):0;
  if(endMs&&Date.now()>endMs){card.classList.add('hidden');return;}
  card.classList.remove('hidden');
  setText('offerPct',o.type==='percent'?o.value+'%':Number(o.value).toLocaleString('en-US')+(en?' DZD':' دج'));
  setText('offerCode',o.code);
  const d=$('offerDesc');
  if(d){d.innerHTML=String(t('offer_desc')).split('\n').join('<br>');
    if(typeof o.left==='number'&&o.left>0&&o.left<=50)d.appendChild(Object.assign(document.createElement('div'),{textContent:en?`Only ${o.left} uses left`:`متبقي ${o.left} استخدام فقط`,style:'margin-top:4px;color:var(--gold,#f59e0b);font-size:12px'}));}
  const cnt=$('offerCnt');if(!cnt)return;
  if(!endMs){cnt.classList.add('hidden');return;}
  cnt.classList.remove('hidden');
  const tick=()=>{
    const rem=endMs-Date.now();
    if(rem<=0){card.classList.add('hidden');clearInterval(_offerTimer);return;}
    const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000),s=Math.floor((rem%60000)/1000);
    setText('offerCnt',`${String(h).padStart(2,'0')} : ${String(m).padStart(2,'0')} : ${String(s).padStart(2,'0')}`);
  };
  tick();_offerTimer=setInterval(tick,1000);
}

function initMissionTimer(){
  const update=()=>{
    const now=new Date();const end=new Date();end.setHours(23,59,59,0);const rem=end-now;
    const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000),s=Math.floor((rem%60000)/1000);
    setText('mTimer',`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
  };
  update();setInterval(update,1000);
}

/* ══════════════════════════════════════════
   NEWSLETTER
══════════════════════════════════════════ */
window.subscribeNL=async()=>{
  const e=($('nlEmail')?.value||'').trim();
  if(!e||!isValidEmail(e)){toast(t('t_email_invalid'),'terr');return;}
  if(!RL.ok('newsletter',3,300000)){toast(t('t_too_many'),'twarn');return;}
  wkCall('/newsletter/subscribe',{email:e},{auth:false});
  toast(t('t_subscribed'),'tok');if($('nlEmail'))$('nlEmail').value='';
};

/* ══════════════════════════════════════════
   SEARCH
══════════════════════════════════════════ */
$('searchInp')?.addEventListener('input',e=>{
  const q=e.target.value.trim().toLowerCase().slice(0,100);
  if(!q){if(S.currentPage==='shop')renderShopProds();return;}
  const filtered=PRODS.filter(p=>(p.name||'').toLowerCase().includes(q)||(p.sub||'').toLowerCase().includes(q)||(p.desc||'').toLowerCase().includes(q));
  if(S.currentPage!=='shop')goPage('shop');
  const g=$('shopProdsGrid');if(!g)return;g.innerHTML='';
  if(!filtered.length){g.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--mid)"><p>${t('shop_search_empty')} "${san(q)}"</p></div>`;return;}
  filtered.forEach(prod=>g.appendChild(buildProdCard(prod)));
});

/* ══════════════════════════════════════════
   SUPPORT BOT
══════════════════════════════════════════ */
function initSupportBot(){
  const chat=$('supportChat');if(!chat)return;
  chat.innerHTML='';currentSupportFlow='start';
  $('supportHumanBtn')?.classList.add('hidden');
  processSupportFlow('start');
}

function processSupportFlow(key){
  const flow=SUPPORT_FLOWS[key];if(!flow)return;
  currentSupportFlow=key;
  const msg=S.lang==='en'?(flow.msgEn||flow.msg):flow.msg;
  addSupportMsg(msg,'bot');
  const displayOpts=S.lang==='en'?(flow.optsEn||flow.opts||[]):(flow.opts||[]);
  const arOpts=flow.opts||[];
  setTimeout(()=>{
    renderSupportQuicks(displayOpts,arOpts);
    if(flow.human)$('supportHumanBtn')?.classList.remove('hidden');
    scrollSupportChat();
  },600);
}

function addSupportMsg(text,who){
  const chat=$('supportChat');if(!chat)return;
  const el=document.createElement('div');el.className=`sc-msg ${who}`;
  el.innerHTML=san(text).replace(/\n/g,'<br>');
  chat.appendChild(el);scrollSupportChat();
}
function scrollSupportChat(){const chat=$('supportChat');if(chat)chat.scrollTop=chat.scrollHeight;}

function renderSupportQuicks(displayOpts,arOpts){
  const qa=$('supportQuick');if(!qa)return;qa.innerHTML='';
  displayOpts.forEach((opt,idx)=>{
    const btn=document.createElement('button');btn.className='sq-btn';btn.textContent=opt;
    const key=arOpts[idx]||opt;
    btn.onclick=()=>clickSupportOpt(key,opt);
    qa.appendChild(btn);
  });
}

function clickSupportOpt(arKey,displayOpt){
  addSupportMsg(displayOpt,'user');
  const qa=$('supportQuick');if(qa)qa.innerHTML='';
  setTimeout(()=>{
    if(SUPPORT_FLOWS[arKey]){processSupportFlow(arKey);}
    else{
      const fallback=S.lang==='en'?'Let me find an answer...':'دعني أبحث عن إجابة...';
      addSupportMsg(fallback,'bot');
      setTimeout(()=>{
        const sorry=S.lang==='en'?'Please contact human support directly.':'يمكنك التواصل مع الدعم البشري مباشرة.';
        addSupportMsg(sorry,'bot');
        const hD=S.lang==='en'?['Contact human support','Back to start']:['التواصل مع الدعم البشري','عودة للبداية'];
        const hA=['التواصل مع الدعم البشري','عودة للبداية'];
        renderSupportQuicks(hD,hA);
        $('supportHumanBtn')?.classList.remove('hidden');
      },800);
    }
  },300);
}

window.sendSupportMsg=function(){
  const inp=$('supportInp');if(!inp)return;
  const txt=inp.value.trim().slice(0,400);if(!txt)return;inp.value='';
  addSupportMsg(txt,'user');
  const qa=$('supportQuick');if(qa)qa.innerHTML='';
  const low=txt.toLowerCase();
  setTimeout(()=>{
    if((low.includes('code')||low.includes('كود'))&&(low.includes('received')||low.includes('استلم')||low.includes('وصل')))processSupportFlow('لم أستلم كودي');
    else if(low.includes('wrong')||low.includes('خاطئ')||low.includes('غلط')||low.includes('not working')||low.includes('لا يعمل'))processSupportFlow('كودي خاطئ');
    else if(low.includes('payment')||low.includes('دفع')||low.includes('baridimob'))processSupportFlow('مشكلة في الدفع');
    else if(low.includes('region')||low.includes('ريجن'))processSupportFlow('سؤال عن الريجن');
    else if(low.includes('account')||low.includes('حساب')||low.includes('password')||low.includes('مرور'))processSupportFlow('مشكلة في الحساب');
    else if(low.includes('thank')||low.includes('شكر')||low.includes('تمام'))addSupportMsg(S.lang==='en'?"You're welcome! 😊":'على الرحب والسعة! 😊','bot');
    else{
      const sorry=S.lang==='en'?"I'll try to help. Would you like to speak with our team?":'سأحاول مساعدتك. هل تريد التحدث مع فريقنا مباشرة؟';
      addSupportMsg(sorry,'bot');
      setTimeout(()=>{
        const hD=S.lang==='en'?['Contact human support','Back to start']:['التواصل مع الدعم البشري','عودة للبداية'];
        const hA=['التواصل مع الدعم البشري','عودة للبداية'];
        renderSupportQuicks(hD,hA);
        $('supportHumanBtn')?.classList.remove('hidden');
      },600);
    }
  },800);
};
$('supportInp')?.addEventListener('keypress',e=>{if(e.key==='Enter')window.sendSupportMsg();});

window.contactHuman=function(){
  wkCall('/support/ping',{});
  const msg=`Hello Glitch Q 🎮\nI need help:\n👤 ${san(S.user?.displayName||'Guest')}\n🔑 ${S.user?.uid?.slice(0,8)||'—'}`;
  openWhatsApp(msg);toast(t('t_redirect_human'),'tok');
};

/* ══════════════════════════════════════════
   REPORT
══════════════════════════════════════════ */
window.submitReport=async()=>{
  const title=san(($('rptTitle')?.value||'').trim()).slice(0,100);
  const category=$('rptCategory')?.value||'';
  const desc=san(($('rptDesc')?.value||'').trim()).slice(0,1000);
  const orderId=san(($('rptOrderId')?.value||'').trim()).slice(0,50);
  if(!title){toast(t('t_report_title_req'),'terr');return;}
  if(!category){toast(t('t_report_cat_req'),'terr');return;}
  if(!desc||desc.length<20){toast(t('t_report_desc_req'),'terr');return;}
  if(!RL.ok('report',3,300000)){toast(t('t_too_many'),'twarn');return;}
  const files={};
  if($('rptFile')?.files?.length>0){const ok=await validImg($('rptFile').files[0]);if(ok)files.photo=$('rptFile').files[0];}
  const r=await wkCall('/report/create',{title,category,desc,orderId},{form:true,files});
  if(r.data&&r.data.ok){
    toast(t('t_report_sent'),'tok');closeM('reportModal');
    [$('rptTitle'),$('rptDesc'),$('rptOrderId')].forEach(el=>{if(el)el.value='';});
    if($('rptCategory'))$('rptCategory').value='';clearRptUp();
  }else toast(r.status===429?t('t_too_many'):t('t_report_error'),'terr');
};

/* ══════════════════════════════════════════
   FAQ
══════════════════════════════════════════ */
function renderFAQ(){
  const list=$('faqList');if(!list)return;list.innerHTML='';
  db.collection('settings').doc('faqs').get().then(d=>{
    const faqs=d.exists&&d.data().faqs?.length?d.data().faqs:FAQ_DATA;
    renderFAQList(list,faqs);
  }).catch(()=>renderFAQList(list,FAQ_DATA));
}

function renderFAQList(list,faqs){
  list.innerHTML='';
  faqs.forEach(item=>{
    const q=S.lang==='en'?(item.qEn||item.q||String(item)):String(item.q||item);
    const a=S.lang==='en'?(item.aEn||item.a||''):String(item.a||'');
    const el=document.createElement('div');el.className='faq-it';
    const qBtn=document.createElement('button');qBtn.className='faq-q';qBtn.textContent=q;
    const aDiv=document.createElement('div');aDiv.className='faq-a';
    aDiv.innerHTML=san(a).replace(/\n/g,'<br>');
    qBtn.addEventListener('click',()=>{
      const was=el.classList.contains('open');
      document.querySelectorAll('.faq-it.open').forEach(x=>x.classList.remove('open'));
      if(!was)el.classList.add('open');
    });
    el.appendChild(qBtn);el.appendChild(aDiv);list.appendChild(el);
  });
}

/* ══════════════════════════════════════════
   DOM READY
══════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded',async()=>{
  /* Safety timeout للـ loader */
  setTimeout(()=>{const l=$('loader');if(l&&!l.classList.contains('gone'))l.classList.add('gone');},10000);

  runLoader();initStars();

  /* Apply language */
  const html=$('htmlTag');
  if(html){html.setAttribute('lang',S.lang);html.setAttribute('dir',S.lang==='ar'?'rtl':'ltr');}
  setText('langLbl',S.lang.toUpperCase());

  /* Consent + region are decided from local state, so they show up immediately
     (before, they waited for the Firestore round-trip: 5s+ on slow networks) */
  try{applyTranslations();}catch(e){}
  initConsent();
  applyRegionConfig(REG_CFG);

  /* Catalogue: paint at once from the last visit if we have one; otherwise wait up to 2.5s for Firebase.
     The fresh copy always keeps loading in the background and replaces what is on screen when it arrives. */
  const cached=readSettingsCache();
  if(cached){CATS=cached.cats;PRODS=cached.prods;if(cached.disc)DISC=cached.disc;}
  const live=loadSettings().catch(()=>false);
  let late=!!cached;
  if(!cached){
    const ok=await Promise.race([live,new Promise(r=>setTimeout(()=>r('slow'),2500))]);
    if(ok===false)return;                                   /* maintenance page is already showing */
    if(ok==='slow'){PRODS=DEFAULT_PRODS;CATS=DEFAULT_CATS;late=true;}
  }
  if(late)live.then(ok=>{if(ok===false)return;try{renderHome();if(S.currentPage==='shop'){renderCatFilterBar();renderShopProds();}}catch(e){}});

  S.ready=true;updateCartBadge();updHeaderUI();

  /* Apply all translations */
  applyTranslations();

  /* Render home */
  renderHome();

  /* URL params */
  const url=new URLSearchParams(window.location.search);
  if(url.get('mode')==='resetPassword'&&url.get('oobCode')){
    /* old links that land on the main site go to the branded reset page */
    window.location.replace('reset.html'+window.location.search);
    return;
  }
  maybePromptRegion();

  /* Clock */
  setInterval(()=>{
    const now=new Date();
    const timeStr=now.toLocaleTimeString(S.lang==='ar'?'ar-u-nu-latn':'en-US');
    const timeEl=document.getElementById('topbarTime');
    if(timeEl)timeEl.textContent=timeStr;
  },1000);
});
