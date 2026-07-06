# Marduk rig workspace

Scratch area for building an animation rig around `assets/marduk_semantic.svg`.
Current focus: a **generate → trace → register** pipeline for adding new
expression/pose states (eyes closed, wand poses, …) as morph targets.

## Workflow

1. **Export base + mask** from the semantic layers:
   ```
   tools/export_mask.py --state win --slots eyes-l eyes-r --name eyes_closed
   ```
   → `out/<name>_base.png`, `out/<name>_mask.png`, `out/<name>_overlay.png`.
   Mask convention: **white = region to inpaint, black = keep unchanged.**
   Because only the masked region changes, whatever the model draws lands
   already registered to the rig's coordinate space.

2. **Generate** (external, any inpainting tool). Feed `_base.png` + `_mask.png`.
   Keep the same black brush-ink / two-tone style. Save results into `generated/`.

3. **Trace + register** (pipeline TBD): threshold → potrace → align to the
   semantic frame → extract the changed region as a new blend target / slot.

## Hand / finger rig — spline bones
A separate track: bending fingers (and, next, the arm) along a curving skeleton.
See **[BONES.md](BONES.md)** for the concept and math.
- `bones.js` — deformation engine (source of truth); `tools/bones.py` — Python mirror
- `tools/build_finger_bend.py` — bakes `finger_bend.json` from the `generated/` hand SVGs
- `finger_demo.html` — interactive 5-finger curl demo (per-finger + "all" sliders)

## Layout
- `tools/`     scripts (export_mask.py, bones.py, build_finger_bend.py, tracer — TBD)
- `out/`       exported base+mask pairs
- `generated/` AI outputs dropped here for tracing
- `traces/`    vectorized results

## Deps
`cairosvg pillow numpy scipy` (+ `potrace` for tracing, TBD).
