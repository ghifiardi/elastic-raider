# Phase 3b: Shop + Persistent Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shop where players spend banked coins on five permanent upgrades, with a DOM overlay UI that cannot leak input into the game.

**Architecture:** Pure logic modules (`src/meta/shop.js` + save v3) land before any DOM work; `src/ui/overlay.js` is the only DOM-owning module and consumes only those stable APIs. Gameplay reads upgrades exclusively through a run-start `effectsOf()` snapshot passed down from `main.js` — pure game modules never see `saveData`.

**Tech Stack:** Vanilla ES modules, zero dependencies, `node:test` + `node:assert/strict`; Playwright (already in `~/elastic-raider-promo`) for acceptance.

**Spec:** `docs/superpowers/specs/2026-06-11-shop-upgrades-design.md` — read it before starting.
**Branch:** `feat/shop-upgrades` (exists; spec commits are on it). Verify with `git branch --show-current` before every commit.

**Sequencing (reviewer-mandated):** Task 1 (`input.clear()`) before any overlay work; Tasks 2–3 (shop + save pure logic) before Tasks 7–8 (DOM).

**Working commands:** single suite `node --test tests/<file>`; everything `npm test` (currently 96 tests green).

---

### Task 1: `input.clear()` — full transient reset

The overlay depends on this. The existing internal `clearTransient` only clears `keys.jumpHeld` — NOT pending one-shots like `keys.jumpPressed`, which would survive and start a run when the overlay closes. `clear()` must drop one-shots too (and the blur handler gets the same hardening for free).

**Files:**
- Modify: `src/engine/input.js` (the `clearTransient` closure + return object in `createInput`)
- Test: `tests/input.test.js` (append)

- [ ] **Step 1: Append the failing test** (file already has the `touchEvent(type, id, x, y)` helper and imports `createInput`):

```js
test('createInput: clear() drops pending presses, holds, and in-flight touches', () => {
  const target = new EventTarget();
  const input = createInput(target);
  const kd = new Event('keydown'); kd.code = 'Space';
  target.dispatchEvent(kd);                                   // pending press + hold
  target.dispatchEvent(touchEvent('touchstart', 9, 50, 50));  // in-flight touch
  input.clear();
  const a = input.consume();
  assert.equal(a.jumpPressed, false);                         // one-shot dropped
  assert.equal(a.jumpHeld, false);                            // hold dropped
  target.dispatchEvent(touchEvent('touchend', 9, 50, 50));    // stale end after clear
  assert.equal(input.consume().jumpPressed, false);           // fires nothing
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/input.test.js`
Expected: FAIL — `input.clear is not a function`.

- [ ] **Step 3: Implement.** In `src/engine/input.js` inside `createInput`, replace:

```js
  const clearTransient = () => { tracker.reset(); keys.jumpHeld = false; };
```
with:
```js
  // Full transient reset: tracker state AND keyboard one-shots/hold. Used by the
  // blur/hidden handlers and exposed as clear() for UI overlays.
  const clearTransient = () => {
    tracker.reset();
    keys.jumpPressed = false; keys.slidePressed = false; keys.dashPressed = false;
    keys.jumpHeld = false;
  };
```
and change the return statement's object to include it (consume body is byte-identical to current):
```js
  return {
    clear: clearTransient,
    consume() {
      tracker.tick(now());
      const ti = tracker.takeIntents();
      const snap = {
        jumpPressed: keys.jumpPressed || ti.jumpPressed,
        slidePressed: keys.slidePressed || ti.slidePressed,
        dashPressed: keys.dashPressed || ti.dashPressed,
        jumpHeld: keys.jumpHeld || tracker.jumpHeld,
      };
      keys.jumpPressed = false; keys.slidePressed = false; keys.dashPressed = false;
      return snap;
    },
  };
```
Note: clearing one-shots in `clearTransient` is a deliberate strengthening — the spec's close-tap requirement is unmeetable if a pending `jumpPressed` survives `clear()`. The blur/hidden path inherits it, which is also correct (a press swallowed by backgrounding shouldn't fire on resume).

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: ALL PASS (97 tests — 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/engine/input.js tests/input.test.js
git commit -m "feat: input.clear() — full transient reset for overlay open/close"
```

---

### Task 2: Shop pure logic (`src/meta/shop.js`)

**Files:**
- Create: `src/meta/shop.js`
- Test: `tests/shop.test.js` (new)

- [ ] **Step 1: Write the failing tests** — create `tests/shop.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UPGRADES, maxTier, tierOf, nextCost, canBuy, buyUpgrade, effectsOf,
} from '../src/meta/shop.js';
import { DASH_COOLDOWN } from '../src/data/constants.js';

