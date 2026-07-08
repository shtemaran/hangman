// Marduk character rig. Builds a transform hierarchy at runtime over the flat
// semantic SVG (happy/win character; bars = environment) and exposes normalized
// params. SHAPE (blend-shape morphs) and TRANSFORM (gaze/head/breath) are
// separate layers, so blink + wink + gaze + head-turn + expression all compose.
//
//   const rig = createRig(svgElement, faceTargets);   // faceTargets = face_targets.json
//   rig.p.expr = 0;         // 1 happy · 0 neutral · -1 sad
//   rig.p.eyeOpenL = 0;     // blink/wink (per eye), composes with expr
//   rig.blink(); rig.wink('l'); rig.idle(true);

function createRig(svg, T, mods){
  const NS='http://www.w3.org/2000/svg';
  const $=id=>svg.querySelector('#'+id);
  const mkG=id=>{const g=document.createElementNS(NS,'g'); g.id=id; return g;};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const MODS=mods||{};                                     // modifiers.json: {name:{placement,adds,versions}}
  const exprKey=e=> e>=0.5?'happy' : e<=-0.5?'sad' : 'neutral';

  $('lose').style.display='none'; $('win').style.display='';
  const rootG=$('win');
  if($('win-bars')) $('win-bars').style.display='none';        // environment, not character

  // ---- hierarchy: win > body > head > {brows, eyes, mouth} ----
  const body=mkG('rig-body'), head=mkG('rig-head');
  ['win-eyes-l','win-eyes-r','win-eyes-l-blink','win-eyes-r-blink','win-mouth','win-brows-l','win-brows-r']
    .forEach(id=>{const e=$(id); if(e)e.remove();});
  head.appendChild($('win-head'));
  const mkFeat=kind=>{ const g=mkG('rig-'+kind), pth=document.createElementNS(NS,'path');
    pth.setAttribute('fill','#081C1A'); pth.id='rig-'+kind+'-shape'; g.appendChild(pth); head.appendChild(g); return [g,pth]; };
  const eyeG={}, eyeP={}, browG={}, browP={};
  for(const s of ['l','r']) [browG[s],browP[s]]=mkFeat('brow-'+s);
  for(const s of ['l','r']) [eyeG[s],eyeP[s]]=mkFeat('eye-'+s);
  const mouthP=document.createElementNS(NS,'path'); mouthP.setAttribute('fill','#081C1A'); mouthP.id='rig-mouth';
  head.appendChild(mouthP);
  $('win-torso')&&body.appendChild($('win-torso'));
  const srcArmR=$('win-hands-r'), srcArmL=$('win-hands-l');   // sources for hand poses (cloned, then removed)
  srcArmR&&srcArmR.remove(); srcArmL&&srcArmL.remove();
  body.appendChild(head); rootG.appendChild(body);

  // ---- blend-shape helpers (all targets corresponded to the 'happy' topology) ----
  const lerpA=(A,B,t)=>A.map((p,i)=>[p[0]+(B[i][0]-p[0])*t, p[1]+(B[i][1]-p[1])*t]);
  const pathD=P=>{let d=''; for(let i=0;i<P.length;i++) d+=(i?'L':'M')+P[i][0].toFixed(2)+','+P[i][1].toFixed(2)+' '; return d+'Z';};
  const valence=(slot,e)=>{ const t=T[slot]; return e>=0 ? lerpA(t.neutral,t.happy,e)
                                                          : (t.sad?lerpA(t.neutral,t.sad,-e):t.neutral); };
  // valence(expr) is the happy/sad base shape. Each overlay emotion (level in lv{}) then composes on top,
  // per face part, via a GRAB weight cfg.grab[emo][part]:  1 = fully OWN the part (blend the base toward
  // this emotion's shape),  0 = SHARE it (add this emotion's displacement over the base). So surprise can
  // grab the mouth & eyes (unique to it) while the brows stay shared with the expression. New emotions =
  // a new OVERLAYS row + a cfg.grab row.  g=1 -> lerp(base,E,L); g=0 -> base + L*(E-neutral).
  const OVERLAYS=[ {name:'surprise', key:'surprised'}, {name:'thoughtful', key:'thoughtful'}, {name:'confused', key:'confused'} ];
  const partOf=slot=> slot==='mouth'?'mouth' : slot[0]==='e'?'eye':'brow';
  const emo=(slot,e,lv)=>{
    let P=valence(slot,e); const t=T[slot], neu=t.neutral, part=partOf(slot);
    for(const ov of OVERLAYS){ const L=clamp(lv[ov.name]||0,0,1), E=t[ov.key]; if(L<=0||!E) continue;
      const g=(cfg.grab[ov.name]||{})[part], gg=(g==null?0:g);
      P=P.map((p,i)=>[ p[0]+L*(gg*(E[i][0]-p[0])+(1-gg)*(E[i][0]-neu[i][0])),
                       p[1]+L*(gg*(E[i][1]-p[1])+(1-gg)*(E[i][1]-neu[i][1])) ]); }
    // modifier morph: blend toward the modifier's per-expression version (exact key, else any available)
    for(const mn in MODS){ const L=clamp(lv[mn]||0,0,1), V=MODS[mn].versions&&MODS[mn].versions[slot]; if(L<=0||!V) continue;
      const Wv=V[exprKey(e)]||V[Object.keys(V)[0]]; if(!Wv) continue;
      P=P.map((p,i)=>[ p[0]+L*(Wv[i][0]-p[0]), p[1]+L*(Wv[i][1]-p[1]) ]); }
    return P; };
  const setEye=(s,e,lv,openW)=>{ let P=emo('eye-'+s,e,lv); if(openW>0)P=lerpA(P,T['eye-'+s].shut,openW); eyeP[s].setAttribute('d',pathD(P)); };
  const setMouth=(e,lv)=>mouthP.setAttribute('d',pathD(emo('mouth',e,lv)));
  const setBrow=(s,e,lv)=>browP[s].setAttribute('d',pathD(emo('brow-'+s,e,lv)));
  setBrow('l',1,{}); setBrow('r',1,{}); setEye('l',1,{},0); setEye('r',1,{},0); setMouth(1,{});

  // ---- modifier "adds": extra features drawn on the face (placed via head-aligned transform),
  //      each zooming in from nothing as the modifier level rises (staggered, so they pop in one by one).
  const smooth01=u=>{u=clamp(u,0,1); return u*u*(3-2*u);};
  const MODADD={};   // name -> [{zg, c:[x,y], a:staggerStart}]
  for(const mn in MODS){ const m=MODS[mn]; if(!m.adds) continue;
    const g=mkG('rig-mod-'+mn); g.setAttribute('transform', m.placement||''); head.appendChild(g);
    const labels=Object.keys(m.adds); MODADD[mn]=labels.map((lb,i)=>{ const a=m.adds[lb];
      const zg=document.createElementNS(NS,'g'), pth=document.createElementNS(NS,'path');
      pth.setAttribute('fill','#081C1A'); pth.setAttribute('d',a.d); zg.appendChild(pth); g.appendChild(zg);
      return {zg, c:a.c, a:(labels.length>1? i/(labels.length-1)*0.5 : 0)}; });   // stagger starts over [0,0.5]
  }
  const ZOOM_SPAN=0.5;

  // ---- pivots from geometry ----
  const bb=el=>el.getBBox();
  const hb=bb(head), bd=bb(body);
  const neck =[hb.x+hb.width/2, hb.y+hb.height*0.97];
  const feet =[bd.x+bd.width/2, bd.y+bd.height];
  const belly=[bd.x+bd.width/2, bd.y+bd.height*0.55];
  // head as a sphere; face features reproject on it for a 2.5D look
  const headC=[hb.x+hb.width/2, hb.y+hb.height/2], Rx=hb.width/2, Ry=hb.height/2;
  const cen=P=>{let x=0,y=0; for(const q of P){x+=q[0];y+=q[1];} return [x/P.length,y/P.length];};
  const eyeBase={l:cen(T['eye-l'].happy), r:cen(T['eye-r'].happy)};
  const mouthBase=cen(T.mouth.happy);
  const browBase={l:cen(T['brow-l'].happy), r:cen(T['brow-r'].happy)};
  const tbb=$('win-torso')?bb($('win-torso')):{x:0,y:0,width:0,height:0};
  const torsoC=[tbb.x+tbb.width/2, tbb.y+tbb.height/2];

  // ---- hand poses (swap, not morph): neutral (mirrored right arm) / thumbsup ----
  const arms={};
  const armPose=(name,leftEl,rightEl)=>{ const g=mkG('rig-hands-'+name);
    if(rightEl)g.appendChild(rightEl); if(leftEl)g.appendChild(leftEl);
    body.insertBefore(g, head); arms[name]=g; };
  if(srcArmR){
    const mL=mkG('rig-arm-mirror'); mL.setAttribute('transform',`translate(${2*headC[0]} 0) scale(-1 1)`); mL.appendChild(srcArmR.cloneNode(true));
    armPose('neutral', mL, srcArmR.cloneNode(true));
    armPose('thumbsup', srcArmL?srcArmL.cloneNode(true):null, srcArmR.cloneNode(true));
  }

  const cfg={ headX:22, headY:16, headTilt:7, gazeYaw:38, gazePitch:26,
              constrainEye:0, constrainMouth:1,      // 0=free swing to edge, 1=sphere-constrained
              browDrop:3, breathScale:0.02, torsoExpand:0.14, breathBob:3, lean:6,
              grab:{ surprise:{ mouth:1, eye:1, brow:0 },
                     thoughtful:{ mouth:1, eye:0.5, brow:1 },
                     confused:{ mouth:1, eye:0.5, brow:1 } } };   // emotion x part grab matrix (see emo())
  const p={ headX:0, headY:0, headTilt:0, gazeX:0, gazeY:0,
            eyeOpenL:1, eyeOpenR:1, expr:1, surprise:0, thoughtful:0, confused:0, clown:0, hands:'neutral', breath:0.5, bodyLean:0, energy:1 };

  const X=(el,t)=>el.setAttribute('transform',t);
  function flush(){
    const e=clamp(p.expr,-1,1), lv={surprise:clamp(p.surprise,0,1), thoughtful:clamp(p.thoughtful,0,1), confused:clamp(p.confused,0,1)};
    for(const mn in MODS) lv[mn]=clamp(p[mn]||0,0,1);      // modifier morph levels (also drive their add zooms below)
    setEye('l', e, lv, 1-clamp(p.eyeOpenL,0,1));
    setEye('r', e, lv, 1-clamp(p.eyeOpenR,0,1));
    setMouth(e,lv); setBrow('l',e,lv); setBrow('r',e,lv);
    // gaze/head-turn: reproject each face feature on the head sphere (translate + foreshorten)
    const yaw=clamp(p.gazeX,-1,1)*cfg.gazeYaw*Math.PI/180, pitch=clamp(p.gazeY,-1,1)*cfg.gazePitch*Math.PI/180;
    // k = latitude constraint: 0 = free swing (reaches silhouette), 1 = true sphere (stays inside at its height)
    const sphere=(bx,by,dip,k)=>{
      const dx=bx-headC[0], dy=by-headC[1];
      const mu=Math.asin(clamp(dy/Ry,-1,1));
      const hr=1-k*(1-Math.cos(mu));                    // horizontal-circle shrink at rest latitude
      const la=Math.asin(clamp(dx/(Rx*hr),-1,1));
      const l2=la+yaw, m2=mu+pitch, hr2=1-k*(1-Math.cos(m2));
      const nx=headC[0]+Rx*hr2*Math.sin(l2), ny=headC[1]+Ry*Math.sin(m2)+(dip||0);
      const sx=(Math.cos(l2)*hr2)/Math.max(Math.cos(la)*hr,1e-3), sy=Math.cos(m2)/Math.max(Math.cos(mu),1e-3);
      return `translate(${nx} ${ny}) scale(${sx} ${sy}) translate(${-bx} ${-by})`;
    };
    X(eyeG.l, sphere(eyeBase.l[0],eyeBase.l[1],0,cfg.constrainEye));
    X(eyeG.r, sphere(eyeBase.r[0],eyeBase.r[1],0,cfg.constrainEye));
    X(mouthP, sphere(mouthBase[0],mouthBase[1],0,cfg.constrainMouth));
    X(browG.l, sphere(browBase.l[0],browBase.l[1],(1-clamp(p.eyeOpenL,0,1))*cfg.browDrop,cfg.constrainEye));
    X(browG.r, sphere(browBase.r[0],browBase.r[1],(1-clamp(p.eyeOpenR,0,1))*cfg.browDrop,cfg.constrainEye));
    const bob=(p.breath-0.5)*cfg.breathBob;
    X(head, `translate(${p.headX*cfg.headX} ${p.headY*cfg.headY-bob}) rotate(${p.headTilt*cfg.headTilt} ${neck[0]} ${neck[1]})`);
    const bs=1+(p.breath-0.5)*cfg.breathScale;           // head: old subtle vertical breath
    X(body, `rotate(${p.bodyLean*cfg.lean} ${feet[0]} ${feet[1]}) translate(${belly[0]} ${belly[1]}) scale(1 ${bs}) translate(${-belly[0]} ${-belly[1]})`);
    const tsx=1+(p.breath-0.5)*cfg.torsoExpand;          // torso: expand horizontally with the inhale
    $('win-torso')&&X($('win-torso'), `translate(${torsoC[0]} ${torsoC[1]}) scale(${tsx} 1) translate(${-torsoC[0]} ${-torsoC[1]})`);
    for(const n in arms) arms[n].style.display=(p.hands===n)?'':'none';   // hand pose swap
    for(const mn in MODADD){ const L=lv[mn];               // each add zooms in from nothing, staggered
      for(const it of MODADD[mn]){ const z=smooth01((L-it.a)/ZOOM_SPAN);
        it.zg.setAttribute('transform',`translate(${it.c[0]} ${it.c[1]}) scale(${z.toFixed(4)}) translate(${-it.c[0]} ${-it.c[1]})`); } }
  }
  let raf=requestAnimationFrame(function loop(){flush(); raf=requestAnimationFrame(loop);});

  // ---- scripted actions ----
  const anims=new Set();
  function drive(dur,fn){ const t0=performance.now(); const a={};
    a.step=now=>{const k=(now-t0)/dur; if(k>=1){fn(1);anims.delete(a);return;} fn(k);}; anims.add(a); }
  (function tick(now){ for(const a of[...anims]) a.step(now); requestAnimationFrame(tick); })(performance.now());
  const easeShut=k=> k<0.4 ? 1-k/0.4 : k<0.55 ? 0 : (k-0.55)/0.45;
  function blink(D=200){ drive(D,k=>{const eo=clamp(easeShut(k),0,1); p.eyeOpenL=eo; p.eyeOpenR=eo;}); }
  function wink(side='l',D=260){ const key='eyeOpen'+side.toUpperCase(); drive(D,k=>{p[key]=clamp(easeShut(k),0,1);}); }

  // ---- idle behaviour ----
  let idleOn=false, tBlink=0, phase=Math.random()*6, gT=[0,0], tGaze=0, focusT=null, focusUntil=0;
  (function idleLoop(now){
    const focusing = focusT && now<focusUntil;                 // a lookAt() glance holds the gaze
    if(idleOn){
      phase+=1/60; p.breath=0.5+0.45*Math.sin(phase*2*Math.PI/3.6);
      if(now>tBlink){ blink(); if(Math.random()<0.22) setTimeout(blink,240); tBlink=now+2000+Math.random()*4000; }
      if(now>tGaze && !focusing){ gT=[(Math.random()*2-1)*0.7,(Math.random()*2-1)*0.5]; tGaze=now+1400+Math.random()*3000; }
    }
    if(idleOn || focusing){
      const tgt = focusing ? focusT : gT, g = focusing ? 0.20 : 0.06;   // snap toward a focus, drift in idle
      p.gazeX+=(tgt[0]-p.gazeX)*g; p.gazeY+=(tgt[1]-p.gazeY)*g;
      p.headX+=(tgt[0]*0.35-p.headX)*(g*0.5); p.headY+=(tgt[1]*0.3-p.headY)*(g*0.5);
    }
    if(focusT && now>=focusUntil) focusT=null;                 // glance over -> idle wander resumes
    requestAnimationFrame(idleLoop);
  })(performance.now());
  function idle(on){ idleOn=on; if(!on) tBlink=0; }
  // glance at a direction in gaze units (-1..1) and hold `hold` ms before the idle wander takes over again
  function lookAt(gx,gy,hold=700){ focusT=[clamp(gx,-1,1),clamp(gy,-1,1)]; focusUntil=performance.now()+hold; tGaze=focusUntil+200; }

  return { p, cfg, flush, blink, wink, idle, lookAt, headC, pivots:{neck,feet,belly}, stop:()=>cancelAnimationFrame(raf) };
}
if(typeof module!=='undefined') module.exports={createRig};
