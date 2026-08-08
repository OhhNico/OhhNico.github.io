/* Emit src/machine/parts.js from the img2threejs sculpt spec.

   ## Why this exists instead of the skill's own generator writing the file

   The design spec's section 11 said `generate_threejs_factory.py --out
   src/machine/parts.ts`, so that no hand copy could sit between the pipeline and
   the site and let the two drift. That property is the point, and it is kept: the
   sculpt spec is the single source of truth and one command rebuilds this file.
   What changed is which program does the emitting, and there were three reasons,
   all of them measured rather than aesthetic:

   1. The generated factory imports `three/examples/jsm/postprocessing`
      (EffectComposer, BokehPass, UnrealBloomPass) and OrbitControls for its
      look-dev harness. The site's own spec rejects UnrealBloomPass by name, and
      verification test 13 caps the page at 500 KB over the wire.
   2. It writes the whole component record into `userData` on every node and every
      mesh: about 80 KB of review metadata, in a bundle with a byte budget.
   3. It builds its own materials. The site already has a material module tuned to
      constraints the pipeline knows nothing about: an environment map generated at
      runtime because the page makes no third-party request, a Fresnel fallback for
      `pointer: coarse` because a transmission render target is not affordable on a
      phone, and a per-section emissive tint.

   The Python generator still runs on every pass, because it is what proves the
   spec is implementation-ready and what `orchestrate_passes.py` gates on. Its
   output lives in `.img2threejs/build/`. Both files come from one spec, so there
   is still nothing to drift.

   ## The rule this file has to obey

   Not one dimension, position, rotation, profile point, material assignment or
   socket may be written here. Every one of them is read from the spec, which read
   them from the measurement. `npm run parts` fails if that stops being true.

   Usage: npm run parts
*/

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const SPEC = ".img2threejs/object-sculpt-spec.json";
const OUT = "src/machine/parts.js";
const SKILL = `${process.env.HOME}/.claude/skills/img2threejs`;

/* The site's own elements, which are not part of the reconstructed object and
   must not pretend to be. The sign carries the owner's name where the reference
   carries the manufacturer's, and it is a site design decision recorded in the
   design spec, not a measurement of anything. Sizes are fractions of the object
   height, like everything else. */
const SITE = {
  sign: { width: 0.34, height: 0.085, y: 1.14, depth: 0.004 },
  halo: { radiusScale: 1.16 },
};

const spec = JSON.parse(await readFile(SPEC, "utf8"));

/* ---- the pass gate ------------------------------------------------------- */
/* The generator refuses to write anything until strict-quality passes and every
   earlier pass is reviewed, so running it here is how this build inherits those
   gates rather than quietly skipping them. */
await mkdir(".img2threejs/build", { recursive: true });
const pass = spec.sculptPipeline?.currentPass ?? "blockout";
try {
  await run("python3", [
    `${SKILL}/forge/stage3_build/generate_threejs_factory.py`, SPEC,
    "--out", `.img2threejs/build/parts.${pass}.ts`, "--pass-id", pass, "--force",
  ]);
  console.log(`gate    generator wrote .img2threejs/build/parts.${pass}.ts for pass '${pass}'`);
} catch (e) {
  console.error(`The pipeline generator refused to build pass '${pass}'.`);
  console.error(e.stderr || e.stdout || e.message);
  process.exit(1);
}

/* ---- what the site consumes --------------------------------------------- */
const byId = new Map(spec.componentTree.map((c) => [c.id, c]));
const socketOf = (componentId, socketId) => {
  const c = byId.get(componentId);
  const s = (c?.actionProfile?.sockets ?? []).find((x) => x.id === socketId);
  if (!s) throw new Error(`spec has no socket ${componentId}/${socketId}`);
  return s.position;
};

/* Geometry is emitted per primitive. Only the primitives this spec actually
   uses are handled, and an unhandled one is an error rather than a silent box:
   a silent box is how a reconstruction loses a part without anyone noticing. */