const freshSave = (coins = 0, upgrades = {}) => ({ coins, upgrades });

test('catalog has the five spec upgrades', () => {
  assert.deepEqual(Object.keys(UPGRADES).sort(), [
    'coinValue', 'dashCooldown', 'gearDuration', 'magnetDuration', 'startingRevives',
  ]);
});

test('tierOf: 0 by default, clamped to maxTier, junk-tolerant', () => {
  assert.equal(tierOf(freshSave(), 'magnetDuration'), 0);
  assert.equal(tierOf(freshSave(0, { magnetDuration: 2 }), 'magnetDuration'), 2);
  assert.equal(tierOf(freshSave(0, { magnetDuration: 99 }), 'magnetDuration'), maxTier('magnetDuration'));
  assert.equal(tierOf({ coins: 0 }, 'magnetDuration'), 0);             // no upgrades key
  assert.equal(tierOf(freshSave(0, { magnetDuration: 'x' }), 'magnetDuration'), 0);
});

test('nextCost walks the cost ladder and returns null when maxed', () => {
  const s = freshSave();
  assert.equal(nextCost(s, 'magnetDuration'), 80);
  s.upgrades.magnetDuration = 1;
  assert.equal(nextCost(s, 'magnetDuration'), 200);
  s.upgrades.magnetDuration = 3;
  assert.equal(nextCost(s, 'magnetDuration'), null);
});

test('canBuy: maxed and poor reasons', () => {
  assert.deepEqual(canBuy(freshSave(0, { magnetDuration: 3 }), 'magnetDuration'), { ok: false, reason: 'maxed' });
  assert.deepEqual(canBuy(freshSave(79), 'magnetDuration'), { ok: false, reason: 'poor' });
  assert.deepEqual(canBuy(freshSave(80), 'magnetDuration'), { ok: true, reason: null });
});

test('buyUpgrade spends exactly once and increments the tier', () => {
  const s = freshSave(300);
  assert.equal(buyUpgrade(s, 'magnetDuration'), true);   // -80
  assert.equal(s.coins, 220);
  assert.equal(s.upgrades.magnetDuration, 1);
  assert.equal(buyUpgrade(s, 'magnetDuration'), true);   // -200
  assert.equal(s.coins, 20);
  assert.equal(buyUpgrade(s, 'magnetDuration'), false);  // poor (450 > 20)
  assert.equal(s.coins, 20);
  assert.equal(s.upgrades.magnetDuration, 2);
});

test('effectsOf: tier 0 equals current behavior', () => {
  assert.deepEqual(effectsOf(freshSave()), {
    magnetDurationBonus: 0,
    gearDurationBonus: 0,
    dashCooldown: DASH_COOLDOWN,
    coinValueMultiplier: 1,
    startingRevives: 0,
  });
});

