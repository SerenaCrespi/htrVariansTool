# Backend della collazione

## Workflow ALTO attuale

1. `parse_alto_bundle()` ordina i file di un testimone e li legge in sequenza. `parse_alto()` crea un’unità per ogni `TextLine`, mantenendo testo, pagina, file, coordinate, tag e ID della riga. I richiami in fondo pagina sono esclusi solo quando sono brevi, ripetuti all’inizio della pagina seguente e confermati dalla posizione geometrica.
2. `align_alto_words()` appiattisce le righe in sequenze ordinate di parole per i due testimoni. Le sequenze esatte condivise forniscono ancore; gli intervalli tra le ancore sono confrontati con Levenshtein a livello di parola, con costo di sostituzione graduato per la somiglianza ortografica.
3. I risultati sono ricondotti alle righe del testimone di riferimento. Una parola del secondo testimone può quindi apparire accanto alla riga di riferimento corrispondente anche se nell’ALTO si trova sulla riga successiva. I frammenti esplicitamente marcati come continuazione (`=`, `-` o trattino morbido) sono confrontati come un token, mantenendo i riferimenti alle righe originali.
4. La UI rivede le differenze parola per parola. I gruppi mantengono gli oggetti `aItems` e `bItems`, con testo e riferimenti ALTO; gli intervalli `a0/a1` sono riferimenti alla sequenza di righe A. L’export TEI e JSON legge questi gruppi.

Il testo nei file ALTO non viene riscritto. La forma di una parola ricomposta per il confronto resta collegata alle porzioni e alle righe fonte. I risultati sono proposte di allineamento da verificare sulle immagini, non decisioni editoriali automatiche.

## Bertalign

Il percorso ALTO ordinario resta lessicale. Bertalign può essere tentato dal
backup quando il confronto globale non produce alcuna corrispondenza; una sola
corrispondenza non garantisce però la qualità dell’intero confronto.

Sul branch `feature/project-save-open` il pulsante **Proponi allineamento
semantico** attiva un percorso esplicito e indipendente:

- `GET /api/semantic-status` controlla la disponibilità senza caricare il modello.
- `POST /api/semantic-proposal` riceve fino a 40 righe di revisione con `aItems` e
  `bItems`; il passaggio deve contenere testo in entrambi i testimoni.
- `semantic_alignment.py` raggruppa i frammenti in passaggi contestuali (fino a
  due frammenti, oppure arresto alla soglia di 30 parole). Bertalign lavora sui
  passaggi con `is_split=True` e restituisce indici: devono coprire entrambi i
  lati esattamente, in ordine e senza duplicazioni.
- Ogni corrispondenza viene rifinita con `align_alto_words()`, mantenendo i
  riferimenti ALTO e verificando la conservazione del testo. Gli errori non
  producono un fallback lessicale presentato come proposta semantica.
- Il revisore confronta l’anteprima con il risultato corrente e decide se
  applicarla. Si azzerano solo le decisioni nell’intervallo sostituito; quelle
  esterne vengono ricollocate se cambia il numero delle righe.

Il modello LaBSE è caricato su richiesta e riutilizzato tramite `get_encoder()`
di Bertalign 2.0.1. Un lock serializza caricamento e inferenze. Sono distinti gli
stati di pacchetto assente, dipendenza incompatibile, modello non disponibile,
errore di allineamento, indici non validi, assenza di corrispondenze ed errore di
rifinitura. Dopo un errore si può riprovare. Il primo caricamento può richiedere
accesso a Hugging Face e memoria considerevole.

I test unitari usano un encoder e un allineatore controllati: verificano il flusso,
i riferimenti fonte e la conservazione delle decisioni. Non dimostrano che LaBSE
migliori gli allineamenti sui manoscritti PRIMA: questa valutazione richiede
esempi reali annotati dal ricercatore.

## Altri componenti

- `alto_support.py` risolve i riferimenti a tag ALTO e trova gli antenati XML delle righe.
- `relocations.py` cerca possibili passi spostati fuori dall’ordine monotono. Questa è una funzione separata e consultiva; al momento si basa ancora sui gruppi di righe del vecchio allineamento.
- `Handler` in `app.py` riceve la richiesta locale `/api/align`, restituisce testi, gruppi, metodo e suggerimenti di spostamento. Il browser invia una coppia per volta: testimone di riferimento e testimone confrontato.

## Limiti della prima versione parola per parola

- Gli ancoraggi esatti e il Levenshtein locale sono una base sperimentale; testi preliminari molto diversi, riscritture estese e lacune grandi richiedono revisione manuale.
- Le sequenze non corrispondenti che superano il limite computazionale vengono lasciate come omissioni e aggiunte, invece di essere forzate in sostituzioni.
- La ricostruzione della vista usa le righe del testimone di riferimento come unità di revisione. Per il secondo testimone visualizza frammenti testuali ricondotti alla riga corrispondente e mantiene i riferimenti alle righe fisiche originali.
- Le proposte di trasposizione non sono ancora state riprogettate per la nuova struttura parola per parola.
- Le proposte semantiche sono esplicite e consultive: vanno valutate sui dati PRIMA e non sostituiscono il confronto lessicale dei token.
