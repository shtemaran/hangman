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

  // ---- hierarchy: win > body > head > {content (masked), headwear (on top)} ----
  // headContent = the occludable stuff (head shape, face features, on-face adds like clock numbers). A cap/
  // crown's white occluder CUTS this group (mask), and its ink is drawn ABOVE it in `headwear` (unmasked).
  const body=mkG('rig-body'), head=mkG('rig-head');
  const headContent=mkG('rig-head-content'), headwear=mkG('rig-head-wear');
  const faceCore=mkG('rig-face-core');       // head + eyes + brows — a mouth-prop occluder (straw) cuts THIS, not the mouth
  const mouthProps=mkG('rig-mouth-props');   // props in front of the face, BEHIND the mouth (straw)
  head.appendChild(headContent); head.appendChild(headwear);
  headContent.appendChild(faceCore); headContent.appendChild(mouthProps);
  ['win-eyes-l','win-eyes-r','win-eyes-l-blink','win-eyes-r-blink','win-mouth','win-brows-l','win-brows-r']
    .forEach(id=>{const e=$(id); if(e)e.remove();});
  const headMaskG=mkG('rig-head-maskg'); faceCore.appendChild(headMaskG); headMaskG.appendChild($('win-head'));  // win-head-only mask: `occHead` occluders (hats) cut just the head shape, keeping brows/eyes
  const mkFeat=kind=>{ const g=mkG('rig-'+kind), pth=document.createElementNS(NS,'path');
    pth.setAttribute('fill','#081C1A'); pth.id='rig-'+kind+'-shape'; g.appendChild(pth); faceCore.appendChild(g); return [g,pth]; };
  const eyeG={}, eyeP={}, browG={}, browP={};
  for(const s of ['l','r']) [browG[s],browP[s]]=mkFeat('brow-'+s);
  for(const s of ['l','r']) [eyeG[s],eyeP[s]]=mkFeat('eye-'+s);
  const mouthG=mkG('rig-mouth'), mouthP=document.createElementNS(NS,'path'); mouthP.setAttribute('fill','#081C1A'); mouthP.id='rig-mouth-shape';
  mouthG.appendChild(mouthP); headContent.appendChild(mouthG);   // mouth ON TOP of the props (never cut by them); takes gaze + facefx
  const bodyContent=mkG('rig-body-content'); body.appendChild(bodyContent);   // torso + arms — an obese head occluder cuts THIS (body only), not the head
  $('win-torso')&&bodyContent.appendChild($('win-torso'));
  const srcArmR=$('win-hands-r'), srcArmL=$('win-hands-l');   // sources for hand poses (cloned, then removed)
  srcArmR&&srcArmR.remove(); srcArmL&&srcArmL.remove();
  body.appendChild(head); rootG.appendChild(body);

  // ---- blend-shape helpers (all targets corresponded to the 'happy' topology) ----
  const lerpA=(A,B,t)=>A.map((p,i)=>[p[0]+(B[i][0]-p[0])*t, p[1]+(B[i][1]-p[1])*t]);
  const pathD=P=>{let d=''; for(let i=0;i<P.length;i++) d+=(i?'L':'M')+P[i][0].toFixed(2)+','+P[i][1].toFixed(2)+' '; return d+'Z';};
  // perf: skip DOM writes whose value didn't change since last frame — the Chromecast's bottleneck is the
  // style/layout/paint each setAttribute triggers, so a no-op write we avoid is a whole pipeline we avoid.
  // (Defined up here, before setEye's first call at init, so setEye can route through setD too.)
  const X=(el,t)=>{ if(!el||el.__t===t)return; el.__t=t; if(t)el.setAttribute('transform',t); else el.removeAttribute('transform'); };  // transform (dirty-checked; '' -> remove)
  const setD=(el,d)=>{ if(el&&el.__d!==d){ el.__d=d; el.setAttribute('d',d); } };              // path data (dirty-checked)
  const setOp=(el,o)=>{ if(!el)return; o=(+o).toFixed(3); if(el.__o!==o){ el.__o=o; el.style.opacity=o; } };  // opacity (dirty-checked)
  const setDisp=(el,d)=>{ if(el&&el.__ds!==d){ el.__ds=d; el.style.display=d; } };            // display (dirty-checked)
  const r2=x=>Math.round(x*100)/100, r4=x=>Math.round(x*1e4)/1e4;   // round tf coords: short strings, cheaper than toFixed, V8 prints shortest round-trip (no float noise)
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
  const setEye=(s,e,lv,openW)=>{ let P=emo('eye-'+s,e,lv); if(openW>0)P=lerpA(P,T['eye-'+s].shut,openW); setD(eyeP[s],pathD(P)); };  // via setD so eyeP.__d is populated — the executioner's maskEyes mirror it (below)
  const setMouth=(e,lv)=>mouthP.setAttribute('d',pathD(emo('mouth',e,lv)));
  const setBrow=(s,e,lv)=>browP[s].setAttribute('d',pathD(emo('brow-'+s,e,lv)));
  setBrow('l',1,{}); setBrow('r',1,{}); setEye('l',1,{},0); setEye('r',1,{},0); setMouth(1,{});

  // ---- modifier "adds": extra features drawn on the face (placed via head-aligned transform),
  //      each zooming in from nothing as the modifier level rises (staggered, so they pop in one by one).
  const smooth01=u=>{u=clamp(u,0,1); return u*u*(3-2*u);};
  const ZOOM_SPAN=0.5;   // adds zoom over ~half the level, staggered; the lipstick waits for the mouth morph
  const nearestMouthIdx=pt=>{ const M=T.mouth.happy; let bi=0,bd=1e9;   // mouth-outline corner a 'stick' prop attaches to
    for(let i=0;i<M.length;i++){ const d=(M[i][0]-pt[0])**2+(M[i][1]-pt[1])**2; if(d<bd){bd=d;bi=i;} } return bi; };
  const mouthCenX=T.mouth.happy.reduce((s,p)=>s+p[0],0)/T.mouth.happy.length;   // happy mouth centroid
  const mouthCenY=T.mouth.happy.reduce((s,p)=>s+p[1],0)/T.mouth.happy.length;
  const strawBaseOf=d=>{ const n=(d.match(/-?\d+\.?\d*/g)||[]).map(Number); let b=[mouthCenX,mouthCenY],bd=1e9;  // the prop's OWN base = its vertex nearest the mouth
    for(let i=0;i+1<n.length;i+=2){ const dx=n[i]-mouthCenX, dy=n[i+1]-mouthCenY, dd=dx*dx+dy*dy; if(dd<bd){bd=dd;b=[n[i],n[i+1]];} } return b; };
  // occlusion mask: painting WHITE over the head breaks on a textured game bg — instead, occluders CUT the
  // content (black in this mask = transparent there → texture shows through). The mask is on headContent
  // (static, win-local coords), so a headMorph transform on win-head (clock) doesn't drag the cuts out of
  // alignment; and the cut removes EVERY occludable thing under a cap (head shape + clock numbers + …).
  const winHead=$('win-head');
  const defs=document.createElementNS(NS,'defs'), occMask=document.createElementNS(NS,'mask');
  // explicit, huge mask REGION (userSpaceOnUse) — else the browser defaults it to ~the bounding box, and a
  // moving prop at the edge (the straw) slips outside the region and gets clipped. cairosvg ignores this.
  const setRegion=m=>{ m.setAttribute('maskUnits','userSpaceOnUse'); m.setAttribute('x',-5000); m.setAttribute('y',-5000);
    m.setAttribute('width',10000); m.setAttribute('height',10000); };
  occMask.id='rig-occ-mask'; setRegion(occMask);
  const mRect=document.createElementNS(NS,'rect'); mRect.setAttribute('x',-5000); mRect.setAttribute('y',-5000);
  mRect.setAttribute('width',10000); mRect.setAttribute('height',10000); mRect.setAttribute('fill','#fff');
  const occCuts=mkG('rig-occ-cuts'); occMask.appendChild(mRect); occMask.appendChild(occCuts);
  defs.appendChild(occMask); svg.appendChild(defs);
  headContent.setAttribute('mask','url(#rig-occ-mask)');
  // a second mask on faceCore (head+eyes+brows only) — a mouth prop (straw) cuts THIS, so it occludes
  // everything except the mouth (which lives above faceCore) and the props/adds in front of it.
  const strawMask=document.createElementNS(NS,'mask'); strawMask.id='rig-straw-mask'; setRegion(strawMask);
  const sRect=mRect.cloneNode(true); const strawCuts=mkG('rig-straw-cuts');
  strawMask.appendChild(sRect); strawMask.appendChild(strawCuts); occMask.parentNode.appendChild(strawMask);
  faceCore.setAttribute('mask','url(#rig-straw-mask)');
  // a third mask on win-head only — `occHead` occluders (hat brims / crowns) cut just the HEAD SHAPE, so they
  // never eat a brow/eye the brim overlaps, nor a mouth prop below (fixes hair-over-brow + straw clipping).
  const headMask=document.createElementNS(NS,'mask'); headMask.id='rig-head-mask'; setRegion(headMask);
  const hRect=mRect.cloneNode(true); const headCuts=mkG('rig-head-cuts');
  headMask.appendChild(hRect); headMask.appendChild(headCuts); occMask.parentNode.appendChild(headMask);
  headMaskG.setAttribute('mask','url(#rig-head-mask)');
  // a mask on bodyContent (torso + arms) — an obese head occluder cuts the BODY where the wide head hangs
  // over it, without touching the head/face.
  const bodyMask=document.createElementNS(NS,'mask'); bodyMask.id='rig-body-mask'; setRegion(bodyMask);
  const bRect=mRect.cloneNode(true); const bodyCuts=mkG('rig-body-cuts');
  bodyMask.appendChild(bRect); bodyMask.appendChild(bodyCuts); occMask.parentNode.appendChild(bodyMask);
  bodyContent.setAttribute('mask','url(#rig-body-mask)');
  const mkCut=(sp,par)=>{ const pp=document.createElementNS(NS,'path'); pp.setAttribute('fill','#000');
    if(sp.rule)pp.setAttribute('fill-rule',sp.rule); if(sp.tf)pp.setAttribute('transform',sp.tf); pp.setAttribute('d',sp.d); par.appendChild(pp); return pp; };
  // a modifier is "headwear" if any of its adds carries a white occluder — its rigid (none/ear) inks then
  // draw in the top `headwear` layer (above other modifiers' content) and its occluders cut the content.
  const isHeadwear=m=>{ const ad=(MODS[m]&&MODS[m].adds)||{};
    for(const k in ad){ const a=ad[k]; if(a.cover) return true; if(a.fill==='#ffffff') return true; if(a.paths&&a.paths.some(p=>p.fill==='#ffffff')) return true; } return false; };

  const MODADD={};   // name -> [{rg,zg, c:[x,y], gaze, a:staggerStart}]  (adds are in win-local face coords)
  for(const mn in MODS){ const m=MODS[mn]; if(!m.adds) continue;
    const overG=mkG('rig-mod-'+mn); headContent.appendChild(overG);          // on-face adds (masked content, on top of the features)
    const underG=mkG('rig-mod-'+mn+'-under'); headContent.insertBefore(underG, headContent.children[1]||null);  // below the features (still masked content)
    const wearG=mkG('rig-mod-'+mn+'-wear'); headwear.appendChild(wearG);      // headwear ink (caps/crown/ears) — above ALL content, unmasked
    const bodyG=mkG('rig-mod-'+mn+'-body'); body.insertBefore(bodyG, head);   // `body` adds ride the torso/neck (behind the head), not the head turn
    const modHW=isHeadwear(mn);
    let mouthC=null;                                          // clown mouth centre — the lipstick grows from a point here
    if(m.versions&&m.versions.mouth){ const v=Object.values(m.versions.mouth)[0];
      mouthC=[v.reduce((s,p)=>s+p[0],0)/v.length, v.reduce((s,p)=>s+p[1],0)/v.length]; }
    const addPath=(par,sp)=>{ const pp=document.createElementNS(NS,'path');   // one occluder/front sub-path, kept as-is
      pp.setAttribute('fill',sp.fill); if(sp.rule)pp.setAttribute('fill-rule',sp.rule); if(sp.tf)pp.setAttribute('transform',sp.tf); pp.setAttribute('d',sp.d); par.appendChild(pp); };
    const labels=Object.keys(m.adds); MODADD[mn]=labels.map((lb,i)=>{ const a=m.adds[lb];
      const rg=document.createElementNS(NS,'g'), zg=document.createElementNS(NS,'g');
      let beads=null, cx=0, refG=null, srcC=null, occZg=null, wrapP=null;
      // white occluders on head-riding adds CUT the head (transparent) instead of painting white; the cut
      // group rides the SAME transform as the add so it tracks caps/crown/ears. (not body — necklace beads deform.)
      const gz=a.gaze||'eye', doCut = gz==='none'||gz==='ear'||a.occ;
      const cutParent = a.occTarget==='body' ? bodyCuts : gz==='stick' ? strawCuts : (a.occHead||gz==='wrap') ? headCuts : occCuts;  // body (obese)/faceCore(straw)/head-only(hats)/full content
      const cutG=doCut?mkG('rig-cut-'+mn+'-'+lb):null; if(cutG) cutParent.appendChild(cutG);
      const put=(sp,inkTarget)=>{ if(doCut && sp.fill==='#ffffff') mkCut(sp,cutG); else addPath(inkTarget,sp); };
      let cutRefG=null;
      if(a.mirror){                                             // this add = another add reflected across the head centre (e.g. left ear from right)
        const srcA=m.adds[a.mirror]; srcC=srcA.c;
        refG=document.createElementNS(NS,'g'); if(cutG){ cutRefG=document.createElementNS(NS,'g'); cutG.appendChild(cutRefG); }
        (srcA.paths||[]).forEach(sp=> sp.fill==='#ffffff'&&cutRefG ? mkCut(sp,cutRefG) : addPath(refG,sp)); zg.appendChild(refG);  // cut reflected via cutRefG, same as the ink via refG
      }
      else if(a.contours){                                      // 'wrap': one path (outer + hole contours) whose vertices reproject on the head sphere each frame.
        // nonzero (NOT evenodd): when the shape wraps hard and folds over itself near the silhouette, same-
        // winding overlaps must STAY filled (winding number adds); the opposite-wound hole still subtracts.
        wrapP=document.createElementNS(NS,'path'); wrapP.setAttribute('fill',a.fill||'#081C1A'); wrapP.setAttribute('fill-rule','nonzero'); zg.appendChild(wrapP);
        if(a.occ&&cutG) mkCut({d:a.occ, fill:'#ffffff', rule:'nonzero'}, cutG);   // STATIC head-only occluder (no reproject — cutG gets tf='' for wrap)
      }
      else if(a.beads){                                         // necklace: each bead its own group so it can ride a deforming curve
        beads=a.beads.map(b=>{ const g=document.createElementNS(NS,'g'); b.paths.forEach(sp=>addPath(g,sp)); zg.appendChild(g); return {g, c:b.c}; });
        const x0=beads[0].c[0], x1=beads[beads.length-1].c[0], y0=beads[0].c[1], y1=beads[beads.length-1].c[1];
        cx=(x0+x1)/2; beads.forEach(b=>{ const t=(x1-x0)?(b.c[0]-x0)/(x1-x0):0; b.sag=b.c[1]-(y0+t*(y1-y0)); });  // sag = drop below the end-to-end chord
      }
      else if(a.paths){ a.paths.forEach(sp=>put(sp,zg)); }      // occluder+front / stack: white parts cut, ink drawn
      else if(doCut && a.fill==='#ffffff'){ mkCut({d:a.d, fill:'#ffffff', rule:'evenodd'}, cutG); }  // pure white occluder (king crown) -> cut
      else if(a.cover){ const pth=document.createElementNS(NS,'path'); pth.setAttribute('fill',a.fill||'#081C1A'); pth.setAttribute('d',a.d); zg.appendChild(pth);  // solid hood: ink on top (wearG)…
        if(cutG) mkCut({d:a.d, fill:'#081C1A', rule:'evenodd'}, cutG); }        // …and cut the head by its own silhouette (full cover)
      else { const pth=document.createElementNS(NS,'path'); pth.setAttribute('fill',a.fill||'#081C1A'); pth.setAttribute('d',a.d); zg.appendChild(pth);  // plain ink…
        if(a.occ&&cutG) mkCut({d:a.occ, fill:'#ffffff', rule:'nonzero'}, cutG); }   // …+ its occluder cut (stick→faceCore, obese head→body)
      rg.id='rig-mod-'+mn+'-'+lb; rg.appendChild(zg);
      const toWear = (modHW && (gz==='none'||gz==='ear')) || gz==='wrap';   // headwear ink / a wrapped shape (beard) -> top layer, above the mouth
      (a.asHead?headMaskG : a.gaze==='body'?bodyG : toWear?wearG : gz==='stick'?mouthProps : a.below?underG:overG).appendChild(rg);   // asHead -> behind the features (as the head shape)
      return {rg, zg, cutG, cutRefG, c:a.mirror?null:a.c, zc:a.mirror?null:((lb==='lipstick'&&mouthC)?mouthC:a.c), gaze:a.gaze||'eye', dy:a.dy||0, z:a.z||0,
              base:a.base, tip:a.tip, beads, cx, refG, srcC, mirror:a.mirror||null, clip:(a.clip==null?null:a.clip), earY:(a.earY==null?null:a.earY), occZg,   // tube-trunk; necklace; mirror; ear clip; ear Y-scale; under-features occluder zoom
              pivot:a.pivot, ang:a.angle, role:a.role, fade:a.fade||false,   // clock hand: pivot/angle/role; fade = opacity crossfade reveal
              wrapP, contours:a.contours||null,                              // 'wrap': the beard path + its win-local contours (reprojected per-vertex each frame)
              t:a.t, headBottom:a.headBottom,                                // 'chin': ratio + head-bottom point for the mouth->head-bottom anchor
              // 'stick' prop: its own base point, the two mouth corners it hangs from, + eased flip state
              strawBase:(a.gaze==='stick')?strawBaseOf(a.d):null,
              rightIdx:(a.gaze==='stick')?nearestMouthIdx(a.c):null,
              leftIdx:(a.gaze==='stick')?nearestMouthIdx([2*mouthCenX-a.c[0],a.c[1]]):null, _ft:1, _fc:1,
              a: lb==='lipstick' ? MOUTH_MORPH_END : (labels.length>1? i/(labels.length-1)*0.5 : 0) }; });   // lipstick waits for the mouth morph
  }

  // base face slots a modifier hides (e.g. the horse hides the base mouth — its own mouth rides the snout)
  const hideEl={ mouth:mouthG, 'eye-l':eyeG.l, 'eye-r':eyeG.r };   // brows hide by zoom (below), not opacity
  const HIDE={};   // slot -> [modifier names that hide it]
  for(const mn in MODS){ for(const s of (MODS[mn].hide||[])) (HIDE[s]=HIDE[s]||[]).push(mn); }
  // eyefx: a modifier shrinks+shifts the base eyes (e.g. nerd lens refraction). slot -> [{mn, c, s}]
  const EYEFX={};
  for(const mn in MODS){ const fx=MODS[mn].eyefx; if(!fx) continue;
    for(const slot in fx) (EYEFX[slot]=EYEFX[slot]||[]).push({mn, c:fx[slot].c, s:fx[slot].s}); }
  // facefx: reposition + resize a base feature (eyes AND mouth), full 2D, keeping its shape so emotions still morph it
  const FACEFX={};
  for(const mn in MODS){ const fx=MODS[mn].facefx; if(!fx) continue;
    for(const slot in fx) (FACEFX[slot]=FACEFX[slot]||[]).push({mn, c:fx[slot].c, s:fx[slot].s}); }
  const HEADMORPH={}; for(const mn in MODS){ if(MODS[mn].headMorph) HEADMORPH[mn]=MODS[mn].headMorph; }   // scale/reshape the head (clock rim / hood dome)
  // maskEyes: a modifier draws the base eyes WHITE on top of its hood, so they read as glowing eye-holes
  // and still morph with expression/blink. (The real eyes underneath get cut away by the hood.)
  const MASKEYES=[]; for(const mn in MODS){ if(MODS[mn].maskEyes) MASKEYES.push(mn); }
  const MOUTHDY=[]; for(const mn in MODS){ if(MODS[mn].mouthDy) MOUTHDY.push({mn, dy:MODS[mn].mouthDy}); }   // shift the mouth down (priest: into the beard opening)
  const REPLACEHEAD=[]; for(const mn in MODS){ if(MODS[mn].replaceHead) REPLACEHEAD.push(mn); }   // fade the base win-head out (an asHead add replaces it, e.g. obese)
  // gaze limit: a modifier can SQUEEZE the head-turn range (e.g. priest ±0.65) — remap, don't clip, so
  // full gaze input still moves, just within a narrower band. Multiple limits -> the tightest wins.
  const GAZELIMX=[], GAZELIMY=[];
  for(const mn in MODS){ if(MODS[mn].gazeLimitX!=null) GAZELIMX.push({mn, lim:MODS[mn].gazeLimitX});
                         if(MODS[mn].gazeLimitY!=null) GAZELIMY.push({mn, lim:MODS[mn].gazeLimitY}); }
  const gazeScale=list=>{ let s=1; for(const g of list) s=Math.min(s, 1-clamp(p[g.mn]||0,0,1)*(1-g.lim)); return s; };
  let maskEyeEls=null;
  if(MASKEYES.length){ maskEyeEls={};
    for(const s of ['l','r']){ const g=mkG('rig-maskeye-'+s), e=document.createElementNS(NS,'path');
      e.setAttribute('fill','#fff'); g.appendChild(e); headwear.appendChild(g); maskEyeEls[s]={g,e}; } }

  // ---- pivots from geometry ----
  const bb=el=>el.getBBox();
  const hb=bb(winHead||head), bd=bb(body);   // head sphere geometry from the head circle only (not the features/mod-adds in the group)
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
    bodyContent.appendChild(g); arms[name]=g; };   // arms live in bodyContent so the obese head occluder cuts them too
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
            eyeOpenL:1, eyeOpenR:1, expr:1, surprise:0, thoughtful:0, confused:0, clown:0, king:0, nerd:0, girl:0, sailor:0, police:0, clock:0, executioner:0, farmer:0, painter:0, priest:0, obese:0, hands:'neutral', breath:0.5, bodyLean:0, energy:1 };

  let _faceSig=null, _oL=null, _oR=null, _mouthPts=null;
  function flush(){
    const e=clamp(p.expr,-1,1), lv={surprise:clamp(p.surprise,0,1), thoughtful:clamp(p.thoughtful,0,1), confused:clamp(p.confused,0,1)};
    for(const mn in MODS) lv[mn]=clamp(p[mn]||0,0,1);      // raw modifier level (emo remaps the mouth to morph faster)
    const oL=1-clamp(p.eyeOpenL,0,1), oR=1-clamp(p.eyeOpenR,0,1);
    // face shapes (emo + pathD) only change with expr / overlay emotions / modifier levels (blink also moves the
    // eyes). Recompute only when that signature changes — idle breath/gaze-wander doesn't touch it. Split so a
    // blink (oL/oR only) rebuilds just the eyes, not the 98-point mouth + brows.
    const sig=e+'|'+Object.values(lv).join(',');          // expr + every overlay/modifier level
    const sigChanged = sig!==_faceSig;
    if(sigChanged){
      _faceSig=sig;
      _mouthPts=emo('mouth',e,lv); setD(mouthP,pathD(_mouthPts));
      setBrow('l',e,lv); setBrow('r',e,lv);
    }
    if(sigChanged || oL!==_oL || oR!==_oR){               // eyes also move on blink (eyeOpen)
      _oL=oL; _oR=oR;
      setEye('l', e, lv, oL); setEye('r', e, lv, oR);
    }
    const mouthPts=_mouthPts;                              // (reused by 'stick' props to track the mouth corner)
    let mcX=0,mcY=0; for(const q of mouthPts){mcX+=q[0];mcY+=q[1];} mcX/=mouthPts.length; mcY/=mouthPts.length;   // live mouth centre
    // gaze/head-turn: reproject each face feature on the head sphere (translate + foreshorten)
    const yaw=clamp(p.gazeX,-1,1)*gazeScale(GAZELIMX)*cfg.gazeYaw*Math.PI/180,     // gaze squeezed by any active gaze-limit modifier (priest)
          pitch=clamp(p.gazeY,-1,1)*gazeScale(GAZELIMY)*cfg.gazePitch*Math.PI/180;
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
    const sphere=(bx,by,dip,k)=>{ const [nx,ny,sx,sy]=spherePt(bx,by,dip,k);   // round to shorten the tf string (faster to build+parse on the weak device); Math.round is ~40% cheaper than toFixed for the same 2dp output
      return `translate(${r2(nx)} ${r2(ny)}) scale(${r4(sx)} ${r4(sy)}) translate(${r2(-bx)} ${r2(-by)})`; };
    // clock: the head is a FLAT disc, not a sphere — features stop reprojecting (fy/fp -> 0) and the
    // whole head foreshortens by cos(yaw)/cos(pitch), so it tilts like a wall clock turning.
    const clockL=clamp(p.clock||0,0,1), fy=yaw*(1-clockL), fp=pitch*(1-clockL);
    const sphereF=(bx,by,dip,k)=>{ const [nx,ny,sx,sy]=spherePt(bx,by,dip,k,fy,fp);
      return `translate(${r2(nx)} ${r2(ny)}) scale(${r4(sx)} ${r4(sy)}) translate(${r2(-bx)} ${r2(-by)})`; };
    X(eyeG.l, sphereF(eyeBase.l[0],eyeBase.l[1],0,cfg.constrainEye));
    X(eyeG.r, sphereF(eyeBase.r[0],eyeBase.r[1],0,cfg.constrainEye));
    // reposition/resize a base feature (eyes X-only via eyefx=nerd; eyes+mouth full-2D via facefx=clock) — keeps its shape so emotions still morph it
    const fxTf=(slot,cb)=>{ let best=null,L=0,xOnly=false;
      for(const fx of (FACEFX[slot]||[])){ const l=clamp(p[fx.mn]||0,0,1); if(l>L){L=l;best=fx;xOnly=false;} }
      for(const fx of (EYEFX[slot]||[])){ const l=clamp(p[fx.mn]||0,0,1); if(l>L){L=l;best=fx;xOnly=true;} }
      if(!best||L<=0) return '';
      const sL=1+L*(best.s-1), cx=cb[0]+L*(best.c[0]-cb[0]), cy=xOnly?cb[1]:cb[1]+L*(best.c[1]-cb[1]);
      return `translate(${cx.toFixed(2)} ${cy.toFixed(2)}) scale(${sL.toFixed(4)}) translate(${(-cb[0]).toFixed(2)} ${(-cb[1]).toFixed(2)})`; };
    for(const s of ['l','r']) X(eyeP[s], fxTf('eye-'+s,eyeBase[s]));
    if(maskEyeEls){ let L=0; for(const mn of MASKEYES) L=Math.max(L,clamp(p[mn]||0,0,1));   // white eyes on top of the hood: mirror the base eyes exactly
      for(const s of ['l','r']){ const me=maskEyeEls[s];
        X(me.g, eyeG[s].__t||'');                                                          // same gaze reproject (cached)
        setD(me.e, eyeP[s].__d||'');                                                       // same (emoting/blinking) shape
        X(me.e, eyeP[s].__t||''); setOp(me.g, L); } }
    let mdy=0; for(const md of MOUTHDY) mdy+=md.dy*clamp(p[md.mn]||0,0,1);   // shift the mouth down (priest) — a translate AFTER the reproject
    X(mouthG, (mdy?`translate(0 ${mdy.toFixed(1)}) `:'')+sphereF(mouthBase[0],mouthBase[1],0,cfg.constrainMouth));
    X(mouthP, fxTf('mouth',mouthBase));
    X(browG.l, sphereF(browBase.l[0],browBase.l[1],(1-clamp(p.eyeOpenL,0,1))*cfg.browDrop,cfg.constrainEye));
    X(browG.r, sphereF(browBase.r[0],browBase.r[1],(1-clamp(p.eyeOpenR,0,1))*cfg.browDrop,cfg.constrainEye));
    const bob=(p.breath-0.5)*cfg.breathBob;
    const dsx=1-clockL*(1-Math.cos(yaw)), dsy=1-clockL*(1-Math.cos(pitch));   // flat-disc foreshorten (clock)
    X(head, `translate(${p.headX*cfg.headX} ${p.headY*cfg.headY-bob}) rotate(${p.headTilt*cfg.headTilt} ${neck[0]} ${neck[1]}) translate(${headC[0]} ${headC[1]}) scale(${dsx.toFixed(4)} ${dsy.toFixed(4)}) translate(${-headC[0]} ${-headC[1]})`);
    const bs=1+(p.breath-0.5)*cfg.breathScale;           // head: old subtle vertical breath
    X(body, `rotate(${p.bodyLean*cfg.lean} ${feet[0]} ${feet[1]}) translate(${belly[0]} ${belly[1]}) scale(1 ${bs}) translate(${-belly[0]} ${-belly[1]})`);
    const tsx=1+(p.breath-0.5)*cfg.torsoExpand;          // torso: expand horizontally with the inhale
    $('win-torso')&&X($('win-torso'), `translate(${torsoC[0]} ${torsoC[1]}) scale(${tsx} 1) translate(${-torsoC[0]} ${-torsoC[1]})`);
    if(winHead){ let hm=null,hmL=0; for(const mn in HEADMORPH){ const l=clamp(p[mn]||0,0,1); if(l>hmL){hmL=l;hm=HEADMORPH[mn];} }  // reshape the head (clock rim / hood dome)
      X(winHead, (hm&&hmL>0) ? `translate(${(hmL*(hm.c[0]-headC[0])).toFixed(2)} ${(hmL*(hm.c[1]-headC[1])).toFixed(2)}) translate(${headC[0]} ${headC[1]}) scale(${(1+hmL*(hm.rx/Rx-1)).toFixed(4)} ${(1+hmL*(hm.ry/Ry-1)).toFixed(4)}) translate(${-headC[0]} ${-headC[1]})` : '');
      let hv=1; for(const mn of REPLACEHEAD) hv*=1-clamp(p[mn]||0,0,1); setOp(winHead, hv); }   // fade the base head out as an obese head replaces it
    for(const s of ['l','r']){ const list=HIDE['brow-'+s], cb=browBase[s];   // eyebrows zoom to nothing when a modifier hides them
      let v=1; if(list) for(const mn of list) v*=1-clamp(p[mn]||0,0,1);
      X(browP[s], list ? `translate(${cb[0]} ${cb[1]}) scale(${v.toFixed(4)}) translate(${-cb[0]} ${-cb[1]})` : ''); }
    for(const n in arms) setDisp(arms[n], (p.hands===n)?'':'none');   // hand pose swap
    for(const s in HIDE){ const el=hideEl[s]; if(!el) continue;            // fade out base slots a modifier replaces
      let vis=1; for(const mn of HIDE[s]) vis*=1-clamp(p[mn]||0,0,1); setOp(el, vis); }
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
    // clock hand: rotate around the centre pivot to the real time (from the drawn angle to the current angle)
    const nowD=new Date(), hrs=nowD.getHours()%12, mins=nowD.getMinutes(), secs=nowD.getSeconds();
    const handTf=it=>{ const target = it.role==='hour' ? -90+(hrs+mins/60)*30 : -90+(mins+secs/60)*6;
      return `rotate(${(target-it.ang).toFixed(2)} ${it.pivot[0]} ${it.pivot[1]})`; };
    // stick: a rigid mouth prop (straw). Base hangs from the mouth CORNER on whichever side it points (tracks
    // the live, morphing corner). Flip is a hysteresis target (±1) eased over time — it swings through but is
    // sticky to the extremes, never parking edge-on. Sway rides the breath (no separate timer).
    const gx=clamp(p.gazeX,-1,1), swayB=(p.breath-0.5)*16;                                   // breath-linked sway (deg)
    const stickTf=it=>{ const db=it.strawBase;                                              // the straw's OWN base vertex
      const R=spherePt(mouthPts[it.rightIdx][0],mouthPts[it.rightIdx][1],0,cfg.constrainMouth);  // live right corner
      const L=spherePt(mouthPts[it.leftIdx][0], mouthPts[it.leftIdx][1], 0,cfg.constrainMouth);  // live left corner
      if(gx>0.15) it._ft=-1; else if(gx<-0.15) it._ft=1;                                     // look right → point left, & vice-versa (else hold)
      it._fc += (it._ft-it._fc)*0.18;                                                        // ease toward the extreme (sticky, no mid-park)
      const t=(1-it._fc)/2; let ax=R[0]+(L[0]-R[0])*t, ay=R[1]+(L[1]-R[1])*t;                // base rides right↔left corner with the flip
      const [cx,cy]=spherePt(mcX,mcY,0,cfg.constrainMouth);                                  // pull the base INWARD (toward the mouth centre)
      ax+=(cx-ax)*0.5; ay+=(cy-ay)*0.5;                                                       //   so it tucks inside any mouth shape (drawn behind it)
      return `translate(${(ax-db[0]).toFixed(2)} ${(ay-db[1]).toFixed(2)}) rotate(${(swayB*it._fc).toFixed(2)} ${db[0]} ${db[1]}) `
           + `translate(${db[0]} 0) scale(${it._fc.toFixed(3)} 1) translate(${-db[0]} 0)`; };
    // wrap: rebuild a big shape's path each frame by reprojecting EVERY vertex on the head sphere (the beard
    // deforms around the head as it turns — a per-vertex version of the feature sphere reproject). Vertices
    // that rotate PAST the silhouette (behind the head) are clamped to the edge — otherwise they fold back
    // over the front, reversing the winding and punching holes (the evenodd/nonzero inversion).
    const HALF=Math.PI/2*0.985, wk=cfg.constrainMouth;
    const wrapPt=(bx,by)=>{ const dx=bx-headC[0], dy=by-headC[1];
      const mu=Math.asin(clamp(dy/Ry,-1,1)), hr=1-wk*(1-Math.cos(mu)), la=Math.asin(clamp(dx/(Rx*hr),-1,1));
      const l2=clamp(la+yaw,-HALF,HALF), m2=clamp(mu+pitch,-HALF,HALF), hr2=1-wk*(1-Math.cos(m2));
      return [headC[0]+Rx*hr2*Math.sin(l2), headC[1]+Ry*Math.sin(m2)]; };
    const wrapD=contours=>contours.map(c=>{ let s=''; for(let i=0;i<c.length;i++){ const q=wrapPt(c[i][0],c[i][1]); s+=(i?'L':'M')+q[0].toFixed(1)+','+q[1].toFixed(1)+' '; } return s+'Z'; }).join(' ');
    for(const mn in MODADD){ const L=clamp(p[mn]||0,0,1);  // raw level: each add gaze-reprojects + zooms in from nothing (staggered, after the morph)
      for(const it of MODADD[mn]){
        if(L<=0){ if(it.__vis!==0){ it.__vis=0; setDisp(it.rg,'none'); setOp(it.cutG,0); setDisp(it.cutG,'none'); } continue; }  // inactive modifier: hide + skip all its work
        if(it.__vis!==1){ it.__vis=1; setDisp(it.rg,''); setDisp(it.cutG,''); }
        if(it.mirror && !it.c){ it.c=[2*headC[0]-it.srcC[0], it.srcC[1]]; it.zc=it.c;   // reflect the source across the head centre (once)
          const rfl=`matrix(-1 0 0 1 ${(2*headC[0]).toFixed(2)} 0)`;
          X(it.refG,rfl); if(it.cutRefG) X(it.cutRefG,rfl); }
        if(it.contours){ const wk2=yaw.toFixed(4)+','+pitch.toFixed(4); if(it.__wk!==wk2){ it.__wk=wk2; setD(it.wrapP, wrapD(it.contours)); } }  // beard wrap: re-reproject only when gaze moves
        const tf =
          it.gaze==='tube-front' ? planeTf :                                  // muzzle plate: parallax plane at depth snoutZ
          it.gaze==='plane' ? planeAt(it.z, it.dy) :                          // glasses: plane a small distance in front of the face
          it.gaze==='tube-trunk' ? trunkTf(it) :                              // bridge: stretch base(head)->tip(muzzle)
          it.gaze==='ear' ? earTf(it) :                                       // earring: vertical-only, occlusion below
          it.gaze==='hand' ? handTf(it) :                                     // clock hand: rotate to the real time
          it.gaze==='stick' ? stickTf(it) :                                   // mouth prop (straw): translate-follow + gaze flip
          it.gaze==='chin' ? (()=>{ const lm=spherePt(mouthBase[0],mouthBase[1],0,cfg.constrainMouth);  // double chin: stay at ratio t on the line mouth->head-bottom
            const ax=lm[0]+it.t*(it.headBottom[0]-lm[0]), ay=lm[1]+it.t*(it.headBottom[1]-lm[1]);
            return `translate(${(ax-it.c[0]).toFixed(2)} ${(ay-it.c[1]).toFixed(2)})`; })() :
          (it.gaze==='none'||it.gaze==='tube'||it.gaze==='body'||it.gaze==='wrap') ? '' :   // none/body ride the head; wrap = vertices carry the reproject
          sphere(it.c[0], it.c[1], it.dy, it.gaze==='mouth'?cfg.constrainMouth:cfg.constrainEye);
        X(it.rg, tf);
        if(it.cutG) X(it.cutG, tf);                                          // the head-cut tracks the add (caps/crown static, ears follow)
        if(it.gaze==='ear'){ const side=Math.sign(it.c[0]-headC[0]);                 // this ear/earring's side recedes when gazeX points to it
          const hidden = side*clamp(p.gazeX,-1,1) > (it.clip==null?cfg.earClip:it.clip)?'none':'';  // hard clip past the (per-add) threshold
          setDisp(it.rg,hidden); if(it.cutG) setDisp(it.cutG,hidden); }
        if(it.beads){ const s=1+(p.breath-0.5)*cfg.neckBreath;                       // breathe the curve: inhale spreads it wide & lifts the sag
          for(const b of it.beads) X(b.g,`translate(${((s-1)*(b.c[0]-it.cx)).toFixed(2)} ${(b.sag*(1/s-1)).toFixed(2)})`); }
        const z=smooth01((L-it.a)/ZOOM_SPAN);                  // grow from a point (at zc) to full
        if(it.cutG) setOp(it.cutG, z);                         // occluder cut fades in with the reveal (black@z -> head transparent there)
        if(it.fade){ setOp(it.rg, z); }                        // reveal by opacity crossfade (e.g. the clock rim)
        else { X(it.zg, `translate(${it.zc[0]} ${it.zc[1]}) scale(${z.toFixed(4)}) translate(${-it.zc[0]} ${-it.zc[1]})`);
          if(it.occZg) X(it.occZg, it.zg.__t); } } }
  }

  // ---- scripted actions ----
  const anims=new Set();
  function drive(dur,fn){ const t0=performance.now(); const a={};
    a.step=now=>{const k=(now-t0)/dur; if(k>=1){fn(1);anims.delete(a);return;} fn(k);}; anims.add(a); }
  const easeShut=k=> k<0.4 ? 1-k/0.4 : k<0.55 ? 0 : (k-0.55)/0.45;
  function blink(D=200){ drive(D,k=>{const eo=clamp(easeShut(k),0,1); p.eyeOpenL=eo; p.eyeOpenR=eo;}); }
  function wink(side='l',D=260){ const key='eyeOpen'+side.toUpperCase(); drive(D,k=>{p[key]=clamp(easeShut(k),0,1);}); }

  // ---- idle behaviour ----
  let idleOn=false, tBlink=0, phase=Math.random()*6, gT=[0,0], tGaze=0, focusT=null, focusUntil=0, tPrev=0;
  function idleStep(now){
    const dt = tPrev ? Math.min((now-tPrev)/1000, 0.05) : 0;    // seconds since last frame (clamped for tab wakeups)
    tPrev = now;
    const smooth = f => 1 - Math.pow(1-f, dt*60);              // a 60fps-tuned lerp factor, made frame-rate-independent
    const focusing = focusT && now<focusUntil;                 // a lookAt() glance holds the gaze
    if(idleOn){
      phase+=dt; p.breath=0.5+0.45*Math.sin(phase*2*Math.PI/3.6);   // breath by real time, not per frame
      if(now>tBlink){ blink(); if(Math.random()<0.22) setTimeout(blink,240); tBlink=now+2000+Math.random()*4000; }
      if(now>tGaze && !focusing){ gT=[(Math.random()*2-1)*0.7,(Math.random()*2-1)*0.5]; tGaze=now+1400+Math.random()*3000; }
    }
    if(idleOn || focusing){
      const tgt = focusing ? focusT : gT, g = focusing ? 0.20 : 0.06;   // snap toward a focus, drift in idle
      const k = smooth(g), kh = smooth(g*0.5);
      p.gazeX+=(tgt[0]-p.gazeX)*k; p.gazeY+=(tgt[1]-p.gazeY)*k;
      p.headX+=(tgt[0]*0.35-p.headX)*kh; p.headY+=(tgt[1]*0.3-p.headY)*kh;
    }
    if(focusT && now>=focusUntil) focusT=null;                 // glance over -> idle wander resumes
  }
  function idle(on){ idleOn=on; if(!on) tBlink=0; }
  // glance at a direction in gaze units (-1..1) and hold `hold` ms before the idle wander takes over again
  function lookAt(gx,gy,hold=700){ focusT=[clamp(gx,-1,1),clamp(gy,-1,1)]; focusUntil=performance.now()+hold; tGaze=focusUntil+200; }

  // ONE rAF driver, in dependency order: idle updates p (gaze/breath, triggers blinks) -> scripted anims update
  // p (blink/wink eyeOpen) -> flush renders p. Was 3 separate rAF loops (3x the rAF overhead + a per-frame
  // [...anims] alloc), and flush ran first so it rendered last frame's p — one collapsed loop also kills that lag.
  let raf=requestAnimationFrame(function frame(now){
    idleStep(now);
    for(const a of anims) a.step(now);        // deleting the current element from a Set mid-for-of is safe; no snapshot needed
    flush();
    raf=requestAnimationFrame(frame);
  });

  return { p, cfg, flush, blink, wink, idle, lookAt, headC, Rx, Ry, pivots:{neck,feet,belly}, stop:()=>cancelAnimationFrame(raf) };
}
if(typeof module!=='undefined') module.exports={createRig};
