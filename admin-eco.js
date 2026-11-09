/* Glitch Q — owner's panel: profit & points ("الأرباح والنقاط") and the price-list import.
   Loaded after admin.js (shares its globals: db, allProds, esc, aToast …) and econ.js (GQEcon).
   Nothing here writes anything until the owner presses a button. */

/* ══ shared state ══ */
let ECON=null;                       /* normalised settings/economics (owner-only document) */
let ecoOrders=[];                    /* profit ledger rows (order_econ) */
const ECO_RATES=(typeof PF_RATES!=='undefined')?PF_RATES:{EUR:220,USD:200,SAR:55,AED:56};
const dzd=n=>Math.round(Number(n)||0).toLocaleString('en-US');

async function ensureEcon(force){
  if(ECON&&!force)return ECON;
  try{const d=await db.collection('settings').doc('economics').get();ECON=GQEcon.normEcon(d.exists?d.data():null);}
  catch(e){ECON=GQEcon.normEcon(null);ECON._failed=true;}
  return ECON;
}
async function ensureProds(){
  if(allProds&&allProds.length)return allProds;
  try{const d=await db.collection('settings').doc('products').get();allProds=d.exists?d.data().products||[]:[];}catch(e){}
  return allProds;
}

/* ══ PRICE LIST FROM THE POSTER (PlayStation Store cards, France) ══
   The poster shows 12 cards but only 7 different values (two card designs repeat the same prices). */
const PRICE_LIST=[{val:5,dzd:1600},{val:15,dzd:4500},{val:20,dzd:6200},{val:25,dzd:7800},{val:40,dzd:11900},{val:50,dzd:14900},{val:60,dzd:17500}];
const PRICE_REGION='France 🇫🇷';
function impMatch(val){return (allProds||[]).find(p=>p&&p.cur==='EUR'&&Number(p.val)===val&&/france|فرنسا|🇫🇷/i.test(String(p.sub||'')));}
function impId(val){let id=slugId(['ps',val,'eur','france'].join('-')),n=2,u=id;while((allProds||[]).some(p=>p.id===u))u=id+'-'+(n++);return u;}
async function loadImport(){
  await ensureProds();
  try{if(!allCats.length)allCats=(await readCats()).cats.slice().sort((a,b)=>(a.order||0)-(b.order||0));}catch(e){}
  const sel=document.getElementById('impCat');if(!sel)return;
  const keep=sel.value,ib=document.getElementById('impBtn');
  sel.innerHTML=allCats.length?allCats.map(c=>`<option value="${esc(c.id)}">${esc(c.name||c.id)}</option>`).join(''):'<option value="">لا توجد أقسام — أضف قسماً أولاً</option>';
  sel.value=keep&&allCats.some(c=>c.id===keep)?keep:(allCats.find(c=>c.id==='psstore')||allCats[0]||{}).id||'';
  if(ib)ib.disabled=!allCats.length;
  const rows=document.getElementById('impRows');if(!rows)return;
  rows.innerHTML=PRICE_LIST.map(it=>{
    const m=impMatch(it.val);
    let st,chk='checked',extra='';
    if(!m){st='<span class="badge badge-done">جديد</span>';}
    else if(Number(m.priceDZD)===it.dzd){st='<span class="badge badge-info">موجود بنفس السعر</span>';chk='disabled';}
    else{st=`<span class="badge badge-warn">موجود بسعر ${esc(dzd(m.priceDZD||0))} دج</span>`;chk='';extra=' <small style="color:var(--mid)">حدّد لتحديث السعر فقط</small>';}
    return `<label class="adm-card" style="display:flex;align-items:center;gap:12px;cursor:pointer"><input type="checkbox" class="imp-chk" data-val="${it.val}" ${chk}><b style="min-width:70px">${it.val}€</b><span style="flex:1">${esc(dzd(it.dzd))} دج ${extra}</span>${st}</label>`;
  }).join('');
}
async function importPriceList(){
  const btn=document.getElementById('impBtn'),msg=document.getElementById('impMsg');
  const picked=[...document.querySelectorAll('.imp-chk:checked')].map(c=>Number(c.dataset.val));
  if(!picked.length){aToast('لا يوجد ما يُستورد','warn');return;}
  const cat=document.getElementById('impCat').value;if(!cat){aToast('اختر القسم','err');return;}
  if(!RL.ok('import',3,60000)){aToast('انتظر قليلاً','warn');return;}
  btn.disabled=true;
  try{
    const d=await db.collection('settings').doc('products').get();const prods=d.exists?(d.data().products||[]):[];
    allProds=prods;let added=0,updated=0;
    picked.forEach(val=>{
      const it=PRICE_LIST.find(x=>x.val===val);if(!it)return;
      const m=impMatch(val);
      if(m){const i=prods.findIndex(p=>p.id===m.id);if(i>=0&&Number(prods[i].priceDZD)!==it.dzd){prods[i]={...prods[i],priceDZD:it.dzd};updated++;}}
      else{prods.push({id:impId(val),cat,name:'PS Store Card',sub:PRICE_REGION,val,cur:'EUR',sym:'€',img:'ps',badge:'',priceDZD:it.dzd,imgUrl:null,desc:'',descEn:'',stock:true,kind:'card'});allProds=prods;added++;}
    });
    if(!added&&!updated){aToast('لا تغيير','info');return;}
    await db.collection('settings').doc('products').set({products:prods});
    allProds=prods;renderProds();loadImport();
    msg.textContent=`أُضيف ${added} · حُدّث ${updated}`;aToast(`تم: أُضيف ${added} وحُدّث ${updated}`,'ok');
  }catch(e){aToast('خطأ: '+e.message,'err');}
  finally{btn.disabled=false;}
}

