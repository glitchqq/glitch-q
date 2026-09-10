/* ═══════════════════════════════════════════
   GLITCH Q — script.js v10.0 FINAL RELEASE
   Security hardened + Full bilingual AR/EN
   Cloudflare Proxy: glitchq-proxy
═══════════════════════════════════════════ */
'use strict';

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
const WORKER="https://glitchq-proxy.glitchqq.workers.dev";
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
    hero_welcome:'مرحباً بك في',hero_tagline:'عالم الجيمينج بلا حدود',
    hero_desc:'بطاقات PlayStation الأصلية • شحن فوري • دفع آمن',
    hero_shop:'تسوق الآن',hero_explore:'استكشف المتجر',
    feat_pay:'دفع 100% آمن',feat_pay_sub:'حماية ببياناتك',
    feat_fast:'شحن فوري',feat_fast_sub:'خلال ثوانٍ',
    feat_orig:'منتجات أصلية',feat_orig_sub:'100% معتمدة',
    feat_sup:'دعم 24/7',feat_sup_sub:'نحن هنا لمساعدتك',
    feat_pts:'نقاط مكافآت',feat_pts_sub:'اكسب كل عملية شراء',
    sec_featured:'بطاقات مميزة',sec_cats:'تصفح الفئات',
    sec_leaders:'أفضل المتصدرين',sec_missions:'مهام يومية',
    sec_offer:'⏰ عرض خاص',see_all:'عرض الكل',
    shop_title:'🛒 المتجر',shop_sub:'اختر من بين مجموعة واسعة من المنتجات',
    shop_all:'الكل',shop_empty:'لا توجد منتجات في هذه الفئة',
    shop_search_empty:'لا نتائج لـ',
    prod_oos:'نفذ مؤقتاً',prod_order:'اطلب الآن',prod_cart:'أضف للسلة',
    prod_val:'القيمة',month:'شهر',copy:'نسخة رقمية',
    cart_title:'🛒 السلة',cart_empty:'السلة فارغة',
    cart_total:'المجموع',cart_checkout:'متابعة الشراء',
    co_title:'🧾 إتمام الطلب',co_cpn:'كوبون الخصم (اختياري)',
    co_apply:'تطبيق',co_total:'المبلغ الإجمالي',
    co_baridimob:'BaridiMob',co_hand:'يد بيد',
    co_rip:'RIP للتحويل',co_name:'الاسم الكامل (كما في بريدي موب)',
    co_upload:'ارفع صورة الوصل (max 5MB)',
    co_hand_note:'التسليم يد بيد في ولاية تلمسان فقط',
    co_phone:'رقم هاتفك',co_email_recv:'البريد لاستلام الكود',
    co_submit:'إرسال الطلب',co_email_tab:'إيميل',co_phone_tab:'هاتف',
    login_title:'تسجيل الدخول',login_sub:'سجل دخولك لتجميع النقاط والمكافآت',
    login_email:'البريد الإلكتروني',login_pass:'كلمة المرور',
    login_btn:'دخول',login_forgot:'نسيت كلمة المرور؟',
    login_guest:'تسوق كزائر',login_no_acc:'ليس لديك حساب؟',login_reg:'سجل الآن',
    reg_title:'إنشاء حساب',reg_sub:'احصل على 10 نقاط ترحيبية فوراً!',
    reg_first:'الاسم',reg_last:'اللقب',reg_pass:'كلمة المرور (6+)',
    reg_conf:'تأكيد كلمة المرور',reg_btn:'إنشاء الحساب',
    reg_have_acc:'لديك حساب؟',reg_login:'سجل دخولك',
    verify_title:'تحقق من إيميلك',
    verify_sub:'أرسلنا لك رابط التفعيل. افتح بريدك واضغط الرابط.',
    verify_resend:'إعادة الإرسال',verify_login:'تسجيل الدخول',
    region_title:'اختر ريجنك',region_sub:'حدد ريجن PlayStation لعرض الأسعار الصحيحة',
    rw_title:'⭐ النقاط والمكافآت',rw_pts_hint:'كل 1000 دج = نقطة · 500 نقطة = خصم 5%',
    rw_ms_desc:'اجمع النقاط واحصل على بطاقات مجانية!',
    ref_link_title:'🔗 رابط الدعوة الخاص بك',
    ref_desc:'شارك رابطك مع أصدقائك. عند تسجيلهم تحصل على 1000 نقطة لكل صديق!',
    ref_warning:'⚠️ لا يعمل مع حسابات من نفس الجهاز أو الشبكة',
    ref_copy:'نسخ',ref_friends:'صديق مدعو',ref_pts_label:'نقطة من الدعوات',
    ref_login_hint:'سجل دخولك لعرض رابطك',
    prof_title:'👤 حسابي',prof_login:'سجل دخولك',
    prof_login_sub:'لتجميع النقاط وتتبع طلباتك',
    prof_login_btn:'دخول / تسجيل',prof_orders:'📦 آخر طلباتك',
    prof_logout:'تسجيل الخروج',prof_track:'تتبع',
    prof_region:'الريجن',prof_rate:'تقييم',prof_rewards:'مكافآت',
    pts_label:'نقطة',
    sup_title:'🎧 الدعم الفني',sup_sub:'نحن هنا لمساعدتك في أي وقت',
    sup_card1:'الدعم الفني',sup_card1s:'تحدث مع بوت الدعم الذكي',
    sup_card2:'الإبلاغ عن مشكلة',sup_card2s:'أرسل بلاغاً مفصلاً للإدارة',
    sup_card3:'تتبع الطلبات',sup_card3s:'تتبع حالة طلبك برقم الطلب',
    sup_card4:'الأسئلة الشائعة',sup_card4s:'إجابات على أكثر الأسئلة شيوعاً',
    sup_card5:'واتساب',sup_card5s:'تواصل معنا مباشرة — يفتح المحادثة فوراً',
    sup_card6:'البريد الإلكتروني',sup_card6s:'glitchq1q@gmail.com',
    consent_title:'مرحباً بك في Glitch Q!',
    consent_accept:'✅ قبول والمتابعة',consent_reject:'رفض',
    spin_title:'Lucky Spin',spin_sub:'دوّر العجلة واربح نقاطاً! سبين واحد يومياً',
    spin_btn:'أدِر العجلة 🎲',
    bot_title:'مساعد الدعم الفني',bot_sub:'سأساعدك في حل مشكلتك',
    human_btn:'تواصل مع الدعم البشري',
    report_title:'الإبلاغ عن مشكلة',report_sub:'سيتم إرسال بلاغك مباشرة إلى الإدارة',
    report_attach:'إرفاق صورة (اختياري)',
    rating_title:'قيّم تجربتك',rating_comment:'تعليق اختياري...',
    rating_submit:'إرسال التقييم',rating_skip:'تخطي',
    track_title:'تتبع طلبك',track_placeholder:'رقم الطلب...',track_btn:'تتبع',
    track_not_found:'❌ رقم الطلب غير موجود',track_error:'حدث خطأ',
    faq_title:'❓ الأسئلة الشائعة',
    nl_title:'اشترك في نشرتنا البريدية',
    nl_sub:'احصل على آخر العروض والخصومات الحصرية',
    nl_placeholder:'بريدك الإلكتروني...',nl_btn:'اشتراك ✓',
    notif_title:'🔔 الإشعارات',notif_empty:'لا توجد إشعارات',
    choose_region:'اختر الريجن',
    f_copy:'GLITCH Q 2026 © جميع الحقوق محفوظة',
    f_brand:'المتجر الأول لعشاق الجيمينج في الجزائر.',
    offer_title:'⏰ عرض خاص',offer_desc:'خصم على جميع البطاقات\nاستخدم الكود:',
    offer_shop:'تسوق الآن',all_missions:'عرض جميع المهام',
    leaders_spin:'Lucky Spin للنقاط',
    my_acc:'حسابي',my_pts:'نقاطي',track_order:'تتبع طلب',logout_txt:'خروج',
    loading_txt:'جاري التحميل...',loading_init:'تهيئة المتجر...',
    loading_data:'تحميل البيانات...',loading_done:'أهلاً بك! 🎮',
    order_pend:'🆕 قيد المراجعة',order_proc:'⚙️ قيد المعالجة',
    order_done:'✅ تم التسليم',order_rej:'❌ مرفوض',
    or_text:'أو',send_support_placeholder:'اكتب مشكلتك...',
    t_added_cart:'✅ أضيف للسلة',t_oos:'المنتج نفذ مؤقتاً',
    t_login_first:'سجل دخولك أولاً',t_region_done:'✅ ريجن',
    t_copied:'تم النسخ',t_spin_daily:'سبين واحد يومياً فقط!',
    t_spin_next:'السبين القادم بعد',t_sending:'جاري الإرسال...',
    t_order_sent:'🎉 تم إرسال طلبك! سيصلك الكود قريباً',
    t_pts:'نقطة',t_lang_changed:'تم تغيير اللغة',
    t_consent_ok:'شكراً على موافقتك! مرحباً بك في Glitch Q 🎮',
    t_subscribed:'تم الاشتراك! ✅',t_email_invalid:'أدخل إيميلاً صحيحاً',
    t_terms_required:'يجب الموافقة على الشروط والأحكام',
    t_name_required:'أدخل الاسم واللقب',t_pass_mismatch:'كلمة المرور غير متطابقة',
    t_pass_short:'6 أحرف على الأقل',t_email_exists:'الإيميل مسجل مسبقاً',
    t_weak_pass:'كلمة مرور ضعيفة',t_login_error:'خطأ في البريد أو كلمة المرور',
    t_verify_first:'فعّل حسابك من إيميلك أولاً',
    t_reg_done:'تم التسجيل! تحقق من إيميلك 📧',
    t_reset_sent:'تم إرسال رابط التعيين',t_reset_error:'إيميل غير موجود',
    t_no_email:'أدخل إيميلك',t_logged_out:'تم تسجيل الخروج',
    t_welcome:'أهلاً بك! 🎉',t_coupon_invalid:'❌ كوبون غير صحيح',
    t_enter_cpn:'أدخل الكوبون',t_rip_copied:'تم نسخ الـ RIP ✅',
    t_name_full:'أدخل اسمك الكامل',t_upload_receipt:'أرفق صورة الوصل',
    t_img_invalid:'صورة غير صالحة',t_phone_required:'أدخل رقم هاتفك',
    t_too_many:'طلبات كثيرة، حاول بعد دقيقة',t_conn_error:'تحقق من الاتصال',
    t_streak_done:'استلمت مكافأتك اليوم بالفعل!',
    t_streak_reward:'✅ مكافأة اليوم!',t_badge_new:'شارة جديدة',
    t_ref_copied:'تم نسخ رابط الدعوة! 🎉',
    t_ref_self:'لا يمكن الإحالة من نفس الجهاز',
    t_ref_done:'تم تسجيل دعوتك! 🎉 صاحبك ربح 1000 نقطة',
    t_ms_pts:'تحتاج نقاط للحصول على هذه المكافأة',
    t_ms_claimed:'استلمت هذه المكافأة مسبقاً',
    t_ms_spend:'يجب أن تصرف على الأقل',
    t_ms_notify:'يمكنك الآن استلام',t_ms_notify2:'اذهب لقسم المكافآت',
    t_ms_error:'حدث خطأ',t_redirect_human:'تم توجيهك للدعم البشري',
    t_report_title_req:'أدخل عنوان المشكلة',
    t_report_cat_req:'اختر نوع المشكلة',
    t_report_desc_req:'أدخل وصفاً تفصيلياً (20 حرف على الأقل)',
    t_report_sent:'✅ تم إرسال بلاغك! سنتواصل معك قريباً',
    t_report_error:'حدث خطأ، حاول مرة أخرى',
    t_star_select:'اختر النجوم',t_rating_done:'شكراً! ⭐',
    t_choose_prod:'اختر منتجاً أولاً',
    t_maintenance:'الموقع في وضع الصيانة. نعود قريباً 🔧',
    t_error:'حدث خطأ',t_banned:'تم تعليق حسابك.',
    t_processing:'جاري المعالجة...',
  },
  en:{
    nav_home:'Home',nav_shop:'Shop',nav_subs:'Subscriptions',
    nav_games:'Game Credits',nav_rewards:'Points & Rewards',nav_support:'Support',
    hero_welcome:'Welcome to',hero_tagline:'Gaming World Without Limits',
    hero_desc:'Original PlayStation Cards • Instant Delivery • Secure Payment',
    hero_shop:'Shop Now',hero_explore:'Explore Store',
    feat_pay:'100% Secure Payment',feat_pay_sub:'Your data is protected',
    feat_fast:'Instant Delivery',feat_fast_sub:'Within seconds',
    feat_orig:'Original Products',feat_orig_sub:'100% certified',
    feat_sup:'24/7 Support',feat_sup_sub:'We are here to help',
    feat_pts:'Reward Points',feat_pts_sub:'Earn on every purchase',
    sec_featured:'Featured Cards',sec_cats:'Browse Categories',
    sec_leaders:'Top Players',sec_missions:'Daily Missions',
    sec_offer:'⏰ Special Offer',see_all:'View All',
    shop_title:'🛒 Shop',shop_sub:'Choose from a wide range of products',
    shop_all:'All',shop_empty:'No products in this category',
    shop_search_empty:'No results for',
    prod_oos:'Out of Stock',prod_order:'Order Now',prod_cart:'Add to Cart',
    prod_val:'Value',month:'Month',copy:'Digital Copy',
    cart_title:'🛒 Cart',cart_empty:'Cart is empty',
    cart_total:'Total',cart_checkout:'Proceed to Checkout',
    co_title:'🧾 Complete Order',co_cpn:'Discount Coupon (optional)',
    co_apply:'Apply',co_total:'Total Amount',
    co_baridimob:'BaridiMob',co_hand:'Hand Delivery',
    co_rip:'Transfer RIP',co_name:'Full Name (as in BaridiMob)',
    co_upload:'Upload receipt image (max 5MB)',
    co_hand_note:'Hand delivery in Tlemcen only',
    co_phone:'Your phone number',co_email_recv:'Email to receive code',
    co_submit:'Submit Order',co_email_tab:'Email',co_phone_tab:'Phone',
    login_title:'Sign In',login_sub:'Sign in to collect points and rewards',
    login_email:'Email address',login_pass:'Password',
    login_btn:'Sign In',login_forgot:'Forgot password?',
    login_guest:'Shop as Guest',login_no_acc:"Don't have an account?",login_reg:'Register Now',
    reg_title:'Create Account',reg_sub:'Get 10 welcome points instantly!',
    reg_first:'First Name',reg_last:'Last Name',reg_pass:'Password (6+)',
    reg_conf:'Confirm Password',reg_btn:'Create Account',
    reg_have_acc:'Already have an account?',reg_login:'Sign In',
    verify_title:'Verify Your Email',
    verify_sub:'We sent you a verification link. Open your email and click it.',
    verify_resend:'Resend Email',verify_login:'Sign In',
    region_title:'Choose Your Region',region_sub:'Select your PlayStation region',
    rw_title:'⭐ Points & Rewards',rw_pts_hint:'Every 1000 DZD = 1 point · 500 points = 5% discount',
    rw_ms_desc:'Collect points and get free cards!',
    ref_link_title:'🔗 Your Referral Link',
    ref_desc:'Share your link with friends. Get 1000 points per friend!',
    ref_warning:'⚠️ Does not work with accounts from the same device',
    ref_copy:'Copy',ref_friends:'Friends invited',ref_pts_label:'Points from referrals',
    ref_login_hint:'Sign in to view your link',
    prof_title:'👤 My Account',prof_login:'Sign In',
    prof_login_sub:'To collect points and track your orders',
    prof_login_btn:'Sign In / Register',prof_orders:'📦 Recent Orders',
    prof_logout:'Sign Out',prof_track:'Track',
    prof_region:'Region',prof_rate:'Rate',prof_rewards:'Rewards',
    pts_label:'points',
    sup_title:'🎧 Support',sup_sub:'We are here to help you anytime',
    sup_card1:'Technical Support',sup_card1s:'Chat with our smart support bot',
    sup_card2:'Report an Issue',sup_card2s:'Send a detailed report to management',
    sup_card3:'Track Orders',sup_card3s:'Track your order status',
    sup_card4:'FAQ',sup_card4s:'Answers to common questions',
    sup_card5:'WhatsApp',sup_card5s:'Contact us directly',
    sup_card6:'Email',sup_card6s:'glitchq1q@gmail.com',
    consent_title:'Welcome to Glitch Q!',
    consent_accept:'✅ Accept & Continue',consent_reject:'Decline',
    spin_title:'Lucky Spin',spin_sub:'Spin the wheel and win points! One spin per day',
    spin_btn:'Spin the Wheel 🎲',
    bot_title:'Support Assistant',bot_sub:'I will help you solve your issue',
    human_btn:'Contact Human Support',
    report_title:'Report an Issue',report_sub:'Your report will be sent to management',
    report_attach:'Attach image (optional)',
    rating_title:'Rate Your Experience',rating_comment:'Optional comment...',
    rating_submit:'Submit Rating',rating_skip:'Skip',
    track_title:'Track Your Order',track_placeholder:'Order number...',track_btn:'Track',
    track_not_found:'❌ Order number not found',track_error:'An error occurred',
    faq_title:'❓ FAQ',
    nl_title:'Subscribe to our Newsletter',
    nl_sub:'Get the latest offers and exclusive discounts',
    nl_placeholder:'Your email address...',nl_btn:'Subscribe ✓',
    notif_title:'🔔 Notifications',notif_empty:'No notifications',
    choose_region:'Choose Region',
    f_copy:'GLITCH Q 2026 © All Rights Reserved',
    f_brand:'The #1 gaming store in Algeria.',
    offer_title:'⏰ Special Offer',offer_desc:'Discount on all cards\nUse code:',
    offer_shop:'Shop Now',all_missions:'View All Missions',
    leaders_spin:'Lucky Spin for Points',
    my_acc:'My Account',my_pts:'My Points',track_order:'Track Order',logout_txt:'Sign Out',
    loading_txt:'Loading...',loading_init:'Initializing store...',
    loading_data:'Loading data...',loading_done:'Welcome! 🎮',
    order_pend:'🆕 Under Review',order_proc:'⚙️ Processing',
    order_done:'✅ Delivered',order_rej:'❌ Rejected',
    or_text:'or',send_support_placeholder:'Type your issue...',
    t_added_cart:'✅ Added to cart',t_oos:'Product is out of stock',
    t_login_first:'Please sign in first',t_region_done:'✅ Region',
    t_copied:'Copied',t_spin_daily:'One spin per day only!',
    t_spin_next:'Next spin in',t_sending:'Sending...',
    t_order_sent:'🎉 Order sent! Your code will arrive shortly',
    t_pts:'points',t_lang_changed:'Language changed',
    t_consent_ok:'Thank you! Welcome to Glitch Q 🎮',
    t_subscribed:'Subscribed! ✅',t_email_invalid:'Enter a valid email',
    t_terms_required:'You must agree to the terms',
    t_name_required:'Enter first and last name',t_pass_mismatch:'Passwords do not match',
    t_pass_short:'At least 6 characters',t_email_exists:'Email already registered',
    t_weak_pass:'Weak password',t_login_error:'Invalid email or password',
    t_verify_first:'Please verify your email first',
    t_reg_done:'Registered! Check your email 📧',
    t_reset_sent:'Password reset link sent',t_reset_error:'Email not found',
    t_no_email:'Enter your email',t_logged_out:'Signed out',
    t_welcome:'Welcome! 🎉',t_coupon_invalid:'❌ Invalid coupon',
    t_enter_cpn:'Enter coupon code',t_rip_copied:'RIP copied ✅',
    t_name_full:'Enter your full name',t_upload_receipt:'Upload receipt image',
    t_img_invalid:'Invalid image',t_phone_required:'Enter your phone number',
    t_too_many:'Too many requests, try again in a minute',t_conn_error:'Check your connection',
    t_streak_done:"Already claimed today's reward!",
    t_streak_reward:"✅ Today's reward!",t_badge_new:'New Badge',
    t_ref_copied:'Referral link copied! 🎉',
    t_ref_self:'Cannot refer from same device',
    t_ref_done:'Referral registered! 🎉 Your friend earned 1000 points',
    t_ms_pts:'You need points for this reward',
    t_ms_claimed:'Already claimed this reward',
    t_ms_spend:'You must spend at least',
    t_ms_notify:'You can now claim',t_ms_notify2:'Go to Rewards section',
    t_ms_error:'An error occurred',t_redirect_human:'Redirected to human support',
    t_report_title_req:'Enter issue title',
    t_report_cat_req:'Select issue type',
    t_report_desc_req:'Enter detailed description (min 20 chars)',
    t_report_sent:'✅ Report submitted! We will contact you soon',
    t_report_error:'An error occurred, please try again',
    t_star_select:'Select stars',t_rating_done:'Thank you! ⭐',
    t_choose_prod:'Choose a product first',
    t_maintenance:'Site is under maintenance. Back soon 🔧',
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
  const navKeys=['nav_home','nav_shop','nav_subs','nav_games','nav_rewards'];
  navItems.forEach((a,i)=>{if(navKeys[i])a.textContent=t(navKeys[i]);});
  const nav5=document.querySelector('.nav-ul li:last-child a');
  if(nav5)nav5.innerHTML=`${t('nav_support')} <span class="nav-live">·</span>`;

  // Hero
  st('heroWelcome',t('hero_welcome'));st('heroTagline',t('hero_tagline'));
  st('heroDesc',t('hero_desc'));st('heroShopBtn',t('hero_shop'));
  st('heroExploreBtn',t('hero_explore'));

  // Features
  st('feat1T',t('feat_pay'));st('feat1S',t('feat_pay_sub'));
  st('feat2T',t('feat_fast'));st('feat2S',t('feat_fast_sub'));
  st('feat3T',t('feat_orig'));st('feat3S',t('feat_orig_sub'));
  st('feat4T',t('feat_sup'));st('feat4S',t('feat_sup_sub'));
  st('feat5T',t('feat_pts'));st('feat5S',t('feat_pts_sub'));

  // Home sections
  st('featuredTitle',t('sec_featured'));st('seeAllBtn',t('see_all'));
  st('catsTitle',t('sec_cats'));st('leadersTitle',t('sec_leaders'));
  st('missionsTitle',t('sec_missions'));st('offerTitle',t('offer_title'));
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
  const profActs=document.querySelectorAll('.pact span');
  const profActKeys=['prof_track','prof_region','prof_rate',null,'prof_rewards'];
  profActs.forEach((s,i)=>{if(profActKeys[i])s.textContent=t(profActKeys[i]);});

  // Support
  st('supportTitle',t('sup_title'));st('supportSub',t('sup_sub'));
  const supCards=document.querySelectorAll('.sup-card');
  const supData=[['sup_card1','sup_card1s'],['sup_card2','sup_card2s'],['sup_card3','sup_card3s'],['sup_card4','sup_card4s'],['sup_card5','sup_card5s'],['sup_card6','sup_card6s']];
  supCards.forEach((c,i)=>{if(supData[i]){const h=c.querySelector('h3');const p=c.querySelector('p');if(h)h.textContent=t(supData[i][0]);if(p)p.textContent=t(supData[i][1]);}});

  // Auth
  st('loginTitle',t('login_title'));st('loginSub',t('login_sub'));
  sp('loginEmail','placeholder',t('login_email'));sp('loginPass','placeholder',t('login_pass'));
  st('loginBtn',t('login_btn'));st('forgotBtn',t('login_forgot'));
  st('guestBtn',t('login_guest'));st('noAccText',t('login_no_acc'));st('goRegBtn',t('login_reg'));
  st('regTitle',t('reg_title'));st('regSub',t('reg_sub'));
  sp('regFirst','placeholder',t('reg_first'));sp('regLast','placeholder',t('reg_last'));
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
  st('handNote',t('co_hand_note'));sp('handPhone','placeholder',t('co_phone'));
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
let PRODS=[],CATS=[],CPNS={},DISC={active:false,value:0};
const S={
  lang:localStorage.getItem('gq_lang')||'ar',
  region:localStorage.getItem('gq_reg')||null,
  cur:localStorage.getItem('gq_cur')||'EUR',
  sym:localStorage.getItem('gq_sym')||'€',
  user:null,udata:null,
  cart:JSON.parse(localStorage.getItem('gq_cart')||'[]'),
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
  {id:'psstore',name:'بطاقات PlayStation',nameEn:'PlayStation Cards',icon:'<i class="fa-brands fa-playstation"></i>',bg:'linear-gradient(135deg,#003087,#0066cc)',enabled:true,order:1},
  {id:'psplus',name:'اشتراكات PS Plus',nameEn:'PS Plus Subscriptions',icon:'👑',bg:'linear-gradient(135deg,#b45309,#f59e0b)',enabled:true,order:2},
  {id:'games',name:'ألعاب رقمية',nameEn:'Digital Games',icon:'🎮',bg:'linear-gradient(135deg,#203a43,#2c5364)',enabled:true,order:3},
];
const DEFAULT_PRODS=[
  {id:'ps5eu',cat:'psstore',name:'PS Store Card',sub:'France 🇫🇷',val:5,cur:'EUR',sym:'€',priceDZD:7300,stock:true,img:'ps',badge:''},
  {id:'ps10eu',cat:'psstore',name:'PS Store Card',sub:'France 🇫🇷',val:10,cur:'EUR',sym:'€',priceDZD:13900,stock:true,img:'ps',badge:''},
  {id:'ps20eu',cat:'psstore',name:'PS Store Card',sub:'France 🇫🇷',val:20,cur:'EUR',sym:'€',priceDZD:27500,stock:true,img:'ps',badge:''},
  {id:'ps50eu',cat:'psstore',name:'PS Store Card',sub:'France 🇫🇷',val:50,cur:'EUR',sym:'€',priceDZD:67300,stock:false,img:'ps',badge:''},
  {id:'ps5us',cat:'psstore',name:'PS Store Card',sub:'USA 🇺🇸',val:5,cur:'USD',sym:'$',priceDZD:6500,stock:true,img:'ps',badge:''},
  {id:'ps10us',cat:'psstore',name:'PS Store Card',sub:'USA 🇺🇸',val:10,cur:'USD',sym:'$',priceDZD:12900,stock:true,img:'ps',badge:''},
  {id:'psp1',cat:'psplus',name:'PS Plus Essential',sub:'1 شهر 🇫🇷',val:1,cur:'month',sym:'',priceDZD:2100,stock:true,img:'plus',badge:'Essential'},
  {id:'psp3',cat:'psplus',name:'PS Plus Extra',sub:'3 أشهر 🇫🇷',val:3,cur:'month',sym:'',priceDZD:7500,stock:true,img:'plus',badge:'Extra'},
  {id:'psp12',cat:'psplus',name:'PS Plus Premium',sub:'12 شهر 🇫🇷',val:12,cur:'month',sym:'',priceDZD:18900,stock:true,img:'plus',badge:'Premium'},
  {id:'g1',cat:'games',name:'EA FC 25',sub:'PS5 Digital',val:1,cur:'copy',sym:'',priceDZD:8500,stock:true,img:null,badge:'New',desc:'أحدث إصدار من ألعاب كرة القدم',descEn:'Latest soccer game release'},
  {id:'g2',cat:'games',name:'GTA VI',sub:'PS5 Digital',val:1,cur:'copy',sym:'',priceDZD:12000,stock:false,img:null,badge:'',desc:'اللعبة الأكثر انتظاراً في التاريخ',descEn:'The most anticipated game in history'},
  {id:'g3',cat:'games',name:'God of War',sub:'PS4/PS5',val:1,cur:'copy',sym:'',priceDZD:6500,stock:true,img:null,badge:'',desc:'مغامرة ملحمية لا مثيل لها',descEn:'An unparalleled epic adventure'},
];
const BADGES=[
  {id:'newcomer',icon:'🌟',name:'مبتدئ',nameEn:'Newcomer',check:_=>true},
  {id:'firstbuy',icon:'🛒',name:'أول طلب',nameEn:'First Order',check:u=>(u.orders||0)>=1},
  {id:'fan5',icon:'🎮',name:'محب',nameEn:'Fan',check:u=>(u.orders||0)>=5},
  {id:'fan10',icon:'🎯',name:'متمرس',nameEn:'Pro',check:u=>(u.orders||0)>=10},
  {id:'reviewer',icon:'⭐',name:'المُقيِّم',nameEn:'Reviewer',check:u=>(u.ratings||0)>=1},
  {id:'spinner',icon:'🎰',name:'المحظوظ',nameEn:'Lucky',check:u=>(u.spins||0)>=1},
  {id:'pts500',icon:'💎',name:'500 نقطة',nameEn:'500 Points',check:u=>(u.points||0)>=500},
  {id:'streak7',icon:'🔥',name:'أسبوع',nameEn:'Week',check:u=>(u.streak||0)>=7},
  {id:'sharer',icon:'📣',name:'المُروِّج',nameEn:'Promoter',check:u=>(u.shares||0)>=1},
  {id:'referrer',icon:'👥',name:'الداعية',nameEn:'Referrer',check:u=>(u.referrals||0)>=1},
];
const FAQ_DATA=[
  {q:'كيف أشتري بطاقة PlayStation؟',qEn:'How do I buy a PlayStation card?',a:'اختر البطاقة من المتجر، اضغط "اطلب الآن"، ادفع عبر BaridiMob أو يد بيد، وارفع وصل الدفع. سيصلك الكود خلال 5-60 دقيقة.',aEn:'Choose the card from the store, click "Order Now", pay via BaridiMob or hand delivery, and upload the receipt. The code will arrive within 5-60 minutes.'},
  {q:'ما هو الريجن وكيف أختاره؟',qEn:'What is a region and how do I choose it?',a:'الريجن هو منطقة حساب PlayStation. EU للأوروبية، US للأمريكية.',aEn:'The region is your PlayStation account region. EU for European, US for American.'},
  {q:'كم يستغرق استلام الكود؟',qEn:'How long does it take to receive the code?',a:'عادةً 5 إلى 60 دقيقة من التحقق من الدفع.',aEn:'Usually 5 to 60 minutes after payment verification.'},
  {q:'هل يمكن الاسترجاع بعد إرسال الكود؟',qEn:'Can I get a refund after the code is sent?',a:'لا. بمجرد إرسال الكود لا يتم الاسترجاع.',aEn:'No. Once the code is sent, no refunds are possible.'},
  {q:'ما هي طرق الدفع المتاحة؟',qEn:'What payment methods are available?',a:'BaridiMob: RIP 00799999004390466974\nيد بيد: في ولاية تلمسان فقط.',aEn:'BaridiMob: RIP 00799999004390466974\nHand delivery: In Tlemcen only.'},
  {q:'كيف أتواصل معكم؟',qEn:'How can I contact you?',a:'واتساب: 213658996502\nإيميل: glitchq1q@gmail.com',aEn:'WhatsApp: 213658996502\nEmail: glitchq1q@gmail.com'},
  {q:'كيف تعمل نقاط المكافآت؟',qEn:'How do reward points work?',a:'كل 1000 دج إنفاق = نقطة. 500 نقطة = خصم 5%.',aEn:'Every 1000 DZD spent = 1 point. 500 points = 5% discount.'},
  {q:'ماذا أفعل إذا كان الكود خاطئاً؟',qEn:'What if the code is wrong?',a:'تواصل معنا فوراً عبر واتساب مع رقم طلبك.',aEn:'Contact us immediately via WhatsApp with your order number.'},
];
const MILESTONES=[
  {id:'m100',pts:100,icon:'🎁',name:'مكافأة 100 نقطة',nameEn:'100 Point Reward',desc:'بطاقة PS Store 5€ مجانية',descEn:'Free PS Store 5€ Card',minSpend:7500,msg:'🎉 مبروك! ربحت بطاقة PS Store 5€ مجانية!',msgEn:'🎉 Congratulations! You won a free PS Store 5€ card!'},
  {id:'m300',pts:300,icon:'👑',name:'مكافأة 300 نقطة',nameEn:'300 Point Reward',desc:'PS Plus Essential شهر مجاني',descEn:'Free PS Plus Essential 1 Month',minSpend:22000,msg:'🎉 مبروك! ربحت PS Plus Essential شهر مجاني!',msgEn:'🎉 Congratulations! You won a free PS Plus Essential month!'},
  {id:'m600',pts:600,icon:'💎',name:'مكافأة 600 نقطة',nameEn:'600 Point Reward',desc:'بطاقة PS Store 20€ مجانية',descEn:'Free PS Store 20€ Card',minSpend:45000,msg:'🎉 مبروك! ربحت بطاقة PS Store 20€ مجانية!',msgEn:'🎉 Congratulations! You won a free PS Store 20€ card!'},
  {id:'m1000',pts:1000,icon:'🏆',name:'مكافأة 1000 نقطة',nameEn:'1000 Point Reward',desc:'PS Plus Extra 3 أشهر مجانية',descEn:'Free PS Plus Extra 3 Months',minSpend:85000,msg:'🎉 مبروك! ربحت PS Plus Extra 3 أشهر مجانية!',msgEn:'🎉 Congratulations! You won free PS Plus Extra 3 months!'},
];
const SPIN_SEGMENTS=[
  {pts:5,label:'5 نقاط',labelEn:'5 Points',color:'#4c1d95',prob:32},
  {pts:10,label:'10 نقاط',labelEn:'10 Points',color:'#1e3a5f',prob:28},
  {pts:15,label:'15 نقطة',labelEn:'15 Points',color:'#6d28d9',prob:20},
  {pts:25,label:'25 نقطة',labelEn:'25 Points',color:'#78350f',prob:12},
  {pts:50,label:'50 نقطة',labelEn:'50 Points',color:'#1e3a5f',prob:5},
  {pts:100,label:'100 نقطة',labelEn:'100 Points',color:'#7c2d12',prob:2},
  {pts:0,label:'حاول غداً',labelEn:'Try Tomorrow',color:'#1c1c2e',prob:1},
];
const SUPPORT_FLOWS={
  start:{msg:'مرحباً! أنا بوت الدعم الفني لـ Glitch Q 🤖\nكيف يمكنني مساعدتك اليوم؟',msgEn:"Hello! I'm the Glitch Q support bot 🤖\nHow can I help you today?",opts:['لم أستلم كودي','كودي خاطئ','مشكلة في الدفع','سؤال عن الريجن','مشكلة في الحساب','أخرى'],optsEn:['Did not receive my code','Wrong code','Payment issue','Region question','Account issue','Other']},
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
  'نسيت كلمة المرور':{msg:'اضغط "نسيت كلمة المرور؟" في صفحة الدخول.',msgEn:"Click 'Forgot password?' on the sign in page.",opts:['شكراً فهمت'],optsEn:['Thanks']},
  'لم يصل إيميل التفعيل':{msg:'تحقق من مجلد Spam.',msgEn:'Check your Spam folder.',opts:['التواصل مع الدعم البشري','شكراً فهمت'],optsEn:['Contact human support','Thanks']},
  'لا أستطيع الدخول':{msg:'جرّب مسح ذاكرة التخزين المؤقت.',msgEn:'Try clearing your browser cache.',opts:['التواصل مع الدعم البشري','شكراً فهمت'],optsEn:['Contact human support','Thanks']},
  'أخرى':{msg:'اكتب مشكلتك في مربع النص.',msgEn:'Write your issue in the text box.',opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support']},
  'التواصل مع الدعم البشري':{msg:'سيتم تحويلك الآن للدعم البشري 🟢',msgEn:'You will now be redirected to human support 🟢',opts:[],optsEn:[],human:true},
  'Contact human support':{msg:'سيتم تحويلك الآن 🟢',msgEn:'Redirecting to human support 🟢',opts:[],optsEn:[],human:true},
  'شكراً فهمت':{msg:'على الرحب! أنا هنا إذا احتجت مساعدة 😊',msgEn:"You're welcome! I'm here if you need more help 😊",opts:['عودة للبداية'],optsEn:['Back to start']},
  'نعم شكراً!':{msg:'يسعدني أنني ساعدتك! 🎮',msgEn:'Glad I could help! 🎮',opts:['عودة للبداية'],optsEn:['Back to start']},
  'حسناً':{msg:'بالتوفيق!',msgEn:'Good luck!',opts:['عودة للبداية'],optsEn:['Back to start']},
  'عودة للبداية':{msg:'كيف يمكنني مساعدتك؟',msgEn:'How can I help you?',opts:['لم أستلم كودي','كودي خاطئ','مشكلة في الدفع','سؤال عن الريجن','مشكلة في الحساب','أخرى'],optsEn:['Did not receive my code','Wrong code','Payment issue','Region question','Account issue','Other']},
  'Yes, thanks!':{msg:'يسعدني أنني ساعدتك! 🎮',msgEn:'Glad I could help! 🎮',opts:['عودة للبداية'],optsEn:['Back to start']},
  'Thanks':{msg:'على الرحب والسعة! 😊',msgEn:"You're welcome! 😊",opts:['عودة للبداية'],optsEn:['Back to start']},
  'Back to start':{msg:'كيف يمكنني مساعدتك؟',msgEn:'How can I help you?',opts:['لم أستلم كودي','كودي خاطئ','مشكلة في الدفع','سؤال عن الريجن','مشكلة في الحساب','أخرى'],optsEn:['Did not receive my code','Wrong code','Payment issue','Region question','Account issue','Other']},
  'Yes, more than an hour':{msg:'يجب التواصل مع الدعم البشري.',msgEn:'You need to contact human support.',opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support'],human:true},
  'No, I will wait':{msg:'جيد! إذا لم يصل خلال ساعة تواصل معنا.',msgEn:"Okay! If it doesn't arrive, contact us.",opts:['حسناً'],optsEn:['Okay']},
  'Still have an issue':{msg:'دعني أوصّلك بفريق الدعم.',msgEn:'Let me connect you with support.',opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support'],human:true},
  'Yes, still not working':{msg:'سنحل هذا فوراً.',msgEn:"We'll fix this immediately.",opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support'],human:true},
  'I will try again':{msg:'حسناً! إذا استمرت المشكلة تواصل معنا.',msgEn:'Okay! If it persists, contact us.',opts:['شكراً فهمت'],optsEn:['Thanks']},
  'How do I check my order?':{msg:'من قسم الدعم > تتبع الطلبات.',msgEn:'From Support > Track Orders.',opts:['شكراً فهمت'],optsEn:['Thanks']},
  'I want human support':{msg:'سيتم تحويلك للدعم البشري.',msgEn:'Redirecting to human support.',opts:['التواصل مع الدعم البشري'],optsEn:['Contact human support'],human:true},
  'How do I know my region?':{msg:'PlayStation Settings > Account > Account Information',msgEn:'PlayStation Settings > Account > Account Information',opts:['شكراً فهمت'],optsEn:['Thanks']},
  'Forgot password':{msg:"اضغط 'نسيت كلمة المرور؟' في صفحة الدخول.",msgEn:"Click 'Forgot password?' on the sign in page.",opts:['شكراً فهمت'],optsEn:['Thanks']},
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

/* ══ TOAST ══ */
function toast(msg,type='tinfo'){
  const c=$('toastWrap');if(!c)return;
  const el=document.createElement('div');el.className=`toast ${type}`;
  const ICONS={tok:'✅',terr:'❌',tinfo:'ℹ️',twarn:'⚠️'};
  const closeSpan=document.createElement('span');closeSpan.className='toast-close';closeSpan.textContent='✕';
  const icoSpan=document.createElement('span');icoSpan.textContent=ICONS[type]||'ℹ️';
  const msgSpan=document.createElement('span');msgSpan.textContent=msg;msgSpan.style.flex='1';
  el.appendChild(closeSpan);el.appendChild(icoSpan);el.appendChild(msgSpan);
  let dismissed=false;
  function dismiss(){if(dismissed)return;dismissed=true;el.classList.remove('show');setTimeout(()=>el.remove(),280);}
  el.addEventListener('click',dismiss);
  c.appendChild(el);
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('show')));
  const timer=setTimeout(dismiss,4000);
  el.addEventListener('click',()=>clearTimeout(timer),{once:true});
}

/* ══ MODALS ══ */
const VALID_MODALS=['authModal','regionModal','trackModal','checkoutModal','ratingModal','spinModal','supportModal','reportModal','termsModal','privacyModal','faqModal','aboutModal','prodModal','cartModal'];
function openM(id){
  if(!VALID_MODALS.includes(id))return;
  $(id)?.classList.remove('hidden');
  if(id==='faqModal')renderFAQ();
  if(id==='supportModal')initSupportBot();
  if(id==='cartModal')renderCart();
  if(id==='spinModal'){buildSpinWheel();initSpinTimer();}
  if(navigator.vibrate)navigator.vibrate([8]);
}
function closeM(id){$(id)?.classList.add('hidden');}
function showPane(id){['loginPane','regPane','verifyPane'].forEach(p=>$(p)?.classList.add('hidden'));$(id)?.classList.remove('hidden');}
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
  const map={home:0,shop:1,rewards:4,support:5};
  const idx=map[name];if(idx!==undefined)document.querySelectorAll('.nav-ul li')[idx]?.classList.add('on');
  if(name==='shop'){renderCatFilterBar();renderShopProds();}
  if(name==='rewards')renderRewardsPage();
  if(name==='profile')renderProfilePage();
}
window.goPage=goPage;

/* ══ LANG ══ */
function toggleLang(){
  S.lang=S.lang==='ar'?'en':'ar';
  localStorage.setItem('gq_lang',S.lang);
  applyTranslations();toast(t('t_lang_changed'),'tinfo');
  renderHome();
  if(S.currentPage==='shop'){renderCatFilterBar();renderShopProds();}
  if(S.currentPage==='rewards')renderRewardsPage();
  if(S.currentPage==='profile')renderProfilePage();
}
window.toggleLang=toggleLang;
function toggleUMenu(){$('uDrop')?.classList.toggle('hidden');}
window.toggleUMenu=toggleUMenu;
document.addEventListener('click',e=>{if(!e.target.closest('#uMenuWrap'))$('uDrop')?.classList.add('hidden');});

/* ══ CONSENT ══ */
function initConsent(){
  if(localStorage.getItem('gq_consent'))return;
  $('consentBanner')?.classList.remove('hidden');
  const chkT=$('chkTerms'),chkP=$('chkPrivacy'),btn=$('consentAcceptBtn');
  function upd(){if(btn)btn.disabled=!(chkT?.checked&&chkP?.checked);}
  chkT?.addEventListener('change',upd);chkP?.addEventListener('change',upd);
}
window.acceptConsent=function(){
  localStorage.setItem('gq_consent','1');
  $('consentBanner')?.classList.add('hidden');toast(t('t_consent_ok'),'tok');
};
window.rejectConsent=function(){
  const msg=S.lang==='en'?'If you decline, you cannot use the site. Are you sure?':'إذا رفضت لن تتمكن من استخدام الموقع. هل أنت متأكد؟';
  if(confirm(msg)){
    const notice=S.lang==='en'?'Cannot use site without agreeing.':'لا يمكن استخدام الموقع بدون الموافقة.';
    document.body.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0015;color:#a78bca;font-family:Cairo,sans-serif;text-align:center"><div><p>${notice}</p><button onclick="location.reload()" style="margin-top:20px;padding:10px 24px;background:#9333ea;color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:Cairo,sans-serif">إعادة</button></div></div>`;
  }
};

/* ══ LOADER ══ */
function runLoader(){
  const bar=$('ldBar'),txt=$('ldTxt');let p=0;
  const iv=setInterval(()=>{p+=Math.random()*18+6;if(p>100)p=100;
    if(bar)bar.style.width=p+'%';
    if(txt)txt.textContent=p<25?t('loading_txt'):p<55?t('loading_init'):p<85?t('loading_data'):t('loading_done');
    if(p>=100){clearInterval(iv);setTimeout(()=>$('loader')?.classList.add('gone'),600);}
  },100);
}

/* ══ PARTICLES ══ */
function initParticles(){
  const c=$('heroPtcls');if(!c)return;
  const COLS=['rgba(147,51,234,.6)','rgba(236,72,153,.5)','rgba(0,229,255,.4)','rgba(245,158,11,.4)'];
  setInterval(()=>{const p=document.createElement('div');p.className='h-pt';const sz=Math.random()*4+2,dur=Math.random()*5+3;p.style.cssText=`width:${sz}px;height:${sz}px;left:${Math.random()*100}%;bottom:0;background:${COLS[Math.floor(Math.random()*COLS.length)]};animation-duration:${dur}s;animation-delay:${Math.random()}s`;c.appendChild(p);setTimeout(()=>p.remove(),(dur+1.5)*1000);},600);
}

/* ══ CONFETTI ══ */
function fireConfetti(n=60){
  const COLS=['#9333ea','#ec4899','#00E5FF','#f59e0b','#10b981'];
  if(!document.getElementById('cfKf')){const s=document.createElement('style');s.id='cfKf';s.textContent='@keyframes cfFall{to{transform:translateY(100vh) rotateZ(720deg);opacity:0}}';document.head.appendChild(s);}
  for(let i=0;i<Math.min(n,80);i++){setTimeout(()=>{const el=document.createElement('div');el.style.cssText=`position:fixed;width:8px;height:8px;border-radius:2px;pointer-events:none;z-index:99990;left:${Math.random()*100}vw;top:-20px;background:${COLS[Math.floor(Math.random()*COLS.length)]};animation:cfFall ${1.5+Math.random()*1.5}s ease-in ${Math.random()*.5}s forwards`;document.body.appendChild(el);setTimeout(()=>el.remove(),3500);},i*18);}
}
/* ══════════════════════════════════════════
   SETTINGS & FIREBASE
══════════════════════════════════════════ */
async function loadSettings(){
  try{const d=await db.collection('settings').doc('categories').get();CATS=d.exists&&Array.isArray(d.data().categories)?d.data().categories:DEFAULT_CATS;}catch(e){CATS=DEFAULT_CATS;}
  try{const d=await db.collection('settings').doc('products').get();if(d.exists&&Array.isArray(d.data().products)&&d.data().products.length)PRODS=d.data().products;else PRODS=DEFAULT_PRODS;}catch(e){PRODS=DEFAULT_PRODS;}
  try{const d=await db.collection('settings').doc('coupons').get();if(d.exists&&d.data().coupons){const td=new Date().toISOString().split('T')[0];CPNS={};d.data().coupons.forEach(c=>{if(c.active&&(!c.expiry||c.expiry>=td)&&(!c.maxUses||(c.usedCount||0)<c.maxUses)){const k=String(c.code||'').toUpperCase().trim();if(k)CPNS[k]=c;}});}}catch(e){}
  try{const d=await db.collection('settings').doc('discount').get();if(d.exists){const x=d.data(),td=new Date().toISOString().split('T')[0];DISC=(x.active&&(!x.expiry||x.expiry>=td)&&x.value>0&&x.value<=100)?{active:true,value:x.value}:{active:false,value:0};}}catch(e){}
  try{const d=await db.collection('settings').doc('maintenance').get();if(d.exists&&d.data().active){document.body.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0015;color:#a78bca;font-family:Cairo,sans-serif;text-align:center"><div><div style="font-size:60px;margin-bottom:20px">🔧</div><h2 style="color:#00E5FF;font-family:Orbitron,sans-serif;margin-bottom:10px">GLITCH Q</h2><p style="font-size:16px">${t('t_maintenance')}</p></div></div>`;return false;}}catch(e){}
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
  renderHomeProds();renderHomeCats();renderLeaderboard();
  renderMissions('missionsWrap');initOfferCountdown();initMissionTimer();
}

function renderHomeProds(){
  const g=$('homeProdsGrid');if(!g)return;g.innerHTML='';
  const enabled=CATS.filter(c=>c.enabled).map(c=>c.id);
  PRODS.filter(p=>enabled.includes(p.cat)).slice(0,8).forEach(prod=>g.appendChild(buildProdCard(prod)));
}

function renderHomeCats(){
  const g=$('homeCatsGrid');if(!g)return;g.innerHTML='';
  CATS.filter(c=>c.enabled).sort((a,b)=>(a.order||0)-(b.order||0)).forEach(cat=>{
    const el=document.createElement('button');el.className='cat-c';
    const cnt=PRODS.filter(p=>p.cat===cat.id&&p.stock!==false).length;
    const name=S.lang==='en'?(cat.nameEn||cat.name):(cat.name||cat.id);
    const prod_word=S.lang==='en'?'products':'منتج';
    el.innerHTML=`<div class="cat-ico" style="background:${san(cat.bg)}">${cat.icon||'📦'}</div><span>${san(name)}</span><small>${cnt} ${prod_word}</small>`;
    el.addEventListener('click',()=>{goPage('shop');filterByCat(cat.id);});
    g.appendChild(el);
  });
}

/* ══════════════════════════════════════════
   PRODUCT CARD
══════════════════════════════════════════ */
function buildProdCard(prod){
  const price=calcPrice(prod);const orig=prod.priceDZD||(prod.val*(RATES[prod.cur||'EUR']||220));
  const valText=getValText(prod);
  const card=document.createElement('div');card.className='pc'+(prod.stock===false?' pc-unavail':'');
  const bgCls=prod.img==='ps'?'pc-bg-ps':prod.img==='plus'?'pc-bg-plus':'pc-bg-game';
  let imgContent='';
  if(prod.imgUrl&&isValidUrl(prod.imgUrl))imgContent=`<img src="${san(prod.imgUrl)}" alt="${san(prod.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover">`;
  else if(prod.img==='ps')imgContent=`<span class="pc-ico"><i class="fa-brands fa-playstation"></i></span>`;
  else if(prod.img==='plus')imgContent=`<span class="pc-ico">👑</span>`;
  else imgContent=`<span class="pc-ico">🎮</span>`;
  const discBadge=DISC.active&&prod.stock!==false?`<div class="pc-badge" style="left:8px;right:auto;background:var(--green)">-${DISC.value}%</div>`:'';
  card.innerHTML=`
    <div class="pc-img ${bgCls}">
      ${prod.badge?`<div class="pc-badge ${prod.badge==='Premium'?'gold':prod.badge==='New'?'new':''}">${san(prod.badge)}</div>`:''}
      ${discBadge}
      ${prod.stock===false?`<div class="pc-oos-overlay">${t('prod_oos')}</div>`:''}
      ${imgContent}
    </div>
    <div class="pc-body">
      <div class="pc-type">${san(getCatName(prod.cat))}</div>
      <div class="pc-name">${san(prod.name)}</div>
      <div class="pc-sub">${san(prod.sub||'')}</div>
      <div class="pc-orig">${san(valText)}</div>
      <div class="pc-dzd">${price.toLocaleString()} دج${DISC.active&&prod.stock!==false?` <s style="opacity:.4;font-size:10px">${orig.toLocaleString()}</s>`:''}</div>
    </div>
    ${prod.stock!==false?`<button class="pc-cart" onclick="event.stopPropagation();addToCart('${san(prod.id)}')" aria-label="${t('prod_cart')}"><i class="fa-solid fa-cart-shopping"></i></button>`:''}
  `;
  card.addEventListener('click',()=>{if(prod.stock!==false)openProdDetail(prod);});
  return card;
}

/* ══════════════════════════════════════════
   PRODUCT DETAIL
══════════════════════════════════════════ */
function openProdDetail(prod){
  S.selProd=prod;
  const price=calcPrice(prod);const orig=prod.priceDZD||(prod.val*(RATES[prod.cur||'EUR']||220));
  const valText=getValText(prod);
  const bgCls=prod.img==='ps'?'pc-bg-ps':prod.img==='plus'?'pc-bg-plus':'pc-bg-game';
  const desc=S.lang==='en'?(prod.descEn||prod.desc||''):(prod.desc||'');
  const mc=$('prodModalContent');if(!mc)return;
  mc.innerHTML=`
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;margin-bottom:20px">
      <div class="pc-img ${bgCls}" style="width:110px;height:90px;border-radius:12px;flex-shrink:0;font-size:34px">
        ${prod.imgUrl&&isValidUrl(prod.imgUrl)?`<img src="${san(prod.imgUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`
          :prod.img==='ps'?'<i class="fa-brands fa-playstation" style="color:rgba(255,255,255,.9)"></i>'
          :prod.img==='plus'?'👑':'🎮'}
      </div>
      <div style="flex:1;min-width:180px">
        <div style="font-size:10px;color:var(--mid);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${san(getCatName(prod.cat))}</div>
        <h3 style="font-size:18px;font-weight:800;margin-bottom:4px">${san(prod.name)}</h3>
        <div style="font-size:13px;color:var(--mid);margin-bottom:10px">${san(prod.sub||'')}</div>
        ${desc?`<p style="font-size:13px;color:var(--mid);line-height:1.7;margin-bottom:10px">${san(desc)}</p>`:''}
        <div style="font-size:22px;font-weight:900;color:var(--cyan);font-family:'Orbitron',sans-serif">${price.toLocaleString()} دج</div>
        ${DISC.active?`<div style="font-size:12px;text-decoration:line-through;color:var(--dim);margin-top:2px">${orig.toLocaleString()} دج</div>`:''}
        <div style="font-size:13px;color:var(--mid);margin-top:6px">${t('prod_val')}: <strong style="color:var(--text)">${san(valText)}</strong></div>
      </div>
    </div>
    <div style="display:flex;gap:10px">
      <button onclick="addToCart('${san(prod.id)}');closeM('prodModal')" class="btn-o" style="flex:1"><i class="fa-solid fa-cart-shopping"></i> ${t('prod_cart')}</button>
      <button onclick="closeM('prodModal');openCheckoutForProd('${san(prod.id)}')" class="btn-p" style="flex:1"><i class="fa-solid fa-bolt"></i> ${t('prod_order')}</button>
    </div>
  `;
  openM('prodModal');
}

function openCheckoutForProd(prodId){
  const prod=PRODS.find(p=>p.id===prodId);if(!prod||prod.stock===false)return;
  S.selProd=prod;S.cpn=null;const price=calcPrice(prod);S._total=price;
  const valText=getValText(prod);
  const ci=$('coProdInfo');
  if(ci)ci.innerHTML=`<div class="co-pname">${san(prod.name)} — ${san(valText)}</div><div class="co-pprice">${san(prod.sub||'')} · ${price.toLocaleString()} دج</div>`;
  setText('coTotal',price.toLocaleString()+' دج');
  const cr=$('cpnRes');if(cr)cr.textContent='';const ci2=$('cpnInp');if(ci2)ci2.value='';
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
  localStorage.setItem('gq_cart',JSON.stringify(S.cart));updateCartBadge();
  toast(t('t_added_cart'),'tok');if(navigator.vibrate)navigator.vibrate([8,20]);
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
    el.innerHTML=`<div class="ci-img">${ico}</div><div class="ci-info"><div class="ci-name">${san(c.name||'')}</div><div class="ci-price">${(c.price*(c.qty||1)).toLocaleString()} دج${c.qty>1?` (x${c.qty})`:''}</div></div><button class="ci-rm" onclick="removeFromCart(${i})">✕</button>`;
    items.appendChild(el);
  });
  setText('cartTotV',tot.toLocaleString()+' دج');
}
window.removeFromCart=i=>{if(i<0||i>=S.cart.length)return;S.cart.splice(i,1);localStorage.setItem('gq_cart',JSON.stringify(S.cart));updateCartBadge();renderCart();};

function goCheckout(){
  if(!S.cart.length)return;closeM('cartModal');
  const tot=S.cart.reduce((s,c)=>s+(c.price*(c.qty||1)),0);S._total=tot;S.selProd=null;S.cpn=null;
  const ci=$('coProdInfo');
  if(ci)ci.innerHTML=`<div class="co-pname">${S.cart.map(c=>`${san(c.name||'')} x${c.qty||1}`).join(' + ')}</div><div class="co-pprice">${tot.toLocaleString()} دج</div>`;
  setText('coTotal',tot.toLocaleString()+' دج');
  const cr=$('cpnRes');if(cr)cr.textContent='';const ci2=$('cpnInp');if(ci2)ci2.value='';
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
  try{const d=await db.collection('settings').doc('coupons').get();if(d.exists){const td=new Date().toISOString().split('T')[0];CPNS={};(d.data().coupons||[]).forEach(c=>{if(c.active&&(!c.expiry||c.expiry>=td)&&(!c.maxUses||(c.usedCount||0)<c.maxUses)){const k=String(c.code||'').toUpperCase().trim();if(k)CPNS[k]=c;}});}}catch(e){}
  if(CPNS[code]){
    S.cpn=CPNS[code];const base=S._total||0;
    const dc=S.cpn.type==='percent'?Math.floor(base*Math.min(S.cpn.value,100)/100):Math.min(S.cpn.value,base);
    S._total=Math.max(0,base-dc);
    const discTxt=S.lang==='en'?`Discount ${S.cpn.value}${S.cpn.type==='percent'?'%':' DZD'}`:`خصم ${S.cpn.value}${S.cpn.type==='percent'?'%':' دج'}`;
    res.innerHTML=`<span style="color:var(--green)">✅ ${discTxt}</span>`;
    setText('coTotal',S._total.toLocaleString()+' دج');
  }else{S.cpn=null;res.innerHTML=`<span style="color:var(--red)">${t('t_coupon_invalid')}</span>`;}
};
window.applyOfferCode=()=>{if(S.cart.length){goCheckout();}else{goPage('shop');toast(t('t_choose_prod'),'twarn');}};

/* ══════════════════════════════════════════
   PAYMENT
══════════════════════════════════════════ */
window.setPay=m=>{if(!['baridimob','hand'].includes(m))return;S.pay=m;$('tabBaridi').classList.toggle('on',m==='baridimob');$('tabHand').classList.toggle('on',m==='hand');$('baridiF').classList.toggle('hidden',m!=='baridimob');$('handF').classList.toggle('hidden',m!=='hand');};
window.setRecv=m=>{if(!['email','phone'].includes(m))return;S.recv=m;$('recvEM').classList.toggle('on',m==='email');$('recvPH').classList.toggle('on',m==='phone');$('emailF').classList.toggle('hidden',m!=='email');$('phoneF').classList.toggle('hidden',m!=='phone');};
window.copyRIP=()=>navigator.clipboard.writeText('00799999004390466974').then(()=>toast(t('t_rip_copied'),'tok')).catch(()=>{});
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
  const total=S._total||0;const uid=S.user?S.user.uid:'guest';
  const ref=db.collection('orders').doc();const oid=ref.id;
  let prodName='';
  if(S.selProd){const vt=getValText(S.selProd);prodName=`${S.selProd.name} ${vt} (${S.selProd.sub||''})`;}
  else{prodName=S.cart.map(c=>`${c.name||''} x${c.qty||1}`).join(' + ');}
  const rE=($('recvEmail')?.value||'').trim().slice(0,254);
  const rP=($('recvPhone')?.value||'').trim().slice(0,20);

  if(S.pay==='baridimob'){
    const name=san(($('senderN')?.value||'').trim()).slice(0,100);
    const fi=$('recFile');
    if(!name){toast(t('t_name_full'),'terr');return;}
    if(!fi?.files?.length){toast(t('t_upload_receipt'),'terr');return;}
    const ok=await validImg(fi.files[0]);if(!ok){toast(t('t_img_invalid'),'terr');return;}
    if(rE&&!isValidEmail(rE)){toast(t('t_email_invalid'),'terr');return;}
    const fd=new FormData();
    fd.append('photo',fi.files[0]);fd.append('orderId',oid);fd.append('userId',uid);
    fd.append('caption',`📦 New Order!\n🆔 ${oid}\n👤 ${name}\n🔑 ${uid}\n🎮 ${prodName}\n💰 ${total.toLocaleString()} دج\n${S.cpn?`🎟️ ${S.cpn.code}`:''}\n💳 BaridiMob\n${S.recv==='email'?`📧 ${rE}`:`📞 ${rP}`}`);
    toast(t('t_sending'),'tinfo');
    try{
      const r=await fetch(`${WORKER}/telegram`,{method:'POST',body:fd});
      if(!r.ok)throw new Error();const res=await r.json();
      if(res.ok){
        await ref.set({product:prodName,status:'pending',userId:uid,paymentMethod:'baridimob',receiveMethod:S.recv,receiveContact:S.recv==='email'?rE:rP,totalDZD:total,date:new Date().toLocaleDateString('ar'),coupon:S.cpn?.code||null,ts:firebase.firestore.FieldValue.serverTimestamp()});
        if(S.cpn)bumpCpn(S.cpn.code);await onOrderSuccess(oid,total,prodName);
      }else toast(String(res.error||t('t_error')).slice(0,100),'terr');
    }catch(e){toast(t('t_conn_error'),'terr');}
  }else{
    const phone=($('handPhone')?.value||'').trim().slice(0,20);
    if(!phone){toast(t('t_phone_required'),'terr');return;}
    const fd=new FormData();fd.append('isText','true');fd.append('orderId',oid);fd.append('userId',uid);
    fd.append('caption',`📦 Hand Delivery!\n🆔 ${oid}\n🔑 ${uid}\n🎮 ${prodName}\n💰 ${total.toLocaleString()} دج\n${S.cpn?`🎟️ ${S.cpn.code}`:''}\n🤝 Tlemcen\n📞 ${phone}`);
    toast(t('t_sending'),'tinfo');
    try{
      const r=await fetch(`${WORKER}/telegram`,{method:'POST',body:fd});
      if(!r.ok)throw new Error();const res=await r.json();
      if(res.ok){
        await ref.set({product:prodName,status:'pending',userId:uid,paymentMethod:'hand',phone,receiveMethod:S.recv,receiveContact:S.recv==='email'?rE:phone,totalDZD:total,date:new Date().toLocaleDateString('ar'),coupon:S.cpn?.code||null,ts:firebase.firestore.FieldValue.serverTimestamp()});
        if(S.cpn)bumpCpn(S.cpn.code);await onOrderSuccess(oid,total,prodName);
      }else toast(String(res.error||t('t_error')).slice(0,100),'terr');
    }catch(e){toast(t('t_conn_error'),'terr');}
  }
};

async function bumpCpn(code){
  try{const d=await db.collection('settings').doc('coupons').get();if(!d.exists)return;const cs=d.data().coupons||[];const i=cs.findIndex(c=>String(c.code||'').toUpperCase()===String(code||'').toUpperCase());if(i!==-1){cs[i].usedCount=(cs[i].usedCount||0)+1;await db.collection('settings').doc('coupons').set({coupons:cs});}}catch(e){}
}

async function onOrderSuccess(oid,total,prodName){
  fireConfetti();toast(t('t_order_sent'),'tok');
  if(navigator.vibrate)navigator.vibrate([20,50,20,50,100]);
  try{await navigator.clipboard.writeText(oid);}catch(e){}
  if(S.user&&S.udata){
    try{
      const pts=Math.floor(total/1000);const np=(S.udata.points||0)+pts;const orders=(S.udata.orders||0)+1;
      const newSpend=(S.udata.totalSpend||0)+total;
      const nh=[`${prodName} — ${new Date().toLocaleDateString('ar')}`,...(S.udata.history||[])].slice(0,20);
      S.udata.points=np;S.udata.history=nh;S.udata.orders=orders;S.udata.totalSpend=newSpend;
      await db.collection('users').doc(S.user.uid).update({points:np,history:nh,orders,totalSpend:newSpend});
      checkAchievements();checkMilestones();
      if(pts>0)setTimeout(()=>toast(`+${pts} ${t('t_pts')} 🌟`,'twarn'),1500);
    }catch(e){}
  }
  S.cart=[];localStorage.setItem('gq_cart',JSON.stringify(S.cart));updateCartBadge();
  closeM('checkoutModal');S.selProd=null;S._total=0;S.cpn=null;clearUp();
  setTimeout(()=>openM('ratingModal'),2500);
}

/* ══════════════════════════════════════════
   AUTH
══════════════════════════════════════════ */
auth.onAuthStateChanged(async fbU=>{
  if(fbU){
    await fbU.reload().catch(()=>{});const cur=auth.currentUser;if(!cur){resetSess();return;}
    const url=new URLSearchParams(window.location.search);
    if(url.get('mode')==='verifyEmail'){if(cur.emailVerified){window.history.replaceState({},'','');toast(t('t_welcome'),'tok');await endSess(cur);}return;}
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
      if(!S.region&&S.udata.region){S.region=S.udata.region;S.cur=S.udata.currency||'EUR';S.sym=S.udata.symbol||'€';localStorage.setItem('gq_reg',S.region);localStorage.setItem('gq_cur',S.cur);localStorage.setItem('gq_sym',S.sym);}
    }else{
      S.udata={points:10,history:[],notifications:[],favorites:[],orders:0,ratings:0,spins:0,gifts:0,shares:0,streak:0,referrals:0,totalSpend:0,lastLogin:null,badges:['newcomer'],claimedMilestones:[],fingerprint:'',uid_short:fbU.uid.slice(0,12),created:new Date()};
      await db.collection('users').doc(fbU.uid).set(S.udata);
    }
  }catch(e){S.udata={points:0,history:[],notifications:[],favorites:[],orders:0,ratings:0,spins:0,gifts:0,shares:0,streak:0,referrals:0,totalSpend:0,badges:[],claimedMilestones:[]};}
  closeM('authModal');updHeaderUI();updProfUI();loadNotifs();bumpVisitor();
  checkAchievements();checkMilestones();
  db.collection('users').doc(fbU.uid).update({uid_short:fbU.uid.slice(0,12)}).catch(()=>{});
  checkAbuse();
  const url=new URLSearchParams(window.location.search);if(url.get('ref'))processReferral();
  if(!S.region)openM('regionModal');
}

function resetSess(){S.user=null;S.udata=null;if(S.ready){updHeaderUI();updProfUI();}}
async function bumpVisitor(){const k='vst_'+new Date().toDateString();if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1');db.collection('settings').doc('stats').set({visitors:firebase.firestore.FieldValue.increment(1)},{merge:true}).catch(()=>{});}

$('loginForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!RL.ok('login',5,60000)){toast(t('t_too_many'),'twarn');return;}
  const email=($('loginEmail')?.value||'').trim().slice(0,254);const pass=$('loginPass')?.value||'';
  if(!email||!pass||!isValidEmail(email))return;
  if(email===ADMIN_EMAIL){toast(t('t_login_error'),'terr');return;}
  try{const c=await auth.signInWithEmailAndPassword(email,pass);if(!c.user.emailVerified){await auth.signOut();toast(t('t_verify_first'),'terr');return;}toast(t('t_welcome'),'tok');}
  catch(e){toast(t('t_login_error'),'terr');}
});

$('regForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!RL.ok('register',3,300000)){toast(t('t_too_many'),'twarn');return;}
  const chk=$('regTermsChk');if(!chk?.checked){toast(t('t_terms_required'),'terr');return;}
  const first=san(($('regFirst')?.value||'').trim()).slice(0,50);
  const last=san(($('regLast')?.value||'').trim()).slice(0,50);
  const email=($('regEmail')?.value||'').trim().slice(0,254);
  const pass=$('regPass')?.value||'';const conf=$('regConf')?.value||'';
  if(!first||!last){toast(t('t_name_required'),'terr');return;}
  if(!isValidEmail(email)){toast(t('t_email_invalid'),'terr');return;}
  if(email===ADMIN_EMAIL){toast(t('t_login_error'),'terr');return;}
  if(pass!==conf){toast(t('t_pass_mismatch'),'terr');return;}
  if(pass.length<6){toast(t('t_pass_short'),'terr');return;}
  try{
    const cred=await auth.createUserWithEmailAndPassword(email,pass);
    await cred.user.updateProfile({displayName:`${first} ${last}`});
    await cred.user.sendEmailVerification();
    await db.collection('users').doc(cred.user.uid).set({firstName:first,lastName:last,name:`${first} ${last}`,email,points:10,history:[],notifications:[],favorites:[],orders:0,ratings:0,spins:0,gifts:0,shares:0,streak:0,referrals:0,totalSpend:0,lastLogin:null,badges:['newcomer'],claimedMilestones:[],uid_short:cred.user.uid.slice(0,12),region:S.region||null,created:new Date()});
    await auth.signOut();toast(t('t_reg_done'),'tok');showPane('verifyPane');
  }catch(err){let m=t('t_error');if(err.code==='auth/email-already-in-use')m=t('t_email_exists');if(err.code==='auth/weak-password')m=t('t_weak_pass');toast(m,'terr');}
});

window.resetPass=async()=>{const e=($('loginEmail')?.value||'').trim().slice(0,254);if(!e||!isValidEmail(e)){toast(t('t_no_email'),'terr');return;}try{await auth.sendPasswordResetEmail(e);toast(t('t_reset_sent'),'tok');}catch(x){toast(t('t_reset_error'),'terr');}};
window.resendVerif=async()=>{const e=($('regEmail')?.value||'').trim();const p=$('regPass')?.value||'';if(!e||!p)return;try{const c=await auth.signInWithEmailAndPassword(e,p);await c.user.sendEmailVerification();await auth.signOut();toast(t('t_reset_sent'),'tok');}catch(x){toast(t('t_error'),'terr');}};
window.doLogout=async()=>{await auth.signOut();S.user=null;S.udata=null;updHeaderUI();updProfUI();toast(t('t_logged_out'),'tinfo');};

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
  const r=rb.dataset.r,c=rb.dataset.c,s=rb.dataset.s;
  if(!['eu','us','sa','ae'].includes(r))return;
  S.region=r;S.cur=c;S.sym=s;
  localStorage.setItem('gq_reg',r);localStorage.setItem('gq_cur',c);localStorage.setItem('gq_sym',s);
  if(S.user)db.collection('users').doc(S.user.uid).update({region:r,currency:c,symbol:s}).catch(()=>{});
  closeM('regionModal');toast(`${t('t_region_done')} ${r.toUpperCase()}!`,'tok');
  renderHome();if(S.currentPage==='shop')renderShopProds();
  const rb2=$('profRegBadge');if(rb2)rb2.textContent=`${r.toUpperCase()} (${s})`;
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
  setText('profPts',(S.udata.points||0).toLocaleString());
  const rb=$('profRegBadge');if(rb)rb.textContent=S.region?`${S.region.toUpperCase()} (${S.sym})`:t('choose_region');
  const hl=$('profHistList');
  if(hl){hl.innerHTML='';(S.udata.history||[]).slice(0,5).forEach(h=>{const d=document.createElement('div');d.className='hi';d.innerHTML=`<span>${san(h)}</span><i class="fa-solid fa-clock" style="color:var(--violet);font-size:11px"></i>`;hl.appendChild(d);});}
}

/* ══ REWARDS PAGE ══ */
function renderRewardsPage(){
  if(!S.udata)return;
  const pts=S.udata.points||0;setText('rwPts',pts.toLocaleString());
  const{lvl,progress}=getLevel(pts);
  const lb=$('rwLvlBadge');if(lb){lb.textContent=`${lvl.icon} ${S.lang==='en'?lvl.nameEn:lvl.name}`;lb.className='lvl-badge '+lvl.cls;}
  const pf=$('rwPtsBar');if(pf)pf.style.width=progress+'%';
  renderBadges();renderStreak();loadLbRw();initSpinTimerRw();
  renderMissions('missionsWrapRw');renderMilestones();initReferral();
}

function getLevel(pts){
  const lvls=[{min:0,name:'مبتدئ',nameEn:'Beginner',icon:'🥉',cls:'lvl-br'},{min:100,name:'فضي',nameEn:'Silver',icon:'🥈',cls:'lvl-si'},{min:300,name:'ذهبي',nameEn:'Gold',icon:'🥇',cls:'lvl-go'},{min:600,name:'بلاتيني',nameEn:'Platinum',icon:'💎',cls:'lvl-pl'},{min:1000,name:'ألماسي',nameEn:'Diamond',icon:'👑',cls:'lvl-di'}];
  let lvl=lvls[0],idx=0;for(let i=lvls.length-1;i>=0;i--){if(pts>=lvls[i].min){lvl=lvls[i];idx=i;break;}}
  const nxt=idx<lvls.length-1?lvls[idx+1].min:1000;const progress=idx===lvls.length-1?100:Math.min(((pts-lvl.min)/(nxt-lvl.min))*100,100);
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

async function loadLbRw(){
  const list=$('lbListRw');if(!list)return;
  try{const snap=await db.collection('users').orderBy('points','desc').limit(5).get();list.innerHTML='';const medals=['lb-r1','lb-r2','lb-r3'];let rank=1;snap.forEach(doc=>{const u=doc.data();const el=document.createElement('div');el.className='lb-it';el.innerHTML=`<div class="lb-rank ${medals[rank-1]||''}">${rank}</div><div class="lb-name">${san(u.name||'')}</div><div class="lb-pts">${(u.points||0).toLocaleString()} ${t('t_pts')}</div>${rank===1?'<span>👑</span>':''}`;list.appendChild(el);rank++;});}catch(e){}
}

async function renderLeaderboard(){
  const list=$('lbList');if(!list)return;
  try{const snap=await db.collection('users').orderBy('points','desc').limit(5).get();list.innerHTML='';const medals=['lb-r1','lb-r2','lb-r3'];let rank=1;snap.forEach(doc=>{const u=doc.data();const el=document.createElement('div');el.className='lb-it';el.innerHTML=`<div class="lb-rank ${medals[rank-1]||''}">${rank}</div><div class="lb-name">${san(u.name||'')}</div><div class="lb-pts">${(u.points||0).toLocaleString()} ${t('t_pts')}</div>`;list.appendChild(el);rank++;});}catch(e){}
}

/* ══ MISSIONS ══ */
function renderMissions(containerId){
  const wrap=$(containerId);if(!wrap)return;wrap.innerHTML='';
  const missions=[
    {id:'login',icon:'fa-calendar-check',color:'var(--cyan)',name:'تسجيل دخول يومي',nameEn:'Daily Login',pts:5,check:()=>S.udata?.lastLogin===new Date().toDateString(),prog:()=>({done:S.udata?.lastLogin===new Date().toDateString()?1:0,total:1})},
    {id:'buy',icon:'fa-cart-shopping',color:'var(--violet)',name:'إجراء عملية شراء',nameEn:'Make a Purchase',pts:10,check:()=>(S.udata?.orders||0)>0,prog:()=>({done:Math.min(S.udata?.orders||0,1),total:1})},
    {id:'ref',icon:'fa-user-plus',color:'var(--pink)',name:'دعوة أصدقاء (3)',nameEn:'Invite Friends (3)',pts:1000,check:()=>(S.udata?.referrals||0)>=3,prog:()=>({done:S.udata?.referrals||0,total:3})},
  ];
  missions.forEach(m=>{
    const prog=m.prog();const isDone=m.check();
    const el=document.createElement('div');el.className='mission-it'+(isDone?' done':'');
    const name=S.lang==='en'?m.nameEn:m.name;
    el.innerHTML=`<div class="mi-l"><i class="fa-solid ${m.icon}" style="color:${m.color}"></i><div class="mi-txt"><span>${san(name)}</span><small>+${m.pts.toLocaleString()} ${t('t_pts')}</small></div></div>${isDone?'<i class="fa-solid fa-check-circle mi-status-done"></i>':`<div class="mi-status-no"><span>${prog.done}/${prog.total}</span><div class="mi-prog-bar"><div class="mi-prog-fill" style="width:${Math.floor((prog.done/prog.total)*100)}%"></div></div></div>`}`;
    wrap.appendChild(el);
  });
}

/* ══ NOTIFICATIONS ══ */
function loadNotifs(){
  if(!S.user||!S.udata)return;const notifs=S.udata.notifications||[];
  const unread=notifs.filter(n=>!n.read).length;
  const b=$('notifBadge');if(b){b.textContent=unread;b.classList.toggle('hidden',unread===0);}
  const list=$('notifList');if(!list)return;list.innerHTML='';
  if(!notifs.length){list.innerHTML=`<div class="ni-empty">${t('notif_empty')}</div>`;return;}
  [...notifs].reverse().forEach(n=>{const d=document.createElement('div');d.className='ni'+(n.read?'':' unread');d.innerHTML=`<div class="ni-ttl">${san(n.title||'')}</div>${n.code?`<div class="ni-code">${san(n.code)}</div>`:''}<div class="ni-date">📅 ${san(n.date||'')}</div>`;list.appendChild(d);});
}
function toggleNotif(){$('notifPanel')?.classList.toggle('hidden');}
function closeNotif(){$('notifPanel')?.classList.add('hidden');}
window.toggleNotif=toggleNotif;window.closeNotif=closeNotif;
document.addEventListener('click',e=>{if(!e.target.closest('#notifPanel')&&!e.target.closest('#notifBtn'))$('notifPanel')?.classList.add('hidden');});

/* ══ TRACK ORDER ══ */
window.trackOrder=async()=>{
  const inp=$('trkInput'),res=$('trkRes');if(!inp||!res)return;
  const oid=inp.value.trim().slice(0,50);if(!oid){res.innerHTML=`<div class="stbox st-pend">${S.lang==='en'?'Enter order number':'أدخل رقم الطلب'}</div>`;return;}
  if(!RL.ok('track',5,60000))return;
  try{
    const doc=await db.collection('orders').doc(oid).get();
    if(doc.exists){const o=doc.data();const m={pending:{t:t('order_pend'),c:'st-pend'},processing:{t:t('order_proc'),c:'st-proc'},done:{t:t('order_done'),c:'st-done'},rejected:{t:t('order_rej'),c:'st-rej'}};const s=m[o.status]||m.pending;res.innerHTML=`<div class="stbox ${s.c}"><strong>${s.t}</strong><br><small>${san(o.product||'')}</small><br><small>📅 ${o.date||''}</small></div>`;}
    else res.innerHTML=`<div class="stbox st-rej">${t('track_not_found')}</div>`;
  }catch(e){res.innerHTML=`<div class="stbox st-pend">${t('track_error')}</div>`;}
};

/* ══ RATING ══ */
function initStars(){document.querySelectorAll('.starb').forEach(s=>{s.addEventListener('click',()=>{S.stars=parseInt(s.dataset.v)||0;document.querySelectorAll('.starb').forEach((x,i)=>x.classList.toggle('lit',i<S.stars));});});}
window.submitRating=async()=>{
  if(S.stars<1||S.stars>5){toast(t('t_star_select'),'terr');return;}
  if(!RL.ok('rating',2,60000)){toast(t('t_too_many'),'twarn');return;}
  const cmt=san(($('ratingCmt')?.value||'')).slice(0,300);
  try{
    await db.collection('ratings').add({rating:S.stars,comment:cmt,userId:S.user?.uid||'guest',userName:san(S.user?.displayName||''),date:new Date().toLocaleDateString('ar'),hidden:false});
    if(S.user&&S.udata){const ratings=(S.udata.ratings||0)+1;S.udata.ratings=ratings;await db.collection('users').doc(S.user.uid).update({ratings}).catch(()=>{});checkAchievements();}
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
    const grad=ctx.createRadialGradient(cx,cy,0,cx,cy,r);grad.addColorStop(0,'rgba(255,255,255,.1)');grad.addColorStop(.6,'rgba(255,255,255,.02)');grad.addColorStop(1,'rgba(0,0,0,.25)');
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,startA,endA);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.2)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,startA,endA);ctx.closePath();ctx.stroke();
    ctx.save();ctx.translate(cx,cy);ctx.rotate(midA);ctx.shadowColor='rgba(0,0,0,.9)';ctx.shadowBlur=8;ctx.fillStyle='#ffffff';
    ctx.font=`900 ${Math.max(12,Math.floor(canvas.width/23))}px Cairo,sans-serif`;ctx.textAlign='right';ctx.textBaseline='middle';
    const label=S.lang==='en'?(seg.labelEn||seg.label):seg.label;
    ctx.fillText(label,r*.82,0);if(seg.pts>0){ctx.font=`${Math.max(10,Math.floor(canvas.width/30))}px Arial`;ctx.fillStyle='rgba(255,220,100,.9)';ctx.fillText('⭐',r*.82+16,-1);}
    ctx.restore();
  });
  const ringGrad=ctx.createLinearGradient(0,0,canvas.width,canvas.height);ringGrad.addColorStop(0,'#9333ea');ringGrad.addColorStop(.5,'#ec4899');ringGrad.addColorStop(1,'#9333ea');
  ctx.beginPath();ctx.arc(cx,cy,r,0,2*Math.PI);ctx.strokeStyle=ringGrad;ctx.lineWidth=5;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,r-8,0,2*Math.PI);ctx.strokeStyle='rgba(255,255,255,.08)';ctx.lineWidth=1;ctx.stroke();
  const cGrad=ctx.createRadialGradient(cx,cy,0,cx,cy,28);cGrad.addColorStop(0,'#2d1060');cGrad.addColorStop(1,'#1a003d');
  ctx.beginPath();ctx.arc(cx,cy,28,0,2*Math.PI);ctx.fillStyle=cGrad;ctx.fill();ctx.strokeStyle='#9333ea';ctx.lineWidth=3;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,28,0,2*Math.PI);ctx.strokeStyle='rgba(147,51,234,.5)';ctx.lineWidth=7;ctx.stroke();
}

function getWeightedPrize(){const total=SPIN_SEGMENTS.reduce((s,p)=>s+p.prob,0);let r=Math.random()*total;for(const p of SPIN_SEGMENTS){r-=p.prob;if(r<=0)return p;}return SPIN_SEGMENTS[0];}

function initSpinTimer(){
  const update=()=>{const ls=localStorage.getItem('gq_lastSpin');if(ls){const rem=parseInt(ls)+86400000-Date.now();if(rem>0){const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000);setText('spinTimer',`${t('t_spin_next')} ${h}${S.lang==='en'?'h':'س'} ${m}${S.lang==='en'?'m':'د'}`);const btn=$('spinBtn');if(btn){btn.disabled=true;btn.style.opacity='.5';}return;}}setText('spinTimer','');const btn=$('spinBtn');if(btn){btn.disabled=false;btn.style.opacity='1';btn.textContent=t('spin_btn');}};
  update();setInterval(update,60000);
}
function initSpinTimerRw(){const ls=localStorage.getItem('gq_lastSpin');if(ls){const rem=parseInt(ls)+86400000-Date.now();if(rem>0){const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000);setText('spinTimerRw',`${t('t_spin_next')} ${h}${S.lang==='en'?'h':'س'} ${m}${S.lang==='en'?'m':'د'}`);return;}}setText('spinTimerRw','');}

window.doSpin=async function(){
  if(S.spinning)return;const ls=localStorage.getItem('gq_lastSpin');
  if(ls&&Date.now()-parseInt(ls)<86400000){toast(t('t_spin_daily'),'twarn');return;}
  if(!S.user){toast(t('t_login_first'),'terr');openM('authModal');return;}
  S.spinning=true;const btn=$('spinBtn');if(btn){btn.disabled=true;btn.style.opacity='.5';}
  if($('spinPrize'))$('spinPrize').textContent='';
  const prize=getWeightedPrize();const prizeIdx=SPIN_SEGMENTS.indexOf(prize);
  const segAngle=360/SPIN_SEGMENTS.length;const targetSegCenter=prizeIdx*segAngle+segAngle/2;
  const spins=5+Math.floor(Math.random()*3);const targetDeg=spins*360+(360-targetSegCenter);
  const duration=4500;const startTime=performance.now();const startRot=spinRotation;const canvas=$('spinCanvas');
  function easeOut(t_){return 1-Math.pow(1-t_,4);}
  function animate(now){const elapsed=now-startTime;const progress=Math.min(elapsed/duration,1);const eased=easeOut(progress);const currentDeg=startRot+targetDeg*eased;if(canvas)drawWheel(canvas,(currentDeg*Math.PI)/180);if(progress<1){requestAnimationFrame(animate);}else{spinRotation=(startRot+targetDeg)%360;onSpinDone(prize);}}
  requestAnimationFrame(animate);
};

async function onSpinDone(prize){
  S.spinning=false;localStorage.setItem('gq_lastSpin',Date.now().toString());
  const label=S.lang==='en'?(prize.labelEn||prize.label):prize.label;
  const prizeEl=$('spinPrize');if(prizeEl)prizeEl.textContent=`🎉 ${S.lang==='en'?'You won':'ربحت'} ${label}!`;
  if(prize.pts>0){const np=(S.udata.points||0)+prize.pts;S.udata.points=np;S.udata.spins=(S.udata.spins||0)+1;await db.collection('users').doc(S.user.uid).update({points:np,spins:S.udata.spins}).catch(()=>{});updProfUI();checkAchievements();checkMilestones();toast(`+${prize.pts} ${t('t_pts')} ⚡`,'tok');fireConfetti(30);}
  else toast(S.lang==='en'?'Better luck tomorrow! 🍀':'حظاً أوفر غداً! 🍀','twarn');
  initSpinTimer();const btn=$('spinBtn');if(btn){btn.disabled=false;btn.style.opacity='1';}
}

/* ══ STREAK ══ */
window.claimStreak=async()=>{
  if(!S.user){openM('authModal');return;}
  const today=new Date().toDateString();const last=S.udata?.lastLogin;const yesterday=new Date(Date.now()-86400000).toDateString();
  if(last===today){toast(t('t_streak_done'),'twarn');return;}
  const newStreak=last===yesterday?(S.udata.streak||0)+1:1;const bonusPts=[5,8,10,12,15,18,25][Math.min(newStreak-1,6)];const newPts=(S.udata.points||0)+bonusPts;
  try{await db.collection('users').doc(S.user.uid).update({streak:newStreak,lastLogin:today,points:newPts});S.udata.streak=newStreak;S.udata.lastLogin=today;S.udata.points=newPts;toast(`${t('t_streak_reward')} +${bonusPts} ${t('t_pts')} 🔥`,'tok');if(navigator.vibrate)navigator.vibrate([10,30,10,50]);fireConfetti(20);renderRewardsPage();checkAchievements();const btn=$('claimBtn');if(btn){btn.disabled=true;btn.style.opacity='.5';}}
  catch(e){toast(t('t_error'),'terr');}
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
function renderMilestones(){
  const container=$('milestonesGrid');if(!container)return;
  const pts=S.udata?.points||0;const totalSpend=S.udata?.totalSpend||0;const claimed=S.udata?.claimedMilestones||[];
  container.innerHTML='';
  MILESTONES.forEach(ms=>{
    const isUnlocked=pts>=ms.pts;const isClaimed=claimed.includes(ms.id);const canClaim=isUnlocked&&!isClaimed&&totalSpend>=ms.minSpend;
    const el=document.createElement('div');el.className='milestone-it'+(isClaimed?' unlocked':!isUnlocked?' locked':'');
    const statusCls=isClaimed?'done':canClaim?'claim':'locked';
    const name=S.lang==='en'?(ms.nameEn||ms.name):ms.name;
    const desc=S.lang==='en'?(ms.descEn||ms.desc):ms.desc;
    let statusTxt;
    if(isClaimed)statusTxt=S.lang==='en'?'✅ Claimed':'✅ مُستلم';
    else if(canClaim)statusTxt=S.lang==='en'?'🎁 Claim':'🎁 استلم';
    else if(isUnlocked&&totalSpend<ms.minSpend)statusTxt=`⏳ ${ms.minSpend.toLocaleString()} دج`;
    else statusTxt='🔒';
    const reqTxt=isClaimed?(S.lang==='en'?'✅ Claimed':'✅ تم الاستلام'):`${pts}/${ms.pts} ${t('t_pts')} · ${S.lang==='en'?'Spent':'صرف'}: ${totalSpend.toLocaleString()}/${ms.minSpend.toLocaleString()} دج`;
    el.innerHTML=`
      <div class="ms-ico">${ms.icon}</div>
      <div class="ms-info">
        <div class="ms-name">${san(name)}</div>
        <div class="ms-desc">${san(desc)}</div>
        <div class="ms-req">${san(reqTxt)}</div>
      </div>
      <button class="ms-status ${statusCls}" ${canClaim?`onclick="claimMilestone('${ms.id}')"`:''} style="${!canClaim?'cursor:default':''}">${statusTxt}</button>
    `;
    container.appendChild(el);
  });
}

window.claimMilestone=async function(msId){
  if(!S.user||!S.udata){toast(t('t_login_first'),'terr');return;}
  if(!RL.ok('milestone',5,60000)){toast(t('t_too_many'),'twarn');return;}
  const ms=MILESTONES.find(m=>m.id===msId);if(!ms)return;
  const pts=S.udata.points||0;const totalSpend=S.udata.totalSpend||0;const claimed=S.udata.claimedMilestones||[];
  if(pts<ms.pts){toast(`${t('t_ms_pts')}: ${ms.pts}`,'twarn');return;}
  if(claimed.includes(msId)){toast(t('t_ms_claimed'),'twarn');return;}
  if(totalSpend<ms.minSpend){toast(`${t('t_ms_spend')} ${ms.minSpend.toLocaleString()} دج`,'twarn');return;}
  try{
    const newClaimed=[...claimed,msId];
    await db.collection('users').doc(S.user.uid).update({claimedMilestones:newClaimed,points:firebase.firestore.FieldValue.increment(-ms.pts)});
    S.udata.claimedMilestones=newClaimed;S.udata.points=Math.max(0,pts-ms.pts);
    const fd=new FormData();fd.append('isText','true');fd.append('orderId','MILESTONE');fd.append('userId',S.user.uid);
    fd.append('caption',`🏆 Reward Claimed!\n👤 ${san(S.user.displayName||'')}\n🔑 ${S.user.uid}\n🎁 ${ms.name}\n💳 ${ms.desc}\n📊 Points: ${ms.pts}\n💰 Spent: ${totalSpend.toLocaleString()} دج`);
    await fetch(`${WORKER}/telegram`,{method:'POST',body:fd});
    const notifCode=S.lang==='en'?`Your ${ms.descEn||ms.desc} will be sent within 24 hours.`:`سيتم إرسال ${ms.desc} لك خلال 24 ساعة.`;
    const notif={title:`🎁 ${S.lang==='en'?(ms.nameEn||ms.name):ms.name}`,code:notifCode,date:new Date().toLocaleDateString('ar'),read:false};
    await db.collection('users').doc(S.user.uid).update({notifications:firebase.firestore.FieldValue.arrayUnion(notif)});
    const msg=S.lang==='en'?(ms.msgEn||ms.msg):ms.msg;
    toast(msg,'tok');fireConfetti(50);renderMilestones();updProfUI();
  }catch(e){toast(t('t_ms_error'),'terr');}
};

function checkMilestones(){
  if(!S.user||!S.udata)return;const pts=S.udata.points||0;const totalSpend=S.udata.totalSpend||0;const claimed=S.udata.claimedMilestones||[];
  MILESTONES.forEach(ms=>{
    if(pts>=ms.pts&&!claimed.includes(ms.id)&&totalSpend>=ms.minSpend){
      const name=S.lang==='en'?(ms.nameEn||ms.name):ms.name;
      setTimeout(()=>toast(`🏆 ${t('t_ms_notify')}: ${name}! ${t('t_ms_notify2')}`,'twarn'),1000);
    }
  });
}

/* ══════════════════════════════════════════
   REFERRAL SYSTEM
══════════════════════════════════════════ */
function initReferral(){
  if(!S.user)return;
  const refId=S.user.uid.slice(0,12);
  const refUrl=`${location.origin}${location.pathname}?ref=${refId}`;
  const el=$('refLinkTxt');if(el)el.textContent=refUrl;
  setText('refCount',S.udata?.referrals||0);
  setText('refPts',((S.udata?.referrals||0)*1000).toLocaleString());
}

window.copyRefLink=function(){
  if(!S.user)return;
  const refUrl=`${location.origin}${location.pathname}?ref=${S.user.uid.slice(0,12)}`;
  navigator.clipboard.writeText(refUrl).then(()=>toast(t('t_ref_copied'),'tok')).catch(()=>{});
};

async function processReferral(){
  const url=new URLSearchParams(window.location.search);const ref=url.get('ref');
  if(!ref||!S.user||typeof ref!=='string'||ref.length>12)return;
  if(ref===S.user.uid.slice(0,12))return;
  const k=`gq_ref_${S.user.uid}`;if(localStorage.getItem(k))return;
  try{
    const fp=await getFingerprint();
    const isAbuse=await checkReferralAbuse(ref,fp);
    if(isAbuse){toast(t('t_ref_self'),'terr');return;}
    const snap=await db.collection('users').where('uid_short','==',ref).limit(1).get();
    if(snap.empty)return;
    const refUid=snap.docs[0].id;
    if(refUid===S.user.uid)return;
    await db.collection('users').doc(refUid).update({points:firebase.firestore.FieldValue.increment(1000),referrals:firebase.firestore.FieldValue.increment(1)});
    await db.collection('referrals').add({referrer:refUid,referred:S.user.uid,fp_hash:fp.slice(0,16),date:new Date().toISOString()});
    localStorage.setItem(k,'1');
    toast(t('t_ref_done'),'tok');
  }catch(e){}
}

async function getFingerprint(){
  const data=[navigator.userAgent,navigator.language,screen.width,screen.height,Intl.DateTimeFormat().resolvedOptions().timeZone,navigator.hardwareConcurrency||'',navigator.deviceMemory||''].join('|');
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function checkReferralAbuse(refShortId,fp){
  try{
    const snap=await db.collection('users').where('uid_short','==',refShortId).limit(1).get();
    if(snap.empty)return true;
    if(snap.docs[0].data().fingerprint===fp.slice(0,16))return true;
    const existing=await db.collection('referrals').where('fp_hash','==',fp.slice(0,16)).limit(1).get();
    if(!existing.empty)return true;
    return false;
  }catch(e){return false;}
}

async function checkAbuse(){
  if(!S.user)return;
  try{
    const fp=await getFingerprint();const fpKey=fp.slice(0,16);
    await db.collection('users').doc(S.user.uid).update({fingerprint:fpKey}).catch(()=>{});
    const snap=await db.collection('users').where('fingerprint','==',fpKey).get();
    if(snap.size>2){
      const ids=snap.docs.map(d=>d.id).filter(id=>id!==S.user.uid);
      if(ids.length>=2){
        await db.collection('abuse_flags').add({userId:S.user.uid,fingerprint:fpKey,suspectedAlts:ids,date:new Date().toISOString(),reason:'multiple_accounts'});
        const fd=new FormData();fd.append('isText','true');fd.append('orderId','ABUSE');fd.append('userId',S.user.uid);
        fd.append('caption',`⚠️ Multi-account!\n🔑 ${S.user.uid}\n🖥️ ${fpKey}\n👥 ${ids.slice(0,3).join(', ')}`);
        fetch(`${WORKER}/telegram`,{method:'POST',body:fd}).catch(()=>{});
      }
    }
  }catch(e){}
}

/* ══════════════════════════════════════════
   TIMERS
══════════════════════════════════════════ */
function initOfferCountdown(){
  let end=localStorage.getItem('gq_offerEnd');
  if(!end||Date.now()>parseInt(end)){end=String(Date.now()+48*3600000);localStorage.setItem('gq_offerEnd',end);}
  setInterval(()=>{
    const rem=Math.max(0,parseInt(end)-Date.now());
    const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000),s=Math.floor((rem%60000)/1000);
    setText('offerCnt',`${String(h).padStart(2,'0')} : ${String(m).padStart(2,'0')} : ${String(s).padStart(2,'0')}`);
  },1000);
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
  try{await db.collection('newsletter').add({email:e,date:new Date().toISOString()});}catch(x){}
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
  const fd=new FormData();fd.append('isText','true');fd.append('orderId','SUPPORT');fd.append('userId',S.user?.uid||'guest');
  fd.append('caption',`🆘 Support Request!\n👤 ${san(S.user?.displayName||'Guest')}\n🔑 ${S.user?.uid||'guest'}\n⏰ ${new Date().toLocaleString()}`);
  fetch(`${WORKER}/telegram`,{method:'POST',body:fd}).catch(()=>{});
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
  const uid=S.user?S.user.uid:'guest';
  try{
    await db.collection('reports').add({title,category,desc,orderId,userId:uid,userName:san(S.user?.displayName||''),status:'open',date:new Date().toLocaleDateString('ar'),ts:firebase.firestore.FieldValue.serverTimestamp()});
    const hasFile=$('rptFile')?.files?.length>0;
    const fd=new FormData();
    if(hasFile){const ok=await validImg($('rptFile').files[0]);if(ok){fd.append('photo',$('rptFile').files[0]);fd.append('isText','false');}else fd.append('isText','true');}
    else fd.append('isText','true');
    fd.append('orderId','REPORT');fd.append('userId',uid);
    fd.append('caption',`🚨 New Report!\n👤 ${san(S.user?.displayName||'Guest')}\n🔑 ${uid}\n📌 ${title}\n📂 ${category}\n📝 ${desc.slice(0,300)}\n🆔 ${orderId||'—'}`);
    await fetch(`${WORKER}/telegram`,{method:'POST',body:fd});
    toast(t('t_report_sent'),'tok');closeM('reportModal');
    [$('rptTitle'),$('rptDesc'),$('rptOrderId')].forEach(el=>{if(el)el.value='';});
    if($('rptCategory'))$('rptCategory').value='';clearRptUp();
  }catch(e){toast(t('t_report_error'),'terr');}
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

  runLoader();initParticles();initStars();

  /* Apply language */
  const html=$('htmlTag');
  if(html){html.setAttribute('lang',S.lang);html.setAttribute('dir',S.lang==='ar'?'rtl':'ltr');}
  setText('langLbl',S.lang.toUpperCase());

  /* Load settings from Firebase */
  try{
    const ok=await Promise.race([
      loadSettings(),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),6000))
    ]);
    if(ok===false)return;
  }catch(e){PRODS=DEFAULT_PRODS;CATS=DEFAULT_CATS;}

  S.ready=true;updateCartBadge();updHeaderUI();

  /* Apply all translations */
  applyTranslations();

  /* Render home */
  renderHome();

  /* URL params */
  const url=new URLSearchParams(window.location.search);
  if(url.get('mode')==='verifyEmail'||url.get('mode')==='resetPassword'){
    toast(t('t_processing'),'tinfo');
  }

  /* Consent — after 800ms */
  setTimeout(initConsent,800);

  /* Region — if not set and not logged in */
  if(!S.region&&!S.user){
    setTimeout(()=>openM('regionModal'),1200);
  }

  /* Clock */
  setInterval(()=>{
    const now=new Date();
    const timeStr=now.toLocaleTimeString(S.lang==='ar'?'ar':'en');
    const timeEl=document.getElementById('topbarTime');
    if(timeEl)timeEl.textContent=timeStr;
  },1000);
});
