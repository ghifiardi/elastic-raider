# Visual Juice Pass — Design Spec

**Date:** 2026-06-11
**Status:** Approved pending user review
**Goal:** Every player action gets immediate visual feedback — particles, screen shake, score popups, combo flair, hit-stop, and a day→night sky cycle — so the game *feels* dramatically better without any gameplay change.

> Naming note: this is NOT "Phase 4a" (that name is taken by Android packaging in this repo's history). Refer to it as the **Visual Juice Pass**. The follow-up content phase ("Run Variety Pass": new obstacle, biome shifts, near-miss bonuses) gets its own spec after this ships.

**Hard constraint:** zero gameplay/physics/scoring changes. Same runs, same scores, same collisions — only what's drawn (plus one timing nuance: hit-stop, defined below).

## Architecture

```
src/engine/fx.js     — NEW. Deterministic FX state module (particles, popups, shake, freeze)
src/engine/sprites.js — sky/sea/clouds/islands take a `phase` param; palette lerp helpers
src/engine/render.js  — fxLayer(fxState); frame wrapped in shake translate; phase threaded
src/main.js           — ~10 one-line fx.* calls at existing event branches; freeze gate
```

`fx.js` is a **deterministic state module**, not strictly pure: it mutates its own internal state, but touches no DOM/Canvas and takes RNG injected — so it unit-tests exactly like the tracker/shop modules. Drawing stays in render.js/sprites.js.

## 1. `createFx(rng)` — state + API

State: particle pool (**cap 200**, oldest evicted first), popup list, `shake = { mag, t }`, `freeze` (seconds of hit-stop remaining).

API (all coordinates are **screen coordinates** — entities are already screen-space after world scroll):

- `coinBurst(x, y)` — 6 gold sparks (PALETTE.coin), small upward fan, ~0.4s life
- `smashBurst(x, y)` — 12 orange shards (PALETTE.gear) + `shake(4, 0.2)`
- `deathBurst(x, y)` — 20 mixed-color particles + `shake(8, 0.4)` + `freeze = 0.12`
- `reviveFlash(x, y)` — pink ring pulse (PALETTE.revive); NO death burst on the revive path
- `powerupRing(x, y, color)` — expanding ring in the pickup's palette color
- `popup(x, y, text, color)` — floating text, rises ~40px, fades over 0.8s
- `comboFlash(color)` — full-screen tint, 60ms, alpha ≤ 0.18
- `shake(mag, dur)` — exponential decay; **magnitude hard-capped at 8px** (new calls take max, never sum)
- `update(dt)` — integrates particle velocity/gravity/fade, popup rise/fade, shake decay, freeze countdown
- `offset()` — current `{x, y}` shake offset (rng-jittered within decayed magnitude)
- `frozen()` — true while `freeze > 0`

## 2. Hit-stop semantics (the one timing nuance)

On true death only: `freeze = 0.12s`. While frozen, `main.js`'s `update()`:
- **still calls `input.consume()`** (and discards) — no stale actions fire after the freeze
- **still calls `fx.update(dt)`** — particles/shake animate through the freeze
- **skips** world/player/powerups/scoring simulation entirely
- after the freeze expires, the already-decided `gameOver(game)` transition proceeds

`fatal()` split is explicit:
- **revive path** (`consumeRevive` true): `reviveFlash` at the player; no death burst, no freeze, no shake
- **true death path**: `deathBurst` at the player + hit-stop + game over

## 3. Combo tier flash

In the smash branch, capture `multiplier(run.combo)` BEFORE `registerSmash()`, compare after: flash fires **only when the multiplier crosses a tier** (e.g. x2→x3), tinted by tier color. No flash on same-tier smashes.

## 4. Score popups show real awarded points

`addCoin` and `addSmash` in `src/game/scoring.js` are changed to **return the awarded bonus points** (the exact number added to `score.bonus`). Behavior-compatible: same mutations, same totals — only a return value is added, pinned by tests. `main.js` uses the return for `popup(x, y, '+' + pts, color)` at the entity's screen position.

## 5. Day→night sky cycle

- `skyPhase(distanceM)` (pure, in fx.js): full day→dusk→night→dawn→day cycle every **1500m**; returns phase 0..1.
- `sprites.js` gains `lerpColor(a, b, t)` and three palette keyframes (day = current PALETTE values, dusk, night-with-stars). `drawSky/drawSea/drawClouds/drawIslands` take `phase = 0` (default = today's exact look — existing calls unaffected until main threads the value).
- Night palette is **readability-bounded**: sky/sea/clouds darken, but entity sprites (marines, crates, coins, pickups), gap foam, and HUD text colors are UNTOUCHED by phase — hazards and UI stay at full contrast at all times. Stars fade in/out with phase.
- Menu stays at phase 0 (day) always.

## 6. main.js wiring (~10 lines, all in existing branches)

| Existing branch | fx call |
|---|---|
| coin collected | `coinBurst` + `popup('+'+pts)` |
| pickup collected | `powerupRing(color)` |
| marine smashed | `smashBurst` + `popup('+'+pts)` + tier-crossing `comboFlash` |
| `fatal()` revive path | `reviveFlash` |
| `fatal()` death path | `deathBurst` (freeze handled by update gate) |
| every frame | `fx.update(dt)`; freeze gate before simulation |
| render | `renderer.fxLayer(fx.state)` after entities, before HUD; shake translate wraps world+entities+player (HUD NOT shaken); `phase` from `skyPhase(distanceM)` threaded to background |

`createFx(run.rng)` is per-run (created in `newRun()`); a separate menu instance is unnecessary — no fx on menu.

## 7. Testing

**Unit (`tests/fx.test.js`, deterministic with seeded rng):** pool cap eviction at 200; particle lifetime/fade-to-zero; shake decay and 8px cap (max-not-sum on overlapping shakes); freeze countdown and `frozen()`; popup expiry; `skyPhase` (0 at 0m, wraps at 1500m, 0.5 = night); `lerpColor` endpoints exact.
**Unit (scoring):** `addCoin`/`addSmash` return values equal the bonus delta; totals unchanged (regression).
**Acceptance (Playwright):** (1) menu screenshot pixel-identical to pre-juice baseline (phase 0 defaults + no fx = no visual change at rest); (2) forced smash shows particles in-frame and a popup; (3) death produces shake offset ≠ 0 then game-over screen; (4) HUD text position stable during shake (not translated); (5) at injected 750m the sky differs from 0m but coin/marine sprite colors are byte-identical.
**Footage:** bot recorder before/after clip for the next reel.

## Out of scope

Run Variety Pass (new obstacle, biome terrain shifts, near-miss bonuses — next spec); audio juice; menu animations; any balance/spawn changes.
