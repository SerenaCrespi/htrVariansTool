const $=id=>document.getElementById(id);
// Escape untrusted manuscript text before inserting it into HTML or TEI markup.
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const tokenKey=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
let A=[],B=[],groups=[],decisions={},movementCandidates=[],movementDecisions={},ambiguousCases=[],names={A:'Reference witness',B:'Witness B'},rawA=[],editedMode=false,images={A:[],B:[]},imageOverrides={};
let witnessIds=['A'],rawByWitness={A:[]},pairResults={},pairReviews={},activeWitness='B';
const messages={
en:{genre:'Text genre',prose:'Prose',poetry:'Poetry',drama:'Drama',movementTitle:'Unmatched and possibly displaced passages',movementHint:'After local alignment, unmatched passages are compared globally to suggest material that may have moved across pages or sections. Review every suggestion against the facsimiles.',movementNone:'No possible displaced passages found among unmatched units.',movementCount:'{n} possible displaced passage(s) to review.',ambiguousTitle:'Recurring ambiguous cases',confirmMove:'Confirm correspondence',rejectMove:'Reject suggestion',openSources:'Compare source images',possibleMove:'Possible displaced passage',ambiguous:'Ambiguous candidate',confirmed:'Confirmed by reviewer',rejected:'Rejected by reviewer',witnesses:'Work & witnesses',importAlto:'Import ALTO witnesses',importHint:'Load one or more ALTO files for each witness. Text, page and line references are extracted locally; corresponding page images remain linked to the transcription.',witnessA:'Witness A',witnessB:'Witness B',loadSample:'Load provided ALTO examples',alignTexts:'Align text units',pageImages:'Page images from the ATR workflow',imagesHint:'ALTO coordinates can be matched with the page facsimile. Select the corresponding local images.',imagesA:'Images A',imagesB:'Images B',iiifA:'IIIF URI A',iiifB:'IIIF URI B',optionalFallback:'Optional fallback',segmentReview:'Alignment review',segmentHint:'Sentence alignment is a preliminary step before word-level collation. The system proposes one-to-one, one-to-many and many-to-one correspondences; uncertain cases are flagged for review. The sample corpus includes additions, omissions, rewritings and non-obvious correspondences.',recurringTitle:'Recurring variants',recurringHint:'Review repeated readings across the collation and apply a decision to a whole unit or to an individual difference.',showRecurring:'Show recurring variants',collationChapter:'Collation by section',section:'Section:',sampleUnits:'Sample text · units 1–9',startCollation:'Run collation',collationHint:'This demo aligns prose by sentence; verse-based projects can use shorter pre-segmented units.',resultsTitle:'Collation results',exportJson:'Export decisions JSON',exportTei:'Export TEI fragment',empty:'Select ALTO files for both witnesses to begin.',footer:'Browser interface · Python backend running locally at 127.0.0.1 · ALTO and image files remain on this computer.',noCorpus:'Select ALTO files for both witnesses to begin.',sampleLoading:'Provided ALTO examples loaded; sending them to the local backend…',loadError:'Could not load sample corpus: ',imageCount:'{n} local image(s)',none:'none',fileSelected:'{n} ALTO file(s) selected for witness {w}.',alignBoth:'Import ALTO files for both witnesses.',rerunWarning:'Rerunning alignment will clear all review decisions. Continue?',editResetWarning:'Saving this correction will clear the review decisions for the current alignment. Continue?',backendUnits:'Local backend: {a} units in A · {b} in B.',alignmentSummary:'{n} alignments proposed · groups may be 1:1, 1:2, 2:1 or unmatched; uncertain cases require review.',error:'Error: ',alignmentFailed:'Alignment failed.',noAlignment:'No alignment available.',variant:'var.',aligned:'aligned',needsReview:' · alignment needs review',ignore:'Ignore',keep:'Keep',edit:'Edit',variants:'Variants',similarity:'similarity',noPassage:'— no corresponding passage in this witness —',difference:'Difference {n}',unitCount:'{n} / {total} units',nextPending:'Next pending variant',filterAll:'All units',filterVariants:'Units with variants',filterPending:'Pending review',filterUncertain:'Uncertain alignments',noFilterMatches:'No units match this filter.',noPendingLeft:'There are no pending variants to review.',recurringItem:'{variant} · {count} occurrences',pending:'{n} / {total} variants to review',retained:'{n} retained',showRecurringAction:'Show recurring variants',noRepeated:'No repeated reading found in this sample.',editUnit:'Edit unit {n}',close:'Close',editHint:'Correct the transcriptions; word-level differences will be recalculated for this unit.',saveRecalc:'Save and recalculate differences',page:'Page',line:'line',missingImage:'No image associated.',fullPage:'Page context',cropNote:'Image crops use ALTO coordinates. When an aligned unit spans several lines, each line appears separately; expand a card to inspect its full page.',lineCompare:'ALTO line comparison · unit {n}',rows:'{n} line(s)',noPassageIn:'No corresponding passage in {w}.',notAvailable:'Line text unavailable.',chooseImage:'No image matches page {page}. Choose an image for witness {w}:\n{list}\n\nEnter its number.',imageError:'Image could not be read.',keepBeforeExport:'Keep at least one variant before exporting TEI.',teiTitle:'Collation review',teiExport:'Prototype export',sourceLines:'Source lines',jsonName:'collation-decisions.json',teiName:'collation-reviewed.xml',recurringResult:' {items}',noCorpusRepeat:' No repeated reading found in this sample.',imageFallback:'IIIF image'},
fr:{genre:'Genre du texte',prose:'Prose',poetry:'Poésie',drama:'Théâtre',movementTitle:'Passages non alignés et possiblement déplacés',movementHint:'Après l’alignement local, les passages non alignés sont comparés globalement afin de suggérer des déplacements entre pages ou sections. Vérifiez chaque proposition sur les fac-similés.',movementNone:'Aucun passage possiblement déplacé parmi les unités non alignées.',movementCount:'{n} passage(s) potentiellement déplacé(s) à examiner.',ambiguousTitle:'Cas ambigus récurrents',confirmMove:'Confirmer la correspondance',rejectMove:'Rejeter la proposition',openSources:'Comparer les images sources',possibleMove:'Passage possiblement déplacé',ambiguous:'Candidat ambigu',confirmed:'Confirmé par le chercheur',rejected:'Proposition rejetée',witnesses:'Œuvre et témoins',importAlto:'Importer les témoins ALTO',importHint:'Chargez un ou plusieurs fichiers ALTO par témoin. Le texte et les références de page et de ligne sont extraits localement ; les images correspondantes restent liées à la transcription.',witnessA:'Témoin A',witnessB:'Témoin B',loadSample:'Charger les exemples ALTO fournis',alignTexts:'Aligner les unités textuelles',pageImages:'Images de page issues du workflow ATR',imagesHint:'Les coordonnées ALTO peuvent être rapprochées du fac-similé. Sélectionnez les images locales correspondantes.',imagesA:'Images A',imagesB:'Images B',iiifA:'URI IIIF A',iiifB:'URI IIIF B',optionalFallback:'Solution de secours facultative',segmentReview:'Vérification de l’alignement',segmentHint:'L’alignement des phrases précède la collation mot à mot. Le système propose des correspondances un-à-un, un-à-plusieurs et plusieurs-à-un ; les cas incertains sont signalés. Le corpus exemple comprend des ajouts, omissions, réécritures et correspondances moins évidentes.',recurringTitle:'Variantes récurrentes',recurringHint:'Examinez les leçons récurrentes et appliquez une décision à une unité entière ou à une différence précise.',showRecurring:'Afficher les variantes récurrentes',collationChapter:'Collation par section',section:'Section :',sampleUnits:'Texte exemple · unités 1–9',startCollation:'Lancer la collation',collationHint:'Cette démo aligne la prose par phrase ; les projets en vers peuvent utiliser des unités présegmentées plus courtes.',resultsTitle:'Résultats de la collation',exportJson:'Exporter les décisions JSON',exportTei:'Exporter un fragment TEI',empty:'Sélectionnez les fichiers ALTO des deux témoins pour commencer.',footer:'Interface navigateur · backend Python local sur 127.0.0.1 · les fichiers ALTO et images restent sur cet ordinateur.',noCorpus:'Sélectionnez les fichiers ALTO des deux témoins pour commencer.',sampleLoading:'Exemples ALTO fournis chargés ; envoi au backend local…',loadError:'Échec du chargement du corpus exemple : ',imageCount:'{n} image(s) locale(s)',none:'aucune',fileSelected:'{n} fichier(s) ALTO sélectionné(s) pour le témoin {w}.',alignBoth:'Importez les fichiers ALTO des deux témoins.',rerunWarning:'Relancer l’alignement effacera toutes les décisions de révision. Continuer ?',editResetWarning:'Enregistrer cette correction effacera les décisions de révision de l’alignement actuel. Continuer ?',backendUnits:'Backend local : {a} unités pour A · {b} pour B.',alignmentSummary:'{n} alignements proposés · groupes 1:1, 1:2, 2:1 ou sans correspondance ; les cas incertains doivent être vérifiés.',error:'Erreur : ',alignmentFailed:'Échec de l’alignement.',noAlignment:'Aucun alignement disponible.',variant:'var.',aligned:'aligné',needsReview:' · alignement à vérifier',ignore:'Écarter',keep:'Conserver',edit:'Modifier',variants:'Variantes',similarity:'similarité',noPassage:'— aucun passage correspondant dans ce témoin —',difference:'Différence {n}',unitCount:'{n} / {total} unités',nextPending:'Variante suivante à examiner',filterAll:'Toutes les unités',filterVariants:'Unités avec variantes',filterPending:'À examiner',filterUncertain:'Alignements incertains',noFilterMatches:'Aucune unité ne correspond à ce filtre.',noPendingLeft:'Aucune variante en attente.',recurringItem:'{variant} · {count} occurrences',pending:'{n} / {total} variantes à examiner',retained:'{n} conservées',showRecurringAction:'Afficher les variantes récurrentes',noRepeated:'Aucune leçon répétée dans ce corpus exemple.',editUnit:'Modifier l’unité {n}',close:'Fermer',editHint:'Corrigez les transcriptions ; les différences mot à mot seront recalculées pour cette unité.',saveRecalc:'Enregistrer et recalculer les différences',page:'Page',line:'ligne',missingImage:'Aucune image associée.',fullPage:'Contexte de la page',cropNote:'Les recadrages utilisent les coordonnées ALTO. Lorsqu’une unité couvre plusieurs lignes, chaque ligne apparaît séparément ; développez une carte pour voir la page entière.',lineCompare:'Comparaison des lignes ALTO · unité {n}',rows:'{n} ligne(s)',noPassageIn:'Aucun passage correspondant dans {w}.',notAvailable:'Texte de la ligne indisponible.',chooseImage:'Aucune image ne correspond à la page {page}. Choisissez une image pour le témoin {w} :\n{list}\n\nSaisissez son numéro.',imageError:'Impossible de lire l’image.',keepBeforeExport:'Conservez au moins une variante avant l’export TEI.',teiTitle:'Révision de la collation',teiExport:'Export prototype',sourceLines:'Lignes sources',jsonName:'decisions-collation.json',teiName:'collation-revisee.xml',recurringResult:' {items}',noCorpusRepeat:' Aucune leçon répétée dans ce corpus exemple.',imageFallback:'Image IIIF'},
it:{genre:'Genere del testo',prose:'Prosa',poetry:'Poesia',drama:'Teatro',movementTitle:'Passaggi non allineati e forse spostati',movementHint:'Dopo l’allineamento locale, i passaggi non allineati vengono confrontati globalmente per suggerire spostamenti tra pagine o sezioni. Verifica ogni proposta sulle immagini.',movementNone:'Nessun possibile passaggio spostato tra le unità non allineate.',movementCount:'{n} possibile/i passaggio/i spostato/i da verificare.',ambiguousTitle:'Casi ambigui ricorrenti',confirmMove:'Conferma corrispondenza',rejectMove:'Rifiuta proposta',openSources:'Confronta immagini fonte',possibleMove:'Possibile passaggio spostato',ambiguous:'Candidato ambiguo',confirmed:'Confermato dal ricercatore',rejected:'Proposta rifiutata',witnesses:'Opera e testimoni',importAlto:'Importa i testimoni ALTO',importHint:'Carica uno o più file ALTO per testimone. Testo e riferimenti a pagina e riga vengono estratti localmente; le immagini corrispondenti restano collegate alla trascrizione.',witnessA:'Testimone A',witnessB:'Testimone B',loadSample:'Carica gli esempi ALTO forniti',alignTexts:'Allinea le unità testuali',pageImages:'Immagini di pagina dal workflow ATR',imagesHint:'Le coordinate ALTO possono essere associate al facsimile. Seleziona le immagini locali corrispondenti.',imagesA:'Immagini A',imagesB:'Immagini B',iiifA:'URI IIIF A',iiifB:'URI IIIF B',optionalFallback:'Alternativa facoltativa',segmentReview:'Verifica dell’allineamento',segmentHint:'L’allineamento delle frasi precede la collazione parola per parola. Il sistema propone corrispondenze uno-a-uno, uno-a-molti e molti-a-uno; i casi incerti sono segnalati. Il corpus di prova include aggiunte, omissioni, riscritture e corrispondenze non ovvie.',recurringTitle:'Varianti ricorrenti',recurringHint:'Esamina le lezioni ricorrenti e applica una decisione a un’intera unità o a una singola differenza.',showRecurring:'Mostra le varianti ricorrenti',collationChapter:'Collazione per sezione',section:'Sezione:',sampleUnits:'Testo di prova · unità 1–9',startCollation:'Avvia la collazione',collationHint:'Questa demo allinea la prosa per frase; i progetti in versi possono usare unità più brevi presegmentate.',resultsTitle:'Risultati della collazione',exportJson:'Esporta decisioni JSON',exportTei:'Esporta frammento TEI',empty:'Seleziona i file ALTO di entrambi i testimoni per iniziare.',footer:'Interfaccia browser · backend Python locale su 127.0.0.1 · i file ALTO e le immagini restano su questo computer.',noCorpus:'Seleziona i file ALTO di entrambi i testimoni per iniziare.',sampleLoading:'Esempi ALTO forniti caricati; invio al backend locale…',loadError:'Impossibile caricare il corpus di prova: ',imageCount:'{n} immagine/i locale/i',none:'nessuna',fileSelected:'{n} file ALTO selezionati per il testimone {w}.',alignBoth:'Importa i file ALTO di entrambi i testimoni.',rerunWarning:'Ricalcolare l’allineamento cancellerà tutte le decisioni di revisione. Continuare?',editResetWarning:'Salvare questa correzione cancellerà le decisioni di revisione per l’allineamento corrente. Continuare?',backendUnits:'Backend locale: {a} unità in A · {b} in B.',alignmentSummary:'{n} allineamenti proposti · gruppi 1:1, 1:2, 2:1 o senza corrispondenza; i casi incerti richiedono verifica.',error:'Errore: ',alignmentFailed:'Allineamento non riuscito.',noAlignment:'Nessun allineamento disponibile.',variant:'var.',aligned:'allineato',needsReview:' · allineamento da verificare',ignore:'Ignora',keep:'Conserva',edit:'Modifica',variants:'Varianti',similarity:'similarità',noPassage:'— nessun passaggio corrispondente in questo testimone —',difference:'Differenza {n}',unitCount:'{n} / {total} unità',nextPending:'Prossima variante da esaminare',filterAll:'Tutte le unità',filterVariants:'Unità con varianti',filterPending:'Da esaminare',filterUncertain:'Allineamenti incerti',noFilterMatches:'Nessuna unità corrisponde al filtro.',noPendingLeft:'Non ci sono varianti da esaminare.',recurringItem:'{variant} · {count} occorrenze',pending:'{n} / {total} varianti da esaminare',retained:'{n} conservate',showRecurringAction:'Mostra le varianti ricorrenti',noRepeated:'Nessuna lezione ripetuta in questo corpus di prova.',editUnit:'Modifica unità {n}',close:'Chiudi',editHint:'Correggi le trascrizioni; le differenze parola per parola saranno ricalcolate per questa unità.',saveRecalc:'Salva e ricalcola le differenze',page:'Pagina',line:'riga',missingImage:'Nessuna immagine associata.',fullPage:'Contesto della pagina',cropNote:'I ritagli usano le coordinate ALTO. Se un’unità comprende più righe, ogni riga è mostrata separatamente; espandi una scheda per vedere la pagina intera.',lineCompare:'Confronto delle righe ALTO · unità {n}',rows:'{n} righe',noPassageIn:'Nessun passaggio corrispondente in {w}.',notAvailable:'Testo della riga non disponibile.',chooseImage:'Non trovo un’immagine per la pagina {page}. Scegli un’immagine per il testimone {w}:\n{list}\n\nInserisci il numero.',imageError:'Impossibile leggere l’immagine.',keepBeforeExport:'Conserva almeno una variante prima di esportare il TEI.',teiTitle:'Revisione della collazione',teiExport:'Esportazione prototipo',sourceLines:'Righe fonte',jsonName:'decisioni-collazione.json',teiName:'collazione-revisionata.xml',recurringResult:' {items}',noCorpusRepeat:' Nessuna lezione ripetuta in questo corpus di prova.',imageFallback:'Immagine IIIF'}
};

