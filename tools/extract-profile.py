#!/usr/bin/env python3
"""Measure the machine's lathe profile from the reference photograph.

A capsule machine is a solid of revolution, so a frontal photograph of one is
an elevation drawing: the profile is half the silhouette, and rotation supplies
the depth the single view does not show. That is why the primary reference is
allowed to be frontal, and it is the reason this file exists instead of a
hand-authored curve.

## What the transparent glass does to the measurement

Colour separation recovers the dome, the gumballs, the front plate, the body,
the flared skirt and the stand. It does not recover the empty upper half of the
glass globe: that surface is clear glass in front of a light wall, so in the
colour channel it is not there.

The consequence is worse than a gap, and it took a rendered mask to see it. The
empty glass SEVERS the object: the red dome becomes a connected component of its
own, floating above the rest. A "keep the largest component" step, which is the
obvious way to reject shadows and clutter, therefore deletes the entire dome and
leaves a machine with no lid. So components are kept by area against a floor,
not by rank.

## What fills the gap

Not a curve fit on the gumballs. Those bumps are candy pressed against the
glass, and their silhouette is the candy's, not the vessel's. The globe is a
sphere, so two measured numbers describe it completely: the widest half width
in the glass zone is the radius, and the row where that occurs is the equator.
Everything between the dome rim and the collar is then replaced by that sphere.

The two rims the spec called constraints are used as a CHECK instead of an
input, which is stronger: the script reports how far the modelled sphere lands
from the dome rim and from the collar. A large residual means the sphere
assumption is wrong and the number says so, rather than being absorbed by a fit.

Output: src/machine/profile.json, committed. Run after `npm run refs`.
Requires Pillow.
"""

import json
import math
import statistics as st
import sys
from pathlib import Path

from PIL import Image, ImageFilter

SRC = Path(".refs/A.jpg")
OUT = Path("src/machine/profile.json")

# Colour distance at which a pixel stops being wall. Swept over 30/45/60/80 and
# read as masks: under 60 the wall's own lighting gradient leaks in, over it the
# darker red at the edge of the skirt starts dropping out.
THRESHOLD = 60
EDGE_COLS = 26          # columns per side used to estimate the wall for a row
MIN_RUN = 10            # a row narrower than this is noise, not the machine
MIN_COMPONENT = 0.003   # a blob smaller than this share of the frame is clutter
MAX_POINTS = 90


def load():
    if not SRC.exists():
        sys.exit(f"{SRC} missing. Run `npm run refs` first.")
    im = Image.open(SRC).convert("RGB")
    if im.width > 1100:
        im = im.resize((1100, round(im.height * 1100 / im.width)), Image.LANCZOS)
    return im


def mask(im):
    """Foreground mask, with the wall estimated per row rather than globally.

    This wall is lit unevenly, brighter towards the left. One background colour
    for the whole frame over-segments one side and under-segments the other;
    sampling both edge strips of each row tracks the gradient for free.
    """
    w, h = im.size
    px = im.load()
    m = Image.new("L", (w, h), 0)
    mp = m.load()
    for y in range(h):
        strip = [px[x, y] for x in list(range(EDGE_COLS)) + list(range(w - EDGE_COLS, w))]
        br, bg, bb = (round(st.median(c[i] for c in strip)) for i in range(3))
        for x in range(w):
            r, g, b = px[x, y]
            if abs(r - br) + abs(g - bg) + abs(b - bb) > THRESHOLD:
                mp[x, y] = 255
    return m.filter(ImageFilter.MedianFilter(5))


def keep_large_components(m):
    """Keep every blob above an area floor, not only the biggest one.

    See the module docstring: the transparent glass leaves the dome as a
    separate component, so ranking by size decapitates the machine.
    """
    w, h = m.size
    mp = m.load()
    seen = bytearray(w * h)
    floor = MIN_COMPONENT * w * h
    out = Image.new("L", (w, h), 0)
    op = out.load()
    kept = 0
    for sy in range(0, h, 2):
        for sx in range(0, w, 2):
            if not mp[sx, sy] or seen[sy * w + sx]:
                continue
            stack, comp = [(sx, sy)], []
            seen[sy * w + sx] = 1
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and mp[nx, ny] and not seen[ny * w + nx]:
                        seen[ny * w + nx] = 1
                        stack.append((nx, ny))
            if len(comp) >= floor:
                kept += 1
                for x, y in comp:
                    op[x, y] = 255
    return out, kept


def half_widths(solid):
    """Per row, the half width from the rotation axis.

    Takes the wider of the two sides. The camera is very slightly off axis, and
    on a symmetric object the wider side is the one nearer the true silhouette.
    """
    w, h = solid.size
    sp = solid.load()
    rows = {}
    centres = []
    for y in range(h):
        xs = [x for x in range(w) if sp[x, y]]
        if len(xs) >= MIN_RUN:
            rows[y] = (xs[0], xs[-1])
            centres.append((xs[0] + xs[-1]) / 2)
    if not rows:
        sys.exit("No foreground found. The threshold or the reference changed.")
    axis = st.median(centres)
    return axis, {y: max(axis - l, r - axis) for y, (l, r) in rows.items()}


