# Prompt: Apple-grade design pass for every Headcount dashboard

Paste everything below the line into the model doing the design work. Attach the six reference files yourself. They live in the repo root, are **not** committed, and must stay that way:

| File | What it is | Drives |
|---|---|---|
| `python.mp4` | Policy-platform network graph | Main graph, Building view, header, dock |
| `DASHBOARD EXAMPLEE.webp` | Tilted terrain map with a frosted card | Houses |
| `DASHBOARD EXMPLEEE.mp4` | Fleet logistics app | Overview (the "regular" dashboard) |
| `DASHBOARD EXAMPLE.webp` | Staking finance dashboard | CBRE (primary) |
| `executive-dash2.png.webp` | Executive KPI overview | CBRE executive layer: KPI comparison tiles, treemap, combo chart |
| `ai-dashboard-design.jpg` | Analytics workspace with an assistant panel | Analytics, plus the assistant side panel pattern |

This prompt replaces `graphics-revamp.md` as the main design brief. It goes further on detail, adds Apple's design language as the system underneath every screen, and applies Apple's Human Interface Guidelines design principles to this product.

---

## 0. Who you are and what you're doing

You're the lead product designer **and** the front-end engineer for **Headcount**, a HackUTD 2026 project.

What Headcount does:
- A plug-in home sensor plus a live dispatch system for disaster response.
- After an earthquake, fire or power loss, it keeps a running count of who has been **found**.
- It ranks every household by need with the Headcount Priority Index (HPI).
- It escalates the cheapest way first until nobody is left unaccounted for.
- Tagline: **"Everyone found."** Core idea: **silence is a signal**.

Your job is a **complete, intricate visual and interaction design pass** across every dashboard, implemented in the real code:

1. **Apple's design language is the system underneath every screen.** That means type, spacing, materials, controls, motion, restraint and accessibility. Study apple.com and Apple's Human Interface Guidelines. Section 3 gives you values I measured from apple.com's live CSS today.
2. **Each screen draws its signature visuals from its own reference.** Take heavy inspiration, but **don't** copy them exactly: no copied layouts pixel for pixel, no copied text, logos, brand names or artwork.

In one line: **Apple supplies the structure, the references supply each screen's mood.** Apple decides how things are built, sized, spaced, labeled and animated. The reference decides what the screen *feels* like.

Deadline: final submission is **Sun Nov 8, 12 PM CT**. Judging runs 1-4 PM.
- Every commit must leave every screen working.
- Freeze features at **10 AM** and only polish after that.
- A smaller thing that's finished beats a bigger thing that's half-built.

---

## 1. Read before touching anything

1. `AGENTS.md`: hard rules for this repo. They override anything in this prompt.
2. `docs/GRAPHICS_HANDOFF.md`, which covers:
   - how to run every dashboard (`npm run dashboards`, ports 5180-5186)
   - the data contract (`useHeadcount()`, `useView()`, `actions`)
   - what each screen must still do
   - which files you must not touch