/* ══ ECONOMY TAB ══ */
let ecoCosts={},ecoRewards=[];
function ecoVal(id){return document.getElementById(id).value;}
function ecoRaw(){
  const costs={};document.querySelectorAll('.eco-cost').forEach(i=>{const v=Math.floor(Number(i.value));if(v>0)costs[i.dataset.id]=v;});
  const rewards=[...document.querySelectorAll('.eco-rw')].map(r=>({id:r.dataset.id,name:r.querySelector('.rw-n').value,nameEn:r.querySelector('.rw-e').value,priceDZD:r.querySelector('.rw-p').value,prodId:r.querySelector('.rw-l').value}));
  return {marginPct:ecoVal('ecMargin'),earnPct:ecoVal('ecEarn'),refPct:ecoVal('ecRef'),refMaxPts:ecoVal('ecRefMax'),refMinOrderDZD:ecoVal('ecRefMin'),ptDZD:ecoVal('ecPt'),costs,rewards};
}
function ecoFill(e){
  document.getElementById('ecEarn').value=e.earnPct;document.getElementById('ecRef').value=e.refPct;document.getElementById('ecRefMax').value=e.refMaxPts;
  document.getElementById('ecRefMin').value=e.refMinOrderDZD;document.getElementById('ecMargin').value=e.marginPct;document.getElementById('ecPt').value=e.ptDZD;
}
function prodLabel(p){return `${p.name||p.id} ${p.cur==='month'?p.val+' شهر':p.cur==='copy'?'':(p.val||'')+(p.sym||'')} ${p.sub?'· '+p.sub:''}`.trim();}
function ecoRenderCosts(){
  const e=GQEcon.normEcon(ecoRaw()),box=document.getElementById('ecoCosts');if(!box)return;
  const rows=GQEcon.simulate(allProds,e,ECO_RATES);
  if(!rows.length){box.innerHTML='<div class="empty-state"><p>لا توجد منتجات بعد.</p></div>';return;}
  box.innerHTML='<div class="eco-row eco-h"><span>المنتج</span><span>سعر البيع</span><span>تكلفتك</span><span>ربحك</span><span>الهامش</span><span>نقاط المشتري</span><span>نقاط الداعي</span></div>'+rows.map(r=>{
    const p=allProds.find(x=>x.id===r.id)||{};
    const bad=r.profit<=0;
    return `<div class="eco-row${bad?' bad':''}"><span class="eco-n">${esc(prodLabel(p))}</span><span>${dzd(r.price)}</span><span><input type="number" class="adm-inp eco-cost" data-id="${esc(r.id)}" min="0" placeholder="~${dzd(r.cost)}" value="${e.costs[r.id]||''}" oninput="ecoDirty()"></span><span class="${bad?'neg':'pos'}">${dzd(r.profit)}${r.known?'':' ~'}</span><span>${r.marginPct}%</span><span>${r.pts}</span><span>${r.refPts}</span></div>`;
  }).join('');
}
function ecoRewardRow(r){
  const opts='<option value="">— بلا ربط —</option>'+(allProds||[]).map(p=>`<option value="${esc(p.id)}"${p.id===r.prodId?' selected':''}>${esc(prodLabel(p))}</option>`).join('');
  return `<div class="adm-card eco-rw" data-id="${esc(r.id)}"><div class="form-row"><div style="flex:2"><label class="form-label">الاسم (عربي)</label><input class="adm-inp rw-n" value="${esc(r.name)}" oninput="ecoDirty()"></div><div style="flex:2"><label class="form-label">الاسم (إنجليزي)</label><input class="adm-inp rw-e" value="${esc(r.nameEn)}" oninput="ecoDirty()"></div></div><div class="form-row"><div style="flex:1"><label class="form-label">سعر المكافأة للعميل (دج)</label><input type="number" class="adm-inp rw-p" min="1" value="${esc(r.priceDZD)}" oninput="ecoDirty()"></div><div style="flex:2"><label class="form-label">منتج مرتبط (للتحقق من التكلفة)</label><select class="adm-sel rw-l" onchange="ecoDirty()">${opts}</select></div><div style="flex:1"><label class="form-label">تساوي</label><div class="rw-pts" style="padding:10px 0;font-weight:700"></div></div></div><button class="btn btn-r btn-sm" onclick="ecoDelReward(this)"><i class="fa-solid fa-trash"></i> حذف المكافأة</button></div>`;
}
function ecoRenderRewards(list){document.getElementById('ecoRewards').innerHTML=list.map(ecoRewardRow).join('');ecoRewardPts();}
function ecoRewardPts(){
  const pt=Math.max(1,Math.floor(Number(ecoVal('ecPt')))||10);
  document.querySelectorAll('.eco-rw').forEach(r=>{const v=Math.floor(Number(r.querySelector('.rw-p').value))||0;r.querySelector('.rw-pts').textContent=v>0?`${Math.ceil(v/pt).toLocaleString('en-US')} نقطة`:'—';});
}
function ecoAddReward(){
  const list=[...document.querySelectorAll('.eco-rw')].map(r=>({id:r.dataset.id,name:r.querySelector('.rw-n').value,nameEn:r.querySelector('.rw-e').value,priceDZD:r.querySelector('.rw-p').value,prodId:r.querySelector('.rw-l').value}));
  if(list.length>=12){aToast('الحد 12 مكافأة','warn');return;}
  let n=1;while(list.some(x=>x.id==='r'+n))n++;
  list.push({id:'r'+n,name:'مكافأة جديدة',nameEn:'New reward',priceDZD:1600,prodId:''});ecoRenderRewards(list);ecoDirty();
}
function ecoDelReward(btn){btn.closest('.eco-rw').remove();ecoDirty();}
function ecoDirty(){
  const e=GQEcon.normEcon(ecoRaw());
  ecoRewardPts();
  /* only the computed columns refresh while typing: the inputs keep focus */
  const rows=GQEcon.simulate(allProds,e,ECO_RATES),box=document.getElementById('ecoCosts');
  if(box){box.querySelectorAll('.eco-row:not(.eco-h)').forEach((row,i)=>{const r=rows[i];if(!r)return;const c=row.children;c[1].textContent=dzd(r.price);c[3].textContent=dzd(r.profit)+(r.known?'':' ~');c[3].className=r.profit<=0?'neg':'pos';c[4].textContent=r.marginPct+'%';c[5].textContent=r.pts;c[6].textContent=r.refPts;row.classList.toggle('bad',r.profit<=0);});}
  ecoRenderAudit(e);
  const m=document.getElementById('ecoMsg');if(m)m.textContent='تغييرات غير محفوظة';
}
function ecoRenderAudit(e){
  const list=GQEcon.audit(e,allProds,ECO_RATES);
  const ico={err:'fa-circle-xmark',warn:'fa-triangle-exclamation',info:'fa-circle-info'},col={err:'var(--red)',warn:'var(--gold)',info:'var(--mid)'};
  const box=document.getElementById('ecoAudit');
  const head=`<div class="adm-card" style="border-color:rgba(40,200,138,.4)"><i class="fa-solid fa-circle-check" style="color:var(--green)"></i> القاعدة المطبَّقة: المكافأة تُصرف بسعر بيعها لا بتكلفتها، والنقاط تُحسب من <b>الربح</b> فقط، فلا يمكن أن تخسر على عميل. تحتفظ بـ <b>${100-e.earnPct-e.refPct}%</b> على الأقل من ربح كل طلب قبل أي استبدال.</div>`;
  box.innerHTML=head+list.map(x=>`<div class="adm-card" style="border-color:${col[x.level]}"><i class="fa-solid ${ico[x.level]}" style="color:${col[x.level]}"></i> ${esc(x.msg)}</div>`).join('');
}

