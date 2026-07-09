#!/usr/bin/env python3
"""Trace a two-tone PNG into an SVG (marching-squares contours + even-odd fill).
  trace.py in.png out.svg [--tol 1.0] [--minarea 12] [--compare cmp.png]
Deps: scikit-image, pillow, numpy, cairosvg (compare only).
"""
import argparse, io, numpy as np
from PIL import Image
from skimage import measure
from skimage.filters import threshold_otsu

def trace(png, tol, minarea):
    g=np.array(Image.open(png).convert('L'))
    thr=threshold_otsu(g)
    ink=g<thr                                   # True = black ink
    H,W=ink.shape
    # pad so contours of edge-touching shapes close properly
    pad=np.zeros((H+2,W+2),bool); pad[1:-1,1:-1]=ink
    contours=measure.find_contours(pad.astype(float),0.5)
    subpaths=[]
    for c in contours:
        c=measure.approximate_polygon(c, tolerance=tol)
        if len(c)<3: continue
        ys=c[:,0]-1; xs=c[:,1]-1
        area=0.5*abs(np.dot(xs,np.roll(ys,1))-np.dot(ys,np.roll(xs,1)))
        if area<minarea: continue
        d='M '+' L '.join(f'{x:.2f},{y:.2f}' for x,y in zip(xs,ys))+' Z'
        subpaths.append(d)
    path=' '.join(subpaths)
    svg=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
         f'<path d="{path}" fill="#081C1A" fill-rule="evenodd"/></svg>')
    return svg, len(subpaths), (W,H)

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('inp'); ap.add_argument('out')
    ap.add_argument('--tol',type=float,default=1.0)
    ap.add_argument('--minarea',type=float,default=12)
    ap.add_argument('--compare')
    a=ap.parse_args()
    svg,n,(W,H)=trace(a.inp,a.tol,a.minarea)
    open(a.out,'w').write(svg)
    print(f'traced {a.inp} -> {a.out}: {n} contours, {W}x{H}, {len(svg)} bytes')
    if a.compare:
        import cairosvg
        tr=np.array(Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode(),output_width=W,background_color='white'))).convert('L'))
        orig=np.array(Image.open(a.inp).convert('L'))
        from skimage.filters import threshold_otsu as ot
        o=orig<ot(orig); t=tr<128
        sheet=Image.new('RGB',(W*2,H),(255,255,255))
        sheet.paste(Image.open(a.inp).convert('RGB'),(0,0))
        # diff overlay: black=agree, red=trace-only, blue=orig-only
        ov=np.full((H,W,3),255,np.uint8)
        ov[np.logical_and(t,o)]=(0,0,0); ov[np.logical_and(t,~o)]=(220,30,30); ov[np.logical_and(~t,o)]=(30,60,220)
        sheet.paste(Image.fromarray(ov),(W,0))
        sheet.save(a.compare)
        inter=np.logical_and(t,o).sum(); union=np.logical_or(t,o).sum()
        print(f'trace-vs-original IoU={inter/union:.4f}  (compare -> {a.compare})')
