# Elastic Raider — Design Spec

**Date:** 2026-06-06
**Status:** Approved (design); ready for implementation planning
**Working title:** Elastic Raider
**Package id:** `com.ghifiardi.elasticraider`

> Inspired by the zero-dependency, procedural-art approach of `plumber-quest`. The "stretchy pirate" flavor is internal design inspiration only — all repo, code, UI copy, assets, and store metadata use original naming from day one. No third-party IP names or likenesses appear anywhere in the codebase or shipped artifacts.

## 1. Summary

Elastic Raider is a single-plane, side-view **endless runner** with an attack mechanic. The raider auto-runs to the right at an ever-increasing speed. The player **jumps**, **slides**, and performs an **air-dash punch** that smashes enemies and chains a **combo multiplier**. Collect treasure (currency + score), survive hazards, and beat your high score. A later meta-layer adds in-run power-ups, a shop, and missions.

Built as a **vanilla JavaScript (ES modules) + HTML5 Canvas** web game with **no build step and no runtime dependencies**. Art and audio are generated procedurally in code. Android packaging via Capacitor is deferred to the final phase, after the web build's canvas sizing, touch controls, lifecycle, and persistence are stable.

## 2. Goals & non-goals

**Goals**
- A complete, fun, replayable core run loop that feels good in the browser first.
- Zero runtime dependencies; no build step (matches the chosen approach).
- Clean, narrow module boundaries so logic is testable without Canvas/DOM.
- Ship to Android (Play Store AAB) at the end, reusing the plumber-quest packaging pipeline.

**Non-goals**
- No third-party IP (names, characters, likenesses, music).
- No multiplayer, no backend, no accounts. All state is local.
- No 3D / pseudo-3D. Strict single-plane side view.
- No game engine or framework (Phaser/Kaboom explicitly rejected).

## 3. Core gameplay

- **Movement:** auto-run rightward; world speed ramps up with distance traveled.
- **Actions:**
  - **Jump** — variable height (hold for higher). Tap / `Space` / `ArrowUp`.
  - **Slide** — pass under high obstacles. `ArrowDown` / swipe down.
  - **Air-dash punch** — short forward dash that smashes a smashable enemy on contact; chains into a **combo**. `X` / `Shift` / swipe forward.
- **Hazards (≥ 3 types in MVP):**
  - **Marine grunt** — smashable with dash; deadly on plain contact.
  - **Barrel / crate** — static obstacle; jump over or slide depending on size.
  - **Gap (water)** — fall in = game over.
  - *(stretch)* **Cannonball** — incoming projectile to jump/slide/dash.
- **Combo:** consecutive dash-smashes (and coin pickups) raise a multiplier that decays if the chain breaks; multiplier scales score.
- **Collectibles:** treasure/coins — both score and persistent currency.
- **Fail state:** contact with a deadly hazard or falling in a gap → game over → show score + run summary → restart. (Revive consumable, Phase 2, can save one crash.)

## 4. Architecture (vanilla ES modules, no build)

```
index.html            canvas element + module entry
src/main.js           bootstrap: construct modules, start loop
engine/
  loop.js             fixed-timestep update/render; pause on tab blur/background
  input.js            keyboard + touch (tap / swipe) normalized into action events
  audio.js            procedural Web Audio sfx + music; initialized on first user gesture
  render.js           canvas draw helpers, parallax camera, resolution/DPR scaling
  rng.js              seedable RNG (deterministic → reproducible spawner tests)
game/
  state.js            run lifecycle: boot → menu → playing → paused → gameover;
                      transitions, reset/start/pause/resume/end. Single source of truth
                      for "what mode are we in"; keeps main.js and ui/screens.js thin.
  player.js           run/jump/slide/dash state machine + physics
  world.js            endless scroll, parallax layers, biome palette, camera follow
  spawner.js          procedural segment generation + difficulty curve (speed/density)
  entities.js         enemies, obstacles, coins, (later) powerup pickups
  collision.js        AABB collision tests (pure)
  combat.js           dash-smash resolution + combo counter (pure)
  scoring.js          distance + coins + combo → score (pure)
  powerups.js         [Phase 2] gear / magnet / multiplier / revive logic
meta/
  save.js             [Phase 3] localStorage: versioned schema, try/catch fallback
  shop.js             [Phase 3] characters/skins, persistent upgrades, starting loadout
  missions.js         [Phase 3] rolling daily missions + progress tracking
ui/
  screens.js          menu, HUD, pause, game-over (+ Phase 3: shop, missions)
data/
  characters.js  upgrades.js  missions.js  biomes.js   (config tables)
tests/                test page mirroring plumber-quest's test suite
capacitor.config + GitHub Action (AAB)   [Phase 4] reused from plumber-quest
```

