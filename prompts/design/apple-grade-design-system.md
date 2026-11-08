# Prompt: one cohesive, professional design for every Headcount dashboard

Paste everything below the line into the model doing the design work, and attach the ten reference files from `headcount-design-references.zip`. Their names start with `R01`-`R10` so this prompt can point at them exactly. The references are **local only**: never commit them.

| File | What it is | Drives |
|---|---|---|
| `R01_main-graph_network.mp4` | Policy-platform network graph (dark) | Building view drill, command dock, beams-as-routes. **Structure only, not its dark palette.** |
| `R02_houses_terrain-card.webp` | Tilted terrain with a frosted card | Houses: tilt, depth of field, the frosted callout card with a huge thin numeral |
| `R03_overview_fleet-app.mp4` | Fleet logistics app (dark) | Overview: rail, stat pills, tabs, cutaway cells, waiting list, gauges, warning bars. **Converted to light.** |
| `R04_analytics_workspace.jpg` | Analytics workspace with floating cards over a map | Analytics layout, bubble matrix, radar, legend with range slider, side panel |
| `R05_analytics_executive-kpis.webp` | Executive KPI overview | Analytics KPI comparison tiles, two-line "before vs now" chart, treemap |
| `R06_map_satellite-city-topdown.jpg` | Satellite map, top-down city, place card, map controls | **The map look.** Imagery, label halo, control cluster, scale bar, place card |
| `R07_map_satellite-regional.jpg` | Satellite map, regional zoom | Zoomed-out palette and the Houses wide view |
| `R08_map_satellite-rooftop-closeup.webp` | Oblique satellite close-up of rooftops and trees | Roof, tree-canopy and shadow detail at full zoom |
| `R09_map_pin-over-rooftops.png` | Red teardrop pin over rooftops | The urgent-household pin and its ground shadow |
| `R10_map_3d-aerial-callouts.webp` | Tilted 3D aerial with frosted callouts and chips | The main 3D screen: tilt, callout pills, filter chips, round glass buttons |

This file replaces every earlier design brief in this folder.

---

## 0. Who you are and what you're doing

You're the lead product designer **and** the front-end engineer for **Headcount**, a HackUTD 2026 project.

What Headcount does:
- A plug-in home sensor plus a live dispatch system for disaster response.
- After an earthquake, fire or power loss, it keeps a running count of who has been **found**.
- It ranks every household by need with the Headcount Priority Index (HPI).
- It escalates the cheapest way first until nobody is left unaccounted for.
- Tagline: **"Everyone found."** Core idea: **silence is a signal**.

Your job is to make **every dashboard look like one professional product** that a city emergency-operations center could actually run on. Three sources, each with a clear job:

1. **Government operations websites decide the tone**: light, high-contrast, plain-language, status-first, accessible, trustworthy. Think of the USGS earthquake map (list beside map, scale bar, layers button), the NWS and FEMA sites (plain alerts, timestamps, clear headings), and the U.S. Web Design System (USWDS) alert, table and tag components. Study them. **Don't imitate a government site**: no seals, no flag banner, no "official website" text, no agency names. Headcount is a student project and must never look like it's pretending to be a government service.
2. **Apple's design craft decides how things are built**: type, spacing, controls, materials, motion, restraint. Values measured from apple.com are in section 3.
3. **The references decide each screen's signature visuals**, and the **satellite references (R06-R10) decide how every map looks**. Take heavy inspiration, but don't copy them: no copied layouts pixel for pixel, text, logos, brand names or artwork.

In one line: **government ops clarity, Apple craft, satellite maps, one product.**

Deadline: final submission is **Sun Nov 8, 12 PM CT**. Judging runs 1-4 PM.
- Every commit must leave every screen working.
- Freeze features at **10 AM** and only polish after that.
- A smaller thing that's finished beats a bigger thing that's half-built.

---

## 1. Read before touching anything

1. `AGENTS.md`: hard rules for this repo. They override anything in this prompt.
2. `docs/GRAPHICS_HANDOFF.md`, which covers:
   - how to run every dashboard (`npm run dashboards`, ports 5180-5185)
   - the data contract (`useHeadcount()`, `useView()`, `actions`)
   - what each screen must still do
   - which files you must not touch