test('effectsOf: additive math and dash floor', () => {
  const e = effectsOf(freshSave(0, {
    magnetDuration: 2, gearDuration: 3, dashCooldown: 3, startingRevives: 2, coinValue: 3,
  }));
  assert.equal(e.magnetDurationBonus, 3.0);
  assert.equal(e.gearDurationBonus, 3.5999999999999996); // 3 * 1.2
  assert.equal(e.dashCooldown, Math.max(0.20, DASH_COOLDOWN - 0.15));
  assert.equal(e.coinValueMultiplier, 1.75);
  assert.equal(e.startingRevives, 2);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/shop.test.js`
Expected: FAIL — cannot find module `../src/meta/shop.js`.

- [ ] **Step 3: Create `src/meta/shop.js`**:

```js
import { spend } from './economy.js';
import { DASH_COOLDOWN } from '../data/constants.js';

// Catalog is data; costs/curves are launch values tuned here and nowhere else.
export const UPGRADES = {
  magnetDuration:  { name: 'Magnet+',    costs: [80, 200, 450],  effectLine: '+1.5s magnet per tier' },
  gearDuration:    { name: 'Gear+',      costs: [80, 200, 450],  effectLine: '+1.2s gear per tier' },
  dashCooldown:    { name: 'Quick Dash', costs: [100, 250, 500], effectLine: '−0.05s dash cooldown per tier' },
  startingRevives: { name: 'Guardian',   costs: [300, 700],      effectLine: 'start each run with +1 revive' },
  coinValue:       { name: 'Gold Rush',  costs: [150, 400, 800], effectLine: '+25% coin SCORE per tier' },
};

export function maxTier(id) { return UPGRADES[id].costs.length; }

// Junk-tolerant tier read: non-integers/negatives/unknown shapes read as 0;
// values above the ladder clamp to maxTier.
export function tierOf(saveData, id) {
  const t = saveData.upgrades?.[id];
  return Number.isInteger(t) && t > 0 ? Math.min(t, maxTier(id)) : 0;
}

export function nextCost(saveData, id) {
  const t = tierOf(saveData, id);
  return t >= maxTier(id) ? null : UPGRADES[id].costs[t];
}

export function canBuy(saveData, id) {
  const cost = nextCost(saveData, id);
  if (cost === null) return { ok: false, reason: 'maxed' };
  if (saveData.coins < cost) return { ok: false, reason: 'poor' };
  return { ok: true, reason: null };
}

export function buyUpgrade(saveData, id) {
  const check = canBuy(saveData, id);
  if (!check.ok) return false;
  spend(saveData, nextCost(saveData, id));
  saveData.upgrades[id] = tierOf(saveData, id) + 1;
  return true;
}

// Run-start snapshot, additive over base constants. coinValueMultiplier is a
// SCORE multiplier only — wallet banking uses raw coin counts (see bankRun).
export function effectsOf(saveData) {
  return {
    magnetDurationBonus: tierOf(saveData, 'magnetDuration') * 1.5,
    gearDurationBonus: tierOf(saveData, 'gearDuration') * 1.2,
    dashCooldown: Math.max(0.20, DASH_COOLDOWN - tierOf(saveData, 'dashCooldown') * 0.05),
    coinValueMultiplier: 1 + tierOf(saveData, 'coinValue') * 0.25,
    startingRevives: tierOf(saveData, 'startingRevives'),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/shop.test.js` → PASS (7). Then `npm test` → ALL PASS (104).

- [ ] **Step 5: Commit**

```bash
git add src/meta/shop.js tests/shop.test.js
git commit -m "feat: shop catalog + purchase rules + effects snapshot (pure)"
```

---

### Task 3: Save schema v3 with tier sanitization

**Files:**
- Modify: `src/meta/save.js`
- Test: `tests/save.test.js` (append)

- [ ] **Step 1: Append failing tests** to `tests/save.test.js` (check its imports first; it imports from `../src/meta/save.js` — extend that import list if needed with `defaults, migrate`):

```js
test('v3 defaults include named upgrade tiers at 0', () => {
  const d = defaults();
  assert.equal(d.version, 3);
  assert.deepEqual(d.upgrades, {
    magnetDuration: 0, gearDuration: 0, dashCooldown: 0, startingRevives: 0, coinValue: 0,
  });
  assert.deepEqual(d.unlocks, []);        // reserved container kept
  assert.deepEqual(d.missions, {});       // reserved container kept
});

test('v2 -> v3 preserves coins/highScore/stats/unlocks and fills tiers', () => {
  const v2 = {
    version: 2, highScore: 563, coins: 41, unlocks: ['capRed'], upgrades: {}, missions: {},
    stats: { runs: 9, coinsBankedTotal: 41, distanceTotalM: 1200, smashesTotal: 30, bestComboCount: 4 },
  };
  const m = migrate(v2);
  assert.equal(m.version, 3);
  assert.equal(m.highScore, 563);
  assert.equal(m.coins, 41);
  assert.deepEqual(m.unlocks, ['capRed']);
  assert.equal(m.upgrades.magnetDuration, 0);
  assert.equal(m.stats.runs, 9);
});

test('v1 -> v3 chain still works', () => {
  const m = migrate({ version: 1, highScore: 77 });
  assert.equal(m.version, 3);
  assert.equal(m.highScore, 77);
  assert.equal(m.upgrades.coinValue, 0);
});

test('tier sanitization: junk localStorage cannot break shop state', () => {
  const m = migrate({
    version: 3, highScore: 1, coins: 10, unlocks: [], missions: {}, stats: {},
    upgrades: {
      magnetDuration: '2',        // string -> floor/clamp or 0 (must be integer in 0..max)
      gearDuration: NaN,          // NaN -> 0
      dashCooldown: -5,           // negative -> 0
      startingRevives: 99,        // over max -> clamped to 2
      coinValue: 1.7,             // float -> integer 0..max
      hacked: 12,                 // unknown key -> dropped
    },
  });
  for (const v of Object.values(m.upgrades)) {
    assert.ok(Number.isInteger(v) && v >= 0);
  }
  assert.equal(m.upgrades.gearDuration, 0);
  assert.equal(m.upgrades.dashCooldown, 0);
  assert.equal(m.upgrades.startingRevives, 2);     // maxTier('startingRevives')
  assert.equal('hacked' in m.upgrades, false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/save.test.js`
Expected: new tests FAIL (version is 2; upgrades not deep-filled).

- [ ] **Step 3: Implement in `src/meta/save.js`**:

Add the import at top:
```js
import { UPGRADES } from './shop.js';
```
Change `CURRENT_VERSION` to `3`. In `defaults()`, replace `upgrades: {}` with:
```js
    upgrades: upgradeDefaults(),
```
Add the two helpers (above `defaults()`):
```js
function upgradeDefaults() {
  const out = {};
  for (const id of Object.keys(UPGRADES)) out[id] = 0;
  return out;
}

// Known keys only; integer, finite, clamped 0..maxTier. Junk (strings, NaN,
// negatives, floats, absurd numbers) becomes a safe clamped value or 0.
function sanitizeTiers(raw) {
  const out = {};
  for (const id of Object.keys(UPGRADES)) {
    const n = Math.floor(Number(raw?.[id]));
    out[id] = Number.isFinite(n) && n > 0 ? Math.min(n, UPGRADES[id].costs.length) : 0;
  }
  return out;
}
```
Add the 2→3 migrator to `MIGRATIONS` (fillDefaults does the deep work):
```js
  2: (s) => ({ ...s, version: 3 }),
```
In `fillDefaults`, replace the `upgrades:` line with:
```js
    upgrades: sanitizeTiers(data.upgrades),
```

Note: numeric strings like `'2'` floor to a valid integer — that is "a safe clamped value", allowed by the spec. The test above accepts either via the generic integer/range loop; the named assertions only pin unambiguous junk.

- [ ] **Step 4: Run tests**

Run: `node --test tests/save.test.js` → PASS. Then `npm test` → ALL PASS (108).

- [ ] **Step 5: Commit**

```bash
git add src/meta/save.js tests/save.test.js
git commit -m "feat: save v3 — named upgrade tiers, sanitized migration, reserved containers kept"
```

---

### Task 4: Powerups take effects (`createPowerups(effects)`)

**Files:**
- Modify: `src/game/powerups.js`
- Test: `tests/powerups.test.js` (append)

- [ ] **Step 1: Append failing tests**:

```js
test('createPowerups stores effect-adjusted durations and starting revives', () => {
  const s = createPowerups({ magnetDurationBonus: 3, gearDurationBonus: 2.4, startingRevives: 2 });
  assert.equal(s.revives, 2);
  activate(s, 'magnet');
  assert.equal(s.magnet, 9);     // MAGNET_DURATION 6 + 3
  activate(s, 'gear');
  assert.equal(s.gear, 7.4);     // GEAR_DURATION 5 + 2.4
});

test('createPowerups without effects matches current behavior', () => {
  const s = createPowerups();
  assert.equal(s.revives, 0);
  activate(s, 'magnet');
  assert.equal(s.magnet, 6);
  activate(s, 'gear');
  assert.equal(s.gear, 5);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/powerups.test.js`
Expected: first new test FAILS (revives 0, durations base).

- [ ] **Step 3: Implement.** In `src/game/powerups.js`, replace `createPowerups` and `activate`:

```js
// effects is the run-start snapshot from shop.effectsOf(); omitted in tests
// that exercise base behavior.
export function createPowerups(effects = null) {
  return {
    gear: 0, magnet: 0, multiplier: 0, mercy: 0,
    revives: effects?.startingRevives ?? 0,
    config: {
      gearDuration: GEAR_DURATION + (effects?.gearDurationBonus ?? 0),
      magnetDuration: MAGNET_DURATION + (effects?.magnetDurationBonus ?? 0),
    },
  };
}

export function activate(s, type) {
  if (type === 'revive') { s.revives += 1; return; }
  if (type === 'gear') s.gear = s.config.gearDuration;
  else if (type === 'magnet') s.magnet = s.config.magnetDuration;
  else if (type === 'mult') s.multiplier = MULTIPLIER_DURATION;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/powerups.test.js` → PASS. Then `npm test` → ALL PASS (110).

- [ ] **Step 5: Commit**

```bash
git add src/game/powerups.js tests/powerups.test.js
git commit -m "feat: powerups read durations/revives from run-start effects"
```

---

### Task 5: Player dash cooldown + coin score multiplier

**Files:**
- Modify: `src/game/player.js` (signature + one constant use), `src/game/scoring.js` (addCoin)
- Test: `tests/player.test.js`, `tests/scoring.test.js` (append; check each file's existing imports and extend as needed)

- [ ] **Step 1: Append failing tests.** To `tests/player.test.js`:

```js
test('updatePlayer uses the provided dash cooldown', () => {
  const p = createPlayer();
  updatePlayer(p, { dashPressed: true, jumpPressed: false, jumpHeld: false, slidePressed: false }, 1 / 60, 0.20);
  assert.equal(p.state, 'dashing');
  assert.equal(p.dashCooldown, 0.20);
});

test('updatePlayer defaults to base DASH_COOLDOWN', () => {
  const p = createPlayer();
  updatePlayer(p, { dashPressed: true, jumpPressed: false, jumpHeld: false, slidePressed: false }, 1 / 60);
  assert.equal(p.dashCooldown, 0.35);
});
```

To `tests/scoring.test.js`:

```js
test('addCoin applies coinValueMultiplier to SCORE only, raw count unchanged', () => {
  const s = createScore();
  addCoin(s, 2, 1.75);              // combo mult 2, Gold Rush x1.75
  assert.equal(s.coins, 1);         // raw pickup count — what bankRun banks
  assert.equal(s.bonus, 35);        // COIN_SCORE 10 * 2 * 1.75
});

test('addCoin default multiplier preserves current behavior', () => {
  const s = createScore();
  addCoin(s, 3);
  assert.equal(s.bonus, 30);
});
```

- [ ] **Step 2: Run to verify failures**

Run: `node --test tests/player.test.js tests/scoring.test.js`
Expected: new tests FAIL (extra args ignored / wrong cooldown… the player test fails on `p.dashCooldown` 0.35 vs 0.20; scoring fails on bonus 20 vs 35).

- [ ] **Step 3: Implement.** In `src/game/player.js` change the signature and the dash-start line:

```js
export function updatePlayer(player, actions, dt, dashCooldown = DASH_COOLDOWN) {
```
and inside the dash-start block replace `player.dashCooldown = DASH_COOLDOWN;` with:
```js
    player.dashCooldown = dashCooldown;
```

In `src/game/scoring.js` replace `addCoin`:
```js
export function addCoin(score, multiplier, coinValueMultiplier = 1) {
  score.coins += 1;
  score.bonus += COIN_SCORE * multiplier * coinValueMultiplier;
}
```

- [ ] **Step 4: Run + Gold Rush wallet-isolation test.** Append to `tests/economy.test.js` (it already imports `makeRunSummary, bankRun`; extend imports with `createScore, addCoin` from `../src/game/scoring.js`):

```js
test('Gold Rush never inflates the wallet: bankRun banks raw coin count', () => {
  const score = createScore();
  addCoin(score, 1, 1.75); addCoin(score, 1, 1.75);   // 2 pickups with Gold Rush
  const saveData = { coins: 0, stats: { runs: 0, coinsBankedTotal: 0, distanceTotalM: 0, smashesTotal: 0, bestComboCount: 0 } };
  const banked = bankRun(saveData, makeRunSummary(score, 0));
  assert.equal(banked, 2);            // raw count, not score-multiplied
  assert.equal(saveData.coins, 2);
});
```

Run: `npm test` → ALL PASS (115).

- [ ] **Step 5: Commit**

```bash
git add src/game/player.js src/game/scoring.js tests/player.test.js tests/scoring.test.js tests/economy.test.js
git commit -m "feat: dash cooldown + coin score multiplier from effects; pin Gold Rush wallet isolation"
```

---

### Task 6: `main.js` wires the effects snapshot

**Files:**
- Modify: `src/main.js` (imports, `newRun()`, two call sites in `update()`)

No new unit test (pure modules are covered; end-to-end lands in Task 8's acceptance). The suite must stay green and the game must still boot.

- [ ] **Step 1: Implement.** In `src/main.js`:

Add to imports:
```js
import { effectsOf } from './meta/shop.js';
```
In `newRun()`, compute the snapshot and store it on the run:
```js
function newRun() {
  const seed = (Date.now() ^ (runCounter++ * 2654435761)) >>> 0;
  const rng = createRng(seed);
  const effects = effectsOf(saveData);          // run-start snapshot; never re-read mid-run
  run = {
    rng,
    effects,
    player: createPlayer(),
    world: createWorld(rng),
    score: createScore(),
    combo: createCombo(),
    powerups: createPowerups(effects),
    elapsed: 0,
    maxComboCount: 0,
  };
}
```
In `update()`, change the two call sites:
```js
  updatePlayer(run.player, actions, dt, run.effects.dashCooldown);
```
```js
        addCoin(run.score, multiplier(run.combo) * scoreMultiplier(run.powerups), run.effects.coinValueMultiplier);
```

- [ ] **Step 2: Verify**

Run: `npm test` → ALL PASS. Then boot check: `npm run assemble:web && python3 -m http.server 8080 -d www &` … open `http://localhost:8080` OR run the quick headless check:
```bash
cd ~/elastic-raider-promo && node -e "
import('playwright').then(async ({ chromium }) => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8080'); await p.waitForTimeout(1500);
  console.log(errs.length ? errs : 'boot OK'); await b.close(); process.exit(errs.length ? 1 : 0);
});"
```
Expected: `boot OK`. Kill the server after.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: run-start effects snapshot wired through newRun"
```

---

### Task 7: `#playfield` wrapper + overlay styles

**Files:**
- Modify: `index.html`, `src/main.js` (resize())

- [ ] **Step 1: Implement `index.html`.** Replace the `<body>` block and extend the styles:

```html
<body>
  <div id="playfield">
    <canvas id="game"></canvas>
    <div id="overlay" hidden></div>
  </div>
  <script type="module" src="./src/main.js"></script>
</body>
```

Add to the `<style>` block (keep existing rules):

```css
#playfield { position: relative; }
#overlay {
  position: absolute; inset: 0; z-index: 10;
  background: rgba(11, 16, 32, 0.92);
  color: #e8ecf8; overflow-y: auto;
  font-family: system-ui, sans-serif;
}
#overlay .panel { max-width: 640px; margin: 0 auto; padding: 20px 16px; }
#overlay h2 { margin: 0 0 4px; font-size: 26px; letter-spacing: 2px; }
#overlay .wallet { color: #ffcf3f; margin-bottom: 14px; font-size: 16px; }
#overlay .row {
  display: flex; align-items: center; gap: 12px;
  background: rgba(255,255,255,0.06); border-radius: 10px;
  padding: 12px 14px; margin-bottom: 10px;
}
#overlay .row .info { flex: 1; min-width: 0; }
#overlay .row .name { font-weight: 700; font-size: 16px; }
#overlay .row .effect { font-size: 13px; opacity: 0.75; }
#overlay .row .pips { font-size: 12px; letter-spacing: 2px; color: #7CFC9B; }
#overlay button.buy {
  min-width: 96px; min-height: 44px; border: 0; border-radius: 8px;
  background: #ffcf3f; color: #0b1020; font-weight: 700; font-size: 15px;
}
#overlay button.buy:disabled { background: #3a4060; color: #9aa3c0; }
#overlay .close {
  position: absolute; top: 10px; right: 12px; min-width: 44px; min-height: 44px;
  border: 0; border-radius: 8px; background: rgba(255,255,255,0.12);
  color: #e8ecf8; font-size: 18px;
}
#shop-open {
  position: absolute; top: 10px; right: 12px; z-index: 5;
  min-height: 44px; padding: 0 14px; border: 0; border-radius: 8px;
  background: rgba(255, 207, 63, 0.92); color: #0b1020;
  font: 700 15px system-ui, sans-serif;
}
#shop-open[hidden] { display: none; }
```

- [ ] **Step 2: Size the wrapper in `src/main.js` `resize()`** — the canvas keeps its own sizing; the wrapper matches it so `#overlay` (inset: 0) aligns with the letterboxed playfield:

```js
const playfield = document.getElementById('playfield');
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = VIEW.W * dpr;
  canvas.height = VIEW.H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Fit the 16:9 playfield into the viewport without distortion (letterbox).
  const fit = Math.min(window.innerWidth / VIEW.W, window.innerHeight / VIEW.H);
  canvas.style.width = `${VIEW.W * fit}px`;
  canvas.style.height = `${VIEW.H * fit}px`;
  playfield.style.width = canvas.style.width;
  playfield.style.height = canvas.style.height;
}
```
(`const playfield` goes next to the existing `const canvas` lookup.)

- [ ] **Step 3: Verify** — `npm test` (no canvas tests touch this) and re-run the Task 6 boot check (assemble + headless load): `boot OK`, game letterboxed exactly as before.

- [ ] **Step 4: Commit**

```bash
git add index.html src/main.js
git commit -m "feat: playfield wrapper + overlay/shop-button styles (letterbox-aligned)"
```

---

### Task 8: Shop overlay (`src/ui/overlay.js`) + main wiring

**Files:**
- Create: `src/ui/overlay.js`
- Modify: `src/main.js`

- [ ] **Step 1: Create `src/ui/overlay.js`** — the ONLY DOM-owning module; no game rules:

```js
import { UPGRADES, tierOf, nextCost, canBuy, buyUpgrade, maxTier } from '../meta/shop.js';

// DOM shop overlay. Hard input-hygiene requirements (spec):
// 1. All pointer/touch/click/key events stop at the panel — they must never
//    reach createInput(window)'s listeners.
// 2. input.clear() on BOTH open and close.
// deps: { root, openButton, saveData, persist, input }
export function createOverlay({ root, openButton, saveData, persist, input }) {
  let open = false;

  const STOP_EVENTS = [
    'pointerdown', 'pointerup', 'touchstart', 'touchend', 'touchmove',
    'click', 'keydown', 'keyup',
  ];
  for (const ev of STOP_EVENTS) {
    root.addEventListener(ev, (e) => e.stopPropagation());
    openButton.addEventListener(ev, (e) => e.stopPropagation());
  }

  function rowHtml(id) {
    const u = UPGRADES[id];
    const tier = tierOf(saveData, id);
    const cost = nextCost(saveData, id);
    const check = canBuy(saveData, id);
    const pips = '●'.repeat(tier) + '○'.repeat(maxTier(id) - tier);
    const label = check.ok ? `${cost} \u{1FA99}` : check.reason === 'maxed' ? 'MAX' : `${cost} \u{1FA99}`;
    return `
      <div class="row" data-id="${id}">
        <div class="info">
          <div class="name">${u.name} <span class="pips">${pips}</span></div>
          <div class="effect">${u.effectLine}${check.reason === 'poor' ? ' — not enough coins' : ''}</div>
        </div>
        <button class="buy" data-id="${id}" ${check.ok ? '' : 'disabled'}>${label}</button>
      </div>`;
  }

  function render() {
    root.innerHTML = `
      <div class="panel">
        <button class="close" aria-label="Close shop">✕</button>
        <h2>SHOP</h2>
        <div class="wallet">\u{1FA99} ${saveData.coins} coins</div>
        ${Object.keys(UPGRADES).map(rowHtml).join('')}
      </div>`;
    root.querySelector('.close').addEventListener('click', hide);
    for (const btn of root.querySelectorAll('button.buy')) {
      btn.addEventListener('click', () => {
        if (buyUpgrade(saveData, btn.dataset.id)) { persist(); render(); }
      });
    }
  }

  function show() { open = true; input.clear(); render(); root.hidden = false; }
  function hide() { open = false; root.hidden = true; input.clear(); }

  openButton.addEventListener('click', show);

  return {
    isOpen: () => open,
    show,
    hide,
    setButtonVisible(visible) { openButton.hidden = !visible || open; },
  };
}
```

- [ ] **Step 2: Wire into `src/main.js`.**

Add import:
```js
import { createOverlay } from './ui/overlay.js';
```
Create the open button + overlay after `const input = createInput(window);` (the button is DOM owned by the overlay layer; main only places it in the playfield):
```js
const shopButton = document.createElement('button');
shopButton.id = 'shop-open';
shopButton.textContent = '\u{1F6D2} SHOP';
playfield.appendChild(shopButton);
const overlay = createOverlay({
  root: document.getElementById('overlay'),
  openButton: shopButton,
  saveData,
  persist: () => save(storage, saveData),
  input,
});
```
At the very top of `update(dt)`, after `const actions = input.consume();`, add the overlay gate (defense in depth behind stopPropagation + clear):
```js
  overlay.setButtonVisible(game.mode === MODES.MENU || game.mode === MODES.GAMEOVER);
  if (overlay.isOpen()) return;        // snapshot already consumed and discarded
```

Scope note: the spec's "menu/game-over show a 🛒 SHOP hint" is fulfilled by this DOM button itself (visible exactly in those modes); `src/ui/screens.js` stays untouched — no canvas hint line is added.

- [ ] **Step 3: Verify** — `npm test` ALL PASS; boot check `boot OK`; manual click-through (serve `www/` and click 🛒 SHOP: panel opens, ✕ closes, no run starts).

- [ ] **Step 4: Commit**

```bash
git add src/ui/overlay.js src/main.js
git commit -m "feat: shop overlay UI with event isolation and input.clear() hygiene"
```

---

### Task 9: Playwright acceptance suite

**Files:**
- Create: `/Users/raditio.ghifiardigmail.com/elastic-raider-promo/shop-acceptance.mjs` (lives with the existing Playwright install, NOT in the zero-dep repo)

- [ ] **Step 1: Create the script** (serves repo `www/` with the same hook trick as `record2.mjs` to read game mode):

```js
// Acceptance for Phase 3b shop (spec checks 1-6). Run: node shop-acceptance.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = '/Users/raditio.ghifiardigmail.com/elastic-raider/www';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const HOOK = `\nwindow.__er = { get mode() { return game.mode; }, get run() { return run; } };\n`;

const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    let body = await readFile(join(ROOT, path));
    if (path === '/src/main.js') body = Buffer.concat([body, Buffer.from(HOOK)]);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(8125, r));

const SAVE_KEY = 'elastic-raider:save';
const richSave = JSON.stringify({
  version: 3, highScore: 0, coins: 500, unlocks: [], missions: {},
  upgrades: { magnetDuration: 0, gearDuration: 0, dashCooldown: 0, startingRevives: 0, coinValue: 0 },
  stats: { runs: 0, coinsBankedTotal: 0, distanceTotalM: 0, smashesTotal: 0, bestComboCount: 0 },
});

let failures = 0;
const check = (name, ok) => { console.log(ok ? `PASS ${name}` : `FAIL ${name}`); if (!ok) failures++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
// Seed ONLY if absent — initScript runs on every navigation and must not
// clobber state that checks 3b/5 verify across reloads.
await ctx.addInitScript(([k, v]) => {
  if (!localStorage.getItem(k)) localStorage.setItem(k, v);
}, [SAVE_KEY, richSave]);
const page = await ctx.newPage();
await page.goto('http://localhost:8125/');
await page.waitForTimeout(1200);

// 1. Open shop; tap panel center: no run starts behind it
await page.click('#shop-open');
await page.waitForTimeout(200);
await page.click('#overlay .panel');
await page.waitForTimeout(400);
check('1 panel tap cannot start a run', await page.evaluate(() => window.__er.mode === 'menu'));

// 2. Close does not itself start a run (one frame and one second after)
await page.click('#overlay .close');
await page.waitForTimeout(50);
const justAfter = await page.evaluate(() => window.__er.mode);
await page.waitForTimeout(1000);
const oneSecAfter = await page.evaluate(() => window.__er.mode);
check('2 close does not start a run', justAfter === 'menu' && oneSecAfter === 'menu');

// 3. Buy persists across reload (Guardian tier 1 costs 300; wallet 500 -> 200)
await page.click('#shop-open');
await page.click('button.buy[data-id="startingRevives"]');
await page.waitForTimeout(200);
const walletText = await page.textContent('#overlay .wallet');
check('3a wallet drops by exact cost', walletText.includes('200'));
await page.reload();
await page.waitForTimeout(1200);
await page.click('#shop-open');
const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('elastic-raider:save')));
check('3b tier + wallet persisted', persisted.upgrades.startingRevives === 1 && persisted.coins === 200);

// 4. Insufficient coins disables with reason (Guardian tier 2 = 700 > 200)
const poorBtn = await page.$('button.buy[data-id="startingRevives"]');
check('4 poor disables purchase', await poorBtn.isDisabled());

// 5. Maxed disables: set magnetDuration to max via storage and reload
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('elastic-raider:save'));
  s.upgrades.magnetDuration = 3; s.coins = 10000;
  localStorage.setItem('elastic-raider:save', JSON.stringify(s));
});
await page.reload();
await page.waitForTimeout(1200);
await page.click('#shop-open');
const maxedBtn = await page.$('button.buy[data-id="magnetDuration"]');
check('5 maxed disables purchase', await maxedBtn.isDisabled() &&
  (await maxedBtn.textContent()).includes('MAX'));

// 6. Effects apply at newRun: Guardian tier 1 -> run starts with 1 revive
await page.click('#overlay .close');
await page.waitForTimeout(200);
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })));
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })));
await page.waitForTimeout(300);
check('6 startingRevives applied at run start', await page.evaluate(
  () => window.__er.mode === 'playing' && window.__er.run.powerups.revives === 1));

await browser.close();
server.close();
console.log(failures ? `\n${failures} FAILURES` : '\nALL ACCEPTANCE CHECKS PASS');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it**

```bash
cd /Users/raditio.ghifiardigmail.com/elastic-raider && npm run assemble:web
cd ~/elastic-raider-promo && node shop-acceptance.mjs
```
Expected: `ALL ACCEPTANCE CHECKS PASS` (exit 0). Any FAIL → fix the implementation (not the check), re-run.

- [ ] **Step 3: Commit** (acceptance script lives outside the repo; commit any fixes it forced):

```bash
cd /Users/raditio.ghifiardigmail.com/elastic-raider
git status -s   # commit only if fixes were needed
```

---

### Task 10: Final verification + PR

- [ ] **Step 1: Full suite + sweep**

```bash
cd /Users/raditio.ghifiardigmail.com/elastic-raider
npm test                                            # ALL PASS (115)
grep -rn "reviveCapacity\|consumables" src/ tests/ || echo "clean"   # deferred names absent
```

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin feat/shop-upgrades
gh pr create --base main \
  --title "feat: shop + persistent upgrades (Phase 3b)" \
  --body "Implements docs/superpowers/specs/2026-06-11-shop-upgrades-design.md — the wallet finally buys something. Pure shop/save logic + DOM overlay with hard input isolation. Consumables and missions deferred per spec."
```

- [ ] **Step 3: Post-merge** — merging to `main` auto-deploys the web version via the Pages workflow; verify `https://ghifiardi.github.io/elastic-raider/` shows the 🛒 SHOP button on the menu.
