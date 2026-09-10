# Autobus in tempo reale in Friuli Venezia Giulia

Pagina web per vedere su una mappa gli autobus urbani ed extraurbani della rete
TPL FVG (Trasporto pubblico locale del Friuli Venezia Giulia) dei quali il
servizio regionale rende disponibile la posizione.

## File consegnati

| File | A che cosa serve |
|---|---|
| `autobus_fvg.html` | L'applicazione completa: struttura, grafica e programma in un unico file. |
| `aggregatore_tplfvg.js` | Servizio minimo che raccoglie le posizioni da tutta la rete e le offre alla pagina. |

## Come si usa

### Modo consigliato: pagina più aggregatore

Serve Node.js. I due file devono stare nella stessa cartella.

```
node aggregatore_tplfvg.js
```

Poi si apre `http://127.0.0.1:8080/` nel browser. La pagina riconosce da sola
l'aggregatore e lo usa.

### Modo rapido: solo la pagina

Si apre `autobus_fvg.html` con un doppio clic. La pagina non trova
l'aggregatore e interroga direttamente il servizio TPL FVG, con ventiquattro
fermate per giro invece delle novanta dell'aggregatore: la copertura è quindi
molto più stretta e cresce lentamente, giro dopo giro.

## Perché serve un aggregatore

Il servizio pubblico di TPL FVG restituisce le corse monitorate a **una fermata
per volta**. Non ho individuato alcun servizio ufficiale documentato che
restituisca l'intera flotta regionale in una sola risposta: né sul sito TPL FVG,
né sul catalogo Mobility Database, né sui portali di dati aperti consultati. Per
coprire la rete servono quindi centinaia di richieste.

L'aggregatore le esegue una volta sola, tiene i risultati in memoria e li offre
alla pagina in una risposta unica. Senza di esso ogni scheda aperta
moltiplicherebbe quel carico sul servizio pubblico.

### Strategia di acquisizione

Il piano è costruito sul catalogo ufficiale delle fermate, non su ipotesi:

1. **Nodi principali, 224 fermate.** Le fermate il cui nome contiene stazione,
   autostazione, interporto, aeroporto, terminal o capolinea, più le tre fermate
   più centrali delle venticinque località con più fermate.
2. **Copertura territoriale, 643 fermate.** Una fermata per ogni cella di circa
   quattro chilometri di lato, così la rete è seguita anche fuori dalle città.

In tutto 867 fermate, pari a 1.017 richieste per un giro completo, perché le
fermate servite sia dall'urbano sia dall'extraurbano vanno interrogate due
volte. Ogni trenta secondi se ne eseguono novanta, sei per volta: le fermate si
interrogano a rotazione, con il sessanta per cento del giro riservato ai nodi
principali. I nodi principali sono così ripercorsi per intero in poco più di due
minuti, le altre fermate in circa venti minuti.

La tipologia di servizio da interrogare si ricava dal catalogo: una fermata solo
urbana non viene mai interrogata come extraurbana. Il parametro `IsUrban` è
quindi usato per scegliere l'elenco da leggere, non come prova della tipologia
di una corsa: quella si legge da `LineType`.

### Configurazione

Si imposta con variabili d'ambiente, per esempio:

```
PORTA=8080 INTERVALLO_MS=30000 RICHIESTE_PER_GIRO=90 PARALLELE=6 node aggregatore_tplfvg.js
```

| Variabile | Valore iniziale | Significato |
|---|---|---|
| `PORTA` | 8080 | Porta di ascolto. |
| `INTERVALLO_MS` | 30000 | Millisecondi fra un giro e il successivo. |
| `RICHIESTE_PER_GIRO` | 90 | Richieste eseguite in ogni giro. |
| `QUOTA_PRIORITARIE` | 0.6 | Parte del giro riservata ai nodi principali. |
| `PARALLELE` | 6 | Richieste aperte contemporaneamente. |
| `TIMEOUT_MS` | 12000 | Attesa massima per ogni richiesta. |
| `SCADENZA_MS` | 300000 | Dopo quanto un mezzo non più rilevato viene dimenticato. |
| `FERMATE_FILE` | assente | Legge il catalogo da un file già scaricato invece che dalla rete. |

