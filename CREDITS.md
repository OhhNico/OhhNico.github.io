# Credits

Everything this page loads is served from this host. Nothing here reaches a third party at runtime.

## Typefaces

| Family | Licence | File |
|---|---|---|
| Bricolage Grotesque, variable, `opsz` 12-96 and `wght` 200-800 | SIL Open Font License 1.1 | `fonts/OFL-Bricolage.txt` |
| Chivo Mono, variable | SIL Open Font License 1.1 | `fonts/OFL-ChivoMono.txt` |

## Libraries

Bundled into `app.js` at build time by esbuild, tree shaken. Not fetched at runtime.

| Library | Licence | File |
|---|---|---|
| three.js | MIT | `vendor/THREE-LICENSE.txt` |
| GSAP core | Standard No Charge licence, which applies because nobody pays to reach this page | `vendor/GSAP-LICENSE.txt` |

Tailwind CSS compiles `src/input.css` into `style.css` at build time and ships no runtime code.

## Reference photographs

The machine on this page is a procedural reconstruction: geometry written in code, measured from photographs. No pixel from any of these images is served by this site, and none of them is redistributed here. They are fetched into a git ignored directory by `npm run refs` when the model is rebuilt.

| Role | Source | Licence |
|---|---|---|
| Identity, materials, lathe profile | [Gumball Machine (2049568285)](https://commons.wikimedia.org/wiki/File:Gumball_Machine_(2049568285).jpg), Wikimedia Commons | CC BY-SA 2.0 |
| Vertical proportions, foot | [Gumball Machine, Lobby, Renaissance Center, Detroit](https://commons.wikimedia.org/wiki/File:Gumball_Machine,_Lobby,_Renaissance_Center,_Jefferson_Avenue,_Detroit,_MI.jpg), Wikimedia Commons | CC BY-SA 2.0 |
| Knob, lever, delivery tray | [Kauwgomballen](https://commons.wikimedia.org/wiki/File:Kauwgomballen.jpg), Wikimedia Commons | CC BY-SA 4.0 |

Attribution is given here as a courtesy and as a record of where the measurements came from. The manufacturer wordmark that appears in relief on the real machine is not reproduced.
