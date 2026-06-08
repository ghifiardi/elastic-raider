# Elastic Raider — Pirate Adventure Visual Pass Design Spec

**Date:** 2026-06-07
**Status:** Approved 2026-06-07 — ready for implementation planning
**Builds on:** Phases 1, 2, 3a (merged to `main`)
**Type:** Visual polish (no gameplay change)

> A cohesive pirate-adventure art pass that replaces the placeholder primitives (cream rectangle hero, blue boxes, plain bands) with hand-drawn, characterful Canvas sprites and light animation. All art is **original** and drawn procedurally in code — zero asset files, zero dependencies. **Out of scope:** any gameplay, hitbox, spawn, balance, or persistence change; shop/characters/missions (still deferred).

## 1. Summary

Introduce `engine/sprites.js` — a set of **stateless draw helpers** (each takes `ctx`, parameters, and an animation time `t`; they mutate the canvas and return nothing) — and rewire `engine/render.js` to compose them into a pirate-adventure scene: a young raider with a red bandana and a stretchy dash, navy-coat marine enemies, wooden barrels, gold treasure, a shimmering sea for gaps, themed power-up pickups, a wooden dock, and a layered parallax sky/cloud/island/sea backdrop. A frame clock drives cheap procedural motion (run-bob, dash stretch, coin spin, sea shimmer, drifting clouds). Hitboxes and sizes are unchanged, so gameplay is untouched.

## 2. Goals & non-goals

**Goals**
- Make the game *look* like a pirate adventure, with a clear, characterful hero and enemies.
- Keep the zero-dependency, no-build, procedural-art ethos (no image/sprite files).
- Confine all changes to rendering; no gameplay, collision, spawning, or persistence logic changes (behaviorally unaffected — the only `main.js` change is threading an animation clock to the renderer).
- Keep `engine/render.js` focused by extracting drawing into `engine/sprites.js`.

**Non-goals**
- No new gameplay, power-ups, hitbox, spawn, or balance changes.
- No multi-frame run-cycle animation (light procedural motion only).
- No shop/characters/missions (deferred).
- No asset files, sprite sheets, or external art tools.

## 3. IP-safety constraints (binding)

The visuals must read as a generic **pirate adventure**, never as a specific protected work or character:
- **No** straw hat; the hero wears a **red bandana**. No iconic silhouettes.
- **No** named characters, place names, ability names, currency names, or other protected identifiers anywhere in code, comments, UI copy, the spec, the plan, commits, or the PR.
- **No** exact outfit/color-block recreations of a known character.
- **No** store-copy comparisons to other games or franchises in the repo or PR.
- Marine = a generic navy soldier (a real-world archetype), not a specific organization's insignia.

## 4. Architecture

- **NEW `src/engine/sprites.js` — stateless draw helpers.** Each function draws one element into a passed `ctx` using Canvas primitives (paths, arcs, gradients). No module state, no DOM access beyond the `ctx` argument; deterministic given inputs (a given `(ctx, params, t)` always paints the same thing). Functions:
  `drawSky(ctx, t)`, `drawClouds(ctx, traveledPx, t)`, `drawIslands(ctx, traveledPx)`, `drawSea(ctx, traveledPx, t)` (background layers); `drawDock(ctx)` (ground surface); `drawWaterGap(ctx, x, w, t)`; `drawBarrel(ctx, e)`; `drawMarine(ctx, e)`; `drawCoin(ctx, e, t)`; `drawPickup(ctx, e, t)` (dispatches gear/magnet/mult/revive); `drawHero(ctx, p, invincible, t)`. A shared `PALETTE` constant lives here.
- **MODIFY `src/engine/render.js` — orchestrator.** Keeps the same public method names so `main.js`'s calls barely change, but delegates to `sprites.js` and threads the time arg:
  - `clear()` — unchanged.
  - `background(traveledPx, t)` — sky → clouds → islands → sea.
  - `ground(entities, t)` — dock planks; still carves water gaps (animated via `drawWaterGap(ctx, x, w, t)`).
  - `entitiesLayer(entities, t)` — dispatch per `e.type` to the barrel/marine/coin/pickup helpers (skip `gap`).
  - `magnetRing(playerBox)` — unchanged.
  - `player(p, invincible, t)` — delegates to `drawHero`.
  - `text(...)` — unchanged.
- **MODIFY `src/main.js`.** Add a module clock: `let clock = 0;` incremented as `clock += dt` at the **top of `update(dt)`** (before the mode early-returns) so the menu/shop animate too. Pass `clock` to `background`, `ground`/water, `entitiesLayer`, and `player`. No other logic changes.

