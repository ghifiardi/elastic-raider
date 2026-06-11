# Phase 3b: Shop + Persistent Upgrades — Design Spec

**Date:** 2026-06-11
**Status:** Approved pending user review
**Goal:** Give the coin wallet a purpose — a shop where players spend banked coins on permanent upgrades — to create the "one more run to afford it" retention loop, especially for the web version.

**Explicitly deferred:** consumables (head start, shield) → Phase 3b.2/3c; daily missions → Phase 3d; skins/characters (the `unlocks` container) → later phase. This spec implements shop + permanent upgrades ONLY.

## Architecture

```
src/meta/shop.js     — NEW. Catalog + purchase rules + effects snapshot (pure; no DOM)
src/ui/overlay.js    — NEW. DOM overlay panel for the shop; the ONLY file that touches the DOM beyond main.js's canvas lookup
src/meta/save.js     — v3 migration (named upgrade tiers, deep-filled)
src/main.js          — effects snapshot at newRun(); overlay open/close wiring; input hygiene
src/game/powerups.js — createPowerups(effects); duration/revive values from effects
src/game/player.js   — dash cooldown from effects (parameter with default)
src/game/scoring.js  — addCoin coin-value multiplier (parameter with default)
src/ui/screens.js    — menu/game-over hint line for opening the shop
index.html           — #playfield wrapper + #overlay node + overlay styles
```

Pure logic / DOM split mirrors `economy.js`: `shop.js` is unit-testable with `node:test`; `overlay.js` owns all DOM and contains no game rules.

## Shop rules (`src/meta/shop.js`)

Catalog is data:

```js
export const UPGRADES = {
  magnetDuration: { name: 'Magnet+',     costs: [80, 200, 450],  bonusPerTier: 1.5 },  // +s magnet
  gearDuration:   { name: 'Gear+',       costs: [80, 200, 450],  bonusPerTier: 1.2 },  // +s gear
  dashCooldown:   { name: 'Quick Dash',  costs: [100, 250, 500], reducePerTier: 0.05 },// −s, floor 0.20
  startingRevives:{ name: 'Guardian',    costs: [300, 700],      revivesPerTier: 1 },  // start revives
  coinValue:      { name: 'Gold Rush',   costs: [150, 400, 800], multPerTier: 0.25 },  // +× coin SCORE
};
```

Naming note: the revive upgrade id is `startingRevives` (not "capacity") — it grants revive **charges at run start** and does NOT cap revive pickups during a run; pickups stack on top as today.

API (all pure, operating on the save object):
- `tierOf(saveData, id)` → owned tier (0-based count; 0 = none)
- `nextCost(saveData, id)` → cost of the next tier, or `null` if maxed
- `canBuy(saveData, id)` → `{ ok, reason }` (`'maxed'` | `'poor'` | ok)
- `buyUpgrade(saveData, id)` → spends via `economy.spend()`, increments tier; returns boolean
- `effectsOf(saveData)` → **run-start snapshot**, additive over base constants:

```js
{
  magnetDurationBonus: tier * 1.5,          // ADDED to MAGNET_DURATION
  gearDurationBonus:   tier * 1.2,          // ADDED to GEAR_DURATION
  dashCooldown:  max(0.20, DASH_COOLDOWN - tier * 0.05),  // absolute value
  coinValueMultiplier: 1 + tier * 0.25,                   // SCORE multiplier only (see below)
  startingRevives: tier * 1,
}
```

Costs/curves are launch values, kept in this one catalog for tuning.

## Gameplay integration (run-start snapshot only)

`main.js` computes `const effects = effectsOf(saveData)` inside `newRun()` and passes the snapshot down. Pure game modules never import `saveData`. Effects apply **only on a new run, never mid-run** (buying during game-over affects the next run).

- `createPowerups(effects)` — stores per-run config `{ magnetDuration, gearDuration }` (base + bonus) in the powerups state and initializes `revives = effects.startingRevives`. `activate()` reads durations from that stored config; call sites don't pass effects per pickup.
- `updatePlayer(player, actions, dt, dashCooldown = DASH_COOLDOWN)` — only the value it needs.
- `addCoin(score, multiplier, coinValueMultiplier = 1)` — contained scoring change; final coin score = `COIN_SCORE * multiplier * coinValueMultiplier` (combo and powerup multipliers unchanged).

**Gold Rush affects SCORE only, never the wallet.** `score.coins` (the raw pickup count) and `bankRun()` are untouched — banking stays `earn(saveData, summary.coins)` on the raw count. Upgrades must not inflate persistent currency; if a future economy phase wants that, it gets its own spec.

## Save schema v3 (`src/meta/save.js`)

