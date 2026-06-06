# Elastic Raider — Phase 2 (Power-ups + Tuning) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four in-run power-ups (Gear, Magnet, Multiplier, Revive) to the Phase 1 endless runner, plus an early-difficulty tuning pass so the first ~20–30s is fair — all keeping the zero-dependency, no-build, pure-logic-is-unit-tested architecture.

**Architecture:** A new **pure** `game/powerups.js` owns one state object (`{gear, magnet, multiplier, mercy, revives}`) with mutators (`activate`/`tick`), pure queries (`gearActive`, `isInvincible`, `magnetActive`, `scoreMultiplier`, `consumeRevive`, `speedScale`), and a pure `magnetPull`. Pickups are new floating entities emitted occasionally by the spawner. `main.js` wires it: pickup collision → `activate`; the score multiplier becomes `combo × scoreMultiplier`; death is gated by `isInvincible` and routed through a `fatal()` helper that tries `consumeRevive` (no points) before `endRun`; effective speed is `runSpeed × speedScale`. Browser layers gain pickup visuals, active-effect indicators, and sfx.

**Tech Stack:** Vanilla JS (ES modules), HTML5 Canvas, Web Audio, `node --test`. No new dependencies.

**Branch:** `feat/phase2-powerups` (Phase 1 is on `main`; 51 tests currently pass).

**Spec:** `docs/superpowers/specs/2026-06-06-elastic-raider-phase2-powerups-design.md`

**Key boundaries (do not violate):**
- `game/powerups.js` is **PURE** — no `window`, `document`, Canvas, or timers.
- `main.js` must **NOT** read `powerups.mercy` directly — it uses `speedScale()` and `isInvincible()`.
- **Revive awards no points.** Mercy invincibility neither smashes nor scores.
- **Gear** auto-smashes **marines only**; crates are *phased* (no death, no points); gaps ignored.
- Coins remain **run score only** — no persistence changes (`save.js` untouched).
- OUT of scope: shop/characters/upgrades/missions (Phase 3); biomes/settings/Capacitor (Phase 4).

---

## File Structure

```
NEW  src/game/powerups.js     PURE: power-up state, mutators, queries, magnetPull
MOD  src/data/constants.js    + tuning (SAFE_RUNWAY_M, gentler ramp) + power-up constants
MOD  src/game/entities.js     + four floating pickup types
MOD  src/game/spawner.js      + safe-runway hazard gating + weighted power-up emission
MOD  src/game/world.js        + scroll spawner.nextPowerupX with the world
MOD  src/main.js              + powerups wiring (tick, pickups, multiplier, fatal(), magnet, speed)
MOD  src/engine/render.js     + pickup visuals, player glow, magnet ring
MOD  src/ui/screens.js        + revive count + active-effect badges in HUD
MOD  src/engine/audio.js      + powerup + revive sfx
NEW  tests/powerups.test.js   unit tests for powerups.js
MOD  tests/spawner.test.js    + runway + power-up emission tests; widen allowed-types set
MOD  tests/index.html         + power-up parity checks
```

**Module API contract for `game/powerups.js` (keep names exact across tasks):**
- `createPowerups() → {gear, magnet, multiplier, mercy, revives}` (timers in seconds; `revives` is a count)
- `activate(s, type)` — `type ∈ 'gear'|'magnet'|'mult'|'revive'`; sets timer to its duration, or `revives += 1`
- `tick(s, dt)` — decrements `gear/magnet/multiplier/mercy` toward 0 (not `revives`)
- `gearActive(s) → bool` (`gear > 0`)
- `isInvincible(s) → bool` (`gear > 0 || mercy > 0`)
- `magnetActive(s) → bool` (`magnet > 0`)
- `scoreMultiplier(s) → number` (`MULTIPLIER_VALUE` while active, else `1`)
- `consumeRevive(s) → bool` (if `revives>0`: decrement, set `mercy=MERCY_DURATION`, return true; else false)
- `speedScale(s) → number` (1 with no mercy; eases `REVIVE_SPEED_EASE→1` over the mercy window)
- `magnetPull(entities, playerBox, dt)` — pulls in-radius coins toward the player (mutates coin x/y)

---

## Task 1: Early-difficulty tuning (safe runway + gentler ramp)

**Files:**
- Modify: `src/data/constants.js`
- Modify: `src/game/spawner.js`
- Test: `tests/spawner.test.js`

- [ ] **Step 1: Add the failing tests to `tests/spawner.test.js`**

Append these imports/usages. At the top, extend the existing constants import to include `SAFE_RUNWAY_M` (add it to the existing `from '../src/data/constants.js'` line), and add these tests at the end of the file:

