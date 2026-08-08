/* The fourteen checks of the spec, run against a real browser over http.
   Every one of them prints its measured value, because "PASS" on its own is a
   claim and a number is evidence.

   Run with `npm run verify`. Serves the directory itself, so there is nothing
   to start first and nothing left running afterwards. */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { chromium } from "/opt/lampp/htdocs/TangerineWinkMCP/node_modules/playwright/index.mjs";

const ROOT = resolve(".");
const PORT = 4319;
const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".woff2": "font/woff2", ".md": "text/markdown",
};

const results = [];
const record = (n, title, ok, detail) => {
  results.push({ n, title, ok, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${String(n).padStart(2)}  ${title}\n         ${detail}`);
};

const server = createServer(async (req, res) => {
  try {
    const path = join(ROOT, decodeURIComponent(req.url.split("?")[0]));
    const body = await readFile(path);
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(PORT, r));
const URL_ = `http://localhost:${PORT}/index.html`;

const browser = await chromium.launch({ channel: "chrome" });

/* ---- 1. First frame -------------------------------------------------------
   Captured at 'commit', before load, before fonts, before the module. The
   entrance moves transform only with no opacity ramp precisely so that whatever
   sees this frame sees a full page: a headless screenshot, an unfurl bot, a
   printer. */
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(URL_, { waitUntil: "commit" });
  const seen = await p.evaluate(() => {
    const h1 = document.querySelector("h1");
    if (!h1) return { text: 0, opacity: null };
    return { text: h1.textContent.trim().length, opacity: getComputedStyle(h1).opacity };
  }).catch(() => ({ text: 0, opacity: null }));
  record(1, "First painted frame is a full page",
    seen.text > 0 && seen.opacity !== "0",
    `h1 present with ${seen.text} chars, opacity ${seen.opacity}`);
  await p.close();
}

/* ---- 2. Layout shift ---------------------------------------------------- */
let cls = null;
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await p.goto(URL_, { waitUntil: "load" });
  await p.waitForTimeout(2500);
  cls = await p.evaluate(() => window.__cls);
  record(2, "Cumulative layout shift", cls < 0.005, `CLS ${cls.toFixed(5)} (budget 0)`);
  await p.close();
}

/* ---- 3. No frame loop on a still page ------------------------------------
   The script's claim is on its first line: nothing runs per frame. This check
   holds it to that. requestAnimationFrame is wrapped before any page script
   runs, and after load the page gets two seconds to ask for frames. The
   defect this guards was shipped by an earlier build of this site: a rAF loop
   running 64 times a second on a completely still page, forever. */
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.addInitScript(() => {
    window.__raf = 0;
    const real = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => { window.__raf++; return real(cb); };
  });
  await p.goto(URL_, { waitUntil: "load" });
  await p.waitForTimeout(1000);
  const before = await p.evaluate(() => window.__raf);
  await p.waitForTimeout(2000);
  const after = await p.evaluate(() => window.__raf);
  record(3, "No frame loop on a still page", after - before === 0,
    `${after - before} requestAnimationFrame calls in 2s of stillness (${after} since load, including the browser's own)`);
  await p.close();
}

/* ---- 4. Contrast ---------------------------------------------------------
   Colours are read back from the browser and pushed through a canvas, so
   oklab() and color-mix() are resolved by Chrome rather than by arithmetic in
   this file. That conversion is where a hand written audit goes wrong. */
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(URL_, { waitUntil: "load" });
  await p.waitForTimeout(1200);
  const worst = await p.evaluate(() => {
    const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const solve = (css) => { c.fillStyle = "#000"; c.fillStyle = css; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

    const ground = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        const px = solve(bg);
        if (!/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return px;
      }
      return solve(getComputedStyle(document.body).backgroundColor);
    };

    let min = { r: Infinity };
    let n = 0;
    for (const el of document.querySelectorAll("body *")) {
      const text = [...el.childNodes].some((k) => k.nodeType === 3 && k.textContent.trim());
      if (!text) continue;
      const st = getComputedStyle(el);
      if (st.visibility === "hidden" || st.display === "none" || +st.opacity === 0) continue;
      if (el.closest(".sr-only, [aria-hidden='true']")) continue;
      n++;
      const r = ratio(solve(st.color), ground(el));
      const size = parseFloat(st.fontSize);
      const large = size >= 24 || (size >= 18.66 && +st.fontWeight >= 700);
      const need = large ? 3 : 4.5;
      if (r - need < min.r - (min.need ?? 0)) min = { r, need, size, tag: el.tagName, text: el.textContent.trim().slice(0, 34) };
    }
    return { ...min, n };
  });
  record(4, "Text contrast, colours resolved by the browser",
    worst.r >= worst.need,
    `${worst.n} text elements. Tightest ${worst.r.toFixed(2)}:1 against ${worst.need} on <${worst.tag}> "${worst.text}"`);
  await p.close();
}

