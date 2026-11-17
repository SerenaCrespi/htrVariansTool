// Exercise the real controller with an in-memory DOM and controlled response ordering.
// These cases cover source/export regressions without requiring a downloaded model.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const VariansExport=require('../export-support.js');
function setup(){
 const elements=new Map(),pending=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',dataset:{},innerHTML:'',textContent:'',disabled:false,hidden:false,addEventListener(){},removeAttribute(){},insertAdjacentHTML(){}});return elements.get(id)};
 const context=vm.createContext({window:{},document:{getElementById:element,querySelectorAll:()=>[],documentElement:{}},console,URL,Blob,setTimeout,clearTimeout,VariansExport,confirm:()=>true,alert:message=>{throw Error(message)},fetch:async(url,opts)=>new Promise(resolve=>pending.push({body:JSON.parse(opts.body),resolve}))});
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../frontend.js'),'utf8'),context);
 const run=s=>vm.runInContext(s,context);
 run(`const unit=text=>({text,refs:[]});const pair=(a,b)=>({A:[unit(a)],B:[unit(b)],alignments:[{id:0,a0:0,a1:1,b0:0,b1:1,similarity:.5,aItems:[unit(a)],bItems:[unit(b)]}],possible_transpositions:[],frequent_ambiguous_cases:[],alignment_method:'word-level'});witnessIds=['A','B'];names={A:'Reference',B:'B',C:'C'};rawByWitness={A:[{name:'a.xml',text:'A'}],B:[]};rawA=rawByWitness.A;`);
 return {run,pending,context};
}
function reading(xml,id){
 // These fixtures contain one apparatus: reconstruct the exported reading.
 const body=xml.match(/<body><p>(.*?)<\/p><\/body>/s)[1];
 return body.replace(/<app[^>]*>(.*?)<\/app>/gs,(_,app)=>{
  const readings=[...app.matchAll(/<(?:lem|rdg) wit="([^"]*)">(.*?)<\/(?:lem|rdg)>/gs)];
  return readings.find(r=>r[1].split(' ').includes('#'+id))?.[2]||'';
 }).replace(/\s+/g,' ').trim();
}
test('TEI preserves the position of retained internal, leading and trailing additions',()=>{
 for(const text of ['x alfa beta','alfa x beta','alfa beta x']){
  const {run}=setup();run(`pairResults={B:pair('alfa beta',${JSON.stringify(text)})};pairReviews={B:{decisions:{0:{0:'keep'}},movementDecisions:{}}};activatePair('B',false)`);
  assert.equal(reading(run('buildTEI()'),'B'),text);
 }
});
test('TEI rebases other witnesses after editing the first reference reading',async()=>{
 const {run}=setup();run(`witnessIds.push('C');pairResults={B:pair('uno due tre','uno due tre'),C:pair('uno due tre','uno due QUATTRO')};pairReviews={B:{decisions:{},movementDecisions:{}},C:{decisions:{0:{0:'keep'}},movementDecisions:{}}};activatePair('B',false);$('editA').value='uno extra due tre';$('editB').value='uno due tre'`);
 await run('saveEdit(0)');
 assert.equal(reading(run('buildTEI()'),'C'),'uno extra due QUATTRO');
});
test('TEI rejects a retained variant whose reference target was deleted',()=>{
 const {run}=setup();run(`pairResults={B:pair('uno','uno'),C:pair('uno due','uno quattro')};pairReviews={B:{decisions:{},movementDecisions:{}},C:{decisions:{0:{0:'keep'}},movementDecisions:{}}};activatePair('B',false)`);
 assert.throws(()=>run('buildTEI()'),/reference/i);
});
test('latest import wins when earlier alignment completes last',async()=>{
 const {run,pending}=setup(),tick=()=>new Promise(r=>setImmediate(r));
 const first=run(`loadFile('B',[{name:'old.xml',text:async()=>'OLD'}])`);await tick();
 const second=run(`loadFile('B',[{name:'new.xml',text:async()=>'NEW'}])`);await tick();
 const response=text=>({ok:true,json:async()=>({witnesses:{A:[{text:'A',refs:[]}],B:[{text,refs:[]}]},alignments:[{aItems:[{text:'A',refs:[]}],bItems:[{text,refs:[]}],similarity:0}],alignment_method:'word-level'})});
 pending[1].resolve(response('NEW'));await second;pending[0].resolve(response('OLD'));await first;
 assert.equal(run('rawByWitness.B[0].text'),'NEW');assert.equal(run('pairResults.B.B[0].text'),'NEW');
});
test('clearing A images preserves manually assigned images for B',async()=>{
 const {run}=setup();run(`images.A=[];imageOverrides={'A:page.xml':{name:'a.jpg'},'B:page.xml':{name:'b.jpg'}}`);
 await run(`loadImages('A',[])`);
 assert.equal(run(`imageOverrides['B:page.xml'].name`),'b.jpg');assert.equal(run(`Object.hasOwn(imageOverrides,'A:page.xml')`),false);
});
test('manual similarity matches backend lexical scores on representative readings',()=>{
 const {run}=setup();
 for(const [a,b,expected] of [['abcdef','ghijkl',0],['città','CITTA',1],['alpha beta','alpha',.5],['','',1],['alpha','',0]])assert.ok(Math.abs(run(`similarityClient(${JSON.stringify(a)},${JSON.stringify(b)})`)-expected)<1e-10);
});
test('JSON decisions include reviewed movement candidates',()=>{
 const {run}=setup();run(`pairResults={B:pair('a','b')};pairReviews={B:{decisions:{},movementDecisions:{0:'confirm'}}};pairResults.B.possible_transpositions=[{text_a:'a',text_b:'b'}];activatePair('B',false)`);
 const data=JSON.parse(run('JSON.stringify(buildJSONExport())'));
 assert.equal(data.comparisons.B.movementDecisions[0],'confirm');assert.equal(data.comparisons.B.possibleTranspositions[0].text_a,'a');
});

