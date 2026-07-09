#!/usr/bin/env python3
"""Build a modifier (e.g. clown) from an annotated trace SVG -> modifiers.json.
Two kinds of layer:
  ADDS    (nose, lipstick, *-makeup): extra features the modifier draws. Stored as the raw
          traced path 'd' + centre, in trace coords; the rig places them with `placement`
          (trace -> win-local, from the head) and zooms each about its centre (grow from nothing).
  VERSION (mouth, l-brow/r-brow, l-eye/r-eye): modifier-specific morph targets for the expression
          this image represents (default 'happy'), corresponded+recentred onto the happy base so
          the rig can morph the normal expression toward them. l/r assigned by geometry.

  python tools/build_modifier.py clown generated/clown.svg happy
"""
import cairosvg, io, re, json, sys, numpy as np
from PIL import Image
from scipy import ndimage
from skimage import measure
MOD = sys.argv[1] if len(sys.argv)>1 else 'clown'
TSVG= sys.argv[2] if len(sys.argv)>2 else 'generated/clown.svg'
EXPR= sys.argv[3] if len(sys.argv)>3 else 'happy'
SEM='/home/serg/cpp/hangman/assets/marduk_semantic.svg'
FT ='/home/serg/cpp/hangman/rig/face_targets.json'
MODS='/home/serg/cpp/hangman/rig/modifiers.json'
ADDS=['nose','lipstick','l-top-makeup','l-bottom-makeup','r-top-makeup','r-bottom-makeup']
VERSIONS={'mouth':['mouth'], 'brow':['l-brow','r-brow'], 'eye':['l-eye','r-eye']}   # slot-group -> layers
N=100; OWp=800
NS='xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd" xmlns:xlink="http://www.w3.org/1999/xlink"'

svg=open(SEM).read(); vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',svg).group(1).split()]
OHp=int(round(OWp*vb[3]/vb[2]))
def grp(g): m=re.search(r'<g id="'+g+r'"[^>]*>(.*?)</g>',svg,re.S); return m.group(1) if m else ''
def render_mask(inner, VB, W, H):
    doc=f'<svg {NS} viewBox="{VB[0]} {VB[1]} {VB[2]} {VB[3]}" width="{W}" height="{H}">{inner}</svg>'
    p=cairosvg.svg2png(bytestring=doc.encode(),output_width=W,output_height=H,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('L'))<128
def outline(m, W, H, VB, merge=0):
    if merge: m=ndimage.binary_dilation(m,iterations=merge)
    pad=np.zeros((H+2,W+2),bool); pad[1:-1,1:-1]=m
    cs=measure.find_contours(pad.astype(float),0.5)
    if not cs: return None
    c=max(cs,key=lambda c:0.5*abs(np.dot(c[:,1],np.roll(c[:,0],1))-np.dot(c[:,0],np.roll(c[:,1],1))))
    xy=np.stack([(c[:,1]-1)/W*VB[2]+VB[0],(c[:,0]-1)/H*VB[3]+VB[1]],1)
    d=np.r_[0,np.cumsum(np.hypot(*np.diff(xy,axis=0).T))]; d/=d[-1]; t=np.linspace(0,1,N,endpoint=False)
    return np.stack([np.interp(t,d,xy[:,0]),np.interp(t,d,xy[:,1])],1)
def correspond(A,B):
    Ac=A-A.mean(0); best=None
    for flip in (1,-1):
        Bf=B[::flip]; Bc=Bf-Bf.mean(0)
        for r in range(len(A)):
            s=((Ac-np.roll(Bc,r,0))**2).sum()
            if best is None or s<best[0]: best=(s,flip,r)
    _,flip,r=best; return np.roll(B[::flip],r,0)
def recenter(o,ref): return o-o.mean(0)+ref.mean(0)
def polyarea(P): x,y=P[:,0],P[:,1]; return 0.5*abs(np.dot(x,np.roll(y,1))-np.dot(y,np.roll(x,1)))

tsvg=open(TSVG).read(); tvb=[float(x) for x in re.search(r'viewBox="([^"]*)"',tsvg).group(1).split()]
def layer_raw(label):
    m=re.search(r'<g\b[^>]*inkscape:label="'+re.escape(label)+r'"[^>]*>(.*?)</g>', tsvg, re.S)
    return m.group(1) if m else ''
def layer_black(label):
    b=re.sub(r'fill="[^"]*"','fill="#000"',layer_raw(label)); return re.sub(r'fill-opacity="[^"]*"','',b)
def traced_outline(label, merge=0):
    TW=900; TH=int(round(TW*tvb[3]/tvb[2]))
    return outline(render_mask(layer_black(label),tvb,TW,TH), TW,TH,tvb, merge)

# ---- head alignment: trace-space -> WIN-LOCAL face-space (so adds land where the rig draws) ----
whead=outline(render_mask(grp('win-head'),vb,OWp,OHp), OWp,OHp,vb)     # win-local (no #win transform)
thead=traced_outline('head')
Cw,Rw=whead.mean(0),(polyarea(whead)/np.pi)**0.5
Ct,Rt=thead.mean(0),(polyarea(thead)/np.pi)**0.5
s=Rw/Rt
placement=f'translate({Cw[0]:.3f} {Cw[1]:.3f}) scale({s:.5f}) translate({-Ct[0]:.3f} {-Ct[1]:.3f})'
def feat_outline(label, merge=0):
    inner=f'<g transform="{placement}">{layer_black(label)}</g>'
    return outline(render_mask(inner,vb,OWp,OHp), OWp,OHp,vb, merge)

out={'placement':placement, 'adds':{}, 'versions':{}}
# adds: raw path d (trace coords) + centre (trace coords, from the layer's ink bbox)
TW=900; TH=int(round(TW*tvb[3]/tvb[2]))
for lb in ADDS:
    raw=layer_raw(lb)
    if not re.search(r'<path', raw): print('  (no add:', lb, ')'); continue
    ds=re.findall(r'\bd="([^"]*)"', raw); d=' '.join(ds)
    m=render_mask(layer_black(lb),tvb,TW,TH); ys,xs=np.where(m)
    cx=(xs.min()+xs.max())/2/TW*tvb[2]; cy=(ys.min()+ys.max())/2/TH*tvb[3]
    out['adds'][lb]={'d':d, 'c':[round(cx,2),round(cy,2)]}
# versions: correspond each morph layer onto the happy base
FTd=json.load(open(FT))
def add_version(slot, feat, merge=0):
    base=np.array(FTd[slot]['happy']); out['versions'].setdefault(slot,{})[EXPR]=correspond(base,recenter(feat,base)).round(2).tolist()
add_version('mouth', feat_outline('mouth'))
br=sorted([feat_outline(l,merge=3) for l in VERSIONS['brow']], key=lambda p:p.mean(0)[0]); add_version('brow-l',br[0],3); add_version('brow-r',br[1],3)
ey=sorted([feat_outline(l) for l in VERSIONS['eye']], key=lambda p:p.mean(0)[0]); add_version('eye-l',ey[0]); add_version('eye-r',ey[1])

data=json.load(open(MODS)) if __import__('os').path.exists(MODS) else {}
data[MOD]=out; json.dump(data, open(MODS,'w'))
print(f'head align scale={s:.3f}  adds={list(out["adds"])}  versions={list(out["versions"])} @ {EXPR}')
