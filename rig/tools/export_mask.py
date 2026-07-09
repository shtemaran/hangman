#!/usr/bin/env python3
"""Export a base image + inpaint mask from marduk_semantic.svg, for feeding a
generative-AI inpainting tool. Everything outside the mask stays identical, so
whatever the model draws inside the mask lands already registered to the rig.

Usage examples:
  export_mask.py --state win  --slots eyes-l eyes-r --name eyes_closed
  export_mask.py --state win  --slots hands-r         --name wand_right --shape box --pad 40
  export_mask.py --state lose --slots mouth           --name open_mouth

Outputs (to --out, default rig/out):
  <name>_base.png     the full character, black-on-white, square canvas
  <name>_mask.png     WHITE = region to inpaint/redraw, BLACK = keep unchanged
  <name>_overlay.png  base with the mask tinted red (sanity check)

Mask convention: white = editable (Stable Diffusion / most inpainting tools).
Deps: cairosvg, pillow, numpy, scipy.
"""
import argparse, io, re, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.spatial import ConvexHull
import cairosvg

SVG_PATH='/home/serg/cpp/hangman/assets/marduk_semantic.svg'
ALL_SLOTS=['bars','head','torso','mouth','brows-l','brows-r','eyes-l','eyes-r','hands-l','hands-r']

def load():
    svg=open(SVG_PATH).read()
    root=re.search(r'<svg[^>]*>',svg,re.S).group(0)
    vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',root).group(1).split()]
    return svg,vb

def state_transform(svg,state):
    m=re.search(rf'<g id="{state}"([^>]*)>',svg)
    t=re.search(r'transform="([^"]*)"',m.group(1)) if m else None
    return t.group(1) if t else ''

def grp_body(svg,gid):
    m=re.search(r'<g id="'+re.escape(gid)+r'"[^>]*>(.*?)</g>',svg,re.S)
    return m.group(1) if m else ''

def render(vb,inner,W,H):
    head=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{W}" height="{H}">'
    png=cairosvg.svg2png(bytestring=(head+inner+'</svg>').encode(),output_width=W,output_height=H,background_color='white')
    return Image.open(io.BytesIO(png)).convert('L')

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--state',default='win',choices=['win','lose'])
    ap.add_argument('--slots',nargs='+',required=True,help='slots to mask, e.g. eyes-l eyes-r')
    ap.add_argument('--name',required=True)
    ap.add_argument('--size',type=int,default=1024,help='square canvas px')
    ap.add_argument('--pad',type=int,default=18,help='mask dilation px (canvas space)')
    ap.add_argument('--shape',default='hull',choices=['hull','box','tight'])
    ap.add_argument('--no-bars',action='store_true',help='exclude cage bars from base image')
    ap.add_argument('--out',default='/home/serg/cpp/hangman/rig/out')
    a=ap.parse_args()

    svg,vb=load(); tf=state_transform(svg,a.state)
    def wrap(bodies): return (f'<g transform="{tf}">'+''.join(bodies)+'</g>') if tf else '<g>'+''.join(bodies)+'</g>'

    # working render size at viewBox aspect, then paste centred on square canvas
    S=a.size; margin=0.86
    W=int(S*margin); H=int(round(W*vb[3]/vb[2]))
    if H>int(S*margin): H=int(S*margin); W=int(round(H*vb[2]/vb[3]))
    ox,oy=(S-W)//2,(S-H)//2

    base_slots=[s for s in ALL_SLOTS if not (a.no_bars and s=='bars')]
    base=render(vb,wrap([grp_body(svg,f'{a.state}-{s}') for s in base_slots]),W,H)
    canvas=Image.new('L',(S,S),255); canvas.paste(base,(ox,oy))

    missing=[s for s in a.slots if not grp_body(svg,f'{a.state}-{s}')]
    if missing: sys.exit(f'unknown/empty slots: {missing}\navailable: {ALL_SLOTS}')
    feat=render(vb,wrap([grp_body(svg,f'{a.state}-{s}') for s in a.slots]),W,H)
    fp=np.array(feat)<128                      # feature footprint in WxH

    m=np.zeros((S,S),bool); m[oy:oy+H,ox:ox+W]=fp
    if a.shape=='box':
        lab,n=ndimage.label(m)
        for i in range(1,n+1):
            ys,xs=np.where(lab==i); m[ys.min():ys.max()+1,xs.min():xs.max()+1]=True
    elif a.shape=='hull':
        lab,n=ndimage.label(m); hull=np.zeros_like(m)
        img=Image.fromarray(hull.astype(np.uint8)); dr=ImageDraw.Draw(img)
        for i in range(1,n+1):
            ys,xs=np.where(lab==i); pts=np.stack([xs,ys],1)
            if len(pts)>=3:
                try: h=ConvexHull(pts); poly=[tuple(pts[v]) for v in h.vertices]; dr.polygon(poly,fill=1)
                except Exception: dr.rectangle([xs.min(),ys.min(),xs.max(),ys.max()],fill=1)
            else: dr.rectangle([xs.min(),ys.min(),xs.max(),ys.max()],fill=1)
        m=np.array(img).astype(bool)
    if a.pad>0: m=ndimage.binary_dilation(m,iterations=a.pad)

    mask=Image.fromarray(np.where(m,255,0).astype(np.uint8))     # white = edit
    over=canvas.convert('RGB'); ov=np.array(over); ov[m]=(ov[m]*0.4+np.array([255,40,40])*0.6).astype(np.uint8)
    over=Image.fromarray(ov)

    import os; os.makedirs(a.out,exist_ok=True)
    canvas.convert('RGB').save(f'{a.out}/{a.name}_base.png')
    mask.save(f'{a.out}/{a.name}_mask.png')
    over.save(f'{a.out}/{a.name}_overlay.png')
    print(f'wrote {a.out}/{a.name}_base.png  _mask.png  _overlay.png  ({S}x{S}, mask px={int(m.sum())})')

if __name__=='__main__': main()