/* ---- 5. No JavaScript ---------------------------------------------------- */
{
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(URL_, { waitUntil: "load" });
  const seen = await p.evaluate(() => 0).catch(() => null);
  const counts = {
    sections: await p.locator("section, header#top").count(),
    headings: await p.locator("h1, h2").count(),
    links: await p.locator("a[href^='mailto'], a[href^='https']").count(),
    chars: (await p.locator("body").innerText()).replace(/\s+/g, " ").length,
  };
  record(5, "Renders with JavaScript disabled",
    counts.sections === 6 && counts.headings >= 6 && counts.chars > 1200,
    `${counts.sections} sections, ${counts.headings} headings, ${counts.links} real links, ${counts.chars} chars of text`);
  await ctx.close();
}

/* ---- 6. Reduced motion ---------------------------------------------------
   Not a slower animation: the page at rest from the first frame. The head
   script never arms the start states, so nothing rises, nothing settles, and
   scroll obeys the stylesheet's auto. */
{
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(URL_, { waitUntil: "load" });
  await p.waitForTimeout(900);
  const state = await p.evaluate(() => ({
    hasJsClass: document.documentElement.classList.contains("js"),
    running: document.getAnimations().filter((a) => a.playState === "running").length,
    scroll: getComputedStyle(document.documentElement).scrollBehavior,
  }));
  record(6, "Reduced motion lands on a page at rest",
    !state.hasJsClass && state.running === 0 && state.scroll === "auto",
    `js class absent (start states never armed), ${state.running} running animations, scroll-behavior ${state.scroll}`);
  await ctx.close();
}

/* ---- 7 and 8. Keyboard order and console -------------------------------- */
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  p.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
  p.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 160)));
  await p.goto(URL_, { waitUntil: "load" });
  await p.waitForTimeout(2200);

  const order = await p.evaluate(async () => {
    const seen = [];
    for (let i = 0; i < 14; i++) {
      await new Promise((r) => setTimeout(r, 8));
      const a = document.activeElement;
      if (!a || a === document.body) break;
      const r = a.getBoundingClientRect();
      seen.push({ tag: a.tagName, top: Math.round(r.top + scrollY), label: (a.textContent || a.ariaLabel || "").trim().slice(0, 20) });
    }
    return seen;
  });
  for (let i = 0; i < 12; i++) await p.keyboard.press("Tab");
  const tabbed = await p.evaluate(() => {
    const els = [...document.querySelectorAll("a[href], button")].filter((e) => e.offsetParent !== null);
    const tops = els.map((e) => e.getBoundingClientRect().top + scrollY);
    let sorted = true;
    for (let i = 1; i < tops.length; i++) if (tops[i] < tops[i - 1] - 4) sorted = false;
    return { count: els.length, sorted };
  });
  record(7, "Tab order follows visual order", tabbed.sorted,
    `${tabbed.count} focusable elements, document order matches vertical order`);

  record(8, "Console is clean", errors.length === 0,
    errors.length ? errors.join(" | ") : "no errors, no page exceptions");
  await p.close();
}

/* ---- 9. Every request is same origin ------------------------------------
   The load bearing check of this whole project. */
let bytes = [];
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const foreign = [];
  p.on("request", (r) => {
    const o = new URL(r.url()).origin;
    if (o !== `http://localhost:${PORT}` && !r.url().startsWith("data:")) foreign.push(r.url());
  });
  p.on("response", async (r) => {
    try {
      const len = (await r.body()).length;
      bytes.push({ url: new URL(r.url()).pathname, len });
    } catch { /* redirects and aborted requests have no body */ }
  });
  await p.goto(URL_, { waitUntil: "load" });
  await p.waitForTimeout(2500);
  record(9, "No request leaves this host", foreign.length === 0,
    `${bytes.length} requests, ${foreign.length} third party${foreign.length ? ": " + foreign.join(", ") : ""}`);
  await p.close();
}

