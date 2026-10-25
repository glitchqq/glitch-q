/* ═══════════════════════════════════════════
   GLITCH Q — account.js
   Account settings: profile customisation + optional security tools.
   Loaded after script.js (shares its globals: S, auth, db, WORKER, RL, $, setText, toast, openM/closeM…).
   Nothing here is mandatory: every option is chosen by the customer.
═══════════════════════════════════════════ */
'use strict';
(function(){

const AV_EMOJI=['🎮','🕹️','👾','🤖','🦊','🐺','🐉','🦄','⚡','🔥','💎','🚀'];
const AV_COLORS={
  violet:'linear-gradient(135deg,#7c3aed,#c026d3)',
  pink:'linear-gradient(135deg,#ec4899,#f43f5e)',
  cyan:'linear-gradient(135deg,#06b6d4,#3b82f6)',
  green:'linear-gradient(135deg,#10b981,#06b6d4)',
  gold:'linear-gradient(135deg,#f59e0b,#ef4444)',
  red:'linear-gradient(135deg,#ef4444,#be123c)'
};
const NICK_RE=/^[\p{L}\p{N} _.\-]{2,20}$/u;
const NICK_BLOCK=/glitch|admin|support|staff|moderator|مشرف|ادمن|أدمن|الدعم|إدارة|ادارة/i;

const TX={
  ar:{
    title:'إعدادات الحساب',tabProf:'تخصيص',tabSec:'الأمان',
    nickL:'الاسم الظاهر',nickPh:'مثال: ProGamer',nickHint:'يظهر في حسابك ولوحة المتصدرين (2–20 حرفاً).',
    avL:'الصورة الرمزية',colL:'اللون',favL:'القسم المفضل عند فتح المتجر',favAll:'كل الأقسام',
    hideL:'إخفائي من لوحة المتصدرين',hideS:'لن يظهر اسمك للآخرين، وتبقى نقاطك محفوظة.',
    save:'حفظ التغييرات',saving:'جاري الحفظ...',saved:'تم حفظ التخصيص',
    nickBad:'الاسم الظاهر: 2–20 حرفاً (حروف وأرقام ومسافة و _ . - فقط).',nickRes:'هذا الاسم غير متاح، اختر اسماً آخر.',
    pwTitle:'تغيير كلمة المرور',pwCur:'كلمة المرور الحالية',pwNew:'كلمة المرور الجديدة (8 أحرف على الأقل)',pwNew2:'تأكيد كلمة المرور الجديدة',pwBtn:'تغيير كلمة المرور',
    pwDone:'تم تغيير كلمة المرور بنجاح.',pwWrong:'كلمة المرور الحالية غير صحيحة.',pwShort:'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.',
    pwMismatch:'تأكيد كلمة المرور غير مطابق.',pwSame:'اختر كلمة مرور مختلفة عن الحالية.',pwFill:'املأ كل الحقول.',pwMany:'محاولات كثيرة، حاول لاحقاً.',
    alertT:'تنبيه الدخول من جهاز جديد',alertS:'نرسل لك بريداً عند تسجيل دخول إلى حسابك من جهاز جديد.',alertOn:'تم تفعيل التنبيه. سنراسلك على بريدك عند أي دخول من جهاز جديد.',alertOff:'تم إيقاف التنبيه.',
    outT:'تسجيل الخروج من كل الأجهزة',outS:'ينهي جلسات حسابك على كل الأجهزة (قد يستغرق حتى ساعة على الأجهزة الأخرى). مفيد إن شككت بأن أحداً دخل حسابك.',
    outBtn:'تسجيل الخروج من كل الأجهزة',outConfirm:'اضغط مرة أخرى للتأكيد',outWorking:'جاري التنفيذ...',
    outDone:'تم إنهاء كل الجلسات. سجّل الدخول من جديد.',outFail:'تعذّر التنفيذ الآن، حاول لاحقاً.',outMany:'انتظر قليلاً ثم حاول مجدداً.',
    err:'حدث خطأ، حاول مجدداً.',perm:'تعذّر الحفظ. حاول لاحقاً.'
  },
  en:{
    title:'Account settings',tabProf:'Customize',tabSec:'Security',
    nickL:'Display name',nickPh:'e.g. ProGamer',nickHint:'Shown on your account and the leaderboard (2–20 characters).',
    avL:'Avatar',colL:'Colour',favL:'Favourite category when opening the shop',favAll:'All categories',
    hideL:'Hide me from the leaderboard',hideS:'Your name will not be shown to others; your points stay safe.',
    save:'Save changes',saving:'Saving...',saved:'Customization saved',
    nickBad:'Display name: 2–20 characters (letters, numbers, space, _ . - only).',nickRes:'This name is not available, choose another.',
    pwTitle:'Change password',pwCur:'Current password',pwNew:'New password (at least 8 characters)',pwNew2:'Confirm new password',pwBtn:'Change password',
    pwDone:'Your password was changed.',pwWrong:'Current password is incorrect.',pwShort:'New password must be at least 8 characters.',
    pwMismatch:'Password confirmation does not match.',pwSame:'Choose a password different from the current one.',pwFill:'Fill in all fields.',pwMany:'Too many attempts, try again later.',
    alertT:'New-device sign-in alert',alertS:'We email you whenever your account is signed in from a new device.',alertOn:'Alert enabled. We will email you on any sign-in from a new device.',alertOff:'Alert turned off.',
    outT:'Sign out of all devices',outS:'Ends your account sessions on every device (other devices may take up to an hour). Useful if you suspect someone accessed your account.',
    outBtn:'Sign out of all devices',outConfirm:'Tap again to confirm',outWorking:'Working...',
    outDone:'All sessions ended. Please sign in again.',outFail:'Could not do it right now, try again later.',outMany:'Please wait a moment and try again.',
    err:'Something went wrong, please try again.',perm:'Could not save. Please try later.'
  }
};
const tx=()=>TX[(typeof S!=='undefined'&&S.lang==='en')?'en':'ar'];

/* ── helpers ── */
const prefs=()=>((S.udata&&S.udata.prefs)||{});
function validAvatar(a){return a&&typeof a==='object'&&AV_EMOJI.includes(a.e)&&Object.prototype.hasOwnProperty.call(AV_COLORS,a.c)?{e:a.e,c:a.c}:null;}
async function saveUser(fields){
  await db.collection('users').doc(S.user.uid).update(fields);
}
function setPref(key,val){
  S.udata.prefs=Object.assign({},S.udata.prefs||{},{[key]:val});
}
async function devHash(){
  let id=null;try{id=localStorage.getItem('gq_dev');}catch(e){}
  if(!id){
    id=Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b=>b.toString(16).padStart(2,'0')).join('');
    try{localStorage.setItem('gq_dev',id);}catch(e){}
  }
  try{
    const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));
    return Array.from(new Uint8Array(h)).slice(0,8).map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch(e){return id.slice(0,16);}
}

