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
async function chooseExport(page,button){
 await page.locator('#exportButton').click();
 await page.locator(button).click();
}
async function download(page,button){
 const [file]=await Promise.all([
  page.waitForEvent('download',{timeout:8000}),
  (async()=>{
   if(button==='#exportTei'||button==='#exportJson')await chooseExport(page,button);
   else await page.locator(button).click();
   if(button==='#exportTei')await page.locator('#confirmTeiExport').click();
  })(),
 ]).catch(async error=>{
  const state=await page.evaluate(()=>({tei:$('teiExportDialog').open,error:$('teiExportError').textContent,project:$('projectStatus').textContent,menu:!$('exportOptions').hidden}));
  throw Error(`${button}: ${JSON.stringify(state)} · ${error.message}`);
 });
 return readFile(await file.path(),'utf8');
}
async function reloadWithoutSession(page){
 await page.evaluate(()=>sessionStorage.removeItem('varians-session'));
 await page.reload();
 await page.evaluate(()=>sessionReady);
}
async function open(page,content){await page.locator('#projectFile').setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(content)});await page.waitForFunction(()=>pendingProjectOperations===0)}

test('save/reopen preserves multi-witness edits, decisions, exports, settings and image links',async()=>{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('#language').selectOption('it');
 await upload(page,'#fileA',['Nel mezzo del cammino','una selva oscura','ritrovai la via']);
 await page.locator('#addWitnessBtn').click();
 await upload(page,'#fileB',['Nel mezzo del viaggio','una selva oscura','ritrovai la strada']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
 await page.locator('#addWitnessBtn').click();
 // Adding a witness calculates its new comparison without rebuilding earlier pairs.
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
 // Populate legacy project fields to verify that existing IIIF links still round-trip.
 await page.evaluate(()=>{
  $('iiifA').value='https://example.org/a.jpg';
  $('iiifB').value='https://example.org/b.jpg';
 });
 await chooseExport(page,'#exportTei');
 await page.locator('#genre').selectOption('poetry');
 await download(page,'#confirmTeiExport');
 const image={name:'page.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6D2sAAAAASUVORK5CYII=','base64')};
 await page.locator('#imagesA').setInputFiles(image);await page.waitForFunction(()=>pendingProjectOperations===0);
 await page.evaluate(()=>{imageOverrides['A:page.xml']=images.A[0]});
 await page.locator('#resultFilter').selectOption('variants');
 const expected=await page.evaluate(()=>captureProject());
 const jsonBefore=await download(page,'#exportJson'),teiBefore=await download(page,'#exportTei');
 const saved=await download(page,'#saveProject');assert.deepEqual(JSON.parse(saved),expected);assert.ok(!saved.includes('blob:'));
 await reloadWithoutSession(page);await open(page,saved);
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
 const saved=await download(page,'#saveProject');await reloadWithoutSession(page);await open(page,saved);
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
 await chooseExport(page,'#exportTei');
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
 const saved=await download(page,'#saveProject');await reloadWithoutSession(page);await open(page,saved);
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
 await chooseExport(page,'#exportTei');assert.equal(downloads,0);
 assert.equal(await page.locator('#teiExportDialog').isVisible(),true);
 await page.locator('#genre').selectOption('drama');await page.locator('#cancelTeiExport').click();
 assert.deepEqual(await page.evaluate(()=>captureProject()),before);
 await chooseExport(page,'#exportTei');await page.locator('#teiMixed').check();
 await page.locator('[data-range="0"][data-field="start"]').fill('2');
 await page.locator('#confirmTeiExport').click();
 assert.equal(await page.locator('#teiExportDialog').isVisible(),true);assert.equal(downloads,0);
 assert.match(await page.locator('#teiExportError').textContent(),/Intervals must cover/);
 assert.deepEqual(await page.evaluate(()=>captureProject()),before);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>teiExportDraft===null);
 await chooseExport(page,'#exportTei');await page.locator('#genre').selectOption('drama');
 const xml=await download(page,'#confirmTeiExport');assert.match(xml,/<sp><p>prima riga seconda riga<\/p><\/sp>/);
 assert.equal(await page.locator('#teiExportDialog').isVisible(),false);
 assert.equal(await page.evaluate(()=>uniformGenre),'drama');assert.equal(downloads,1);
 // Narrow screens retain usable interval controls inside the dialog.
 await page.setViewportSize({width:390,height:844});await chooseExport(page,'#exportTei');await page.locator('#teiMixed').check();
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
 await chooseExport(page,'#exportTei');await page.locator('#genre').selectOption('poetry');
 const poetry=await download(page,'#confirmTeiExport');
 const verses=await page.evaluate(xml=>[...new DOMParser().parseFromString(xml,'application/xml').getElementsByTagName('l')].map(el=>el.textContent),poetry);
 assert.deepEqual(verses,lines);
 const saved=await download(page,'#saveProject');await reloadWithoutSession(page);await open(page,saved);
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
 assert.equal(results.format,'varians-collation');
 assert.equal(results.version,1);
 const unit=results.units.find(unit=>unit.reference.text.includes('gamma'));
 assert.match(unit.id,/reference:page.xml\/p\/l2/);
 const witnessId=Object.keys(results.witnesses)[0];
 assert.equal(unit.readings[witnessId].segments[0].text,'gamma terza variante corretta');
 assert.match(unit.readings[witnessId].segments[0].originalText,/gamma terza/);
 assert.equal(unit.readings[witnessId].segments[0].sources[0].line,'l2');
 assert.ok(results.units.some(unit=>unit.variants.some(variant=>variant.status==='retained')));
 assert.ok(results.units.some(unit=>unit.variants.some(variant=>variant.status==='dismissed')));
 const exported=Object.values(results.comparisons)[0].alignments;
 for(const i of [0,1,3])assert.deepEqual(exported[i].decisions,expectedDecisions[i]);assert.deepEqual(exported[2].decisions,{});
 const saved=await download(page,'#saveProject');await reloadWithoutSession(page);await open(page,saved);
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

test('legacy semantic provenance survives save/reopen and remains reviewable',async()=>{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 assert.equal(await page.locator('#semanticBtn').count(),0);assert.equal(await page.locator('#semanticDialog').count(),0);
 let requests=0;
 // Simulate the backend's accepted-recovery metadata; the policy and real
 // entrypoint with a controlled semantic provider are covered by Python tests.
 await page.route('**/api/align',async route=>{
  requests++;const response=await route.fetch({headers:{...route.request().headers(),accept:'application/json'}}),data=await response.json();
  data.alignment_method='hybrid: automatic Bertalign recovery + word-level Levenshtein';
  data.alignments[1].alignment_source='bertalign_automatic';data.alignments[1].semantic_review=true;
  data.semantic_fallback={strategy:'automatic',engine:'bertalign',status:'applied',candidates:1,attempted:1,accepted:1,windows:[{fromUnit:1,toUnit:3,status:'applied'}]};
  await route.fulfill({json:data});
 });
 await upload(page,'#fileA',['prima riga del testimone','seconda riga del testimone','terza riga del testimone']);await page.locator('#addWitnessBtn').click();await upload(page,'#fileB',['prima riga del testimone','seconda riga del testimone','terza riga del testimone']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
 assert.equal(requests,1);assert.equal(await page.locator('#automaticSemanticStatus').count(),0);
 assert.match(await page.locator('#unit-1').textContent(),/alignment needs review/);
 await page.locator('#resultFilter').selectOption('uncertain');assert.equal(await page.locator('#results article').count(),1);
 const json=JSON.parse(await download(page,'#exportJson')),comparison=Object.values(json.comparisons)[0];
 assert.equal(comparison.semanticFallback.status,'applied');assert.equal(comparison.alignments[1].alignmentSource,'bertalign_automatic');assert.equal(comparison.alignments[1].requiresReview,true);
 const expected=await page.evaluate(()=>captureProject()),saved=await download(page,'#saveProject');await reloadWithoutSession(page);await open(page,saved);
 assert.deepEqual(await page.evaluate(()=>captureProject()),expected);assert.equal(await page.locator('#automaticSemanticStatus').count(),0);assert.deepEqual(errors,[]);await page.close();
});

test('the alignment endpoint returns lexical results without semantic diagnostics',async()=>{
 const page=await browser.newPage();
 try{
  const response=await page.request.post(url+'/api/align',{data:{sentences:{A:[{text:'una lezione del manoscritto',refs:[]}],B:[{text:'una versione del testimone',refs:[]}]}}});
  assert.equal(response.status(),200);
  const data=await response.json();
  assert.match(data.alignment_method,/word-level/);
  assert.equal(data.semantic_fallback,undefined);
  assert.ok(data.alignments.length);
  assert.equal(data.alignments.some(row=>row.semantic_review),false);
 }finally{await page.close()}
});

test('adding a witness aligns only the new pair and preserves previous edits and review decisions',async()=>{
 const page=await browser.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',request=>{if(request.url().endsWith('/api/align')&&request.method()==='POST')requests.push(request.postDataJSON())});
 await page.goto(url);await upload(page,'#fileA',['alfa prima lezione','beta seconda lezione']);await page.locator('#addWitnessBtn').click();await upload(page,'#fileB',['alfa prima variante','beta seconda variante']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
 await page.locator('#unit-0 .edit').first().click();await page.locator('#editB').fill('alfa prima variante corretta');await page.locator('#saveEditBtn').click();
 await page.evaluate(()=>{setAll(0,'keep');setAll(1,'ignore');movementCandidates.push({text_a:'passaggio fonte',text_b:'passaggio confrontato',source_a:[],source_b:[],score:0.8,margin:0.2,status:'possible_transposition'});setMovement(movementCandidates.length-1,'confirm');genreRanges=[{start:1,end:1,genre:'prose'},{start:2,end:2,genre:'poetry'}]});
 const before=await page.evaluate(()=>captureProject()),previousRequests=requests.length;let dialogs=0;
 page.on('dialog',async dialog=>{dialogs++;await dialog.dismiss()});
 await page.locator('#addWitnessBtn').click();await upload(page,'#fileC',['alfa prima nuova','beta seconda nuova']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===2&&pendingProjectOperations===0);
 const after=await page.evaluate(()=>captureProject());
 assert.equal(dialogs,0);assert.equal(requests.length-previousRequests,1);
 assert.ok(requests.at(-1).alto.B[0].text.includes('prima nuova'));
 assert.deepEqual(after.state.pairResults.B,before.state.pairResults.B);
 assert.deepEqual(after.state.pairReviews.B,before.state.pairReviews.B);
 assert.deepEqual(after.state.rawByWitness.B,before.state.rawByWitness.B);
 assert.deepEqual(after.state.genreRanges,before.state.genreRanges);
 assert.deepEqual(after.state.pairReviews.C,{decisions:{},movementDecisions:{}});
 await page.locator('#compareWitness').selectOption('C');await page.locator('#compareWitness').selectOption('B');
 assert.deepEqual(await page.evaluate(()=>decisions),before.state.pairReviews.B.decisions);
 assert.deepEqual(await page.evaluate(()=>movementDecisions),before.state.pairReviews.B.movementDecisions);
 assert.match(await page.locator('#unit-0').textContent(),/variante corretta/);
 const saved=await download(page,'#saveProject');await reloadWithoutSession(page);await open(page,saved);
 assert.deepEqual(await page.evaluate(()=>captureProject()),after);assert.deepEqual(errors,[]);await page.close();
});

test('a failed new-witness alignment leaves existing pairs and decisions untouched',async()=>{
 const page=await browser.newPage();await page.goto(url);
 await upload(page,'#fileA',['alfa prima lezione','beta seconda lezione']);await page.locator('#addWitnessBtn').click();await upload(page,'#fileB',['alfa prima variante','beta seconda variante']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
 await page.evaluate(()=>{setAll(0,'keep');setAll(1,'ignore')});const before=await page.evaluate(()=>captureProject());
 await page.locator('#addWitnessBtn').click();
 await page.route('**/api/align',route=>route.fulfill({status:400,json:{error:'New witness could not be aligned'}}));
 await upload(page,'#fileC',['alfa nuova lezione','beta nuova lezione']);await page.waitForFunction(()=>pendingProjectOperations===0);
 const after=await page.evaluate(()=>captureProject());
 assert.deepEqual(after.state.pairResults.B,before.state.pairResults.B);assert.deepEqual(after.state.pairReviews.B,before.state.pairReviews.B);
 assert.deepEqual(Object.keys(after.state.pairResults),['B']);assert.match(await page.locator('#loadedStatus').textContent(),/could not be aligned/);await page.close();
});

test('replacing one witness is scoped, cancellation restores sources, and explicit realignment still rebuilds all pairs',async()=>{
 const page=await browser.newPage(),requests=[];page.on('request',r=>{if(r.url().endsWith('/api/align')&&r.method()==='POST')requests.push(r.postDataJSON())});await page.goto(url);
 await upload(page,'#fileA',['alfa prima lezione','beta seconda lezione']);await page.locator('#addWitnessBtn').click();await upload(page,'#fileB',['alfa prima variante','beta seconda variante']);
 await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
 await page.locator('#addWitnessBtn').click();await upload(page,'#fileC',['alfa prima diversa','beta seconda diversa']);await page.waitForFunction(()=>Object.keys(pairResults).length===2&&pendingProjectOperations===0);
 await page.evaluate(()=>{activatePair('C');setAll(0,'ignore');activatePair('B');setAll(0,'keep')});
 const before=await page.evaluate(()=>captureProject());let count=requests.length;
 page.once('dialog',dialog=>dialog.dismiss());await upload(page,'#fileB',['alfa prima sostitutiva','beta seconda sostitutiva']);await page.waitForFunction(()=>pendingProjectOperations===0);
 assert.equal(requests.length,count);assert.deepEqual(await page.evaluate(()=>captureProject()),before);
 page.once('dialog',dialog=>dialog.accept());await upload(page,'#fileB',['alfa prima sostitutiva','beta seconda sostitutiva']);await page.waitForFunction(()=>pendingProjectOperations===0);
 const replaced=await page.evaluate(()=>captureProject());
 assert.equal(requests.length,count+1);assert.deepEqual(replaced.state.pairResults.C,before.state.pairResults.C);assert.deepEqual(replaced.state.pairReviews.C,before.state.pairReviews.C);assert.deepEqual(replaced.state.pairReviews.B,{decisions:{},movementDecisions:{}});
 assert.ok(replaced.state.rawByWitness.B[0].text.includes('sostitutiva'));
 page.once('dialog',dialog=>dialog.dismiss());await upload(page,'#fileA',['alfa nuova referenza','beta nuova referenza']);await page.waitForFunction(()=>pendingProjectOperations===0);
 assert.deepEqual(await page.evaluate(()=>captureProject()),replaced);
 count=requests.length;page.once('dialog',dialog=>dialog.accept());await page.locator('#alignBtn').click();await page.waitForFunction(()=>pendingProjectOperations===0);
 assert.equal(requests.length,count+2);assert.ok(requests.slice(count).every(body=>body.alto?.A));
 assert.deepEqual(await page.evaluate(()=>pairReviews),{B:{decisions:{},movementDecisions:{}},C:{decisions:{},movementDecisions:{}}});await page.close();
});

test('alignment feedback and TEI titles work through the export menu',{timeout:20000},async()=>{
 const page=await browser.newPage();
 try{
  await page.goto(url);
  assert.equal(await page.locator('#resetBtn').count(),0);
  for(const name of ['Optional IIIF fallback','Alignment review','Unmatched and possibly displaced passages']){
   assert.equal(await page.getByRole('button',{name,exact:false}).count(),0);
  }
  await upload(page,'#fileA',['Titolo','Prima riga','Secondo titolo','Seconda riga']);
  await page.locator('#addWitnessBtn').click();
  let release;
  const paused=new Promise(resolve=>{release=resolve});
  await page.route('**/api/align',async route=>{await paused;await route.continue()});
  await upload(page,'#fileB',['Titolo','Prima riga','Secondo titolo','Seconda riga']);
  try{
   const progress=page.getByRole('progressbar',{name:'Aligning witnesses…'});
   await progress.waitFor();
   assert.equal(await progress.getAttribute('aria-valuenow'),'0');
   assert.match(await page.locator('#alignmentRemaining').innerText(),/2 remaining/);
   assert.equal(await page.locator('.alignment-folio').count(),2);
   assert.equal(await page.locator('.alignment-remaining').evaluate(node=>getComputedStyle(node,'::after').animationName),'alignment-sweep');
   assert.equal(await page.locator('#alignmentToast').isVisible(),false);
  }finally{release()}
  await page.locator('#alignmentToast').waitFor();
  assert.equal(await page.locator('#alignmentToastMessage').textContent(),'Alignment complete');
  assert.equal(await page.getByRole('progressbar').count(),0);
  await page.locator('#dismissAlignmentToast').click();

  await chooseExport(page,'#exportTei');
  await page.locator('#teiTitleLines summary').click();
  await page.locator('#titleLineOptions input').nth(0).check();
  await page.locator('#titleLineOptions input').nth(2).check();
  for(const genre of ['prose','poetry','drama']){
   if(genre!=='prose')await chooseExport(page,'#exportTei');
   await page.locator('#genre').selectOption(genre);
   const pending=page.waitForEvent('download',{timeout:4000});
   await page.locator('#confirmTeiExport').click();
   assert.equal(await page.locator('#teiExportError').textContent(),'');
   const xml=await readFile(await (await pending).path(),'utf8');
   assert.match(xml,/<div><head>Titolo<\/head>[\s\S]*Prima riga[\s\S]*<div><head>Secondo titolo<\/head>[\s\S]*Seconda riga/);
   assert.match(xml,genre==='prose'?/<p>Prima riga<\/p>/:genre==='poetry'?/<l>Prima riga<\/l>/:/<sp><p>Prima riga<\/p><\/sp>/);
  }
  const snapshot=await download(page,'#saveProject');
  assert.equal(JSON.parse(snapshot).state.titleLines.length,2);
  await reloadWithoutSession(page);
  await open(page,snapshot);
  const json=JSON.parse(await download(page,'#exportJson'));
  assert.equal(json.structure.titleLines.length,2);
  assert.match(await download(page,'#exportTei'),/<head>Titolo<\/head>/);
 }finally{await page.close()}
});

test('all witnesses and line-by-line share pair decisions and use each witness facsimile',async()=>{
 const page=await browser.newPage();
 try{
  await page.goto(url);
  await upload(page,'#fileA',['Prima riga di riferimento','Seconda riga di riferimento']);
  await page.locator('#addWitnessBtn').click();
  await upload(page,'#fileB',['Prima riga di confronto','Seconda riga di riferimento']);
  await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
  await page.locator('#addWitnessBtn').click();
  await upload(page,'#fileC',['Prima riga di verifica','Seconda riga di riferimento']);
  await page.waitForFunction(()=>Object.keys(pairResults).length===2&&pendingProjectOperations===0);
  const image={name:'page.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6D2sAAAAASUVORK5CYII=','base64')};
  for(const id of ['A','B','C'])await page.locator(`#images${id}`).setInputFiles(image);
  await page.waitForFunction(()=>pendingProjectOperations===0);

  await page.getByRole('button',{name:'All witnesses',exact:true}).click();
  const first=page.locator('.multi-row').first();
  assert.equal(await first.locator('.multi-reading').count(),3);
  assert.match(await first.innerText(),/riferimento[\s\S]*confronto[\s\S]*verifica/);
  assert.equal(await first.locator('.witness-reference[data-witness="A"]').count(),1);
  assert.equal(await first.locator('.witness-scroll .witness-card').count(),2);
  await page.setViewportSize({width:480,height:850});
  const scroll=await first.locator('.witness-board').evaluate(board=>{
   const area=board.querySelector('.witness-scroll'),reference=board.querySelector('.witness-reference');
   const before=reference.getBoundingClientRect().left;
   area.scrollLeft=area.scrollWidth;
   return {moved:area.scrollLeft>0,fixed:reference.getBoundingClientRect().left===before};
  });
  assert.deepEqual(scroll,{moved:true,fixed:true});
  await page.setViewportSize({width:1280,height:900});
  await first.locator('.multi-reading').nth(2).getByRole('button',{name:'Keep',exact:true}).first().click();
  assert.equal(await page.evaluate(()=>currentReview('C').decisions[0][0]),'keep');
  assert.deepEqual(await page.evaluate(()=>currentReview('B').decisions),{});

  await page.getByRole('button',{name:'Line by line',exact:true}).click();
  assert.equal(await page.locator('.multi-row').count(),1);
  await page.locator('[data-witness-facsimiles="C"]').scrollIntoViewIfNeeded();
  await page.locator('.witness-facsimiles figure').nth(2).waitFor();
  assert.equal(await page.locator('.witness-facsimiles img.line-crop').count(),3);
  await page.locator('.witness-card[data-witness="A"] .facsimile-open').click();
  const overlay=page.locator('#facsimileDialog svg');
  await overlay.waitFor();
  assert.equal(await overlay.getAttribute('viewBox'),'0 0 1000 1000');
  assert.equal(await overlay.locator('polygon').getAttribute('points'),'10,0 510,0 510,20 10,20');
  assert.equal(await overlay.locator('feFlood').getAttribute('flood-color'),'#cb152c');
  assert.deepEqual(await overlay.locator('feMorphology').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('radius'))),['3','5']);
  const pixels=await overlay.evaluate(async node=>{
   const svg=node.cloneNode(true);
   svg.setAttribute('width','1000');
   svg.setAttribute('height','1000');
   const image=new Image();
   image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));
   await image.decode();
   const canvas=document.createElement('canvas');
   canvas.width=canvas.height=1000;
   const context=canvas.getContext('2d');
   context.drawImage(image,0,0);
   return [6,10].map(x=>Array.from(context.getImageData(x,10,1,1).data));
  });
  assert.ok(pixels[0][0]>=195&&pixels[0][1]<35&&pixels[0][2]<60&&pixels[0][3]===255);
  assert.deepEqual(pixels[1],[0,0,0,0]);
  assert.deepEqual(await page.evaluate(()=>altoLineOutline({polygon:'2 3 5 3 4 6',coords:'1,1,8,8'})),[[2,3],[5,3],[4,6]]);
  await page.locator('#closeFacsimile').click();
  await page.getByRole('button',{name:'Next line',exact:true}).click();
  assert.match(await page.locator('.focus-nav').innerText(),/Line 2 of 2/);
  await page.getByRole('button',{name:'Previous line',exact:true}).click();
  await page.locator('.multi-reading').nth(1).getByRole('button',{name:'Edit text',exact:true}).click();
  assert.equal(await page.locator('#focusEditor #editB').count(),1);
  assert.equal(await page.locator('#modal #editB').count(),0);
  await page.locator('[data-witness-facsimiles="A"]').scrollIntoViewIfNeeded();
  await page.locator('.witness-facsimiles img.line-crop').first().waitFor();
  await page.locator('#editB').fill('Prima riga corretta');
  await page.locator('#saveEditBtn').click();
  assert.match(await page.locator('.multi-reading').nth(1).innerText(),/corretta/);
  await page.getByRole('button',{name:'Next line',exact:true}).click();
  await page.reload();
  await page.evaluate(()=>sessionReady);
  assert.equal(await page.locator('[data-witness-view="focus"]').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('.focus-nav').innerText(),/Line 2 of 2/);
  await page.locator('[data-witness-facsimiles="C"]').scrollIntoViewIfNeeded();
  await page.locator('.witness-facsimiles img.line-crop').nth(2).waitFor();
  await page.getByRole('button',{name:'Previous line',exact:true}).click();
  assert.match(await page.locator('.multi-reading').nth(1).innerText(),/corretta/);
  assert.equal(await page.evaluate(()=>currentReview('C').decisions[0][0]),'keep');
  await page.getByRole('button',{name:'Pair',exact:true}).click();
  assert.match(await page.locator('#unit-0').innerText(),/corretta/);
 }finally{await page.close()}
});

