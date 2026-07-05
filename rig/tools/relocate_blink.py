#!/usr/bin/env python3
"""Shift the baked blink-eye paths so each aligns its center onto the matching
open eye's center (in-place blink)."""
import cairosvg, io, re, numpy as np
from PIL import Image
SEM='/home/serg/cpp/hangman/assets/marduk_semantic.svg'
svg=open(SEM).read()
vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',svg).group(1).split()]
W=1000; H=int(round(W*vb[3]/vb[2]))
Hd=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{W}" height="{H}">'
def grp(g): return re.search(r'<g id="'+g+r'"[^>]*>(.*?)</g>',svg,re.S).group(1)
def center(g):  # local viewBox-unit centroid (no win transform)
    p=cairosvg.svg2png(bytestring=(Hd+grp(g)+'</svg>').encode(),output_width=W,output_height=H,background_color='white')
    m=np.array(Image.open(io.BytesIO(p)).convert('L'))<128; ys,xs=np.where(m)
    return np.array([vb[0]+xs.mean()/W*vb[2], vb[1]+ys.mean()/H*vb[3]])

for side in ['l','r']:
    op=center(f'win-eyes-{side}'); bl=center(f'win-eyes-{side}-blink')
    dx,dy=op-bl
    print(f'{side}: open={op.round(1)} blink={bl.round(1)} shift=({dx:.2f},{dy:.2f})')
    gid=f'win-eyes-{side}-blink'
    m=re.search(r'(<g id="'+gid+r'"[^>]*>)(.*?)(</g>)',svg,re.S)
    body=re.sub(r'(-?\d+\.?\d*),(-?\d+\.?\d*)',
                lambda mm:f'{float(mm.group(1))+dx:.2f},{float(mm.group(2))+dy:.2f}', m.group(2))
    svg=svg[:m.start()]+m.group(1)+body+m.group(3)+svg[m.end():]

open(SEM,'w').write(svg)
print('relocated blink eyes; new centers:',
      {s:center(f'win-eyes-{s}-blink').round(1).tolist() for s in ['l','r']})
