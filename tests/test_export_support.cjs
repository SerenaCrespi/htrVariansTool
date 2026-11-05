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

const {renderALTOPoetry}=require('../export-support.js');
const sourceItem=(text,line,page='p',file='page.xml')=>({text,refs:[{line,page,alto_file:file,line_text:text}]});
const reviewUnit=items=>({text:items.map(i=>i.text).join(' '),items,refs:items.flatMap(i=>i.refs)});
function altoBody(reference,source,edits=[],genre='poetry'){
 return renderGenreRanges(reference,[{start:1,end:reference.length,genre}],(a,b)=>renderApparatus(reference,edits,['B'],idMap,a,b),(a,b)=>renderALTOPoetry(reference,source,edits,['B'],idMap,a,b));
}
test('one prose interval joins multiple review units in a single paragraph',()=>{
 const source=[sourceItem('prima riga','l1'),sourceItem('seconda riga','l2')];
 assert.equal(altoBody(source.map(i=>reviewUnit([i])),source,[],'prose'),'<p>prima riga seconda riga</p>');
});
test('poetry preserves two ALTO lines grouped into a single review unit',()=>{
 const source=[sourceItem('primo verso','l1'),sourceItem('secondo verso','l2')];
 assert.equal(altoBody([reviewUnit(source)],source),'<lg type="poem"><l>primo verso</l>\n<l>secondo verso</l></lg>');
});
test('fragments of one ALTO line spread over multiple review units export as one verse',()=>{
 const source=[sourceItem('prima parte seconda parte','l1')];
 const reference=[reviewUnit([{...source[0],text:'prima parte'}]),reviewUnit([{...source[0],text:'seconda parte'}])];
 assert.equal(altoBody(reference,source),'<lg type="poem"><l>prima parte seconda parte</l></lg>');
 assert.throws(()=>renderALTOPoetry(reference,source,[],['B'],idMap,1,2),/poetryLineBoundary/);
});
test('identical ALTO line IDs on different pages remain separate verses',()=>{
 const source=[sourceItem('pagina prima','same','p1'),sourceItem('pagina seconda','same','p2')];
 assert.equal(altoBody([reviewUnit(source)],source),'<lg type="poem"><l>pagina prima</l>\n<l>pagina seconda</l></lg>');
});
test('continued tokens recover their physical ALTO line break and keep subsequent apparatus',()=>{
 const source=[sourceItem('Il verso splen-','l1'),sourceItem('dente risuona','l2')];
 const reference=[reviewUnit([{...source[0],text:'Il verso'},{text:'splen-dente',refs:[...source[0].refs,...source[1].refs]},{...source[1],text:'risuona'}])];
 assert.equal(altoBody(reference,source),'<lg type="poem"><l>Il verso splen-</l>\n<l>dente risuona</l></lg>');
 const xml=altoBody(reference,source,[{id:'B',a0:3,a1:4,tokens:['canta']}]);
 assert.match(xml,/<l>dente <app type="collation"><lem wit="#BNCF_II.IV.232">risuona<\/lem><rdg wit="#Tordi.435">canta<\/rdg><\/app><\/l>/);
 assert.throws(()=>altoBody(reference,source,[{id:'B',a0:2,a1:3,tokens:['chiaro']}]),/variantCrossesBoundary/);
});
test('an insertion-only review row adds apparatus without inventing another ALTO verse',()=>{
 const source=[sourceItem('primo verso','l1'),sourceItem('secondo verso','l2')];
 const reference=[reviewUnit([source[0]]),reviewUnit([]),reviewUnit([source[1]])];
 const xml=altoBody(reference,source,[{id:'B',a0:2,a1:2,tokens:['aggiunta'],referenceUnit:1}]);
 assert.equal((xml.match(/<l>/g)||[]).length,2);assert.equal((xml.match(/aggiunta/g)||[]).length,1);
});
test('ambiguous multiline reference corrections do not invent verse boundaries',()=>{
 const source=[sourceItem('primo verso','l1'),sourceItem('secondo verso','l2')];
 const reference=[reviewUnit([{text:'testo completamente riscritto',refs:source.flatMap(i=>i.refs)}])];
 assert.throws(()=>altoBody(reference,source),/poetrySourceMapping/);
 assert.equal(altoBody(reference,source,[],'prose'),'<p>testo completamente riscritto</p>');
});
test('multiline prose corrections outside a poetry interval do not affect ALTO verse mapping',()=>{
 const source=[sourceItem('prosa prima','l1'),sourceItem('prosa seconda','l2'),sourceItem('verso finale','l3')];
 const reference=[reviewUnit([{text:'prosa corretta liberamente',refs:source.slice(0,2).flatMap(i=>i.refs)}]),reviewUnit([source[2]])];
 assert.equal(renderALTOPoetry(reference,source,[],['B'],idMap,1,2),'<l>verso finale</l>');
});