```js
test('no hazards spawn during the safe runway (distanceM < SAFE_RUNWAY_M)', () => {
  const s = createSpawner(createRng(3));
  const out = spawnAhead(s, 960, 0); // distance 0 → runway
  const hazards = out.filter((e) => ['marine', 'crate', 'gap'].includes(e.type));
  assert.equal(hazards.length, 0);
  assert.ok(out.length >= 1); // runway still produces coins
});

test('hazards appear once past the safe runway', () => {
  const s = createSpawner(createRng(3));
  const out = spawnAhead(s, 960, SAFE_RUNWAY_M + 50);
  const hazards = out.filter((e) => ['marine', 'crate', 'gap'].includes(e.type));
  assert.ok(hazards.length >= 1);
});
```

Update the import line near the top of `tests/spawner.test.js` from:
```js
import { RUN_SPEED_START, RUN_SPEED_MAX, GROUND_Y } from '../src/data/constants.js';
```
to:
```js
import { RUN_SPEED_START, RUN_SPEED_MAX, GROUND_Y, SAFE_RUNWAY_M } from '../src/data/constants.js';
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/elastic-raider && node --test tests/spawner.test.js`
Expected: FAIL — `SAFE_RUNWAY_M` is `undefined` (import resolves to undefined), so `spawnAhead(s, 960, undefined + 50)` and the runway comparison misbehave; the new tests fail.

- [ ] **Step 3: Add tuning constants to `src/data/constants.js`**

Change the run-speed ramp to be gentler and add the runway constant. Replace:
```js
export const RUN_SPEED_RAMP = 8;    // px/s added per second survived
```
with:
```js
export const RUN_SPEED_RAMP = 6;    // px/s added per second survived (gentler early ramp)
```
Then add, right after the `RUN_SPEED_RAMP` line:
```js
// Hazard-free opening so the first seconds are fair (meters of cumulative travel).
export const SAFE_RUNWAY_M = 18;
```

- [ ] **Step 4: Gate hazards behind the runway in `src/game/spawner.js`**

Replace the whole `spawnAhead` function with this version (adds `SAFE_RUNWAY_M` import + runway gating; also simplifies the redundant gap-width ternary flagged in Phase 1 review):

First, extend the import at the top of `spawner.js`:
```js
import {
  RUN_SPEED_START, RUN_SPEED_MAX, RUN_SPEED_RAMP, VIEW, SAFE_RUNWAY_M,
} from '../data/constants.js';
```
Then replace `spawnAhead`:
```js
// Emit entities to fill space up to (frontierX + VIEW.W). Difficulty (distanceM)
// shrinks the gap between obstacles. During the safe runway, only coins spawn.
export function spawnAhead(spawner, frontierX, distanceM) {
  const out = [];
  const limit = frontierX + VIEW.W;
  const minGap = Math.max(220, 420 - distanceM * 0.5);
  const isRunway = distanceM < SAFE_RUNWAY_M;
  if (spawner.nextSpawnX < frontierX) spawner.nextSpawnX = frontierX;
  while (spawner.nextSpawnX < limit) {
    const roll = spawner.rng.next();
    const type = isRunway ? 'coin'
      : roll < 0.4 ? 'marine' : roll < 0.65 ? 'crate' : roll < 0.8 ? 'gap' : 'coin';
    out.push(makeEntity(type, spawner.nextSpawnX));
    const gap = minGap + spawner.rng.int(0, 180);
    spawner.nextSpawnX += SIZES[type].w + gap;
  }
  return out;
}
```

- [ ] **Step 5: Run to verify the new tests pass and nothing regressed**

Run: `cd ~/elastic-raider && node --test`
Expected: PASS — all suites (51 prior + 2 new spawner tests = 53). The existing spawner tests still pass (`distanceM=0` runway yields coins; the determinism, frontier, and known-types tests are unaffected).

- [ ] **Step 6: Commit**

```bash
cd ~/elastic-raider
git add src/data/constants.js src/game/spawner.js tests/spawner.test.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: early-difficulty tuning (safe runway + gentler ramp)"
```

---

## Task 2: Power-up constants

**Files:**
- Modify: `src/data/constants.js`

> No new behavior yet — these constants are consumed by Tasks 3–6. No test of its own; covered by later tasks.

- [ ] **Step 1: Append power-up constants to `src/data/constants.js`** (after the existing scoring/combo block, before or after `pxToMeters`)

```js
// Power-ups
export const GEAR_DURATION = 5;        // s of invincibility + marine auto-smash
export const MAGNET_DURATION = 6;      // s of coin attraction
export const MULTIPLIER_DURATION = 8;  // s of score multiplier
export const MERCY_DURATION = 1.5;     // s of post-revive invincibility
export const MULTIPLIER_VALUE = 2;     // score-multiplier power-up factor
export const MAGNET_RADIUS = 220;      // px coins are pulled within
export const MAGNET_PULL_SPEED = 620;  // px/s coins move toward the player
export const REVIVE_SPEED_EASE = 0.4;  // run speed eases to this fraction right after a revive

// Power-up spawn cadence (world px between pickups) — roughly 1 per 8–12s
export const POWERUP_FIRST_OFFSET = 1400;
export const POWERUP_GAP_PX = 3600;
export const POWERUP_GAP_JITTER = 2000;
```

