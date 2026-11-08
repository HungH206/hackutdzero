# Design tools: screenshots, style audit, cohesion grid

Three tools for the redesign. They check what the browser actually renders, on every screen, in both simulation states.

| Tool | What it does | Output |
|---|---|---|
| `shoot.mjs` | Screenshots each view × state × size in a fresh headless Chrome tab, and records console errors, warnings, uncaught exceptions and failed requests | `<out>/<view>-<state>-<w>x<h>.png`, `<out>/report.json` |
| `audit.mjs` | Checks the computed styles of every visible element against `src/theme/allowlist.json`, and compares the shared `data-ui` landmarks across screens | `<out>/audit.json`, `<out>/audit.md` |
| `grid.py` | Tiles six incident screenshots into one 3×2 JPEG | e.g. `docs/screenshots/cohesion-grid.jpg` |

`lib.mjs` (Chrome, CDP, simulation states, page loading) and `normalize.mjs` (color, shadow, radius and font parsing) are shared helpers. There are no npm dependencies: the tools use Node built-ins and the Chrome DevTools Protocol over Node's global `WebSocket`.

## Requirements

- Node 22 or newer (tested on Node 24).
- Google Chrome. The tools look in the usual install locations on Windows, macOS and Linux (Edge and Chromium also work). Otherwise pass `--chrome <path>` or set `CHROME_PATH`.
- For `grid.py`: Python 3 with Pillow (`pip install pillow`).
- Dependencies installed in **both** `monitor/` and `spacetimedb/` (`npm ci` in each). The in-process backend loads `spacetimedb/local/bridge.ts`, which imports the `spacetimedb` package from `spacetimedb/node_modules`. Without it, `/__headcount/state` returns a 500 "Cannot find module 'spacetimedb'".

## 1. Start a dev server with the in-process backend

Each Vite server runs its own copy of the simulation. The tools **reset and drive that simulation**, so use your own port and never point them at someone else's server (see `--states current` below).

Windows (PowerShell), from `monitor/`:

```powershell
$env:HEADCOUNT_SOURCE='local'; npx vite --host 127.0.0.1 --port 5192 --strictPort
```

macOS or Linux (bash or zsh), from `monitor/`:

```bash
HEADCOUNT_SOURCE=local npx vite --host 127.0.0.1 --port 5192 --strictPort
```

Check it with `curl http://127.0.0.1:5192/__headcount/state`. You should get JSON with 40 households. The first request takes a few seconds while the module loads.

## 2. Screenshots

From `monitor/`:

```bash
node scripts/design/shoot.mjs --base http://127.0.0.1:5192 --out scripts/design/out/shots
node scripts/design/shoot.mjs --base http://127.0.0.1:5192 --out scripts/design/out/shots \
  --views graph,overview,houses,map,tree,analytics,log --states clear,incident \
  --sizes 1440x900,1920x1080,1280x800,1024x768 --query extra=1
```

In PowerShell, put it on one line or use a backtick instead of `\` for line breaks.

It prints one line per shot (status, time, error, warning, exception and failed-request counts, file) and a summary. `report.json` records every page's URL, timings, console errors and warnings with source locations, exceptions, failed requests (network errors and HTTP 400 and above), the root element's class (for example `app py-app screen-graph incident`, a quick check that the right screen and state rendered) and the WebGL renderer.

Exit codes: `0` if every page was clean, `1` if any page logged a console error or threw an exception (or failed to load), `2` if the run itself failed (no server, no Chrome). The automatic `/favicon.ico` 404 is ignored because the app ships no favicon.

## 3. Style audit

```bash
node scripts/design/audit.mjs --base http://127.0.0.1:5192 --out scripts/design/out/audit
node scripts/design/audit.mjs --base http://127.0.0.1:5192 --out scripts/design/out/audit --sizes 1440x900,1280x800
```

It takes the same options as `shoot.mjs`, plus these:

| Option | Default | Meaning |
|---|---|---|
| `--allowlist <path>` | `src/theme/allowlist.json` | The allow-list to check against |
| `--landmarks a,b,...` | the 15 landmarks in `SYSTEM.md` (`topbar`, `panel`, `inspector`, `rail`, `row`, `chip`, `btn-primary`, `btn-secondary`, `pin`, `map-controls`, `alert`, `toast`, `kpi`, `tabs`, `seg`) | A bare name means `[data-ui="name"]`. Anything else is used as a CSS selector |
| `--text-scope own\|all` | `own` | Check font and text color only on elements that render their own text (`own`), or on every element (`all`) |
| `--max-rows <n>` | `80` | Violation rows per screen in `audit.md` (all of them are in `audit.json`) |
| `--fail-on-violations` | off | Exit 1 when anything is off-list (for a pre-merge gate) |

What it checks, for every visible element. Visible means a non-zero box, not `display:none`, not `visibility:hidden` and not inside `opacity:0`. It skips `<canvas>`, everything matched by the allow-list's `ignore` selectors (with their subtrees), and SVG internals except text.

- `font-family` (first family, quotes stripped, compared case-insensitively), `font-size` (within ±0.5 px, exclusive, so 10.5 px does not pass as 11 px), `font-weight` (exact), and text `color` (`fill` for SVG text). These are checked on elements with their own text, form fields, and SVG text.
- `background-color` when it isn't transparent, and `border-*-color` on sides with a border width above 0.
- `border-radius` per corner, where the radius can be seen (filled, bordered, shadowed, blurred, clipping or replaced boxes).
- `box-shadow`. Both sides are parsed into canonical layers (`x y blur spread #rrggbb/alpha`, plus `inset`), so Chrome's `rgba(0, 0, 0, 0.06) 0px 1px 2px 0px` matches the allow-list's `0 1px 2px rgba(0,0,0,.06)`.
- `backdrop-filter` and gradient `background-image` values are listed for review. They are checked only if the allow-list has a `backdropFilters` array.
- Rendered height of `button`, `a[href]` (not inline text links), `input` (not checkboxes, radios, ranges or color pickers), `select`, `textarea`, `[role=tab]`, `[role=switch]` and `[role=button]`, against `controlHeights` (±0.5 px).
- `::before` and `::after` with content get the same color, border, radius and shadow checks, and text checks when they hold text.