async function ecoProbeRules(){
  /* read-only, unauthenticated GET: 403 means the rules protect the document, 404/200 means anyone could read it */
  const base='https://firestore.googleapis.com/v1/projects/glitch-q/databases/(default)/documents/';
  const out=[];
  for(const [path,label] of [['settings/economics','وثيقة التكاليف والنقاط'],['users?pageSize=1&mask.fieldPaths=points','قائمة العملاء']]){
    try{const r=await fetch(base+path,{credentials:'omit'});out.push({label,open:r.status!==403&&r.status!==401,status:r.status});}
    catch(e){out.push({label,open:null,status:0});}
  }
  return out;
}

async function loadEconomy(){
  const [e]=await Promise.all([ensureEcon(true),ensureProds()]);
  ecoFill(e);ecoRenderCosts();ecoRenderRewards(e.rewards);ecoRenderAudit(e);
  document.getElementById('ecoMsg').textContent='';
  ecoLoadLedger();ecoLoadClaims();
  ecoProbeRules().then(res=>{
    const bad=res.filter(x=>x.open===true);
    if(!bad.length)return;
    const box=document.getElementById('ecoAudit');
    box.insertAdjacentHTML('afterbegin',`<div class="adm-card" style="border-color:var(--red)"><i class="fa-solid fa-lock-open" style="color:var(--red)"></i> <b>قواعد Firestore الحالية تسمح لأي زائر بالقراءة:</b> ${bad.map(x=>esc(x.label)).join('، ')}. لا تُدخل أسعار التكلفة قبل نشر الملف المقترح <code>security/firestore.rules</code> (الخطوات في SECURITY.md)، وإلا يستطيع أي شخص قراءتها.</div>`);
  });
}

async function ecoLoadLedger(){
  try{
    const snap=await db.collection('order_econ').orderBy('ts','desc').limit(500).get();
    ecoOrders=snap.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){ecoOrders=[];}
  const cut=Date.now()-30*864e5;
  const rows=ecoOrders.filter(r=>(r.ts&&r.ts.seconds?r.ts.seconds*1000:0)>=cut);
  const rev=rows.reduce((s,r)=>s+(Number(r.revenue)||0),0),prof=rows.reduce((s,r)=>s+(Number(r.profit)||0),0);
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('eco-profit30',rows.length?dzd(prof)+' دج':'—');
  set('eco-margin',rev>0?(Math.round(prof/rev*1000)/10)+'%':'—');
}
async function ecoLoadClaims(){
  const box=document.getElementById('ecoClaims');box.innerHTML=loading();
  try{
    const snap=await db.collection('reward_claims').where('status','==','pending').limit(50).get();
    const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    document.getElementById('eco-claims').textContent=rows.length;
    const b=document.getElementById('sbClaimBadge');if(b){b.textContent=rows.length;b.style.display=rows.length?'':'none';}
    box.innerHTML=rows.length?rows.map(c=>`<div class="adm-card"><div class="adm-card-title">${san(c.reward)} — ${esc(c.pts)} نقطة (≈ ${esc(dzd(c.worthDZD))} دج)</div><div class="adm-card-sub">${san(c.name)} · ${san(c.email)} · ${esc(String(c.date||'').slice(0,16).replace('T',' '))}</div><div class="adm-card-actions"><button class="btn btn-c btn-sm" onclick="ecoClaimDone('${esc(c.id)}')"><i class="fa-solid fa-check"></i> تم التسليم</button></div></div>`).join(''):'<div class="empty-state"><i class="fa-solid fa-gift"></i><p>لا توجد مكافآت معلّقة</p></div>';
  }catch(e){box.innerHTML=errState('تعذّر تحميل المكافآت');}
}
async function ecoClaimDone(id){
  if(!/^[A-Za-z0-9]{10,40}$/.test(id))return;
  try{await db.collection('reward_claims').doc(id).update({status:'done',doneAt:new Date().toISOString()});aToast('تم تسجيل التسليم','ok');ecoLoadClaims();}catch(e){aToast('خطأ: '+e.message,'err');}
}

