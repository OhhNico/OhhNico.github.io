/* Where every capsule is, derived from one number.

   This is the decision that matters most in the scene, so it is worth stating
   plainly: the machine has no event queue.

   A queue is the obvious design. Section changes, push a dispense, play it.
   It is also wrong here, and visibly so: flick from the top of the page to the
   bottom and a queue owes you six sequences of about 1.3 seconds each, so the
   machine keeps spitting capsules for eight seconds after the reader has
   stopped and started reading.

   Instead the state is a pure function of activeIndex. Capsules below it belong
   to the tray, above it to the globe, and at most one is in flight. Skipping
   five sections places five capsules with a short stagger and gives the full
   sequence only to the newest. Interruptible by construction, which is the
   property CSS transitions have over keyframes and for the same reason. */

import { CatmullRomCurve3, Vector3, MathUtils } from "three";

const CRANK_MS = 420;
const TRAVEL_MS = 620;
const SPLIT_MS = 240;
const TOTAL_MS = CRANK_MS + TRAVEL_MS + SPLIT_MS;

/* Placing a skipped capsule still takes a beat, so a jump of five reads as a
   burst rather than as five capsules teleporting on the same frame. */
const CATCHUP_MS = 90;

const easeOut = (t) => 1 - Math.pow(1 - t, 4);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createDispenser({ capsules, sockets, solver, live, total }) {
  /* The chute. Out of the collar, forward, and down into the tray. The middle
     control point is what makes it an arc instead of a fall. */
  const start = sockets.chuteStart.clone();
  const end = sockets.trayCentre.clone();
  const chute = new CatmullRomCurve3([
    start,
    new Vector3(start.x, start.y - (start.y - end.y) * 0.35, start.z + (end.z - start.z) * 0.85),
    new Vector3(end.x, end.y + (start.y - end.y) * 0.22, end.z * 1.06),
    end,
  ], false, "catmullrom", 0.4);

  /* Deterministic resting places in the tray. Seeded, so the pile looks
     scattered and is identical on every load, which is what makes it
     reviewable. */
  const slots = [];
  let seed = 0x5bf03635;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  for (let i = 0; i < live; i++) {
    const a = rand() * Math.PI * 2;
    const r = sockets.trayRadius * 0.62 * Math.sqrt(rand());
    slots.push(new Vector3(
      end.x + Math.cos(a) * r,
      end.y + capsuleRadius() * (0.4 + Math.floor(i / 3) * 0.75),
      end.z + Math.sin(a) * r * 0.7,
    ));
  }

  function capsuleRadius() {
    return sockets.globeRadius * 0.16;
  }

  let target = 0;
  let elapsed = new Float32Array(live).fill(0);   // ms into this capsule's exit
  const tmp = new Vector3();

  function setActive(index) {
    if (index === target) return;
    const forward = index > target;
    target = index;
    /* Anything already fully out or fully in stays where it is; only the ones
       whose side of the line changed start moving. Scrolling back returns
       capsules to the globe, so the direction of the animation follows the
       direction of the reading. */
    for (let i = 0; i < live; i++) {
      const shouldBeOut = i <= target;
      const isOut = elapsed[i] >= TOTAL_MS;
      if (shouldBeOut === isOut) continue;
      if (!forward && !shouldBeOut) elapsed[i] = Math.min(elapsed[i], TOTAL_MS);
    }
    solver.wake();
  }

  /* Everything the solver is still carrying, live or spent. This runs for all
     of them, not only the six that can leave: the spent capsules are what makes
     the globe look full, and forgetting them leaves thirty eight objects piled
     at the world origin inside the base, which is exactly what the first build
     of this file did. */
  function placeFromSolver(i) {
    const capsule = capsules.items[i];
    const o = i * 3;
    capsule.group.position.set(
      sockets.globeCentre.x + solver.positions[o],
      sockets.globeCentre.y + solver.positions[o + 1],
      sockets.globeCentre.z + solver.positions[o + 2],
    );
  }

  function update(dt) {
    const ms = dt * 1000;
    let newest = -1;
    for (let i = 0; i < live; i++) if (i <= target) newest = i;

    for (let i = live; i < total; i++) placeFromSolver(i);

    for (let i = 0; i < live; i++) {
      const out = i <= target;
      /* The newest capsule gets the full sequence. Everything the reader
         skipped past gets the catch-up rate, so a flick to the bottom settles
         in one sequence rather than six. */
      const rate = out ? (i === newest ? 1 : TOTAL_MS / CATCHUP_MS) : -(TOTAL_MS / 260);
      elapsed[i] = MathUtils.clamp(elapsed[i] + ms * rate, 0, TOTAL_MS);
      place(i, elapsed[i]);
    }
  }

  function place(i, t) {
    const capsule = capsules.items[i];
    if (!capsule) return;

    if (t <= CRANK_MS) {
      /* Still in the globe, still solved by the physics. */
      solver.setActive(i, true);
      capsules.setOpen(i, 0);
      placeFromSolver(i);
      return;
    }

    /* Out of the globe: the solver stops carrying it, which also means the
       remaining capsules settle into the space it left. */
    solver.setActive(i, false);

    if (t < CRANK_MS + TRAVEL_MS) {
      const u = easeOut((t - CRANK_MS) / TRAVEL_MS);
      chute.getPointAt(u, tmp);
      capsule.group.position.copy(tmp);
      /* Rotation from the curve's own tangent, so it tumbles the way the path
         turns instead of spinning on a timer. */
      chute.getTangentAt(u, tmp);
      capsule.group.rotation.set(Math.atan2(tmp.y, tmp.z) * 1.4, u * 5.2, u * 2.1);
      capsules.setOpen(i, 0);
      return;
    }

    const u = easeInOut(MathUtils.clamp((t - CRANK_MS - TRAVEL_MS) / SPLIT_MS, 0, 1));
    capsule.group.position.lerpVectors(chute.getPointAt(1, tmp).clone(), slots[i], u);
    capsule.group.rotation.set(0.35, i * 1.7, 0);
    capsules.setOpen(i, u);
  }

  /* How far the crank has turned, for whoever draws the lever. One rotation per
     dispense, and it reads the same value the capsules read. */
  function crankAngle() {
    let newest = -1;
    for (let i = 0; i < live; i++) if (i <= target) newest = i;
    if (newest < 0) return 0;
    const t = MathUtils.clamp(elapsed[newest] / CRANK_MS, 0, 1);
    return easeInOut(t) * Math.PI;
  }

  /* Deep link: land on a hash and the machine is already in that state, with no
     catch-up performance to sit through. */
  function jumpTo(index) {
    target = index;
    for (let i = 0; i < live; i++) {
      elapsed[i] = i <= index ? TOTAL_MS : 0;
      place(i, elapsed[i]);
    }
    solver.wake();
  }

  return { setActive, update, crankAngle, jumpTo, capsuleRadius };
}
