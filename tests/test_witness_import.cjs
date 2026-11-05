// Unit-test the actual browser functions with in-memory DOM/network substitutes.
// No browser, backend, Bertalign model or external package is required.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const source=readFileSync(path.resolve(__dirname,'../frontend.js'),'utf8');
function setup({fail=false,accept=true}={}){
 const elements=new Map(),requests=[],confirmations=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',dataset:{},innerHTML:'',textContent:'',disabled:false,hidden:false,addEventListener(){},removeAttribute(){},insertAdjacentHTML(){}});return elements.get(id)};
 const unit=text=>({text,refs:[]});
 const oldPair={A:[unit('reference reading')],B:[unit('original witness')],alignments:[{id:0,a0:0,a1:1,b0:0,b1:1,similarity:0.5,aItems:[unit('reference reading')],bItems:[unit('manually corrected witness')]}],possible_transpositions:[{text_a:'reference reading',text_b:'manually corrected witness',source_a:[],source_b:[],score:0.8,margin:0.3,status:'possible_transposition'}],frequent_ambiguous_cases:[],alignment_method:'word-level Levenshtein'};
 const response={witnesses:{A:[unit('reference reading')],B:[unit('new witness')]},alignments:[{id:0,a0:0,a1:1,b0:0,b1:1,similarity:0.6,aItems:[unit('reference reading')],bItems:[unit('new witness')]}],possible_transpositions:[],frequent_ambiguous_cases:[],alignment_method:'word-level Levenshtein'};
 const context=vm.createContext({window:{},document:{getElementById:element,querySelectorAll:()=>[],documentElement:{}},console,URL,Blob,setTimeout,clearTimeout,
  confirm:message=>{confirmations.push(message);return accept},alert:message=>{throw Error(message)},
  fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return{ok:!fail,json:async()=>fail?{error:'new comparison failed'}:structuredClone(response)}}});
 vm.runInContext(source,context);
 vm.runInContext(`witnessIds=['A','B','C'];names={A:'Reference',B:'Reviewed witness',C:'New witness'};rawByWitness={A:[{name:'reference.xml',text:'reference ALTO'}],B:[{name:'old.xml',text:'old ALTO'}],C:[]};rawA=rawByWitness.A;pairResults={B:${JSON.stringify(oldPair)}};pairReviews={B:{decisions:{0:{0:'ignore'}},movementDecisions:{0:'reject'}}};activeWitness='B';A=pairResults.B.A;B=pairResults.B.B;groups=pairResults.B.alignments;decisions={0:{0:'keep'}};movementDecisions={0:'confirm'};genreRanges=[{start:1,end:1,genre:'prose'}];`,context);
 const state=()=>JSON.parse(vm.runInContext('JSON.stringify({pairResults,pairReviews,decisions,movementDecisions,rawByWitness,names,genreRanges})',context));
 const file={name:'new.xml',text:async()=>'<alto>new witness</alto>'};
 return{context,requests,confirmations,state,file,oldPair,elements};
}
test('importing a new witness requests only its alignment and preserves live decisions and edits',async()=>{
 const x=setup(),before=x.state();
 x.context.newFiles=[x.file];await vm.runInContext("loadFile('C',newFiles)",x.context);
 const after=x.state();assert.equal(x.requests.length,1);assert.equal(x.confirmations.length,0);
 assert.equal(x.requests[0].body.alto.B[0].text,'<alto>new witness</alto>');assert.equal(x.requests[0].body.alto.A[0].text,'reference ALTO');
 assert.deepEqual(after.pairResults.B,before.pairResults.B);
 assert.deepEqual(after.pairReviews.B,{decisions:before.decisions,movementDecisions:before.movementDecisions});
 assert.deepEqual(after.decisions,before.decisions);assert.deepEqual(after.movementDecisions,before.movementDecisions);
 assert.deepEqual(after.genreRanges,before.genreRanges);assert.deepEqual(after.rawByWitness.B,before.rawByWitness.B);
 assert.deepEqual(after.pairReviews.C,{decisions:{},movementDecisions:{}});
});
test('a failed new-witness request preserves existing reviews and restores the previous source input',async()=>{
 const x=setup({fail:true}),before=x.state();x.context.newFiles=[x.file];await vm.runInContext("loadFile('C',newFiles)",x.context);
 assert.equal(x.requests.length,1);assert.deepEqual(x.state(),before);
});
test('cancelling replacement of a reviewed witness changes neither its source nor its decisions',async()=>{
 const x=setup({accept:false}),before=x.state();x.context.newFiles=[x.file];await vm.runInContext("loadFile('B',newFiles)",x.context);
 assert.equal(x.requests.length,0);assert.equal(x.confirmations.length,1);assert.deepEqual(x.state(),before);
});
test('replacing one existing witness recalculates only that witness',async()=>{
 const x=setup();vm.runInContext("pairResults.C=JSON.parse(JSON.stringify(pairResults.B));pairReviews.C={decisions:{0:{0:'ignore'}},movementDecisions:{}};rawByWitness.C=[{name:'third.xml',text:'third ALTO'}]",x.context);
 const before=x.state();x.context.newFiles=[x.file];await vm.runInContext("loadFile('B',newFiles)",x.context);
 const after=x.state();assert.equal(x.requests.length,1);assert.equal(x.confirmations.length,1);
 assert.deepEqual(after.pairResults.C,before.pairResults.C);assert.deepEqual(after.pairReviews.C,before.pairReviews.C);
 assert.deepEqual(after.pairReviews.B,{decisions:{},movementDecisions:{}});
});
test('the full-alignment button event still rebuilds all pairs only after confirmation',async()=>{
 const x=setup();vm.runInContext("rawByWitness.C=[{name:'third.xml',text:'third ALTO'}]",x.context);
 await vm.runInContext('runAlign({type:"click"})',x.context);
 assert.equal(x.confirmations.length,1);assert.equal(x.requests.length,2);
 assert.ok(x.requests.every(r=>r.body.alto));
 assert.deepEqual(x.state().pairReviews,{B:{decisions:{},movementDecisions:{}},C:{decisions:{},movementDecisions:{}}});
});