test('alignment streams actual stages and preserves the JSON endpoint',async()=>{
 const page=await browser.newPage();
 try{
  const data={sentences:{A:[{text:'testo di riferimento',refs:[]}],B:[{text:'testo di confronto',refs:[]}]}};
  const headers={accept:'application/x-ndjson'};
  const streamed=await page.request.post(url+'/api/align',{headers,data});
  const events=(await streamed.text()).trim().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(events.slice(0,-1),[{completed:1},{completed:2}]);
  const json=await page.request.post(url+'/api/align',{data});
  assert.deepEqual(events.at(-1).result,await json.json());
  const fast=await page.request.post(url+'/api/align',{headers,data:{...data,include_displacements:false}});
  const fastEvents=(await fast.text()).trim().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(fastEvents.slice(0,-1),[{completed:1}]);
  const baseline=events.at(-1).result,review=fastEvents.at(-1).result;
  assert.deepEqual(review.alignments,baseline.alignments);
  assert.deepEqual(review.witnesses,baseline.witnesses);
  assert.deepEqual(review.possible_transpositions,[]);
 }finally{await page.close()}
});

test('partial readings keep the full ALTO transcription and its word geometry in the facsimile',async()=>{
 const page=await browser.newPage();
 try{
  await page.goto(url);
  await upload(page,'#fileA',['testo scelto']);
  await page.locator('#addWitnessBtn').click();
  const xml='<alto><Layout><Page ID="p" WIDTH="100" HEIGHT="100"><TextBlock><TextLine ID="l" HPOS="1" VPOS="10" WIDTH="95" HEIGHT="20"><String CONTENT="prima" HPOS="1" VPOS="10" WIDTH="20" HEIGHT="20"/><String CONTENT="testo" HPOS="25" VPOS="10" WIDTH="20" HEIGHT="20"/><String CONTENT="scelto" HPOS="50" VPOS="10" WIDTH="20" HEIGHT="20"/><String CONTENT="dopo" HPOS="75" VPOS="10" WIDTH="20" HEIGHT="20"/></TextLine></TextBlock></Page></Layout></alto>';
  await page.locator('#fileB').setInputFiles({name:'page.xml',mimeType:'text/xml',buffer:Buffer.from(xml)});
  await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
  await page.getByRole('button',{name:'All witnesses',exact:true}).click();
  await page.locator('.witness-card[data-witness="B"] .witness-facsimiles').nth(1).scrollIntoViewIfNeeded();
  const facsimiles=page.locator('.witness-card[data-witness="B"] .witness-facsimiles').nth(1);
  await facsimiles.getByText('No image associated.',{exact:true}).waitFor();
  assert.equal(await facsimiles.locator('.facsimile-transcription').count(),0);
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6D2sAAAAASUVORK5CYII=';
  await page.locator('#imagesB').setInputFiles({name:'page.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.waitForFunction(()=>pendingProjectOperations===0&&images.B.length===1);
  await facsimiles.scrollIntoViewIfNeeded();
  const selected=page.locator('.witness-card[data-witness="B"]').filter({has:page.locator('mark.facsimile-selected',{hasText:'testo'})});
  await selected.locator('.facsimile-context').first().waitFor();
  assert.deepEqual(await selected.locator('.facsimile-context').allTextContents(),['prima','dopo']);
  const areas=await page.evaluate(()=>{
   const source=pairResults.B.B[0].refs[0];
   const lines=witnessSourceLines([{text:'testo scelto',refs:[source]}],new Map([[VariansExport.sourceLineKey(source),source]]));
   return facsimileAreas(lines[0]);
  });
  assert.deepEqual(areas,[[[25,10],[45,10],[45,30],[25,30]],[[50,10],[70,10],[70,30],[50,30]]]);
 }finally{await page.close()}
});

test('a multi-line reading has one crop and the full transcription of both source lines',async()=>{
 const page=await browser.newPage();
 try{
  await page.goto(url);
  await upload(page,'#fileA',['Destinata già alla duchessa quale']);
  await page.locator('#addWitnessBtn').click();
  await upload(page,'#fileB',['Destinata già alla duchessa','quale scrive al poeta']);
  await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
  const png=await page.evaluate(()=>{
   const canvas=document.createElement('canvas');
   canvas.width=canvas.height=1000;
   return canvas.toDataURL().split(',')[1];
  });
  await page.locator('#imagesB').setInputFiles({name:'page.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.getByRole('button',{name:'Line by line',exact:true}).click();
  const card=page.locator('.witness-card[data-witness="B"]');
  await card.locator('img.line-crop').waitFor();
  assert.equal(await card.locator('.witness-facsimiles figure').count(),1);
  assert.match(await card.locator('.facsimile-transcription').innerText(),/Destinata già alla duchessa\nquale scrive al poeta/);
  assert.deepEqual(await card.locator('.facsimile-context').allTextContents(),['scrive','al','poeta']);
  await card.locator('.facsimile-open').click();
  assert.equal(await page.locator('#facsimileDialog svg polygon').count(),2);
 }finally{await page.close()}
});

test('Tordi 386 keeps interior additions next to their pair segments in both multi-witness views',async()=>{
 const page=await browser.newPage();
 try{
  await page.goto(url);
  // Use genuine lexical output without waiting on displaced-passage suggestions.
  const {execFileSync}=require('node:child_process');
  const fixture=JSON.parse(execFileSync('python3',['-B','-c',`
import json, sys
from pathlib import Path
sys.path.insert(0, 'backend')
import app
def load(name):
    return app.parse_alto_bundle([{'name': p.name, 'text': p.read_text()} for p in sorted(Path('samples', name).glob('*.xml'))])
a, b = load('Malmantile_II.IV.232'), load('Malmantile_Tordi.386')
print(json.dumps({'witnesses': {'A': a, 'B': b}, 'alignments': app.align_alto_words(a, b),
                  'alignment_method': 'word-level Levenshtein', 'possible_transpositions': [], 'frequent_ambiguous_cases': []}))
`],{cwd:path.join(__dirname,'..'),maxBuffer:16*1024*1024}));
  await page.route('**/api/align',route=>route.fulfill({json:fixture}));
  const sample=path.join(__dirname,'../samples');
  await page.locator('#fileA').setInputFiles(['143223','143230','143236'].map(number=>path.join(sample,'Malmantile_II.IV.232',`IMG_20250905_${number}.xml`)));
  await page.waitForFunction(()=>rawByWitness.A.length===3&&pendingProjectOperations===0);
  await page.locator('#addWitnessBtn').click();
  await page.locator('#fileB').setInputFiles(['102224','104622','104628','104633'].map(number=>path.join(sample,'Malmantile_Tordi.386',`IMG_20250905_${number}.xml`)));
  await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
  const pairCount=await page.locator('#totalBadge').textContent();
  await page.getByRole('button',{name:'All witnesses',exact:true}).click();
  assert.equal(await page.locator('#totalBadge').textContent(),pairCount);
  const spelling=await page.evaluate(()=>{
   const group=groups.find(g=>(g.aItems||[]).some(item=>item.text.includes('ch’iononneso')||item.text.includes("ch'iononneso")));
   const left=groupText(A,group,'A'),right=groupText(B,group,'B');
   return {left,right,differences:compareUnit(left,right,group.spacing_matches).diff};
  });
  assert.match(spelling.right,/ch'i non ne sò/);
  assert.match(spelling.right,/Ia vendo/);
  assert.deepEqual(spelling.differences,[]);

  const row=page.locator('.multi-row').filter({has:page.locator('.witness-reference',{hasText:'faceva istanza al Poeta della presente Composizione'})});
  const fragments=row.locator('.witness-card[data-witness="B"] [data-pair-unit]');
  assert.equal(await fragments.count(),5);
  const card=row.locator('.witness-card[data-witness="B"]');
  const reading=card.locator('.multi-reading > .textline');
  assert.equal(await reading.count(),1);
  assert.match(await reading.innerText(),/Autore al ser:mo Principe Leopoldo di Foscana in occasioni di mandargli il presente Poema/);
  assert.equal(await fragments.first().isVisible(),false);
  await card.locator('.witness-review-details summary').click();
  assert.equal(await reading.locator('.token.var',{hasText:'Autore'}).count(),1);
  assert.equal(await reading.locator('.token.var',{hasText:'Foscana'}).count(),1);
  const keep=fragments.nth(0).locator('.variant-item').filter({hasText:'Autore'}).getByRole('button',{name:'Keep',exact:true});
  await keep.scrollIntoViewIfNeeded();
  const beforeKeep=await row.evaluate(node=>node.getBoundingClientRect().top);
  await keep.click();
  assert.ok(Math.abs(await row.evaluate(node=>node.getBoundingClientRect().top)-beforeKeep)<=1);
  assert.equal(await reading.locator('.token.keep',{hasText:'Autore'}).count(),1);
  const ignore=fragments.nth(2).locator('.variant-item').filter({hasText:'Foscana'}).getByRole('button',{name:'Ignore',exact:true});
  await ignore.scrollIntoViewIfNeeded();
  const beforeIgnore=await row.evaluate(node=>node.getBoundingClientRect().top);
  await ignore.click();
  assert.ok(Math.abs(await row.evaluate(node=>node.getBoundingClientRect().top)-beforeIgnore)<=1);
  assert.equal(await reading.locator('.token.ignore',{hasText:'Foscana'}).count(),1);
  const retained=await page.evaluate(()=>[...new DOMParser().parseFromString(buildTEI(),'application/xml').getElementsByTagName('rdg')].map(node=>node.textContent));
  assert.ok(retained.some(text=>text.includes('Autore')));
  assert.ok(retained.every(text=>!text.includes('Foscana')));
  assert.equal(await card.locator('.review-completed').count(),0);
  const remaining=card.locator('.variant-item').filter({hasNot:page.locator('.chosen')});
  const remainingCount=await remaining.count();
  for(let i=0;i<remainingCount;i++){
   await remaining.first().getByRole('button',{name:'Ignore',exact:true}).click();
  }
  assert.match(await card.locator('.review-completed').innerText(),/Revision completed/);
  const unit=await fragments.nth(1).getAttribute('data-pair-unit');
  await fragments.nth(1).locator('.pair-unit-link').click();
  const pair=page.locator(`#unit-${Number(unit)-1}`);
  assert.match(await pair.innerText(),/Principe Leopoldo/);
  await page.getByRole('button',{name:'Line by line',exact:true}).click();
  assert.equal(await page.locator('#totalBadge').textContent(),pairCount);
  await page.evaluate(index=>goToUnit(index),Number(unit)-1);
  assert.deepEqual(await page.locator('.witness-card[data-witness="B"] [data-pair-unit]').evaluateAll(nodes=>nodes.map(node=>node.dataset.pairUnit)),
   [Number(unit)-1,Number(unit),Number(unit)+1,Number(unit)+2,Number(unit)+3].map(String));
  const additionExport=await page.evaluate(()=>buildJSONExport().units.find(unit=>
   Object.values(unit.readings).some(reading=>reading.segments.some(segment=>segment.text.includes('Principe Leopoldo')))));
  assert.equal(additionExport.type,'addition');
  await page.evaluate(()=>{
   addWitness();
   pairResults.C=structuredClone(pairResults.B);
   const addition=pairResults.C.alignments.find(group=>!group.aItems.length&&group.bItems.length);
   pairResults.C.alignments=[{...addition,bItems:[{text:'Solo nel terzo testimone',refs:[]}]}];
   setWitnessView('pair');
  });
  const pairLabels=await page.locator('.pair-shared-unit').evaluateAll(rows=>rows.map(row=>Number(row.dataset.sharedUnit)));
  const pairTotal=await page.locator('#totalBadge').textContent();
  await page.getByRole('button',{name:'All witnesses',exact:true}).click();
  const other=page.locator('.multi-row').filter({hasText:'Solo nel terzo testimone'});
  assert.equal(await other.count(),1);
  const otherLabel=Number((await other.getAttribute('id')).split('-').at(-1))+1;
  assert.ok(!pairLabels.includes(otherLabel));
  assert.match(pairTotal,new RegExp(`^${pairLabels.length} / ${await page.locator('.multi-row').count()}`));

 }finally{await page.close()}
});

test('multi-witness grouping keeps an addition between its neighboring ALTO readings',async()=>{
 const page=await browser.newPage();
 try{
  await page.goto(url);
  const makeUnit=(text,line)=>({text,refs:[{alto_file:'page.xml',page:'p',line,line_text:text}]});
  const a=[makeUnit('prima riga','a1'),makeUnit('seconda riga','a2')];
  const b=[makeUnit('prima riga','b1'),makeUnit('aggiunta intermedia','b2'),makeUnit('seconda riga','b3')];
  await page.evaluate(({a,b})=>{
   addWitness();addWitness();
   const row=(aItems,bItems,a0,a1)=>({a0,a1,b0:0,b1:0,aItems,bItems,similarity:1});
   const pair=(B,alignments)=>({A:a,B,alignments,possible_transpositions:[],frequent_ambiguous_cases:[],alignment_method:'word-level Levenshtein'});
   pairResults.B=pair(b,[row([a[0]],[b[0]],0,1),row([],[b[1]],1,1),row([a[1]],[b[2]],1,2)]);
   pairResults.C=pair(a,[row(a,a,0,2)]);
   activatePair('B',false);
   setWitnessView('all');
  },{a,b});
  const readings=page.locator('.witness-card[data-witness="B"] .multi-reading > .textline:not(.segment-reference)');
  assert.deepEqual(await readings.allTextContents(),['prima riga aggiunta intermedia seconda riga']);
  assert.equal(await page.locator('.multi-row').count(),1);
 }finally{await page.close()}
});

test('the documentation button opens the guide in the selected language',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:780}});
 try{
  await page.goto(url);
  const button=page.getByRole('button',{name:'DOCUMENTATION',exact:true});
  for(const [language,title,section] of [
   ['en','User guide','Import and align witnesses'],
   ['fr','Guide utilisateur','Importer et aligner les témoins'],
   ['it','Guida utente','Importa e allinea i testimoni'],
  ]){
   await page.locator('#language').selectOption(language);
   await button.click();
   const guide=page.getByRole('dialog',{name:title});
   assert.equal(await guide.getByRole('heading',{name:new RegExp(section)}).count(),1);
   assert.equal(await guide.locator('[data-guide-language]:visible').count(),1);
   assert.equal(await guide.locator('[data-guide-language]:visible').getAttribute('lang'),language);
   await page.keyboard.press('Escape');
   assert.equal(await guide.isVisible(),false);
  }
  assert.equal(await page.locator('#language').inputValue(),'it');
 }finally{await page.close()}
});

test('removing a witness preserves the other comparison and survives reload',async()=>{
 const page=await browser.newPage();
 try{
  await page.goto(url);
  await upload(page,'#fileA',['alfa prima lezione','beta seconda lezione']);
  await page.locator('#addWitnessBtn').click();
  await upload(page,'#fileB',['alfa prima variante','beta seconda lezione']);
  await page.waitForFunction(()=>Object.keys(pairResults).length===1&&pendingProjectOperations===0);
  await page.locator('#addWitnessBtn').click();
  await upload(page,'#fileC',['alfa altra lettura','beta seconda lezione']);
  await page.waitForFunction(()=>Object.keys(pairResults).length===2&&pendingProjectOperations===0);
  await page.evaluate(()=>{activatePair('C');setAll(0,'keep');activatePair('B')});
  const survivor=await page.evaluate(()=>structuredClone({comparison:pairResults.C,review:pairReviews.C}));
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-remove-witness="B"]').click();
  assert.deepEqual(await page.evaluate(()=>({ids:witnessIds,active:activeWitness,comparison:pairResults.C,review:currentReview('C')})),
   {ids:['A','C'],active:'C',...survivor});
  assert.equal(await page.locator('#fileC').evaluate(input=>input.files.length),1);
  await page.reload();
  await page.evaluate(()=>sessionReady);
  assert.deepEqual(await page.evaluate(()=>({ids:witnessIds,comparison:pairResults.C,review:currentReview('C')})),
   {ids:['A','C'],...survivor});
  await page.locator('#addWitnessBtn').click();
  assert.equal(await page.locator('#fileB').count(),1);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#removeReference').click();
  assert.deepEqual(await page.evaluate(()=>({ids:witnessIds,stored:rawByWitness.C.length,comparisons:Object.keys(pairResults),reference:rawByWitness.A.length})),
   {ids:['A','C','B'],stored:1,comparisons:[],reference:0});
 }finally{await page.close()}
});