async function ecoLiabilities(){
  const e=GQEcon.normEcon(ecoRaw());
  const m=document.getElementById('ecoMsg');m.textContent='جاري الحساب…';
  try{
    const snap=await db.collection('users').get();
    let pts=0,red=0,locked=0;
    snap.docs.forEach(d=>{const u=d.data(),p=Math.max(0,Math.floor(Number(u.points)||0)),r=GQEcon.redeemablePts(u,e);pts+=p;red+=r;locked+=p-r;});
    document.getElementById('eco-owed').textContent=`${red.toLocaleString('en-US')} نقطة`;
    m.textContent=`إجمالي النقاط ${pts.toLocaleString('en-US')} · قابلة للاستبدال ${red.toLocaleString('en-US')} (≈ ${dzd(red*e.ptDZD)} دج بسعر البيع) · مقفلة ${locked.toLocaleString('en-US')}`;
  }catch(err){m.textContent='تعذّر الحساب: '+err.message;}
}

async function ecoSave(){
  const e=GQEcon.normEcon(ecoRaw());
  const bad=GQEcon.audit(e,allProds,ECO_RATES).filter(x=>x.level==='err');
  if(bad.length){aToast('لا يمكن الحفظ: '+bad[0].msg,'err');return;}
  if(!e.rewards.length&&!confirm('لا توجد أي مكافأة. سيتوقف الاستبدال تماماً. متابعة؟'))return;
  if(!RL.ok('eco-save',6,60000)){aToast('انتظر قليلاً','warn');return;}
  const btn=document.getElementById('ecoSaveBtn');btn.disabled=true;
  try{
    await db.collection('settings').doc('economics').set(e);ECON=e;
    document.getElementById('ecoMsg').textContent='تم الحفظ';aToast('تم حفظ قواعد الأرباح والنقاط','ok');
    ecoFill(e);ecoRenderCosts();ecoRenderRewards(e.rewards);ecoRenderAudit(e);
  }catch(err){aToast('خطأ: '+err.message,'err');}
  finally{btn.disabled=false;}
}

