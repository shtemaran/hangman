#!/usr/bin/env python3
"""Bend all 5 fingers in a per-finger LOCAL frame (rotate finger horizontal at
the knuckle, bend via Inkscape math, place back with a transform). pointer &
middle reuse the artist's bendpath; thumb/ring/pinky get a curl template scaled
to their principal line. Emits finger_bend.json (local polys + skeletons + placement)."""
import re, json, math, io, os, sys, numpy as np, cairosvg
from PIL import Image, ImageDraw
from svgpathtools import parse_path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import bones   # shared deform engine
GEN='/home/serg/cpp/hangman/rig/generated/'
spread=open(GEN+'hand-spread.svg').read(); closed=open(GEN+'hand-spread-closed.svg').read()
vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',spread).group(1).split()]
WRIST=np.array([105.5,69.5]); LABELS=['thumb','pointer','middle','ring','pinky']
def clean(t): return re.sub(r'\s(inkscape|sodipodi):[\w-]+="[^"]*"','',t)
def layer(src,name): m=re.search(r'inkscape:label="'+name+r'"[^>]*>(.*?)</g>',src,re.S); return m.group(1) if m else ''
def subpolys(d,step=0.5):
    P=parse_path(d); out=[]
    for sp in P.continuous_subpaths():
        n=max(10,int(sp.length(error=1e-2)/step)); out.append(np.array([[sp.point(T).real,sp.point(T).imag] for T in np.linspace(0,1,n)]))
    return out
def finger_polys(src,name):
    body=layer(src,name); return [p for d in re.findall(r'\sd="([^"]*)"',body) for p in subpolys(d)]

def frame_of(polys):
    allp=np.concatenate(polys); c=allp.mean(0)
    axis=np.linalg.svd(allp-c)[2][0]
    proj=(allp-c)@axis; e0=allp[proj.argmin()]; e1=allp[proj.argmax()]
    K,T=(e0,e1) if np.hypot(*(e0-WRIST))<np.hypot(*(e1-WRIST)) else (e1,e0)
    u=(T-K); u=u/np.hypot(*u); th=math.atan2(u[1],u[0])
    c_,s_=math.cos(-th),math.sin(-th); Rm=np.array([[c_,-s_],[s_,c_]])   # rotate by -th
    loc=[ (pl-K)@Rm.T for pl in polys ]
    return K,th,loc
def bbox(loc):
    a=np.concatenate(loc); return a[:,0].min(),a[:,0].max(),(a[:,1].min()+a[:,1].max())/2
def sample_bend_local(bp,K,th):  # user bendpath -> local frame points
    P=parse_path(bp); L=P.length(error=1e-2); pts=np.array([[P.point(P.ilength(sv,s_tol=1e-3)).real,P.point(P.ilength(sv,s_tol=1e-3)).imag] for sv in np.linspace(0,L,48)])
    c_,s_=math.cos(-th),math.sin(-th); Rm=np.array([[c_,-s_],[s_,c_]]); return (pts-K)@Rm.T

# LPE bendpaths (finger label -> bendpath) from closed file
effs={m.group(1):m.group(2) for m in re.finditer(r'<inkscape:path-effect\b[^>]*id="([^"]*)"[^>]*bendpath="([^"]*)"',closed,re.S)}
userbend={}
for lm in re.finditer(r'inkscape:label="([a-z]+)"[^>]*>(.*?)</g>',closed,re.S):
    for pm in re.finditer(r'<path\b[^>]*?/>',lm.group(2),re.S):
        pe=re.search(r'inkscape:path-effect="#([^"]*)"',pm.group(0))
        if pe and re.search(r'[csq]',effs[pe.group(1)]): userbend[lm.group(1)]=effs[pe.group(1)]

# build per-finger local data
FING={}
for lb in LABELS:
    polys=finger_polys(spread,lb); K,th,loc=frame_of(polys); xmn,xmx,ymid=bbox(loc)
    FING[lb]={'K':K,'th':th,'loc':loc,'xmn':xmn,'xmx':xmx,'ymid':ymid,'len':xmx-xmn}
# curl template from pointer's user bend (normalized to unit local length)
def norm_curl(lb):
    b=sample_bend_local(userbend[lb],FING[lb]['K'],FING[lb]['th']); return b/FING[lb]['len']
TEMPLATE=norm_curl('pointer')                         # canonical curl, x in ~[0,1]
FLIP={'thumb'}                                        # curl these the opposite way (mirror across rest axis)
def local_skels(lb):
    f=FING[lb]; rest=np.stack([np.linspace(f['xmn'],f['xmx'],48),np.full(48,f['ymid'])],1)
    if lb in userbend: bent=sample_bend_local(userbend[lb],f['K'],f['th'])
    else: bent=TEMPLATE*f['len']                      # scale template to this finger
    if lb in FLIP: bent=bent.copy(); bent[:,1]=2*f['ymid']-bent[:,1]
    return rest,bent

DATA={}
for lb in LABELS:
    f=FING[lb]; rest,bent=local_skels(lb)
    DATA[lb]={'K':f['K'].round(2).tolist(),'deg':round(math.degrees(f['th']),2),
              'polys':[p.round(2).tolist() for p in f['loc']],'rest':rest.round(2).tolist(),'bent':bent.round(2).tolist(),
              'xmn':round(f['xmn'],2),'xmx':round(f['xmx'],2),'ymid':round(f['ymid'],2)}
json.dump({'viewBox':vb,'arm':clean(layer(spread,'arm')),'fingers':DATA}, open('/home/serg/cpp/hangman/rig/finger_bend.json','w'))

# validate: full hand at t=0,.5,1
W=440; H=int(round(W*vb[3]/vb[2]))
def place(lb,t):
    f=FING[lb]; rest,bent=local_skels(lb); skel=bones.interp_skel(rest,bent,t)   # turning-angle (matches bones.js)
    dd=bones.bend_along(f['loc'],skel,f['xmn'],f['xmx'],f['ymid'])
    return f'<g transform="translate({f["K"][0]:.2f} {f["K"][1]:.2f}) rotate({math.degrees(f["th"]):.2f})"><path fill="#081c1a" d="{dd}"/></g>'
def frame(t):
    body=clean(layer(spread,'arm'))+''.join(place(lb,t) for lb in LABELS)
    return np.array(Image.open(io.BytesIO(cairosvg.svg2png(bytestring=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{W}">{body}</svg>').encode(),output_width=W,background_color='white'))).convert('RGB'))
sheet=Image.new('RGB',(W*3,H),(255,255,255))
for i,t in enumerate([0,0.5,1.0]):
    im=Image.fromarray(frame(t)); ImageDraw.Draw(im).text((6,6),f'all={t}',fill=(200,0,0)); sheet.paste(im,(i*W,0))
sheet.save('/home/serg/cpp/hangman/rig/traces/hand_bend_full.png'); print('wrote finger_bend.json + hand_bend_full.png; user-bent:',list(userbend))
