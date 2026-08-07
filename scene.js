/* The corridor.

   A WebGL backdrop for the whole page: a ribbed shaft running away from the
   reader, painted the colour of the section they are in, with a lit gate at
   every section boundary. Scrolling flies the camera down it. Six gates, six
   sections, and each gate carries the hex of the band it opens into, so passing
   through one is the same event as arriving at a heading.

   ## Why ribs

   The first build of this was a smooth tunnel and it read as rectangles hanging
   in fog, because a smooth surface travelling past you has nothing on it to
   travel. Speed is only visible against texture. So the shaft is ribbed at close
   intervals, the ribs stream past at the edges of the frame, and the six gates
   are the ribs that mean something.

   ## Why this shape and not a hero object

   Text has to stay readable on top of it. A shaft puts all its geometry around
   the rim of the frame and leaves the middle open, and exponential fog closes
   the far end into a flat field of exactly the band colour the stylesheet would
   have painted there anyway. So the contrast behind a paragraph is the contrast
   that was already measured, and the three dimensional part happens in the
   margins and at the crossings.

   ## Progressive enhancement, and it is not a slogan here

   This file is an ES module, so the browser defers it by definition. The page
   has already parsed, styled and painted before a byte of three.js is executed.
   Every section still carries its own `background-color` in CSS; the `webgl`
   class this file sets is what turns those transparent, and it is only set after
   a context has actually been created. No WebGL, no module support, a thrown
   error, reduced motion, or a save-data header: the page stays exactly the page
   that was already on screen.

   That is also why the camera can never hide a word. The words are HTML, above
   the canvas, and nothing here can reach them. */

import {
  AdditiveBlending, BackSide, BoxGeometry, BufferAttribute, BufferGeometry,
  CanvasTexture, Color, FogExp2, Group, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry,
  PointLight, Points, PointsMaterial, Scene, SRGBColorSpace, WebGLRenderer,
} from "./vendor/three.module.min.js";

/* Everything below runs inside a function purely so that the four ways this
   scene declines to start can `return` instead of `throw`. A module that bails
   by throwing leaves an uncaught error in the console of every visitor without
   WebGL, and on a page that links its own source that is not a small thing: the
   page is working exactly as designed in that case, and the console should say
   so by saying nothing. */
(() => {
/* The ramp, in page order. The same six values the markup carries as
   [--band:#xxxxxx] and the index prints as text. Written here a second time
   because a shader cannot read a custom property, and kept next to the labels so
   the two cannot drift apart silently. */
const BANDS = [
  { hex: 0x000000, label: "000000" },
  { hex: 0x1b1b1b, label: "1B1B1B" },
  { hex: 0x2a1e36, label: "2A1E36" },
  { hex: 0x3a2152, label: "3A2152" },
  { hex: 0x49236d, label: "49236D" },
  { hex: 0x582688, label: "582688" },
];

const GLOW = 0xcbb0ff;
/* The shaft is deliberately tight.

   The first build made it 30 wide with gates every 46, and the arithmetic of a
   62 degree lens says a wall at 30 only reaches the edge of the frame at 50
   units out. Every gate was therefore closer than the distance at which it
   would have been visible at all, and the walls never entered the picture: the
   result read as fog with a few lines in it. At 14 the walls are at the frame
   edge from 23 units out, so they are always there, the ribs on them stream
   past, and a gate crosses the screen instead of never arriving. */
const GAP = 32;            /* distance between gates along Z */
const RIBS_PER_GAP = 5;    /* ribs between one gate and the next */
const W = 14;              /* half width of the shaft */
const RUN = GAP * (BANDS.length - 1);

const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const coarse = matchMedia("(pointer: coarse)");
const html = document.documentElement;

/* Bail before touching anything if the reader asked for stillness or the device
   said it is metering data. Neither is a failure: the CSS page is the page. */
if (reduced.matches || navigator.connection?.saveData) return;

const canvas = document.getElementById("scene");
if (!canvas) return;

let renderer;
try {
  renderer = new WebGLRenderer({
    canvas,
    antialias: !coarse.matches,
    powerPreference: "high-performance",
    /* The page paints its own black underneath, so the drawing buffer never
       needs an alpha channel to composite against it. */
    alpha: false,
  });
} catch {
  return;
}

/* Retina is not free and this scene is large flat surfaces, where the second
   pixel buys almost nothing. Two on desktop, one and a half on a phone. */
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse.matches ? 1.5 : 2));
renderer.outputColorSpace = SRGBColorSpace;

const scene = new Scene();
const camera = new PerspectiveCamera(62, 1, 0.1, GAP * 6);

/* Exponential fog, dense enough that the shaft closes into flat colour well
   before the far clip. This is the part that protects the type: whatever the
   geometry is doing, the field behind a paragraph resolves to the band colour. */
const fog = new FogExp2(BANDS[0].hex, 0.042);
scene.fog = fog;
scene.background = new Color(BANDS[0].hex);

