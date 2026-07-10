#!/usr/bin/env python3
"""Rebuild a modifier from a MANUALLY ALIGNED trace (the *_align.svg made by make_align_svg.py).
Parts live in a `<name>-group` (canonical trace->win-local transform) as labelled sub-groups (or flat
labelled paths). Per-modifier CONFIG says which labels are `versions` (morph the base face slot) and
which are `adds` (extra features drawn + animated), plus each add's gaze style:
  eye / mouth = reproject on the head sphere with that constraint;  none = ride the head (e.g. a crown).
Adds are re-traced to a win-local path 'd' + centre; versions correspond onto the happy base WITHOUT
recentering (keeps deliberate shifts). Anything not in CONFIG (e.g. `head`, or eyes/brows we keep
generic) is ignored.

  python tools/build_modifier_aligned.py king generated/king_align.svg happy
"""
import cairosvg, io, re, json, sys, numpy as np, xml.etree.ElementTree as ET
from PIL import Image
from scipy import ndimage
from skimage import measure
SVGNS='{http://www.w3.org/2000/svg}'; INK='{http://www.inkscape.org/namespaces/inkscape}'
MOD  = sys.argv[1] if len(sys.argv)>1 else 'king'
ASVG = sys.argv[2] if len(sys.argv)>2 else 'generated/king_align.svg'
EXPR = sys.argv[3] if len(sys.argv)>3 else 'happy'
FT ='/home/serg/cpp/hangman/rig/face_targets.json'
MODS='/home/serg/cpp/hangman/rig/modifiers.json'
N=100
CONFIG={
 'executioner':{'versions':{}, 'hide':['brow-l','brow-r','mouth'], 'maskEyes':True,  # full black hood; brows/mouth gone; eyes shown white on top (still emote)
          'headMorph':{'c':[409.75,288],'rx':90,'ry':90},                       # shrink the head fully inside the hood silhouette (svg_query'd; hood covers the rest)
          'adds':{'hood':{'gaze':'none','cover':True}}},                         # solid hood: cuts the whole head by its own silhouette, drawn on top
 'farmer':{'versions':{},                                                        # eyes/brows/mouth generic
          'adds':{'hat':{'gaze':'none','labels':['hat-occluder','hat'],'occHead':True},  # straw hat: white occluder cuts the head crown, ink on top
                  'mouth-straw':{'gaze':'stick','labels':['mouth-straw','mouth-straw-ocluder']}}},  # wheat stalk (ink) + its own occluder (cuts the face-core, not the mouth)
 'clown':{'versions':{'mouth':'mouth','l-brow':'brow-l','r-brow':'brow-r','l-eye':'eye-l','r-eye':'eye-r'},
          'adds':{'nose':'eye','lipstick':'mouth','l-top-makeup':'eye','l-bottom-makeup':'eye','r-top-makeup':'eye','r-bottom-makeup':'eye'}},
 'king':{'versions':{'mouth':'mouth'},                                          # eyes/brows stay generic -> emotions still work
         'adds':{'crown-occluder':{'gaze':'none','fill':'#ffffff','below':True}, # white, UNDER the face features -> hides the head arc but keeps brows visible
                 'crown':'none','crown-jewels':'none','crown-pearls':'none',    # crown rides the head (no gaze reproject)
                 'crown-background-left':'none','crown-background-right':'none',
                 'l-mustache':'mouth','r-mustache':'mouth'}},
 'girl':{'versions':{'l-eye':'eye-l','r-eye':'eye-r'},                            # lashed eyes; brows/mouth stay generic
         'adds':{'l-earring':{'gaze':'ear','earY':0.5,'labels':['l-earring','l-earring-top']},   # stud + bead: rides head, half Y motion, clips when its side turns away
                 'r-earring':{'gaze':'ear','earY':0.5,'labels':['r-earring','r-earring-top']},
                 'necklace':{'gaze':'body','beads':['neckless-1','neckless-2','neckless-3','neckless-4','neckless-5','neckless-6','neckless-7']}}},  # beads ride a curve, squash/stretch with breath; on the torso
 'nerd':{'versions':{}, 'eyefx':['l-eye','r-eye'],                               # brows/mouth generic; eyes shrink+shift-on-X (lens refraction)
         'adds':{'glasses':{'gaze':'plane','z':135,'dy':-16}}},                  # glasses on a plane just in front of the head sphere (Rx~123), nudged up
 'clock':{'versions':{}, 'facefx':['l-eye','r-eye','mouth'],                      # reposition+resize base eyes/mouth (keeps their shape -> emotions still work)
         'headMorph':True,                                                      # scale/drop the egg brush head into the round clock rim
         'hide':['brow-l','brow-r'],                                            # eyebrows zoom down to nothing (no brows on a clock)
         'adds':{'N12':'none','N3':'none','N6':'none','N9':'none',               # numbers, separate so they pop in staggered
                 'markings':'none','center':'none',                             # ticks + pivot dot, ride the disc
                 'hour-hand':{'gaze':'hand','role':'hour'},                     # hands rotate to the real time around the center pivot
                 'minute-hand':{'gaze':'hand','role':'minute'}}},
 'police':{'versions':{},                                                        # eyes/brows/mouth generic
         'adds':{'cap':{'gaze':'none','stack':[['cap-occluder','#ffffff'],['cap','#081C1A']]},  # white base (occludes head) + black detail on top, raw geometry
                 'star':'none'}},                                                # black star on top of the cap
 'sailor':{'versions':{},                                                        # eyes/brows/mouth generic
         'adds':{'cap':{'gaze':'none','labels':['cap-occluder','cap','anchor'],'occHead':True},  # ink kept crisp; white occluder drawn UNDER the features (head only)
                 'l-hair':{'gaze':'none','labels':['l-hair-ocluder','l-hair'],'occHead':True},   # hair, white occluder UNDER the features (head only)
                 'r-ear':{'gaze':'ear','clip':0,'earY':0.5,'labels':['r-ear-ocluder','r-ear']},  # clip at dead-centre (only ever one ear); half Y motion
                 'l-ear':{'gaze':'ear','clip':0,'earY':0.5,'mirror':'r-ear'}}},   # left ear = right ear mirrored across the head centre
 'horse':{'versions':{}, 'hide':['mouth'],                                       # eyes/brows generic; base mouth hidden (the horse mouth rides the snout)
          'adds':{'l-ear':'none','r-ear':'none','forelock':'none','hair':'none',  # ride the head
                  'snout-front':'tube-front','l-nostril':'tube-front',             # muzzle plate at depth Z (parallax)
                  'r-nostril':'tube-front','mouth':'tube-front',
                  'snout-trunk':'tube-trunk'}},                                    # bridge head<->muzzle (stretch)
}
cfg=CONFIG[MOD]

