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
 function renderGenreRanges(referenceUnits,ranges,renderContent,renderPoetry=null){
  validateGenreRanges(ranges,referenceUnits.length);
  return ranges.map(({start,end,genre})=>{
   if(genre==='poetry'&&renderPoetry)return `<lg type="poem">${renderPoetry(start-1,end)}</lg>`;
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
 const sourceLineKey=ref=>ref?.line?JSON.stringify([ref.alto_file||'',ref.page||'',ref.line]):null;
 function altoPoetryLayout(referenceUnits,sourceUnits,startUnit=0,endUnit=referenceUnits.length){
  const source=new Map();
  for(const unit of sourceUnits)for(const ref of unit.refs||[])if(sourceLineKey(ref))source.set(sourceLineKey(ref),{text:unit.text,ref});
  const segments=[],byKey=new Map(),originalWords=[],sourceOwners=new Map();
  const add=(key,text,wordIndex,reviewUnit)=>{
   if(!byKey.has(key)){byKey.set(key,segments.length);segments.push({text:'',parts:[],reviewUnits:new Set(),sourceKey:key})}
   const segment=segments[byKey.get(key)];segment.parts.push({text,wordIndex});segment.reviewUnits.add(reviewUnit);
  };
  for(let ui=0;ui<referenceUnits.length;ui++){
   const unit=referenceUnits[ui],items=unit.items||[unit];
   for(const item of items){
    const refs=[...new Map((item.refs||[]).filter(r=>sourceLineKey(r)).map(r=>[sourceLineKey(r),r])).values()];
    for(const ref of refs){const key=sourceLineKey(ref);if(!sourceOwners.has(key))sourceOwners.set(key,new Set());sourceOwners.get(key).add(ui)}
    const tokens=words(item.text),base=originalWords.length;originalWords.push(...tokens);
    if(!tokens.length)continue;
    if(ui<startUnit||ui>=endUnit){tokens.forEach((token,i)=>add(`outside:${ui}`,token,base+i,ui));continue}
    if(refs.length<=1){
     if(!refs.length&&source.size)throw Error('poetrySourceMapping');
     const key=refs.length?sourceLineKey(refs[0]):`manual:${ui}`;
     tokens.forEach((token,i)=>add(key,token,base+i,ui));continue;
    }
    // A logical token can cross two physical ALTO lines (e.g. "splen-" /
    // "dente"). Locate its characters in the original source lines, then
    // project each piece back without inventing a new line boundary.
    const spans=[];let joined='';
    for(const ref of refs){
     const text=source.get(sourceLineKey(ref))?.text;
     if(text===undefined)throw Error('poetrySourceMapping');
     const compact=text.replace(/\s+/g,'');spans.push({key:sourceLineKey(ref),start:joined.length,end:joined.length+compact.length});joined+=compact;
    }
    const needle=tokens.join(''),at=joined.indexOf(needle);
    if(at<0||joined.indexOf(needle,at+1)>=0)throw Error('poetrySourceMapping');
    let cursor=at;
    for(let ti=0;ti<tokens.length;ti++){
     const token=tokens[ti],end=cursor+token.length;
     for(const span of spans){const a=Math.max(cursor,span.start),b=Math.min(end,span.end);if(a<b)add(span.key,token.slice(a-cursor,b-cursor),base+ti,ui)}
     cursor=end;
    }
   }
  }
  const wordMap=Array.from({length:originalWords.length},()=>[]);let offset=0;
  for(const segment of segments){
   segment.text=segment.parts.map(p=>p.text).join(' ');
   for(const part of segment.parts)wordMap[part.wordIndex].push(offset++);
  }
  return {units:segments,wordMap,sourceOwners,reviewOffsets:unitWordOffsets(referenceUnits)};
 }
 function renderALTOPoetry(referenceUnits,sourceUnits,edits,ids,idMap,startUnit,endUnit){
  const layout=altoPoetryLayout(referenceUnits,sourceUnits,startUnit,endUnit),selected=[];
  layout.units.forEach((line,i)=>{
   const owners=[...line.reviewUnits];
   if(owners.some(owner=>owner>=startUnit&&owner<endUnit)){
    if([...(layout.sourceOwners.get(line.sourceKey)||line.reviewUnits)].some(owner=>owner<startUnit||owner>=endUnit))throw Error('poetryLineBoundary');
    selected.push(i);
   }
  });
  if(!selected.length)throw Error('poetrySourceMapping');
  const offsets=unitWordOffsets(layout.units);
  const projected=edits.flatMap(e=>{
   if(e.a0===e.a1){
    let owner=e.referenceUnit;
    if(owner===undefined){owner=referenceUnits.findIndex((_,i)=>layout.reviewOffsets[i]<=e.a0&&layout.reviewOffsets[i+1]>e.a0);if(owner<0)owner=referenceUnits.length-1}
    if(owner<startUnit||owner>=endUnit)return[];
    let position=layout.wordMap[e.a0]?.[0]??offsets.at(-1);
    const ownerLines=selected.filter(i=>layout.units[i].reviewUnits.has(owner));
    let line=ownerLines.find(i=>offsets[i]<=position&&offsets[i+1]>position)??ownerLines.find(i=>offsets[i]<=position&&offsets[i+1]>=position)??selected.find(i=>offsets[i]<=position&&offsets[i+1]>position);
    if(line===undefined){line=position<=offsets[selected[0]]?selected[0]:selected.at(-1);position=Math.max(offsets[line],Math.min(position,offsets[line+1]))}
    return[{...e,a0:position,a1:position,referenceUnit:line}];
   }
   const positions=layout.wordMap.slice(e.a0,e.a1).flat();
   if(!positions.length)throw Error('poetrySourceMapping');
   const sorted=[...positions].sort((a,b)=>a-b);
   if(sorted.some((p,i)=>i&&p!==sorted[i-1]+1))throw Error('poetrySourceMapping');
   return[{...e,a0:sorted[0],a1:sorted.at(-1)+1}];
  });
  return selected.map(i=>`<l>${renderApparatus(layout.units,projected,ids,idMap,i,i+1)}</l>`).join('\n');
 }

 return {altoPoetryLayout,renderALTOPoetry,witnessIdentifiers,validateGenreRanges,renderGenreRanges,unitWordOffsets,renderApparatus};
});