Nella pagina le soglie stanno in cima al programma: `LABEL_ZOOM` (livello 12,
comparsa delle bandierine), `ZOOM_GRUPPI` (livello 10), `INTERVALLO_MS`,
`STANTIO_MS` (due minuti), `SCADENZA_MS` (cinque minuti), `MAX_BANDIERINE`.

## Che cosa mostra e che cosa non mostra

Sulla mappa finisce soltanto ciò che il servizio restituisce.

- Puntino blu per l'urbano, arancione per l'extraurbano, con bordo chiaro. La
  tipologia si legge da `LineType`: `1U` urbano, `1E` extraurbano. Una sigla
  diversa non viene forzata in una delle due categorie: il mezzo resta grigio e
  la scheda dichiara che il servizio non lo ha classificato.
- Sopra il livello 12 compare la bandierina con il codice pubblico della linea
  preso da `LineCode`, nella forma originale: `P13`, `R`, `2`, `250`.
- Sotto il livello 10 i mezzi sono raccolti in gruppi con il numero dei mezzi.
- I mezzi che condividono la stessa posizione, tipico delle stazioni, sono
  distribuiti su una piccola corona attorno al punto, in modo stabile, così
  ognuno resta selezionabile. La bandierina del mezzo scelto resta sempre
  visibile.
- Sono esclusi i mezzi con coordinate mancanti, non valide, pari a zero o fuori
  dal riquadro regionale, e quelli che i dati indicano come non ancora partiti
  (`IsStarted` falso).
- Lo stesso mezzo che compare nelle risposte di più fermate è unito in uno solo,
  tramite `Vehicle`.

Non vengono mai ricostruite posizioni a partire dagli orari, né fatti avanzare i
mezzi lungo i percorsi. L'unico movimento disegnato è il passaggio, lungo otto
decimi di secondo, fra due posizioni effettivamente ricevute, e viene soppresso
se il sistema chiede animazioni ridotte.

**L'orario indicato è quello di ricezione del dato.** I campi `Time` e
`DepartureTime` riguardano la corsa, non la rilevazione satellitare, e non
vengono usati come tali.

Il percorso della corsa selezionata **non viene mostrato**: non ho trovato una
fonte verificata che lo restituisca, e la richiesta era di ometterlo in sua
assenza.

Il conteggio in alto si chiama «mezzi con posizione disponibile» e non è il
numero degli autobus in servizio: è solo quanti mezzi hanno una posizione valida
fra le fermate interrogate finora.

## Copertura verificata

Va detto con chiarezza, perché è il punto più delicato della consegna.

**Verificato con dati reali il 10 settembre 2026:**

- Il catalogo ufficiale delle fermate risponde:
  `https://tplfvg.it/services/geojson/points/`, risposta 200, 3.704.795 byte,
  9.660 elementi, dei quali 8.506 fermate e 1.154 rivendite. Le fermate con
  servizio su gomma sono 8.497, distribuite su 246 località, tutte con
  coordinate valide. Da questo catalogo, e solo da questo, nascono la ricerca di
  località e fermate e il piano di interrogazione.
- Il catalogo consente le chiamate da altre origini: risponde
  `access-control-allow-origin: *`. La pagina può quindi leggerlo direttamente.
- I tre codici fermata degli esempi esistono nel catalogo con i servizi
  coerenti: `UP129` e `P3322` alla stazione ferroviaria di Pordenone, la prima
  urbana e la seconda extraurbana, `70101` all'autostazione di Udine,
  extraurbana.
- L'aggregatore, eseguito sul catalogo reale, costruisce il piano previsto: 224
  nodi principali, 643 fermate di copertura, 1.017 richieste per giro completo.

**Non verificato, perché il servizio è fuori uso:**

Il servizio delle posizioni in tempo reale, `realtime.tplfvg.it`, non ha
risposto in nessuno dei tentativi eseguiti il 10 settembre 2026, fra le 9:57 e
le 10:30. Il riscontro è triplo e concorde:

1. Dalla rete di sviluppo la connessione cifrata viene azzerata prima di
   completarsi, sia con richieste normali sia con il browser interno, sia sulla
   radice del sito sia sulle tre chiamate di esempio.
