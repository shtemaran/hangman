#!/usr/bin/env python3
"""Trace a black-ink-on-white PNG into an annotatable SVG: each ink stroke (connected
component) becomes its own distinctly-coloured <path>, over a faint reference layer of
the source. Open in Inkscape and set each feature path's label (mouth / brows-l /
brows-r / eyes-l / eyes-r / head; -l/-r = viewer's). Then build_emotion_target.py reads
the labels to add the emotion to face_targets.json.

  python tools/trace_png.py generated/thoughtfull.png generated/thoughtful.svg
"""
import sys, numpy as np, base64
from PIL import Image
from scipy import ndimage
from skimage import measure
from skimage.filters import threshold_otsu
SRC=sys.argv[1] if len(sys.argv)>1 else 'generated/thoughtfull.png'
OUT=sys.argv[2] if len(sys.argv)>2 else 'generated/thoughtful.svg'
A=np.array(Image.open(SRC).convert('L')); H,W=A.shape
mask=ndimage.binary_closing(A<threshold_otsu(A),iterations=1)      # knit small brush gaps
lab,n=ndimage.label(mask,structure=np.ones((3,3)))
comps=sorted([(i,(lab==i).sum()) for i in range(1,n+1)], key=lambda c:-c[1])
comps=[c for c in comps if c[1]>=80]                              # drop specks
PALETTE=['#e6194B','#3cb44b','#4363d8','#f58231','#911eb4','#42d4f4','#f032e6','#bfef45',
         '#fabed4','#469990','#dcbeff','#9A6324','#800000','#808000','#000075','#a9a9a9','#e07b00','#00a86b']
def to_path(m):
    pad=np.zeros((m.shape[0]+2,m.shape[1]+2),bool); pad[1:-1,1:-1]=m; subs=[]
    for c in measure.find_contours(pad.astype(float),0.5):
        c=measure.approximate_polygon(c,1.4)
        if len(c)>=3: subs.append('M '+' L '.join(f'{x-1:.1f},{y-1:.1f}' for y,x in c)+' Z')
    return ' '.join(subs)
paths=''.join(f'  <path id="part-{k+1}" inkscape:label="part-{k+1}" fill="{PALETTE[k%len(PALETTE)]}" '
              f'fill-rule="evenodd" fill-opacity="0.85" d="{to_path(lab==i)}"/>\n' for k,(i,_) in enumerate(comps))
b64=base64.b64encode(open(SRC,'rb').read()).decode()
svg=f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <g inkscape:groupmode="layer" inkscape:label="reference (source png)" sodipodi:insensitive="true" style="opacity:0.18">
    <image xlink:href="data:image/png;base64,{b64}" x="0" y="0" width="{W}" height="{H}"/>
  </g>
  <g inkscape:groupmode="layer" inkscape:label="traced parts">
{paths}  </g>
</svg>'''
open(OUT,'w').write(svg)
print(f'wrote {OUT}: {len(comps)} parts, viewBox 0 0 {W} {H}')
