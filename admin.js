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
function aToast(msg,icon='✅',dur=3500){
  const t=document.getElementById('admToast');
  document.getElementById('admToastIcon').textContent=icon;
  document.getElementById('admToastMsg').textContent=msg;
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
async function refreshAll(){const on=document.querySelector('.tab-panel.on')?.id?.replace('tab-','');if(on)switchTab(on);else loadDashboard();aToast('تم التحديث','🔄');}

/* ══ DASHBOARD ══ */
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
    setVal('st-rating',avgRating+'⭐');setVal('st-visits',visits.toLocaleString());setVal('st-reports',reportsSnap.size);
    document.getElementById('sbPendingBadge').textContent=pending;
    document.getElementById('sbReportBadge').textContent=reportsSnap.size;
    // Recent orders
    const recent=orders.sort((a,b)=>(b.ts?.seconds||0)-(a.ts?.seconds||0)).slice(0,5);
    const rc=document.getElementById('dashRecentOrders');rc.innerHTML='';
    if(!recent.length){rc.innerHTML=empty('لا توجد طلبات بعد');return;}
    recent.forEach(o=>{
      const el=document.createElement('div');el.className='adm-card';
      const sc=o.status==='done'?'badge-done':o.status==='pending'?'badge-pend':o.status==='processing'?'badge-proc':'badge-rej';
      el.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico" style="background:rgba(0,229,255,.1);color:var(--cyan)"><i class="fa-solid fa-box"></i></div><div class="adm-card-info"><div class="adm-card-title">${san(o.product||'')}</div><div class="adm-card-sub">💰 ${esc((o.totalDZD||0).toLocaleString())} دج · ${esc(o.paymentMethod==='baridimob'?'BaridiMob':'يد بيد')}</div><div class="adm-card-meta"><span>🆔 ${esc(o.id.slice(0,14))}...</span><span>📅 ${esc(o.date||'')}</span></div></div><span class="badge ${sc}">${esc(o.status)}</span></div>`;
      rc.appendChild(el);
    });
    // Top users
    const usersData=usersSnap.docs.map(d=>({id:d.id,...d.data()}));
    const topUsers=usersData.sort((a,b)=>(b.points||0)-(a.points||0)).slice(0,5);
    const tu=document.getElementById('dashTopUsers');tu.innerHTML='';
    const medals=['🥇','🥈','🥉','4️⃣','5️⃣'];
    topUsers.forEach((u,i)=>{const el=document.createElement('div');el.style.cssText='display:flex;align-items:center;gap:12px;padding:10px;background:rgba(0,229,255,.04);border-radius:8px;margin-bottom:6px;font-size:12px';el.innerHTML=`<span style="font-size:18px">${medals[i]}</span><span style="flex:1;font-weight:700">${san(u.name||u.email||'مستخدم')}</span><span style="font-family:Orbitron;font-size:11px;color:var(--gold)">${esc((u.points||0).toLocaleString())} نقطة</span><span style="color:var(--mid)">${esc(u.orders||0)} طلب</span>`;tu.appendChild(el);});

    // Charts & Fraud
    setTimeout(()=>{
      renderChartsFromOrders(orders,usersData);
      runFraudDetection(orders,usersData);
    },100);
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
  if(q)filtered=filtered.filter(o=>o.id.includes(q)||(o.product||'').toLowerCase().includes(q));
  if(!filtered.length){el.innerHTML=empty('لا توجد طلبات');return;}
  filtered.forEach(o=>{
    const card=document.createElement('div');card.className='adm-card';
    const sc=o.status==='done'?'badge-done':o.status==='pending'?'badge-pend':o.status==='processing'?'badge-proc':'badge-rej';
    const stxt=o.status==='done'?'✅ مكتمل':o.status==='pending'?'⏳ قيد المراجعة':o.status==='processing'?'⚙️ معالجة':'❌ مرفوض';
    card.innerHTML=`
      <div class="adm-card-top">
        <div class="adm-card-ico" style="background:rgba(0,229,255,.08);color:var(--cyan)"><i class="fa-solid fa-box"></i></div>
        <div class="adm-card-info">
          <div class="adm-card-title">${san(o.product||'')}</div>
          <div class="adm-card-sub">💰 ${esc((o.totalDZD||0).toLocaleString())} دج · ${esc(o.paymentMethod==='baridimob'?'💳 BaridiMob':'🤝 يد بيد')}</div>
          <div class="adm-card-meta">
            <span>🆔 ${esc(o.id.slice(0,16))}...</span>
            <span>👤 ${esc(o.userId==='guest'?'زائر':o.userId?.slice(0,8)||'—')}</span>
            <span>📅 ${esc(o.date||'')}</span>
            ${o.receiveContact?`<span>📧 ${san(o.receiveContact)}</span>`:''}
            ${o.coupon?`<span>🎟️ ${san(o.coupon)}</span>`:''}
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
async function setOrderStatus(id,status){if(status==='done'){aToast('استخدم زر إرسال الكود لإتمام الطلب','❌');return;}try{await db.collection('orders').doc(id).update({status});allOrders=allOrders.map(o=>o.id===id?{...o,status}:o);renderOrders();aToast(`تم تغيير الحالة: ${status}`,'✅');await loadDashboard();}catch(e){aToast('خطأ في التحديث','❌');}}
async function deleteOrder(id){if(!confirm('حذف هذا الطلب نهائياً؟'))return;try{await db.collection('orders').doc(id).delete();allOrders=allOrders.filter(o=>o.id!==id);renderOrders();aToast('تم الحذف','🗑️');}catch(e){aToast('خطأ','❌');}}

function openConfirmModal(orderId,product,contact){
  currentOrderForDelivery={orderId,product,contact};
  document.getElementById('cmOrderId').textContent=orderId;
  document.getElementById('cmProduct').textContent=product;
  document.getElementById('cmCode').value='';
  document.getElementById('confirmModal').classList.remove('hidden');
}
function closeConfirmModal(){document.getElementById('confirmModal').classList.add('hidden');currentOrderForDelivery=null;}

/* Marks an order done and pays the customer ONCE (points = 1 per 1000 DZD, order count, total spent,
   and the one-time referral reward). The `awarded` flag makes a second call harmless. */
/* referral reward only for a real purchase (set to 0 to reward any completed first order) */
const REF_MIN_ORDER_DZD=2000;
async function completeOrder(orderId,notif){
  const FV=firebase.firestore.FieldValue;
  const oref=db.collection('orders').doc(orderId);
  return db.runTransaction(async tx=>{
    const os=await tx.get(oref);if(!os.exists)throw new Error('الطلب غير موجود');
    const o=os.data();const uid=o.userId;
    let uref=null,us=null,rref=null,rs=null;
    if(o.awarded===false&&uid&&uid!=='guest'){   /* only orders created by the new Worker carry awarded:false; older orders were already paid when they were placed */
      uref=db.collection('users').doc(uid);us=await tx.get(uref);
      const u=us.exists?us.data():null;
      if(u&&u.referredBy&&u.referredBy!==uid&&!u.refRewarded&&(Number(o.totalDZD)||0)>=REF_MIN_ORDER_DZD){rref=db.collection('users').doc(u.referredBy);rs=await tx.get(rref);}
    }
    tx.update(oref,o.awarded===false?{status:'done',awarded:true}:{status:'done'});
    if(us&&us.exists){
      const total=Math.max(0,Number(o.totalDZD)||0);
      const upd={points:FV.increment(Math.floor(total/1000)),orders:FV.increment(1),totalSpend:FV.increment(total)};
      if(notif)upd.notifications=FV.arrayUnion(notif);
      if(rs&&rs.exists){upd.refRewarded=true;tx.update(rref,{points:FV.increment(1000),referrals:FV.increment(1)});}
      tx.update(uref,upd);
    }else if(notif&&uid&&uid!=='guest'){
      tx.update(db.collection('users').doc(uid),{notifications:FV.arrayUnion(notif)});
    }
  });
}

async function confirmDelivery(){
  const code=document.getElementById('cmCode').value.trim();
  if(!code){aToast('أدخل الكود','❌');return;}
  const{orderId,product,contact}=currentOrderForDelivery||{};if(!orderId)return;
  try{
    const notif={title:`✅ طلبك جاهز — ${product}`,code:`🔑 الكود: ${code}`,date:new Date().toLocaleDateString('ar'),read:false};
    await completeOrder(orderId,notif);
    allOrders=allOrders.map(o=>o.id===orderId?{...o,status:'done'}:o);renderOrders();
    const m=await adminSendCode({orderId,code,product});
    await adminNotify(`✅ تم التسليم!\n🆔 ${orderId}\n🎮 ${product}\n🔑 ${code}\n📧 ${contact}\n${m.ok?'✉️ أُرسل الإيميل إلى '+m.to:'⚠️ فشل إيميل الكود: '+m.error}`);
    if(m.ok){closeConfirmModal();aToast('تم التأكيد وأُرسل الكود إلى '+m.to,'✅');await loadDashboard();}
    else aToast('تم تأكيد الطلب وظهر الكود في حساب العميل، لكن فشل الإيميل: '+m.error+'. اضغط الزر لإعادة المحاولة','⚠️');
  }catch(e){aToast('خطأ: '+e.message,'❌');}
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
  document.getElementById('catFormTitle').textContent='➕ إضافة قسم جديد';document.getElementById('catSaveBtn').innerHTML='<i class="fa-solid fa-plus"></i> إضافة قسم';catPrev();}
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
    allCats.forEach(cat=>{pf.innerHTML+=`<button class="filter-btn" onclick="filterProds('${jsq(cat.id)}',this)">${esc(cat.icon||'')} ${san(cat.name)}</button>`;});
  }catch(e){el.innerHTML=errState('خطأ');}
}
function editCat(id){
  const c=allCats.find(x=>x.id===id);if(!c)return;editingCat=id;
  document.getElementById('newCatId').value=c.id;document.getElementById('newCatId').readOnly=true;document.getElementById('newCatName').value=c.name||'';document.getElementById('newCatNameEn').value=c.nameEn||'';document.getElementById('newCatIcon').value=c.icon||'';document.getElementById('newCatOrder').value=c.order||'';
  const m=/^linear-gradient\(135deg,\s*(#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)$/i.exec(String(c.bg||''));
  document.getElementById('newCatC1').value=m?m[1]:'#203a43';document.getElementById('newCatC2').value=m?m[2]:'#2c5364';
  document.getElementById('catFormTitle').textContent='✏️ تعديل القسم: '+(c.name||id);document.getElementById('catSaveBtn').innerHTML='<i class="fa-solid fa-floppy-disk"></i> حفظ التعديل';catPrev();
  document.getElementById('newCatName').scrollIntoView({behavior:'smooth',block:'center'});
}
async function addCat(){
  const name=document.getElementById('newCatName').value.trim();const nameEn=document.getElementById('newCatNameEn').value.trim();const icon=document.getElementById('newCatIcon').value.trim();
  let id=document.getElementById('newCatId').value.trim().toLowerCase();
  if(!name){aToast('أدخل اسم القسم','❌');return;}
  try{
    const d=await db.collection('settings').doc('categories').get();const cats=d.exists?d.data().categories||[]:[];
    if(!editingCat){
      if(!id)id=slugId(nameEn)||('cat'+(cats.length+1));
      if(!/^[a-z0-9][a-z0-9_-]{0,29}$/.test(id)){aToast('المعرّف: حروف إنجليزية صغيرة وأرقام و - فقط','❌');return;}
      if(cats.find(c=>c.id===id)){aToast('المعرّف موجود مسبقاً','❌');return;}
    }
    const order=parseInt(document.getElementById('newCatOrder').value)||(Math.max(0,...cats.map(c=>c.order||0))+1);
    const rec={id:editingCat||id,name,nameEn:nameEn||name,icon:icon||'📦',bg:catGrad(),order};
    if(editingCat){const i=cats.findIndex(c=>c.id===editingCat);if(i<0){aToast('القسم لم يعد موجوداً','❌');return;}cats[i]={...cats[i],...rec};}
    else cats.push({...rec,enabled:true});
    await db.collection('settings').doc('categories').set({categories:cats});
    aToast(editingCat?'تم حفظ التعديل':'تم إضافة القسم','✅');clearCatForm();loadCats();
  }catch(e){aToast('خطأ: '+e.message,'❌');}
}
async function toggleCat(id,val){try{const d=await db.collection('settings').doc('categories').get();const cats=d.data().categories||[];const c=cats.find(x=>x.id===id);if(!c)return;c.enabled=val;await db.collection('settings').doc('categories').set({categories:cats});aToast(val?'✅ مفعّل':'⚠️ مخفي');}catch(e){aToast('خطأ','❌');}}
async function deleteCat(id){
  const n=allProds.filter(p=>p.cat===id).length;
  if(!confirm(n?`في هذا القسم ${n} منتج. لن تظهر في المتجر بعد حذف القسم حتى تنقلها لقسم آخر. حذف القسم؟`:'حذف هذا القسم؟'))return;
  try{const d=await db.collection('settings').doc('categories').get();const cats=(d.data().categories||[]).filter(x=>x.id!==id);await db.collection('settings').doc('categories').set({categories:cats});aToast('تم الحذف','🗑️');loadCats();}catch(e){aToast('خطأ','❌');}
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
    const ico=p.img==='ps'?'<i class="fa-brands fa-playstation"></i>':p.img==='plus'?'👑':'🎮';
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
  sel.innerHTML=list.map(c=>`<option value="${esc(c.id)}">${esc(c.icon||'')} ${esc(c.name)}</option>`).join('');
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
  $pf('pfTitle').textContent='✏️ تعديل المنتج: '+(p.name||p.id);$pf('pfSaveBtn').innerHTML='<i class="fa-solid fa-floppy-disk"></i> حفظ التعديل';
  pfAuto();$pf('pfKinds').scrollIntoView({behavior:'smooth',block:'center'});aToast('تم تحميل المنتج للتعديل','ℹ️');
}
async function addProd(){
  const k=pf.kind;if(!k){aToast('اختر نوع المنتج أولاً','❌');return;}
  const name=$pf('npName').value.trim();let id=$pf('npId').value.trim();
  if(!name){aToast('أدخل الاسم','❌');return;}
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/.test(id)){aToast('المعرّف: حروف إنجليزية وأرقام و - فقط','❌');return;}
  const region=pfRegionText(),priceDZD=parseFloat($pf('npDZD').value)||0;
  const imgUrl=$pf('npImgUrl').value.trim();if(imgUrl&&!safeUrl(imgUrl)){aToast('رابط الصورة يجب أن يبدأ بـ https://','❌');return;}
  let rec;
  if(k==='card'){
    const val=parseFloat($pf('npVal').value)||0;if(val<=0){aToast('أدخل قيمة البطاقة','❌');return;}
    if(!region){aToast('اختر المنطقة','❌');return;}
    const cur=$pf('npCur').value;rec={sub:region,val,cur,sym:PF_SYM[cur],img:'ps',badge:pf.keepBadge};
  }else if(k==='sub'){
    if(!region){aToast('اختر المنطقة','❌');return;}
    if(priceDZD<=0){aToast('أدخل سعر الاشتراك بالدينار','❌');return;}
    rec={sub:region,val:parseInt($pf('npDur').value)||1,cur:'month',sym:'',img:'plus',badge:$pf('npTier').value};
  }else{
    if(priceDZD<=0){aToast('أدخل سعر اللعبة بالدينار','❌');return;}
    rec={sub:[$pf('npPlat').value,region].filter(Boolean).join(' • '),val:1,cur:'copy',sym:'',img:'',badge:pf.keepBadge};
  }
  const prod={id,cat:$pf('npCat').value,name,...rec,priceDZD,imgUrl:imgUrl||null,desc:$pf('npDesc').value.trim(),descEn:$pf('npDescEn').value.trim(),stock:$pf('npStock').checked,kind:k};
  try{
    const d=await db.collection('settings').doc('products').get();let prods=d.exists?d.data().products||[]:[];
    const idx=prods.findIndex(p=>p.id===id);
    if(idx>=0&&pf.editing!==id){aToast('هذا المعرّف مستعمل لمنتج آخر، غيّره من «معرّف المنتج»','❌');return;}
    if(idx>=0)prods[idx]=prod;else prods.push(prod);
    await db.collection('settings').doc('products').set({products:prods});allProds=prods;renderProds();aToast(idx>=0?'تم تعديل المنتج':'تم إضافة المنتج','✅');clearProdForm();
  }catch(e){aToast('خطأ: '+e.message,'❌');}
}

async function toggleStock(idx,val){try{allProds[idx].stock=val;await db.collection('settings').doc('products').set({products:[...allProds]});renderProds();aToast(val?'✅ متوفر':'⚠️ نفذ');}catch(e){aToast('خطأ','❌');}}
async function deleteProd(idx){if(!confirm('حذف هذا المنتج؟'))return;try{allProds.splice(idx,1);await db.collection('settings').doc('products').set({products:allProds});renderProds();aToast('تم الحذف','🗑️');}catch(e){aToast('خطأ','❌');}}
function clearProdForm(){
  pf={kind:null,editing:null,idTouched:false,nameTouched:false,keepBadge:''};
  ['npId','npName','npVal','npDZD','npImgUrl','npDesc','npDescEn','npRegionOther'].forEach(i=>{const e=$pf(i);if(e)e.value='';});
  $pf('npId').readOnly=false;$pf('npStock').checked=true;$pf('npRegion').value='';$pf('npRegionOther').classList.add('hidden');
  document.querySelectorAll('#pfKinds .pf-kind').forEach(b=>b.classList.remove('on'));$pf('pfBody').classList.add('hidden');
  $pf('pfTitle').textContent='➕ إضافة منتج جديد';$pf('pfSaveBtn').innerHTML='<i class="fa-solid fa-floppy-disk"></i> حفظ المنتج';
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
      card.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico" style="background:rgba(245,158,11,.1);color:var(--gold);font-size:20px">🎟️</div><div class="adm-card-info"><div class="adm-card-title" style="font-family:monospace;font-size:15px;color:var(--cyan)">${san(c.code)}</div><div class="adm-card-sub">${c.type==='percent'?`خصم ${c.value}%`:`خصم ${c.value} دج`} · استُخدم ${esc(c.usedCount||0)}/${esc(c.maxUses||'∞')}</div><div class="adm-card-meta"><span>ينتهي: ${esc(c.expiry||'—')}</span>${exp}${c.featured?'<span class="badge badge-info">⭐ معروض في الرئيسية</span>':''}</div></div><div class="toggle-wrap"><label class="toggle"><input type="checkbox" ${esc(c.active?'checked':'')} onchange="toggleCpn(${esc(i)},this.checked)"><span class="toggle-sl"></span></label></div></div><div class="adm-card-actions"><button onclick="copyText('${jsq(c.code)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-copy"></i> نسخ</button><button onclick="featureCpn(${esc(i)},${c.featured?'false':'true'})" class="btn btn-o btn-sm"><i class="fa-solid fa-star"></i> ${c.featured?'إزالة من الرئيسية':'اعرضه في الرئيسية'}</button><button onclick="deleteCpn(${esc(i)})" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i> حذف</button></div>`;
      el.appendChild(card);
    });
  }catch(e){el.innerHTML=errState('خطأ');}
}