**Boundary rules**
- `spawner` only emits segment descriptors; `world` consumes them. Neither knows about scoring.
- `collision`, `scoring`, `combat`, `spawner` (given a seeded RNG), and `save` are **pure logic** modules — no Canvas, no DOM, no `window` — so they unit-test directly.
- `state.js` owns lifecycle transitions; everything else reads the current mode and reacts. No lifecycle branching scattered in `main.js`/`screens.js`.
- Rendering reads game state; it never mutates it.

## 5. Data flow (per frame)

```
input (events)
  → state.js (only "playing" advances simulation)
  → player state machine (apply actions, physics)
  → world.update (scroll, advance camera, ask spawner for new segments)
  → collision (player vs entities/hazards)
  → combat / scoring (resolve smashes, combo, distance, coins)
  → render (parallax bg → entities → player → HUD)
```
Persistence (Phase 3) writes on game-over and on coin/mission changes.

## 6. Meta-progression (Phase 3)

- **Coins** persist across runs (currency, separate from per-run score).
- **Shop:** unlock playable raiders (each a small passive perk) and buy **persistent upgrades** — longer Gear duration, larger magnet radius, head-start distance, extra revive slot.
- **Missions:** 3 rolling objectives (e.g. "smash 50 marines", "run 2000 m total", "collect 300 coins"); reward coins; refresh by date.

## 7. In-run power-ups (Phase 2)

Floating pickups during a run:
- **Gear burst** — temporary invincibility + auto-smash all enemies.
- **Magnet** — pulls nearby treasure toward the player for a duration.
- **Score×Multiplier** — 2×/3× score & coins for a short window.
- **Revive** — rare consumable; revives once after a crash (eases speed on revive).

## 8. Error handling & platform concerns

- **Persistence:** wrap localStorage in try/catch; on unavailable/full, fall back to in-memory state. Save records carry a schema **version** for forward migration.
- **Audio:** Web Audio context created/resumed only after the first user gesture (autoplay policy).
- **Lifecycle:** the loop pauses and the run timer freezes on tab blur / app background; resumes cleanly.
- **Display:** canvas scales to device pixel ratio and viewport; logical game units are resolution-independent.

## 9. Testing

- Seeded `rng.js` makes `spawner` output deterministic → reproducible spawner tests.
- Unit-tested pure modules: `scoring`, `collision`, `combat`, `spawner`, and (Phase 3) `save` serialize/migrate and `missions` progress.
- A simple test page (mirroring plumber-quest's test interface) runs these in-browser.

## 10. Build phasing

**Phase 1 — Web MVP (the bar for "fun").** A complete run loop the player can lose and immediately restart, with real score pressure:
- engine loop + fixed timestep, pause on blur
- input: keyboard **and** touch (tap = jump, swipe down = slide, swipe forward = dash)
- `state.js` lifecycle (menu → playing → gameover → restart)
- player run/jump/slide/dash state machine + physics
- scrolling world + parallax background
- **≥ 3 hazard types** (marine grunt, barrel/crate, water gap)
- dash-smash combat + combo multiplier
- coins (score only in this phase)
- AABB collision, scoring, **local high score**
- game-over screen + run summary + restart
- basic procedural audio (jump, smash, coin, death sfx)

*Explicitly out of Phase 1:* power-ups, shop, missions, Capacitor.

**Phase 2 — Power-ups.** Gear burst, Magnet, Multiplier, Revive (+ pickup spawning).

**Phase 3 — Meta.** `save.js` (versioned persistence), `shop.js` (characters + upgrades), `missions.js` (rolling missions). Coins become persistent currency.

**Phase 4 — Polish & ship.** Biome/visual variety, settings (audio/controls), then Capacitor Android integration + GitHub Action AAB build (reuse plumber-quest pipeline). Verify canvas sizing, touch controls, background/pause, and persistence on-device.

## 11. Open questions / deferred decisions

- Double-jump vs single variable-height jump — decide by feel during Phase 1 tuning.
- Whether biomes are purely cosmetic palette shifts or also change obstacle mix (Phase 4).
- Exact difficulty curve constants (speed ramp, spawn density) — tuned empirically in Phase 1.
