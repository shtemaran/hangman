#!/usr/bin/env python3
"""Align a full-regen traced PNG to the semantic 'win' character, extract the
eye region, and prove it swaps in as a blink target."""
import cairosvg, io, re, numpy as np, sys
from PIL import Image
from scipy import ndimage
sys.path.insert(0,'/home/serg/cpp/hangman/rig/tools')
from trace import trace as trace_svg

OUT='/home/serg/cpp/hangman/rig/traces'
GEN='/home/serg/cpp/hangman/rig/generated/1b50509f-3496-498a-ac87-03c3a6dd6722.png'
svg=open('/home/serg/cpp/hangman/assets/marduk_semantic.svg').read()
root=re.search(r'<svg[^>]*>',svg,re.S).group(0)
vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',root).group(1).split()]
WTF=re.search(r'<g id="win"[^>]*transform="([^"]*)"',svg).group(1)
OWp=800; OHp=int(round(OWp*vb[3]/vb[2]))
Hd=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{OWp}" height="{OHp}">'
def grp(g): m=re.search(r'<g id="'+g+r'"[^>]*>(.*?)</g>',svg,re.S); return m.group(1) if m else ''
def render(inner):
    p=cairosvg.svg2png(bytestring=(Hd+inner+'</svg>').encode(),output_width=OWp,output_height=OHp,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('L'))<128
WIN_SLOTS=['bars','head','torso','mouth','brows-l','brows-r','eyes-l','eyes-r','hands-l','hands-r']
ours=render(f'<g transform="{WTF}">'+''.join(grp('win-'+s) for s in WIN_SLOTS)+'</g>'); ours_sum=ours.sum()

# blink source mask
gm=np.array(Image.open(GEN).convert('L')); from skimage.filters import threshold_otsu
blink=gm<threshold_otsu(gm)
def resized(mask,p):
    w=max(1,int(mask.shape[1]*p)); h=max(1,int(mask.shape[0]*p))
    return np.array(Image.fromarray(mask.astype(np.uint8)*255).resize((w,h)))>128
def best_off(m):
    H,W=m.shape; best=(-1,0,0)
    if H<OHp or W<OWp: return best
    for y0 in range(0,H-OHp+1,3):
        for x0 in range(0,W-OWp+1,3):
            win=m[y0:y0+OHp,x0:x0+OWp]; inter=np.logical_and(win,ours).sum()
            iou=inter/(win.sum()+ours_sum-inter)
            if iou>best[0]: best=(iou,x0,y0)
    return best
best=(-1,None,0,0)
for p in np.arange(0.45,0.85,0.03):
    m=resized(blink,p); iou,x0,y0=best_off(m)
    if iou>best[0]: best=(iou,round(p,3),x0,y0)
iou,P,X0,Y0=best
# fine
for p in np.arange(P-0.02,P+0.02,0.005):
    m=resized(blink,p); H,W=m.shape
    for y0 in range(max(0,Y0-6),min(H-OHp,Y0+6)+1):
        for x0 in range(max(0,X0-6),min(W-OWp,X0+6)+1):
            win=m[y0:y0+OHp,x0:x0+OWp]; inter=np.logical_and(win,ours).sum()
            i2=inter/(win.sum()+ours_sum-inter)
            if i2>iou: iou,P,X0,Y0=i2,round(p,3),x0,y0
print(f'alignment IoU={iou:.4f}  scale={P}  off=({X0},{Y0})')

# aligned blink mask in our pixel frame
bm=resized(blink,P)[Y0:Y0+OHp,X0:X0+OWp]
# overlay proof
ov=np.full((OHp,OWp,3),255,np.uint8)
ov[np.logical_and(ours,bm)]=(0,0,0); ov[np.logical_and(ours,~bm)]=(220,30,30); ov[np.logical_and(~ours,bm)]=(30,90,220)
Image.fromarray(ov).save(OUT+'/reg_overlay.png')

# eye region = dilated open-eye footprint
eyemask=render(f'<g transform="{WTF}">'+grp('win-eyes-l')+grp('win-eyes-r')+'</g>')
eyereg=ndimage.binary_dilation(eyemask,iterations=22)
blink_eyes=np.logical_and(bm,eyereg)
# keep two largest CCs (the two closed eyes), drop stray bar bits
lab,n=ndimage.label(blink_eyes); sizes=[(lab==i).sum() for i in range(1,n+1)]
keep=set(np.argsort(sizes)[-2:]+1) if n>=2 else set(range(1,n+1))
blink_eyes=np.isin(lab,list(keep))
Image.fromarray((~blink_eyes).astype(np.uint8)*255).save(OUT+'/blink_eyes_iso.png')

# proof: our character with open eyes removed, blink eyes drawn
base=render(f'<g transform="{WTF}">'+''.join(grp('win-'+s) for s in WIN_SLOTS if s not in('eyes-l','eyes-r'))+'</g>')
proof=np.logical_or(base,blink_eyes)
Image.fromarray((~proof).astype(np.uint8)*255).convert('RGB').save(OUT+'/blink_proof.png')
# also our normal (open) for side-by-side
sheet=Image.new('RGB',(OWp*2,OHp),(255,255,255))
sheet.paste(Image.fromarray((~ours).astype(np.uint8)*255).convert('RGB'),(0,0))
sheet.paste(Image.fromarray((~proof).astype(np.uint8)*255).convert('RGB'),(OWp,0))
sheet.save(OUT+'/blink_sidebyside.png')
print('wrote reg_overlay.png, blink_proof.png, blink_sidebyside.png')
