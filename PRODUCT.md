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

**Di sistema, quieto, asciutto.**

Di sistema: la pagina parla la lingua della piattaforma. Il carattere è quello di sistema, di proposito: porta ottica e tracking che nessun subset webfont eguaglia, si rende come il dispositivo del lettore intende, e costa zero byte. Quieto: bianco e grigio piattaforma, angoli morbidi, niente che si muova perché una sezione è entrata in vista. Asciutto: nessuna frase promozionale, nessun aggettivo che non porti un fatto (regole di scrittura in `docs/superpowers/specs/`).

**Riferimento nominato:** il linguaggio delle pagine prodotto Apple e la disciplina WWDC di Designing Fluid Interfaces (skill apple-design fornita dal proprietario il 2026-08-08): risposta sul pointer-down, movimento solo su transform e opacity, materiali traslucidi sotto cui il contenuto scorre, tracking specifico per corpo, e tre adattamenti distinti per reduced motion, reduced transparency e prefers-contrast.

**L'architettura resta la lezione del proprietario: composizioni, non un template ripetuto.** Nav globale traslucida che nomina la sezione corrente, statement centrato, poi un bento su grigio piattaforma dove nessuna card condivide campata o layout interno: la larga con quattro voci distribuite, la scura degli attrezzi, quella a due ruoli affiancati, quella tinta con tre valori impilati. La pagina chiude piena su Contact e finisce a note in un footer di corpo minimo.

## Anti-references

- **Portfolio 3D da Awwwards**: scuro, neon, monospace, griglia di fondo, glow diffuso. È il riflesso di primo ordine della categoria, ed è la famiglia estetica del build capsule machine, due rifacimenti fa.
- **Editorial-typographic**: serif display, etichette maiuscole tracciate sopra ogni sezione, filetti come unico motivo, restraint monocromatico. Riflesso di secondo ordine, già scartato due build fa.
- **Estetica terminale**: prompt verdi, finte finestre di shell, cursori lampeggianti. Costume, non voce.
- **Profili README da template**: badge shields.io in fila, widget di statistiche, contatore di visite, animazione snake. Scartati uno per uno nella spec, con il motivo.
- **Landing da sviluppatore post 2024**: sfumatura viola dietro contenuto scuro, card tutte uguali con icona e titolo, sezione di metriche grandi.
- **Minimal bianco da template**: Inter su bianco con tre card tutte uguali e un footer. Il confine, qui, è che nessuna card del bento condivide campata o layout con un'altra, il carattere di sistema è una scelta dichiarata e il blu esiste solo dove si tocca: quando queste tre cose smettono di essere vere, la pagina è ricaduta nel template.

## Design Principles

1. **La pagina è la prova.** Con zero repository pubblici, l'unica dimostrazione di competenza disponibile è l'artefatto che il visitatore ha davanti. Ogni scelta si giudica così: aggiunge o toglie prova?

2. **Il movimento ha una causa.** Le parti si muovono perché qualcosa le ha spinte: un tasto premuto, una sezione attraversata, una copia riuscita. Mai perché una sezione è entrata nel viewport: un reveal per ogni sezione è il tell più riconoscibile del genere e non racconta nessun rapporto causa-effetto.

3. **Il gioco non è mai un pedaggio.** Il contenuto sta nel DOM dall'inizio e si legge tutto senza toccare niente. Chi ha fretta, chi usa uno screen reader e chi ha JavaScript spento ricevono la stessa pagina, non una versione mutilata.

4. **Il colore è interazione.** L'inchiostro su bianco porta tutto il contenuto; il blu appare solo su ciò che risponde al tocco: pill, link, focus, selezione, lo stato copiato. Una sola card stampa scura, per separare gli attrezzi dal resto. "Dove sono" lo dice il chrome con la voce corrente in evidenza, non un colore sparso in pagina.

5. **Niente che possa marcire.** L'artefatto pubblicato non fa una sola richiesta fuori dal proprio host e non contiene librerie runtime: un foglio di stile e un kilobyte di script. I build step sono ammessi, le dipendenze runtime da terzi no: se fra due anni la toolchain non installa più, la pagina servita deve restare identica.

## Accessibility & Inclusion

WCAG 2.1 AA, verificato **sul render reale**: contrasti letti dal browser sui colori risolti via canvas, non calcolati a mano sui token, perché `oklab()` e `color-mix()` sono il punto dove un audit scritto a mano sbaglia.

- `prefers-reduced-motion`: la pagina nasce a riposo. Le classi di partenza non vengono mai armate e lo scroll è auto. Una pagina ferma, non un'animazione lenta.
- `prefers-reduced-transparency` e `prefers-contrast` hanno risposte separate: chrome smerigliato pieno per la prima, bordi disegnati su card, pill e chrome per la seconda. Sono richieste diverse e non condividono la stessa scorciatoia.
- Il carattere di sistema segue le impostazioni di leggibilità del lettore, e le spaziature sono in rem: un corpo più grande allarga il layout invece di romperlo.
- La sezione corrente è nominata nel chrome con `aria-current`, e il link di avanzamento sposta anche il focus sulla sezione raggiunta, così il Tab successivo parte da dove si sta guardando.
- Bersagli tattili minimo 44px anche dentro la nav. `:hover` sempre chiuso dietro `@media (hover: hover) and (pointer: fine)`.