```js
{
  version: 3,
  highScore, coins,
  unlocks: [],                                  // KEPT — reserved for skins/characters
  upgrades: { magnetDuration: 0, gearDuration: 0, dashCooldown: 0,
              startingRevives: 0, coinValue: 0 }, // named tiers, deep-filled like stats
  missions: {},                                  // KEPT — reserved for Phase 3d
  stats: { ...unchanged }
}
```

Migration 2→3: copy everything, deep-fill `upgrades` with the named tier keys (existing coins/highScore/stats preserved). `fillDefaults` deep-fills `upgrades` the same way it deep-fills `stats`. No `consumables` key in v3 (added when that phase lands).

**Tier sanitization (migration + fillDefaults):** upgrade tiers accept **known keys only**; each value must be an integer, finite, and clamped to `0..maxTier` for that upgrade (anything else — strings, NaN, negatives, absurd numbers from hand-edited localStorage — becomes a safe clamped value or 0). Bad storage can never produce broken shop state.

## UI overlay (`src/ui/overlay.js` + `index.html`)

**Placement:** `index.html` wraps the canvas in `<div id="playfield">`; `resize()` in `main.js` sizes the wrapper (not the canvas directly) so the canvas AND the absolutely-positioned `#overlay` share the same letterboxed 16:9 box. Overlay aligns with the playfield, not the viewport.

**Panel:** dark theme matching the game (#0b1020 bg, system-ui), title "SHOP", a wallet readout, and one row per upgrade: name, effect line ("Magnet lasts +1.5s per tier"), tier pips (●●○), and a cost button. Button disabled (greyed, not hidden) when unaffordable or maxed — with the reason shown. Close via ✕. Plain DOM, `<style>` block in index.html, zero dependencies.

**Entry points:** a small DOM "🛒 SHOP" button (part of the overlay layer, visible in MENU/GAMEOVER modes, hidden while PLAYING) opens the shop — the button itself IS the menu/game-over hint; `src/ui/screens.js` stays untouched. Game canvas text remains non-interactive.

**Input hygiene (hard requirements):**
1. **Event propagation stops at the overlay.** `createInput(window)` listens at the window level, so overlay interactions WILL reach the game input layer unless blocked. `overlay.js` must call `stopPropagation()` on its panel's `pointerdown/pointerup/touchstart/touchend/touchmove/click/keydown/keyup` events (capture them at the panel root). The open and close buttons specifically must not let the same event that triggered them reach the game tracker — the close-tap must never become a game tap.
2. **`input.clear()` API.** `createInput` exposes `clear()` — the existing internal `clearTransient` (tracker reset + keyboard hold clear) made public. Overlay open and close both call `input.clear()`; this replaces reliance on `consume()`-draining alone.
3. While overlay is open: `main.js`'s `update()` calls `input.consume()` every frame and **discards the snapshot** before any game logic (defense in depth behind 1–2; no run can start behind the panel).

## Testing

**Unit (`node:test`, pure):**
- `tests/shop.test.js` — tier progression, cost lookup, maxed cap, can't-afford refusal, buy decrements coins exactly once, `effectsOf` math (incl. dash floor 0.20), defaults at tier 0 (= current behavior).
- **Gold Rush wallet isolation** — with coinValue tiers owned, a run's coin pickups increase SCORE by the multiplier but `bankRun()` banks exactly the raw `score.coins` count (wallet unchanged by the upgrade).
- `tests/save.test.js` (extend) — v2→v3 migration preserves coins/highScore/stats/unlocks; deep-fills named tiers; v1→v3 chain works; newer-version save still resets safely; **tier sanitization** (string/NaN/negative/over-max/unknown-key values → clamped or dropped).
- `tests/powerups.test.js` / `tests/player.test.js` / `tests/scoring.test.js` (extend) — duration bonuses applied, starting revives, dash cooldown override, coin value multiplier; all with default-arg behavior identical to today (regression guard).

**Acceptance (Playwright smoke, like the touch-input verification):**
1. Overlay open → tapping/clicking anywhere on the panel **cannot start a run** behind it.
2. **Closing the overlay (tapping ✕) does not itself start a run** — game is still on the menu one frame and one second after close.
3. Buy an upgrade → wallet drops by exact cost → **reload the page** → tier and wallet persisted.
4. Insufficient coins → button disabled with reason.
5. Maxed tier → button disabled with reason.
6. Buying from game-over screen applies on the **next** run only (effects snapshot at `newRun()`).

## Out of scope

Consumables (incl. shield-before-revive semantics and armed toggles), daily missions, skins/`unlocks` content, new obstacles/biomes, juice/particles, leaderboard. Each gets its own spec when its phase starts.
