#!/usr/bin/env python3
"""Rebuild a modifier from a MANUALLY ALIGNED trace (the *_align.svg). The parts sit in a
`clown-group` whose transform maps them onto the happy-marduk face. We RENDER each part under
that transform (cairosvg handles Inkscape's relative paths) into the win-local viewBox, then:
  adds    (nose, lipstick, *-makeup): re-trace to a win-local path 'd' + centre + gaze style
          (eye|mouth); the rig reprojects each on the head sphere and zooms it in from nothing.
  versions(mouth, brows, eyes): outline + correspond onto the happy base WITHOUT recentering, so
          the deliberate clown mouth shift (down, to clear the nose) is kept.

  python tools/build_modifier_aligned.py clown generated/clown_align.svg happy
"""
import cairosvg, io, re, json, sys, numpy as np
from PIL import Image
from scipy import ndimage
from skimage import measure
MOD  = sys.argv[1] if len(sys.argv)>1 else 'clown'
ASVG = sys.argv[2] if len(sys.argv)>2 else 'generated/clown_align.svg'
EXPR = sys.argv[3] if len(sys.argv)>3 else 'happy'
FT ='/home/serg/cpp/hangman/rig/face_targets.json'
MODS='/home/serg/cpp/hangman/rig/modifiers.json'
ADDS ={'nose':'eye','lipstick':'mouth','l-top-makeup':'eye','l-bottom-makeup':'eye','r-top-makeup':'eye','r-bottom-makeup':'eye'}
VERS ={'brow':['l-brow','r-brow'],'eye':['l-eye','r-eye']}
N=100

s=open(ASVG).read(); VB=[float(x) for x in re.search(r'viewBox="([^"]*)"',s).group(1).split()]   # = win-local face space
gtag=re.search(r'<g\b[^>]*id="clown-group"[^>]*>', s)
GT=re.search(r'transform="([^"]*)"', gtag.group(0)) if gtag else None; GT=GT.group(1) if GT else ''
PATHS=re.findall(r'<path\b[^>]*?/>', s, re.S)
def part_d(label):
    for p in PATHS:
        if f'inkscape:label="{label}"' in p:
            m=re.search(r'\bd="([^"]*)"',p); return m.group(1) if m else ''
    return ''
def mask_of(label, W):    # render the part under the clown-group transform -> win-local mask
    H=int(round(W*VB[3]/VB[2]))
    doc=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB[0]} {VB[1]} {VB[2]} {VB[3]}" width="{W}" height="{H}"><g transform="{GT}"><path fill="#000" d="{part_d(label)}"/></g></svg>'
    m=np.array(Image.open(io.BytesIO(cairosvg.svg2png(bytestring=doc.encode(),output_width=W,output_height=H,background_color='white'))).convert('L'))<128
    return m,W,H
def px2vb(y,x,W,H): return ((x-1)/W*VB[2]+VB[0], (y-1)/H*VB[3]+VB[1])
def smooth(pts):
    if len(pts)>1 and np.allclose(pts[0],pts[-1]): pts=pts[:-1]
    m=len(pts)
    if m<3: return ''
    d=f'M {pts[0][0]:.1f},{pts[0][1]:.1f} '
    for i in range(m):
        p0,p1,p2,p3=pts[(i-1)%m],pts[i],pts[(i+1)%m],pts[(i+2)%m]
        c1=(p1[0]+(p2[0]-p0[0])/6, p1[1]+(p2[1]-p0[1])/6); c2=(p2[0]-(p3[0]-p1[0])/6, p2[1]-(p3[1]-p1[1])/6)
        d+=f'C {c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f} '
    return d+'Z'
def trace_wl(label):       # all contours -> smooth win-local path 'd'
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
for lb,gaze in ADDS.items():
    if part_d(lb): out['adds'][lb]={'d':trace_wl(lb), 'c':centre(lb), 'gaze':gaze}
FTd=json.load(open(FT))
def add_ver(slot, feat): base=np.array(FTd[slot]['happy']); out['versions'].setdefault(slot,{})[EXPR]=correspond(base,feat).round(2).tolist()  # no recenter -> keeps aligned position
add_ver('mouth', outline('mouth'))
br=sorted([outline(l,merge=3) for l in VERS['brow']], key=lambda p:p.mean(0)[0]); add_ver('brow-l',br[0]); add_ver('brow-r',br[1])
ey=sorted([outline(l) for l in VERS['eye']],  key=lambda p:p.mean(0)[0]); add_ver('eye-l',ey[0]); add_ver('eye-r',ey[1])
data=json.load(open(MODS)) if __import__('os').path.exists(MODS) else {}
data[MOD]=out; json.dump(data, open(MODS,'w'))
print(f'{MOD}: adds={list(out["adds"])}  versions={list(out["versions"])}  @ {EXPR}')
