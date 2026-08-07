/* Motion and behaviour for ohhnico.github.io.
   Loaded with defer, after vendor/gsap.min.js, which is vendored rather than
   fetched. The page is complete and usable if this file never runs.

   ## What moves

   One thing is choreographed, two things are readouts, and one answers a click.

   The choreography is the load, and it is GSAP: the name's optical size travels
   from the text cut to the display cut while the six index rows unpack from the
   right edge. The readouts are the gauge on the right edge, which opens as the
   hero leaves, and its marker, which reports where you are. The click is the
   copy button.

   Separately from all of that, five elements in the hero carry a CSS `rise`
   entrance, declared in input.css and running with no JavaScript at all.

   ## What does not move, on purpose

   Nothing in sections two through six. Not the four "What I work on" rows, not
   the twenty stack chips, not the two experience entries, not the three
   "Currently" columns. None of them has a cause-and-effect story that motion
   would be telling, and none of them is interactive, so an entrance would be
   decoration charged to the reader's attention. They are already visible. That
   is the correct state.

   ## Why there is no ScrollTrigger

   There was one. It was removed after measuring what it cost: 44.6 KB raw, on
   top of GSAP core, to drive two linear maps from scroll position to a single
   number. Three things made it indefensible. It registers a self-perpetuating
   requestAnimationFrame loop at module init that never stops, whether or not any
   trigger exists. The only consumer here is inside a (min-width: 1024px) guard,
   so every phone downloaded and parsed all of it to create exactly zero
   triggers. And the plumbing it sells (start and end resolution, refresh on
   resize) is, for two linear maps against the document height, the twenty lines
   below. GSAP core stays, because the load timeline is real choreography and
   sequencing it by hand is where hand written animation actually rots. */
