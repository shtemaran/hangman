#!/usr/bin/env python3
"""Spline-bone deformation engine (Python mirror of rig/bones.js). See rig/BONES.md.

A bone deforms a 2D shape along a skeleton:
  bone = {polys, rest, bent, xmn, xmx, ymid}   (rest/bent same point count)
Runtime uses turning-angle interpolation so the chain rolls up progressively."""
import numpy as np, math

def arclen(pts):
    """Arc-length lookup over a polyline. at(s) -> (point, unit_tangent)."""
    seg=np.diff(pts,axis=0); sl=np.hypot(seg[:,0],seg[:,1]); cum=np.r_[0,np.cumsum(sl)]; L=cum[-1]
    def at(s):
        s=np.clip(s,0,L); i=min(int(np.searchsorted(cum,s))-1,len(seg)-1); i=max(i,0)
        f=(s-cum[i])/max(sl[i],1e-9)
        return pts[i]+seg[i]*f, seg[i]/max(sl[i],1e-9)
    return at,L

def interp_skel(rest, bent, t):
    """Interpolate skeleton rest->bent by accumulating TURNING angles (relative)."""
    def dl(P): s=np.diff(P,axis=0); return np.arctan2(s[:,1],s[:,0]), np.hypot(s[:,0],s[:,1])
    aR,lR=dl(rest); aB,lB=dl(bent)
    turn=np.zeros(len(aB))
    for i in range(1,len(aB)): turn[i]=(aB[i]-aB[i-1]+math.pi)%(2*math.pi)-math.pi
    h=aR[0]+t*((aB[0]-aR[0]+math.pi)%(2*math.pi)-math.pi)
    V=[(1-t)*rest[0]+t*bent[0]]
    for i in range(len(aB)):
        if i>0: h+=t*turn[i]
        l=(1-t)*lR[i]+t*lB[i]; V.append(V[-1]+l*np.array([math.cos(h),math.sin(h)]))
    return np.array(V)

def bend_along(polys, skel, xmn, xmx, ymid):
    """Inkscape Bend: X (along) -> arc-length on skel, Y (from ymid) -> perpendicular. -> path 'd'."""
    at,L=arclen(skel); Xr=xmx-xmn; parts=[]
    for poly in polys:
        bp=[]
        for x,y in poly:
            P,tn=at((x-xmn)/Xr*L); bp.append((P[0]+(y-ymid)*(-tn[1]), P[1]+(y-ymid)*tn[0]))
        parts.append('M '+' L '.join(f'{x:.2f},{y:.2f}' for x,y in bp)+' Z')
    return ' '.join(parts)

def deform(bone, t):
    """Deform a bone {polys,rest,bent,xmn,xmx,ymid} (numpy arrays) at t -> path 'd'."""
    return bend_along(bone['polys'], interp_skel(bone['rest'], bone['bent'], t),
                      bone['xmn'], bone['xmx'], bone['ymid'])

def tip_frame(bone, t):
    """Frame at the skeleton tip (last point) at t, in the bone's LOCAL frame ->
    (tip_point, tangent_angle). Used to parent a child to the bone's far end."""
    V=interp_skel(bone['rest'], bone['bent'], t)
    return V[-1], math.atan2(V[-1][1]-V[-2][1], V[-1][0]-V[-2][0])
