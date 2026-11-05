const {test}=require('node:test');
const assert=require('node:assert/strict');
const {witnessIdentifiers,validateGenreRanges,renderGenreRanges,unitWordOffsets,renderApparatus}=require('../export-support.js');
const units=['Prima frase completa in prosa','Primo verso della poesia','Secondo verso della poesia','Ultima frase completa in prosa'].map(text=>({text}));
const ranges=[{start:1,end:1,genre:'prose'},{start:2,end:3,genre:'poetry'},{start:4,end:4,genre:'prose'}];
const idMap=witnessIdentifiers(['A','B'],{A:'BNCF II.IV.232',B:'Tordi.435'});

test('witness IDs preserve valid assigned names and normalize XML-incompatible characters',()=>{
 assert.deepEqual(idMap,{A:'BNCF_II.IV.232',B:'Tordi.435'});
 assert.deepEqual(witnessIdentifiers(['A','B','C'],{A:'232 Firenze',B:'Édition: Paris & Lyon',C:'稿本一'}),{A:'witness_232_Firenze',B:'Édition__Paris___Lyon',C:'稿本一'});
});
test('duplicate and normalization-colliding names produce unique deterministic IDs',()=>{
 assert.deepEqual(witnessIdentifiers(['A','B','C','D'],{A:'Tordi 435',B:'Tordi_435',C:'Tordi_435_2',D:'Tordi 435'}),{A:'Tordi_435',B:'Tordi_435_2',C:'Tordi_435_2_2',D:'Tordi_435_3'});
});
test('mixed structure preserves every word of multiword units and the order of verses',()=>{
 assert.deepEqual(unitWordOffsets(units),[0,5,9,13,18]);
 const xml=renderGenreRanges(units,ranges,(start,end)=>renderApparatus(units,[],['B'],idMap,start,end));
 assert.equal(xml,'<p>Prima frase completa in prosa</p>\n<lg type="poem"><l>Primo verso della poesia</l>\n<l>Secondo verso della poesia</l></lg>\n<p>Ultima frase completa in prosa</p>');
});
test('retained variants use the same name-based IDs as witness declarations within a verse',()=>{
 const edits=[{id:'B',a0:6,a1:7,tokens:['canto']}];
 const xml=renderGenreRanges(units,ranges,(start,end)=>renderApparatus(units,edits,['B'],idMap,start,end));
 assert.match(xml,/<l>Primo <app type="collation"><lem wit="#BNCF_II.IV.232">verso<\/lem><rdg wit="#Tordi.435">canto<\/rdg><\/app> della poesia<\/l>/);
 assert.ok(xml.endsWith('<p>Ultima frase completa in prosa</p>'));
});
test('gaps, overlaps, reversed, incomplete and out-of-bounds ranges are rejected',()=>{
 for(const invalid of [[],[{start:2,end:4,genre:'prose'}],[{start:1,end:2,genre:'prose'},{start:2,end:4,genre:'poetry'}],[{start:1,end:1,genre:'prose'},{start:3,end:4,genre:'poetry'}],[{start:1,end:3,genre:'prose'}],[{start:1,end:5,genre:'prose'}],[{start:1,end:4,genre:'invalid'}],[{start:1,end:0,genre:'prose'}]])assert.throws(()=>validateGenreRanges(invalid,4),/rangeCoverage/);
 assert.equal(validateGenreRanges(ranges,4),ranges);
});
test('an insertion at a prose/poetry boundary is exported once',()=>{
 const edits=[{id:'B',a0:5,a1:5,tokens:['aggiunta']}];
 const xml=renderGenreRanges(units,ranges,(start,end)=>renderApparatus(units,edits,['B'],idMap,start,end));
 assert.equal((xml.match(/aggiunta/g)||[]).length,1);
 assert.match(xml,/<l><app type="collation"><lem wit="#BNCF_II.IV.232"><\/lem><rdg wit="#Tordi.435">aggiunta<\/rdg><\/app> Primo verso/);
});
test('insertion-only reference units keep their apparatus exactly once',()=>{
 const reference=[{text:'prima riga'},{text:''},{text:'ultima riga'}];
 const edits=[{id:'B',a0:2,a1:2,tokens:['verso aggiunto'],referenceUnit:1}];
 const xml=renderGenreRanges(reference,[{start:1,end:1,genre:'prose'},{start:2,end:3,genre:'poetry'}],(a,b)=>renderApparatus(reference,edits,['B'],idMap,a,b));
 assert.equal((xml.match(/verso aggiunto/g)||[]).length,1);
 assert.match(xml,/<lg type="poem"><l><app/);
});
test('variants crossing a verse boundary raise an error rather than silently disappearing',()=>{
 assert.throws(()=>renderGenreRanges(units,ranges,(a,b)=>renderApparatus(units,[{id:'B',a0:8,a1:10,tokens:['riscrittura']}],['B'],idMap,a,b)),/variantCrossesBoundary/);
});
test('uniform prose, poetry and drama retain the entire text',()=>{
 for(const genre of ['prose','poetry','drama']){
  const xml=renderGenreRanges(units,[{start:1,end:4,genre}],(a,b)=>renderApparatus(units,[],['B'],idMap,a,b));
  for(const unit of units)assert.ok(xml.includes(unit.text));
  assert.equal((xml.match(/<l>/g)||[]).length,genre==='poetry'?4:0);
 }
});
test('manuscript text is escaped in both lemma and variant readings',()=>{
 const xml=renderApparatus([{text:'a & b'}],[{id:'B',a0:1,a1:2,tokens:['<lettura>']}],['B'],idMap);
 assert.match(xml,/<lem wit="#BNCF_II.IV.232">&amp;<\/lem>/);
 assert.match(xml,/<rdg wit="#Tordi.435">&lt;lettura&gt;<\/rdg>/);
});
