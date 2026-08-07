/* The machine's geometry, built from the profile measured off the reference
   photograph by tools/extract-profile.py.

   Phase 1 of the plan. This file is the seam: phase 2 replaces it with the
   img2threejs reconstruction and nothing else in the project changes, because
   everyone downstream consumes the sockets rather than the meshes.

   The profile is a body of revolution, so most of the machine is one lathe. The
   parts that are not (the front plate, the lever, the tray, the sign) are
   primitives positioned from the profile's own measurements rather than from
   numbers typed in by hand, so they stay attached if the profile is remeasured. */

import {
  BoxGeometry, CylinderGeometry, Group, LatheGeometry, Mesh, MeshBasicMaterial,
  SphereGeometry, TorusGeometry, Vector2, Vector3, CanvasTexture, SRGBColorSpace,
} from "three";

import profile from "./profile.json";

/* The machine is this tall in world units. Everything else derives from the
   profile, which is stored as fractions of height. */
const HEIGHT = 10;

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

export function buildMachine(materials) {
  const group = new Group();
  const pts = profile.points;             // [[y 0..1 from the foot, halfWidth]]

  const r = profile.measured.globeRadius * HEIGHT;
  const cy = profile.measured.globeEquatorY * HEIGHT;

  /* The lathe is cut into two, and the reason is worth stating because getting
     it wrong produced a machine that looked right and was empty.

     The measured profile runs the full height, glass band included. Turning all
     of it produces one continuous opaque surface, so the glass band becomes a
     metal ball with forty four capsules sealed inside it: present, lit,
     correctly placed, and invisible. The first build did exactly that.

     So the profile is turned twice, below the collar and above the globe's top,
     and the band between them is left to the glass sphere. Radial segments are
     generous because the silhouette carries the whole read of this object and a
     faceted globe would give the game away. */
  const glassTop = cy + r * 0.94;
  const glassBottom = cy - r * 0.97;

  const latheBetween = (lo, hi) => {
    const shape = pts
      .filter(([y]) => y * HEIGHT >= lo && y * HEIGHT <= hi)
      .map(([y, x]) => new Vector2(Math.max(x, 0.0005) * HEIGHT, y * HEIGHT));
    if (shape.length < 2) return null;
    return new Mesh(new LatheGeometry(shape, 96), materials.body);
  };

  const base = latheBetween(-1, glassBottom);
  if (base) { base.name = "base"; group.add(base); }

  const dome = latheBetween(glassTop, HEIGHT + 1);
  if (dome) { dome.name = "dome"; group.add(dome); }
  const globe = new Mesh(new SphereGeometry(r, 64, 48), materials.glass);
  globe.position.y = cy;
  globe.name = "globe";
  globe.renderOrder = 2;
  group.add(globe);

  /* The stand-in for bloom: a shell a little outside the glass. */
  const halo = new Mesh(new SphereGeometry(r * 1.16, 32, 24), materials.halo);
  halo.position.y = cy;
  halo.name = "halo";
  halo.renderOrder = 3;
  group.add(halo);

  /* The collar, where the glass meets the body. The profile's narrowest row
     below the equator is exactly that pinch, so the ring is placed by
     measurement rather than by eye. */
  const collarR = profile.measured.collarHalfWidth * HEIGHT;
  const collarY = cy - r * 0.98;
  const collar = new Mesh(new TorusGeometry(collarR, collarR * 0.055, 12, 64), materials.chrome);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = collarY;
  collar.name = "collar";
  group.add(collar);

  /* The cast front plate. Not a solid of revolution, so it is placed against the
     body at the height where the body is a straight cylinder. */
  const bodyTop = collarY - r * 0.06;
  const plateH = HEIGHT * 0.15;
  const plateY = bodyTop - plateH * 0.75;
  const plateR = radiusAt(pts, plateY / HEIGHT) * HEIGHT;
  const plate = new Mesh(new BoxGeometry(plateR * 1.18, plateH, plateR * 0.18), materials.chrome);
  plate.position.set(0, plateY, plateR * 0.94);
  plate.name = "plate";
  group.add(plate);

  /* The lever. A raycast target and the shortcut for the Next section button,
     so it is a real object with a pivot rather than a decoration. */
  const leverPivot = new Group();
  leverPivot.position.set(0, plateY, plateR * 1.02);
  const knob = new Mesh(new CylinderGeometry(plateR * 0.2, plateR * 0.2, plateR * 0.12, 32), materials.chrome);
  knob.rotation.x = Math.PI / 2;
  leverPivot.add(knob);
  const handle = new Mesh(new BoxGeometry(plateR * 0.62, plateR * 0.1, plateR * 0.1), materials.chrome);
  handle.position.z = plateR * 0.1;
  leverPivot.add(handle);
  leverPivot.name = "lever";
  group.add(leverPivot);

  /* The tray. Where the read capsules pile up, which is this page's progress
     indicator: the globe empties and the tray fills. */
  const trayY = plateY - plateH * 1.15;
  const trayR = plateR * 0.72;
  const tray = new Mesh(new CylinderGeometry(trayR, trayR * 0.86, trayR * 0.34, 32, 1, true), materials.chrome);
  tray.position.set(0, trayY, plateR * 0.78);
  tray.name = "tray";
  group.add(tray);
  const trayFloor = new Mesh(new CylinderGeometry(trayR * 0.86, trayR * 0.86, trayR * 0.04, 32), materials.chrome);
  trayFloor.position.set(0, trayY - trayR * 0.16, plateR * 0.78);
  group.add(trayFloor);

  /* The sign. On the real machine this relief carries the manufacturer's name.
     Here it carries his, which is the one deliberate departure from the
     reference and the reason the wordmark is not reconstructed. */
  const signW = r * 1.5;
  const sign = new Mesh(
    new BoxGeometry(signW, signW * 0.25, 0.02),
    materials.sign(signTexture("NICOLÒ RENGIFO"))
  );
  sign.position.set(0, cy + r * 1.32, 0);
  sign.name = "sign";
  group.add(sign);

  return {
    group,
    sockets: {
      globeCentre: new Vector3(0, cy, 0),
      globeRadius: r,
      /* The capsule leaves through the collar and arrives in the tray. */
      chuteStart: new Vector3(0, collarY, plateR * 0.2),
      trayCentre: new Vector3(0, trayY + trayR * 0.05, plateR * 0.78),
      trayRadius: trayR * 0.78,
      lever: leverPivot,
      leverHitbox: knob,
      sign,
      height: HEIGHT,
    },
  };
}

/* Half width at a normalised height, by linear interpolation between the two
   measured points that bracket it. */
function radiusAt(pts, y) {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= y) {
      const [y0, x0] = pts[i - 1];
      const [y1, x1] = pts[i];
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      return x0 + (x1 - x0) * t;
    }
  }
  return pts[pts.length - 1][1];
}