async function addCoupon(){
  const code=document.getElementById('ncCode').value.trim().toUpperCase();const type=document.getElementById('ncType').value;const val=parseFloat(document.getElementById('ncVal').value);const maxUses=parseInt(document.getElementById('ncMax').value)||null;const expiry=document.getElementById('ncExpiry').value||null;const featured=document.getElementById('ncFeat').checked;
  if(!code||!val){aToast('أدخل الكود والقيمة','❌');return;}
  if(type==='percent'&&(val<=0||val>100)){aToast('النسبة بين 1-100','❌');return;}
  try{const d=await db.collection('settings').doc('coupons').get();const cpns=d.exists?d.data().coupons||[]:[];if(cpns.find(c=>c.code===code)){aToast('الكود موجود مسبقاً','❌');return;}if(featured)cpns.forEach(c=>{c.featured=false;});cpns.push({code,type,value:val,active:true,usedCount:0,maxUses,expiry,featured,created:new Date().toISOString()});await db.collection('settings').doc('coupons').set({coupons:cpns});aToast('تم إنشاء: '+code,'✅');loadCoupons();['ncCode','ncVal','ncMax','ncExpiry'].forEach(i=>document.getElementById(i).value='');document.getElementById('ncFeat').checked=false;}catch(e){aToast('خطأ','❌');}
}
async function featureCpn(idx,val){try{const d=await db.collection('settings').doc('coupons').get();const cpns=d.data().coupons||[];cpns.forEach((c,i)=>{c.featured=(i===idx)?val:false;});await db.collection('settings').doc('coupons').set({coupons:cpns});aToast(val?'⭐ سيظهر في الصفحة الرئيسية خلال دقيقة':'تمت إزالته من الرئيسية');loadCoupons();}catch(e){aToast('خطأ','❌');}}

