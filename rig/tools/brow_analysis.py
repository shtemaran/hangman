#!/usr/bin/env python3
"""Align the AI blink frame to our win character and compare the brows
(position + shape) against ours, to quantify how much the AI lowered them."""
import cairosvg, io, re, numpy as np
from PIL import Image
from scipy import ndimage
from skimage.filters import threshold_otsu
SEM='/home/serg/cpp/hangman/assets/marduk_semantic.svg'
GEN='/home/serg/cpp/hangman/rig/generated/1b50509f-3496-498a-ac87-03c3a6dd6722.png'
svg=open(SEM).read()
vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',svg).group(1).split()]
wtf=re.search(r'<g id="win"[^>]*transform="([^"]*)"',svg).group(1)
OWp=800; OHp=int(round(OWp*vb[3]/vb[2]))
def grp(g): m=re.search(r'<g id="'+g+r'"[^>]*>(.*?)</g>',svg,re.S); return m.group(1) if m else ''
Hd=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{OWp}" height="{OHp}">'
def render(inner):
    p=cairosvg.svg2png(bytestring=(Hd+inner+'</svg>').encode(),output_width=OWp,output_height=OHp,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('L'))<128
SLOTS=['bars','head','torso','mouth','brows-l','brows-r','eyes-l','eyes-r','hands-l','hands-r']
ours=render(f'<g transform="{wtf}">'+''.join(grp('win-'+s) for s in SLOTS)+'</g>'); osum=ours.sum()
gm=np.array(Image.open(GEN).convert('L')); blink=gm<threshold_otsu(gm)
def resized(m,p):
    w=max(1,int(m.shape[1]*p)); h=max(1,int(m.shape[0]*p))
    return np.array(Image.fromarray(m.astype(np.uint8)*255).resize((w,h)))>128
best=(-1,None,0,0)
for p in np.arange(0.45,0.85,0.03):
    m=resized(blink,p); H,W=m.shape
    if H<OHp or W<OWp: continue
    for y0 in range(0,H-OHp+1,3):
        for x0 in range(0,W-OWp+1,3):
            win=m[y0:y0+OHp,x0:x0+OWp]; inter=np.logical_and(win,ours).sum()
            iou=inter/(win.sum()+osum-inter)
            if iou>best[0]: best=(iou,round(p,3),x0,y0)
iou,P,X0,Y0=best
bm=resized(blink,P)[Y0:Y0+OHp,X0:X0+OWp]
print(f'align IoU={iou:.3f} scale={P} off=({X0},{Y0})')

ourbrow=render(f'<g transform="{wtf}">'+grp('win-brows-l')+grp('win-brows-r')+'</g>')
# brow band: dilate our brows, extend DOWN to catch a lowered version, exclude eye area
region=ndimage.binary_dilation(ourbrow,iterations=10)
region|=ndimage.binary_dilation(ourbrow,structure=np.array([[0,0,0],[0,1,0],[0,1,1]],bool),iterations=26) # bias downward
eyes=render(f'<g transform="{wtf}">'+grp('win-eyes-l')+grp('win-eyes-r')+'</g>')
region&=~ndimage.binary_dilation(eyes,iterations=6)
aibrow=np.logical_and(bm,region)
lab,n=ndimage.label(aibrow); sizes=[(lab==i).sum() for i in range(1,n+1)]
keep=np.argsort(sizes)[-2:]+1 if n>=2 else np.arange(1,n+1)
aibrow=np.isin(lab,list(keep))
def cy(m): ys,_=np.where(m); return ys.mean()
print(f'our brows centroid y={cy(ourbrow):.1f}   AI brows centroid y={cy(aibrow):.1f}   -> lowered by {cy(aibrow)-cy(ourbrow):.1f}px ({(cy(aibrow)-cy(ourbrow))/OHp*vb[3]:.1f} viewBox units)')
# per side offset
for side,xr in [('l',slice(0,OWp//2)),('r',slice(OWp//2,OWp))]:
    o=ourbrow.copy(); o[:,{'l':slice(OWp//2,OWp),'r':slice(0,OWp//2)}[side]]=False
    a=aibrow.copy(); a[:,{'l':slice(OWp//2,OWp),'r':slice(0,OWp//2)}[side]]=False
    if a.sum() and o.sum():
        oy,ox=np.where(o); ay,ax=np.where(a)
        print(f'  brow-{side}: our=({ox.mean():.0f},{oy.mean():.0f}) AI=({ax.mean():.0f},{ay.mean():.0f}) dx={ax.mean()-ox.mean():.1f} dy={ay.mean()-oy.mean():.1f}')
ov=np.full((OHp,OWp,3),255,np.uint8)
ov[np.logical_and(ours,~aibrow)]=(225,225,225)
ov[ourbrow]=(220,30,30); ov[aibrow]=(30,90,220)
Image.fromarray(ov).save('/home/serg/cpp/hangman/rig/traces/brow_compare.png')
print('wrote brow_compare.png (red=our brows, blue=AI brows)')