/* ---------------------------------------------------------------------------
   The shaft. One long box seen from the inside: cheaper than four planes and it
   cannot develop seams at the corners.
--------------------------------------------------------------------------- */
const shellMaterial = new MeshStandardMaterial({
  color: new Color(BANDS[0].hex),
  roughness: 0.7,
  metalness: 0.28,
  side: BackSide,
});
const shell = new Mesh(new BoxGeometry(W * 2, W * 2, RUN + GAP * 4, 1, 1, 32), shellMaterial);
shell.position.z = -RUN / 2;
scene.add(shell);

/* ---------------------------------------------------------------------------
   The ribs. Four instanced runs, one per wall, so the whole texture of the shaft
   costs four draw calls no matter how many ribs there are.
--------------------------------------------------------------------------- */
const RIB_STEP = GAP / RIBS_PER_GAP;
const RIB_COUNT = Math.ceil((RUN + GAP * 3) / RIB_STEP);
const T = 0.2;    /* rib thickness */
const D = 0.55;   /* rib depth along Z */

const ribMaterial = new MeshStandardMaterial({
  color: new Color(GLOW),
  roughness: 0.5,
  metalness: 0.45,
});

const ribShapes = [
  { geo: new BoxGeometry(W * 2, T, D), pos: (z) => [0, W - T / 2, z] },   /* ceiling */
  { geo: new BoxGeometry(W * 2, T, D), pos: (z) => [0, -W + T / 2, z] },  /* floor */
  { geo: new BoxGeometry(T, W * 2, D), pos: (z) => [-W + T / 2, 0, z] },  /* left */
  { geo: new BoxGeometry(T, W * 2, D), pos: (z) => [W - T / 2, 0, z] },   /* right */
];

