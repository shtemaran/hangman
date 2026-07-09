#!/usr/bin/env python3
"""Ask a real browser (headless chromium) where SVG elements actually render — every transform,
nesting and baked matrix is handled for you, no manual math. Prints each element's bounding box
in the SVG's own viewBox coordinates (same space Inkscape shows), plus centre.

  python tools/svg_query.py generated/king_align.svg crown-occluder king-crown king-mouth
  python tools/svg_query.py file.svg '*'        # list every id/label with a box

Match by element id OR inkscape:label. Uses getBBox() (local) x getCTM() (-> viewport = viewBox).
"""
import sys, subprocess, tempfile, os, json, re, html
SVG=sys.argv[1]; TARGETS=sys.argv[2:] or ['*']
svg=open(SVG).read()
JS=r'''
function bbroot(el){ var b=el.getBBox(), m=el.getCTM(); if(!m) return null;
  var c=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(function(p){return [m.a*p[0]+m.c*p[1]+m.e, m.b*p[0]+m.d*p[1]+m.f];});
  var xs=c.map(function(p){return p[0];}), ys=c.map(function(p){return p[1];});
  return {x0:Math.min.apply(0,xs),y0:Math.min.apply(0,ys),x1:Math.max.apply(0,xs),y1:Math.max.apply(0,ys)}; }
function key(el){ return el.getAttribute('inkscape:label') || el.id || null; }
var want=TARGETS_JSON, all=document.querySelectorAll('svg *'), out={};
if(want.length===1 && want[0]==='*'){
  for(var i=0;i<all.length;i++){ var k=key(all[i]); if(!k||out[k]) continue; try{var bb=bbroot(all[i]); if(bb) out[k]=bb;}catch(e){} }
} else {
  want.forEach(function(t){
    var el=document.getElementById(t);
    if(!el){ for(var i=0;i<all.length;i++){ if(all[i].getAttribute('inkscape:label')===t){el=all[i];break;} } }
    if(el){ try{ out[t]=bbroot(el)||'NO_CTM'; }catch(e){ out[t]='ERR:'+e; } } else out[t]='NOT_FOUND';
  });
}
var vb=(document.querySelector('svg').getAttribute('viewBox')||'0 0 0 0').split(/[ ,]+/).map(Number);
document.getElementById('__q').textContent=JSON.stringify({vb:[vb[0],vb[1]], boxes:out});
'''.replace('TARGETS_JSON', json.dumps(TARGETS))
page='<!doctype html><meta charset="utf-8"><body>'+svg+'<pre id="__q"></pre><script>'+JS+'</script></body>'
with tempfile.NamedTemporaryFile('w',suffix='.html',delete=False) as f:
    f.write(page); path=f.name
try:
    r=subprocess.run(['chromium','--headless=new','--no-sandbox','--disable-gpu','--virtual-time-budget=3000',
                      '--run-all-compositor-stages-before-draw','--dump-dom','file://'+path],
                     capture_output=True, text=True, timeout=60)
    m=re.search(r'<pre id="__q">(.*?)</pre>', r.stdout, re.S)
    payload=json.loads(html.unescape(m.group(1))) if m else {'vb':[0,0],'boxes':{}}
    ox,oy=payload['vb']; res=payload['boxes']       # getCTM is viewBox-origin-relative -> add viewBox offset
    for k in (res if TARGETS==['*'] else TARGETS):
        v=res.get(k)
        if isinstance(v,dict):
            x0,x1,y0,y1=v["x0"]+ox,v["x1"]+ox,v["y0"]+oy,v["y1"]+oy
            print(f'{k:26s} x {x0:7.1f}..{x1:7.1f}  y {y0:7.1f}..{y1:7.1f}   c ({(x0+x1)/2:.1f}, {(y0+y1)/2:.1f})')
        else: print(f'{k:26s} {v}')
finally:
    os.unlink(path)
