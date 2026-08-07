/* The document side. Owns scroll, publishes one number, and never reaches into
   the scene except through that number.

   The whole coupling between the page and the machine is two messages going one
   way each: the DOM says which section is active, and the machine says the
   lever was pulled. Everything else the machine does, it derives. */

import { mount } from "./machine/index.js";

const root = document.documentElement;
const sections = [...document.querySelectorAll("[data-section-index]")]
  .sort((a, b) => a.dataset.sectionIndex - b.dataset.sectionIndex);

const ACCENTS = ["--color-c1", "--color-c2", "--color-c3", "--color-c4", "--color-c5", "--color-c6"];
const NAMES = ["intro", "work", "stack", "experience", "currently", "contact"];

let active = -1;
let machine = null;

/* Writing an inherited custom property on the root invalidates style for the
   whole subtree under it. That is why the previous build's scroll gauge was a
   performance defect: it wrote one sixty times a second and recomputed the
   document every frame.

   Here it happens six times per visit, on a discrete event that is already a
   section change. One token written, the whole page retinted. The rule that
   still holds is the one that build broke: never write a custom property inside
   a frame loop. */
function setActive(index) {
  if (index === active) return;
  active = index;
  root.style.setProperty("--accent", `var(${ACCENTS[index]})`);
  root.dataset.section = NAMES[index];
  const counter = document.querySelector("[data-counter]");
  if (counter) counter.textContent = String(index + 1);
  machine?.setActive(index);
}

/* The browser decides which section is active, off the main thread, instead of
   a scroll handler doing arithmetic on every event. The margin puts the line at
   the middle of the viewport: a section is active once it has crossed the
   reader's centre, not when a pixel of it appears. */
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) setActive(Number(entry.target.dataset.sectionIndex));
  }
}, { rootMargin: "-50% 0px -50% 0px", threshold: 0 });

for (const section of sections) observer.observe(section);

/* Deep link. Landing on #stack should show a machine that has already
   dispensed three capsules, not one that performs the catch-up. */
const landed = NAMES.indexOf((location.hash || "").slice(1));
setActive(landed >= 0 ? landed : 0);

/* The real control. The lever in the scene is its shortcut. */
const advance = document.querySelector("[data-advance]");
advance?.addEventListener("click", () => {
  const next = sections[Math.min(active + 1, sections.length - 1)];
  next?.scrollIntoView({ block: "start" });
  next?.querySelector("h1, h2")?.focus?.();
});

/* Focus on the button lights the lever, so the focus state does not vanish at
   the edge of the canvas. */
advance?.addEventListener("focus", () => machine?.highlightLever(true));
advance?.addEventListener("blur", () => machine?.highlightLever(false));

/* Copy. The state swap crossfades through a blur, because without it the two
   words are briefly legible on top of each other and read as two objects rather
   than one changing. Out is 140ms against 200ms in: the system responding
   should outrun the user deciding. */
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
    /* Clipboard denied, over http, or an old browser. The address is already on
       screen as a mailto link, so there is nothing to recover from and nothing
       to apologise for. */
    if (status) status.textContent = "Copying is blocked here. The address is the link above.";
  }
});

/* The scene comes last and is allowed to decline. Nothing above this line
   depends on it. */
machine = mount({
  canvas: document.getElementById("scene"),
  sectionCount: sections.length,
  onAdvance: () => advance?.click(),
});
machine?.setActive(active);