/* ── profile look (avatar + display name) ── */
let _pick={e:'🎮',c:'violet'};
window.acctApplyProfile=function(){
  if(!S.user||!S.udata)return;
  const av=validAvatar(S.udata.avatar),box=$('profAv');
  if(box){
    if(av){box.textContent=av.e;box.style.background=AV_COLORS[av.c];box.style.fontSize='26px';}
    else{box.innerHTML='<i class="fa-solid fa-user"></i>';box.style.background='';box.style.fontSize='';}
  }
  const nick=typeof S.udata.nick==='string'?S.udata.nick.trim():'';
  if(nick&&NICK_RE.test(nick))setText('profName',san(nick));
};

/* ── texts ── */
window.acctApplyTexts=function(){
  const x=tx();
  setText('accTitle',x.title);setText('accTabProf',x.tabProf);setText('accTabSec',x.tabSec);
  setText('accNickL',x.nickL);setText('accNickHint',x.nickHint);setText('accAvL',x.avL);setText('accColL',x.colL);
  setText('accFavL',x.favL);setText('accHideL',x.hideL);setText('accHideS',x.hideS);setText('accSaveProf',x.save);
  setText('accPwTitle',x.pwTitle);setText('accPwBtn',x.pwBtn);
  setText('accAlertT',x.alertT);setText('accAlertS',x.alertS);setText('accOutT',x.outT);setText('accOutS',x.outS);
  if(!_outArmed)setText('accOutBtn',x.outBtn);
  const ph=(id,v)=>{const e=$(id);if(e)e.placeholder=v;};
  ph('accNick',x.nickPh);ph('accPwCur',x.pwCur);ph('accPwNew',x.pwNew);ph('accPwNew2',x.pwNew2);
  const fav=$('accFavCat');if(fav&&fav.options.length)fav.options[0].textContent=x.favAll;
};

