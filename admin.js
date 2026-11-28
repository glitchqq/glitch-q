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
const TAB_TITLES={dashboard:'لوحة الإحصاء',orders:'الطلبات',products:'المنتجات والأقسام',coupons:'الكوبونات والخصومات',users:'المستخدمون',reviews:'التقييمات',launch:'إطلاق جديد',newsletter:'النشرة البريدية',reports:'البلاغات',abuse:'مكافحة الاحتيال',faq:'الأسئلة الشائعة',send:'إرسال كود',regions:'المناطق (الريجنات)',settings:'الإعدادات'};

function switchTab(name){
  if(window.innerWidth<=768)closeSidebarMobile();
  document.querySelectorAll('.tab-panel').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.sb-item').forEach(i=>i.classList.remove('on'));
  document.getElementById(`tab-${name}`)?.classList.add('on');
  document.querySelectorAll('.sb-item').forEach(i=>{if(i.getAttribute('onclick')?.includes(`'${name}'`))i.classList.add('on');});
  document.getElementById('topbarTitle').textContent=TAB_TITLES[name]||name;
  if(name==='dashboard')setTimeout(vzRedraw,30);
  if(name==='orders')loadOrders();
  if(name==='settings')pushRefresh();
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
  if(name==='launch')launchReset();
}

/* ══ CLOCK ══ */
setInterval(()=>{const t=document.getElementById('topbarTime');if(t)t.textContent=new Date().toLocaleTimeString('ar');},1000);

/* ══ INIT ══ */
async function initAdmin(){
  try{codesInit('sc');}catch(e){}
  await loadDashboard();
  try{watchOrders();}catch(e){console.error(e);}
  if(location.hash==='#orders')switchTab('orders');
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
    const PA=await loadPendingAccounts().catch(()=>null);const custDocs=usersSnap.docs.filter(d=>!(PA&&PA.ok&&PA.set.has(d.id)));
    const pending=orders.filter(o=>o.status==='pending').length;
    const done=orders.filter(o=>o.status==='done').length;
    const revenue=orders.filter(o=>o.status==='done').reduce((s,o)=>s+(o.totalDZD||0),0);
    const avgRating=ratingsSnap.size?(ratingsSnap.docs.reduce((s,d)=>s+(d.data().rating||0),0)/ratingsSnap.size).toFixed(1):'—';
    const visits=statsSnap.exists?(statsSnap.data().visitors||0):0;
    setVal('st-orders',ordersSnap.size);setVal('st-pending',pending);setVal('st-done',done);
    setVal('st-users',custDocs.length);setVal('st-revenue',revenue.toLocaleString()+' دج');
    setVal('st-rating',avgRating);setVal('st-visits',visits.toLocaleString());setVal('st-reports',reportsSnap.size);
    document.getElementById('sbPendingBadge').textContent=pending;
    document.getElementById('sbReportBadge').textContent=reportsSnap.size;
    window._dash={orders,users:custDocs.map(d=>({id:d.id,...d.data()}))};   /* feeds the quick-search palette and the charts */
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
    const usersData=custDocs.map(d=>({id:d.id,...d.data()}));
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
            ${o.senderName?`<span><i class="fa-solid fa-signature"></i>${san(o.senderName)}</span>`:''}
            ${o.coupon?`<span><i class="fa-solid fa-ticket"></i>${san(o.coupon)}</span>`:''}
          </div>
        </div>
        <span class="badge ${sc}">${stxt}</span>
      </div>
      <div class="adm-card-actions">
        ${o.status==='pending'?`<button onclick="setOrderStatus('${jsq(o.id)}','processing')" class="btn btn-o btn-sm"><i class="fa-solid fa-gear"></i> معالجة</button><button onclick="openConfirmModal('${jsq(o.id)}','${jsq(o.product||'')}','${jsq(o.receiveContact||'')}')" class="btn btn-g btn-sm"><i class="fa-solid fa-check"></i> إرسال</button><button onclick="setOrderStatus('${jsq(o.id)}','rejected')" class="btn btn-r btn-sm"><i class="fa-solid fa-xmark"></i> رفض</button>`:''}
        ${o.status==='processing'?`<button onclick="openConfirmModal('${jsq(o.id)}','${jsq(o.product||'')}','${jsq(o.receiveContact||'')}')" class="btn btn-g btn-sm"><i class="fa-solid fa-paper-plane"></i> إرسال الكود</button><button onclick="setOrderStatus('${jsq(o.id)}','rejected')" class="btn btn-r btn-sm"><i class="fa-solid fa-xmark"></i> رفض</button>`:''}
        ${o.status==='done'?`<button onclick="openConfirmModal('${jsq(o.id)}','${jsq(o.product||'')}','${jsq(o.receiveContact||'')}')" class="btn btn-c btn-sm" title="إرسال أكواد إضافية لنفس الطلب (النقاط لا تُمنح مرة ثانية)"><i class="fa-solid fa-plus"></i> أكواد إضافية</button>`:''}
        ${o.hasReceipt?`<button onclick="viewReceipt('${jsq(o.id)}')" class="btn btn-c btn-sm"><i class="fa-solid fa-receipt"></i> الوصل</button>`:o.paymentMethod==='baridimob'?`<span class="badge badge-info" title="هذا الطلب سبق تفعيل حفظ الوصولات، أو أن الصورة كبيرة جداً: صورته في تيليجرام">الوصل في تيليجرام</span>`:''}
        <button onclick="copyText('${jsq(o.id)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-copy"></i> ID</button>
        <button onclick="deleteOrder('${jsq(o.id)}')" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
    el.appendChild(card);
  });
}

