# Prompt sent to Aryan: graphics revamp

Copied from the email Avin sent to Aryan on 2026-11-08 (subject line was the prompt itself, no separate subject). The reference files are not committed; they were shared as Google Drive links in the email. The first paragraph of the original repeated one sentence, which is removed here.

---

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

Reference files (Drive links from the email):
- DASHBOARD EXAMPLE.webp: https://drive.google.com/file/d/1AfY7U0YA_HUKzbsj9cUvIBvlXg0UQhEC/view?usp=drive_web
- DASHBOARD EXAMPLEE.webp: https://drive.google.com/file/d/1--W-lOFpv5gGcTN_9Dd4TyHbhup6_Bop/view?usp=drive_web
- DASHBOARD EXMPLEEE.mp4: https://drive.google.com/file/d/11_6f2JsUoXpRk6gP4p3M-cSXHSGyopbI/view?usp=drive_web
- python.mp4: https://drive.google.com/file/d/1IxQUpbhId3F7owEPheSN1rw0yIQpMSM0/view?usp=drive_web
