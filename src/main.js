/* The whole script. The document owns scroll and publishes one number, the
   active section, and that number drives three readouts: the counter, the
   rail, and the current row of the index. Nothing here runs per frame; every
   line below executes on a discrete event and then the page is still. */

const sections = [...document.querySelectorAll("[data-section-index]")]
  .sort((a, b) => a.dataset.sectionIndex - b.dataset.sectionIndex);
const tocLinks = [...document.querySelectorAll("nav ol a[href^='#']")];
const ticks = [...document.querySelectorAll(".rail-tick")];
const counter = document.querySelector("[data-counter]");

let active = -1;

function setActive(index) {
  if (index === active) return;
  active = index;
  /* The root carries the current section's id, which is how the rail knows to
     restate itself in the plate's palette when it floats over the plate. */
  document.documentElement.dataset.section = sections[index].id;
  if (counter) counter.textContent = String(index + 1);
  ticks.forEach((tick, i) => tick.toggleAttribute("data-on", i === index));
  tocLinks.forEach((link, i) => {
    if (i === index) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });
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

/* Deep link. Landing on #stack should read 3 / 6 from the first frame, not
   perform the catch-up. */
const landed = sections.findIndex((s) => s.id === (location.hash || "").slice(1));
setActive(landed >= 0 ? landed : 0);

/* The key. Scroll obeys the stylesheet, which is where reduced motion already
   turned smooth into auto, and focus moves with the reader so the next Tab
   starts from the section they are looking at, not the one they left. */
const advance = document.querySelector("[data-advance]");
advance?.addEventListener("click", () => {
  const next = sections[Math.min(active + 1, sections.length - 1)];
  next?.scrollIntoView({ block: "start" });
  next?.querySelector("h1, h2")?.focus({ preventScroll: true });
});

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