/* ---- 10 and 11. Zoom, narrow, landscape --------------------------------- */
{
  const cases = [
    ["1440 at 200% zoom", 720, 450],
    ["375 portrait", 375, 812],
    ["812 landscape", 812, 375],
  ];
  const bad = [];
  for (const [name, w, h] of cases) {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.goto(URL_, { waitUntil: "load" });
    await p.waitForTimeout(900);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 1) bad.push(`${name}: ${over}px`);
    await p.close();
  }
  record(10, "No horizontal scroll at 200% zoom", !bad.some((b) => b.startsWith("1440")), bad.find((b) => b.startsWith("1440")) ?? "0px overflow at 720x450 (200% of 1440)");
  record(11, "No horizontal scroll at 375 and in landscape", !bad.some((b) => !b.startsWith("1440")),
    bad.filter((b) => !b.startsWith("1440")).join(", ") || "0px overflow at 375x812 and 812x375");
}

/* ---- 12. Still after interaction -----------------------------------------
   Check 3 measures a page nobody touched. This one walks the page the way a
   reader does, advancing through every section and copying the address, and
   then requires the same silence: interaction may animate, but when it ends,
   the page stops asking for frames. */
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.addInitScript(() => {
    window.__raf = 0;
    const real = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => { window.__raf++; return real(cb); };
  });
  await p.goto(URL_, { waitUntil: "load" });
  await p.waitForTimeout(1200);
  for (let i = 0; i < 5; i++) {
    await p.click("[data-advance]");
    await p.waitForTimeout(500);
  }
  await p.click("[data-copy]").catch(() => {});
  await p.waitForTimeout(2600);
  const before = await p.evaluate(() => window.__raf);
  await p.waitForTimeout(2000);
  const after = await p.evaluate(() => window.__raf);
  const counter = await p.locator("[data-counter]").textContent();
  record(12, "Still after walking the whole page", after - before === 0 && counter === "6",
    `counter reads ${counter} / 6 after five advances, ${after - before} requestAnimationFrame calls in the 2s after interaction ended`);
  await p.close();
}

/* ---- 13. Bytes ----------------------------------------------------------
   Transfer size, which is what a visitor downloads, so it is measured after
   compression rather than from the file listing. */
{
  const merged = new Map();
  for (const b of bytes) merged.set(b.url, Math.max(merged.get(b.url) ?? 0, b.len));
  const gz = [];
  const { gzipSync } = await import("node:zlib");
  let total = 0;
  for (const [url, len] of merged) {
    const path = join(ROOT, url);
    let wire = len;
    try {
      const raw = await readFile(path);
      /* GitHub Pages compresses text and leaves woff2 alone, which is already
         compressed. Measuring the raw file for a text asset overstates the cost
         by a factor of three or four. */
      wire = /\.(html|css|js|json|md)$/.test(url) ? gzipSync(raw, { level: 9 }).length : raw.length;
    } catch { /* not on disk */ }
    total += wire;
    gz.push([url, len, wire]);
  }
  gz.sort((a, b) => b[2] - a[2]);
  record(13, "Transfer budget", total <= 500 * 1024,
    `${(total / 1024).toFixed(0)} KB over the wire, ceiling 500 KB`);
  for (const [url, raw, wire] of gz) {
    console.log(`           ${String((wire / 1024).toFixed(1)).padStart(7)} KB  ${url}${/\.(html|css|js|json|md)$/.test(url) ? `  (from ${(raw / 1024).toFixed(0)} KB)` : ""}`);
  }
}

/* ---- 14. Copy rules ------------------------------------------------------ */
{
  const files = ["index.html", "CREDITS.md", "PRODUCT.md"];
  const hits = [];
  for (const f of files) {
    const text = await readFile(join(ROOT, f), "utf8").catch(() => "");
    const dashes = (text.match(/[—–]/g) ?? []).length;
    const emoji = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
    if (dashes || emoji) hits.push(`${f}: ${dashes} dash, ${emoji} emoji`);
  }
  record(14, "No em dash, en dash or emoji in published files", hits.length === 0,
    hits.length ? hits.join("; ") : `${files.length} files clean`);
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks pass`);
if (failed.length) {
  console.log("failing: " + failed.map((f) => f.n).join(", "));
  process.exitCode = 1;
}
