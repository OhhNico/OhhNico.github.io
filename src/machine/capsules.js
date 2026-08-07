/* The capsules.

   Six of them are live: one per section, in that section's colour, emissive, so
   the globe is the only light source on the page and its light is the colour of
   where you are. The rest are spent shells, dark, and their only job is to make
   the globe look full rather than to be counted.

   One geometry, one material per capsule. Forty four draw calls is nothing next
   to the transmission pass the glass already costs. */

import { Group, Mesh, SphereGeometry, TorusGeometry, Color } from "three";

/* Live colours, in page order. The same six values input.css writes as
   --color-c1 through --color-c6, and the same six the hero nav shows as a
   legend. They are written twice because a shader cannot read a custom
   property; the verification suite checks the two lists still agree. */
export const LIVE = [0xec5f27, 0xfbd278, 0x3cd785, 0x33b3cd, 0xc8befa, 0xf879b6];

/* The spent shells are not black. They are plastic sitting inside the only lamp
   in the room, and the first pass made them near carbon: the globe rendered as a
   dark mass with six dots in it, which is the opposite of a machine that looks
   loaded. Mid neutrals with a trace of emissive read as full without competing
   with the six that mean something. */
const SPENT = [0x6b6f7d, 0x565a66, 0x7d8290];
const SPENT_GLOW = 0.14;

export function makeCapsules(materials, { count, radius }) {
  /* Two hemispheres and a rim, which is what a capsule is. thetaLength halves
     the sphere; the rim hides the seam and catches a highlight, which is the
     detail that stops it reading as a ball. */
  const domeGeo = new SphereGeometry(radius, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const rimGeo = new TorusGeometry(radius * 0.995, radius * 0.055, 8, 28);

  const items = [];
  for (let i = 0; i < count; i++) {
    const live = i < LIVE.length;
    const hex = live ? LIVE[i] : SPENT[i % SPENT.length];
    const material = materials.capsule(hex, live);

    const group = new Group();
    const top = new Mesh(domeGeo, material);
    const bottom = new Mesh(domeGeo, material);
    bottom.rotation.x = Math.PI;
    const rim = new Mesh(rimGeo, material);
    rim.rotation.x = Math.PI / 2;
    group.add(top, bottom, rim);

    /* A capsule is not a sphere in the physics: it is a sphere for contact
       purposes and a two-part object for opening. Keeping the halves as named
       children is what lets it split without a second geometry. */
    items.push({ group, top, bottom, rim, material, live, colour: new Color(hex), openAmount: 0 });
  }

  return {
    items,
    /* Opening is a translation apart plus a tilt, not a scale: a capsule that
       grows as it opens reads as an animation, one that hinges reads as an
       object. */
    setOpen(i, t) {
      const c = items[i];
      if (!c || c.openAmount === t) return;
      c.openAmount = t;
      c.top.position.y = radius * 0.9 * t;
      c.top.rotation.z = 0.5 * t;
      c.bottom.position.y = -radius * 0.25 * t;
      c.rim.scale.setScalar(1 - t * 0.35);
      c.material.emissiveIntensity = c.live ? 1.15 + t * 1.4 : 0;
    },
    dispose() {
      domeGeo.dispose();
      rimGeo.dispose();
      for (const c of items) c.material.dispose();
    },
  };
}
