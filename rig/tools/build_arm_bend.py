#!/usr/bin/env python3
"""Build the arm as a spline-bone (shoulder->elbow->wrist). The arm shape is one
brush stroke; we deform it along a 2-segment skeleton anchored at the SHOULDER.
rest = straight (T-pose); bent = forearm rotated about the elbow, with the corner
ROUNDED over a short span (avoids the thickness pinching at a sharp kink). The
demo slider t just curls rest->bent via the shared turning-angle engine, so
intermediate t = a partially-bent elbow. Emits arm_bend.json (+ validation png)."""
import re, json, math, io, os, sys, numpy as np, cairosvg
from PIL import Image, ImageDraw
from svgpathtools import parse_path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import bones
GEN='/home/serg/cpp/hangman/rig/generated/'
src=open(GEN+'hand-spread.svg').read()
vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',src).group(1).split()]
def clean(t): return re.sub(r'\s(inkscape|sodipodi):[\w-]+="[^"]*"','',t)
def layer(name): m=re.search(r'inkscape:label="'+re.escape(name)+r'"[^>]*>(.*?)</g>',src,re.S); return m.group(1) if m else ''
def marker(name):
    b=layer(name); cx=re.search(r'\bcx="([^"]*)"',b); cy=re.search(r'\bcy="([^"]*)"',b)
    return np.array([float(cx.group(1)),float(cy.group(1))])
WRIST=marker('wrist (marker)'); ELBOW=marker('elbow (marker)')

# --- arm shape -> local frame anchored at the SHOULDER, pointing +x toward the wrist
def subpolys(d,step=0.5):
    P=parse_path(d); out=[]
    for sp in P.continuous_subpaths():
        n=max(10,int(sp.length(error=1e-2)/step)); out.append(np.array([[sp.point(T).real,sp.point(T).imag] for T in np.linspace(0,1,n)]))
    return out
polys=[p for d in re.findall(r'\sd="([^"]*)"',layer('arm')) for p in subpolys(d)]
allp=np.concatenate(polys); c=allp.mean(0)
axis=np.linalg.svd(allp-c)[2][0]; proj=(allp-c)@axis
e0=allp[proj.argmin()]; e1=allp[proj.argmax()]
# shoulder = tip FARTHEST from the wrist marker (opposite of the finger's knuckle rule)
SH,WR=(e0,e1) if np.hypot(*(e0-WRIST))>np.hypot(*(e1-WRIST)) else (e1,e0)
u=(WR-SH); u=u/np.hypot(*u); th=math.atan2(u[1],u[0])
cs,sn=math.cos(-th),math.sin(-th); Rm=np.array([[cs,-sn],[sn,cs]])   # rotate by -th about SH
def toloc(P): return (P-SH)@Rm.T
loc=[toloc(p) for p in polys]
a=np.concatenate(loc); xmn,xmx=a[:,0].min(),a[:,0].max(); ymid=(a[:,1].min()+a[:,1].max())/2
E=toloc(ELBOW); e=float(E[0])                                        # elbow arc-position (local x)

# --- skeletons (N points, same count). rest straight; bent = rounded-corner bend at the elbow
N=64; L=xmx-xmn
PHI=math.radians(-100.0)   # max forearm bend (negative = up in SVG); slider scales 0..this
W=16.0                     # half-width of the rounded corner (local units) — "slight interpolation"
def smooth(u): u=min(1.0,max(0.0,u)); return u*u*(3-2*u)
def rest_bent():
    s=np.linspace(xmn,xmx,N); ds=(xmx-xmn)/(N-1)
    rest=np.stack([s,np.full(N,ymid)],1)
    V=[np.array([xmn,ymid])];
    for i in range(1,N):
        h=PHI*smooth(((s[i]-(xmn+e))+W)/(2*W))          # heading ramps 0->PHI across the elbow
        V.append(V[-1]+ds*np.array([math.cos(h),math.sin(h)]))
    return rest, np.array(V)
rest,bent=rest_bent()

DATA={'K':SH.round(2).tolist(),'deg':round(math.degrees(th),2),
      'polys':[p.round(2).tolist() for p in loc],'rest':rest.round(2).tolist(),'bent':bent.round(2).tolist(),
      'xmn':round(xmn,2),'xmx':round(xmx,2),'ymid':round(ymid,2),'elbow':round(e,2)}
json.dump({'viewBox':vb,'arm':DATA}, open('/home/serg/cpp/hangman/rig/arm_bend.json','w'))

# --- validate: arm at t=0,.5,1
Wpx=440; H=int(round(Wpx*vb[3]/vb[2]))
def place(t):
    dd=bones.deform({'polys':[np.array(p) for p in loc],'rest':rest,'bent':bent,'xmn':xmn,'xmx':xmx,'ymid':ymid},t)
    return f'<g transform="translate({SH[0]:.2f} {SH[1]:.2f}) rotate({math.degrees(th):.2f})"><path fill="#081c1a" d="{dd}"/></g>'
def frame(t):
    body=place(t)
    doc=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{Wpx}">{body}</svg>'
    return np.array(Image.open(io.BytesIO(cairosvg.svg2png(bytestring=doc.encode(),output_width=Wpx,background_color='white'))).convert('RGB'))
TS=[-1.0,-0.5,0,0.5,1.0]                                # bidirectional: negative t mirrors the bend
sheet=Image.new('RGB',(Wpx*len(TS),H),(255,255,255))
for i,t in enumerate(TS):
    im=Image.fromarray(frame(t)); ImageDraw.Draw(im).text((6,6),f'bend={t}',fill=(200,0,0)); sheet.paste(im,(i*Wpx,0))
sheet.save('/home/serg/cpp/hangman/rig/traces/arm_bend.png')
print(f'shoulder={SH.round(1).tolist()} wrist~{WR.round(1).tolist()} elbow_local={e:.1f}/{L:.1f}  wrote arm_bend.json + traces/arm_bend.png')
