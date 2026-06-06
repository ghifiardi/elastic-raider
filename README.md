# Elastic Raider

A zero-dependency, no-build endless runner in vanilla JavaScript + HTML5 Canvas.
Run, jump, slide, and dash-smash enemies for combo points. Survive as long as you can.

## Run it
Serve the folder over HTTP (modules need a server, not `file://`):

    python3 -m http.server 8080

Then open http://localhost:8080/ — and http://localhost:8080/tests/ for the in-browser test page.

## Controls
- Jump: Space / ↑ / W / tap
- Slide: ↓ / S / swipe down
- Dash-smash: X / J / ShiftLeft / → / swipe forward

## Tests
Pure logic modules are unit-tested with Node's built-in runner (no dependencies):

    node --test

## Project layout
See `docs/superpowers/specs/` for the design and `docs/superpowers/plans/` for the build plan.
This is Phase 1 (web MVP). Power-ups, shop/missions, and Android packaging are later phases.