/* ── open ── */
function buildAvatarPickers(){
  const g=$('accAvGrid'),c=$('accColors');if(!g||!c)return;
  g.innerHTML='';c.innerHTML='';
  AV_EMOJI.forEach(e=>{
    const b=document.createElement('button');b.type='button';b.className='av-opt'+(_pick.e===e?' on':'');b.textContent=e;b.setAttribute('aria-label',e);
    b.onclick=()=>{_pick.e=e;buildAvatarPickers();paintPreview();};g.appendChild(b);
  });
  Object.keys(AV_COLORS).forEach(k=>{
    const b=document.createElement('button');b.type='button';b.className='av-col'+(_pick.c===k?' on':'');b.style.background=AV_COLORS[k];b.setAttribute('aria-label',k);
    b.onclick=()=>{_pick.c=k;buildAvatarPickers();paintPreview();};c.appendChild(b);
  });
}
function paintPreview(){
  const p=$('accAvPrev');if(!p)return;p.textContent=_pick.e;p.style.background=AV_COLORS[_pick.c];
}
function fillFavCats(){
  const sel=$('accFavCat');if(!sel)return;
  const x=tx();sel.innerHTML='';
  const all=document.createElement('option');all.value='all';all.textContent=x.favAll;sel.appendChild(all);
  (typeof CATS!=='undefined'?CATS:[]).filter(c=>c.enabled).sort((a,b)=>(a.order||0)-(b.order||0)).forEach(c=>{
    const o=document.createElement('option');o.value=c.id;o.textContent=(S.lang==='en'?(c.nameEn||c.name):(c.name||c.id));sel.appendChild(o);
  });
  const want=prefs().favCat||'all';sel.value=[...sel.options].some(o=>o.value===want)?want:'all';
}
window.acctOpen=function(){
  if(!S.user||!S.udata){openM('authModal');return false;}
  window.acctApplyTexts();
  _pick=validAvatar(S.udata.avatar)||{e:'🎮',c:'violet'};
  buildAvatarPickers();paintPreview();fillFavCats();
  const n=$('accNick');if(n)n.value=(typeof S.udata.nick==='string'?S.udata.nick:'');
  const h=$('accHideLb');if(h)h.checked=prefs().hideLb===true;
  const a=$('accAlerts');if(a)a.checked=prefs().loginAlerts===true;
  ['accPwCur','accPwNew','accPwNew2'].forEach(id=>{const e=$(id);if(e)e.value='';});
  disarmOut();window.acctTab('prof');
  return true;
};
window.acctTab=function(name){
  $('accProf')?.classList.toggle('hidden',name!=='prof');
  $('accSec')?.classList.toggle('hidden',name!=='sec');
  $('accTabProf')?.classList.toggle('on',name==='prof');
  $('accTabSec')?.classList.toggle('on',name==='sec');
  clearInlineAlerts($('accountModal'));
};

/* ── save customisation ── */
window.acctSaveProfile=async function(){
  const x=tx(),btn=$('accSaveProf');
  if(!S.user||!S.udata)return;
  if(!RL.ok('accprof',8,60000)){toast(x.pwMany,'twarn');return;}
  const nick=($('accNick')?.value||'').trim().replace(/\s+/g,' ');
  if(nick&&!NICK_RE.test(nick)){toast(x.nickBad,'terr');return;}
  if(nick&&NICK_BLOCK.test(nick)){toast(x.nickRes,'terr');return;}
  const fav=$('accFavCat')?.value||'all';
  const hide=!!$('accHideLb')?.checked;
  btn.disabled=true;btn.textContent=x.saving;
  try{
    await saveUser({nick,avatar:{e:_pick.e,c:_pick.c},'prefs.favCat':fav,'prefs.hideLb':hide});
    S.udata.nick=nick;S.udata.avatar={e:_pick.e,c:_pick.c};setPref('favCat',fav);setPref('hideLb',hide);
    S.currentCat=(fav!=='all'&&(typeof CATS!=='undefined')&&CATS.some(c=>c.id===fav&&c.enabled))?fav:'all';
    window.acctApplyProfile();
    if(typeof renderLeaderboard==='function')renderLeaderboard();
    toast(x.saved,'tok');
  }catch(e){toast(x.perm,'terr');}
  finally{btn.disabled=false;btn.textContent=x.save;}
};

