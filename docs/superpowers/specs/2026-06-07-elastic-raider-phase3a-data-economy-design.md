# Elastic Raider — Phase 3a Design Spec: Data Model & Economy Foundation

**Date:** 2026-06-07
**Status:** Approved 2026-06-07 — ready for implementation planning
**Builds on:** Phases 1 + 2 (merged to `main`)
**Part of:** Phase 3 (meta-progression). This is sub-phase **3a** — the data/economy foundation. Shop/upgrades (3b), characters/perks (3c), and missions (3d) are separate specs that build on this.

> Scope is the persistence + economy foundation ONLY. **Out of scope:** shop UI, upgrade effects, characters/perks, mission definitions/progress logic (later sub-phases). 3a defines the save schema, migration, wallet economy, the `RunSummary` shape, and a minimal observable UI — plus the empty containers/interfaces the feature sub-phases plug into. No new gameplay mechanics.

## 1. Summary

Migrate persistence from the v1 high-score-only schema to a versioned v2 schema (`highScore`, `coins` wallet, reserved `unlocks`/`upgrades`/`missions` containers, lifetime `stats`). Coins collected in a run convert to persistent wallet currency, banked at game-over. A new pure `meta/economy.js` owns wallet operations, the `RunSummary` snapshot, and banking; `meta/save.js` stays focused on schema/migration/load/save via a versioned migrator chain. A minimal UI (menu wallet total + game-over banked line) makes the economy observable. All logic is pure and unit-tested with `node --test`.

## 2. Goals & non-goals

**Goals**
- A robust, forward-only **versioned migrator chain** so v1 saves upgrade to v2 without data loss and future sub-phases append a migrator.
- Persistent **wallet** with pure earn/spend/affordability operations.
- **Coin banking** from run pickups (raw count) at run end.
- A pure **`RunSummary`** snapshot + `bankRun` so missions (3d) can consume run data without coupling the pure run modules.
- Lifetime **`stats`** accumulators (the data cumulative missions will read).
- Minimal observable UI; no feature creep.

**Non-goals**
- No shop/upgrade/character/mission features or config tables (3b–3d).
- No event bus; the run reports via a pull-model snapshot.
- No change to gameplay, spawning, or power-ups.

## 3. Save schema v2 (`meta/save.js`)

```js
{
  version: 2,
  highScore: 0,                 // preserved across migration
  coins: 0,                     // persistent wallet
  unlocks: [],                  // owned ids (characters/skins) — reserved for 3b/3c
  upgrades: {},                 // upgrade id → level — reserved for 3b
  missions: {},                 // per-mission progress — reserved for 3d
  stats: {
    runs: 0,
    coinsBankedTotal: 0,
    distanceTotalM: 0,
    smashesTotal: 0,
    bestComboCount: 0,        // peak combo CHAIN count (combo.count), not the displayed multiplier
  },
}
```

### 3.1 API (replaces the v1 API)
```
defaults() → the v2 object above (fresh)
migrate(raw) → a valid current-version object (see §3.2)
load(adapter) → migrate(JSON.parse(adapter.getItem(KEY))) with corrupt/empty → defaults()
save(adapter, data) → adapter.setItem(KEY, JSON.stringify(migrate(data)))
updateHighScore(saveData, score) → bool   // mutates saveData.highScore if score > current; returns true if a new best
```
**`recordHighScore(adapter, score)` is removed.** The v1 high-score-only path is gone; `main` owns the full save object and persists it once (see §5). `updateHighScore` is a pure mutator on the in-memory save object. Its parameter is named `saveData` (NOT `save`) to avoid shadowing the exported `save()` function in this module.

