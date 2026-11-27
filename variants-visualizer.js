'use strict';

const TEI = 'http://www.tei-c.org/ns/1.0';
const XML = 'http://www.w3.org/XML/1998/namespace';
const byId = id => document.getElementById(id);
const content = byId('content');
const details = byId('details');
const witnessSelect = byId('wit');
const highlight = byId('showAll');
const sourceEditor = byId('tei-source');
const sourceHighlight = byId('tei-highlight');
const sourceError = byId('tei-error');
const downloadButton = byId('download-tei');
const swapButton = byId('swap-panels');
let previewTimer;
let sourceName;
let hovered = -1;
let focused = -1;
let highlightedRange;
let sourceMarkup;
let validation;
let edition;
let loci = [];
let active = -1;
let loadNumber = 0;

function element(tag, text, className) {
 const node = document.createElement(tag);
 if (text !== undefined) node.textContent = text;
 if (className) node.className = className;
 return node;
}

function parseTEI(source) {
 const doc = new DOMParser().parseFromString(source, 'application/xml');
 const error = [...doc.getElementsByTagNameNS('*', 'parsererror')].find(node =>
  ['http://www.mozilla.org/newlayout/xml/parsererror.xml', 'http://www.w3.org/1999/xhtml'].includes(node.namespaceURI));
 if (error) throw Error(error.querySelector('div')?.textContent.trim() || 'The XML is invalid.');
 const body = doc.getElementsByTagNameNS(TEI, 'body')[0];
 const witnesses = new Map([...doc.getElementsByTagNameNS(TEI, 'witness')]
  .map(node => [node.getAttributeNS(XML, 'id'), node.textContent.trim()]).filter(([id]) => id));
 if (!body || !witnesses.size) throw Error('The TEI must contain a text body and a witness list.');
 return {body, witnesses, source, ranges: sourceRanges(doc, source)};
}

