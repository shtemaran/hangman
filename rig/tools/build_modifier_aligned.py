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
import cairosvg, io, re, json, sys, numpy as np
from PIL import Image
from scipy import ndimage
from skimage import measure
MOD  = sys.argv[1] if len(sys.argv)>1 else 'king'
ASVG = sys.argv[2] if len(sys.argv)>2 else 'generated/king_align.svg'
EXPR = sys.argv[3] if len(sys.argv)>3 else 'happy'
FT ='/home/serg/cpp/hangman/rig/face_targets.json'
MODS='/home/serg/cpp/hangman/rig/modifiers.json'
N=100
CONFIG={
 'clown':{'versions':{'mouth':'mouth','l-brow':'brow-l','r-brow':'brow-r','l-eye':'eye-l','r-eye':'eye-r'},
          'adds':{'nose':'eye','lipstick':'mouth','l-top-makeup':'eye','l-bottom-makeup':'eye','r-top-makeup':'eye','r-bottom-makeup':'eye'}},
 'king':{'versions':{'mouth':'mouth'},                                          # eyes/brows stay generic -> emotions still work
         'adds':{'crown':'none','crown-jewels':'none','crown-pearls':'none',    # crown rides the head (no gaze reproject)
                 'crown-background-left':'none','crown-background-right':'none',
                 'l-mustache':'mouth','r-mustache':'mouth'}},
}
cfg=CONFIG[MOD]

s=open(ASVG).read(); VB=[float(x) for x in re.search(r'viewBox="([^"]*)"',s).group(1).split()]   # win-local face space
def tf_of(tag): m=re.search(r'transform="([^"]*)"',tag); return m.group(1) if m else ''
# OUTER = ancestor chain above each part = modifier LAYER transform + <name>-group transform (both may
# carry the user's alignment move); per-part sub-group transform is applied inside mask_of.
gi=s.index(f'id="{MOD}-group"')
layer_tag=[m.group(0) for m in re.finditer(r'<g\b[^>]*groupmode="layer"[^>]*>', s) if m.start()<gi][-1]
grp_tag=re.search(r'<g\b[^>]*id="'+re.escape(MOD+'-group')+r'"[^>]*>', s).group(0)
OUTER=(tf_of(layer_tag)+' '+tf_of(grp_tag)).strip()
def part(label):                                          # (sub-group transform, [d's])  — sub-group id or flat labelled path
    m=re.search(r'<g\b([^>]*id="'+re.escape(MOD+'-'+label)+r'"[^>]*)>(.*?)</g>', s, re.S)
    if m: return tf_of(m.group(1)), re.findall(r'\bd="([^"]*)"', m.group(2))
    for p in re.findall(r'<path\b[^>]*?/>', s, re.S):
        if f'inkscape:label="{label}"' in p: return tf_of(p), re.findall(r'\bd="([^"]*)"', p)
    return '', []
def part_ds(label): return part(label)[1]
def mask_of(label, W):                                    # render the part under its full transform chain -> win-local mask
    H=int(round(W*VB[3]/VB[2])); subtf,ds=part(label)
    inner=''.join(f'<path fill="#000" d="{d}"/>' for d in ds)
    doc=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB[0]} {VB[1]} {VB[2]} {VB[3]}" width="{W}" height="{H}"><g transform="{OUTER}"><g transform="{subtf}">{inner}</g></g></svg>'
    return np.array(Image.open(io.BytesIO(cairosvg.svg2png(bytestring=doc.encode(),output_width=W,output_height=H,background_color='white'))).convert('L'))<128, W, H
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
def trace_wl(label):                                      # all contours -> smooth win-local path 'd'
    m,W,H=mask_of(label,1000); pad=np.zeros((H+2,W+2),bool); pad[1:-1,1:-1]=m; subs=[]
    for c in measure.find_contours(pad.astype(float),0.5):
        c=measure.approximate_polygon(c,1.2)
        if len(c)>=3: subs.append(smooth([px2vb(y,x,W,H) for y,x in c]))
    return ' '.join(x for x in subs if x)
def centre(label):
    m,W,H=mask_of(label,700); ys,xs=np.where(m)
    return [round(VB[0]+(xs.min()+xs.max())/2/W*VB[2],2), round(VB[1]+(ys.min()+ys.max())/2/H*VB[3],2)]
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

out={'adds':{}, 'versions':{}}
for lb,gaze in cfg['adds'].items():
    if part_ds(lb): out['adds'][lb]={'d':trace_wl(lb),'c':centre(lb),'gaze':gaze}
    else: print('  (missing add:',lb,')')
FTd=json.load(open(FT))
for lb,slot in cfg['versions'].items():
    if not part_ds(lb): print('  (missing version:',lb,')'); continue
    merge=3 if slot.startswith('brow') else 0
    base=np.array(FTd[slot]['happy'])
    out['versions'].setdefault(slot,{})[EXPR]=correspond(base,outline(lb,merge)).round(2).tolist()  # no recenter
data=json.load(open(MODS)) if __import__('os').path.exists(MODS) else {}
data[MOD]=out; json.dump(data, open(MODS,'w'))
print(f'{MOD}: adds={ {k:v["gaze"] for k,v in out["adds"].items()} }  versions={list(out["versions"])}')