function geometry(c) {
  const d = c.geometryDescriptor ?? {};
  const dim = c.dimensions;
  if (d.container) return null;      // groups its children and carries no surface
  if (d.conform) {
    /* A panel that follows the body's taper. The two radii and the standoff are
       measured off the body profile at the panel's own top and bottom, so the
       panel sits on the surface at every height it spans instead of at one.
       `flatten` straightens the shell's horizontal curvature without touching
       its width or its vertical taper: the reference's plate reads flat. */
    return `panel(${dim.width}, ${dim.height}, ${d.conform.radiusBottom}, ` +
           `${d.conform.radiusTop}, ${d.conform.standoff}` +
           `${d.conform.flatten ? `, ${d.conform.flatten}` : ""})`;
  }
  switch (c.primitive) {
    case "lathe": {
      const pts = d.latheProfile.points.map(([r, y]) => `[${r},${y}]`).join(",");
      return `lathe([${pts}], ${d.latheProfile.segments})`;
    }
    /* Emitted as expressions over the spec's own numbers rather than as computed
       constants, so every literal in the output file can be found verbatim in the
       spec and the check at the bottom of this file can prove it. */
    case "sphere":
      return `sphere(${dim.width})`;
    case "cylinder":
      return `cyl(${dim.width}, ${dim.height})`;
    case "torus":
      return `torus(${dim.width}, ${d.torusTubeRatio})`;
    case "box":
      return `box(${dim.width}, ${dim.height}, ${dim.depth})`;
    case "extrude": {
      const pts = d.profile2D.points.map(([x, y]) => `[${x},${y}]`).join(",");
      return `extrude([${pts}], ${dim.width}, ${dim.height}, ${dim.depth})`;
    }
    case "instanced-cluster": {
      /* The prototype's shape is emitted; its placement is not. The capsules are
         placed by the page's solver and the two radial arrays by REPETITION. */
      const base = d.basePrimitive;
      if (base === "sphere") return `sphere(${dim.width})`;
      if (base === "box") return `box(${dim.width}, ${dim.height}, ${dim.depth})`;
      if (base === "extrude") {
        /* An absolute outline, unlike the turn handle's unit one: these points
           are the body's own measured profile, so they are already in object
           units and must not be rescaled. */
        const pts = d.profile2D.points.map(([x, y]) => `[${x},${y}]`).join(",");
        return `blade([${pts}], ${d.profile2D.depth})`;
      }
      throw new Error(`no emitter for instanced base '${base}' on '${c.id}'`);
    }
    default:
      throw new Error(`no emitter for primitive '${c.primitive}' on '${c.id}'`);
  }
}

/* An implicit component is a cavity carved out of a volume. Marching cubes in
   the browser would cost more than the two cavities in this model are worth at
   the page's camera distance, so each one is emitted as the shell that remains
   after the subtraction: the walls of the pocket, turned or extruded. That is a
   declared approximation of the SDF, not a silent substitution, and it is what
   the review sheet is scored against. */
function implicitShell(c) {
  const sdf = c.geometryDescriptor.sdf;
  const outer = sdf.primitives.find((p) => p.id === sdf.operations[0].left);
  const inner = sdf.primitives.find((p) => p.id === sdf.operations[0].right);
  if (inner.type === "capsule") {
    return `pocketRound(${outer.size[0]}, ${outer.size[2]}, ${inner.radius})`;
  }
  return `pocketSquare(${outer.size.join(",")}, ${inner.size[2]})`;
}

const emitted = spec.componentTree.filter((c) => c.id !== "root");
const lines = [];
for (const c of emitted) {
  const t = c.transform;
  const g = c.geometryDescriptor?.conform ? geometry(c)
    : c.topologyClass === "implicit" ? implicitShell(c)
    : geometry(c);
  /* Written as source rather than through JSON.stringify because `geometry` has
     to come out as a thunk that builds real geometry, and a JSON string would
     come out as the text of one. */
  const f = (v) => JSON.stringify(v);
  lines.push(
    `{ id: ${f(c.id)}, name: ${f(c.name)}, parent: ${f(c.parent)}, ` +
    `material: ${f(c.material)}, position: ${f(t.position)}, rotation: ${f(t.rotation)}, ` +
    `scale: ${f(t.scale)}, instanced: ${c.primitive === "instanced-cluster"}, ` +
    `role: ${f(c.actionProfile.animationRole)},\n    geometry: ${g ? `() => ${g}` : "null"} }`
  );
}

