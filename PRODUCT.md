# Product

## Register

brand

## Users

Chi arriva qui ci arriva da un link: il campo `blog` del profilo GitHub, il badge nel README, o la firma di una mail. Quasi sempre sta facendo una cosa sola, capire in fretta chi è la persona dall'altra parte: un recruiter, un collega, qualcuno che ha ricevuto un preventivo e sta controllando.

Il contesto d'uso pesa su ogni decisione: sessione breve, spesso da telefono, spesso una volta sola. Non è un prodotto in cui si torna. Quindi l'ingresso può permettersi una messa in scena, e tutto il resto no.

## Product Purpose

Vetrina personale di Nicolò Rengifo, full-stack web developer. Nessuna ricerca attiva di lavoro: la pagina esiste perché il dominio del CV (`nicolorengifo.it`) è morto e serve un bersaglio vivo per i link.

Tutti i repository restano privati, quindi non c'è codice pubblico da mostrare. **La pagina stessa deve essere la prova.** Chi la guarda deve poter dedurre la competenza dall'artefatto, non dall'elenco.

Successo: qualcuno chiede "come è fatto questo?" invece di "quale template è?".

## Brand Personality

**Meccanico, luminoso, asciutto.**

Meccanico: la pagina è un oggetto che si aziona, con parti che si muovono per una causa e non per decorazione. Luminoso: sta al buio e produce luce propria, invece di ricevere illuminazione da fuori. Asciutto: nessuna frase promozionale, nessun aggettivo che non porti un fatto (regole di scrittura in `docs/superpowers/specs/`).

**Riferimento nominato:** il registro hardware giocoso di Panic per Playdate, messo in scena come una vetrina accesa in un locale chiuso. La pagina si comporta come la pagina prodotto di una macchina, e la scheda tecnica della macchina è il CV.

## Anti-references

- **Portfolio 3D da Awwwards**: scuro, neon, monospace, griglia di fondo, glow diffuso. È il riflesso di primo ordine della categoria, indovinabile prima di aprire la pagina.
- **Editorial-typographic**: serif display, etichette maiuscole tracciate sopra ogni sezione, filetti, restraint monocromatico. È il riflesso di secondo ordine, ed è la build che questa sostituisce.
- **Estetica terminale**: prompt verdi, finte finestre di shell, cursori lampeggianti. Costume, non voce.
- **Profili README da template**: badge shields.io in fila, widget di statistiche, contatore di visite, animazione snake. Scartati uno per uno nella spec, con il motivo.
- **Landing da sviluppatore post 2024**: sfumatura viola dietro contenuto scuro, card tutte uguali con icona e titolo, sezione di metriche grandi.

## Design Principles

1. **La pagina è la prova.** Con zero repository pubblici, l'unica dimostrazione di competenza disponibile è l'artefatto che il visitatore ha davanti. Ogni scelta si giudica così: aggiunge o toglie prova?

2. **Il movimento ha una causa.** Le parti si muovono perché qualcosa le ha spinte, mai perché una sezione è entrata nel viewport. Un reveal per ogni sezione è il tell più riconoscibile del genere e non racconta nessun rapporto causa-effetto.

3. **Il gioco non è mai un pedaggio.** Il contenuto sta nel DOM dall'inizio e si legge tutto senza toccare niente. Chi ha fretta, chi usa uno screen reader e chi ha JavaScript spento ricevono la stessa pagina, non una versione mutilata.

4. **Un colore alla volta.** Sei accenti esistono, uno per sezione, ma fuori dal vetro ne vive uno solo: quello della sezione in cui sei. I sei insieme si vedono soltanto dentro la sfera, che è l'unico posto dove sei plastiche colorate hanno una ragione fisica.

5. **Niente che possa marcire.** L'artefatto pubblicato non fa una sola richiesta fuori dal proprio host. I build step sono ammessi, le dipendenze runtime da terzi no: se fra due anni la toolchain non installa più, la pagina servita deve restare identica.

## Accessibility & Inclusion

WCAG 2.1 AA, verificato **sul render reale**: contrasti letti dal browser sui colori risolti via canvas, non calcolati a mano sui token, perché `oklab()` e `color-mix()` sono il punto dove un audit scritto a mano sbaglia.

- `prefers-reduced-motion`: la macchina viene disegnata una volta, capsule già nella vaschetta, nessun loop di animazione. Una natura morta invece di una macchina.
- Il canvas è decorativo e `aria-hidden`. Nessun contenuto, nessun controllo e nessun focus vivono dentro la scena senza un equivalente in HTML.
- Ogni comando 3D ha un gemello raggiungibile da tastiera, etichettato.
- I sei accenti sono distinguibili anche senza percezione del colore: ogni sezione porta il proprio nome scritto, e la posizione nella macchina è ridondante rispetto alla tinta.
- Bersagli tattili minimo 44px. `:hover` sempre chiuso dietro `@media (hover: hover) and (pointer: fine)`.