const m4 = new Matrix4();
for (const side of ribShapes) {
  const mesh = new InstancedMesh(side.geo, ribMaterial, RIB_COUNT);
  for (let i = 0; i < RIB_COUNT; i++) {
    const z = GAP - i * RIB_STEP;
    mesh.setMatrixAt(i, m4.makeTranslation(...side.pos(z)));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
}

/* ---------------------------------------------------------------------------
   The gates. A lintel and a sill, spanning the shaft, one pair per band.

   Not a ring, and the reason is the viewport. A square ring in a 16:9 frame
   always has its two uprights inside the picture at the moment its lintel and
   sill reach the top and bottom edges, and inside the picture is exactly where
   the paragraph is. Two earlier builds died on that: one put a bright rectangle
   across the reading column, and the fix for it faded the ring out so early that
   by the time it was bright it had already left the frame entirely. Drop the
   uprights and the problem is not balanced, it is gone. What sweeps past is a
   bar above and a bar below, which is what crossing a threshold looks like
   anyway.
--------------------------------------------------------------------------- */
const BAR_H = 0.55;
const barGeometry = new BoxGeometry(W * 2.02, BAR_H, 1.1);

/* The hex, drawn once into a canvas and used as a texture. It is the same string
   the index prints and the same string the heading beside it carries, so the
   label on the gate you fly through names the section you are arriving in. */
function labelTexture(text) {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 96;
  const g = c.getContext("2d");
  g.font = "500 46px 'Chivo Mono', ui-monospace, monospace";
  g.fillStyle = "#CBB0FF";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.letterSpacing = "16px";
  g.fillText(text, 8, c.height / 2 + 1);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const gates = [];

BANDS.forEach((band, i) => {
  const group = new Group();
  group.position.z = -i * GAP;

  /* Lit in the accent, additively, so a gate reads as light rather than as an
     object with a colour. Opacity is driven by distance in the frame loop. */
  const material = new MeshBasicMaterial({
    color: GLOW,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });

  for (const sign of [1, -1]) {
    const bar = new Mesh(barGeometry, material);
    bar.position.y = sign * (W - BAR_H / 2);
    group.add(bar);
  }

  const label = new Mesh(
    new PlaneGeometry(7.4, 1.1),
    new MeshBasicMaterial({ map: labelTexture(band.label), transparent: true, opacity: 0, depthWrite: false })
  );
  label.position.set(-W * 0.52, -W + BAR_H * 3.4, 0.6);
  group.add(label);

  scene.add(group);
  gates.push({ group, edgeMaterial: material, label: label.material, z: -i * GAP });
});

/* ---------------------------------------------------------------------------
   The corner strips. Four continuous lines of light running the whole length of
   the shaft, one down each corner. They are the reason it reads as a corridor
   with a vanishing point rather than as a box with things in it: four lines
   converging is the oldest depth cue there is, and unlike the ribs they never
   stop, so there is always something in frame telling you which way is away.
--------------------------------------------------------------------------- */
const stripGeometry = new BoxGeometry(0.22, 0.22, RUN + GAP * 4);
const stripMaterial = new MeshBasicMaterial({
  color: GLOW,
  transparent: true,
  opacity: 0.15,
  blending: AdditiveBlending,
  depthWrite: false,
  fog: true,
});
for (const [sx, sy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
  const strip = new Mesh(stripGeometry, stripMaterial);
  strip.position.set(sx * (W - 0.18), sy * (W - 0.18), -RUN / 2);
  strip.frustumCulled = false;
  scene.add(strip);
}

/* ---------------------------------------------------------------------------
   Dust. Enough to read the speed of travel, not enough to read as weather.
--------------------------------------------------------------------------- */
const DUST = coarse.matches ? 420 : 950;
const dustPositions = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) {
  dustPositions[i * 3] = (Math.random() - 0.5) * W * 1.85;
  dustPositions[i * 3 + 1] = (Math.random() - 0.5) * W * 1.85;
  dustPositions[i * 3 + 2] = GAP - Math.random() * (RUN + GAP * 3);
}
const dustGeometry = new BufferGeometry();
dustGeometry.setAttribute("position", new BufferAttribute(dustPositions, 3));
const dust = new Points(dustGeometry, new PointsMaterial({
  color: GLOW,
  size: 0.1,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.2,
  blending: AdditiveBlending,
  depthWrite: false,
}));
scene.add(dust);

/* Two lights that travel with the camera, so the shaft is lit where the reader
   is and falls away behind them. This is what makes the ribs read: they catch
   the key light as they come level and lose it as they pass. */
const key = new PointLight(GLOW, 190, GAP * 1.6, 2);
scene.add(key);
const fill = new PointLight(0xffffff, 90, GAP * 1.2, 2);
scene.add(fill);

/* ---------------------------------------------------------------------------
   Driving it
--------------------------------------------------------------------------- */
const colours = BANDS.map((b) => new Color(b.hex));
const bandColour = new Color();

const state = { progress: 0, eased: 0, px: 0, py: 0, tx: 0, ty: 0 };

function readScroll() {
  const max = html.scrollHeight - window.innerHeight;
  state.progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

/* Pointer parallax. Damped rather than mapped, because a camera that answers a
   mouse one to one reads as a cursor rather than as a place. Never on a touch
   screen, where the only pointer events come from taps. */
if (!coarse.matches) {
  addEventListener("pointermove", (e) => {
    state.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    state.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
}

addEventListener("scroll", readScroll, { passive: true });
addEventListener("resize", resize, { passive: true });

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);

  /* Frame independent damping. A fixed lerp factor makes the chase faster on a
     144Hz screen than on a 60Hz one, which is how a camera ends up feeling like
     a different camera on somebody else's monitor. */
  const dt = Math.min(0.064, (now - last) / 1000);
  last = now;

  state.eased += (state.progress - state.eased) * (1 - Math.pow(0.0022, dt));
  state.px += (state.tx - state.px) * (1 - Math.pow(0.0012, dt));
  state.py += (state.ty - state.py) * (1 - Math.pow(0.0012, dt));

  /* Travel. The camera starts just inside the first gate and ends just past the
     last, so the final band is a room you arrive in rather than a wall you stop
     against. */
  camera.position.z = 6 - state.eased * RUN;
  camera.position.x = state.px * 1.5;
  camera.position.y = -state.py * 1.1;
  camera.lookAt(state.px * 1.1, -state.py * 0.9, camera.position.z - 14);

  key.position.set(camera.position.x, camera.position.y, camera.position.z - 9);
  fill.position.set(camera.position.x, camera.position.y + 5, camera.position.z + 3);

  /* Colour. Exactly the interpolation the page would do if it could blend
     between two of its own bands, driven by the same scroll value. Fog,
     background and shaft all take it, which is what keeps the field behind the
     text equal to the band the reader is standing in. */
  const t = state.eased * (BANDS.length - 1);
  const i = Math.min(BANDS.length - 2, Math.floor(t));
  bandColour.copy(colours[i]).lerp(colours[i + 1], t - i);
  fog.color.copy(bandColour);
  scene.background.copy(bandColour);
  shellMaterial.color.copy(bandColour);

  /* Gate brightness by distance. Nothing within reading range, everything at the
     crossing. REACH is a little over half a gap, so at most one gate is ever
     lighting up and the corridor never turns into a row of glowing boxes. */
  const REACH = GAP * 1.3;
  for (const gate of gates) {
    const d = Math.abs(gate.z - camera.position.z);
    const near = Math.max(0, 1 - d / REACH);
    /* Squared, so it stays dim through most of the approach and gathers late.
       A gate should arrive, not fade up from the moment it exists. */
    gate.edgeMaterial.opacity = near * near * 0.45;
    gate.label.opacity = near * near * near;
  }

  dust.rotation.z += dt * 0.012;

  renderer.render(scene, camera);
}

readScroll();
state.eased = state.progress;
resize();

/* Only now. Up to this point a thrown error leaves a page that never knew the
   canvas was coming; past it, the CSS band backgrounds go transparent and the
   shaft is what the reader sees behind the type. */
html.classList.add("webgl");
requestAnimationFrame(frame);
})();
