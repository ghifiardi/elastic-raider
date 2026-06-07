# Elastic Raider — Phase 3a (Data Model & Economy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate persistence to a versioned v2 save schema, add a pure wallet economy with run-end coin banking + lifetime stats, and surface it with a minimal observable UI — the foundation Phase 3b/3c/3d build on.

**Architecture:** `meta/save.js` owns schema/migration/load/save via a versioned migrator chain. A new pure `meta/economy.js` owns wallet ops, the `RunSummary` snapshot, and `bankRun`. `main.js` holds the full save object, tracks peak combo, and on game-over builds a summary → banks → updates high score → persists once. Pure modules are unit-tested with `node --test`; `main.js`/screens are verified in the preview.

**Tech Stack:** Vanilla JS (ES modules), Canvas, `localStorage` (via the existing `meta/storage.js` adapter), `node --test`. No new dependencies.

**Branch:** `feat/phase3a-data-economy` (Phases 1+2 on `main`; 68 tests currently pass).

**Spec:** `docs/superpowers/specs/2026-06-07-elastic-raider-phase3a-data-economy-design.md`

**Key boundaries:**
- `meta/economy.js` is PURE — no `window`/DOM/Canvas.
- `meta/save.js` owns schema only; its `updateHighScore` parameter is `saveData` (NOT `save`) to avoid shadowing the exported `save()`.
- Coins banked = **raw count** (`summary.coins`); multipliers stay score-only.
- `main.js` reads `saveData` for display but contains no economy rules.
- **Sequencing note:** Task 1 removes `recordHighScore`, which `main.js` still imports until Task 4. Between Task 1 and Task 4 the *browser game* won't load (dangling import), but `node --test` stays green throughout. **Do not browser-test until Task 4.** This is intentional to keep each task focused.
- OUT of scope: shop/upgrades/characters/missions features + their config tables (3b/3c/3d).

---

## File Structure

```
MOD  src/meta/save.js       v2 schema + versioned migrator chain + updateHighScore (replaces recordHighScore)
NEW  src/meta/economy.js    PURE: walletBalance/canAfford/spend/earn + makeRunSummary + bankRun
MOD  src/main.js            hold full saveData; track maxComboCount; bank on game-over; pass wallet to UI
MOD  src/ui/screens.js      menu wallet line + game-over banked/wallet line (backward-compatible defaults)
MOD  tests/save.test.js     rewritten for v2 (migration rules + updateHighScore)
NEW  tests/economy.test.js  unit tests for economy.js
MOD  tests/index.html       replace recordHighScore check with updateHighScore; add earn/spend check
```

---

## Task 1: Save v2 schema + versioned migration (`meta/save.js`)

**Files:**
- Modify: `src/meta/save.js` (full rewrite)
- Test: `tests/save.test.js` (full rewrite)

- [ ] **Step 1: Replace `tests/save.test.js` with the v2 suite**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, migrate, load, save, updateHighScore } from '../src/meta/save.js';
import { createStorage } from '../src/meta/storage.js';

