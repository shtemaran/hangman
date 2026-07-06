#!/usr/bin/env python3
"""Swap finger labels (thumb<->pointer, ring<->pinky) in both hand files, detect
which fingers were bent, and emit finger_morph.json (arm + static fingers as
paths; bent fingers as corresponded open/closed point arrays)."""
import cairosvg, io, re, json, numpy as np
from PIL import Image
from skimage import measure
GEN='/home/serg/cpp/hangman/rig/generated/'
def swap_labels(path):
    t=open(path).read()
    for a,b in [('"thumb"','"pointer"'),('"layer-thumb"','"layer-pointer"'),
                ('"ring"','"pinky"'),('"layer-ring"','"layer-pinky"')]:
        t=t.replace(a,'\x00').replace(b,a).replace('\x00',b)
    open(path,'w').write(t)
for f in ['hand-spread.svg','hand-spread-closed.svg']: swap_labels(GEN+f)
print('labels swapped in both files')

LABELS=['thumb','pointer','middle','ring','pinky']
def load(path):
    s=open(path).read(); vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',s).group(1).split()]; return s,vb
def clean(t): return re.sub(r'\s(inkscape|sodipodi):[\w-]+="[^"]*"','',t)
def layer(s,name):
    m=re.search(r'<g\b[^>]*inkscape:label="'+name+r'"[^>]*>(.*?)</g>',s,re.S); return clean(m.group(1)) if m else ''
spread_s,vb=load(GEN+'hand-spread.svg'); closed_s,_=load(GEN+'hand-spread-closed.svg')
W=700; H=int(round(W*vb[3]/vb[2]))
def rmask(body):
    doc=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{W}">{body}</svg>'
    return np.array(Image.open(io.BytesIO(cairosvg.svg2png(bytestring=doc.encode(),output_width=W,background_color='white'))).convert('L'))<128
def outline(mask,N=120):
    pad=np.zeros((mask.shape[0]+2,mask.shape[1]+2),bool); pad[1:-1,1:-1]=mask
    cs=measure.find_contours(pad.astype(float),0.5)
    c=max(cs,key=lambda c:0.5*abs(np.dot(c[:,1],np.roll(c[:,0],1))-np.dot(c[:,0],np.roll(c[:,1],1))))
    xy=np.stack([(c[:,1]-1)/W*vb[2]+vb[0],(c[:,0]-1)/H*vb[3]+vb[1]],1)
    d=np.r_[0,np.cumsum(np.hypot(*np.diff(xy,axis=0).T))]; d/=d[-1]; t=np.linspace(0,1,N,endpoint=False)
    return np.stack([np.interp(t,d,xy[:,0]),np.interp(t,d,xy[:,1])],1)
def correspond(A,B):
    Ac=A-A.mean(0); best=None
    for fl in (1,-1):
        Bf=B[::fl]; Bc=Bf-Bf.mean(0)
        for r in range(len(A)):
            s=((Ac-np.roll(Bc,r,0))**2).sum()
            if best is None or s<best[0]: best=(s,fl,r)
    _,fl,r=best; return np.roll(B[::fl],r,0)

out={'viewBox':vb, 'arm':clean(layer(spread_s,'arm')), 'static':{}, 'morph':{}}
for lb in LABELS:
    so=layer(spread_s,lb); co=layer(closed_s,lb)
    ms=rmask(so); mc=rmask(co)
    inter=np.logical_and(ms,mc).sum(); iou=inter/max(1,np.logical_or(ms,mc).sum())
    if iou<0.75:   # bent -> morph target
        A=outline(ms); B=correspond(A,outline(mc))
        out['morph'][lb]={'open':A.round(2).tolist(),'closed':B.round(2).tolist()}
        print(f'  {lb}: BENT (iou {iou:.2f}) -> morph')
    else:
        out['static'][lb]=so; print(f'  {lb}: static (iou {iou:.2f})')
json.dump(out, open('/home/serg/cpp/hangman/rig/finger_morph.json','w'))
print('wrote finger_morph.json; bent:',list(out['morph']))
