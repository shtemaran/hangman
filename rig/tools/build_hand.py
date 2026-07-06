#!/usr/bin/env python3
"""Register the annotated thumbs-up fingers onto the T-pose wrist frame and
render the two endpoints (spread vs curled) on the character. Basis for a
per-finger outline morph."""
import cairosvg, io, re, json, math, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage import measure
svg=open('/home/serg/cpp/hangman/assets/marduk_semantic.svg').read()
vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',svg).group(1).split()]
wtf=re.search(r'<g id="win"[^>]*transform="([^"]*)"',svg).group(1)
T=json.load(open('/home/serg/cpp/hangman/rig/face_targets.json'))
W=340; H=int(round(W*vb[3]/vb[2]))
Hd=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="{W}" height="{H}">'
def grp(g): return re.search(r'<g id="'+g+r'"[^>]*>(.*?)</g>',svg,re.S).group(1)
def rL(inner):
    p=cairosvg.svg2png(bytestring=(Hd+inner+'</svg>').encode(),output_width=W,output_height=H,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('L'))
def rCol(inner):
    p=cairosvg.svg2png(bytestring=(Hd+inner+'</svg>').encode(),output_width=W,output_height=H,background_color='white')
    return np.array(Image.open(io.BytesIO(p)).convert('RGB'))
def bbx(g):
    m=rL(f'<g transform="{wtf}">{grp(g)}</g>')<128; ys,xs=np.where(m)
    return (vb[0]+xs.min()/W*vb[2],vb[0]+xs.max()/W*vb[2],vb[1]+ys.min()/H*vb[3],vb[1]+ys.max()/H*vb[3])
hb=bbx('win-head'); C=((hb[0]+hb[1])/2,(hb[2]+hb[3])/2); R=((hb[1]-hb[0])+(hb[3]-hb[2]))/4
pth=lambda P:'<path fill="#081C1A" d="M '+' L '.join(f'{x:.2f},{y:.2f}' for x,y in P)+' Z"/>'
face=''.join(pth(T[s]['happy']) for s in ['brow-l','brow-r','eye-l','eye-r','mouth'])
char=f'<g transform="{wtf}">{grp("win-head")}{grp("win-torso")}{face}</g>'

# ---- T-pose arm + spread fingers ----
im=np.array(Image.open('/home/serg/cpp/hangman/rig/generated/T-pose.png').convert('L'))<128
crop=im[655:815,150:545]; lab,n=ndimage.label(crop)
comps=[(i,(lab==i).sum()) for i in range(1,n+1)]; comps=[c for c in comps if c[1]>=40]
arm_id=max(comps,key=lambda c:c[1])[0]; armL=np.where(lab==arm_id)[1].min()
fingers_t=[i for i,a in comps if i!=arm_id and np.where(lab==i)[1].mean()<armL+30 and np.where(lab==i)[1].max()<300]
def contour(mask):
    pad=np.zeros((mask.shape[0]+2,mask.shape[1]+2),bool); pad[1:-1,1:-1]=mask
    cs=measure.find_contours(pad.astype(float),0.5); c=max(cs,key=len); c=measure.approximate_polygon(c,0.8)
    return np.array([[x-1,y-1] for y,x in c],float)
armC=contour(lab==arm_id)
ay,ax=np.where(lab==arm_id)
S=np.array([ax.max(), ay[ax==ax.max()].mean()]); Wr=np.array([ax.min(), ay[ax==ax.min()].mean()])
baseAng=math.atan2(Wr[1]-S[1],Wr[0]-S[0]); La=np.hypot(*(Wr-S)); s=R*1.05/La
# T-pose fingers, labeled top->bottom by knuckle y
tf=[]
for i in fingers_t:
    c=contour(lab==i); kn=c[np.argmin(np.hypot(c[:,0]-Wr[0],c[:,1]-Wr[1]))]; tf.append((kn[1],c))
