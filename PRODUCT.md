# Product

## Register

brand

## Users

Chi arriva qui ci arriva da un link: il campo `blog` del profilo GitHub, il badge nel README, o la firma di una mail. Quasi sempre sta facendo una cosa sola, capire in fretta chi è la persona dall'altra parte: un recruiter, un collega, qualcuno che ha ricevuto un preventivo e sta controllando.

Il contesto d'uso pesa su ogni decisione: sessione breve, spesso da telefono, spesso una volta sola. Non è un prodotto in cui si torna. Quindi la pagina deve leggersi subito, e ogni dettaglio che si tocca deve rispondere.

## Product Purpose

Vetrina personale di Nicolò Rengifo, full-stack web developer. Nessuna ricerca attiva di lavoro: la pagina esiste perché il dominio del CV (`nicolorengifo.it`) è morto e serve un bersaglio vivo per i link.

Tutti i repository restano privati, quindi non c'è codice pubblico da mostrare. **La pagina stessa deve essere la prova.** Chi la guarda deve poter dedurre la competenza dall'artefatto, non dall'elenco.

Successo: qualcuno chiede "come è fatto questo?" invece di "quale template è?".

## Brand Personality

**Stampato, firmato, asciutto.**

Stampato: due materiali soli, carta calda e inchiostro quasi nero, e ogni pannello è uno dei due impresso sull'altro; il titolo lavora a corpo da manifesto. Firmato: un corsivo da firma attraversa il poster e sigla l'ultimo pannello, come su una copertina. Asciutto: nessuna frase promozionale, nessun aggettivo che non porti un fatto (regole di scrittura in `docs/superpowers/specs/`).

**Riferimento nominato:** il deck editoriale da fashion portfolio fornito dal proprietario il 2026-08-08 (display nero compresso, pannelli alternati carta e nero, corsivo firma in sovrapposizione, asterischi a otto punte, barre a filetto con le etichette), eseguito con la disciplina di interazione di Emil Kowalski (emilkowal.ski): easing custom, stati che sfumano attraverso un blur, feedback sotto i 200ms, una chiave di avanzamento con due millimetri di corsa.

## Anti-references

- **Portfolio 3D da Awwwards**: scuro, neon, monospace, griglia di fondo, glow diffuso. È il riflesso di primo ordine della categoria, ed è la famiglia estetica del build precedente (la capsule machine), che questo build sostituisce.
- **Editorial-typographic**: serif display, etichette maiuscole tracciate sopra ogni sezione, filetti come unico motivo, restraint monocromatico. Riflesso di secondo ordine, già scartato due build fa.
- **Estetica terminale**: prompt verdi, finte finestre di shell, cursori lampeggianti. Costume, non voce.
- **Profili README da template**: badge shields.io in fila, widget di statistiche, contatore di visite, animazione snake. Scartati uno per uno nella spec, con il motivo.
- **Landing da sviluppatore post 2024**: sfumatura viola dietro contenuto scuro, card tutte uguali con icona e titolo, sezione di metriche grandi.
- **Minimal bianco da template**: Inter su bianco con tre card e un footer. La scheda tecnica bianca del build precedente stava a un passo da questa famiglia, ed è il motivo per cui il proprietario l'ha sostituita in giornata con il registro poster.

## Design Principles

1. **La pagina è la prova.** Con zero repository pubblici, l'unica dimostrazione di competenza disponibile è l'artefatto che il visitatore ha davanti. Ogni scelta si giudica così: aggiunge o toglie prova?

2. **Il movimento ha una causa.** Le parti si muovono perché qualcosa le ha spinte: un tasto premuto, una sezione attraversata, una copia riuscita. Mai perché una sezione è entrata nel viewport: un reveal per ogni sezione è il tell più riconoscibile del genere e non racconta nessun rapporto causa-effetto.

3. **Il gioco non è mai un pedaggio.** Il contenuto sta nel DOM dall'inizio e si legge tutto senza toccare niente. Chi ha fretta, chi usa uno screen reader e chi ha JavaScript spento ricevono la stessa pagina, non una versione mutilata.

4. **Due materiali soli.** Carta e inchiostro, nessun colore d'accento: l'enfasi è corpo, peso, inversione e il corsivo firma. "Corrente" si dice stampando in negativo: la voce attiva dell'indice è carta su inchiostro, i pannelli pari sono inchiostro pieno, e il rail si ridichiara nella palette del pannello che attraversa.

5. **Niente che possa marcire.** L'artefatto pubblicato non fa una sola richiesta fuori dal proprio host e non contiene librerie runtime: un foglio di stile e un kilobyte di script. I build step sono ammessi, le dipendenze runtime da terzi no: se fra due anni la toolchain non installa più, la pagina servita deve restare identica.

## Accessibility & Inclusion

WCAG 2.1 AA, verificato **sul render reale**: contrasti letti dal browser sui colori risolti via canvas, non calcolati a mano sui token, perché `oklab()` e `color-mix()` sono il punto dove un audit scritto a mano sbaglia.

- `prefers-reduced-motion`: la pagina nasce a riposo. Le classi di partenza non vengono mai armate, il nome non si assesta, lo scroll è auto. Una pagina ferma, non un'animazione lenta.
- Il rail di posizione è uno strumento di lettura, non navigazione: `aria-hidden`, mai focalizzabile, e ripete in forma peggiore quello che l'indice dice già in HTML.
- La chiave di avanzamento sposta anche il focus sulla sezione raggiunta, così il Tab successivo parte da dove si sta guardando.
- L'inversione è ridondante: la riga corrente dell'indice è indicata anche dal contatore, e ogni sezione porta il proprio nome scritto.
- Le firme in corsivo e i numeri stampati sono pseudo-elementi e contenuto generato con testo alternativo vuoto: ripetono parole che la pagina dice già, e uno screen reader le sente una volta sola.
- Bersagli tattili minimo 44px. `:hover` sempre chiuso dietro `@media (hover: hover) and (pointer: fine)`.
