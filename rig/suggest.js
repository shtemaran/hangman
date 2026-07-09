// Suggest a compatible character SET from theme tags.
//
//   const suggest = makeSuggest(await fetch('tags.json').then(r=>r.json()), compat /* from compat.js */);
//   suggest.pick(['time','late']);                 // [{mod:'clock', score:2, tags:['time','late']}]
//   suggest.pick(['royal','sea','fancy']);         // king + girl (sailor drops: clashes with king's hat)
//   suggest.pick(['royal','sea','fancy'], {seed:'level-7'});  // same tags, seeded tie-break -> may pick sailor over king
//
// Scoring = how many of a character's tags appear in the input (case-insensitive).
// pick() ranks by score, breaks TIES with a deterministic seed (so a given seed is
// reproducible but different seeds shuffle equal matches), then greedily keeps only
// characters that stay mutually COMPATIBLE (via compat.ok) — so the result is always valid.
function seededRand(seed){                       // deterministic 0..1 stream from a number/string seed
  let h = 2166136261 >>> 0;
  for(const ch of String(seed)){ h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ()=>{ h += 0x6D2B79F5; let t=h; t = Math.imul(t ^ (t>>>15), t|1); t ^= t + Math.imul(t ^ (t>>>7), t|61); return ((t ^ (t>>>14))>>>0)/4294967296; };
}
function makeSuggest(TAGS, compat){
  const MODS = Object.keys(TAGS);
  const norm = t => String(t).toLowerCase().trim();
  const hit = (mod, inSet) => (TAGS[mod]||[]).filter(t=>inSet.has(norm(t)));
  return {
    // ranked score for every character; ties broken by the seed (stable order if no seed)
    scores(input, seed){ const s=new Set(input.map(norm)), rnd = seed==null?null:seededRand(seed);
      return MODS.map(m=>{ const h=hit(m,s); return {mod:m, score:h.length, tags:h, _r: rnd?rnd():0}; })
                 .sort((a,b)=> b.score-a.score || b._r-a._r)
                 .map(({_r,...x})=>x); },
    // best compatible set (drops a match if it would clash with a higher-ranked pick)
    pick(input, {max=3, minScore=1, seed=null}={}){
      const ranked=this.scores(input, seed).filter(x=>x.score>=minScore);
      const chosen=[];
      for(const c of ranked){
        if(chosen.length>=max) break;
        if(!compat || compat.ok([...chosen.map(x=>x.mod), c.mod])) chosen.push(c);
      }
      return chosen; },
  };
}
if(typeof module!=='undefined') module.exports={makeSuggest, seededRand};