- [ ] **Step 2: Verify it parses**

Run: `cd ~/elastic-raider && node --check src/data/constants.js && node --test`
Expected: parses; 53/53 still pass.

- [ ] **Step 3: Commit**

```bash
git add src/data/constants.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: power-up tuning constants"
```

---

## Task 3: Pure power-up logic (`game/powerups.js`)

**Files:**
- Create: `src/game/powerups.js`
- Test: `tests/powerups.test.js`

- [ ] **Step 1: Write the failing test `tests/powerups.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPowerups, activate, tick, gearActive, isInvincible, magnetActive,
  scoreMultiplier, consumeRevive, speedScale, magnetPull,
} from '../src/game/powerups.js';
import {
  GEAR_DURATION, MAGNET_DURATION, MULTIPLIER_DURATION, MERCY_DURATION,
  MULTIPLIER_VALUE, REVIVE_SPEED_EASE, MAGNET_RADIUS,
} from '../src/data/constants.js';

test('fresh state is all zero', () => {
  assert.deepEqual(createPowerups(), { gear: 0, magnet: 0, multiplier: 0, mercy: 0, revives: 0 });
});

test('activate sets each timer / increments revives', () => {
  const s = createPowerups();
  activate(s, 'gear');   assert.equal(s.gear, GEAR_DURATION);
  activate(s, 'magnet'); assert.equal(s.magnet, MAGNET_DURATION);
  activate(s, 'mult');   assert.equal(s.multiplier, MULTIPLIER_DURATION);
  activate(s, 'revive'); activate(s, 'revive'); assert.equal(s.revives, 2);
});

test('re-activating refreshes duration (no stacking)', () => {
  const s = createPowerups();
  activate(s, 'gear'); tick(s, 2); activate(s, 'gear');
  assert.equal(s.gear, GEAR_DURATION); // refreshed, not 2*GEAR_DURATION
});

test('tick decrements timers and clamps at 0; revives untouched', () => {
  const s = createPowerups();
  activate(s, 'magnet'); activate(s, 'revive');
  tick(s, MAGNET_DURATION + 1);
  assert.equal(s.magnet, 0);
  assert.equal(s.revives, 1);
});

test('gearActive only during gear; isInvincible during gear OR mercy', () => {
  const s = createPowerups();
  activate(s, 'gear');
  assert.equal(gearActive(s), true);
  assert.equal(isInvincible(s), true);
  tick(s, GEAR_DURATION + 0.1); // gear gone
  assert.equal(gearActive(s), false);
  assert.equal(isInvincible(s), false);
  consumeRevive(s); // (no revive) → false, no mercy
  s.revives = 1; consumeRevive(s); // now mercy on
  assert.equal(gearActive(s), false);
  assert.equal(isInvincible(s), true); // mercy alone
});

test('magnetActive + scoreMultiplier reflect timers', () => {
  const s = createPowerups();
  assert.equal(magnetActive(s), false);
  assert.equal(scoreMultiplier(s), 1);
  activate(s, 'magnet'); activate(s, 'mult');
  assert.equal(magnetActive(s), true);
  assert.equal(scoreMultiplier(s), MULTIPLIER_VALUE);
});

test('consumeRevive decrements, starts mercy, returns true; false when empty', () => {
  const s = createPowerups();
  assert.equal(consumeRevive(s), false);
  s.revives = 2;
  assert.equal(consumeRevive(s), true);
  assert.equal(s.revives, 1);
  assert.equal(s.mercy, MERCY_DURATION);
});

test('speedScale: 1 without mercy, eases from REVIVE_SPEED_EASE back to 1', () => {
  const s = createPowerups();
  assert.equal(speedScale(s), 1);
  s.revives = 1; consumeRevive(s);
  assert.ok(Math.abs(speedScale(s) - REVIVE_SPEED_EASE) < 1e-9); // start of mercy
  tick(s, MERCY_DURATION / 2);
  const mid = speedScale(s);
  assert.ok(mid > REVIVE_SPEED_EASE && mid < 1);
  tick(s, MERCY_DURATION); // mercy expired
  assert.equal(speedScale(s), 1);
});

test('magnetPull moves an in-radius coin toward the player; ignores others', () => {
  const pb = { x: 180, y: 396, w: 48, h: 64 }; // center ~ (204, 428)
  const near = { type: 'coin', x: 320, y: 410, w: 24, h: 24, collected: false };
  const far  = { type: 'coin', x: 900, y: 100, w: 24, h: 24, collected: false };
  const crate = { type: 'crate', x: 320, y: 410, w: 44, h: 44 };
  const farBefore = far.x, crateBefore = crate.x;
  const nearBefore = near.x;
  magnetPull([near, far, crate], pb, 1 / 60);
  assert.ok(near.x < nearBefore);   // pulled left toward player center
  assert.equal(far.x, farBefore);   // outside MAGNET_RADIUS, untouched
  assert.equal(crate.x, crateBefore); // non-coin untouched
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/elastic-raider && node --test tests/powerups.test.js`
Expected: FAIL — cannot find module `../src/game/powerups.js`.