(() => {
  "use strict";

  const gsap = window.gsap;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const html = document.documentElement;

  /* ------------------------------------------------------------------
     The copy button. Deliberately first, and outside every other guard.
     It is the only control on the page that is not a link, so it has to
     work whether or not the animation library loaded and whether or not
     the reader wants movement.
     ------------------------------------------------------------------ */
  const button = document.querySelector("[data-copy]");
  const status = document.getElementById("copy-status");
  if (button && navigator.clipboard) {
    let revert;
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
      } catch {
        /* Silent on purpose. This button sits beside a real mailto: anchor and
           never replaces it, so the fallback is already on screen. */
        return;
      }
      button.dataset.state = "done";
      /* The label swap is aria-hidden, so without this a screen reader gets no
         confirmation that the click did anything at all. */
      status.textContent = "Email address copied";
      clearTimeout(revert);
      revert = setTimeout(() => {
        delete button.dataset.state;
        status.textContent = "";
      }, 1800);
    });
  }

  /* ------------------------------------------------------------------
     The gauge and its marker. Plain rAF, no library, no dependency on
     GSAP having loaded.
     ------------------------------------------------------------------ */
  const gauge = document.querySelector("[data-gauge]");
  const marker = gauge && gauge.querySelector("i");
  const hero = document.getElementById("top");
  const desktop = matchMedia("(min-width: 1024px)");

  if (gauge && marker && hero) {
    let queued = false;
    let travel = 0;

    const measure = () => {
      travel = gauge.clientHeight - marker.offsetHeight;
    };

    const paint = () => {
      queued = false;
      if (!desktop.matches) return;

      const doc = html.scrollHeight - window.innerHeight;
      const progress = doc > 0 ? Math.min(1, Math.max(0, window.scrollY / doc)) : 0;

      /* The marker moves with a transform written straight onto itself.

         The build before this one positioned it with
         `inset-block-start: calc(var(--progress) * ...)`, which animates a
         layout property sixty times a second, fed by a custom property set on
         the PARENT. Changing an inherited custom property invalidates style for
         the whole subtree under it, so a scroll was recalculating the gauge and
         everything inside it every frame in order to move two pixels of light. */
      marker.style.transform = `translateY(${(progress * travel).toFixed(2)}px)`;

      /* The gauge opens across the hero's exit, mapped to scroll rather than
         switched at a threshold. The build before this one flipped an attribute
         when scrollY passed 60% of the viewport, which meant the gauge appeared
         because a number crossed a line. Mapped, the reader opens it themselves,
         and the index they are scrolling away from is visibly what produces it.

         Reduced motion gets the same instrument without the performance: the
         open state is switched rather than swept. A state that changes instantly
         is not motion, and a position readout is information the reader still
         wants. */
      const bottom = hero.getBoundingClientRect().bottom;
      const span = window.innerHeight * 0.6;
      const raw = span > 0 ? (window.innerHeight * 0.9 - bottom) / span : 1;
      const open = reduced.matches
        ? (raw > 0.5 ? 1 : 0.06)
        : 0.06 + Math.min(1, Math.max(0, raw)) * 0.94;

      gauge.style.transform = `scaleY(${open.toFixed(3)})`;
    };

    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    };

    const remeasure = () => {
      measure();
      schedule();
    };

    measure();
    paint();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", remeasure, { passive: true });
    desktop.addEventListener("change", remeasure);
    /* Fonts land after first layout and the hero is min-height: 100svh, so the
       heights measured on parse can be stale by a few pixels. */
    if (document.fonts) document.fonts.ready.then(remeasure);
  }

  /* ------------------------------------------------------------------
     The load. One GSAP timeline, played once, roughly 700ms wall clock.
     ------------------------------------------------------------------ */

  /* The `js` class is set by a blocking script in <head>, before first paint,
     and only when reduced motion is NOT requested. It carries the start states
     for this timeline (see input.css). If it is absent, the page is already at
     rest and must be left alone. */
  if (!gsap || !html.classList.contains("js")) return;

  /* power4.out, not power2.out and not a hand-registered CustomEase.

     The stylesheet's house curve is cubic-bezier(0.23, 1, 0.32, 1), a quintic
     ease out, and every CSS transition on this page already uses it. GSAP's
     power4 IS quintic, so the two match: sampled at 101 points the largest
     difference between them is 0.0166 and the average is 0.0047, which is below
     anything an eye resolves. So the CSS layer and this file share one curve
     without shipping the 3 KB of CustomEase to say so. power2.out is the
     quadratic one, and that is the weak default worth avoiding. */
  const OUT = "power4.out";

  const name = document.querySelector(".display");
  const rows = gsap.utils.toArray(".swatch");

  const tl = gsap.timeline({
    defaults: { ease: OUT },
    onComplete() {
      /* Hand the elements back to the stylesheet. An inline transform left on a
         row would outrank the hover rule, and an inline font-variation-settings
         left on the name would pin its optical size and stop it responding to a
         resize. */
      gsap.set(rows, { clearProps: "transform" });
      if (name) name.style.removeProperty("font-variation-settings");
      html.classList.remove("js");
    },
  });

  /* The name settles from the open text cut into the tight display cut.

     This is the one moment on the page allowed to be a performance, and the
     optical axis is the material for it, because it is the axis the whole type
     system is built on: the same family reads as a paragraph at opsz 12 and as
     signage at opsz 96. Watching it travel that distance is the page explaining
     its own typography in 620ms.

     The destination is the size the browser would have chosen anyway.
     `font-optical-sizing` is auto, so at rest the axis equals the used font
     size, which is 96 at the 6rem ceiling but 44 on a phone. Tweening to a
     hardcoded 96 and then clearing the inline value would therefore land the
     name at 96 and snap it back to 44 on the frame the timeline finished. Read
     the computed size and aim there, and the handover is invisible.

     Two things were measured rather than assumed. Tweening
     font-variation-settings reshapes text every frame, which is layout work,
     so: 60fps at 1x CPU and still 60fps with the CPU throttled 6x, because it is
     fourteen glyphs on two lines. And cumulative layout shift across the whole
     load is exactly 0, because the lines are block level with a fixed
     line-height, so glyph widths change inside a box that does not. */
  if (name) {
    const target = Math.min(96, Math.max(12, parseFloat(getComputedStyle(name).fontSize) || 96));
    const axis = { v: 12 };
    tl.to(axis, {
      v: target,
      duration: 0.62,
      onUpdate() {
        name.style.fontVariationSettings = `"opsz" ${axis.v.toFixed(1)}`;
      },
    }, 0.06);
  }

  /* The six index rows unpack from the right edge. That edge is the one they are
     pinned to and the one the gauge occupies once the hero is gone, so the
     direction is the page saying where the legend is going to live.

     scaleX from 0.92 and 18px out, never from 0: at the first painted frame the
     row is already a legible row. Stagger at 55ms, inside the 30 to 80 band
     where a cascade reads as one gesture rather than as six events. */
  if (rows.length) {
    tl.to(rows, {
      scaleX: 1,
      x: 0,
      duration: 0.34,
      stagger: 0.055,
    }, 0.18);
  }
})();