Object.assign(messages.en,{exportTei:'Export full TEI text',imageLoading:'Checking image files…',imageVerified:'{n} image(s) loaded and readable: {files}',imagePartial:'{n} image(s) readable; could not load: {files}',imageInvalid:'No selected image could be read.',alignmentSummary:'{n} alignments proposed · low-similarity correspondences are flagged for review.'});
Object.assign(messages.fr,{exportTei:'Exporter le texte TEI complet',imageLoading:'Vérification des fichiers image…',imageVerified:'{n} image(s) chargée(s) et lisible(s) : {files}',imagePartial:'{n} image(s) lisible(s) ; échec de chargement : {files}',imageInvalid:'Aucune image sélectionnée n’a pu être lue.',alignmentSummary:'{n} alignements proposés · les correspondances peu similaires sont signalées pour vérification.'});
Object.assign(messages.it,{exportTei:'Esporta il testo TEI completo',imageLoading:'Verifica dei file immagine…',imageVerified:'{n} immagine/i caricate e leggibili: {files}',imagePartial:'{n} immagine/i leggibili; caricamento non riuscito: {files}',imageInvalid:'Nessuna delle immagini selezionate è leggibile.',alignmentSummary:'{n} allineamenti proposti · le corrispondenze con bassa similarità sono segnalate per la revisione.'});
Object.assign(messages.en,{fundingText:'This software is developed within the PRIMA project, funded by the European Research Council (ERC).',supportedBy:'Supported by'});
Object.assign(messages.fr,{fundingText:'Ce logiciel est développé dans le cadre du projet PRIMA, financé par le Conseil européen de la recherche (ERC).',supportedBy:'Avec le soutien de'});
Object.assign(messages.it,{fundingText:'Questo software è sviluppato nell’ambito del progetto PRIMA, finanziato dal Consiglio europeo della ricerca (ERC).',supportedBy:'Con il sostegno di'});
Object.assign(messages.en,{teiStructure:'TEI structure',exportTei:'Export full TEI text',segmentHint:'Review proposed correspondences against the source images.',imageLoading:'Checking image files…',imageVerified:'{n} image(s) loaded and readable: {files}',imagePartial:'{n} image(s) readable; could not load: {files}',imageInvalid:'No selected image could be read.',exportTei:'Export full TEI text',alignmentSummary:'{n} alignments proposed · low-similarity correspondences are flagged for review.'});
Object.assign(messages.fr,{teiStructure:'Structure TEI',exportTei:'Exporter le texte TEI complet',segmentHint:'Vérifiez les correspondances proposées à partir des images sources.',imageLoading:'Vérification des fichiers image…',imageVerified:'{n} image(s) chargée(s) et lisible(s) : {files}',imagePartial:'{n} image(s) lisible(s) ; échec de chargement : {files}',imageInvalid:'Aucune image sélectionnée n’a pu être lue.',exportTei:'Exporter le texte TEI complet',alignmentSummary:'{n} alignements proposés · les correspondances peu similaires sont signalées pour vérification.'});
Object.assign(messages.it,{teiStructure:'Struttura TEI',exportTei:'Esporta il testo TEI completo',segmentHint:'Verifica le corrispondenze proposte sulle immagini fonte.',imageLoading:'Verifica dei file immagine…',imageVerified:'{n} immagine/i caricate e leggibili: {files}',imagePartial:'{n} immagine/i leggibili; caricamento non riuscito: {files}',imageInvalid:'Nessuna delle immagini selezionate è leggibile.',exportTei:'Esporta il testo TEI completo',alignmentSummary:'{n} allineamenti proposti · le corrispondenze con bassa similarità sono segnalate per la revisione.'});
Object.assign(messages.en,{empty:'Select ALTO files for both witnesses to begin.',noCorpus:'Select ALTO files for both witnesses to begin.',sampleLoading:'Provided ALTO examples loaded; sending them to the local backend…'});
Object.assign(messages.fr,{empty:'Sélectionnez les fichiers ALTO des deux témoins pour commencer.',noCorpus:'Sélectionnez les fichiers ALTO des deux témoins pour commencer.',sampleLoading:'Exemples ALTO fournis chargés ; envoi au backend local…'});
Object.assign(messages.it,{empty:'Seleziona i file ALTO di entrambi i testimoni per iniziare.',noCorpus:'Seleziona i file ALTO di entrambi i testimoni per iniziare.',sampleLoading:'Esempi ALTO forniti caricati; invio al backend locale…'});
Object.assign(messages.en,{iiifOptional:'Optional IIIF fallback',segmentHint:'Each ALTO line remains an individual source unit. Bertalign proposes coarse correspondences; weighted Levenshtein refines them. Review uncertain matches against the page images.',collationHint:'The alignment is line-based and independent of punctuation; TEI structure is selected only at export.',alignBert:'Alignment: Bertalign anchors refined with weighted Levenshtein.',alignFallback:'Alignment: weighted Levenshtein only; install Bertalign to enable semantic anchors.'});
Object.assign(messages.fr,{iiifOptional:'Solution IIIF de secours (facultative)',segmentHint:'Chaque ligne ALTO reste une unité source distincte. Bertalign propose des correspondances globales, affinées par Levenshtein pondéré. Vérifiez les cas incertains sur les images.',collationHint:'L’alignement suit les lignes et ne dépend pas de la ponctuation ; la structure TEI se choisit uniquement à l’export.',alignBert:'Alignement : ancres Bertalign affinées par Levenshtein pondéré.',alignFallback:'Alignement : Levenshtein pondéré seul ; installez Bertalign pour activer les ancres sémantiques.'});

Object.assign(messages.en,{moveSourceHeading:'Move a line into an existing unit',clickToMove:'Click this reading to move from this witness',positionStart:'Before the first line',positionAfter:'After: {text}',positionEnd:'At the end',splitSelected:'Split selected line',unitLabel:'Unit {n}',selectPosition:'Place it in the selected unit',positionPlaceholder:'Leave blank to append',selectSourceLine:'Select a line from this witness (grouped by unit)',selectTargetUnit:'Choose an existing unit',splitPlaceholder:'Text after which to split the line',splitLine:'Split selected line',splitHint:'Split after the exact text; both parts keep their ALTO source reference.',splitNeedMarker:'Choose a line and enter the text after which to split it.',splitMarkerMissing:'That exact text was not found in the selected line.',splitEmptyPart:'The split would create an empty fragment.',selectLineAndTarget:'Choose a source line and an existing target unit.',noLinesLeft:'No lines remain in this witness.',moveLine:'Move line to selected unit',manualSaved:'Manual line grouping saved.',editText:'Edit text',adjustAlignment:'Adjust alignment',adjustTitle:'Adjust alignment · unit {n}',adjustHint:'This view shows only the open unit. Click either reading to choose the witness, then select a line and its destination unit. Split a line only when needed.',includePrevious:'← Include previous line',sendPrevious:'← Send first line',sendNext:'Send last line →',includeNext:'Include next line →',saveAlignment:'Save alignment',cancel:'Cancel',editBothEmpty:'At least one witness reading must contain text.',saveFailed:'Could not save the edit. Check the message above.'});
Object.assign(messages.fr,{moveSourceHeading:'Déplacer une ligne vers une unité existante',clickToMove:'Cliquez sur cette lecture pour choisir ce témoin',positionStart:'Avant la première ligne',positionAfter:'Après : {text}',positionEnd:'À la fin',splitSelected:'Couper la ligne sélectionnée',unitLabel:'Unité {n}',selectPosition:'Position dans l’unité choisie',positionPlaceholder:'Laisser vide pour ajouter à la fin',selectSourceLine:'Choisissez une ligne de ce témoin (classées par unité)',selectTargetUnit:'Choisissez une unité existante',splitPlaceholder:'Texte après lequel couper la ligne',splitLine:'Couper la ligne sélectionnée',splitHint:'La coupe se fait après le texte exact ; les deux parties gardent leur référence ALTO.',splitNeedMarker:'Choisissez une ligne et saisissez le texte après lequel la couper.',splitMarkerMissing:'Ce texte exact est introuvable dans la ligne sélectionnée.',splitEmptyPart:'La coupe produirait un fragment vide.',selectLineAndTarget:'Choisissez une ligne source et une unité cible existante.',noLinesLeft:'Aucune ligne restante pour ce témoin.',moveLine:'Déplacer la ligne vers l’unité choisie',manualSaved:'Regroupement manuel des lignes enregistré.',editText:'Modifier le texte',adjustAlignment:'Ajuster l’alignement',adjustTitle:'Ajuster l’alignement · unité {n}',adjustHint:'Cette vue n’affiche que l’unité ouverte. Cliquez sur une lecture pour choisir le témoin, puis la ligne et son unité de destination. Coupez une ligne seulement si nécessaire.',includePrevious:'← Inclure la ligne précédente',sendPrevious:'← Envoyer la première ligne',sendNext:'Envoyer la dernière ligne →',includeNext:'Inclure la ligne suivante →',saveAlignment:'Enregistrer l’alignement',cancel:'Annuler',editBothEmpty:'Au moins un témoin doit contenir du texte.',saveFailed:'La modification n’a pas pu être enregistrée. Consultez le message ci-dessus.'});
Object.assign(messages.it,{moveSourceHeading:'Sposta una riga in un’unità esistente',clickToMove:'Clicca questa lettura per scegliere il testimone da cui spostare',positionStart:'Prima della prima riga',positionAfter:'Dopo: {text}',positionEnd:'In fondo',splitSelected:'Dividi la riga selezionata',unitLabel:'Unità {n}',selectPosition:'Posizione nell’unità scelta',positionPlaceholder:'Lascia vuoto per aggiungere in fondo',selectSourceLine:'Scegli una riga di questo testimone (raggruppate per unità)',selectTargetUnit:'Scegli un’unità esistente',splitPlaceholder:'Testo dopo cui dividere la riga',splitLine:'Dividi la riga selezionata',splitHint:'La divisione avviene dopo il testo esatto; entrambe le parti mantengono il riferimento ALTO.',splitNeedMarker:'Scegli una riga e inserisci il testo dopo cui dividerla.',splitMarkerMissing:'Il testo esatto non è stato trovato nella riga selezionata.',splitEmptyPart:'La divisione creerebbe un frammento vuoto.',selectLineAndTarget:'Scegli una riga fonte e un’unità di destinazione esistente.',noLinesLeft:'Non restano righe in questo testimone.',moveLine:'Sposta la riga nell’unità scelta',manualSaved:'Raggruppamento manuale delle righe salvato.',editText:'Modifica testo',adjustAlignment:'Regola allineamento',adjustTitle:'Regola allineamento · unità {n}',adjustHint:'Questa vista mostra solo l’unità aperta. Clicca una delle due letture per scegliere il testimone, poi seleziona la riga e l’unità di destinazione. Dividi la riga solo se necessario.',includePrevious:'← Includi riga precedente',sendPrevious:'← Sposta la prima riga',sendNext:'Sposta l’ultima riga →',includeNext:'Includi riga successiva →',saveAlignment:'Salva allineamento',cancel:'Annulla',editBothEmpty:'Almeno un testimone deve contenere del testo.',saveFailed:'Non è stato possibile salvare la modifica. Controlla il messaggio sopra.'});
Object.assign(messages.it,{iiifOptional:'Fallback IIIF (facoltativo)',segmentHint:'Ogni riga ALTO resta un’unità fonte distinta. Bertalign propone corrispondenze globali, raffinate con Levenshtein pesato. Verifica i casi incerti sulle immagini.',collationHint:'L’allineamento segue le righe e non dipende dalla punteggiatura; la struttura TEI si sceglie solo in esportazione.',alignBert:'Allineamento: ancore Bertalign raffinate con Levenshtein pesato.',alignFallback:'Allineamento: solo Levenshtein pesato; installa Bertalign per attivare le ancore semantiche.'});

Object.assign(messages.en,{"saveProject": "Save project", "openProject": "Open project", "projectHint": "Save the complete session to resume later. Local images are linked again when you reselect them; they are not included in the project file.", "projectOpened": "Project opened. Reselect local images to reconnect the facsimiles.", "replaceProject": "Opening this project will replace the current session. Save it first if needed. Continue?", "invalidProject": "The file is not a valid supported VARIANS project.", "projectBusy": "Wait for the current import or alignment to finish.", "projectSaved": "Project file prepared for download.", "projectEmpty": "Load at least one witness before saving a project."});
Object.assign(messages.fr,{"saveProject": "Enregistrer le projet", "openProject": "Ouvrir un projet", "projectHint": "Enregistrez la session complète pour la reprendre. Les images locales ne sont pas incluses ; sélectionnez-les à nouveau pour les relier.", "projectOpened": "Projet ouvert. Sélectionnez à nouveau les images locales pour relier les fac-similés.", "replaceProject": "Ouvrir ce projet remplacera la session actuelle. Enregistrez-la si nécessaire. Continuer ?", "invalidProject": "Ce fichier n’est pas un projet VARIANS valide et pris en charge.", "projectBusy": "Attendez la fin de l’importation ou de l’alignement.", "projectSaved": "Fichier de projet préparé pour le téléchargement.", "projectEmpty": "Chargez au moins un témoin avant d’enregistrer un projet."});
Object.assign(messages.it,{"saveProject": "Salva progetto", "openProject": "Apri progetto", "projectHint": "Salva la sessione completa per riprenderla in seguito. Le immagini locali non sono incluse: riselezionale per ricollegarle.", "projectOpened": "Progetto aperto. Riseleziona le immagini locali per ricollegare i facsimili.", "replaceProject": "Aprire questo progetto sostituirà la sessione corrente. Salvala prima se necessario. Continuare?", "invalidProject": "Il file non è un progetto VARIANS valido e supportato.", "projectBusy": "Attendi la fine del caricamento o dell’allineamento.", "projectSaved": "File di progetto preparato per il download.", "projectEmpty": "Carica almeno un testimone prima di salvare il progetto."});

Object.assign(messages.en,{"finishProjectEdit": "Save or cancel the open edit before saving the project.", "relinkImages": "Reselect images: {files}", "projectTooLarge": "Project files must be smaller than 100 MB."});
Object.assign(messages.fr,{"finishProjectEdit": "Enregistrez ou annulez la modification ouverte avant d’enregistrer le projet.", "relinkImages": "Sélectionnez à nouveau les images : {files}", "projectTooLarge": "Le fichier de projet doit faire moins de 100 Mo."});
Object.assign(messages.it,{"finishProjectEdit": "Salva o annulla la modifica aperta prima di salvare il progetto.", "relinkImages": "Riseleziona le immagini: {files}", "projectTooLarge": "Il file di progetto deve essere inferiore a 100 MB."});
Object.assign(messages.en,{"teiStructure": "TEI structure", "mixedStructure": "Mixed prose and poetry", "rangesHint": "Assign prose, poetry or drama to intervals of the numbered reference comparison units. Each poetry unit becomes one verse: adjust line grouping first if needed. All units must be covered once, in order.", "rangeBasis": "{n} units of “{reference}”, numbered as in its comparison with “{witness}”. Use the reference list below when viewing another comparison.", "fromUnit": "From unit", "toUnit": "To unit", "addRange": "Add interval", "removeRange": "Remove", "uniformStructure": "Use uniform structure", "uniformHint": "No intervals: the complete text uses {genre}.", "rangesValid": "Intervals cover all reference units without gaps or overlaps.", "rangeCoverage": "Intervals must cover units 1 to the final unit once, in order, without gaps or overlaps.", "variantCrossesBoundary": "A retained variant crosses a verse or structure boundary. Adjust the alignment or the intervals before exporting.", "referenceUnitList": "Reference unit numbering and source lines", "exportIds": "Export witness IDs:"});
Object.assign(messages.fr,{"teiStructure": "Structure TEI", "mixedStructure": "Texte mêlant prose et poésie", "rangesHint": "Attribuez prose, poésie ou théâtre à des intervalles d’unités numérotées de la comparaison de référence. Chaque unité poétique devient un vers : ajustez les regroupements si nécessaire. Couvrez toutes les unités une seule fois et dans l’ordre.", "rangeBasis": "{n} unités de « {reference} », numérotées comme dans sa comparaison avec « {witness} ». Consultez la liste ci-dessous depuis une autre comparaison.", "fromUnit": "De l’unité", "toUnit": "À l’unité", "addRange": "Ajouter un intervalle", "removeRange": "Supprimer", "uniformStructure": "Structure uniforme", "uniformHint": "Sans intervalles : tout le texte utilise {genre}.", "rangesValid": "Les intervalles couvrent toutes les unités sans lacunes ni chevauchements.", "rangeCoverage": "Les intervalles doivent couvrir toutes les unités à partir de 1, une seule fois et dans l’ordre, sans lacunes ni chevauchements.", "variantCrossesBoundary": "Une variante conservée traverse une limite de vers ou de structure. Ajustez l’alignement ou les intervalles avant l’export.", "referenceUnitList": "Numérotation des unités et lignes sources", "exportIds": "Identifiants des témoins à l’export :"});
Object.assign(messages.it,{"teiStructure": "Struttura TEI", "mixedStructure": "Testo misto: prosa e poesia", "rangesHint": "Assegna prosa, poesia o teatro a intervalli delle unità numerate del confronto di riferimento. Ogni unità poetica diventa un verso: correggi prima i raggruppamenti se necessario. Tutte le unità devono essere coperte una sola volta e in ordine.", "rangeBasis": "{n} unità di “{reference}”, numerate come nel confronto con “{witness}”. Usa la lista qui sotto quando visualizzi un altro confronto.", "fromUnit": "Da unità", "toUnit": "A unità", "addRange": "Aggiungi intervallo", "removeRange": "Rimuovi", "uniformStructure": "Usa struttura uniforme", "uniformHint": "Nessun intervallo: tutto il testo usa {genre}.", "rangesValid": "Gli intervalli coprono tutte le unità senza buchi o sovrapposizioni.", "rangeCoverage": "Gli intervalli devono coprire tutte le unità da 1 all’ultima, una sola volta e in ordine, senza buchi o sovrapposizioni.", "variantCrossesBoundary": "Una variante conservata attraversa un confine di verso o struttura. Correggi l’allineamento o gli intervalli prima di esportare.", "referenceUnitList": "Numerazione delle unità e righe fonte", "exportIds": "Identificativi dei testimoni negli export:"});

