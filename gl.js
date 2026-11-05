/* Glitch Q — hero scene: a black liquid-metal puddle that reacts to the cursor, rises into ferrofluid spikes as you
   scroll, then settles into a gift card. Pure WebGL2 ray-marching, no library, no network.
   Purely cosmetic: with no WebGL2, reduced motion or any shader error the page shows the static hero instead
   (`.hs-static`) and everything else works the same. */
(function () {
  'use strict';
  var scene = document.getElementById('heroScene');
  var cv = document.getElementById('heroGL');
  if (!scene || !cv) return;

  function fallback() { scene.classList.add('hs-static'); }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return fallback();

  var gl = cv.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return fallback();

  var VS = '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

  var FS = '#version 300 es\n' +
  'precision highp float;\n' +
  'uniform vec2 uRes;uniform float uT,uP,uVel,uSteps,uAct;uniform vec2 uPtr,uOff;\n' +
  'out vec4 fo;\n' +
  'float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\n' +
  'mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}\n' +
  'float smin(float a,float b,float k){float h=max(k-abs(a-b),0.)/k;return min(a,b)-h*h*k*.25;}\n' +
  /* hexagonal lattice: xy = vector to the nearest centre, zw = its id */
  'vec4 hexg(vec2 p){const vec2 s=vec2(1.,1.7320508);vec4 hC=floor(vec4(p,p-vec2(1.,.5))/s.xyxy)+.5;vec4 h=vec4(p-hC.xy*s,p-(hC.zw+.5)*s);return dot(h.xy,h.xy)<dot(h.zw,h.zw)?vec4(h.xy,hC.xy):vec4(h.zw,hC.zw+.5);}\n' +
  'float spk(vec2 p){vec4 h=hexg(p*3.3);float d=length(h.xy);float v=.62+.38*sin(uT*1.4+h21(h.zw)*6.283);return pow(max(0.,1.-d*2.25),1.3)*v;}\n' +
  /* scene description derived from the scroll progress */
  'float S_(){return smoothstep(.5,.84,uP);}\n' +
  'vec3 pv(){return vec3(uPtr.x*1.9,0.,-uPtr.y*1.1);}\n' +
  'vec3 fq(vec3 p){\n' +
  '  float s=S_();float lift=smoothstep(.34,.82,uP);\n' +
  '  vec3 q=p-vec3(0.,mix(-.45,.1,lift),0.);\n' +
  '  float pt=clamp(uPtr.x,-1.,1.);float py=clamp(uPtr.y,-1.,1.);\n' +
  '  q.xz=rot((sin(uT*.35)*.1+pt*.2)*s)*q.xz;\n' +          /* yaw about the vertical axis */
  '  q.yz=rot((1.12+py*.08)*s)*q.yz;\n' +                   /* tilt the slab up so its face looks at the camera */
  '  return q;\n' +
  '}\n' +
  'float map(vec3 p){\n' +
  '  float s=S_();\n' +
  '  vec3 q=fq(p);\n' +
  '  float halfT=mix(.085,.026,s);\n' +
  '  float r=length(q.xz);\n' +
  '  float ripple=.016*sin(r*13.-uT*2.4)*exp(-r*.9)*(1.-s);\n' +
  '  float mag=smoothstep(.1,.36,uP)*(1.-smoothstep(.46,.68,uP));\n' +
  '  vec3 pw=pv();\n' +
  '  float near=exp(-dot(q.xz-pw.xz,q.xz-pw.xz)*2.2)*(1.-s)*uAct;\n' +
  '  float amp=.40*mag+.012+.34*near;\n' +
  '  float top=halfT+ripple+amp*spk(q.xz)*(1.-s)+.09*near;\n' +
  '  vec2 ell=vec2(mix(1.25,.95,smoothstep(.2,.55,uP)),mix(.8,.66,smoothstep(.2,.55,uP)));\n' +
  '  float dE=(length(q.xz/ell)-1.)*min(ell.x,ell.y);\n' +
  '  vec2 hb=vec2(1.06,.668)-.08;vec2 dd=abs(q.xz)-hb;float dR=length(max(dd,0.))+min(max(dd.x,dd.y),0.)-.08;\n' +
  '  float dF=mix(dE,dR,s);\n' +
  '  float dY=max(q.y-top,-halfT-q.y)*.55;\n' +
  '  float rb=mix(.045,.018,s);\n' +
  '  vec2 w=vec2(dF+rb,dY+rb);\n' +
  '  float d=min(max(w.x,w.y),0.)+length(max(w,0.))-rb;\n' +
  /* droplets that merge back into the puddle */
  '  float dl=1.-smoothstep(.16,.4,uP);\n' +
  '  if(dl>.01){\n' +
  '    for(int i=0;i<5;i++){float fi=float(i);\n' +
  '      vec3 dp=vec3(sin(uT*.7+fi*1.7)*1.15,-.1+.55*abs(sin(uT*1.05+fi*2.3)),cos(uT*.5+fi*2.1)*.55);\n' +
  '      float rr=(.05+.035*fract(fi*.37))*dl;\n' +
  '      d=smin(d,length(p-dp)-rr,.22);}\n' +
  '  }\n' +
  '  return d;\n' +
  '}\n' +
  'vec3 nrm(vec3 p,float e){vec2 k=vec2(1.,-1.);return normalize(k.xyy*map(p+k.xyy*e)+k.yyx*map(p+k.yyx*e)+k.yxy*map(p+k.yxy*e)+k.xxx*map(p+k.xxx*e));}\n' +
  /* studio: two red soft boxes, a thin white strip, low red kicker */
  'vec3 env(vec3 d){\n' +
  '  vec3 c=mix(vec3(.004,.004,.007),vec3(.03,.006,.012),d.y*.5+.5);\n' +
  '  c+=vec3(1.,.035,.09)*2.4*smoothstep(.84,.97,dot(d,normalize(vec3(-.55,.55,.62))));\n' +
  '  c+=vec3(1.,.92,.92)*5.5*smoothstep(.985,.999,dot(d,normalize(vec3(.82,.25,.32))));\n'+
  '  c+=vec3(1.,.8,.8)*3.0*smoothstep(.99,.9995,dot(d,normalize(vec3(-.9,.1,.2))));\n' +
  '  c+=vec3(1.,.06,.12)*1.5*smoothstep(.88,.99,dot(d,normalize(vec3(.25,-.1,-.96))));\n' +
  '  c+=vec3(.9,.02,.06)*.55*exp(-abs(d.y+.05)*7.);\n' +
  '  c+=vec3(1.,.5,.5)*1.4*smoothstep(.992,.9995,dot(d,normalize(vec3(-.1,.92,.25))));\n'+
  '  float bk=dot(d,normalize(vec3(0.,.24,-.97)));c+=mix(vec3(1.,.06,.1),vec3(1.,.82,.82),smoothstep(.992,.9995,bk))*3.6*smoothstep(.955,.996,bk);\n' +
  '  return c;\n' +
  '}\n' +
  'vec3 bg(vec2 uv){\n' +
  '  float g=smoothstep(1.25,.0,length((uv-vec2(uOff.x*-.28,-.05))*vec2(.75,1.)));\n' +
  '  vec3 c=mix(vec3(.012,.004,.008),vec3(.20,.004,.035),g*g);\n' +
  '  c+=vec3(.55,.0,.05)*.2*exp(-abs(uv.y+.42)*5.)*g;\n' +   /* horizon glow */
  '  return c;\n' +
  '}\n' +
  'void main(){\n' +
  '  vec2 fc=gl_FragCoord.xy;vec2 uv=(fc-.5*uRes)/uRes.y;\n' +
  /* glitch band: a horizontal slice shifts sideways now and then and when the page is scrolled fast */
  '  float slot=floor(uT*9.);float gr=h21(vec2(slot,3.1));\n' +
  '  float on=step(.965,gr)*step(abs(uv.y-(h21(vec2(slot,9.7))-.5)*.9),.035);\n' +
  '  float fast=step(abs(uv.y-(h21(vec2(floor(uT*24.),5.3))-.5)*.9),.03)*clamp(abs(uVel)*1.6,0.,1.);\n' +
  '  uv.x+=(on+fast)*(h21(vec2(slot,1.))-.5)*.09;\n' +
  '  vec3 ro=vec3(uOff.x,1.5+uOff.y*1.2,6.2+uOff.y*8.);vec3 ta=vec3(uOff.x,-.1+uOff.y*1.3,0.);\n' +
  '  vec3 fw=normalize(ta-ro),rt=normalize(cross(fw,vec3(0.,1.,0.))),up=cross(rt,fw);\n' +
  '  vec3 rd=normalize(fw*2.35+rt*uv.x+up*uv.y);\n' +
  '  vec3 col=bg(uv);\n' +
  /* floor */
  '  float yF=-.78;float tF=(yF-ro.y)/rd.y;\n' +
  '  float t=0.;bool hit=false;\n' +
  '  vec3 oc=ro-vec3(0.,0.,0.);float b=dot(oc,rd);float cc=dot(oc,oc)-7.5;float disc=b*b-cc;\n' +
  '  if(disc>0.){\n' +
  '    t=max(0.,-b-sqrt(disc))+h21(fc+uT)*.01;float tm=-b+sqrt(disc);\n' +
  '    for(int i=0;i<96;i++){if(float(i)>=uSteps)break;vec3 p=ro+rd*t;float d=map(p);if(d<.0016){hit=true;break;}t+=d;if(t>tm)break;}\n' +
  '  }\n' +
  '  if(tF>0.&&(!hit||tF<t)){\n' +
  '    vec3 fp=ro+rd*tF;float dd=map(fp+vec3(0.,.7,0.));\n' +
  '    float glow=exp(-max(map(vec3(fp.x,-.4,fp.z)),0.)*5.5);\n' +
  '    vec3 fcol=vec3(.012,.004,.008)+vec3(.9,.012,.09)*glow*.3;\n' +
  '    fcol*=mix(1.,.0,smoothstep(2.4,7.,length(fp.xz)));\n' +
  '    col=mix(col,fcol,smoothstep(0.,.5,.5+rd.y*-6.)*0.9+.1);\n' +
  '  }\n' +
  '  if(hit){\n' +
  '    vec3 p=ro+rd*t;vec3 n=nrm(p,.0014+t*.0004);\n' +
  '    vec3 r=reflect(rd,n);\n' +
  '    float fr=pow(1.-clamp(dot(n,-rd),0.,1.),4.);\n' +
  /* channel-split reflections give the metal its chromatic edge */
  '    vec3 e=vec3(env(normalize(r+vec3(.014,0.,0.))).r,env(r).g,env(normalize(r-vec3(.014,0.,0.))).b);\n' +
  '    float ao=clamp(map(p+n*.12)/.12,0.,1.);\n' +
  '    vec3 base=e*(.2+.8*fr)*mix(.5,1.,ao);\n' +
  '    base+=vec3(1.,.03,.09)*pow(fr,3.)*.55;\n' +
  '    base+=vec3(.5,.0,.03)*max(dot(n,normalize(vec3(-.5,.8,.5))),0.)*.07;\n' +
  '    float s=S_();\n' +
  '    vec3 ql=fq(p);float halfT=mix(.085,.026,s);\n' +
  '    float face=smoothstep(.55,.95,s)*smoothstep(halfT*.55,halfT*.85,ql.y);\n' +
  '    if(face>.001){\n' +
  '      vec2 f=ql.xz;\n' +
  '      vec3 cc=mix(vec3(.008,.0,.01),vec3(.56,.0,.06),pow(smoothstep(-.2,1.5,f.x*.45+f.y*.95),1.6));\n' +
  '      float ln=smoothstep(.42,.5,abs(fract((f.x*.8-f.y*1.2)*6.)-.5));\n' +
  '      cc+=vec3(.7,.0,.1)*ln*.16;\n' +
  /* brand mark: ring + slash tail */
  '      vec2 e0=f-vec2(.62,-.3);float ring=abs(length(e0)-.17)-.034;\n' +
  '      vec2 tl=e0-vec2(.1,.1);float tail=abs(dot(tl,normalize(vec2(1.,-1.))))-.03;tail=max(tail,abs(dot(tl,normalize(vec2(1.,1.))))-.13);\n' +
  '      cc=mix(cc,vec3(.96,.96,.98),1.-smoothstep(0.,.006,ring));\n' +
  '      cc=mix(cc,vec3(.96,.7,.2),1.-smoothstep(0.,.006,tail));\n' +
  /* moving specular sweep */
  '      float sw=smoothstep(.1,0.,abs(dot(f,normalize(vec2(.8,.6)))-(fract(uT*.11)*4.-2.1)));\n' +
  '      cc+=vec3(1.,.5,.55)*sw*.55;\n' +
  '      base=mix(base,cc+e*.3*(.2+fr),face);\n' +
  '    }\n' +
  '    col=base;\n' +
  '  }\n' +
  /* vignette + grain */
  '  vec2 vu=fc/uRes-.5;col*=1.-dot(vu,vu)*.95;\n' +
  '  col+=(h21(fc*1.13+uT*60.)-.5)*.022;\n' +
  '  col=col/(1.+col*.5);col=pow(max(col,0.),vec3(.52));\n' +
  '  col=mix(col,col*col*(3.-2.*col),.55);\n' +
  '  fo=vec4(col,1.);\n' +
  '}\n';

  function sh(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { if (window.console) console.warn('[hero] shader:', gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return fallback();
  var pr = gl.createProgram();
  gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return fallback();
  gl.useProgram(pr);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(pr, 'a');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var U = {};
  ['uRes', 'uT', 'uP', 'uVel', 'uSteps', 'uAct', 'uPtr', 'uOff'].forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });

  var coarse = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
  var st = { p: 0, ps: 0, vel: 0, lastY: window.scrollY, px: 9, py: 9, pxs: 9, pys: 9, act: .55, hover: false, t: 0, q: coarse ? .5 : .62, visible: true, last: 0, acc: 0, frames: 0, fixedT: null };

  function size() {
    var r = cv.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.max(160, Math.round(r.width * dpr * st.q)), h = Math.max(120, Math.round(r.height * dpr * st.q));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, cv.width, cv.height);
  }
  /* 0 at the top of the page, 1 when the pinned stage lets go. The stage sticks below the header, so measure
     against where it sticks, not against the window top. */
  var stick = scene.querySelector('.hs-stick') || scene;
  function progress() {
    var r = scene.getBoundingClientRect();
    var top = parseFloat(getComputedStyle(stick).top) || 0;
    var total = Math.max(1, r.height - stick.offsetHeight);
    return Math.min(1, Math.max(0, (top - r.top) / total));
  }
  function setStep(p) {
    var s = p < .22 ? 0 : p < .5 ? 1 : p < .78 ? 2 : 3;
    if (scene.dataset.step !== String(s)) scene.dataset.step = String(s);
  }
  function draw(t) {
    var asp = cv.width / cv.height;
    /* copy sits on the reading-start side, the metal on the other one */
    var side = document.documentElement.dir === 'ltr' ? -1 : 1;
    var offX = asp > 1.25 ? .85 * side : 0, offY = asp < .9 ? .75 : 0;
    gl.uniform2f(U.uRes, cv.width, cv.height);
    gl.uniform1f(U.uT, t); gl.uniform1f(U.uP, st.ps); gl.uniform1f(U.uVel, st.vel);
    gl.uniform1f(U.uSteps, coarse ? 52 : 84);
    gl.uniform1f(U.uAct, st.act); gl.uniform2f(U.uPtr, st.pxs, st.pys); gl.uniform2f(U.uOff, offX, offY);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (!st.visible || document.hidden) { st.last = now; return; }
    var dt = Math.min(.1, (now - (st.last || now)) / 1000); st.last = now;
    st.t += dt;
    var y = window.scrollY; var v = (y - st.lastY) / Math.max(dt, .001) / 2500; st.lastY = y;
    st.vel += (Math.max(-1, Math.min(1, v)) - st.vel) * .18;
    if (st.fixedT != null) { draw(st.fixedT); return; }
    st.p = progress();
    st.ps += (st.p - st.ps) * Math.min(1, dt * 7);
    /* with no pointer on the scene a ghost magnet wanders over the puddle so the metal always looks alive */
    var tx = st.hover ? st.px : Math.sin(st.t * .42) * .55 - .2, ty = st.hover ? st.py : Math.cos(st.t * .31) * .3;
    st.pxs += (tx - st.pxs) * Math.min(1, dt * 5); st.pys += (ty - st.pys) * Math.min(1, dt * 5);
    st.act += ((st.hover ? 1 : .55) - st.act) * Math.min(1, dt * 3);
    scene.style.setProperty('--p', st.ps.toFixed(4)); setStep(st.ps);
    draw(st.t);
    /* adaptive resolution: keep ~30fps on weak GPUs */
    st.acc += dt; st.frames++;
    if (st.frames >= 24) {
      var avg = st.acc / st.frames; st.acc = 0; st.frames = 0;
      if (avg > .034 && st.q > .34) { st.q = Math.max(.34, st.q * .86); size(); }
      else if (avg < .017 && st.q < (coarse ? .55 : .8)) { st.q = Math.min(coarse ? .55 : .8, st.q * 1.08); size(); }
    }
  }

  scene.addEventListener('pointermove', function (e) {
    var r = cv.getBoundingClientRect();
    st.hover = true;
    st.px = ((e.clientX - r.left) / r.width - .5) * 2;
    st.py = -((e.clientY - r.top) / r.height - .5) * 2;
  }, { passive: true });
  scene.addEventListener('pointerleave', function () { st.hover = false; }, { passive: true });
  window.addEventListener('resize', size);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { st.visible = es[0].isIntersecting; }, { rootMargin: '120px' }).observe(scene);
  }
  cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); fallback(); });

  /* test / preview hook: render one exact frame */
  window.__GLQ = {
    at: function (p, t, px, py, act) { st.ps = st.p = p; st.t = t; st.pxs = st.px = px == null ? 9 : px; st.pys = st.py = py == null ? 9 : py; st.act = act == null ? 1 : act; st.fixedT = t; scene.style.setProperty('--p', p); setStep(p); size(); draw(t); },
    quality: function (q) { st.q = q; size(); },
    stats: function () { return { q: st.q, p: st.ps, w: cv.width, h: cv.height }; }
  };
  scene.classList.add('hs-live');
  size();
  requestAnimationFrame(frame);
})();