## 5. Sprite catalog (drawn within existing hitboxes)

Sizes come from the existing `SIZES`/`PLAYER` constants — visuals must fit their box so collision is unchanged (a sprite may have small decorative overflow that doesn't affect hit detection).

- **Hero** (`PLAYER` 48×64 stand, 32 slide): young raider — head with skin tone + dark hair, **red bandana**, simple open vest over a shirt, shorts, and notably **long/stretchy arms**. States: running (legs/arms swing, slight vertical bob), jumping (tucked legs), sliding (crouched within the 32px box), **dashing (front arm stretches forward — the existing dash state, exaggerated)**. Invincible: the existing glow halo, retained.
- **Marine** (40×56): navy long-coat, white cap, belt; a plain generic soldier.
- **Barrel** (44×44, replaces the crate box): wooden body with vertical staves and two darker metal bands; subtle top ellipse.
- **Treasure coin** (24×24): gold disc with an inner shine; **spins** by oscillating drawn width with `t` (a horizontal squash cycle).
- **Water gap** (`gap`, 120 wide): a sea fill with a **wavy, shimmering top edge** animated by `t`, darker toward the bottom of the canvas.
- **Power-up pickups** (28×28 each): Gear = glowing orange orb with a swirl; Magnet = cyan horseshoe magnet; Multiplier = purple star bearing "×2"; Revive = pink heart. (Internal type ids `gear/magnet/mult/revive` are unchanged.)
- **Background:** sky vertical gradient; a few **clouds** drifting slowly (parallax factor < sea); **islands** on the horizon (mid parallax); near-**sea** band with animated shimmer. **Dock** ground: brown planks with seams and a highlighted top edge.

## 6. Animation (clock-driven, no per-entity state)

All motion is a function of `clock` and the entity's position — no animation fields are stored on entities:
- Hero run-bob (vertical offset) + arm/leg swing via `sin(clock·ω)`; dash stretch keys off `p.state === 'dashing'`.
- Coin spin: horizontal scale = `|cos(clock·ω + e.x)|`.
- Sea + water-gap shimmer: a sine-displaced top edge sampled along x with `clock`.
- Clouds drift using `traveledPx` (parallax) plus a slow `clock` term.

## 7. Palette

A single `PALETTE` object in `sprites.js` (sky blues, sea `#1f6f9c` + foam white, wood browns, sand, hero skin / red bandana / vest, marine navy + white cap, gold coin, power-up accent colors). Existing gameplay-readability is preserved (enemies clearly distinct from collectibles).

## 8. Build phasing (with visual checkpoints)

Implemented as one plan, with a preview checkpoint after each visual layer so we course-correct early:
1. **Scaffold + clock:** create `sprites.js` with `PALETTE`; add the `clock` to `main`; thread time args through `render`. (No look change yet.)
2. **Background + ground** → *checkpoint:* sky/clouds/islands/sea parallax + dock planks render correctly behind the existing primitive entities.
3. **Entities** (barrel, marine, coin, water gap) → *checkpoint:* obstacles/treasure/sea read clearly and sit in their hitboxes.
4. **Hero + power-ups + animation** → *checkpoint:* the raider runs/jumps/slides/dashes with motion; the four pickups are recognizable; coin spin + sea shimmer animate.
5. **Acceptance pass** (see §9).

## 9. Testing & acceptance

Drawing code is not meaningfully unit-testable; verification is visual. Acceptance criteria:
- `node --test` stays green (**82/82**) — no logic touched.
- `node --check` passes on `sprites.js`, `render.js`, `main.js`.
- Preview screenshots captured and reviewed for: menu, a live run (hero + marines + barrels + treasure + water gap + dock + parallax background), the dash stretch, and each of the four power-up pickups.
- **No console errors** during menu + gameplay (`preview_console_logs` level=error empty).
- No regression: hitboxes/sizes unchanged (collision behavior identical to pre-pass).

## 10. Scope guard

Rendering only. If achieving a look seems to require moving a hitbox, changing a size, or altering spawn/scoring/power-up logic — stop and flag it; it's out of scope for this pass.

## 11. Open questions / deferred

- Exact sprite proportions and palette values — tuned by eye during the checkpoints.
- Optional future polish (multi-frame run cycle, particle spray, day/night) — deferred.
- Themed sea zones/biomes — a separate future phase.
