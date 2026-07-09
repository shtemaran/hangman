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
  const MOUTH_MORPH_END=0.5;                               // mouth finishes morphing by here, so the lipstick add can wait for it

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
    for(const mn in MODS){ const raw=clamp(lv[mn]||0,0,1), V=MODS[mn].versions&&MODS[mn].versions[slot]; if(raw<=0||!V) continue;
      const Wv=V[exprKey(e)]||V[Object.keys(V)[0]]; if(!Wv) continue;
      const L = part==='mouth' ? clamp(raw/MOUTH_MORPH_END,0,1) : raw;    // mouth morphs faster (done before the lipstick appears)
      P=P.map((p,i)=>[ p[0]+L*(Wv[i][0]-p[0]), p[1]+L*(Wv[i][1]-p[1]) ]); }
    return P; };
  const setEye=(s,e,lv,openW)=>{ let P=emo('eye-'+s,e,lv); if(openW>0)P=lerpA(P,T['eye-'+s].shut,openW); eyeP[s].setAttribute('d',pathD(P)); };
  const setMouth=(e,lv)=>mouthP.setAttribute('d',pathD(emo('mouth',e,lv)));
  const setBrow=(s,e,lv)=>browP[s].setAttribute('d',pathD(emo('brow-'+s,e,lv)));
  setBrow('l',1,{}); setBrow('r',1,{}); setEye('l',1,{},0); setEye('r',1,{},0); setMouth(1,{});

  // ---- modifier "adds": extra features drawn on the face (placed via head-aligned transform),
  //      each zooming in from nothing as the modifier level rises (staggered, so they pop in one by one).
  const smooth01=u=>{u=clamp(u,0,1); return u*u*(3-2*u);};
  const ZOOM_SPAN=0.5;   // adds zoom over ~half the level, staggered; the lipstick waits for the mouth morph
  const MODADD={};   // name -> [{rg,zg, c:[x,y], gaze, a:staggerStart}]  (adds are in win-local face coords)
  for(const mn in MODS){ const m=MODS[mn]; if(!m.adds) continue;
    const overG=mkG('rig-mod-'+mn); head.appendChild(overG);                 // adds ON TOP of the face
    const underG=mkG('rig-mod-'+mn+'-under'); head.insertBefore(underG, head.children[1]||null);  // `below` adds go under the features (occlude head, keep brows)
    const bodyG=mkG('rig-mod-'+mn+'-body'); body.insertBefore(bodyG, head);  // `body` adds ride the torso/neck (behind the head), not the head turn
    let mouthC=null;                                          // clown mouth centre — the lipstick grows from a point here
    if(m.versions&&m.versions.mouth){ const v=Object.values(m.versions.mouth)[0];
      mouthC=[v.reduce((s,p)=>s+p[0],0)/v.length, v.reduce((s,p)=>s+p[1],0)/v.length]; }
    const addPath=(par,sp)=>{ const pp=document.createElementNS(NS,'path');   // one occluder/front sub-path, kept as-is
      pp.setAttribute('fill',sp.fill); if(sp.rule)pp.setAttribute('fill-rule',sp.rule); if(sp.tf)pp.setAttribute('transform',sp.tf); pp.setAttribute('d',sp.d); par.appendChild(pp); };
    const labels=Object.keys(m.adds); MODADD[mn]=labels.map((lb,i)=>{ const a=m.adds[lb];
      const rg=document.createElementNS(NS,'g'), zg=document.createElementNS(NS,'g');
      let beads=null, cx=0, refG=null, srcC=null, occZg=null;
      if(a.mirror){                                             // this add = another add reflected across the head centre (e.g. left ear from right)
        const srcA=m.adds[a.mirror]; srcC=srcA.c;
        refG=document.createElementNS(NS,'g'); (srcA.paths||[]).forEach(sp=>addPath(refG,sp)); zg.appendChild(refG);
      }
      else if(a.occHead && a.paths){                            // occluder(white) UNDER the features (head only) + ink on top — both raw, both zoom
        occZg=document.createElementNS(NS,'g'); const occRg=document.createElementNS(NS,'g'); occRg.id='rig-mod-'+mn+'-'+lb+'-occ'; occRg.appendChild(occZg); underG.appendChild(occRg);
        a.paths.forEach(sp=> addPath(sp.fill==='#ffffff'?occZg:zg, sp));
      }
      else if(a.beads){                                         // necklace: each bead its own group so it can ride a deforming curve
        beads=a.beads.map(b=>{ const g=document.createElementNS(NS,'g'); b.paths.forEach(sp=>addPath(g,sp)); zg.appendChild(g); return {g, c:b.c}; });
        const x0=beads[0].c[0], x1=beads[beads.length-1].c[0], y0=beads[0].c[1], y1=beads[beads.length-1].c[1];
        cx=(x0+x1)/2; beads.forEach(b=>{ const t=(x1-x0)?(b.c[0]-x0)/(x1-x0):0; b.sag=b.c[1]-(y0+t*(y1-y0)); });  // sag = drop below the end-to-end chord
      }
      else if(a.paths){ a.paths.forEach(sp=>addPath(zg,sp)); }
      else { const pth=document.createElementNS(NS,'path'); pth.setAttribute('fill',a.fill||'#081C1A'); pth.setAttribute('d',a.d); zg.appendChild(pth); }
      rg.id='rig-mod-'+mn+'-'+lb; rg.appendChild(zg);
      (a.gaze==='body'?bodyG : a.below?underG:overG).appendChild(rg);
      return {rg, zg, c:a.mirror?null:a.c, zc:a.mirror?null:((lb==='lipstick'&&mouthC)?mouthC:a.c), gaze:a.gaze||'eye', dy:a.dy||0, z:a.z||0,
              base:a.base, tip:a.tip, beads, cx, refG, srcC, mirror:a.mirror||null, clip:(a.clip==null?null:a.clip), earY:(a.earY==null?null:a.earY), occZg,   // tube-trunk; necklace; mirror; ear clip; ear Y-scale; under-features occluder zoom
              a: lb==='lipstick' ? MOUTH_MORPH_END : (labels.length>1? i/(labels.length-1)*0.5 : 0) }; });   // lipstick waits for the mouth morph
  }

  // base face slots a modifier hides (e.g. the horse hides the base mouth — its own mouth rides the snout)
  const hideEl={ mouth:mouthP, 'eye-l':eyeG.l, 'eye-r':eyeG.r, 'brow-l':browG.l, 'brow-r':browG.r };
  const HIDE={};   // slot -> [modifier names that hide it]
  for(const mn in MODS){ for(const s of (MODS[mn].hide||[])) (HIDE[s]=HIDE[s]||[]).push(mn); }
  // eyefx: a modifier shrinks+shifts the base eyes (e.g. nerd lens refraction). slot -> [{mn, c, s}]
  const EYEFX={};
  for(const mn in MODS){ const fx=MODS[mn].eyefx; if(!fx) continue;
    for(const slot in fx) (EYEFX[slot]=EYEFX[slot]||[]).push({mn, c:fx[slot].c, s:fx[slot].s}); }

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
              snoutZ:190,                            // how far the horse muzzle plate sticks out (parallax depth)
              earClip:0.3,                            // gazeX past which an earring on the receding side hard-disappears
              neckBreath:0.22,                        // necklace: how much the bead curve stretches wide / sags with the breath
              grab:{ surprise:{ mouth:1, eye:1, brow:0 },
                     thoughtful:{ mouth:1, eye:0.5, brow:1 },
                     confused:{ mouth:1, eye:0.5, brow:1 } } };   // emotion x part grab matrix (see emo())
  const p={ headX:0, headY:0, headTilt:0, gazeX:0, gazeY:0,
            eyeOpenL:1, eyeOpenR:1, expr:1, surprise:0, thoughtful:0, confused:0, clown:0, king:0, nerd:0, girl:0, sailor:0, hands:'neutral', breath:0.5, bodyLean:0, energy:1 };

  const X=(el,t)=>el.setAttribute('transform',t);
  function flush(){
    const e=clamp(p.expr,-1,1), lv={surprise:clamp(p.surprise,0,1), thoughtful:clamp(p.thoughtful,0,1), confused:clamp(p.confused,0,1)};
    for(const mn in MODS) lv[mn]=clamp(p[mn]||0,0,1);      // raw modifier level (emo remaps the mouth to morph faster)
    setEye('l', e, lv, 1-clamp(p.eyeOpenL,0,1));
    setEye('r', e, lv, 1-clamp(p.eyeOpenR,0,1));
    setMouth(e,lv); setBrow('l',e,lv); setBrow('r',e,lv);
    // gaze/head-turn: reproject each face feature on the head sphere (translate + foreshorten)
    const yaw=clamp(p.gazeX,-1,1)*cfg.gazeYaw*Math.PI/180, pitch=clamp(p.gazeY,-1,1)*cfg.gazePitch*Math.PI/180;
    // k = latitude constraint: 0 = free swing (reaches silhouette), 1 = true sphere (stays inside at its height)
    const spherePt=(bx,by,dip,k,ya,pi)=>{               // where a point on the head sphere lands (centre only)
      if(ya===undefined)ya=yaw; if(pi===undefined)pi=pitch;
      const dx=bx-headC[0], dy=by-headC[1];
      const mu=Math.asin(clamp(dy/Ry,-1,1));
      const hr=1-k*(1-Math.cos(mu));                    // horizontal-circle shrink at rest latitude
      const la=Math.asin(clamp(dx/(Rx*hr),-1,1));
      const l2=la+ya, m2=mu+pi, hr2=1-k*(1-Math.cos(m2));
      const nx=headC[0]+Rx*hr2*Math.sin(l2), ny=headC[1]+Ry*Math.sin(m2)+(dip||0);
      const sx=(Math.cos(l2)*hr2)/Math.max(Math.cos(la)*hr,1e-3), sy=Math.cos(m2)/Math.max(Math.cos(mu),1e-3);
      return [nx,ny,sx,sy];
    };
    const sphere=(bx,by,dip,k)=>{ const [nx,ny,sx,sy]=spherePt(bx,by,dip,k);
      return `translate(${nx} ${ny}) scale(${sx} ${sy}) translate(${-bx} ${-by})`; };
    X(eyeG.l, sphere(eyeBase.l[0],eyeBase.l[1],0,cfg.constrainEye));
    X(eyeG.r, sphere(eyeBase.r[0],eyeBase.r[1],0,cfg.constrainEye));
    for(const s of ['l','r']){ const list=EYEFX['eye-'+s];   // lens refraction: shrink+shift the eye inside its sphere group
      if(!list){ continue; } let best=null,L=0;
      for(const fx of list){ const l=clamp(p[fx.mn]||0,0,1); if(l>L){L=l;best=fx;} }
      const cb=eyeBase[s];
      if(!best||L<=0){ eyeP[s].removeAttribute('transform'); }
      else{ const sL=1+L*(best.s-1), cx=cb[0]+L*(best.c[0]-cb[0]);   // shift on X only; keep the eye at its base height
        eyeP[s].setAttribute('transform',`translate(${cx} ${cb[1]}) scale(${sL}) translate(${-cb[0]} ${-cb[1]})`); } }
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
    for(const s in HIDE){ const el=hideEl[s]; if(!el) continue;            // fade out base slots a modifier replaces
      let vis=1; for(const mn of HIDE[s]) vis*=1-clamp(p[mn]||0,0,1); el.style.opacity=vis; }
    // rigid plane at depth z sticking out of the head, rotating WITH the head (parallax — it swings
    // further than the head surface). Used big for the horse muzzle, small for the nerd glasses.
    const cY=Math.cos(yaw), sY=Math.sin(yaw), cP=Math.cos(pitch), sP=Math.sin(pitch), Z=cfg.snoutZ;
    const planeAt=(z,dy)=>`translate(${(headC[0]+z*sY).toFixed(2)} ${(headC[1]+z*cY*sP+(dy||0)).toFixed(2)}) matrix(${cY.toFixed(4)} ${(-sY*sP).toFixed(4)} 0 ${cP.toFixed(4)} 0 0) translate(${(-headC[0]).toFixed(2)} ${(-headC[1]).toFixed(2)})`;
    const plane=(x,y)=>{ const dx=x-headC[0], dy=y-headC[1];             // where a snoutZ muzzle-plate point lands
      return [headC[0]+Z*sY + cY*dx, headC[1]+Z*cY*sP + (-sY*sP)*dx + cP*dy]; };
    const planeTf=planeAt(Z,0);
    // trunk bridge: base rides the head sphere (like the mouth), tip follows the muzzle plate; stretch/
    // rotate between the two live points (scale along the axis, keep perpendicular width) — solid join.
    const trunkTf=it=>{ const b=it.base, r=it.tip; if(!b||!r) return '';
      const bl=spherePt(b[0],b[1],0,cfg.constrainMouth), t=plane(r[0],r[1]);   // live base / live tip
      const vx=r[0]-b[0], vy=r[1]-b[1], wx=t[0]-bl[0], wy=t[1]-bl[1];
      const tv=Math.atan2(vy,vx), tw=Math.atan2(wy,wx), s=Math.hypot(wx,wy)/Math.max(Math.hypot(vx,vy),1e-3);
      const cv=Math.cos(tv), sv=Math.sin(tv), cw=Math.cos(tw), sw=Math.sin(tw);
      // L = R(tw) * diag(s,1) * R(-tv)  — rotate axis onto x, stretch x by s, rotate to the new axis
      const a00=cw*s*cv+sw*sv, a01=cw*s*sv-sw*cv, a10=sw*s*cv-cw*sv, a11=sw*s*sv+cw*cv;
      return `translate(${bl[0].toFixed(2)} ${bl[1].toFixed(2)}) matrix(${a00.toFixed(4)} ${a10.toFixed(4)} ${a01.toFixed(4)} ${a11.toFixed(4)} 0 0) translate(${(-b[0]).toFixed(2)} ${(-b[1]).toFixed(2)})`; };
    // earring: its anchor rides the head sphere like the eyes (coordinate only — translate, no scale/foreshorten);
    // the earring on the receding side hard-disappears once the head turns past cfg.earClip toward it.
    const earTf=it=>{ const [nx,ny]=spherePt(it.c[0],it.c[1],it.dy,cfg.constrainEye), yk=it.earY==null?1:it.earY;
      return `translate(${(nx-it.c[0]).toFixed(2)} ${((ny-it.c[1])*yk).toFixed(2)})`; };   // full X ride, scaled Y motion
    for(const mn in MODADD){ const L=clamp(p[mn]||0,0,1);  // raw level: each add gaze-reprojects + zooms in from nothing (staggered, after the morph)
      for(const it of MODADD[mn]){
        if(it.mirror && !it.c){ it.c=[2*headC[0]-it.srcC[0], it.srcC[1]]; it.zc=it.c;   // reflect the source across the head centre (once)
          it.refG.setAttribute('transform',`matrix(-1 0 0 1 ${(2*headC[0]).toFixed(2)} 0)`); }
        it.rg.setAttribute('transform',
          it.gaze==='tube-front' ? planeTf :                                  // muzzle plate: parallax plane at depth snoutZ
          it.gaze==='plane' ? planeAt(it.z, it.dy) :                          // glasses: plane a small distance in front of the face
          it.gaze==='tube-trunk' ? trunkTf(it) :                              // bridge: stretch base(head)->tip(muzzle)
          it.gaze==='ear' ? earTf(it) :                                       // earring: vertical-only, occlusion below
          (it.gaze==='none'||it.gaze==='tube'||it.gaze==='body') ? '' :       // none = ride the head; body = ride the torso group
          sphere(it.c[0], it.c[1], it.dy, it.gaze==='mouth'?cfg.constrainMouth:cfg.constrainEye));
        if(it.gaze==='ear'){ const side=Math.sign(it.c[0]-headC[0]);                 // this ear/earring's side recedes when gazeX points to it
          it.rg.style.display = side*clamp(p.gazeX,-1,1) > (it.clip==null?cfg.earClip:it.clip) ? 'none' : ''; }  // hard clip past the (per-add) threshold
        if(it.beads){ const s=1+(p.breath-0.5)*cfg.neckBreath;                       // breathe the curve: inhale spreads it wide & lifts the sag
          for(const b of it.beads) b.g.setAttribute('transform',`translate(${((s-1)*(b.c[0]-it.cx)).toFixed(2)} ${(b.sag*(1/s-1)).toFixed(2)})`); }
        const z=smooth01((L-it.a)/ZOOM_SPAN);                  // grow from a point (at zc) to full
        const zt=`translate(${it.zc[0]} ${it.zc[1]}) scale(${z.toFixed(4)}) translate(${-it.zc[0]} ${-it.zc[1]})`;
        it.zg.setAttribute('transform',zt); if(it.occZg) it.occZg.setAttribute('transform',zt); } }   // the under-features occluder zooms in with the ink
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

  return { p, cfg, flush, blink, wink, idle, lookAt, headC, Rx, Ry, pivots:{neck,feet,belly}, stop:()=>cancelAnimationFrame(raf) };
}
if(typeof module!=='undefined') module.exports={createRig};