async function toggleCpn(idx,val){try{const d=await db.collection('settings').doc('coupons').get();const cpns=d.data().coupons||[];cpns[idx].active=val;await db.collection('settings').doc('coupons').set({coupons:cpns});aToast(val?'✅ مفعّل':'⚠️ معطّل');loadCoupons();}catch(e){aToast('خطأ','❌');}}
async function deleteCpn(idx){if(!confirm('حذف هذا الكوبون؟'))return;try{const d=await db.collection('settings').doc('coupons').get();const cpns=d.data().coupons||[];cpns.splice(idx,1);await db.collection('settings').doc('coupons').set({coupons:cpns});aToast('تم الحذف','🗑️');loadCoupons();}catch(e){aToast('خطأ','❌');}}

async function loadDiscount(){
  try{const d=await db.collection('settings').doc('discount').get();if(d.exists){const x=d.data();document.getElementById('discActive').checked=x.active||false;document.getElementById('discVal').value=x.value||'';document.getElementById('discExpiry').value=x.expiry||'';document.getElementById('discStatus').textContent=x.active?`✅ خصم ${x.value}% مفعّل${x.expiry?' حتى '+x.expiry:''}`:'⚠️ الخصم معطّل';}}catch(e){}
}
async function saveDiscount(){
  const active=document.getElementById('discActive').checked;const value=parseFloat(document.getElementById('discVal').value)||0;const expiry=document.getElementById('discExpiry').value||null;
  if(active&&(value<=0||value>99)){aToast('النسبة بين 1-99','❌');return;}
  try{await db.collection('settings').doc('discount').set({active,value,expiry});aToast(active?`✅ خصم ${value}% مفعّل`:'✅ تم إلغاء الخصم','✅');loadDiscount();}catch(e){aToast('خطأ','❌');}
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
    card.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico" style="background:linear-gradient(135deg,var(--violet),var(--pink));font-size:18px"><i class="fa-solid fa-user"></i></div><div class="adm-card-info"><div class="adm-card-title">${san(u.name||u.email||'مستخدم')}</div><div class="adm-card-sub">${san(u.email||'')} · ${esc((u.points||0).toLocaleString())} نقطة</div><div class="adm-card-meta"><span>${esc(u.orders||0)} طلب</span>${u.region?`<span class="badge badge-info">${esc(u.region.toUpperCase())}</span>`:''}<span>💰 ${esc((u.totalSpend||0).toLocaleString())} دج</span>${(u.referrals||0)>0?`<span>👥 ${esc(u.referrals)}</span>`:''}</div></div><span style="font-family:Orbitron;font-size:13px;color:var(--gold);font-weight:900">${esc((u.points||0).toLocaleString())}</span></div><div class="adm-card-actions"><button onclick="openUserModal('${jsq(u.uid)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-eye"></i> تفاصيل</button><button onclick="addPointsToUser('${jsq(u.uid)}','${jsq(u.name||'مستخدم')}')" class="btn btn-c btn-sm"><i class="fa-solid fa-plus"></i> نقاط</button><button onclick="sendNotifToUser('${jsq(u.uid)}')" class="btn btn-p btn-sm"><i class="fa-solid fa-bell"></i> إشعار</button><button onclick="copyText('${jsq(u.uid)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-copy"></i> UID</button></div>`;
    el.appendChild(card);
  });
}