# parse the aligned SVG; find each part (by id "<name>-<label>" or inkscape:label) and its FULL
# ancestor transform chain, so parts in different places/spaces (e.g. a top-level occluder layer vs
# parts under <name>-group) each render correctly into win-local.
tree=ET.parse(ASVG); root=tree.getroot(); VB=[float(x) for x in root.get('viewBox').split()]
parent={c:p for p in root.iter() for c in p}
def find_part(label):
    for el in root.iter():
        if el.tag.split('}')[-1] in ('g','path') and (el.get(INK+'label')==label or el.get('id')==f'{MOD}-{label}'):
            return el
    return None
def chain_tf(el):
    tfs=[]; cur=el
    while cur is not None:
        if cur.get('transform'): tfs.append(cur.get('transform'))
        cur=parent.get(cur)
    return ' '.join(reversed(tfs))                        # root-most first
def part_paths(label):                                    # [(full transform chain, d)] per path — chain from the PATH leaf,
    labels=label if isinstance(label,(list,tuple)) else [label]   # accept several source labels (merge them into one add)
    out=[]
    for lb in labels:
        el=find_part(lb)                                  # a path can carry its own transform (e.g. an Inkscape reparent bake)
        if el is None: continue
        ps=[el] if el.tag.split('}')[-1]=='path' else list(el.iter(SVGNS+'path'))
        out+=[(chain_tf(p), p.get('d')) for p in ps if p.get('d')]
    return out
