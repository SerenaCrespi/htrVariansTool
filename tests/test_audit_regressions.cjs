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