3. Branch `design/main-dashboard` (Aryan's work in progress): rendered orb PNGs in `monitor/src/assets/orbs/`, light beams and a spotlight background on the main graph.
   - **Build on it. Don't redo it.**
   - Create `design/apple-grade` from `origin/design/main-dashboard`, rebased or merged onto `origin/main`. Both merge cleanly as of this writing.
   - Never push to `main`. Open a PR when a screen is done.
4. Look at all four references frame by frame **before** you plan. Six references in total (table at the top). For the videos, extract frames at 1 fps (e.g. `ffmpeg -i python.mp4 -vf fps=1 /tmp/py_%02d.jpg`) and study them.

---

## 2. Apple's design principles, applied to Headcount

Source: Apple Human Interface Guidelines, "Design principles". Read the original. Below is our paraphrase plus what each principle means **for this product**. Use these as the tiebreaker when two design choices compete.

| Principle | What it asks | What it means here |
|---|---|---|
| **Purpose** | Make something meaningful; focus on what matters most. | Every screen answers **one** question (table below). Anything that doesn't serve it gets demoted or cut. |
| **Agency** | Let people act their own way, keep them informed, make mistakes recoverable. | Every write action (Found OK, Needs help, Assisted, Override) shows clear feedback and offers **Undo** for 6 s by calling `actions.setFinalState(id, <previous state>, 'Undo')`. No modal traps: Esc always closes, ⌘K always reaches search. |
| **Responsibility** | Act in people's best interest, be transparent, protect privacy. | Every score shows **why** (`priority.reason` is reachable in one click). Simulated things are labeled **Simulated**, including the 911 hand-off. CBRE money is labeled **Synthetic**. Never rank or color by income, race, immigration status or insurance value. |
| **Familiarity** | Build on patterns people already know. | Use Apple patterns people recognize: macOS sidebar, toolbar, inspector panel, segmented control, search field, popover, iOS switch, Maps pins and callouts, Stocks-style chart scrubbing, Notification Center grouped lists. |
| **Flexibility** | Adapt to contexts, inputs and abilities. | Projector (1920×1080), laptop (1440×900, the primary target), 1280 px, iPad (1024). Keyboard-first. Respect `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast` and `prefers-color-scheme`. Color never carries meaning alone. |
| **Simplicity** | Include only what's necessary; be concise; establish hierarchy. | One primary action per view. Labels of three words or fewer. Numbers before prose. Clear type hierarchy: one display number, one title, secondary text, then captions. |
| **Craft** | Care about every detail. | Concentric corner radii, optical alignment, tabular numbers, hairline separators, consistent icon stroke, no layout shift on hover, 60 fps, and real empty, loading, error and offline states (section 7). |
| **Delight** | Make it human; create defining moments; delight is not decoration. | **The defining moment:** when the accounted count reaches 100% during an incident, the product says **"Everyone found."** (section 6). Otherwise the emotion is **calm competence under pressure**. Nothing flashy competes with the data. |

**The one question each screen answers:**

| Screen | Port | Question |
|---|---|---|
| Network graph (main) | 5180 | Where is need concentrated right now? |
| Overview | 5181 | What do I do next in this building? |
| Houses | 5182 | Which homes are OK, and which aren't? (glanceable, calm, wall-screen friendly) |
| Live map | 5183 | Where do responders go? |
| Building view | 5184 | Who in this building still needs reaching? |
| Analytics | 5185 | Are we finding people faster than the baseline? |
| CBRE | 5186 | What will this cost, and what do we fix first? |

---

## 3. Apple foundation layer (shared by every screen)

Put all of this in **one** new file, `monitor/src/theme/tokens.css`, imported first in `main.tsx`.
- Each screen may add an accent layer on top (section 4).
- Each screen may **not** redefine the foundation tokens.

### 3.1 Typography

Apple's web type is SF Pro, but SF Pro's license doesn't allow redistributing it, so **never add SF font files to the repo**. Use the system stack instead. It renders real SF on every Mac and iPhone, which is what the judges will see:

```css
--font-text: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter Variable", "Helvetica Neue", Arial, sans-serif;
--font-display: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter Variable", "Helvetica Neue", Arial, sans-serif;
--font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
```

Fonts:
- Bundle `@fontsource-variable/inter` as the non-Apple fallback for the Pi browser and Android phones. Keep everything offline; venue Wi-Fi is unreliable.
- **Roboto Condensed** stays, but only for graph and canvas labels on the main and building views. It's part of the python.mp4 mood. Never use it for UI chrome.
- For numbers, prefer `font-variant-numeric: tabular-nums` on the SF stack over monospace. Apple shows numbers in SF with tabular figures. Use mono only for timestamps and IDs.

**Type scale** (measured from apple.com's CSS, `main.built.css`, Nov 8). Line-heights and tracking are Apple's:

| Token | Size / line-height / weight / tracking | Use |
|---|---|---|
| `--t-hero` | 56px / 1.07 / 600 / -0.005em | One per screen max: the CBRE exposure figure, the Houses % |
| `--t-headline` | 48px / 1.083 / 600 / -0.002em (40px below 1068px) | Screen titles on Overview and CBRE |
| `--t-title` | 28px / 1.14 / 600 / 0.007em | Panel titles, the selected household name |
| `--t-callout` | 19px / 1.21 / 400 / 0.012em | Subheads under titles |
| `--t-body` | 17px / 1.47 / 400 / -0.022em | Body text, list rows |
| `--t-subhead` | 15px / 1.33 / 400 / -0.016em | Secondary rows |
| `--t-footnote` | 13px / 1.38 / 400 / -0.008em | Metadata |
| `--t-caption` | 12px / 1.33 / 400 / 0em | Badges, axis labels. **Nothing below 11px. Ever.** |

Apple's large numerals are **semibold 600, not thin**. The exception is the Houses screen (the terrain reference): its frosted cards use weight 200 numerals. That is the one deliberate exception, scoped to `.hs-*`.

Use `rem` units so browser zoom works. This stands in for Dynamic Type.

### 3.2 Color

**Interface neutrals.** Apple dark grouped style for the dark screens, apple.com light for any light surface:

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#000000` | `#f5f5f7` |
| `--surface-1` (cards) | `#1c1c1e` | `#ffffff` |
| `--surface-2` (inset / grouped rows) | `#2c2c2e` | `#f5f5f7` |
| `--surface-3` (controls) | `#3a3a3c` | `#e8e8ed` |
| `--label` | `#ffffff` | `#1d1d1f` |
| `--label-2` | `rgba(235,235,245,.60)` | `#6e6e73` |
| `--label-3` | `rgba(235,235,245,.30)` | `#86868b` |
| `--separator` | `rgba(84,84,88,.65)` | `#d2d2d7` |
| `--link` | `#2997ff` | `#0066cc` |
| `--action` (Apple primary button) | `#0071e3` | `#0071e3` |

**Status colors** come from Apple's published system palette. Check the values against the HIG Color page. These are **semantic and identical on every screen**: consistency is a Familiarity requirement. Each status always comes with a glyph, so color never carries meaning alone.

| Headcount status | Color role | Dark | Light | Glyph |
|---|---|---|---|---|
| Critical / urgent | systemRed | `#FF453A` | `#FF3B30` | exclamation in a triangle |
| High | systemOrange | `#FF9F0A` | `#FF9500` | up arrow |
| Guarded | systemYellow | `#FFD60A` | `#FFCC00` | clock |
| Low / monitoring | systemMint | `#63E6E2` | `#00C7BE` | dot |
| Needs help (resident pressed HELP) | systemPink | `#FF375F` | `#FF2D55` | raised hand |
| Found OK | systemGreen | `#30D158` | `#34C759` | checkmark |
| Assisted | systemBlue | `#0A84FF` | `#007AFF` | cross in a shield |
| Unknown / no sensor | systemGray | `#8E8E93` | `#8E8E93` | question mark |
| Fire | systemOrange + flame glyph | `#FF9F0A` | `#FF9500` | flame |

**Screen accents** come from each reference. Use them for brand marks, the primary action, selection and data highlights. **Never use an accent for status.**

| Screen | Accent | Notes |
|---|---|---|
| Main graph / building view | champagne gold `#E8C98A` plus deep teal `#0B1F1E` | python.mp4 |
| Houses | natural greens and slate water | terrain reference, desaturated |
| Overview | lime `#E4F46B` | Haulix. Exactly **one** lime button per view. |
| CBRE | lavender `#B6A6FF` and violet `#8F7CF0` | staking reference |
| Analytics | indigo `#7C6CF2` + cyan `#5FD3E6` | analytics-workspace and executive references |
| Map / log | Apple blue `#0A84FF` | neutral Apple default |

### 3.3 Materials (Apple glass, done properly)

apple.com's global nav, measured: `height: 44px` (48px below 834px), `background: rgba(22,22,23,.8)` dark or `rgba(250,250,252,.8)` light, `backdrop-filter: saturate(180%) blur(20px)`, with an opaque fallback at `.88` / `.92`.

Three material levels. Don't put glass on glass.

| Material | Recipe (dark) | Used for |
|---|---|---|
| `--mat-chrome` (thin) | `rgba(22,22,23,.72)`, `saturate(180%) blur(20px)`, bottom hairline `rgba(255,255,255,.08)` | Top bar, floating toolbars, the command dock |
| `--mat-panel` (regular) | `rgba(28,28,30,.78)`, `saturate(180%) blur(28px)`, 0.5px inner border `rgba(255,255,255,.10)`, top inner highlight `inset 0 1px 0 rgba(255,255,255,.06)`, shadow `0 18px 50px rgba(0,0,0,.45)` | Inspector and detail panels, popovers, toasts |
| `--surface-1` (solid) | no blur | Cards that sit on another surface |

Floating controls (zoom, layers, compass, map tools) use a "Liquid Glass" capsule:
- `--mat-chrome` plus a soft specular gradient (`linear-gradient(180deg, rgba(255,255,255,.10), transparent 40%)`) and a 1px rim of `rgba(255,255,255,.14)`.
- Pressed state: `transform: scale(.96)`, 120 ms.

`@media (prefers-reduced-transparency: reduce)`: every material becomes its opaque fallback. Required.

### 3.4 Shape, spacing, hit targets

- **Spacing**: a 4-pt base with steps of 4, 8, 12, 16, 20, 24, 32, 44, 64. Screen side margins are 24 px, or 32 px at 1440 and above.
- **Concentric radii**: the inner radius equals the outer radius minus the padding. Panels are 22 px. Cards inside a panel with 12 px padding are 10 px. Controls are 10-12 px.
- **Pill buttons** (apple.com): `border-radius: 980px`, 17 px text, padding 12 × 22. Three kinds:
  - **Primary**: filled with the accent, or Apple blue on neutral screens.
  - **Secondary**: a 1px outline in the accent.
  - **Tertiary**: a text link with a chevron, e.g. "Full record ›".
- **Hit targets**: at least **44×44 px** for anything clickable, graph nodes included. Pad the hit area invisibly.
- **Separators**: 0.5 px on 2× displays (`border-width: .5px`), falling back to 1 px.

### 3.5 Iconography

SF Symbols can't be used outside Apple platforms, so draw **SF-Symbols-like** icons in `ui/Icon.tsx` instead of adding an icon font:
- a 24-unit grid with optical centering
- 1.6 stroke, round caps and round joins
- filled variants for selected states

Every icon-only button needs an `aria-label` and a tooltip that appears after 500 ms.

### 3.6 Motion

- **Panels** (inspector, sheets): 380 ms, `cubic-bezier(.32,.72,0,1)`, an iOS-sheet-like curve. Slide 24 px plus fade.
- **Micro-interactions**: hover 150 ms, press 120 ms `scale(.97)`, toggle 220 ms.
- **Data changes**: numbers **count** to the new value over 400 ms with tabular figures, so nothing jitters. The rank list reorders with a FLIP animation over 300 ms.
- **Shared-element continuity**: clicking a household orb grows a highlight ring that becomes the edge of the inspector panel, so the eye follows the object.
- **Ambient motion** (sparks on beams, dashed routes) stays subtle and slow: 1.2-4 s loops, opacity at most 0.9.
- `prefers-reduced-motion`: no movement, only crossfades of 150 ms or less. Ambient loops stop.

---

## 4. Screen by screen

For each screen there are three parts:
- **Observed**: what the reference actually does.
- **Take / Transform / Leave**: what to borrow, how to change it, and what never to copy.
- **Headcount spec**: what to build.

Design at **1440×900** first, then check 1920×1080 and 1280×800.

### 4.1 Network graph (main): `python.mp4` → `ui/py/Graph.tsx`, `Orb.tsx`, `Header.tsx`, `TimeRail.tsx`, `Legend.tsx`, `Analysis.tsx`, `CommandDock`

**Observed in the reference (frame by frame):**
- **Background**: near-black deep teal (about `#06100f` to `#0d1f1d`) with a soft spotlight behind the center, a heavy vignette toward black at the edges, and very fine grain.
- **Center node**: a golden "sun". A warm metallic sphere sits inside a ring of fine radial tick marks like a watch bezel, with a thin outer halo and gold dust scattered around it. It's labeled in **condensed bold white** ("Constitution") with a small **parallelogram tag** below ("47%") in dark glass.
- **Hub nodes**: glossy pink-rose spheres inside a light bezel ring, each with a condensed label and a parallelogram % tag.
- **Secondary nodes**: glossy **violet** spheres, slightly larger than hubs' children. **Mint-teal** small spheres with numbered badges. Tiny gold seed dots.
- **Number badges**: small rounded rectangles in deep violet with white numerals, attached to nodes at about 45°.
- **Links**, three kinds:
  - **Spindle beams** from the center: thick in the middle and tapering to points, warm champagne-gold with a soft bloom, occasionally pink-lavender.
  - **Thin cyan lines**.
  - **Dashed hairlines** for weak relations.
  - Some links end in **cyan light streaks** with motion blur, like comets.
- **Left time rail**: years stacked vertically in condensed type, an audio-waveform-like density trace along the far left edge, and the current year in a **gold-outlined pill** larger than the others.
- **Top toolbar**: centered segmented groups of square dark-teal icon tiles (layout toggle, zoom ±, filter with a small gold count badge, sort, AI). An outlined gold pill "+ New Simulation" on the right, plus theme, search and avatar.
- **Bottom-left legend**: a dark glass card with orb swatches, numbered counts and two summary rows.
- **Bottom-right composer**: a teal glass frame holding four KPI columns, a light rounded "Ask a question" field with a dark circular send button, and chips ("My agent", "+3", "RI Analysis").
- **Drill view**:
  - The focus orb on the left is violet glass inside a **waveform ring** made of radial strokes in violet and teal, inside a large faint disc.
  - A two-line condensed title with gold numerals.
  - Category cards: icon, big number, label, and a left accent tick. The selected card has a **gold border glow**.
  - A **fan of curves** from the selected card to a **semicircular column** of item labels. Each item has a GAPS tag and a tri-segment colored bar, and the list fades out at both ends.
  - A **right glass inspector**: kicker icon, two-line title, an "Active" chip, an "Explore details ›" button, a red-tinted metric card with a big % and a dot-matrix chart, and a 2×2 stat grid.

**Take**:
- the spotlight, grain and vignette atmosphere
- glossy bezel orbs (Aryan's PNGs: `sun`, `sun-corona`, `rose`, `violet`, `sky`, `slate`, `*-bare`)
- spindle beams with bloom, comet streaks and dashed hairlines
- condensed node labels with parallelogram tags
- the waveform-ring focus orb
- the fan-to-semicircle drill
- the gold-outlined active pill

**Transform**:
- **Chrome becomes Apple.** The top bar is `--mat-chrome` at 52 px with toolbar groups as Liquid Glass capsules: icons 18 px, buttons 36 px in a 44 px capsule, a 1px rim. The "+ New Simulation" pill is a secondary pill in gold.
- **The legend becomes an Apple popover-style card**, collapsible, using the SF stack.
- **The composer becomes the Headcount command dock.** The four KPI columns are Accounted, Open, Median time to found and Next power clock, with SF tabular numbers and Apple captions above. The input field is a light pill (`#f5f5f7` on dark at 0.92 opacity, `--label` dark text) with a circular send button. Below it are three chips: Dispatcher, *N* open, HPI Analysis.
- **The time rail shows scenario minutes**, not years. The current minute sits in the gold pill. The waveform is real `timeline` event density.
- **The drill inspector follows Apple's inspector**: grouped rounded sections, 28 px title, chips, a tertiary link "Full record ›".

**Leave**: the policy content, "Control AI" and "Constitution" text, their logo, the "fuselab creative" credit, their avatar.

**Headcount mapping** (keep exactly):
- Sun = the neighborhood. Its label is "Cedar Hollow" and its tag is the accounted %.
- Hubs = buildings.
- Orbs = households. Each orb's style shows its **status** (section 3.2). Ring brightness shows HPI.
- Rank badges appear on the top 10 open households, using the numerals from `priority.rank`. **Never compute rank.**
- Spindle beams go from the sun to buildings. Beam width shows the open count. Hot buildings (any critical) get the brighter beam.
- Comet sparks travel along links to households where a responder is dispatched (ladder step 4).
- Dashed teal hairlines connect households in ladder step 3 (neighbor knock) to the volunteer.

**States:**
- **All clear**: dim, slow ambient motion, beams at 30%, a "Monitoring 40 homes" caption.
- **Incident**: beams at full strength, a red pulse on critical orbs (1.6 s, 2 cycles, then steady), the Analysis card visible.
- **Selected**: other nodes drop to 35% opacity, and the selected node's links stay full.

### 4.2 Building view: also `python.mp4` (drill frames) → `ui/py/Drill.tsx`

- The focus orb shows the building, with the waveform ring driven by live heartbeat activity: more silence means a flatter ring. That makes "silence is a signal" literal.
- Category cards: Needs help, Open, Power clock, Silent, Found, Unknown. Each shows its count, Apple caption labels and a status-color left tick. The selected card gets the gold rim glow.
- The fan of curves leads to a semicircle of households. Each row shows the name (SF 15/600), unit, an HPI tag, and a 4-segment ladder bar in place of their tri-segment bar. The list fades at the ends.
- The right inspector is the household detail (shared with the graph).

### 4.3 Houses: `DASHBOARD EXAMPLEE.webp` (terrain plus frosted card) → `ui/houses/*`

**Observed:**
- A **3D-tilted terrain**: the camera is pitched about 40-50°, so the map recedes.
- **Tilt-shift depth of field**: sharp in the middle band, strongly blurred at the top and bottom.
- Rich desaturated greens on the land, grey-white rock with relief shading, dark slate-blue water.
- A **white main route line** with a soft edge.
- **Thick dashed white route segments** branching off.
- A small **orange waypoint**.
- Two **circular POI markers**, blue and pink, with dark glyphs.
- A **translucent grey puck** holding a white navigation arrowhead, inside a **dashed white radius circle**.
- A **frosted glass card** tilted in perspective to match the ground plane. It holds a title in light 300 weight, a subtitle with a "Next: …" line, a **huge thin numeral** ("87%") and a ↗ arrow button. The glass picks up the terrain colors through heavy blur.

**Take**: the camera tilt, tilt-shift depth of field, the muted natural palette, the white routes and dashed segments, the radius ring and puck, the frosted perspective card with thin numerals.

**Transform:**
- **Apple Maps familiarity.**
  - Houses are **annotations**: small 3D house glyphs with a status-colored roof, billboarded so they stay upright while the ground plane tilts.
  - Urgent homes get an Apple-Maps-style **pin balloon** above the house with the status glyph.
  - The selected house expands into a **callout card**: the frosted perspective card anchored to the house with a leader line.
- **Floating map controls**: a vertical Liquid Glass capsule on the right with zoom ±, a 2D/3D tilt toggle, a compass and layers.
- **Implementation of the tilt**:
  - Render the ground (terrain, roads, lots) in a container with `transform: perspective(1400px) rotateX(42deg)` and the depth-of-field masks.
  - Render houses and labels in a separate, untransformed overlay layer, placed by projecting world coordinates through the same matrix: write a `project(x, y)` helper using `DOMMatrix`.
  - This keeps text crisp and hit targets correct.
  - The 2D toggle animates `rotateX` to 0 over 600 ms.
- **Summary card** (top-left, frosted): "Cedar Hollow" in 24/300, "Homes accounted for", a **96 px weight-200** % numeral, and "*N* of 40 · *M* still waiting".
- **Key card** (bottom-left): house glyph swatches with counts.
- **Terrain**: generate a **fictional** terrain texture (no real place, no real map data). Use SVG `feTurbulence` relief plus hand-placed creek, park and lots, or a rendered 2048×1280 WebP under 600 KB. Keep roads white and calm.

**The emotion is calm.** This is the screen for a wall display, a neighbor or a judge's first glance:
- low saturation and no pulsing, except a single slow breathe on urgent pins
- large type and generous spacing

### 4.4 Overview (the "regular" dashboard): `DASHBOARD EXMPLEEE.mp4` (Haulix) → `ui/overview/*`

**Observed:**
- Near-black charcoal (about `#121212` and `#1a1a1a`) with a faint street-map pattern behind everything.
- A **vertical icon rail** in a rounded column: the brand mark on top, round icon buttons, and the **active one a white filled circle with a dark icon**. Help and settings sit at the bottom.
- **Top stat pills**: an icon, a muted label and a **bold value** ("Active: 6/10").
- A search pill with a `⌘K` keycap, a bell with an **orange "+8" badge**, and an avatar with name and role.
- A breadcrumb and a **big title** (about 30 px, 500) with a small status chip ("Idle", in blue).
- Outline pill action buttons and **one lime filled primary** ("Activate Route"), plus a "⋯" overflow.
- Underline **tabs** with count badges.
- The **Operations view**:
  - Filter pills with count badges ("All 10" active).
  - **iOS-style green switches** ("Show routes", "Show alerts").
  - A dark street map with truck markers, a compass widget with a red north needle, a vertical map-tool column, and a footnote ("Space + Drag to pan · Scroll to zoom", "Map updates every 3 minutes").
- A **vehicle card** over the map:
  - A header with a thumbnail, ID, status chip and close button.
  - A route row with a striped orange progress bar and %, and an ETA row.
  - Two gauge tiles: a **speed arc gauge** with a green→orange→red gradient, ticks and a needle; and a **fuel orb** with a liquid fill and wave.
  - An **amber warning bar** with an icon ("Required Break: 30 min").
- The **Cargo view**: the "Cargo Layout" card with capacity rows (value / max, % chip, striped bar) and a **truck render** with a glass cargo grid of **dashed cells**, each holding an ID, a copy icon and a priority chip (Critical red, High amber, Normal blue, Low grey).
- **Packages list**: items with a 3D container thumbnail, ID, description, mini chips ("1 800 lbs", "120 ft³", "◇ Fragile" in amber) and a priority chip at top right. The expanded item has a 2-column field grid, a risk-score bar with a chip, a metrics row, an **amber "Fragile" warning bar**, and two pill buttons.

**Take**: the rail, stat pills, ⌘K search, lime-primary discipline, underline tabs with counts, filter pills, iOS switches, gauges, striped capacity bars, dashed cells with chips, the expandable list item, and amber warning bars.

**Transform:**
- **Apple chrome**: the rail uses the macOS sidebar icon size of 20 px in 44 px circles. The title uses `--t-headline` at 40 px. Tabs use Apple's segmented-control styling.
- The **truck becomes the building**: render each building as a **cutaway elevation**, floors stacked, with a glass cell grid per floor. Each cell is a unit with its name, unit number and status chip.
- The **packages list becomes the Waiting list**. The container thumbnail becomes a small isometric house render. The expanded item shows ladder step, rank, check-in, an HPI bar with chip, minutes silent, last signal, and an **amber warning** for the most urgent factor ("166 min of oxygen backup left. Bring a battery or generator."). Actions: View on map, Found OK, Assisted, each with **Undo**.
- **Add a "Live" tab** (Haulix's Operations view) built only from existing data:
  - A mini map of the building's homes.
  - A selected-household card with a **backup-power gauge** (liquid fill like the fuel orb; minutes of battery left come from `priority.tthMin` / the power clock).
  - A **silence arc gauge** (`priority.minutesSilent`, with green→orange→red bands).
  - A **ladder progress bar** striped like the route bar, with a countdown to the next step.
  - Toggles for "Show responders" and "Show silent homes".
- **Lime is the only accent**, used once per view on the primary action ("Next to reach").

### 4.5 CBRE: `DASHBOARD EXAMPLE.webp` (staking finance) → `cbre/*`

**Observed:**
- Near-black (about `#09090c`) with **lavender** accents and a purple glow at the right.
- **Left sidebar**:
  - Brand with a selector chevron.
  - A two-option **segmented control** ("Staking | Stablecoin").
  - Nav items with icons, the active one on a lighter row; a "Beta" pill.
  - An "Active Staking 6" disclosure list of assets with colored icon tiles and amounts, the last row fading out.
  - An "Activate Super" upsell card at the bottom.
- **Top bar**: an avatar with handle and a "PRO" chip, a **lavender filled "Deposit" pill**, a bell with a count, a search field and a settings pill.
- **Hero**: a kicker ("Recommended coins for 24 hours") with a clock icon and a count chip, a big title (about 40 px, 400), dropdown filter pills, and **three asset cards**.
  - Each card: an icon tile, category and name, a ↗ circle button, a "Reward Rate" caption, a **big % with a smaller % sign**, and a delta chip with a colored dot.
  - Each card has a **sparkline** with a soft glow, point markers, a value tag ("+$2,956") and a **dashed baseline**. A negative card goes red.
- **Promo card**: a tall card with a dark-to-violet vertical gradient, a starfield of tiny dots, a diagonal light streak, a "New" chip, a large title, copy, a **lavender filled button** and an outline button.
- **"Your active stakings" panel**: a **dotted-grid background**, icon actions at top right, "Last Update ~ 45 minutes ago" with a clock, and a title with a colored icon chip, link and share buttons and a "View Profile ↗" pill.
- **A giant number whose trailing digits are dimmer** ("31.39686"), with "Upgrade" (lavender filled) and "Unstake" (outline) pills.
- **"Investment Period" card**: a tick-mark slider with a **pause-glyph knob** and a value tooltip.
- An accordion row of four headers with sublabels and ⌃⌄ glyphs, then stat tiles with a "24H" chip.
- A "Reward Rate" tile with two **mini slider rows** ("2.23% 24H Ago", "1.46% 48H Ago").

**Take**: the sidebar architecture, segmented control, asset-card anatomy, glow sparklines with point tags and dashed baselines, the promo card gradient and starfield, the dotted-grid panel, the giant number with dimmed trailing digits, the tick slider with knob and tooltip, the accordion tabs and the stat tiles with period chips.

**Transform**, toward Apple Card, Stocks and Wallet:
- **Numbers are the hero.** Money uses SF tabular numbers: `$298,600` in full on hero figures, compact `$298.6K` only in dense tables. On the giant revenue-at-risk number, the cents or last 3 digits are **dimmed** (reference trick) at 50% `--label`.
- **Stocks-style chart scrubbing** on every chart (sparklines and cash-flow-at-risk):
  - hover or drag shows a vertical hairline, a dot on the line and a readout pill with time and value
  - arrow keys step through points
  - the readout also goes to an `aria-live` region
- **Asset cards → "Top buildings at risk"**: an icon tile with the building initial, kind and name, the failure-probability %, a delta chip ("+$128.6K since start" with an up-arrow glyph), and an exposure sparkline.
- **Promo card → "Portfolio exposure"**: lavender gradient, a 56 px total, "revenue · repairs" split, primary "Open dispatch console", secondary "Compare buildings".
- **Investment-period slider → "Horizon" slider** (24 h to 10 days) with the pause knob. It drives every money figure live.
- **Financial impact section** (already built; restyle it to this language):
  - **KPI tiles**: Gross loss, Insured recovery, Retained loss, NOI impact.
  - **Cash-flow-at-risk chart**: a glow line for gross, a dashed white line for retained, and a shaded band marking "rent cover starts · 72h".
  - **Loss bridge** waterfall.
  - **Allocation bar** with a legend.
  - **All-buildings table** in Apple's table style: hairline rows, sticky header, right-aligned tabular numbers, and a row-hover action "Open in dispatch ›".
- **Executive layer** (from `executive-dash2.png.webp`). Observed:
  - A navy-charcoal canvas, a left list of dashboards, a top text-tab nav, and a filter row of labelled dropdowns ("Date range / This year ⌄").
  - A row of **six KPI tiles**. Each has a centered title, a **huge bold number with an underline rule**, then a "previous period" value with its label, and chevron arrows to page through comparisons.
  - Charts:
    - a **combo chart**: violet bars plus a cyan line on dual axes, "click & drag to zoom in"
    - a **waterfall** in cyan, green and violet
    - a bubble map
    - a **treemap** of cyan and violet tiles labelled "Name (n)"
    - a multi-line chart
    - a **sankey**
    - a "previous vs current" two-line chart
  - Take:
    - the **KPI comparison tile**, with the comparison as "at start of incident" or "previous horizon" instead of "previous period"
    - the **treemap** of retained loss: building tiles subdivided by system, sized by dollars and colored by lavender intensity, with Apple caption labels inside the tiles
    - the **drag-to-zoom** on the cash-flow chart
  - Transform the palette to lavender and violet. Leave its brand, sidebar content and e-commerce copy.
- **Light appearance (optional, only if time allows)**: CBRE is the one screen where an apple.com-style light mode makes sense for a finance audience:
  - `#f5f5f7` background, white cards, `#1d1d1f` text, lavender becomes `#6e5ce6`.
  - Trigger it with `prefers-color-scheme` plus a toggle in the top bar.
- Keep the **"Synthetic portfolio"** note and the fine print: "Estimates from a simple synthetic model … not a forecast for any real property".

### 4.6 Live map, Analytics, Event log: Apple neutral

There's no specific reference for these. Use the foundation with the Apple blue accent.
- **Live map**: Apple Maps dark. Muted roads, a `#1c1c1e` land tone and buildings in `#2c2c2e`. Houses use the same annotation family as the Houses screen in flat 2D. The ranked queue becomes an Apple inspector list: rank numeral, name, reason in `--label-2`, status chip, countdown. Layer toggles become a Liquid Glass popover.
- **Analytics** (`ai-dashboard-design.jpg` is its reference). Observed:
  - A dark navy-charcoal workspace (about `#15171c`). A **choropleth map fills the background**, with **cards floating over it** at about 92% opacity and 14 px radius.
  - A top bar: back arrow, breadcrumb title, edit and share pills, avatar. A view tab ("Overview ⋯ +"), a search chip with an active filter ("County: Alameda ×"), settings, and a "12 Widgets" pill.
  - **KPI cards**: title, a tune icon, a big number (32 px, 600) and a caption.
  - Charts:
    - **concentric radial charts** with a ring scale
    - a **radar chart** with two series (violet and orange) on an octagonal grid
    - a **bubble matrix**: rows × columns of circles sized by value, numerals inside, violet rings with teal dots for small values
  - A **legend card**: a segmented control (State | County | ZIP), checkboxes, a **range slider with a mini histogram** and a teal-to-green gradient track.
  - A **right assistant panel**:
    - a summary chip with history and a "Complex charts" suggestion card
    - a mini bubble chart with a "Use ✓" pill and pagination 1 2 3
    - a disclaimer line, "Suggested prompts" chips with "+3"
    - an **"Ask a question" composer** with a mic toggle and a circular send button
  - Indigo and violet with cyan and teal, on a deep purple backdrop glow.

  Headcount Analytics, built from the same grammar:
  - **Background**: the Cedar Hollow map as a low-contrast **choropleth by zone**, shaded by the share still unaccounted. Floating cards sit over it.
  - **KPI cards**: Accounted, Median time to found, High-need found first (%), Ladder steps saved (simulated, vs. the first-come baseline).
  - **Found curve**: Headcount vs. the first-come-first-served baseline, labeled **Simulated**. Use the executive "previous vs current" two-line style.
  - **Bubble matrix**: buildings × status, with circles sized by household count and the count printed inside. This is display-only.
  - **Radar**: the selected household's factor values E S C V K L M **exactly as stored in `priority`**, compared with the building median. Label it "Factor breakdown (from the priority table)". Never compute or re-weight.
  - **Ladder funnel**: horizontal bars, or a **sankey** from Check-in → Contact → Knock → Responder → Found or Assisted, built from `escalation` and `finalState`.
  - **Coverage and equity meter**: share of high-need households reached first.
  - **Legend card**: a segmented control (Building | Zone | Status) and a range slider with a histogram for "minutes silent".
  - **Right panel**: take the **assistant panel pattern** for the command dock's answers, with suggested chips like "Who's next?", "Silent > 10 min", "Fast-forward 10".
    - **Be honest:** the dock is a command parser and search, **not an AI model**. Don't call it "AI", don't add a fake chat, and don't invent insights.
    - Every card it shows must come from `view` data.
- **Analytics fallback** if time runs short: Apple Health / Fitness card language. Each card has a title, one big number with a unit, a chart and a footnote.
  - **Found curve**: Headcount vs. the first-come-first-served baseline, labeled **Simulated**.
  - **Ladder funnel**: horizontal bars.
  - **Band counts**.
  - **Coverage and equity meter**.
- **Event log**: Notification Center style. Rows are grouped by minute, each with a severity glyph, time in `--font-mono` 12 px and the message. Click a row to select its household.

### 4.7 Shared pieces (restyle once, used everywhere)

- **Household inspector** (`ui/py/Detail.tsx`, `ui/DetailCard.tsx`):
  - The kicker is the building and unit. The name uses `--t-title`. A status chip sits beside it.
  - **Priority section**: the HPI as a large number, the band chip, the **reason** sentence, and the factor breakdown E S C V K L M as a dot-matrix or mini bars with readable labels on hover or focus.
  - **Tiles**: ladder step with countdown, backup minutes (turns red under 30), minutes silent, check-in state.
  - **Actions**: a pill row of Found OK, Needs help and Assisted, each with Undo.
  - **Override** opens a sheet with a required reason, logged.
  - The Simulated 911 label shows when the ladder is at step 4.
- **Toasts**: Apple banner style, `--mat-panel`, a 14 px radius, a glyph and a title with one line of text. At most 2. Swipe or Esc dismisses. They never cover a primary action.
- **Command dock / search**: the ⌘K field searches households, units and commands (`quake`, `fire`, `ff 10`, `reset`). Results go in an Apple Spotlight-style list.
- **Demo control** ("New Simulation"): a popover with Quake, Fire, Power loss, Fast-forward and Reset, each labeled **Simulated**.

---

## 5. Assets you may create (rendered or SVG)

Prefer the user's assets when they provide them. Otherwise create, with fictional and original content only:

| Asset | Spec | Where |
|---|---|---|
| Orbs (exist on `design/main-dashboard`) | Transparent PNG @2x, 256×256, names fixed: `sun, sun-corona, rose, violet, sky, slate, mint, amber, ember, focus` (+ `*-bare`) | `monitor/src/assets/orbs/` |
| House glyphs | Small 3D houses, roof in each status color plus a neutral one, **8 variants**, 96×96 @2x transparent WebP **or** an SVG component | `monitor/src/assets/houses/` |
| Building renders (Overview cutaway, CBRE icon tiles) | Isometric: mid-rise multifamily, townhomes, office, warehouse. 512×384 WebP | `monitor/src/assets/buildings/` |
| Terrain | Fictional relief and land texture, 2048×1280 WebP under 600 KB, or procedural SVG | `monitor/src/assets/terrain/` |
| Grain | 256×256 tiling noise PNG under 40 KB | `monitor/src/assets/` |

Rules for assets:
- **Total new assets under 6 MB.** Check with `du -sh`.
- **No** copied art from the references, no stock photos of real places and no logos.

---

## 6. Defining moments (Delight, done with restraint)

1. **"Everyone found."** When `view.counts.accounted === view.counts.total` while `view.disasterActive` is true, do all of this once:
   - The sun's corona goes from gold to full warm white over 1.2 s.
   - Beams settle.
   - The accounted number springs to 100%.
   - A centered **title card** appears in SF Display 56/600: **"Everyone found."** with a caption: "40 of 40 homes accounted for in *N* min (simulated)".
   - It stays 4 s and then becomes a small persistent chip.
   - No confetti. With reduced motion it's a static card.
2. **The first confirmed quake**: the spotlight dims 20% for 600 ms, then beams ignite from the center outward, staggered by 40 ms per building.
3. **Mark Found OK**: the orb's color crossfades to green and a checkmark draws in over 300 ms. The accounted counter ticks up. An Undo toast appears.
4. **CBRE horizon drag**: numbers count to their new values continuously and the cash-flow chart morphs. No jumps.

---

## 7. States every screen must handle

| State | Requirement |
|---|---|
| All clear | Calm, readable. Shows "Monitoring *N* homes". No empty voids. |
| Incident | The full design. Hierarchy points at the most urgent item first. |
| Selection | Inspector open. Context dimmed. Esc closes. |
| Empty list | A friendly one-liner with an icon, e.g. "Everyone in Alder Court is accounted for." |
| Loading / connecting | A skeleton shimmer (respect reduced motion) and the connection chip set to "Connecting…" |
| Offline / error | A connection chip in red with "Reconnecting…". The last known data stays visible, dimmed 20%, with a "Last update *t* ago" caption. Errors appear as an inline toast with a plain sentence. |
| Narrow (1280 / 1024) | Panels collapse into sheets. Nothing overlaps. No horizontal scroll. |

---

## 8. Accessibility (non-negotiable)

- Text contrast at least 4.5:1, or 3:1 for 24 px and up. Check the lime, gold and lavender text **on** their backgrounds.
- Focus ring: Apple style, `outline: 3px solid rgba(0,125,250,.6); outline-offset: 2px`, on every interactive element, including graph nodes (`tabIndex=0`, Enter selects).
- Keyboard: Tab order follows the visual order, arrows step through lists and chart points, ⌘K searches, Esc closes.
- Screen readers: role and aria-label on SVG canvases and nodes ("Mrs. Alvarez, unit 1A, critical, rank 1: 82, oxygen concentrator, 166 minutes backup…"), plus an `aria-live` polite region for count changes.
- Status always comes with a glyph and a word as well as a color.
- Respect `prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast: more` (stronger borders, opaque materials).

---

## 9. Process (follow it; Craft means iteration)

1. **Plan (15 min).** Write 10-15 lines describing the token file and the order of screens, then send it to me before coding.
2. **Foundation (≤ 45 min).** Build `theme/tokens.css`, the font stack plus Inter fallback, materials, buttons, chips, switches, segmented control, inspector shell, toast and focus ring. Migrate `styles.css`, `py.css`, `overview.css`, `houses.css` and `cbre.css` to the tokens. Delete duplicated values.
3. **Screens, in this order and timeboxed**:
   1. Main graph plus header and dock (90 min).
   2. CBRE (60 min).
   3. Houses (60 min).
   4. Overview (60 min).
   5. Building view (30 min).
   6. Map, analytics and log (45 min).
   7. Defining moments (30 min).
4. **For every screen:**
   - Take a before screenshot at 1440×900 in **all clear** (`sim_reset`) and in **incident** (quake + fire + power loss; the curl commands are in the handoff).
   - Build.
   - Take after screenshots.
   - Put the reference frame next to your screenshot and list **5 differences**. Fix them. Repeat **at least twice**.
   - Run `npx tsc --noEmit -p .`. Click through the judge path (below). Commit, one screen per commit.
5. **The judge path.** Rehearse it after every screen:
   1. Open 5180.
   2. New Simulation → Quake.
   3. Watch the graph ignite.
   4. Click the rank-1 household.
   5. Read the reason.
   6. Mark Found OK, then Undo, then mark it again.
   7. Open the Building view.
   8. Go to Houses.
   9. Go to the Overview "Next to reach".
   10. Go to CBRE and drag the horizon.
   11. Fast-forward until "Everyone found."
6. Send me the screenshots after each screen. Ask me when you need rendered art.

---

## 10. Guardrails (from AGENTS.md; breaking these loses the hackathon)

- **Clients never compute priority.** Display `priority.hpi`, `band`, `rank`, `reason` and the factors exactly as given. Never re-sort except by `rank` or `hpi`.
- **Synthetic data only.** Keep every "Simulated" and "Synthetic" label. The 911 hand-off is simulated, and so are the CBRE dollars.
- **Need-based ranking only.** No income, race, immigration status or insurance value on any household view.
- **Don't touch**:
  - `spacetimedb/`
  - `monitor/src/data/*`
  - `monitor/local-bridge.ts`, `vite.config.ts`, `scripts/dashboards.mjs`, `dashboards.json`
  - `monitor/src/cbre/model.ts`, `finance.ts`, `portfolio.ts`
- **No Apple trademarks or assets.** No Apple logo, no SF font files, no SF Symbols artwork, nothing that says or implies Apple made this. "Apple-grade" describes the craft standard, not the brand.
- **No copying from the references.** No logos, product names ("Control AI", "Haulix", "Stakent", "fusedash", "Fuse AI", "GoodData"-style workspace names), credits, copy or artwork. Their layouts are inspiration, not templates.
- **Don't commit** the reference media, `.env*` files or tokens. Don't push to `main`.
- **Update the README** "Screens and deep links" paragraph and the Status table if what a screen does changes.

## 11. Definition of done

- [ ] `theme/tokens.css` is the single source for type, color, materials, radii, spacing and motion. No stray hex values in components except the accent layers.
- [ ] Every screen passes the judge path with no console errors, in all clear and incident, at 1440×900 and 1920×1080.
- [ ] All six references are used, each on its own screen (table at the top). Nothing is copied from any of them.
- [ ] Every screen visibly matches its reference's mood and Apple's structure. Side-by-side screenshots are in the PR.
- [ ] Every write action has feedback and Undo. Every score has its reason one click away.
- [ ] Reduced motion, reduced transparency, keyboard-only and screen-reader passes are done.
- [ ] Typecheck is clean. The README is updated. Commits are one screen each on `design/apple-grade`, and the PR is open.
