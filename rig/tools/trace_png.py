#!/usr/bin/env python3
"""Trace a black-ink-on-white PNG into an annotatable SVG: each ink stroke (connected
component) becomes its own distinctly-coloured, SMOOTH <path> (Catmull-Rom beziers, so
no manual "make nodes smooth" step), over a faint reference layer of the source. Empty
target layers (head / l-brow / r-brow / l-eye / r-eye / mouth) are pre-created — just
drag each traced part into the right layer in Inkscape, then run build_emotion_target.py.
(-l/-r = viewer's, but l/r is re-derived by geometry at build time so it needn't be exact.)

  python tools/trace_png.py generated/confused.png generated/confused.svg
"""
import sys, numpy as np, base64
from PIL import Image
from scipy import ndimage
from skimage import measure
from skimage.filters import threshold_otsu
SRC=sys.argv[1] if len(sys.argv)>1 else 'generated/confused.png'
OUT=sys.argv[2] if len(sys.argv)>2 else 'generated/confused.svg'
# empty layers to pre-create; pass a custom comma-separated set as argv[3] (e.g. modifiers add nose/cheeks)
TARGET_LAYERS=sys.argv[3].split(',') if len(sys.argv)>3 else ['head','l-brow','r-brow','l-eye','r-eye','mouth']
A=np.array(Image.open(SRC).convert('L')); H,W=A.shape
mask=ndimage.binary_closing(A<threshold_otsu(A),iterations=1)      # knit small brush gaps
lab,n=ndimage.label(mask,structure=np.ones((3,3)))
comps=sorted([(i,(lab==i).sum()) for i in range(1,n+1)], key=lambda c:-c[1])
comps=[c for c in comps if c[1]>=80]                              # drop specks
PALETTE=['#e6194B','#3cb44b','#4363d8','#f58231','#911eb4','#42d4f4','#f032e6','#bfef45',
         '#fabed4','#469990','#dcbeff','#9A6324','#800000','#808000','#000075','#a9a9a9','#e07b00','#00a86b']
def smooth(pts):                                                  # closed Catmull-Rom -> cubic beziers
    if len(pts)>1 and np.allclose(pts[0],pts[-1]): pts=pts[:-1]
    m=len(pts)
    if m<3: return ''
    d=f'M {pts[0][0]:.1f},{pts[0][1]:.1f} '
    for i in range(m):
        p0,p1,p2,p3=pts[(i-1)%m],pts[i],pts[(i+1)%m],pts[(i+2)%m]
        c1=(p1[0]+(p2[0]-p0[0])/6, p1[1]+(p2[1]-p0[1])/6)
        c2=(p2[0]-(p3[0]-p1[0])/6, p2[1]-(p3[1]-p1[1])/6)
        d+=f'C {c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f} '
    return d+'Z'
def to_path(m):
    pad=np.zeros((m.shape[0]+2,m.shape[1]+2),bool); pad[1:-1,1:-1]=m; subs=[]
    for c in measure.find_contours(pad.astype(float),0.5):
        c=measure.approximate_polygon(c,1.4)
        if len(c)>=3: subs.append(smooth([(x-1,y-1) for y,x in c]))
    return ' '.join(s for s in subs if s)
paths=''.join(f'  <path id="part-{k+1}" inkscape:label="part-{k+1}" fill="{PALETTE[k%len(PALETTE)]}" '
              f'fill-rule="evenodd" fill-opacity="0.85" d="{to_path(lab==i)}"/>\n' for k,(i,_) in enumerate(comps))
target=''.join(f'  <g inkscape:groupmode="layer" id="layer-{nm}" inkscape:label="{nm}"></g>\n' for nm in TARGET_LAYERS)
b64=base64.b64encode(open(SRC,'rb').read()).decode()
svg=f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <g inkscape:groupmode="layer" inkscape:label="reference (source png)" sodipodi:insensitive="true" style="opacity:0.18">
    <image xlink:href="data:image/png;base64,{b64}" x="0" y="0" width="{W}" height="{H}"/>
  </g>
  <g inkscape:groupmode="layer" id="layer-traced" inkscape:label="traced parts">
{paths}  </g>
{target}</svg>'''
open(OUT,'w').write(svg)
print(f'wrote {OUT}: {len(comps)} parts, empty layers {TARGET_LAYERS}, smooth beziers')