Object.assign(messages.en,{"exportSetup": "Export TEI", "exportSetupHint": "Choose one genre for the whole text, or define intervals for mixed prose, poetry and drama.", "wholeTextGenre": "One genre for the whole text", "intervalGenres": "Different genres by interval", "downloadTei": "Download TEI"});
Object.assign(messages.fr,{"exportSetup": "Exporter en TEI", "exportSetupHint": "Choisissez un genre pour tout le texte ou définissez des intervalles de prose, poésie et théâtre.", "wholeTextGenre": "Un seul genre pour tout le texte", "intervalGenres": "Genres différents par intervalle", "downloadTei": "Télécharger le TEI"});
Object.assign(messages.it,{"exportSetup": "Esporta TEI", "exportSetupHint": "Scegli un genere per tutto il testo oppure definisci intervalli di prosa, poesia e teatro.", "wholeTextGenre": "Un solo genere per tutto il testo", "intervalGenres": "Generi diversi per intervallo", "downloadTei": "Scarica TEI"});

Object.assign(messages.en,{"rangesHint": "Assign prose, poetry or drama to intervals of the numbered reference comparison units. Prose units are joined in one paragraph per interval; poetry preserves the original ALTO lines of the reference witness. Cover all units once, in order.", "poetrySourceMapping": "The reviewed reference text cannot be mapped unambiguously to its original ALTO lines. Check the reference corrections before exporting poetry.", "poetryLineBoundary": "This poetry interval cuts through an original ALTO line. Include all units containing that source line in the same poetry interval."});
Object.assign(messages.fr,{"rangesHint": "Attribuez prose, poésie ou théâtre aux intervalles numérotés. Les unités de prose sont réunies en un paragraphe par intervalle ; la poésie conserve les lignes ALTO originales du témoin de référence. Couvrez toutes les unités une seule fois et dans l’ordre.", "poetrySourceMapping": "Le texte de référence révisé ne peut pas être relié sans ambiguïté aux lignes ALTO originales. Vérifiez les corrections avant l’export poétique.", "poetryLineBoundary": "Cet intervalle poétique coupe une ligne ALTO originale. Incluez toutes les unités de cette ligne dans le même intervalle poétique."});
Object.assign(messages.it,{"rangesHint": "Assegna prosa, poesia o teatro agli intervalli delle unità numerate. La prosa viene unita in un paragrafo per intervallo; la poesia conserva le righe ALTO originali del testimone di riferimento. Copri tutte le unità una sola volta e in ordine.", "poetrySourceMapping": "Il testo di riferimento revisionato non può essere ricondotto senza ambiguità alle righe ALTO originali. Verifica le correzioni prima di esportare la poesia.", "poetryLineBoundary": "Questo intervallo poetico taglia una riga ALTO originale. Includi tutte le unità di quella riga nello stesso intervallo poetico."});

Object.assign(messages.en,{editResetWarning:"Saving this correction will reset decisions only for this unit. Decisions in other units will be kept. Continue?"});
Object.assign(messages.fr,{editResetWarning:"Enregistrer cette correction réinitialisera uniquement les décisions de cette unité. Les autres unités conserveront leurs décisions. Continuer ?"});
Object.assign(messages.it,{editResetWarning:"Salvare questa correzione azzererà solo le decisioni di questa unità. Le decisioni delle altre unità saranno mantenute. Continuare?"});


Object.assign(messages.en,{"automatic_not_needed": "Lexical alignment: no passage met the automatic Bertalign recovery criteria.", "automatic_applied": "Automatic Bertalign recovery: {accepted} of {attempted} attempted passage(s) accepted. Review the marked units.", "automatic_not_installed": "Uncertain passages detected; Bertalign is not installed. The lexical result was retained.", "automatic_dependency_unavailable": "Bertalign dependencies are missing or incompatible. The lexical result was retained.", "automatic_model_unavailable": "Bertalign could not load LaBSE. The lexical result was retained.", "automatic_alignment_failed": "The automatic Bertalign attempt failed. The lexical result was retained.", "automatic_kept_lexical": "Bertalign was attempted on {attempted} passage(s); no proposal passed the improvement checks. The lexical result was retained.", "automatic_limit_reached": "Uncertain passages exceed the automatic recovery limits. The lexical result was retained.", "automaticRowReview": " · automatic Bertalign recovery: review this unit", "alignAutomaticHybrid": "Alignment: lexical with automatic Bertalign recovery.", "backendWorking": "Aligning witnesses… Bertalign will be tried automatically on uncertain passages; its first model load may take several minutes."});
Object.assign(messages.fr,{"automatic_not_needed": "Alignement lexical : aucun passage ne répond aux critères de récupération automatique Bertalign.", "automatic_applied": "Récupération automatique Bertalign : {accepted} passage(s) accepté(s) sur {attempted} tentative(s). Vérifiez les unités signalées.", "automatic_not_installed": "Passages incertains détectés ; Bertalign n’est pas installé. Le résultat lexical est conservé.", "automatic_dependency_unavailable": "Dépendances Bertalign absentes ou incompatibles. Le résultat lexical est conservé.", "automatic_model_unavailable": "Bertalign n’a pas pu charger LaBSE. Le résultat lexical est conservé.", "automatic_alignment_failed": "La tentative automatique Bertalign a échoué. Le résultat lexical est conservé.", "automatic_kept_lexical": "Bertalign a été tenté sur {attempted} passage(s) ; aucune proposition n’a satisfait les contrôles d’amélioration. Le résultat lexical est conservé.", "automatic_limit_reached": "Les passages incertains dépassent les limites de récupération automatique. Le résultat lexical est conservé.", "automaticRowReview": " · récupération automatique Bertalign : à vérifier", "alignAutomaticHybrid": "Alignement : lexical avec récupération automatique Bertalign.", "backendWorking": "Alignement en cours… Bertalign sera tenté automatiquement sur les passages incertains ; son premier chargement peut prendre plusieurs minutes."});
Object.assign(messages.it,{"automatic_not_needed": "Allineamento lessicale: nessun passaggio soddisfa i criteri per il recupero automatico Bertalign.", "automatic_applied": "Recupero automatico Bertalign: accettati {accepted} passaggi su {attempted} tentativi. Verifica le unità contrassegnate.", "automatic_not_installed": "Rilevati passaggi incerti; Bertalign non è installato. Mantenuto il risultato lessicale.", "automatic_dependency_unavailable": "Dipendenze Bertalign assenti o incompatibili. Mantenuto il risultato lessicale.", "automatic_model_unavailable": "Bertalign non ha caricato LaBSE. Mantenuto il risultato lessicale.", "automatic_alignment_failed": "Il tentativo automatico Bertalign è fallito. Mantenuto il risultato lessicale.", "automatic_kept_lexical": "Bertalign tentato su {attempted} passaggi: nessuna proposta ha superato i controlli di miglioramento. Mantenuto il risultato lessicale.", "automatic_limit_reached": "I passaggi incerti superano i limiti del recupero automatico. Mantenuto il risultato lessicale.", "automaticRowReview": " · recupero automatico Bertalign: da verificare", "alignAutomaticHybrid": "Allineamento: lessicale con recupero automatico Bertalign.", "backendWorking": "Allineamento in corso… Bertalign verrà tentato automaticamente sui passaggi incerti; il primo caricamento del modello può richiedere alcuni minuti."});

Object.assign(messages.en,{"alignWord": "Alignment: word-level Levenshtein with displaced-run recovery.", "alignHybrid": "Alignment: lexical with a previously reviewed Bertalign proposal.", "alignFallback": "Alignment: lexical backup."});
Object.assign(messages.fr,{"alignWord": "Alignement : Levenshtein mot à mot avec récupération des passages déplacés.", "alignHybrid": "Alignement : lexical avec une proposition Bertalign précédemment vérifiée.", "alignFallback": "Alignement : solution lexicale de secours."});
Object.assign(messages.it,{"alignWord": "Allineamento: Levenshtein parola per parola con recupero dei passi spostati.", "alignHybrid": "Allineamento: lessicale con proposta Bertalign precedentemente verificata.", "alignFallback": "Allineamento: riserva lessicale."});

Object.assign(messages.en,{replaceWitnessWarning:"Replacing the ALTO files for this witness will recalculate only its comparison and clear its review decisions. Other witness comparisons will be preserved. Continue?"});
Object.assign(messages.fr,{replaceWitnessWarning:"Remplacer les fichiers ALTO de ce témoin recalculera uniquement sa comparaison et effacera ses décisions. Les autres comparaisons seront conservées. Continuer ?"});
Object.assign(messages.it,{replaceWitnessWarning:"Sostituire gli ALTO di questo testimone ricalcola solo il suo confronto e ne azzera le decisioni. I confronti degli altri testimoni saranno conservati. Continuare?"});

Object.assign(messages.en,{alignmentCancelled:"Import or realignment cancelled. The previous comparisons were retained."});
Object.assign(messages.fr,{alignmentCancelled:"Importation ou réalignement annulé. Les comparaisons précédentes sont conservées."});
Object.assign(messages.it,{alignmentCancelled:"Importazione o ricalcolo annullato. Conservati i confronti precedenti."});

let imageStatus={A:null},alignmentMethod='',alignmentDraft=null;

messages.en.importHint='Select the dossier folder containing a witness’s ALTO files. The dossier name is used automatically; page and line references are extracted locally.';messages.fr.importHint='Sélectionnez le dossier contenant les fichiers ALTO du témoin. Son nom est repris automatiquement ; les références de page et de ligne sont extraites localement.';messages.it.importHint='Seleziona la cartella dossier con i file ALTO del testimone. Il nome viene ripreso automaticamente; i riferimenti di pagina e riga sono estratti localmente.';
messages.en.empty='Select the reference dossier and at least one other witness to begin.';messages.fr.empty='Sélectionnez le dossier de référence et au moins un autre témoin pour commencer.';messages.it.empty='Seleziona il dossier di riferimento e almeno un altro testimone per iniziare.';messages.en.noCorpus=messages.en.empty;messages.fr.noCorpus=messages.fr.empty;messages.it.noCorpus=messages.it.empty;messages.en.alignBoth='Load the reference ALTO files and at least one other witness.';messages.fr.alignBoth='Chargez le dossier ALTO de référence et au moins un autre témoin.';messages.it.alignBoth='Carica il dossier ALTO di riferimento e almeno un altro testimone.';
messages.en.referenceWitness='Reference witness';messages.fr.referenceWitness='Témoin de référence';messages.it.referenceWitness='Testimone di riferimento';
messages.en.addWitness='Add a witness';messages.fr.addWitness='Ajouter un témoin';messages.it.addWitness='Aggiungi un testimone';
messages.en.imagesA='Reference images';messages.fr.imagesA='Images du témoin de référence';messages.it.imagesA='Immagini del testimone di riferimento';
messages.en.iiifA='Reference IIIF URI';messages.fr.iiifA='URI IIIF du témoin de référence';messages.it.iiifA='URI IIIF del testimone di riferimento';
messages.en.addWitness='Add a witness';messages.fr.addWitness='Ajouter un témoin';messages.it.addWitness='Aggiungi un testimone';
messages.en.witnessLimit='Maximum 10 witnesses, including the reference witness.';messages.fr.witnessLimit='10 témoins maximum, témoin de référence inclus.';messages.it.witnessLimit='Massimo 10 testimoni, incluso il testimone di riferimento.';
messages.en.importHint='Select multiple ALTO files for each witness. Enter the dossier name to use as its label; the reference counts toward the limit of 10.';messages.en.witnessName='Witness name';
messages.fr.importHint='Sélectionnez plusieurs fichiers ALTO pour chaque témoin. Saisissez le nom du dossier à utiliser comme nom du témoin ; le témoin de référence compte dans la limite de 10.';messages.fr.witnessName='Nom du témoin';
messages.it.importHint='Seleziona più file ALTO per ogni testimone. Inserisci il nome del dossier da usare come nome del testimone; il riferimento è incluso nel limite di 10.';messages.it.witnessName='Nome del testimone';
messages.en.compareReferenceWith='Compare reference with';messages.fr.compareReferenceWith='Comparer le témoin de référence avec';messages.it.compareReferenceWith='Confronta il riferimento con';
messages.en.witnessCount='{n}/10 witnesses total (reference included)';messages.fr.witnessCount='{n}/10 témoins au total (référence incluse)';messages.it.witnessCount='{n}/10 testimoni in totale (riferimento incluso)';
messages.en.backendUnits='Aligned {a} reference units with {b} units in “{w}”.';messages.fr.backendUnits='{a} unités de référence alignées avec {b} unités dans « {w} ». ';messages.it.backendUnits='{a} unità di riferimento allineate con {b} unità in « {w} ».';
messages.en.alignmentSummary='{n} alignments proposed against the reference · groups may be 1:1, 1:2, 2:1 or unmatched; uncertain cases require review.';messages.fr.alignmentSummary='{n} alignements proposés avec le témoin de référence · les groupes peuvent être 1:1, 1:2, 2:1 ou sans correspondance ; les cas incertains doivent être vérifiés.';messages.it.alignmentSummary='{n} allineamenti proposti rispetto al riferimento · i gruppi possono essere 1:1, 1:2, 2:1 o senza corrispondenza; i casi incerti richiedono una verifica.';
messages.en.alignBoth='Load the reference ALTO files and at least one other witness.';messages.fr.alignBoth='Chargez le dossier ALTO de référence et au moins un autre témoin.';messages.it.alignBoth='Carica il dossier ALTO di riferimento e almeno un altro testimone.';
messages.en.empty='Select the reference dossier and at least one other witness to begin.';messages.en.noCorpus=messages.en.empty;messages.fr.empty='Sélectionnez le dossier de référence et au moins un autre témoin pour commencer.';messages.fr.noCorpus=messages.fr.empty;messages.it.empty='Seleziona il dossier di riferimento e almeno un altro testimone per iniziare.';messages.it.noCorpus=messages.it.empty;