function fakeAdapter(initial) {
  const m = new Map();
  if (initial !== undefined) m.set('elastic-raider:save', initial);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

test('defaults is the full v2 shape', () => {
  assert.deepEqual(defaults(), {
    version: 2, highScore: 0, coins: 0, unlocks: [], upgrades: {}, missions: {},
    stats: { runs: 0, coinsBankedTotal: 0, distanceTotalM: 0, smashesTotal: 0, bestComboCount: 0 },
  });
});

test('migrate v1 → v2 preserves highScore and adds empty containers', () => {
  const out = migrate({ version: 1, highScore: 500 });
  assert.equal(out.version, 2);
  assert.equal(out.highScore, 500);
  assert.equal(out.coins, 0);
  assert.deepEqual(out.unlocks, []);
  assert.deepEqual(out.upgrades, {});
  assert.deepEqual(out.missions, {});
  assert.equal(out.stats.runs, 0);
  assert.equal(out.stats.bestComboCount, 0);
});

test('migrate treats missing version as v1', () => {
  const out = migrate({ highScore: 42 });
  assert.equal(out.version, 2);
  assert.equal(out.highScore, 42);
});

test('migrate of a valid v2 object is idempotent', () => {
  const v2 = defaults(); v2.highScore = 9; v2.coins = 30; v2.stats.runs = 3;
  assert.deepEqual(migrate(v2), v2);
});

test('migrate deep-fills a partial v2 stats object', () => {
  const partial = { version: 2, highScore: 1, coins: 5, unlocks: [], upgrades: {}, missions: {}, stats: { runs: 2 } };
  const out = migrate(partial);
  assert.equal(out.stats.runs, 2);
  assert.equal(out.stats.coinsBankedTotal, 0);
  assert.equal(out.stats.bestComboCount, 0);
});

test('migrate null / non-object → defaults', () => {
  assert.deepEqual(migrate(null), defaults());
  assert.deepEqual(migrate(42), defaults());
});

test('migrate of a future version → defaults', () => {
  assert.deepEqual(migrate({ version: 99, coins: 9999 }), defaults());
});

test('load returns defaults when empty or corrupt', () => {
  assert.deepEqual(load(fakeAdapter()), defaults());
  assert.deepEqual(load(fakeAdapter('{not json')), defaults());
});

test('load migrates a stored v1 blob to v2 preserving highScore', () => {
  const out = load(fakeAdapter(JSON.stringify({ version: 1, highScore: 777 })));
  assert.equal(out.version, 2);
  assert.equal(out.highScore, 777);
});

test('save then load round-trips a v2 object', () => {
  const a = fakeAdapter();
  const d = defaults(); d.coins = 120; d.highScore = 50; d.stats.runs = 4;
  save(a, d);
  const loaded = load(a);
  assert.equal(loaded.coins, 120);
  assert.equal(loaded.highScore, 50);
  assert.equal(loaded.stats.runs, 4);
});

test('updateHighScore mutates + returns true on a new best, false otherwise', () => {
  const d = defaults();
  assert.equal(updateHighScore(d, 100), true);
  assert.equal(d.highScore, 100);
  assert.equal(updateHighScore(d, 80), false);
  assert.equal(d.highScore, 100);
});

test('createStorage falls back to in-memory when localStorage is absent (Node)', () => {
  const s = createStorage();
  s.setItem('k', 'v');
  assert.equal(s.getItem('k'), 'v');
  assert.equal(s.getItem('missing'), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/elastic-raider && node --test tests/save.test.js`
Expected: FAIL — `updateHighScore` is not exported yet, and `defaults()` returns the v1 shape, so the v2 assertions fail.

- [ ] **Step 3: Replace `src/meta/save.js`**

```js
const KEY = 'elastic-raider:save';
const CURRENT_VERSION = 2;

export function defaults() {
  return {
    version: CURRENT_VERSION,
    highScore: 0,
    coins: 0,
    unlocks: [],
    upgrades: {},
    missions: {},
    stats: { runs: 0, coinsBankedTotal: 0, distanceTotalM: 0, smashesTotal: 0, bestComboCount: 0 },
  };
}

// Forward migrators keyed by SOURCE version. Each maps vN → vN+1.
const MIGRATIONS = {
  1: (s) => ({
    version: 2,
    highScore: Number(s.highScore) || 0,
    coins: 0,
    unlocks: [],
    upgrades: {},
    missions: {},
    stats: { runs: 0, coinsBankedTotal: 0, distanceTotalM: 0, smashesTotal: 0, bestComboCount: 0 },
  }),
};

export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return defaults();
  let v = Number(raw.version) || 1;          // missing/falsy version ⇒ legacy v1
  if (v > CURRENT_VERSION) return defaults(); // a save from a newer app; don't risk a bad downgrade
  let data = raw;
  while (v < CURRENT_VERSION) { data = MIGRATIONS[v](data); v += 1; }
  return fillDefaults(data);
}

// One-level deep-fill so the nested `stats` object is completed if a migrator
// or stored blob missed a field. Top-level containers are filled shallowly.
function fillDefaults(data) {
  const d = defaults();
  const out = { ...d, ...data };
  out.stats = { ...d.stats, ...(data.stats || {}) };
  out.version = CURRENT_VERSION;
  return out;
}

export function load(adapter) {
  const text = adapter.getItem(KEY);
  if (!text) return defaults();
  try { return migrate(JSON.parse(text)); }
  catch { return defaults(); }
}

export function save(adapter, data) {
  adapter.setItem(KEY, JSON.stringify(migrate(data)));
}

// Pure mutator on the in-memory save object. Parameter is `saveData` (NOT `save`)
// to avoid shadowing the exported save() function above.
export function updateHighScore(saveData, score) {
  if (score > saveData.highScore) { saveData.highScore = score; return true; }
  return false;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ~/elastic-raider && node --test tests/save.test.js`
Expected: PASS (12 tests).

> Reminder: the full suite (`node --test`) will still pass, but the browser game is temporarily broken because `main.js` imports `recordHighScore`. That is fixed in Task 4. Do not browser-test yet.

- [ ] **Step 5: Commit**

```bash
cd ~/elastic-raider
git add src/meta/save.js tests/save.test.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: save v2 schema with versioned migrator chain + updateHighScore"
```

---

## Task 2: Wallet economy (`meta/economy.js`)

**Files:**
- Create: `src/meta/economy.js`
- Test: `tests/economy.test.js`

- [ ] **Step 1: Write the failing test `tests/economy.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walletBalance, canAfford, spend, earn, makeRunSummary, bankRun } from '../src/meta/economy.js';
import { defaults } from '../src/meta/save.js';

test('earn / walletBalance', () => {
  const s = defaults();
  earn(s, 30);
  assert.equal(walletBalance(s), 30);
});

test('canAfford: cost equal to balance is affordable', () => {
  const s = defaults(); s.coins = 50;
  assert.equal(canAfford(s, 50), true);
  assert.equal(canAfford(s, 51), false);
});

test('spend deducts on success', () => {
  const s = defaults(); s.coins = 50;
  assert.equal(spend(s, 20), true);
  assert.equal(s.coins, 30);
});

test('spend insufficient → false, no mutation', () => {
  const s = defaults(); s.coins = 10;
  assert.equal(spend(s, 25), false);
  assert.equal(s.coins, 10);
});

test('makeRunSummary derives fields from score state + chain count', () => {
  const scoreState = { distance: 123.9, coins: 7, smashes: 4, bonus: 999 };
  assert.deepEqual(makeRunSummary(scoreState, 6), { distanceM: 123, coins: 7, smashes: 4, maxComboCount: 6 });
});

test('bankRun banks raw coins, accumulates stats, returns banked amount', () => {
  const s = defaults();
  const banked = bankRun(s, { distanceM: 100, coins: 12, smashes: 3, maxComboCount: 5 });
  assert.equal(banked, 12);
  assert.equal(s.coins, 12);
  assert.equal(s.stats.runs, 1);
  assert.equal(s.stats.coinsBankedTotal, 12);
  assert.equal(s.stats.distanceTotalM, 100);
  assert.equal(s.stats.smashesTotal, 3);
  assert.equal(s.stats.bestComboCount, 5);
  bankRun(s, { distanceM: 50, coins: 8, smashes: 1, maxComboCount: 3 });
  assert.equal(s.coins, 20);
  assert.equal(s.stats.runs, 2);
  assert.equal(s.stats.bestComboCount, 5); // max(5, 3)
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/elastic-raider && node --test tests/economy.test.js`
Expected: FAIL — cannot find module `../src/meta/economy.js`.

- [ ] **Step 3: Implement `src/meta/economy.js`**

```js
// Pure economy helpers operating on the in-memory save object. No window/DOM/Canvas.

export function walletBalance(saveData) { return saveData.coins; }

export function canAfford(saveData, cost) { return saveData.coins >= cost; }

export function spend(saveData, cost) {
  if (saveData.coins < cost) return false;
  saveData.coins -= cost;
  return true;
}

export function earn(saveData, n) { saveData.coins += n; }

// Mission-agnostic snapshot built from the run's SCORE STATE (not total(score)).
// distanceM/coins/smashes derive from scoreState; maxComboCount is passed in.
export function makeRunSummary(scoreState, maxComboCount) {
  return {
    distanceM: Math.floor(scoreState.distance),
    coins: scoreState.coins,
    smashes: scoreState.smashes,
    maxComboCount,
  };
}

// Apply a finished run to the save: bank the raw coin count + accumulate lifetime stats.
export function bankRun(saveData, summary) {
  earn(saveData, summary.coins);
  const s = saveData.stats;
  s.runs += 1;
  s.coinsBankedTotal += summary.coins;
  s.distanceTotalM += summary.distanceM;
  s.smashesTotal += summary.smashes;
  s.bestComboCount = Math.max(s.bestComboCount, summary.maxComboCount);
  return summary.coins;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ~/elastic-raider && node --test tests/economy.test.js`
Expected: PASS (6 tests). Then `node --test` (full) — all pass.

- [ ] **Step 5: Commit**

```bash
git add src/meta/economy.js tests/economy.test.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: pure wallet economy (earn/spend + run summary + bankRun)"
```

---

## Task 3: Minimal observable UI (`ui/screens.js`)

**Files:**
- Modify: `src/ui/screens.js` (full rewrite)

> Browser-only; verified in Task 6. Defaults keep it callable by the not-yet-updated `main.js`.

- [ ] **Step 1: Replace `src/ui/screens.js`**

```js
import { VIEW } from '../data/constants.js';

export function createScreens(renderer) {
  function menu(walletCoins = 0) {
    renderer.text('ELASTIC RAIDER', VIEW.W / 2, VIEW.H / 2 - 40, 48, 'center');
    renderer.text('Tap / Space to start', VIEW.W / 2, VIEW.H / 2 + 10, 22, 'center');
    renderer.text('↑/Space jump · ↓ slide · X/→ dash-smash', VIEW.W / 2, VIEW.H / 2 + 44, 18, 'center');
    renderer.text(`Coins: ${walletCoins}`, VIEW.W / 2, VIEW.H / 2 + 78, 18, 'center');
  }

  // info = { revives, scoreMult }
  function hud(score, combo, highScore, info = { revives: 0, scoreMult: 1 }) {
    renderer.text(`Score ${score}`, 16, 32, 22, 'left');
    renderer.text(`Best ${highScore}`, 16, 58, 16, 'left');
    if (info.revives > 0) renderer.text(`Revive x${info.revives}`, 16, 82, 16, 'left');
    let rightY = 32;
    if (combo >= 2) { renderer.text(`x${combo} COMBO`, VIEW.W - 16, rightY, 22, 'right'); rightY += 28; }
    if (info.scoreMult > 1) renderer.text(`x${info.scoreMult} SCORE`, VIEW.W - 16, rightY, 20, 'right');
  }

  function gameOver(score, highScore, isNewBest, banked = 0, wallet = 0) {
    renderer.text('WRECKED', VIEW.W / 2, VIEW.H / 2 - 60, 44, 'center');
    renderer.text(`Score ${score}`, VIEW.W / 2, VIEW.H / 2 - 12, 26, 'center');
    renderer.text(isNewBest ? 'NEW BEST!' : `Best ${highScore}`, VIEW.W / 2, VIEW.H / 2 + 20, 20, 'center');
    renderer.text(`+${banked} coins · Wallet ${wallet}`, VIEW.W / 2, VIEW.H / 2 + 50, 18, 'center');
    renderer.text('Tap / Space to run again', VIEW.W / 2, VIEW.H / 2 + 84, 20, 'center');
  }

  return { menu, hud, gameOver };
}
```

- [ ] **Step 2: Static check**

Run: `cd ~/elastic-raider && node --check src/ui/screens.js && node --test`
Expected: parses; all tests still pass (0 failures).

- [ ] **Step 3: Commit**

```bash
git add src/ui/screens.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: menu wallet total + game-over banked/wallet line"
```

---

## Task 4: Integration — bank coins + full saveData (`main.js`)

**Files:**
- Modify: `src/main.js` (full rewrite — restores the browser game)

- [ ] **Step 1: Replace `src/main.js` with this version**

```js
import { VIEW, pxToMeters } from './data/constants.js';
import { createRng } from './engine/rng.js';
import { createLoop } from './engine/loop.js';
import { createInput } from './engine/input.js';
import { createRenderer } from './engine/render.js';
import { createAudio } from './engine/audio.js';
import { createScreens } from './ui/screens.js';
import { MODES, createGame, start, gameOver } from './game/state.js';
import { createPlayer, updatePlayer } from './game/player.js';
import { createWorld, updateWorld } from './game/world.js';
import { runSpeed } from './game/spawner.js';
import { aabb, playerBox, dashBox } from './game/collision.js';
import { createScore, addDistance, addCoin, addSmash, total } from './game/scoring.js';
import { createCombo, registerSmash, tickCombo, multiplier } from './game/combat.js';
import {
  createPowerups, activate, tick as tickPowerups, gearActive, isInvincible,
  magnetActive, scoreMultiplier, consumeRevive, speedScale, magnetPull,
} from './game/powerups.js';
import { createStorage } from './meta/storage.js';
import { load, save, updateHighScore } from './meta/save.js';
import { makeRunSummary, bankRun } from './meta/economy.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = VIEW.W * dpr; canvas.height = VIEW.H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize(); window.addEventListener('resize', resize);

const storage = createStorage();
const renderer = createRenderer(ctx);
const screens = createScreens(renderer);
const audio = createAudio();
const input = createInput(window);

const game = createGame();
const saveData = load(storage);        // full v2 save object, persisted across runs in memory
let run = null;
let runCounter = 0;
let lastResult = { score: 0, isNewBest: false, banked: 0, wallet: saveData.coins };

const PICKUPS = new Set(['gear', 'magnet', 'mult', 'revive']);

function newRun() {
  const seed = (Date.now() ^ (runCounter++ * 2654435761)) >>> 0;
  const rng = createRng(seed);
  run = {
    rng,
    player: createPlayer(),
    world: createWorld(rng),
    score: createScore(),
    combo: createCombo(),
    powerups: createPowerups(),
    elapsed: 0,
    maxComboCount: 0,
  };
}

function beginPlaying() {
  audio.unlock();
  newRun();
  start(game);
}

function endRun() {
  const finalScore = total(run.score);
  const summary = makeRunSummary(run.score, run.maxComboCount);
  const banked = bankRun(saveData, summary);
  const isNewBest = updateHighScore(saveData, finalScore);
  save(storage, saveData);
  lastResult = { score: finalScore, isNewBest, banked, wallet: saveData.coins };
  audio.death();
  gameOver(game);
}

// A fatal hit either burns a Revive (survival, no points) or ends the run.
function fatal() {
  if (consumeRevive(run.powerups)) { audio.revive(); return; }
  endRun();
}

function overGap(p, entities) {
  if (!p.onGround) return false;
  const pb = playerBox(p);
  const footCenter = pb.x + pb.w / 2;
  for (const e of entities) {
    if (e.type !== 'gap') continue;
    if (footCenter > e.x && footCenter < e.x + e.w) return true;
  }
  return false;
}

function update(dt) {
  const actions = input.consume();

  if (game.mode === MODES.MENU || game.mode === MODES.GAMEOVER) {
    if (actions.jumpPressed) beginPlaying();
    return;
  }
  if (game.mode !== MODES.PLAYING) return;

  run.elapsed += dt;
  tickPowerups(run.powerups, dt);
  const speed = runSpeed(run.elapsed) * speedScale(run.powerups);

  updatePlayer(run.player, actions, dt);
  if (actions.jumpPressed) audio.jump();

  updateWorld(run.world, dt, speed);
  addDistance(run.score, pxToMeters(speed * dt));
  tickCombo(run.combo, dt);

  const pb = playerBox(run.player);
  const db = dashBox(run.player);
  if (magnetActive(run.powerups)) magnetPull(run.world.entities, pb, dt);

  for (const e of run.world.entities) {
    if (e.dead || e.collected) continue;
    if (e.type === 'coin') {
      if (aabb(pb, e)) {
        e.collected = true;
        addCoin(run.score, multiplier(run.combo) * scoreMultiplier(run.powerups));
        audio.coin();
      }
      continue;
    }
    if (PICKUPS.has(e.type)) {
      if (aabb(pb, e)) { e.collected = true; activate(run.powerups, e.type); audio.powerup(); }
      continue;
    }
    if (e.type === 'gap') continue;
    // Marine smashed by dash OR by Gear. registerSmash before reading multiplier
    // (intentional: the tier-reaching smash scores at the new multiplier).
    if (e.type === 'marine' && ((db && aabb(db, e)) || (gearActive(run.powerups) && aabb(pb, e)))) {
      e.dead = true;
      registerSmash(run.combo);
      run.maxComboCount = Math.max(run.maxComboCount, run.combo.count);
      addSmash(run.score, multiplier(run.combo) * scoreMultiplier(run.powerups));
      audio.smash();
      continue;
    }
    // Unsmashed marine or any crate: phased while invincible, otherwise fatal.
    if (aabb(pb, e)) {
      if (isInvincible(run.powerups)) continue;
      fatal();
      return;
    }
  }
  if (overGap(run.player, run.world.entities) && !isInvincible(run.powerups)) { fatal(); return; }
}

function render() {
  renderer.clear();
  if (game.mode === MODES.MENU) {
    renderer.background(0);
    renderer.ground([]);
    screens.menu(saveData.coins);
    return;
  }
  renderer.background(run.world.traveledPx);
  renderer.ground(run.world.entities);
  renderer.entitiesLayer(run.world.entities);
  if (magnetActive(run.powerups)) renderer.magnetRing(playerBox(run.player));
  renderer.player(run.player, isInvincible(run.powerups));
  screens.hud(total(run.score), multiplier(run.combo), saveData.highScore, {
    revives: run.powerups.revives,
    scoreMult: scoreMultiplier(run.powerups),
  });
  if (game.mode === MODES.GAMEOVER) {
    screens.gameOver(lastResult.score, saveData.highScore, lastResult.isNewBest, lastResult.banked, lastResult.wallet);
  }
}

createLoop({ update, render }).start();
```

- [ ] **Step 2: Static verification**

Run: `cd ~/elastic-raider && node --check src/main.js && node --test`
Expected: parses; all tests pass (0 failures). Cross-check imports: `load`, `save`, `updateHighScore` are exported by `meta/save.js`; `makeRunSummary`, `bankRun` by `meta/economy.js`. Confirm `recordHighScore` is no longer referenced anywhere: `grep -rn recordHighScore src/` → no matches.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: hold full saveData, track peak combo, bank coins on game-over"
```

---

## Task 5: Browser test-page parity (`tests/index.html`)

**Files:**
- Modify: `tests/index.html`

- [ ] **Step 1: Update imports** — change the save import line from:
```js
import { defaults, recordHighScore } from '../src/meta/save.js';
```
to:
```js
import { defaults, updateHighScore } from '../src/meta/save.js';
import { earn, spend, walletBalance } from '../src/meta/economy.js';
```

- [ ] **Step 2: Replace the high-score check and add an economy check.** Replace this line:
```js
const mem = new Map(); const ad = { getItem:(k)=>mem.has(k)?mem.get(k):null, setItem:(k,v)=>mem.set(k,v) };
check('highscore record', recordHighScore(ad, 99) === 99);
```
with:
```js
const sv = defaults();
check('updateHighScore new best', updateHighScore(sv, 99) === true && sv.highScore === 99);
const w = defaults(); earn(w, 50);
check('earn/spend wallet', spend(w, 30) === true && walletBalance(w) === 20 && spend(w, 999) === false);
```

- [ ] **Step 3: Verify the Node suite is unaffected**

Run: `cd ~/elastic-raider && node --test`
Expected: all pass (the HTML page adds no Node tests). Browser parity confirmed in Task 6.

- [ ] **Step 4: Commit**

```bash
git add tests/index.html
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "test: economy/updateHighScore parity checks in the browser test page"
```

---

## Task 6: Acceptance + preview playtest

**Files:** none (verification only — controller-driven)

- [ ] **Step 1: Full Node suite** — `cd ~/elastic-raider && node --test` → all pass, 0 failures.

- [ ] **Step 2: Browser test page** — serve the folder, open `/tests/`; expect all rows green, including `updateHighScore new best` and `earn/spend wallet`.

- [ ] **Step 3: Economy + persistence playtest** (preview):
- [ ] Menu shows `Coins: N` (the persisted wallet).
- [ ] Play a run that collects some coins; on game-over the screen shows `+{banked} coins · Wallet {total}`, and `banked` equals the coins grabbed that run (raw count, not multiplied).
- [ ] The menu wallet total after the run = previous wallet + banked.
- [ ] Reload the page (`window.location.reload()`): the wallet total persists (read back from localStorage).
- [ ] No console errors.

- [ ] **Step 4: v1 migration check** (preview): with the dev server open, seed a legacy v1 save and confirm it upgrades without losing the high score:
```js
// in preview_eval, before reload:
localStorage.setItem('elastic-raider:save', JSON.stringify({ version: 1, highScore: 1234 }));
```
Then reload and verify: the HUD/menu reflect `Best 1234` once a run starts (high score preserved), and `localStorage.getItem('elastic-raider:save')` now shows a v2 object (`version:2`, `coins`, `stats`, …) after the next game-over save.

- [ ] **Step 5 (only if tuning needed):** none expected; this sub-phase has no balance constants. If the game-over layout overlaps, adjust the y-offsets in `screens.gameOver` and re-verify.

---

## Spec coverage check (self-review)

- Save v2 schema + versioned migrator chain (guards: null/non-object→defaults, missing version→v1, future→defaults, deep-fill stats) → Task 1. ✓
- v1→v2 preserves highScore, adds coins/unlocks/upgrades/missions/stats → Task 1. ✓
- `recordHighScore` removed; `updateHighScore(saveData, score)` (param `saveData`, not `save`) → Task 1, used in Task 4. ✓
- Pure `economy.js` (walletBalance/canAfford/spend/earn/makeRunSummary/bankRun) → Task 2. ✓
- Coin banking = raw count; multipliers score-only → Task 2 (`bankRun` uses `summary.coins`) + Task 4. ✓
- `makeRunSummary(scoreState, maxComboCount)` from score object → Task 2. ✓
- Lifetime `stats` accumulation → Task 2 (`bankRun`). ✓
- main holds full saveData; tracks `run.maxComboCount` after each `registerSmash`; banks + updateHighScore + save on game-over → Task 4. ✓
- Minimal UI: menu wallet + game-over banked line → Task 3, wired in Task 4. ✓
- Browser parity updated → Task 5. ✓
- Acceptance incl. wallet persistence + v1 migration → Task 6. ✓
- Boundaries: economy.js pure; save.js schema-only; `saveData` param avoids shadowing `save()`; coins raw count. ✓
- Out of scope (shop/characters/missions/Capacitor): no tasks create them. ✓
```
