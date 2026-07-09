// Spline-bone deformation engine (Marduk rig). Single source of truth for the
// runtime; rig/tools/bones.py is the Python mirror. See rig/BONES.md.
//
// A "bone" deforms a 2D shape along a skeleton:
//   bone = { polys, rest, bent, xmn, xmx, ymid }
//     polys  : array of point-arrays [[x,y],...] — the shape, in the bone's local frame
//     rest   : straight skeleton polyline (the shape at parameter 0)
//     bent   : curled skeleton polyline, SAME point count (the shape at parameter 1)
//     xmn,xmx: the shape's extent ALONG the bone (maps to arc-length on the skeleton)
//     ymid   : the shape's centre ACROSS the bone (Y offsets are measured from here)
// A caller places the whole bone in the scene with its own translate+rotate.
const Bones = (function(){
  const TAU = Math.PI*2;
  const norm = a => (((a+Math.PI)%TAU)+TAU)%TAU - Math.PI;      // wrap angle to (-pi, pi]

  // Arc-length lookup over a polyline. at(s) -> {p:[x,y], t:[ux,uy]} (point + unit tangent).
  function arclen(pts){
    const seg=[], cum=[0]; let L=0;
    for(let i=0;i<pts.length-1;i++){
      const dx=pts[i+1][0]-pts[i][0], dy=pts[i+1][1]-pts[i][1], l=Math.hypot(dx,dy);
      seg.push([dx,dy,l]); L+=l; cum.push(L);
    }
    return { L, at(s){ s=Math.max(0,Math.min(L,s)); let i=0; while(i<seg.length-1 && cum[i+1]<s) i++;
      const f=(s-cum[i])/Math.max(seg[i][2],1e-9);
      return { p:[pts[i][0]+seg[i][0]*f, pts[i][1]+seg[i][1]*f],
               t:[seg[i][0]/Math.max(seg[i][2],1e-9), seg[i][1]/Math.max(seg[i][2],1e-9)] };
    }};
  }

  // Interpolate the skeleton rest->bent at t by accumulating TURNING angles (relative),
  // so the chain rolls up progressively. Position-lerp would collapse through the straight
  // chord; absolute-angle lerp spikes when the skeleton hooks back on itself.
  function interpSkel(rest, bent, t){
    const aR=[],lR=[],aB=[],lB=[];
    for(let i=0;i<rest.length-1;i++){
      aR.push(Math.atan2(rest[i+1][1]-rest[i][1], rest[i+1][0]-rest[i][0]));
      lR.push(Math.hypot(rest[i+1][0]-rest[i][0], rest[i+1][1]-rest[i][1]));
      aB.push(Math.atan2(bent[i+1][1]-bent[i][1], bent[i+1][0]-bent[i][0]));
      lB.push(Math.hypot(bent[i+1][0]-bent[i][0], bent[i+1][1]-bent[i][1]));
    }
    let h = aR[0] + t*norm(aB[0]-aR[0]);                         // first-segment heading
    const V=[[ rest[0][0]+(bent[0][0]-rest[0][0])*t, rest[0][1]+(bent[0][1]-rest[0][1])*t ]];
    for(let i=0;i<aB.length;i++){
      if(i>0) h += t*norm(aB[i]-aB[i-1]);                        // a fraction of each joint's final turn
      const l=(1-t)*lR[i]+t*lB[i], p=V[V.length-1];
      V.push([ p[0]+l*Math.cos(h), p[1]+l*Math.sin(h) ]);
    }
    return V;
  }

  // Inkscape "Bend" deformation: each point's X (along) -> arc-length on the skeleton,
  // its Y (across, from ymid) -> perpendicular offset. Returns an SVG path 'd'.
  function bendAlong(polys, skel, xmn, xmx, ymid){
    const A=arclen(skel), Xr=xmx-xmn, out=[];
    for(const poly of polys){ let d='M ';
      for(let j=0;j<poly.length;j++){
        const x=poly[j][0], y=poly[j][1], r=A.at((x-xmn)/Xr*A.L);
        d += (j?'L ':'') + (r.p[0]+(y-ymid)*(-r.t[1])).toFixed(2)+','+(r.p[1]+(y-ymid)*(r.t[0])).toFixed(2)+' ';
      }
      out.push(d+'Z');
    }
    return out.join(' ');
  }

  // deform a bone at t (0..1) -> path 'd';  skelPath -> the live driving skeleton (overlay/debug).
  const deform   = (bone, t) => bendAlong(bone.polys, interpSkel(bone.rest, bone.bent, t), bone.xmn, bone.xmx, bone.ymid);
  const skelPath = (rest, bent, t) => 'M ' + interpSkel(rest,bent,t).map(p=>p[0].toFixed(2)+','+p[1].toFixed(2)).join(' L ');

  // Frame at the skeleton's TIP (last point) at t, in the bone's LOCAL frame:
  // { p:[x,y] tip position, ang: tangent angle of the last segment }. Used to
  // parent a child (e.g. the hand) to the bone's far end (e.g. the wrist).
  function tipFrame(bone, t){
    const V=interpSkel(bone.rest, bone.bent, t), n=V.length, a=V[n-1], b=V[n-2];
    return { p:[a[0],a[1]], ang:Math.atan2(a[1]-b[1], a[0]-b[0]) };
  }

  return { norm, arclen, interpSkel, bendAlong, deform, skelPath, tipFrame };
})();
if (typeof module!=='undefined') module.exports = Bones;
