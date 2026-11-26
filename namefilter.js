/* Glitch Q — account-name filter.
   Refuses display names that contain insults, sexual / blasphemous ("haram") words or political names, in any language.
   The block between the NAMEFILTER markers is copied word for word into worker/worker.js (the Worker applies the same list to every public
   place a name is shown: the leaderboard, e-mails, invoices). worker/worker.test.mjs fails if the two copies ever differ.
   How it works (so nobody gets fooled by "f.u.c.k", "ƒuck", "fuuuck", "ف ـ ـ ك" or "9a7ba"):
     1. the text is normalised: accents, Arabic vowel marks / tatweel, alef/ya/ta-marbuta variants, zero-width and bidi characters,
        look-alike Cyrillic/Greek letters and leet digits (0→o 1→i 3→e 4→a 5→s …) — both with and without the digit substitution;
     2. LONG, unambiguous words ("STRICT") are looked for anywhere in the text with spaces and punctuation removed;
     3. SHORT or ambiguous words ("WORD") are only refused when they are a whole word, so real names are never caught
        (Monique, Nigeria, Computer, Therapist, Dickens, Zubair, Nazir … are all fine).
   It is a filter, not a judge: the lists are plain text below — add a word to the right list and it applies in the shop and in the Worker. */
/* NAMEFILTER:BEGIN */
const NF=(()=>{
  const LAT={'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','8':'b','@':'a','$':'s','!':'i','€':'e','£':'l','|':'i','+':'t'};
  const HOMO={'а':'a','е':'e','о':'o','р':'p','с':'c','х':'x','у':'y','і':'i','ј':'j','ѕ':'s','ԁ':'d','ƒ':'f','ɡ':'g','α':'a','ο':'o','ν':'v','ρ':'p','ι':'i','κ':'k','τ':'t','ε':'e'};
  const base=s=>String(s==null?'':s).slice(0,200)
    .replace(/([a-zа-я])([A-ZА-Я])/g,'$1 $2')                                   /* BigAss → big ass */
    .normalize('NFKD').toLowerCase()
    .replace(/[̀-ًͯ-ٰٟـۖ-ۭ]/g,'')                          /* accents, vowel marks, tatweel */
    .replace(/[​-‏‪-‮⁠﻿­]/g,'')                                  /* zero-width / bidi */
    .replace(/ß/g,'ss').replace(/æ/g,'ae').replace(/ø/g,'o').replace(/ı/g,'i').replace(/ё/g,'е')
    .replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0))
    .replace(/[أإآٱ]/g,'ا').replace(/[ىئی]/g,'ي').replace(/[ةھہ]/g,'ه').replace(/ؤ/g,'و').replace(/ک/g,'ك');
  const sub=t=>t.replace(/[^\s]/gu,c=>HOMO[c]||LAT[c]||c);
  const squash=t=>t.replace(/[^\p{L}\p{N}]+/gu,'');
  const col=t=>t.replace(/(.)\1{2,}/gu,'$1');                                                       /* fuuuck → fuck, "ass" stays */
  const words=l=>l.split(/\s+/).filter(Boolean).map(w=>squash(base(w)));
  /* STRICT — found anywhere (after removing spaces and punctuation); each letter may be repeated (fuuuck) but a double letter stays double */
  const STRICT=words(`
    fuck shit bitch asshole bastard pussy whore slut faggot nigger niggers pornhub xvideos xnxx porno pornography blowjob handjob cumshot jerkoff dildo vagina
    masturbat orgasm hentai nudes pedophile paedophile molester wanker motherfucker cocksucker bullshit horseshit dumbass dickhead
    putain connard connasse enculer encule niquetamere ntmere couille salopard sodomie merdeux
    mierda cabron pendejo maricon chingar chingada chingatumadre hijueputa hijodeputa gilipollas
    orospu siktir sikeyim sikik pezevenk amcik yarrak
    scheisse scheiss arschloch fotze hurensohn wichser schwuchtel ficken
    cazzo vaffanculo stronzo puttana caralho buceta
    пизд блядь блять ебать ебан пидор мудак говно залуп шлюх
    كسكش حرامزاده مادرجنده پدرسگ چوتيا
    كسمك كسامك كسختك كسمه كسامه نيكمك نيكامك نيكموك نيكامو ينيك ينيكك منيوك متناك شرموط شرموطه عاهره قحبه قحاب ديوث ديوثه لوطي زانيه زانيات
    ولدزنا ابنزنا ولدالحرام ابنالحرام ولدلحرام ابنالكلب ولدالكلب ابنالقحبه بنتالقحبه ولدالقحبه ولدلقحبه
    يلعن نعلبوك نعلدين نعلمك دينمك دينامك ديناموك دينربك
    اباحي اباحيه بورنو سكسي محارم لواط اغتصاب ممحون ممحونه مهبل
    9a7ba 9ahba 7a9ba qahba kahba kahbat kehba sharmouta charmouta sharmota charmota sharmoute nikomak nikmak nikmok nikemok nikommak nikomek niktamak niktamer
    kosomak ksomak ksomok kosomek kosmak kosomok dayouth dayyouth ibnelharam ibnlharam ouldelharam ouldlharam ouldelhram ouldlhram bentlharam bentelharam
    hitler heilhitler mussolini stalin
    bouteflika boutef tebboune tebboun chengriha netanyahu zelensky zelenskyy erdogan khamenei khomeini gaddafi kadhafi hezbollah hizbollah hizballah
    daesh alqaeda alqaida taliban zionist zionism polisario
    بوتفليقه شنقريحه ماكرون نتنياهو زيلنسكي السيسي القذافي اردوغان خامنئي حزبالله داعش طالبان
    اسرائيل صهيوني صهيونيه صهيون هتلر النازيه البوليساريو
    vodka whisky whiskey cocaine hashish cannabis marijuana
    كوكايين حشيش خمرة
  `);
  /* WORD — only when it is a whole word (digits stuck on the end and "ال" in front are ignored) */
  const WORD=new Set(words(`
    cunt dick cock cum anal rape rapist sex sexy sexo nude porn tits boobs horny milf bdsm twat fag retard pedo nigga niga heroin weed meth lsd
    ass arse asses
    pute puta puto nique niquer ntm fdp pede pedes chatte bordel salope salopes batard enfoire
    merde merda
    verga culo joder marica
    amk gavat ibne
    fick figa troia porra viado
    хуй хуя хуе пизда ебал сука
    كص جنده
    كس زب زبي كسي طيز طيزي عرص خول خرا زنا نيك نيكني منيك تنيك سكس لوطي قحب زامل قضيب جنس
    zebi zobi zeb zebbi 9a7ba 9ahba 9ahba 9a7ab kos tnaka tnak khawal 3ars 3ahira zamel zaml
    hamas isil nazi nazis kkk fascist trump biden putin israel israeli macron makhzen
    ترامب بايدن بوتين نازي تبون
  `));
  /* innocent words that happen to contain a refused one once letters may repeat */
  const ALLOW=['shiitake'];
  const alt=w=>w.length>4&&w.startsWith('ال')?w.slice(2):'';
  let RX=null;
  const rx=()=>RX||(RX=new RegExp('(?:'+[...new Set(STRICT)].filter(w=>w.length>=3).map(w=>[...w].reduce((a,c)=>{const l=a[a.length-1];if(l&&l.c===c)l.n++;else a.push({c,n:1});return a;},[]).map(r=>r.n>1?r.c+'{'+r.n+',}':r.c+'+').join('')).join('|')+')','u'));
  /* true → the name must not be used / shown */
  function bad(name){
    const raw=String(name==null?'':name);
    if(!raw.trim())return false;
    const b=base(raw),s=sub(b),vs=b===s?[b]:[b,s];
    for(const v of vs){
      if(rx().test(ALLOW.reduce((a,w)=>a.split(w).join(''),squash(v))))return true;
      for(const tok of v.split(/[^\p{L}\p{N}]+/u)){
        if(!tok)continue;
        const k=col(tok),k2=k.replace(/\d+$/,'');
        for(const w of [tok,k,k2,alt(tok),alt(k),alt(k2)])if(w&&WORD.has(w))return true;
      }
    }
    return false;
  }
  return{bad,base,squash};
})();
/* NAMEFILTER:END */