- [ ] **Step 3: Implement `src/game/powerups.js`**

```js
import {
  GEAR_DURATION, MAGNET_DURATION, MULTIPLIER_DURATION, MERCY_DURATION,
  MULTIPLIER_VALUE, MAGNET_RADIUS, MAGNET_PULL_SPEED, REVIVE_SPEED_EASE,
} from '../data/constants.js';

export function createPowerups() {
  return { gear: 0, magnet: 0, multiplier: 0, mercy: 0, revives: 0 };
}

export function activate(s, type) {
  if (type === 'revive') { s.revives += 1; return; }
  if (type === 'gear') s.gear = GEAR_DURATION;
  else if (type === 'magnet') s.magnet = MAGNET_DURATION;
  else if (type === 'mult') s.multiplier = MULTIPLIER_DURATION;
}

export function tick(s, dt) {
  if (s.gear > 0) s.gear = Math.max(0, s.gear - dt);
  if (s.magnet > 0) s.magnet = Math.max(0, s.magnet - dt);
  if (s.multiplier > 0) s.multiplier = Math.max(0, s.multiplier - dt);
  if (s.mercy > 0) s.mercy = Math.max(0, s.mercy - dt);
}

export function gearActive(s) { return s.gear > 0; }
export function isInvincible(s) { return s.gear > 0 || s.mercy > 0; }
export function magnetActive(s) { return s.magnet > 0; }
export function scoreMultiplier(s) { return s.multiplier > 0 ? MULTIPLIER_VALUE : 1; }

export function consumeRevive(s) {
  if (s.revives <= 0) return false;
  s.revives -= 1;
  s.mercy = MERCY_DURATION;
  return true;
}

// During mercy, run speed eases from REVIVE_SPEED_EASE back to 1 as mercy runs down.
export function speedScale(s) {
  if (s.mercy <= 0) return 1;
  const t = 1 - s.mercy / MERCY_DURATION; // 0 at the start of mercy → 1 at its end
  return REVIVE_SPEED_EASE + (1 - REVIVE_SPEED_EASE) * t;
}

// Pull in-radius coins toward the player. Mutates coin x/y. Caller invokes only
// when magnetActive(s) is true. Non-coins and out-of-radius coins are untouched.
export function magnetPull(entities, playerBox, dt) {
  const cx = playerBox.x + playerBox.w / 2;
  const cy = playerBox.y + playerBox.h / 2;
  const step = MAGNET_PULL_SPEED * dt;
  for (const e of entities) {
    if (e.type !== 'coin' || e.collected) continue;
    const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
    const dx = cx - ex, dy = cy - ey;
    const dist = Math.hypot(dx, dy);
    if (dist === 0 || dist > MAGNET_RADIUS) continue;
    const move = Math.min(step, dist);
    e.x += (dx / dist) * move;
    e.y += (dy / dist) * move;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ~/elastic-raider && node --test tests/powerups.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/powerups.js tests/powerups.test.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: pure power-up state, queries, speedScale, magnetPull"
```

---

## Task 4: Power-up pickup entities (`game/entities.js`)

**Files:**
- Modify: `src/game/entities.js`
- Test: `tests/spawner.test.js`

- [ ] **Step 1: Add the failing test to `tests/spawner.test.js`** (append)

```js
test('makeEntity creates floating power-up pickups with sizes', () => {
  for (const t of ['gear', 'magnet', 'mult', 'revive']) {
    const e = makeEntity(t, 700);
    assert.equal(e.w, SIZES[t].w);
    assert.equal(e.h, SIZES[t].h);
    assert.equal(e.y, GROUND_Y - 120); // floats like a coin
    assert.equal(e.collected, false);
  }
});
```
(`makeEntity`, `SIZES`, `GROUND_Y` are already imported in this test file.)

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/elastic-raider && node --test tests/spawner.test.js`
Expected: FAIL — `SIZES.gear` is undefined, so `e.w` is undefined and the y check fails (pickup falls into the `else` ground branch).

- [ ] **Step 3: Update `src/game/entities.js`**

Replace the whole file:
```js
import { GROUND_Y } from '../data/constants.js';

export const SIZES = {
  marine: { w: 40, h: 56 },
  crate:  { w: 44, h: 44 },
  gap:    { w: 120, h: 0 },
  coin:   { w: 24, h: 24 },
  gear:   { w: 28, h: 28 },
  magnet: { w: 28, h: 28 },
  mult:   { w: 28, h: 28 },
  revive: { w: 28, h: 28 },
};

// Entities that float at coin height rather than resting on the ground.
const FLOATING = new Set(['coin', 'gear', 'magnet', 'mult', 'revive']);

