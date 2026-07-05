#!/usr/bin/env python3
"""Render the spherical gaze (replica of rig.js) across a gazeX sweep, with the
AI looking-right frame alongside for comparison."""
import cairosvg, io, re, json, numpy as np, math
from PIL import Image, ImageDraw
svg=open('/home/serg/cpp/hangman/assets/marduk_semantic.svg').read()
vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',svg).group(1).split()]
wtf=re.search(r'<g id="win"[^>]*transform="([^"]*)"',svg).group(1)
T=json.load(open('/home/serg/cpp/hangman/rig/face_targets.json'))
cfg=dict(gazeYaw=38,gazePitch=26,browDrop=3)
W=360; H=int(round(W*vb[3]/vb[2]))
Hd=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{W}" height="{H}">'
def grp(g): m=re.search(r'<g id="'+g+r'"[^>]*>(.*?)</g>',svg,re.S); return m.group(1) if m else ''
def rend(inner):
    p=cairosvg.svg2png(bytestring=(Hd+inner+'</svg>').encode(),output_width=W,output_height=H,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('RGB'))
def bbox_u(inner):
    a=(rend(inner)<128).any(2); ys,xs=np.where(a)
    return (vb[0]+xs.min()/W*vb[2],vb[1]+ys.min()/H*vb[3],(xs.max()-xs.min())/W*vb[2],(ys.max()-ys.min())/H*vb[3])
cen=lambda P:[np.mean([q[0] for q in P]),np.mean([q[1] for q in P])]
hbx=bbox_u(grp('win-head')); headC=[hbx[0]+hbx[2]/2,hbx[1]+hbx[3]/2]; Rx=hbx[2]/2; Ry=hbx[3]/2
eyeBase={s:cen(T[f'eye-{s}']['happy']) for s in 'lr'}; mouthBase=cen(T['mouth']['happy'])
browBase={}
for s in 'lr':
    b=bbox_u(grp(f'win-brows-{s}')); browBase[s]=[b[0]+b[2]/2,b[1]+b[3]/2]
def pth(P): return '<path fill="#081C1A" d="M '+' L '.join(f'{x:.2f},{y:.2f}' for x,y in P)+' Z"/>'
def sphere(bx,by,yaw,pitch,dip=0,k=0):
    dx=bx-headC[0]; dy=by-headC[1]
    mu=math.asin(max(-1,min(1,dy/Ry))); hr=1-k*(1-math.cos(mu))
    la=math.asin(max(-1,min(1,dx/(Rx*hr))))
    l2=la+yaw; m2=mu+pitch; hr2=1-k*(1-math.cos(m2))
    nx=headC[0]+Rx*hr2*math.sin(l2); ny=headC[1]+Ry*math.sin(m2)+dip
    sx=(math.cos(l2)*hr2)/max(math.cos(la)*hr,1e-3); sy=math.cos(m2)/max(math.cos(mu),1e-3)
    return f'translate({nx} {ny}) scale({sx} {sy}) translate({-bx} {-by})'
def frame(gx,gy=0):
    yaw=gx*cfg['gazeYaw']*math.pi/180; pitch=gy*cfg['gazePitch']*math.pi/180
    el=f'<g transform="{sphere(*eyeBase["l"],yaw,pitch,0,0)}">{pth(T["eye-l"]["happy"])}</g>'
    er=f'<g transform="{sphere(*eyeBase["r"],yaw,pitch,0,0)}">{pth(T["eye-r"]["happy"])}</g>'
    mo=f'<g transform="{sphere(*mouthBase,yaw,pitch,0,1)}">{pth(T["mouth"]["happy"])}</g>'
    bl=f'<g transform="{sphere(*browBase["l"],yaw,pitch,0,0)}">{grp("win-brows-l")}</g>'
    br=f'<g transform="{sphere(*browBase["r"],yaw,pitch,0,0)}">{grp("win-brows-r")}</g>'
    body=grp('win-head')+grp('win-torso')+grp('win-hands-l')+grp('win-hands-r')+bl+br+el+er+mo
    return rend(f'<g transform="{wtf}">'+body+'</g>')
vals=[('gazeX=-1',-1,0),('-0.5',-.5,0),('center',0,0),('+0.5',.5,0),('gazeX=+1',1,0)]
sheet=Image.new('RGB',(W*(len(vals)+1),H),(255,255,255))
for i,(lab,gx,gy) in enumerate(vals):
    im=Image.fromarray(frame(gx,gy)); ImageDraw.Draw(im).text((6,6),lab,fill=(200,0,0)); sheet.paste(im,(i*W,0))
ai=Image.open('/home/serg/cpp/hangman/rig/generated/looking-right-1.png').convert('RGB').resize((W,H))
ImageDraw.Draw(ai).text((6,6),'AI look-right',fill=(200,0,0)); sheet.paste(ai,(len(vals)*W,0))
sheet.save('/home/serg/cpp/hangman/rig/traces/gaze_filmstrip.png'); print('wrote gaze_filmstrip.png')
