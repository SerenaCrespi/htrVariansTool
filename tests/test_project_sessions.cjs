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
async function download(page,button){const pending=page.waitForEvent('download');await page.locator(button).click();if(button==='#exportTei')await page.locator('#confirmTeiExport').click();const file=await pending;return readFile(await file.path(),'utf8')}
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
 await page.locator('#exportTei').click();
 await page.locator('#genre').selectOption('poetry');
 await download(page,'#confirmTeiExport');
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

test('mixed prose/poetry and name-based IDs export consistently and survive project reopening',async()=>{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);page.on('dialog',dialog=>dialog.accept());
 await upload(page,'#fileA',['Prima frase completa in prosa','Primo verso splende','Secondo verso risuona','Ultima frase completa in prosa']);
 await page.locator('#addWitnessBtn').click();
 await upload(page,'#fileB',['Prima frase completa in prosa','Primo verso mutato','Secondo verso risuona','Ultima frase completa in prosa']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
 await page.locator('#dossierNameA').fill('BNCF II.IV.232');await page.locator('#dossierNameA').dispatchEvent('change');
 await page.locator('#dossierNameB').fill('Tordi.435');await page.locator('#dossierNameB').dispatchEvent('change');
 await page.evaluate(()=>setAll(1,'keep'));
 await page.locator('#exportTei').click();
 await page.locator('#teiMixed').check();
 await page.locator('[data-range="0"][data-field="end"]').fill('1');await page.locator('[data-range="0"][data-field="end"]').dispatchEvent('change');
 await page.locator('#addGenreRange').click();
 await page.locator('[data-range="1"][data-field="end"]').fill('3');await page.locator('[data-range="1"][data-field="end"]').dispatchEvent('change');
 await page.locator('[data-range="1"][data-field="genre"]').selectOption('poetry');
 await page.locator('#addGenreRange').click();
 const tei=await download(page,'#confirmTeiExport');
 const json=JSON.parse(await download(page,'#exportJson'));
 assert.equal(json.reference.id,'BNCF_II.IV.232');assert.deepEqual(json.witnesses,{'Tordi.435':'Tordi.435'});
 assert.deepEqual(Object.keys(json.comparisons),['Tordi.435']);
 assert.deepEqual(json.structure.ranges,[{start:1,end:1,genre:'prose'},{start:2,end:3,genre:'poetry'},{start:4,end:4,genre:'prose'}]);
 const parsed=await page.evaluate(xml=>{
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  const ids=[...doc.getElementsByTagName('witness')].map(el=>el.getAttribute('xml:id'));
  return {parseErrors:doc.getElementsByTagName('parsererror').length,ids,refs:[...doc.querySelectorAll('[wit]')].flatMap(el=>el.getAttribute('wit').split(/\s+/)),paragraphs:[...doc.getElementsByTagName('body')[0].children].filter(el=>el.localName==='p').map(el=>el.textContent),lines:[...doc.getElementsByTagName('l')].map(el=>el.textContent),groups:doc.getElementsByTagName('lg').length,readings:[...doc.getElementsByTagName('rdg')].map(el=>el.textContent)};
 },tei);
 assert.equal(parsed.parseErrors,0);assert.deepEqual(parsed.ids,['BNCF_II.IV.232','Tordi.435']);
 assert.ok(parsed.refs.length>0);assert.ok(parsed.refs.every(ref=>parsed.ids.includes(ref.slice(1))));
 assert.deepEqual(parsed.paragraphs,['Prima frase completa in prosa','Ultima frase completa in prosa']);
 assert.equal(parsed.groups,1);assert.equal(parsed.lines.length,2);assert.ok(parsed.readings.includes('mutato'));
 assert.equal(parsed.lines[1],'Secondo verso risuona');
 const saved=await download(page,'#saveProject');await page.reload();await open(page,saved);
 assert.equal(await download(page,'#exportTei'),tei);
 assert.deepEqual(JSON.parse(await download(page,'#exportJson')),json);
 // Old saved sessions without the optional range field still reopen uniformly.
 const legacy=JSON.parse(saved);delete legacy.state.genreRanges;await open(page,JSON.stringify(legacy));
 assert.deepEqual(await page.evaluate(()=>genreRanges),[]);
 assert.deepEqual(errors,[]);await page.close();
});