// type ∈ marine|crate|gap|coin|gear|magnet|mult|revive. x is the left edge in world space.
export function makeEntity(type, x) {
  const size = SIZES[type];
  let y;
  if (type === 'gap') y = GROUND_Y;
  else if (FLOATING.has(type)) y = GROUND_Y - 120;
  else y = GROUND_Y - size.h;
  return { type, x, y, w: size.w, h: size.h, dead: false, collected: false };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ~/elastic-raider && node --test tests/spawner.test.js`
Expected: PASS (the new pickup test + all prior spawner tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/entities.js tests/spawner.test.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: floating power-up pickup entities"
```

---

## Task 5: Weighted power-up emission (`game/spawner.js`, `game/world.js`)

**Files:**
- Modify: `src/game/spawner.js`
- Modify: `src/game/world.js`
- Test: `tests/spawner.test.js`

- [ ] **Step 1: Add failing tests + widen the existing allowed-types set in `tests/spawner.test.js`**

First, **update the existing** `'only known entity types are produced'` test's allowed set to include the four pickups:
```js
test('only known entity types are produced', () => {
  const s = createSpawner(createRng(99));
  const types = new Set();
  for (let i = 0; i < 50; i++) spawnAhead(s, s.nextSpawnX, i * 100).forEach((e) => types.add(e.type));
  for (const t of types) assert.ok(
    ['marine', 'crate', 'gap', 'coin', 'gear', 'magnet', 'mult', 'revive'].includes(t));
});
```

Then append these new tests:
```js
test('createSpawner seeds a power-up cursor ahead of the screen', () => {
  const s = createSpawner(createRng(1));
  assert.ok(typeof s.nextPowerupX === 'number');
  assert.ok(s.nextPowerupX > 960); // beyond the first screen
});

test('power-ups eventually spawn and are drawn from the allowed set', () => {
  const s = createSpawner(createRng(5));
  const kinds = [];
  // Advance far past the first power-up cursor over several calls.
  for (let i = 0; i < 40; i++) {
    spawnAhead(s, s.nextSpawnX, 100 + i * 100).forEach((e) => {
      if (['gear', 'magnet', 'mult', 'revive'].includes(e.type)) kinds.push(e.type);
    });
  }
  assert.ok(kinds.length >= 3, `expected several power-ups, got ${kinds.length}`);
  for (const k of kinds) assert.ok(['gear', 'magnet', 'mult', 'revive'].includes(k));
});

test('power-up emission is deterministic for a seed', () => {
  const collect = (seed) => {
    const s = createSpawner(createRng(seed));
    const out = [];
    for (let i = 0; i < 30; i++) spawnAhead(s, s.nextSpawnX, 100 + i * 100)
      .filter((e) => ['gear', 'magnet', 'mult', 'revive'].includes(e.type))
      .forEach((e) => out.push(e.type));
    return out;
  };
  assert.deepEqual(collect(7), collect(7));
});

test('revive is the rarest power-up over a large sample', () => {
  const s = createSpawner(createRng(13));
  const count = { gear: 0, magnet: 0, mult: 0, revive: 0 };
  for (let i = 0; i < 300; i++) spawnAhead(s, s.nextSpawnX, 100 + i * 100)
    .forEach((e) => { if (e.type in count) count[e.type]++; });
  assert.ok(count.revive < count.magnet, JSON.stringify(count));
  assert.ok(count.revive < count.mult, JSON.stringify(count));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/elastic-raider && node --test tests/spawner.test.js`
Expected: FAIL — `s.nextPowerupX` is undefined; no power-up entities are emitted yet.

- [ ] **Step 3: Update `src/game/spawner.js`** — add the power-up cursor + weighted emission

Extend the import to include the cadence constants:
```js
import {
  RUN_SPEED_START, RUN_SPEED_MAX, RUN_SPEED_RAMP, VIEW, SAFE_RUNWAY_M,
  POWERUP_FIRST_OFFSET, POWERUP_GAP_PX, POWERUP_GAP_JITTER,
} from '../data/constants.js';
```
Replace `createSpawner`:
```js
export function createSpawner(rng) {
  return { rng, nextSpawnX: VIEW.W, nextPowerupX: VIEW.W + POWERUP_FIRST_OFFSET };
}
```
Add this helper above `spawnAhead`:
```js
// Weighted power-up kind: Magnet/Multiplier common, Gear uncommon, Revive rarest.
function pickPowerup(rng) {
  const r = rng.next();
  return r < 0.35 ? 'magnet' : r < 0.70 ? 'mult' : r < 0.90 ? 'gear' : 'revive';
}
```
Replace `spawnAhead` (now also emits a power-up whenever the cursor crosses `nextPowerupX`):
```js
// Emit entities to fill space up to (frontierX + VIEW.W). Difficulty (distanceM)
// shrinks the gap between obstacles. During the safe runway, only coins spawn.
// Power-ups are emitted on their own cadence (nextPowerupX), independent of obstacles.
export function spawnAhead(spawner, frontierX, distanceM) {
  const out = [];
  const limit = frontierX + VIEW.W;
  const minGap = Math.max(220, 420 - distanceM * 0.5);
  const isRunway = distanceM < SAFE_RUNWAY_M;
  if (spawner.nextSpawnX < frontierX) spawner.nextSpawnX = frontierX;
  while (spawner.nextSpawnX < limit) {
    if (spawner.nextSpawnX >= spawner.nextPowerupX) {
      out.push(makeEntity(pickPowerup(spawner.rng), spawner.nextPowerupX));
      spawner.nextPowerupX += POWERUP_GAP_PX + spawner.rng.int(0, POWERUP_GAP_JITTER);
    }
    const roll = spawner.rng.next();
    const type = isRunway ? 'coin'
      : roll < 0.4 ? 'marine' : roll < 0.65 ? 'crate' : roll < 0.8 ? 'gap' : 'coin';
    out.push(makeEntity(type, spawner.nextSpawnX));
    const gap = minGap + spawner.rng.int(0, 180);
    spawner.nextSpawnX += SIZES[type].w + gap;
  }
  return out;
}
```

- [ ] **Step 4: Scroll the power-up cursor with the world — `src/game/world.js`**

In `updateWorld`, immediately after the line `world.spawner.nextSpawnX -= move;`, add:
```js
  world.spawner.nextPowerupX -= move;
```
(So the power-up cursor stays in the same scrolling coordinate frame as obstacles and entities.)

- [ ] **Step 5: Run to verify pass + full suite**

Run: `cd ~/elastic-raider && node --test`
Expected: PASS — spawner suite (existing + new power-up tests) and all others. World tests still pass (the new line only decrements an extra field).

- [ ] **Step 6: Commit**

```bash
git add src/game/spawner.js src/game/world.js tests/spawner.test.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: weighted power-up emission + scrolling power-up cursor"
```

---

## Task 6: Integration — wire power-ups into the game loop (`src/main.js`)

**Files:**
- Modify: `src/main.js`

> Browser integration; no unit test. Verified in the preview in Task 10. Replace the whole file.

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
import { recordHighScore, load } from './meta/save.js';

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
let run = null;
let runCounter = 0;
let highScore = load(storage).highScore;
let lastResult = { score: 0, isNewBest: false };

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
  };
}

