# Prompt: finish the uniform Headcount redesign

Paste everything below the line into the model doing the work. It follows the design handoff email and `apple-grade-design-system.md`, and adds what the team decided afterward.

---

You are the lead product designer and front-end engineer for **Headcount** (HackUTD 2026). Rebuild every monitor dashboard as one professional, light product. Quality comes first: prioritize a professional dashboard that looks genuinely good and doesn't read as vibe-coded. Final submission is **Sun Nov 8, 12 PM CT**, and features freeze at **10 AM**.

## Read first

1. `AGENTS.md`: hard rules. They override everything else.
2. `prompts/design/apple-grade-design-system.md` (commit 6b53379): the full brief and the source of truth, except where "Team decisions" below differs.
3. `docs/GRAPHICS_HANDOFF.md`: how to run the dashboards, the data contract, what each screen must keep, and what not to touch.

## The references

They are in the Drive folder **Headcount design references (R01-R10)** and already unpacked at `~/hackutd/design-refs/`. That folder is gitignored: never commit it. Look at all ten before planning, and extract the videos at 1 fps.

| File | Use it for |
|---|---|
| R01 network graph video | Building view drill and command dock. Structure only, remade in light. |
| R02 terrain + frosted card | Houses: tilt, depth of field, big thin numeral card |
| R03 fleet app video | Overview: stat pills, tabs, cutaway cells, waiting list, gauges, converted to light |
| R04 analytics workspace | Analytics: floating cards over a map, bubble matrix, radar, side panel |
| R05 executive KPIs | Analytics: KPI comparison tiles, before-vs-now chart, treemap |
| R06 satellite city top-down | The map look: imagery, white haloed labels, control cluster, scale bar, place card |
| R07 satellite regional | Satellite palette when zoomed out (Houses) |
| R08 rooftop close-up | Roof, tree and shadow detail |
| R09 pin over rooftops | The red teardrop pin for urgent households |
| R10 3D aerial with callouts | Main 3D screen: tilt, callout pills, filter chips, glass buttons |

## What the brief requires

- Work on `design/cohesive`. It builds on `design/main-3d`. Keep the white panels and the layout of the main screen.
- Every map (3D main, Houses, Live map, Overview mini map, Analytics) looks like a satellite view of fictional Cedar Hollow. No real imagery, no Google tiles or branding.
- One light, professional look everywhere, inspired by government operations sites like USGS and FEMA. One status palette, one pin family, one inspector, one top bar.
- CBRE is out of scope. Don't touch `monitor/src/cbre`.

## Team decisions (these override the brief)

1. **Uniformity is the top priority.** In the team's words: "everything is following different design types, we need to all be the same." Every screen uses the same top bar, panels, type, rows, chips, pins, map and charts. No per-screen accent colors, fonts, shadows, radii or dark skins.
2. **No planet.** The team hates the glossy sphere in a spiky ring on the Building view. Nothing anywhere may be a sphere, orb, planet, sun, orbit arc, ring around a circle, glow or halo. Don't build the brief's circular roof crop in a waveform ring, because it has the same silhouette. Use a flat rounded-rectangle satellite card of the building with a straight heartbeat strip under it (flatter means more silence). Household rows go in a straight, scannable column reached by thin curves.
3. **One navigation.** The shared top bar is on every monitor screen, including Overview. The Overview's left rail doesn't repeat the navigation. It becomes a shared building switcher, used on both Overview and Building view. The top bar picks the screen, and the rail picks the building.
4. **Use many subagents, all at the same maximum effort.** Don't trade quality for speed.

## Where the work stands (Nov 8, 06:22 CT)

No redesigned screen has been built yet.

- Done: `main` is merged into `design/cohesive`, placeholder map assets are committed at `monitor/src/assets/satellite/`, and `design/cohesive-sys` has a dev-only component gallery at `/kit.html`.
- In progress when this was written: the design contract, two competing satellite painters, and the reference study with audit tools.
- Lane worktrees are in `~/hackutd-wt/`. Check `git log` and those folders for anything newer before starting, and don't redo finished work.
- Stage scripts, notes and tools from the run in progress are in `/private/tmp/claude-501/-Users-aryanpatel--claude-spares-spare-uGIJkq/b139c52a-6f93-4787-b9fc-790307098ada/scratchpad/` (`wf/`, `notes/`, `contract/`, `tools/`). That folder is temporary and only exists on this Mac. If it's gone, rebuild what you need from this prompt.

## How to finish

Run these stages in order, with parallel lanes inside each one. Keep each lane in its own worktree or on its own files.

1. **Contract.** Write `monitor/src/theme/SYSTEM.md`: exact values for every component, a file map with one owner per file, and machine-checkable allow-lists for fonts, colors, radii, shadows and control heights.
2. **Satellite base.** Paint Cedar Hollow offline into the assets in `monitor/src/assets/satellite/`. It must align with `sitePlan.ts` and `model.ts`, and it must read as an aerial photo next to R06-R08. Keep the brief's size limits.
3. **Shared system.** Tokens, kit, top bar, inspector, toasts, dock, satellite stage, pins, map controls and labels, integrated across the app.
4. **Screens.** Main 3D, Overview, Houses, Live map, Building view, Analytics and Event log, each built only from the shared system and reviewed for reference fidelity, uniformity and behavior.
5. **Uniformity audit.** Scan rendered styles on every screen in all-clear and incident states, compare the screens against each other, fix every outlier, and repeat until clean.
6. **Finish.** Run the judge path from brief section 10 with no console errors. Check 1920, 1440, 1280 and 1024 widths. Create `docs/screenshots/cohesion-grid.jpg`, update the README, and open the PR.

## Rules for git

- Never push to `main` and never force-push.
- Push `design/*` and `wip/*` branches often, so nothing is stranded if usage runs out.
- Run `npx tsc --noEmit -p .` before each commit, and keep every screen working at every commit.
- Don't commit `design-refs/`, `.env*` or tokens.

Report honestly what you ran and verified, and what you didn't.
