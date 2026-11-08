# Headcount Photon agent

Texts a neighborhood during a disaster, works out who is accounted for from what people report, and asks the nearest safe neighbor to go check on someone once a dispatcher approves it. Built on the Photon 2.0 beta.

## Run it

1. Start SpacetimeDB with `spacetime start`, then run `./scripts/setup-local.sh`. That publishes the module and writes an agent identity to `.env`.
2. Fill in `PHOTON_API_KEY` and `ANTHROPIC_API_KEY` in `.env`. The key needs `project:read`, `project:write`, `platforms:read` and `platforms:write`.
3. `npm install`, then `npm start`.
4. Open http://127.0.0.1:8787, add each phone, and have each person text the number shown next to them.

Without an Anthropic key it reads messages with keyword matching. Without a Photon key it prints texts instead of sending them.

## Voice

1. Buy a Photon SMS number and import it into Retell over SIP, following Photon's Retell cookbook, with outbound enabled.
2. Open a public HTTPS tunnel to port 8788 and set `RETELL_API_KEY` and `PUBLIC_URL`.
3. `npm run setup:voice`, then copy `RETELL_AGENT_ID` into `.env` and set `VOICE_FROM_NUMBER` and `DISPATCHER_PHONE`.

`DISPATCHER_PHONE` should be a teammate. The code refuses 911 and other emergency numbers.

## Rules enforced in code

- Help can only be promised if a neighbor accepted a task in the database (`src/guard.ts`). Every outgoing text passes through it.
- Secondhand reports can't close a high-risk person (`spacetimedb/src/accounting.ts`).
- Nobody is asked to go anywhere until a person approves it, and only people confirmed safe are asked.
- Phone numbers and message text stay in `data/state.json`. SpacetimeDB gets a hash of the sender and private claim rows.

## Demo setup

- Put demo phones on sensored households inside the quake area, such as Alder Court. Other households don't get a check-in, a ring or a call.
- Neighbors are only asked once they count as accounted for, so they need to answer the check-in first.
- During an event the count covers households we tried to reach or heard about. Households with no sensor and no reports aren't in it.
- Point the dashboard at the same database. `npm run dashboards` uses a separate in-process copy, so use `dashboards:live`.
- A tunnel URL changes when it restarts. Rerun `npm run setup:voice` after that.

## Test

`npm test` runs the unit tests. `npm run e2e` plays the demo against a local SpacetimeDB with a fake phone network.
