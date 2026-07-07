// Marduk character rig. Builds a transform hierarchy at runtime over the flat
// semantic SVG (happy/win character; bars = environment) and exposes normalized
// params. SHAPE (blend-shape morphs) and TRANSFORM (gaze/head/breath) are
// separate layers, so blink + wink + gaze + head-turn + expression all compose.
//
//   const rig = createRig(svgElement, faceTargets);   // faceTargets = face_targets.json
//   rig.p.expr = 0;         // 1 happy · 0 neutral · -1 sad
//   rig.p.eyeOpenL = 0;     // blink/wink (per eye), composes with expr
//   rig.blink(); rig.wink('l'); rig.idle(true);

function createRig(svg, T, hand){
  const NS='http://www.w3.org/2000/svg';
  const $=id=>svg.querySelector('#'+id);
  const mkG=id=>{const g=document.createElementNS(NS,'g'); g.id=id; return g;};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

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
  $('win-hands-l')&&$('win-hands-l').remove();   // left arm becomes the rigged arm; keep original win-hands-r for now
  body.appendChild(head); rootG.appendChild(body);

  // ---- blend-shape helpers (all targets corresponded to the 'happy' topology) ----
  const lerpA=(A,B,t)=>A.map((p,i)=>[p[0]+(B[i][0]-p[0])*t, p[1]+(B[i][1]-p[1])*t]);
  const pathD=P=>{let d=''; for(let i=0;i<P.length;i++) d+=(i?'L':'M')+P[i][0].toFixed(2)+','+P[i][1].toFixed(2)+' '; return d+'Z';};
  const valence=(slot,e)=>{ const t=T[slot]; return e>=0 ? lerpA(t.neutral,t.happy,e)
                                                          : (t.sad?lerpA(t.neutral,t.sad,-e):t.neutral); };
  const emo=(slot,e,su)=>{ let P=valence(slot,e); if(su>0 && T[slot].surprised) P=lerpA(P,T[slot].surprised,su); return P; };
  const setEye=(s,e,su,openW)=>{ let P=emo('eye-'+s,e,su); if(openW>0)P=lerpA(P,T['eye-'+s].shut,openW); eyeP[s].setAttribute('d',pathD(P)); };
  const setMouth=(e,su)=>mouthP.setAttribute('d',pathD(emo('mouth',e,su)));
  const setBrow=(s,e,su)=>browP[s].setAttribute('d',pathD(emo('brow-'+s,e,su)));
  setBrow('l',1,0); setBrow('r',1,0); setEye('l',1,0,0); setEye('r',1,0,0); setMouth(1,0);

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

  // ---- rigged arm+hand (spline bones): shoulder pivot > arm(elbow) > wrist > 5 finger curls ----
  // hand = { arm:{K,deg,polys,rest,bent,xmn,xmx,ymid,elbow}, fingers:{lb:{...}} }; see BONES.md.
  // Placement maps the bone-space shoulder (arm.K) onto the body's shoulder (cfg.armX/Y), scaled+aimed.
  let updateArm=null;
  if(hand && typeof Bones!=='undefined'){
    const B=Bones, arm=hand.arm, ORDER=['thumb','pointer','middle','ring','pinky'];
    const mount=mkG('rig-arm');                                   // bone-space -> body-space placement
    const pivot=mkG('rig-arm-shoulder'); mount.appendChild(pivot);// pure shoulder rotation about arm.K
    const armG=mkG('rig-arm-bone'); armG.setAttribute('transform',`translate(${arm.K[0]} ${arm.K[1]}) rotate(${arm.deg})`);
    const armPath=document.createElementNS(NS,'path'); armPath.setAttribute('fill','#081C1A'); armG.appendChild(armPath); pivot.appendChild(armG);
    const handG=mkG('rig-hand'); pivot.appendChild(handG);        // carries the wrist-frame delta
    const fPath={};
    for(const lb of ORDER){ const f=hand.fingers[lb]; if(!f) continue;
      const g=mkG('rig-finger-'+lb); g.setAttribute('transform',`translate(${f.K[0]} ${f.K[1]}) rotate(${f.deg})`);
      const pth=document.createElementNS(NS,'path'); pth.setAttribute('fill','#081C1A'); g.appendChild(pth); handG.appendChild(g); fPath[lb]=pth; }
    const Ra=arm.deg*Math.PI/180, ca=Math.cos(Ra), sa=Math.sin(Ra);
    const worldTip=t=>{const fr=B.tipFrame(arm,t); return {O:[arm.K[0]+fr.p[0]*ca-fr.p[1]*sa, arm.K[1]+fr.p[0]*sa+fr.p[1]*ca], a:Ra+fr.ang};};
    const T0=worldTip(0);
    body.insertBefore(mount, head);
    let la={sh:NaN,el:NaN,gr:NaN};
    updateArm=(sh,el,gr)=>{
      mount.setAttribute('transform',`translate(${cfg.armX} ${cfg.armY}) scale(${cfg.armScale}) rotate(${cfg.armAim}) translate(${-arm.K[0]} ${-arm.K[1]})`);
      if(sh===la.sh&&el===la.el&&gr===la.gr) return;              // bone deforms only when a channel moved
      armPath.setAttribute('d', B.deform(arm, el));
      const T=worldTip(el), deg=(T.a-T0.a)*180/Math.PI;
      handG.setAttribute('transform',`translate(${T.O[0].toFixed(2)} ${T.O[1].toFixed(2)}) rotate(${deg.toFixed(2)}) translate(${(-T0.O[0]).toFixed(2)} ${(-T0.O[1]).toFixed(2)})`);
      for(const lb of ORDER) if(fPath[lb]) fPath[lb].setAttribute('d', B.deform(hand.fingers[lb], gr));
      pivot.setAttribute('transform',`rotate(${(sh*cfg.armShoulderMax).toFixed(2)} ${arm.K[0]} ${arm.K[1]})`);
      la={sh,el,gr};
    };
  }

  const cfg={ headX:22, headY:16, headTilt:7, gazeYaw:38, gazePitch:26,
              constrainEye:0, constrainMouth:1,      // 0=free swing to edge, 1=sphere-constrained
              browDrop:3, breathScale:0.02, torsoExpand:0.14, breathBob:3, lean:6,
              // rigged arm placement: armX/Y = left-shoulder SHL(328.8,359.2) minus the #win transform,
              // so the bone-space shoulder lands on the body's shoulder inside the win group.
              armX:339.45, armY:385.79, armScale:0.514, armAim:-35, armShoulderMax:100 };
  const p={ headX:0, headY:0, headTilt:0, gazeX:0, gazeY:0,
            eyeOpenL:1, eyeOpenR:1, expr:1, surprise:0, breath:0.5, bodyLean:0, energy:1,
            armShoulder:0, armElbow:0, grip:0 };   // arm: shoulder swing -1..1 · elbow -1..0 · grip 0..1

  const X=(el,t)=>el.setAttribute('transform',t);
  function flush(){
    const e=clamp(p.expr,-1,1), su=clamp(p.surprise,0,1);
    setEye('l', e, su, 1-clamp(p.eyeOpenL,0,1));
    setEye('r', e, su, 1-clamp(p.eyeOpenR,0,1));
    setMouth(e,su); setBrow('l',e,su); setBrow('r',e,su);
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
    if(updateArm) updateArm(clamp(p.armShoulder,-1,1), clamp(p.armElbow,-1,0), clamp(p.grip,0,1));
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
  // arm gestures: enveloped so they rise from and settle back to the rest pose (sin(k*pi): 0->1->0)
  function wave(D=1500){ drive(D,k=>{ const env=Math.sin(k*Math.PI);
    p.grip=0; p.armShoulder=0.35*env; p.armElbow=(-0.35+0.30*Math.sin(k*Math.PI*6))*env; }); }
  function fistpump(D=1300){ drive(D,k=>{ const env=Math.sin(k*Math.PI), pump=Math.abs(Math.sin(k*Math.PI*3));
    p.grip=env>0.12?1:0; p.armShoulder=(0.15+0.25*pump)*env; p.armElbow=(-0.5-0.3*pump)*env; }); }

  // ---- idle behaviour ----
  let idleOn=false, tBlink=0, phase=Math.random()*6, gT=[0,0], tGaze=0;
  (function idleLoop(now){
    if(idleOn){
      phase+=1/60; p.breath=0.5+0.45*Math.sin(phase*2*Math.PI/3.6);
      if(now>tBlink){ blink(); if(Math.random()<0.22) setTimeout(blink,240); tBlink=now+2000+Math.random()*4000; }
      if(now>tGaze){ gT=[(Math.random()*2-1)*0.7,(Math.random()*2-1)*0.5]; tGaze=now+1400+Math.random()*3000; }
      p.gazeX+=(gT[0]-p.gazeX)*0.06; p.gazeY+=(gT[1]-p.gazeY)*0.06;
      p.headX+=(gT[0]*0.35-p.headX)*0.03; p.headY+=(gT[1]*0.3-p.headY)*0.03;
    }
    requestAnimationFrame(idleLoop);
  })(performance.now());
  function idle(on){ idleOn=on; if(!on) tBlink=0; }

  return { p, cfg, flush, blink, wink, wave, fistpump, idle, pivots:{neck,feet,belly}, stop:()=>cancelAnimationFrame(raf) };
}
if(typeof module!=='undefined') module.exports={createRig};