def part_ds(label): return [d for _,d in part_paths(label)]
def eff_fill(p):                                          # style fill wins over the fill attribute
    m=re.search(r'fill:\s*([^;]+)', p.get('style') or '')
    return (m.group(1).strip() if m else (p.get('fill') or '#000000')).lower()
def is_white(c): return c in ('#ffffff','#fff','white')
def part_full(label):                                     # raw paths kept as-is (transform+fill+rule), for occluder/front adds
    labels=label if isinstance(label,(list,tuple)) else [label]
    out=[]
    for lb in labels:
        el=find_part(lb)
        if el is None: continue
        ps=[el] if el.tag.split('}')[-1]=='path' else list(el.iter(SVGNS+'path'))
        for p in ps:
            if p.get('d'): out.append({'tf':chain_tf(p),'d':p.get('d'),'fill':eff_fill(p),'rule':p.get('fill-rule') or 'evenodd'})
    return out
def mask_pairs(pairs, W):                                 # rasterize explicit (transform,d) pairs -> bool mask
    H=int(round(W*VB[3]/VB[2]))
    inner=''.join(f'<g transform="{tf}"><path fill="#000" d="{d}"/></g>' for tf,d in pairs)
    doc=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB[0]} {VB[1]} {VB[2]} {VB[3]}" width="{W}" height="{H}">{inner}</svg>'
    return np.array(Image.open(io.BytesIO(cairosvg.svg2png(bytestring=doc.encode(),output_width=W,output_height=H,background_color='white'))).convert('L'))<128, W, H
def mask_of(label, W): return mask_pairs(part_paths(label), W)
def px2vb(y,x,W,H): return ((x-1)/W*VB[2]+VB[0], (y-1)/H*VB[3]+VB[1])
def smooth(pts):
    if len(pts)>1 and np.allclose(pts[0],pts[-1]): pts=pts[:-1]
    m=len(pts)
    if m<3: return ''
    d=f'M {pts[0][0]:.1f},{pts[0][1]:.1f} '
    for i in range(m):
        p0,p1,p2,p3=pts[(i-1)%m],pts[i],pts[(i+1)%m],pts[(i+2)%m]
        c1=(p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6); c2=(p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6)
        d+=f'C {c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f} '
    return d+'Z'
def trace_pairs(pairs):                                   # explicit (transform,d) pairs -> smooth win-local 'd'
    m,W,H=mask_pairs(pairs,1000); pad=np.zeros((H+2,W+2),bool); pad[1:-1,1:-1]=m; subs=[]
    for c in measure.find_contours(pad.astype(float),0.5):
        c=measure.approximate_polygon(c,1.2)
        if len(c)>=3: subs.append(smooth([px2vb(y,x,W,H) for y,x in c]))
    return ' '.join(x for x in subs if x)
def trace_wl(label): return trace_pairs(part_paths(label))   # all contours -> smooth win-local path 'd'
def centre(label):
    m,W,H=mask_of(label,700); ys,xs=np.where(m)
    return [round(VB[0]+(xs.min()+xs.max())/2/W*VB[2],2), round(VB[1]+(ys.min()+ys.max())/2/H*VB[3],2)]
