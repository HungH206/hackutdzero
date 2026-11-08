# Prompt: graphics revamp

> Replaced by [`apple-grade-design-system.md`](apple-grade-design-system.md), the more detailed brief that adds Apple's design system and per-reference specs. Kept for history.

Paste this into the model doing the visual redesign. Attach the four reference files from the repo root yourself; they are not committed: `python.mp4`, `DASHBOARD EXAMPLE.webp`, `DASHBOARD EXAMPLEE.webp`, `DASHBOARD EXMPLEEE.mp4`.

---

```
You're taking over the visual design of Headcount, our HackUTD 2026 project, a disaster-response dispatch system. The repo is ~/hackutd, branch `monitor-dashboard`. Final submission is Sun Nov 8 at 12 PM CT, so keep every screen working at every commit.

Before you write any code, read these in order:
1. AGENTS.md (hard rules for this repo)
2. docs/GRAPHICS_HANDOFF.md (how to run it, the data contract, what each screen must still do, which files not to touch)

YOUR JOB: completely revamp the graphics, layout and styling of every dashboard. The data layer, scoring and backend are done. Change how things look, not how they work.

DESIGN DIRECTION. I attached 4 references. Take HEAVY inspiration from each one, matching it closely on design, but don't copy-paste it. Use each reference only for its own dashboard:
- python.mp4 (policy-platform network graph) → MAIN dashboard: network graph, building view, header, analysis cards, command dock. My biggest complaint so far is that the circles and backgrounds look "too AI like". Match the video's glossy orbs, light beams, spotlight background and typography much more closely.
- DASHBOARD EXAMPLEE.webp (terrain map + frosted glass card) → HOUSES screen. Every home must clearly read as a house. Calm and easy on the eyes.
- DASHBOARD EXMPLEEE.mp4 (Haulix logistics app) → OVERVIEW, the "regular" dashboard.
- DASHBOARD EXAMPLE.webp (staking finance dashboard) → CBRE screen. It should feel like a serious finance product.

If you want rendered artwork (orbs, house icons, textures), ask me and I'll provide PNGs. Orb PNGs dropped into monitor/src/assets/orbs/ replace the SVG orbs automatically.

HOW TO WORK:
- Run `cd monitor && npm install && npm run dashboards`. Each dashboard gets its own port, 5180-5186, all sharing one simulation.
- Trigger an incident with the New Simulation button or the curl commands in the handoff. Check every screen in both states: all clear and active incident.
- Take headless Chrome screenshots (the command is in the handoff) before and after each change. Compare them against the reference, and keep iterating until it's actually close. Don't settle for "close enough".
- Do one screen per commit, and run `npx tsc --noEmit -p .` before each commit.
- Keep accessibility basics: contrast, visible focus, aria labels on icon buttons, prefers-reduced-motion.

DO NOT:
- Compute or re-weight priority in the UI. Only display what the priority table gives you, and keep each score's reason reachable.
- Touch spacetimedb/, monitor/src/data/*, the CBRE model/finance/portfolio files, or the port setup.
- Remove the "simulated"/"synthetic" labels.
- Commit the reference media files.
- Push to main.

Start with the main dashboard (port 5180), because that's the screen judges see first. Before you code it, tell me your plan in a few lines. After each screen, send me the screenshot.
```