Object.assign(messages.en,{exportMenu:'Export',aligningWitnesses:'Aligning witnesses…',alignmentComplete:'Alignment complete',titleLines:'Title lines',titleLinesHint:'Select the reference lines to export as TEI headings.',titleLineBoundary:'A title line crosses a genre interval boundary. Include the whole line in one interval.',noTitleLines:'No reference ALTO lines available.'});
Object.assign(messages.fr,{exportMenu:'Exporter',aligningWitnesses:'Alignement des témoins…',alignmentComplete:'Alignement terminé',titleLines:'Lignes de titre',titleLinesHint:'Sélectionnez les lignes du témoin de référence à exporter comme titres TEI.',titleLineBoundary:'Une ligne de titre chevauche deux intervalles de genre. Placez la ligne entière dans un seul intervalle.',noTitleLines:'Aucune ligne ALTO de référence disponible.'});
Object.assign(messages.it,{exportMenu:'Esporta',aligningWitnesses:'Allineamento dei testimoni…',alignmentComplete:'Allineamento completo',titleLines:'Righe di titolo',titleLinesHint:'Seleziona le righe del testimone di riferimento da esportare come titoli TEI.',titleLineBoundary:'Una riga di titolo attraversa il confine tra due intervalli di genere. Includi l’intera riga in un solo intervallo.',noTitleLines:'Nessuna riga ALTO di riferimento disponibile.'});
Object.assign(messages.en,{pairView:'Pair',allViews:'All witnesses',focusView:'Line by line',previousLine:'Previous line',nextLine:'Next line',linePosition:'Line {n} of {total}',facsimiles:'Facsimiles',loadingImages:'Loading facsimiles…',pairReference:'Reference in this comparison',alignmentSteps:'{done}/{total} stages completed · {left} remaining',stage0:'Reading ALTO',stage1:'Aligning words',stage2:'Checking uncertain passages',stage3:'Checking displaced passages'});
Object.assign(messages.it,{pairView:'Coppia',allViews:'Tutti i testimoni',focusView:'Riga per riga',previousLine:'Riga precedente',nextLine:'Riga successiva',linePosition:'Riga {n} di {total}',facsimiles:'Facsimili',loadingImages:'Caricamento dei facsimili…',pairReference:'Riferimento in questo confronto',alignmentSteps:'{done}/{total} fasi completate · {left} rimanenti',stage0:'Lettura degli ALTO',stage1:'Allineamento delle parole',stage2:'Verifica dei passaggi incerti',stage3:'Verifica dei passaggi spostati'});
Object.assign(messages.fr,{pairView:'Paire',allViews:'Tous les témoins',focusView:'Ligne par ligne',previousLine:'Ligne précédente',nextLine:'Ligne suivante',linePosition:'Ligne {n} sur {total}',facsimiles:'Fac-similés',loadingImages:'Chargement des fac-similés…',pairReference:'Référence de cette comparaison',alignmentSteps:'{done}/{total} étapes terminées · {left} restantes',stage0:'Lecture des ALTO',stage1:'Alignement des mots',stage2:'Vérification des passages incertains',stage3:'Vérification des passages déplacés'});
const ALIGNMENT_STAGES=4;
const alignmentJobs=new Set();
let witnessView='pair',focusRow=0;
let titleLines=new Set(),alignmentsInProgress=0;
let language='en',viewFilter='all',genreRanges=[],uniformGenre='prose',teiExportDraft=null;
function t(key,vars={}){let value=(messages[language]||messages.en)[key]||messages.en[key]||key;return value.replace(/\{(\w+)\}/g,(_,name)=>vars[name]??'')}
function setImageStatus(which,status){imageStatus[which]=status;const el=$(`imageCount${which}`);if(!status){el.textContent=t('none');el.removeAttribute('title');return}const good=status.good||[],bad=status.bad||[],short=good.length>3?`${good.slice(0,3).join(', ')} +${good.length-3}`:good.join(', ');el.textContent=bad.length?t('imagePartial',{n:good.length,files:bad.join(', ')}):good.length?t('imageVerified',{n:good.length,files:short}):t('imageInvalid');el.title=[...good.map(x=>`✓ ${x}`),...bad.map(x=>`✗ ${x}`)].join('\n')}
function setLanguage(code){language=messages[code]?code:'en';document.documentElement.lang=language;document.title=language==='fr'?'PRIMA · Espace de collation':language==='it'?'PRIMA · Spazio di collazione':'PRIMA · Collation workspace';document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));$('iiifA').placeholder=t('optionalFallback');if(A.length&&B.length){$('loadedStatus').textContent=t('backendUnits',{a:A.length,b:B.length,w:names[activeWitness]||''})+(alignmentMethod?` · ${t(alignmentMethod)}`:'');$('alignSummary').textContent=t('alignmentSummary',{n:groups.length})}else $('loadedStatus').textContent=t('noCorpus');witnessIds.forEach(id=>{if($(`imageCount${id}`))setImageStatus(id,imageStatus[id]||null)});renderWitnessInputs();renderComparisonControl();renderAutomaticSemanticStatus();renderAlignmentProgress();renderGenreEditor();saveBrowserSession();if(groups.length){render();renderMovements()}}
function decodeImage(url){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>img.naturalWidth&&img.naturalHeight?resolve():reject(Error('empty image'));img.onerror=()=>reject(Error('unreadable image'));img.src=url})}
async function loadFile(which,fileList){
 if(!fileList||!fileList.length)return;
 let previous=null;
 const rollback=()=>{if(!previous)return;rawByWitness[which]=previous.files;names[which]=previous.name;editedMode=previous.editedMode;if(which==='A')rawA=previous.files;const dossier=$(`dossierName${which}`);if(dossier)dossier.value=previous.name||'';if($(`file${which}`))$(`file${which}`).value=''};
 try{
  const selected=[...fileList].filter(f=>/\.(xml|alto)$/i.test(f.name));
  if(!selected.length)throw Error('No ALTO XML files were found in the selected dossier.');
  const files=await Promise.all(selected.map(async f=>({name:f.webkitRelativePath||f.name,text:await f.text()})));
  files.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
  previous={files:rawByWitness[which],name:names[which],editedMode};
  rawByWitness[which]=files;if(which==='A')rawA=files;
  const relative=selected[0].webkitRelativePath||'',folderName=relative.split('/').filter(Boolean)[0]||'',dossier=$(`dossierName${which}`),typedName=dossier?.dataset.userEdited==='true'?dossier.value.trim():'';
  names[which]=folderName||typedName||selected[0].name.replace(/\.[^.]+$/,'');if(dossier)dossier.value=names[which];
  editedMode=false;$('loadedStatus').textContent=t('fileSelected',{n:files.length,w:names[which]});
  if(rawA.length&&witnessIds.slice(1).some(id=>rawByWitness[id]?.length)){
   const success=await runAlign(false,which==='A'?null:[which]);
   if(!success)rollback();
   else if(which==='A')titleLines.clear();
  }
 }catch(e){rollback();alert(e.message)}
}
async function loadImages(which,fileList){if(!fileList)return;const selected=[...fileList];if(!selected.length){images[which].forEach(x=>URL.revokeObjectURL(x.url));images[which]=[];delete projectImageFiles[which];for(const key of Object.keys(projectImageLinks))if(key.startsWith(which+':')){delete projectImageLinks[key];delete imageOverrides[key]}setImageStatus(which,null);if(witnessView==='focus'&&groups.length)render();return}const status=$(`imageCount${which}`);status.textContent=t('imageLoading');const checked=await Promise.all(selected.map(async file=>{const url=URL.createObjectURL(file);try{await decodeImage(url);return{ok:true,item:{file,url,name:file.name}}}catch(e){URL.revokeObjectURL(url);return{ok:false,name:file.name}}}));const good=checked.filter(x=>x.ok).map(x=>x.item),bad=checked.filter(x=>!x.ok).map(x=>x.name);images[which].forEach(x=>URL.revokeObjectURL(x.url));images[which]=good;for(const key of Object.keys(imageOverrides))if(key.startsWith(which+':'))delete imageOverrides[key];for(const [key,name] of Object.entries(projectImageLinks)){if(key.startsWith(which+':')){const item=good.find(x=>x.name===name);if(item)imageOverrides[key]=item}}setImageStatus(which,{good:good.map(x=>x.name),bad});if(witnessView==='focus'&&groups.length)render()}
function groupItems(arr,g,side){const key=side==='A'?'aItems':'bItems';return Array.isArray(g[key])?g[key]:arr.slice(g[side==='A'?'a0':'b0'],g[side==='A'?'a1':'b1'])}
function groupText(arr,g,side){return groupItems(arr,g,side).map(x=>x.text).filter(Boolean).join(' ')}
// Identify a comparison unit by its readings and source lines so review choices
// survive when other units are moved and their numeric positions change.
function alignmentGroupKey(g){
 const sideKey=side=>{
  const items=groupItems(side==='A'?A:B,g,side);
  const reading=groupText(side==='A'?A:B,g,side);
  const sources=items.flatMap(item=>item.refs||[]).map(ref=>[ref.alto_file||'',ref.page||'',ref.line||'']);
  return[reading,sources];
 };
 return JSON.stringify([sideKey('A'),sideKey('B')]);
}
function preserveDecisionsByKey(oldGroups,newGroups,oldDecisions){
 const buckets=new Map();
 oldGroups.forEach((g,index)=>{
  const key=alignmentGroupKey(g),bucket=buckets.get(key)||[];
  bucket.push(oldDecisions[index]||{});
  buckets.set(key,bucket);
 });
 const next={};
 newGroups.forEach((g,index)=>{
  const bucket=buckets.get(alignmentGroupKey(g));
  if(bucket?.length){
   const saved=bucket.shift();
   if(Object.keys(saved).length)next[index]={...saved};
  }
 });
 return next;
}
function wordDiff(a,b){
 const x=a.split(/\s+/).filter(Boolean),y=b.split(/\s+/).filter(Boolean),n=x.length,m=y.length;
 const xKeys=x.map(tokenKey),yKeys=y.map(tokenKey);
 const d=Array.from({length:n+1},()=>Array(m+1).fill(0));
 for(let i=n;i>=0;i--)for(let j=m;j>=0;j--){
  if(i===n)d[i][j]=m-j;
  else if(j===m)d[i][j]=n-i;
  else d[i][j]=xKeys[i]===yKeys[j]?d[i+1][j+1]:1+Math.min(d[i+1][j],d[i][j+1],d[i+1][j+1]);
 }
 const aa=[],bb=[],diff=[];let i=0,j=0;
 while(i<n||j<m){
  if(i<n&&j<m&&xKeys[i]===yKeys[j]){aa.push({t:x[i],c:'same'});bb.push({t:y[j],c:'same'});i++;j++;continue}
  const k=diff.length;
  if(i<n&&j<m&&d[i+1][j+1]<=d[i+1][j]&&d[i+1][j+1]<=d[i][j+1]){aa.push({t:x[i],c:'var',v:k});bb.push({t:y[j],c:'var',v:k});diff.push({a:x[i++],b:y[j++]});continue}
  if(i<n&&(j===m||d[i+1][j]<=d[i][j+1])){aa.push({t:x[i],c:'var',v:k});diff.push({a:x[i++],b:'∅'});continue}
  if(j<m){bb.push({t:y[j],c:'var',v:k});diff.push({a:'∅',b:y[j++]})}
 }
 return{aa,bb,diff}
}
function compareUnit(a,b){if(!a.trim()&&b.trim()){let t=b.split(/\s+/).filter(Boolean);return{aa:[],bb:t.map(t=>({t,c:'var',v:0})),diff:[{a:'∅',b}]}}if(a.trim()&&!b.trim()){let t=a.split(/\s+/).filter(Boolean);return{aa:t.map(t=>({t,c:'var',v:0})),bb:[],diff:[{a,b:'∅'}]}}return wordDiff(a,b)}
function renderAlignmentProgress(){
 const stages=[...alignmentJobs].flat();
 if(!stages.length)return;
 const total=stages.length*ALIGNMENT_STAGES,done=stages.reduce((sum,n)=>sum+n,0);
 const percent=Math.floor(done*100/total);
 const fill=$('alignmentFill');
 if(fill.style)fill.style.width=`${percent}%`;
 $('alignmentProgress').setAttribute?.('aria-valuenow',String(percent));
 $('alignmentPercent').textContent=`${percent}%`;
 const running=[...new Set(stages.filter(n=>n<ALIGNMENT_STAGES))];
 $('alignmentStage').textContent=running.map(n=>t(`stage${n}`)).join(' · ');
 $('alignmentRemaining').textContent=t('alignmentSteps',{done,total,left:total-done});
}
async function requestAlignment(payload,update){
 const response=await fetch('/api/align',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify(payload)});
 if(!response.headers?.get('content-type')?.includes('application/x-ndjson')){
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Backend error');
  update(ALIGNMENT_STAGES);
  return data;
 }
 const reader=response.body.pipeThrough(new TextDecoderStream()).getReader();
 let buffer='';
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)throw Error(t('alignmentFailed'));
   buffer+=value;
   let newline;
   while((newline=buffer.indexOf('\n'))!==-1){
    const event=JSON.parse(buffer.slice(0,newline));
    buffer=buffer.slice(newline+1);
    if(event.error)throw Error(event.error);
    if(event.result){update(ALIGNMENT_STAGES);return event.result}
    if(Number.isInteger(event.completed)&&event.completed>0&&event.completed<ALIGNMENT_STAGES)update(event.completed);
   }
  }
 }finally{await reader.cancel()}
}
async function runAlign(useEdited=false,onlyWitnesses=null){
 // File imports scope the calculation to that witness. Only an explicit full
 // realignment (or a changed reference) rebuilds every comparison.
 useEdited=useEdited===true;
 const incremental=Array.isArray(onlyWitnesses);
 if(!incremental&&!useEdited&&editedMode)useEdited=true;
 const targets=useEdited?[activeWitness]:(incremental?onlyWitnesses:witnessIds.slice(1)).filter(id=>witnessIds.includes(id)&&id!=='A'&&rawByWitness[id]?.length);
 if(useEdited?(!A.length||!B.length):(!rawByWitness.A?.length||!targets.length)){$('loadedStatus').textContent=t('alignBoth');$('alignSummary').textContent=t('alignBoth');return false}
 if(!useEdited&&targets.some(id=>pairResults[id])&&!confirm(t(incremental?'replaceWitnessWarning':'rerunWarning'))){$('loadedStatus').textContent=t('alignmentCancelled');return false;}
 const button=$('alignBtn');button.disabled=true;
 alignmentsInProgress++;
 const progress=targets.map(()=>0);
 alignmentJobs.add(progress);
 const update=(index,completed)=>{progress[index]=completed;renderAlignmentProgress()};
 renderAlignmentProgress();
 $('alignmentActivity').hidden=false;
 $('alignmentToast').hidden=true;
 $('alignmentToastMessage').textContent='';
 $('loadedStatus').textContent='';
 $('alignSummary').textContent='';
 try{
  if(useEdited){
   const id=targets[0],data=await requestAlignment({sentences:{A,B},names:{A:names.A,B:names[id]}},n=>update(0,n));
   pairResults[id]={A:data.witnesses.A,B:data.witnesses.B,alignments:data.alignments,possible_transpositions:data.possible_transpositions||[],frequent_ambiguous_cases:data.frequent_ambiguous_cases||[],alignment_method:data.alignment_method,semantic_fallback:data.semantic_fallback};
   pairReviews[id]={decisions:{},movementDecisions:{}};
   editedMode=false;
  }else{
   const settled=await Promise.allSettled(targets.map(async(id,index)=>{
    try{
     const data=await requestAlignment({alto:{A:rawByWitness.A,B:rawByWitness[id]},names:{A:names.A,B:names[id]}},n=>update(index,n));
     return [id,data];
    }catch(error){throw Error(`${names[id]}: ${error.message}`)}
   }));
   const failure=settled.find(result=>result.status==='rejected');
   if(failure)throw failure.reason;
   const results=settled.map(result=>result.value);
   const nextResults=incremental?{...pairResults}:{},nextReviews=incremental?{...pairReviews}:{};if(incremental&&pairResults[activeWitness])nextReviews[activeWitness]={decisions,movementDecisions};for(const [id,data] of results){nextResults[id]={A:data.witnesses.A,B:data.witnesses.B,alignments:data.alignments,possible_transpositions:data.possible_transpositions||[],frequent_ambiguous_cases:data.frequent_ambiguous_cases||[],alignment_method:data.alignment_method,semantic_fallback:data.semantic_fallback};nextReviews[id]={decisions:{},movementDecisions:{}}}pairResults=nextResults;pairReviews=nextReviews;}
  const selected=pairResults[activeWitness]?activeWitness:Object.keys(pairResults)[0];activatePair(selected,false);renderComparisonControl();$('loadedStatus').textContent=`${Object.keys(pairResults).length} ${language==='fr'?'comparaisons calculées':language==='it'?'confronti calcolati':'witness comparisons aligned'} · ${t('backendUnits',{a:A.length,b:B.length,w:names[activeWitness]||''})} · ${t(alignmentMethod)}`;$('alignSummary').textContent=t('alignmentSummary',{n:groups.length});render();renderMovements();
  if(alignmentsInProgress===1){
   $('alignmentToast').hidden=false;
   $('alignmentToastMessage').textContent=t('alignmentComplete');
  }
  return true
 }catch(e){$('loadedStatus').textContent=t('error')+e.message;$('alignSummary').textContent=t('alignmentFailed');const err=$('editError');if(err)err.textContent=e.message;return false}
 finally{
  alignmentsInProgress--;
  if(!alignmentsInProgress)alignmentJobs.clear();
  button.disabled=alignmentsInProgress>0;
  $('alignmentActivity').hidden=!alignmentsInProgress;
 }
}
function refs(arr){if(!arr.length)return '—';return arr.flatMap(x=>x.refs||[]).map(r=>`${r.alto_file||''} · ${r.page} · ${r.line}`).join(' / ')}
function renderText(tokens,unit,review=decisions){return tokens.map(token=>{if(token.c==='same')return `<span>${esc(token.t)}</span>`;let status=review[unit]?.[token.v]||'';let cls=status==='keep'?'keep':status==='ignore'?'ignore':'var';return `<span class="token ${cls}" title="${t('difference',{n:token.v+1})}">${esc(token.t)}</span>`}).join(' ')}

