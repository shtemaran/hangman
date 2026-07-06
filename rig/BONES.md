# Spline-bone system

A small deformation engine that bends a 2D shape along a curving skeleton. It
drives the finger curl today and is meant to be reused for the arm. The runtime
lives in **`bones.js`** (the source of truth) with a byte-for-byte Python mirror
in **`tools/bones.py`** used by the build script. Data is baked into
`finger_bend.json` by `tools/build_finger_bend.py`.

## Why a bend, not a morph

The first attempt tweened between an open finger and a closed finger (outline
morph). At t=0.5 that gives a blend of two *different drawings*, not a
half-curled finger — it clumps and folds through itself. A finger curl is not
two shapes averaged; it is **one shape carried along a bending backbone**. So we
keep the shape fixed and only bend the backbone. This is exactly what Inkscape's
"Bend" Live Path Effect does, and we recreate its math (matched at IoU ≈ 0.99).

## A "bone"

```
bone = { polys, rest, bent, xmn, xmx, ymid }
```

- `polys` — the shape as arrays of `[x,y]` points, in the bone's **local frame**
  (the finger rotated horizontal, knuckle at the origin, pointing +x).
- `rest` — the **straight** skeleton polyline: the shape at curl = 0.
- `bent` — the **curled** skeleton polyline, *same point count* as `rest`: curl = 1.
- `xmn,xmx` — the shape's extent **along** the bone. A point's x in `[xmn,xmx]`
  maps to arc-length `0..L` on the skeleton.
- `ymid` — the shape's centreline **across** the bone. A point's `y - ymid`
  becomes a perpendicular offset from the skeleton.

The caller places the whole deformed bone in the scene with its own
`translate(K) rotate(deg)` (`K` = knuckle, `deg` = the finger's world angle).
Deformation happens in the tidy local frame; placement is a plain transform.

## The three steps (`deform(bone, t)`)

1. **`interpSkel(rest, bent, t)`** — build the live skeleton at curl `t`.
2. **`bendAlong(polys, skel, xmn, xmx, ymid)`** — carry every shape point onto
   that skeleton: x → point along the curve, `y-ymid` → offset perpendicular to
   the curve's tangent. Returns an SVG path `d`.
3. The caller wraps the `d` in the bone's placement transform.

`skelPath(rest, bent, t)` returns just the live skeleton polyline, for the
red debug overlay in `finger_demo.html`.

## Turning-angle interpolation (the crucial bit)

How do you get the skeleton *between* straight and curled? Two obvious ways both
fail:

- **Position-lerp** each skeleton vertex `rest→bent`: the curve collapses through
  its own straight chord on the way, so mid-curl the finger goes limp/flat.
- **Absolute-angle lerp** each segment's heading: when the curled skeleton hooks
  back on itself, one segment's absolute angle points "backwards"; lerping it
  swings that segment through vertical and you get a spurious spike/extra bend
  around t≈0.33.

The fix is to interpolate **turning angles** (each joint's angle *relative to the
previous segment*) and roll them up the chain:

```
h = aR[0] + t·norm(aB[0] − aR[0])          // first segment heading, rest→bent
for each subsequent segment i:
    h += t·norm(aB[i] − aB[i−1])           // add a fraction of that joint's final turn
    place the next vertex a lerped length away at heading h
```

`norm` wraps to (−π, π] so we always take the short way round. Because each turn
is added on top of the running heading, the chain curls up *progressively* from
the knuckle out — no collapse, no backward spikes. `rest` and `bent` must share a
point count so segments correspond 1:1.

## How the data is built (`tools/build_finger_bend.py`)

- Reads two artist SVGs from `generated/`: `hand-spread.svg` (open fingers + arm)
  and `hand-spread-closed.svg` (two fingers bent with Inkscape's Bend LPE).
- For each finger: PCA principal axis → knuckle `K` (end nearest the wrist marker)
  and world angle `th`; rotate the finger into its local frame; record `xmn/xmx/ymid`.
- `pointer` and `middle` carry the artist's real `bendpath` from the LPE → their
  `bent` skeleton. `thumb/ring/pinky` reuse `pointer`'s curl as a **unit template**
  scaled to each finger's length.
- `thumb` is in `FLIP` — its `bent` is mirrored across the rest axis so it curls
  the opposite way from the fingers.
- Emits `finger_bend.json`: `{ viewBox, arm, fingers: { <label>: bone + K + deg } }`
  and a validation sheet `traces/hand_bend_full.png` (curl at 0, .5, 1).

To regenerate: `python tools/build_finger_bend.py` (needs the scratchpad venv:
cairosvg, PIL, numpy, svgpathtools).

## Reusing this for the arm

The arm is the same idea one level up: a 2-bone chain (shoulder→elbow→wrist)
whose lower bone's tip is where the hand's knuckle frame is planted. The upper/
lower arm can each be a bone deformed along a short skeleton, or the chain can be
posed by FK/IK and the hand simply parented to the wrist. `interpSkel`'s
turning-angle roll-up is exactly what keeps a multi-joint arm from collapsing
through its chord mid-swing, so the engine carries over unchanged.
