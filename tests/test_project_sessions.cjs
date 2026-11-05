// Run: node --test tests/test_project_sessions.cjs
// Requires Playwright and Chromium (CHROMIUM_PATH can select the executable).
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {readFile,mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
let server,browser,url,dir;
before(async()=>{
 dir=await mkdtemp(path.join(tmpdir(),'varians-project-test-'));
 server=spawn('python3',['-B','-u','-c',"import sys;sys.path.insert(0,'backend');from app import Handler,ThreadingHTTPServer;s=ThreadingHTTPServer(('127.0.0.1',0),Handler);print(s.server_address[1],flush=True);s.serve_forever()"],{cwd:path.resolve(__dirname,'..'),stdio:['ignore','pipe','pipe']});
 let serverError='';server.stderr.on('data',chunk=>{serverError+=chunk});
 const [data]=await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error(serverError||'Test server exited before startup')})]);url=`http://127.0.0.1:${Number(String(data).trim())}`;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
});
after(async()=>{if(browser)await browser.close();if(server&&server.exitCode===null){server.kill();await once(server,'exit')}if(dir)await rm(dir,{recursive:true,force:true})});
const alto=lines=>`<alto><Layout><Page ID="p" WIDTH="1000" HEIGHT="1000"><TextBlock>${lines.map((text,i)=>`<TextLine ID="l${i}" HPOS="10" VPOS="${i*30}" WIDTH="500" HEIGHT="20"><String CONTENT="${text}"/></TextLine>`).join('')}</TextBlock></Page></Layout></alto>`;
const upload=(page,id,text)=>page.locator(id).setInputFiles({name:'page.xml',mimeType:'text/xml',buffer:Buffer.from(alto(text))});
async function download(page,button){const pending=page.waitForEvent('download');await page.locator(button).click();const file=await pending;return readFile(await file.path(),'utf8')}
async function open(page,content){await page.locator('#projectFile').setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(content)});await page.waitForFunction(()=>pendingProjectOperations===0)}

test('save/reopen preserves multi-witness edits, decisions, exports, settings and image links',async()=>{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('#language').selectOption('it');
 await upload(page,'#fileA',['Nel mezzo del cammino','una selva oscura','ritrovai la via']);
 await page.locator('#addWitnessBtn').click();
 await upload(page,'#fileB',['Nel mezzo del viaggio','una selva oscura','ritrovai la strada']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
 await page.locator('#addWitnessBtn').click();
 // Adding a witness reruns all pairs; record final decisions after that run.
 page.on('dialog',dialog=>dialog.accept());
 await upload(page,'#fileC',['Nel mezzo del sentiero','una selva oscura','ritrovai la via']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===2&&pendingProjectOperations===0);
 await page.locator('#compareWitness').selectOption('B');
 await page.locator('#results .edit').first().click();
 await page.locator('#editB').fill('Nel mezzo del viaggio corretto');await page.locator('#saveEditBtn').click();
 await page.waitForFunction(()=>!document.getElementById('editB'));
 await page.evaluate(()=>adjustUnit(0));
 await page.locator('#modal details summary').click();await page.locator('#splitMarker').fill('Nel mezzo');
 await page.getByRole('button',{name:'Dividi la riga selezionata',exact:true}).click();
 await page.getByRole('button',{name:'Salva allineamento',exact:true}).click();
 assert.equal(await page.evaluate(()=>groups[0].bItems.length),2);
 // Supply a deterministic movement candidate to cover reviewer decisions even
 // when these short fixtures do not produce a displacement suggestion.
 await page.evaluate(()=>{setAll(0,'keep');movementCandidates.push({text_a:'passo spostato',text_b:'passo spostato',source_a:[],source_b:[],score:1,margin:1,status:'possible_transposition'});setMovement(movementCandidates.length-1,'confirm');activatePair('C');setAll(0,'ignore')});
 await page.locator('.iiif-options summary').click();
 await page.locator('#iiifA').fill('https://example.org/a.jpg');
 await page.locator('#iiifB').fill('https://example.org/b.jpg');
 await page.locator('#genre').selectOption('poetry');
 const image={name:'page.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6D2sAAAAASUVORK5CYII=','base64')};
 await page.locator('#imagesA').setInputFiles(image);await page.waitForFunction(()=>pendingProjectOperations===0);
 await page.evaluate(()=>{imageOverrides['A:page.xml']=images.A[0]});
 await page.locator('#resultFilter').selectOption('variants');
 const expected=await page.evaluate(()=>captureProject());
 const jsonBefore=await download(page,'#exportJson'),teiBefore=await download(page,'#exportTei');
 const saved=await download(page,'#saveProject');assert.deepEqual(JSON.parse(saved),expected);assert.ok(!saved.includes('blob:'));
 await page.reload();await open(page,saved);
 assert.deepEqual(await page.evaluate(()=>captureProject()),expected);
 assert.match(await page.locator('#projectStatus').textContent(),/Progetto aperto/);
 assert.equal(await page.locator('#compareWitness').inputValue(),'C');
 assert.equal(await page.locator('#iiifB').inputValue(),'https://example.org/b.jpg');
 assert.equal(await download(page,'#exportJson'),jsonBefore);assert.equal(await download(page,'#exportTei'),teiBefore);
 await page.locator('#imagesA').setInputFiles(image);await page.waitForFunction(()=>pendingProjectOperations===0);
 assert.equal(await page.evaluate(()=>imageOverrides['A:page.xml'].name),'page.png');
 assert.deepEqual(errors,[]);await page.close();
});