function renderWitnessInputs(){const savedIIIF=Object.fromEntries(witnessIds.map(id=>[id,$(`iiif${id}`)?.value||'']));const container=$('additionalWitnesses'),imageRows=$('additionalImageRows'),iiifRows=$('additionalIIIFRows');if(!container)return;container.innerHTML='';if(imageRows)imageRows.innerHTML='';if(iiifRows)iiifRows.innerHTML='';witnessIds.slice(1).forEach((id,index)=>{const number=index+1,label=(language==='fr'?'Témoin ':language==='it'?'Testimone ':'Witness ')+number,imageLabel=(language==='fr'?'Images ':language==='it'?'Immagini ':'Images ')+number,iiifLabel=(language==='fr'?'URI IIIF ':language==='it'?'URI IIIF ':'IIIF URI ')+number;container.insertAdjacentHTML('beforeend',`<div class="witness-import-row"><div class="file-row"><label for="file${id}">${label}</label><input id="file${id}" type="file" multiple accept=".xml,.alto,text/xml" aria-label="${label} ALTO files"></div><div class="file-row"><label class="witness-name-label" for="dossierName${id}">${t('witnessName')}</label><input id="dossierName${id}" class="form-control" type="text" placeholder="e.g. BNCF II.IV.232" value="${esc(names[id]||'')}"></div></div>`);if(imageRows)imageRows.insertAdjacentHTML('beforeend',`<div class="file-row"><label for="images${id}">${imageLabel}</label><input id="images${id}" type="file" multiple accept="image/*" aria-label="${imageLabel}"><span class="status-note" id="imageCount${id}">${t('none')}</span></div>`);if(iiifRows)iiifRows.insertAdjacentHTML('beforeend',`<div class="file-row"><label for="iiif${id}">${iiifLabel}</label><input class="form-control" id="iiif${id}" type="url" placeholder="${t('optionalFallback')}"></div>`);if($(`iiif${id}`))$(`iiif${id}`).value=savedIIIF[id]||'';const fileInput=$(`file${id}`),nameInput=$(`dossierName${id}`),imageInput=$(`images${id}`);if(fileInput)fileInput.onchange=e=>loadFile(id,e.target.files);if(nameInput)nameInput.onchange=e=>{e.target.dataset.userEdited='true';names[id]=e.target.value.trim()||names[id];saveBrowserSession();if(groups.length){render();renderMovements()}};if(imageInput)imageInput.onchange=e=>loadImages(id,e.target.files);images[id]=images[id]||[];imageStatus[id]=imageStatus[id]||null;if(imageStatus[id])setImageStatus(id,imageStatus[id])});const lab=$('dossierNameA');if(lab&&rawByWitness.A?.length)lab.value=names.A||'';const add=$('addWitnessBtn');if(add){add.disabled=witnessIds.length>=10;add.title=add.disabled?t('witnessLimit'):''}const count=$('witnessLimit');if(count)count.textContent=add?.disabled?t('witnessLimit'):t('witnessCount',{n:witnessIds.length});}

