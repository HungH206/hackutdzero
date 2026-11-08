# Headcount design system: the contract

Every monitor screen is built from this file, `tokens.css`, `base.css` and `../ui/kit/kit.css`. Where this file is silent, follow `prompts/design/apple-grade-design-system.md` (the brief). The precedence order is:

1. `AGENTS.md`
2. Team decisions (§1)
3. This file
4. The brief

If you need a value that isn't here, use the nearest token. Never invent a new color, font, radius, shadow or control height. If a token is genuinely missing, write it down in your lane report so the orchestrator can decide on it; don't add it yourself.

## 1. Team decisions (these override the brief)

1. **Uniformity first.** Every screen uses the same top bar, panels, type, rows, chips, pins, map and charts. Nothing is set per screen: no accent colors, fonts, shadows, radii or dark skins.
2. **No planet.** Nothing may be a sphere, orb, planet, sun, orbit arc, ring around a circle, glow or halo. That also rules out pulsing rings, radial gradients that suggest volume, concentric rings around markers, sparkles, and blurred colored shadows. Map label outlines are a crisp 1.5 px dark stroke, never a blur. The hazard radius is a single dashed boundary line (it's data), and the epicenter is a small crosshair glyph.
3. **One navigation.** The shared top bar is on every screen, Overview included. The left rail on Overview and Building view is a **building switcher** (`BuildingRail`), not navigation: the top bar picks the screen and the rail picks the building.
4. **Light only.** The only dark things are the satellite imagery, the primary pill, and the dark outline on map text.

## 2. Forbidden

- Fonts other than the four stacks in `tokens.css`. Remove the Outfit, IBM Plex and Roboto Condensed imports.
- The `.py-bg` spotlight, the orb PNG/SVG art (`ui/py/Orb.tsx`, `assets/orbs/`), teal/gold or any dark skin, and per-screen token overrides (`.py-app.screen-x { --bg: … }`).
- Raw hex or rgba values in component CSS or TSX. The only exceptions are `tokens.css`, `#fff` on status fills, and the satellite painter.
- Font sizes below 11 px. The 11 px size is for map attribution only.
- Any word "AI", "agent", "assistant" or "smart" about the dock. It's a command parser and search.
- Copying anything from R01-R10 (names, logos, copy, artwork). The references set structure and finish only.

## 3. Foundation (values live in `tokens.css`)

| Group | Values |
|---|---|
| Type | `--t-hero` 56/600, `--t-headline` 40/600, `--t-title` 28/600, `--t-callout` 19, `--t-body` 17, `--t-subhead` 15, `--t-footnote` 13, `--t-caption` 12/500. Kickers: caption, uppercase, `--t-kicker-track` .06em, `--label-3`. Numbers are tabular everywhere. Mono is only for clock times, timestamps and IDs. |
| Weights | 400 text, 500 controls and captions, 600 names, titles and numbers. 200 only for the Houses frosted-card numeral, and 300 only for its "Cedar Hollow" line. |
| Neutrals | `--bg #f5f5f7`, `--surface-1 #fff`, `--surface-2 #f5f5f7`, `--surface-3 #e8e8ed`, `--label #1d1d1f`, `--label-2 #515154`, `--label-3 #6e6e73`, `--separator #d2d2d7`, `--link #0066cc`, `--focus #0071e3` |
| Status | critical/help `#d92d20` (ink `#b42318`, tint `#fef3f2`); open/waiting/fire/power `#e8590c` (`#b54708`, `#fff6ed`); found OK `#12a150` (`#0e6b3a`, `#edfcf2`); assisted/route `#1f6feb` (`#1558c0`, `#eff5ff`); no sensor `#8a8f98` (`#5b616b`, `#f2f4f7`). Text uses **ink**, never fill. Every status also carries a glyph and a word. |
| Shadows | `--shadow-panel` for panels, `--shadow-float` for the inspector, popovers, toasts and the place card, `--shadow-map` for glass objects on imagery, `--shadow-knob` for the selected segment and switch knob. No others. |
| Glass | Only over imagery: `--mat-map` with `--mat-blur` and a 1px `--mat-map-rim` border, plus the top bar's `--mat-chrome`. Reduced-transparency and contrast modes make both opaque (`base.css`). |
| Radii | Panel 16, card or control 10, segment item 8, badge 6, bar 4, hairline 2, pill 980, circle 50%. Nested radius = outer radius minus padding. |
| Spacing | 4, 8, 12, 16, 20, 24, 32, 44, 64. Map screens use 16 px margins; page screens use 24 px. |
| Heights | Switch 24, small 28 (chips, segment items, small buttons), 32 (segmented track), 36 (buttons, top bar controls, map controls), 44 (large buttons, dock input, tabs). Every hit target is at least 44×44, padded invisibly where the control is smaller (`.hc-btn::after`). |
| Motion | `--ease` cubic-bezier(.32,.72,0,1). Hover 150 ms, press 120 ms with `scale(.97)`, panels and sheets 320 ms, number count-up 400 ms, camera 700 ms. Ambient loops are slow (1.6-4 s) and only on the urgent pin's ground shadow and the route dashes. Reduced motion means crossfades only and cuts instead of camera flights (`base.css` already clamps durations). |

## 4. Layout skeleton (1440×900 is the primary target; check 1920, 1280 and 1024)

```
┌──────────────────────── TopBar 52px (glass chrome, hairline) ────────────────────────┐
│ [■ Headcount / Cedar Hollow · simulated]  [ segmented screen switcher ]  [clock][conn][search ⌘K][bell][New simulation ▾] │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Map screens: imagery fills inset(52px 0 0 0); panels float 16px from the edges.      │
│ Page screens: --bg; content padding 24px; panels in a grid with 16px gaps.           │
│ Inspector: right 16, top 52+16, bottom 16, width 400 (360 under 1280).               │
│ Toasts: top-right at right 16 / top 68, width 360, max 2; left of the inspector when open. │
│ BuildingRail (Overview, Building view): left 16, top 68, bottom 16, width 248.       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- Under 1280 px: switcher labels collapse to icons (each with `aria-label` and a tooltip), the inspector is 360 wide, and side panels are 320.
- At 1024 px: side panels become sheets toggled from the top bar. Nothing overlaps and there's no horizontal scroll.
- Map controls never sit under a panel or a toast.

## 5. Kit (`ui/kit/kit.css`; React wrappers in `ui/kit/*.tsx`)

Use the classes as specified. Give each shared landmark its `data-ui` attribute so the audit can compare it across screens. The landmarks are `topbar`, `panel`, `inspector`, `rail`, `row`, `chip`, `btn-primary`, `btn-secondary`, `pin`, `map-controls`, `alert`, `toast`, `kpi`, `tabs` and `seg`.

| Component | Class | Spec |
|---|---|---|
| Panel | `.hc-panel` (+ `__head`, `__kicker`, `__aside`, `__body`, `__foot`) | White, 1px separator, radius 16, panel shadow. The head is at least 44 tall: kicker on the left, actions or counts on the right. Body padding 0 20 16. |
| Card | `.hc-card` | `--surface-2`, radius 10, padding 12/16, no shadow, used only inside panels. |
| Primary button | `.hc-btn.hc-btn--primary` | Black pill, 36 tall, 15/500. **Only one visible per screen region.** |
| Secondary | `.hc-btn--secondary` | White pill with a 1px separator border. With `[data-status]` its glyph takes the status fill (Found OK, Needs help, Assisted). |
| Tertiary | `.hc-btn--tertiary` | Link color, 13/500, trailing chevron: "Full record ›". |
| Icon button | `.hc-btn--icon` (+ `--ghost`) | 36×36 round, `aria-label` required, tooltip after 500 ms. |
| Sizes | `--sm` 28 (13 px), `--lg` 44 (17 px) | |
| Chip | `.hc-chip` | 28 tall, 13/500, pill. Neutral: white with border. Status: `[data-status]` gives tint background, ink text and the fill-colored glyph. Toggle: `button[aria-pressed=true]` is black with white text. On imagery, use `.hc-chip--map` (glass). |
| Count | `.hc-count` | 18 tall, critical fill with white 12/600. `--neutral` is `--surface-3`. |
| Segmented | `.hc-seg` / `.hc-seg__item` | Track 32 in `--surface-3`. Items 28, 13/500. Selected item is white with knob shadow, marked by `aria-selected`, `aria-pressed` or `aria-current`. |
| Tabs | `.hc-tabs` / `.hc-tab` | Underline tabs 44 tall, 15/500. Selected is 600 with a 2px black underline. Counts use a neutral `.hc-count`. |
| Switch | `.hc-switch[role=switch]` | 40×24, on = `--ok`. |
| Input | `.hc-input` (`--lg` 44) | `--surface-2`, radius 10. Focus adds the white field plus the focus ring. |
| Alert | `.hc-alert[data-status]` (+ `--white`) | The USWDS pattern: tint background, 4px status-fill left edge, 20px glyph, title 15/600, one-sentence text 13, mono 12 timestamp. Used for banners, toasts, concern cards and inline warnings, and nothing else. |
| Toast | `.hc-alert.hc-alert--white.hc-toast` | Width 360, float shadow, dismiss button, click opens the household. |
| Household row | `.hc-row` | Grid 28 / 1fr / auto, padding 12/16, hairline under. Contents: `.hc-rank`, then `__name` 15/600 with `<small>` unit, `__reason` 13 `--label-2`, `__meta` (ladder plus step label 12), then `.hc-hpi` 19/600 in band ink. Hover is `--surface-2`. Selected (`aria-current`) adds a 3px black left bar. **The same row everywhere**: dispatch queue, Live map list, waiting list, Building view column and search results. |
| Rank | `.hc-rank[data-band]` | 28×28, radius 6, 13/600. Critical band is white on critical fill; high band is waiting ink on waiting tint; others are `--surface-3`. |
| HPI | `.hc-hpi[data-band]` (`--lg` 40) | Ink by band (critical or high), otherwise `--label-2`. The band name is in `.hc-band`. |
| Ladder | `.hc-ladder` (`--wide`) | 4 segments of 14×4 with 2px gaps. Done and current segments are `--label`. Next to it, a 12px label with the current step's name in plain words. |
| Status bar | `.hc-statusbar > i[data-status]` | 8 tall, 2px gaps, accounted-for split. |
| Tile | `.hc-tile` | `--surface-2` with label 12 and value 19/600. `[data-status]` colors the value with ink (for example backup under 30 min is critical). |
| Stat pill | `.hc-stat` | 28 tall, white with border: "Open **15**". |
| KPI | `.hc-panel.hc-kpi` | Label 13, value 40/600 with a 2px black rule under it (R05), then "At incident start: **x**" at 12. |
| Factor | `.hc-factor` | Letter, 4px track, value. Factors E S C V K L M are shown **exactly as stored**. |
| Popover | `.hc-pop`, `.hc-menu-item` | Radius 10, float shadow, items 36 tall. |
| Tooltip | `.hc-tooltip` | White, float shadow, 12px. Never dark. |
| Empty, skeleton | `.hc-empty`, `.hc-skel` | Example: "Everyone in Alder Court is accounted for." with a green check. |
| Table | `.hc-table` | Sticky header with kicker-style `th`, 13px cells, mono time column, hover row. |

Glyphs come from `ui/Icon.tsx`: a 24 grid, stroke 1.6, round caps and joins, with filled variants for selected states. Required names are `check`, `alert` (exclamation in a circle), `flame`, `battery`, `shield-check`, `question`, `pin`, `search`, `bell`, `clock`, `layers`, `plus`, `minus`, `locate`, `compass`, `chevron-right`, `chevron-left`, `chevron-down`, `close`, `house`, `building`, `map`, `chart`, `list`, `grid`, `activity`, `undo`, `route`, `play`, `fast-forward`, `reset`, `quake`, `user` and `wifi-off`.

## 6. Shell (one of each, shared by every screen)

- **TopBar** (`data-ui="topbar"`):
  - Brand: a 28×28 black rounded-square mark (radius 8) holding a white `house` glyph, "Headcount" at 15/600, and "Cedar Hollow · simulated" at 12 `--label-3` underneath.
  - Switcher: `.hc-seg` with Main, Overview, Houses, Live map, Building, Analytics and Log, each with icon and label. Analytics shows the open count in a neutral `.hc-count`; Log shows unread in a critical `.hc-count`.
  - Right side: the scenario clock (mono 13, `+10 min` in waiting ink when fast-forwarded), the connection chip ("Local" or "Live" with an ok dot, "Connecting…" with a waiting dot, "Reconnecting…" with a critical dot), search (a secondary pill reading "Search" with a ⌘K `kbd`; ⌘K focuses the dock), the bell (ghost icon with unread count, opens Log), and **New simulation** (secondary pill with a chevron).
  - The New simulation popover offers Quake, Fire, Power loss, Comms outage, Fast-forward 10 min and Reset, each captioned "Simulated".
- **Inspector** (`data-ui="inspector"`, `.hc-panel`, float shadow): the one household panel on every screen. It replaces `ui/py/Detail.tsx` and `ui/DetailCard.tsx` and keeps every capability of both. From top to bottom:
  1. A 112px satellite roof crop of the household's building, with a close button on glass in its corner.
  2. Kicker "ALDER COURT · UNIT 1A", the name at 28/600, and a status chip.
  3. A priority card: `.hc-hpi--lg`, the band, "Rank 1 of 15", the **reason** at 17 `--label-2`, and the factor breakdown titled "Factor breakdown (from the priority table)".
  4. A 2×2 tile grid: ladder step with next-step countdown, backup power (critical ink under 30 min), minutes silent, and check-in state.
  5. The wide ladder with the step label. At step 4, show the chip "Simulated 911 hand-off".
  6. Recent activity: the last 5 timeline rows for this household.
  7. A sticky footer with Found OK (primary), Needs help (secondary, critical glyph) and Assisted (secondary, assisted glyph), plus "Override priority ›" (tertiary). Override opens a sheet that requires a reason, and overrides are logged.
  - Every write shows an **Undo** toast for 6 s.
  - Esc closes the inspector, and it slides in over 320 ms.
- **Toasts**: at most 2, using the `.hc-toast` alert pattern. They never cover a primary action or the map controls.
- **Error toast**: the same pattern with `data-status="critical"`.
- **CommandDock**: R01's composition, restyled white.
  - A `.hc-panel` with a row of 4 KPI columns: open, median time to found, next power clock, accounted.
  - Under it, a `.hc-input--lg` reading "Search a household, or type quake, fire, ff 10, reset…".
  - Suggestion chips under the input.
  - Results show as `.hc-row` items.
- **BuildingRail** (`data-ui="rail"`, `.hc-panel`): the "BUILDINGS" kicker, then one item per building using the row look: name 15/600; "8 units · 3 open" 13 `--label-3`; a 4px `.hc-statusbar`. The selected building is marked with `aria-current`.
- **Everyone found.** When `counts.accounted === counts.total` while `disasterActive`, show this once:
  - A centered white panel with "Everyone found." at 56/600, captioned "40 of 40 homes accounted for in *N* min (simulated)".
  - After 4 s it shrinks to a green chip "Everyone found" that the Main screen shows in its incident card.
  - No confetti. With reduced motion it's static.

## 7. Map system (`ui/map/*`, used by Main 3D, Houses, Live map, Overview mini map and Analytics)

- **Imagery.** It lives in `assets/satellite/`. `meta.json` holds extents, ppm and the exact world-to-pixel mapping, which the satellite lane documents.
  - The 2D raster element carries `.hc-sat-img` (the audit ignores it) inside a `.hc-map` stage.
  - Until the real texture is painted, a neutral `#5d6046` ground shows.
  - Satellite is the default base. **Map** (Aryan's light site-plan palette) is the alternative, chosen in the Layers popover.
- **Pins** (`data-ui="pin"`). One family, the same size at the same zoom on every map. They're DOM or SVG overlays, stay upright on tilted views, have an invisible padded hit area of at least 44×44, `tabIndex=0`, Enter to select, arrows to step in rank order, and an `aria-label` such as "Mrs. Alvarez, Alder Court 1A, open, critical, rank 1, HPI 79, oxygen concentrator…".

  | Household | Marker |
  |---|---|
  | Open, critical (top 10 by `rank`) | Teardrop 28×38: critical fill, 1.5px critical-ink stroke, white 16px disc with the rank numeral at 12/600 in critical ink. A soft elliptical ground shadow (14×5, rgba(0,0,0,.35)) breathes over 2.4 s, and **only the shadow moves**. |
  | Open, waiting | Teardrop 22×30: waiting fill and ink stroke, a 14px disc, the numeral if ranked |
  | Needs help | 22px circle in critical fill with a 2px white edge and a white exclamation |
  | Found OK | 18px circle, ok fill, 2px white edge, white check |
  | Assisted | 18px circle, assisted fill, white shield-check |
  | No sensor | 18px circle, unknown fill, white question mark |
  | Houses screen only | Calm states (ok, assisted, unknown) use a **house** silhouette (24×22: roof triangle over a square body) in the same fill, edge and glyph. Urgent states keep the teardrops. |
  | Badges | A 14px fire badge (waiting fill, white flame) at top-right of the head; a 14px power badge (white, waiting-ink battery) at top-left |
  | Hover / selected | Hover scales to 1.08. Selected scales to 1.15, the edge turns `--label`, and a callout pill appears. No rings. |
  | Cluster | When pins overlap below the current zoom: a 28px white circle with the count at 13/600 and a map shadow, plus an 8px dot in the most severe status color |

- **Callout pill** (R10): glass `--mat-map`, 28 tall, radius pill, padding 0 12, name 13/600, meta 12 `--label-3` ("8 units · 3 fl · 1962"), and an optional status chip.
- **Labels**: SVG `<text>` in `--font-map` 500, white, with `paint-order: stroke; stroke: rgba(0,0,0,.7); stroke-width: 3px; stroke-linejoin: round`.
  - Streets are 12 px along the street direction; buildings 13 px; places 12 px italic.
  - A **Labels** toggle hides the whole layer.
  - Roads get a hybrid overlay: the major road in `rgba(255,236,170,.55)` at 2 px and minor streets in `rgba(255,255,255,.35)` at 1 px.
- **Controls** (`data-ui="map-controls"`). Bottom-right, 16 px inset, stacked with 8px gaps, all on glass with radius 10, 36×36, and the map shadow:
  - Recenter
  - 2D/3D (only where the screen supports it)
  - Zoom −/+ as a joined 36×72 block with a hairline between
  - Compass: 36 round with a red north and grey south needle; clicking it resets bearing and tilt
  - Layers: a popover with Satellite / Map, then the toggles Labels, Routes, Hazard radius and No-sensor homes
- **Scale bar and attribution**: bottom-left, 16 px inset. A metric scale bar with a white bar and dark outline and a 12px label. Next to it, "Simulated imagery · Cedar Hollow is fictional" at 11 px, white with the dark outline. Put the drag/zoom hint there too, at 12 px.
- **Filter chips**: top-left of the map, `.hc-chip--map`: All, Critical, Needs help, Silent > 10 min, Fire. They filter only; sorting stays by rank.
- **Overlays**:
  - Responder route: 3px `--route` line with a 1px white casing, plus a calm moving dash (4 s loop) along it.
  - Hazard: one dashed 1.5px `--hazard` boundary with a "300 m" label, and a 12px crosshair at the epicenter. On first confirmation it draws outward over 800 ms.
- **Tilt** (Houses): a `perspective(1400px) rotateX(42deg)` ground with tilt-shift (masked `filter: blur()` bands top and bottom). Pins are projected through a `DOMMatrix` helper into an untransformed overlay.

## 8. Charts (Analytics, Overview gauges, sparklines)

- **Axes**: 12px `--label-3`. Gridlines are 1px `--surface-3`; the axis line is 1px `--separator`. No chart borders.
- **Series**: status series use status fills. The Headcount or current series is a 2px `--label` line. The baseline (first-come-first-served) is a 2px `--label-3` line dashed 4 4. Area fill is the series color at .08. Points appear only on hover.
- **Labels**: every simulated series says "Simulated". Charts support hover and keyboard scrubbing with an `aria-live` readout in `.hc-tooltip`.
- **Chart types**:
  - Bubble matrix: tint fill, 1px fill stroke, count 12/600 in ink.
  - Radar: polygon grid, never circles. The household is a `--label` 1.5px stroke with .06 fill; the building median is `--label-3` dashed.
  - Treemap: tint tiles with 1px white gaps and 12/600 ink labels.
  - Gauges (Overview): flat arcs with no glow, the track in `--surface-3`, the value in a status fill, and the number at 28/600 in the center.

## 9. Screens (each answers one question)

| Screen | Layout from the shared parts |
|---|---|
| Main 3D (5180): "Where is need right now, and who's next?" | Keep Aryan's layout. The left column (`--side-w`) holds: the incident alert card (hero "28 of 40 households accounted for", status bar, keys), concern alerts (`.hc-alert`), and the dispatch queue (`.hc-row`). Then the 3D satellite map (ground and roofs from the texture, R10 callouts and pins), the control cluster above the dock on the right, filter chips top-left of the map, and the dock bottom-right. |
| Overview (5181): "What do I do next in this building?" | BuildingRail. Then a breadcrumb, the 40px building name with status chip and prev/next, stat pills, and tabs (Units, Live, Escalations, Alerts). Units is a cutaway elevation: floors stacked, each unit a dashed cell with name, unit and status chip. Live is the satellite mini map plus two flat gauges (backup power, silence). The waiting list expands into a record with an amber alert and actions. The primary action is "Next to reach". |
| Houses (5182): "Which homes are OK, and which aren't?" | The tilted satellite base with tilt-shift. The frosted card (R02) top-left: "Cedar Hollow" at 24/300, then "Homes accounted for", the 96px weight-200 % numeral, and "*N* of 40 · *M* still waiting". A key card bottom-left. House pins. Calm: low saturation, nothing pulses except the urgent pin's shadow. |
| Live map (5183): "Where do responders go?" | A 360 list panel on the left (USGS pattern): "15 open households", a sort control (Rank / Silent longest), and an "Only list homes in view" option. The top-down satellite map has the full control cluster, filter chips, scale and attribution. Selecting a row flies the map to the pin (700 ms) and opens the inspector. |
| Building view (5184): "Who in this building still needs reaching?" | BuildingRail. A **flat rounded-rectangle satellite card** of the building (radius 16) with a **straight heartbeat strip** under it: a flatter line means more silence. Then a column of six category cards (Needs help, Open, Power clock, Silent, Found, No sensor), each a `.hc-card` with a count at 28/600, a caption, and a 3px status left tick; the selected card has a 2px `--label` border. Thin 1px curves lead to a **straight column** of `.hc-row`s, and the selected category's curves use its status fill. The inspector is on the right. No circles, rings or orbs. |
| Analytics (5185): "Are we finding people faster than the baseline?" | Dimmed satellite (55% under a `--scrim`) with a zone choropleth. Floating panels: 4 KPI tiles; the found curve (Headcount vs baseline, Simulated); bubble matrix; radar of factors exactly as stored; treemap; ladder funnel. A right side panel holds dock results and suggestion chips. |
| Event log: "What happened, and when?" | One panel with `.hc-table`: mono time, a severity glyph with status chip, household, message. Rows are grouped by minute, and clicking a row selects its household. |

## 10. States

- **All clear**: "Monitoring 40 homes", calm, no empty voids.
- **Incident**: the most urgent item is visually first.
- **Selection**: inspector open, context dimmed to .6.
- **Empty**: `.hc-empty`.
- **Loading**: `.hc-skel` and "Connecting…".
- **Offline**: a "Reconnecting…" chip, last data dimmed 20%, and "Last update *t* ago".
- **No WebGL**: `FlatMap` with the static satellite WebP.
- **Narrow**: sheets, no overlap, no horizontal scroll.

## 11. Allow-lists and the audit

`allowlist.json` is the machine-checked subset of §3: fonts, sizes, weights, text, background and border colors (alpha variants allowed), radii, shadows and control heights. `scripts/design/audit.mjs` checks every visible element on every screen, in all-clear and incident states, against it. It also compares the `data-ui` landmarks across screens: a landmark that renders differently on two screens is a bug. A clean audit is required before merge.

## 12. File map: one owner per file

| Files | Owner |
|---|---|
| `src/theme/*` (tokens, base, allowlist, SYSTEM.md, gallery) | orchestrator |
| `src/assets/satellite/*`, `scripts/satellite/*` | lane **sat** |
| `scripts/design/*` | lane **tools** |
| `src/ui/kit/**`, `src/ui/shell/**` (new), `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `src/py.css`, `src/ui/Icon.tsx`, `src/ui/Toasts.tsx`, `src/ui/DemoPanel.tsx`, `src/ui/CommandDock.tsx`, `src/ui/py/Header.tsx`, `src/ui/py/Detail.tsx`, `src/ui/DetailCard.tsx`, and the chrome override blocks in `src/ui/command/command.css` (the `.py-app.screen-graph` token block at the top and the "chrome on this screen" block) | lane **shell** (stage 2) |
| `src/ui/map/**` (new) | lane **map** (stage 2) |
| `src/ui/command/**`, `src/ui/py/Analysis.tsx`, `src/ui/py/concerns.ts` | lane **main** (stage 3) |
| `src/ui/overview/**` | lane **overview** (stage 3) |
| `src/ui/houses/**` | lane **houses** (stage 3) |
| `src/ui/MapCanvas.tsx`, `src/ui/QueuePanel.tsx`, `src/ui/Legend.tsx` | lane **livemap** (stage 3) |
| `src/ui/py/Drill.tsx`, `src/ui/py/{Orb,Graph,TimeRail,Legend,kind}.ts(x)`, `src/ui/building/**` (new), `src/assets/orbs/` | lane **building** (stage 3) |
| `src/ui/Analytics.tsx`, `src/ui/Gauges.tsx`, `src/ui/EventLog.tsx`, `src/ui/analytics/**` (new) | lane **analytics** (stage 3) |

- In stage 3, a screen lane may edit `App.tsx` only inside its own screen's JSX block, minimally.
- Nobody touches `spacetimedb/`, `src/data/*`, `src/cbre/*`, `local-bridge.ts`, `vite.config.ts`, `scripts/dashboards.mjs` or `dashboards.json`.

## 13. Lane rules

- **Where to work**: only in your own worktree and branch, and only on files you own.
- **Before every commit**: run `npx tsc --noEmit -p .` in `monitor/`. Commit often and **don't push**; the orchestrator merges to `main`. End each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Your dev server**: use the port you were given:
  ```powershell
  $env:HEADCOUNT_SOURCE='local'; npx vite --host 127.0.0.1 --port <p> --strictPort
  ```
  Drive state with `POST /__headcount/call` (`docs/GRAPHICS_HANDOFF.md` §1). Use `scripts/design/shoot.mjs` and `audit.mjs` once they're on `main`.
- **Compare against references**: they're local only, in `C:\Users\aryan\OneDrive\Documents\HackUTD\design-refs\Headcount design references (R01-R10)\` (`images\`, plus `frames\` with the videos at 1 fps). Never copy them into the repo. Put your before/after screenshots next to the reference, list 5 differences, fix them, and repeat at least twice.
- **Keep it working**: every screen keeps every behavior in `docs/GRAPHICS_HANDOFF.md` §4 at every commit.
- **Fixed rules**: clients never compute or re-weight priority; every score shows its reason within one click; "Simulated" labels stay; need-based only.

## 14. Words

Use household, Found OK, Needs help, Assisted, No sensor, Open, Dispatch queue, Responder (simulated), Next to reach, Silent, Backup power. Never use victim, case, ticket, AI or agent. Every number has a unit and every event has a timestamp. Write at a sixth-grade reading level.
