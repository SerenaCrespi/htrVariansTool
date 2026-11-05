# Backend della collazione

## Workflow ALTO attuale

1. `parse_alto_bundle()` ordina i file di un testimone e li legge in sequenza. `parse_alto()` crea un’unità per ogni `TextLine`, mantenendo testo, pagina, file, coordinate, tag e ID della riga. I richiami in fondo pagina sono esclusi solo quando sono brevi, ripetuti all’inizio della pagina seguente e confermati dalla posizione geometrica.
2. `align_alto_words()` appiattisce le righe in sequenze ordinate di parole per i due testimoni. Le sequenze esatte condivise forniscono ancore; gli intervalli tra le ancore sono confrontati con Levenshtein a livello di parola, con costo di sostituzione graduato per la somiglianza ortografica.
3. I risultati sono ricondotti alle righe del testimone di riferimento. Una parola del secondo testimone può quindi apparire accanto alla riga di riferimento corrispondente anche se nell’ALTO si trova sulla riga successiva. I frammenti esplicitamente marcati come continuazione (`=`, `-` o trattino morbido) sono confrontati come un token, mantenendo i riferimenti alle righe originali.
4. La UI rivede le differenze parola per parola. I gruppi mantengono gli oggetti `aItems` e `bItems`, con testo e riferimenti ALTO; gli intervalli `a0/a1` sono riferimenti alla sequenza di righe A. L’export TEI e JSON legge questi gruppi.

Il testo nei file ALTO non viene riscritto. La forma di una parola ricomposta per il confronto resta collegata alle porzioni e alle righe fonte. I risultati sono proposte di allineamento da verificare sulle immagini, non decisioni editoriali automatiche.

## Bertalign

Bertalign non è attualmente chiamato nel percorso ALTO parola per parola. Il vecchio percorso, usato per unità testuali inserite o modificate manualmente, può ancora tentare Bertalign e poi usare il DP lessicale. Nei campioni analizzati, l’inizializzazione di Bertalign non è riuscita a causa della configurazione proxy (`socksio`) e del caricamento del modello LaBSE. L’integrazione come generatore di ancore su segmenti ampi resta un passaggio futuro: ogni ancora dovrà essere verificata dall’allineamento lessicale e mappata ai token originali.

## Altri componenti

- `alto_support.py` risolve i riferimenti a tag ALTO e trova gli antenati XML delle righe.
- `relocations.py` cerca possibili passi spostati fuori dall’ordine monotono. Questa è una funzione separata e consultiva; al momento si basa ancora sui gruppi di righe del vecchio allineamento.
- `Handler` in `app.py` riceve la richiesta locale `/api/align`, restituisce testi, gruppi, metodo e suggerimenti di spostamento. Il browser invia una coppia per volta: testimone di riferimento e testimone confrontato.

## Limiti della prima versione parola per parola

- Gli ancoraggi esatti e il Levenshtein locale sono una base sperimentale; testi preliminari molto diversi, riscritture estese e lacune grandi richiedono revisione manuale.
- Le sequenze non corrispondenti che superano il limite computazionale vengono lasciate come omissioni e aggiunte, invece di essere forzate in sostituzioni.
- La ricostruzione della vista usa le righe del testimone di riferimento come unità di revisione. Per il secondo testimone visualizza frammenti testuali ricondotti alla riga corrispondente e mantiene i riferimenti alle righe fisiche originali.
- Le proposte di trasposizione non sono ancora state riprogettate per la nuova struttura parola per parola.
- Bertalign non è incluso nel percorso ALTO attuale. Un’eventuale integrazione dovrà essere valutata sui dati PRIMA e non dovrà sostituire il matching lessicale dei token.
