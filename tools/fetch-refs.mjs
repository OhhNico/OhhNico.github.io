/* Fetches the three reference photographs into .refs/, which is git ignored.
   They are never committed and never served: the model is procedural, and the
   photographs are measurement input for a rebuild, not an asset of this site.
   See CREDITS.md for authorship and licences. */

import { writeFile, mkdir } from "node:fs/promises";

const UA = "ohhnico.github.io reference fetch (nicogifo2000@gmail.com)";
const API = "https://commons.wikimedia.org/w/api.php";

const REFS = {
  /* Primary. Identity and materials: dome, globe, cast front plate, flared
     skirt, and the only one of the three on a flat background. */
  "A.jpg": "Gumball Machine (2049568285).jpg",
  /* Vertical proportions and the foot, from a true three quarter view. */
  "B.jpg": "Gumball Machine, Lobby, Renaissance Center, Jefferson Avenue, Detroit, MI.jpg",
  /* The knob with its lever, and the delivery tray. The two interaction parts. */
  "C.jpg": "Kauwgomballen.jpg",
};

/* 2000px on the long side. Enough for the detail inventory, which is what sets
   the floor, and small enough that a rebuild does not pull 30 MB. */
const WIDTH = 2000;

async function fetchOne(name, title) {
  const q = new URLSearchParams({
    action: "query", format: "json", titles: `File:${title}`,
    prop: "imageinfo", iiprop: "url|size", iiurlwidth: String(WIDTH),
  });
  const meta = await fetch(`${API}?${q}`, { headers: { "User-Agent": UA } });
  if (!meta.ok) throw new Error(`Commons API ${meta.status} for ${title}`);
  const pages = (await meta.json()).query.pages;
  const info = Object.values(pages)[0]?.imageinfo?.[0];
  if (!info) throw new Error(`No imageinfo for ${title}`);

  const url = info.thumburl ?? info.url;
  const img = await fetch(url, { headers: { "User-Agent": UA } });
  if (!img.ok) throw new Error(`Download ${img.status} for ${url}`);
  const bytes = Buffer.from(await img.arrayBuffer());
  await writeFile(`.refs/${name}`, bytes);
  console.log(`${name}  ${info.width}x${info.height} source  ${bytes.length} bytes  ${title}`);
}

await mkdir(".refs", { recursive: true });
for (const [name, title] of Object.entries(REFS)) await fetchOne(name, title);
console.log("\nThese files are git ignored. See CREDITS.md before using them anywhere else.");
