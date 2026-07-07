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

## The arm (same engine, one joint)

The arm reuses this unchanged — see `tools/build_arm_bend.py`, `arm_bend.json`,
`arm_demo.html`. The arm brush stroke is one bone whose skeleton runs
shoulder→elbow→wrist, **anchored at the shoulder** (the frame's origin `K` sits
at the shoulder tip, farthest from the wrist marker — the opposite of the
finger's knuckle rule). `rest` is the straight T-pose; `bent` rotates the forearm
about the elbow, with the corner **rounded** by ramping the heading across a
short span (`W`) via smoothstep so the arm's thickness doesn't pinch at the kink.

`deform(bone, t)` with `t < 0` would mirror the bend across the arm axis (since
`rest` is straight and `bent`'s lengths match), but once the hand is parented that
direction bends the elbow the wrong way anatomically — so the elbow is clamped to
**negative only** (`t ∈ [−1, 0]`). `PHI` (max angle) and `W` (rounding span) are
the two knobs at the top of the builder; flip `PHI`'s sign to swap which way the
single valid bend goes.

## Parenting the hand to the arm

`hand_arm_demo.html` hangs the whole hand off the arm's wrist end. The hand was
authored in the same coordinate space as the arm (wrist marker at 105.5,69.5), so
we don't re-place each finger — we wrap all five finger groups in one `<g>` and
give it the **delta** transform that carries the arm's *rest* wrist-frame to its
*bent* wrist-frame:

```
Bones.tipFrame(arm, t) -> { p, ang }          // tip position + tangent, LOCAL to the arm bone
worldTip(t): apply the arm's translate(K)·rotate(deg) to that frame -> { O, a } in world
hand transform = translate(O_t) · rotate(a_t − a_0) · translate(−O_0)
```

At `t=0` the delta is the identity, so the hand sits exactly where it was drawn;
as the elbow moves, the hand rides the forearm end (position **and** orientation)
as a rigid child. Finger curl still runs independently on each finger bone on top
of that. `tipFrame` is the general hook for parenting any child to a bone's far
end (mirrored in `tools/bones.py` as `tip_frame`).

## The shoulder (pure pivot, no deformation)

The whole arm floats, so the shoulder needs no bone at all — the arm bone is
already anchored at the shoulder point (`arm.K`). The shoulder joint is just an
outer group wrapping *both* the arm and the parented hand, rotated about that
point:

```
<g transform="rotate(shoulderDeg, arm.K.x, arm.K.y)"> arm + hand </g>
```

Because the pivot is the arm's own anchor, the entire chain (arm, elbow bend, and
hand) swings rigidly as one, and elbow + finger curl still compose underneath.
Unlike the elbow, the shoulder is **bidirectional** (`−1..+1`, scaled by `SH_MAX`
degrees). The demo frames a square centred on the shoulder sized to the arm's
reach, since the arm sweeps a circle about the pivot.

So the joint hierarchy is: **shoulder pivot → arm bone (elbow) → wrist frame →
five finger bones (curl)** — one deforming bone per real joint, plain transforms
for the rigid parenting between them.