function addWitness(){if(witnessIds.length>=10)return;const id=String.fromCharCode(65+witnessIds.length);witnessIds.push(id);rawByWitness[id]=[];names[id]=(language==='fr'?'Témoin ':language==='it'?'Testimone ':'Witness ')+(witnessIds.length-1);images[id]=[];imageStatus[id]=null;renderWitnessInputs();renderComparisonControl();saveBrowserSession()}
function renderComparisonControl(){const control=$('comparisonControl'),select=$('compareWitness');if(!control||!select)return;const ids=Object.keys(pairResults);control.hidden=!ids.length||witnessView!=='pair';if(!ids.length)return;select.innerHTML=ids.map(id=>`<option value="${id}">${esc(names[id])}</option>`).join('');select.value=pairResults[activeWitness]?activeWitness:ids[0];select.onchange=()=>activatePair(select.value)}
function activatePair(id,saveCurrent=true){if(!pairResults[id])return;if(saveCurrent&&pairResults[activeWitness])pairReviews[activeWitness]={decisions,movementDecisions};const p=pairResults[id];activeWitness=id;A=p.A;B=p.B;groups=p.alignments;movementCandidates=p.possible_transpositions;ambiguousCases=p.frequent_ambiguous_cases;alignmentMethod=p.alignment_method.startsWith('hybrid: automatic')?'alignAutomaticHybrid':p.alignment_method.startsWith('hybrid:')?'alignHybrid':p.alignment_method.includes('bertalign +')?'alignBert':p.alignment_method.startsWith('word-level')?'alignWord':'alignFallback';decisions=pairReviews[id]?.decisions||{};movementDecisions=pairReviews[id]?.movementDecisions||{};renderComparisonControl();if(groups.length){render();renderMovements();$('loadedStatus').textContent=t('backendUnits',{a:A.length,b:B.length,w:names[id]||''})+` · ${t(alignmentMethod)}`}}
function renderAutomaticSemanticStatus(){
 const el=$('automaticSemanticStatus');if(!el)return;
 const diagnostic=pairResults[activeWitness]?.semantic_fallback;el.hidden=!diagnostic;
 if(!diagnostic){el.textContent='';return}
 el.textContent=t('automatic_'+diagnostic.status,{accepted:diagnostic.accepted,attempted:diagnostic.attempted});
 const failures=[...new Set((diagnostic.windows||[]).map(w=>w.status).filter(status=>['not_installed','dependency_unavailable','model_unavailable','alignment_failed'].includes(status)))];
 if(diagnostic.status==='applied'&&failures.length)el.textContent+=' '+failures.map(status=>t('automatic_'+status)).join(' ');
}
function render(){
 saveBrowserSession();
 renderAutomaticSemanticStatus();
 renderGenreEditor();
 $('witnessViews').hidden=!groups.length;
 if(witnessView!=='pair'&&groups.length){renderWitnessComparison();return}
 if(!groups.length){$('results').innerHTML=`<div class="empty">${t('noAlignment')}</div>`;return}
 let html='',total=0,kept=0,pending=0,shown=0;
 groups.forEach((g,idx)=>{
  const aa=groupItems(A,g,'A'),bb=groupItems(B,g,'B'),at=groupText(A,g,'A'),bt=groupText(B,g,'B'),d=compareUnit(at,bt),state=decisions[idx]||{},conf=Number(g.similarity||0),uncertain=!!(g.semantic_review||(at&&bt&&conf<.45));
  total+=d.diff.length;
  for(let k=0;k<d.diff.length;k++){if(state[k]==='keep')kept++;else if(!state[k])pending++}
  const hasPending=d.diff.some((_,k)=>!state[k]);
  const visible=viewFilter==='all'||(viewFilter==='variants'&&d.diff.length>0)||(viewFilter==='pending'&&hasPending)||(viewFilter==='uncertain'&&uncertain);
  if(!visible)return;
  shown++;
  const allDone=d.diff.length&&d.diff.every((_,k)=>state[k]);
  const vbadge=d.diff.length?(allDone?`<span class="vbadge done">✓ ${d.diff.length} ${t('variant')}</span>`:`<span class="vbadge">${d.diff.length} ${t('variant')}</span>`):`<span class="vbadge done">✓ ${t('aligned')}</span>`;
  const tag=g.semantic_review?`<span class="status-note">${t('automaticRowReview')}</span>`:uncertain?`<span class="status-note">${t('needsReview')}</span>`:'';
  html+=`<article class="verse-row" id="unit-${idx}" data-unit="${idx}"><div class="verse-num"><span>${idx+1}</span>${vbadge}${tag}</div><div class="witnesses">${rowHTML('A',aa,d.aa,idx)}${rowHTML('B',bb,d.bb,idx)}</div><div class="row-actions">${d.diff.length?`<button class="btn btn-secondary" onclick="setAll(${idx},'ignore')">${t('ignore')}</button><button class="btn btn-green" onclick="setAll(${idx},'keep')">${t('keep')}</button>`:''}<button class="btn btn-blue edit" onclick="editUnit(${idx})">${t('editText')}</button><button class="btn btn-outline edit" onclick="adjustUnit(${idx})">${t('adjustAlignment')}</button></div>${d.diff.length?`<div class="variant-line"><span class="variant-label">${t('variants')} · ${conf.toFixed(2)} ${t('similarity')}</span>${d.diff.map((v,k)=>`<span class="variant-item"><b>${esc(v.a)} → ${esc(v.b)}</b><button class="btn btn-light keepmini ${state[k]==='keep'?'chosen':''}" onclick="setVariant(${idx},${k},'keep')">${t('keep')}</button><button class="btn btn-light ignoremini ${state[k]==='ignore'?'chosen':''}" onclick="setVariant(${idx},${k},'ignore')">${t('ignore')}</button></span>`).join('')}</div>`:''}</article>`;
 });
 $('results').innerHTML=html||`<div class="empty">${t('noFilterMatches')}</div>`;
 $('totalBadge').textContent=t('unitCount',{n:shown,total:groups.length});
 $('pendingBadge').textContent=t('pending',{n:pending,total});
 $('keptBadge').textContent=t('retained',{n:kept});
}
function witnessRows(){
 const ids=Object.keys(pairResults),reference=pairResults[ids[0]].A;
 const sourceIndex=new Map();
 reference.forEach((unit,index)=>{
  for(const ref of unit.refs||[]){
   const key=VariansExport.sourceLineKey(ref);
   if(key&&!sourceIndex.has(key))sourceIndex.set(key,index);
  }
 });
 const parent=reference.map((_,index)=>index);
 function root(index){
  while(parent[index]!==index){
   parent[index]=parent[parent[index]];
   index=parent[index];
  }
  return index;
 }
 const entries=[],insertions=[];
 for(const id of ids){
  const pair=pairResults[id];
  let anchor=reference.length;
  for(let index=pair.alignments.length-1;index>=0;index--){
   const group=pair.alignments[index],left=groupItems(pair.A,group,'A'),right=groupItems(pair.B,group,'B');
   if(!left.length&&!right.length)continue;
   const mapped=left.flatMap(item=>item.refs||[]).map(ref=>sourceIndex.get(VariansExport.sourceLineKey(ref))).filter(i=>i!==undefined);
   if(!mapped.length&&left.length){
    for(let i=group.a0;i<Math.min(group.a1,reference.length);i++)mapped.push(i);
   }
   const entry={id,index,left,right,group};
   if(mapped.length){
    anchor=Math.min(...mapped);
    const end=Math.max(...mapped);
    for(let i=anchor+1;i<=end;i++)parent[root(i)]=root(anchor);
    entries.push({...entry,anchor});
   }else{
    insertions.push({anchor,entries:[entry],reference:[]});
   }
  }
 }
 const rows=new Map();
 reference.forEach((unit,index)=>{
  const key=root(index);
  if(!rows.has(key))rows.set(key,{anchor:key,entries:[],reference:[]});
  rows.get(key).reference.push(unit);
 });
 for(const entry of entries)rows.get(root(entry.anchor)).entries.push(entry);
 const order=(a,b)=>a.id.localeCompare(b.id)||a.index-b.index;
 for(const row of rows.values())row.entries.sort(order);
 return [...rows.values(),...insertions].sort((a,b)=>a.anchor-b.anchor||
  Number(!!a.reference.length)-Number(!!b.reference.length)||
  (a.entries.length&&b.entries.length?order(a.entries[0],b.entries[0]):0));
}
function witnessEntryReview(entry){
 const {id,index,left,right,group}=entry,review=currentReview(id).decisions;
 const read=items=>items.map(item=>item.text).filter(Boolean).join(' ');
 const diff=compareUnit(read(left),read(right));
 return {...entry,review,diff,pending:diff.diff.filter((_,k)=>!review[index]?.[k]).length,
  kept:diff.diff.filter((_,k)=>review[index]?.[k]==='keep').length,
  uncertain:!!(group.semantic_review||(left.length&&right.length&&group.similarity<.45))};
}
function witnessReading(entry,showReference){
 const {id,index,left,right,review,diff}=entry,state=review[index]||{};
 const action=(method,label,classes)=>`<button type="button" class="btn ${classes}" onclick="reviewWitnessAction('${id}',${index},'${method}')">${t(label)}</button>`;
 return `<section class="multi-reading"><strong>${esc(names[id])}</strong>
 ${showReference&&left.length?`<details><summary>${t('pairReference')}</summary><div class="textline">${renderText(diff.aa,index,review)}</div></details>`:''}
 <div class="textline">${right.length?renderText(diff.bb,index,review):`<em>${t('noPassage')}</em>`}<div class="status-note">${esc(refs(right))}</div></div>
 ${diff.diff.length?`<div class="controls">${diff.diff.map((variant,k)=>`<span class="variant-item"><b>${esc(variant.a)} → ${esc(variant.b)}</b>
 <button type="button" class="btn btn-light keepmini ${state[k]==='keep'?'chosen':''}" onclick="reviewWitnessAction('${id}',${index},'keep',${k})">${t('keep')}</button>
 <button type="button" class="btn btn-light ignoremini ${state[k]==='ignore'?'chosen':''}" onclick="reviewWitnessAction('${id}',${index},'ignore',${k})">${t('ignore')}</button></span>`).join('')}</div>`:''}
 <div class="controls">${action('edit','editText','btn-blue')} ${action('adjust','adjustAlignment','btn-outline')}</div></section>`;
}
function reviewWitnessAction(id,index,action,variant){
 if(id!==activeWitness)activatePair(id);
 if(action==='edit')editUnit(index,witnessView==='focus');
 else if(action==='adjust')adjustUnit(index);
 else setVariant(index,variant,action);
}
function distinctLineRefs(items){
 return [...new Map(items.flatMap(item=>item.refs||[])
  .map(ref=>[VariansExport.sourceLineKey(ref),ref]).filter(([key])=>key)).values()];
}
async function renderFocusImages(target,row){
 const sources=[['A',row.reference],...Object.keys(pairResults).map(id=>[
  id,row.entries.filter(entry=>entry.id===id).flatMap(entry=>entry.right)
 ])];
 const blocks=await Promise.all(sources.map(async([id,items])=>{
  const lines=distinctLineRefs(items);
  const cards=await Promise.all((lines.length?lines:[null]).map(ref=>sourceLineCard(id,ref,true)));
  return cards.join('');
 }));
 if(target.isConnected)target.innerHTML=blocks.join('');
}
function renderWitnessComparison(){
 const all=witnessRows().map((row,index)=>({...row,index,entries:row.entries.map(witnessEntryReview)}));
 const entries=all.flatMap(row=>row.entries);
 const visible=all.filter(row=>viewFilter==='all'||row.entries.some(entry=>
  viewFilter==='variants'?entry.diff.diff.length:viewFilter==='pending'?entry.pending:entry.uncertain));
 $('totalBadge').textContent=t('unitCount',{n:visible.length,total:all.length});
 $('pendingBadge').textContent=t('pending',{n:entries.reduce((n,e)=>n+e.pending,0),total:entries.reduce((n,e)=>n+e.diff.diff.length,0)});
 $('keptBadge').textContent=t('retained',{n:entries.reduce((n,e)=>n+e.kept,0)});
 if(!visible.length){
  $('results').innerHTML=`<div class="empty">${t('noFilterMatches')}</div>`;
  return;
 }
 const text=row=>{
  const referenceText=row.reference.map(unit=>unit.text).join(' ');
  const ids=Object.keys(pairResults);
  return `<div><section class="multi-reading"><strong>${esc(names.A)}</strong><div class="textline">${esc(referenceText)||'—'}<div class="status-note">${esc(refs(row.reference))}</div></div></section>
  ${ids.map(id=>{
   const readings=row.entries.filter(entry=>entry.id===id);
   const pairText=readings.flatMap(entry=>entry.left).map(item=>item.text).join(' ');
   return readings.length?readings.map(entry=>witnessReading(entry,pairText!==referenceText)).join(''):
    `<section class="multi-reading"><strong>${esc(names[id])}</strong><div class="textline"><em>${t('noPassage')}</em></div></section>`;
  }).join('')}</div>`;
 };
 if(witnessView==='all'){
  $('results').innerHTML=visible.map(row=>`<article class="multi-row" id="witness-unit-${row.index}"><h3>${t('unitLabel',{n:row.index+1})}</h3>${text(row)}</article>`).join('');
  return;
 }
 let position=visible.findIndex(row=>row.index>=focusRow);
 if(position<0)position=visible.length-1;
 const row=visible[position];
 focusRow=row.index;
 $('results').innerHTML=`<article class="multi-row" id="witness-unit-${row.index}">
 <nav class="focus-nav"><button type="button" class="btn btn-outline" aria-label="${t('previousLine')}" ${position===0?'disabled':''} data-direction="previous" onclick="jumpWitnessRow(${visible[position-1]?.index??0},this.dataset.direction)">←</button>
 <strong>${t('linePosition',{n:position+1,total:visible.length})}</strong>
 <button type="button" class="btn btn-outline" aria-label="${t('nextLine')}" ${position===visible.length-1?'disabled':''} data-direction="next" onclick="jumpWitnessRow(${visible[position+1]?.index??0},this.dataset.direction)">→</button></nav>
 <div class="focus-grid"><div><div id="focusEditor"></div>${text(row)}</div><aside class="focus-images"><h3>${t('facsimiles')}</h3><div id="focusImages">${t('loadingImages')}</div></aside></div></article>`;
 renderFocusImages($('focusImages'),row);
}
function jumpWitnessRow(index,direction){
 focusRow=index;
 render();
 if(direction){
  const next=document.querySelector(`.focus-nav [data-direction="${direction}"]:not(:disabled)`);
  (next||document.querySelector('.focus-nav button:not(:disabled)'))?.focus();
 }
}
function setWitnessView(view,redraw=true){
 witnessView=view;
 document.querySelectorAll('[data-witness-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.witnessView===view)));
 if(redraw){renderComparisonControl();render()}
}
function renderMovements(){const summary=$('movementSummary');if(!summary)return;summary.textContent=movementCandidates.length?t('movementCount',{n:movementCandidates.length}):t('movementNone');$('movementList').innerHTML=movementCandidates.map((c,i)=>{const status=movementDecisions[i]||'';return `<article class="verse-row" style="grid-template-columns:75px minmax(0,1fr) 200px"><div class="verse-num">${i+1}<span class="vbadge">${c.status==='ambiguous'?t('ambiguous'):t('possibleMove')}</span></div><div class="witnesses"><div class="witness-line"><div class="witness-label">${esc(names.A)}</div><div class="textline">${esc(c.text_a)}</div></div><div class="witness-line"><div class="witness-label">${esc(names[activeWitness])}</div><div class="textline">${esc(c.text_b)}</div></div><div class="status-note">score ${Number(c.score).toFixed(2)} · margin ${Number(c.margin).toFixed(2)} · ${esc(t(status==='confirm'?'confirmed':status==='reject'?'rejected':'ambiguous'))}</div></div><div class="row-actions"><button class="btn btn-outline" onclick="openMovementImages(${i})">${t('openSources')}</button><button class="btn btn-green" onclick="setMovement(${i},'confirm')">${t('confirmMove')}</button><button class="btn btn-danger" onclick="setMovement(${i},'reject')">${t('rejectMove')}</button></div></article>`}).join('');$('ambiguityList').innerHTML=ambiguousCases.length?ambiguousCases.map(x=>`<div class="variant-item">${esc(x.text_a)} ↔ ${esc(x.text_b)} · ${x.count}</div>`).join(''):t('movementNone')}function setMovement(i,decision){movementDecisions[i]=decision;saveBrowserSession();renderMovements()}async function openMovementImages(i){const c=movementCandidates[i];await renderImageCompare(t('possibleMove')+' · '+(i+1),c.source_a||[],c.source_b||[])}
function rowHTML(which,arr,tokens,idx){
 const id=which==='B'?activeWitness:which;
 const line=arr.length?renderText(tokens,idx):`<em class="status-note">${t('noPassage')}</em>`;
 const source=refs(arr),firstRef=arr[0]?.refs?.[0];
 return `<div class="witness-line"><div class="witness-label">${esc(names[id])}${firstRef?` <a class="page-link" onclick="openImages(${idx})">${esc(firstRef.page||'p.?')}</a>`:''}</div><div class="textline">${line}<div class="status-note">${esc(source)}</div></div></div>`
}
function setVariant(i,k,action){decisions[i]=decisions[i]||{};decisions[i][k]=action;render()}
function setAll(i,action){let g=groups[i],d=compareUnit(groupText(A,g,'A'),groupText(B,g,'B'));decisions[i]=decisions[i]||{};d.diff.forEach((_,k)=>decisions[i][k]=action);render()}
function closeTextEditor(){
 const editor=$('focusEditor');
 if(editor?.firstElementChild)editor.innerHTML='';
 else $('modal').innerHTML='';
}
function editUnit(i,inline=false){
 const g=groups[i],a=groupText(A,g,'A'),b=groupText(B,g,'B');
 const fields=`<div class="iiif-head"><span>${t('editUnit',{n:i+1})}</span><button class="btn btn-outline" onclick="closeTextEditor()">${t('close')}</button></div><p class="status-note">${t('editHint')}</p><label>${esc(names.A)}<textarea id="editA" class="form-control" rows="3">${esc(a)}</textarea></label><label>${esc(names[activeWitness])}<textarea id="editB" class="form-control" rows="3">${esc(b)}</textarea></label><div id="editError" class="status-note" role="alert"></div><button id="saveEditBtn" class="btn btn-green" onclick="saveEdit(${i})">${t('saveRecalc')}</button>`;
 if(inline)$('focusEditor').innerHTML=`<section class="text-editor">${fields}</section>`;
 else $('modal').innerHTML=`<div class="iiif-modal"><div class="iiif-box text-editor" style="max-width:760px">${fields}</div></div>`;
}
async function saveEdit(i){
 const g=groups[i],aa=$('editA').value.trim(),bb=$('editB').value.trim();
 if(!aa&&!bb){$('editError').textContent=t('editBothEmpty');return}
 const previousA=groupText(A,g,'A'),previousB=groupText(B,g,'B');
 if(aa===previousA&&bb===previousB){closeTextEditor();return}
 if(Object.keys(decisions[i]||{}).length&&!confirm(t('editResetWarning')))return;
 // Word-difference indices can change in the edited unit. Invalidate its
 // decisions only; other units and witness comparisons retain their reviews.
 // Keep the unedited side's ALTO fragments intact as well.
 if(aa!==previousA){const refs=groupItems(A,g,'A').flatMap(x=>x.refs||[]).map(ref=>({...ref,line_text:aa}));g.aItems=aa?[{text:aa,refs}]:[]}
 if(bb!==previousB){const refs=groupItems(B,g,'B').flatMap(x=>x.refs||[]).map(ref=>({...ref,line_text:bb}));g.bItems=bb?[{text:bb,refs}]:[]}
 g.similarity=aa&&bb?similarityClient(aa,bb):0;
 pairResults[activeWitness].alignments=groups;
 decisions={...decisions};delete decisions[i];
 pairReviews[activeWitness]={decisions,movementDecisions};
 closeTextEditor();render();$('loadedStatus').textContent+=' · '+t('manualSaved');
}
function cloneLineItem(item){return {...item,refs:(item.refs||[]).map(ref=>({...ref}))}}
function draftItems(g,side){return g[side==='A'?'aItems':'bItems']||[]}
function adjustUnit(i){alignmentDraft={index:i,sourceSide:'B',groups:groups.map(g=>({...g,aItems:groupItems(A,g,'A').map(cloneLineItem),bItems:groupItems(B,g,'B').map(cloneLineItem)}))};renderAdjustUnit()}
function selectDraftSide(side){alignmentDraft.sourceSide=side;renderAdjustUnit()}
function draftSourceOptions(){const side=alignmentDraft.sourceSide;return alignmentDraft.groups.flatMap((g,gi)=>{const items=draftItems(g,side);return items.length?[`<optgroup label="${esc(t('unitLabel',{n:gi+1}))} · ${esc(groupText(A,g,'A').slice(0,36)||'—')}">${items.map((item,ii)=>`<option value="${gi}:${ii}">${esc(item.text)}</option>`).join('')}</optgroup>`]:[]}).join('')}
function draftTargetOptions(){return alignmentDraft.groups.map((g,gi)=>{const reference=groupText(A,g,'A').slice(0,32)||'—',witness=groupText(B,g,'B').slice(0,32)||'—';return `<option value="${gi}" ${gi===alignmentDraft.index?'selected':''}>${esc(t('unitLabel',{n:gi+1}))} · ${esc(names.A)}: ${esc(reference)} · ${esc(names[activeWitness])}: ${esc(witness)}</option>`}).join('')}
function draftPositionOptions(targetIndex){const items=draftItems(alignmentDraft.groups[targetIndex],alignmentDraft.sourceSide);return [`<option value="start">${esc(t('positionStart'))}</option>`,...items.map((item,index)=>`<option value="after:${index}">${esc(t('positionAfter',{text:item.text.slice(0,70)}))}</option>`),`<option value="end">${esc(t('positionEnd'))}</option>`].join('')}
function updateDraftPositions(){const target=Number($('moveTarget').value);$('movePosition').innerHTML=draftPositionOptions(target)}
function renderAdjustUnit(){if(!alignmentDraft)return;const i=alignmentDraft.index,g=alignmentDraft.groups[i],side=alignmentDraft.sourceSide,sourceOptions=draftSourceOptions(),targetOptions=draftTargetOptions(),positionOptions=draftPositionOptions(i),left=groupText(A,g,'A')||'—',right=groupText(B,g,'B')||'—',aSelected=side==='A'?' selected':'',bSelected=side==='B'?' selected':'';$('modal').innerHTML=`<div class="iiif-modal"><div class="iiif-box" style="max-width:1000px;max-height:92vh;overflow:auto"><div class="iiif-head"><span>${t('adjustTitle',{n:i+1})}</span><button class="btn btn-outline" onclick="alignmentDraft=null;$('modal').innerHTML=''">${t('close')}</button></div><p class="status-note">${t('adjustHint')}</p><div class="adjust-preview"><section class="adjust-reading${aSelected}" role="button" tabindex="0" aria-pressed="${side==='A'}" onclick="selectDraftSide('A')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectDraftSide('A')}"><h3>${esc(names.A)} · ${esc(t('clickToMove'))}</h3><div class="textline">${esc(left)}</div></section><section class="adjust-reading${bSelected}" role="button" tabindex="0" aria-pressed="${side==='B'}" onclick="selectDraftSide('B')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectDraftSide('B')}"><h3>${esc(names[activeWitness])} · ${esc(t('clickToMove'))}</h3><div class="textline">${esc(right)}</div></section></div><section class="adjust-section"><h3>${t('moveSourceHeading')} · ${esc(names[side==='A'?'A':activeWitness])}</h3><div class="adjust-actions"><label class="status-note">${t('selectSourceLine')}<select id="moveSource" class="form-control" style="width:100%;margin-top:4px">${sourceOptions||`<option value="">${t('noLinesLeft')}</option>`}</select></label><label class="status-note">${t('selectTargetUnit')}<select id="moveTarget" class="form-control" style="width:100%;margin-top:4px" onchange="updateDraftPositions()">${targetOptions}</select></label><label class="status-note">${t('selectPosition')}<select id="movePosition" class="form-control" style="width:100%;margin-top:4px">${positionOptions}</select></label></div><div class="controls" style="margin-top:10px"><button class="btn btn-blue" onclick="moveDraftLine()">${t('moveLine')}</button></div><details style="margin-top:12px"><summary class="status-note" style="cursor:pointer">${t('splitLine')}</summary><div class="controls" style="margin-top:8px"><input id="splitMarker" class="form-control" type="text" placeholder="${t('splitPlaceholder')}" style="min-width:260px"><button class="btn btn-outline" onclick="splitDraftLine()">${t('splitSelected')}</button></div><p class="status-note adjust-help">${t('splitHint')}</p></details></section><div id="alignmentEditError" class="status-note" role="alert"></div><div class="controls" style="margin-top:14px"><button class="btn btn-green" onclick="saveAdjustedUnit()">${t('saveAlignment')}</button><button class="btn btn-outline" onclick="alignmentDraft=null;$('modal').innerHTML=''">${t('cancel')}</button></div></div></div>`}
function splitDraftLine(){const selected=$('moveSource').value,marker=$('splitMarker').value;if(!selected||!marker){$('alignmentEditError').textContent=t('splitNeedMarker');return}const side=alignmentDraft.sourceSide,[gi,ii]=selected.split(':').map(Number),items=draftItems(alignmentDraft.groups[gi],side),item=items[ii],at=item?.text.indexOf(marker);if(!item||at<0){$('alignmentEditError').textContent=t('splitMarkerMissing');return}const cut=at+marker.length,left=item.text.slice(0,cut).trim(),right=item.text.slice(cut).trim();if(!left||!right){$('alignmentEditError').textContent=t('splitEmptyPart');return}const makePart=text=>({...cloneLineItem(item),text,refs:(item.refs||[]).map(ref=>({...ref,line_text:text}))});items.splice(ii,1,makePart(left),makePart(right));$('alignmentEditError').textContent='';renderAdjustUnit();$('moveSource').value=`${gi}:${ii+1}`}
function moveDraftLine(){const selected=$('moveSource').value,target=Number($('moveTarget').value),positionValue=$('movePosition').value;if(!selected||!Number.isInteger(target)){ $('alignmentEditError').textContent=t('selectLineAndTarget');return}const side=alignmentDraft.sourceSide,[from,at]=selected.split(':').map(Number),items=draftItems(alignmentDraft.groups[from],side),[item]=items.splice(at,1);if(!item){$('alignmentEditError').textContent=t('selectLineAndTarget');return}const destination=draftItems(alignmentDraft.groups[target],side);let position=positionValue==='start'?0:positionValue==='end'?destination.length:Number(positionValue.split(':')[1])+1;if(from===target&&at<position)position--;destination.splice(Math.max(0,Math.min(position,destination.length)),0,item);alignmentDraft.index=target;$('alignmentEditError').textContent='';renderAdjustUnit()}
function saveAdjustedUnit(){const previousGroups=groups,previousDecisions=decisions,next=alignmentDraft.groups.map((g,i)=>{const left=groupText(A,g,'A'),right=groupText(B,g,'B');return {...g,id:i,similarity:left&&right?similarityClient(left,right):0}}),nextDecisions=preserveDecisionsByKey(previousGroups,next,previousDecisions);groups=next;pairResults[activeWitness].alignments=next;alignmentDraft=null;decisions=nextDecisions;pairReviews[activeWitness]={decisions,movementDecisions};render();renderMovements();$('loadedStatus').textContent+=' · '+t('manualSaved');$('modal').innerHTML=''}
function similarityClient(a,b){const x=tokenKey(a).split('').join(' '),y=tokenKey(b).split('').join(' ');if(!x&&!y)return 1;if(!x||!y)return 0;let prev=Array.from({length:y.length+1},(_,i)=>i);for(let i=1;i<=x.length;i++){const cur=[i];for(let j=1;j<=y.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));prev=cur}return Math.max(0,1-prev[y.length]/Math.max(x.length,y.length))}
function resolveImage(which,ref){return resolveWitnessImage(which==='B'?activeWitness:which,ref)}
function resolveWitnessImage(id,ref){if(!ref)return null;const key=`${id}:${ref.alto_file||ref.page}`;if(imageOverrides[key])return imageOverrides[key];const stem=s=>String(s||'').split('/').pop().replace(/\.[^.]+$/,'').toLowerCase();const wanted=[stem(ref.image_file),stem(ref.alto_file),stem(ref.page)].filter(Boolean);let match=images[id].find(x=>wanted.some(w=>stem(x.name)===w||stem(x.name).includes(w)||w.includes(stem(x.name))));if(!match&&images[id].length===1)match=images[id][0];if(!match){const uri=$(`iiif${id}`).value.trim();if(uri)return {name:t('imageFallback'),url:uri}}return match||null}
function chooseImage(which,ref){if(!ref)return null;const id=which==='B'?activeWitness:which;let found=resolveImage(which,ref);if(found)return found;if(!images[id].length)return null;let list=images[id].map((x,i)=>`${i+1}. ${x.name}`).join('\n');let n=Number(prompt(t('chooseImage',{page:ref?.page||'',w:names[id],list})));if(Number.isInteger(n)&&n>0&&n<=images[id].length){let item=images[id][n-1];imageOverrides[`${id}:${ref?.alto_file||ref?.page}`]=item;projectImageLinks[`${id}:${ref?.alto_file||ref?.page}`]=item.name;saveBrowserSession();return item}return null}
async function cropLine(imageUrl,ref){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{try{const vals=String(ref.coords||'').split(',').map(Number);if(vals.length<4||vals.some(v=>!Number.isFinite(v))){resolve(null);return}let[x,y,w,h]=vals;const pw=Number(ref.page_width)||image.naturalWidth,ph=Number(ref.page_height)||image.naturalHeight,sx=image.naturalWidth/pw,sy=image.naturalHeight/ph;let left=x*sx,top=y*sy,width=w*sx,height=h*sy,padX=Math.max(12,height*.18),padY=Math.max(8,height*.24);left=Math.max(0,left-padX);top=Math.max(0,top-padY);width=Math.min(image.naturalWidth-left,width+padX*2);height=Math.min(image.naturalHeight-top,height+padY*2);const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width));canvas.height=Math.max(1,Math.round(height));canvas.getContext('2d').drawImage(image,left,top,width,height,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/png'))}catch(e){reject(e)}};image.onerror=()=>reject(Error('Immagine non leggibile'));image.src=imageUrl})}
async function sourceLineCard(which,ref,automatic=false){const id=automatic?which:which==='B'?activeWitness:which,item=automatic?resolveWitnessImage(id,ref):chooseImage(which,ref);let crop=null;if(item&&ref)try{crop=await cropLine(item.url,ref)}catch(e){}const text=ref?.line_text||t('notAvailable');return `<figure class="source-line-card"><figcaption><b>${esc(names[id])}</b><span>${esc(ref?`${ref.alto_file||''} · ${t('page')} ${ref.page} · ${t('line')} ${ref.line}`:'')}</span></figcaption>${crop?`<img class="line-crop" src="${crop}" alt="${t('line')} ${esc(ref.line)}">`:item?`<img class="page-fallback" src="${esc(item.url)}" alt="${t('page')} ${esc(ref?.page||'')}">`:`<div class="no-image">${t('missingImage')}</div>`}${item?`<details class="full-page-details"><summary>${t('fullPage')}</summary><img class="full-page" src="${esc(item.url)}" alt="${t('fullPage')} ${esc(ref?.page||'')}"></details>`:''}<div class="image-reading">${esc(text)}</div></figure>`}
async function openImages(unitIndex){const g=groups[unitIndex],ra=groupItems(A,g,'A').flatMap(x=>x.refs||[]),rb=groupItems(B,g,'B').flatMap(x=>x.refs||[]);await renderImageCompare(t('lineCompare',{n:unitIndex+1}),ra,rb)}async function renderImageCompare(title,ra,rb){const modal=$('modal');modal.innerHTML=`<div class="iiif-modal"><div class="iiif-box image-compare"><div class="iiif-head"><span>${esc(title)}</span><button class="btn btn-outline" onclick="$('modal').innerHTML=''">${t('close')}</button></div><div class="line-compare"><section class="line-witness"><h3>${esc(names.A)} <small>${t('rows',{n:ra.length})}</small></h3><div id="lineA"></div></section><section class="line-witness"><h3>${esc(names[activeWitness])} <small>${t('rows',{n:rb.length})}</small></h3><div id="lineB"></div></section></div><p class="crop-note">${t('cropNote')}</p></div></div>`;const [cardsA,cardsB]=await Promise.all([Promise.all(ra.map(r=>sourceLineCard('A',r))),Promise.all(rb.map(r=>sourceLineCard('B',r)))]);if(!document.getElementById('lineA'))return;$('lineA').innerHTML=cardsA.join('')||`<div class="no-image">${t('noPassageIn',{w:'A'})}</div>`;$('lineB').innerHTML=cardsB.join('')||`<div class="no-image">${t('noPassageIn',{w:'B'})}</div>`}
function currentReview(id){return id===activeWitness?{decisions,movementDecisions}:pairReviews[id]||{decisions:{},movementDecisions:{}}}
function selectedVariantEdits(id){const pair=pairResults[id];if(!pair)return[];const state=currentReview(id).decisions||{},out=[];let offset=0;for(let gi=0;gi<pair.alignments.length;gi++){const g=pair.alignments[gi],left=groupText(pair.A,g,'A'),right=groupText(pair.B,g,'B'),d=compareUnit(left,right),selected=new Set(Object.entries(state[gi]||{}).filter(([,v])=>v==='keep').map(([k])=>Number(k)));for(const k of selected){const aPos=[];d.aa.forEach((x,pos)=>{if(x.c==='var'&&x.v===k)aPos.push(pos)});const bTokens=d.bb.filter(x=>x.c==='var'&&x.v===k).map(x=>x.t);let start=aPos.length?aPos[0]:d.aa.findIndex(x=>x.c==='var'&&x.v>k);if(start<0)start=d.aa.length;const end=aPos.length?aPos[aPos.length-1]+1:start;out.push({id,a0:offset+start,a1:offset+end,tokens:bTokens,group:gi,variant:k})}offset+=left.split(/\s+/).filter(Boolean).length}return out}
function exportReferenceUnits(){
 const pair=pairResults[Object.keys(pairResults)[0]];
 return pair?pair.alignments.map(g=>({text:groupText(pair.A,g,'A'),items:groupItems(pair.A,g,'A'),refs:groupItems(pair.A,g,'A').flatMap(item=>item.refs||[])})):[];
}
function exportIdentifiers(){return VariansExport.witnessIdentifiers(['A',...Object.keys(pairResults)],names)}
function effectiveGenreRanges(total,ranges=genreRanges,genre=uniformGenre){return ranges.length?ranges:[{start:1,end:total,genre}]}
function exportError(error){return t(['rangeCoverage','variantCrossesBoundary','poetrySourceMapping','poetryLineBoundary','titleLineBoundary'].includes(error.message)?error.message:'error')+(['rangeCoverage','variantCrossesBoundary','poetrySourceMapping','poetryLineBoundary','titleLineBoundary'].includes(error.message)?'':error.message)}
function referenceTitleOptions(units){
 const options=new Map();
 for(const unit of units)for(const ref of unit.refs){
  const key=VariansExport.sourceLineKey(ref);
  if(key&&!options.has(key))options.set(key,ref);
 }
 return options;
}
function renderTitleOptions(units,draft){
 const options=referenceTitleOptions(units);
 draft.titleKeys=[...options.keys()];
 $('titleLineOptions').innerHTML=[...options].map(([key,ref],i)=>
  `<label><input type="checkbox" data-title-index="${i}" ${draft.titles.has(key)?'checked':''}><span>${esc(ref.line_text||'')}<br><small>${esc(refs([{refs:[ref]}]))}</small></span></label>`
 ).join('')||esc(t('noTitleLines'));
}
function renderGenreEditor(){
 if(!teiExportDraft)return;
 const draft=teiExportDraft;
 $('teiUniform').checked=draft.mode==='uniform';$('teiMixed').checked=draft.mode==='mixed';
 $('uniformGenreField').hidden=draft.mode!=='uniform';$('mixedGenreFields').hidden=draft.mode!=='mixed';
 $('genre').value=draft.genre;
 const units=exportReferenceUnits(),first=Object.keys(pairResults)[0];
 $('rangeBasis').textContent=units.length?t('rangeBasis',{n:units.length,reference:names.A,witness:names[first]}):t('noAlignment');
 $('addGenreRange').disabled=!units.length;
 $('genreRangeRows').innerHTML=draft.ranges.map((r,i)=>`<div class="genre-range-row"><label>${t('fromUnit')}<input class="form-control" type="number" min="1" max="${units.length}" value="${r.start}" data-range="${i}" data-field="start"></label><label>${t('toUnit')}<input class="form-control" type="number" min="1" max="${units.length}" value="${r.end}" data-range="${i}" data-field="end"></label><label>${t('teiStructure')}<select class="form-control" data-range="${i}" data-field="genre">${['prose','poetry','drama'].map(g=>`<option value="${g}" ${g===r.genre?'selected':''}>${t(g)}</option>`).join('')}</select></label><button class="btn btn-outline" type="button" data-remove-range="${i}">${t('removeRange')}</button></div>`).join('');
 updateGenreRangeStatus();
 $('referenceUnitList').innerHTML=units.map((u,i)=>`<p><b>${i+1}.</b> ${esc(u.text)||'—'}<br><span class="status-note">${esc(refs([u]))}</span></p>`).join('');
 renderTitleOptions(units,draft);
 const idMap=exportIdentifiers();
 $('witnessExportIds').textContent=t('exportIds')+' '+Object.entries(idMap).map(([id,value])=>`${names[id]} → ${value}`).join(' · ');
}
function updateGenreRangeStatus(){
 if(!teiExportDraft)return;
 const units=exportReferenceUnits(),draft=teiExportDraft;
 $('teiExportError').textContent='';
 let status=t('uniformHint',{genre:t(draft.genre)});
 if(draft.mode==='mixed')try{VariansExport.validateGenreRanges(draft.ranges,units.length);status=t('rangesValid')}catch(error){status=exportError(error)}
 $('genreRangeStatus').textContent=status;
}
function buildTEI(ranges=genreRanges,genre=uniformGenre,titles=titleLines){
 const ids=Object.keys(pairResults);if(!ids.length)throw Error(t('noAlignment'));
 const referenceUnits=exportReferenceUnits(),idMap=exportIdentifiers();
 const edits=ids.flatMap(selectedVariantEdits).map(e=>e.id===ids[0]?{...e,referenceUnit:e.group}:e);
 const sourceUnits=pairResults[ids[0]].A;
 const rangesToRender=effectiveGenreRanges(referenceUnits.length,ranges,genre);
 const body=VariansExport.renderGenreRanges(referenceUnits,rangesToRender,
  (start,end)=>VariansExport.renderApparatus(referenceUnits,edits,ids,idMap,start,end),
  (start,end)=>VariansExport.renderALTOPoetry(referenceUnits,sourceUnits,edits,ids,idMap,start,end),
  titles.size?(start,end)=>VariansExport.renderTitleRange(referenceUnits,sourceUnits,edits,ids,idMap,start,end,titles):null);
 const witnesses=['A',...ids].map(id=>`<witness xml:id="${esc(idMap[id])}">${esc(names[id])}</witness>`).join('');
 return `<?xml version="1.0" encoding="UTF-8"?>\n<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>${esc(t('teiTitle'))}</title></titleStmt><publicationStmt><p>${esc(t('teiExport'))}</p></publicationStmt><sourceDesc><listWit>${witnesses}</listWit></sourceDesc></fileDesc></teiHeader><text><body>${body}</body></text></TEI>`;
}
function exportTEI(){
 if(!Object.keys(pairResults).length){alert(t('noAlignment'));return}
 teiExportDraft={genre:uniformGenre,titles:new Set(titleLines),ranges:genreRanges.map(r=>({...r})),mode:genreRanges.length?'mixed':'uniform'};
 $('teiExportError').textContent='';renderGenreEditor();$('teiExportDialog').showModal();
}
function confirmTeiExport(){
 if(!teiExportDraft)return;
 const draft=teiExportDraft;
 try{
  const ranges=draft.mode==='mixed'?draft.ranges:[];
  if(draft.mode==='mixed')VariansExport.validateGenreRanges(ranges,exportReferenceUnits().length);
  const xml=buildTEI(ranges,draft.genre,draft.titles);
  uniformGenre=draft.genre;titleLines=draft.titles;genreRanges=ranges.map(r=>({...r}));
  saveBrowserSession();download(t('teiName'),xml,'application/tei+xml');$('teiExportDialog').close();teiExportDraft=null;
 }catch(error){$('teiExportError').textContent=exportError(error)}
}
function buildJSONExport(){
 const ids=Object.keys(pairResults);if(!ids.length)throw Error(t('noAlignment'));
 const units=exportReferenceUnits(),idMap=exportIdentifiers(),ranges=effectiveGenreRanges(units.length);
 VariansExport.validateGenreRanges(ranges,units.length);
 const titles=[...referenceTitleOptions(units)].flatMap(([key,ref])=>titleLines.has(key)
  ? [{alto_file:ref.alto_file||'',page:ref.page||'',line:ref.line}] : []);
 return {
  reference:{id:idMap.A,name:names.A},
  witnesses:Object.fromEntries(ids.map(id=>[idMap[id],names[id]])),
  structure:{comparisonWitness:idMap[ids[0]],ranges,...(titles.length?{titleLines:titles}:{})},
  comparisons:Object.fromEntries(ids.map(id=>{const p=pairResults[id];return[idMap[id],{alignmentMethod:p.alignment_method,semanticFallback:p.semantic_fallback,alignments:p.alignments.map((g,i)=>({unit:i+1,readingReference:groupText(p.A,g,'A'),readingWitness:groupText(p.B,g,'B'),sourceReference:refs(groupItems(p.A,g,'A')),sourceWitness:refs(groupItems(p.B,g,'B')),decisions:currentReview(id).decisions[i]||{},similarity:g.similarity,alignmentSource:g.alignment_source||'lexical',requiresReview:!!g.semantic_review}))}]}))
 };
}
function exportJSON(){try{download(t('jsonName'),JSON.stringify(buildJSONExport(),null,2),'application/json')}catch(error){alert(exportError(error))}}
function download(name,content,type){let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function goToUnit(index){
 if(witnessView!=='pair'){
  const position=witnessRows().findIndex(row=>row.entries.some(entry=>entry.id===activeWitness&&entry.index===index));
  if(position<0)return;
  if(viewFilter!=='all'){$('resultFilter').value='all';viewFilter='all'}
  focusRow=position;
  render();
  $(`witness-unit-${position}`)?.scrollIntoView({block:'center'});
  return;
 }
if(!$(`unit-${index}`)){ $('resultFilter').value='all';viewFilter='all';render()}const row=$(`unit-${index}`);if(row){row.scrollIntoView({behavior:'smooth',block:'center'});row.classList.add('focus-review');setTimeout(()=>row.classList.remove('focus-review'),1600)}}
function nextPending(){
 if(witnessView!=='pair'){
  const pending=witnessRows().map((row,index)=>({row,index})).filter(({row})=>row.entries.some(entry=>witnessEntryReview(entry).pending));
  if(!pending.length){alert(t('noPendingLeft'));return}
  const next=pending.find(item=>item.index>focusRow)||pending[0];
  viewFilter='pending';$('resultFilter').value=viewFilter;jumpWitnessRow(next.index);
  $(`witness-unit-${next.index}`)?.scrollIntoView({block:'center'});
  return;
 }
 let index=groups.findIndex((g,i)=>{const d=compareUnit(groupText(A,g,'A'),groupText(B,g,'B')).diff;return d.some((_,k)=>!decisions[i]?.[k])});if(index<0){alert(t('noPendingLeft'));return}viewFilter='pending';$('resultFilter').value='pending';render();goToUnit(index)}
function showRecurring(){let counts={};groups.forEach((g,i)=>compareUnit(groupText(A,g,'A'),groupText(B,g,'B')).diff.forEach(d=>{let key=`${d.a} → ${d.b}`;counts[key]=counts[key]||{count:0,units:[]};counts[key].count++;counts[key].units.push(i)}));let found=Object.entries(counts).filter(([,v])=>v.count>1);$('recurringText').innerHTML=found.length?found.map(([variant,v])=>`<button class="variant-link" onclick="goToUnit(${v.units[0]})">${esc(t('recurringItem',{variant,count:v.count}))}</button>`).join(''):t('noCorpusRepeat')}
// Versioned portable sessions. Images remain external; blob URLs never persist.
let projectImageLinks={},projectImageFiles={},pendingProjectOperations=0,projectOpening=false;
const PROJECT_FORMAT='varians-project',PROJECT_VERSION=1,MAX_PROJECT_BYTES=100*1024*1024;
function captureProject(detach=true){
 const reviews=Object.fromEntries(Object.keys(pairResults).map(id=>[id,currentReview(id)]));
 const state={witnessIds,names:Object.fromEntries(witnessIds.map(id=>[id,names[id]])),rawByWitness:Object.fromEntries(witnessIds.map(id=>[id,rawByWitness[id]])),pairResults,pairReviews:reviews,activeWitness,editedMode,
  language,viewFilter,genre:uniformGenre,genreRanges,titleLines:[...titleLines],
  iiif:Object.fromEntries(witnessIds.map(id=>[id,$(`iiif${id}`)?.value||''])),
  imageFiles:Object.fromEntries(witnessIds.map(id=>[id,images[id]?.length?images[id].map(x=>x.name):(projectImageFiles[id]||[])])),
  imageLinks:{...projectImageLinks,...Object.fromEntries(Object.entries(imageOverrides).map(([key,item])=>[key,item.name]))}};
 const project={format:PROJECT_FORMAT,version:PROJECT_VERSION,state};
 return detach?JSON.parse(JSON.stringify(project)):project;
}
function validateProject(project){
 const fail=()=>{throw Error(t('invalidProject'))},obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const strings=x=>Array.isArray(x)&&x.every(v=>typeof v==='string');
 if(!obj(project)||project.format!==PROJECT_FORMAT||project.version!==PROJECT_VERSION||!obj(project.state))fail();
 // Reject dangerous object keys before placing imported data in application state.
 const inspect=x=>{if(x&&typeof x==='object')for(const key of Object.keys(x)){if(['__proto__','constructor','prototype'].includes(key))fail();inspect(x[key])}};
 inspect(project);
 const s=project.state,ids=s.witnessIds;
 if(!strings(ids)||!ids.length||ids.length>10||ids.some((id,i)=>id!==String.fromCharCode(65+i)))fail();
 for(const key of ['names','rawByWitness','pairResults','pairReviews','iiif','imageFiles','imageLinks'])if(!obj(s[key]))fail();
 if(!['en','fr','it'].includes(s.language)||!['all','variants','pending','uncertain'].includes(s.viewFilter)||!['prose','poetry','drama'].includes(s.genre)||typeof s.editedMode!=='boolean')fail();
 if(s.genreRanges!==undefined&&(!Array.isArray(s.genreRanges)||!s.genreRanges.every(r=>obj(r)&&Number.isInteger(r.start)&&Number.isInteger(r.end)&&['prose','poetry','drama'].includes(r.genre))))fail();
 if(s.titleLines!==undefined&&!strings(s.titleLines))fail();
 const refs=value=>Array.isArray(value)&&value.every(r=>obj(r)&&['page','line','alto_file','image_file','coords','line_text'].every(k=>r[k]===undefined||typeof r[k]==='string'));
 const units=value=>Array.isArray(value)&&value.every(u=>obj(u)&&typeof u.text==='string'&&refs(u.refs));
 for(const id of ids){
  if(typeof s.names[id]!=='string'||!Array.isArray(s.rawByWitness[id])||!s.rawByWitness[id].every(f=>obj(f)&&typeof f.name==='string'&&typeof f.text==='string')||!strings(s.imageFiles[id])||typeof s.iiif[id]!=='string')fail();
  if(s.iiif[id]){try{if(!['https:','http:'].includes(new URL(s.iiif[id]).protocol))fail()}catch{fail()}}
 }
 for(const key of ['names','rawByWitness','iiif','imageFiles'])if(Object.keys(s[key]).some(id=>!ids.includes(id)))fail();
 for(const [key,name] of Object.entries(s.imageLinks))if(!ids.includes(key.split(':')[0])||typeof name!=='string')fail();
 const index=(key,length)=>/^\d+$/.test(key)&&Number(key)<length;
 for(const [id,p] of Object.entries(s.pairResults)){
  if(id==='A'||!ids.includes(id)||!obj(p)||!units(p.A)||!units(p.B)||!Array.isArray(p.alignments)||typeof p.alignment_method!=='string'||!Array.isArray(p.possible_transpositions)||!Array.isArray(p.frequent_ambiguous_cases))fail();
  for(const g of p.alignments){
   if(!obj(g)||typeof g.similarity!=='number'||!Number.isFinite(g.similarity))fail();
   for(const [side,arr] of [['a',p.A],['b',p.B]]){
    if(g[side+'Items']!==undefined){if(!units(g[side+'Items']))fail()}
    else if(!Number.isInteger(g[side+'0'])||!Number.isInteger(g[side+'1'])||g[side+'0']<0||g[side+'1']<g[side+'0']||g[side+'1']>arr.length)fail();
   }
  }
  for(const c of p.possible_transpositions)if(!obj(c)||typeof c.text_a!=='string'||typeof c.text_b!=='string'||!refs(c.source_a)||!refs(c.source_b)||!Number.isFinite(c.score)||!Number.isFinite(c.margin))fail();
  for(const c of p.frequent_ambiguous_cases)if(!obj(c)||typeof c.text_a!=='string'||typeof c.text_b!=='string'||!Number.isFinite(c.count))fail();
  const review=s.pairReviews[id];if(!obj(review)||!obj(review.decisions)||!obj(review.movementDecisions))fail();
  for(const [key,choices] of Object.entries(review.decisions)){
   if(!index(key,p.alignments.length)||!obj(choices))fail();
   const g=p.alignments[key],count=compareUnit(groupText(p.A,g,'A'),groupText(p.B,g,'B')).diff.length;
   for(const [variant,value] of Object.entries(choices))if(!index(variant,count)||!['keep','ignore'].includes(value))fail();
  }
  for(const [key,value] of Object.entries(review.movementDecisions))if(!index(key,p.possible_transpositions.length)||!['confirm','reject'].includes(value))fail();
 }
 if(Object.keys(s.pairReviews).some(id=>!Object.hasOwn(s.pairResults,id)))fail();
 if(Object.keys(s.pairResults).length?!Object.hasOwn(s.pairResults,s.activeWitness):s.activeWitness!=='B')fail();
 return s;
}
Object.assign(messages.en,{sessionRestored:'Session restored',sessionStorageUnavailable:'Automatic session saving is unavailable. You can still use Save project.'});
Object.assign(messages.it,{sessionRestored:'Sessione ripristinata',sessionStorageUnavailable:'Il salvataggio automatico non è disponibile. Puoi usare Salva progetto.'});
Object.assign(messages.fr,{sessionRestored:'Session restaurée',sessionStorageUnavailable:'La sauvegarde automatique est indisponible. Vous pouvez utiliser Enregistrer le projet.'});
let sessionDB,sessionKey,sessionSaveScheduled=false,sessionImagesDirty=false,sessionRestoring=true;
function saveBrowserSession(imagesChanged=false){
 sessionImagesDirty||=imagesChanged;
 if(!sessionDB||sessionRestoring||pendingProjectOperations||sessionSaveScheduled)return;
 sessionSaveScheduled=true;
 queueMicrotask(()=>{
  sessionSaveScheduled=false;
  if(pendingProjectOperations||sessionRestoring)return;
  try{
   const saved={project:captureProject(false),view:{witnessView,focusRow}};
   const files=sessionImagesDirty?Object.fromEntries(witnessIds.map(id=>[id,images[id].map(item=>item.file)])):null;
   const transaction=sessionDB.transaction('sessions','readwrite'),store=transaction.objectStore('sessions');
   transaction.onabort=()=>{
    sessionImagesDirty||=!!files;
    $('sessionStatus').textContent=t('sessionStorageUnavailable');
   };
   store.put(saved,sessionKey);
   if(files){
    store.put(files,sessionKey+':images');
    sessionImagesDirty=false;
   }
  }catch(error){$('sessionStatus').textContent=t('sessionStorageUnavailable')}
 });
}
function sessionRequest(request){
 return new Promise((resolve,reject)=>{
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}
async function restoreBrowserSession(){
 if(typeof indexedDB==='undefined')return;
 const main=document.querySelector('main');
 main.inert=true;
 try{
  sessionKey=sessionStorage.getItem('varians-session');
  if(!sessionKey){sessionKey=Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('');sessionStorage.setItem('varians-session',sessionKey)}
  const request=indexedDB.open('varians-workspace',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('sessions');
  sessionDB=await sessionRequest(request);
  const store=sessionDB.transaction('sessions').objectStore('sessions');
  const [saved,files]=await Promise.all([sessionRequest(store.get(sessionKey)),sessionRequest(store.get(sessionKey+':images'))]);
  if(!saved)return;
  restoreProject(validateProject(saved.project));
  for(const id of witnessIds){
   const restored=(files?.[id]||[]).filter(file=>file instanceof File&&projectImageFiles[id].includes(file.name));
   images[id]=restored.map(file=>({file,name:file.name,url:URL.createObjectURL(file)}));
   for(const [key,name] of Object.entries(projectImageLinks)){
    if(!key.startsWith(id+':'))continue;
    const item=images[id].find(candidate=>candidate.name===name);
    if(item)imageOverrides[key]=item;
   }
   if(restored.length)setImageStatus(id,{good:restored.map(file=>file.name),bad:[]});
  }
  const view=saved.view;
  if(Number.isSafeInteger(view?.focusRow)&&view.focusRow>=0)focusRow=view.focusRow;
  if(['pair','all','focus'].includes(view?.witnessView))setWitnessView(view.witnessView);
  $('projectStatus').textContent='';
  $('sessionStatus').textContent=t('sessionRestored');
 }catch(error){
  $('sessionStatus').textContent=t('sessionStorageUnavailable');
 }finally{
  sessionRestoring=false;
  main.inert=false;
 }
}
function saveProject(){
 if(pendingProjectOperations){alert(t('projectBusy'));return}
 if(!Object.values(rawByWitness).some(files=>files.length)&&!Object.keys(pairResults).length){alert(t('projectEmpty'));return}
 if(alignmentDraft||$('editA')){alert(t('finishProjectEdit'));return}
 const project=captureProject();validateProject(project);
 const content=JSON.stringify(project,null,2);
 if(new Blob([content]).size>MAX_PROJECT_BYTES)throw Error(t('projectTooLarge'));
 download('varians-project.json',content,'application/json');
 $('projectStatus').textContent=t('projectSaved');
}
function restoreProject(s){
 // Validation and replacement confirmation happen before touching existing state.
 Object.values(images).flat().forEach(item=>{if(item.url?.startsWith('blob:'))URL.revokeObjectURL(item.url)});
 witnessIds=s.witnessIds;names=s.names;rawByWitness=s.rawByWitness;rawA=rawByWitness.A;
 pairResults=s.pairResults;pairReviews=s.pairReviews;activeWitness=s.activeWitness;editedMode=s.editedMode;
 images=Object.fromEntries(witnessIds.map(id=>[id,[]]));imageStatus={};imageOverrides={};
 projectImageLinks=s.imageLinks;projectImageFiles=s.imageFiles;
 A=[];B=[];groups=[];decisions={};movementCandidates=[];movementDecisions={};ambiguousCases=[];
 alignmentDraft=null;alignmentMethod='';$('modal').innerHTML='';$('recurringText').textContent='';
 $('fileA').value='';$('imagesA').value='';$('dossierNameA').value=names.A;$('dossierNameA').dataset.userEdited='true';
 if($('teiExportDialog').open)$('teiExportDialog').close();teiExportDraft=null;
 setWitnessView('pair',false);focusRow=0;
 genreRanges=s.genreRanges||[];uniformGenre=s.genre;titleLines=new Set(s.titleLines||[]);
 language=s.language;$('language').value=language;viewFilter=s.viewFilter;$('resultFilter').value=viewFilter;$('genre').value=s.genre;
 setLanguage(language);
 for(const id of witnessIds){$(`iiif${id}`).value=s.iiif[id];$(`dossierName${id}`).dataset.userEdited='true'}
 if(Object.keys(pairResults).length)activatePair(activeWitness,false);
 else{$('alignSummary').textContent='';$('totalBadge').textContent=t('unitCount',{n:0,total:0});$('pendingBadge').textContent=t('pending',{n:0,total:0});$('keptBadge').textContent=t('retained',{n:0})}
 render();renderMovements();
 $('projectStatus').textContent=t('projectOpened');
 for(const id of witnessIds)if(s.imageFiles[id].length)$(`imageCount${id}`).textContent=t('relinkImages',{files:s.imageFiles[id].join(', ')});
}
async function openProjectFile(file){
 if(!file)return;
 if(pendingProjectOperations){alert(t('projectBusy'));return}
 pendingProjectOperations++;projectOpening=true;
 try{
  if(file.size>MAX_PROJECT_BYTES)throw Error(t('projectTooLarge'));
  const s=validateProject(JSON.parse(await file.text()));
  const hasSession=Object.values(rawByWitness).some(files=>files.length)||Object.keys(pairResults).length||alignmentDraft||$('editA');
  if(hasSession&&!confirm(t('replaceProject')))return;
  restoreProject(s);
  sessionImagesDirty=true;
 }catch(error){$('projectStatus').textContent=t('error')+(error instanceof SyntaxError?t('invalidProject'):error.message)}
 finally{pendingProjectOperations--;projectOpening=false; $('projectFile').value='';saveBrowserSession()}
}
// Opening/saving a snapshot while an asynchronous import is unfinished would
// mix two sessions. Keep the current session intact until each operation ends.
for(const name of ['loadFile','loadImages','runAlign']){
 const original=name==='loadFile'?loadFile:name==='loadImages'?loadImages:runAlign;
 const tracked=async(...args)=>{if(projectOpening){alert(t('projectBusy'));return}pendingProjectOperations++;try{return await original(...args)}finally{pendingProjectOperations--;saveBrowserSession(name==='loadImages')}};
 if(name==='loadFile')loadFile=tracked;else if(name==='loadImages')loadImages=tracked;else runAlign=tracked;
}
$('saveProject').onclick=()=>{try{saveProject()}catch(error){$('projectStatus').textContent=t('error')+error.message}};
$('openProject').onclick=()=>{if(pendingProjectOperations){alert(t('projectBusy'));return}$('projectFile').click()};
$('projectFile').onchange=event=>openProjectFile(event.target.files[0]);

$('genreRangeRows').onchange=event=>{if(!teiExportDraft)return;const {range,field}=event.target.dataset;if(range===undefined||!teiExportDraft.ranges[Number(range)]||!['start','end','genre'].includes(field))return;teiExportDraft.ranges[Number(range)][field]=field==='genre'?event.target.value:Number(event.target.value);updateGenreRangeStatus()};
$('genreRangeRows').onclick=event=>{if(!teiExportDraft)return;const index=event.target.dataset.removeRange;if(index!==undefined){teiExportDraft.ranges.splice(Number(index),1);renderGenreEditor()}};
$('addGenreRange').onclick=()=>{if(!teiExportDraft)return;const total=exportReferenceUnits().length;if(!total)return;const ranges=teiExportDraft.ranges,start=ranges.length?ranges.at(-1).end+1:1;ranges.push({start,end:Math.max(start,total),genre:teiExportDraft.genre});renderGenreEditor()};
for(const mode of ['teiUniform','teiMixed'])$(mode).onchange=()=>{if(!teiExportDraft)return;teiExportDraft.mode=$(mode).value;if(teiExportDraft.mode==='mixed'&&!teiExportDraft.ranges.length)teiExportDraft.ranges=[{start:1,end:exportReferenceUnits().length,genre:teiExportDraft.genre}];renderGenreEditor()};
$('genre').onchange=event=>{if(teiExportDraft)teiExportDraft.genre=event.target.value};
$('cancelTeiExport').onclick=()=>{$('teiExportDialog').close();teiExportDraft=null};
$('teiExportDialog').addEventListener('close',()=>{if(!$('teiExportDialog').open)teiExportDraft=null});
$('confirmTeiExport').onclick=confirmTeiExport;

$('titleLineOptions').onchange=event=>{
 const draft=teiExportDraft,key=draft?.titleKeys[event.target.dataset.titleIndex];
 if(!key)return;
 if(event.target.checked)draft.titles.add(key);
 else draft.titles.delete(key);
 $('teiExportError').textContent='';
};
$('dismissAlignmentToast').onclick=()=>{$('alignmentToast').hidden=true};
$('witnessViews').onclick=event=>{
 const view=event.target.dataset.witnessView;
 if(view)setWitnessView(view);
};
const exportButton=$('exportButton'),exportOptions=$('exportOptions');
function setExportMenu(open){
 exportOptions.hidden=!open;
 exportButton.setAttribute('aria-expanded',String(open));
}
exportButton.onclick=()=>setExportMenu(exportOptions.hidden);
document.addEventListener?.('click',event=>{
 if(!exportOptions.hidden&&!exportButton.contains(event.target)&&!exportOptions.contains(event.target))setExportMenu(false);
});
document.addEventListener?.('keydown',event=>{
 if(event.key==='Escape'&&!exportOptions.hidden){setExportMenu(false);exportButton.focus()}
});
$('exportTei').onclick=()=>{setExportMenu(false);exportButton.focus();exportTEI()};
$('exportJson').onclick=()=>{setExportMenu(false);exportButton.focus();exportJSON()};
const addWitnessButton=$('addWitnessBtn');if(addWitnessButton)addWitnessButton.addEventListener('click',event=>{event.preventDefault();try{addWitness()}catch(error){console.error('Could not add witness:',error);const status=$('loadedStatus');if(status)status.textContent=`Could not add witness: ${error.message}`}});$('fileA').onchange=e=>loadFile('A',e.target.files);$('dossierNameA').onchange=e=>{e.target.dataset.userEdited='true';names.A=e.target.value.trim()||names.A;saveBrowserSession();if(groups.length){render();renderMovements()}};$('imagesA').onchange=e=>loadImages('A',e.target.files);$('alignBtn').onclick=runAlign;$('recurringBtn').onclick=showRecurring;$('nextPendingBtn').onclick=nextPending;$('resultFilter').onchange=e=>{viewFilter=e.target.value;render()};$('language').onchange=e=>setLanguage(e.target.value);
window.loadFile=loadFile;window.addWitness=addWitness;window.alignmentDraft=alignmentDraft;window.adjustUnit=adjustUnit;window.selectDraftSide=selectDraftSide;window.updateDraftPositions=updateDraftPositions;window.saveAdjustedUnit=saveAdjustedUnit;window.splitDraftLine=splitDraftLine;window.moveDraftLine=moveDraftLine;window.setMovement=setMovement;window.openMovementImages=openMovementImages;window.setVariant=setVariant;window.setAll=setAll;window.editUnit=editUnit;window.saveEdit=saveEdit;window.openImages=openImages;window.goToUnit=goToUnit;window.$=$;
setLanguage('en');
const sessionReady=restoreBrowserSession();