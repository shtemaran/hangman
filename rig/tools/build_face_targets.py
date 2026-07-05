#!/usr/bin/env python3
"""Build face_targets.json: per-slot morph keyframes corresponded to the happy base.
  eyes  : happy (win) / shut (blink) / neutral (neutral-face)
  mouth : happy (win) / sad (lose)   / neutral (neutral-face)
Aligns the neutral-face gen frame, isolates each feature, recenters onto its slot."""
import cairosvg, io, re, json, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage import measure
from skimage.filters import threshold_otsu
SEM='/home/serg/cpp/hangman/assets/marduk_semantic.svg'
NEU='/home/serg/cpp/hangman/rig/generated/neutral-face.png'
svg=open(SEM).read()
vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',svg).group(1).split()]
wtf=re.search(r'<g id="win"[^>]*transform="([^"]*)"',svg).group(1)
def grp(g): m=re.search(r'<g id="'+g+r'"[^>]*>(.*?)</g>',svg,re.S); return m.group(1) if m else ''
N=100; RW=1100; RH=int(round(RW*vb[3]/vb[2])); OWp=800; OHp=int(round(OWp*vb[3]/vb[2]))
def hd(w,h): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{w}" height="{h}">'
def mask(inner,w,h):
    p=cairosvg.svg2png(bytestring=(hd(w,h)+inner+'</svg>').encode(),output_width=w,output_height=h,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('L'))<128
def outline_from_mask(m,W,H,N=N):
    pad=np.zeros((H+2,W+2),bool); pad[1:-1,1:-1]=m
    cs=measure.find_contours(pad.astype(float),0.5)
    if not cs: return None
    c=max(cs,key=lambda c:0.5*abs(np.dot(c[:,1],np.roll(c[:,0],1))-np.dot(c[:,0],np.roll(c[:,1],1))))
    xy=np.stack([(c[:,1]-1)/W*vb[2]+vb[0],(c[:,0]-1)/H*vb[3]+vb[1]],1)
    d=np.r_[0,np.cumsum(np.hypot(*np.diff(xy,axis=0).T))]; d/=d[-1]
    t=np.linspace(0,1,N,endpoint=False)
    return np.stack([np.interp(t,d,xy[:,0]),np.interp(t,d,xy[:,1])],1)
def outline_grp(g,tf=''):  # group rendered alone (win-local coords) -> outline
    inner=(f'<g transform="{tf}">{grp(g)}</g>') if tf else grp(g)
    return outline_from_mask(mask(inner,RW,RH),RW,RH)
def correspond(A,B):
    Ac=A-A.mean(0); best=None
    for flip in (1,-1):
        Bf=B[::flip]; Bc=Bf-Bf.mean(0)
        for r in range(len(A)):
            s=((Ac-np.roll(Bc,r,0))**2).sum()
            if best is None or s<best[0]: best=(s,flip,r)
    _,flip,r=best; return np.roll(B[::flip],r,0)

# ---- align neutral-face to win frame ----
SLOTS=['bars','head','torso','mouth','brows-l','brows-r','eyes-l','eyes-r','hands-l','hands-r']
ours=mask(f'<g transform="{wtf}">'+''.join(grp('win-'+s) for s in SLOTS)+'</g>',OWp,OHp); osum=ours.sum()
gm=np.array(Image.open(NEU).convert('L')); gen=gm<threshold_otsu(gm)
def resized(m,p):
    w=max(1,int(m.shape[1]*p)); h=max(1,int(m.shape[0]*p))
    return np.array(Image.fromarray(m.astype(np.uint8)*255).resize((w,h)))>128
best=(-1,None,0,0)
for p in np.arange(0.45,0.85,0.03):
    m=resized(gen,p); H,W=m.shape
    if H<OHp or W<OWp: continue
    for y0 in range(0,H-OHp+1,4):
        for x0 in range(0,W-OWp+1,4):
            win=m[y0:y0+OHp,x0:x0+OWp]; inter=np.logical_and(win,ours).sum()
            iou=inter/(win.sum()+osum-inter)
            if iou>best[0]: best=(iou,round(p,3),x0,y0)