def bbox_of(pairs):                                       # (cx,cy,w,h) VB coords for a set of (transform,d)
    W=700; H=int(round(W*VB[3]/VB[2]))
    inner=''.join(f'<g transform="{tf}"><path fill="#000" d="{d}"/></g>' for tf,d in pairs)
    doc=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB[0]} {VB[1]} {VB[2]} {VB[3]}" width="{W}" height="{H}">{inner}</svg>'
    m=np.array(Image.open(io.BytesIO(cairosvg.svg2png(bytestring=doc.encode(),output_width=W,output_height=H,background_color='white'))).convert('L'))<128
    ys,xs=np.where(m); x0,x1=VB[0]+xs.min()/W*VB[2],VB[0]+xs.max()/W*VB[2]; y0,y1=VB[1]+ys.min()/H*VB[3],VB[1]+ys.max()/H*VB[3]
    return ((x0+x1)/2,(y0+y1)/2,x1-x0,y1-y0)
def hand_angle(label, pivot):                             # drawn angle (deg, screen coords) from the pivot to the hand tip
    m,W,H=mask_of(label,700); ys,xs=np.where(m)
    P=np.stack([VB[0]+xs/W*VB[2], VB[1]+ys/H*VB[3]],1)
    tip=P[np.hypot(P[:,0]-pivot[0],P[:,1]-pivot[1]).argmax()]
    return round(float(np.degrees(np.arctan2(tip[1]-pivot[1], tip[0]-pivot[0]))),2)
def ends(label):                                          # the two tips of an elongated shape (principal axis)
    m,W,H=mask_of(label,700); ys,xs=np.where(m)
    P=np.stack([VB[0]+xs/W*VB[2], VB[1]+ys/H*VB[3]],1)    # ink points, VB coords
    Pc=P-P.mean(0); axis=np.linalg.svd(Pc,full_matrices=False)[2][0]; t=Pc@axis
    return P[t<=np.percentile(t,5)].mean(0), P[t>=np.percentile(t,95)].mean(0)   # robust end centroids
def outline(label, merge=0):
    m,W,H=mask_of(label,800)
    if merge: m=ndimage.binary_dilation(m,iterations=merge)
    pad=np.zeros((H+2,W+2),bool); pad[1:-1,1:-1]=m
    cs=measure.find_contours(pad.astype(float),0.5)
    c=max(cs,key=lambda c:0.5*abs(np.dot(c[:,1],np.roll(c[:,0],1))-np.dot(c[:,0],np.roll(c[:,1],1))))
    xy=np.array([px2vb(y,x,W,H) for y,x in c])
    dd=np.r_[0,np.cumsum(np.hypot(*np.diff(xy,axis=0).T))]; dd/=dd[-1]; t=np.linspace(0,1,N,endpoint=False)
    return np.stack([np.interp(t,dd,xy[:,0]),np.interp(t,dd,xy[:,1])],1)
def correspond(A,B):
    Ac=A-A.mean(0); best=None
    for fl in (1,-1):
        Bf=B[::fl]; Bc=Bf-Bf.mean(0)
        for r in range(len(A)):
            e=((Ac-np.roll(Bc,r,0))**2).sum()
            if best is None or e<best[0]: best=(e,fl,r)
    _,fl,r=best; return np.roll(B[::fl],r,0)

def occ_front(full):                                      # occluder(white) behind, ink on top — keep both, exact geometry
    occ=[x for x in full if is_white(x['fill'])]; front=[x for x in full if not is_white(x['fill'])]
    return [{'d':x['d'],'tf':x['tf'],'fill':'#ffffff','rule':x['rule']} for x in occ] \
         + [{'d':x['d'],'tf':x['tf'],'fill':'#081C1A','rule':x['rule']} for x in front]

out={'adds':{}, 'versions':{}}
if cfg.get('hide'): out['hide']=cfg['hide']               # base face slots this modifier hides (faded by level)
if isinstance(cfg.get('headMorph'),dict):                 # manual target (browser-derived), passed straight through
    out['headMorph']=cfg['headMorph']
