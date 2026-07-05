#!/usr/bin/env python3
"""Build face_targets.json: per-slot morph keyframes corresponded to the happy base.
  slots : eye-l, eye-r, mouth, brow-l, brow-r
  keys  : happy (win) / neutral (neutral-face) / sad (lose) / surprised (surprised) [+ shut for eyes]
Full-regen frames are aligned to the win character; each feature is isolated and
recentered onto its base outline (pre-transform, so nothing drifts)."""
import cairosvg, io, re, json, numpy as np
from PIL import Image
from scipy import ndimage
from skimage import measure
from skimage.filters import threshold_otsu
SEM='/home/serg/cpp/hangman/assets/marduk_semantic.svg'
GEN='/home/serg/cpp/hangman/rig/generated/'
svg=open(SEM).read()
vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',svg).group(1).split()]
wtf=re.search(r'<g id="win"[^>]*transform="([^"]*)"',svg).group(1)
def grp(g): m=re.search(r'<g id="'+g+r'"[^>]*>(.*?)</g>',svg,re.S); return m.group(1) if m else ''
N=100; RW=1100; RH=int(round(RW*vb[3]/vb[2])); OWp=800; OHp=int(round(OWp*vb[3]/vb[2]))
def hd(w,h): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{w}" height="{h}">'
def mask(inner,w,h):
    p=cairosvg.svg2png(bytestring=(hd(w,h)+inner+'</svg>').encode(),output_width=w,output_height=h,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('L'))<128
def outline_from_mask(m,W,H,merge=0):
    if merge: m=ndimage.binary_dilation(m,iterations=merge)
    pad=np.zeros((H+2,W+2),bool); pad[1:-1,1:-1]=m
    cs=measure.find_contours(pad.astype(float),0.5)
    if not cs: return None
    c=max(cs,key=lambda c:0.5*abs(np.dot(c[:,1],np.roll(c[:,0],1))-np.dot(c[:,0],np.roll(c[:,1],1))))
    xy=np.stack([(c[:,1]-1)/W*vb[2]+vb[0],(c[:,0]-1)/H*vb[3]+vb[1]],1)
    d=np.r_[0,np.cumsum(np.hypot(*np.diff(xy,axis=0).T))]; d/=d[-1]
    t=np.linspace(0,1,N,endpoint=False)
    return np.stack([np.interp(t,d,xy[:,0]),np.interp(t,d,xy[:,1])],1)
def outline_grp(g,merge=0):
    return outline_from_mask(mask(grp(g),RW,RH),RW,RH,merge)
def correspond(A,B):
    Ac=A-A.mean(0); best=None
    for flip in (1,-1):
        Bf=B[::flip]; Bc=Bf-Bf.mean(0)
        for r in range(len(A)):
            s=((Ac-np.roll(Bc,r,0))**2).sum()
            if best is None or s<best[0]: best=(s,flip,r)
    _,flip,r=best; return np.roll(B[::flip],r,0)
def recenter(o,ref): return o-o.mean(0)+ref.mean(0)

# ---- align a full-regen frame to the win character ----
SL=['bars','head','torso','mouth','brows-l','brows-r','eyes-l','eyes-r','hands-l','hands-r']
ours=mask(f'<g transform="{wtf}">'+''.join(grp('win-'+s) for s in SL)+'</g>',OWp,OHp); osum=ours.sum()
def resized(m,p):
    w=max(1,int(m.shape[1]*p)); h=max(1,int(m.shape[0]*p))
    return np.array(Image.fromarray(m.astype(np.uint8)*255).resize((w,h)))>128
def align(png):
    gm=np.array(Image.open(png).convert('L')); gen=gm<threshold_otsu(gm)
    best=(-1,None,0,0)
    for p in np.arange(0.45,0.85,0.03):
        m=resized(gen,p); H,W=m.shape
        if H<OHp or W<OWp: continue
        for y0 in range(0,H-OHp+1,4):
            for x0 in range(0,W-OWp+1,4):
                win=m[y0:y0+OHp,x0:x0+OWp]; inter=np.logical_and(win,ours).sum()
                iou=inter/(win.sum()+osum-inter)
                if iou>best[0]: best=(iou,round(p,3),x0,y0)
    iou,P,X0,Y0=best; print(f'  align {png.split("/")[-1]} IoU={iou:.3f}')
    return resized(gen,P)[Y0:Y0+OHp,X0:X0+OWp]
frames={'neutral':align(GEN+'neutral-face.png'),'surprised':align(GEN+'surprised.png')}

def extract(aligned,slot,it,ncc,merge=0):
    fp=mask(f'<g transform="{wtf}">'+grp('win-'+slot)+'</g>',OWp,OHp)
    reg=ndimage.binary_dilation(fp,iterations=it)
    feat=np.logical_and(aligned,reg); lab,n=ndimage.label(feat)
    if n==0: return None
    sizes=[(lab==i).sum() for i in range(1,n+1)]; keep=np.argsort(sizes)[-ncc:]+1
    feat=np.isin(lab,list(keep))
    return outline_from_mask(feat,OWp,OHp,merge)

T={}
def add(slot, base, keys):     # keys: {name: (raw_outline)}; corresponded+recentered to base
    d={'happy':base.round(2).tolist()}
    for name,o in keys.items():
        if o is not None: d[name]=correspond(base, recenter(o, base)).round(2).tolist()
    T[slot]=d

for s in ['l','r']:
    base=outline_grp(f'win-eyes-{s}')
    add(f'eye-{s}', base, {
        'shut':      outline_grp(f'win-eyes-{s}-blink'),
        'sad':       outline_grp(f'lose-eyes-{s}'),
        'neutral':   extract(frames['neutral'],   f'eyes-{s}',20,1),
        'surprised': extract(frames['surprised'], f'eyes-{s}',22,1)})
mbase=outline_grp('win-mouth')
add('mouth', mbase, {
    'sad':       outline_grp('lose-mouth'),
    'neutral':   extract(frames['neutral'],   'mouth',16,1),
    'surprised': extract(frames['surprised'], 'mouth',16,1)})
for s in ['l','r']:
    base=outline_grp(f'win-brows-{s}',merge=3)
    add(f'brow-{s}', base, {
        'neutral':   extract(frames['neutral'],   f'brows-{s}',12,2,merge=3),
        'sad':       outline_grp(f'lose-brows-{s}',merge=3),
        'surprised': extract(frames['surprised'], f'brows-{s}',14,2,merge=3)})
json.dump(T, open('/home/serg/cpp/hangman/rig/face_targets.json','w'))
print('slots:', {k:list(v) for k,v in T.items()})