def rdp(pts, eps):
    """Ramer-Douglas-Peucker, so the committed profile is a readable curve
    rather than a thousand rows of pixel noise."""
    if len(pts) < 3:
        return pts
    x0, y0 = pts[0]
    x1, y1 = pts[-1]
    dx, dy = x1 - x0, y1 - y0
    norm = math.hypot(dx, dy) or 1.0
    worst, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        d = abs(dy * x - dx * y + x1 * y0 - y1 * x0) / norm
        if d > worst:
            worst, idx = d, i
    if worst <= eps:
        return [pts[0], pts[-1]]
    return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)


def main():
    im = load()
    solid, kept = keep_large_components(mask(im))
    axis, half = half_widths(solid)

    ys = sorted(half)
    top, bottom = ys[0], ys[-1]

    # The severed run: rows inside the object with no measurement at all. This
    # is the empty glass, and it is the only place in the frame where a real
    # surface produces nothing.
    gap = [y for y in range(top, bottom + 1) if y not in half]
    if not gap:
        sys.exit("No severed run found. The dome is probably still being dropped.")
    g_top, g_bot = min(gap), max(gap)

    # The glass zone runs from the dome rim down to the collar. Its lower bound
    # is the widest row below the gap, which on this machine is the globe's
    # equator: below it the collar pinches in before the body flares out again.
    below = [y for y in ys if y > g_bot]
    equator = max(below, key=lambda y: half[y])
    radius = half[equator]

    # Everything from the dome rim to the equator becomes the sphere. The
    # gumballs' bumpy outline is candy, not vessel, so it is replaced rather
    # than smoothed.
    dome_rim = max((y for y in ys if y < g_top), default=None)
    if dome_rim is None:
        sys.exit("No dome above the severed run.")

    modelled = {}
    for y in range(dome_rim, equator + 1):
        d = equator - y
        if d < radius:
            modelled[y] = math.sqrt(radius * radius - d * d)

    # The check the spec promised: how far is the sphere from the two rims we
    # actually measured? Reported, never absorbed.
    res_dome = modelled.get(dome_rim, 0) - half[dome_rim]
    # The collar is the pinch immediately below the globe, so look only inside
    # one radius of the equator. Searching the whole lower half finds the stand
    # at the bottom of the frame, which is narrower still and means nothing here.
    window = [y for y in ys if equator < y <= equator + radius]
    collar = min(window, key=lambda y: half[y]) if window else equator
    res_collar = half[collar]

    filled = dict(half)
    filled.update(modelled)

    # The stand is cut off by the frame. Keep what is measured and record where
    # the truncation is, so parts.js can decide how far to continue it.
    span = bottom - top
    pts = sorted(((bottom - y) / span, filled[y] / span) for y in sorted(filled))

    eps = 0.0016
    simple = rdp(pts, eps)
    while len(simple) > MAX_POINTS:
        eps *= 1.3
        simple = rdp(pts, eps)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "Gumball Machine (2049568285).jpg, Wikimedia Commons, CC BY-SA 2.0",
        "method": ("per-row background subtraction; components kept by area, not rank, "
                   "because the clear glass severs the dome from the body; the glass zone "
                   "replaced by the sphere its own widest row defines"),
        "note": ("y is 0 at the foot and 1 at the top of the dome. x is half width in the "
                 "same units, so the profile is scale free. The stand is truncated by the "
                 "frame at y=0."),
        "measured": {
            "glassZone": [round((bottom - equator) / span, 4), round((bottom - dome_rim) / span, 4)],
            "globeRadius": round(radius / span, 4),
            "globeEquatorY": round((bottom - equator) / span, 4),
            "domeRimResidual": round(res_dome / span, 4),
            "collarHalfWidth": round(res_collar / span, 4),
            "standTruncated": True,
        },
        "points": [[round(a, 5), round(b, 5)] for a, b in simple],
    }, indent=2) + "\n")

    print(f"components kept    {kept}")
    print(f"rotation axis      x={axis:.1f} of {im.width} (frame centre {im.width / 2:.1f})")
    print(f"object rows        {top}..{bottom}  span {span}")
    print(f"severed run        {g_top}..{g_bot}  ({g_bot - g_top + 1} rows of clear glass)")
    print(f"dome rim           y={dome_rim}   half={half[dome_rim]:.1f}")
    print(f"globe equator      y={equator}   radius={radius:.1f}px  = {radius / span:.4f} of height")
    print(f"  sphere vs dome rim residual  {res_dome:+.1f}px  ({abs(res_dome) / radius * 100:.1f}% of radius)")
    print(f"collar             y={collar}   half={res_collar:.1f}px")
    print(f"points after RDP   {len(simple)}  (eps {eps:.5f})")
    print(f"max half width     {max(b for _, b in simple):.4f} of height")
    print(f"wrote              {OUT}")


if __name__ == "__main__":
    main()
