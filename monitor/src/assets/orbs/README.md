# Orb artwork

Rendered by `node scripts/render-orbs.mjs` (no dependencies): glossy resin
spheres in a machined metal bezel, lit by a studio softbox. Re-run it after
changing a color or the lighting in that script. The graph uses these PNGs
automatically and falls back to plain SVG for any name that is missing.

- `sun.png` + `sun-corona.png`: neighborhood hub and its rotating light rays
- `rose.png`: building hub
- `violet.png`: household waiting for contact
- `mint.png`: found OK
- `sky.png`: assisted
- `amber.png`: needs help
- `ember.png`: critical (top of the queue)
- `slate.png`: unknown, no sensor
- `focus.png`: the selected orb in the building view (the waveform ring stays SVG)
- `<kind>-bare.png`: the same sphere without a bezel, for small household dots

To use your own renders, drop transparent square PNGs with the same names here.
Keep the sphere centered with a radius of 62% of the half-width (the bezel
reaches 75%), so the layout radius lines up.

`../grain.png` is the film-grain tile for the main dashboard background.
