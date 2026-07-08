#!/usr/bin/env python3
"""Add an emotion's morph targets to face_targets.json from an annotated trace SVG
(see trace_png.py). The SVG has inkscape:label'd layers: head, l-brow/r-brow,
l-eye/r-eye, mouth (each holding the traced path). We size the traced face onto the
win head (area/centroid of the labelled 'head' -> IoU-checked), render each feature
into the semantic viewBox at that scale, trace to 100 pts, then correspond+recenter
onto the stored 'happy' base and merge under the emotion key. l/r are assigned by
geometry (leftmost = viewer's left) so the annotation's l/r naming doesn't matter.

  python tools/build_emotion_target.py thoughtful generated/thoughtful.svg
"""
import cairosvg, io, re, json, sys, numpy as np
from PIL import Image
from scipy import ndimage
from skimage import measure
EMO  = sys.argv[1] if len(sys.argv)>1 else 'thoughtful'
TSVG = sys.argv[2] if len(sys.argv)>2 else 'generated/thoughtful.svg'
SEM='/home/serg/cpp/hangman/assets/marduk_semantic.svg'
FT ='/home/serg/cpp/hangman/rig/face_targets.json'
N=100; OWp=800

svg=open(SEM).read(); vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',svg).group(1).split()]
OHp=int(round(OWp*vb[3]/vb[2]))
wtf=re.search(r'<g id="win"[^>]*transform="([^"]*)"',svg).group(1)
def grp(g): m=re.search(r'<g id="'+g+r'"[^>]*>(.*?)</g>',svg,re.S); return m.group(1) if m else ''
NS='xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd" xmlns:xlink="http://www.w3.org/1999/xlink"'
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

# ---- trace svg ----
tsvg=open(TSVG).read(); tvb=[float(x) for x in re.search(r'viewBox="([^"]*)"',tsvg).group(1).split()]
def layer_inner(label):
    m=re.search(r'<g\b[^>]*inkscape:label="'+re.escape(label)+r'"[^>]*>(.*?)</g>', tsvg, re.S)
    body=m.group(1) if m else ''
    body=re.sub(r'fill="[^"]*"','fill="#000"',body); body=re.sub(r'fill-opacity="[^"]*"','',body)
    return body
def traced_outline(label, merge=0):     # feature outline in the trace's own (pixel) coords
    TW=900; TH=int(round(TW*tvb[3]/tvb[2]))
    return outline(render_mask(layer_inner(label),tvb,TW,TH), TW,TH,tvb, merge)

# ---- head alignment: size the traced face onto the win head ----
whead=outline(render_mask(f'<g transform="{wtf}">'+grp('win-head')+'</g>',vb,OWp,OHp), OWp,OHp,vb)
thead=traced_outline('head')
Cw,Rw=whead.mean(0), (polyarea(whead)/np.pi)**0.5
Ct,Rt=thead.mean(0), (polyarea(thead)/np.pi)**0.5
s=Rw/Rt
xform=f'translate({Cw[0]:.3f} {Cw[1]:.3f}) scale({s:.5f}) translate({-Ct[0]:.3f} {-Ct[1]:.3f})'
def feat_outline(label, merge=0):       # trace feature into semantic viewBox at the aligned scale
    inner=f'<g transform="{xform}">{layer_inner(label)}</g>'
    return outline(render_mask(inner,vb,OWp,OHp), OWp,OHp,vb, merge)
# IoU sanity of the head alignment
hi=render_mask(f'<g transform="{xform}">{layer_inner("head")}</g>',vb,OWp,OHp); hw=render_mask(f'<g transform="{wtf}">'+grp('win-head')+'</g>',vb,OWp,OHp)
print(f'head align: scale={s:.3f}  IoU={np.logical_and(hi,hw).sum()/np.logical_or(hi,hw).sum():.3f}')

# ---- per feature: assign l/r by geometry, correspond onto stored 'happy' base ----
FTd=json.load(open(FT))
def add(slot, feat, merge=0):
    base=np.array(FTd[slot]['happy']); FTd[slot][EMO]=correspond(base, recenter(feat, base)).round(2).tolist()
mouth=feat_outline('mouth')
add('mouth', mouth)
brows=[('l-brow',feat_outline('l-brow',merge=3)),('r-brow',feat_outline('r-brow',merge=3))]
brows.sort(key=lambda t:t[1].mean(0)[0]); add('brow-l',brows[0][1],3); add('brow-r',brows[1][1],3)   # leftmost -> viewer's left
eyes=[('l-eye',feat_outline('l-eye')),('r-eye',feat_outline('r-eye'))]
eyes.sort(key=lambda t:t[1].mean(0)[0]); add('eye-l',eyes[0][1]); add('eye-r',eyes[1][1])
json.dump(FTd, open(FT,'w'))
print(f'added "{EMO}" to slots:', [s for s in FTd if EMO in FTd[s]],
      '| brow-l<-', brows[0][0], 'eye-l<-', eyes[0][0])
