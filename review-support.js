/* Pure review-state updates shared by the interface and regression tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VariansReview=api})(globalThis,()=>{
 function signature(rows){return JSON.stringify(rows.map(g=>[g.aItems,g.bItems]))}
 function applySemanticInterval(groups,decisions,start,end,proposed,ranges=[],canonical=false){
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>groups.length||!Array.isArray(proposed)||!proposed.length||proposed.some(g=>!Array.isArray(g.aItems)||!Array.isArray(g.bItems)))throw Error('semanticInvalidInterval');
  if(signature(groups.slice(start,end))===signature(proposed))return{groups,decisions,ranges,changed:false};
  const delta=proposed.length-(end-start);
  let nextRanges=ranges.map(r=>({...r}));
  if(canonical&&ranges.length){
   const container=ranges.find(r=>r.start<=start+1&&r.end>=end);
   if(!container)throw Error('semanticGenreBoundary');
   nextRanges=ranges.map(r=>r===container?{...r,end:r.end+delta}:r.start>end?{...r,start:r.start+delta,end:r.end+delta}:{...r});
  }
  const nextDecisions={};
  for(const [key,value] of Object.entries(decisions)){const i=Number(key);if(i<start)nextDecisions[i]=value;else if(i>=end)nextDecisions[i+delta]=value}
  const nextGroups=[...groups.slice(0,start),...proposed,...groups.slice(end)].map((g,id)=>({...g,id}));
  return{groups:nextGroups,decisions:nextDecisions,ranges:nextRanges,changed:true};
 }
 return{signature,applySemanticInterval};
});
