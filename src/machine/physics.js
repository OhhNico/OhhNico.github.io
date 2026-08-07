/* A verlet solver for capsules in a sphere. Ninety lines, no library.

   The case is forty four bodies inside one container with one kind of contact.
   Cannon or Rapier cost from a hundred kilobytes upward and solve a general
   problem this page does not have.

   The property that matters most is at the bottom: it sleeps. The build this
   replaces shipped ScrollTrigger, which registered a requestAnimationFrame loop
   at init and never stopped: sixty four callbacks a second on a completely
   still page, forever. Adding a physics solver that idles at full rate would be
   the same defect wearing a different name. */

const GRAVITY = -9.4;
const DAMPING = 0.978;
const SUBSTEPS = 2;
const SLEEP_ENERGY = 1e-5;      // per body, in units squared per second squared

/* Seconds of stillness before the solver stops, NOT frames.
   Counting frames was the first version and it made sleeping a property of the
   machine rather than of the contents: thirty frames is half a second at 60fps
   and seventeen seconds at the two frames per second a software rasteriser
   manages. Measured that way on the verification run, which is how it was
   found. Time is the thing that was meant all along. */
const SLEEP_SECONDS = 0.4;

export function createSolver({ radius, count, bodyRadius, seed = 0x9e3779b9 }) {
  const pos = new Float32Array(count * 3);
  const prev = new Float32Array(count * 3);
  const active = new Uint8Array(count);   // a body outside the globe is not solved

  let rand = seed >>> 0;
  const random = () => ((rand = (rand * 1664525 + 1013904223) >>> 0) / 0xffffffff);

  /* Start them scattered in the upper half, so the first settle looks like
     capsules that were poured in rather than a lattice relaxing. */
  for (let i = 0; i < count; i++) {
    const r = (radius - bodyRadius) * Math.cbrt(random());
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(1 - 2 * random());
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi);
    const z = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3] = prev[i * 3] = x;
    pos[i * 3 + 1] = prev[i * 3 + 1] = y;
    pos[i * 3 + 2] = prev[i * 3 + 2] = z;
    active[i] = 1;
  }

  const limit = radius - bodyRadius;
  const contact = bodyRadius * 2;
  let stillFor = 0;
  let asleep = false;

  function integrate(dt) {
    const g = GRAVITY * dt * dt;
    for (let i = 0; i < count; i++) {
      if (!active[i]) continue;
      const o = i * 3;
      for (let a = 0; a < 3; a++) {
        const p = pos[o + a];
        const v = (p - prev[o + a]) * DAMPING;
        prev[o + a] = p;
        pos[o + a] = p + v + (a === 1 ? g : 0);
      }
    }
  }

  function constrain() {
    /* Pairwise repulsion. Forty four bodies is 946 pairs, which is small enough
       that a spatial grid would cost more to maintain than it saves. */
    for (let i = 0; i < count; i++) {
      if (!active[i]) continue;
      const a = i * 3;
      for (let j = i + 1; j < count; j++) {
        if (!active[j]) continue;
        const b = j * 3;
        const dx = pos[b] - pos[a];
        const dy = pos[b + 1] - pos[a + 1];
        const dz = pos[b + 2] - pos[a + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= contact * contact || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        const push = (contact - d) * 0.5 / d;
        pos[a] -= dx * push; pos[a + 1] -= dy * push; pos[a + 2] -= dz * push;
        pos[b] += dx * push; pos[b + 1] += dy * push; pos[b + 2] += dz * push;
      }
      /* Containment. The globe is a sphere, so this is one length check. */
      const len = Math.hypot(pos[a], pos[a + 1], pos[a + 2]);
      if (len > limit) {
        const k = limit / len;
        pos[a] *= k; pos[a + 1] *= k; pos[a + 2] *= k;
      }
    }
  }

  function energy() {
    let sum = 0;
    let live = 0;
    for (let i = 0; i < count; i++) {
      if (!active[i]) continue;
      live++;
      const o = i * 3;
      const dx = pos[o] - prev[o];
      const dy = pos[o + 1] - prev[o + 1];
      const dz = pos[o + 2] - prev[o + 2];
      sum += dx * dx + dy * dy + dz * dz;
    }
    return live ? sum / live : 0;
  }

  return {
    positions: pos,

    /* True once the contents have settled. The frame loop reads this and skips
       the solver entirely, which is the whole point of writing one by hand. */
    get asleep() { return asleep; },

    /* Read by tools/verify.mjs check 12, which exists because this project has
       already shipped a loop that never stopped. */
    get energy() { return energy(); },
    get stillFor() { return stillFor; },

    setActive(i, on) {
      if (active[i] === (on ? 1 : 0)) return;
      active[i] = on ? 1 : 0;
      this.wake();
    },

    wake() {
      asleep = false;
      stillFor = 0;
    },

    /* Two different quantities that used to share one variable, which is how
       the sleep timer ended up device dependent for the second time.

       `dt` is the integration step and is clamped by the caller for stability:
       one long frame must not teleport a body through the glass. `wall` is real
       elapsed time and is what the sleep timer counts. Feeding the clamped value
       to both meant that on a machine running at two frames per second the
       solver accrued 0.05s of stillness per half second of stillness, and took
       thirty times too long to settle. Measured on the verification run. */
    step(dt, wall = dt) {
      if (asleep) return 0;
      const h = Math.min(dt, 1 / 30) / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s++) {
        integrate(h);
        constrain();
      }
      /* The threshold scales with h squared because the energy measured here is
         a squared displacement per substep, so a smaller step legitimately
         produces a smaller number for the same physical motion. */
      if (energy() < SLEEP_ENERGY * h * h * 1e6) {
        stillFor += wall;
        if (stillFor >= SLEEP_SECONDS) asleep = true;
      } else {
        stillFor = 0;
      }
      return SUBSTEPS;
    },
  };
}
