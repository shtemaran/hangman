#!/usr/bin/env python3
"""Outline-morph the happy win-mouth <-> the real lose-mouth (frown), recentered
onto the win-mouth position. Emits mouth_morph.json and a validation filmstrip."""
import cairosvg, io, re, json, numpy as np
from PIL import Image, ImageDraw
from skimage import measure
svg=open('/home/serg/cpp/hangman/assets/marduk_semantic.svg').read()
vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',svg).group(1).split()]
wtf=re.search(r'<g id="win"[^>]*transform="([^"]*)"',svg).group(1)
def grp(g): return re.search(r'<g id="'+g+r'"[^>]*>(.*?)</g>',svg,re.S).group(1)
RW=1100; RH=int(round(RW*vb[3]/vb[2]))
def hd(w,h): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{w}" height="{h}">'
def maskof(inner,w,h):
    p=cairosvg.svg2png(bytestring=(hd(w,h)+inner+'</svg>').encode(),output_width=w,output_height=h,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('L'))<128
def outline(inner,N=100):
    m=maskof(inner,RW,RH); pad=np.zeros((RH+2,RW+2),bool); pad[1:-1,1:-1]=m
    cs=measure.find_contours(pad.astype(float),0.5)
    c=max(cs,key=lambda c:0.5*abs(np.dot(c[:,1],np.roll(c[:,0],1))-np.dot(c[:,0],np.roll(c[:,1],1))))
    xy=np.stack([(c[:,1]-1)/RW*vb[2]+vb[0], (c[:,0]-1)/RH*vb[3]+vb[1]],1)
    d=np.r_[0,np.cumsum(np.hypot(*np.diff(xy,axis=0).T))]; d/=d[-1]
    t=np.linspace(0,1,N,endpoint=False)
    return np.stack([np.interp(t,d,xy[:,0]),np.interp(t,d,xy[:,1])],1)
def correspond(A,B):
    Ac=A-A.mean(0); best=None
    for flip in (1,-1):
        Bf=B[::flip]; Bc=Bf-Bf.mean(0)
        for r in range(len(A)):
            s=((Ac-np.roll(Bc,r,0))**2).sum()
            if best is None or s<best[0]: best=(s,flip,r)
    _,flip,r=best; return np.roll(B[::flip],r,0)

smile=outline(grp('win-mouth'))
frown=outline(grp('lose-mouth'))
frown=frown-frown.mean(0)+smile.mean(0)      # recenter frown onto win-mouth position
frown=correspond(smile,frown)
json.dump({'smile':smile.round(2).tolist(),'frown':frown.round(2).tolist()},
          open('/home/serg/cpp/hangman/rig/mouth_morph.json','w'))

# filmstrip: smile=+1..-1  (w=(1-smile)/2)
W=420; H=int(round(W*vb[3]/vb[2]))
SLOTS=['bars','head','torso','brows-l','brows-r','eyes-l','eyes-r','hands-l','hands-r']
def rend(inner):
    p=cairosvg.svg2png(bytestring=(hd(W,H)+inner+'</svg>').encode(),output_width=W,output_height=H,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('RGB'))
def mouthpath(w):
    P=(1-w)*smile+w*frown
    return '<path fill="#081C1A" d="M '+' L '.join(f'{x:.2f},{y:.2f}' for x,y in P)+' Z"/>'
vals=[1.0,0.5,0.0,-0.5,-1.0]
sheet=Image.new('RGB',(W*len(vals),H),(255,255,255))
for i,sm in enumerate(vals):
    w=(1-sm)/2
    body=''.join(grp('win-'+s) for s in SLOTS)+mouthpath(w)
    im=Image.fromarray(rend(f'<g transform="{wtf}">'+body+'</g>')); ImageDraw.Draw(im).text((6,6),f'smile={sm}',fill=(200,0,0))
    sheet.paste(im,(i*W,0))
sheet.save('/home/serg/cpp/hangman/rig/traces/mouth_filmstrip.png')
print('wrote mouth_morph.json + mouth_filmstrip.png')
