#!/usr/bin/env python3
"""Vectorize the isolated blink eyes (rig/traces/blink_eyes_iso.png, already in
our render frame) and insert them into marduk_semantic.svg as hidden targets
win-eyes-l-blink / win-eyes-r-blink (in #win's pre-transform coords)."""
import re, io, numpy as np, cairosvg
from PIL import Image
from skimage import measure
from skimage.filters import threshold_otsu

SEM='/home/serg/cpp/hangman/assets/marduk_semantic.svg'
ISO='/home/serg/cpp/hangman/rig/traces/blink_eyes_iso.png'
svg=open(SEM).read()
root=re.search(r'<svg[^>]*>',svg,re.S).group(0)
vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',root).group(1).split()]
wtf=re.search(r'<g id="win"[^>]*transform="translate\(([-\d.]+) ([-\d.]+)\)"',svg)
tdx,tdy=float(wtf.group(1)),float(wtf.group(2))

g=np.array(Image.open(ISO).convert('L')); OHp,OWp=g.shape
ink=g<128
k=vb[2]/OWp                                   # px -> viewBox unit
def px2vb(x,y):                               # -> #win pre-transform coords
    return (vb[0]+x*k - tdx, vb[1]+y*k - tdy)

pad=np.zeros((OHp+2,OWp+2),bool); pad[1:-1,1:-1]=ink
cons=[c for c in measure.find_contours(pad.astype(float),0.5) if len(measure.approximate_polygon(c,1.0))>=3]
cons=[measure.approximate_polygon(c,0.8) for c in cons]
# split left / right at the mean of contour-centroid x
cxs=np.array([c[:,1].mean() for c in cons]); split=cxs.mean()
print(f'contours found: {len(cons)}  centroid xs: {cxs.round(0)}')
def path_of(cons_sub):
    subs=[]
    for c in cons_sub:
        pts=[px2vb(x-1,y-1) for y,x in c]
        subs.append('M '+' L '.join(f'{X:.2f},{Y:.2f}' for X,Y in pts)+' Z')
    return '<path fill="#081C1A" fill-rule="evenodd" d="'+' '.join(subs)+'"/>'
left=[c for c in cons if c[:,1].mean()<split]; right=[c for c in cons if c[:,1].mean()>=split]
gl=f'<g id="win-eyes-l-blink" style="display:none">{path_of(left)}</g>'
gr=f'<g id="win-eyes-r-blink" style="display:none">{path_of(right)}</g>'
print(f'blink eyes: {len(left)} L contours, {len(right)} R contours')

# insert inside #win, just before its closing tag
wm=re.search(r'(<g id="win"[^>]*>)(.*)(</g>\s*</svg>)',svg,re.S)
newwin=wm.group(1)+wm.group(2)+'\n'+gl+'\n'+gr+'\n'+wm.group(3)
svg2=svg[:wm.start()]+newwin
open(SEM,'w').write(svg2)
print('inserted win-eyes-l-blink / win-eyes-r-blink into',SEM)

# proof: render win with open eyes hidden, blink shown
def grp(s,body): return re.search(r'<g id="'+s+r'"[^>]*>(.*?)</g>',svg2,re.S).group(1)
Hd=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="700">'
SLOTS=['bars','head','torso','mouth','brows-l','brows-r','hands-l','hands-r']
body=f'<g transform="translate({tdx} {tdy})">'+''.join(grp('win-'+s,0) for s in SLOTS)+re.search(r'(<g id="win-eyes-l-blink".*?</g>).*?(<g id="win-eyes-r-blink".*?</g>)',svg2,re.S).group(1)+re.search(r'(<g id="win-eyes-r-blink".*?</g>)',svg2,re.S).group(1)+'</g>'
body=body.replace('display:none','')
png=cairosvg.svg2png(bytestring=(Hd+body+'</svg>').encode(),output_width=700,background_color='white')
open('/home/serg/cpp/hangman/rig/traces/blink_baked_proof.png','wb').write(png)
print('wrote blink_baked_proof.png')