const xmlMarkup = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE(?:[^"'[>]|"[^"]*"|'[^']*')*(?:\[(?:<!--[^]*?-->|<\?[^]*?\?>|"[^"]*"|'[^']*'|[^"'\]])*\]\s*)?>|<\/?[^\s<>/!?]+(?:[^"'<>]|"[^"]*"|'[^']*')*>/gu;

// DOMParser resolves namespaces but does not expose source offsets. Pair the
// parsed elements with the literal start tags, skipping XML comments and declarations.
function sourceRanges(doc, source) {
 const parsed = [...doc.getElementsByTagName('*')];
 const ranges = new WeakMap();
 const open = [];
 let index = 0;
 for (const match of source.matchAll(xmlMarkup)) {
  const tag = match[0];
  if (tag.startsWith('<!') || tag.startsWith('<?')) continue;
  const name = tag.match(/^<\/?([^\s/>]+)/u)[1];
  const end = match.index + tag.length;
  if (tag.startsWith('</')) {
   const entry = open.pop();
   if (entry?.node.nodeName !== name) return new WeakMap();
   ranges.set(entry.node, {start: entry.start, end});
  } else {
   const node = parsed[index++];
   if (node?.nodeName !== name || (open.at(-1)?.node || doc) !== node.parentNode) return new WeakMap();
   if (tag.endsWith('/>')) ranges.set(node, {start: match.index, end});
   else open.push({node, start: match.index});
  }
 }
 return index === parsed.length && open.length === 0 ? ranges : new WeakMap();
}

function syncSourceScroll() {
 sourceHighlight.style.transform = `translate(${-sourceEditor.scrollLeft}px, ${-sourceEditor.scrollTop}px)`;
}

function colorSource() {
 const source = sourceEditor.value;
 if (source === sourceMarkup) return;
 sourceMarkup = source;
 highlightedRange = undefined;
 CSS.highlights?.delete('tei-locus');
 const fragment = document.createDocumentFragment();
 let offset = 0;
 for (const match of source.matchAll(xmlMarkup)) {
  const markup = match[0];
  fragment.append(source.slice(offset, match.index));
  offset = match.index + markup.length;
  if (markup.startsWith('<!') || markup.startsWith('<?')) {
   fragment.append(element('span', markup, 'xml-comment'));
   continue;
  }
  const tag = /^<\/?[^\s/>]+/u.exec(markup)[0];
  const apparatus = /(?:^<\/?|:)(?:app|lem|rdg|rdgGrp)$/u.test(tag);
  fragment.append(element('span', tag, apparatus ? 'xml-apparatus' : 'xml-tag'));
  const attributes = markup.slice(tag.length);
  const parts = /([^\s=<>/]+)(\s*=\s*)("[^"]*"|'[^']*')/gu;
  let end = 0;
  for (const part of attributes.matchAll(parts)) {
   fragment.append(attributes.slice(end, part.index), element('span', part[1], 'xml-attribute'),
    part[2], element('span', part[3], 'xml-value'));
   end = part.index + part[0].length;
  }
  fragment.append(element('span', attributes.slice(end), 'xml-tag'));
 }
 fragment.append(source.slice(offset));
 sourceHighlight.replaceChildren(fragment);
}

function highlightSource(reveal = false) {
 const index = hovered >= 0 ? hovered : focused >= 0 ? focused : active;
 const range = edition?.source === sourceEditor.value ? loci[index]?.range : undefined;
 if (range !== highlightedRange?.offsets) {
  highlightedRange = undefined;
  CSS.highlights?.delete('tei-locus');
  if (range) {
   const selections = [];
   const walker = document.createTreeWalker(sourceHighlight, NodeFilter.SHOW_TEXT);
   let offset = 0;
   for (let node = walker.nextNode(); node && offset < range.end; node = walker.nextNode()) {
    const start = Math.max(0, range.start - offset);
    const end = Math.min(node.length, range.end - offset);
    for (const match of node.data.slice(start, end).matchAll(/\S+/gu)) {
     const selection = document.createRange();
     selection.setStart(node, start + match.index);
     selection.setEnd(node, start + match.index + match[0].length);
     selections.push(selection);
    }
    offset += node.length;
   }
   if (CSS.highlights) {
    const painted = new Highlight();
    for (const selection of selections) painted.add(selection);
    CSS.highlights.set('tei-locus', painted);
   }
   highlightedRange = {offsets: range, first: selections[0]};
  }
 }
 if (range && reveal) {
  const before = edition.source.slice(0, range.start);
  const lineHeight = Number.parseFloat(getComputedStyle(sourceEditor).lineHeight);
  const top = (before.split('\n').length - 1) * lineHeight;
  const height = (edition.source.slice(range.start, range.end).split('\n').length) * lineHeight;
  const bottom = top + Math.min(height, sourceEditor.clientHeight / 2) + 12;
  if (top < sourceEditor.scrollTop || bottom > sourceEditor.scrollTop + sourceEditor.clientHeight) {
   sourceEditor.scrollTop = Math.max(0, top - sourceEditor.clientHeight / 3);
  }
  syncSourceScroll();
  const marker = highlightedRange.first?.getClientRects()[0];
  const viewport = sourceEditor.getBoundingClientRect();
  if (marker && (marker.left < viewport.left || marker.left + 24 > viewport.left + sourceEditor.clientWidth)) {
   sourceEditor.scrollLeft += marker.left - viewport.left - 12;
  }
 }
 syncSourceScroll();
}

function parseJSON(source) {
 const data = JSON.parse(source);
 const object = value => value && typeof value === 'object' && !Array.isArray(value);
 const text = value => typeof value === 'string';
 const optionalText = value => value == null || text(value);
 const references = value => value === undefined || (Array.isArray(value) && value.every(ref =>
  object(ref) && text(ref.line) && optionalText(ref.alto_file) && optionalText(ref.page)));
 if (data?.format !== 'varians-collation' || data.version !== 1 ||
     !text(data.reference?.id) || !optionalText(data.reference.name) ||
     !object(data.witnesses) || !Array.isArray(data.units)) {
  throw Error('Choose a Varians collation JSON from Export → JSON.');
 }
 const witnesses = new Map([[data.reference.id, data.reference.name]]);
 for (const [id, name] of Object.entries(data.witnesses)) {
  if (!text(name) || witnesses.has(id)) throw Error('The JSON witness list is invalid.');
  witnesses.set(id, name);
 }
 if (!references(data.structure?.titleLines)) throw Error('The JSON title lines are invalid.');
 for (const [index, unit] of data.units.entries()) {
  if (!object(unit?.reference) || !text(unit.reference.text) || !references(unit.reference.sources) ||
      !object(unit.readings) || !Array.isArray(unit.variants) ||
      !Object.entries(unit.readings).every(([id, item]) => witnesses.has(id) && object(item) &&
       Array.isArray(item.segments) && item.segments.every(segment => text(segment?.text))) ||
      !unit.variants.every(variant => witnesses.has(variant?.witness) &&
       optionalText(variant.reference) && optionalText(variant.reading) &&
       ['retained', 'dismissed', 'pending'].includes(variant.status))) {
   throw Error(`The JSON readings or variants in unit ${index + 1} are invalid.`);
  }
 }
 return {data, witnesses};
}

function addLocus(base, reading, entries, id = '', range) {
 const index = loci.length;
 const wrapper = element('span');
 const button = element('button', undefined, 'apparatus');
 const plain = element('span', undefined, 'plain-reading');
 button.type = 'button';
 button.setAttribute('aria-controls', 'details');
 button.addEventListener('click', () => showDetails(active === index ? -1 : index));
 if (range) {
  button.addEventListener('pointerenter', () => { hovered = index; highlightSource(true); });
  button.addEventListener('pointerleave', () => { hovered = -1; highlightSource(); });
  button.addEventListener('focus', () => { focused = index; highlightSource(true); });
  button.addEventListener('blur', () => { focused = -1; highlightSource(); });
 }
 wrapper.append(button, plain);
 loci.push({button, plain, base, reading, entries, id, range});
 return wrapper;
}

const witnessIds = node => (node.getAttribute('wit') || '').trim().split(/\s+/)
 .filter(Boolean).map(id => id.replace(/^#/, ''));

function renderTEI(node, ranges) {
 if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
  return document.createTextNode(node.nodeValue);
 }
 const children = document.createDocumentFragment();
 if (node.nodeType !== Node.ELEMENT_NODE) return children;
 if (node.namespaceURI === TEI && node.localName === 'app') {
  const lemma = [...node.children].find(child => child.namespaceURI === TEI && child.localName === 'lem');
  const base = lemma?.textContent.trim() || '';
  const entries = [...node.getElementsByTagNameNS(TEI, 'rdg')].map(reading => ({
   label: 'Variant', witnesses: witnessIds(reading), text: reading.textContent.trim()
  }));
  if (lemma) entries.unshift({label: 'Base reading', witnesses: witnessIds(lemma), text: base});
  return addLocus(base, witness => entries.find(entry => entry.witnesses.includes(witness))?.text ?? base,
   entries, node.getAttributeNS(XML, 'id'), ranges.get(node));
 }
 for (const child of node.childNodes) children.append(renderTEI(child, ranges));
 const tags = {div: ['section', 'section'], head: ['h2'], p: ['p'], lg: ['div', 'poem'],
  l: ['div', 'verse'], sp: ['section', 'speech'], speaker: ['strong'], lb: ['br']};
 const tag = node.namespaceURI === TEI && Object.hasOwn(tags, node.localName) && tags[node.localName];
 if (!tag) return children;
 const block = element(tag[0], undefined, tag[1]);
 if (tag[0] !== 'br') block.append(children);
 return block;
}

const sourceKey = ref => JSON.stringify([ref.alto_file || '', ref.page || '', ref.line]);
const reviewLabels = {retained: 'Retained', dismissed: 'Ignored', pending: 'Pending'};

function renderJSON(data) {
 const fragment = document.createDocumentFragment();
 const titles = new Set((data.structure?.titleLines || []).map(sourceKey));
 let heading = null;
 for (const unit of data.units) {
  const base = unit.reference?.text || '';
  const variants = unit.variants || [];
  const readings = unit.readings || {};
  const reading = witness => {
   if (!witness || witness === data.reference.id) return base;
   const item = Object.hasOwn(readings, witness) ? readings[witness] : null;
   if (!item || item.status === 'unaligned') return unit.type === 'addition' ? '' : '[Unaligned]';
   return item.segments.map(segment => segment.text).filter(Boolean).join(' ');
  };
  const isTitle = (unit.reference?.sources || []).some(ref => titles.has(sourceKey(ref)));
  if (isTitle && !heading) {
   heading = element('h2');
   fragment.append(heading);
  } else if (isTitle) {
   heading.append(' ');
  } else {
   heading = null;
  }
  const genre = unit.structure?.genres?.[0];
  const row = heading || element(genre === 'poetry' ? 'div' : 'p', undefined, genre === 'poetry' ? 'verse' : '');
  if (variants.length) {
   const entries = [{label: 'Reference unit', witnesses: [data.reference.id], text: base}];
   for (const variant of variants) {
    entries.push({label: reviewLabels[variant.status] || 'Variant', witnesses: [variant.witness],
     text: variant.reading, reference: variant.reference, comparison: true});
   }
   row.append(addLocus(base, reading, entries));
  } else {
   const node = element('span', base);
   node.updateReading = reading;
   node.className = 'unit-reading';
   row.append(node);
  }
  if (!heading) fragment.append(row);
 }
 return fragment;
}

function stemmaEvidence() {
 const witnesses = [...edition.witnesses.keys()];
 if (!edition.data) {
  return loci.flatMap(locus => {
   const attested = new Map();
   for (const entry of locus.entries) {
    for (const id of entry.witnesses) {
     if (!attested.has(id)) attested.set(id, new Set());
     attested.get(id).add(entry.text);
    }
   }
   if (!witnesses.every(id => attested.get(id)?.size === 1)) return [];
   return [witnesses.map(id => [...attested.get(id)][0])];
  });
 }
 const {reference, units} = edition.data;
 return units.flatMap(unit => {
  const variants = unit.variants || [];
  if (!variants.some(variant => variant.status === 'retained') ||
      variants.some(variant => !['retained', 'dismissed'].includes(variant.status))) return [];
  if (!witnesses.every(id => id === reference.id ||
      (Object.hasOwn(unit.readings || {}, id) && ['aligned', 'omission', 'addition'].includes(unit.readings[id]?.status) &&
       unit.readings[id].segments?.every(segment => segment.status !== 'unaligned')))) return [];
  return [witnesses.map(id => JSON.stringify(variants
   .filter(variant => variant.witness === id && variant.status === 'retained')
   .map(({reference, reading}) => [reference, reading])))];
 });
}

function clusterWitnesses(witnesses, evidence) {
 const distances = witnesses.map((_, i) => witnesses.map((_, j) =>
  evidence.reduce((sum, row) => sum + Number(row[i] !== row[j]), 0)));
 const clusters = witnesses.map((id, i) => ({id, members: [i]}));
 while (clusters.length > 2) {
  let best = Infinity;
  let matches = [];
  for (let i = 0; i < clusters.length; i++) {
   for (let j = i + 1; j < clusters.length; j++) {
    const left = clusters[i].members, right = clusters[j].members;
    const distance = left.reduce((sum, a) => sum + right.reduce((n, b) => n + distances[a][b], 0), 0) /
     (left.length * right.length);
    if (distance < best) { best = distance; matches = []; }
    if (distance === best) matches.push([i, j]);
   }
  }
  // Leave overlapping ties unresolved instead of picking a grouping by witness order.
  if (new Set(matches.flat()).size !== matches.length * 2) break;
  const partners = new Map(matches);
  const used = new Set(matches.map(([, j]) => j));
  const merged = clusters.flatMap((cluster, i) => {
   if (used.has(i)) return [];
   if (!partners.has(i)) return [cluster];
   const other = clusters[partners.get(i)];
   return [{children: [cluster, other], members: [...cluster.members, ...other.members]}];
  });
  clusters.splice(0, clusters.length, ...merged);
 }
 return clusters;
}

function stemmaBranches(nodes) {
 const list = element('ul', undefined, 'stemma-branches');
 for (const node of nodes) {
  const item = element('li');
  if (node.children) {
   item.append(stemmaBranches(node.children));
  } else {
   const button = element('button', edition.witnesses.get(node.id) || node.id, 'btn');
   button.type = 'button';
   button.dataset.witness = node.id;
   button.onclick = () => {
    witnessSelect.selectedIndex = [...witnessSelect.options].findIndex(option => option.dataset.witness === node.id);
    refresh();
   };
   item.append(button);
  }
  list.append(item);
 }
 return list;
}

function renderStemma() {
 const witnesses = [...edition.witnesses.keys()];
 const evidence = stemmaEvidence().filter(row => new Set(row).size > 1);
 const tree = byId('stemma-tree');
 tree.replaceChildren();
 byId('stemma').hidden = false;
 byId('stemma-method').textContent = edition.data
  ? 'JSON compares ordered profiles of retained variants per fully aligned, reviewed unit. Ignored variants are excluded.'
  : 'TEI compares the readings explicitly attributed to every witness at each variable apparatus entry. Unattested or ambiguous entries are excluded.';
 if (witnesses.length < 3 || !evidence.length) {
  byId('stemma-summary').textContent = 'At least three witnesses and one fully comparable variable passage are needed.';
  return;
 }
 const unit = edition.data ? 'unit' : 'apparatus entry';
 byId('stemma-summary').textContent = `${witnesses.length} witnesses · ${evidence.length} comparable ${evidence.length === 1 ? unit : edition.data ? 'units' : 'apparatus entries'}`;
 tree.append(stemmaBranches(clusterWitnesses(witnesses, evidence)));
}

function showDetails(index) {
 active = index;
 details.hidden = index < 0;
 details.replaceChildren();
 loci.forEach(({button}, i) => button.setAttribute('aria-expanded', String(i === index)));
 highlightSource(index >= 0);
 if (index < 0) return;
 const locus = loci[index];
 if (locus.id) details.append(element('strong', locus.id));
 for (const entry of locus.entries) {
  const names = entry.witnesses.map(id => edition.witnesses.get(id) || id).join(', ');
  const row = element('div');
  row.append(element('b', names ? `${entry.label} · ${names}` : entry.label), ' ');
  if (entry.comparison) row.append(`${entry.reference || '∅'} → `);
  row.append(entry.text || '∅');
  details.append(row);
 }
 locus.button.closest('p, h2, .verse, .speech')?.after(details);
}

function refresh() {
 hovered = focused = -1;
 const witness = witnessSelect.selectedOptions[0]?.dataset.witness;
 for (const button of byId('stemma-tree').querySelectorAll('button')) {
  button.setAttribute('aria-pressed', String(button.dataset.witness === witness));
 }
 for (const locus of loci) {
  const text = witness ? locus.reading(witness) : locus.base;
  locus.button.textContent = text || '∅';
  locus.plain.textContent = text;
  locus.button.hidden = !highlight.checked;
  locus.plain.hidden = highlight.checked;
 }
 for (const node of content.querySelectorAll('.unit-reading')) node.textContent = node.updateReading(witness);
 for (const id of ['prev', 'next']) byId(id).disabled = !highlight.checked || !loci.length;
 byId('counter').textContent = `${loci.length} ${edition.data ? 'units with variants' : 'apparatus entries'}`;
 showDetails(-1);
}

function step(direction) {
 if (!loci.length || !highlight.checked) return;
 const index = active < 0 ? (direction > 0 ? 0 : loci.length - 1) : (active + direction + loci.length) % loci.length;
 showDetails(index);
 loci[index].button.focus({preventScroll: true});
 loci[index].button.scrollIntoView({block: 'center'});
}

byId('back-to-workspace').addEventListener('click', event => {
 if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
 const workspace = window.opener;
 try {
  if (!workspace || workspace.closed || workspace.location.origin !== location.origin ||
      workspace.location.pathname !== '/') return;
  event.preventDefault();
  workspace.focus();
  window.close();
 } catch {
  // A standalone viewer or an opener on another site uses the ordinary link.
 }
});

byId('prev').onclick = () => step(-1);
byId('next').onclick = () => step(1);
witnessSelect.onchange = highlight.onchange = refresh;
function displayEdition(next, preserveView = false) {
 const previousLoci = loci;
 const witness = preserveView ? witnessSelect.selectedOptions[0]?.dataset.witness : undefined;
 const previousActiveId = preserveView ? loci[active]?.id : undefined;
 const scrollTop = preserveView ? content.scrollTop : 0;
 let rendered;
 loci = [];
 try {
  rendered = next.data ? renderJSON(next.data) : renderTEI(next.body, next.ranges);
 } catch (error) {
  loci = previousLoci;
  throw error;
 }
 edition = next;
 witnessSelect.replaceChildren(element('option', 'Compare all witnesses'));
 for (const [id, name] of edition.witnesses) {
  const option = element('option', name || id);
  option.dataset.witness = id;
  witnessSelect.append(option);
  if (id === witness) option.selected = true;
 }
 content.after(details);
 content.replaceChildren(rendered);
 content.hidden = byId('toolbar').hidden = false;
 witnessSelect.disabled = highlight.disabled = false;
 byId('tei-panel').hidden = swapButton.hidden = Boolean(next.data);
 byId('status').textContent = next.data ? 'JSON collation · review decisions are shown in the variant details.' : 'TEI edition';
 renderStemma();
 refresh();
 if (previousActiveId && highlight.checked) showDetails(loci.findIndex(locus => locus.id === previousActiveId));
 content.scrollTop = scrollTop;
 if (!preserveView) sourceEditor.scrollTo(0, 0);
}

function showSourceError(message = '') {
 sourceError.textContent = message;
 sourceError.hidden = !message;
 sourceEditor.setAttribute('aria-invalid', String(Boolean(message)));
 downloadButton.disabled = Boolean(message);
}

function cancelValidation() {
 clearTimeout(previewTimer);
 validation?.abort();
}

async function validateSource({original = false} = {}) {
 validation?.abort();
 const request = new AbortController();
 validation = request;
 const source = sourceEditor.value;
 try {
  const next = parseTEI(source);
  // The uploaded edition remains readable while its source is checked.
  if (original) displayEdition(next);
  const response = await fetch('/api/validate-tei', {
   method: 'POST', body: source, signal: request.signal,
  });
  if (response.status !== 200 && response.status !== 422 && response.status !== 503) {
   throw Error('TEI validation is unavailable. Open the viewer through the Varians backend.');
  }
  const {error} = await response.json();
  if (!response.ok || error) throw Error(error || 'TEI validation failed.');
  if (request.signal.aborted) return;
  if (!original) displayEdition(next, Boolean(edition));
  showSourceError();
 } catch (error) {
  if (request.signal.aborted) return;
  showSourceError(error instanceof TypeError ? 'Could not contact the TEI validator.' : error.message);
 }
}

sourceEditor.addEventListener('scroll', syncSourceScroll);
sourceEditor.addEventListener('input', () => {
 cancelValidation();
 downloadButton.disabled = true;
 colorSource();
 highlightSource();
 previewTimer = setTimeout(validateSource, 300);
});

downloadButton.onclick = () => {
 const url = URL.createObjectURL(new Blob([sourceEditor.value], {type: 'application/tei+xml;charset=utf-8'}));
 const link = element('a');
 link.href = url;
 link.download = sourceName;
 link.click();
 setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function setSourceFirst(sourceFirst) {
 byId('reading-panels').classList.toggle('source-first', sourceFirst);
 swapButton.setAttribute('aria-pressed', String(sourceFirst));
}

try {
 setSourceFirst(localStorage.getItem('variants-tei-source-first') === 'true');
} catch {
 // The layout can still be switched when browser storage is unavailable.
}

swapButton.onclick = () => {
 const sourceFirst = swapButton.getAttribute('aria-pressed') !== 'true';
 setSourceFirst(sourceFirst);
 try {
  localStorage.setItem('variants-tei-source-first', String(sourceFirst));
 } catch {
  // Keep the current layout for this page.
 }
};

byId('export-file').onchange = async event => {
 const file = event.target.files[0];
 if (!file) return;
 const load = ++loadNumber;
 try {
  const source = (await file.text()).replace(/\r\n?/g, '\n');
  if (load !== loadNumber) return;
  const isTEI = source.trimStart().startsWith('<') || /\.(tei|xml)$/i.test(file.name);
  if (!isTEI) {
   const next = parseJSON(source);
   cancelValidation();
   displayEdition(next);
   sourceEditor.value = '';
   colorSource();
   return;
  }
  cancelValidation();
  edition = undefined;
  loci = [];
  hovered = focused = active = -1;
  content.after(details);
  content.replaceChildren();
  content.hidden = details.hidden = byId('stemma').hidden = true;
  byId('toolbar').hidden = swapButton.hidden = byId('tei-panel').hidden = false;
  for (const id of ['prev', 'next', 'wit', 'showAll']) byId(id).disabled = true;
  byId('counter').textContent = '';
  byId('status').textContent = 'TEI edition';
  sourceEditor.value = source;
  sourceEditor.scrollTo(0, 0);
  sourceName = file.name;
  colorSource();
  showSourceError();
  downloadButton.disabled = true;
  await validateSource({original: true});
 } catch (error) {
  if (load !== loadNumber) return;
  byId('status').textContent = error instanceof SyntaxError ? 'The JSON file is invalid.' : error.message;
 }
};