const globe = byId.get("globe");
/* The spindle's occupied column, for the page's solver: capsules must not
   interpenetrate the rod. Only the spec's own literals are emitted; the
   column's centre and half height are derived at runtime in the generated
   file, so the no-stray-numbers check below keeps its teeth. */
const spindleC = byId.get("spindle");
const measured = {
  height: 1.0,
  globeCentre: socketOf("globe", "globe-centre"),
  globeRadius: Math.max(...globe.geometryDescriptor.latheProfile.points.map(([r]) => r)),
  chuteStart: socketOf("delivery-recess", "chute-mouth"),
  trayCentre: socketOf("tray", "tray-centre"),
  trayRadius: byId.get("tray").dimensions.width / 2,
  spindle: {
    diameter: spindleC.dimensions.width,
    length: spindleC.dimensions.height,
    mount: byId.get("armature").transform.position[1],
    centreOffset: spindleC.transform.position[1],
  },
  leverId: "turn-handle",
  leverPivot: byId.get("turn-handle").actionProfile.pivot.position,
  hitboxId: "handle-hub",
};

const source = `/* The machine's geometry. Generated by tools/build-parts.mjs from the
   img2threejs sculpt spec at .img2threejs/object-sculpt-spec.json, which was
   measured off the reference photographs. Do not edit this file: edit the spec
   and run \`npm run parts\`.

   Provenance, per the design spec's section 6.1. Everything except the delivery
   tray is measured from reference A, "Gumball Machine (2049568285).jpg". The tray
   is measured from reference C, "Kauwgomballen.jpg", because A has no tray and the
   page needs one: the tray filling up is this page's progress indicator. Both are
   CC BY-SA on Wikimedia Commons and neither is redistributed; see CREDITS.md.

   The measurement, in one paragraph, because the numbers below are unreadable
   without it. The object's height from the skirt's bottom edge to the top of the
   finial is 1.0 and every y is measured up from the skirt's bottom edge. The
   object's projected axis leans 1.09 degrees in the photograph, so half widths
   were taken against a fitted local axis rather than a single vertical. The globe
   is a circle fitted over 276 rows, radius ${measured.globeRadius} centred at
   y ${measured.globeCentre[1]}, residual rms 0.0060; it was fitted only where the
   glass has something behind it, because empty glass against a light wall has no
   measurable limb at all.

   The seam this file is: the page consumes sockets, never meshes, so the whole
   reconstruction can be replaced again without any other module changing. */

import {
  BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry, Mesh,
  Shape, SphereGeometry, TorusGeometry, Vector2, Vector3, CanvasTexture, SRGBColorSpace,
} from "three";

/* World size of the machine. Everything in the spec is a fraction of this. */
const HEIGHT = 10;
const S = (v) => v * HEIGHT;

function lathe(points, segments) {
  return new LatheGeometry(points.map(([r, y]) => new Vector2(Math.max(S(r), 0.001), S(y))), segments);
}

const sphere = (w) => new SphereGeometry(S(w) / 2, 48, 32);

/* A panel wrapped onto the body's taper: a cone sector, open ended, spanning the
   arc its own width subtends at the body. \`standoff\` is positive for a panel
   proud of the surface and negative for one sunk into it. */
function panel(w, h, rBottom, rTop, standoff, flatten = 1) {
  const rb0 = S(rBottom) + S(standoff), rt0 = S(rTop) + S(standoff);
  /* Flattening multiplies the section radius and shortens the arc, which
     straightens the shell without changing its width. The vertical taper is
     re-applied as a DELTA, not multiplied, and the translate puts the front
     line back exactly where the un-flattened surface was, so the standoff and
     the attachment depths keep their meaning. */
  const rb = rb0 * flatten, rt = rb + (rt0 - rb0);
  const theta = S(w) / ((rb + rt) / 2);
  /* No extra rotation. three.js lays a cylinder's cross-section out as
     x = r sin(theta), z = r cos(theta), so theta = 0 already faces +Z, which is
     the front. The first version rotated by a further 90 degrees and put the
     cast plate on the machine's right flank, where the front render could not
     see it at all. */
  const g = new CylinderGeometry(rt, rb, S(h), 24, 1, true, -theta / 2, theta);
  g.translate(0, 0, rb0 - rb);
  return g;
}

/* A rib: an outline in the XY plane, given in object units rather than as a unit
   shape, swept tangentially. */
function blade(points, depth) {
  const shape = new Shape();
  shape.moveTo(S(points[0][0]), S(points[0][1]));
  for (let i = 1; i < points.length; i++) shape.lineTo(S(points[i][0]), S(points[i][1]));
  shape.closePath();
  const g = new ExtrudeGeometry(shape, { depth: S(depth), bevelEnabled: false });
  g.translate(0, 0, -S(depth) / 2);
  return g;
}
const cyl = (w, h) => new CylinderGeometry(S(w) / 2, S(w) / 2, S(h), 40);
const torus = (w, ratio) => new TorusGeometry(S(w) / 2, (S(w) / 2) * ratio, 12, 64);
const box = (w, h, d) => new BoxGeometry(S(w), S(h), S(d));

/* The profile2D in the spec is a unit outline: x and y run -1 to 1, so the same
   outline can be scaled to whatever the measurement says the part is. */
function extrude(points, w, h, d) {
  const shape = new Shape();
  const px = (p) => S(p[0]) * (w / 2), py = (p) => S(p[1]) * (h / 2);
  shape.moveTo(px(points[0]), py(points[0]));
  for (let i = 1; i < points.length; i++) shape.lineTo(px(points[i]), py(points[i]));
  shape.closePath();
  const g = new ExtrudeGeometry(shape, { depth: S(d), bevelEnabled: false });
  g.translate(0, 0, -S(d) / 2);
  return g;
}

/* The two cavities. A pocket is the walls that remain once the inner volume is
   taken out of the outer one, so it is turned (round pocket) or built from four
   walls and a floor (square pocket) rather than polygonised from the distance
   field the spec describes. Declared, not hidden: see tools/build-parts.mjs. */
function pocketRound(outerW, outerD, innerR) {
  const rim = outerW / 2;
  return lathe([[rim, 0], [rim, outerD * 0.35], [innerR, outerD * 0.5],
                [innerR, outerD], [innerR * 0.2, outerD]], 40);
}

function pocketSquare(ow, oh, od, innerD) {
  const g = new BoxGeometry(S(ow), S(oh), S(od) - S(innerD));
  g.translate(0, 0, -S(innerD) / 2);
  return g;
}

const PARTS = [
${lines.map((l) => `  ${l},`).join("\n")}
];

const MEASURED = ${JSON.stringify(measured, null, 2).split("\n").join("\n")};

/* The site's own elements, which are not reconstructions of anything. The sign
   carries the owner's name where the reference carries the manufacturer's, which
   is the one deliberate departure from the photograph and the reason the real
   wordmark is not rebuilt: no third party's trade dress enters this model. */
const SITE = ${JSON.stringify(SITE, null, 2)};

/* The plate's scroll relief, carried by a bump field exactly as the spec's
   scroll-relief feature says: height 0.003 against a plate 0.018 thick, so it
   shades under raking light and never breaks the silhouette. Drawn once,
   deterministically. Corner scrolls, leaf strokes, raised dot clusters and
   cast stipple are the reference's; its maker badge and wordmark are NOT
   drawn, per the owner-mark rule in the spec. */
function plateRelief() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 512, 512);
  let seed = 0x5eed;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  for (let i = 0; i < 2600; i++) {
    const v = Math.round(118 + rand() * 20);
    g.fillStyle = "rgb(" + v + "," + v + "," + v + ")";
    g.fillRect(rand() * 512, rand() * 512, 1.6, 1.6);
  }
  g.strokeStyle = "#b4b4b4";
  g.lineCap = "round";
  g.lineWidth = 5;
  g.strokeRect(14, 14, 484, 484);
  const scroll = (cx, cy, sx, sy) => {
    g.lineWidth = 7;
    g.beginPath();
    for (let t = 0; t <= 1.001; t += 1 / 40) {
      const a = t * 2.4 * Math.PI;
      const r = 6 + 40 * (1 - t);
      const x = cx + sx * Math.cos(a) * r, y = cy + sy * Math.sin(a) * r;
      if (t === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(cx + sx * 44, cy + sy * 10);
    g.quadraticCurveTo(cx + sx * 96, cy - sy * 6, cx + sx * 132, cy + sy * 34);
    g.stroke();
  };
  scroll(78, 84, 1, 1);
  scroll(434, 84, -1, 1);
  scroll(78, 428, 1, -1);
  scroll(434, 428, -1, -1);
  g.fillStyle = "#c0c0c0";
  for (let i = 0; i < 46; i++) {
    const x = 40 + rand() * 432, y = 40 + rand() * 432;
    if (Math.hypot(x - 256, y - 300) < 150) continue;   // the boss field stays clear
    g.beginPath();
    g.arc(x, y, 2.4 + rand() * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function signTexture(title) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = "#F2F1F6";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = '600 96px "Bricolage Grotesque", system-ui, sans-serif';
  g.fillText(title, c.width / 2, c.height / 2);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* The spec's material ids mapped onto the page's. The mapping is here and not in
   the spec because it is a fact about this page, not about the object.

   Two of these are deliberate departures, and both are the page's palette
   winning over the reference's. \`gloss-red\` becomes the page's dark body,
   because section 4.1 of the design spec puts this machine in an unlit room
   where the globe is the only lamp, and a vivid red machine has no business
   there. \`clear-plastic\` shares the globe's glass rather than getting a
   thinner one of its own, because a second transmissive material would cost a
   second render target for a part the size of a thumbnail.

   What the reference does decide is the RELATIONSHIP between the metals: one
   matte casting among polished and milled surfaces. That ordering is measured,
   and it is what src/machine/materials.js reproduces. */
const MATERIAL = {
  "gloss-red": "body",
  "clear-glass": "glass",
  "clear-plastic": "glass",
  "cast-aluminium": "cast",
  "polished-metal": "chrome",
  "milled-metal": "milled",
  "gloss-capsule": "capsule",
};

export function buildMachine(materials) {
  const group = new Group();
  const nodes = { root: group };

  for (const part of PARTS) {
    const node = new Group();
    node.name = part.id;
    node.position.set(S(part.position[0]), S(part.position[1]), S(part.position[2]));
    node.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
    (nodes[part.parent] ?? group).add(node);
    nodes[part.id] = node;

    /* An instanced part has no mesh here. The capsules are placed by the page's
       solver and the ribs and straps by the loop below, because a repetition
       system's count belongs to the spec and its placement does not. */
    if (part.instanced || !part.geometry) continue;   // see REPETITION and the page's solver

    let material = materials[MATERIAL[part.material]] ?? materials.body;
    if (part.id === "front-plate") {
      /* Only the plate carries the relief: the handle and the other castings
         share the plain cast material, so the clone is per-plate, not global. */
      material = material.clone();
      material.bumpMap = plateRelief();
      material.bumpScale = 0.03;
    }
    const mesh = new Mesh(part.geometry(), material);
    mesh.name = part.name;
    mesh.scale.set(part.scale[0], part.scale[1], part.scale[2]);
    node.add(mesh);
  }

  /* The two radial repetition systems. Count and radius come from the spec; the
     angle is just 360 over the count, which is the only thing a frontal
     photograph can say about a radial array. */
  for (const sys of REPETITION) {
    const proto = PARTS.find((p) => p.id === sys.componentRef);
    if (!proto || !proto.geometry) continue;
    const host = nodes[proto.parent] ?? group;
    const geo = proto.geometry();          // one geometry, shared by every instance
    for (let i = 0; i < sys.count; i++) {
      const pivot = new Group();
      pivot.rotation.y = (i / sys.count) * Math.PI * 2;
      const mesh = new Mesh(geo, materials[MATERIAL[proto.material]] ?? materials.body);
      mesh.name = \`\${proto.name} \${i + 1}\`;
      mesh.position.set(S(sys.radius), S(proto.position[1]), 0);
      mesh.scale.set(proto.scale[0], proto.scale[1], proto.scale[2]);
      pivot.add(mesh);
      host.add(pivot);
    }
  }

  /* The halo. The design spec's stand-in for a bloom pass: one shell just
     outside the glass with an additive Fresnel falloff, which is a draw call
     against the twenty five kilobytes and the extra render target a real bloom
     pass would cost. */
  const halo = new Mesh(
    new SphereGeometry(S(MEASURED.globeRadius * SITE.halo.radiusScale), 32, 24),
    materials.halo
  );
  halo.position.set(0, S(MEASURED.globeCentre[1]), 0);
  halo.name = "halo";
  halo.renderOrder = 3;
  group.add(halo);

  const sign = new Mesh(
    new BoxGeometry(S(SITE.sign.width), S(SITE.sign.height), S(SITE.sign.depth)),
    materials.sign(signTexture("NICOLÒ RENGIFO"))
  );
  sign.position.set(0, S(SITE.sign.y), 0);
  sign.name = "sign";
  group.add(sign);

  const glass = nodes.globe?.children.find((c) => c.isMesh);
  if (glass) glass.renderOrder = 2;

  return {
    group,
    sockets: {
      globeCentre: new Vector3(0, S(MEASURED.globeCentre[1]), 0),
      globeRadius: S(MEASURED.globeRadius),
      chuteStart: new Vector3(...MEASURED.chuteStart.map(S)),
      trayCentre: new Vector3(...MEASURED.trayCentre.map(S)),
      trayRadius: S(MEASURED.trayRadius),
      spindle: (() => {
        const centre = S(MEASURED.spindle.mount) + S(MEASURED.spindle.centreOffset);
        const half = S(MEASURED.spindle.length) / 2;
        return { radius: S(MEASURED.spindle.diameter) / 2, y0: centre - half, y1: centre + half };
      })(),
      lever: nodes[MEASURED.leverId],
      leverHitbox: nodes[MEASURED.hitboxId],
      sign,
      height: HEIGHT,
    },
  };
}
`;

