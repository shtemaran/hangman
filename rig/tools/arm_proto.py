#!/usr/bin/env python3
"""Prototype skeletal brush arm. Angles: 0=+x(right), 90=+y(down), 180=left, 270=up.
Arm = shoulder-elbow-wrist (2-bone) + a hand that is EITHER 5 curling fingers
(when active) OR a dry-brush splatter (when hanging/relaxed)."""
import cairosvg, io, re, json, math, numpy as np
from PIL import Image, ImageDraw
svg=open('/home/serg/cpp/hangman/assets/marduk_semantic.svg').read()
vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',svg).group(1).split()]
wtf=re.search(r'<g id="win"[^>]*transform="([^"]*)"',svg).group(1)
T=json.load(open('/home/serg/cpp/hangman/rig/face_targets.json'))
W=300; H=int(round(W*vb[3]/vb[2]))
Hd=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{W}" height="{H}">'
def grp(g): return re.search(r'<g id="'+g+r'"[^>]*>(.*?)</g>',svg,re.S).group(1)
def rL(inner):
    p=cairosvg.svg2png(bytestring=(Hd+inner+'</svg>').encode(),output_width=W,output_height=H,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('L'))
def rC(inner):
    p=cairosvg.svg2png(bytestring=(Hd+inner+'</svg>').encode(),output_width=W,output_height=H,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('RGB'))
def bbx(g):
    m=rL(f'<g transform="{wtf}">{grp(g)}</g>')<128; ys,xs=np.where(m)
    return (vb[0]+xs.min()/W*vb[2],vb[0]+xs.max()/W*vb[2],vb[1]+ys.min()/H*vb[3],vb[1]+ys.max()/H*vb[3])
hb=bbx('win-head'); C=((hb[0]+hb[1])/2,(hb[2]+hb[3])/2); R=((hb[1]-hb[0])+(hb[3]-hb[2]))/4
pth=lambda P:'<path fill="#081C1A" d="M '+' L '.join(f'{x:.2f},{y:.2f}' for x,y in P)+' Z"/>'
face=''.join(pth(T[s]['happy']) for s in ['brow-l','brow-r','eye-l','eye-r','mouth'])
char=f'<g transform="{wtf}">{grp("win-head")}{grp("win-torso")}{face}</g>'

def vec(a): return np.array([math.cos(a),math.sin(a)])
def stroke(p0,p1,w0,w1):
    p0=np.array(p0,float); p1=np.array(p1,float); d=p1-p0; L=np.hypot(*d)
    if L<1e-3: return ''
    u=d/L; n=np.array([-u[1],u[0]])
    a=p0+n*w0/2; b=p1+n*w1/2; c=p1-n*w1/2; e=p0-n*w0/2
    return f'<path fill="#081C1A" d="M {a[0]:.2f},{a[1]:.2f} L {b[0]:.2f},{b[1]:.2f} L {c[0]:.2f},{c[1]:.2f} L {e[0]:.2f},{e[1]:.2f} Z"/>'
def dot(p,r): return f'<circle cx="{p[0]:.2f}" cy="{p[1]:.2f}" r="{r:.2f}" fill="#081C1A"/>'
# deterministic splatter: flecks clustered past a point along dir
def splatter(p,ang,scale):
    p=np.array(p,float); u=vec(ang); n=np.array([-u[1],u[0]]); s=''
    flecks=[(0.15,0.9,0.5),(0.5,-0.7,0.42),(0.85,0.5,0.33),(1.15,-0.35,0.22),(1.0,0.9,0.18),(1.4,0.2,0.14),(0.7,1.1,0.12),(1.6,-0.6,0.1)]
    for t,lat,sz in flecks:
        q=p+u*scale*t+n*scale*lat*0.5; s+=dot(q,scale*sz*0.45)
    return s

UP=R*0.55; FO=R*0.52; FL1=R*0.15; FL2=R*0.10
FAN=[math.radians(x) for x in (46,22,0,-22,-46)]
def finger(wrist, ha, fan, curl):
    a1=ha+fan - curl*math.radians(72); a2=a1 - curl*math.radians(88)
    k=np.array(wrist)+vec(ha+fan)*R*0.05; mid=k+vec(a1)*FL1; tip=mid+vec(a2)*FL2
    return stroke(k,mid,R*0.07,R*0.05)+stroke(mid,tip,R*0.05,R*0.022)+dot(tip,R*0.012)
def arm(shoulder,aSh,aEl,ha,hand):
    sh=np.array(shoulder,float); el=sh+vec(aSh)*UP; wr=el+vec(aSh+aEl)*FO
    s =stroke(sh,el,R*0.15,R*0.11)+stroke(el,wr,R*0.11,R*0.07)
    if hand=='splatter': s+=splatter(wr,aSh+aEl,R*0.32)
    else:
        s+=dot(wr,R*0.06)                        # palm
        for fan,c in zip(FAN,hand): s+=finger(wr,ha,fan,c)
    return s

SHL=(C[0]-R*0.60, C[1]+R*0.45)
poses=[
 ('T-pose spread', dict(aSh=math.radians(182),aEl=0,ha=math.radians(182),hand=[0,0,0,0,0])),
 ('hang (splatter)',dict(aSh=math.radians(96),aEl=math.radians(6),ha=0,hand='splatter')),
 ('fist',          dict(aSh=math.radians(120),aEl=math.radians(-18),ha=math.radians(95),hand=[.95,1,1,1,1])),
 ('point',         dict(aSh=math.radians(150),aEl=math.radians(-15),ha=math.radians(158),hand=[1,0,1,1,1])),
 ('reach/grab',    dict(aSh=math.radians(158),aEl=math.radians(-20),ha=math.radians(150),hand=[.5,.45,.5,.55,.6])),
]
cols=len(poses); sheet=Image.new('RGB',(W*cols,H),(255,255,255))
for i,(lab,kw) in enumerate(poses):
    body=char+f'<g>{arm(SHL,kw["aSh"],kw["aEl"],kw["ha"],kw["hand"])}</g>'
    im=Image.fromarray(rC(body)); ImageDraw.Draw(im).text((6,6),lab,fill=(200,0,0)); sheet.paste(im,(i*W,0))
sheet.save('/home/serg/cpp/hangman/rig/traces/arm_proto.png'); print('R=%.0f'%R)