function beginPlaying() {
  audio.unlock();
  newRun();
  start(game);
}

function endRun() {
  const finalScore = total(run.score);
  const prevBest = highScore;
  highScore = recordHighScore(storage, finalScore);
  lastResult = { score: finalScore, isNewBest: finalScore > prevBest && finalScore > 0 };
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
    screens.menu();
    return;
  }
  renderer.background(run.world.traveledPx);
  renderer.ground(run.world.entities);
  renderer.entitiesLayer(run.world.entities);
  if (magnetActive(run.powerups)) renderer.magnetRing(playerBox(run.player));
  renderer.player(run.player, isInvincible(run.powerups));
  screens.hud(total(run.score), multiplier(run.combo), highScore, {
    revives: run.powerups.revives,
    scoreMult: scoreMultiplier(run.powerups),
  });
  if (game.mode === MODES.GAMEOVER) screens.gameOver(lastResult.score, highScore, lastResult.isNewBest);
}

createLoop({ update, render }).start();
```

- [ ] **Step 2: Static checks**

Run: `cd ~/elastic-raider && node --check src/main.js && node --test`
Expected: parses; 53/53 unit tests still pass (main.js has no unit tests).

> Note: `render()` calls `renderer.magnetRing(...)` and `renderer.player(p, invincible)` and `screens.hud(..., {revives, scoreMult})` — these signatures are implemented in Tasks 7 and 8. The game will not fully render correctly until those land; that is expected. Do not browser-test until Task 8 is done (Task 10 covers it).

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: wire power-ups into the game loop (pickups, multiplier, fatal/revive, magnet, speed)"
```

---

## Task 7: Pickup visuals + active-effect indicators (`engine/render.js`)

**Files:**
- Modify: `src/engine/render.js`

> Browser-only. Verified in Task 10. Replace the whole file.

- [ ] **Step 1: Replace `src/engine/render.js`**

