# Backend della collazione

## Workflow ALTO attuale

1. `parse_alto_bundle()` ordina i file di un testimone e li legge in sequenza. `parse_alto()` crea un’unità per ogni `TextLine`, mantenendo testo, pagina, file, coordinate, tag e ID della riga. I richiami in fondo pagina sono esclusi solo quando sono brevi, ripetuti all’inizio della pagina seguente e confermati dalla posizione geometrica.
2. `align_alto_words()` appiattisce le righe in sequenze ordinate di parole per i due testimoni. Le sequenze esatte condivise forniscono ancore; gli intervalli tra le ancore sono confrontati con Levenshtein a livello di parola, con costo di sostituzione graduato per la somiglianza ortografica.
3. I risultati sono ricondotti alle righe del testimone di riferimento. Una parola del secondo testimone può quindi apparire accanto alla riga di riferimento corrispondente anche se nell’ALTO si trova sulla riga successiva. I frammenti esplicitamente marcati come continuazione (`=`, `-` o trattino morbido) sono confrontati come un token, mantenendo i riferimenti alle righe originali.
4. La UI rivede le differenze parola per parola. I gruppi mantengono gli oggetti `aItems` e `bItems`, con testo e riferimenti ALTO; gli intervalli `a0/a1` sono riferimenti alla sequenza di righe A. L’export TEI e JSON legge questi gruppi.

Il testo nei file ALTO non viene riscritto. La forma di una parola ricomposta per il confronto resta collegata alle porzioni e alle righe fonte. I risultati sono proposte di allineamento da verificare sulle immagini, non decisioni editoriali automatiche.

## Fallback automatico Bertalign

Sul branch `feature/project-save-open`, `align_witness_inputs()` produce prima
l’allineamento lessicale e poi chiama `automatic_semantic.recover()`. Bertalign
viene tentato sui passaggi incerti anche se il resto del confronto contiene
corrispondenze riuscite. Non servono pulsanti, selezioni manuali o conferme per
avviare il fallback. Il precedente percorso manuale è stato rimosso.

`automatic_semantic.py` individua sequenze con somiglianza lessicale inferiore a
0,45 o aggiunte/omissioni contrapposte. Richiede testo da entrambi i lati e almeno
due righe deboli, oppure una riga debole di almeno 12 parole per lato. Aggiunge una
riga di contesto prima e dopo; la finestra deve contenere almeno 8 parole per lato.
Le finestre sovrapposte sono unite. Si tentano al massimo tre finestre, ciascuna
non superiore a 40 unità, rispettando anche i limiti di frammenti e caratteri.
Le parti eccedenti vengono segnalate e conservano il risultato lessicale.

`semantic_alignment.py` raggruppa i frammenti in passaggi contestuali e chiama
Bertalign con `is_split=True`. Gli indici devono coprire entrambi i lati in ordine,
senza lacune o duplicazioni. Ogni corrispondenza è rifinita da `align_alto_words()`.
Il modello LaBSE si carica solo quando necessario e viene riutilizzato tramite
`get_encoder()`. Un lock serializza caricamento e inferenze.

Il recupero è accettato soltanto se conserva testo e riferimenti fonte, mantiene
le corrispondenze contestuali affidabili (somiglianza almeno 0,65) e migliora di
almeno 0,04 la qualità lessicale aggregata. La qualità pesa la somiglianza per il
numero di parole accoppiate e normalizza per la lunghezza del testimone maggiore.
Non basta che Bertalign restituisca una corrispondenza o dichiari un buon punteggio.
Le righe recuperate sono marcate `alignment_source=bertalign_automatic` e
`semantic_review=true`, senza prendere decisioni editoriali.

`POST /api/align` restituisce `semantic_fallback` con stato, numero di tentativi,
finestre accettate/rifiutate, ragioni e soglie usate. I numeri delle finestre si
riferiscono alle righe lessicali iniziali. Il frontend mostra lo stato e salva la
diagnostica nel progetto e nell’export JSON. La funzione Python mantiene il
ritorno a tre elementi; `include_diagnostics=True` aggiunge il quarto elemento.

Pacchetto assente, dipendenze incompatibili, modello non disponibile, indici non
validi o mancato miglioramento conservano l’allineamento lessicale. Un errore di
runtime interrompe gli altri tentativi dello stesso confronto. Non si esegue
il fallback al semplice ripristino di un progetto o al salvataggio di Edit text.

I test unitari usano un modello controllato e non scaricano pesi. Verificano
attivazione automatica, conservazione dei riferimenti e del testo, contesto
protetto, miglioramento, limiti ed errori. Le soglie restano sperimentali e vanno
calibrate sui dati PRIMA; la qualità scientifica di LaBSE richiede una valutazione
separata su esempi reali annotati.

## Altri componenti

- `alto_support.py` risolve i riferimenti a tag ALTO e trova gli antenati XML delle righe.
- `relocations.py` cerca possibili passi spostati fuori dall’ordine monotono. Questa è una funzione separata e consultiva; al momento si basa ancora sui gruppi di righe del vecchio allineamento.
- `Handler` in `app.py` riceve la richiesta locale `/api/align`, restituisce testi, gruppi, metodo e suggerimenti di spostamento. Il browser invia una coppia per volta: testimone di riferimento e testimone confrontato.

## Limiti della prima versione parola per parola

- Gli ancoraggi esatti e il Levenshtein locale sono una base sperimentale; testi preliminari molto diversi, riscritture estese e lacune grandi richiedono revisione manuale.
- Le sequenze non corrispondenti che superano il limite computazionale vengono lasciate come omissioni e aggiunte, invece di essere forzate in sostituzioni.
- La ricostruzione della vista usa le righe del testimone di riferimento come unità di revisione. Per il secondo testimone visualizza frammenti testuali ricondotti alla riga corrispondente e mantiene i riferimenti alle righe fisiche originali.
- Le proposte di trasposizione non sono ancora state riprogettate per la nuova struttura parola per parola.
- Il recupero semantico automatico è soggetto a soglie sperimentali: i passaggi accettati restano da verificare sui dati PRIMA e non costituiscono decisioni editoriali.