elif cfg.get('headMorph'):                                # scale+shift the egg head into the annotated round rim
    m,W,H=mask_of('head',700); ys,xs=np.where(m)
    x0,x1=VB[0]+xs.min()/W*VB[2],VB[0]+xs.max()/W*VB[2]; y0,y1=VB[1]+ys.min()/H*VB[3],VB[1]+ys.max()/H*VB[3]
    out['headMorph']={'c':[round((x0+x1)/2,2),round((y0+y1)/2,2)],'rx':round((x1-x0)/2,2),'ry':round((y1-y0)/2,2)}
if cfg.get('maskEyes'): out['maskEyes']=True              # draw the base eyes white on top of the hood (they still emote)
for name,spec in cfg['adds'].items():
    if isinstance(spec,dict) and spec.get('stack'):       # ordered [label, fill] parts, raw geometry, drawn back-to-front (e.g. white cap base + black detail)
        a={'gaze':spec['gaze'], 'c':centre([lb for lb,_ in spec['stack']]),
           'paths':[{'d':x['d'],'tf':x['tf'],'fill':fill,'rule':x['rule']} for lb,fill in spec['stack'] for x in part_full(lb)]}
        out['adds'][name]=a; continue
    if isinstance(spec,dict) and spec.get('mirror'):      # this add = another add mirrored across the head centre (done at runtime)
        m={'gaze':spec['gaze'], 'mirror':spec['mirror']}
        if 'clip' in spec: m['clip']=spec['clip']
        if 'earY' in spec: m['earY']=spec['earY']
        out['adds'][name]=m; continue
    if isinstance(spec,dict) and spec.get('beads'):       # per-bead add (necklace): each bead individually placeable
        a={'gaze':spec['gaze'], 'beads':[{'c':centre(lb),'paths':occ_front(part_full(lb))} for lb in spec['beads']]}
        a['c']=centre(spec['beads']); out['adds'][name]=a; continue
    if (spec.get('gaze') if isinstance(spec,dict) else spec)=='stick':   # mouth prop (straw): ink + its own occluder, both win-local
        full=part_full(spec['labels']) if isinstance(spec,dict) and spec.get('labels') else part_full(name)
        ink=[(x['tf'],x['d']) for x in full if not is_white(x['fill'])]
        occ=[(x['tf'],x['d']) for x in full if is_white(x['fill'])]
        cx,cy,_,_=bbox_of(ink); a={'gaze':'stick','c':[round(cx,2),round(cy,2)],'d':trace_pairs(ink)}
        if occ: a['occ']=trace_pairs(occ)                 # occluder cuts the face-core (everything but the mouth)
        out['adds'][name]=a; continue
    src=spec['labels'] if isinstance(spec,dict) and spec.get('labels') else name   # one add can merge several traced labels
    if not part_ds(src): print('  (missing add:',name,')'); continue
    a={'c':centre(src),'gaze':(spec['gaze'] if isinstance(spec,dict) else spec)}
    full=part_full(src)
    if (isinstance(spec,dict) and spec.get('raw')) or any(is_white(x['fill']) for x in full):  # keep raw geometry (occluder+front, or a detailed solid like the police cap)
        a['paths']=occ_front(full)
    else:
        a['d']=trace_wl(src)                              # plain add: one smooth ink outline
    if isinstance(spec,dict):
        if spec.get('fill'): a['fill']=spec['fill']
        if spec.get('below'): a['below']=True
        if spec.get('dy'): a['dy']=spec['dy']             # vertical nudge (into the gaze reproject dip)
        if spec.get('z'): a['z']=spec['z']                # plane depth in front of the face (gaze='plane')
        if 'clip' in spec: a['clip']=spec['clip']         # per-add ear-clip threshold (else cfg.earClip)
        if 'earY' in spec: a['earY']=spec['earY']         # scale the ear's vertical gaze motion (1 = full)
        if spec.get('occHead'): a['occHead']=True         # route the white occluder under the features (occlude the head only)
        if spec.get('fade'): a['fade']=True               # reveal by opacity crossfade instead of zoom-from-nothing
        if spec.get('cover'): a['cover']=True             # solid shape: cut the head by its OWN silhouette + draw it on top (hood)
    if a['gaze']=='hand':                                 # clock hand: pivot on the centre dot, store its drawn angle + role
        piv=centre('center'); a['pivot']=piv; a['angle']=hand_angle(src,piv); a['role']=spec['role']
    if a['gaze']=='tube-trunk':                           # bridge head<->muzzle: base = end nearer head, tip = end nearer muzzle
        e0,e1=ends(src); Cm=np.array(centre('snout-front'))
        (tip,base)=(e0,e1) if np.hypot(*(e0-Cm))<np.hypot(*(e1-Cm)) else (e1,e0)
        a['base']=[round(base[0],2),round(base[1],2)]; a['tip']=[round(tip[0],2),round(tip[1],2)]
    out['adds'][name]=a
