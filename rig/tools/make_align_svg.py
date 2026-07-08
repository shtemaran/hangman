#!/usr/bin/env python3
"""Make a manual-alignment SVG for a modifier. Puts the happy-marduk face as a locked grey
reference, and every annotated part (each labelled layer except the reference/leftover ones)
as a colour-coded labelled sub-group inside a single movable `<name>-group`, roughly head-aligned.
Scale/move the group onto the marduk (the 'head' sub-group is there to line up on), save, then
build_modifier_aligned.py reads the group transform.

  python tools/make_align_svg.py king generated/king.svg generated/king_align.svg
"""
import cairosvg, io, re, json, sys, numpy as np
from PIL import Image
NAME = sys.argv[1] if len(sys.argv)>1 else 'king'
TSVG = sys.argv[2] if len(sys.argv)>2 else 'generated/king.svg'
OUT  = sys.argv[3] if len(sys.argv)>3 else 'generated/king_align.svg'
SEM='/home/serg/cpp/hangman/assets/marduk_semantic.svg'
FT ='/home/serg/cpp/hangman/rig/face_targets.json'
SKIP={'reference (source png)','traced parts'}
NS='xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd"'
PAL=['#e6194B','#3cb44b','#4363d8','#f58231','#911eb4','#42d4f4','#f032e6','#bfef45','#fabed4','#469990',
     '#dcbeff','#9A6324','#800000','#808000','#000075','#a9a9a9','#e07b00','#00a86b','#7a5230','#5b0f8a']
sem=open(SEM).read(); vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',sem).group(1).split()]
def grp(g): m=re.search(r'<g id="'+g+r'"[^>]*>(.*?)</g>',sem,re.S); return m.group(1) if m else ''
def clean(t): return re.sub(r'\s(inkscape|sodipodi):[\w-]+="[^"]*"','',t)
FTd=json.load(open(FT))
ts=open(TSVG).read(); tvb=[float(x) for x in re.search(r'viewBox="([^"]*)"',ts).group(1).split()]
labels=[l for l in re.findall(r'inkscape:groupmode="layer"[^>]*?inkscape:label="([^"]*)"', ts) if l not in SKIP]
def layer_paths(label):
    m=re.search(r'<g\b[^>]*inkscape:label="'+re.escape(label)+r'"[^>]*>(.*?)</g>', ts, re.S)
    return re.findall(r'<path\b[^>]*?/>', m.group(1), re.S) if m else []
def d_of(p): m=re.search(r'\bd="([^"]*)"',p); return m.group(1) if m else ''
def rmask(inner, VB, W):
    H=int(round(W*VB[3]/VB[2]))
    doc=f'<svg {NS} viewBox="{VB[0]} {VB[1]} {VB[2]} {VB[3]}" width="{W}" height="{H}">{inner}</svg>'
    return np.array(Image.open(io.BytesIO(cairosvg.svg2png(bytestring=doc.encode(),background_color='white',output_width=W))).convert('L')), W, H
def bbox_area_c(inner, VB, W=700):     # ink bbox (VB coords), area(px), centroid(VB)
    m,W,H=rmask(inner,VB,W); ink=m<128; ys,xs=np.where(ink)
    x0=VB[0]+xs.min()/W*VB[2]; x1=VB[0]+xs.max()/W*VB[2]; y0=VB[1]+ys.min()/H*VB[3]; y1=VB[1]+ys.max()/H*VB[3]
    return (x0,y0,x1,y1), ink.sum(), (VB[0]+xs.mean()/W*VB[2], VB[1]+ys.mean()/H*VB[3])

# reference: happy marduk (win-local) grey
ref=clean(grp('win-head'))+clean(grp('win-torso'))
for s in ['mouth','brow-l','brow-r','eye-l','eye-r']:
    ref+='<path fill="#888" d="M '+' L '.join(f'{x:.2f},{y:.2f}' for x,y in FTd[s]['happy'])+' Z"/>'
# canonical trace(1254px)->win-local transform. Every generated PNG places the character in the SAME
# frame, so one transform (hand-tuned once on the clown) aligns them all — no per-modifier head guess
# (the head can be occluded, e.g. the crown). Fine-tune per modifier in the align SVG if a PNG drifted.
placement='matrix(0.45949,0,0,0.45949,136.05734,30.724615)'

# king-group: labelled sub-groups of recoloured paths
subs=''
for i,lb in enumerate(labels):
    col=PAL[i%len(PAL)]; ps=''
    for p in layer_paths(lb):
        p2=re.sub(r'fill="[^"]*"',f'fill="{col}"',p); p2=re.sub(r'fill-opacity="[^"]*"','fill-opacity="0.7"',p2)
        ps+=p2
    subs+=f'  <g inkscape:label="{lb}" id="{NAME}-{lb}">{ps}</g>\n    '
king=f'<g id="{NAME}-group" transform="{placement}">\n    {subs}</g>'

# viewBox: union of reference and placed king
ub,_,_=bbox_area_c(f'{ref}{king}', vb, 700)
VB=[ub[0]-25, ub[1]-25, (ub[2]-ub[0])+50, (ub[3]-ub[1])+50]
svg=f'''<svg {NS} xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="{VB[0]:.2f} {VB[1]:.2f} {VB[2]:.2f} {VB[3]:.2f}" width="{VB[2]:.0f}" height="{VB[3]:.0f}">
  <g inkscape:groupmode="layer" inkscape:label="marduk-happy (align to this)" sodipodi:insensitive="true" style="opacity:0.5">
    {ref}
  </g>
  <g inkscape:groupmode="layer" inkscape:label="{NAME} (move/scale onto marduk)">
    {king}
  </g>
</svg>'''
open(OUT,'w').write(svg)
print(f'wrote {OUT}  parts={labels}  viewBox={[round(v,1) for v in VB]}')