async function openUserModal(uid){
  document.getElementById('userModal').classList.remove('hidden');
  document.getElementById('userModalContent').innerHTML=loading();
  try{
    const[uDoc,oSnap]=await Promise.all([db.collection('users').doc(uid).get(),db.collection('orders').where('userId','==',uid).orderBy('ts','desc').limit(5).get()]);
    const u=uDoc.data()||{};const orders=oSnap.docs.map(d=>({id:d.id,...d.data()}));
    document.getElementById('userModalContent').innerHTML=`<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px"><div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--violet),var(--pink));display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0"><i class="fa-solid fa-user"></i></div><div><div style="font-size:15px;font-weight:800">${san(u.name||'مستخدم')}</div><div style="font-size:11px;color:var(--mid)">${san(u.email||'')} · UID: ${esc(uid.slice(0,12))}...</div></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;font-size:12px"><div style="background:rgba(0,229,255,.05);border:1px solid var(--brd);border-radius:8px;padding:10px"><span style="color:var(--mid);display:block;font-size:10px">النقاط</span><strong style="font-family:Orbitron;color:var(--gold)">${esc((u.points||0).toLocaleString())}</strong></div><div style="background:rgba(0,229,255,.05);border:1px solid var(--brd);border-radius:8px;padding:10px"><span style="color:var(--mid);display:block;font-size:10px">الطلبات</span><strong style="color:var(--cyan)">${esc(u.orders||0)}</strong></div><div style="background:rgba(0,229,255,.05);border:1px solid var(--brd);border-radius:8px;padding:10px"><span style="color:var(--mid);display:block;font-size:10px">إجمالي الصرف</span><strong style="color:var(--green)">${esc((u.totalSpend||0).toLocaleString())} دج</strong></div><div style="background:rgba(0,229,255,.05);border:1px solid var(--brd);border-radius:8px;padding:10px"><span style="color:var(--mid);display:block;font-size:10px">الإحالات</span><strong style="color:var(--violet)">${esc(u.referrals||0)}</strong></div></div><div style="font-size:10px;font-weight:700;color:var(--mid);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px">آخر الطلبات</div>${orders.length?orders.map(o=>`<div style="background:rgba(0,229,255,.04);border-radius:8px;padding:8px 10px;margin-bottom:5px;font-size:11px"><span style="font-weight:700">${san(o.product||'')}</span> · ${esc((o.totalDZD||0).toLocaleString())} دج · <span class="badge badge-${esc(o.status==='done'?'done':o.status==='pending'?'pend':'rej')}">${esc(o.status)}</span></div>`).join(''):'<p style="color:var(--dim);font-size:11px">لا توجد طلبات</p>'}<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button onclick="addPointsToUser('${jsq(uid)}','${jsq(u.name||'مستخدم')}')" class="btn btn-c btn-sm"><i class="fa-solid fa-plus"></i> إضافة نقاط</button><button onclick="sendNotifToUser('${jsq(uid)}')" class="btn btn-p btn-sm"><i class="fa-solid fa-bell"></i> إرسال إشعار</button><button onclick="copyText('${jsq(uid)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-copy"></i> نسخ UID</button></div>`;
  }catch(e){document.getElementById('userModalContent').innerHTML=errState('خطأ');}
}
function closeUserModal(){document.getElementById('userModal').classList.add('hidden');}