```js
import { VIEW, GROUND_Y, PLAYER, DASH_REACH, MAGNET_RADIUS } from '../data/constants.js';

const COLORS = {
  sky: '#0b1020', skyBand: '#16224a', ground: '#2b1d12', groundTop: '#5a3c22',
  player: '#e8d7a0', dash: '#ffd34d', marine: '#3f6fb0', crate: '#8a5a2b',
  gap: '#0b1020', coin: '#ffcf3f', text: '#f5efe0',
  gear: '#ff7043', magnet: '#46c2ff', mult: '#b388ff', revive: '#ff5d8f',
  glow: '#ffe07a', ring: '#46c2ff',
};

const PICKUP_COLOR = { gear: COLORS.gear, magnet: COLORS.magnet, mult: COLORS.mult, revive: COLORS.revive };

export function createRenderer(ctx) {
  function clear() { ctx.fillStyle = COLORS.sky; ctx.fillRect(0, 0, VIEW.W, VIEW.H); }

  function background(traveledPx) {
    const off = (traveledPx * 0.2) % VIEW.W;
    ctx.fillStyle = COLORS.skyBand;
    for (let i = -1; i < 3; i++) {
      const x = i * 320 - off;
      ctx.fillRect(x, 180, 220, 120);
    }
  }

  function ground(entities) {
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, GROUND_Y, VIEW.W, VIEW.H - GROUND_Y);
    ctx.fillStyle = COLORS.groundTop;
    ctx.fillRect(0, GROUND_Y, VIEW.W, 6);
    ctx.fillStyle = COLORS.gap;
    for (const e of entities) if (e.type === 'gap') ctx.fillRect(e.x, GROUND_Y, e.w, VIEW.H - GROUND_Y);
  }

  function entitiesLayer(entities) {
    for (const e of entities) {
      if (e.type === 'gap') continue;
      if (e.type === 'coin') {
        ctx.fillStyle = COLORS.coin;
        ctx.beginPath(); ctx.arc(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, 0, Math.PI * 2); ctx.fill();
      } else if (PICKUP_COLOR[e.type]) {
        // Power-up pickup: filled diamond in its theme color.
        const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2;
        ctx.fillStyle = PICKUP_COLOR[e.type];
        ctx.beginPath();
        ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = e.type === 'marine' ? COLORS.marine : COLORS.crate;
        ctx.fillRect(e.x, e.y, e.w, e.h);
      }
    }
  }

  // Faint ring showing the magnet's pull radius, centered on the player.
  function magnetRing(playerBox) {
    const cx = playerBox.x + playerBox.w / 2, cy = playerBox.y + playerBox.h / 2;
    ctx.save();
    ctx.globalAlpha = 0.25; ctx.strokeStyle = COLORS.ring; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, MAGNET_RADIUS, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function player(p, invincible = false) {
    if (invincible) {
      ctx.save();
      ctx.globalAlpha = 0.5; ctx.fillStyle = COLORS.glow;
      ctx.fillRect(p.x - 6, p.y - p.height - 6, PLAYER.w + 12, p.height + 12);
      ctx.restore();
    }
    ctx.fillStyle = p.state === 'dashing' ? COLORS.dash : COLORS.player;
    ctx.fillRect(p.x, p.y - p.height, PLAYER.w, p.height);
    if (p.state === 'dashing') {
      ctx.globalAlpha = 0.4;
      ctx.fillRect(p.x + PLAYER.w, p.y - p.height, DASH_REACH, p.height);
      ctx.globalAlpha = 1;
    }
  }

  function text(str, x, y, size = 24, align = 'left') {
    ctx.fillStyle = COLORS.text; ctx.font = `${size}px system-ui, sans-serif`; ctx.textAlign = align;
    ctx.fillText(str, x, y);
  }

  return { clear, background, ground, entitiesLayer, magnetRing, player, text };
}
```

- [ ] **Step 2: Static check**

Run: `cd ~/elastic-raider && node --check src/engine/render.js && node --test`
Expected: parses; 53/53 still pass.

- [ ] **Step 3: Commit**

```bash
git add src/engine/render.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: render power-up pickups, player glow, magnet ring"
```

---

## Task 8: HUD effect badges + power-up sfx (`ui/screens.js`, `engine/audio.js`)

**Files:**
- Modify: `src/ui/screens.js`
- Modify: `src/engine/audio.js`

> Browser-only. Verified in Task 10.

- [ ] **Step 1: Replace `src/ui/screens.js`** (extend `hud` to take a 4th object with `revives` + `scoreMult`; show a Revive count and a ×N SCORE badge; show the combo badge from multiplier ≥ 2)

```js
import { VIEW } from '../data/constants.js';

export function createScreens(renderer) {
  function menu() {
    renderer.text('ELASTIC RAIDER', VIEW.W / 2, VIEW.H / 2 - 40, 48, 'center');
    renderer.text('Tap / Space to start', VIEW.W / 2, VIEW.H / 2 + 10, 22, 'center');
    renderer.text('↑/Space jump · ↓ slide · X/→ dash-smash', VIEW.W / 2, VIEW.H / 2 + 44, 18, 'center');
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

  function gameOver(score, highScore, isNewBest) {
    renderer.text('WRECKED', VIEW.W / 2, VIEW.H / 2 - 50, 44, 'center');
    renderer.text(`Score ${score}`, VIEW.W / 2, VIEW.H / 2, 26, 'center');
    renderer.text(isNewBest ? 'NEW BEST!' : `Best ${highScore}`, VIEW.W / 2, VIEW.H / 2 + 34, 20, 'center');
    renderer.text('Tap / Space to run again', VIEW.W / 2, VIEW.H / 2 + 74, 20, 'center');
  }

  return { menu, hud, gameOver };
}
```

- [ ] **Step 2: Add sfx to `src/engine/audio.js`** — add `powerup` and `revive` to the returned object (insert after the `coin:` line, before `death:`):

