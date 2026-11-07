/* ══ FIREBASE ══ */
const _FC={apiKey:"AIzaSyDuMvn6UePhPf7hWIOkuQKOEoDEwogdIso",authDomain:"glitch-q.firebaseapp.com",projectId:"glitch-q",storageBucket:"glitch-q.firebasestorage.app",messagingSenderId:"34566279347",appId:"1:34566279347:web:8dfea7d9a884c1e8c060c6"};
firebase.initializeApp(_FC);
const auth=firebase.auth(),db=firebase.firestore();
const WORKER="https://glitchq-proxy.kadirom7k777.workers.dev";
const ADMIN_EMAIL="kadirom7k777@gmail.com";
async function adminNotify(text){
  try{const tok=await auth.currentUser.getIdToken();
    const r=await fetch(WORKER+'/admin/notify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:tok,text})});
    return r.ok;}catch(e){return false;}
}

const MAIL_ERR={'No email address for this customer':'لا يوجد إيميل لهذا العميل (أدخله يدوياً في تبويب «إرسال كود»)','Email provider refused the message':'مزوّد البريد (Brevo) رفض الرسالة','Email not configured':'مفتاح Brevo غير مضبوط في الـ Worker','Order not found':'الطلب غير موجود','Too many requests':'محاولات كثيرة، انتظر قليلاً','Forbidden':'غير مصرح'};
/* e-mails the code to the customer; the Worker picks the address from the stored order, never from this page */
async function adminSendCode(p){
  try{const tok=await auth.currentUser.getIdToken();
    const r=await fetch(WORKER+'/admin/send-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({idToken:tok},p))});
    const j=await r.json().catch(()=>({}));
    if(r.ok&&j.ok)return{ok:true,to:j.to};
    return{ok:false,error:MAIL_ERR[j.error]||j.error||('خطأ '+r.status)};
  }catch(e){return{ok:false,error:'تعذّر الاتصال بالخادم'};}
}

/* ══ STATE ══ */
let allOrders=[],allUsers=[],currentOrderFilter='all',currentReviewFilter='all',currentReportFilter='all';
let currentOrderForDelivery=null,ordersLoaded=20;

/* ══ SECURITY ══ */
const RL={_s:{},ok(k='_',max=5,ms=60000){const n=Date.now();if(!this._s[k])this._s[k]={c:0,t:0};const r=this._s[k];if(n>r.t){r.c=0;r.t=n+ms;}if(r.c>=max)return false;r.c++;return true;}};
/* every value that comes from the database is escaped before it reaches innerHTML:
   esc() for text and double-quoted attributes, jsq() for a quoted argument inside an inline handler */
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/`/g,'&#96;');}
function san(t){return esc(typeof t==='string'?t.trim().slice(0,500):'');}
function jsq(v){return esc(JSON.stringify(String(v==null?'':v)).slice(1,-1).replace(/&/g,'\\u0026').replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/'/g,'\\u0027'));}
function safeUrl(u){u=String(u||'').trim();return /^https:\/\/[^\s"'<>`]+$/i.test(u)?u:'';}
function csvCell(c){let v=String(c==null?'':c);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';}
function isValidEmail(e){return/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);}

/* ══ AUTH ══ (Google sign-in only: the account's own 2-step verification / passkey protects the panel) */
function isAdminUser(u){return !!u&&u.email===ADMIN_EMAIL&&u.emailVerified===true&&(u.providerData||[]).some(p=>p.providerId==='google.com');}
auth.onAuthStateChanged(u=>{
  if(isAdminUser(u)){
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('adminApp').style.display='block';
    document.getElementById('sbAdminName').textContent=u.displayName||'Admin';
    document.getElementById('sbAdminEmail').textContent=u.email;
    initAdmin();armIdleLogout();
  }else if(u){auth.signOut();showErr('غير مصرح لك بالوصول');}
});

async function adminLogin(){
  if(!RL.ok('login',5,60000)){showErr('محاولات كثيرة');return;}
  showErr('');
  try{
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);   /* the session ends when the tab closes */
    await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  }catch(e){
    if(e.code==='auth/popup-closed-by-user'||e.code==='auth/cancelled-popup-request')showErr('أُغلقت نافذة الدخول');
    else if(e.code==='auth/popup-blocked')showErr('المتصفح منع نافذة الدخول، اسمح بالنوافذ المنبثقة');
    else if(e.code==='auth/unauthorized-domain')showErr('أضف هذا النطاق إلى Authorized domains في Firebase');
    else if(e.code==='auth/operation-not-allowed')showErr('فعّل مزوّد Google في Firebase Authentication');
    else showErr('خطأ في تسجيل الدخول');
  }
}

/* sign out automatically after 30 minutes without activity */
let idleTimer=null;
function armIdleLogout(){
  const reset=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>{auth.signOut().then(()=>location.reload());},30*60*1000);};
  ['click','keydown','touchstart','mousemove'].forEach(ev=>document.addEventListener(ev,reset,{passive:true}));reset();
}

function adminLogout(){auth.signOut();location.reload();}
function showErr(m){document.getElementById('loginErr').textContent=m;}

/* ══ TOAST ══ */
let toastTimer=null;
const TOAST_KIND={'✅':'ok','❌':'err','⚠️':'warn','⚠':'warn','🚫':'err'};
const EMOJI_RE=/(?:[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2B50\u2B06\u23F3\u2705\u274C][\uFE0F\u20E3]?)+\s?/gu;
/* kind: 'ok' | 'err' | 'warn' | 'info' (older call sites may still pass an emoji, which is mapped and never shown) */
function aToast(msg,kind='ok',dur=3500){
  const t=document.getElementById('admToast');
  const k=['ok','err','warn','info'].includes(kind)?kind:(TOAST_KIND[kind]||'info');
  const ic=document.getElementById('admToastIcon');ic.className=k;ic.textContent='';
  document.getElementById('admToastMsg').textContent=String(msg==null?'':msg).replace(EMOJI_RE,'').trim();
  t.classList.add('show');clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),dur);
}

/* ══ SIDEBAR ══ */
function toggleSidebar(){
  const sidebar=document.getElementById('sidebar');
  const overlay=document.getElementById('sidebarOverlay');
  const mainArea=document.getElementById('mainArea');
  const isMobile=window.innerWidth<=768;
  if(isMobile){
    const isOpen=sidebar.classList.contains('mobile-open');
    if(isOpen){sidebar.classList.remove('mobile-open');overlay.classList.remove('show');}
    else{sidebar.classList.add('mobile-open');overlay.classList.add('show');}
  }else{
    sidebar.classList.toggle('collapsed');mainArea.classList.toggle('expanded');
  }
}
function closeSidebarMobile(){
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}
window.addEventListener('resize',()=>{if(window.innerWidth>768){document.getElementById('sidebarOverlay').classList.remove('show');document.getElementById('sidebar').classList.remove('mobile-open');}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSidebarMobile();});

/* ══ TABS ══ */
const TAB_TITLES={dashboard:'لوحة الإحصاء',orders:'الطلبات',products:'المنتجات والأقسام',coupons:'الكوبونات والخصومات',users:'المستخدمون',reviews:'التقييمات',newsletter:'النشرة البريدية',reports:'البلاغات',abuse:'مكافحة الاحتيال',faq:'الأسئلة الشائعة',send:'إرسال كود',regions:'المناطق (الريجنات)',settings:'الإعدادات'};

function switchTab(name){
  if(window.innerWidth<=768)closeSidebarMobile();
  document.querySelectorAll('.tab-panel').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.sb-item').forEach(i=>i.classList.remove('on'));
  document.getElementById(`tab-${name}`)?.classList.add('on');
  document.querySelectorAll('.sb-item').forEach(i=>{if(i.getAttribute('onclick')?.includes(`'${name}'`))i.classList.add('on');});
  document.getElementById('topbarTitle').textContent=TAB_TITLES[name]||name;
  if(name==='dashboard')setTimeout(vzRedraw,30);
  if(name==='orders')loadOrders();
  if(name==='products'){loadCats();loadProds();}
  if(name==='coupons'){loadCoupons();loadDiscount();}
  if(name==='users')loadUsers();
  if(name==='reviews')loadReviews();
  if(name==='newsletter')loadNewsletter();
  if(name==='reports')loadReports();
  if(name==='abuse')loadAbuse();
  if(name==='faq')loadFAQ();
  if(name==='regions')loadRegions();
  if(name==='settings')loadSettings2();
}

/* ══ CLOCK ══ */
setInterval(()=>{const t=document.getElementById('topbarTime');if(t)t.textContent=new Date().toLocaleTimeString('ar');},1000);

/* ══ INIT ══ */
async function initAdmin(){
  await loadDashboard();
  setInterval(()=>{if(document.visibilityState==='visible'&&document.getElementById('tab-dashboard').classList.contains('on'))loadDashboard();},300000);   /* the dashboard reads whole collections: refreshing every minute used up the free daily read quota */
}
async function refreshAll(){const on=document.querySelector('.tab-panel.on')?.id?.replace('tab-','');if(on)switchTab(on);else loadDashboard();aToast('تم التحديث','info');}

/* ══ DASHBOARD ══ */
const STATUS_AR={pending:'قيد المراجعة',processing:'معالجة',done:'مكتمل',rejected:'مرفوض'};
async function loadDashboard(){
  try{
    const[ordersSnap,usersSnap,ratingsSnap,reportsSnap,statsSnap]=await Promise.all([
      db.collection('orders').get(),db.collection('users').get(),
      db.collection('ratings').where('hidden','==',false).get(),
      db.collection('reports').where('status','==','open').get(),
      db.collection('settings').doc('stats').get(),
    ]);
    const orders=ordersSnap.docs.map(d=>({id:d.id,...d.data()}));
    const pending=orders.filter(o=>o.status==='pending').length;
    const done=orders.filter(o=>o.status==='done').length;
    const revenue=orders.filter(o=>o.status==='done').reduce((s,o)=>s+(o.totalDZD||0),0);
    const avgRating=ratingsSnap.size?(ratingsSnap.docs.reduce((s,d)=>s+(d.data().rating||0),0)/ratingsSnap.size).toFixed(1):'—';
    const visits=statsSnap.exists?(statsSnap.data().visitors||0):0;
    setVal('st-orders',ordersSnap.size);setVal('st-pending',pending);setVal('st-done',done);
    setVal('st-users',usersSnap.size);setVal('st-revenue',revenue.toLocaleString()+' دج');
    setVal('st-rating',avgRating);setVal('st-visits',visits.toLocaleString());setVal('st-reports',reportsSnap.size);
    document.getElementById('sbPendingBadge').textContent=pending;
    document.getElementById('sbReportBadge').textContent=reportsSnap.size;
    window._dash={orders,users:usersSnap.docs.map(d=>({id:d.id,...d.data()}))};   /* feeds the quick-search palette and the charts */
    try{renderInsights(orders,window._dash.users);}catch(e){console.error('insights',e);}
    // Recent orders
    const recent=orders.sort((a,b)=>(b.ts?.seconds||0)-(a.ts?.seconds||0)).slice(0,5);
    const rc=document.getElementById('dashRecentOrders');rc.innerHTML='';
    if(!recent.length){rc.innerHTML=empty('لا توجد طلبات بعد');return;}
    recent.forEach(o=>{
      const el=document.createElement('div');el.className='adm-card';
      const sc=o.status==='done'?'badge-done':o.status==='pending'?'badge-pend':o.status==='processing'?'badge-proc':'badge-rej';
      el.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico"><i class="fa-solid fa-box"></i></div><div class="adm-card-info"><div class="adm-card-title">${san(o.product||'')}</div><div class="adm-card-sub"><i class="fa-solid fa-coins"></i>${esc((o.totalDZD||0).toLocaleString())} دج · ${esc(o.paymentMethod==='baridimob'?'BaridiMob':'يد بيد')}</div><div class="adm-card-meta"><span><i class="fa-solid fa-hashtag"></i>${esc(o.id.slice(0,14))}…</span><span><i class="fa-regular fa-calendar"></i>${esc(o.date||'')}</span></div></div><span class="badge ${sc}">${esc(STATUS_AR[o.status]||o.status||'')}</span></div>`;
      rc.appendChild(el);
    });
    // Top users
    const usersData=usersSnap.docs.map(d=>({id:d.id,...d.data()}));
    const topUsers=usersData.sort((a,b)=>(b.points||0)-(a.points||0)).slice(0,5);
    const tu=document.getElementById('dashTopUsers');tu.innerHTML='';
        topUsers.forEach((u,i)=>{const el=document.createElement('div');el.className='top-user';el.innerHTML=`<span class="rk">${i+1}</span><span class="nm">${san(u.name||u.email||'مستخدم')}</span><span class="pt">${esc((u.points||0).toLocaleString())} نقطة</span><span style="color:var(--mid)">${esc(u.orders||0)} طلب</span>`;tu.appendChild(el);});

    // Charts & Fraud
    renderChartsFromOrders(orders,usersData);
    runFraudDetection(orders,usersData);
  }catch(e){console.error('Dashboard error:',e);}
}