### 3.2 Migration — the key risk
- `CURRENT_VERSION = 2`. A `MIGRATIONS` map keyed by *source* version holds forward steps: `{ 1: (s) => v2FromV1(s) }`.
- `migrate(raw)`:
  1. If `raw` is null / not an object → return `defaults()`.
  2. Let `v = Number(raw.version) || 1` (missing/falsy version ⇒ treat legacy data as v1).
  3. If `v > CURRENT_VERSION` → return `defaults()` (a save from a newer app; don't risk a malformed downgrade).
  4. While `v < CURRENT_VERSION`: `raw = MIGRATIONS[v](raw); v++`.
  5. Deep-fill against `defaults()` so any field a migrator missed is present; return.
- **v1→v2** (`MIGRATIONS[1]`): produce the v2 object with `highScore = Number(raw.highScore) || 0` **preserved**, `coins: 0`, empty `unlocks`/`upgrades`/`missions`, zeroed `stats`.
- Every rule above is unit-tested (§7).

## 4. Economy (`meta/economy.js`, pure — no window/DOM/Canvas)

```js
walletBalance(save) → save.coins
canAfford(save, cost) → save.coins >= cost
spend(save, cost) → bool          // if canAfford: save.coins -= cost, return true; else return false (no mutation)
earn(save, n) → void              // save.coins += n

// Build a mission-agnostic snapshot from the run's score state. Takes the SCORE
// OBJECT (scoreState), NOT total(score). Fields derive from scoreState.distance,
// scoreState.coins, scoreState.smashes; maxComboCount is passed separately.
makeRunSummary(scoreState, maxComboCount) → {
  distanceM: Math.floor(scoreState.distance),
  coins: scoreState.coins,
  smashes: scoreState.smashes,
  maxComboCount,            // peak combo CHAIN count, passed in (see §5)
}

// Apply a finished run to the save: bank coins (raw count) + accumulate lifetime stats.
bankRun(save, summary) → number   // returns coins banked (summary.coins)
//   earn(save, summary.coins)
//   stats.runs += 1
//   stats.coinsBankedTotal += summary.coins
//   stats.distanceTotalM   += summary.distanceM
//   stats.smashesTotal     += summary.smashes
//   stats.bestComboCount = Math.max(stats.bestComboCount, summary.maxComboCount)
```
Banking uses the **raw coin count** (`summary.coins`); the Score Multiplier remains score-only and never inflates the wallet. The just-ended run's coins are included.

## 5. Integration (`main.js`)

- **Boot:** `const saveData = load(storage)` — hold the full v2 object (not just a highScore number). `let saveData` so it persists across runs in memory.
- **Per run:** `newRun()` sets `run.maxComboCount = 0`. Wherever `registerSmash(run.combo)` is called, also `run.maxComboCount = Math.max(run.maxComboCount, run.combo.count)` — the peak combo CHAIN count (since `combo.count` decays). This is the chain count, NOT `multiplier(run.combo)`.
- **Game over (`endRun`):**
  ```js
  const summary = makeRunSummary(run.score, run.maxComboCount);
  const banked = bankRun(saveData, summary);
  const isNewBest = updateHighScore(saveData, total(run.score));
  save(storage, saveData);
  lastResult = { score: total(run.score), banked, wallet: saveData.coins, isNewBest };
  audio.death();
  gameOver(game);
  ```
- **Render:** HUD reads `saveData.highScore`. Menu shows `saveData.coins`. Game-over shows the banked line.

## 6. Minimal observable UI (`ui/screens.js`)

- `menu(walletCoins)` — add a line: `Coins: {walletCoins}`.
- `gameOver(score, highScore, isNewBest, banked, wallet)` — add a line: `+{banked} coins · Wallet {wallet}`.
- `hud` unchanged (still receives `highScore` from `saveData.highScore`).

These are the only UI additions; they exist so the economy is verifiable in the preview, not as a feature.

## 7. Testing

**`tests/save.test.js`** (rewritten for v2):
- `defaults()` returns the full v2 shape.
- `migrate` on a v1 object `{version:1, highScore:500}` → v2 with `highScore:500` preserved, `coins:0`, empty containers, zeroed stats.
- `migrate` on legacy data with **no `version`** → treated as v1 → v2.
- `migrate` on a valid v2 object → unchanged (idempotent).
- `migrate(null)` / non-object / corrupt JSON via `load` → `defaults()`.
- `migrate` on `{version:99}` (future) → `defaults()`.
- `load`/`save` round-trip a v2 object through a fake adapter.
- `updateHighScore` returns true + mutates on a new best; false + no mutation otherwise.

**`tests/economy.test.js`** (new):
- `earn` adds; `canAfford` boundary (cost == balance is affordable); `spend` deducts on success, returns false + leaves balance untouched when insufficient.
- `makeRunSummary` derives `{distanceM: floor(distance), coins, smashes, maxComboCount}` from a score state object + passed chain count.
- `bankRun` earns `summary.coins`, increments `runs`, accumulates `coinsBankedTotal`/`distanceTotalM`/`smashesTotal`, takes `max` for `bestComboCount`, and returns the banked amount.

**`tests/index.html`**: replace the old `recordHighScore` parity check with `updateHighScore`; add an `earn`/`spend` economy check.

Existing non-save tests are unaffected. `main.js` has no unit tests (verified in the preview).

## 8. Interface contracts for later sub-phases (documented, not implemented here)

So 3b–3d plug in without reshaping the foundation:
- **Upgrades (3b):** config table entries `{ id, name, cost, maxLevel, ... }` live in a future `data/upgrades.js`; owned levels persist in `save.upgrades[id]`. Purchase = `spend(save, cost)` + bump `save.upgrades[id]`.
- **Unlocks/characters (3c):** ids persist in `save.unlocks[]`; config in a future `data/characters.js`. Purchase = `spend` + push id.
- **Missions (3d):** definitions in a future `data/missions.js`; per-mission progress in `save.missions`; progress derives from `RunSummary` + lifetime `stats` (already accumulated here). A future v2→v3 migrator seeds any mission state it needs.

The foundation guarantees: the save shape tolerates unknown ids in its containers, and `RunSummary` + `stats` already carry the metrics missions need.

## 9. Open questions / deferred
- Exact upgrade/character/mission catalog values — set in 3b/3c/3d.
- Whether to surface lifetime `stats` in the UI (a stats screen) — deferred; data accumulates now regardless.
