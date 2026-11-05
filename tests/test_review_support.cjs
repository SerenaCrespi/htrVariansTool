const {test}=require('node:test');const assert=require('node:assert/strict');
const {applySemanticInterval}=require('../review-support.js');
const row=text=>({aItems:[{text,refs:[]}],bItems:[{text,refs:[]}]});
const groups=['zero','one','two','three','four'].map(row),decisions={0:{0:'keep'},1:{0:'ignore'},2:{0:'keep'},4:{0:'ignore'}};
test('applying a changed interval shifts later decisions and preserves earlier reviews',()=>{
 const before=JSON.stringify({groups,decisions});const next=applySemanticInterval(groups,decisions,1,3,[row('one two')]);
 assert.deepEqual(next.decisions,{0:{0:'keep'},3:{0:'ignore'}});assert.equal(next.groups.length,4);assert.equal(JSON.stringify({groups,decisions}),before);
});
test('an identical proposal retains every decision',()=>{
 const next=applySemanticInterval(groups,decisions,1,3,groups.slice(1,3));assert.equal(next.changed,false);assert.equal(next.decisions,decisions);
});
test('canonical TEI interval endpoints track changed unit counts',()=>{
 const ranges=[{start:1,end:3,genre:'prose'},{start:4,end:5,genre:'poetry'}];
 const next=applySemanticInterval(groups,decisions,1,3,[row('merged')],ranges,true);
 assert.deepEqual(next.ranges,[{start:1,end:2,genre:'prose'},{start:3,end:4,genre:'poetry'}]);assert.equal(ranges[0].end,3);
});
test('proposals crossing canonical genre boundaries are rejected without changing reviews',()=>{
 const ranges=[{start:1,end:2,genre:'prose'},{start:3,end:5,genre:'poetry'}];
 assert.throws(()=>applySemanticInterval(groups,decisions,1,4,[row('merged')],ranges,true),/semanticGenreBoundary/);assert.equal(decisions[1][0],'ignore');
});
test('another witness comparison does not change canonical TEI numbering',()=>{
 const ranges=[{start:1,end:2,genre:'prose'},{start:3,end:5,genre:'poetry'}];
 assert.deepEqual(applySemanticInterval(groups,decisions,1,4,[row('merged')],ranges,false).ranges,ranges);
});
test('invalid selection and empty proposals are rejected',()=>{
 for(const [a,b,p] of [[-1,2,[row('x')]],[1,9,[row('x')]],[2,2,[row('x')]],[0,2,[]]])assert.throws(()=>applySemanticInterval(groups,decisions,a,b,p),/semanticInvalidInterval/);
});