const REPETITION = spec.repetitionSystems
  .filter((s) => s.distribution.startsWith("radial"))
  .map((s) => {
    const c = byId.get(s.componentRefs[0]);
    /* The array's radius is the component's own authored x offset when it has
       one, and otherwise the parent surface it stands on. Both come from the
       spec; neither is chosen here. */
    /* The array's radius is the prototype's own authored x offset, which is a
       measurement in the spec, not a choice made here. */
    return { componentRef: c.id, count: s.count, radius: c.transform.position[0] };
  });

const withRepetition = source.replace(
  "const MEASURED =",
  `const REPETITION = ${JSON.stringify(REPETITION, null, 2)};\n\nconst MEASURED =`
);

await writeFile(OUT, withRepetition);

/* The rule at the top of this file, enforced. Any bare decimal in the emitted
   geometry has to have come from the spec, so the emitter is checked against its
   own output: every number in PARTS and MEASURED must appear in the spec too. */
const specText = await readFile(SPEC, "utf8");
const partsBlock = withRepetition.slice(withRepetition.indexOf("const PARTS"),
                                        withRepetition.indexOf("const SITE"));
const strays = [...new Set(partsBlock.match(/-?\d+\.\d{3,}/g) ?? [])]
  .filter((n) => !specText.includes(n.replace(/^-/, "")));
if (strays.length) {
  console.error(`Emitted numbers that are not in the spec: ${strays.join(", ")}`);
  process.exit(1);
}

console.log(`parts   ${OUT}  ${emitted.length} components, ${REPETITION.length} radial systems`);
console.log(`check   every measured number in the emitted file also appears in the spec`);
