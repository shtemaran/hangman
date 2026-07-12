#!/usr/bin/env python3
"""Auto-derive the modifier/emotion INCOMPATIBILITY list, then merge manual tweaks.

Model: a list of minimal forbidden token-sets. A requested set (modifiers +
emotions active at once) is COMPATIBLE iff no forbidden set is a subset of it.

Auto rules:
  1. two modifiers that claim the same EXCLUSIVE slot (head/eyes/brows/mouth/ears/neck) clash.
  2. a modifier that LOCKS a face part + an emotion that fully OWNS that part (grab==1) clash.
Then apply ADD (extra forbidden sets) and ALLOW (remove auto ones) by hand.

  python tools/build_compat.py   ->  writes compatibility.json, prints the list
"""
import json, itertools
MODS = json.load(open('/home/serg/cpp/hangman/rig/modifiers.json'))

HEADWEAR = {'king','sailor','police','clock','reaper'}  # claim the head slot (hat / head-shape; reaper's hood REPLACES the head)
# emotion tokens -> which face parts they need, and how strongly (grab weight; 1 = fully owns it)
GRAB = {
  'surprise':   {'mouth':1,   'eye':1,   'brow':0},
  'thoughtful': {'mouth':1,   'eye':0.5, 'brow':1},
  'confused':   {'mouth':1,   'eye':0.5, 'brow':1},
  'expression': {'mouth':1,   'eye':1,   'brow':0.5},  # happy/sad valence (eyes+mouth carry it; brows help)
}
EMOTIONS = list(GRAB)

# --- manual tweaks (iterate here) ---
ADD   = [      # the executioner hood covers the whole face -> nothing else on the head/face shows
  ['executioner','nerd'], ['executioner','girl'],
  # obese replaces the head shape -> clashes with anything that reshapes/wraps the ORIGINAL head sphere
  ['obese','priest'], ['obese','executioner'], ['obese','clock'],
  ['obese','reaper'],   # both replace the head shape
]
ALLOW = [      # drop these auto-forbidden combos:
  ['clown','nerd'], ['girl','nerd'],               # nerd's glasses just sit over whatever eyes are there
  ['king','expression'],                           # mouth is a mustache, but the eyes/brows still carry happy/sad
  ['clock','thoughtful'], ['clock','confused'],    # clock hides brows, but its eyes+mouth still morph the emotion
  # soldier hides its brows (helmet sits low) but is otherwise a plain hat — keep its compat identical to a
  # brow-less-agnostic hat: eyes+mouth still carry the emotions, and the clown owns the face under the helmet.
  ['soldier','thoughtful'], ['soldier','confused'], ['clown','soldier'],
  # hand overrides:
  ['clock','girl'], ['clock','sailor'], ['clock','police'], ['clock','soldier'],   # clock works with these accessories/headwear
  ['girl','sailor'],                               # earrings + sailor cap/ears
  ['girl','expression'], ['girl','surprise'],      # girl emotes fully (thoughtful/confused already allowed)
  ['king','confused'], ['king','surprise'],        # king emotes (thoughtful stays off)
  ['police','girl'], ['police','clown'], ['sailor','clown'],  # (already compatible — listed for intent)
]

def claims(mod):
    """slot -> state.  face parts: 'lock' (emotion-blocking) | 'fx'/'soft' (keeps shape) | 'add' | 'hide'."""
    d = MODS[mod]; c = {}
    ver = d.get('versions',{}) or {}; fac = d.get('facefx',{}) or {}; hide = d.get('hide',[]) or {}
    eyefx = d.get('eyefx'); adds = d.get('adds',{}) or {}
    gazes = {(v.get('gaze') if isinstance(v,dict) else v) for v in adds.values()}
    if 'eye-l' in ver or 'eye-r' in ver: c['eyes']='lock'
    elif 'eye-l' in fac or 'eye-r' in fac: c['eyes']='fx'
    elif eyefx: c['eyes']='soft'
    if 'brow-l' in ver or 'brow-r' in ver: c['brows']='lock'
    elif 'brow-l' in hide or 'brow-r' in hide: c['brows']='hide'
    if 'mouth' in ver: c['mouth']='lock'
    elif 'mouth' in fac: c['mouth']='fx'
    elif 'mouth' in gazes: c['mouth']='add'          # mustache / lipstick
    # headwear = reshapes the head, OR has a HEAD-occluding add: occHead / cover, or a white occluder on a
    # rigid (gaze 'none') add. (An 'ear' earring or 'body' necklace occluder is NOT headwear.)
    def hat(a):
        if not isinstance(a,dict): return False
        if a.get('occHead') or a.get('cover'): return True
        white = a.get('fill')=='#ffffff' or any(p.get('fill')=='#ffffff' for p in a.get('paths',[]))
        return white and (a.get('gaze','eye')=='none')
    if mod in HEADWEAR or d.get('headMorph') or any(hat(a) for a in adds.values()): c['head']=True
    if 'ear' in gazes: c['ears']=True
    if 'body' in gazes: c['neck']=True
    return c

CLAIM = {m: claims(m) for m in MODS}
LOCKS = {'lock','hide'}                                # states that block emotions on that part
PART  = {'eyes':'eye','brows':'brow','mouth':'mouth'}  # claim-slot -> grab part

forbidden = set()
# rule 1: two modifiers sharing an exclusive slot
for a,b in itertools.combinations(MODS,2):
    if set(CLAIM[a]) & set(CLAIM[b]):                  # any common slot
        forbidden.add(frozenset((a,b)))
# rule 2: locked face part vs an emotion that fully owns it
for m in MODS:
    for slot,part in PART.items():
        if CLAIM[m].get(slot) in LOCKS:
            for e in EMOTIONS:
                if GRAB[e].get(part,0) >= 1:
                    forbidden.add(frozenset((m,e)))

for combo in ADD:   forbidden.add(frozenset(combo))
for combo in ALLOW: forbidden.discard(frozenset(combo))

out = sorted([sorted(list(f)) for f in forbidden])
json.dump({'incompatible': out}, open('/home/serg/cpp/hangman/rig/compatibility.json','w'), indent=1)

# report
mm = [c for c in out if all(x in MODS for x in c)]
me = [c for c in out if any(x in EMOTIONS for x in c)]
print(f'slot claims:'); [print(f'  {m:8} {CLAIM[m]}') for m in MODS]
print(f'\nmodifier x modifier ({len(mm)}):'); [print('  ',c) for c in mm]
print(f'\nmodifier x emotion ({len(me)}):');  [print('  ',c) for c in me]
print(f'\ntotal forbidden sets: {len(out)}  -> compatibility.json')
