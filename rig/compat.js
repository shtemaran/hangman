// Modifier/emotion compatibility query.
//
//   const compat = makeCompat(await fetch('compatibility.json').then(r=>r.json()));
//   compat.ok(['girl','police','thoughtful']);   // true  — nothing clashes
//   compat.ok(['king','sailor']);                 // false — two headwear
//   compat.conflicts(['clown','surprise']);       // [['clown','surprise']] — why it failed
//
// Tokens are modifier names (girl, king, …) plus emotion tokens:
//   'expression' (any happy/sad, i.e. rig.p.expr != 0), 'surprise', 'thoughtful', 'confused'.
// The list holds MINIMAL forbidden sets; a request is compatible iff no forbidden set is a subset of it.
function makeCompat(data){
  const INC = (data.incompatible||[]).map(c=>c.slice());
  const has = (combo,set)=>combo.every(t=>set.has(t));
  return {
    ok(active){ const s=new Set(active); return !INC.some(c=>has(c,s)); },
    conflicts(active){ const s=new Set(active); return INC.filter(c=>has(c,s)); },
    // given what's already active, which of `candidates` can still be added without a clash
    allowedToAdd(active, candidates){ const s=new Set(active);
      return candidates.filter(x=> !INC.some(c=>c.includes(x) && has(c,new Set([...s,x])))); },
  };
}
if(typeof module!=='undefined') module.exports={makeCompat};