3. **Branch `design/main-3d` (Aryan's newest work). Build on it. Don't redo it.**
   - The main screen (5180) is a light, matte 3D architectural model of Cedar Hollow: three.js through `@react-three/fiber`, `drei` and postprocessing, lazy-loaded and fully offline.
   - Files: `monitor/src/ui/command/` (`CommandView.tsx`, `Map3D.tsx`, `FlatMap.tsx` as the no-WebGL fallback, `model.ts`, `sitePlan.ts`, `command.css`).
   - It has DOM pins over the canvas and white panels: incident summary, HPI analysis, dispatch queue, legend and the command dock.
   - Screenshots: `docs/screenshots/main-dashboard/`.
   - Its light white-panel look is already the right direction. **This pass keeps the panels and turns the ground into satellite imagery** (section 5).
   - Create `design/cohesive` from `origin/design/main-3d`, merged onto `origin/main`. Never push to `main`; open a PR when a screen is done.
4. Look at all ten references **before** you plan. For the videos, extract frames at 1 fps (`ffmpeg -i R01_main-graph_network.mp4 -vf fps=1 /tmp/r01_%02d.jpg`) and study them.

---

## 2. Principles, applied to Headcount

These are Apple's Human Interface Guidelines design principles, paraphrased, with the government-operations tone folded in. Use them as the tiebreaker when two design choices compete.

| Principle | What it means here |
|---|---|
| **Purpose** | Every screen answers **one** question (table below). Anything that doesn't serve it is demoted or cut. |
| **Agency** | Every write action (Found OK, Needs help, Assisted, Override) shows clear feedback and offers **Undo** for 6 s by calling `actions.setFinalState(id, <previous state>, 'Undo')`. No modal traps: Esc always closes, ⌘K always reaches search. |
| **Responsibility** | Every score shows **why** (`priority.reason` is one click away). Simulated things say **Simulated**, including the 911 hand-off and the map imagery. Never rank or color by income, race, immigration status or insurance value. |
| **Familiarity** | Use patterns people already know: a list beside a map (USGS), satellite maps with a bottom-right control cluster (R06), plain alert banners with a colored left edge (USWDS), sortable tables, segmented controls, ⌘K search. |
| **Flexibility** | Projector (1920×1080), laptop (1440×900, the primary target), 1280 px, iPad (1024). Keyboard-first. Respect `prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast`. Color never carries meaning alone. |
| **Simplicity** | Plain language at a sixth-grade reading level: "Needs help", not "Distress state". One primary action per view. Labels of three words or fewer. Numbers before prose. Every number gets a unit and every event a timestamp. |
| **Craft** | Concentric radii, optical alignment, tabular numbers, hairline separators, one icon stroke, no layout shift on hover, 60 fps, real empty, loading, error and offline states (section 8). |
| **Delight** | One defining moment: when everyone is accounted for, the product says **"Everyone found."** (section 7). Otherwise the emotion is **calm competence under pressure**. |

**The one question each screen answers:**

| Screen | Port | Question |
|---|---|---|
| Main: 3D Cedar Hollow (`CommandView`) | 5180 | Where is need right now, and who's next? |
| Overview | 5181 | What do I do next in this building? |
| Houses | 5182 | Which homes are OK, and which aren't? (calm, wall-screen friendly) |
| Live map | 5183 | Where do responders go? |
| Building view | 5184 | Who in this building still needs reaching? |
| Analytics | 5185 | Are we finding people faster than the baseline? |
| Event log | (in-app) | What happened, and when? |

---

## 3. Foundation layer (shared by every screen)

Put all of this in **one** new file, `monitor/src/theme/tokens.css`, imported first in `main.tsx`. Screens may add an accent on top (section 4) but may **not** redefine the foundation tokens.

### 3.1 Appearance: light, one theme

There is **one appearance: light.** Government operations sites are light because light is the most legible in bright rooms, on projectors and when printed. It's also what Aryan's main screen already uses, and one theme is what can actually ship by noon.
- Don't build a dark mode or a theme toggle.
- The dark references (R01, R03, R04, R05) contribute **layout, components and signature visuals only**. Re-create them on light surfaces.
- The only dark elements: the satellite imagery itself, the primary button, and map label halos.

### 3.2 Typography

SF Pro's license doesn't allow redistribution, so **never add SF font files to the repo**. Use the system stack, which renders real SF on every Mac:

```css
--font-text: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter Variable", "Helvetica Neue", Arial, sans-serif;
--font-display: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter Variable", "Helvetica Neue", Arial, sans-serif;
--font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
--font-map: "Roboto", "Inter Variable", Arial, sans-serif; /* map labels only */
```

- Bundle `@fontsource-variable/inter` as the offline fallback. Bundle `@fontsource/roboto` (400 and 500) for map labels: R06-R10 label in Roboto, and that is part of the satellite look.
- Numbers: `font-variant-numeric: tabular-nums` everywhere. Mono only for timestamps and IDs.

**Type scale** (apple.com values, measured Nov 8):

| Token | Size / line-height / weight / tracking | Use |
|---|---|---|
| `--t-hero` | 56px / 1.07 / 600 / -0.005em | One per screen at most: the accounted number, the Houses % |
| `--t-headline` | 40px / 1.1 / 600 / 0em | Screen titles (Overview, Analytics) |
| `--t-title` | 28px / 1.14 / 600 / 0.007em | Panel titles, the selected household name |
| `--t-callout` | 19px / 1.21 / 400 / 0.012em | Subheads |
| `--t-body` | 17px / 1.47 / 400 / -0.022em | Body, list rows |
| `--t-subhead` | 15px / 1.33 / 400 / -0.016em | Secondary rows, queue reasons |
| `--t-footnote` | 13px / 1.38 / 400 / -0.008em | Metadata, timestamps |
| `--t-caption` | 12px / 1.33 / 500 / 0.02em | Badges, axis labels, uppercase section kickers ("DISPATCH QUEUE"). **Nothing below 11px. Ever.** |

Large numerals are semibold 600. The one exception is the Houses frosted card (R02), which uses weight 200, scoped to `.hs-*`. Use `rem` so browser zoom works.

### 3.3 Color

**Neutrals** (apple.com light):

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f5f5f7` | App background behind panels |
| `--surface-1` | `#ffffff` | Panels and cards |
| `--surface-2` | `#f5f5f7` | Inset rows, grouped sections |
| `--surface-3` | `#e8e8ed` | Controls, segmented control track |
| `--label` | `#1d1d1f` | Primary text |
| `--label-2` | `#515154` | Secondary text (≥ 7:1 on white) |
| `--label-3` | `#6e6e73` | Captions (≥ 4.5:1 on white) |
| `--separator` | `#d2d2d7` | Hairlines |
| `--link` | `#0066cc` | Links |
| `--action` | `#1d1d1f` | Primary button fill (black pill, white text, like Aryan's "New Simulation") |
| `--focus` | `#0071e3` | Focus ring |

**Status colors are one set, identical on every screen, map and chart.** Each status has a **fill** (pins, bars, dots) and a darker **ink** for text on white that passes AA contrast. Each status also has a glyph, so color never carries meaning alone. They match Aryan's existing legend so nothing shifts:

| Status | Fill | Ink (text on white) | Tint (alert background) | Glyph |
|---|---|---|---|---|
| Open, critical | `#D92D20` | `#B42318` | `#FEF3F2` | numbered pin + exclamation |
| Open, waiting | `#E8590C` | `#B54708` | `#FFF6ED` | numbered pin |
| Needs help (pressed HELP) | `#D92D20` | `#B42318` | `#FEF3F2` | exclamation in a circle |
| Found OK | `#12A150` | `#0E6B3A` | `#EDFCF2` | checkmark |
| Assisted | `#1F6FEB` | `#1558C0` | `#EFF5FF` | checkmark in a shield |
| No sensor / unknown | `#8A8F98` | `#5B616B` | `#F2F4F7` | question mark |
| Fire | `#E8590C` | `#B54708` | `#FFF6ED` | flame |
| Responder route | `#1F6FEB` | — | — | solid blue line |
| Epicenter / hazard radius | `#D92D20` dashed | — | — | target ring |

**Accent**: none. The interface is neutral, the map is full color, and **status is the only color** in the chrome. One more allowance: the Houses screen may tint its frosted card with the imagery behind it.

### 3.4 Materials

Panels are **solid white** (`--surface-1`) with a 1px `--separator` border and the shadow `0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08)`. That's the government-ops choice: readable over busy imagery, and printable.

Glass only where something floats **directly over the satellite map** (R10's look):
- `--mat-map`: `rgba(255,255,255,.82)`, `backdrop-filter: saturate(180%) blur(20px)`, 1px rim `rgba(255,255,255,.6)`, shadow `0 2px 8px rgba(0,0,0,.25)`. Used for map controls, callout pills, filter chips and the compass.
- `--mat-chrome` for the top bar: `rgba(250,250,252,.86)` with the same blur and a bottom hairline (apple.com's nav: 52px tall here, 48px under 834px).
- `@media (prefers-reduced-transparency: reduce)` and `(prefers-contrast: more)`: every glass becomes opaque white with a 1px `#1d1d1f33` border. Required.

### 3.5 Shape, spacing, hit targets

- **Spacing**: 4-pt base, steps 4, 8, 12, 16, 20, 24, 32, 44, 64. Screen margins 16 px around map-first screens, 24 px elsewhere.
- **Radii**: panels 16 px, cards inside panels 10 px, controls 10 px, pills 980px. Inner radius = outer radius − padding.
- **Buttons**: primary is a black pill (`--action`), secondary is a white pill with a 1px `--separator` border, tertiary is a text link with a chevron ("Full record ›"). **One primary per view.**
- **Hit targets**: at least **44×44 px**, map pins included (pad invisibly).
- **Separators**: 1 px `--separator`.

### 3.6 Icons

One icon set, `ui/Icon.tsx`, drawn on a 24-unit grid: 1.6 stroke, round caps and joins, filled variants for selected states. No emoji, no icon fonts, no SF Symbols artwork. Every icon-only button has an `aria-label` and a tooltip after 500 ms.

### 3.7 Motion

- Panels and sheets: 320 ms, `cubic-bezier(.32,.72,0,1)`.
- Hover 150 ms, press 120 ms `scale(.97)`.
- Numbers **count** to new values over 400 ms (tabular, no jitter). The queue reorders with FLIP over 300 ms.
- Camera moves on the 3D and 2D maps: 700 ms ease-in-out, never a jump cut.
- Ambient motion (route dashes, the urgent pin's breathe) loops slowly, 1.6-4 s.
- `prefers-reduced-motion`: crossfades of 150 ms or less, no camera flights (cut instead), ambient loops stop.

---

## 4. Cohesion: one product, not seven

The user's main complaint so far is that the screens look like different apps. Everything in this section is mandatory.

1. **One shell.** Every screen has the same top bar (`ui/py/Header.tsx`, restyled): logo and name on the left, the screen switcher in the center, then New Simulation, scenario clock, search and connection status on the right. The Overview's icon rail is kept, but it uses the **same** icons, order and active style as the switcher.
2. **One status palette** (section 3.3), used on pins, chips, bars, chart series and the legend. A household that is red on the main screen is red on every screen.
3. **One household representation.** Wherever a household appears on a map, it is the **same pin family** (section 5.4) at the same size for its zoom. In lists, it's the same row: rank badge, name, unit, reason, HPI number, ladder bar.
4. **One inspector.** Selecting a household anywhere opens the same right-side panel (`ui/py/Detail.tsx` restyled, section 6.7).
5. **One map base.** Every map surface (3D main, Houses, Live map, Overview mini map, Analytics background) uses the **same fictional satellite imagery** of Cedar Hollow at different zooms and tilts (section 5). Never a vector basemap on one screen and imagery on another.
6. **One alert pattern.** Banners, toasts and inline warnings all use the USWDS-style alert: white or tinted background, 4 px colored left edge, glyph, bold one-line heading, one sentence, timestamp.
7. **One type scale, one radius set, one shadow, one motion curve.** No per-screen overrides.
8. **One primary action per view**, always the black pill.
9. **Same words everywhere.** Use the glossary: "household", "Found OK", "Needs help", "Assisted", "No sensor", "Open", "Dispatch queue", "Responder (simulated)". Never "victim", "case" or "ticket".
10. **The audit.** Before the PR, screenshot all six screens at 1440×900 in incident state and tile them in one 3×2 image (`docs/screenshots/cohesion-grid.jpg`). If any tile looks like it came from a different product, fix it before anything else.

---

## 5. The map system: satellite view (R06-R10)

The user wants the maps to look **exactly like a satellite map view**: true-color aerial imagery with crisp white labels, a small glass control cluster in the corner, and red teardrop pins. Match that look closely. Two constraints are non-negotiable:
- **The place is fictional.** Cedar Hollow is invented (AGENTS.md rule 1: synthetic data only). Never use real imagery, real tiles, real coordinates or real addresses.
- **No third-party map branding or services**: no Google logo, wordmark or attribution, no Pegman, no tile API calls. Everything renders offline from our own assets.

### 5.1 What the references show (observed)

- **R06 (top-down city)**: true-color imagery with low saturation. Asphalt reads dark grey (about `#3e3f41`-`#4b4e51`), flat roofs light warm grey (about `#8c8984`-`#948e8a`), deep shadows near black. White labels with a dark halo. Bottom-right controls: recenter, a "3D" toggle, −/+ zoom and a compass, stacked in small rounded white squares. A scale bar. A place card with a photo header.
- **R07 (regional)**: olive-dominant greens (about `#414b3c`, `#2f4134` canopy, `#5d6046` and `#66664e` dry grass), patchwork fields, darker water.
- **R08 (oblique rooftop close-up)**: individual roofs with gravel texture, rooftop HVAC boxes, cars in lots, round tree crowns with their own soft shadows.
- **R09 (pin)**: a red teardrop pin with a white center dot and a darker red stroke, standing over rooftops, with a soft dark ground shadow at the tip.
- **R10 (3D aerial)**: the camera is tilted about 45-60°, buildings are extruded with textured roofs, frosted white **callout pills** sit on the scene, filter **chips** run along the top, and round **glass buttons** (compass, locate) sit in the corners.

### 5.2 The imagery: how to build it (pick A; B only if A is done early)

**A. Procedural "satellite paint" (primary, implementable today).** Aryan's `sitePlan.ts` already draws the site plan into a canvas in map units (`PPM = 3.2` texture pixels per meter) and uses it as the ground texture. Keep the geometry; replace the flat `PLAN` palette with satellite painting:

| Layer | Recipe |
|---|---|
| Base land / lawn | `#5d6046` → `#66664e` mottled with 2-3 octaves of value noise (±6% lightness), plus darker patches `#4f5b44` |
| Tree canopy | Clusters of round crowns, 4-9 m diameter, `#2f4134` core → `#414b3c` edge, each with a 1-2 m offset shadow toward the southeast at 45% black. Dense in parks and along the creek, scattered in yards |
| Streets | Asphalt `#45474a` with ±4% noise, dashed white center lines at 70% opacity, faint tire-wear stripes. Major road (Cedar Ave) slightly wider with yellow-white center marks |
| Sidewalks / curbs | `#9a968f` 1.5 m bands |
| Parking | Asphalt with white stall lines and **parked cars** as 4.5 × 1.8 m rounded rectangles in muted colors (white, silver, black, dark blue, red), 60% of stalls filled |
| Roofs (flat, multifamily) | `#8c8984` → `#948e8a` with gravel noise, a darker 0.5 m parapet edge, 2-4 HVAC boxes with shadows (R08) |
| Roofs (pitched, houses) | Two tones split at the ridge (`#6b5f57` / `#80746a`), shingle noise |
| Water (Cedar Creek) | `#2c3b3a` → `#36493f` with a subtle lighter edge and a soft bank of `#4f5b44` |
| Shadows | Every building casts a shadow southeast, length proportional to height, `rgba(0,0,0,.45)` with a 1 m blur |
| Grade | Finish with a global grade: saturation 0.85, a slight warm cast, and a 3% film grain so it reads as photo, not illustration |

Render once at startup into an offscreen canvas. Seed every noise call so the town looks identical on every load. Target 3200 × 2300 px; cache it as a bitmap. Export a static WebP of the same texture to `monitor/src/assets/satellite/cedar-hollow.webp` (under 1.5 MB) so the 2D screens can use it without three.js.

**B. Generated photo texture (optional upgrade).** If you have an image-generation tool, export the site-plan layout as a labeled mask (roads, roofs, trees, water, lots) and generate a photoreal top-down aerial that follows it **exactly**. Same file path. It must stay fictional and must line up with `sitePlan.ts` coordinates within 1 m, or pins will sit on the wrong roofs. If it doesn't line up, ship A.

### 5.3 Labels and overlays (the "hybrid" layer)

- Street labels: `--font-map` 500, 12-13 px, **white with a 2 px dark halo** (`paint-order: stroke; stroke: rgba(0,0,0,.7)`), set along the street direction.
- Building labels: white 13 px 500 with a halo, plus a small white callout pill on selection (R10). Example: "Alder Court · 8 units".
- Places (park, creek, station): 12 px italic white with a halo.
- Road overlay on the satellite imagery: major road `rgba(255,236,170,.55)` 2 px, minor streets `rgba(255,255,255,.35)` 1 px. A "Labels" toggle hides the whole layer.

### 5.4 Pins (one family, every map)

| Household state | Marker |
|---|---|
| Open, critical (top 10 by `priority.rank`) | R09-style **red teardrop pin**, 28 × 38 px, white disc holding the rank numeral, darker red stroke, soft elliptical ground shadow, slow 2.4 s breathe on the shadow only |
| Open, waiting | Orange teardrop, 22 × 30 px, numeral if ranked |
| Needs help | Red circle 22 px with a white exclamation |
| Found OK | Green circle 18 px with a white check |
| Assisted | Blue circle 18 px with a white shield-check |
| No sensor | Grey circle 18 px with a white question mark |
| Selected | Pin scales 1.15× and gets a 3 px white ring plus a blue `--focus` outer ring |

Pins are DOM or sprite overlays (as Aryan already does). They stay upright on tilted views, never sink into roofs, and **cluster** into a count bubble when they overlap below the current zoom. Responder routes are solid blue lines with a white 1 px casing; the hazard radius is a dashed red ring with a "300 m" label.

### 5.5 Map controls (same cluster on every map)

Bottom-right, stacked, R06/R10 style, in `--mat-map`:
- Recenter on Cedar Hollow
- **2D / 3D** toggle (3D only where the screen supports it)
- Zoom − / +
- Compass: a round glass button with a red north needle; click resets bearing and tilt
- **Layers** button: popover with `Satellite` / `Map` (Map = Aryan's current light site-plan palette, kept as the alternative base), plus toggles: Labels, Routes, Hazard radius, No-sensor homes

Bottom-left: a **scale bar** (metric) like USGS and R06, and the attribution line **"Simulated imagery · Cedar Hollow is fictional"** in 11 px white with a halo. Top-left of the map: filter chips (R10): All, Critical, Needs help, Silent > 10 min, Fire.

### 5.6 Where the map system applies

| Surface | Camera | Notes |
|---|---|---|
| Main 3D (5180) | Tilt 50°, R10-style | Satellite paint on the ground plane **and** on roofs (top faces of Aryan's extruded buildings use the roof texture for their footprint). Walls stay matte with window rows, slightly darkened toward the ground. Keep the white-panel layout exactly as Aryan has it. |
| Houses (5182) | Tilt 42°, wider zoom (R07 palette) | Plus R02's tilt-shift depth of field and frosted card (section 6.3) |
| Live map (5183) | Top-down (R06) | List-beside-map like USGS |
| Overview mini map (5181) | Top-down, building-level zoom | Static crop of `cedar-hollow.webp` with pins |
| Analytics (5185) | Top-down, dimmed | Imagery at 55% under a white 45% scrim with a zone choropleth on top |
| No-WebGL fallback (`FlatMap.tsx`) | Top-down | Uses the static WebP so it still looks like satellite |

---

## 6. Screen by screen

Design at **1440×900** first, then check 1920×1080 and 1280×800.

### 6.1 Main (5180): 3D Cedar Hollow → `ui/command/*`

Keep Aryan's layout. It's already right: incident summary top-left, HPI analysis, dispatch queue, map with legend, command dock bottom-right, toast top-right. Changes:
- Satellite ground and roofs (section 5). Labels become the hybrid label layer.
- Building labels become R10 callout pills: white glass, name in 13/600, "8 units · 3 fl · 1962" in `--label-3`, plus a status tag ("Fire") in the status tint.
- Pins become the section 5.4 family. The map control cluster (5.5) replaces the current compass-only control. Move the "Drag to pan…" hint into the scale-bar row as a footnote.
- **Incident summary** becomes a USWDS-style alert card: red left edge, "Fire + Earthquake", "Confirmed 04:49:00 · 10 min ago", then the hero number "28 of 40 households accounted for" and the segmented status bar.
- **Dispatch queue**: Aryan's rows, plus a 4-segment ladder bar labeled with the current step ("Responder dispatched (simulated)").
- **Command dock** keeps R01's composition (four KPI columns over an "Ask…" field with chips), restyled white. The dock is a command parser and search, **not AI**. Never call it AI.
- From R01: responder routes animate as a thin moving dash along the blue line (R01's "comet" idea, made calm).

### 6.2 Building view (5184): R01 drill → `ui/py/Drill.tsx`

Re-create R01's drill structure on white:
- The focus element on the left is the building's satellite roof crop in a circle, wrapped in a **waveform ring** driven by live heartbeat activity. More silence means a flatter ring, which makes "silence is a signal" literal.
- Category cards: Needs help, Open, Power clock, Silent, Found, No sensor. Each shows a count, a caption and a status-colored left tick. The selected card gets a 2 px black border.
- The fan of curves (thin grey, the selected category's curves in its status color) leads to a semicircle of household rows: name 15/600, unit, HPI number, 4-segment ladder bar. The list fades at both ends.
- Right: the shared inspector.

### 6.3 Houses (5182): R02 + R07 → `ui/houses/*`

The calm, wall-screen view.
- The satellite base at regional zoom, tilted 42° (`transform: perspective(1400px) rotateX(42deg)` on the ground layer). Add R02's tilt-shift: sharp middle band, blurred top and bottom (masked `filter: blur()` layers).
- Houses are the pin family from 5.4, rendered upright in an untransformed overlay through a `project(x, y)` helper built on `DOMMatrix`, so text stays crisp and hit targets are correct. The 2D toggle animates `rotateX` to 0 over 600 ms.
- The **frosted card** (R02), top-left: white glass at 70% with heavy blur that picks up the imagery colors. "Cedar Hollow" in 24/300, "Homes accounted for", a **96 px weight-200 % numeral**, and "*N* of 40 · *M* still waiting". A key card sits bottom-left.
- Low saturation, no pulsing except the urgent pin's breathe, large type.

### 6.4 Overview (5181): R03 → `ui/overview/*`

Convert R03's dark fleet app to the light system while keeping its anatomy:
- Icon rail (same icons as the switcher; the active item is a black circle with a white icon). Stat pills, ⌘K search, breadcrumb and a 40 px title with a status chip. Underline tabs with counts: Units, Live, Escalations, Alerts.
- **Units tab**: the building as a cutaway elevation (R03's truck becomes the building). Floors are stacked and each unit is a dashed cell with its name, unit number and status chip.
- **Live tab**: a satellite mini map (5.6) of the building's homes, plus a selected-household card with R03's two gauges, both light: a **backup-power gauge** with a liquid fill (minutes left from `priority.tthMin`) and a **silence arc gauge** (`priority.minutesSilent`, green→orange→red bands). Add a striped ladder progress bar with a countdown and switches for "Show responders" and "Show silent homes".
- **Waiting list**: expandable rows. The expanded row shows ladder step, rank, check-in, HPI bar, minutes silent, last signal, and an **amber USWDS-style warning** for the most urgent factor ("166 min of oxygen backup left. Bring a battery or generator."). Actions: View on map, Found OK, Assisted, each with Undo.
- R03's lime accent is **dropped**. The one primary action ("Next to reach") is the black pill.

### 6.5 Live map (5183): R06 + USGS pattern → `ui/MapCanvas.tsx`

- Left: a 360 px list panel, USGS style. Its header is "15 open households" with sort ("Rank" / "Silent longest") and a "Only list homes in view" checkbox. Rows are the shared household row.
- Right: the top-down satellite map with the full control cluster, scale bar, filter chips and attribution.
- Selecting a row flies the map to the pin (700 ms) and opens an **R06-style place card** over the map: a header crop of the satellite roof, the name, unit and status chip, then HPI and reason, then the actions.

### 6.6 Analytics (5185): R04 + R05 → `ui/Analytics.tsx`

- Background: dimmed satellite (5.6) with a zone choropleth shaded by the share still unaccounted. Floating white cards over it, as in R04.
- **KPI comparison tiles** (R05): Accounted, Median time to found, High-need found first (%), Ladder steps saved (simulated). Each has a big number with a rule under it and "At incident start: …" below.
- **Found curve** (R05's "previous vs current" two-line chart): Headcount vs. the first-come-first-served baseline, labeled **Simulated**.
- **Bubble matrix** (R04): buildings × status, circles sized by household count with the count printed inside.
- **Radar** (R04): the selected household's factor values E S C V K L M **exactly as stored in `priority`**, against the building median. Label it "Factor breakdown (from the priority table)". Never compute or re-weight.
- **Treemap** (R05): open households by building, sized by count and colored by the highest status inside.
- **Ladder funnel**: Check-in → Contact → Knock → Responder → Found or Assisted, from `escalation` and `finalState`.
- **Side panel** (R04's assistant panel pattern) holds the command dock's results and suggested chips ("Who's next?", "Silent > 10 min", "Fast-forward 10"). Every card comes from `view` data. **Not AI. No fake chat. No invented insights.**
- Charts follow the status palette for status series and `--label` / `--label-3` for neutral series. Every chart supports hover and keyboard scrubbing with an `aria-live` readout.

### 6.7 Shared pieces

- **Household inspector**:
  - Header: kicker with building and unit, name in `--t-title`, status chip.
  - Priority section: HPI as a large number, the band chip, the **reason** sentence, and factors E S C V K L M as labeled mini bars.
  - Tiles: ladder step with countdown, backup minutes (red under 30), minutes silent, check-in state.
  - Actions: Found OK, Needs help and Assisted, each with Undo. Override opens a sheet that requires a reason; overrides are logged.
  - "Simulated 911 hand-off" label at ladder step 4.
- **Alerts and toasts**: the section 4 alert pattern. At most 2 toasts; they never cover a primary action or the map controls.
- **Event log**: a USWDS-style table with sticky header, time (mono), severity glyph and status-colored tag, household, message. Rows are grouped by minute; clicking a row selects its household.
- **Demo control** ("New Simulation"): a popover with Quake, Fire, Power loss, Fast-forward and Reset, each labeled **Simulated**.
- **Connection chip**: "Local" / "Live" / "Reconnecting…" with a status dot.

---

## 7. Defining moments (restraint)

1. **"Everyone found."** When `view.counts.accounted === view.counts.total` while `view.disasterActive` is true, do this once:
   - The camera eases to the full-town view.
   - Every pin settles to green.
   - The accounted number springs to 100%.
   - A centered white card appears in 56/600: **"Everyone found."**, with the caption "40 of 40 homes accounted for in *N* min (simulated)".
   - It stays 4 s, then shrinks to a persistent green chip in the incident card.
   - No confetti. With reduced motion it's a static card.
2. **First confirmed quake**: the hazard ring draws outward from the epicenter over 800 ms, then pins update with a 30 ms stagger outward from the epicenter.
3. **Mark Found OK**: the pin crossfades to the green check, the counter ticks up, and an Undo toast appears.

---

## 8. States every screen must handle

| State | Requirement |
|---|---|
| All clear | Calm, readable. "Monitoring *N* homes". No empty voids. |
| Incident | The full design. The most urgent item is visually first. |
| Selection | Inspector open, context dimmed. Esc closes. |
| Empty list | A one-liner with an icon: "Everyone in Alder Court is accounted for." |
| Loading | Skeleton (respect reduced motion), connection chip "Connecting…". The satellite texture shows a neutral `#5d6046` ground until it's painted. |
| Offline / error | Red chip "Reconnecting…". Last data stays visible, dimmed 20%, with "Last update *t* ago". Errors are plain-sentence alerts. |
| No WebGL | `FlatMap.tsx` with the static satellite WebP. Nothing else changes. |
| Narrow (1280 / 1024) | Panels collapse into sheets. Nothing overlaps. No horizontal scroll. |

---

## 9. Accessibility (non-negotiable)

- Text contrast at least 4.5:1 (3:1 for 24 px and up). Use the status **ink** colors for text, never the fills. Map labels are white with a halo over imagery: check them over the lightest roofs.
- Focus ring `outline: 3px solid rgba(0,113,227,.6); outline-offset: 2px` on everything interactive, pins included (`tabIndex=0`, Enter selects, arrows step between pins in rank order).
- Keyboard: Tab order follows the visual order, ⌘K searches, Esc closes, + / − zoom the map, R recenters.
- Screen readers: `aria-label` on canvases and pins ("Mrs. Alvarez, Alder Court 1A, open, critical, rank 1, HPI 79, oxygen concentrator…"), plus an `aria-live` polite region for count changes. The map has a "View as list" link, the USGS pattern.
- Status is always a glyph and a word as well as a color.
- Respect `prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast: more`.

---

## 10. Process

1. **Plan (15 min).** Write 10-15 lines covering the token file, the satellite paint approach and the order of screens, and send it to me before coding.
2. **Foundation (≤ 45 min).** `theme/tokens.css`, fonts, buttons, chips, alert, switches, segmented control, inspector shell, focus ring. Migrate `styles.css`, `py.css`, `command.css`, `overview.css` and `houses.css` to the tokens.
3. **Map system (≤ 75 min).** Satellite paint in `sitePlan.ts`, the static WebP export, the label layer, the pin family and the control cluster. Do it once and reuse it everywhere.
4. **Screens, in order and timeboxed**: Main 3D (45 min), Houses (40), Live map (40), Overview (45), Building view (30), Analytics and log (45), defining moments (20).
5. **For every screen:**
   - Take a before screenshot at 1440×900 in **all clear** (`sim_reset`) and in **incident** (quake + fire + power loss; the commands are in the handoff).
   - Build.
   - Take after screenshots and put each next to its reference. List **5 differences** and fix them. Repeat at least twice.
   - Run `npx tsc --noEmit -p .` and walk the judge path. One screen per commit.
6. **The cohesion audit** (section 4, item 10) before the PR.
7. **The judge path**, rehearsed after every screen:
   1. Open 5180.
   2. New Simulation → Quake.
   3. Watch the hazard ring and pins.
   4. Click the rank-1 pin and read the reason.
   5. Mark Found OK, Undo, mark it again.
   6. Open the Building view.
   7. Go to Houses.
   8. Go to the Overview, "Next to reach".
   9. Open the Live map and fly to a household.
   10. Open Analytics.
   11. Fast-forward until "Everyone found."

---

## 11. Guardrails (from AGENTS.md; breaking these loses the hackathon)

- **Clients never compute priority.** Display `priority.hpi`, `band`, `rank`, `reason` and the factors exactly as given. Sort only by `rank` or `hpi`.
- **Synthetic data only.** Cedar Hollow, its imagery and every household are fictional. Keep every "Simulated" label: the 911 hand-off, the responder routes, the imagery attribution.
- **Need-based ranking only.** No income, race, immigration status or insurance value on any view.
- **No real places and no map services.** No real satellite tiles, no Google or other map APIs, logos or attribution, no real addresses or coordinates.
- **No impersonation.** No government seals, flags, "official website" banners or agency names. Government sites are a tone reference only.
- **No Apple trademarks or assets.** No Apple logo, no SF font files, no SF Symbols artwork.
- **No copying from the references.** No logos, product names, credits, copy or artwork from any of R01-R10.
- **Don't touch**:
  - `spacetimedb/`
  - `monitor/src/data/*`
  - `monitor/local-bridge.ts`, `vite.config.ts`, `scripts/dashboards.mjs`, `dashboards.json`
  - `monitor/src/cbre/` and port 5186: out of scope for this pass. Leave them as they are.
- **Don't commit** the reference files, `.env*` files or tokens. Don't push to `main`.
- **Assets**: total new assets under 6 MB (`du -sh monitor/src/assets`).
- **Update the README** "Screens and deep links" paragraph and the Status table if what a screen does changes.

## 12. Definition of done

- [ ] `theme/tokens.css` is the single source for type, color, materials, radii, spacing and motion. No stray hex values in components except the satellite paint palette in `sitePlan.ts`.
- [ ] Every map surface uses the same fictional satellite base, pin family, label layer and control cluster.
- [ ] The cohesion grid (`docs/screenshots/cohesion-grid.jpg`) reads as one product.
- [ ] Every screen passes the judge path with no console errors, in all clear and incident, at 1440×900 and 1920×1080.
- [ ] All ten references are used where the table says. Nothing is copied from any of them.
- [ ] Every write action has feedback and Undo. Every score has its reason one click away.
- [ ] Reduced motion, reduced transparency, keyboard-only and screen-reader passes are done.
- [ ] Typecheck is clean, the README is updated, commits are one screen each on `design/cohesive`, and the PR is open.
