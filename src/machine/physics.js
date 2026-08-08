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

/* `floorY` is the resting plane in the solver's own frame (origin at the globe
   centre): the reference machine's gumballs sit on a rest disc, not on the
   glass. The default keeps the sphere as the only container, which is what the
   page ships today; nothing changes until a caller passes a floor.

   `spindle` excludes the axis column: {radius, y0, y1} in the same frame. The
   machine has a threaded spindle down the middle of the globe, and a solver
   without it lets capsules interpenetrate the rod and stack ON the axis, which
   is where the settled pile's false peak came from. Off by default for the
   same reason floorY is. */
export function createSolver({ radius, count, bodyRadius, seed = 0x9e3779b9, floorY = -Infinity, pour = false, spindle = null }) {
  const pos = new Float32Array(count * 3);
  const prev = new Float32Array(count * 3);
  const active = new Uint8Array(count);   // a body outside the globe is not solved

  let rand = seed >>> 0;
  const random = () => ((rand = (rand * 1664525 + 1013904223) >>> 0) / 0xffffffff);

  /* The comment on this loop always said "scattered in the upper half"; the
     code sampled the whole sphere. For the page's 44 large capsules the
     difference is cosmetic. For smaller or more numerous fills it is not:
     bodies seeded at mid height meet the wall and each other before they meet
     the pile, freeze into a hoop arch pressed against the glass, and the
     sleep test correctly reports the arch as settled. `pour: true` makes the
     code do what the comment said. Kept opt-in so the shipped page's motion
     does not change without a decision. */
  for (let i = 0; i < count; i++) {
    const r = (radius - bodyRadius) * Math.cbrt(random());
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(pour ? random() : 1 - 2 * random());
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
      /* Resting on the disc is inelastic: the clamped body's vertical history
         is rewritten too, or verlet reads the clamp as an upward launch and the
         pile never sleeps. Measured, not theorised: with the position-only
         clamp a 44-body fill was still awake after 6000 steps. */
      const fl = floorY + bodyRadius;
      if (pos[a + 1] < fl) {
        pos[a + 1] = fl;
        if (prev[a + 1] > fl) prev[a + 1] = fl;
      }
      if (spindle && pos[a + 1] > spindle.y0 && pos[a + 1] < spindle.y1) {
        const dxz = Math.hypot(pos[a], pos[a + 2]);
        const min = spindle.radius + bodyRadius;
        if (dxz < min && dxz > 1e-9) {
          const k = min / dxz;
          pos[a] *= k;
          pos[a + 2] *= k;
          /* Same lesson as the floor, radially: a position-only clamp leaves
             prev inside the column and verlet reads the gap as an outward
             launch every frame, so a capsule leaning on the spindle jitters
             forever and the solver never sleeps. Verification check 12 caught
             it at 0.00s of stillness in 9 seconds. */
          const pxz = Math.hypot(prev[a], prev[a + 2]);
          if (pxz < min && pxz > 1e-9) {
            const kp = min / pxz;
            prev[a] *= kp;
            prev[a + 2] *= kp;
          }
        }
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