FTd=json.load(open(FT))
if cfg.get('eyefx'):                                       # move+shrink the base eyes to sit behind the lenses
    seen=set(); pairs=[]                                                       # pupils, wherever labelled (dedupe by d)
    for lb in cfg['eyefx']:
        for tf,d in part_paths(lb):
            if d not in seen: seen.add(d); pairs.append((tf,d))
    pupils=sorted((bbox_of([pd]) for pd in pairs), key=lambda b:b[0])          # left -> right by x
    order=sorted(['eye-l','eye-r'], key=lambda s:np.mean([p[0] for p in FTd[s]['happy']]))
    out['eyefx']={}
    for slot,(cx,cy,w,h) in zip(order,pupils):
        base=np.array(FTd[slot]['happy']); bw,bh=base.max(0)-base.min(0)
        s=round(float(np.hypot(w,h)/np.hypot(bw,bh)),3)
        out['eyefx'][slot]={'c':[round(cx,2),round(cy,2)],'s':s}
    print('  eyefx:',out['eyefx'])
def fx_cs(label, slot):                                   # {c, s}: reposition to the annotated centre, scale = annotated size / base size
    cx,cy,w,h=bbox_of(part_paths(label)); base=np.array(FTd[slot]['happy']); bw,bh=base.max(0)-base.min(0)
    return {'c':[round(cx,2),round(cy,2)],'s':round(float(np.hypot(w,h)/np.hypot(bw,bh)),3)}
if cfg.get('facefx'):                                     # reposition+resize base eyes/mouth (full 2D), keeping shape -> emotions survive
    out['facefx']={}
    eyes=[lb for lb in cfg['facefx'] if 'eye' in lb]
    if eyes:
        order=sorted(['eye-l','eye-r'], key=lambda s:np.mean([p[0] for p in FTd[s]['happy']]))
        for slot,lb in zip(order, sorted(eyes, key=lambda l:bbox_of(part_paths(l))[0])):
            out['facefx'][slot]=fx_cs(lb, slot)
    if 'mouth' in cfg['facefx']: out['facefx']['mouth']=fx_cs('mouth','mouth')
    print('  facefx:',out['facefx'])
for lb,slot in cfg['versions'].items():
    if not part_ds(lb): print('  (missing version:',lb,')'); continue
    merge=3 if slot.startswith('brow') else 0
    base=np.array(FTd[slot]['happy'])
    out['versions'].setdefault(slot,{})[EXPR]=correspond(base,outline(lb,merge)).round(2).tolist()  # no recenter
data=json.load(open(MODS)) if __import__('os').path.exists(MODS) else {}
data[MOD]=out; json.dump(data, open(MODS,'w'))
print(f'{MOD}: adds={ {k:v["gaze"] for k,v in out["adds"].items()} }  versions={list(out["versions"])}')