/* ── change password (re-authenticates with the current password first) ── */
window.acctChangePassword=async function(ev){
  if(ev)ev.preventDefault();
  const x=tx(),btn=$('accPwBtn');
  if(!S.user||!S.user.email)return;
  const cur=$('accPwCur')?.value||'',nw=$('accPwNew')?.value||'',nw2=$('accPwNew2')?.value||'';
  if(!cur||!nw||!nw2){toast(x.pwFill,'terr');return;}
  if(nw.length<8){toast(x.pwShort,'terr');return;}
  if(nw!==nw2){toast(x.pwMismatch,'terr');return;}
  if(nw===cur){toast(x.pwSame,'terr');return;}
  if(!RL.ok('chpass',5,300000)){toast(x.pwMany,'twarn');return;}
  btn.disabled=true;
  try{
    const cred=firebase.auth.EmailAuthProvider.credential(S.user.email,cur);
    await S.user.reauthenticateWithCredential(cred);
    await S.user.updatePassword(nw);
    ['accPwCur','accPwNew','accPwNew2'].forEach(id=>{const e=$(id);if(e)e.value='';});
    toast(x.pwDone,'tok');
  }catch(e){
    const c=e&&e.code;
    if(c==='auth/wrong-password'||c==='auth/invalid-credential'||c==='auth/invalid-login-credentials')toast(x.pwWrong,'terr');
    else if(c==='auth/too-many-requests')toast(x.pwMany,'twarn');
    else if(c==='auth/weak-password')toast(x.pwShort,'terr');
    else toast(x.err,'terr');
  }finally{btn.disabled=false;}
};

/* ── new-device alert (optional) ── */
window.acctToggleAlerts=async function(){
  const x=tx(),sw=$('accAlerts');if(!sw||!S.user)return;
  const on=sw.checked;sw.disabled=true;
  try{
    const fields={'prefs.loginAlerts':on};
    if(on){                                                   /* this device counts as known, so enabling does not alert about itself */
      const h=await devHash();const known=S.udata.devices||[];
      if(!known.includes(h)){const nd=[h,...known].slice(0,10);fields.devices=nd;S.udata.devices=nd;}
    }
    await saveUser(fields);setPref('loginAlerts',on);
    toast(on?x.alertOn:x.alertOff,'tok');
  }catch(e){sw.checked=!on;toast(x.perm,'terr');}
  finally{sw.disabled=false;}
};
/* called after every sign-in / restored session; only acts when the owner switched alerts on */
window.acctOnLogin=async function(){
  try{
    if(!S.user||!S.udata)return;
    if(S.udata.nick||S.udata.avatar)window.acctApplyProfile();
    const fav=prefs().favCat;
    if(fav&&fav!=='all'&&typeof CATS!=='undefined'&&CATS.some(c=>c.id===fav&&c.enabled))S.currentCat=fav;
    if(prefs().loginAlerts!==true)return;
    const h=await devHash(),known=S.udata.devices||[];
    if(known.includes(h))return;
    const idToken=await S.user.getIdToken();
    const r=await fetch(WORKER+'/account/login-alert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken})});
    if(!r.ok)return;                                          /* try again next time; never blocks the customer */
    const nd=[h,...known].slice(0,10);
    S.udata.devices=nd;await saveUser({devices:nd});
  }catch(e){}
};

/* ── sign out everywhere (server revokes the account's refresh tokens) ── */
let _outArmed=false,_outTimer=null;
function disarmOut(){_outArmed=false;clearTimeout(_outTimer);const b=$('accOutBtn');if(b){b.disabled=false;b.textContent=tx().outBtn;}}
window.acctSignOutAll=async function(){
  const x=tx(),b=$('accOutBtn');if(!S.user||!b)return;
  if(!_outArmed){                                             /* two taps instead of a browser confirm() box */
    _outArmed=true;b.textContent=x.outConfirm;clearTimeout(_outTimer);_outTimer=setTimeout(disarmOut,4000);return;
  }
  clearTimeout(_outTimer);b.disabled=true;b.textContent=x.outWorking;
  try{
    const idToken=await S.user.getIdToken(true);
    const r=await fetch(WORKER+'/account/revoke-sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken})});
    if(r.status===429){toast(x.outMany,'twarn');disarmOut();return;}
    if(!r.ok){toast(x.outFail,'terr');disarmOut();return;}
    closeM('accountModal');
    await window.doLogout();
    showPane('loginPane');openM('authModal');toast(x.outDone,'tok');
    disarmOut();
  }catch(e){toast(x.outFail,'terr');disarmOut();}
};

window.addEventListener('DOMContentLoaded',()=>{
  $('accPwForm')?.addEventListener('submit',window.acctChangePassword);
  try{window.acctApplyTexts();}catch(e){}
});
})();