/* ══ ORDERS ══ */
async function loadOrders(){
  const el=document.getElementById('ordersList');el.innerHTML=loading();
  try{const snap=await db.collection('orders').orderBy('ts','desc').limit(ordersLoaded).get();allOrders=snap.docs.map(d=>({id:d.id,...d.data()}));renderOrders();}
  catch(e){el.innerHTML=errState('خطأ في تحميل الطلبات');}
}
function loadMoreOrders(){ordersLoaded+=20;loadOrders();}

function renderOrders(){
  const el=document.getElementById('ordersList');el.innerHTML='';
  const q=(document.getElementById('orderSearch')?.value||'').toLowerCase();
  let filtered=allOrders.filter(o=>currentOrderFilter==='all'||o.status===currentOrderFilter);
  if(q)filtered=filtered.filter(o=>(o.id||'').toLowerCase().includes(q)||(o.product||'').toLowerCase().includes(q)||(o.receiveContact||'').toLowerCase().includes(q));
  if(!filtered.length){el.innerHTML=empty('لا توجد طلبات');return;}
  filtered.forEach(o=>{
    const card=document.createElement('div');card.className='adm-card';
    const sc=o.status==='done'?'badge-done':o.status==='pending'?'badge-pend':o.status==='processing'?'badge-proc':'badge-rej';
    const stxt=STATUS_AR[o.status]||'مرفوض';
    card.innerHTML=`
      <div class="adm-card-top">
        <div class="adm-card-ico"><i class="fa-solid fa-box"></i></div>
        <div class="adm-card-info">
          <div class="adm-card-title">${san(o.product||'')}</div>
          <div class="adm-card-sub"><i class="fa-solid fa-coins"></i>${esc((o.totalDZD||0).toLocaleString())} دج · ${esc(o.paymentMethod==='baridimob'?'BaridiMob':'يد بيد')}</div>
          <div class="adm-card-meta">
            <span><i class="fa-solid fa-hashtag"></i>${esc(o.id.slice(0,16))}…</span>
            <span><i class="fa-regular fa-user"></i>${esc(o.userId==='guest'?'زائر':o.userId?.slice(0,8)||'—')}</span>
            <span><i class="fa-regular fa-calendar"></i>${esc(o.date||'')}</span>
            ${o.receiveContact?`<span><i class="fa-regular fa-envelope"></i>${san(o.receiveContact)}</span>`:''}
            ${o.coupon?`<span><i class="fa-solid fa-ticket"></i>${san(o.coupon)}</span>`:''}
          </div>
        </div>
        <span class="badge ${sc}">${stxt}</span>
      </div>
      <div class="adm-card-actions">
        ${o.status==='pending'?`<button onclick="setOrderStatus('${jsq(o.id)}','processing')" class="btn btn-o btn-sm"><i class="fa-solid fa-gear"></i> معالجة</button><button onclick="openConfirmModal('${jsq(o.id)}','${jsq(o.product||'')}','${jsq(o.receiveContact||'')}')" class="btn btn-g btn-sm"><i class="fa-solid fa-check"></i> إرسال</button><button onclick="setOrderStatus('${jsq(o.id)}','rejected')" class="btn btn-r btn-sm"><i class="fa-solid fa-xmark"></i> رفض</button>`:''}
        ${o.status==='processing'?`<button onclick="openConfirmModal('${jsq(o.id)}','${jsq(o.product||'')}','${jsq(o.receiveContact||'')}')" class="btn btn-g btn-sm"><i class="fa-solid fa-paper-plane"></i> إرسال الكود</button><button onclick="setOrderStatus('${jsq(o.id)}','rejected')" class="btn btn-r btn-sm"><i class="fa-solid fa-xmark"></i> رفض</button>`:''}
        <button onclick="copyText('${jsq(o.id)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-copy"></i> ID</button>
        <button onclick="deleteOrder('${jsq(o.id)}')" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
    el.appendChild(card);
  });
}

function filterOrders(f,btn){currentOrderFilter=f;document.querySelectorAll('#tab-orders .filter-btn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderOrders();}
async function setOrderStatus(id,status){if(status==='done'){aToast('استخدم زر إرسال الكود لإتمام الطلب','err');return;}try{await db.collection('orders').doc(id).update({status});allOrders=allOrders.map(o=>o.id===id?{...o,status}:o);renderOrders();aToast(`تم تغيير الحالة: ${status}`,'ok');await loadDashboard();}catch(e){aToast('خطأ في التحديث','err');}}
async function deleteOrder(id){if(!confirm('حذف هذا الطلب نهائياً؟'))return;try{await db.collection('orders').doc(id).delete();allOrders=allOrders.filter(o=>o.id!==id);renderOrders();aToast('تم الحذف','info');}catch(e){aToast('خطأ','err');}}

function openConfirmModal(orderId,product,contact){
  currentOrderForDelivery={orderId,product,contact};
  document.getElementById('cmOrderId').textContent=orderId;
  document.getElementById('cmProduct').textContent=product;
  document.getElementById('cmCode').value='';
  document.getElementById('confirmModal').classList.remove('hidden');
}
function closeConfirmModal(){document.getElementById('confirmModal').classList.add('hidden');currentOrderForDelivery=null;}

/* Code validity (store policy): from the day of delivery until the LAST DAY of that calendar month, Algeria time (UTC+1).
   Same arithmetic as monthEndISO() in worker.js; worker.test.mjs checks the two agree. */
function codeUntil(ms){const d=new Date((ms||Date.now())+3600000);const y=d.getUTCFullYear(),m=d.getUTCMonth();const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();return `${y}-${String(m+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`;}

/* Marks an order done and pays the customer ONCE. Points are no longer "1 per 1000 DZD": they are a share of the
   PROFIT of this order (econ.js), and the same amount is added to the customer's reward pool, so a free reward can
   never cost the store more than the store earned. The invited friend's FIRST delivered order also pays the person
   who invited him, from that order's profit, capped per friend. The `awarded` flag makes a second call harmless.
   The profit figures go to order_econ/{orderId} (owner-only), never onto the order the customer can read. */
async function completeOrder(orderId,notif){
  const FV=firebase.firestore.FieldValue;
  const e=await ensureEcon();
  if(e._failed)throw new Error('تعذّر قراءة قواعد النقاط — لم يُسلَّم الطلب. أعد المحاولة');
  await ensureProds();
  const oref=db.collection('orders').doc(orderId);
  return db.runTransaction(async tx=>{
    const os=await tx.get(oref);if(!os.exists)throw new Error('الطلب غير موجود');
    const o=os.data();const uid=o.userId;
    let uref=null,us=null,rref=null,rs=null;
    if(o.awarded===false&&uid&&uid!=='guest'){   /* only orders created by the new Worker carry awarded:false; older orders were already paid when they were placed */
      uref=db.collection('users').doc(uid);us=await tx.get(uref);
      const u=us.exists?us.data():null;
      if(u&&u.referredBy&&u.referredBy!==uid&&!u.refRewarded&&(Number(o.totalDZD)||0)>=e.refMinOrderDZD){rref=db.collection('users').doc(u.referredBy);rs=await tx.get(rref);}
    }
    /* the deadline is fixed the first time the order is delivered; a later re-send never extends it */
    const upd0=o.awarded===false?{status:'done',awarded:true}:{status:'done'};if(!o.codeValidUntil)upd0.codeValidUntil=(notif&&notif.until)||codeUntil();
    tx.update(oref,upd0);
    if(us&&us.exists){
      const total=Math.max(0,Number(o.totalDZD)||0);
      const pr=GQEcon.orderProfit(o,allProds,e,ECO_RATES);
      const pts=GQEcon.earnPts(pr.profit,e);
      const upd={points:FV.increment(pts),rewardPool:FV.increment(pts*e.ptDZD),orders:FV.increment(1),totalSpend:FV.increment(total)};
      if(notif)upd.notifications=FV.arrayUnion(notif);
      let rp=0;
      if(rs&&rs.exists){
        rp=GQEcon.refPts(pr.profit,e);
        upd.refRewarded=true;
        tx.update(rref,{points:FV.increment(rp),rewardPool:FV.increment(rp*e.ptDZD),referrals:FV.increment(1),refPoints:FV.increment(rp)});
      }
      tx.update(uref,upd);
      tx.set(db.collection('order_econ').doc(orderId),{orderId,userId:uid,revenue:pr.revenue,cost:pr.cost,profit:pr.profit,estimated:pr.estimated,pts,refPts:rp,refUserId:(rs&&rs.exists)?u_ref(us):null,ptDZD:e.ptDZD,earnPct:e.earnPct,refPct:e.refPct,ts:FV.serverTimestamp()});
    }else if(notif&&uid&&uid!=='guest'){
      tx.update(db.collection('users').doc(uid),{notifications:FV.arrayUnion(notif)});
    }
  });
}
function u_ref(us){const d=us&&us.exists?us.data():null;return d&&d.referredBy?d.referredBy:null;}

async function confirmDelivery(){
  const code=document.getElementById('cmCode').value.trim();
  if(!code){aToast('أدخل الكود','err');return;}
  const{orderId,product,contact}=currentOrderForDelivery||{};if(!orderId)return;
  try{
    const notif={title:`طلبك جاهز — ${product}`,code:`الكود: ${code}`,date:new Date().toLocaleDateString('ar'),until:codeUntil(),read:false};
    await completeOrder(orderId,notif);
    allOrders=allOrders.map(o=>o.id===orderId?{...o,status:'done'}:o);renderOrders();
    const m=await adminSendCode({orderId,code,product});
    await adminNotify(`✅ تم التسليم!\n🆔 ${orderId}\n🎮 ${product}\n🔑 ${code}\n📧 ${contact}\n${m.ok?'✉️ أُرسل الإيميل إلى '+m.to:'⚠️ فشل إيميل الكود: '+m.error}`);
    if(m.ok){closeConfirmModal();aToast('تم التأكيد وأُرسل الكود إلى '+m.to,'ok');await loadDashboard();}
    else aToast('تم تأكيد الطلب وظهر الكود في حساب العميل، لكن فشل الإيميل: '+m.error+'. اضغط الزر لإعادة المحاولة','warn');
  }catch(e){aToast('خطأ: '+e.message,'err');}
}

/* ══ CATEGORIES ══ */
let allCats=[],editingCat=null;
const CAT_EMOJIS=['🎮','🎴','👑','🕹️','💳','🎁','⭐','🔥','🛒','🎧','🏆','💎','🎟️','📦'];
const CAT_SWATCHES=[['#203a43','#2c5364'],['#4c1d95','#c026d3'],['#1e3a8a','#0ea5e9'],['#065f46','#10b981'],['#7c2d12','#f59e0b'],['#7f1d1d','#ef4444'],['#831843','#ec4899'],['#1f2937','#6b7280']];
const HEX6=/^#[0-9a-f]{6}$/i;
function catGrad(){const c1=document.getElementById('newCatC1').value,c2=document.getElementById('newCatC2').value;return `linear-gradient(135deg,${HEX6.test(c1)?c1:'#203a43'},${HEX6.test(c2)?c2:'#2c5364'})`;}
function catPrev(){const el=document.getElementById('catPrev');if(!el)return;el.style.background=catGrad();el.textContent=document.getElementById('newCatIcon').value.trim()||'📦';
  document.querySelectorAll('#catEmojiGrid button').forEach(b=>b.classList.toggle('on',b.textContent===document.getElementById('newCatIcon').value.trim()));}
function slugId(t){return String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,30);}
function catAuto(){if(editingCat)return;const idEl=document.getElementById('newCatId');if(idEl.dataset.touched)return;idEl.value=slugId(document.getElementById('newCatNameEn').value);}
function initCatForm(){
  const g=document.getElementById('catEmojiGrid');if(g&&!g.children.length){CAT_EMOJIS.forEach(e=>{const b=document.createElement('button');b.type='button';b.textContent=e;b.onclick=()=>{document.getElementById('newCatIcon').value=e;catPrev();};g.appendChild(b);});}
  const sw=document.getElementById('catSwatches');if(sw&&!sw.children.length){CAT_SWATCHES.forEach(([a,b2])=>{const b=document.createElement('button');b.type='button';b.style.background=`linear-gradient(135deg,${a},${b2})`;b.title=a+' → '+b2;b.onclick=()=>{document.getElementById('newCatC1').value=a;document.getElementById('newCatC2').value=b2;catPrev();};sw.appendChild(b);});}
  const idEl=document.getElementById('newCatId');if(idEl&&!idEl.dataset.bound){idEl.dataset.bound='1';idEl.addEventListener('input',()=>{idEl.dataset.touched='1';});}
  catPrev();
}
function clearCatForm(){editingCat=null;['newCatId','newCatName','newCatNameEn','newCatIcon','newCatOrder'].forEach(i=>{const e=document.getElementById(i);e.value='';delete e.dataset.touched;});
  document.getElementById('newCatId').readOnly=false;document.getElementById('newCatC1').value='#203a43';document.getElementById('newCatC2').value='#2c5364';
  document.getElementById('catFormTitle').textContent='إضافة قسم جديد';document.getElementById('catSaveBtn').innerHTML='<i class="fa-solid fa-plus"></i> إضافة قسم';catPrev();}
async function loadCats(){
  const el=document.getElementById('catsList');el.innerHTML=loading();initCatForm();
  try{
    const d=await db.collection('settings').doc('categories').get();
    const cats=d.exists?d.data().categories||[]:[];
    allCats=cats.slice().sort((a,b)=>(a.order||0)-(b.order||0));pfFillCats();
    el.innerHTML='';if(!cats.length){el.innerHTML=empty('لا توجد أقسام');return;}
    allCats.forEach(cat=>{
      const card=document.createElement('div');card.className='adm-card';
      card.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico" style="background:${esc(cat.bg||'#1c2a44')};font-size:20px">${esc(cat.icon||'📦')}</div><div class="adm-card-info"><div class="adm-card-title">${san(cat.name)} | ${san(cat.nameEn||'')}</div><div class="adm-card-sub">ID: ${san(cat.id)} · ترتيب: ${esc(cat.order||0)}</div></div><div class="toggle-wrap"><label class="toggle"><input type="checkbox" ${esc(cat.enabled?'checked':'')} onchange="toggleCat('${jsq(cat.id)}',this.checked)"><span class="toggle-sl"></span></label></div></div><div class="adm-card-actions"><button onclick="editCat('${jsq(cat.id)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-pen"></i> تعديل</button><button onclick="deleteCat('${jsq(cat.id)}')" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i> حذف</button></div>`;
      el.appendChild(card);
    });
    const pf=document.getElementById('prodCatFilter');pf.innerHTML='<button class="filter-btn on" onclick="filterProds(\'all\',this)">الكل</button>';
    allCats.forEach(cat=>{pf.innerHTML+=`<button class="filter-btn" onclick="filterProds('${jsq(cat.id)}',this)">${san(cat.name)}</button>`;});
  }catch(e){el.innerHTML=errState('خطأ');}
}
function editCat(id){
  const c=allCats.find(x=>x.id===id);if(!c)return;editingCat=id;
  document.getElementById('newCatId').value=c.id;document.getElementById('newCatId').readOnly=true;document.getElementById('newCatName').value=c.name||'';document.getElementById('newCatNameEn').value=c.nameEn||'';document.getElementById('newCatIcon').value=c.icon||'';document.getElementById('newCatOrder').value=c.order||'';
  const m=/^linear-gradient\(135deg,\s*(#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)$/i.exec(String(c.bg||''));
  document.getElementById('newCatC1').value=m?m[1]:'#203a43';document.getElementById('newCatC2').value=m?m[2]:'#2c5364';
  document.getElementById('catFormTitle').textContent='تعديل القسم: '+(c.name||id);document.getElementById('catSaveBtn').innerHTML='<i class="fa-solid fa-floppy-disk"></i> حفظ التعديل';catPrev();
  document.getElementById('newCatName').scrollIntoView({behavior:'smooth',block:'center'});
}
async function addCat(){
  const name=document.getElementById('newCatName').value.trim();const nameEn=document.getElementById('newCatNameEn').value.trim();const icon=document.getElementById('newCatIcon').value.trim();
  let id=document.getElementById('newCatId').value.trim().toLowerCase();
  if(!name){aToast('أدخل اسم القسم','err');return;}
  try{
    const d=await db.collection('settings').doc('categories').get();const cats=d.exists?d.data().categories||[]:[];
    if(!editingCat){
      if(!id)id=slugId(nameEn)||('cat'+(cats.length+1));
      if(!/^[a-z0-9][a-z0-9_-]{0,29}$/.test(id)){aToast('المعرّف: حروف إنجليزية صغيرة وأرقام و - فقط','err');return;}
      if(cats.find(c=>c.id===id)){aToast('المعرّف موجود مسبقاً','err');return;}
    }
    const order=parseInt(document.getElementById('newCatOrder').value)||(Math.max(0,...cats.map(c=>c.order||0))+1);
    const rec={id:editingCat||id,name,nameEn:nameEn||name,icon:icon||'📦',bg:catGrad(),order};
    if(editingCat){const i=cats.findIndex(c=>c.id===editingCat);if(i<0){aToast('القسم لم يعد موجوداً','err');return;}cats[i]={...cats[i],...rec};}
    else cats.push({...rec,enabled:true});
    await db.collection('settings').doc('categories').set({categories:cats});
    aToast(editingCat?'تم حفظ التعديل':'تم إضافة القسم','ok');clearCatForm();loadCats();
  }catch(e){aToast('خطأ: '+e.message,'err');}
}
async function toggleCat(id,val){try{const d=await db.collection('settings').doc('categories').get();const cats=d.data().categories||[];const c=cats.find(x=>x.id===id);if(!c)return;c.enabled=val;await db.collection('settings').doc('categories').set({categories:cats});aToast(val?'مفعّل':'مخفي',val?'ok':'warn');}catch(e){aToast('خطأ','err');}}
async function deleteCat(id){
  const n=allProds.filter(p=>p.cat===id).length;
  if(!confirm(n?`في هذا القسم ${n} منتج. لن تظهر في المتجر بعد حذف القسم حتى تنقلها لقسم آخر. حذف القسم؟`:'حذف هذا القسم؟'))return;
  try{const d=await db.collection('settings').doc('categories').get();const cats=(d.data().categories||[]).filter(x=>x.id!==id);await db.collection('settings').doc('categories').set({categories:cats});aToast('تم الحذف','info');loadCats();}catch(e){aToast('خطأ','err');}
}

/* ══ PRODUCTS ══ */
let allProds=[],prodFilter='all';
async function loadProds(){
  const el=document.getElementById('prodsList');el.innerHTML=loading();
  try{const d=await db.collection('settings').doc('products').get();allProds=d.exists?d.data().products||[]:[];renderProds();}
  catch(e){el.innerHTML=errState('خطأ');}
}
function filterProds(f,btn){prodFilter=f;document.querySelectorAll('#prodCatFilter .filter-btn').forEach(b=>b.classList.remove('on'));btn?.classList.add('on');renderProds();}
function renderProds(){
  const el=document.getElementById('prodsList');el.innerHTML='';
  const filtered=prodFilter==='all'?allProds:allProds.filter(p=>p.cat===prodFilter);
  if(!filtered.length){el.innerHTML=empty('لا توجد منتجات');return;}
  filtered.forEach(p=>{
    const realIdx=allProds.indexOf(p);const card=document.createElement('div');card.className='adm-card';
    const valText=p.cur==='month'?`${p.val} شهر`:p.cur==='copy'?'نسخة':`${p.val}${p.sym||''}`;
    const bgCls=p.img==='ps'?'prod-thumb-ps':p.img==='plus'?'prod-thumb-plus':'prod-thumb-game';
    const ico=p.img==='ps'?'<i class="fa-brands fa-playstation"></i>':p.img==='plus'?'<i class="fa-solid fa-crown"></i>':'<i class="fa-solid fa-gamepad"></i>';
    card.innerHTML=`<div class="adm-card-top"><div class="prod-thumb ${bgCls}">${p.imgUrl?`<img src="${esc(safeUrl(p.imgUrl))}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`:ico}</div><div class="adm-card-info"><div class="adm-card-title">${san(p.name||'')} — ${esc(valText)}</div><div class="adm-card-sub">${san(p.sub||'')} · ${esc((p.priceDZD||0).toLocaleString())} دج</div><div class="adm-card-meta"><span>${esc(p.cat)}</span>${p.badge?`<span class="badge badge-info">${san(p.badge)}</span>`:''}</div></div><div class="toggle-wrap"><label class="toggle"><input type="checkbox" ${esc(p.stock!==false?'checked':'')} onchange="toggleStock(${esc(realIdx)},this.checked)"><span class="toggle-sl"></span></label></div></div><div class="adm-card-actions"><button onclick="editProd(${esc(realIdx)})" class="btn btn-o btn-sm"><i class="fa-solid fa-pen"></i> تعديل</button><button onclick="deleteProd(${esc(realIdx)})" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i> حذف</button></div>`;
    el.appendChild(card);
  });
}

/* ── guided product form: pick the TYPE first, then only the fields that type needs ── */
/* RATES must equal the Worker's: used only to suggest a price, the Worker computes the real one */
const PF_RATES={EUR:220,USD:200,SAR:55,AED:56};
const PF_SYM={EUR:'€',USD:'$',SAR:'ر.س',AED:'د.إ'};
const PF_REGIONS=['France 🇫🇷','Germany 🇩🇪','Spain 🇪🇸','Italy 🇮🇹','Netherlands 🇳🇱','Belgium 🇧🇪','United Kingdom 🇬🇧','USA 🇺🇸','Saudi Arabia 🇸🇦','UAE 🇦🇪','Turkey 🇹🇷','Europe 🇪🇺'];
const PF_TIERS=['Essential','Extra','Premium'];
const PF_DURS=[[1,'شهر واحد'],[3,'3 أشهر'],[12,'12 شهراً']];
const PF_PLATS=['PS5','PS4','PS4 & PS5'];
const PF_VALUES=[5,10,15,20,25,50,75,100];
const PF_NAME={card:'PS Store Card',sub:'PS Plus',game:''};
let pf={kind:null,editing:null,idTouched:false,nameTouched:false,keepBadge:''};
const $pf=id=>document.getElementById(id);
function pfOpts(sel,list,first){sel.innerHTML=(first!==undefined?`<option value="">${esc(first)}</option>`:'')+list.map(x=>Array.isArray(x)?`<option value="${esc(x[0])}">${esc(x[1])}</option>`:`<option value="${esc(x)}">${esc(x)}</option>`).join('');}
function pfFillCats(){
  const sel=$pf('npCat');if(!sel)return;const cur=sel.value;
  const list=allCats.length?allCats:[{id:'psstore',name:'بطاقات PlayStation'},{id:'psplus',name:'اشتراكات PS Plus'},{id:'games',name:'ألعاب رقمية'}];
  sel.innerHTML=list.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  if(cur&&list.some(c=>c.id===cur))sel.value=cur;
}
function pfInitStatic(){
  if($pf('npTier').dataset.init)return;$pf('npTier').dataset.init='1';
  pfOpts($pf('npTier'),PF_TIERS);pfOpts($pf('npDur'),PF_DURS);pfOpts($pf('npPlat'),PF_PLATS,'— غير محدد —');
  const ch=$pf('pfValChips');ch.innerHTML=PF_VALUES.map(v=>`<button type="button" class="pf-chip" onclick="pfSetVal(${v})">${v}</button>`).join('');
}
function pfSetVal(v){$pf('npVal').value=v;pfAuto();}
function pfKind(k,keepValues){
  pfInitStatic();pf.kind=k;pfFillCats();
  document.querySelectorAll('#pfKinds .pf-kind').forEach(b=>b.classList.toggle('on',b.dataset.k===k));
  $pf('pfBody').classList.remove('hidden');
  document.querySelectorAll('#pfBody .pf-only').forEach(e=>e.classList.toggle('hidden',!e.classList.contains('pf-'+k)));
  $pf('pfRegionLbl').textContent=k==='game'?'المنطقة (اختياري)':'المنطقة';
  pfOpts($pf('npRegion'),PF_REGIONS.map(r=>[r,r]).concat([['__other','أخرى (اكتب)…']]),k==='game'?'— بدون —':'— اختر المنطقة —');
  $pf('pfNameLbl').textContent=k==='game'?'اسم اللعبة':k==='sub'?'اسم الاشتراك':'اسم البطاقة';
  $pf('npName').placeholder=k==='game'?'EA SPORTS FC 26':k==='sub'?'PS Plus Essential':'PS Store Card';
  $pf('pfImgLbl').textContent=k==='game'?'رابط غلاف اللعبة (مهم)':'رابط صورة مخصصة (اختياري)';
  $pf('pfPriceHint').textContent='';
  if(!keepValues){
    const want={card:'psstore',sub:'psplus',game:'games'}[k];if([...$pf('npCat').options].some(o=>o.value===want))$pf('npCat').value=want;
    pf.nameTouched=false;pf.idTouched=false;pf.keepBadge='';$pf('npName').value=PF_NAME[k];
    $pf('npCur').value='EUR';pfCur();
  }
  pfAuto();
}
function pfRegion(){$pf('npRegionOther').classList.toggle('hidden',$pf('npRegion').value!=='__other');pfAuto();}
function pfCur(){$pf('npSym').value=PF_SYM[$pf('npCur').value]||'';pfAuto();}
function pfNameTouched(){pf.nameTouched=true;pfAuto();}
function pfRegionText(){const v=$pf('npRegion').value;return v==='__other'?$pf('npRegionOther').value.trim():v;}
function pfAuto(){
  const k=pf.kind;if(!k)return;
  if(k==='sub'&&!pf.nameTouched)$pf('npName').value='PS Plus '+$pf('npTier').value;
  if(!pf.idTouched&&!pf.editing){
    const reg=slugId(pfRegionText().replace(/[^\x00-\x7F]/g,' '));
    let base=k==='card'?['ps',$pf('npVal').value,$pf('npCur').value.toLowerCase(),reg]:k==='sub'?['plus',$pf('npTier').value.toLowerCase(),$pf('npDur').value+'m',reg]:['game',slugId($pf('npName').value),$pf('npPlat').value.toLowerCase().replace(/[^a-z0-9]/g,''),reg];
    let id=slugId(base.filter(Boolean).join('-'))||('p'+Date.now().toString(36));
    let n=2,u=id;while(allProds.some(p=>p.id===u))u=id+'-'+(n++);
    $pf('npId').value=u;
  }
  const hint=$pf('pfPriceHint');
  if(k==='card'){const v=parseFloat($pf('npVal').value)||0,r=PF_RATES[$pf('npCur').value]||0;hint.textContent=v?`إن تركت السعر فارغاً يُحسب تلقائياً: ${(v*r).toLocaleString()} دج (${v}${PF_SYM[$pf('npCur').value]} × ${r}). اكتب سعراً لتغييره.`:'';}
  else hint.textContent='اكتب سعر البيع بالدينار — هذا الحقل مطلوب.';
  document.querySelectorAll('#pfValChips .pf-chip').forEach(c=>c.classList.toggle('on',c.textContent===$pf('npVal').value));
}
function editProd(idx){
  const p=allProds[idx];if(!p)return;
  const k=p.kind||(p.cur==='month'?'sub':p.cur==='copy'?'game':'card');
  pfKind(k,true);pf.editing=p.id;pf.idTouched=true;pf.nameTouched=true;pf.keepBadge=p.badge||'';
  pfFillCats();$pf('npCat').value=p.cat||$pf('npCat').value;
  $pf('npName').value=p.name||'';$pf('npId').value=p.id||'';$pf('npId').readOnly=true;
  $pf('npDZD').value=p.priceDZD||'';$pf('npImgUrl').value=p.imgUrl||'';$pf('npDesc').value=p.desc||'';$pf('npDescEn').value=p.descEn||'';$pf('npStock').checked=p.stock!==false;
  const setRegion=t=>{t=String(t||'');if(!t){$pf('npRegion').value='';}else if(PF_REGIONS.includes(t)){$pf('npRegion').value=t;}else{$pf('npRegion').value='__other';$pf('npRegionOther').value=t;}$pf('npRegionOther').classList.toggle('hidden',$pf('npRegion').value!=='__other');};
  if(k==='card'){setRegion(p.sub);$pf('npCur').value=PF_SYM[p.cur]?p.cur:'EUR';$pf('npSym').value=PF_SYM[$pf('npCur').value];$pf('npVal').value=p.val||'';}
  else if(k==='sub'){setRegion(p.sub);if(PF_TIERS.includes(p.badge))$pf('npTier').value=p.badge;if(PF_DURS.some(d=>d[0]===p.val))$pf('npDur').value=String(p.val);}
  else{const parts=String(p.sub||'').split(' • ');if(PF_PLATS.includes(parts[0])){$pf('npPlat').value=parts[0];setRegion(parts.slice(1).join(' • '));}else{$pf('npPlat').value='';setRegion(p.sub);}}
  $pf('pfTitle').textContent='تعديل المنتج: '+(p.name||p.id);$pf('pfSaveBtn').innerHTML='<i class="fa-solid fa-floppy-disk"></i> حفظ التعديل';
  pfAuto();$pf('pfKinds').scrollIntoView({behavior:'smooth',block:'center'});aToast('تم تحميل المنتج للتعديل','ℹ️');
}
async function addProd(){
  const k=pf.kind;if(!k){aToast('اختر نوع المنتج أولاً','err');return;}
  const name=$pf('npName').value.trim();let id=$pf('npId').value.trim();
  if(!name){aToast('أدخل الاسم','err');return;}
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/.test(id)){aToast('المعرّف: حروف إنجليزية وأرقام و - فقط','err');return;}
  const region=pfRegionText(),priceDZD=parseFloat($pf('npDZD').value)||0;
  const imgUrl=$pf('npImgUrl').value.trim();if(imgUrl&&!safeUrl(imgUrl)){aToast('رابط الصورة يجب أن يبدأ بـ https://','err');return;}
  let rec;
  if(k==='card'){
    const val=parseFloat($pf('npVal').value)||0;if(val<=0){aToast('أدخل قيمة البطاقة','err');return;}
    if(!region){aToast('اختر المنطقة','err');return;}
    const cur=$pf('npCur').value;rec={sub:region,val,cur,sym:PF_SYM[cur],img:'ps',badge:pf.keepBadge};
  }else if(k==='sub'){
    if(!region){aToast('اختر المنطقة','err');return;}
    if(priceDZD<=0){aToast('أدخل سعر الاشتراك بالدينار','err');return;}
    rec={sub:region,val:parseInt($pf('npDur').value)||1,cur:'month',sym:'',img:'plus',badge:$pf('npTier').value};
  }else{
    if(priceDZD<=0){aToast('أدخل سعر اللعبة بالدينار','err');return;}
    rec={sub:[$pf('npPlat').value,region].filter(Boolean).join(' • '),val:1,cur:'copy',sym:'',img:'',badge:pf.keepBadge};
  }
  const prod={id,cat:$pf('npCat').value,name,...rec,priceDZD,imgUrl:imgUrl||null,desc:$pf('npDesc').value.trim(),descEn:$pf('npDescEn').value.trim(),stock:$pf('npStock').checked,kind:k};
  try{
    const d=await db.collection('settings').doc('products').get();let prods=d.exists?d.data().products||[]:[];
    const idx=prods.findIndex(p=>p.id===id);
    if(idx>=0&&pf.editing!==id){aToast('هذا المعرّف مستعمل لمنتج آخر، غيّره من «معرّف المنتج»','err');return;}
    if(idx>=0)prods[idx]=prod;else prods.push(prod);
    await db.collection('settings').doc('products').set({products:prods});allProds=prods;renderProds();aToast(idx>=0?'تم تعديل المنتج':'تم إضافة المنتج','ok');clearProdForm();
  }catch(e){aToast('خطأ: '+e.message,'err');}
}

async function toggleStock(idx,val){try{allProds[idx].stock=val;await db.collection('settings').doc('products').set({products:[...allProds]});renderProds();aToast(val?'متوفر':'نفذ',val?'ok':'warn');}catch(e){aToast('خطأ','err');}}
async function deleteProd(idx){if(!confirm('حذف هذا المنتج؟'))return;try{allProds.splice(idx,1);await db.collection('settings').doc('products').set({products:allProds});renderProds();aToast('تم الحذف','info');}catch(e){aToast('خطأ','err');}}
function clearProdForm(){
  pf={kind:null,editing:null,idTouched:false,nameTouched:false,keepBadge:''};
  ['npId','npName','npVal','npDZD','npImgUrl','npDesc','npDescEn','npRegionOther'].forEach(i=>{const e=$pf(i);if(e)e.value='';});
  $pf('npId').readOnly=false;$pf('npStock').checked=true;$pf('npRegion').value='';$pf('npRegionOther').classList.add('hidden');
  document.querySelectorAll('#pfKinds .pf-kind').forEach(b=>b.classList.remove('on'));$pf('pfBody').classList.add('hidden');
  $pf('pfTitle').textContent='إضافة منتج جديد';$pf('pfSaveBtn').innerHTML='<i class="fa-solid fa-floppy-disk"></i> حفظ المنتج';
}

/* ══ COUPONS ══ */
async function loadCoupons(){
  const el=document.getElementById('cpnList');el.innerHTML=loading();
  try{
    const d=await db.collection('settings').doc('coupons').get();const cpns=d.exists?d.data().coupons||[]:[];el.innerHTML='';
    if(!cpns.length){el.innerHTML=empty('لا توجد كوبونات');return;}
    const today=new Date().toISOString().split('T')[0];
    cpns.forEach((c,i)=>{
      const exp=c.expiry?c.expiry>=today?'<span class="badge badge-done">صالح</span>':'<span class="badge badge-rej">منتهي</span>':'<span class="badge badge-info">بلا انتهاء</span>';
      const card=document.createElement('div');card.className='adm-card';
      card.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico" style="color:var(--gold)"><i class="fa-solid fa-ticket"></i></div><div class="adm-card-info"><div class="adm-card-title" style="font-family:monospace;font-size:15px;color:var(--cyan)">${san(c.code)}</div><div class="adm-card-sub">${c.type==='percent'?`خصم ${c.value}%`:`خصم ${c.value} دج`} · استُخدم ${esc(c.usedCount||0)}/${esc(c.maxUses||'∞')}</div><div class="adm-card-meta"><span>ينتهي: ${esc(c.expiry||'—')}</span>${exp}${c.featured?'<span class="badge badge-info">معروض في الرئيسية</span>':''}</div></div><div class="toggle-wrap"><label class="toggle"><input type="checkbox" ${esc(c.active?'checked':'')} onchange="toggleCpn(${esc(i)},this.checked)"><span class="toggle-sl"></span></label></div></div><div class="adm-card-actions"><button onclick="copyText('${jsq(c.code)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-copy"></i> نسخ</button><button onclick="featureCpn(${esc(i)},${c.featured?'false':'true'})" class="btn btn-o btn-sm"><i class="fa-solid fa-star"></i> ${c.featured?'إزالة من الرئيسية':'اعرضه في الرئيسية'}</button><button onclick="deleteCpn(${esc(i)})" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i> حذف</button></div>`;
      el.appendChild(card);
    });
  }catch(e){el.innerHTML=errState('خطأ');}
}

async function addCoupon(){
  const code=document.getElementById('ncCode').value.trim().toUpperCase();const type=document.getElementById('ncType').value;const val=parseFloat(document.getElementById('ncVal').value);const maxUses=parseInt(document.getElementById('ncMax').value)||null;const expiry=document.getElementById('ncExpiry').value||null;const featured=document.getElementById('ncFeat').checked;
  if(!code||!val){aToast('أدخل الكود والقيمة','err');return;}
  if(type==='percent'&&(val<=0||val>100)){aToast('النسبة بين 1-100','err');return;}
  try{const d=await db.collection('settings').doc('coupons').get();const cpns=d.exists?d.data().coupons||[]:[];if(cpns.find(c=>c.code===code)){aToast('الكود موجود مسبقاً','err');return;}if(featured)cpns.forEach(c=>{c.featured=false;});cpns.push({code,type,value:val,active:true,usedCount:0,maxUses,expiry,featured,created:new Date().toISOString()});await db.collection('settings').doc('coupons').set({coupons:cpns});aToast('تم إنشاء: '+code,'ok');loadCoupons();['ncCode','ncVal','ncMax','ncExpiry'].forEach(i=>document.getElementById(i).value='');document.getElementById('ncFeat').checked=false;}catch(e){aToast('خطأ','err');}
}
async function featureCpn(idx,val){try{const d=await db.collection('settings').doc('coupons').get();const cpns=d.data().coupons||[];cpns.forEach((c,i)=>{c.featured=(i===idx)?val:false;});await db.collection('settings').doc('coupons').set({coupons:cpns});aToast(val?'سيظهر في الصفحة الرئيسية خلال دقيقة':'تمت إزالته من الرئيسية');loadCoupons();}catch(e){aToast('خطأ','err');}}

async function toggleCpn(idx,val){try{const d=await db.collection('settings').doc('coupons').get();const cpns=d.data().coupons||[];cpns[idx].active=val;await db.collection('settings').doc('coupons').set({coupons:cpns});aToast(val?'مفعّل':'معطّل',val?'ok':'warn');loadCoupons();}catch(e){aToast('خطأ','err');}}
async function deleteCpn(idx){if(!confirm('حذف هذا الكوبون؟'))return;try{const d=await db.collection('settings').doc('coupons').get();const cpns=d.data().coupons||[];cpns.splice(idx,1);await db.collection('settings').doc('coupons').set({coupons:cpns});aToast('تم الحذف','info');loadCoupons();}catch(e){aToast('خطأ','err');}}

async function loadDiscount(){
  try{const d=await db.collection('settings').doc('discount').get();if(d.exists){const x=d.data();document.getElementById('discActive').checked=x.active||false;document.getElementById('discVal').value=x.value||'';document.getElementById('discExpiry').value=x.expiry||'';document.getElementById('discStatus').textContent=x.active?`خصم ${x.value}% مفعّل${x.expiry?' حتى '+x.expiry:''}`:'الخصم معطّل';}}catch(e){}
}
async function saveDiscount(){
  const active=document.getElementById('discActive').checked;const value=parseFloat(document.getElementById('discVal').value)||0;const expiry=document.getElementById('discExpiry').value||null;
  if(active&&(value<=0||value>99)){aToast('النسبة بين 1-99','err');return;}
  try{await db.collection('settings').doc('discount').set({active,value,expiry});aToast(active?`خصم ${value}% مفعّل`:'تم إلغاء الخصم','ok');loadDiscount();}catch(e){aToast('خطأ','err');}
}

/* ══ USERS ══ */
async function loadUsers(){
  const el=document.getElementById('usersList');el.innerHTML=loading();
  try{const snap=await db.collection('users').orderBy('points','desc').limit(50).get();allUsers=snap.docs.map(d=>({uid:d.id,...d.data()}));renderUsers();}
  catch(e){el.innerHTML=errState('خطأ');}
}
function renderUsers(){
  const el=document.getElementById('usersList');el.innerHTML='';
  const q=(document.getElementById('userSearch')?.value||'').toLowerCase();
  const filtered=allUsers.filter(u=>!q||(u.name||'').toLowerCase().includes(q)||(u.email||'').toLowerCase().includes(q));
  if(!filtered.length){el.innerHTML=empty('لا توجد نتائج');return;}
  filtered.forEach(u=>{
    const card=document.createElement('div');card.className='adm-card';
    card.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico" style="color:var(--cyan)"><i class="fa-solid fa-user"></i></div><div class="adm-card-info"><div class="adm-card-title">${san(u.name||u.email||'مستخدم')}</div><div class="adm-card-sub">${san(u.email||'')} · ${esc((u.points||0).toLocaleString())} نقطة</div><div class="adm-card-meta"><span>${esc(u.orders||0)} طلب</span>${u.region?`<span class="badge badge-info">${esc(u.region.toUpperCase())}</span>`:''}<span><i class="fa-solid fa-coins"></i>${esc((u.totalSpend||0).toLocaleString())} دج</span>${(u.referrals||0)>0?`<span><i class="fa-solid fa-user-group"></i>${esc(u.referrals)}</span>`:''}</div></div><span style="font-size:13px;color:var(--gold);font-weight:900">${esc((u.points||0).toLocaleString())}</span></div><div class="adm-card-actions"><button onclick="openUserModal('${jsq(u.uid)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-eye"></i> تفاصيل</button><button onclick="addPointsToUser('${jsq(u.uid)}','${jsq(u.name||'مستخدم')}')" class="btn btn-c btn-sm"><i class="fa-solid fa-plus"></i> نقاط</button><button onclick="sendNotifToUser('${jsq(u.uid)}')" class="btn btn-p btn-sm"><i class="fa-solid fa-bell"></i> إشعار</button><button onclick="copyText('${jsq(u.uid)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-copy"></i> UID</button></div>`;
    el.appendChild(card);
  });
}

async function openUserModal(uid){
  document.getElementById('userModal').classList.remove('hidden');
  document.getElementById('userModalContent').innerHTML=loading();
  try{
    const[uDoc,oSnap]=await Promise.all([db.collection('users').doc(uid).get(),db.collection('orders').where('userId','==',uid).orderBy('ts','desc').limit(5).get()]);
    const u=uDoc.data()||{};const orders=oSnap.docs.map(d=>({id:d.id,...d.data()}));
    document.getElementById('userModalContent').innerHTML=`<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px"><div style="width:48px;height:48px;border-radius:50%;background:#1A2030;color:var(--cyan);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0"><i class="fa-solid fa-user"></i></div><div><div style="font-size:15px;font-weight:800">${san(u.name||'مستخدم')}</div><div style="font-size:11px;color:var(--mid)">${san(u.email||'')} · UID: ${esc(uid.slice(0,12))}...</div></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;font-size:12px"><div style="background:rgba(124,156,255,.05);border:1px solid var(--brd);border-radius:8px;padding:10px"><span style="color:var(--mid);display:block;font-size:10px">النقاط</span><strong style="color:var(--gold)">${esc((u.points||0).toLocaleString())}</strong></div><div style="background:rgba(124,156,255,.05);border:1px solid var(--brd);border-radius:8px;padding:10px"><span style="color:var(--mid);display:block;font-size:10px">الطلبات</span><strong style="color:var(--cyan)">${esc(u.orders||0)}</strong></div><div style="background:rgba(124,156,255,.05);border:1px solid var(--brd);border-radius:8px;padding:10px"><span style="color:var(--mid);display:block;font-size:10px">إجمالي الصرف</span><strong style="color:var(--green)">${esc((u.totalSpend||0).toLocaleString())} دج</strong></div><div style="background:rgba(124,156,255,.05);border:1px solid var(--brd);border-radius:8px;padding:10px"><span style="color:var(--mid);display:block;font-size:10px">الإحالات</span><strong style="color:var(--violet)">${esc(u.referrals||0)}</strong></div></div><div style="font-size:10px;font-weight:700;color:var(--mid);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px">آخر الطلبات</div>${orders.length?orders.map(o=>`<div style="background:rgba(124,156,255,.04);border-radius:8px;padding:8px 10px;margin-bottom:5px;font-size:11px"><span style="font-weight:700">${san(o.product||'')}</span> · ${esc((o.totalDZD||0).toLocaleString())} دج · <span class="badge badge-${esc(o.status==='done'?'done':o.status==='pending'?'pend':'rej')}">${esc(o.status)}</span></div>`).join(''):'<p style="color:var(--dim);font-size:11px">لا توجد طلبات</p>'}<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button onclick="addPointsToUser('${jsq(uid)}','${jsq(u.name||'مستخدم')}')" class="btn btn-c btn-sm"><i class="fa-solid fa-plus"></i> إضافة نقاط</button><button onclick="sendNotifToUser('${jsq(uid)}')" class="btn btn-p btn-sm"><i class="fa-solid fa-bell"></i> إرسال إشعار</button><button onclick="copyText('${jsq(uid)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-copy"></i> نسخ UID</button></div>`;
  }catch(e){document.getElementById('userModalContent').innerHTML=errState('خطأ');}
}
function closeUserModal(){document.getElementById('userModal').classList.add('hidden');}

async function addPointsToUser(uid,name){
  const pts=parseInt(prompt(`إضافة نقاط لـ ${name}:\nأدخل عدد النقاط (موجب = إضافة، سالب = حذف):`));
  if(isNaN(pts))return;
  const FV=firebase.firestore.FieldValue,upd={points:FV.increment(pts)};
  /* a gift from the owner is locked like any free point, unless the owner explicitly pays for it */
  if(pts>0&&confirm(`جعل هذه النقاط قابلة للاستبدال فوراً؟\nموافق: تدفع أنت قيمتها (≈ ${(pts*((ECON&&ECON.ptDZD)||10)).toLocaleString('en-US')} دج بسعر البيع) عند استبدالها.\nإلغاء: تبقى مقفلة حتى يشتري العميل.`)){await ensureEcon();upd.rewardPool=FV.increment(pts*ECON.ptDZD);}
  try{await db.collection('users').doc(uid).update(upd);aToast(`تم ${pts>0?'إضافة':'حذف'} ${Math.abs(pts)} نقطة`,'ok');loadUsers();}catch(e){aToast('خطأ','err');}
}
async function sendNotifToUser(uid){
  const title=prompt('عنوان الإشعار:');if(!title)return;const code=prompt('نص الإشعار (اختياري):');
  const notif={title,code:code||'',date:new Date().toLocaleDateString('ar'),read:false};
  try{await db.collection('users').doc(uid).update({notifications:firebase.firestore.FieldValue.arrayUnion(notif)});aToast('تم إرسال الإشعار','ok');}catch(e){aToast('خطأ','err');}
}

/* ══ REVIEWS ══ */
async function loadReviews(){
  const el=document.getElementById('reviewsList');el.innerHTML=loading();
  try{
    let reviews=(await db.collection('ratings').orderBy('rating','desc').limit(50).get()).docs.map(d=>({id:d.id,...d.data()}));
    el.innerHTML='';
    if(currentReviewFilter==='visible')reviews=reviews.filter(r=>!r.hidden);
    if(currentReviewFilter==='hidden')reviews=reviews.filter(r=>r.hidden);
    if(currentReviewFilter==='5star')reviews=reviews.filter(r=>r.rating===5);
    if(!reviews.length){el.innerHTML=empty('لا توجد تقييمات');return;}
    reviews.forEach(r=>{const card=document.createElement('div');card.className='adm-card';card.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico" style="color:var(--gold)"><i class="fa-solid fa-star"></i></div><div class="adm-card-info"><div class="adm-card-title">${san(r.userName||'مستخدم')} · ${esc('★'.repeat(Math.max(0,Math.min(5,Math.floor(Number(r.rating))||0))))}</div><div class="adm-card-sub">${r.comment?`"${san(r.comment.slice(0,100))}"`:''}</div><div class="adm-card-meta"><span><i class="fa-regular fa-calendar"></i>${esc(r.date||'')}</span><span class="${esc(r.hidden?'badge badge-warn':'badge badge-done')}">${esc(r.hidden?'مخفي':'ظاهر')}</span></div></div></div><div class="adm-card-actions"><button onclick="toggleReview('${jsq(r.id)}',${esc(!r.hidden)})" class="btn btn-o btn-sm">${esc(r.hidden?'إظهار':'إخفاء')}</button><button onclick="deleteReview('${jsq(r.id)}')" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i></button></div>`;el.appendChild(card);});
  }catch(e){el.innerHTML=errState('خطأ');}
}
function filterReviews(f,btn){currentReviewFilter=f;document.querySelectorAll('#tab-reviews .filter-btn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');loadReviews();}
async function toggleReview(id,hidden){try{await db.collection('ratings').doc(id).update({hidden});aToast(hidden?'مخفي':'ظاهر','info');loadReviews();}catch(e){aToast('خطأ','err');}}
async function deleteReview(id){if(!confirm('حذف؟'))return;try{await db.collection('ratings').doc(id).delete();aToast('تم الحذف','info');loadReviews();}catch(e){aToast('خطأ','err');}}

/* ══ NEWSLETTER ══ */
async function loadNewsletter(){
  const el=document.getElementById('nlList');el.innerHTML=loading();
  try{
    const snap=await db.collection('newsletter').orderBy('date','desc').get();
    document.getElementById('nlStats').innerHTML=`<span class="badge badge-info">${esc(snap.size)} مشترك</span>`;
    el.innerHTML='';
    snap.docs.forEach((d,i)=>{const div=document.createElement('div');div.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(124,156,255,.04);border-radius:8px;margin-bottom:5px;font-size:12px';div.innerHTML=`<span>${esc(i+1)}. ${san(d.data().email||'')}</span><button onclick="copyText('${jsq(d.data().email||'')}')" class="btn btn-o btn-sm" style="padding:4px 8px"><i class="fa-solid fa-copy"></i></button>`;el.appendChild(div);});
  }catch(e){el.innerHTML=errState('خطأ');}
}
function exportNL(){const items=[];document.querySelectorAll('#nlList div span:first-child').forEach(s=>items.push(s.textContent.replace(/^\d+\. /,'')));const csv='email\n'+items.map(csvCell).join('\n');const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='newsletter.csv';a.click();URL.revokeObjectURL(url);aToast('تم التصدير','ok');}

/* ══ REPORTS ══ */
async function loadReports(){
  const el=document.getElementById('reportsList');el.innerHTML=loading();
  try{
    let reports=(await db.collection('reports').orderBy('ts','desc').limit(50).get()).docs.map(d=>({id:d.id,...d.data()}));
    el.innerHTML='';
    if(currentReportFilter==='open')reports=reports.filter(r=>r.status==='open');
    if(currentReportFilter==='resolved')reports=reports.filter(r=>r.status==='resolved');
    if(!reports.length){el.innerHTML=empty('لا توجد بلاغات');return;}
    reports.forEach(r=>{const card=document.createElement('div');card.className='adm-card';card.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico" style="color:var(--red)"><i class="fa-solid fa-flag"></i></div><div class="adm-card-info"><div class="adm-card-title">${san(r.title||'')} <span class="badge badge-warn">${san(r.category||'')}</span></div><div class="adm-card-sub">${san((r.desc||'').slice(0,100))}...</div><div class="adm-card-meta"><span><i class="fa-regular fa-user"></i>${san(r.userName||'زائر')}</span><span><i class="fa-regular fa-calendar"></i>${esc(r.date||'')}</span>${r.orderId?`<span><i class="fa-solid fa-hashtag"></i>${san(r.orderId)}</span>`:''}<span class="badge badge-${esc(r.status==='open'?'rej':'done')}">${esc(r.status==='open'?'مفتوح':'محلول')}</span></div></div></div><div class="adm-card-actions">${r.status==='open'?`<button onclick="resolveReport('${jsq(r.id)}')" class="btn btn-g btn-sm"><i class="fa-solid fa-check"></i> حلّ</button>`:''}<button onclick="replyReport('${jsq(r.id)}','${jsq(r.userId||'')}')" class="btn btn-p btn-sm"><i class="fa-solid fa-reply"></i> رد</button><button onclick="deleteReport('${jsq(r.id)}')" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i></button></div>`;el.appendChild(card);});
  }catch(e){el.innerHTML=errState('خطأ');}
}
function filterReports(f,btn){currentReportFilter=f;document.querySelectorAll('#tab-reports .filter-btn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');loadReports();}
async function resolveReport(id){try{await db.collection('reports').doc(id).update({status:'resolved'});aToast('تم وضع علامة محلول','ok');loadReports();}catch(e){aToast('خطأ','err');}}
async function deleteReport(id){if(!confirm('حذف؟'))return;try{await db.collection('reports').doc(id).delete();aToast('تم الحذف','info');loadReports();}catch(e){aToast('خطأ','err');}}
async function replyReport(id,userId){
  const msg=prompt('رسالة الرد للعميل:');if(!msg)return;
  if(userId&&userId!=='guest'){const notif={title:'رد على بلاغك',code:msg,date:new Date().toLocaleDateString('ar'),read:false};try{await db.collection('users').doc(userId).update({notifications:firebase.firestore.FieldValue.arrayUnion(notif)});aToast('تم إرسال الرد','ok');}catch(e){aToast('خطأ','err');}}
}

/* ══ ABUSE ══ */
async function loadAbuse(){
  const el=document.getElementById('abuseList');el.innerHTML=loading();
  try{
    const snap=await db.collection('abuse_flags').orderBy('date','desc').limit(30).get();
    el.innerHTML='';
    if(snap.empty){el.innerHTML=empty('لا توجد حالات مشبوهة');return;}
    snap.forEach(d=>{const a=d.data();const div=document.createElement('div');div.className='abuse-item';div.innerHTML=`<div class="abuse-header"><i class="fa-solid fa-triangle-exclamation" style="color:var(--red)"></i><span style="font-size:13px;font-weight:700">حسابات متعددة من نفس الجهاز</span><span class="abuse-high">عالي</span></div><div style="font-size:11px;color:var(--mid);margin-bottom:10px"><span><i class="fa-solid fa-key"></i> ${esc(a.userId?.slice(0,16))}…</span> · <span><i class="fa-solid fa-fingerprint"></i> ${san(a.fingerprint||'')}</span> · <span><i class="fa-regular fa-calendar"></i> ${esc(a.date?.split('T')[0]||'')}</span></div><div style="font-size:11px;color:var(--dim);margin-bottom:10px">مشبوهة: ${esc((a.suspectedAlts||[]).slice(0,3).join(', '))}</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button onclick="banUser('${jsq(a.userId)}')" class="btn btn-r btn-sm"><i class="fa-solid fa-ban"></i> حظر</button><button onclick="dismissAbuse('${jsq(d.id)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-check"></i> تجاهل</button></div>`;el.appendChild(div);});
  }catch(e){el.innerHTML=errState('خطأ');}
  loadBanned();
}

async function loadBanned(){
  const el=document.getElementById('bannedList');el.innerHTML='';
  try{const snap=await db.collection('banned_users').get();if(snap.empty){el.innerHTML='<p style="font-size:12px;color:var(--dim);padding:8px">لا يوجد محظورون</p>';return;}snap.forEach(d=>{const b=d.data();const div=document.createElement('div');div.className='adm-card';div.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico" style="background:rgba(255,77,94,.1);color:var(--red)"><i class="fa-solid fa-ban"></i></div><div class="adm-card-info"><div class="adm-card-title">${esc(d.id.slice(0,20))}...</div><div class="adm-card-sub">السبب: ${san(b.reason||'—')} · ${esc(b.date||'')}</div></div></div><div class="adm-card-actions"><button onclick="unbanUser('${jsq(d.id)}')" class="btn btn-g btn-sm"><i class="fa-solid fa-unlock"></i> رفع الحظر</button></div>`;el.appendChild(div);});}catch(e){}
}

async function banUser(uid,reason){
  const u=uid||document.getElementById('banUid').value.trim();const r=reason||document.getElementById('banReason').value.trim()||'تلاعب';
  if(!u){aToast('أدخل UID','err');return;}if(!confirm(`حظر ${u.slice(0,16)}...؟`))return;
  try{await db.collection('banned_users').doc(u).set({reason:r,date:new Date().toLocaleDateString('ar')});aToast('تم الحظر','err');document.getElementById('banUid').value='';document.getElementById('banReason').value='';loadAbuse();}catch(e){aToast('خطأ','err');}
}
async function unbanUser(uid){if(!confirm(`رفع حظر ${uid.slice(0,16)}...؟`))return;try{await db.collection('banned_users').doc(uid).delete();aToast('تم رفع الحظر','ok');loadBanned();}catch(e){aToast('خطأ','err');}}
async function dismissAbuse(id){try{await db.collection('abuse_flags').doc(id).delete();aToast('تم التجاهل','ok');loadAbuse();}catch(e){aToast('خطأ','err');}}

/* ══ FAQ ══ */
async function loadFAQ(){
  const el=document.getElementById('faqAdmList');el.innerHTML=loading();
  try{
    const d=await db.collection('settings').doc('faqs').get();const faqs=d.exists?d.data().faqs||[]:[];el.innerHTML='';
    if(!faqs.length){el.innerHTML=empty('لا توجد أسئلة مخصصة');return;}
    faqs.forEach((f,i)=>{const card=document.createElement('div');card.className='adm-card';card.innerHTML=`<div style="margin-bottom:8px"><div style="font-size:13px;font-weight:700;margin-bottom:2px">${san(f.q||'')} | ${san(f.qEn||'')}</div><div style="font-size:12px;color:var(--mid);line-height:1.7">${san((f.a||'').slice(0,150))}</div></div><div class="adm-card-actions"><button onclick="deleteFAQ(${esc(i)})" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i> حذف</button></div>`;el.appendChild(card);});
  }catch(e){el.innerHTML=errState('خطأ');}
}

async function addFAQ(){
  const q=document.getElementById('nfaqQ').value.trim();const qEn=document.getElementById('nfaqQEn').value.trim();const a=document.getElementById('nfaqA').value.trim();const aEn=document.getElementById('nfaqAEn').value.trim();
  if(!q||!a){aToast('أدخل السؤال والإجابة','err');return;}
  try{const d=await db.collection('settings').doc('faqs').get();const faqs=d.exists?d.data().faqs||[]:[];faqs.push({q,qEn:qEn||q,a,aEn:aEn||a});await db.collection('settings').doc('faqs').set({faqs});aToast('تم إضافة السؤال','ok');['nfaqQ','nfaqQEn','nfaqA','nfaqAEn'].forEach(i=>document.getElementById(i).value='');loadFAQ();}catch(e){aToast('خطأ','err');}
}
async function deleteFAQ(idx){if(!confirm('حذف؟'))return;try{const d=await db.collection('settings').doc('faqs').get();const faqs=d.data().faqs||[];faqs.splice(idx,1);await db.collection('settings').doc('faqs').set({faqs});aToast('تم الحذف','info');loadFAQ();}catch(e){aToast('خطأ','err');}}

/* ══ SEND CODE ══ */
async function sendCodeManual(){
  const orderId=document.getElementById('scOrderId').value.trim();const userId=document.getElementById('scUserId').value.trim();const product=document.getElementById('scProduct').value.trim();const code=document.getElementById('scCode').value.trim();const contact=document.getElementById('scContact').value.trim();
  if(!code){aToast('أدخل الكود','err');return;}
  const mp={code,product};
  if(orderId)mp.orderId=orderId;else if(userId)mp.userId=userId;else if(contact.includes('@'))mp.to=contact;
  if(!mp.orderId&&!mp.userId&&!mp.to){aToast('أدخل رقم الطلب أو UID أو إيميل العميل','err');return;}
  try{
    const notif=(userId||orderId)?{title:`${product||'طلبك جاهز'}`,code:`الكود: ${code}`,date:new Date().toLocaleDateString('ar'),until:codeUntil(),read:false}:null;
    if(orderId)await completeOrder(orderId,notif);
    else if(userId)await db.collection('users').doc(userId).update({notifications:firebase.firestore.FieldValue.arrayUnion(notif)});
    const m=await adminSendCode(mp);
    await adminNotify(`✅ إرسال كود يدوي\n🎮 ${product}\n🔑 ${code}\n📧 ${contact}\n🆔 ${orderId||'—'}\n${m.ok?'✉️ أُرسل الإيميل إلى '+m.to:'⚠️ فشل الإيميل: '+m.error}`);
    if(!m.ok){aToast('تم تسجيل الكود لكن فشل الإيميل: '+m.error,'warn');return;}
    aToast('تم الإرسال إلى '+m.to,'ok');['scOrderId','scUserId','scProduct','scCode','scContact'].forEach(i=>document.getElementById(i).value='');
  }catch(e){aToast('خطأ: '+e.message,'err');}
}

/* ══ BROADCAST ══ */
async function sendBroadcast(){
  const title=document.getElementById('bcTitle').value.trim();const body=document.getElementById('bcBody').value.trim();const target=document.getElementById('bcTarget').value;
  if(!title||!body){aToast('أدخل العنوان والنص','err');return;}
  const targetName=target==='all'?'جميع المستخدمين':target==='active'?'النشطين':'غير النشطين';
  if(!confirm(`إرسال إشعار لـ "${targetName}"؟`))return;
  try{
    let snap;if(target==='active')snap=await db.collection('users').where('orders','>',0).get();else if(target==='inactive')snap=await db.collection('users').where('orders','==',0).get();else snap=await db.collection('users').get();
    const notif={title,code:body,date:new Date().toLocaleDateString('ar'),read:false};const batch=db.batch();snap.docs.forEach(d=>batch.update(d.ref,{notifications:firebase.firestore.FieldValue.arrayUnion(notif)}));await batch.commit();
    aToast(`تم الإرسال لـ ${snap.size} مستخدم!`,'info');document.getElementById('bcTitle').value='';document.getElementById('bcBody').value='';
  }catch(e){aToast('خطأ: '+e.message,'err');}
}

/* ══ REGIONS (settings/regions — read by the storefront) ══ */
const REG_LIST=[['eu','🇪🇺','أوروبي (EUR €)'],['us','🇺🇸','أمريكي (USD $)'],['sa','🇸🇦','سعودي (SAR ر.س)'],['ae','🇦🇪','إماراتي (AED د.إ)']];
async function loadRegions(){
  const cfg={enabled:false,defaultRegion:'eu',available:{eu:true,us:false,sa:false,ae:false}};
  try{
    const d=await db.collection('settings').doc('regions').get();
    if(d.exists){const x=d.data();cfg.enabled=x.enabled===true;if(REG_LIST.some(r=>r[0]===x.defaultRegion))cfg.defaultRegion=x.defaultRegion;
      if(x.available&&typeof x.available==='object')REG_LIST.forEach(([k])=>{cfg.available[k]=x.available[k]===true;});}
  }catch(e){aToast('تعذّر تحميل إعدادات المناطق','err');}
  document.getElementById('regEnabled').checked=cfg.enabled;
  const sel=document.getElementById('regDefault');
  sel.innerHTML=REG_LIST.map(([k,f,n])=>`<option value="${esc(k)}">${esc(f)} ${esc(n)}</option>`).join('');sel.value=cfg.defaultRegion;
  document.getElementById('regRows').innerHTML=REG_LIST.map(([k,f,n])=>`<div class="toggle-wrap"><label class="toggle"><input type="checkbox" id="regAv_${esc(k)}" ${esc(cfg.available[k]?'checked':'')} onchange="regSummary()"><span class="toggle-sl"></span></label><span class="toggle-lbl">${esc(f)} ${esc(n)} — <b>متوفر</b></span></div>`).join('');
  document.getElementById('regEnabled').onchange=regSummary;sel.onchange=regSummary;regSummary();
}
function regSummary(){
  const on=document.getElementById('regEnabled').checked,def=document.getElementById('regDefault').value;
  const av=REG_LIST.filter(([k])=>document.getElementById('regAv_'+k)?.checked).map(r=>r[1]+' '+r[2].split(' ')[0]);
  const defName=(REG_LIST.find(r=>r[0]===def)||[])[2]||def;
  document.getElementById('regSummary').innerHTML=on
    ?`<b style="color:var(--green)">اختيار الريجن مفعّل</b> — المتاح للزبائن: ${esc(av.join('، ')||'لا شيء')}`
    :`<b style="color:var(--gold)">اختيار الريجن مغلق</b> — جميع الزبائن على الريجن الافتراضي: ${esc(defName)}`;
}
async function saveRegions(){
  const available={};REG_LIST.forEach(([k])=>{available[k]=document.getElementById('regAv_'+k).checked;});
  const enabled=document.getElementById('regEnabled').checked,def=document.getElementById('regDefault').value;
  if(!available[def]){aToast('الريجن الافتراضي يجب أن يكون متوفراً','err');return;}
  if(enabled&&!Object.values(available).some(Boolean)){aToast('فعّل ريجناً واحداً على الأقل','err');return;}
  try{
    await db.collection('settings').doc('regions').set({enabled,defaultRegion:def,available,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    aToast('تم حفظ إعدادات المناطق','ok');regSummary();
  }catch(e){aToast('تعذّر الحفظ — تحقق من صلاحيات قواعد Firestore لـ settings/regions','err');}
}

/* ══ SETTINGS ══ */
async function loadSettings2(){
  try{const d=await db.collection('settings').doc('maintenance').get();if(d.exists)document.getElementById('maintenanceMode').checked=d.data().active||false;const t=await db.collection('settings').doc('ticker').get();if(t.exists)document.getElementById('tickerTxt').value=t.data().text||'';}catch(e){}
}
async function toggleMaintenance(){const on=document.getElementById('maintenanceMode').checked;try{await db.collection('settings').doc('maintenance').set({active:on});aToast(on?'وضع الصيانة مفعّل':'الموقع متاح','ok');}catch(e){aToast('خطأ','err');}}
async function resetVisitors(){if(!confirm('إعادة تعيين عداد الزيارات إلى صفر؟'))return;try{await db.collection('settings').doc('stats').set({visitors:0});aToast('تم إعادة التعيين','ok');}catch(e){aToast('خطأ','err');}}
async function saveTicker(){const txt=document.getElementById('tickerTxt').value.trim();if(!txt){aToast('أدخل النص','err');return;}try{await db.collection('settings').doc('ticker').set({text:txt});aToast('تم حفظ النص','ok');}catch(e){aToast('خطأ','err');}}

async function exportOrders(){
  try{
    const snap=await db.collection('orders').orderBy('ts','desc').get();
    const rows=[['ID','المنتج','الحالة','المبلغ دج','طريقة الدفع','التاريخ','المستخدم','التواصل']];
    snap.docs.forEach(d=>{const o=d.data();rows.push([d.id,o.product||'',o.status||'',o.totalDZD||0,o.paymentMethod||'',o.date||'',o.userId||'',o.receiveContact||'']);});
    const csv=rows.map(r=>r.map(csvCell).join(',')).join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`glitchq_orders_${new Date().toISOString().split('T')[0]}.csv`;a.click();URL.revokeObjectURL(url);
    aToast('تم تصدير الطلبات','ok');
  }catch(e){aToast('خطأ','err');}
}

/* ══ HELPERS ══ */
function setVal(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}
function copyText(txt){navigator.clipboard.writeText(txt).then(()=>aToast('تم النسخ','info')).catch(()=>{});}
function loading(){return '<div class="adm-loading"><div class="spinner"></div><span>جاري التحميل...</span></div>';}
function empty(msg){return `<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>${esc(msg)}</p></div>`;}
function errState(msg){return `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="color:var(--red)"></i><p style="color:var(--red)">${esc(msg)}</p></div>`;}

/* ══════════════════════════════════════════
   DASHBOARD CHARTS — drawn as plain SVG/HTML, no chart library.
   One hue per measure: orders = cobalt, money = gold, new users = cyan.
   Status colours are reserved for order status and always carry a text label.
══════════════════════════════════════════ */
const VZ={L:40,R:12,T:26,B:30};   /* width/height come from the card each chart sits in, so text stays the same size on every screen */
const VZ_STATUS=[['pending','قيد المراجعة','#F4B63E'],['processing','معالجة','#6C8CFF'],['done','مكتملة','#28C88A'],['rejected','مرفوضة','#FF4D5E']];

/* Algeria is UTC+1 all year, so a "day" is the UTC date of (time + 1h) */
function vzDayKey(ms){return new Date(ms+3600000).toISOString().slice(0,10);}
function vzDays(n){
  const now=Date.now();
  return Array.from({length:n},(_,i)=>{const k=vzDayKey(now-(n-1-i)*86400000);return{key:k,label:`${+k.slice(8)}/${+k.slice(5,7)}`};});
}
function tsMs(ts){
  if(!ts)return null;
  if(typeof ts.toDate==='function'){try{return ts.toDate().getTime();}catch(e){return null;}}
  if(typeof ts.seconds==='number')return ts.seconds*1000;
  if(typeof ts==='number')return ts;
  return null;
}
function vzNice(max){
  if(max<=4)return 4;
  const p=Math.pow(10,Math.floor(Math.log10(max)));
  for(const s of [1,2,4,6,8,10])if(s*p>=max)return s*p;
  return 10*p;
}
function vzFmt(v){
  if(v>=1000000)return (v/1000000).toFixed(v%1000000?1:0).replace(/\.0$/,'')+'M';
  if(v>=1000)return (v/1000).toFixed(v%1000?1:0).replace(/\.0$/,'')+'k';
  return String(v);
}
function vzDelta(cur,prev){
  if(!cur&&!prev)return{cls:'flat',txt:'—'};
  if(!prev)return{cls:'up',txt:'جديد'};
  const p=Math.round((cur-prev)/prev*100);
  if(p===0)return{cls:'flat',txt:'0%'};
  return p>0?{cls:'up',txt:'+'+p+'%'}:{cls:'down',txt:'−'+Math.abs(p)+'%'};
}
function vzSetHead(id,total,unit,cur,prev){
  const big=document.getElementById(id+'Big'),dl=document.getElementById(id+'Delta');
  if(big)big.innerHTML=`${esc(total.toLocaleString())}<small>${esc(unit)}</small>`;
  if(dl){const d=vzDelta(cur,prev);dl.className='viz-delta '+d.cls;dl.textContent=d.txt;dl.title='مقارنة بالأيام السبعة السابقة';}
}

/* Shared frame: gridlines, y labels, x labels, a hit-area per day and the tooltip. */
function vzFrame(host,o){
  const hw=host.clientWidth,W=hw>=240?Math.round(hw):640,H=Math.max(190,Math.min(270,Math.round(W*.34)));
  const{L,R,T,B}=VZ,iw=W-L-R,ih=H-T-B,n=o.days.length,slot=iw/n;
  const max=vzNice(Math.max(1,...o.vals)),yOf=v=>T+ih-(v/max)*ih,xOf=i=>L+slot*(i+.5);
  let s=`<svg class="viz-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}" preserveAspectRatio="xMidYMid meet">`;
  [0,.5,1].forEach(f=>{
    const y=yOf(max*f);
    s+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="${f?'var(--viz-grid)':'var(--brdh)'}" stroke-width="1"${f?' stroke-dasharray="2 4"':''}/>`;
    s+=`<text x="${L-8}" y="${y+4}" text-anchor="end" font-size="11" fill="var(--viz-axis)">${vzFmt(max*f)}</text>`;
  });
  o.days.forEach((d,i)=>{s+=`<text x="${xOf(i)}" y="${H-9}" text-anchor="middle" font-size="11" fill="${i===n-1?'var(--text)':'var(--viz-axis)'}" font-weight="${i===n-1?700:400}">${esc(d.label)}</text>`;});
  s+=o.draw({W,H,L,R,T,B,iw,ih,n,slot,max,yOf,xOf});
  s+=`<g class="viz-hits">`+o.days.map((d,i)=>`<rect data-i="${i}" x="${L+slot*i}" y="${T-14}" width="${slot}" height="${ih+14}" fill="transparent"/>`).join('')+`</g></svg>`;
  s+=`<div class="viz-tip" role="presentation"></div>`;
  s+=`<table class="sr-only"><caption>${esc(o.aria)}</caption><tbody>`+o.days.map((d,i)=>`<tr><th>${esc(d.label)}</th><td>${esc(o.fmt(o.vals[i]))}</td></tr>`).join('')+`</tbody></table>`;
  host.innerHTML=s;host.classList.add('viz-plot');
  const svg=host.querySelector('svg'),tip=host.querySelector('.viz-tip');
  const show=i=>{
    const v=o.vals[i];
    tip.innerHTML=`${esc(o.days[i].label)}<b>${esc(o.fmt(v))}</b>`;
    const r=svg.getBoundingClientRect(),k=r.width/W;
    let x=xOf(i)*k;tip.classList.add('on');
    const w=tip.offsetWidth;x=Math.max(w/2+2,Math.min(r.width-w/2-2,x));
    tip.style.left=x+'px';tip.style.top=Math.max(0,(o.tipY?o.tipY(v,{yOf}):yOf(v))*k-tip.offsetHeight-10)+'px';tip.style.transform='translateX(-50%)';
    svg.querySelectorAll('[data-mark]').forEach(m=>m.classList.toggle('hot',+m.dataset.mark===i));
  };
  const hide=()=>{tip.classList.remove('on');svg.querySelectorAll('[data-mark].hot').forEach(m=>m.classList.remove('hot'));};
  svg.querySelectorAll('.viz-hits rect').forEach(r=>{
    r.addEventListener('mouseenter',()=>show(+r.dataset.i));
    r.addEventListener('touchstart',()=>show(+r.dataset.i),{passive:true});
  });
  host.addEventListener('mouseleave',hide);
}

function vzCols(id,days,vals,color,aria,unit){
  const host=document.getElementById(id);if(!host)return;
  if(!vals.some(v=>v>0)){host.classList.remove('viz-plot');host.innerHTML='<div class="viz-empty">لا توجد بيانات في هذه الفترة</div>';return;}
  vzFrame(host,{days,vals,aria,fmt:v=>`${v.toLocaleString()} ${unit}`,draw:g=>{
    let s='';const bw=Math.min(34,g.slot*.5);
    vals.forEach((v,i)=>{
      const x=g.xOf(i)-bw/2,y=g.yOf(v),h=Math.max(2,g.T+g.ih-y),last=i===g.n-1,r=Math.min(4,h);
      const op=last?1:.6;
      s+=`<path data-mark="${i}" class="viz-col" d="M${x} ${y+h}V${y+r}Q${x} ${y} ${x+r} ${y}H${x+bw-r}Q${x+bw} ${y} ${x+bw} ${y+r}V${y+h}Z" fill="${color}" fill-opacity="${v?op:.25}"/>`;
      if(v>0)s+=`<text x="${g.xOf(i)}" y="${y-7}" text-anchor="middle" font-size="11.5" font-weight="${last?700:500}" fill="${last?'var(--text)':'var(--mid)'}">${vzFmt(v)}</text>`;
    });
    return s;
  }});
}

function vzLine(id,days,vals,color,aria,unit){
  const host=document.getElementById(id);if(!host)return;
  if(!vals.some(v=>v>0)){host.classList.remove('viz-plot');host.innerHTML='<div class="viz-empty">لا توجد بيانات في هذه الفترة</div>';return;}
  vzFrame(host,{days,vals,aria,fmt:v=>`${v.toLocaleString()} ${unit}`,draw:g=>{
    const pts=vals.map((v,i)=>[g.xOf(i),g.yOf(v)]);
    const base=g.T+g.ih;
    let s=`<path d="M${pts[0][0]} ${base}L${pts.map(p=>p.join(' ')).join('L')}L${pts[pts.length-1][0]} ${base}Z" fill="${color}" fill-opacity=".07"/>`;
    s+=`<polyline points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach((p,i)=>{
      const last=i===g.n-1;
      s+=`<circle data-mark="${i}" class="viz-dot" cx="${p[0]}" cy="${p[1]}" r="${last?4.5:3}" fill="${last?color:'var(--d2)'}" stroke="${color}" stroke-width="2"/>`;
      if(vals[i]>0)s+=`<text x="${p[0]}" y="${p[1]-11}" text-anchor="middle" font-size="11.5" font-weight="${last?700:500}" fill="${last?'var(--text)':'var(--mid)'}">${vzFmt(vals[i])}</text>`;
    });
    return s;
  }});
}

function vzStatus(counts){
  const host=document.getElementById('vzStatus');if(!host)return;
  const total=VZ_STATUS.reduce((a,s)=>a+(counts[s[0]]||0),0);
  const big=document.getElementById('vzStatusBig');if(big)big.innerHTML=`${esc(total.toLocaleString())}<small>طلب</small>`;
  if(!total){host.innerHTML='<div class="viz-empty">لا توجد طلبات بعد</div>';return;}
  const segs=VZ_STATUS.filter(s=>counts[s[0]]).map(s=>`<div style="flex:${counts[s[0]]};background:${s[2]}" title="${esc(s[1])}: ${counts[s[0]]}">${counts[s[0]]}</div>`).join('');
  const leg=VZ_STATUS.map(s=>{const c=counts[s[0]]||0;return `<div><i style="background:${s[2]}"></i>${esc(s[1])}<b>${c} · ${Math.round(c/total*100)}%</b></div>`;}).join('');
  host.innerHTML=`<div class="seg" role="img" aria-label="توزيع حالات الطلبات">${segs}</div><div class="seg-legend">${leg}</div>`;
}

function vzRank(prodCounts){
  const host=document.getElementById('vzProducts');if(!host)return;
  const top=Object.entries(prodCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if(!top.length){host.innerHTML='<div class="viz-empty">لا توجد مبيعات بعد</div>';return;}
  const max=top[0][1];
  host.innerHTML=`<div class="rank">`+top.map(([n,c])=>`<div class="rank-row"><span class="rank-name" title="${esc(n)}">${esc(n)}</span><div class="rank-bar"><i style="width:${Math.max(3,c/max*100)}%"></i></div><span class="rank-val">${c}</span></div>`).join('')+`</div>`;
}

/* everything the dashboard charts need is computed here from the orders/users already fetched */
let vzLastW=0,vzRO=null,vzTimer=null;
function vzRedraw(){const D=window._dash;if(D&&document.getElementById('tab-dashboard')?.classList.contains('on'))renderChartsFromOrders(D.orders,D.users);}
function vzWatch(){
  if(vzRO||typeof ResizeObserver==='undefined')return;const g=document.querySelector('#tab-dashboard .viz-grid');if(!g)return;
  vzRO=new ResizeObserver(es=>{const w=Math.round(es[0].contentRect.width);if(w&&Math.abs(w-vzLastW)>8){clearTimeout(vzTimer);vzTimer=setTimeout(vzRedraw,120);}});
  vzRO.observe(g);
}
function renderChartsFromOrders(orders,users){
  vzLastW=Math.round(document.querySelector('#tab-dashboard .viz-grid')?.clientWidth||0);vzWatch();
  const days=vzDays(14),cur=days.slice(7),idx=Object.fromEntries(days.map((d,i)=>[d.key,i]));
  const ord=new Array(14).fill(0),rev=new Array(14).fill(0),usr=new Array(14).fill(0);
  const statusCounts={pending:0,processing:0,done:0,rejected:0},prodCounts={};
  orders.forEach(o=>{
    const ms=tsMs(o.ts),k=ms==null?null:idx[vzDayKey(ms)];
    if(k!=null){ord[k]++;if(o.status==='done')rev[k]+=Number(o.totalDZD)||0;}
    if(o.status&&statusCounts[o.status]!==undefined)statusCounts[o.status]++;
    const nm=(o.product||'أخرى');prodCounts[nm]=(prodCounts[nm]||0)+1;
  });
  users.forEach(u=>{const ms=tsMs(u.created),k=ms==null?null:idx[vzDayKey(ms)];if(k!=null)usr[k]++;});
  const sum=(a,f,t)=>a.slice(f,t).reduce((x,y)=>x+y,0);
  vzSetHead('vzOrders',sum(ord,7,14),'طلب',sum(ord,7,14),sum(ord,0,7));
  vzSetHead('vzRevenue',sum(rev,7,14),'دج',sum(rev,7,14),sum(rev,0,7));
  vzSetHead('vzUsers',sum(usr,7,14),'مستخدم',sum(usr,7,14),sum(usr,0,7));
  vzCols('vzOrdersPlot',cur,ord.slice(7),'var(--viz-orders)','الطلبات في كل يوم خلال آخر 7 أيام','طلب');
  vzLine('vzRevenuePlot',cur,rev.slice(7),'var(--viz-money)','الإيرادات المؤكدة في كل يوم خلال آخر 7 أيام','دج');
  vzCols('vzUsersPlot',cur,usr.slice(7),'var(--viz-users)','المسجلون الجدد في كل يوم خلال آخر 7 أيام','مستخدم');
  vzStatus(statusCounts);vzRank(prodCounts);
}

/* ══════════════════════════════════════════
   FRAUD DETECTION ENGINE
══════════════════════════════════════════ */
function runFraudDetection(orders,users){
  const alerts=[];
  const now=Date.now();
  const hour=3600000;

  // 1. Multiple orders same email in 1h
  const byContact={};
  orders.forEach(o=>{
    const c=o.receiveContact||o.userId;if(!c)return;
    if(!byContact[c])byContact[c]=[];
    byContact[c].push(o);
  });
  Object.entries(byContact).forEach(([c,ords])=>{
    const recent=ords.filter(o=>{const ts=o.ts?.seconds?o.ts.seconds*1000:0;return now-ts<hour;});
    if(recent.length>=3)alerts.push({level:'high',icon:'fa-bolt',msg:`${recent.length} طلبات من نفس جهة الاتصال خلال ساعة`,detail:c.slice(0,40),ids:recent.map(o=>o.id.slice(0,12)).join('، ')});
  });

  // 2. Orders with same userId too fast
  const byUser={};
  orders.forEach(o=>{if(!o.userId||o.userId==='guest')return;if(!byUser[o.userId])byUser[o.userId]=[];byUser[o.userId].push(o);});
  Object.entries(byUser).forEach(([uid,ords])=>{
    const recent=ords.filter(o=>{const ts=o.ts?.seconds?o.ts.seconds*1000:0;return now-ts<hour*2;});
    if(recent.length>=4)alerts.push({level:'medium',icon:'fa-user-clock',msg:`${recent.length} طلبات من مستخدم واحد في ساعتين`,detail:`UID: ${uid.slice(0,16)}`,ids:recent.map(o=>o.id.slice(0,10)).join('، ')});
  });

  // 3. High value orders not confirmed after 24h
  const highValue=orders.filter(o=>o.status==='pending'&&(o.totalDZD||0)>5000);
  highValue.forEach(o=>{const ts=o.ts?.seconds?o.ts.seconds*1000:0;if(now-ts>hour*24)alerts.push({level:'medium',icon:'fa-hourglass-half',msg:`طلب قيمة عالية معلّق أكثر من 24 ساعة`,detail:`${(o.totalDZD||0).toLocaleString()} دج — ${o.product||''}`,ids:o.id.slice(0,16)});});

  // 4. Users with 0 orders but high points
  users.forEach(u=>{if(!u.orders&&(u.points||0)>60)alerts.push({level:'low',icon:'fa-crosshairs',msg:`مستخدم بنقاط عالية بدون طلبات`,detail:`${u.name||u.email||'مجهول'} — ${u.points} نقطة`,ids:u.id?.slice(0,16)||''});});

  // Render
  const box=document.getElementById('fraudAlertBox');
  const el=document.getElementById('fraudAlerts');
  if(!alerts.length){box.style.display='none';return;}
  box.style.display='block';el.innerHTML='';
  const LV={high:['عالي','lv-high'],medium:['متوسط','lv-med'],low:['منخفض','lv-low']};
  alerts.forEach(a=>{
    const lv=LV[a.level]||LV.low;
    const div=document.createElement('div');div.className='fraud-item '+lv[1];
    div.innerHTML=`<div class="fraud-top"><i class="fa-solid ${esc(a.icon)}"></i><strong>${esc(a.msg)}</strong><span class="fraud-lv">${esc(lv[0])}</span></div><div class="fraud-detail">${esc(a.detail)}</div><div class="fraud-ids">IDs: ${esc(a.ids)}</div>`;
    el.appendChild(div);
  });
}

/* ══════════════════════════════════════════
   QUICK SEARCH (Ctrl/⌘ + K): jump to a page, run an action, or find an order / customer
══════════════════════════════════════════ */
const PAL_PAGES=[
  ['dashboard','لوحة الإحصاء','fa-chart-line'],['orders','الطلبات','fa-inbox'],['products','المنتجات والأقسام','fa-gamepad'],
  ['coupons','الكوبونات والخصومات','fa-ticket'],['users','المستخدمون','fa-users'],['reviews','التقييمات','fa-star'],
  ['newsletter','النشرة البريدية','fa-envelope'],['reports','البلاغات','fa-flag'],['abuse','مكافحة الاحتيال','fa-shield-halved'],
  ['faq','الأسئلة الشائعة','fa-circle-question'],['send','إرسال كود يدوي','fa-paper-plane'],['regions','المناطق (الريجنات)','fa-earth-africa'],
  ['settings','إعدادات الموقع','fa-sliders']
];
let palItems=[],palSel=0,palPrev=null;
function palBuild(q){
  q=(q||'').trim().toLowerCase();
  const out=[];
  const pages=PAL_PAGES.filter(p=>!q||p[1].toLowerCase().includes(q)||p[0].includes(q));
  if(pages.length)out.push({grp:'الأقسام'});
  pages.forEach(p=>out.push({ico:p[2],txt:p[1],hint:'',run:()=>switchTab(p[0])}));
  const acts=[['fa-rotate-right','تحديث البيانات','',()=>refreshAll()],['fa-arrow-up-right-from-square','فتح المتجر','',()=>window.open('index.html','_blank','noopener')],['fa-file-csv','تصدير الطلبات CSV','',()=>exportOrders()]]
    .filter(a=>!q||a[1].toLowerCase().includes(q));
  if(acts.length)out.push({grp:'إجراءات'});
  acts.forEach(a=>out.push({ico:a[0],txt:a[1],hint:a[2],run:a[3]}));
  if(q.length>=2){
    const D=window._dash||{orders:[],users:[]};
    const os=D.orders.filter(o=>(o.id||'').toLowerCase().includes(q)||(o.product||'').toLowerCase().includes(q)||(o.receiveContact||'').toLowerCase().includes(q)).slice(0,6);
    if(os.length)out.push({grp:'طلبات'});
    os.forEach(o=>out.push({ico:'fa-box',txt:(o.product||'طلب')+' — '+(o.totalDZD||0).toLocaleString()+' دج',hint:(o.id||'').slice(0,12),run:()=>{switchTab('orders');const i=document.getElementById('orderSearch');if(i){i.value=o.id;}setTimeout(renderOrders,350);}}));
    const us=D.users.filter(u=>(u.name||'').toLowerCase().includes(q)||(u.email||'').toLowerCase().includes(q)).slice(0,5);
    if(us.length)out.push({grp:'مستخدمون'});
    us.forEach(u=>out.push({ico:'fa-user',txt:u.name||u.email||'مستخدم',hint:u.email||'',run:()=>{switchTab('users');setTimeout(()=>{const i=document.getElementById('userSearch');if(i){i.value=u.email||u.name||'';renderUsers();}},500);}}));
  }
  return out;
}
function palRender(){
  const q=document.getElementById('palInput').value;
  const list=document.getElementById('palList');
  const rows=palBuild(q);palItems=rows.filter(r=>!r.grp);
  if(palSel>=palItems.length)palSel=0;
  if(!palItems.length){list.innerHTML='<div class="pal-empty">لا توجد نتائج</div>';return;}
  let n=0;
  list.innerHTML=rows.map(r=>{
    if(r.grp)return `<div class="pal-grp">${esc(r.grp)}</div>`;
    const i=n++;
    return `<button type="button" class="pal-it${i===palSel?' on':''}" role="option" id="palOpt${i}" aria-selected="${i===palSel}" data-i="${i}"><i class="fa-solid ${esc(r.ico)}"></i><span>${esc(r.txt)}</span>${r.hint?`<small>${esc(r.hint)}</small>`:''}</button>`;
  }).join('');
  document.getElementById('palInput').setAttribute('aria-activedescendant','palOpt'+palSel);
  list.querySelector('.pal-it.on')?.scrollIntoView({block:'nearest'});
}
function openPalette(){
  const p=document.getElementById('palette');if(!p||!p.classList.contains('hidden'))return;
  palPrev=document.activeElement;palSel=0;p.classList.remove('hidden');
  const i=document.getElementById('palInput');i.value='';palRender();i.focus();
}
function closePalette(){
  const p=document.getElementById('palette');if(!p||p.classList.contains('hidden'))return;
  p.classList.add('hidden');try{palPrev&&palPrev.focus&&palPrev.focus();}catch(e){}
}
function palRun(i){const it=palItems[i];if(!it)return;closePalette();it.run();}
document.addEventListener('keydown',e=>{
  const app=document.getElementById('adminApp');if(!app||getComputedStyle(app).display==='none')return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette();return;}
  const open=!document.getElementById('palette').classList.contains('hidden');if(!open)return;
  if(e.key==='Escape'){e.preventDefault();closePalette();}
  else if(e.key==='ArrowDown'){e.preventDefault();palSel=(palSel+1)%Math.max(1,palItems.length);palRender();}
  else if(e.key==='ArrowUp'){e.preventDefault();palSel=(palSel-1+palItems.length)%Math.max(1,palItems.length);palRender();}
  else if(e.key==='Enter'){e.preventDefault();palRun(palSel);}
  else if(e.key==='Tab'){e.preventDefault();}   /* keep focus inside the dialog */
});
document.addEventListener('input',e=>{if(e.target&&e.target.id==='palInput'){palSel=0;palRender();}});
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('#palList .pal-it');if(b)palRun(+b.dataset.i);});