tf.sort(key=lambda z:z[0]); LABELS=['thumb','pointer','middle','ring','pinky']
spread={LABELS[i]:tf[i][1] for i in range(5)}
tip_t=np.mean([spread[l][np.argmax(np.hypot(spread[l][:,0]-Wr[0],spread[l][:,1]-Wr[1]))] for l in LABELS],axis=0)
up_t=tip_t-Wr; scale_t=np.hypot(*up_t)

# ---- thumbs-up fingers (registered to T-pose wrist frame) ----
hs=open('/home/serg/cpp/hangman/rig/generated/hand-thumbs-up.svg').read()
hvb=[float(x) for x in re.search(r'viewBox="([^"]*)"',hs).group(1).split()]
def clean(t): return re.sub(r'\s(inkscape|sodipodi):[\w-]+="[^"]*"','',t)
def hlayer(name):
    m=re.search(r'<g\b[^>]*inkscape:label="'+name+r'"[^>]*>(.*?)</g>',hs,re.S); return clean(m.group(1)) if m else ''
HW=1000; HH=int(HW*hvb[3]/hvb[2])
def hmask(body):
    doc=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{hvb[0]} {hvb[1]} {hvb[2]} {hvb[3]}" width="{HW}">{body}</svg>'
    return np.array(Image.open(io.BytesIO(cairosvg.svg2png(bytestring=doc.encode(),output_width=HW,background_color='white'))).convert('L'))<128
def hcontour(name):
    m=hmask(hlayer(name)); c=contour(m)  # in HW px
    return np.stack([hvb[0]+c[:,0]/HW*hvb[2], hvb[1]+c[:,1]/HH*hvb[3]],1)   # hand-svg units
curlU={l:hcontour(l) for l in LABELS}
allU=np.concatenate(list(curlU.values()))
# thumbs-up wrist = base (lowest 25% centroid); up = handcentroid - wrist
lowy=np.percentile(allU[:,1],75); Wr_u=allU[allU[:,1]>=lowy].mean(0); hc=allU.mean(0)
tip_u=np.mean([curlU[l][np.argmax(np.hypot(curlU[l][:,0]-Wr_u[0],curlU[l][:,1]-Wr_u[1]))] for l in LABELS],axis=0)
up_u=tip_u-Wr_u; scale_u=np.hypot(*up_u)
rot=math.atan2(up_t[1],up_t[0])-math.atan2(up_u[1],up_u[0]); sc=scale_t/scale_u
cs_,sn=math.cos(rot),math.sin(rot)
def reg(P):  # thumbs-up hand units -> T-pose wrist frame
    q=(P-Wr_u)*sc; return np.stack([Wr[0]+q[:,0]*cs_-q[:,1]*sn, Wr[1]+q[:,0]*sn+q[:,1]*cs_],1)
curl={l:reg(curlU[l]) for l in LABELS}

def dpath(P): return '<path fill="#081C1A" d="M '+' L '.join(f'{x:.2f},{y:.2f}' for x,y in P)+' Z"/>'
def ink2vb(ix,iy): return (167.98+ix/648*493.94, 77.99+iy/562*425.95)
SHL=ink2vb(211,371)
def place(aim, fingerset):
    deg=math.degrees(aim-baseAng)
    inner=dpath(armC)+''.join(dpath(fingerset[l]) for l in LABELS)
    return f'<g transform="translate({SHL[0]} {SHL[1]}) rotate({deg}) scale({s}) translate({-S[0]} {-S[1]})">{inner}</g>'
sheet=Image.new('RGB',(W*2,H),(255,255,255))
for i,(lb,fs) in enumerate([('closed=0 (spread)',spread),('closed=1 (curled/thumbsup)',curl)]):
    im2=Image.fromarray(rCol(char+place(math.radians(120),fs))); ImageDraw.Draw(im2).text((6,6),lb,fill=(200,0,0)); sheet.paste(im2,(i*W,0))
sheet.save('/home/serg/cpp/hangman/rig/traces/hand_endpoints.png')
print('T-pose fingers labeled by y:',[round(z[0]) for z in tf]); print('registered scale',round(sc,3),'rot',round(math.degrees(rot),1))
