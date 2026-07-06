#!/usr/bin/env python3
"""Emit the traced T-pose arm + 5 spread fingers as an Inkscape SVG, each finger
on its own labeled layer (thumb/pointer/middle/ring/pinky) + an arm layer."""
import numpy as np, re
from PIL import Image
from scipy import ndimage
from skimage import measure
im=np.array(Image.open('/home/serg/cpp/hangman/rig/generated/T-pose.png').convert('L'))<128
OX,OY=150,655
crop=im[OY:815, OX:545]; lab,n=ndimage.label(crop)
comps=[(i,(lab==i).sum()) for i in range(1,n+1)]; comps=[c for c in comps if c[1]>=40]
arm_id=max(comps,key=lambda c:c[1])[0]; armL=np.where(lab==arm_id)[1].min()
fingers=[i for i,a in comps if i!=arm_id and np.where(lab==i)[1].mean()<armL+30 and np.where(lab==i)[1].max()<300]
def contour(mask):
    pad=np.zeros((mask.shape[0]+2,mask.shape[1]+2),bool); pad[1:-1,1:-1]=mask
    cs=measure.find_contours(pad.astype(float),0.5); c=max(cs,key=len); c=measure.approximate_polygon(c,0.6)
    return np.array([[x-1,y-1] for y,x in c],float)
ay,ax=np.where(lab==arm_id); Wr=np.array([ax.min(), ay[ax==ax.min()].mean()])
armC=contour(lab==arm_id)
tf=[]
for i in fingers:
    c=contour(lab==i); kn=c[np.argmin(np.hypot(c[:,0]-Wr[0],c[:,1]-Wr[1]))]; tf.append((kn[1],c))
tf.sort(key=lambda z:z[0]); LABELS=['thumb','pointer','middle','ring','pinky']

# content bbox for a padded viewBox
allp=np.concatenate([armC]+[z[1] for z in tf]); M=8
x0,y0=allp.min(0)-M; x1,y1=allp.max(0)+M; Wv=x1-x0; Hv=y1-y0
def d(P): return 'M '+' L '.join(f'{x-x0:.2f},{y-y0:.2f}' for x,y in P)+' Z'
NS='xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"'
out=[f'<?xml version="1.0" encoding="UTF-8"?>',
     f'<svg {NS} width="{Wv:.1f}" height="{Hv:.1f}" viewBox="0 0 {Wv:.2f} {Hv:.2f}" version="1.1">']
out.append(f'  <g inkscape:groupmode="layer" id="layer-arm" inkscape:label="arm"><path fill="#081c1a" d="{d(armC)}"/></g>')
for i,(_,c) in enumerate(tf):
    out.append(f'  <g inkscape:groupmode="layer" id="layer-{LABELS[i]}" inkscape:label="{LABELS[i]}"><path fill="#081c1a" d="{d(c)}"/></g>')
# mark the wrist so you can see where the arm connects
out.append(f'  <g inkscape:groupmode="layer" id="layer-wrist" inkscape:label="wrist (marker)"><circle cx="{Wr[0]-x0:.2f}" cy="{Wr[1]-y0:.2f}" r="3" fill="#e00"/></g>')
out.append('</svg>')
open('/home/serg/cpp/hangman/rig/generated/hand-spread.svg','w').write('\n'.join(out))
print('wrote hand-spread.svg  viewBox 0 0 %.1f %.1f  fingers(y):'%(Wv,Hv),[round(z[0]) for z in tf])
