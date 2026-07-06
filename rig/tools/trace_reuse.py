#!/usr/bin/env python3
"""Trace the real T-pose arm + finger strokes and reuse them: place at the
shoulder, aim the arm (rigid), fingers ride along. Look-test vs procedural."""
import cairosvg, io, re, json, math, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage import measure
svg=open('/home/serg/cpp/hangman/assets/marduk_semantic.svg').read()
vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',svg).group(1).split()]
wtf=re.search(r'<g id="win"[^>]*transform="([^"]*)"',svg).group(1)
T=json.load(open('/home/serg/cpp/hangman/rig/face_targets.json'))
W=320; H=int(round(W*vb[3]/vb[2]))
Hd=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{W}" height="{H}">'
def grp(g): return re.search(r'<g id="'+g+r'"[^>]*>(.*?)</g>',svg,re.S).group(1)
def rL(inner):
    p=cairosvg.svg2png(bytestring=(Hd+inner+'</svg>').encode(),output_width=W,output_height=H,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('L'))
def rCol(inner):
    p=cairosvg.svg2png(bytestring=(Hd+inner+'</svg>').encode(),output_width=W,output_height=H,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('RGB'))
def bbx(g):
    m=rL(f'<g transform="{wtf}">{grp(g)}</g>')<128; ys,xs=np.where(m)
    return (vb[0]+xs.min()/W*vb[2],vb[0]+xs.max()/W*vb[2],vb[1]+ys.min()/H*vb[3],vb[1]+ys.max()/H*vb[3])
hb=bbx('win-head'); C=((hb[0]+hb[1])/2,(hb[2]+hb[3])/2); R=((hb[1]-hb[0])+(hb[3]-hb[2]))/4
pth=lambda P:'<path fill="#081C1A" d="M '+' L '.join(f'{x:.2f},{y:.2f}' for x,y in P)+' Z"/>'
face=''.join(pth(T[s]['happy']) for s in ['brow-l','brow-r','eye-l','eye-r','mouth'])
char=f'<g transform="{wtf}">{grp("win-head")}{grp("win-torso")}{face}</g>'

# ---- extract strokes from the T-pose left arm region ----
im=np.array(Image.open('/home/serg/cpp/hangman/rig/generated/T-pose.png').convert('L'))<128
crop=im[655:815,150:545]; lab,n=ndimage.label(crop)
comps=[(i,(lab==i).sum()) for i in range(1,n+1)]
comps=[c for c in comps if c[1]>=40]
arm_id=max(comps,key=lambda c:c[1])[0]            # biggest = arm
arm_bb=np.where(lab==arm_id)
# fingers = comps to the LEFT of the arm's left end (the hand side)
armL=arm_bb[1].min()
fingers=[i for i,a in comps if i!=arm_id and np.where(lab==i)[1].mean()<armL+30 and np.where(lab==i)[1].max()<300]
def to_path(mask):
    pad=np.zeros((mask.shape[0]+2,mask.shape[1]+2),bool); pad[1:-1,1:-1]=mask
    cs=measure.find_contours(pad.astype(float),0.5)
    c=max(cs,key=lambda c:len(c)); c=measure.approximate_polygon(c,0.8)
    return [(x-1,y-1) for y,x in c]                 # crop coords
armP=to_path(lab==arm_id); fingP=[to_path(lab==i) for i in fingers]
# arm ends: shoulder = rightmost, wrist = leftmost (mid-height)
ay,ax=np.where(lab==arm_id); ymid=(ay.min()+ay.max())/2
S=np.array([ax.max(), ay[ax==ax.max()].mean()]); Wr=np.array([ax.min(), ay[ax==ax.min()].mean()])
baseAng=math.atan2(Wr[1]-S[1],Wr[0]-S[0]); La=np.hypot(*(Wr-S))
targetLa=R*1.05; s=targetLa/La
print('fingers found:',len(fingers),' armLen px',round(La),' scale',round(s,3))

def dpath(P): return '<path fill="#081C1A" d="M '+' L '.join(f'{x:.2f},{y:.2f}' for x,y in P)+' Z"/>'
# per-finger knuckle (nearest wrist) + signed curl angle toward the palm (-arm dir)
def near_far(P,ref):
    d=[np.hypot(x-ref[0],y-ref[1]) for x,y in P]; return P[int(np.argmin(d))],P[int(np.argmax(d))]
tdir=(S-Wr)/np.hypot(*(S-Wr))                      # curl target: back toward shoulder
fingMeta=[]
for f in fingP:
    K,tip=near_far(f,Wr); K=np.array(K); d=(np.array(tip)-K); d=d/np.hypot(*d)
    curlDeg=math.degrees(math.atan2(d[0]*tdir[1]-d[1]*tdir[0], d[0]*tdir[0]+d[1]*tdir[1]))  # signed angle d->tdir
    fingMeta.append((K,curlDeg))
def ink2vb(ix,iy): return (167.98+ix/648*493.94, 77.99+iy/562*425.95)
SHL=ink2vb(211,371)   # user-provided left shoulder, Inkscape page coords -> viewBox
print('SHL viewBox',tuple(round(v,1) for v in SHL))
def place(aim,curls):
    deg=math.degrees(aim-baseAng)
    inner=dpath(armP)
    for f,(K,cd),c in zip(fingP,fingMeta,curls):
        fold=(1 if cd>0 else -1)*min(abs(cd),100)*c      # cap fold so it curls, not flips
        sc=1-0.45*c                                       # foreshorten as it curls toward the palm
        inner+=f'<g transform="translate({K[0]} {K[1]}) rotate({fold}) scale({sc}) translate({-K[0]} {-K[1]})">{dpath(f)}</g>'
    return f'<g transform="translate({SHL[0]} {SHL[1]}) rotate({deg}) scale({s}) translate({-S[0]} {-S[1]})">{inner}</g>'
poses=[('spread',math.radians(150),[0]*5),('half',math.radians(150),[.5]*5),
       ('fist',math.radians(120),[1]*5),('point',math.radians(160),[1,0,1,1,1]),('down',math.radians(92),[.3]*5)]
cols=len(poses); sheet=Image.new('RGB',(W*cols,H),(255,255,255))
for i,(lb,aim,cu) in enumerate(poses):
    im2=Image.fromarray(rCol(char+place(aim,cu))); ImageDraw.Draw(im2).text((6,6),lb,fill=(200,0,0)); sheet.paste(im2,(i*W,0))
sheet.save('/home/serg/cpp/hangman/rig/traces/arm_reuse.png'); print('finger curlDegs',[round(m[1]) for m in fingMeta])