```js
    powerup: () => { blip(700, 0.10, 'triangle'); setTimeout(() => blip(1040, 0.12, 'triangle'), 60); },
    revive:  () => { blip(440, 0.16, 'sine', 0.09); setTimeout(() => blip(660, 0.22, 'sine', 0.09), 100); },
```

- [ ] **Step 3: Static checks**

Run: `cd ~/elastic-raider && node --check src/ui/screens.js src/engine/audio.js && node --test`
Expected: parses; 53/53 still pass.

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens.js src/engine/audio.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: HUD effect badges + revive count + power-up/revive sfx"
```

---

## Task 9: Browser test-page parity checks (`tests/index.html`)

**Files:**
- Modify: `tests/index.html`

- [ ] **Step 1: Add power-up checks to `tests/index.html`**

In the `<script type="module">`, add to the imports:
```js
import { createPowerups, activate, gearActive, isInvincible, scoreMultiplier, consumeRevive } from '../src/game/powerups.js';
```
Then add these checks right before the summary block (`const sum = ...`):
```js
const pu = createPowerups();
activate(pu, 'gear');
check('gear → invincible + gearActive', gearActive(pu) && isInvincible(pu));
activate(pu, 'mult');
check('mult → scoreMultiplier 2', scoreMultiplier(pu) === 2);
const pr = createPowerups(); pr.revives = 1;
check('consumeRevive true then false', consumeRevive(pr) === true && consumeRevive(pr) === false);
```

- [ ] **Step 2: Confirm Node suite unaffected**

Run: `cd ~/elastic-raider && node --test`
Expected: 53/53 (the HTML page adds no Node tests). Browser parity verified in Task 10.

- [ ] **Step 3: Commit**

```bash
git add tests/index.html
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "test: power-up parity checks in the browser test page"
```

---

## Task 10: Acceptance + preview playtest

**Files:** none (verification only)

- [ ] **Step 1: Full Node suite**

Run: `cd ~/elastic-raider && node --test`
Expected: all pass (53 — 51 Phase 1 + powerups suite + new spawner tests; exact count may differ as tests were appended, but 0 failures).

- [ ] **Step 2: Browser test page** — serve the folder and open `/tests/`; expect all rows green including the three new power-up checks.

- [ ] **Step 3: Preview playtest** (controller drives via the preview tools). Verify against the spec:
- [ ] **Fair opening:** the first ~18m are hazard-free (only coins/power-ups); the first obstacle is clearable with a normal jump.
- [ ] **Pickups spawn** occasionally as colored diamonds; collecting each plays the power-up sfx.
- [ ] **Gear:** while active the player glows, marines are auto-smashed for points, crates pass through harmlessly (no death, no points), and water gaps don't kill.
- [ ] **Magnet:** a faint ring appears; nearby coins curve toward the player.
- [ ] **Multiplier:** the `x2 SCORE` badge shows and coin/smash scoring is visibly higher (combo × 2).
- [ ] **Revive:** with a Revive held, a fatal hit is survived (no points for it), `Revive xN` decrements, and ~1.5s of mercy invincibility + a brief speed ease-down follow.
- [ ] **No console errors.**

- [ ] **Step 4 (only if a tuning constant needs adjustment):** tweak values in `src/data/constants.js` (e.g. `SAFE_RUNWAY_M`, `POWERUP_GAP_PX`, `MAGNET_RADIUS`), re-verify, and commit with `chore: tune Phase 2 constants from playtest`.

---

## Spec coverage check (self-review)

- Early-difficulty tuning (safe runway + gentler ramp), deterministic min-gap test → Task 1. ✓
- Power-up constants → Task 2. ✓
- Pure `powerups.js` (state, activate/tick, gearActive, isInvincible, magnetActive, scoreMultiplier, consumeRevive, speedScale, magnetPull) + tests → Task 3. ✓
- Floating pickup entities → Task 4. ✓
- Weighted power-up emission (Magnet/Mult common, Gear uncommon, Revive rarest), deterministic + cursor scroll → Task 5. ✓
- Integration: pickup→activate; multiplier = combo×scoreMultiplier; marine smashed by dash OR gear; crates phased while invincible; death gated by isInvincible; `fatal()` = consumeRevive(no points) else endRun; speed = runSpeed×speedScale; magnetPull when active → Task 6. ✓
- Render: pickups + player glow + magnet ring → Task 7. ✓
- HUD revive count + ×N badge; power-up + revive sfx → Task 8. ✓
- Browser parity checks → Task 9. ✓
- Acceptance + playtest → Task 10. ✓
- Boundaries: `powerups.js` pure (Task 3); `main.js` uses `speedScale()`/`isInvincible()` and never reads `mercy` directly (Task 6); Revive non-scoring (Task 6 `fatal()`); coins still run-score only, `save.js` untouched. ✓
- Out of scope (shop/missions/Capacitor): no tasks create them. ✓
```