function filterOrders(f,btn){currentOrderFilter=f;document.querySelectorAll('#tab-orders .filter-btn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderOrders();}
async function setOrderStatus(id,status){if(status==='done'){aToast('استخدم زر إرسال الكود لإتمام الطلب','err');return;}try{await db.collection('orders').doc(id).update({status});allOrders=allOrders.map(o=>o.id===id?{...o,status}:o);renderOrders();aToast(`تم تغيير الحالة: ${status}`,'ok');await loadDashboard();}catch(e){aToast('خطأ في التحديث','err');}}
async function viewReceipt(id){
  actOpen('<i class="fa-solid fa-receipt" style="color:var(--cyan)"></i> وصل الدفع',loading());
  try{
    const d=await db.collection('order_receipts').doc(id).get();
    if(!d.exists){document.getElementById('actBody').innerHTML=empty('لا يوجد وصل محفوظ لهذا الطلب (راجع تيليجرام)');return;}
    const x=d.data();const mime=/^image\/(png|jpeg|gif|webp)$/.test(String(x.mime))?x.mime:'image/png';
    const bytes=x.data&&typeof x.data.toUint8Array==='function'?x.data.toUint8Array():null;
    if(!bytes||!bytes.length){document.getElementById('actBody').innerHTML=errState('الصورة تالفة أو فارغة');return;}
    if(actUrl){try{URL.revokeObjectURL(actUrl);}catch(e){}}
    actUrl=URL.createObjectURL(new Blob([bytes],{type:mime}));
    const o=allOrders.find(z=>z.id===id)||{};
    document.getElementById('actBody').innerHTML=`<p style="font-size:12px;color:var(--mid);margin-bottom:10px">${san(o.product||'')} · ${esc((o.totalDZD||0).toLocaleString())} دج${o.senderName?' · المرسل: '+san(o.senderName):''}</p><a href="${actUrl}" target="_blank" rel="noopener"><img src="${actUrl}" alt="وصل الدفع" style="width:100%;max-height:65vh;object-fit:contain;border-radius:8px;background:#000"></a><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><a class="btn btn-o btn-sm" href="${actUrl}" download="receipt-${esc(id.slice(0,10))}.${mime.split('/')[1]==='jpeg'?'jpg':mime.split('/')[1]}"><i class="fa-solid fa-download"></i> حفظ الصورة</a><button onclick="deleteReceipt('${jsq(id)}')" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i> حذف الوصل</button></div>`;
  }catch(e){document.getElementById('actBody').innerHTML=errState('تعذّر تحميل الوصل: '+errCode(e));}
}
async function deleteReceipt(id){
  if(!confirm('حذف صورة الوصل من لوحة التحكم؟ (نسخة تيليجرام تبقى)'))return;
  try{const b=db.batch();b.delete(db.collection('order_receipts').doc(id));b.update(db.collection('orders').doc(id),{hasReceipt:false});await b.commit();allOrders=allOrders.map(o=>o.id===id?{...o,hasReceipt:false}:o);actClose();renderOrders();aToast('تم حذف الوصل','info');}
  catch(e){aToast('تعذّر الحذف: '+errCode(e),'err');}
}
async function deleteOrder(id){if(!confirm('حذف هذا الطلب نهائياً؟'))return;try{const b=db.batch();b.delete(db.collection('orders').doc(id));b.delete(db.collection('order_receipts').doc(id));await b.commit();allOrders=allOrders.filter(o=>o.id!==id);renderOrders();aToast('تم الحذف','info');}catch(e){aToast('خطأ','err');}}

/* Several codes in one delivery (e.g. a 20€ order sent as four 5€ cards). The owner first picks HOW MANY codes and their VALUE (5€–60€);
   one box per code appears ("الكود 1", "الكود 2"…, each with its own value so 15€+5€ is possible) and the note the customer reads is written
   automatically from the codes and their values (still editable). Same component in the delivery dialog ("cm") and in manual send ("sc"). */
const MAX_CODES=20;
const CODE_VALUES=[5,10,15,20,25,30,40,50,60];
function codesRowsEl(pre){return document.getElementById(pre+'Rows');}
function codesFillSelects(pre){
  const n=document.getElementById(pre+'N'),v=document.getElementById(pre+'V');
  if(n&&!n.options.length)for(let i=1;i<=MAX_CODES;i++)n.add(new Option(i===1?'1 كود':i+' أكواد',i));
  if(v&&!v.options.length)CODE_VALUES.forEach(x=>v.add(new Option(x+'€',x)));
}
function codeValOptions(sel){return CODE_VALUES.map(x=>`<option value="${x}"${x===sel?' selected':''}>${x}€</option>`).join('');}
/* (re)open the component: 1 code, a value (taken from the product name when it says e.g. "20€"), empty boxes, automatic note */
function codesInit(pre,val){
  codesFillSelects(pre);
  const n=document.getElementById(pre+'N'),v=document.getElementById(pre+'V');if(!n||!v)return;
  n.value='1';v.value=String(CODE_VALUES.includes(val)?val:5);
  const rows=codesRowsEl(pre);if(rows)rows.innerHTML='';
  const note=document.getElementById(pre+'Note');if(note){note.value='';delete note.dataset.manual;}
  codesBuild(pre,true);
}
/* keep what was typed while the number of boxes changes; a new value for all boxes only when the value selector was touched */
function codesBuild(pre,valChanged){
  codesFillSelects(pre);
  const rows=codesRowsEl(pre),n=Math.max(1,Math.min(MAX_CODES,parseInt(document.getElementById(pre+'N').value)||1)),v=parseInt(document.getElementById(pre+'V').value)||5;
  if(!rows)return;
  const old=[...rows.querySelectorAll('.code-row')].map(r=>({c:r.querySelector('.code-inp').value,v:parseInt(r.querySelector('.code-val').value)||v}));
  rows.innerHTML='';
  for(let i=0;i<n;i++){
    const keep=old[i],val=valChanged?v:(keep?keep.v:v);
    const r=document.createElement('div');r.className='code-row';r.style.cssText='display:flex;gap:8px;align-items:center;margin-bottom:8px';
    r.innerHTML=`<span style="min-width:62px;font-size:12px;color:var(--mid);font-weight:700">الكود ${i+1}</span><input type="text" class="adm-inp code-inp" dir="ltr" spellcheck="false" autocomplete="off" maxlength="300" placeholder="XXXX-XXXX-XXXX" style="flex:1;margin:0;font-family:monospace" oninput="codesNote('${pre}')"><select class="adm-inp code-val" style="width:82px;margin:0" onchange="codesNote('${pre}')">${codeValOptions(val)}</select>`;
    r.querySelector('.code-inp').value=keep?keep.c:'';
    rows.appendChild(r);
  }
  codesNote(pre);
}
/* the sentence the customer reads, from the values only: "4 بطاقات × 5€ = 20€" / "بطاقتان: 1 × 15€ + 1 × 5€ = 20€ (1:15€ 2:5€)" */
function codesAutoNote(vals){
  const n=vals.length,total=vals.reduce((a,b)=>a+b,0);
  if(n===1)return `بطاقة ${vals[0]}€`;
  const g={};vals.forEach(x=>{g[x]=(g[x]||0)+1;});
  const keys=Object.keys(g).map(Number).sort((a,b)=>b-a);
  if(keys.length===1)return `${n} بطاقات × ${keys[0]}€ = ${total}€`;
  return `${n} بطاقات: ${keys.map(k=>g[k]+' × '+k+'€').join(' + ')} = ${total}€ (${vals.map((x,i)=>(i+1)+':'+x+'€').join(' ')})`.slice(0,200);
}
function codesVals(pre){return [...codesRowsEl(pre).querySelectorAll('.code-val')].map(x=>parseInt(x.value)||0);}
function codesNote(pre){
  const vals=codesVals(pre),filled=[...codesRowsEl(pre).querySelectorAll('.code-inp')].filter(x=>x.value.trim()).length;
  const sum=document.getElementById(pre+'Sum');
  if(sum)sum.textContent=`المجموع: ${vals.reduce((a,b)=>a+b,0)}€ — ${vals.length===1?'كود واحد':vals.length+' أكواد'} (مكتوب منها ${filled})`;
  const note=document.getElementById(pre+'Note');
  if(note&&!note.dataset.manual)note.value=codesAutoNote(vals);
}
function codesNoteReset(pre){const note=document.getElementById(pre+'Note');if(note){delete note.dataset.manual;codesNote(pre);}}
/* -> {codes,vals,note} or null after telling the owner what to fix */
function readCodes(pre){
  const rows=[...codesRowsEl(pre).querySelectorAll('.code-row')];
  const codes=rows.map(r=>r.querySelector('.code-inp').value.trim()),vals=rows.map(r=>parseInt(r.querySelector('.code-val').value)||0);
  const empty=codes.findIndex(c=>!c);
  if(empty>=0){aToast(`خانة «الكود ${empty+1}» فارغة`,'err');rows[empty].querySelector('.code-inp').focus();return null;}
  const dup=codes.findIndex((c,i)=>codes.indexOf(c)!==i);
  if(dup>=0){aToast(`«الكود ${dup+1}» مكتوب مرتين — الكود ${codes.indexOf(codes[dup])+1} هو نفسه`,'err');return null;}
  if(codes.length>MAX_CODES){aToast('الحد الأقصى '+MAX_CODES+' كوداً في الرسالة الواحدة','err');return null;}
  if(codes.some(c=>c.length>300)){aToast('أحد الأكواد أطول من 300 حرف','err');return null;}
  const note=(document.getElementById(pre+'Note').value||'').trim().slice(0,200);
  return {codes,vals,note};
}
/* what the customer sees in his account */
function codesNotice(codes,note,vals){
  return (note?note+'\n':'')+(codes.length===1?`الكود: ${codes[0]}`:`الأكواد (${codes.length}):\n`+codes.map((c,i)=>`${i+1}) ${c}${vals&&vals[i]?' — '+vals[i]+'€':''}`).join('\n'));
}
function codesTelegram(codes,vals){return codes.length===1?codes[0]:'\n'+codes.map((c,i)=>`   ${i+1}) ${c}${vals&&vals[i]?' ('+vals[i]+'€)':''}`).join('\n');}
function openConfirmModal(orderId,product,contact){
  currentOrderForDelivery={orderId,product,contact};
  document.getElementById('cmOrderId').textContent=orderId;
  document.getElementById('cmProduct').textContent=product;
  {const m=/(\d{1,2})\s*€/.exec(String(product||''));codesInit('cm',m?parseInt(m[1]):0);}
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
  /* the owner's "pause points" switch: while it is on the order is delivered normally, but no points, reward pool or referral bonus are paid */
  let paused;try{const ms=await db.collection('settings').doc('maintenance').get();paused=ms.exists&&ms.data().pointsOff===true;}catch(er){throw new Error('تعذّر قراءة مفتاح إيقاف النقاط — لم يُسلَّم الطلب. أعد المحاولة');}
  await ensureProds();
  const oref=db.collection('orders').doc(orderId);
  return db.runTransaction(async tx=>{
    const os=await tx.get(oref);if(!os.exists)throw new Error('الطلب غير موجود');
    const o=os.data();const uid=o.userId;
    let uref=null,us=null,rref=null,rs=null;
    if(o.awarded===false&&uid&&uid!=='guest'){   /* only orders created by the new Worker carry awarded:false; older orders were already paid when they were placed */
      uref=db.collection('users').doc(uid);us=await tx.get(uref);
      const u=us.exists?us.data():null;
      if(!paused&&u&&u.referredBy&&u.referredBy!==uid&&!u.refRewarded&&(Number(o.totalDZD)||0)>=e.refMinOrderDZD){rref=db.collection('users').doc(u.referredBy);rs=await tx.get(rref);}
    }
    /* the deadline is fixed the first time the order is delivered; a later re-send never extends it */
    const upd0=o.awarded===false?{status:'done',awarded:true}:{status:'done'};if(!o.doneAt)upd0.doneAt=Date.now();   /* doneAt: the 2-day thank-you message counts from the FIRST delivery */
    if(!o.codeValidUntil)upd0.codeValidUntil=(notif&&notif.until)||codeUntil();
    tx.update(oref,upd0);
    if(us&&us.exists){
      const total=Math.max(0,Number(o.totalDZD)||0);
      const pr=GQEcon.orderProfit(o,allProds,e,ECO_RATES);
      /* status ladder + win-back boost (econ.js): the customer's tier is judged on his orders BEFORE this one; a boost promised in a retention
         message counts if the order was PLACED inside its window. The two never add up (the larger one applies), and effEarnPct() caps the total. */
      const ots=o.ts&&o.ts.toMillis?o.ts.toMillis():(Date.parse(o.ts)||Date.now());
      const ud=us.data()||{};
      const tier=GQEcon.tierOf(ud);
      const bPP=(Number(ud.boostUntil)||0)>=ots?Math.max(0,Math.floor(Number(ud.boostPP)||0)):0;
      const extra=Math.max(tier.boost,bPP);
      const pts=paused?0:GQEcon.earnPts(pr.profit,e,extra);
      const upd={orders:FV.increment(1),totalSpend:FV.increment(total),lastPurchaseAt:Date.now(),cartAt:0};   /* lastPurchaseAt restarts the 12-month expiry clock and the win-back timer; cartAt:0 ends any "abandoned order" reminder */
      const boostUsed=bPP>tier.boost;   /* it counts as used only if it actually paid more than his tier would have */
      if(boostUsed){upd.boostPP=0;upd.boostUntil=0;}   /* a win-back boost is used once */
      if(!paused){upd.points=FV.increment(pts);upd.rewardPool=FV.increment(pts*e.ptDZD);}
      if(notif)upd.notifications=FV.arrayUnion(notif);
      let rp=0;
      if(rs&&rs.exists){
        rp=GQEcon.refPts(pr.profit,e);
        upd.refRewarded=true;
        tx.update(rref,{points:FV.increment(rp),rewardPool:FV.increment(rp*e.ptDZD),referrals:FV.increment(1),refPoints:FV.increment(rp)});
      }
      tx.update(uref,upd);
      tx.set(db.collection('order_econ').doc(orderId),{orderId,userId:uid,revenue:pr.revenue,cost:pr.cost,profit:pr.profit,estimated:pr.estimated,pts,refPts:rp,paused,tier:tier.id,extraPP:extra,effPct:GQEcon.effEarnPct(e,extra),boostUsed,refUserId:(rs&&rs.exists)?u_ref(us):null,ptDZD:e.ptDZD,earnPct:e.earnPct,refPct:e.refPct,ts:FV.serverTimestamp()});
    }else if(notif&&uid&&uid!=='guest'){
      tx.update(db.collection('users').doc(uid),{notifications:FV.arrayUnion(notif),lastPurchaseAt:Date.now(),cartAt:0});
    }
  });
}
function u_ref(us){const d=us&&us.exists?us.data():null;return d&&d.referredBy?d.referredBy:null;}

async function confirmDelivery(){
  const rc=readCodes('cm');if(!rc)return;const{codes,vals,note}=rc;
  const{orderId,product,contact}=currentOrderForDelivery||{};if(!orderId)return;
  try{
    const notif={title:`طلبك جاهز — ${product} 🧾 فاتورتك متوفرة في حسابك`,code:codesNotice(codes,note,vals),date:new Date().toLocaleDateString('ar'),until:codeUntil(),read:false};
    await completeOrder(orderId,notif);
    allOrders=allOrders.map(o=>o.id===orderId?{...o,status:'done'}:o);renderOrders();
    const m=await adminSendCode({orderId,codes,note,product});
    await adminNotify(`✅ تم التسليم!\n🆔 ${orderId}\n🎮 ${product}\n🔑 ${codesTelegram(codes,vals)}\n📧 ${contact}\n${m.ok?'✉️ أُرسل الإيميل إلى '+m.to:'⚠️ فشل إيميل الكود: '+m.error}`);
    if(m.ok){closeConfirmModal();aToast((codes.length>1?`تم التأكيد وأُرسلت ${codes.length} أكواد إلى `:'تم التأكيد وأُرسل الكود إلى ')+m.to,'ok');await loadDashboard();}
    else aToast('تم تأكيد الطلب وظهر الكود في حساب العميل، لكن فشل الإيميل: '+m.error+'. اضغط الزر لإعادة المحاولة','warn');
  }catch(e){aToast('خطأ: '+e.message,'err');}
}

/* ══ CATEGORIES ══ */
let allCats=[],editingCat=null,catIconData='',catIconPicked=false,catBgPicked=false;
const CAT_EMOJIS=['🎮','🎴','👑','🕹️','💳','🎁','⭐','🔥','🛒','🎧','🏆','💎','🎟️','📦'];
const CAT_SWATCHES=[['#203a43','#2c5364'],['#4c1d95','#c026d3'],['#1e3a8a','#0ea5e9'],['#065f46','#10b981'],['#7c2d12','#f59e0b'],['#7f1d1d','#ef4444'],['#831843','#ec4899'],['#1f2937','#6b7280']];
const HEX6=/^#[0-9a-f]{6}$/i;
function catGrad(){const c1=document.getElementById('newCatC1').value,c2=document.getElementById('newCatC2').value;return `linear-gradient(135deg,${HEX6.test(c1)?c1:'#203a43'},${HEX6.test(c2)?c2:'#2c5364'})`;}
function catPrev(){const el=document.getElementById('catPrev');if(!el)return;el.style.background=catGrad();el.textContent=document.getElementById('newCatIcon').value.trim()||'📦';
  document.querySelectorAll('#catEmojiGrid button').forEach(b=>b.classList.toggle('on',b.textContent===document.getElementById('newCatIcon').value.trim()));}
function slugId(t){return String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,30);}
function catAuto(){if(editingCat)return;const idEl=document.getElementById('newCatId');if(idEl.dataset.touched)return;idEl.value=slugId(document.getElementById('newCatNameEn').value);}
function initCatForm(){
  const g=document.getElementById('catEmojiGrid');if(g&&!g.children.length){CAT_EMOJIS.forEach(e=>{const b=document.createElement('button');b.type='button';b.textContent=e;b.onclick=()=>{document.getElementById('newCatIcon').value=e;catIconPicked=true;catPrev();};g.appendChild(b);});}
  const sw=document.getElementById('catSwatches');if(sw&&!sw.children.length){CAT_SWATCHES.forEach(([a,b2])=>{const b=document.createElement('button');b.type='button';b.style.background=`linear-gradient(135deg,${a},${b2})`;b.title=a+' → '+b2;b.onclick=()=>{document.getElementById('newCatC1').value=a;document.getElementById('newCatC2').value=b2;catPrev();};sw.appendChild(b);});}
  const idEl=document.getElementById('newCatId');if(idEl&&!idEl.dataset.bound){idEl.dataset.bound='1';idEl.addEventListener('input',()=>{idEl.dataset.touched='1';});}
  catPrev();
}
function clearCatForm(){editingCat=null;catIconData='';catIconPicked=false;catBgPicked=false;catIconShow();['newCatId','newCatName','newCatNameEn','newCatIcon','newCatIconUrl','newCatOrder'].forEach(i=>{const e=document.getElementById(i);e.value='';delete e.dataset.touched;});
  document.getElementById('newCatId').readOnly=false;document.getElementById('newCatC1').value='#203a43';document.getElementById('newCatC2').value='#2c5364';
  document.getElementById('catFormTitle').textContent='إضافة قسم جديد';document.getElementById('catSaveBtn').innerHTML='<i class="fa-solid fa-plus"></i> إضافة قسم';catPrev();}
/* The storefront shows these three sections when Firestore has no `settings/categories` document (same list as script.js).
   The panel must show them too — and the first time you change any section it saves them together with your change,
   otherwise adding ONE section would silently hide the other three from the store. */
const ADMIN_DEFAULT_CATS=[
  {id:'psstore',name:'بطاقات PlayStation',nameEn:'PlayStation Cards',icon:'<i class="fa-brands fa-playstation"></i>',bg:'linear-gradient(135deg,#6B0516,#E1062C)',enabled:true,order:1},
  {id:'psplus',name:'اشتراكات PS Plus',nameEn:'PS Plus Subscriptions',icon:'+',bg:'linear-gradient(135deg,#b45309,#f59e0b)',enabled:true,order:2},
  {id:'games',name:'ألعاب رقمية',nameEn:'Digital Games',icon:'🎮',bg:'linear-gradient(135deg,#203a43,#2c5364)',enabled:true,order:3}
];
async function readCats(){
  const d=await db.collection('settings').doc('categories').get();
  const saved=d.exists&&Array.isArray(d.data().categories)?d.data().categories:null;
  return {cats:saved?saved:ADMIN_DEFAULT_CATS.map(c=>({...c})),saved:!!saved};
}
/* A section's icon: an uploaded picture wins, otherwise exactly what the owner picked (emoji / Font Awesome tag) is shown — nothing is rewritten. */
const ICON_DATA=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/;
function safeIcon(u){u=String(u||'').trim();return (safeUrl(u)||(u.length<=70000&&ICON_DATA.test(u)?u:''));}
function catIco(i,url,unpicked){const u=safeIcon(url);if(u)return `<img src="${esc(u)}" alt="" style="height:26px;width:auto;max-width:64px;object-fit:contain">`;const v=String(i||'');if(unpicked&&(!v||v==='👑'||v==='+'))return '+';return /^<i class="fa-(solid|brands|regular) fa-[a-z0-9-]{1,40}"><\/i>$/.test(v)?v:esc(v||'📦');}
/* Upload the section's own picture (e.g. the PlayStation Plus logo the owner is entitled to use): the file is shrunk in the browser
   and stored inside the section itself, so no file hosting or link is needed. PNG/JPEG/WebP only (no SVG: it can carry script). */
function catIconShow(){
  const box=document.getElementById('catIconPrev');if(!box)return;
  const u=catIconData||document.getElementById('newCatIconUrl')?.value.trim()||'';
  box.innerHTML=safeIcon(u)?`<img src="${esc(safeIcon(u))}" alt="" style="height:44px;width:auto;max-width:120px;object-fit:contain"> <button type="button" class="btn btn-o" onclick="catIconClear()">إزالة الصورة</button>`:'';
}
function catIconClear(){catIconData='';document.getElementById('newCatIconUrl').value='';const f=document.getElementById('newCatIconFile');if(f)f.value='';catIconShow();}
async function catIconPick(inp){
  const f=inp.files&&inp.files[0];if(!f)return;
  if(!/^image\/(png|jpeg|webp)$/.test(f.type)){aToast('اختر صورة PNG أو JPG أو WebP','err');inp.value='';return;}
  if(f.size>6*1024*1024){aToast('الصورة كبيرة جداً (الحد 6 ميغابايت)','err');inp.value='';return;}
  try{
    const bmp=await createImageBitmap(f);
    let out='';
    for(const max of [192,144,112,80]){
      const k=Math.min(1,max/Math.max(bmp.width,bmp.height)),w=Math.max(1,Math.round(bmp.width*k)),h=Math.max(1,Math.round(bmp.height*k));
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(bmp,0,0,w,h);
      const png=cv.toDataURL('image/png');
      if(png.length<=70000){out=png;break;}
    }
    if(!out)throw new Error('big');
    catIconData=out;document.getElementById('newCatIconUrl').value='';catIconShow();aToast('تم تجهيز الصورة — اضغط حفظ القسم','ok');
  }catch(e){aToast('تعذّر قراءة الصورة، جرّب صورة أخرى','err');inp.value='';}
}
/* ── Product picture: choose a file on the device → shrunk here → the Worker keeps it and answers with an https link (needs Worker v15), or paste a link ── */
let pImgBusy=false;
function prodImgShow(){
  const box=document.getElementById('pfImgPrev');if(!box)return;
  const u=safeUrl((document.getElementById('npImgUrl')||{value:''}).value.trim())||'';
  box.innerHTML=u?`<img src="${esc(u)}" alt="" style="height:64px;width:64px;object-fit:cover;border-radius:10px"> <button type="button" class="btn btn-o" onclick="prodImgClear()">إزالة الصورة</button>`:'';
}
function prodImgClear(){document.getElementById('npImgUrl').value='';const f=document.getElementById('npImgFile');if(f)f.value='';prodImgShow();const st=document.getElementById('pfImgState');if(st)st.textContent='تمت إزالة الصورة — اضغط حفظ المنتج.';}
async function prodImgPick(inp){
  const f=inp.files&&inp.files[0];if(!f||pImgBusy)return;
  const st=document.getElementById('pfImgState');
  if(!/^image\/(png|jpeg|webp)$/.test(f.type)){aToast('اختر صورة PNG أو JPG أو WebP','err');inp.value='';return;}
  if(f.size>12*1024*1024){aToast('الصورة كبيرة جداً (الحد 12 ميغابايت)','err');inp.value='';return;}
  pImgBusy=true;if(st)st.textContent='جارٍ تجهيز الصورة ورفعها…';
  try{
    const bmp=await createImageBitmap(f);
    let out='';
    for(const [max,q] of [[720,.86],[640,.8],[560,.74],[480,.68],[400,.6],[320,.55]]){
      const k=Math.min(1,max/Math.max(bmp.width,bmp.height)),w=Math.max(1,Math.round(bmp.width*k)),h=Math.max(1,Math.round(bmp.height*k));
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(bmp,0,0,w,h);
      let d=cv.toDataURL('image/webp',q);if(!d.startsWith('data:image/webp'))d=cv.toDataURL('image/jpeg',q);   // browsers without WebP encoding fall back to JPEG
      if(d.length*0.75<=150*1024){out=d;break;}
    }
    if(!out)throw new Error('big');
    const r=await adminWk('/admin/product-image',{data:out});
    if(r.ok&&r.data&&typeof r.data.url==='string'&&/^https:\/\//.test(r.data.url)){
      document.getElementById('npImgUrl').value=r.data.url;prodImgShow();
      if(st)st.textContent='تم رفع الصورة ✓ — اضغط «حفظ المنتج» لتظهر في المتجر.';aToast('تم رفع الصورة — اضغط حفظ المنتج','ok');
    }else{
      const m=r.status===404||r.status===405?'الـWorker لا يدعم رفع الصور بعد — الصق نسخة v15 من worker.js في Cloudflare':r.status===403||r.status===401?'غير مصرّح — سجّل الدخول بحساب المالك':r.status===413?'الصورة ثقيلة حتى بعد التصغير — جرّب صورة أخرى':r.status===429?'محاولات كثيرة — انتظر قليلاً':'تعذّر رفع الصورة، حاول مرة أخرى';
      if(st)st.textContent=m;aToast(m,'err');inp.value='';
    }
  }catch(e){if(st)st.textContent='تعذّر قراءة الصورة، جرّب صورة أخرى';aToast('تعذّر قراءة الصورة، جرّب صورة أخرى','err');inp.value='';}
  finally{pImgBusy=false;}
}
async function loadCats(){
  const el=document.getElementById('catsList');el.innerHTML=loading();initCatForm();
  try{
    const rc=await readCats(),cats=rc.cats;
    allCats=cats.slice().sort((a,b)=>(a.order||0)-(b.order||0));pfFillCats();
    el.innerHTML='';if(!cats.length){el.innerHTML=empty('لا توجد أقسام');return;}
    if(!rc.saved)el.innerHTML='<div class="pf-hint" style="margin-bottom:10px">هذه الأقسام الافتراضية التي يعرضها المتجر. أول تعديل أو إضافة تحفظها كلها معاً.</div>';
    allCats.forEach(cat=>{
      const card=document.createElement('div');card.className='adm-card';
      card.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico" style="background:${esc(cat.bg||'#1c2a44')};font-size:20px">${catIco(cat.icon,cat.iconUrl,cat.id==='psplus'&&!cat.iconSet)}</div><div class="adm-card-info"><div class="adm-card-title">${san(cat.name)} | ${san(cat.nameEn||'')}</div><div class="adm-card-sub">ID: ${san(cat.id)} · ترتيب: ${esc(cat.order||0)}</div></div><div class="toggle-wrap"><label class="toggle"><input type="checkbox" ${esc(cat.enabled?'checked':'')} onchange="toggleCat('${jsq(cat.id)}',this.checked)"><span class="toggle-sl"></span></label></div></div><div class="adm-card-actions"><button onclick="editCat('${jsq(cat.id)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-pen"></i> تعديل</button><button onclick="deleteCat('${jsq(cat.id)}')" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i> حذف</button></div>`;
      el.appendChild(card);
    });
    const pf=document.getElementById('prodCatFilter');pf.innerHTML='<button class="filter-btn on" onclick="filterProds(\'all\',this)">الكل</button>';
    allCats.forEach(cat=>{pf.innerHTML+=`<button class="filter-btn" onclick="filterProds('${jsq(cat.id)}',this)">${san(cat.name)}</button>`;});
  }catch(e){el.innerHTML=errState('خطأ');}
}
function editCat(id){
  const c=allCats.find(x=>x.id===id);if(!c)return;editingCat=id;
  document.getElementById('newCatId').value=c.id;document.getElementById('newCatId').readOnly=true;document.getElementById('newCatName').value=c.name||'';document.getElementById('newCatNameEn').value=c.nameEn||'';document.getElementById('newCatIcon').value=(c.id==='psplus'&&!c.iconSet&&(!c.icon||c.icon==='👑'))?'+':(c.icon||'');catIconPicked=false;catIconData=/^data:/.test(c.iconUrl||'')?c.iconUrl:'';document.getElementById('newCatIconUrl').value=catIconData?'':(c.iconUrl||'');catIconShow();document.getElementById('newCatOrder').value=c.order||'';
  const m=/^linear-gradient\(135deg,\s*(#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)$/i.exec(String(c.bg||''));
  document.getElementById('newCatC1').value=m?m[1]:'#203a43';document.getElementById('newCatC2').value=m?m[2]:'#2c5364';
  catBgPicked=false;document.getElementById('catFormTitle').textContent='تعديل القسم: '+(c.name||id);document.getElementById('catSaveBtn').innerHTML='<i class="fa-solid fa-floppy-disk"></i> حفظ التعديل';catPrev();
  document.getElementById('newCatName').scrollIntoView({behavior:'smooth',block:'center'});
}
async function addCat(){
  const name=document.getElementById('newCatName').value.trim();const nameEn=document.getElementById('newCatNameEn').value.trim();const icon=document.getElementById('newCatIcon').value.trim();
  let id=document.getElementById('newCatId').value.trim().toLowerCase();
  if(!name){aToast('أدخل اسم القسم','err');return;}
  try{
    const cats=(await readCats()).cats;
    if(!editingCat){
      if(!id)id=slugId(nameEn)||('cat'+(cats.length+1));
      if(!/^[a-z0-9][a-z0-9_-]{0,29}$/.test(id)){aToast('المعرّف: حروف إنجليزية صغيرة وأرقام و - فقط','err');return;}
      if(cats.find(c=>c.id===id)){aToast('المعرّف موجود مسبقاً','err');return;}
    }
    const order=parseInt(document.getElementById('newCatOrder').value)||(Math.max(0,...cats.map(c=>c.order||0))+1);
    const typed=document.getElementById('newCatIconUrl').value.trim();
    if(typed&&!safeUrl(typed)){aToast('رابط الصورة يجب أن يبدأ بـ https://','err');return;}
    const iconUrl=catIconData||typed;
    if(iconUrl&&!safeIcon(iconUrl)){aToast('الصورة غير صالحة أو كبيرة جداً','err');return;}
    const rec={id:editingCat||id,name,nameEn:nameEn||name,icon:icon||'📦',iconUrl:iconUrl||'',bg:catGrad(),order};
    if(editingCat){const i=cats.findIndex(c=>c.id===editingCat);if(i<0){aToast('القسم لم يعد موجوداً','err');return;}cats[i]={...cats[i],...rec,iconSet:catIconPicked||!!cats[i].iconSet,bgSet:catBgPicked||!!cats[i].bgSet};}
    else cats.push({...rec,iconSet:catIconPicked,bgSet:catBgPicked,enabled:true});
    await db.collection('settings').doc('categories').set({categories:cats});
    aToast(editingCat?'تم حفظ التعديل':'تم إضافة القسم','ok');clearCatForm();loadCats();
  }catch(e){aToast('خطأ: '+e.message,'err');}
}
async function toggleCat(id,val){try{const cats=(await readCats()).cats;const c=cats.find(x=>x.id===id);if(!c)return;c.enabled=val;await db.collection('settings').doc('categories').set({categories:cats});aToast(val?'مفعّل':'مخفي',val?'ok':'warn');}catch(e){aToast('خطأ','err');}}
async function deleteCat(id){
  const n=allProds.filter(p=>p.cat===id).length;
  if(!confirm(n?`في هذا القسم ${n} منتج. لن تظهر في المتجر بعد حذف القسم حتى تنقلها لقسم آخر. حذف القسم؟`:'حذف هذا القسم؟'))return;
  try{const cats=(await readCats()).cats.filter(x=>x.id!==id);await db.collection('settings').doc('categories').set({categories:cats});aToast('تم الحذف','info');loadCats();}catch(e){aToast('خطأ','err');}
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
    const valText=p.cur==='month'?`${p.val} شهر`:p.cur==='copy'?'نسخة':p.cur==='item'?(p.valText||'—'):`${p.val}${p.sym||''}`;
    const bgCls=p.img==='ps'?'prod-thumb-ps':p.img==='plus'?'prod-thumb-plus':'prod-thumb-game';
    const ico=p.img==='ps'?'<i class="fa-brands fa-playstation"></i>':p.img==='plus'?'<b style="font-size:1.35em;line-height:1">+</b>':'<i class="fa-solid fa-gamepad"></i>';
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
const PF_NAME={card:'PS Store Card',sub:'PS Plus',game:'',other:''};
let pf={kind:null,editing:null,idTouched:false,nameTouched:false,keepBadge:''};
const $pf=id=>document.getElementById(id);
function pfOpts(sel,list,first){sel.innerHTML=(first!==undefined?`<option value="">${esc(first)}</option>`:'')+list.map(x=>Array.isArray(x)?`<option value="${esc(x[0])}">${esc(x[1])}</option>`:`<option value="${esc(x)}">${esc(x)}</option>`).join('');}
function pfFillCats(){
  const sel=$pf('npCat');if(!sel)return;const cur=sel.value;
  const list=allCats.length?allCats:[{id:'psstore',name:'بطاقات PlayStation'},{id:'psplus',name:'اشتراكات PS Plus'},{id:'games',name:'ألعاب رقمية'}];
  sel.innerHTML=list.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')+'<option value="__new">➕ قسم جديد…</option>';
  if(cur&&(cur==='__new'||list.some(c=>c.id===cur)))sel.value=cur;
  pfCat();
}
/* picking "➕ قسم جديد" shows its two name boxes; the section is created together with the product */
function pfCat(){const nb=$pf('pfNewCat');if(nb)nb.classList.toggle('hidden',$pf('npCat').value!=='__new');}
async function pfCreateCat(){
  const name=$pf('npNewCatName').value.trim();
  if(!name){aToast('اكتب اسم القسم الجديد','err');return null;}
  const nameEn=$pf('npNewCatNameEn').value.trim()||name,icon=($pf('npNewCatIcon').value.trim()||'🎁').slice(0,8);
  const{cats}=await readCats();
  const base=slugId(nameEn.replace(/[^\x00-\x7F]/g,' '))||('cat-'+Date.now().toString(36));
  let id=base,n=2;while(cats.some(c=>c.id===id))id=base+'-'+(n++);
  cats.push({id,name,nameEn,icon,bg:'linear-gradient(135deg,#203a43,#2c5364)',enabled:true,order:Math.max(0,...cats.map(c=>Number(c.order)||0))+1});
  await db.collection('settings').doc('categories').set({categories:cats});
  allCats=cats.slice().sort((a,b)=>(a.order||0)-(b.order||0));
  return id;
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
  $pf('pfRegionWrap').classList.toggle('hidden',k==='other');
  $pf('pfRegionLbl').textContent=k==='game'?'المنطقة (اختياري)':'المنطقة';
  pfOpts($pf('npRegion'),PF_REGIONS.map(r=>[r,r]).concat([['__other','أخرى (اكتب)…']]),k==='game'?'— بدون —':'— اختر المنطقة —');
  $pf('pfNameLbl').textContent=k==='game'?'اسم اللعبة':k==='sub'?'اسم الاشتراك':k==='other'?'اسم المنتج':'اسم البطاقة';
  $pf('npName').placeholder=k==='game'?'EA SPORTS FC 26':k==='sub'?'PS Plus Essential':k==='other'?'مثال: بطاقة Netflix 15$':'PS Store Card';
  $pf('pfImgLbl').textContent=k==='game'?'غلاف اللعبة (مهم) — ارفع صورة أو ضع رابطاً':'صورة المنتج (اختياري)';
  $pf('pfPriceHint').textContent='';
  if(!keepValues){
    const want={card:'psstore',sub:'psplus',game:'games'}[k];if(want&&[...$pf('npCat').options].some(o=>o.value===want))$pf('npCat').value=want;pfCat();
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
    let base=k==='card'?['ps',$pf('npVal').value,$pf('npCur').value.toLowerCase(),reg]:k==='sub'?['plus',$pf('npTier').value.toLowerCase(),$pf('npDur').value+'m',reg]:k==='other'?['item',slugId($pf('npName').value.replace(/[^\x00-\x7F]/g,' '))||(pf.rid=pf.rid||Math.random().toString(36).slice(2,7))]:['game',slugId($pf('npName').value),$pf('npPlat').value.toLowerCase().replace(/[^a-z0-9]/g,''),reg];
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
  const k=p.kind||(p.cur==='item'?'other':p.cur==='month'?'sub':p.cur==='copy'?'game':'card');
  pfKind(k,true);pf.editing=p.id;pf.idTouched=true;pf.nameTouched=true;pf.keepBadge=p.badge||'';
  pfFillCats();$pf('npCat').value=p.cat||$pf('npCat').value;
  $pf('npName').value=p.name||'';$pf('npId').value=p.id||'';$pf('npId').readOnly=true;
  $pf('npDZD').value=p.priceDZD||'';$pf('npImgUrl').value=p.imgUrl||'';prodImgShow();$pf('npDesc').value=p.desc||'';$pf('npDescEn').value=p.descEn||'';$pf('npStock').checked=p.stock!==false;
  const setRegion=t=>{t=String(t||'');if(!t){$pf('npRegion').value='';}else if(PF_REGIONS.includes(t)){$pf('npRegion').value=t;}else{$pf('npRegion').value='__other';$pf('npRegionOther').value=t;}$pf('npRegionOther').classList.toggle('hidden',$pf('npRegion').value!=='__other');};
  if(k==='card'){setRegion(p.sub);$pf('npCur').value=PF_SYM[p.cur]?p.cur:'EUR';$pf('npSym').value=PF_SYM[$pf('npCur').value];$pf('npVal').value=p.val||'';}
  else if(k==='sub'){setRegion(p.sub);if(PF_TIERS.includes(p.badge))$pf('npTier').value=p.badge;if(PF_DURS.some(d=>d[0]===p.val))$pf('npDur').value=String(p.val);}
  else if(k==='other'){$pf('npOtherVal').value=p.valText||'';$pf('npOtherSub').value=p.sub||'';$pf('npOtherBadge').value=p.badge||'';}
  else{const parts=String(p.sub||'').split(' • ');if(PF_PLATS.includes(parts[0])){$pf('npPlat').value=parts[0];setRegion(parts.slice(1).join(' • '));}else{$pf('npPlat').value='';setRegion(p.sub);}}
  $pf('pfTitle').textContent='تعديل المنتج: '+(p.name||p.id);$pf('pfSaveBtn').innerHTML='<i class="fa-solid fa-floppy-disk"></i> حفظ التعديل';
  pfAuto();$pf('pfKinds').scrollIntoView({behavior:'smooth',block:'center'});aToast('تم تحميل المنتج للتعديل','ℹ️');
}
async function addProd(){
  const k=pf.kind;if(!k){aToast('اختر نوع المنتج أولاً','err');return;}
  const name=$pf('npName').value.trim();let id=$pf('npId').value.trim();
  if(!name){aToast('أدخل الاسم','err');return;}
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/.test(id)){aToast('المعرّف: حروف إنجليزية وأرقام و - فقط','err');return;}
  const region=k==='other'?'':pfRegionText(),priceDZD=parseFloat($pf('npDZD').value)||0;
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
  }else if(k==='other'){
    if(priceDZD<=0){aToast('أدخل سعر المنتج بالدينار','err');return;}
    rec={sub:$pf('npOtherSub').value.trim().slice(0,80),val:1,cur:'item',sym:'',img:'other',badge:$pf('npOtherBadge').value.trim().slice(0,20),valText:$pf('npOtherVal').value.trim().slice(0,30)};
  }else{
    if(priceDZD<=0){aToast('أدخل سعر اللعبة بالدينار','err');return;}
    rec={sub:[$pf('npPlat').value,region].filter(Boolean).join(' • '),val:1,cur:'copy',sym:'',img:'',badge:pf.keepBadge};
  }
  let cat=$pf('npCat').value;
  try{
    if(cat==='__new'){cat=await pfCreateCat();if(!cat)return;}
  }catch(e){aToast('تعذّر إنشاء القسم: '+errCode(e),'err');return;}
  const prod={id,cat,name,...rec,priceDZD,imgUrl:imgUrl||null,desc:$pf('npDesc').value.trim(),descEn:$pf('npDescEn').value.trim(),stock:$pf('npStock').checked,kind:k};
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
  ['npId','npName','npVal','npDZD','npImgUrl','npDesc','npDescEn','npRegionOther','npOtherVal','npOtherSub','npOtherBadge','npNewCatName','npNewCatNameEn','npNewCatIcon'].forEach(i=>{const e=$pf(i);if(e)e.value='';});
  const _pif=$pf('npImgFile');if(_pif)_pif.value='';prodImgShow();
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
const USERS_LIMIT=300,USERS_SHOWN=100;
let bannedMap={};
async function loadBannedMap(){try{const s=await db.collection('banned_users').get();const m={};s.forEach(d=>{m[d.id]=d.data();});bannedMap=m;}catch(e){}}
function isBannedNow(b){if(!b)return false;const u=Number(b.until)||0;return !u||u>Date.now();}
/* how long a suspension still runs, in words */
function banLeft(b){
  const u=Number(b&&b.until)||0;if(!u)return 'دائم';
  const ms=u-Date.now();if(ms<=0)return 'انتهى';
  const h=Math.ceil(ms/3600000);return h<24?`يتبقى ${h} ساعة`:`يتبقى ${Math.ceil(h/24)} يوم`;
}
/* ban lengths (milliseconds; 0 = until the owner lifts it) */
const BAN_DURS=[['1h','ساعة واحدة',3600000],['24h','يوم واحد (24 ساعة)',86400000],['3d','3 أيام',3*86400000],['7d','أسبوع (7 أيام)',7*86400000],['30d','شهر (30 يوماً)',30*86400000],['perm','دائم — حتى ترفعه بنفسك',0]];
function banDurOptions(sel){return BAN_DURS.map(d=>`<option value="${esc(d[0])}"${d[0]===sel?' selected':''}>${esc(d[1])}</option>`).join('');}
function banUntil(key){const d=BAN_DURS.find(x=>x[0]===key);return d&&d[2]?Date.now()+d[2]:0;}
/* The inbox an address really reaches — identical to the Worker's canonEmail() (a test keeps the two equal) */
const PLUS_DOMAINS=['outlook.com','hotmail.com','live.com','msn.com','icloud.com','me.com','proton.me','protonmail.com','pm.me','fastmail.com'];
function canonEmail(email){
  const e=String(email||'').trim().toLowerCase();const at=e.lastIndexOf('@');if(at<1)return e;
  let local=e.slice(0,at),dom=e.slice(at+1);
  if(dom==='googlemail.com')dom='gmail.com';
  if(dom==='gmail.com'){const l=local.split('+')[0].replace(/\./g,'');if(l)local=l;}
  else if(PLUS_DOMAINS.includes(dom)){const l=local.split('+')[0];if(l)local=l;}
  return local+'@'+dom;
}
function tsMs(v){try{if(v&&typeof v.toMillis==='function')return v.toMillis();}catch(e){}return Number(v)||0;}
function errCode(e){return String((e&&(e.code||e.message))||'').slice(0,80);}

async function loadUsers(){
  const el=document.getElementById('usersList');el.innerHTML=loading();
  try{
    const[snap,P]=await Promise.all([db.collection('users').orderBy('points','desc').limit(USERS_LIMIT).get(),loadPendingAccounts(true).catch(()=>null),loadBannedMap()]);
    renderPendBox(P);
    allUsers=snap.docs.map(d=>({uid:d.id,...d.data()})).filter(u=>!(P&&P.ok&&P.set.has(u.uid)));renderUsers();
  }catch(e){el.innerHTML=errState('خطأ في تحميل المستخدمين: '+errCode(e));}
}
function renderUsers(){
  const el=document.getElementById('usersList');el.innerHTML='';
  const q=(document.getElementById('userSearch')?.value||'').trim().toLowerCase();
  const filtered=allUsers.filter(u=>!q||(u.name||'').toLowerCase().includes(q)||(u.email||'').toLowerCase().includes(q)||String(u.uid).toLowerCase().includes(q));
  if(!filtered.length){el.innerHTML=empty('لا توجد نتائج');return;}
  const groups={};allUsers.forEach(u=>{const k=canonEmail(u.email);if(k)groups[k]=(groups[k]||0)+1;});
  filtered.slice(0,USERS_SHOWN).forEach(u=>{
    const owner=u.email===ADMIN_EMAIL,b=bannedMap[u.uid],banned=isBannedNow(b),dup=(groups[canonEmail(u.email)]||0)>1;
    const card=document.createElement('div');card.className='adm-card';
    card.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico" style="color:${banned?'var(--red)':'var(--cyan)'}"><i class="fa-solid ${banned?'fa-user-slash':'fa-user'}"></i></div><div class="adm-card-info"><div class="adm-card-title">${san(u.name||u.email||'مستخدم')}${banned?` <span class="badge badge-rej">محظور · ${esc(banLeft(b))}</span>`:''}${dup?' <span class="badge badge-warn">إيميل مكرر</span>':''}${typeof NF!=='undefined'&&(NF.bad(u.name)||NF.bad(u.nick)||NF.bad(u.firstName)||NF.bad(u.lastName))?' <span class="badge badge-warn" title="الاسم يحتوي كلمات غير مسموحة — لا يظهر للعامة">اسم مخالف</span>':''}</div><div class="adm-card-sub">${san(u.email||'')} · ${esc((u.points||0).toLocaleString())} نقطة</div><div class="adm-card-meta"><span>${esc(u.orders||0)} طلب</span>${u.region?`<span class="badge badge-info">${esc(String(u.region).toUpperCase())}</span>`:''}<span><i class="fa-solid fa-coins"></i>${esc((u.totalSpend||0).toLocaleString())} دج</span>${(u.referrals||0)>0?`<span><i class="fa-solid fa-user-group"></i>${esc(u.referrals)}</span>`:''}</div></div><span style="font-size:13px;color:var(--gold);font-weight:900">${esc((u.points||0).toLocaleString())}</span></div><div class="adm-card-actions"><button onclick="openUserModal('${jsq(u.uid)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-eye"></i> تفاصيل</button><button onclick="addPointsToUser('${jsq(u.uid)}','${jsq(u.name||'مستخدم')}')" class="btn btn-c btn-sm"><i class="fa-solid fa-plus"></i> نقاط</button><button onclick="sendNotifToUser('${jsq(u.uid)}','${jsq(u.name||u.email||'')}')" class="btn btn-p btn-sm"><i class="fa-solid fa-bell"></i> إشعار</button>${owner?'':banned?`<button onclick="unbanUser('${jsq(u.uid)}',true)" class="btn btn-g btn-sm"><i class="fa-solid fa-unlock"></i> فك الحظر</button>`:`<button onclick="openBanDialog('${jsq(u.uid)}','${jsq(u.name||u.email||'')}')" class="btn btn-r btn-sm"><i class="fa-solid fa-ban"></i> حظر</button>`}${owner?'':`<button onclick="openDeleteUser('${jsq(u.uid)}')" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i> حذف</button>`}<button onclick="copyText('${jsq(u.uid)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-copy"></i> UID</button></div>`;
    el.appendChild(card);
  });
  if(filtered.length>USERS_SHOWN){const n=document.createElement('p');n.style.cssText='font-size:12px;color:var(--dim);text-align:center;padding:10px';n.textContent=`عُرض أول ${USERS_SHOWN} من ${filtered.length} — اكتب في البحث للوصول لأي حساب`;el.appendChild(n);}
}

/* ── small modal shared by: ban, notify, delete, receipt ── */
let actUrl=null;
function actOpen(titleHtml,html){document.getElementById('actTitle').innerHTML=titleHtml;document.getElementById('actBody').innerHTML=html;document.getElementById('actModal').classList.remove('hidden');}
function actClose(){document.getElementById('actModal').classList.add('hidden');document.getElementById('actBody').innerHTML='';if(actUrl){try{URL.revokeObjectURL(actUrl);}catch(e){}actUrl=null;}}
/* a call to the Worker as the owner: {status, ok, data} */
async function adminWk(path,payload){
  try{
    const tok=await auth.currentUser.getIdToken();
    const r=await fetch(WORKER+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({idToken:tok},payload))});
    const j=await r.json().catch(()=>({}));
    return{status:r.status,ok:r.ok&&j.ok!==false,data:j};
  }catch(e){return{status:0,ok:false,data:{}};}
}
/* ══ PHONE ALERTS (Web Push, needs Worker v16) + in-panel alarm ══
   Phone: admin-sw.js shows the notification the Worker pushes for every new order (works with the panel closed).
   Panel open: a database listener rings an alarm until it is silenced — it uses no push service and works on any browser. */
const PUSH_OK='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
function pushBytes(s){s=String(s).replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
function pushSame(a,b){if(!a||!b||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
function pushLabel(){const u=navigator.userAgent||'';const os=/iPhone|iPad|iPod/.test(u)?'iPhone':/Android/.test(u)?'Android':/Windows/.test(u)?'Windows':/Mac/.test(u)?'Mac':/Linux/.test(u)?'Linux':'';const br=/Edg\//.test(u)?'Edge':/Firefox\//.test(u)?'Firefox':/Chrome\//.test(u)?'Chrome':/Safari\//.test(u)?'Safari':'';return [os,br].filter(Boolean).join(' · ')||'جهاز';}
async function pushSha(s){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,24);}   /* same id the Worker uses */
async function pushReg(){
  const reg=await navigator.serviceWorker.register('admin-sw.js',{scope:'./admin'});   /* "./admin" covers admin.html and /admin, and nothing of the store */
  if(reg.active)return reg;
  const sw=reg.installing||reg.waiting;
  if(sw)await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('sw timeout')),15000);sw.addEventListener('statechange',()=>{if(sw.state==='activated'){clearTimeout(t);res();}else if(sw.state==='redundant'){clearTimeout(t);rej(new Error('sw redundant'));}});});
  return reg;
}
async function pushLocalSub(){try{const reg=await navigator.serviceWorker.getRegistration('./admin');return reg?await reg.pushManager.getSubscription():null;}catch(e){return null;}}
async function pushRefresh(){
  const st=document.getElementById('pushState');if(!st)return;
  const on=document.getElementById('pushOn'),off=document.getElementById('pushOff'),test=document.getElementById('pushTest'),devs=document.getElementById('pushDevs');
  const btns=(a,b,c)=>{on.style.display=a?'':'none';off.style.display=b?'':'none';test.style.display=c?'':'none';};
  try{document.getElementById('alarmOn').checked=localStorage.getItem('gq_alarm')!=='0';}catch(e){}
  let here=null;
  if(!PUSH_OK){
    st.textContent=/iPhone|iPad|iPod/.test(navigator.userAgent)?'على iPhone يعمل فقط بعد «إضافة إلى الشاشة الرئيسية» (التعليمات أدناه) ثم فتح الأيقونة الجديدة.':'هذا المتصفح لا يدعم إشعارات الدفع. استخدم نسخة حديثة من Chrome أو Edge أو Firefox أو Safari.';
    btns(false,false,false);devs.textContent='';return;
  }
  if(Notification.permission==='denied'){
    st.textContent='الإشعارات محظورة لهذا الموقع في المتصفح: اضغط أيقونة القفل بجانب العنوان واسمح بالإشعارات ثم أعد تحميل الصفحة.';btns(false,false,false);
  }else{
    here=await pushLocalSub();
    st.textContent=here?'مفعّلة على هذا الجهاز':'غير مفعّلة على هذا الجهاز';btns(!here,!!here,!!here);
  }
  const [r,k]=await Promise.all([adminWk('/admin/push',{action:'list'}),here?adminWk('/admin/push',{action:'key'}):Promise.resolve(null)]);
  devs.textContent='';
  if(!r.ok||!Array.isArray(r.data.devices)){if(r.status===404)st.textContent+=' — حدّث الـ Worker إلى v16 (ملف worker.js) ليعمل هذا الجزء.';return;}
  const me=here?await pushSha(here.endpoint):'';
  if(here){   /* this browser holds a subscription the server can no longer use: its key changed, or the server dropped it → offer to set it up again */
    let stale=!r.data.devices.some(d=>d.id===me);
    try{const cur=here.options&&here.options.applicationServerKey;if(k&&k.ok&&k.data.key&&cur&&!pushSame(new Uint8Array(cur),pushBytes(k.data.key)))stale=true;}catch(e){}
    if(stale){st.textContent='هذا الجهاز بحاجة إلى إعادة التفعيل (لم يعد مسجّلاً عند الخادم) — اضغط «تفعيل».';btns(true,true,false);}
  }
  r.data.devices.forEach(d=>{
    const row=document.createElement('div');row.className='push-dev';
    const a=document.createElement('span');a.textContent=d.label||'جهاز';
    const h=document.createElement('span');h.className='host';h.textContent=d.host||'';
    row.appendChild(a);row.appendChild(h);
    if(d.id===me){const m=document.createElement('span');m.className='me';m.textContent='هذا الجهاز';row.appendChild(m);}
    devs.appendChild(row);
  });
}
async function pushEnable(){
  if(!PUSH_OK){pushRefresh();return;}
  const b=document.getElementById('pushOn');b.disabled=true;
  try{
    const perm=await Notification.requestPermission();
    if(perm!=='granted'){aToast('لم تسمح بالإشعارات','warn');return;}
    const k=await adminWk('/admin/push',{action:'key'});
    if(!k.ok||!k.data.key){aToast(k.status===404?'حدّث الـ Worker إلى v16 أولاً':'تعذّر تجهيز مفتاح الإشعارات','err');return;}
    const key=pushBytes(k.data.key),reg=await pushReg();
    let sub=await reg.pushManager.getSubscription();
    if(sub){const cur=sub.options&&sub.options.applicationServerKey;if(!cur||!pushSame(new Uint8Array(cur),key)){await sub.unsubscribe();sub=null;}}   /* an old key (e.g. the Worker was reset) → start again */
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    const j=sub.toJSON();
    const r=await adminWk('/admin/push',{action:'subscribe',subscription:{endpoint:j.endpoint,keys:j.keys},label:pushLabel()});
    if(!r.ok){try{await sub.unsubscribe();}catch(e){}aToast(r.status===409?'وصلت لحد 5 أجهزة، أوقف جهازاً قديماً أولاً':'تعذّر حفظ هذا الجهاز: '+(r.data.error||r.status),'err');return;}
    aToast('تم التفعيل — جرّب الإشعار التجريبي','ok');
  }catch(e){aToast('تعذّر التفعيل: '+errCode(e),'err');}
  finally{b.disabled=false;pushRefresh();}
}
async function pushDisable(){
  const sub=await pushLocalSub();
  try{
    if(sub){const r=await adminWk('/admin/push',{action:'unsubscribe',endpoint:sub.endpoint});if(!r.ok){aToast('تعذّر الإيقاف الآن، حاول مرة أخرى','err');return;}await sub.unsubscribe();}
    aToast('أُوقفت الإشعارات على هذا الجهاز','info');
  }catch(e){aToast('تعذّر الإيقاف: '+errCode(e),'err');}
  pushRefresh();
}
async function pushTest(){
  const b=document.getElementById('pushTest');b.disabled=true;
  try{
    const r=await adminWk('/admin/push',{action:'test'});
    if(!r.ok){aToast(r.status===429?'محاولات كثيرة، انتظر قليلاً':'تعذّر إرسال التجربة','err');return;}
    const d=r.data;
    if(!d.devices)aToast('لا يوجد أي جهاز مفعّل','warn');
    else if(d.sent===d.devices)aToast('أُرسل الإشعار إلى '+d.sent+' جهاز — يجب أن يصلك خلال ثوانٍ','ok');
    else aToast('وصل '+d.sent+' من '+d.devices+' (الأكواد: '+(d.results||[]).map(x=>x.status).join('، ')+')','warn',6000);
  }finally{b.disabled=false;pushRefresh();}
}

/* — alarm while the panel is open — */
let _ac=null,_alTimer=null,_alN=0,_alTitle=null,_alFlash=null;const _alSeen=new Set();
function alarmOn(){try{return localStorage.getItem('gq_alarm')!=='0';}catch(e){return true;}}
function alarmPref(){try{localStorage.setItem('gq_alarm',document.getElementById('alarmOn').checked?'1':'0');}catch(e){}if(!alarmOn())alarmStop();}
function alarmCtx(){try{if(!_ac){const C=window.AudioContext||window.webkitAudioContext;if(C)_ac=new C();}if(_ac&&_ac.state==='suspended')_ac.resume();}catch(e){}return _ac;}
['click','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,()=>alarmCtx(),{passive:true}));   /* browsers only allow sound after a tap: any tap on the panel unlocks it */
function alarmBeep(ac,t0,f,d){const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(0.4,t0+0.02);g.gain.exponentialRampToValueAtTime(0.0001,t0+d);o.connect(g);g.connect(ac.destination);o.start(t0);o.stop(t0+d+0.05);}
function alarmPlay(){const ac=alarmCtx();if(!ac||ac.state!=='running')return false;const t=ac.currentTime+0.05;[880,1175,880,1175,1568].forEach((f,i)=>alarmBeep(ac,t+i*0.22,f,0.18));return true;}
function alarmTry(){if(!alarmPlay())aToast('اضغط أي مكان في الصفحة ثم أعد المحاولة (المتصفح يمنع الصوت قبل اللمس)','warn');}
function alarmStart(text){
  alarmStop();
  document.getElementById('alarmTxt').textContent=text;document.getElementById('alarmBar').classList.add('on');
  if(_alTitle===null)_alTitle=document.title;
  let on=false;_alFlash=setInterval(()=>{on=!on;document.title=on?'🔔 طلب جديد!':_alTitle;},900);
  if(!alarmOn())return;
  _alN=0;const tick=()=>{alarmPlay();if(++_alN>=10)clearInterval(_alTimer);};   /* about 40 seconds, then it stays silent but the bar remains */
  tick();_alTimer=setInterval(tick,4000);
}
function alarmStop(){
  clearInterval(_alTimer);_alTimer=null;clearInterval(_alFlash);_alFlash=null;
  if(_alTitle!==null){document.title=_alTitle;_alTitle=null;}
  const b=document.getElementById('alarmBar');if(b)b.classList.remove('on');
}
function alarmOpen(){alarmStop();switchTab('orders');try{window.focus();}catch(e){}}
function orderAlert(id,text,count){
  if(id){if(_alSeen.has(id))return;_alSeen.add(id);}
  const badge=document.getElementById('sbPendingBadge');if(badge)badge.textContent=(parseInt(badge.textContent,10)||0)+(count||1);
  if(document.getElementById('tab-orders').classList.contains('on'))loadOrders();
  alarmStart(text);aToast('طلب جديد: '+text,'info',6000);
}
let _ordUnsub=null,_ordSeen=null;
function watchOrders(){
  if(_ordUnsub)return;
  _ordUnsub=db.collection('orders').orderBy('ts','desc').limit(8).onSnapshot(snap=>{
    if(_ordSeen===null){_ordSeen=new Set(snap.docs.map(d=>d.id));return;}   /* the first snapshot is just "what is already there" */
    const fresh=[];
    snap.docChanges().forEach(c=>{
      if(c.type!=='added'||_ordSeen.has(c.doc.id)||c.doc.metadata.hasPendingWrites)return;
      const o=c.doc.data(),ms=o.ts&&o.ts.toMillis?o.ts.toMillis():0;
      if(o.status==='pending'&&ms>Date.now()-600000)fresh.push({id:c.doc.id,o});   /* an old order sliding into view (after a delete) is not news */
    });
    snap.docs.forEach(d=>_ordSeen.add(d.id));
    if(fresh.length){const f=fresh[0].o;orderAlert(fresh[0].id,(fresh.length>1?fresh.length+' طلبات جديدة — ':'')+String(f.product||'').slice(0,80)+' · '+(Number(f.totalDZD)||0).toLocaleString()+' دج',fresh.length);}
  },e=>{console.error('orders watch',e);_ordUnsub=null;});
}
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',ev=>{
  const m=ev.data;if(!m||typeof m!=='object')return;
  if(m.t==='push'&&m.kind==='order')orderAlert(String(m.oid||''),String(m.title||'طلب جديد').replace(/^🛒\s*/,'').slice(0,120),1);
  if(m.t==='open-orders')alarmOpen();
});

/* ── Sign-ups that never clicked their activation link are not customers: kept out of the list and the counts (needs Worker v13) ── */
let _pend=null,_pendAt=0;
async function loadPendingAccounts(force){
  if(!force&&_pend&&Date.now()-_pendAt<60000)return _pend;
  const r=await adminWk('/admin/unverified',{action:'list',hours:24});
  _pend=(r.ok&&r.data&&Array.isArray(r.data.uids))
    ?{ok:true,set:new Set(r.data.uids),count:Number(r.data.count)||r.data.uids.length,old:Number(r.data.old)||0}
    :{ok:false,set:new Set(),count:0,old:0,status:r.status,detail:String((r.data&&(r.data.error||r.data.detail))||'')};
  _pendAt=Date.now();return _pend;
}
function renderPendBox(P){
  const el=document.getElementById('pendBox');if(!el)return;
  if(!P||!P.ok){
    const why=P&&P.status===404?'الصق نسخة الـ Worker الجديدة (v13) في Cloudflare.':P&&P.detail==='auth_list_failed'?'امنح حساب خدمة الـ Worker دور «Firebase Authentication Admin» في IAM.':'تعذّر الاتصال بالخادم.';
    el.innerHTML=`<div class="pf-hint" style="margin-bottom:12px">⚠️ لا أستطيع تمييز الحسابات التي لم تُفعَّل بعد، لذلك تظهر كلها في القائمة. ${why}</div>`;return;
  }
  el.innerHTML=P.count?`<div class="pf-hint" style="margin-bottom:12px">⏳ <b>${P.count}</b> حساب بانتظار التفعيل (سُجّل ولم يضغط صاحبه على رابط الإيميل بعد) — مخفيّ من القائمة والإحصاء إلى أن يُفعَّل.${P.old?` <button class="btn btn-o" style="margin-top:8px" onclick="purgePending()"><i class="fa-solid fa-broom"></i> حذف ${P.old} حساب مضى عليه أكثر من 24 ساعة</button>`:''}</div>`:'';
}
async function purgePending(){
  const P=await loadPendingAccounts(true);
  if(!P.ok||!P.old){aToast('لا يوجد ما يُنظَّف','ok');return;}
  if(!confirm(`سيُحذف نهائياً ${P.old} حساب سُجّل منذ أكثر من 24 ساعة ولم يُفعَّل (لا يستطيع أصحابها الدخول أصلاً، ويمكنهم التسجيل من جديد). الحسابات التي لديها طلبات لا تُمَسّ. متابعة؟`))return;
  let deleted=0,except=[];
  for(let i=0;i<60;i++){
    const r=await adminWk('/admin/unverified',{action:'purge',hours:24,except});
    if(!r.ok){aToast('توقّف التنظيف بعد حذف '+deleted+': '+String((r.data&&(r.data.detail||r.data.error))||wkWhy(r)),'err');break;}
    deleted+=Number(r.data.deleted)||0;except=except.concat(r.data.keptUids||[]).slice(0,300);
    if(!r.data.remaining)break;
  }
  _pend=null;aToast(`تم حذف ${deleted} حساب غير مفعّل`,'ok');loadUsers();
}
function wkWhy(r){return r.status===0?'تعذّر الاتصال بالخادم':r.status===404?'الـ Worker القديم لا يعرف هذه الميزة — الصق النسخة الجديدة (worker/worker.js) في Cloudflare':r.status===403?'ليست لديك صلاحية (سجّل الدخول بحساب Google للمالك)':r.status===429?'طلبات كثيرة، انتظر قليلاً':String((r.data&&r.data.error)||('خطأ '+r.status)).slice(0,120);}

async function openUserModal(uid){
  document.getElementById('userModal').classList.remove('hidden');
  const box=document.getElementById('userModalContent');box.innerHTML=loading();
  try{
    /* the orders are read with ONE condition and sorted here: asking Firestore to filter AND sort needs a composite index that was never created */
    const[uDoc,bDoc]=await Promise.all([db.collection('users').doc(uid).get(),db.collection('banned_users').doc(uid).get()]);
    let orders=[],ordersErr='';
    try{orders=(await db.collection('orders').where('userId','==',uid).limit(200).get()).docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>tsMs(b.ts)-tsMs(a.ts)).slice(0,5);}
    catch(e){ordersErr=errCode(e);}
    if(!uDoc.exists){box.innerHTML=errState('هذا الحساب غير موجود في قاعدة البيانات')+`<div style="text-align:center;margin-top:10px"><span dir="ltr" style="font-size:11px;color:var(--mid)">${esc(uid)}</span></div>`;return;}
    const u=uDoc.data()||{},b=bDoc.exists?bDoc.data():null,banned=isBannedNow(b),owner=u.email===ADMIN_EMAIL;
    const cell=(k,v,c)=>`<div style="background:rgba(124,156,255,.05);border:1px solid var(--brd);border-radius:8px;padding:10px"><span style="color:var(--mid);display:block;font-size:10px">${k}</span><strong style="color:${c}">${v}</strong></div>`;
    box.innerHTML=`<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px"><div style="width:48px;height:48px;border-radius:50%;background:#1A2030;color:${banned?'var(--red)':'var(--cyan)'};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0"><i class="fa-solid ${banned?'fa-user-slash':'fa-user'}"></i></div><div style="min-width:0"><div style="font-size:15px;font-weight:800">${san(u.name||'مستخدم')}</div><div style="font-size:11px;color:var(--mid);word-break:break-all">${san(u.email||'')}</div><div style="font-size:10px;color:var(--dim)" dir="ltr">UID: ${esc(uid.slice(0,12))}…</div></div></div>`
      +(banned?`<div class="adm-card" style="border-color:var(--red);margin-bottom:12px"><i class="fa-solid fa-ban" style="color:var(--red)"></i> محظور — ${esc(banLeft(b))} · السبب: ${san((b&&b.reason)||'—')}</div>`:'')
      +`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;font-size:12px">${cell('النقاط',esc((u.points||0).toLocaleString()),'var(--gold)')}${cell('الطلبات',esc(u.orders||0),'var(--cyan)')}${cell('إجمالي الصرف',esc((u.totalSpend||0).toLocaleString())+' دج','var(--green)')}${cell('الإحالات',esc(u.referrals||0),'var(--violet)')}</div>`
      +`<div style="font-size:10px;font-weight:700;color:var(--mid);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px">آخر الطلبات</div>`
      +(ordersErr?`<p style="color:var(--red);font-size:11px">تعذّر تحميل الطلبات (${esc(ordersErr)})</p>`:orders.length?orders.map(o=>`<div style="background:rgba(124,156,255,.04);border-radius:8px;padding:8px 10px;margin-bottom:5px;font-size:11px"><span style="font-weight:700">${san(o.product||'')}</span> · ${esc((o.totalDZD||0).toLocaleString())} دج · <span class="badge badge-${esc(o.status==='done'?'done':o.status==='pending'?'pend':'rej')}">${esc(o.status)}</span></div>`).join(''):'<p style="color:var(--dim);font-size:11px">لا توجد طلبات</p>')
      +`<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button onclick="addPointsToUser('${jsq(uid)}','${jsq(u.name||'مستخدم')}')" class="btn btn-c btn-sm"><i class="fa-solid fa-plus"></i> إضافة نقاط</button><button onclick="sendNotifToUser('${jsq(uid)}','${jsq(u.name||u.email||'')}')" class="btn btn-p btn-sm"><i class="fa-solid fa-bell"></i> إرسال إشعار</button>${owner?'':banned?`<button onclick="unbanUser('${jsq(uid)}',true)" class="btn btn-g btn-sm"><i class="fa-solid fa-unlock"></i> فك الحظر</button>`:`<button onclick="openBanDialog('${jsq(uid)}','${jsq(u.name||u.email||'')}')" class="btn btn-r btn-sm"><i class="fa-solid fa-ban"></i> حظر</button>`}${owner?'':`<button onclick="openDeleteUser('${jsq(uid)}')" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i> حذف الحساب</button>`}<button onclick="copyText('${jsq(uid)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-copy"></i> نسخ UID</button></div>`;
  }catch(e){box.innerHTML=errState('تعذّر تحميل التفاصيل: '+errCode(e));}
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

/* ── notifications: in the site (the bell) AND by e-mail ── */
const NOTIF_CHUNK=15;
async function notifyUsers(uids,{title,body,mail,onProgress}){
  const FV=firebase.firestore.FieldValue;
  const notif={title,code:body,date:new Date().toLocaleDateString('ar'),read:false};
  const r={inSite:0,siteFail:0,siteErr:'',sent:0,failed:0,noEmail:0,limited:0,left:null,mailErr:''};
  for(let i=0;i<uids.length;i+=400){
    const part=uids.slice(i,i+400),b=db.batch();
    part.forEach(u=>b.update(db.collection('users').doc(u),{notifications:FV.arrayUnion(notif)}));
    try{await b.commit();r.inSite+=part.length;}catch(e){r.siteFail+=part.length;r.siteErr=errCode(e);}
  }
  if(mail){
    for(let i=0;i<uids.length;i+=NOTIF_CHUNK){
      if(onProgress)onProgress(Math.min(i+NOTIF_CHUNK,uids.length),uids.length);
      const x=await adminWk('/admin/notify-email',{uids:uids.slice(i,i+NOTIF_CHUNK),title,text:body});
      if(!x.ok){r.mailErr=wkWhy(x);r.failed+=uids.length-i;break;}
      const d=x.data;r.sent+=d.sent||0;r.failed+=d.failed||0;r.noEmail+=d.noEmail||0;r.limited+=d.limited||0;r.left=d.left;
      if(d.limited>0){r.limited+=Math.max(0,uids.length-(i+NOTIF_CHUNK));break;}   /* today's mail allowance is used up: stop instead of asking again */
    }
  }
  return r;
}
function notifySummary(r,mail){
  let t=`داخل الموقع: ${r.inSite}`+(r.siteFail?` (فشل ${r.siteFail}${r.siteErr?' — '+r.siteErr:''})`:'');
  if(mail)t+=` · إيميل: ${r.sent}`+(r.noEmail?` · بلا إيميل ${r.noEmail}`:'')+(r.failed?` · فشل ${r.failed}`:'')+(r.limited?` · لم يُرسل ${r.limited} (بلغت حدّ إيميلات اليوم)`:'')+(r.mailErr?` — ${r.mailErr}`:'');
  return t;
}
let notifTargets=[];
function sendNotifToUser(uid,label){openNotif([uid],label||'مستخدم',{});}
function openNotif(uids,label,pre){
  notifTargets=uids;pre=pre||{};
  actOpen('<i class="fa-solid fa-bell" style="color:var(--violet)"></i> إرسال إشعار',
    `<p style="font-size:12px;color:var(--mid);margin-bottom:12px">إلى: <strong style="color:var(--text)">${san(label||'')}</strong></p>
    <label class="form-label">عنوان الإشعار</label><input type="text" id="ntTitle" class="adm-inp" maxlength="120" value="${esc(pre.title||'')}" placeholder="مثال: عرض خاص لك">
    <label class="form-label">نص الإشعار</label><textarea id="ntBody" class="adm-ta" maxlength="800" placeholder="التفاصيل...">${esc(pre.body||'')}</textarea>
    <label class="ln-chk" style="display:flex;gap:8px;align-items:center;margin:10px 0;font-size:13px"><input type="checkbox" id="ntMail" checked> أرسله أيضاً إلى إيميل العميل (بقالب المتجر)</label>
    <p class="pf-hint" style="margin-bottom:12px">يصل دائماً داخل الموقع (أيقونة الجرس). الإيميل نسخة إضافية؛ حدّ الإيميلات اليومية للإشعارات 150 وهو مشترك بين كل الإشعارات.</p>
    <button id="ntBtn" onclick="doNotif()" class="btn btn-p" style="width:100%;justify-content:center"><i class="fa-solid fa-paper-plane"></i> إرسال</button>`);
}
async function doNotif(){
  const title=document.getElementById('ntTitle').value.trim(),body=document.getElementById('ntBody').value.trim(),mail=document.getElementById('ntMail').checked;
  if(!title){aToast('أدخل عنوان الإشعار','err');return;}
  const btn=document.getElementById('ntBtn');btn.disabled=true;
  const r=await notifyUsers(notifTargets,{title,body,mail,onProgress:(a,n)=>{btn.innerHTML=`جاري الإرسال ${a}/${n}…`;}});
  actClose();
  aToast(notifySummary(r,mail),(r.siteFail||r.failed||r.mailErr||r.limited)?'warn':'ok',7000);
}

/* ── suspension ── */
function openBanDialog(uid,label){
  actOpen('<i class="fa-solid fa-ban" style="color:var(--red)"></i> حظر مستخدم',
    `<p style="font-size:12px;color:var(--mid);margin-bottom:12px"><strong style="color:var(--text)">${san(label||'')}</strong> · <span dir="ltr">${esc(String(uid).slice(0,12))}…</span></p>
    <label class="form-label">مدة الحظر</label><select id="bdDur" class="adm-sel">${banDurOptions('7d')}</select>
    <label class="form-label">السبب (للسجل فقط — لا يراه العميل)</label><input type="text" id="bdReason" class="adm-inp" maxlength="200" placeholder="مثال: تلاعب بالنقاط">
    <p class="pf-hint" style="margin-bottom:12px">أثناء الحظر لا يستطيع الدخول ولا الطلب. عند انتهاء المدة يعود حسابه تلقائياً، وتستطيع فك الحظر قبلها بزر «فك الحظر».</p>
    <button onclick="applyBan('${jsq(uid)}')" class="btn btn-r" style="width:100%;justify-content:center"><i class="fa-solid fa-ban"></i> تأكيد الحظر</button>`);
}
async function applyBan(uid){
  const key=document.getElementById('bdDur').value,reason=(document.getElementById('bdReason').value.trim()||'تلاعب').slice(0,200);
  if(await writeBan(uid,reason,key)){actClose();closeUserModal();refreshBanViews();}
}
async function writeBan(uid,reason,key){
  if(auth.currentUser&&uid===auth.currentUser.uid){aToast('لا يمكنك حظر حسابك أنت','err');return false;}
  if(allUsers.some(u=>u.uid===uid&&u.email===ADMIN_EMAIL)){aToast('لا يمكن حظر حساب المالك','err');return false;}
  try{await db.collection('banned_users').doc(uid).set({reason,date:new Date().toLocaleDateString('ar'),until:banUntil(key),by:'admin'});aToast(`تم الحظر — ${(BAN_DURS.find(d=>d[0]===key)||[])[1]||''}`,'ok');return true;}
  catch(e){aToast('تعذّر الحظر: '+errCode(e),'err');return false;}
}
function refreshBanViews(){loadBannedMap().then(()=>{renderUsers();if(!document.getElementById('tab-abuse')?.classList.contains('hidden')&&document.getElementById('bannedList'))loadBanned();});}

/* ── delete an account (sign-in + profile; the orders stay) ── */
async function openDeleteUser(uid){
  let u=allUsers.find(x=>x.uid===uid);
  if(!u){try{const d=await db.collection('users').doc(uid).get();u=d.exists?{uid,...d.data()}:{uid};}catch(e){u={uid};}}
  const needle=u.email||uid;
  actOpen('<i class="fa-solid fa-trash" style="color:var(--red)"></i> حذف حساب',
    `<div id="duBox"><p style="font-size:13px;line-height:1.9;margin-bottom:10px">سيُحذف حساب <strong style="color:var(--text)" dir="ltr">${esc(needle)}</strong> <b>نهائياً</b>: تسجيل الدخول (Firebase) والنقاط والإشعارات وبيانات الملف.<br>الطلبات السابقة تبقى للمحاسبة. يستطيع الشخص التسجيل من جديد بنفس الإيميل.</p>
    <label class="form-label">للتأكيد اكتب: ${esc(needle)}</label><input type="text" id="duConfirm" class="adm-inp" dir="ltr" autocomplete="off" placeholder="${esc(needle)}">
    <button onclick="deleteUserNow('${jsq(uid)}','${jsq(needle)}',false)" class="btn btn-r" style="width:100%;justify-content:center"><i class="fa-solid fa-trash"></i> احذف الحساب نهائياً</button></div>`);
}
async function deleteUserNow(uid,needle,dataOnly){
  const typed=(document.getElementById('duConfirm')?.value||'').trim();
  if(typed.toLowerCase()!==String(needle).toLowerCase()){aToast('نص التأكيد لا يطابق','err');return;}
  const box=document.getElementById('duBox');if(box)box.style.opacity='.5';
  const r=await adminWk('/admin/delete-user',{uid,confirm:typed,dataOnly:!!dataOnly});
  if(box)box.style.opacity='1';
  if(r.ok){
    actClose();closeUserModal();allUsers=allUsers.filter(u=>u.uid!==uid);delete bannedMap[uid];renderUsers();
    if(document.getElementById('dupBox')?.children.length)findDuplicates();
    aToast(r.data.authDeleted?'تم حذف الحساب وتسجيل دخوله':'تم حذف بيانات الحساب وحظر دخوله (تسجيل الدخول لم يُحذف)','ok',6000);return;
  }
  if(r.status===502&&r.data&&r.data.error==='auth_delete_failed'){
    const why=esc(String(r.data.detail||'').slice(0,60));
    document.getElementById('duBox').insertAdjacentHTML('beforeend',`<div class="adm-card" style="border-color:var(--gold);margin-top:14px;font-size:12.5px;line-height:1.9"><b>لم يُحذف شيء.</b> Google رفض حذف تسجيل الدخول (<span dir="ltr">${why}</span>) — غالباً حساب الخدمة في Worker ينقصه صلاحية «Firebase Authentication Admin».<br>1) احذفه يدوياً: Firebase Console ← Authentication ← Users ← ⋮ ← Delete، ثم أعد المحاولة هنا.<br>2) أو اضغط الزر التالي: تُحذف بياناته ويُمنع دخوله بحظر دائم (يبقى سجل الدخول).<button onclick="deleteUserNow('${jsq(uid)}','${jsq(needle)}',true)" class="btn btn-o btn-sm" style="margin-top:8px"><i class="fa-solid fa-user-slash"></i> احذف البيانات وامنع الدخول</button></div>`);
    return;
  }
  aToast('تعذّر الحذف: '+wkWhy(r),'err',7000);
}

/* ── find accounts that share one inbox (a.b@gmail.com = ab@gmail.com = ab+x@gmail.com) ── */
async function findDuplicates(){
  const box=document.getElementById('dupBox');if(!box)return;box.innerHTML=loading();
  try{
    const snap=await db.collection('users').limit(1000).get();
    const groups={};snap.docs.forEach(d=>{const u={uid:d.id,...d.data()};const k=canonEmail(u.email);if(k)(groups[k]=groups[k]||[]).push(u);});
    const dups=Object.entries(groups).filter(([,a])=>a.length>1);
    if(!dups.length){box.innerHTML=`<div class="adm-card" style="border-color:var(--green)"><i class="fa-solid fa-circle-check" style="color:var(--green)"></i> لا توجد حسابات مكررة بين ${esc(snap.size.toLocaleString('en-US'))} حساب.</div>`;return;}
    box.innerHTML='';
    dups.forEach(([k,arr])=>{
      arr.sort((a,b)=>(Number(b.orders)||0)-(Number(a.orders)||0)||(Number(b.points)||0)-(Number(a.points)||0));
      const card=document.createElement('div');card.className='adm-card';
      card.innerHTML=`<div class="adm-card-title" dir="ltr" style="margin-bottom:8px"><i class="fa-solid fa-clone" style="color:var(--gold)"></i> ${esc(k)} <span class="badge badge-warn">${esc(arr.length)} حسابات</span></div>`
        +arr.map((u,i)=>`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--brd);font-size:12px"><div style="flex:1;min-width:150px"><b>${san(u.name||'—')}</b>${i===0?' <span class="badge badge-done">الأنشط — يُنصح بإبقائه</span>':''}<div style="color:var(--mid)" dir="ltr">${san(u.email||'')}</div><div style="color:var(--dim)">${esc(u.orders||0)} طلب · ${esc((u.points||0).toLocaleString())} نقطة</div></div><button onclick="openUserModal('${jsq(u.uid)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-eye"></i></button>${u.email===ADMIN_EMAIL?'':`<button onclick="openDeleteUser('${jsq(u.uid)}')" class="btn btn-r btn-sm"><i class="fa-solid fa-trash"></i> حذف</button>`}</div>`).join('');
      box.appendChild(card);
    });
  }catch(e){box.innerHTML=errState('تعذّر الفحص: '+errCode(e));}
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
    window.nlCount=snap.size;document.getElementById('nlStats').innerHTML=`<span class="badge badge-info">${esc(snap.size)} مشترك</span>`;
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
  if(!userId||userId==='guest'){aToast('صاحب البلاغ زائر بلا حساب — لا يمكن مراسلته من هنا','warn');return;}
  openNotif([userId],'صاحب البلاغ',{title:'رد على بلاغك'});
}

/* ══ ABUSE ══ */
async function loadAbuse(){
  const el=document.getElementById('abuseList');el.innerHTML=loading();
  /* the banned list and the ban form do not depend on there being abuse flags (the old code returned early when there were none, so manual bans never showed up and could not be lifted) */
  const bd=document.getElementById('banDur');if(bd&&!bd.options.length)bd.innerHTML=banDurOptions('perm');
  loadBanned();
  try{
    const snap=await db.collection('abuse_flags').orderBy('date','desc').limit(30).get();
    el.innerHTML='';
    if(snap.empty){el.innerHTML=empty('لا توجد حالات مشبوهة');return;}
    snap.forEach(d=>{const a=d.data();const div=document.createElement('div');div.className='abuse-item';div.innerHTML=`<div class="abuse-header"><i class="fa-solid fa-triangle-exclamation" style="color:var(--red)"></i><span style="font-size:13px;font-weight:700">حسابات متعددة من نفس الجهاز</span><span class="abuse-high">عالي</span></div><div style="font-size:11px;color:var(--mid);margin-bottom:10px"><span><i class="fa-solid fa-key"></i> ${esc(a.userId?.slice(0,16))}…</span> · <span><i class="fa-solid fa-fingerprint"></i> ${san(a.fingerprint||'')}</span> · <span><i class="fa-regular fa-calendar"></i> ${esc(a.date?.split('T')[0]||'')}</span></div><div style="font-size:11px;color:var(--dim);margin-bottom:10px">مشبوهة: ${esc((a.suspectedAlts||[]).slice(0,3).join(', '))}</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button onclick="openBanDialog('${jsq(a.userId)}','حساب مشبوه')" class="btn btn-r btn-sm"><i class="fa-solid fa-ban"></i> حظر</button><button onclick="dismissAbuse('${jsq(d.id)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-check"></i> تجاهل</button></div>`;el.appendChild(div);});
  }catch(e){el.innerHTML=errState('خطأ: '+errCode(e));}
}

async function loadBanned(){
  const el=document.getElementById('bannedList');el.innerHTML=loading();
  try{
    const snap=await db.collection('banned_users').get();
    if(snap.empty){el.innerHTML='<p style="font-size:12px;color:var(--dim);padding:8px">لا يوجد محظورون</p>';return;}
    const rows=await Promise.all(snap.docs.map(async d=>{let u=allUsers.find(x=>x.uid===d.id);if(!u){try{const x=await db.collection('users').doc(d.id).get();u=x.exists?x.data():null;}catch(e){}}return{id:d.id,b:d.data(),u:u||null};}));
    el.innerHTML='';
    rows.sort((x,y)=>(isBannedNow(y.b)?1:0)-(isBannedNow(x.b)?1:0));
    rows.forEach(({id,b,u})=>{
      const on=isBannedNow(b),div=document.createElement('div');div.className='adm-card';
      div.innerHTML=`<div class="adm-card-top"><div class="adm-card-ico" style="background:rgba(255,77,94,.1);color:${on?'var(--red)':'var(--dim)'}"><i class="fa-solid fa-ban"></i></div><div class="adm-card-info"><div class="adm-card-title">${san((u&&(u.name||u.email))||id.slice(0,20)+'…')} <span class="badge ${on?'badge-rej':'badge-info'}">${esc(banLeft(b))}</span></div><div class="adm-card-sub">${u&&u.email?san(u.email)+' · ':''}السبب: ${san(b.reason||'—')} · ${esc(b.date||'')}</div></div></div><div class="adm-card-actions"><button onclick="unbanUser('${jsq(id)}')" class="btn btn-g btn-sm"><i class="fa-solid fa-unlock"></i> ${on?'فك الحظر':'إزالة من القائمة'}</button><button onclick="copyText('${jsq(id)}')" class="btn btn-o btn-sm"><i class="fa-solid fa-copy"></i> UID</button></div>`;
      el.appendChild(div);
    });
  }catch(e){el.innerHTML=errState('تعذّر تحميل المحظورين: '+errCode(e));}
}

/* ban from the UID box (abuse tab). A ban from a user card or the abuse list goes through openBanDialog(). */
async function banUser(uid,reason){
  const u=(uid||document.getElementById('banUid').value).trim();const r=(reason||document.getElementById('banReason').value.trim()||'تلاعب').slice(0,200);
  const key=document.getElementById('banDur')?.value||'perm';
  if(!u){aToast('أدخل UID','err');return;}
  if(!confirm(`حظر ${u.slice(0,16)}… — ${(BAN_DURS.find(d=>d[0]===key)||[])[1]||''}؟`))return;
  if(await writeBan(u,r,key)){document.getElementById('banUid').value='';document.getElementById('banReason').value='';loadAbuse();loadBannedMap().then(renderUsers);}
}
async function unbanUser(uid,fromUsers){
  const who=(allUsers.find(u=>u.uid===uid)||{}).email||uid.slice(0,16)+'…';
  if(!confirm(`فك الحظر عن ${who}؟ سيستطيع الدخول والطلب فوراً.`))return;
  try{await db.collection('banned_users').doc(uid).delete();aToast('تم فك الحظر','ok');closeUserModal();refreshBanViews();}catch(e){aToast('تعذّر فك الحظر: '+errCode(e),'err');}
}
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
  const orderId=document.getElementById('scOrderId').value.trim();const userId=document.getElementById('scUserId').value.trim();const product=document.getElementById('scProduct').value.trim();const rc=readCodes('sc');const codes=rc&&rc.codes,vals=rc&&rc.vals,note=rc?rc.note:'';const contact=document.getElementById('scContact').value.trim();
  if(!codes)return;
  const mp={codes,note,product};
  if(orderId)mp.orderId=orderId;else if(userId)mp.userId=userId;else if(contact.includes('@'))mp.to=contact;
  if(!mp.orderId&&!mp.userId&&!mp.to){aToast('أدخل رقم الطلب أو UID أو إيميل العميل','err');return;}
  try{
    const notif=(userId||orderId)?{title:`${product||'طلبك جاهز'}`,code:codesNotice(codes,note,vals),date:new Date().toLocaleDateString('ar'),until:codeUntil(),read:false}:null;
    if(orderId)await completeOrder(orderId,notif);
    else if(userId)await db.collection('users').doc(userId).update({notifications:firebase.firestore.FieldValue.arrayUnion(notif)});
    const m=await adminSendCode(mp);
    await adminNotify(`✅ إرسال كود يدوي\n🎮 ${product}\n🔑 ${codesTelegram(codes,vals)}\n📧 ${contact}\n🆔 ${orderId||'—'}\n${m.ok?'✉️ أُرسل الإيميل إلى '+m.to:'⚠️ فشل الإيميل: '+m.error}`);
    if(!m.ok){aToast('تم تسجيل الكود لكن فشل الإيميل: '+m.error,'warn');return;}
    aToast('تم الإرسال إلى '+m.to,'ok');['scOrderId','scUserId','scProduct','scContact'].forEach(i=>document.getElementById(i).value='');codesInit('sc');
  }catch(e){aToast('خطأ: '+e.message,'err');}
}

/* ══ BROADCAST ══ */
async function sendBroadcast(){
  const title=document.getElementById('bcTitle').value.trim();const body=document.getElementById('bcBody').value.trim();const target=document.getElementById('bcTarget').value;
  const mail=!!document.getElementById('bcMail')?.checked;
  if(!title||!body){aToast('أدخل العنوان والنص','err');return;}
  const targetName=target==='all'?'جميع المستخدمين':target==='active'?'النشطين':'غير النشطين';
  const btn=document.getElementById('bcBtn'),st=document.getElementById('bcStatus');
  try{
    let snap;if(target==='active')snap=await db.collection('users').where('orders','>',0).get();else if(target==='inactive')snap=await db.collection('users').where('orders','==',0).get();else snap=await db.collection('users').get();
    const uids=snap.docs.map(d=>d.id);
    if(!uids.length){aToast('لا يوجد مستخدمون في هذه الفئة','warn');return;}
    if(!confirm(`إرسال إشعار لـ "${targetName}" (${uids.length} مستخدم) داخل الموقع${mail?`، وإلى إيميلاتهم أيضاً (حدّ الإيميلات اليومية 150 — الزائد لا يُرسل بالإيميل)`:''}؟`))return;
    if(btn)btn.disabled=true;
    const r=await notifyUsers(uids,{title,body,mail,onProgress:(a,n)=>{if(st)st.textContent=`جاري إرسال الإيميلات ${a}/${n}…`;}});
    if(st)st.textContent=notifySummary(r,mail);
    aToast(notifySummary(r,mail),(r.siteFail||r.failed||r.mailErr||r.limited)?'warn':'ok',8000);
    if(!r.siteFail){document.getElementById('bcTitle').value='';document.getElementById('bcBody').value='';}
  }catch(e){aToast('خطأ: '+errCode(e),'err');}
  finally{if(btn)btn.disabled=false;}
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
  try{const d=await db.collection('settings').doc('maintenance').get();if(d.exists)document.getElementById('maintenanceMode').checked=d.data().active||false;document.getElementById('pointsOffMode').checked=d.data().pointsOff===true;const t=await db.collection('settings').doc('ticker').get();if(t.exists)document.getElementById('tickerTxt').value=t.data().text||'';}catch(e){}
}
async function togglePointsOff(){
  const el=document.getElementById('pointsOffMode'),on=el.checked;
  if(on&&!confirm('إيقاف نظام النقاط؟ لن تُمنح نقاط ولن يستبدل أحد مكافأة حتى تعيد تشغيله، والطلبات التي تُسلَّم أثناء الإيقاف لا تأخذ نقاطاً بأثر رجعي.')){el.checked=false;return;}
  try{await db.collection('settings').doc('maintenance').set({pointsOff:on},{merge:true});aToast(on?'تم إيقاف نظام النقاط':'تم تشغيل نظام النقاط','ok');}
  catch(e){el.checked=!on;aToast('تعذّر الحفظ: '+errCode(e),'err');}
}
async function toggleMaintenance(){const on=document.getElementById('maintenanceMode').checked;try{await db.collection('settings').doc('maintenance').set({active:on},{merge:true});aToast(on?'وضع الصيانة مفعّل':'الموقع متاح','ok');}catch(e){aToast('خطأ','err');}}
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