async function addPointsToUser(uid,name){
  const pts=parseInt(prompt(`إضافة نقاط لـ ${name}:\nأدخل عدد النقاط (موجب = إضافة، سالب = حذف):`));
  if(isNaN(pts))return;
  try{await db.collection('users').doc(uid).update({points:firebase.firestore.FieldValue.increment(pts)});aToast(`تم ${pts>0?'إضافة':'حذف'} ${Math.abs(pts)} نقطة`,'✅');loadUsers();}catch(e){aToast('خطأ','❌');}
}
async function sendNotifToUser(uid){
  const title=prompt('عنوان الإشعار:');if(!title)return;const code=prompt('نص الإشعار (اختياري):');
  const notif={title,code:code||'',date:new Date().toLocaleDateString('ar'),read:false};
  try{await db.collection('users').doc(uid).update({notifications:firebase.firestore.FieldValue.arrayUnion(notif)});aToast('تم إرسال الإشعار','✅');}catch(e){aToast('خطأ','❌');}
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
    reviews.forEach(r=>{const card=document.createElement('div');card.className='adm-card';card.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico" style="background:rgba(245,158,11,.1);color:var(--gold);font-size:22px">⭐</div><div class="adm-card-info"><div class="adm-card-title">${san(r.userName||'مستخدم')} · ${esc('⭐'.repeat(Math.max(0,Math.min(5,Math.floor(Number(r.rating))||0))))}</div><div class="adm-card-sub">${r.comment?`"${san(r.comment.slice(0,100))}"`:''}</div><div class="adm-card-meta"><span>📅 ${esc(r.date||'')}</span><span class="${esc(r.hidden?'badge badge-warn':'badge badge-done')}">${esc(r.hidden?'🙈 مخفي':'👁️ ظاهر')}</span></div></div></div><div class="adm-card-actions"><button onclick="toggleReview('${jsq(r.id)}',${esc(!r.hidden)})" class="btn btn-o btn-sm">${esc(r.hidden?'👁️ إظهار':'🙈 إخفاء')}</button><button onclick="deleteReview('${jsq(r.id)}')" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i></button></div>`;el.appendChild(card);});
  }catch(e){el.innerHTML=errState('خطأ');}
}
function filterReviews(f,btn){currentReviewFilter=f;document.querySelectorAll('#tab-reviews .filter-btn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');loadReviews();}
async function toggleReview(id,hidden){try{await db.collection('ratings').doc(id).update({hidden});aToast(hidden?'🙈 مخفي':'👁️ ظاهر');loadReviews();}catch(e){aToast('خطأ','❌');}}
async function deleteReview(id){if(!confirm('حذف؟'))return;try{await db.collection('ratings').doc(id).delete();aToast('تم الحذف','🗑️');loadReviews();}catch(e){aToast('خطأ','❌');}}

/* ══ NEWSLETTER ══ */
async function loadNewsletter(){
  const el=document.getElementById('nlList');el.innerHTML=loading();
  try{
    const snap=await db.collection('newsletter').orderBy('date','desc').get();
    document.getElementById('nlStats').innerHTML=`<span class="badge badge-info">📧 ${esc(snap.size)} مشترك</span>`;
    el.innerHTML='';
    snap.docs.forEach((d,i)=>{const div=document.createElement('div');div.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(0,229,255,.04);border-radius:8px;margin-bottom:5px;font-size:12px';div.innerHTML=`<span>${esc(i+1)}. ${san(d.data().email||'')}</span><button onclick="copyText('${jsq(d.data().email||'')}')" class="btn btn-o btn-sm" style="padding:4px 8px"><i class="fa-solid fa-copy"></i></button>`;el.appendChild(div);});
  }catch(e){el.innerHTML=errState('خطأ');}
}
function exportNL(){const items=[];document.querySelectorAll('#nlList div span:first-child').forEach(s=>items.push(s.textContent.replace(/^\d+\. /,'')));const csv='email\n'+items.map(csvCell).join('\n');const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='newsletter.csv';a.click();URL.revokeObjectURL(url);aToast('تم التصدير','✅');}

/* ══ REPORTS ══ */
async function loadReports(){
  const el=document.getElementById('reportsList');el.innerHTML=loading();
  try{
    let reports=(await db.collection('reports').orderBy('ts','desc').limit(50).get()).docs.map(d=>({id:d.id,...d.data()}));
    el.innerHTML='';
    if(currentReportFilter==='open')reports=reports.filter(r=>r.status==='open');
    if(currentReportFilter==='resolved')reports=reports.filter(r=>r.status==='resolved');
    if(!reports.length){el.innerHTML=empty('لا توجد بلاغات');return;}
    reports.forEach(r=>{const card=document.createElement('div');card.className='adm-card';card.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico" style="background:rgba(239,68,68,.1);color:var(--red);font-size:20px">🚨</div><div class="adm-card-info"><div class="adm-card-title">${san(r.title||'')} <span class="badge badge-warn">${san(r.category||'')}</span></div><div class="adm-card-sub">${san((r.desc||'').slice(0,100))}...</div><div class="adm-card-meta"><span>👤 ${san(r.userName||'زائر')}</span><span>📅 ${esc(r.date||'')}</span>${r.orderId?`<span>🆔 ${san(r.orderId)}</span>`:''}<span class="badge badge-${esc(r.status==='open'?'rej':'done')}">${esc(r.status==='open'?'🔴 مفتوح':'✅ محلول')}</span></div></div></div><div class="adm-card-actions">${r.status==='open'?`<button onclick="resolveReport('${jsq(r.id)}')" class="btn btn-g btn-sm"><i class="fa-solid fa-check"></i> حلّ</button>`:''}<button onclick="replyReport('${jsq(r.id)}','${jsq(r.userId||'')}')" class="btn btn-p btn-sm"><i class="fa-solid fa-reply"></i> رد</button><button onclick="deleteReport('${jsq(r.id)}')" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i></button></div>`;el.appendChild(card);});
  }catch(e){el.innerHTML=errState('خطأ');}
}
function filterReports(f,btn){currentReportFilter=f;document.querySelectorAll('#tab-reports .filter-btn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');loadReports();}
async function resolveReport(id){try{await db.collection('reports').doc(id).update({status:'resolved'});aToast('تم وضع علامة محلول','✅');loadReports();}catch(e){aToast('خطأ','❌');}}
async function deleteReport(id){if(!confirm('حذف؟'))return;try{await db.collection('reports').doc(id).delete();aToast('تم الحذف','🗑️');loadReports();}catch(e){aToast('خطأ','❌');}}
async function replyReport(id,userId){
  const msg=prompt('رسالة الرد للعميل:');if(!msg)return;
  if(userId&&userId!=='guest'){const notif={title:'🔔 رد على بلاغك',code:msg,date:new Date().toLocaleDateString('ar'),read:false};try{await db.collection('users').doc(userId).update({notifications:firebase.firestore.FieldValue.arrayUnion(notif)});aToast('تم إرسال الرد','✅');}catch(e){aToast('خطأ','❌');}}
}

/* ══ ABUSE ══ */
async function loadAbuse(){
  const el=document.getElementById('abuseList');el.innerHTML=loading();
  try{
    const snap=await db.collection('abuse_flags').orderBy('date','desc').limit(30).get();
    el.innerHTML='';
    if(snap.empty){el.innerHTML=empty('لا توجد حالات مشبوهة ✅');return;}
    snap.forEach(d=>{const a=d.data();const div=document.createElement('div');div.className='abuse-item';div.innerHTML=`<div class="abuse-header"><i class="fa-solid fa-triangle-exclamation" style="color:var(--red)"></i><span style="font-size:13px;font-weight:700">حسابات متعددة من نفس الجهاز</span><span class="abuse-high">⚠️ عالي</span></div><div style="font-size:11px;color:var(--mid);margin-bottom:10px"><span>🔑 ${esc(a.userId?.slice(0,16))}...</span> · <span>🖥️ ${san(a.fingerprint||'')}</span> · <span>📅 ${esc(a.date?.split('T')[0]||'')}</span></div><div style="font-size:11px;color:var(--dim);margin-bottom:10px">مشبوهة: ${esc((a.suspectedAlts||[]).slice(0,3).join(', '))}</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button onclick="banUser('${jsq(a.userId)}')" class="btn btn-r btn-sm"><i class="fa-solid fa-ban"></i> حظر</button><button onclick="dismissAbuse('${jsq(d.id)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-check"></i> تجاهل</button></div>`;el.appendChild(div);});
  }catch(e){el.innerHTML=errState('خطأ');}
  loadBanned();
}

async function loadBanned(){
  const el=document.getElementById('bannedList');el.innerHTML='';
  try{const snap=await db.collection('banned_users').get();if(snap.empty){el.innerHTML='<p style="font-size:12px;color:var(--dim);padding:8px">لا يوجد محظورون</p>';return;}snap.forEach(d=>{const b=d.data();const div=document.createElement('div');div.className='adm-card';div.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico" style="background:rgba(239,68,68,.1);color:var(--red)"><i class="fa-solid fa-ban"></i></div><div class="adm-card-info"><div class="adm-card-title">${esc(d.id.slice(0,20))}...</div><div class="adm-card-sub">السبب: ${san(b.reason||'—')} · ${esc(b.date||'')}</div></div></div><div class="adm-card-actions"><button onclick="unbanUser('${jsq(d.id)}')" class="btn btn-g btn-sm"><i class="fa-solid fa-unlock"></i> رفع الحظر</button></div>`;el.appendChild(div);});}catch(e){}
}

async function banUser(uid,reason){
  const u=uid||document.getElementById('banUid').value.trim();const r=reason||document.getElementById('banReason').value.trim()||'تلاعب';
  if(!u){aToast('أدخل UID','❌');return;}if(!confirm(`حظر ${u.slice(0,16)}...؟`))return;
  try{await db.collection('banned_users').doc(u).set({reason:r,date:new Date().toLocaleDateString('ar')});aToast('تم الحظر','🚫');document.getElementById('banUid').value='';document.getElementById('banReason').value='';loadAbuse();}catch(e){aToast('خطأ','❌');}
}
async function unbanUser(uid){if(!confirm(`رفع حظر ${uid.slice(0,16)}...؟`))return;try{await db.collection('banned_users').doc(uid).delete();aToast('تم رفع الحظر','✅');loadBanned();}catch(e){aToast('خطأ','❌');}}
async function dismissAbuse(id){try{await db.collection('abuse_flags').doc(id).delete();aToast('تم التجاهل','✅');loadAbuse();}catch(e){aToast('خطأ','❌');}}

/* ══ FAQ ══ */
async function loadFAQ(){
  const el=document.getElementById('faqAdmList');el.innerHTML=loading();
  try{
    const d=await db.collection('settings').doc('faqs').get();const faqs=d.exists?d.data().faqs||[]:[];el.innerHTML='';
    if(!faqs.length){el.innerHTML=empty('لا توجد أسئلة مخصصة');return;}
    faqs.forEach((f,i)=>{const card=document.createElement('div');card.className='adm-card';card.innerHTML=`<div style="margin-bottom:8px"><div style="font-size:13px;font-weight:700;margin-bottom:2px">❓ ${san(f.q||'')} | ${san(f.qEn||'')}</div><div style="font-size:12px;color:var(--mid);line-height:1.7">${san((f.a||'').slice(0,150))}</div></div><div class="adm-card-actions"><button onclick="deleteFAQ(${esc(i)})" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i> حذف</button></div>`;el.appendChild(card);});
  }catch(e){el.innerHTML=errState('خطأ');}
}

async function addFAQ(){
  const q=document.getElementById('nfaqQ').value.trim();const qEn=document.getElementById('nfaqQEn').value.trim();const a=document.getElementById('nfaqA').value.trim();const aEn=document.getElementById('nfaqAEn').value.trim();
  if(!q||!a){aToast('أدخل السؤال والإجابة','❌');return;}
  try{const d=await db.collection('settings').doc('faqs').get();const faqs=d.exists?d.data().faqs||[]:[];faqs.push({q,qEn:qEn||q,a,aEn:aEn||a});await db.collection('settings').doc('faqs').set({faqs});aToast('تم إضافة السؤال','✅');['nfaqQ','nfaqQEn','nfaqA','nfaqAEn'].forEach(i=>document.getElementById(i).value='');loadFAQ();}catch(e){aToast('خطأ','❌');}
}
async function deleteFAQ(idx){if(!confirm('حذف؟'))return;try{const d=await db.collection('settings').doc('faqs').get();const faqs=d.data().faqs||[];faqs.splice(idx,1);await db.collection('settings').doc('faqs').set({faqs});aToast('تم الحذف','🗑️');loadFAQ();}catch(e){aToast('خطأ','❌');}}

/* ══ SEND CODE ══ */
async function sendCodeManual(){
  const orderId=document.getElementById('scOrderId').value.trim();const userId=document.getElementById('scUserId').value.trim();const product=document.getElementById('scProduct').value.trim();const code=document.getElementById('scCode').value.trim();const contact=document.getElementById('scContact').value.trim();
  if(!code){aToast('أدخل الكود','❌');return;}
  const mp={code,product};
  if(orderId)mp.orderId=orderId;else if(userId)mp.userId=userId;else if(contact.includes('@'))mp.to=contact;
  if(!mp.orderId&&!mp.userId&&!mp.to){aToast('أدخل رقم الطلب أو UID أو إيميل العميل','❌');return;}
  try{
    const notif=(userId||orderId)?{title:`✅ ${product||'طلبك جاهز'}`,code:`🔑 الكود: ${code}`,date:new Date().toLocaleDateString('ar'),read:false}:null;
    if(orderId)await completeOrder(orderId,notif);
    else if(userId)await db.collection('users').doc(userId).update({notifications:firebase.firestore.FieldValue.arrayUnion(notif)});
    const m=await adminSendCode(mp);
    await adminNotify(`✅ إرسال كود يدوي\n🎮 ${product}\n🔑 ${code}\n📧 ${contact}\n🆔 ${orderId||'—'}\n${m.ok?'✉️ أُرسل الإيميل إلى '+m.to:'⚠️ فشل الإيميل: '+m.error}`);
    if(!m.ok){aToast('تم تسجيل الكود لكن فشل الإيميل: '+m.error,'⚠️');return;}
    aToast('تم الإرسال إلى '+m.to,'✅');['scOrderId','scUserId','scProduct','scCode','scContact'].forEach(i=>document.getElementById(i).value='');
  }catch(e){aToast('خطأ: '+e.message,'❌');}
}

/* ══ BROADCAST ══ */
async function sendBroadcast(){
  const title=document.getElementById('bcTitle').value.trim();const body=document.getElementById('bcBody').value.trim();const target=document.getElementById('bcTarget').value;
  if(!title||!body){aToast('أدخل العنوان والنص','❌');return;}
  const targetName=target==='all'?'جميع المستخدمين':target==='active'?'النشطين':'غير النشطين';
  if(!confirm(`إرسال إشعار لـ "${targetName}"؟`))return;
  try{
    let snap;if(target==='active')snap=await db.collection('users').where('orders','>',0).get();else if(target==='inactive')snap=await db.collection('users').where('orders','==',0).get();else snap=await db.collection('users').get();
    const notif={title,code:body,date:new Date().toLocaleDateString('ar'),read:false};const batch=db.batch();snap.docs.forEach(d=>batch.update(d.ref,{notifications:firebase.firestore.FieldValue.arrayUnion(notif)}));await batch.commit();
    aToast(`تم الإرسال لـ ${snap.size} مستخدم!`,'📣');document.getElementById('bcTitle').value='';document.getElementById('bcBody').value='';
  }catch(e){aToast('خطأ: '+e.message,'❌');}
}

/* ══ REGIONS (settings/regions — read by the storefront) ══ */
const REG_LIST=[['eu','🇪🇺','أوروبي (EUR €)'],['us','🇺🇸','أمريكي (USD $)'],['sa','🇸🇦','سعودي (SAR ر.س)'],['ae','🇦🇪','إماراتي (AED د.إ)']];
async function loadRegions(){
  const cfg={enabled:false,defaultRegion:'eu',available:{eu:true,us:false,sa:false,ae:false}};
  try{
    const d=await db.collection('settings').doc('regions').get();
    if(d.exists){const x=d.data();cfg.enabled=x.enabled===true;if(REG_LIST.some(r=>r[0]===x.defaultRegion))cfg.defaultRegion=x.defaultRegion;
      if(x.available&&typeof x.available==='object')REG_LIST.forEach(([k])=>{cfg.available[k]=x.available[k]===true;});}
  }catch(e){aToast('تعذّر تحميل إعدادات المناطق','❌');}
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
  if(!available[def]){aToast('الريجن الافتراضي يجب أن يكون متوفراً','❌');return;}
  if(enabled&&!Object.values(available).some(Boolean)){aToast('فعّل ريجناً واحداً على الأقل','❌');return;}
  try{
    await db.collection('settings').doc('regions').set({enabled,defaultRegion:def,available,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    aToast('تم حفظ إعدادات المناطق','✅');regSummary();
  }catch(e){aToast('تعذّر الحفظ — تحقق من صلاحيات قواعد Firestore لـ settings/regions','❌');}
}

/* ══ SETTINGS ══ */
async function loadSettings2(){
  try{const d=await db.collection('settings').doc('maintenance').get();if(d.exists)document.getElementById('maintenanceMode').checked=d.data().active||false;const t=await db.collection('settings').doc('ticker').get();if(t.exists)document.getElementById('tickerTxt').value=t.data().text||'';}catch(e){}
}
async function toggleMaintenance(){const on=document.getElementById('maintenanceMode').checked;try{await db.collection('settings').doc('maintenance').set({active:on});aToast(on?'⚠️ وضع الصيانة مفعّل':'✅ الموقع متاح','✅');}catch(e){aToast('خطأ','❌');}}
async function resetVisitors(){if(!confirm('إعادة تعيين عداد الزيارات إلى صفر؟'))return;try{await db.collection('settings').doc('stats').set({visitors:0});aToast('تم إعادة التعيين','✅');}catch(e){aToast('خطأ','❌');}}
async function saveTicker(){const txt=document.getElementById('tickerTxt').value.trim();if(!txt){aToast('أدخل النص','❌');return;}try{await db.collection('settings').doc('ticker').set({text:txt});aToast('تم حفظ النص','✅');}catch(e){aToast('خطأ','❌');}}

async function exportOrders(){
  try{
    const snap=await db.collection('orders').orderBy('ts','desc').get();
    const rows=[['ID','المنتج','الحالة','المبلغ دج','طريقة الدفع','التاريخ','المستخدم','التواصل']];
    snap.docs.forEach(d=>{const o=d.data();rows.push([d.id,o.product||'',o.status||'',o.totalDZD||0,o.paymentMethod||'',o.date||'',o.userId||'',o.receiveContact||'']);});
    const csv=rows.map(r=>r.map(csvCell).join(',')).join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`glitchq_orders_${new Date().toISOString().split('T')[0]}.csv`;a.click();URL.revokeObjectURL(url);
    aToast('تم تصدير الطلبات','✅');
  }catch(e){aToast('خطأ','❌');}
}

/* ══ HELPERS ══ */
function setVal(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}
function copyText(txt){navigator.clipboard.writeText(txt).then(()=>aToast('تم النسخ','📋')).catch(()=>{});}
function loading(){return '<div class="adm-loading"><div class="spinner"></div><span>جاري التحميل...</span></div>';}
function empty(msg){return `<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>${esc(msg)}</p></div>`;}
function errState(msg){return `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="color:var(--red)"></i><p style="color:var(--red)">${esc(msg)}</p></div>`;}

/* ══════════════════════════════════════════
   ADVANCED CHARTS ENGINE
══════════════════════════════════════════ */
let _charts={};
const CHART_DEFAULTS={
  responsive:true,maintainAspectRatio:false,
  plugins:{legend:{display:false},tooltip:{backgroundColor:'#0f1729',titleColor:'#00E5FF',bodyColor:'#eef2ff',borderColor:'rgba(0,229,255,.2)',borderWidth:1,padding:10,cornerRadius:8,rtl:true}},
  scales:{x:{grid:{color:'rgba(0,229,255,.06)'},ticks:{color:'#8899bb',font:{size:10}}},y:{grid:{color:'rgba(0,229,255,.06)'},ticks:{color:'#8899bb',font:{size:10}}}}
};

function getLast7Days(){
  return Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d.toLocaleDateString('ar-DZ',{month:'short',day:'numeric'});});
}
function getDay7Key(ts){
  if(!ts)return null;const d=ts.toDate?ts.toDate():new Date(ts.seconds*1000);return d.toLocaleDateString('ar-DZ',{month:'short',day:'numeric'});}

function buildChart(id,cfg){
  if(_charts[id]){_charts[id].destroy();delete _charts[id];}
  const canvas=document.getElementById(id);if(!canvas)return;
  _charts[id]=new Chart(canvas,cfg);
}

function renderChartsFromOrders(orders,users){
  const days=getLast7Days();
  const ordCounts=Object.fromEntries(days.map(d=>[d,0]));
  const revCounts=Object.fromEntries(days.map(d=>[d,0]));
  const statusCounts={pending:0,processing:0,done:0,rejected:0};
  const prodCounts={};

  orders.forEach(o=>{
    const key=getDay7Key(o.ts);
    if(key&&ordCounts[key]!==undefined){ordCounts[key]++;revCounts[key]+=(o.totalDZD||0);}
    if(o.status)statusCounts[o.status]=(statusCounts[o.status]||0)+1;
    const prod=o.product||'أخرى';prodCounts[prod]=(prodCounts[prod]||0)+1;
  });

  // Users by day
  const usrCounts=Object.fromEntries(days.map(d=>[d,0]));
  users.forEach(u=>{const key=getDay7Key(u.created);if(key&&usrCounts[key]!==undefined)usrCounts[key]++;});

  const gradient=(ctx,c1,c2)=>{const g=ctx.createLinearGradient(0,0,0,160);g.addColorStop(0,c1);g.addColorStop(1,c2);return g;};

  // 1. Orders bar chart
  buildChart('chartOrders',{type:'bar',data:{labels:days,datasets:[{data:Object.values(ordCounts),backgroundColor:'rgba(0,229,255,.25)',borderColor:'#00E5FF',borderWidth:2,borderRadius:6,hoverBackgroundColor:'rgba(0,229,255,.45)'}]},options:{...CHART_DEFAULTS,plugins:{...CHART_DEFAULTS.plugins,tooltip:{...CHART_DEFAULTS.plugins.tooltip,callbacks:{label:ctx=>`${ctx.raw} طلب`}}}}});

  // 2. Status doughnut
  buildChart('chartStatus',{type:'doughnut',data:{labels:['⏳ قيد المراجعة','⚙️ معالجة','✅ مكتملة','❌ مرفوضة'],datasets:[{data:[statusCounts.pending||0,statusCounts.processing||0,statusCounts.done||0,statusCounts.rejected||0],backgroundColor:['rgba(245,158,11,.7)','rgba(59,130,246,.7)','rgba(16,185,129,.7)','rgba(239,68,68,.7)'],borderColor:['#f59e0b','#3b82f6','#10b981','#ef4444'],borderWidth:2,hoverOffset:8}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{color:'#8899bb',font:{size:10},padding:8}},tooltip:{...CHART_DEFAULTS.plugins.tooltip,callbacks:{label:ctx=>`${ctx.label}: ${ctx.raw}`}}},cutout:'65%'}});

  // 3. Revenue line chart
  buildChart('chartRevenue',{type:'line',data:{labels:days,datasets:[{data:Object.values(revCounts),borderColor:'#ec4899',backgroundColor:ctx=>{const g=ctx.chart.ctx.createLinearGradient(0,0,0,160);g.addColorStop(0,'rgba(236,72,153,.3)');g.addColorStop(1,'rgba(236,72,153,.02)');return g;},fill:true,tension:.4,pointBackgroundColor:'#ec4899',pointRadius:4,borderWidth:2}]},options:{...CHART_DEFAULTS,plugins:{...CHART_DEFAULTS.plugins,tooltip:{...CHART_DEFAULTS.plugins.tooltip,callbacks:{label:ctx=>`${ctx.raw.toLocaleString()} دج`}}}}});

  // 4. Users bar
  buildChart('chartUsers',{type:'bar',data:{labels:days,datasets:[{data:Object.values(usrCounts),backgroundColor:'rgba(147,51,234,.35)',borderColor:'#9333ea',borderWidth:2,borderRadius:6,hoverBackgroundColor:'rgba(147,51,234,.6)'}]},options:{...CHART_DEFAULTS,plugins:{...CHART_DEFAULTS.plugins,tooltip:{...CHART_DEFAULTS.plugins.tooltip,callbacks:{label:ctx=>`${ctx.raw} مستخدم`}}}}});

  // 5. Products horizontal bar
  const topProds=Object.entries(prodCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if(topProds.length){buildChart('chartProducts',{type:'bar',data:{labels:topProds.map(p=>p[0].slice(0,20)),datasets:[{data:topProds.map(p=>p[1]),backgroundColor:['rgba(0,229,255,.5)','rgba(147,51,234,.5)','rgba(236,72,153,.5)','rgba(16,185,129,.5)','rgba(245,158,11,.5)','rgba(59,130,246,.5)'],borderColor:['#00E5FF','#9333ea','#ec4899','#10b981','#f59e0b','#3b82f6'],borderWidth:2,borderRadius:6}]},options:{indexAxis:'y',...CHART_DEFAULTS,scales:{x:{...CHART_DEFAULTS.scales.x,ticks:{...CHART_DEFAULTS.scales.x.ticks,callback:v=>Math.floor(v)}},y:{...CHART_DEFAULTS.scales.y}}}});}
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
    if(recent.length>=3)alerts.push({level:'high',icon:'🚨',msg:`${recent.length} طلبات من نفس جهة الاتصال خلال ساعة`,detail:c.slice(0,40),ids:recent.map(o=>o.id.slice(0,12)).join('، ')});
  });

  // 2. Orders with same userId too fast
  const byUser={};
  orders.forEach(o=>{if(!o.userId||o.userId==='guest')return;if(!byUser[o.userId])byUser[o.userId]=[];byUser[o.userId].push(o);});
  Object.entries(byUser).forEach(([uid,ords])=>{
    const recent=ords.filter(o=>{const ts=o.ts?.seconds?o.ts.seconds*1000:0;return now-ts<hour*2;});
    if(recent.length>=4)alerts.push({level:'medium',icon:'⚠️',msg:`${recent.length} طلبات من مستخدم واحد في ساعتين`,detail:`UID: ${uid.slice(0,16)}`,ids:recent.map(o=>o.id.slice(0,10)).join('، ')});
  });

  // 3. High value orders not confirmed after 24h
  const highValue=orders.filter(o=>o.status==='pending'&&(o.totalDZD||0)>5000);
  highValue.forEach(o=>{const ts=o.ts?.seconds?o.ts.seconds*1000:0;if(now-ts>hour*24)alerts.push({level:'medium',icon:'💰',msg:`طلب قيمة عالية معلّق أكثر من 24 ساعة`,detail:`${(o.totalDZD||0).toLocaleString()} دج — ${o.product||''}`,ids:o.id.slice(0,16)});});

  // 4. Users with 0 orders but high points
  users.forEach(u=>{if(!u.orders&&(u.points||0)>200)alerts.push({level:'low',icon:'🎯',msg:`مستخدم بنقاط عالية بدون طلبات`,detail:`${u.name||u.email||'مجهول'} — ${u.points} نقطة`,ids:u.id?.slice(0,16)||''});});

  // Render
  const box=document.getElementById('fraudAlertBox');
  const el=document.getElementById('fraudAlerts');
  if(!alerts.length){box.style.display='none';return;}
  box.style.display='block';el.innerHTML='';
  alerts.forEach(a=>{
    const colors={high:'var(--red)',medium:'var(--orange)',low:'var(--gold)'};
    const c=colors[a.level]||'var(--mid)';
    const div=document.createElement('div');
    div.style.cssText=`background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.25);border-radius:10px;padding:12px;margin-bottom:8px;`;
    div.innerHTML=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:18px">${a.icon}</span><strong style="color:${esc(c)};font-size:13px">${esc(a.msg)}</strong><span style="margin-right:auto;font-size:10px;background:${esc(c)}22;color:${esc(c)};padding:2px 8px;border-radius:6px;font-weight:700">${esc(a.level==='high'?'عالي':a.level==='medium'?'متوسط':'منخفض')}</span></div><div style="font-size:11px;color:var(--mid)">${esc(a.detail)}</div><div style="font-size:10px;color:var(--dim);margin-top:4px">IDs: ${esc(a.ids)}</div>`;
    el.appendChild(div);
  });
}
