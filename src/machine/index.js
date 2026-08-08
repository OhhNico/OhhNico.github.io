/* The scene: renderer, camera, light, and the frame loop.

   Everything here is allowed to decline. The page is complete before this file
   runs, every section is readable without it, and the only mark it leaves on
   the document is a `webgl` class set after a context exists. Five ways of
   declining are listed at the top of mount(), in the order they are checked. */

import {
  ACESFilmicToneMapping, AmbientLight, Color, PerspectiveCamera, PointLight,
  Raycaster, Scene, SRGBColorSpace, Vector2, WebGLRenderer, MathUtils,
} from "three";

import { makeMaterials } from "./materials.js";
import { buildMachine } from "./parts.js";
import { makeCapsules, LIVE } from "./capsules.js";
import { createSolver } from "./physics.js";
import { createDispenser } from "./dispense.js";

/* 36, not 44. The reconstruction's silhouette gate measured the settled pile
   against the reference photograph: 44 of these capsules pour to a peak at
   0.70 of the object height where the photograph's mass tops out at 0.62, and
   36 brings the fill to 0.661 and the like-for-like IoU from 0.8410 to 0.8586
   against the 0.85 gate. Radius stays 0.16 of the globe: the photographic
   0.120 was tried at four counts and always measured worse, because the
   solver piles small capsules into steep cones. Owner-approved 2026-08-08. */
const DESKTOP_CAPSULES = 36;
const MOBILE_CAPSULES = 18;

