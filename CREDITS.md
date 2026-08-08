# Credits

Everything this page loads is served from this host. Nothing here reaches a third party at runtime.

## Typeface

The system typeface of the reader's platform, by deliberate choice: it ships the optical sizing, tracking tables and legibility tuning of the device it renders on, and it costs zero bytes. No font file is served.

## Libraries

None at runtime. Tailwind CSS compiles `src/input.css` into `style.css` and esbuild bundles `src/main.js` into `app.js` at build time; both are build tools and neither ships library code to the page.
