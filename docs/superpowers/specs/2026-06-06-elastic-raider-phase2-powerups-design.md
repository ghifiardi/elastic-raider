# Elastic Raider — Phase 2 Design Spec: Power-ups + Early-Difficulty Tuning

**Date:** 2026-06-06
**Status:** Approved 2026-06-06 — ready for implementation planning
**Builds on:** Phase 1 (Web MVP), merged to `main` (PR #1)
**Phase 1 spec:** `docs/superpowers/specs/2026-06-06-elastic-raider-design.md`

> Scope is Phase 2 only: in-run power-ups (Gear, Magnet, Multiplier, Revive) and an early-difficulty tuning pass. **Out of scope:** shop, characters, persistent upgrades, missions (Phase 3); biomes, settings, Capacitor/Android (Phase 4). No persistence changes — coins remain run-score only; `save.js` still stores high score only.

## 1. Summary

Add four in-run power-ups to the existing endless runner, plus a tuning pass so the first 20–30 seconds feel fair. All effect logic lives in a new **pure** `game/powerups.js` (one state object + mutators + query helpers), unit-tested in Node like every other Phase 1 logic module. Pickups are new floating entities emitted occasionally by the spawner; `main.js` wires collision → activation, gates death through invincibility, and combines the power-up score multiplier with the existing combo multiplier. Browser layers (`render.js`, `ui/screens.js`, `audio.js`) gain pickup visuals, active-effect indicators, and sfx.

## 2. Power-up effects

| Power-up | Kind | Effect |
|---|---|---|
| **Gear** | timed ~5s | Invincible (no death from enemies, crates, or gaps) **and** auto-smashes **marines** on contact for points. **Crates are phased** (no death, no points — they harmlessly pass through). Gaps ignored. |
| **Magnet** | timed ~6s | Coins within `MAGNET_RADIUS` (~220px) are pulled toward the player each frame. Collection still occurs via the existing AABB check. |
| **Multiplier** | timed ~8s | `MULTIPLIER_VALUE = 2`. Effective score multiplier on coins/smashes becomes `comboMult × 2`. Distance points are unaffected (consistent with Phase 1, where the multiplier applies to coins/smashes only). |
| **Revive** | countable consumable | On a fatal hit, if one is held, it is auto-consumed: the player resumes running with `MERCY_DURATION` (~1.5s) of invincibility and a brief speed ease-down. **Awards no points** for the object that would have killed it. |

### 2.1 Invincibility model (two distinct states)
- **`gearActive(s)`** — true while the Gear timer > 0. Grants marine auto-smash (scoring) **and** invincibility.
- **`isInvincible(s)`** — true while `gear > 0` OR `mercy > 0`. This is the single gate that disables **all** death sources (enemy contact, crate contact, gap fall).
- **Mercy** (post-Revive) makes the player invincible but does **NOT** auto-smash and awards **no** points — pure survival. So a marine touched during mercy is phased, not smashed.

### 2.2 Stacking / refresh
- Re-grabbing a timed effect **refreshes its duration to full** — no duration stacking, no strength stacking (Multiplier stays ×2).
- Different effects run on independent, simultaneous timers (Gear + Magnet + Multiplier can all be active at once).
- Revives accumulate as an integer count; each pickup adds one.

## 3. Architecture

### 3.1 New: `src/game/powerups.js` (PURE — no Canvas/DOM/window)
State object and helpers (timers in seconds; `revives` is a count):
```
createPowerups()          → { gear: 0, magnet: 0, multiplier: 0, mercy: 0, revives: 0 }
activate(s, type)         // type ∈ 'gear'|'magnet'|'mult'|'revive'; sets timer to its DURATION, or revives += 1
tick(s, dt)               // decrements gear/magnet/multiplier/mercy toward 0 (revives untouched)
gearActive(s)             → s.gear > 0
isInvincible(s)           → s.gear > 0 || s.mercy > 0
magnetActive(s)           → s.magnet > 0
scoreMultiplier(s)        → s.multiplier > 0 ? MULTIPLIER_VALUE : 1
consumeRevive(s)          → if s.revives > 0: s.revives -= 1; s.mercy = MERCY_DURATION; return true; else return false
speedScale(s)             → 1 when no mercy; during mercy returns a factor that starts at REVIVE_SPEED_EASE (<1) and eases linearly back to 1 as the mercy timer runs down. Encapsulates the post-revive speed ease so main.js never inspects mercy timers directly.
```
Plus a pure pickup helper (kept here since it is effect logic, not rendering):
```
magnetPull(entities, playerBox, dt)   // for each coin within MAGNET_RADIUS of playerBox center, move it toward the player by MAGNET_PULL_SPEED*dt. Mutates coin x/y. Non-coins and out-of-radius coins untouched. Caller only invokes this when magnetActive is true.
```

### 3.2 `data/constants.js` (additions)
`GEAR_DURATION=5`, `MAGNET_DURATION=6`, `MULTIPLIER_DURATION=8`, `MERCY_DURATION=1.5`, `MULTIPLIER_VALUE=2`, `MAGNET_RADIUS≈220`, `MAGNET_PULL_SPEED` (px/s), `REVIVE_SPEED_EASE` (fraction the run speed eases to on revive, easing back over mercy), pickup sizes, and power-up spawn weights/cadence. Plus **tuning** constants for early spacing/ramp (see §6).

### 3.3 `game/entities.js`
Add four floating pickup types: `gear`, `magnet`, `mult`, `revive` (rest at `y = GROUND_Y - 120` like coins, each with its own size in `SIZES`). `makeEntity` handles them; pickups carry the standard `{type,x,y,w,h,dead,collected}` shape.

### 3.4 `game/spawner.js`
Occasionally emit a power-up pickup (cadence ~1 per 8–12s of travel) chosen by weight — Magnet/Multiplier common, Gear uncommon, Revive rare — deterministically from the seeded rng. Power-ups are emitted in addition to the obstacle stream (a pickup occupies its own slot and does not replace a needed safe gap). Also hosts the **early-difficulty tuning** (§6).

### 3.5 `main.js` (integration)
- `run.powerups = createPowerups()`; `tick(run.powerups, dt)` each frame.
- If `magnetActive`, call `magnetPull(entities, playerBox, dt)` before coin collection.
- Per-entity collision (when iterating `run.world.entities`):
  - **coin:** `aabb(pb,e)` → collected; `addCoin(score, multiplier(combo) × scoreMultiplier(powerups))`; coin sfx.
  - **pickup (gear/magnet/mult/revive):** `aabb(pb,e)` → collected; `activate(powerups, kind)`; pickup sfx.
  - **gap:** skipped here (handled after loop).
  - **marine smashed** if `(db && aabb(db,e))` *(dash)* OR `(gearActive && aabb(pb,e))` *(gear)* → dead; `registerSmash`; `addSmash(score, multiplier(combo) × scoreMultiplier(powerups))`; smash sfx.
  - **otherwise on `aabb(pb,e)` (unsmashed marine, or any crate):** if `isInvincible(powerups)` → phased (continue, no death, no points); else → `fatal()`.
- After the loop: `overGap(player)` and `!isInvincible(powerups)` → `fatal()`.
- **`fatal()`** helper: `if (consumeRevive(run.powerups)) { audio.revive(); return; }  endRun();` — Revive awards no points.
- **Speed:** the effective run speed is `runSpeed(elapsed) × speedScale(run.powerups)`. `main.js` never reads `mercy` directly; the post-revive ease is fully encapsulated in `speedScale`.
- Score multiplier everywhere = `multiplier(run.combo) × scoreMultiplier(run.powerups)`.

### 3.6 `engine/render.js` / `ui/screens.js`
- Draw the four pickup types (distinct colors/glyphs).
- Active-effect indicators: player glow while `isInvincible`; a magnet ring while `magnetActive`; a `×N` badge while Multiplier active; HUD shows the **revive count**.

### 3.7 `engine/audio.js`
Add `powerup()` (pickup) and `revive()` sfx.

## 4. Data flow (per frame, additions to Phase 1)
`tick(powerups,dt)` → (if magnet) `magnetPull` → existing collision loop, now also: pickup→activate; marine smashed by dash **or** gear; coin/smash score uses `combo × powerup`; unsmashed-obstacle/gap death gated by `isInvincible`, routed through `fatal()` (Revive-or-end). `render` adds pickups + active-effect indicators + revive count.

## 5. Testing
- **New `tests/powerups.test.js`:** `activate` sets each timer / increments revives; `tick` decrements and expires to 0; re-activate refreshes (does not stack duration or strength); `isInvincible` true during gear and during mercy; `gearActive` true only during gear (not mercy); `scoreMultiplier` returns `MULTIPLIER_VALUE` while active else 1; `consumeRevive` decrements, returns true, starts mercy, and returns false when empty; `speedScale` returns 1 with no mercy, `REVIVE_SPEED_EASE` immediately after `consumeRevive`, and eases back toward 1 as mercy ticks down; `magnetPull` moves an in-radius coin toward the player, leaves out-of-radius coins and non-coins untouched.
- **Extend `tests/spawner.test.js`:** power-up emission is deterministic for a seed; emitted power-up types are within the allowed set; weighting keeps Revive rarest over a large sample; **early-game spacing guarantees a minimum first-obstacle gap** (tuning, §6).
- **Update `tests/index.html`:** add a couple of power-up parity checks (e.g. `scoreMultiplier`, `consumeRevive`).
- Existing 51 tests must continue to pass.

## 6. Early-difficulty tuning (sequenced FIRST)
Before adding power-ups, tune the opening so it is fair:
- **Safe runway:** widen the first obstacle gap / lower spawn density for the first stretch so the player has reaction time (a deterministic minimum first-gap, asserted in tests).
- **Gentler initial speed ramp:** adjust `RUN_SPEED_*` so the first 20–30s accelerates more forgivingly.
Verified by playtest in the preview (the raider can clear the opening with reasonable timing) in addition to the spacing unit test. Done first so power-ups layer onto a fair baseline.

## 7. Build phasing (single Phase 2 plan)
Implemented as one plan, ordered: (1) early-difficulty tuning; (2) constants; (3) pure `powerups.js` + tests; (4) entities pickup types + tests; (5) spawner power-up emission + tests; (6) integration in `main.js` (pickup collision, multiplier stacking, gear smashing/phasing, invincibility gating, `fatal()`/Revive flow, magnet pull); (7) render pickups + active-effect indicators + revive count; (8) audio sfx; (9) update in-browser test page; (10) acceptance + playtest.

## 8. Open questions / deferred
- Exact tuning constants (first-gap width, ramp) — set empirically during §6 playtest.
- Pickup glyph styling is placeholder procedural art (consistent with Phase 1); polish deferred.
- Whether multiple simultaneous active effects need a stacked HUD layout or a simple row — decide during render task.