2. Da una rete esterna, indipendente dalla prima, lo stesso indirizzo risponde
   `503 Service Unavailable`, di nuovo sia sulla radice sia sulle tre chiamate.
3. Il servizio orari dello stesso operatore, che si appoggia allo stesso motore,
   risponde 200 con il messaggio «Si è verificato un errore durante il recupero
   dell'orario».

Di conseguenza **non ho potuto verificare con corse vere**: la struttura esatta
della risposta, i valori effettivi di `LineType`, il comportamento del parametro
`IsUrban`, quante corse restituisca ogni fermata e quindi quanta parte della
flotta il piano copra davvero, e se il servizio consenta o meno le chiamate
dirette da un browser.

L'applicazione è scritta sui nomi dei campi indicati nella richiesta e legge le
tre forme di risposta possibili: un elenco diretto, oppure un oggetto con dentro
`Runs` o `runs`. Quando il servizio tornerà disponibile andrà controllato il
primo giro: l'aggregatore scrive a video quante richieste ha eseguito, quanti
errori e quanti mezzi ha in memoria, e la pagina scrive gli stessi dettagli
nella console del browser.

Se la struttura della risposta risultasse diversa, il punto da correggere è uno
solo: la funzione `leggiCorsa` nella pagina e la funzione `corseDi`
nell'aggregatore.

## Collaudo eseguito

Quarantasei verifiche automatiche con browser vero, su un banco di prova che
serve corse con la struttura dichiarata, comprese le anomalie da gestire. Tutte
superate.

- Ricezione e distinzione di corse urbane ed extraurbane, con una sigla
  `LineType` ignota lasciata non classificata.
- Comparsa delle bandierine al livello 12 e scomparsa scendendo di zoom;
  raggruppamenti sotto il livello 10; puntini singoli fra i due.
- Sigle conservate nella forma originale, comprese `P13` e `R`.
- Nessun mezzo duplicato: lo stesso `Vehicle` presente in due risposte compare
  una sola volta.
- Scarto di coordinate nulle, mancanti, fuori regione, e dei mezzi non ancora
  partiti.
- Tre mezzi con la stessa identica posizione restano separati e selezionabili.
- Guasto del servizio: messaggio semplice, spia rossa, ultime posizioni
  conservate, tentativi successivi distanziati a 5, 15, 40 e 90 secondi.
- Risposta vuota, assenza di connessione, invecchiamento oltre i due minuti e
  rimozione oltre i cinque.
- A scheda nascosta non parte alcuna richiesta.
- Filtri, ricerca per linea anche parziale, ricerca di località, scheda del
  mezzo, inseguimento (scarto di 183 metri dal mezzo dopo un aggiornamento),
  pulsante «Tutta la regione».
- Prestazioni: seicento mezzi disegnati in 26 millisecondi al massimo, 1,9
  millisecondi per fotogramma durante lo spostamento della mappa; con
  quattrocento mezzi tutti in vista le bandierine restano entro il limite di 240
  e l'elenco laterale entro 120 voci.
- Aspetto su schermo da 1280 e da 390 punti: nessuno scorrimento orizzontale,
  nessun elemento troncato, pulsanti tutti alti almeno 36 punti.
- Catena completa con l'aggregatore vero e il servizio TPL FVG irraggiungibile:
  nessun errore, nessun mezzo inventato, messaggio chiaro all'utente.

## Dipendenze

- **Leaflet 1.9.4**, preso da `unpkg.com` con controllo di integrità.
- **Mattonelle cartografiche di OpenStreetMap**, senza chiave di accesso, con
  l'attribuzione richiesta sempre visibile in basso a destra.
- **Node.js** per il solo aggregatore, senza alcuna libreria esterna.

Serve quindi una connessione a internet per la cartografia e per i dati. Non
occorre installare né compilare nulla.

Nota sulle mattonelle: la prima versione usava la cartografia CARTO, che nel
frattempo richiede una chiave di accesso e restituisce immagini con la scritta
«API KEY REQUIRED». Il difetto è stato visto in collaudo e corretto passando a
OpenStreetMap.

## Avvertenza

Il sito non è stato pubblicato in rete. I dati mostrati sono soltanto quelli
ricevuti dal servizio TPL FVG: in nessun caso l'applicazione inventa mezzi,
posizioni o orari.