test('TEI dialog defers download, cancels changes and keeps invalid intervals open',async()=>{
 const page=await browser.newPage();await page.goto(url);
 await upload(page,'#fileA',['prima riga','seconda riga']);await page.locator('#addWitnessBtn').click();
 await upload(page,'#fileB',['prima riga','seconda riga']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
 assert.equal(await page.locator('#teiRangesPanel').count(),0);
 assert.equal(await page.locator('#genre').isVisible(),false);
 const before=await page.evaluate(()=>captureProject());let downloads=0;page.on('download',()=>downloads++);
 await page.locator('#exportTei').click();assert.equal(downloads,0);
 assert.equal(await page.locator('#teiExportDialog').isVisible(),true);
 await page.locator('#genre').selectOption('drama');await page.locator('#cancelTeiExport').click();
 assert.deepEqual(await page.evaluate(()=>captureProject()),before);
 await page.locator('#exportTei').click();await page.locator('#teiMixed').check();
 await page.locator('[data-range="0"][data-field="start"]').fill('2');
 await page.locator('#confirmTeiExport').click();
 assert.equal(await page.locator('#teiExportDialog').isVisible(),true);assert.equal(downloads,0);
 assert.match(await page.locator('#teiExportError').textContent(),/Intervals must cover/);
 assert.deepEqual(await page.evaluate(()=>captureProject()),before);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>teiExportDraft===null);
 await page.locator('#exportTei').click();await page.locator('#genre').selectOption('drama');
 const xml=await download(page,'#confirmTeiExport');assert.match(xml,/<sp><p>prima riga seconda riga<\/p><\/sp>/);
 assert.equal(await page.locator('#teiExportDialog').isVisible(),false);
 assert.equal(await page.evaluate(()=>uniformGenre),'drama');assert.equal(downloads,1);
 // Narrow screens retain usable interval controls inside the dialog.
 await page.setViewportSize({width:390,height:844});await page.locator('#exportTei').click();await page.locator('#teiMixed').check();
 const box=await page.locator('#teiExportDialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);
 assert.equal(await page.evaluate(()=>{const el=document.getElementById('teiExportDialog');return el.scrollWidth<=el.clientWidth}),true);
 await page.locator('#cancelTeiExport').click();await page.close();
});

test('prose joins review units while poetry preserves original ALTO lines after manual regrouping',async()=>{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 const lines=['prima riga poetica','seconda riga poetica','terza riga poetica'];
 await upload(page,'#fileA',lines);await page.locator('#addWitnessBtn').click();await upload(page,'#fileB',lines);
 await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
 // Put two original source lines in one displayed unit, leaving an empty row.
 await page.evaluate(()=>{adjustUnit(0);selectDraftSide('A')});
 await page.locator('#moveSource').selectOption('1:0');await page.locator('#moveTarget').selectOption('0');await page.locator('#movePosition').selectOption('end');
 await page.getByRole('button',{name:'Move line to selected unit',exact:true}).click();
 await page.getByRole('button',{name:'Save alignment',exact:true}).click();
 // Split one physical line into two review fragments. It must remain one verse.
 await page.evaluate(()=>{adjustUnit(0);selectDraftSide('A')});await page.locator('#modal details summary').click();
 await page.locator('#splitMarker').fill('prima');await page.getByRole('button',{name:'Split selected line',exact:true}).click();
 await page.getByRole('button',{name:'Save alignment',exact:true}).click();
 assert.equal(await page.evaluate(()=>groups[0].aItems.length),3);
 const prose=await download(page,'#exportTei');
 assert.match(prose,/<body><p>prima riga poetica seconda riga poetica terza riga poetica<\/p><\/body>/);
 await page.locator('#exportTei').click();await page.locator('#genre').selectOption('poetry');
 const poetry=await download(page,'#confirmTeiExport');
 const verses=await page.evaluate(xml=>[...new DOMParser().parseFromString(xml,'application/xml').getElementsByTagName('l')].map(el=>el.textContent),poetry);
 assert.deepEqual(verses,lines);
 const saved=await download(page,'#saveProject');await page.reload();await open(page,saved);
 assert.equal(await download(page,'#exportTei'),poetry);assert.deepEqual(errors,[]);await page.close();
});

test('editing one reading keeps earlier/later decisions and other witness reviews through save/reopen',async()=>{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 await upload(page,'#fileA',['alfa prima lezione','beta seconda lezione','gamma terza lezione','delta quarta lezione']);
 await page.locator('#addWitnessBtn').click();await upload(page,'#fileB',['alfa prima variante','beta seconda variante','gamma terza variante','delta quarta variante']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
 await page.locator('#addWitnessBtn').click();await upload(page,'#fileC',['alfa prima diversa','beta seconda diversa','gamma terza diversa','delta quarta diversa']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===2&&pendingProjectOperations===0);
 await page.evaluate(()=>{activatePair('C');groups.forEach((_,i)=>setAll(i,i%2?'keep':'ignore'));activatePair('B');groups.forEach((_,i)=>setAll(i,i%2?'ignore':'keep'))});
 const before=await page.evaluate(()=>captureProject());assert.equal(before.state.pairResults.B.alignments.length,4);
 assert.equal(Object.keys(before.state.pairReviews.B.decisions).length,4);
 let warning='';page.once('dialog',async dialog=>{warning=dialog.message();await dialog.accept()});
 await page.locator('#unit-2 .edit').first().click();await page.locator('#editB').fill('gamma terza variante corretta');await page.locator('#saveEditBtn').click();
 await page.waitForFunction(()=>!document.getElementById('editB'));
 const after=await page.evaluate(()=>captureProject());
 assert.match(warning,/only for this unit/);
 const expectedDecisions=structuredClone(before.state.pairReviews.B.decisions);delete expectedDecisions[2];
 assert.deepEqual(after.state.pairReviews.B.decisions,expectedDecisions);
 assert.deepEqual(after.state.pairReviews.C,before.state.pairReviews.C);
 assert.deepEqual(after.state.pairResults.C,before.state.pairResults.C);
 assert.deepEqual(after.state.pairResults.B.alignments[2].aItems,before.state.pairResults.B.alignments[2].aItems);
 for(const i of [0,1,3])assert.deepEqual(after.state.pairResults.B.alignments[i],before.state.pairResults.B.alignments[i]);
 assert.ok(await page.locator('#unit-0 .token.keep').count());assert.ok(await page.locator('#unit-1 .token.ignore').count());assert.ok(await page.locator('#unit-2 .token.var').count());
 await page.locator('#compareWitness').selectOption('C');await page.locator('#compareWitness').selectOption('B');
 assert.deepEqual(await page.evaluate(()=>decisions),expectedDecisions);
 const results=JSON.parse(await download(page,'#exportJson'));
 const exported=Object.values(results.comparisons)[0].alignments;
 for(const i of [0,1,3])assert.deepEqual(exported[i].decisions,expectedDecisions[i]);assert.deepEqual(exported[2].decisions,{});
 const saved=await download(page,'#saveProject');await page.reload();await open(page,saved);
 assert.deepEqual(await page.evaluate(()=>captureProject()),after);
 assert.deepEqual(errors,[]);await page.close();
});

test('unchanged, cancelled and invalid text edits preserve decisions and original source fragments',async()=>{
 const page=await browser.newPage();await page.goto(url);
 await upload(page,'#fileA',['prima lezione originale','seconda lezione originale']);await page.locator('#addWitnessBtn').click();await upload(page,'#fileB',['prima lezione diversa','seconda lezione diversa']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
 // Preserve an existing manually split source line when the editor saves no changes.
 await page.evaluate(()=>{const g=groups[0],item=g.aItems[0];g.aItems=[{...item,text:'prima'},{...item,text:'lezione originale'}];setAll(0,'keep');setAll(1,'ignore')});
 const before=await page.evaluate(()=>captureProject());let warnings=0;
 page.on('dialog',async dialog=>{warnings++;await dialog.dismiss()});
 await page.locator('#unit-0 .edit').first().click();await page.locator('#saveEditBtn').click();
 await page.waitForFunction(()=>!document.getElementById('editB'));
 assert.equal(warnings,0);assert.deepEqual(await page.evaluate(()=>captureProject()),before);
 await page.locator('#unit-0 .edit').first().click();await page.locator('#editB').fill('nuova lettura');await page.locator('#saveEditBtn').click();
 assert.equal(warnings,1);assert.equal(await page.locator('#editB').isVisible(),true);
 assert.deepEqual(await page.evaluate(()=>captureProject()),before);
 await page.locator('#editA').fill('');await page.locator('#editB').fill('');await page.locator('#saveEditBtn').click();
 assert.match(await page.locator('#editError').textContent(),/At least one/);assert.deepEqual(await page.evaluate(()=>captureProject()),before);
 await page.close();
});

test('automatic fallback is surfaced without any semantic action and survives save/reopen',async()=>{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 assert.equal(await page.locator('#semanticBtn').count(),0);assert.equal(await page.locator('#semanticDialog').count(),0);
 let requests=0;
 // Simulate the backend's accepted-recovery metadata; the policy and real
 // entrypoint with a controlled semantic provider are covered by Python tests.
 await page.route('**/api/align',async route=>{
  requests++;const response=await route.fetch(),data=await response.json();
  data.alignment_method='hybrid: automatic Bertalign recovery + word-level Levenshtein';
  data.alignments[1].alignment_source='bertalign_automatic';data.alignments[1].semantic_review=true;
  data.semantic_fallback={strategy:'automatic',engine:'bertalign',status:'applied',candidates:1,attempted:1,accepted:1,windows:[{fromUnit:1,toUnit:3,status:'applied'}]};
  await route.fulfill({json:data});
 });
 await upload(page,'#fileA',['prima riga del testimone','seconda riga del testimone','terza riga del testimone']);await page.locator('#addWitnessBtn').click();await upload(page,'#fileB',['prima riga del testimone','seconda riga del testimone','terza riga del testimone']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
 assert.equal(requests,1);assert.match(await page.locator('#automaticSemanticStatus').textContent(),/1 of 1/);
 assert.match(await page.locator('#unit-1').textContent(),/automatic Bertalign recovery/);
 await page.locator('#resultFilter').selectOption('uncertain');assert.equal(await page.locator('#results article').count(),1);
 const json=JSON.parse(await download(page,'#exportJson')),comparison=Object.values(json.comparisons)[0];
 assert.equal(comparison.semanticFallback.status,'applied');assert.equal(comparison.alignments[1].alignmentSource,'bertalign_automatic');assert.equal(comparison.alignments[1].requiresReview,true);
 const expected=await page.evaluate(()=>captureProject()),saved=await download(page,'#saveProject');await page.reload();await open(page,saved);
 assert.deepEqual(await page.evaluate(()=>captureProject()),expected);assert.match(await page.locator('#automaticSemanticStatus').textContent(),/1 of 1/);assert.deepEqual(errors,[]);await page.close();
});

test('automatic fallback failure keeps lexical output and displays the reason',async()=>{
 const page=await browser.newPage();await page.goto(url);
 const good=await page.request.post(url+'/api/align',{data:{sentences:{A:[{text:'identical reliable reference text',refs:[]}],B:[{text:'identical reliable reference text',refs:[]}]}}});
 assert.equal(good.status(),200);assert.equal((await good.json()).semantic_fallback.status,'not_needed');
 await page.route('**/api/align',async route=>{
  const response=await route.fetch(),data=await response.json();
  data.semantic_fallback={strategy:'automatic',engine:'bertalign',status:'not_installed',candidates:1,attempted:1,accepted:0,windows:[{fromUnit:1,toUnit:2,status:'not_installed'}]};
  await route.fulfill({json:data});
 });
 await upload(page,'#fileA',['prima riga del testimone','seconda riga del testimone']);await page.locator('#addWitnessBtn').click();await upload(page,'#fileB',['prima riga del testimone','seconda riga del testimone']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
 assert.match(await page.locator('#automaticSemanticStatus').textContent(),/not installed/);
 assert.equal(await page.evaluate(()=>groups.some(g=>g.semantic_review)),false);assert.equal(await page.locator('#results article').count(),2);
 await page.locator('#language').selectOption('it');assert.match(await page.locator('#automaticSemanticStatus').textContent(),/non è installato/);
 await page.close();
});