Colors are normalized to `#rrggbb`, or `#rrggbb/alpha` when not opaque. `rgb()`, `color(srgb …)`, `oklch()`, `oklab()`, `lab()`, `lch()`, `hsl()` and `display-p3` all convert to sRGB. A color matches the allow-list if its RGB matches an entry within 1 per channel, and its alpha matches too unless `allowAlpha` is true.

`audit.md` sections:

1. **Summary**: per screen, the number of visible elements, off-list entries, and distinct off-list values per property.
2. **Cross-screen comparison**: for each landmark, a table of its key computed styles per screen (font, color, background, border, radius, shadow, backdrop filter, padding, and height for bars, rows, chips, buttons, pins, tabs and segmented controls). Properties whose value sets differ between screens are marked `≠`, and the landmark is listed as differing. Full tables are shown for the first size; other sizes list only the differences.
3. **Distinct values per screen**: allowed and off-list values for each property, with counts.
4. **Violations by screen**: state, short selector path (`tag#id.class` chain, up to 4 levels, with `[data-ui]`), property, value and count.

Counts are elements per page, taking the maximum over states and sizes. `audit.json` has everything: pages, per-state setup, violations, distinct values, comparison tables, and the web fonts that actually loaded.

## 4. Cohesion grid

```bash
python scripts/design/grid.py scripts/design/out/shots ../docs/screenshots/cohesion-grid.jpg
```

It reads `graph`, `overview`, `houses`, `map`, `tree` and `analytics` as `<view>-incident-1440x900.png`. Options: `--state`, `--size`, `--tile-width` (default 960, which gives a 2928×1296 JPEG) and `--quality`. A missing shot becomes a placeholder tile and the script exits 1.

## Simulation states

| State | What the tool does first |
|---|---|
| `clear` | `sim_reset {}` (all clear) |
| `incident` | `sim_reset`, then `sim_quake {x:200, y:160, magnitude:1}`, `sim_fire {householdId}` (Mr. Chen, Cypress Flats 3B, as the demo panel uses; override with `--fire <id>`), `sim_power_loss {x:200, y:160, radius:420}`, and `sim_fast_forward {minutes:8}` (`--ff <minutes>`) |
| `current` | Changes nothing. Shoots or audits whatever the server is showing (works against any server, including a `spacetimedb` one) |

The local bridge runs reducers as the internal identity, so operator checks pass without `npm run promote`. Each reducer call is applied before `POST /__headcount/call` returns, and the tool reads `/__headcount/state` to confirm (for example that a disaster is active). The page polls state every 800 ms and fetches it on load, so a fresh tab always shows the new state.

The simulation keeps running in real time between shots (the 5 s tick, ladder countdowns), so later shots in a run are a few seconds further along. Don't run two tools against the same server at once, since each one resets the state.

## How a page is loaded

1. A new tab gets `Emulation.setDeviceMetricsOverride` (the size, deviceScaleFactor 1) before navigating to `<base>/?view=<view>[&query]`.
2. The tool waits for the load event, then for **network idle**: no requests for 500 ms. Requests pending for more than 10 s don't count. The 800 ms state poll leaves short idle windows, and those are enough.
3. On `graph` it waits up to 20 s for a `<canvas>` (three.js is lazy-loaded), then for the network to go idle again. Add another selector with `--wait <css>`.
4. It waits for `document.fonts.ready` and two animation frames, then settles: `--settle` (default 1000 ms), plus `--canvas-settle` (default 2000 ms) when the page has a canvas.
5. If the page navigated during all this (for example Vite reloading after optimizing dependencies), it waits again.

Other options: `--timeout <ms>` per page (default 45000), `--headful` to watch Chrome, `--verbose` for every message, the root class and the WebGL renderer.

Runtime on the dev laptop (Windows, Intel Iris Xe; headless Chrome renders WebGL on the GPU through ANGLE/D3D11): about 2 s per page, 5 to 7 s for the 3D `graph` page, and about 40 s per size for all 7 views × 2 states. The full matrix at 2 sizes (28 pages) takes about 75 s for `shoot.mjs` and 70 s for `audit.mjs`.
