/* Shared export rules, usable by the browser and Node's built-in test runner. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VariansExport=api;
})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const escapeXML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const words=text=>String(text||'').split(/\s+/).filter(Boolean);
 const genres=['prose','poetry','drama'];
 function witnessIdentifiers(ids,names){
  const used=new Set();
  return Object.fromEntries(ids.map(id=>{
   let base=String(names[id]||id).trim().normalize('NFC').replace(/[^\p{L}\p{N}\p{M}_.\-\u00b7]/gu,'_');
   if(!/^[\p{L}_]/u.test(base))base='witness_'+base;
   if(['__proto__','constructor','prototype'].includes(base))base='witness_'+base;
   let result=base,suffix=2;
   while(used.has(result))result=`${base}_${suffix++}`;
   used.add(result);return[id,result];
  }));
 }
 function validateGenreRanges(ranges,total){
  if(!Number.isInteger(total)||total<1||!Array.isArray(ranges)||!ranges.length)throw Error('rangeCoverage');
  let next=1;
  for(const r of ranges){
   if(!r||!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start!==next||r.end<r.start||r.end>total||!genres.includes(r.genre))throw Error('rangeCoverage');
   next=r.end+1;
  }
  if(next!==total+1)throw Error('rangeCoverage');
  return ranges;
 }
 function renderGenreRanges(referenceUnits,ranges,renderContent){
  validateGenreRanges(ranges,referenceUnits.length);
  return ranges.map(({start,end,genre})=>{
   if(genre==='poetry')return `<lg type="poem">${Array.from({length:end-start+1},(_,i)=>`<l>${renderContent(start+i-1,start+i)}</l>`).join('\n')}</lg>`;
   const content=`<p>${renderContent(start-1,end)}</p>`;
   return genre==='drama'?`<sp>${content}</sp>`:content;
  }).join('\n');
 }
 function unitWordOffsets(referenceUnits){
  const offsets=[0];for(const unit of referenceUnits)offsets.push(offsets.at(-1)+words(unit.text).length);return offsets;
 }
 function renderApparatus(referenceUnits,edits,ids,idMap,startUnit=0,endUnit=referenceUnits.length){
  const offsets=unitWordOffsets(referenceUnits),start=offsets[startUnit],end=offsets[endUnit];
  const allWords=referenceUnits.flatMap(u=>words(u.text)),slice=allWords.slice(start,end);
  const selected=edits.filter(e=>{
   if(e.a0===e.a1){
    // An addition belongs to one reference unit, including a unit with no
    // reference text. Never duplicate it at a prose/verse boundary.
    let owner=e.referenceUnit;
    if(owner===undefined){owner=referenceUnits.findIndex((_,i)=>offsets[i]<=e.a0&&offsets[i+1]>e.a0);if(owner<0)owner=referenceUnits.length-1}
    return owner>=startUnit&&owner<endUnit;
   }
   if(e.a0>=end||e.a1<=start)return false;
   // Dropping a variant crossing a verse/genre boundary would lose evidence.
   if(e.a0<start||e.a1>end)throw Error('variantCrossesBoundary');
   return true;
  }).map(e=>({...e,a0:e.a0-start,a1:e.a1-start})).sort((a,b)=>a.a0-b.a0||a.a1-b.a1);
  const regions=[];
  for(const e of selected){const last=regions.at(-1);if(last&&e.a0<=last.a1){last.a1=Math.max(last.a1,e.a1);last.edits.push(e)}else regions.push({a0:e.a0,a1:e.a1,edits:[e]})}
  if(!regions.length)return escapeXML(slice.join(' '));
  const out=[];let cursor=0;
  for(const region of regions){
   out.push(slice.slice(cursor,region.a0).map(escapeXML).join(' '));
   const lemma=slice.slice(region.a0,region.a1).join(' '),readings=new Map();
   const add=(reading,id)=>{const key=reading.trim().replace(/\s+/g,' ');if(!readings.has(key))readings.set(key,[]);readings.get(key).push(`#${idMap[id]}`)};
   add(lemma,'A');
   for(const id of ids){
    const changes=region.edits.filter(e=>e.id===id).sort((a,b)=>a.a0-b.a0||a.a1-b.a1);
    if(!changes.length){add(lemma,id);continue}
    let pos=region.a0;const reading=[];
    for(const change of changes){if(change.a0<pos)continue;reading.push(...slice.slice(pos,change.a0),...change.tokens);pos=change.a1}
    reading.push(...slice.slice(pos,region.a1));add(reading.join(' '),id);
   }
   const lemWits=readings.get(lemma.trim().replace(/\s+/g,' '))||[];
   const rdgs=[...readings].filter(([reading])=>reading!==lemma.trim().replace(/\s+/g,' ')).map(([reading,wits])=>`<rdg wit="${wits.join(' ')}">${escapeXML(reading)}</rdg>`);
   out.push(`<app type="collation"><lem wit="${lemWits.join(' ')}">${escapeXML(lemma)}</lem>${rdgs.join('')}</app>`);cursor=region.a1;
  }
  out.push(slice.slice(cursor).map(escapeXML).join(' '));return out.filter(Boolean).join(' ');
 }
 return {witnessIdentifiers,validateGenreRanges,renderGenreRanges,unitWordOffsets,renderApparatus};
});