function decisionReport(){
 return {reference:{id:'Reference',name:'Reference'},witnesses:{Witness:'Witness'},
  structure:{comparisonWitness:'Witness',ranges:[{start:1,end:1,genre:'prose'}]},comparisons:{Witness:{
   alignmentMethod:'word-level Levenshtein',alignments:[{unit:1,readingReference:'alfa beta',readingWitness:'alfa gamma',
    sourceReference:'a.xml · p · l1',sourceWitness:'b.xml · p · l2',decisions:{0:'keep'},similarity:.5,
    alignmentSource:'lexical',requiresReview:false}]}}};
}
test('a decisions report reopens with its exact readings, source labels, decisions and genre ranges',()=>{
 const {run,context}=setup();context.input=decisionReport();
 run('const recovered=projectFromDecisionReport(input);validateProject(recovered);restoreProject(recovered.state)');
 const output=JSON.parse(run('JSON.stringify(buildJSONExport())'));
 assert.deepEqual(output.comparisons.Witness.alignments,context.input.comparisons.Witness.alignments);
 assert.deepEqual(output.structure,context.input.structure);
 assert.equal(run('rawByWitness.A.length'),0);assert.equal(run('pairResults.B.A[0].refs[0].coords'),undefined);
 const snapshot=JSON.parse(run('JSON.stringify(captureProject())'));
 assert.equal(snapshot.state.recoveredFrom,'decisions-json');
 context.snapshot=snapshot;run('restoreProject(validateProject(snapshot))');
 assert.deepEqual(JSON.parse(run('JSON.stringify(captureProject())')),snapshot);
});
test('newer decisions reports retain displacement confirmations and unknown source labels',()=>{
 const {run,context}=setup();const report=decisionReport(),comparison=report.comparisons.Witness;
 comparison.alignments[0].sourceReference='manual source label';
 comparison.possibleTranspositions=[{text_a:'alpha',text_b:'alpha',source_a:[],source_b:[],score:1,margin:1}];
 comparison.movementDecisions={0:'confirm'};context.input=report;
 run('restoreProject(validateProject(projectFromDecisionReport(input)))');
 const output=JSON.parse(run('JSON.stringify(buildJSONExport())')).comparisons.Witness;
 assert.equal(output.alignments[0].sourceReference,'manual source label');
 assert.equal(output.movementDecisions[0],'confirm');assert.deepEqual(output.possibleTranspositions,comparison.possibleTranspositions);
});
test('malformed decision reports cannot replace the current session',async()=>{
 const {run,context}=setup();run(`pairResults={B:pair('original','reading')};pairReviews={B:{decisions:{},movementDecisions:{}}};activatePair('B',false)`);
 const before=run('JSON.stringify(captureProject())');
 for(const mutate of [r=>{r.comparisons.Witness.alignments[0].decisions={999:'keep'}},
   r=>{r.witnesses.Witness=42},r=>{r.comparisons.Witness.alignments[0].readingReference=null},
   r=>{r.structure.ranges[0].end=99},r=>{r.version=99;r.format='varians-project'}]){
  const report=decisionReport();mutate(report);context.input=JSON.stringify(report);
  await run('openProjectFile({size:input.length,text:async()=>input})');
  assert.equal(run('JSON.stringify(captureProject())'),before);
 }
});
