#!/usr/bin/env python3
"""Validate a true outline morph open-eye -> closed-arc (arc-length resample +
cyclic correspondence). Renders a filmstrip; 50% must be a real half-closed eye."""
import cairosvg, io, re, numpy as np
from PIL import Image, ImageDraw
from skimage import measure
SEM='/home/serg/cpp/hangman/assets/marduk_semantic.svg'
svg=open(SEM).read()
vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',svg).group(1).split()]
wtf=re.search(r'<g id="win"[^>]*transform="([^"]*)"',svg).group(1)
W=520; H=int(round(W*vb[3]/vb[2])); RW=1100; RH=int(round(RW*vb[3]/vb[2]))
def grp(g): return re.search(r'<g id="'+g+r'"[^>]*>(.*?)</g>',svg,re.S).group(1)
def hd(w,h): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{w}" height="{h}">'
def maskof(g,w,h):
    p=cairosvg.svg2png(bytestring=(hd(w,h)+grp(g)+'</svg>').encode(),output_width=w,output_height=h,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('L'))<128
def outline(g,N=90):
    m=maskof(g,RW,RH); pad=np.zeros((RH+2,RW+2),bool); pad[1:-1,1:-1]=m
    cs=measure.find_contours(pad.astype(float),0.5)
    c=max(cs,key=lambda c:0.5*abs(np.dot(c[:,1],np.roll(c[:,0],1))-np.dot(c[:,0],np.roll(c[:,1],1))))
    xy=np.stack([(c[:,1]-1)/RW*vb[2]+vb[0], (c[:,0]-1)/RH*vb[3]+vb[1]],1)   # viewBox units
    d=np.r_[0,np.cumsum(np.hypot(*np.diff(xy,axis=0).T))]; d/=d[-1]         # arc-length 0..1
    t=np.linspace(0,1,N,endpoint=False)
    return np.stack([np.interp(t,d,xy[:,0]),np.interp(t,d,xy[:,1])],1)
def correspond(A,B):
    Ac=A-A.mean(0); best=None
    for flip in (1,-1):
        Bf=(B[::flip]); Bc=Bf-Bf.mean(0)
        for r in range(len(A)):
            ssd=((Ac-np.roll(Bc,r,0))**2).sum()
            if best is None or ssd<best[0]: best=(ssd,flip,r)
    _,flip,r=best; return np.roll(B[::flip],r,0)

pairs={s:(outline(f'win-eyes-{s}'), correspond(outline(f'win-eyes-{s}'),outline(f'win-eyes-{s}-blink'))) for s in ['l','r']}
def morph_path(s,t):
    A,B=pairs[s]; P=(1-t)*A+t*B
    return '<path fill="#081C1A" d="M '+' L '.join(f'{x:.2f},{y:.2f}' for x,y in P)+' Z"/>'
SLOTS=['bars','head','torso','mouth','brows-l','brows-r','hands-l','hands-r']
def render(inner):
    p=cairosvg.svg2png(bytestring=(hd(W,H)+inner+'</svg>').encode(),output_width=W,output_height=H,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('RGB'))
def frame(t):
    body=''.join(grp('win-'+x) for x in SLOTS)+morph_path('l',t)+morph_path('r',t)
    return render(f'<g transform="{wtf}">'+body+'</g>')
vals=[0.0,0.25,0.5,0.75,1.0]
sheet=Image.new('RGB',(W*len(vals),H),(255,255,255))
for i,t in enumerate(vals):
    im=Image.fromarray(frame(t)); ImageDraw.Draw(im).text((6,6),f'morph t={t}',fill=(200,0,0))
    sheet.paste(im,(i*W,0))
sheet.save('/home/serg/cpp/hangman/rig/traces/morph_filmstrip.png')
# emit point arrays for the demo
import json
json.dump({s:{'open':pairs[s][0].round(2).tolist(),'shut':pairs[s][1].round(2).tolist()} for s in ['l','r']},
          open('/home/serg/cpp/hangman/rig/eye_morph.json','w'))
print('wrote morph_filmstrip.png and eye_morph.json (N=%d pts/eye)'%len(pairs['l'][0]))
