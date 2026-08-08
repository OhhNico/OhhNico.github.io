/* The whole script. The document owns scroll and publishes one value, the
   current section, and that value drives one readout: the chrome names where
   you are. Nothing here runs per frame; every line executes on a discrete
   event and then the page is still. */

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
