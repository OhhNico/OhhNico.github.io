/* The document side plus the motion side. The document owns scroll and
   publishes one value, the current section; the motion side is bundled GSAP,
   served from this host like everything else, and it runs frames only while
   something the reader caused is still settling: an arrival, or a scrub that
   maps their scroll 1:1. On a still page nothing asks for a frame, and the
   verify harness holds it to that. */

import { gsap } from "gsap";

const sections = [...document.querySelectorAll("[data-section-index]")]
  .sort((a, b) => a.dataset.sectionIndex - b.dataset.sectionIndex);
const navLinks = [...document.querySelectorAll(".gnav-links a")];

let active = -1;
/* The advance cursor follows the reader while they scroll, and advances one
   step per press even when pressed faster than the scroll settles: a click
   mid-flight must not re-target the section already being flown to. */
let cursor = 0;

function setActive(index) {
  if (index === active) return;
  active = index;
  cursor = index;
  document.documentElement.dataset.section = sections[index].id;
  navLinks.forEach((link, i) => {
    if (i === index) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });
}

/* The browser decides which sections sit on the viewport's centre line, off
   the main thread. On a board two cards share a row, so two sections can sit
   on the line at once: the set keeps them all and the lowest index wins,
   which is deterministic instead of an order-of-events coin toss.

   The centre line has a blind spot: a short closing section above a short
   footer can never reach it, because the page runs out of scroll first. So a
   second observer watches the footer, and while the footer is fully in view
   the reader is at the end and the last section is the current one. */
const online = new Set();
let atEnd = false;

function recompute() {
  if (atEnd) setActive(sections.length - 1);
  else if (online.size) setActive(Math.min(...online));
}

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const index = Number(entry.target.dataset.sectionIndex);
    if (entry.isIntersecting) online.add(index);
    else online.delete(index);
  }
  recompute();
}, { rootMargin: "-50% 0px -50% 0px", threshold: 0 });

for (const section of sections) observer.observe(section);

const footer = document.querySelector("footer");
const endObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) atEnd = entry.intersectionRatio >= 0.99;
  recompute();
}, { threshold: [0, 0.99] });
if (footer) endObserver.observe(footer);

/* Deep link. Landing on #stack should name Stack in the chrome from the
   first frame, not perform the catch-up. */
const landed = sections.findIndex((s) => s.id === (location.hash || "").slice(1));
setActive(landed >= 0 ? landed : 0);

/* The advance link. Scroll obeys the stylesheet, where reduced motion
   already turned smooth into auto, and focus moves with the reader so the
   next Tab starts from where they are looking. */
const advance = document.querySelector("[data-advance]");
advance?.addEventListener("click", () => {
  cursor = Math.min(cursor + 1, sections.length - 1);
  const next = sections[cursor];
  next.scrollIntoView({ block: "start" });
  next.querySelector("h1, h2")?.focus({ preventScroll: true });
});

/* Copy. The state swap crossfades through a blur, because without it the two
   words are briefly legible on top of each other and read as two objects
   rather than one changing its mind. Out is 140ms against 200ms in: the
   system responding should outrun the user deciding. */
const copy = document.querySelector("[data-copy]");
const status = document.querySelector("[data-copy-status]");
let resetTimer;
copy?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(copy.dataset.copy);
    copy.dataset.state = "done";
    if (status) status.textContent = "Email address copied";
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      delete copy.dataset.state;
      if (status) status.textContent = "";
    }, 2200);
  } catch {
    /* Clipboard denied, over http, or an old browser. The address is already
       on screen as a mailto link, so there is nothing to recover from and
       nothing to apologise for. */
    if (status) status.textContent = "Copying is blocked here. The address is the link above.";
  }
});

/* Motion. Gated on the class the head script arms before first paint, so a
   reader who asked for less motion never runs a tween, and a browser with no
   script lands on the page at rest. Two kinds only: an arrival, played once
   on load from a transform-only start state the stylesheet already applied;
   and scrubs, paused GSAP tweens whose progress is set from scroll position
   on the scroll event itself. Rendering a paused tween is synchronous, so
   the scrubs cost zero animation frames: they are reversible by construction
   and a still page stays still by construction. Nothing fires because a
   section entered the viewport; the scroll position IS the playhead. */
if (document.documentElement.classList.contains("js")) {

  /* GSAP's ticker asks for a frame on every frame, forever, even when
     nothing moves: exactly the defect this project's stillness checks were
     written against. Only the arrival uses the ticker, so once the global
     timeline is idle the ticker is put to sleep; creating a tween is the
     thing that wakes it, and nothing here creates one after load. */
  let sleepTimer;
  const maybeSleep = () => {
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => {
      const busy = gsap.globalTimeline.getChildren(true, true, true).some((t) => t.isActive());
      if (busy) maybeSleep();
      else gsap.ticker.sleep();
    }, 180);
  };

  /* Arrival: the hero settles in order. The start state came from the
     stylesheet, so the first painted frame is already offset and no frame
     shows the page at rest before this line moves it. Short on purpose: the
     page must be asleep again within the second. */
  gsap.to("[data-load]", {
    y: 0, duration: 0.55, ease: "power3.out", stagger: 0.045,
    clearProps: "transform",
    onComplete: maybeSleep,
  });
  maybeSleep();

  /* The scrubs. Each entry maps a scroll-derived progress to a paused tween;
     the driver runs on the scroll event, skips writes when nothing changed,
     and reads at most a handful of rects. */
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const scrubs = [];
  const scrub = (tween, progressOf) => scrubs.push({ tween, progressOf, last: -1 });

  /* The chrome condenses: its material fades in over the first hundred
     pixels of scroll, worn on and off by position, never snapped. */
  scrub(
    gsap.fromTo(".gnav-material", { opacity: 0 }, { opacity: 1, ease: "none", paused: true }),
    () => clamp01((scrollY - 6) / 104),
  );

  /* Leaving, the hero drifts a touch slower than the page and dims. */
  const hero = document.querySelector("#top .wrap");
  scrub(
    gsap.to(hero, { y: -36, opacity: 0.45, ease: "none", paused: true }),
    () => { const r = hero.getBoundingClientRect(); return clamp01(-r.top / (r.height || 1)); },
  );

  /* Cards and the closing section rise as the reader pulls them in, from 94%
     of the viewport to 64%: scrolling back plays it back. */
  for (const el of document.querySelectorAll(".bento .card, #contact .wrap")) {
    scrub(
      gsap.fromTo(el, { y: 30, opacity: 0 }, { y: 0, opacity: 1, ease: "none", paused: true }),
      () => { const t = el.getBoundingClientRect().top / innerHeight; return clamp01((0.94 - t) / 0.3); },
    );
  }

  /* The dark card deals its capsules in a cascade on the same playhead. */
  const dark = document.querySelector(".card-dark");
  scrub(
    gsap.timeline({ paused: true }).fromTo(".card-dark .chip",
      { y: 12, opacity: 0 }, { y: 0, opacity: 1, ease: "none", duration: 0.4, stagger: 0.045 }),
    () => { const t = dark.getBoundingClientRect().top / innerHeight; return clamp01((0.92 - t) / 0.52); },
  );

  const drive = () => {
    for (const s of scrubs) {
      const p = s.progressOf();
      if (p !== s.last) { s.last = p; s.tween.progress(p); }
    }
  };
  addEventListener("scroll", drive, { passive: true });
  addEventListener("resize", drive, { passive: true });
  drive();
}