export function mount({ canvas, sectionCount, onAdvance }) {
  if (!canvas) return null;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = matchMedia("(pointer: coarse)");
  const wide = matchMedia("(min-width: 64rem)");
  const saveData = navigator.connection?.saveData === true;

  /* Cheap mode drops the transmission pass, which is by a wide margin the most
     expensive thing on this page: it makes three.js render the scene into a
     target a second time every frame. A phone gets a hand-written Fresnel
     instead, which is not the same material but is the same reading. */
  const cheap = coarse.matches || saveData;

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: !cheap, powerPreference: "high-performance", alpha: false });
  } catch {
    /* No WebGL. Not a failure: the page painted correctly before this ran and
       it is still correct now. Returning quietly is the right amount of noise. */
    return null;
  }

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cheap ? 1 : 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  scene.background = new Color(0x08080b);

  const materials = makeMaterials(renderer, { cheap });
  const { group, sockets } = buildMachine(materials);
  scene.add(group);

  const count = cheap ? MOBILE_CAPSULES : DESKTOP_CAPSULES;
  const bodyRadius = sockets.globeRadius * 0.16;
  const capsules = makeCapsules(materials, { count, radius: bodyRadius });
  for (const c of capsules.items) scene.add(c.group);

  /* pour: seed the fill in the upper hemisphere, which is what this call's
     comment in physics.js always claimed; the full-sphere scatter left
     capsules frozen against the mid glass. spindle: the rod down the globe's
     axis, from the spec via sockets, so capsules stop interpenetrating it and
     stacking on the axis. Both measured on the silhouette gate, 2026-08-08. */
  const solver = createSolver({
    radius: sockets.globeRadius, count, bodyRadius, pour: true,
    spindle: {
      radius: sockets.spindle.radius,
      y0: sockets.spindle.y0 - sockets.globeCentre.y,
      y1: sockets.spindle.y1 - sockets.globeCentre.y,
    },
  });
  const dispenser = createDispenser({
    capsules, sockets, solver, total: count, live: Math.min(LIVE.length, sectionCount),
  });

  /* Light, in the units three.js has used since r155: candela, falling off with
     the square of distance. The first pass here carried numbers from the old
     legacy scale, around 26, which at five units from the source resolves to
     roughly one lux and rendered a machine that was almost pure black.

     The globe is the lamp. Its colour is the current section's capsule, so the
     room is lit by where the reader is. */
  const key = new PointLight(0xffffff, 260, sockets.height * 5, 2);
  key.position.copy(sockets.globeCentre);
  scene.add(key);

  /* A cold rim from behind and above, so the chrome has an edge and the machine
     separates from a background that is nearly its own value. This is the light
     that does the real work: without it a dark metal object on a dark ground
     has no silhouette at all. */
  const rim = new PointLight(0xa8c8ff, 1500, sockets.height * 8, 2);
  rim.position.set(-sockets.height * 0.95, sockets.height * 1.5, -sockets.height * 1.05);
  scene.add(rim);

  /* A second, weaker rim on the other side. One rim gives an edge; two give the
     body a form, which is the difference between a silhouette and an object. */
  const rim2 = new PointLight(0x8fb4ff, 700, sockets.height * 8, 2);
  rim2.position.set(sockets.height * 1.1, sockets.height * 1.15, -sockets.height * 0.8);
  scene.add(rim2);

  /* A low warm bounce in front, so the cast plate and the lever are readable
     rather than a black panel on a black body. */
  const fill = new PointLight(0xffd9b0, 620, sockets.height * 5, 2);
  fill.position.set(sockets.height * 0.75, sockets.height * 0.15, sockets.height * 1.6);
  scene.add(fill);

  scene.add(new AmbientLight(0x2a2e3a, 2.2));

  const camera = new PerspectiveCamera(34, 1, 0.1, 200);
  const accent = new Color();
  const target = { yaw: 0, pitch: 0 };
  const eased = { yaw: 0, pitch: 0 };
  let active = 0;
  let leverLit = false;

  function frame_layout() {
    const w = innerWidth;
    const h = wide.matches ? innerHeight : Math.round(innerHeight * 0.42);
    camera.aspect = w / h;
    /* From lg up the machine sits in the right 45% and the reading column has
       the left to itself, so the camera is offset rather than the object moved:
       an object pushed sideways in a perspective frame skews, a shifted camera
       does not. */
    const shift = wide.matches ? 0.34 : 0;
    camera.setViewOffset(w, h, -w * shift, 0, w, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  const raycaster = new Raycaster();
  const pointer = new Vector2();

  if (!coarse.matches) {
    addEventListener("pointermove", (e) => {
      target.yaw = (e.clientX / innerWidth - 0.5) * 0.42;
      target.pitch = (e.clientY / innerHeight - 0.5) * 0.2;
      pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    }, { passive: true });
  }

  canvas.addEventListener("pointerdown", (e) => {
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObject(sockets.leverHitbox, true).length) onAdvance?.();
  });

  addEventListener("resize", frame_layout, { passive: true });
  frame_layout();

  /* Reduced motion: draw the still life once and stop. Not a slower animation,
     which would still be movement, and not a blank canvas, which would lose the
     object. Every capsule is already in the tray, because that is what the page
     looks like once it has been read. */
  if (reduced.matches) {
    dispenser.jumpTo(sectionCount - 1);
    solver.step(1 / 60);
    for (let i = 0; i < 240; i++) solver.step(1 / 60);
    dispenser.jumpTo(sectionCount - 1);
    accent.setHex(LIVE[LIVE.length - 1]);
    key.color.copy(accent);
    materials.halo.uniforms.uColor.value.copy(accent);
    camera.position.set(sockets.height * 0.34, sockets.height * 0.62, sockets.height * 1.72);
    camera.lookAt(0, sockets.height * 0.5, 0);
    renderer.render(scene, camera);
    document.documentElement.classList.add("webgl");
    return {
      setActive() {},
      highlightLever() {},
      dispose() { renderer.dispose(); },
    };
  }

  let last = performance.now();
  let running = true;

  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    /* Frame independent damping. A fixed lerp factor chases faster on a 144Hz
       screen than on a 60Hz one, which is how a camera ends up feeling like a
       different camera on somebody else's monitor. */
    const wall = (now - last) / 1000;
    const dt = Math.min(0.05, wall);
    last = now;

    eased.yaw += (target.yaw - eased.yaw) * (1 - Math.pow(0.0015, dt));
    eased.pitch += (target.pitch - eased.pitch) * (1 - Math.pow(0.0015, dt));

    const radius = sockets.height * 2.55;
    camera.position.set(
      Math.sin(eased.yaw) * radius,
      sockets.height * (0.62 + eased.pitch * 0.5),
      Math.cos(eased.yaw) * radius,
    );
    camera.lookAt(0, sockets.height * 0.5, 0);

    dispenser.update(dt);
    if (!solver.asleep) solver.step(dt, wall);

    sockets.lever.rotation.z = -dispenser.crankAngle();

    /* The light and the halo follow the active capsule's colour, so the page's
       only light source is the section the reader is in. */
    const wanted = LIVE[Math.min(active, LIVE.length - 1)];
    accent.lerp(new Color(wanted), 1 - Math.pow(0.002, dt));
    key.color.copy(accent);
    key.intensity = 26 + (leverLit ? 8 : 0);
    materials.halo.uniforms.uColor.value.copy(accent);
    materials.halo.uniforms.uStrength.value = leverLit ? 0.78 : 0.55;

    renderer.render(scene, camera);
  }

  /* Only now. Up to this point a throw leaves a page that never knew the canvas
     was coming; past it, the reader is looking at the machine. */
  if (location.search.includes("debug")) window.__m = { scene, camera, capsules, sockets, solver, dispenser, materials, group };
  document.documentElement.classList.add("webgl");
  requestAnimationFrame(loop);

  return {
    setActive(i) {
      active = i;
      dispenser.setActive(i);
    },
    highlightLever(on) { leverLit = on; },
    dispose() {
      running = false;
      capsules.dispose();
      renderer.dispose();
    },
  };
}