/* ══ SMART INSIGHTS (dashboard) ══ everything is computed from data the dashboard has already loaded, plus two small owner-only reads */
async function renderInsights(orders,users){
  const box=document.getElementById('insights');if(!box)return;
  const e=await ensureEcon();await ensureProds();
  const items=[];
  const add=(level,icon,html,tab)=>items.push(`<button class="ins-it ${level}" ${tab?`onclick="switchTab('${tab}')"`:''}><i class="fa-solid ${icon}"></i><span>${html}</span></button>`);
  const now=Date.now(),secOf=o=>(o.ts&&o.ts.seconds)?o.ts.seconds*1000:0;
  const slow=orders.filter(o=>o.status==='pending'&&secOf(o)&&now-secOf(o)>30*60000);
  if(slow.length)add('err','fa-hourglass-half',`<b>${slow.length}</b> طلب ينتظر أكثر من 30 دقيقة — الزبون ينتظر الكود`,'orders');
  else add('ok','fa-circle-check','لا طلبات متأخرة: كل الطلبات المعلّقة أقل من 30 دقيقة','orders');
  /* sales of the last 30 days: best seller, and a best seller that is marked out of stock */
  const cut=now-30*864e5,sold={};
  orders.filter(o=>o.status==='done'&&secOf(o)>=cut).forEach(o=>(o.items||[]).forEach(it=>{sold[it.id]=(sold[it.id]||0)+(Number(it.qty)||1);}));
  const top=Object.entries(sold).sort((a,b)=>b[1]-a[1]);
  if(top.length){
    const p=(allProds||[]).find(x=>x.id===top[0][0]);
    if(p)add('ok','fa-fire',`الأكثر مبيعاً (30 يوماً): <b>${esc(prodLabel(p))}</b> — ${top[0][1]} قطعة`,'products');
    const oos=top.slice(0,5).map(([id,n])=>({p:(allProds||[]).find(x=>x.id===id),n})).filter(x=>x.p&&x.p.stock===false&&x.n>=2);
    if(oos.length)add('warn','fa-box-open',`منتج مطلوب لكنه موقوف: <b>${esc(prodLabel(oos[0].p))}</b> (${oos[0].n} طلبات) — أعده للبيع؟`,'products');
  }
  /* economics */
  const noCost=(allProds||[]).filter(p=>!e.costs[p.id]).length;
  if(noCost)add('warn','fa-tags',`<b>${noCost}</b> منتج بلا سعر تكلفة: أرباحك ونقاط الزبائن تقديرية بهامش ${e.marginPct}%`,'economy');
  else if((allProds||[]).length)add('ok','fa-tags','كل المنتجات لها سعر تكلفة: النقاط مبنية على أرباحك الفعلية','economy');
  const low=GQEcon.simulate(allProds,e,ECO_RATES).filter(r=>r.profit<=0);
  if(low.length)add('err','fa-arrow-trend-down',`<b>${low.length}</b> منتج يُباع بلا ربح أو بخسارة (مثل «${esc(low[0].name)}»)`,'economy');
  const red=users.reduce((s,u)=>s+GQEcon.redeemablePts(u,e),0),pts=users.reduce((s,u)=>s+Math.max(0,Math.floor(Number(u.points)||0)),0);
  add('ok','fa-coins',`نقاط الزبائن: <b>${pts.toLocaleString('en-US')}</b> — القابل للاستبدال فعلاً <b>${red.toLocaleString('en-US')}</b> (≈ ${dzd(red*e.ptDZD)} دج) والباقي مقفل حتى يشتروا`,'economy');
  box.innerHTML=items.join('');
  /* async extras: profit ledger, waiting rewards, database privacy */
  try{
    const snap=await db.collection('order_econ').orderBy('ts','desc').limit(500).get(),rows=snap.docs.map(d=>d.data()).filter(r=>secOf(r)>=cut);
    if(rows.length){const rev=rows.reduce((s,r)=>s+(Number(r.revenue)||0),0),pr=rows.reduce((s,r)=>s+(Number(r.profit)||0),0);
      box.insertAdjacentHTML('afterbegin',`<button class="ins-it ${pr>0?'ok':'err'}" onclick="switchTab('economy')"><i class="fa-solid fa-sack-dollar"></i><span>ربحك آخر 30 يوماً: <b>${dzd(pr)} دج</b> من ${dzd(rev)} دج (هامش ${rev>0?Math.round(pr/rev*1000)/10:0}%)</span></button>`);}
  }catch(_){}
  try{
    const c=await db.collection('reward_claims').where('status','==','pending').limit(50).get();
    const b=document.getElementById('sbClaimBadge');if(b){b.textContent=c.size;b.style.display=c.size?'':'none';}
    if(c.size)box.insertAdjacentHTML('afterbegin',`<button class="ins-it warn" onclick="switchTab('economy')"><i class="fa-solid fa-gift"></i><span><b>${c.size}</b> مكافأة استبدلها زبائن وتنتظر التسليم</span></button>`);
  }catch(_){}
  ecoProbeRules().then(res=>{const bad=res.filter(x=>x.open===true);if(bad.length)box.insertAdjacentHTML('afterbegin',`<button class="ins-it err" onclick="switchTab('economy')"><i class="fa-solid fa-lock-open"></i><span><b>قاعدة البيانات مفتوحة للقراءة العامة:</b> ${bad.map(x=>esc(x.label)).join('، ')} — انشر قواعد Firestore المقترحة (SECURITY.md)</span></button>`);});
}

/* hook into the tab router of admin.js without editing its switch: run after it */
(function(){
  const base=window.switchTab;
  if(typeof base!=='function')return;
  window.switchTab=function(name){
    base.apply(this,arguments);
    if(name==='economy')loadEconomy();
    if(name==='products')loadImport();
  };
  if(typeof TAB_TITLES==='object')TAB_TITLES.economy='الأرباح والنقاط';
})();

/* ══ LAUNCH RESET ("إطلاق جديد") ══
   One-time tool the OWNER runs from this panel: zero every account's points and counters and delete all orders, so the store
   starts clean. Nothing is written until: (1) a read-only scan has been shown, (2) a JSON backup has been downloaded,
   (3) the owner typed the confirmation phrase. Writes are chunked batches; a failure part-way is safe to re-run.
   Never touched: accounts/passwords, products, categories, prices, economics, coupons, newsletter, reviews, reports, settings. */
const LAUNCH_PHRASE='ابدأ من الصفر';
const LN_CHUNK=400;                                   /* Firestore allows 500 writes per batch */
let lnData=null,lnBacked=false,lnRunning=false;