iou,P,X0,Y0=best; print('neutral align IoU=%.3f scale=%.3f'%(iou,P))
aligned=resized(gen,P)[Y0:Y0+OHp,X0:X0+OWp]

def slot_region(slot,it):
    fp=mask(f'<g transform="{wtf}">'+grp('win-'+slot)+'</g>',OWp,OHp)
    return ndimage.binary_dilation(fp,iterations=it), fp
def isolate(region,ncc):
    feat=np.logical_and(aligned,region); lab,n=ndimage.label(feat)
    if n==0: return feat
    sizes=[(lab==i).sum() for i in range(1,n+1)]; keep=np.argsort(sizes)[-ncc:]+1
    return np.isin(lab,list(keep))
def neutral_raw(slot,it,ncc):   # isolated feature outline (shape correct; position recentered by caller)
    reg,fp=slot_region(slot,it); feat=isolate(reg,ncc)
    return outline_from_mask(feat,OWp,OHp)
def recenter(o,ref): return o-o.mean(0)+ref.mean(0)       # onto ref outline's (pre-transform) centroid

T={}
# eyes
for s in ['l','r']:
    happy=outline_grp(f'win-eyes-{s}')
    shut =correspond(happy, outline_grp(f'win-eyes-{s}-blink'))
    neut =correspond(happy, recenter(neutral_raw(f'eyes-{s}',20,1), happy))
    sad  =correspond(happy, recenter(outline_grp(f'lose-eyes-{s}'), happy))   # sad eyes from lose character
    T[f'eye-{s}']={'happy':happy.round(2).tolist(),'shut':shut.round(2).tolist(),
                   'neutral':neut.round(2).tolist(),'sad':sad.round(2).tolist()}
# mouth
mh=outline_grp('win-mouth')
sad=outline_grp('lose-mouth'); sad=correspond(mh, recenter(sad,mh))
mneu=correspond(mh, recenter(neutral_raw('mouth',16,1), mh))
T['mouth']={'happy':mh.round(2).tolist(),'sad':sad.round(2).tolist(),'neutral':mneu.round(2).tolist()}
json.dump(T, open('/home/serg/cpp/hangman/rig/face_targets.json','w'))
print('wrote face_targets.json:', {k:list(v) for k,v in T.items()})

# ---- validation filmstrip: expr +1 happy -> 0 neutral -> -1 sad ----
W=420; H=int(round(W*vb[3]/vb[2]))
def rend(inner):
    p=cairosvg.svg2png(bytestring=(hd(W,H)+inner+'</svg>').encode(),output_width=W,output_height=H,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('RGB'))
def key(slot,name): return np.array(T[slot][name])
def lerp(a,b,t): return a*(1-t)+b*t
def exprShape(slot,expr):   # eyes: happy<->neutral (expr>=0), clamp neutral (expr<0); mouth adds sad
    h=key(slot,'happy'); n=key(slot,'neutral')
    if expr>=0: P=lerp(n,h,expr)
    else: P= lerp(n,key(slot,'sad'),-expr) if 'sad' in T[slot] else n
    return P
def pth(P): return '<path fill="#081C1A" d="M '+' L '.join(f'{x:.2f},{y:.2f}' for x,y in P)+' Z"/>'
BASE=['bars','head','torso','brows-l','brows-r','hands-l','hands-r']
def frame(expr):
    body=''.join(grp('win-'+s) for s in BASE)+pth(exprShape('eye-l',expr))+pth(exprShape('eye-r',expr))+pth(exprShape('mouth',expr))
    return rend(f'<g transform="{wtf}">'+body+'</g>')
vals=[1.0,0.5,0.0,-0.5,-1.0]
sheet=Image.new('RGB',(W*len(vals),H),(255,255,255))
for i,e in enumerate(vals):
    im=Image.fromarray(frame(e)); ImageDraw.Draw(im).text((6,6),f'expr={e}',fill=(200,0,0))
    sheet.paste(im,(i*W,0))
sheet.save('/home/serg/cpp/hangman/rig/traces/expr_filmstrip.png')
print('wrote expr_filmstrip.png')
