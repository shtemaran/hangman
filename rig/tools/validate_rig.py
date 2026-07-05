#!/usr/bin/env python3
"""Mirror rig.js flush() in Python; render composed poses (expr + blink + gaze + head)."""
import cairosvg, io, re, json, numpy as np
from PIL import Image, ImageDraw
svg=open('/home/serg/cpp/hangman/assets/marduk_semantic.svg').read()
vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',svg).group(1).split()]
wtf=re.search(r'<g id="win"[^>]*transform="([^"]*)"',svg).group(1)
T=json.load(open('/home/serg/cpp/hangman/rig/face_targets.json'))
cfg=dict(headX=22,headY=16,headTilt=7,gazeX=9,gazeY=6,browDrop=3,breathScale=0.025,breathBob=3.5,lean=6)
W=420; H=int(round(W*vb[3]/vb[2]))
Hd=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{W}" height="{H}">'
def grp(g): m=re.search(r'<g id="'+g+r'"[^>]*>(.*?)</g>',svg,re.S); return m.group(1) if m else ''
def rend(inner):
    p=cairosvg.svg2png(bytestring=(Hd+inner+'</svg>').encode(),output_width=W,output_height=H,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('RGB'))
def lerp(A,B,t): return [ [A[i][0]+(B[i][0]-A[i][0])*t, A[i][1]+(B[i][1]-A[i][1])*t] for i in range(len(A)) ]
def exprShape(slot,e):
    t=T[slot]
    return lerp(t['neutral'],t['happy'],e) if e>=0 else (lerp(t['neutral'],t['sad'],-e) if 'sad' in t else t['neutral'])
def pth(P): return '<path fill="#081C1A" d="M '+' L '.join(f'{x:.2f},{y:.2f}' for x,y in P)+' Z"/>'
def eyeP(s,e,openW):
    P=exprShape('eye-'+s,e)
    if openW>0: P=lerp(P,T['eye-'+s]['shut'],openW)
    return pth(P)
BASE=['bars','head','torso','hands-l','hands-r']
def bbox_u(inner):
    a=(rend(inner)<128).any(2); ys,xs=np.where(a)
    return (vb[0]+xs.min()/W*vb[2],vb[1]+ys.min()/H*vb[3],(xs.max()-xs.min())/W*vb[2],(ys.max()-ys.min())/H*vb[3])
hc=grp('win-head')+grp('win-brows-l')+grp('win-brows-r')+eyeP('l',1,0)+eyeP('r',1,0)+pth(exprShape('mouth',1))
hb=bbox_u(hc); neck=(hb[0]+hb[2]/2,hb[1]+hb[3]*0.97)
bd=bbox_u(hc+grp('win-torso')+grp('win-hands-l')+grp('win-hands-r')); feet=(bd[0]+bd[2]/2,bd[1]+bd[3]); belly=(bd[0]+bd[2]/2,bd[1]+bd[3]*0.55)
def pose(**q):
    P=dict(headX=0,headY=0,headTilt=0,gazeX=0,gazeY=0,eyeOpenL=1,eyeOpenR=1,expr=1,breath=.5,bodyLean=0); P.update(q)
    gz=f'translate({P["gazeX"]*cfg["gazeX"]} {P["gazeY"]*cfg["gazeY"]})'
    eyes=f'<g transform="{gz}">{eyeP("l",P["expr"],1-P["eyeOpenL"])}</g><g transform="{gz}">{eyeP("r",P["expr"],1-P["eyeOpenR"])}</g>'
    bl=f'<g transform="translate(0 {(1-P["eyeOpenL"])*cfg["browDrop"]})">{grp("win-brows-l")}</g>'
    br=f'<g transform="translate(0 {(1-P["eyeOpenR"])*cfg["browDrop"]})">{grp("win-brows-r")}</g>'
    mth=pth(exprShape('mouth',P["expr"]))
    bob=(P["breath"]-0.5)*cfg["breathBob"]
    headT=f'translate({P["headX"]*cfg["headX"]} {P["headY"]*cfg["headY"]-bob}) rotate({P["headTilt"]*cfg["headTilt"]} {neck[0]} {neck[1]})'
    head=f'<g transform="{headT}">{grp("win-head")}{bl}{br}{eyes}{mth}</g>'
    bs=1+(P["breath"]-0.5)*cfg["breathScale"]
    bodyT=f'rotate({P["bodyLean"]*cfg["lean"]} {feet[0]} {feet[1]}) translate({belly[0]} {belly[1]}) scale(1 {bs}) translate({-belly[0]} {-belly[1]})'
    return rend(f'<g transform="{wtf}"><g transform="{bodyT}">{grp("win-torso")}{grp("win-hands-l")}{grp("win-hands-r")}{head}</g></g>')
poses=[('happy',dict(expr=1)),('neutral',dict(expr=0)),('sad',dict(expr=-1)),
       ('neutral + wink L',dict(expr=0,eyeOpenL=0)),
       ('sad + head-left + gaze',dict(expr=-1,headX=-1,gazeX=-0.8)),
       ('happy + blink-mid + tilt',dict(expr=1,eyeOpenL=.5,eyeOpenR=.5,headTilt=.6))]
cols=3; rows=2; sheet=Image.new('RGB',(W*cols,H*rows),(255,255,255))
for i,(lab,pp) in enumerate(poses):
    im=Image.fromarray(pose(**pp)); ImageDraw.Draw(im).text((6,6),lab,fill=(200,0,0))
    sheet.paste(im,((i%cols)*W,(i//cols)*H))
sheet.save('/home/serg/cpp/hangman/rig/traces/rig_poses.png'); print('wrote rig_poses.png')