test('invalid and unsupported files preserve the current session; replacement can be cancelled',async()=>{
 const page=await browser.newPage();await page.goto(url);await upload(page,'#fileA',['testo originale']);
 const before=await page.evaluate(()=>captureProject());
 await page.evaluate(()=>openProjectFile({size:101*1024*1024}));
 assert.deepEqual(await page.evaluate(()=>captureProject()),before);
 assert.match(await page.locator('#projectStatus').textContent(),/100 MB/);
 for(const content of ['{broken',JSON.stringify({...before,version:99}),JSON.stringify({...before,state:{...before.state,witnessIds:['A','A']}}),JSON.stringify({...before,state:{...before.state,iiif:{A:'javascript:alert(1)'}}})]){
  await open(page,content);assert.deepEqual(await page.evaluate(()=>captureProject()),before);
  assert.match(await page.locator('#projectStatus').textContent(),/Error:/);
 }
 page.once('dialog',dialog=>dialog.dismiss());await open(page,JSON.stringify({...before,state:{...before.state,names:{A:'replacement'}}}));
 assert.deepEqual(await page.evaluate(()=>captureProject()),before);
 assert.equal(await page.locator('#projectFile').inputValue(),'');await page.close();
});

test('a project saved before alignment reopens with its ALTO files ready to align',async()=>{
 const page=await browser.newPage();await page.goto(url);await upload(page,'#fileA',['testo prima della collazione']);
 const saved=await download(page,'#saveProject');await page.reload();await open(page,saved);
 await page.locator('#addWitnessBtn').click();await upload(page,'#fileB',['testo dopo la collazione']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
 assert.ok(await page.locator('#results article').count());await page.close();
});


test('malformed alignment and review structures are rejected before replacement',async()=>{
 const page=await browser.newPage();await page.goto(url);
 await upload(page,'#fileA',['testo originale']);await page.locator('#addWitnessBtn').click();
 await upload(page,'#fileB',['testo modificato']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
 const before=await page.evaluate(()=>captureProject());
 for(const mutate of [
  p=>{p.state.pairResults.B.alignments[0].aItems={}},
  p=>{p.state.pairReviews.B.decisions={'999':{'0':'keep'}}},
  p=>{p.state.pairReviews.B.movementDecisions={'999':'confirm'}},
  p=>{p.state.activeWitness='J'},
  p=>{p.state.pairResults.B.A[0].refs=[null]},
 ]){
  const invalid=structuredClone(before);mutate(invalid);await open(page,JSON.stringify(invalid));
  assert.deepEqual(await page.evaluate(()=>captureProject()),before);
  assert.match(await page.locator('#projectStatus').textContent(),/Error:/);
 }
 await page.close();
});
