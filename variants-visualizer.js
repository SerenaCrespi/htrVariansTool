'use strict';

const TEI = 'http://www.tei-c.org/ns/1.0';
const XML = 'http://www.w3.org/XML/1998/namespace';
const byId = id => document.getElementById(id);
const content = byId('content');
const details = byId('details');
const witnessSelect = byId('wit');
const highlight = byId('showAll');
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
 if (doc.querySelector('parsererror')) throw Error('The XML is invalid.');
 const body = doc.getElementsByTagNameNS(TEI, 'body')[0];
 const witnesses = new Map([...doc.getElementsByTagNameNS(TEI, 'witness')]
  .map(node => [node.getAttributeNS(XML, 'id'), node.textContent.trim()]).filter(([id]) => id));
 if (!body || !witnesses.size) throw Error('The TEI must contain a text body and a witness list.');
 return {body, witnesses};
}

function parseJSON(source) {
 const data = JSON.parse(source);
 if (data?.format !== 'varians-collation' || data.version !== 1 ||
     typeof data.reference?.id !== 'string' || !data.witnesses || !Array.isArray(data.units)) {
  throw Error('Choose a Varians collation JSON from Export → JSON.');
 }
 return {
  data,
  witnesses: new Map([[data.reference.id, data.reference.name], ...Object.entries(data.witnesses)])
 };
}

function addLocus(base, reading, entries, id = '') {
 const index = loci.length;
 const wrapper = element('span');
 const button = element('button', undefined, 'apparatus');
 const plain = element('span', undefined, 'plain-reading');
 button.type = 'button';
 button.setAttribute('aria-controls', 'details');
 button.addEventListener('click', () => showDetails(active === index ? -1 : index));
 wrapper.append(button, plain);
 loci.push({button, plain, base, reading, entries, id});
 return wrapper;
}

const witnessIds = node => (node.getAttribute('wit') || '').trim().split(/\s+/)
 .filter(Boolean).map(id => id.replace(/^#/, ''));

function renderTEI(node) {
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
   entries, node.getAttributeNS(XML, 'id'));
 }
 for (const child of node.childNodes) children.append(renderTEI(child));
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

function showDetails(index) {
 active = index;
 details.hidden = index < 0;
 details.replaceChildren();
 loci.forEach(({button}, i) => button.setAttribute('aria-expanded', String(i === index)));
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
 const witness = witnessSelect.selectedOptions[0]?.dataset.witness;
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

byId('prev').onclick = () => step(-1);
byId('next').onclick = () => step(1);
witnessSelect.onchange = highlight.onchange = refresh;
byId('export-file').onchange = async event => {
 const file = event.target.files[0];
 if (!file) return;
 const load = ++loadNumber;
 try {
  const source = (await file.text()).trimStart();
  if (load !== loadNumber) return;
  const next = source.startsWith('<') ? parseTEI(source) : parseJSON(source);
  loci = [];
  const rendered = next.data ? renderJSON(next.data) : renderTEI(next.body);
  edition = next;
  witnessSelect.replaceChildren(element('option', 'Compare all witnesses'));
  for (const [id, name] of edition.witnesses) {
   const option = element('option', name || id);
   option.dataset.witness = id;
   witnessSelect.append(option);
  }
  content.after(details);
  content.replaceChildren(rendered);
  content.hidden = byId('toolbar').hidden = false;
  byId('status').textContent = edition.data ? 'JSON collation · review decisions are shown in the variant details.' : 'TEI edition';
  refresh();
 } catch (error) {
  if (load !== loadNumber) return;
  loci = [];
  content.hidden = byId('toolbar').hidden = details.hidden = true;
  byId('status').textContent = error instanceof SyntaxError ? 'The JSON file is invalid.' : error.message;
 }
};