/* the fields that make a customer "brand new" again (name, e-mail, nick, avatar, region, favourites, referredBy… stay) */
function launchUserFields(pts,clearNotifs){
  const f={points:pts,rewardPool:0,orders:0,totalSpend:0,redeemed:0,referrals:0,refRewarded:false,
    streak:0,lastLogin:null,spins:0,lastSpinAt:0,gifts:0,shares:0,claimedMilestones:[],badges:['newcomer']};
  if(clearNotifs)f.notifications=[];
  return f;
}
function launchReset(){                               /* called when the tab opens */
  lnData=null;lnBacked=false;
  const set=(id,h)=>{const el=document.getElementById(id);if(el)el.innerHTML=h;};
  set('lnScan','');set('lnBackupMsg','');set('lnProg','');
  const p=document.getElementById('lnPhrase');if(p)p.value='';
  const b=document.getElementById('lnBackupBtn');if(b)b.disabled=true;
  launchGate();
}
function launchGate(){
  const run=document.getElementById('lnRunBtn');if(!run)return;
  const typed=(document.getElementById('lnPhrase').value||'').trim()===LAUNCH_PHRASE;
  run.disabled=!(lnData&&lnBacked&&typed&&!lnRunning);
}
async function launchScan(){
  const box=document.getElementById('lnScan'),btn=document.getElementById('lnScanBtn');
  box.innerHTML=loading();btn.disabled=true;lnBacked=false;launchGate();
  document.getElementById('lnBackupMsg').textContent='';
  try{
    const read=async c=>(await db.collection(c).get()).docs.map(d=>({id:d.id,data:d.data()}));
    const [users,orders,econ,claims]=await Promise.all([read('users'),read('orders'),read('order_econ'),read('reward_claims')]);
    let log=null;try{const l=await db.collection('settings').doc('launchLog').get();log=l.exists?l.data():null;}catch(e){}
    lnData={users,orders,econ,claims,log,at:new Date().toISOString()};
    const pts=users.reduce((s,u)=>s+(Math.max(0,Math.floor(Number(u.data.points)||0))),0);
    const pool=users.reduce((s,u)=>s+(Number(u.data.rewardPool)||0),0);
    const withPts=users.filter(u=>(Number(u.data.points)||0)>0).length;
    const nots=users.reduce((s,u)=>s+((u.data.notifications||[]).length),0);
    const byStatus={};orders.forEach(o=>{const k=o.data.status||'—';byStatus[k]=(byStatus[k]||0)+1;});
    const cell=(n,l,c)=>`<div class="stat-card"><span class="stat-val"${c?` style="color:${c}"`:''}>${esc(Number(n).toLocaleString('en-US'))}</span><span class="stat-lbl">${esc(l)}</span></div>`;
    box.innerHTML=`<div class="ln-grid">
      ${cell(users.length,'حساب (لن يُحذف)')}${cell(withPts,'حساب لديه نقاط','var(--gold)')}${cell(pts,'مجموع النقاط → سيصبح 0','var(--gold)')}${cell(pool,'صندوق مكافآت (دج) → 0','var(--gold)')}
      ${cell(orders.length,'طلب → سيُحذف','var(--red)')}${cell(econ.length,'سجل أرباح → سيُحذف','var(--red)')}${cell(claims.length,'طلب مكافأة → سيُحذف','var(--red)')}${cell(nots,'إشعار عملاء (اختياري)')}
    </div>
    ${orders.length?`<p class="pf-hint" style="margin-top:10px">حالات الطلبات: ${Object.entries(byStatus).map(([k,v])=>`${esc(k)} ${esc(v)}`).join(' · ')}</p>`:''}
    ${orders.some(o=>o.data.status!=='done'&&o.data.status!=='cancelled'&&o.data.status!=='rejected')?`<div class="adm-card" style="border-color:var(--gold);margin-top:10px"><i class="fa-solid fa-triangle-exclamation" style="color:var(--gold)"></i> يوجد طلبات غير مكتملة (قيد الانتظار/المعالجة). إن كان بينها طلب <b>حقيقي</b> لم تسلّمه فسلّمه أولاً — الحذف نهائي.</div>`:''}
    ${log?`<div class="adm-card" style="border-color:var(--red);margin-top:10px"><i class="fa-solid fa-clock-rotate-left" style="color:var(--red)"></i> سبق تنفيذ الإطلاق الجديد في <b>${esc(String(log.at||'').slice(0,16).replace('T',' '))}</b>. التنفيذ مرة أخرى سيحذف كل ما جرى منذ ذلك الوقت.</div>`:''}`;
    document.getElementById('lnBackupBtn').disabled=false;
  }catch(e){
    lnData=null;box.innerHTML=errState('تعذّر الفحص: '+(e&&e.message||'خطأ')+' — تأكد أن قواعد Firestore منشورة وأنك مسجّل بحساب المالك.');
  }finally{btn.disabled=false;launchGate();}
}
function launchBackup(){
  if(!lnData){aToast('افحص أولاً','warn');return;}
  const dump=rows=>rows.map(r=>({id:r.id,...r.data}));
  const payload={app:'glitch-q',kind:'launch-reset-backup',exportedAt:new Date().toISOString(),
    note:'نسخة قبل «إطلاق جديد». تحوي أكواد مُسلَّمة وبيانات عملاء — احتفظ بها بأمان.',
    counts:{users:lnData.users.length,orders:lnData.orders.length,order_econ:lnData.econ.length,reward_claims:lnData.claims.length},
    users:dump(lnData.users),orders:dump(lnData.orders),order_econ:dump(lnData.econ),reward_claims:dump(lnData.claims)};
  const blob=new Blob([JSON.stringify(payload,null,1)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='glitchq-backup-'+new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')+'.json';
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
  lnBacked=true;
  document.getElementById('lnBackupMsg').innerHTML='<i class="fa-solid fa-circle-check" style="color:var(--green)"></i> تم تنزيل النسخة ('+Math.round(blob.size/1024).toLocaleString('en-US')+' KB) — تأكد أنها في جهازك';
  launchGate();
}
async function launchRun(){
  if(lnRunning||!lnData||!lnBacked)return;
  if((document.getElementById('lnPhrase').value||'').trim()!==LAUNCH_PHRASE){aToast('اكتب عبارة التأكيد كما هي','warn');return;}
  if(!RL.ok('launch-run',2,300000)){aToast('انتظر قليلاً','warn');return;}
  const keepPts=Math.max(0,Math.min(100,Math.floor(Number(document.getElementById('lnPts').value)||0)));
  const clearNotifs=document.getElementById('lnNotifs').checked,clearStats=document.getElementById('lnStats').checked;
  if(!confirm(`سيتم الآن: حذف ${lnData.orders.length} طلب وتصفير ${lnData.users.length} حساب. هذا نهائي. هل نسخت الملف الاحتياطي؟`))return;
  lnRunning=true;launchGate();
  const prog=document.getElementById('lnProg');
  const total=lnData.orders.length+lnData.econ.length+lnData.claims.length+lnData.users.length+(clearStats?1:0);
  let done=0;
  const draw=(msg,err)=>{prog.innerHTML=`<div class="ln-bar"><i style="width:${total?Math.round(done/total*100):100}%"></i></div><div class="pf-hint"${err?' style="color:var(--red)"':''}>${esc(msg)} (${done.toLocaleString('en-US')} / ${total.toLocaleString('en-US')})</div>`;};
  const chunked=async(label,rows,mk)=>{
    for(let i=0;i<rows.length;i+=LN_CHUNK){
      const b=db.batch();rows.slice(i,i+LN_CHUNK).forEach(r=>mk(b,r));
      await b.commit();done+=Math.min(LN_CHUNK,rows.length-i);draw(label);
    }
  };
  let step='';
  try{
    draw('بدء التنفيذ…');
    step='حذف الطلبات';          await chunked(step,lnData.orders,(b,r)=>b.delete(db.collection('orders').doc(r.id)));
    step='حذف سجلّ الأرباح';     await chunked(step,lnData.econ,(b,r)=>b.delete(db.collection('order_econ').doc(r.id)));
    step='حذف طلبات المكافآت';   await chunked(step,lnData.claims,(b,r)=>b.delete(db.collection('reward_claims').doc(r.id)));
    const f=launchUserFields(keepPts,clearNotifs);
    step='تصفير الحسابات';       await chunked(step,lnData.users,(b,r)=>b.update(db.collection('users').doc(r.id),f));
    if(clearStats){step='تصفير عدّاد الزوار';await db.collection('settings').doc('stats').set({visitors:0},{merge:true});done++;draw(step);}
    step='تسجيل العملية';
    const who=(typeof auth!=='undefined'&&auth.currentUser&&auth.currentUser.email)||'';
    await db.collection('settings').doc('launchLog').set({at:new Date().toISOString(),by:who,orders:lnData.orders.length,order_econ:lnData.econ.length,reward_claims:lnData.claims.length,users:lnData.users.length,pointsAfter:keepPts,clearedNotifications:clearNotifs});
    /* verify against the database, not against what we meant to write */
    const left=async c=>(await db.collection(c).get()).docs.length;
    const [o,e,c,us]=await Promise.all([left('orders'),left('order_econ'),left('reward_claims'),db.collection('users').get()]);
    const dirty=us.docs.filter(d=>{const u=d.data();return (Number(u.points)||0)!==keepPts||(Number(u.rewardPool)||0)!==0||(Number(u.orders)||0)!==0;}).length;
    const good=o===0&&e===0&&c===0&&dirty===0;
    prog.innerHTML=`<div class="adm-card" style="border-color:${good?'var(--green)':'var(--red)'}"><i class="fa-solid ${good?'fa-circle-check':'fa-triangle-exclamation'}" style="color:${good?'var(--green)':'var(--red)'}"></i> ${good
      ?`<b>تم الإطلاق الجديد.</b> الطلبات المتبقية: 0 · سجل الأرباح: 0 · طلبات المكافآت: 0 · حسابات فيها نقاط غير ${keepPts}: 0 (من ${us.docs.length.toLocaleString('en-US')} حساب).`
      :`<b>اكتمل التنفيذ لكن التحقق وجد بقايا:</b> طلبات ${o} · أرباح ${e} · مكافآت ${c} · حسابات غير مصفّرة ${dirty}. أعد الفحص ثم نفّذ مرة أخرى (آمن).`}</div>`;
    aToast(good?'تم الإطلاق الجديد':'بقيت عناصر — أعد التنفيذ',good?'ok':'warn');
    lnData=null;lnBacked=false;document.getElementById('lnBackupBtn').disabled=true;document.getElementById('lnScan').innerHTML='';
    document.getElementById('lnPhrase').value='';
  }catch(err){
    draw('توقف عند «'+step+'»: '+(err&&err.message||'خطأ')+' — ما نُفّذ قبلها تم، وإعادة الفحص ثم التنفيذ آمنة.',true);
    aToast('توقف التنفيذ: '+step,'err');
    lnData=null;lnBacked=false;document.getElementById('lnBackupBtn').disabled=true;   /* the lists are stale now: a retry starts from a fresh scan + backup */
  }finally{lnRunning=false;launchGate();}
}
window.launchScan=launchScan;window.launchBackup=launchBackup;window.launchRun=launchRun;window.launchGate=launchGate;window.launchReset=launchReset;

/* ══ NEWSLETTER COMPOSER ══
   The page only collects the text. Rendering (preview), the test mail and the real send all happen in the Worker, which checks
   that the caller is the owner. The real send unlocks only after a test mail for the SAME content went out to the owner. */
const NL_ERR={'Subject required':'اكتب عنواناً للرسالة (3 أحرف على الأقل)','Message is too short':'نص الرسالة قصير جداً','The button needs a label and an https link':'الزر يحتاج نصاً ورابطاً يبدأ بـ https://','Email sending limit reached':'وصلت حد الإرسال في Brevo (غالباً 300 يومياً). اضغط الإرسال غداً لإكمال الباقي.','Email not configured':'مفتاح Brevo أو إعدادات الـWorker غير مكتملة','Email provider refused the message':'مزوّد البريد (Brevo) رفض الرسالة','Too many requests':'محاولات كثيرة — انتظر قليلاً','Forbidden':'هذا الحساب ليس حساب المالك'};
let nlTested='',nlBusy=false;
function nlVals(){const g=id=>(document.getElementById(id)?.value||'');return{subject:g('nlSubject').trim(),preheader:g('nlPre').trim(),body:g('nlBody'),ctaLabel:g('nlCta').trim(),ctaUrl:g('nlCtaUrl').trim()};}
/* a content fingerprint: same text → same campaign (so a second press continues it, never duplicates); edited text → a new campaign */
function nlCampaign(v){const s=[v.subject,v.preheader,v.body.replace(/\r/g,''),v.ctaLabel,v.ctaUrl].join('\u0001');let a=5381,b=52711;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);a=((a*33)^c)>>>0;b=((b*31)+c)>>>0;}return 'c'+a.toString(36)+b.toString(36)+s.length.toString(36);}
function nlDirty(){
  const v=nlVals(),len=document.getElementById('nlLen');if(len)len.textContent=v.body.length;
  nlGate();
}
function nlGate(){
  const btn=document.getElementById('nlSendBtn');if(!btn)return;const v=nlVals();
  const ready=v.subject.length>=3&&v.body.trim().length>=10&&nlTested===nlCampaign(v)&&!nlBusy;
  btn.disabled=!ready;
  btn.title=ready?'':'أرسل تجربة لبريدك لنفس النص أولاً';
}
function nlSay(id,html){const el=document.getElementById(id);if(el)el.innerHTML=html;}
async function nlPost(mode,extra){
  const v=nlVals();
  try{
    const tok=await auth.currentUser.getIdToken();
    const r=await fetch(WORKER+'/admin/newsletter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({idToken:tok,mode},v,extra||{}))});
    const j=await r.json().catch(()=>({}));
    return Object.assign({status:r.status,ok:!!(r.ok&&j.ok)},j,{error:j.error?(NL_ERR[j.error]||j.error):(r.ok?'':'خطأ '+r.status)});
  }catch(e){return{ok:false,error:'تعذّر الاتصال بالخادم'};}
}
async function nlPreview(){
  const b=document.getElementById('nlPreviewBtn');b.disabled=true;nlSay('nlMsg','جاري التحضير…');
  const r=await nlPost('preview');b.disabled=false;
  if(!r.ok){nlSay('nlMsg','<span style="color:var(--red)">'+esc(r.error)+'</span>');return;}
  nlSay('nlMsg','');document.getElementById('nlPreviewBox').style.display='block';
  document.getElementById('nlFrame').srcdoc=r.html;
}
async function nlTest(){
  if(nlBusy)return;nlBusy=true;const b=document.getElementById('nlTestBtn');b.disabled=true;nlSay('nlMsg','جاري إرسال التجربة…');
  const r=await nlPost('test');nlBusy=false;b.disabled=false;
  if(!r.ok){nlSay('nlMsg','<span style="color:var(--red)">'+esc(r.error)+'</span>');nlGate();return;}
  nlTested=nlCampaign(nlVals());
  nlSay('nlMsg','<span style="color:var(--green)"><i class="fa-solid fa-circle-check"></i> أُرسلت التجربة إلى '+esc(r.to||'بريدك')+'. افتحها (وتحقق من الوصول وشكل الشعار ورابط إلغاء الاشتراك)، ثم أرسل للمشتركين.</span>');
  nlGate();
}
async function nlSend(){
  if(nlBusy)return;const v=nlVals(),camp=nlCampaign(v);
  if(nlTested!==camp){aToast('أرسل تجربة لنفس النص أولاً','warn');return;}
  if(!RL.ok('nl-send',3,60000)){aToast('انتظر قليلاً','warn');return;}
  const max=Math.max(1,Math.min(1000,Math.floor(Number(document.getElementById('nlMax').value)||250)));
  const n=Number(window.nlCount)||0;
  if(!confirm('سيُرسل «'+v.subject+'» إلى '+(n?'حتى '+n+' مشترك':'المشتركين')+' (بحد أقصى '+max+' في هذه المرة). من وصلته هذه النشرة من قبل يُتخطّى. متابعة؟'))return;
  nlBusy=true;nlGate();const b=document.getElementById('nlSendBtn');b.disabled=true;nlSay('nlSendMsg','<span class="pf-hint">جاري الإرسال… لا تغلق الصفحة.</span>');
  const r=await nlPost('send',{campaign:camp,max});nlBusy=false;
  if(r.ok){
    nlSay('nlSendMsg','<div class="adm-card" style="border-color:var(--green)"><i class="fa-solid fa-circle-check" style="color:var(--green)"></i> أُرسلت إلى <b>'+esc(r.sent)+'</b> مشترك'+(r.already?' (تخطّينا '+esc(r.already)+' وصلتهم من قبل)':'')+'.'+(r.remaining>0?' <b>بقي '+esc(r.remaining)+'</b> — اضغط الإرسال مرة أخرى (اليوم أو غداً) لإكمال الباقي.':' اكتمل الإرسال لكل المشتركين.')+'</div>');
    aToast('تم الإرسال','ok');
  }else{
    nlSay('nlSendMsg','<div class="adm-card" style="border-color:var(--red)"><i class="fa-solid fa-triangle-exclamation" style="color:var(--red)"></i> '+esc(r.error)+(r.sent?' — أُرسلت قبل التوقف إلى '+esc(r.sent)+' مشترك'+(r.remaining?' وبقي '+esc(r.remaining):''):'')+'. إعادة الضغط آمنة: لن تصل الرسالة لأحد مرتين.</div>');
    aToast('توقف الإرسال','err');
  }
  nlGate();
}
window.nlDirty=nlDirty;window.nlPreview=nlPreview;window.nlTest=nlTest;window.nlSend=nlSend;
