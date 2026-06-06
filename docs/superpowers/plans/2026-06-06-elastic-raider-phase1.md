# Elastic Raider — Phase 1 (Web MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, fun, replayable web endless-runner: auto-run, jump/slide/dash-smash combat with a combo multiplier, ≥3 hazard types, coins, scoring, local high score, and a game-over→restart loop — entirely in vanilla JS + Canvas with no build step and no runtime dependencies.

**Architecture:** Pure logic modules (`rng`, `collision`, `scoring`, `combat`, `state`, `save`, `player`, `spawner`, `world`) have no Canvas/DOM/`window` and are unit-tested with Node's built-in `node --test`. Browser-only modules (`loop`, `input`, `render`, `audio`, `screens`, `main`) wire those into the page and are verified visually in the preview. Browser storage is isolated in `meta/storage.js`; `meta/save.js` stays pure by taking an injected `{getItem, setItem}` adapter.

**Tech Stack:** Vanilla JavaScript (ES modules), HTML5 Canvas 2D, Web Audio API, `localStorage`. Tests: Node 18+ built-in test runner (`node:test` + `node:assert`), zero npm dependencies. The same `.js` files load in the browser via `<script type="module">` and in Node via `import`.

**Scope:** Phase 1 only. **OUT of scope:** in-run power-ups, shop, missions, Capacitor/Android. Do not create `powerups.js`, `shop.js`, `missions.js`, or any Capacitor files in this plan.

**Spec:** `docs/superpowers/specs/2026-06-06-elastic-raider-design.md`

---

## File Structure

```
package.json                 {"type":"module","scripts":{"test":"node --test"}} — NO dependencies
index.html                   canvas + module entry (game)
src/
  main.js                    bootstrap: construct modules, run the loop, wire screens
  data/
    constants.js             PURE: tuning constants + a couple of pure helpers (PPM→meters)
  engine/
    rng.js                   PURE: seedable RNG (mulberry32)
    loop.js                  browser: fixed-timestep loop, pause on visibility change
    input.js                 keyboard+touch → action flags; PURE gesture classifier exported
    render.js                browser: Canvas draw helpers + parallax
    audio.js                 browser: procedural Web Audio sfx (gesture-gated)
  game/
    state.js                 PURE: lifecycle state machine (menu/playing/paused/gameover)
    collision.js             PURE: AABB + player/dash hitboxes
    scoring.js               PURE: distance + coins + smashes → points
    combat.js                PURE: combo counter + multiplier
    player.js                PURE: run/jump/slide/dash state machine + physics
    spawner.js               PURE: run-speed curve + deterministic segment generation
    entities.js              PURE: entity factory + sizes
    world.js                 PURE: scroll, spawn-ahead, recycle off-screen entities
  ui/
    screens.js               browser: menu, HUD, game-over (Canvas-drawn)
  meta/
    save.js                  PURE: schema/defaults/migrate/load/save over injected adapter
    storage.js               browser: localStorage adapter + in-memory fallback
tests/
  rng.test.js  collision.test.js  scoring.test.js  combat.test.js
  state.test.js  save.test.js  player.test.js  spawner.test.js
  world.test.js  input.test.js
  index.html                 browser test page (imports the same modules, prints pass/fail)
```

**Module API contract (used across tasks — keep names exact):**

- `createRng(seed) → { next(), int(min,max), pick(arr) }` — `next()`∈[0,1), `int` inclusive.
- `aabb(a,b) → bool`; `playerBox(player) → {x,y,w,h}`; `dashBox(player) → {x,y,w,h}|null`.
- `createScore() → {distance, coins, smashes, bonus}`; `addDistance(s,m)`, `addCoin(s,mult)`, `addSmash(s,mult)` (mutate); `total(s) → number`.
- `createCombo() → {count, timer}`; `registerSmash(c)`, `tickCombo(c,dt)` (mutate); `multiplier(c) → number`.
- `MODES`; `createGame() → {mode}`; `start(g)`, `pause(g)`, `resume(g)`, `gameOver(g)`, `toMenu(g)` → each returns `bool` (true if transitioned).
- `defaults()`, `migrate(raw)`, `load(adapter)`, `save(adapter,data)`, `recordHighScore(adapter,score) → number`.
- `createStorage() → {getItem(k), setItem(k,v)}`.
- `createPlayer() → player`; `updatePlayer(player, actions, dt)` (mutate). `actions = {jumpPressed, jumpHeld, slidePressed, dashPressed}`.
- `runSpeed(elapsedSeconds) → number`; `createSpawner(rng) → spawner`; `spawnAhead(spawner, frontierX, distanceM) → descriptor[]`.
- `makeEntity(type, x) → entity`; `SIZES`.
- `createWorld(rng) → world`; `updateWorld(world, dt, speed)` (mutate).
- `classifyGesture(dx, dy, dtMs) → 'tap'|'up'|'down'|'forward'|'back'`.

---

## Task 1: Project scaffold + canvas shell

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `index.html`
- Create: `src/main.js`
- Create: `src/data/constants.js`

- [ ] **Step 1: Create `package.json`** (no dependencies; `type: module` so Node treats `.js` as ESM)

```json
{
  "name": "elastic-raider",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "serve": "node --version >/dev/null && python3 -m http.server 8080"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.DS_Store
*.log
```

- [ ] **Step 3: Create `src/data/constants.js`**

```js
// Logical render units (canvas is scaled to fit the viewport at draw time).
export const VIEW = { W: 960, H: 540 };
export const GROUND_Y = 460;        // y of the ground surface (top of ground)

// Physics (units: pixels, seconds)
export const GRAVITY = 2400;
export const JUMP_VELOCITY = -900;
export const JUMP_CUT = 0.45;       // velocity kept when jump released while rising

// Run speed curve (px/s of world scroll)
export const RUN_SPEED_START = 320;
export const RUN_SPEED_MAX = 820;
export const RUN_SPEED_RAMP = 8;    // px/s added per second survived

// Player
export const PLAYER = { x: 180, w: 48, hStand: 64, hSlide: 32 };
export const SLIDE_DURATION = 0.5;
export const DASH_DURATION = 0.18;
export const DASH_REACH = 56;       // forward extent of dash hitbox
export const DASH_COOLDOWN = 0.35;

// Scoring / combo
export const PPM = 50;              // pixels per meter
export const COIN_SCORE = 10;
export const SMASH_SCORE = 50;
export const COMBO_WINDOW = 1.5;    // seconds a combo stays alive
export const COMBO_MAX_MULT = 5;

export function pxToMeters(px) { return px / PPM; }
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
  <title>Elastic Raider</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0b1020; overflow: hidden;
      touch-action: none; font-family: system-ui, sans-serif; }
    #game { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <canvas id="game"></canvas>
  <script type="module" src="./src/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: Create `src/main.js`** (temporary shell that proves canvas rendering)

```js
import { VIEW } from './data/constants.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = VIEW.W * dpr;
  canvas.height = VIEW.H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener('resize', resize);

ctx.fillStyle = '#0b1020';
ctx.fillRect(0, 0, VIEW.W, VIEW.H);
ctx.fillStyle = '#e8d7a0';
ctx.font = '32px system-ui, sans-serif';
ctx.textAlign = 'center';
ctx.fillText('Elastic Raider', VIEW.W / 2, VIEW.H / 2);
```

- [ ] **Step 6: Verify in the browser**

Start the preview server on the project root and load `index.html`. Use `preview_screenshot`.
Expected: dark canvas with centered "Elastic Raider" text, no console errors (`preview_console_logs`).

- [ ] **Step 7: Commit**

```bash
cd ~/elastic-raider
git add package.json .gitignore index.html src/main.js src/data/constants.js
git commit -m "feat: project scaffold + canvas shell"
```

---

## Task 2: Seedable RNG (`engine/rng.js`)

**Files:**
- Create: `src/engine/rng.js`
- Test: `tests/rng.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/rng.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/engine/rng.js';

test('same seed produces same sequence', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 5; i++) assert.equal(a.next(), b.next());
});

test('different seeds diverge', () => {
  const a = createRng(1), b = createRng(2);
  assert.notEqual(a.next(), b.next());
});

test('next() stays in [0,1)', () => {
  const r = createRng(7);
  for (let i = 0; i < 100; i++) { const v = r.next(); assert.ok(v >= 0 && v < 1); }
});

test('int(min,max) is inclusive and in range', () => {
  const r = createRng(9); const seen = new Set();
  for (let i = 0; i < 200; i++) { const v = r.int(3, 5); assert.ok(v >= 3 && v <= 5); seen.add(v); }
  assert.deepEqual([...seen].sort(), [3, 4, 5]);
});

test('pick returns an element of the array', () => {
  const r = createRng(11); const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 20; i++) assert.ok(arr.includes(r.pick(arr)));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/elastic-raider && node --test tests/rng.test.js`
Expected: FAIL — cannot find module `../src/engine/rng.js`.

- [ ] **Step 3: Implement `src/engine/rng.js`**

```js
// Deterministic PRNG (mulberry32). Seed is coerced to a 32-bit integer.
export function createRng(seed) {
  let s = (seed >>> 0) || 1;
  function next() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    int(min, max) { return min + Math.floor(next() * (max - min + 1)); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ~/elastic-raider && node --test tests/rng.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/rng.js tests/rng.test.js
git commit -m "feat: seedable deterministic RNG"
```

---

## Task 3: AABB collision + hitboxes (`game/collision.js`)

**Files:**
- Create: `src/game/collision.js`
- Test: `tests/collision.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/collision.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aabb, playerBox, dashBox } from '../src/game/collision.js';
import { PLAYER, GROUND_Y } from '../src/data/constants.js';

test('aabb detects overlap', () => {
  assert.equal(aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
});

test('aabb rejects separated boxes', () => {
  assert.equal(aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }), false);
});

test('aabb treats edge-touching as non-overlap', () => {
  assert.equal(aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false);
});

test('playerBox shrinks height while sliding', () => {
  const standing = playerBox({ x: PLAYER.x, y: GROUND_Y, height: PLAYER.hStand });
  const sliding = playerBox({ x: PLAYER.x, y: GROUND_Y, height: PLAYER.hSlide });
  assert.equal(standing.h, PLAYER.hStand);
  assert.equal(sliding.h, PLAYER.hSlide);
  // box top sits height above the feet (y is the feet line)
  assert.equal(standing.y, GROUND_Y - PLAYER.hStand);
});

test('dashBox is null unless dashing, a forward box when dashing', () => {
  assert.equal(dashBox({ state: 'running', x: PLAYER.x, y: GROUND_Y, height: PLAYER.hStand }), null);
  const box = dashBox({ state: 'dashing', x: PLAYER.x, y: GROUND_Y, height: PLAYER.hStand });
  assert.ok(box.x >= PLAYER.x + PLAYER.w - 1); // starts at/after player's front edge
  assert.ok(box.w > 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/collision.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/game/collision.js`**

```js
import { PLAYER, DASH_REACH } from '../data/constants.js';

// Axis-aligned bounding-box overlap. Boxes: {x, y, w, h}. Edge-touch is NOT overlap.
export function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// player.y is the feet line (ground contact); the box rises `height` above it.
export function playerBox(player) {
  return { x: player.x, y: player.y - player.height, w: PLAYER.w, h: player.height };
}

// Forward "punch" reach, only while dashing.
export function dashBox(player) {
  if (player.state !== 'dashing') return null;
  return {
    x: player.x + PLAYER.w,
    y: player.y - player.height,
    w: DASH_REACH,
    h: player.height,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/collision.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/collision.js tests/collision.test.js
git commit -m "feat: AABB collision + player/dash hitboxes"
```

---

## Task 4: Scoring (`game/scoring.js`)

**Files:**
- Create: `src/game/scoring.js`
- Test: `tests/scoring.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/scoring.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScore, addDistance, addCoin, addSmash, total } from '../src/game/scoring.js';
import { COIN_SCORE, SMASH_SCORE } from '../src/data/constants.js';

test('new score is zeroed', () => {
  const s = createScore();
  assert.deepEqual(s, { distance: 0, coins: 0, smashes: 0, bonus: 0 });
  assert.equal(total(s), 0);
});

test('distance contributes 1 point per whole meter', () => {
  const s = createScore();
  addDistance(s, 3.0); addDistance(s, 0.4);
  assert.equal(s.distance, 3.4);
  assert.equal(total(s), 3); // floor of 3.4
});

test('coins add COIN_SCORE * multiplier and increment count', () => {
  const s = createScore();
  addCoin(s, 1); addCoin(s, 2);
  assert.equal(s.coins, 2);
  assert.equal(s.bonus, COIN_SCORE * 1 + COIN_SCORE * 2);
});

test('smashes add SMASH_SCORE * multiplier and increment count', () => {
  const s = createScore();
  addSmash(s, 3);
  assert.equal(s.smashes, 1);
  assert.equal(s.bonus, SMASH_SCORE * 3);
});

test('total combines floored distance and bonus', () => {
  const s = createScore();
  addDistance(s, 10.9); addCoin(s, 2); addSmash(s, 1);
  assert.equal(total(s), 10 + COIN_SCORE * 2 + SMASH_SCORE * 1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/scoring.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/game/scoring.js`**

```js
import { COIN_SCORE, SMASH_SCORE } from '../data/constants.js';

export function createScore() {
  return { distance: 0, coins: 0, smashes: 0, bonus: 0 };
}
export function addDistance(score, meters) { score.distance += meters; }
export function addCoin(score, multiplier) { score.coins += 1; score.bonus += COIN_SCORE * multiplier; }
export function addSmash(score, multiplier) { score.smashes += 1; score.bonus += SMASH_SCORE * multiplier; }
export function total(score) { return Math.floor(score.distance) + score.bonus; }
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/scoring.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/scoring.js tests/scoring.test.js
git commit -m "feat: run scoring (distance + coins + smashes)"
```

---

## Task 5: Combo multiplier (`game/combat.js`)

**Files:**
- Create: `src/game/combat.js`
- Test: `tests/combat.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/combat.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCombo, registerSmash, tickCombo, multiplier } from '../src/game/combat.js';
import { COMBO_WINDOW, COMBO_MAX_MULT } from '../src/data/constants.js';

test('fresh combo has count 0 and multiplier 1', () => {
  const c = createCombo();
  assert.equal(c.count, 0);
  assert.equal(multiplier(c), 1);
});

test('registerSmash increments count and refreshes timer', () => {
  const c = createCombo();
  registerSmash(c);
  assert.equal(c.count, 1);
  assert.equal(c.timer, COMBO_WINDOW);
});

test('multiplier grows every 3 smashes and caps', () => {
  const c = createCombo();
  for (let i = 0; i < 3; i++) registerSmash(c); // count 3 -> mult 2
  assert.equal(multiplier(c), 2);
  for (let i = 0; i < 100; i++) registerSmash(c);
  assert.equal(multiplier(c), COMBO_MAX_MULT);
});

test('combo resets when the timer runs out', () => {
  const c = createCombo();
  registerSmash(c);
  tickCombo(c, COMBO_WINDOW + 0.01);
  assert.equal(c.count, 0);
  assert.equal(multiplier(c), 1);
});

test('ticking within the window keeps the combo alive', () => {
  const c = createCombo();
  registerSmash(c); registerSmash(c);
  tickCombo(c, COMBO_WINDOW / 2);
  assert.equal(c.count, 2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/combat.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/game/combat.js`**

```js
import { COMBO_WINDOW, COMBO_MAX_MULT } from '../data/constants.js';

export function createCombo() { return { count: 0, timer: 0 }; }

export function registerSmash(combo) {
  combo.count += 1;
  combo.timer = COMBO_WINDOW;
}

export function tickCombo(combo, dt) {
  if (combo.count === 0) return;
  combo.timer -= dt;
  if (combo.timer <= 0) { combo.count = 0; combo.timer = 0; }
}

export function multiplier(combo) {
  return Math.min(COMBO_MAX_MULT, 1 + Math.floor(combo.count / 3));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/combat.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/combat.js tests/combat.test.js
git commit -m "feat: dash-smash combo multiplier"
```

---

## Task 6: Lifecycle state machine (`game/state.js`)

**Files:**
- Create: `src/game/state.js`
- Test: `tests/state.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/state.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, createGame, start, pause, resume, gameOver, toMenu } from '../src/game/state.js';

test('game begins in MENU', () => {
  assert.equal(createGame().mode, MODES.MENU);
});

test('start: menu -> playing', () => {
  const g = createGame();
  assert.equal(start(g), true);
  assert.equal(g.mode, MODES.PLAYING);
});

test('pause/resume only valid while playing/paused', () => {
  const g = createGame();
  assert.equal(pause(g), false);   // can't pause from menu
  start(g);
  assert.equal(pause(g), true);
  assert.equal(g.mode, MODES.PAUSED);
  assert.equal(resume(g), true);
  assert.equal(g.mode, MODES.PLAYING);
});

test('gameOver: playing -> gameover, and start restarts', () => {
  const g = createGame(); start(g);
  assert.equal(gameOver(g), true);
  assert.equal(g.mode, MODES.GAMEOVER);
  assert.equal(start(g), true); // restart from gameover
  assert.equal(g.mode, MODES.PLAYING);
});

test('invalid transitions are no-ops returning false', () => {
  const g = createGame();
  assert.equal(resume(g), false);
  assert.equal(gameOver(g), false);
  assert.equal(toMenu(g), false); // already in menu
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/state.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/game/state.js`**

```js
export const MODES = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };

export function createGame() { return { mode: MODES.MENU }; }

function transition(game, allowedFrom, to) {
  if (!allowedFrom.includes(game.mode)) return false;
  game.mode = to;
  return true;
}

export const start    = (g) => transition(g, [MODES.MENU, MODES.GAMEOVER], MODES.PLAYING);
export const pause    = (g) => transition(g, [MODES.PLAYING], MODES.PAUSED);
export const resume   = (g) => transition(g, [MODES.PAUSED], MODES.PLAYING);
export const gameOver = (g) => transition(g, [MODES.PLAYING], MODES.GAMEOVER);
export const toMenu   = (g) => transition(g, [MODES.PAUSED, MODES.GAMEOVER], MODES.MENU);
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/state.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/state.js tests/state.test.js
git commit -m "feat: game lifecycle state machine"
```

---

## Task 7: Persistence — pure save + storage adapter (`meta/save.js`, `meta/storage.js`)

**Files:**
- Create: `src/meta/save.js`
- Create: `src/meta/storage.js`
- Test: `tests/save.test.js`

- [ ] **Step 1: Write the failing test** (uses a fake adapter; also exercises the in-memory path of `storage.js`)

```js
// tests/save.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, migrate, load, save, recordHighScore } from '../src/meta/save.js';
import { createStorage } from '../src/meta/storage.js';

function fakeAdapter() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

test('defaults shape', () => {
  assert.deepEqual(defaults(), { version: 1, highScore: 0 });
});

test('migrate fills missing fields and stamps version', () => {
  assert.deepEqual(migrate({}), { version: 1, highScore: 0 });
  assert.deepEqual(migrate({ highScore: 50 }), { version: 1, highScore: 50 });
  assert.deepEqual(migrate(null), { version: 1, highScore: 0 });
});

test('load returns defaults when storage empty or corrupt', () => {
  const a = fakeAdapter();
  assert.deepEqual(load(a), defaults());
  a.setItem('elastic-raider:save', '{not json');
  assert.deepEqual(load(a), defaults());
});

test('save then load round-trips', () => {
  const a = fakeAdapter();
  save(a, { version: 1, highScore: 123 });
  assert.equal(load(a).highScore, 123);
});

test('recordHighScore only updates on a new best', () => {
  const a = fakeAdapter();
  assert.equal(recordHighScore(a, 100), 100);
  assert.equal(recordHighScore(a, 80), 100);  // not beaten
  assert.equal(recordHighScore(a, 150), 150); // beaten
  assert.equal(load(a).highScore, 150);
});

test('createStorage falls back to in-memory when localStorage is absent (Node)', () => {
  const s = createStorage();
  s.setItem('k', 'v');
  assert.equal(s.getItem('k'), 'v');
  assert.equal(s.getItem('missing'), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/save.test.js`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement `src/meta/save.js`** (pure — no `window`)

```js
const KEY = 'elastic-raider:save';
const VERSION = 1;

export function defaults() { return { version: VERSION, highScore: 0 }; }

export function migrate(raw) {
  const base = defaults();
  if (!raw || typeof raw !== 'object') return base;
  return { version: VERSION, highScore: Number(raw.highScore) || 0 };
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

export function recordHighScore(adapter, score) {
  const data = load(adapter);
  if (score > data.highScore) { data.highScore = score; save(adapter, data); }
  return data.highScore;
}
```

- [ ] **Step 4: Implement `src/meta/storage.js`** (the only module that touches `localStorage`)

```js
// Returns a {getItem, setItem} adapter. Uses localStorage when usable,
// otherwise an in-memory Map (Node, private-mode failures, quota errors).
export function createStorage() {
  if (localStorageUsable()) {
    return {
      getItem: (k) => { try { return window.localStorage.getItem(k); } catch { return null; } },
      setItem: (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* ignore */ } },
    };
  }
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
  };
}

function localStorageUsable() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const t = '__er_probe__';
    window.localStorage.setItem(t, t);
    window.localStorage.removeItem(t);
    return true;
  } catch { return false; }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/save.test.js`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/meta/save.js src/meta/storage.js tests/save.test.js
git commit -m "feat: pure save schema over injected storage adapter"
```

---

## Task 8: Player physics + state machine (`game/player.js`)

**Files:**
- Create: `src/game/player.js`
- Test: `tests/player.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/player.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer } from '../src/game/player.js';
import { GROUND_Y, PLAYER, JUMP_VELOCITY, SLIDE_DURATION, DASH_DURATION } from '../src/data/constants.js';

const NONE = { jumpPressed: false, jumpHeld: false, slidePressed: false, dashPressed: false };
const tick = (p, a, dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) updatePlayer(p, a, dt); };

test('player starts running on the ground', () => {
  const p = createPlayer();
  assert.equal(p.state, 'running');
  assert.equal(p.onGround, true);
  assert.equal(p.y, GROUND_Y);
  assert.equal(p.height, PLAYER.hStand);
});

test('jump leaves the ground then gravity returns it', () => {
  const p = createPlayer();
  updatePlayer(p, { ...NONE, jumpPressed: true, jumpHeld: true }, 1 / 60);
  assert.equal(p.onGround, false);
  assert.equal(p.state, 'jumping');
  assert.ok(p.vy < 0);
  tick(p, { ...NONE, jumpHeld: true }, 1 / 60, 300); // ~5s of falling
  assert.equal(p.onGround, true);
  assert.equal(p.state, 'running');
  assert.equal(p.y, GROUND_Y);
});

test('cannot double-jump while airborne', () => {
  const p = createPlayer();
  updatePlayer(p, { ...NONE, jumpPressed: true, jumpHeld: true }, 1 / 60);
  const vyAfterFirst = p.vy;
  updatePlayer(p, { ...NONE, jumpPressed: true, jumpHeld: true }, 1 / 60);
  assert.ok(p.vy > vyAfterFirst); // gravity pulled down, no second impulse
});

test('slide lowers height, then auto-stands after SLIDE_DURATION', () => {
  const p = createPlayer();
  updatePlayer(p, { ...NONE, slidePressed: true }, 1 / 60);
  assert.equal(p.state, 'sliding');
  assert.equal(p.height, PLAYER.hSlide);
  tick(p, NONE, 1 / 60, Math.ceil((SLIDE_DURATION + 0.05) * 60));
  assert.equal(p.state, 'running');
  assert.equal(p.height, PLAYER.hStand);
});

test('dash sets dashing state and a cooldown, then ends', () => {
  const p = createPlayer();
  updatePlayer(p, { ...NONE, dashPressed: true }, 1 / 60);
  assert.equal(p.state, 'dashing');
  assert.ok(p.dashCooldown > 0);
  tick(p, NONE, 1 / 60, Math.ceil((DASH_DURATION + 0.02) * 60));
  assert.notEqual(p.state, 'dashing');
});

test('dash on cooldown is ignored', () => {
  const p = createPlayer();
  updatePlayer(p, { ...NONE, dashPressed: true }, 1 / 60); // dash starts
  tick(p, NONE, 1 / 60, Math.ceil((DASH_DURATION + 0.02) * 60)); // dash ends, still cooling
  const before = p.state;
  updatePlayer(p, { ...NONE, dashPressed: true }, 1 / 60);
  assert.equal(p.state, before); // could not re-dash yet
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/player.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/game/player.js`**

```js
import {
  GROUND_Y, PLAYER, GRAVITY, JUMP_VELOCITY, JUMP_CUT,
  SLIDE_DURATION, DASH_DURATION, DASH_COOLDOWN,
} from '../data/constants.js';

export function createPlayer() {
  return {
    x: PLAYER.x, y: GROUND_Y, vy: 0,
    state: 'running', onGround: true, height: PLAYER.hStand,
    slideTimer: 0, dashTimer: 0, dashCooldown: 0, alive: true,
  };
}

export function updatePlayer(player, actions, dt) {
  // Timers
  if (player.dashCooldown > 0) player.dashCooldown = Math.max(0, player.dashCooldown - dt);

  // Dash (independent of ground; cannot start while already dashing or on cooldown)
  if (actions.dashPressed && player.state !== 'dashing' && player.dashCooldown <= 0) {
    player.state = 'dashing';
    player.dashTimer = DASH_DURATION;
    player.dashCooldown = DASH_COOLDOWN;
  }
  if (player.state === 'dashing') {
    player.dashTimer -= dt;
    if (player.dashTimer <= 0) player.state = player.onGround ? 'running' : 'jumping';
  }

  // Slide (only from the ground; not while dashing)
  if (actions.slidePressed && player.onGround && player.state !== 'dashing') {
    player.state = 'sliding';
    player.slideTimer = SLIDE_DURATION;
  }
  if (player.state === 'sliding') {
    player.slideTimer -= dt;
    if (player.slideTimer <= 0) player.state = 'running';
  }

  // Jump (only from the ground; not while sliding/dashing)
  if (actions.jumpPressed && player.onGround &&
      player.state !== 'sliding' && player.state !== 'dashing') {
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
    player.state = 'jumping';
  }
  // Variable jump height: releasing while rising cuts upward velocity once.
  if (!actions.jumpHeld && player.vy < 0) player.vy *= JUMP_CUT;

  // Gravity + vertical integration
  if (!player.onGround) {
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y >= GROUND_Y) {
      player.y = GROUND_Y; player.vy = 0; player.onGround = true;
      if (player.state === 'jumping') player.state = 'running';
    }
  }

  // Collision height derives from state.
  player.height = player.state === 'sliding' ? PLAYER.hSlide : PLAYER.hStand;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/player.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/player.js tests/player.test.js
git commit -m "feat: player run/jump/slide/dash physics state machine"
```

---

## Task 9: Entities + spawner (`game/entities.js`, `game/spawner.js`)

**Files:**
- Create: `src/game/entities.js`
- Create: `src/game/spawner.js`
- Test: `tests/spawner.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/spawner.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEntity, SIZES } from '../src/game/entities.js';
import { runSpeed, createSpawner, spawnAhead } from '../src/game/spawner.js';
import { createRng } from '../src/engine/rng.js';
import { RUN_SPEED_START, RUN_SPEED_MAX, GROUND_Y } from '../src/data/constants.js';

test('makeEntity sets size by type and rests a ground entity on the ground', () => {
  const m = makeEntity('marine', 500);
  assert.equal(m.w, SIZES.marine.w);
  assert.equal(m.h, SIZES.marine.h);
  assert.equal(m.y, GROUND_Y - SIZES.marine.h); // top of a ground-standing box
  assert.equal(m.dead, false);
});

test('runSpeed ramps from start and clamps at max', () => {
  assert.equal(runSpeed(0), RUN_SPEED_START);
  assert.ok(runSpeed(10) > RUN_SPEED_START);
  assert.equal(runSpeed(100000), RUN_SPEED_MAX);
});

test('spawnAhead is deterministic for a given seed', () => {
  const s1 = createSpawner(createRng(123));
  const s2 = createSpawner(createRng(123));
  const a = spawnAhead(s1, 1000, 0);
  const b = spawnAhead(s2, 1000, 0);
  assert.deepEqual(a, b);
});

test('spawnAhead places entities at or beyond the frontier and advances it', () => {
  const s = createSpawner(createRng(7));
  const before = s.nextSpawnX;
  const out = spawnAhead(s, 1000, 0);
  assert.ok(out.length >= 1);
  for (const e of out) assert.ok(e.x >= 1000);
  assert.ok(s.nextSpawnX > before);
});

test('only known entity types are produced', () => {
  const s = createSpawner(createRng(99));
  const types = new Set();
  for (let i = 0; i < 50; i++) spawnAhead(s, s.nextSpawnX, i * 100).forEach((e) => types.add(e.type));
  for (const t of types) assert.ok(['marine', 'crate', 'gap', 'coin'].includes(t));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/spawner.test.js`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement `src/game/entities.js`**

```js
import { GROUND_Y } from '../data/constants.js';

export const SIZES = {
  marine: { w: 40, h: 56 },
  crate:  { w: 44, h: 44 },
  gap:    { w: 120, h: 0 },   // a hole in the ground; h unused
  coin:   { w: 24, h: 24 },
};

// type: 'marine' | 'crate' | 'gap' | 'coin'. x is the left edge in world space.
export function makeEntity(type, x) {
  const size = SIZES[type];
  let y;
  if (type === 'gap') y = GROUND_Y;             // gap lives at the ground line
  else if (type === 'coin') y = GROUND_Y - 120; // floating, reachable by jump
  else y = GROUND_Y - size.h;                   // marine/crate rest on the ground
  return { type, x, y, w: size.w, h: size.h, dead: false, collected: false };
}
```

- [ ] **Step 4: Implement `src/game/spawner.js`**

```js
import {
  RUN_SPEED_START, RUN_SPEED_MAX, RUN_SPEED_RAMP, VIEW,
} from '../data/constants.js';
import { makeEntity, SIZES } from './entities.js';

export function runSpeed(elapsedSeconds) {
  return Math.min(RUN_SPEED_MAX, RUN_SPEED_START + RUN_SPEED_RAMP * elapsedSeconds);
}

export function createSpawner(rng) {
  return { rng, nextSpawnX: VIEW.W };
}

// Emit entities to fill space up to (frontierX + VIEW.W). Difficulty (distanceM)
// shrinks the gap between obstacles. Returns the new descriptors.
export function spawnAhead(spawner, frontierX, distanceM) {
  const out = [];
  const limit = frontierX + VIEW.W;
  const minGap = Math.max(220, 420 - distanceM * 0.5); // tightens with distance
  while (spawner.nextSpawnX < limit) {
    const roll = spawner.rng.next();
    const type = roll < 0.4 ? 'marine' : roll < 0.65 ? 'crate' : roll < 0.8 ? 'gap' : 'coin';
    out.push(makeEntity(type, spawner.nextSpawnX));
    const span = type === 'gap' ? SIZES.gap.w : SIZES[type].w;
    const gap = minGap + spawner.rng.int(0, 180);
    spawner.nextSpawnX += span + gap;
  }
  return out;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/spawner.test.js`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/game/entities.js src/game/spawner.js tests/spawner.test.js
git commit -m "feat: entity factory + deterministic spawner with difficulty ramp"
```

---

## Task 10: World scroll + recycle (`game/world.js`)

**Files:**
- Create: `src/game/world.js`
- Test: `tests/world.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/world.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, updateWorld } from '../src/game/world.js';
import { createRng } from '../src/engine/rng.js';

test('world starts with spawned entities ahead of the screen', () => {
  const w = createWorld(createRng(5));
  assert.ok(w.entities.length > 0);
});

test('updateWorld scrolls entities left by speed*dt', () => {
  const w = createWorld(createRng(5));
  const first = w.entities[0];
  const x0 = first.x;
  updateWorld(w, 1, 300); // 1s at 300px/s
  assert.ok(Math.abs((x0 - first.x) - 300) < 1e-6);
});

test('entities scrolled off the left are removed', () => {
  const w = createWorld(createRng(5));
  for (let i = 0; i < 600; i++) updateWorld(w, 1 / 60, 600);
  assert.ok(w.entities.every((e) => e.x + e.w > -200));
});

test('new entities keep appearing on the right (endless)', () => {
  const w = createWorld(createRng(5));
  let maxX = Math.max(...w.entities.map((e) => e.x));
  for (let i = 0; i < 600; i++) updateWorld(w, 1 / 60, 600);
  const newMaxX = Math.max(...w.entities.map((e) => e.x));
  assert.ok(newMaxX > 0);
  assert.ok(w.entities.length > 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/world.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/game/world.js`**

`nextSpawnX` lives in the same scrolling coordinate space as the entities, so it scrolls left with them; new entities are appended whenever the frontier gets close to the screen.

```js
import { VIEW, PPM } from '../data/constants.js';
import { createSpawner, spawnAhead } from './spawner.js';

const CULL_MARGIN = 200;

export function createWorld(rng) {
  const spawner = createSpawner(rng);
  const world = { spawner, entities: [], traveledPx: 0 };
  world.entities.push(...spawnAhead(spawner, VIEW.W, 0)); // prime the screen
  return world;
}

// Scrolls everything left by speed*dt, culls off-screen entities, and spawns ahead.
export function updateWorld(world, dt, speed) {
  const move = speed * dt;
  world.traveledPx += move;
  world.spawner.nextSpawnX -= move;
  for (const e of world.entities) e.x -= move;
  world.entities = world.entities.filter(
    (e) => e.x + e.w > -CULL_MARGIN && !e.collected && !e.dead,
  );
  const distanceM = world.traveledPx / PPM;
  if (world.spawner.nextSpawnX < VIEW.W * 2) {
    world.entities.push(...spawnAhead(world.spawner, world.spawner.nextSpawnX, distanceM));
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/world.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the whole pure suite**

Run: `cd ~/elastic-raider && node --test`
Expected: PASS across all `tests/*.test.js` (rng, collision, scoring, combat, state, save, player, spawner, world).

- [ ] **Step 6: Commit**

```bash
git add src/game/world.js tests/world.test.js
git commit -m "feat: endless world scroll, cull, and spawn-ahead"
```

---

## Task 11: Input — pure gesture classifier + DOM wiring (`engine/input.js`)

**Files:**
- Create: `src/engine/input.js`
- Test: `tests/input.test.js`

- [ ] **Step 1: Write the failing test** (only the pure classifier is unit-tested)

```js
// tests/input.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGesture } from '../src/engine/input.js';

test('a small, quick touch is a tap', () => {
  assert.equal(classifyGesture(5, -3, 80), 'tap');
});

test('a downward swipe is down', () => {
  assert.equal(classifyGesture(2, 90, 200), 'down');
});

test('an upward swipe is up', () => {
  assert.equal(classifyGesture(-4, -90, 200), 'up');
});

test('a forward (rightward) swipe is forward', () => {
  assert.equal(classifyGesture(120, 10, 200), 'forward');
});

test('a backward (leftward) swipe is back', () => {
  assert.equal(classifyGesture(-120, 10, 200), 'back');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/input.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/engine/input.js`**

```js
const TAP_DIST = 24;   // px
const TAP_TIME = 200;  // ms

// Pure: turn a touch delta into an intent. dtMs is touch duration.
export function classifyGesture(dx, dy, dtMs) {
  const dist = Math.hypot(dx, dy);
  if (dist < TAP_DIST && dtMs < TAP_TIME) return 'tap';
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'up' : 'down';
  return dx > 0 ? 'forward' : 'back';
}

// Browser wiring. Returns { actions, consume }.
// actions is a live object; consume() returns a snapshot and clears one-shots.
export function createInput(target = window) {
  const state = { jumpPressed: false, jumpHeld: false, slidePressed: false, dashPressed: false };

  function press(intent) {
    if (intent === 'tap' || intent === 'up') { state.jumpPressed = true; state.jumpHeld = true; }
    else if (intent === 'down') state.slidePressed = true;
    else if (intent === 'forward') state.dashPressed = true;
  }

  // Keyboard
  target.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { state.jumpPressed = true; state.jumpHeld = true; }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') state.slidePressed = true;
    else if (e.code === 'ShiftLeft' || e.code === 'KeyX' || e.code === 'KeyJ') state.dashPressed = true;
  });
  target.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') state.jumpHeld = false;
  });

  // Touch
  let sx = 0, sy = 0, st = 0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  target.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; st = now();
  }, { passive: true });
  target.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    press(classifyGesture(t.clientX - sx, t.clientY - sy, now() - st));
    state.jumpHeld = false;
  }, { passive: true });

  return {
    actions: state,
    consume() {
      const snap = { ...state };
      state.jumpPressed = false; state.slidePressed = false; state.dashPressed = false;
      return snap;
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/input.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/input.js tests/input.test.js
git commit -m "feat: input — pure gesture classifier + keyboard/touch wiring"
```

---

## Task 12: Fixed-timestep loop (`engine/loop.js`)

**Files:**
- Create: `src/engine/loop.js`

> Browser-only (uses `requestAnimationFrame` + `document.visibilityState`). Verified via integration in Task 16; no unit test.

- [ ] **Step 1: Implement `src/engine/loop.js`**

```js
// Fixed-timestep loop with a render callback. Pauses on tab/app background
// so the simulation never fast-forwards after returning.
const STEP = 1 / 60;           // fixed simulation step (s)
const MAX_FRAME = 0.25;        // clamp huge gaps (e.g. after a stall)

export function createLoop({ update, render }) {
  let last = 0, acc = 0, running = false, rafId = 0;

  function frame(now) {
    if (!running) return;
    const t = now / 1000;
    let delta = last ? t - last : 0;
    last = t;
    if (delta > MAX_FRAME) delta = MAX_FRAME;
    acc += delta;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    render(acc / STEP); // interpolation alpha (render may ignore it)
    rafId = requestAnimationFrame(frame);
  }

  function start() { if (running) return; running = true; last = 0; rafId = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(rafId); }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stop();
    else start();
  });

  return { start, stop, isRunning: () => running };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/loop.js
git commit -m "feat: fixed-timestep loop with background pause"
```

---

## Task 13: Procedural audio (`engine/audio.js`)

**Files:**
- Create: `src/engine/audio.js`

> Browser-only (Web Audio). Verified by ear/logs in Task 16; no unit test.

- [ ] **Step 1: Implement `src/engine/audio.js`**

```js
// Tiny procedural SFX. AudioContext is created lazily and resumed on first
// user gesture to satisfy autoplay policies.
export function createAudio() {
  let ctx = null;

  function ensure() {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function blip(freq, dur, type = 'square', gain = 0.06) {
    const c = ensure(); if (!c) return;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    osc.connect(g).connect(c.destination);
    osc.start(); osc.stop(c.currentTime + dur);
  }

  return {
    unlock: ensure, // call from a user-gesture handler
    jump:  () => blip(520, 0.12, 'square'),
    smash: () => blip(180, 0.14, 'sawtooth', 0.09),
    coin:  () => blip(880, 0.10, 'triangle'),
    death: () => { blip(200, 0.25, 'sawtooth', 0.1); setTimeout(() => blip(120, 0.35, 'sawtooth', 0.1), 90); },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/audio.js
git commit -m "feat: procedural Web Audio sfx"
```

---

## Task 14: Renderer (`engine/render.js`)

**Files:**
- Create: `src/engine/render.js`

> Browser-only (Canvas 2D). Verified visually in Task 16; no unit test.

- [ ] **Step 1: Implement `src/engine/render.js`**

```js
import { VIEW, GROUND_Y, PLAYER, DASH_REACH } from '../data/constants.js';

const COLORS = {
  sky: '#0b1020', skyBand: '#16224a', ground: '#2b1d12', groundTop: '#5a3c22',
  player: '#e8d7a0', dash: '#ffd34d', marine: '#3f6fb0', crate: '#8a5a2b',
  gap: '#0b1020', coin: '#ffcf3f', text: '#f5efe0',
};

export function createRenderer(ctx) {
  function clear() { ctx.fillStyle = COLORS.sky; ctx.fillRect(0, 0, VIEW.W, VIEW.H); }

  // Parallax: distant band scrolls slower than the foreground.
  function background(traveledPx) {
    const off = (traveledPx * 0.2) % VIEW.W;
    ctx.fillStyle = COLORS.skyBand;
    for (let i = -1; i < 3; i++) {
      const x = i * 320 - off;
      ctx.fillRect(x, 180, 220, 120);
    }
  }

  function ground(entities) {
    // Draw a continuous ground, then carve gaps.
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
      ctx.fillStyle = e.type === 'marine' ? COLORS.marine : e.type === 'crate' ? COLORS.crate : COLORS.coin;
      if (e.type === 'coin') { ctx.beginPath(); ctx.arc(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(e.x, e.y, e.w, e.h);
    }
  }

  function player(p) {
    ctx.fillStyle = p.state === 'dashing' ? COLORS.dash : COLORS.player;
    ctx.fillRect(p.x, p.y - p.height, PLAYER.w, p.height);
    if (p.state === 'dashing') { ctx.globalAlpha = 0.4; ctx.fillRect(p.x + PLAYER.w, p.y - p.height, DASH_REACH, p.height); ctx.globalAlpha = 1; }
  }

  function text(str, x, y, size = 24, align = 'left') {
    ctx.fillStyle = COLORS.text; ctx.font = `${size}px system-ui, sans-serif`; ctx.textAlign = align;
    ctx.fillText(str, x, y);
  }

  return { clear, background, ground, entitiesLayer, player, text };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/render.js
git commit -m "feat: canvas renderer with parallax background"
```

---

## Task 15: Screens / HUD (`ui/screens.js`)

**Files:**
- Create: `src/ui/screens.js`

> Browser-only (draws via the renderer). Verified visually in Task 16; no unit test.

- [ ] **Step 1: Implement `src/ui/screens.js`**

```js
import { VIEW } from '../data/constants.js';

export function createScreens(renderer) {
  function menu() {
    renderer.text('ELASTIC RAIDER', VIEW.W / 2, VIEW.H / 2 - 40, 48, 'center');
    renderer.text('Tap / Space to start', VIEW.W / 2, VIEW.H / 2 + 10, 22, 'center');
    renderer.text('↑/Space jump · ↓ slide · X/→ dash-smash', VIEW.W / 2, VIEW.H / 2 + 44, 18, 'center');
  }

  function hud(score, combo, highScore) {
    renderer.text(`Score ${score}`, 16, 32, 22, 'left');
    renderer.text(`Best ${highScore}`, 16, 58, 16, 'left');
    if (combo >= 3) renderer.text(`x${combo} COMBO`, VIEW.W - 16, 32, 22, 'right');
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

- [ ] **Step 2: Commit**

```bash
git add src/ui/screens.js
git commit -m "feat: menu, HUD, and game-over screens"
```

---

## Task 16: Integration — wire the full game (`src/main.js`)

**Files:**
- Modify: `src/main.js` (replace the Task 1 shell entirely)

This task assembles every module into the playable loop: collision resolution (smash vs. death vs. coin vs. gap-fall), scoring, combo, high-score persistence, screen routing, and input→action plumbing.

- [ ] **Step 1: Replace `src/main.js` with the full game**

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
let run = null;          // per-run state
let runCounter = 0;      // varies the seed per run
let highScore = load(storage).highScore;
let lastResult = { score: 0, isNewBest: false };

function newRun() {
  const seed = (Date.now() ^ (runCounter++ * 2654435761)) >>> 0;
  const rng = createRng(seed);
  run = {
    rng,
    player: createPlayer(),
    world: createWorld(rng),
    score: createScore(),
    combo: createCombo(),
    elapsed: 0,
  };
}

function beginPlaying() {
  audio.unlock();
  newRun();
  start(game); // -> playing
}

function endRun() {
  const finalScore = total(run.score);
  const prevBest = highScore;
  highScore = recordHighScore(storage, finalScore);
  lastResult = { score: finalScore, isNewBest: finalScore > prevBest && finalScore > 0 };
  audio.death();
  gameOver(game);
}

function overGap(p, entities) {
  // Death only if the player is on the ground with their footing over a gap.
  // While airborne (jumping the gap) this is false, so a well-timed jump clears it.
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
  // Input intents this frame.
  const actions = input.consume();

  if (game.mode === MODES.MENU || game.mode === MODES.GAMEOVER) {
    if (actions.jumpPressed) beginPlaying();
    return;
  }
  if (game.mode !== MODES.PLAYING) return;

  run.elapsed += dt;
  const speed = runSpeed(run.elapsed);

  updatePlayer(run.player, actions, dt);
  if (actions.jumpPressed) audio.jump();

  updateWorld(run.world, dt, speed);
  addDistance(run.score, pxToMeters(speed * dt));
  tickCombo(run.combo, dt);

  // Collisions
  const pb = playerBox(run.player);
  const db = dashBox(run.player);
  for (const e of run.world.entities) {
    if (e.dead || e.collected) continue;
    if (e.type === 'coin') {
      if (aabb(pb, e)) { e.collected = true; addCoin(run.score, multiplier(run.combo)); audio.coin(); }
      continue;
    }
    if (e.type === 'gap') continue; // handled below
    // marine / crate
    if (e.type === 'marine' && db && aabb(db, e)) {
      e.dead = true; registerSmash(run.combo); addSmash(run.score, multiplier(run.combo)); audio.smash();
      continue;
    }
    if (aabb(pb, e)) { endRun(); return; } // crate always lethal; marine lethal unless dashed
  }
  if (overGap(run.player, run.world.entities)) { endRun(); return; }
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
  renderer.player(run.player);
  screens.hud(total(run.score), multiplier(run.combo), highScore);
  if (game.mode === MODES.GAMEOVER) screens.gameOver(lastResult.score, highScore, lastResult.isNewBest);
}

createLoop({ update, render }).start();
```

- [ ] **Step 2: Verify the game in the browser**

Start the preview server at the project root; open `index.html`.
- `preview_screenshot`: menu screen shows "ELASTIC RAIDER".
- `preview_console_logs`: no errors.
- Press Space (or `preview_eval` to dispatch a `keydown` of `Space`) → game starts, raider runs, obstacles scroll in.
- Let the raider hit a crate → game-over screen with score; press Space → restarts.
- Confirm dashing into a marine removes it and bumps the combo (watch the `xN COMBO` HUD).
- Confirm coins increase the score and play a tone.

- [ ] **Step 3: Verify high score persists**

In the preview: play a run, die, note "Best". Reload the page (`preview_eval: window.location.reload()`), start again — the menu/HUD "Best" should equal the prior score (persisted via `localStorage`).

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat: wire full Phase 1 game loop (collision, scoring, combo, persistence)"
```

---

## Task 17: Browser test page (`tests/index.html`)

**Files:**
- Create: `tests/index.html`

Mirrors plumber-quest's in-browser test suite: imports the same pure modules and prints pass/fail, so tests are runnable without Node too.

- [ ] **Step 1: Create `tests/index.html`**

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Elastic Raider — Tests</title>
<style>body{font:14px/1.5 monospace;background:#0b1020;color:#cde;padding:16px} .pass{color:#7CFC8A} .fail{color:#ff6b6b}</style>
</head>
<body>
<h1>Pure module checks</h1>
<div id="out"></div>
<script type="module">
import { createRng } from '../src/engine/rng.js';
import { aabb } from '../src/game/collision.js';
import { createScore, addCoin, total } from '../src/game/scoring.js';
import { createCombo, registerSmash, multiplier } from '../src/game/combat.js';
import { createGame, start, MODES } from '../src/game/state.js';
import { defaults, recordHighScore } from '../src/meta/save.js';
import { createSpawner, spawnAhead } from '../src/game/spawner.js';

const out = document.getElementById('out');
let passed = 0, failed = 0;
function check(name, cond) {
  const div = document.createElement('div');
  div.className = cond ? 'pass' : 'fail';
  div.textContent = (cond ? 'PASS ' : 'FAIL ') + name;
  out.appendChild(div); cond ? passed++ : failed++;
}

check('rng deterministic', createRng(1).next() === createRng(1).next());
check('aabb overlap', aabb({x:0,y:0,w:10,h:10},{x:5,y:5,w:10,h:10}) === true);
const s = createScore(); addCoin(s, 2); check('coin score', total(s) === 20);
const c = createCombo(); for (let i=0;i<3;i++) registerSmash(c); check('combo mult', multiplier(c) === 2);
const g = createGame(); check('start transitions', start(g) && g.mode === MODES.PLAYING);
const mem = new Map(); const ad = { getItem:(k)=>mem.has(k)?mem.get(k):null, setItem:(k,v)=>mem.set(k,v) };
check('highscore record', recordHighScore(ad, 99) === 99);
const sp = createSpawner(createRng(7)); check('spawner emits', spawnAhead(sp, 1000, 0).length >= 1);

const sum = document.createElement('h2');
sum.textContent = `${passed} passed, ${failed} failed`;
sum.className = failed ? 'fail' : 'pass';
out.appendChild(sum);
</script>
</body>
</html>
```

- [ ] **Step 2: Verify in the browser**

Open `tests/index.html` in the preview. Expected: all rows green, summary "7 passed, 0 failed".

- [ ] **Step 3: Commit**

```bash
git add tests/index.html
git commit -m "test: in-browser parity test page for pure modules"
```

---

## Task 18: Phase 1 acceptance pass + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Run the full Node suite**

Run: `cd ~/elastic-raider && node --test`
Expected: all suites PASS (rng, collision, scoring, combat, state, save, player, spawner, world, input).

- [ ] **Step 2: Manual acceptance in the preview** (tick each against the spec's Phase 1 "bar for fun")

- [ ] One complete run loop: menu → play → die → game-over → restart, all reachable.
- [ ] Real score pressure: score climbs with distance, coins, and smashes; speed visibly ramps over ~30s.
- [ ] ≥3 hazard types behave correctly: crate (lethal), marine (lethal unless dash-smashed), water gap (fall = death).
- [ ] Dash-smash + combo: chaining smashes raises the `xN COMBO` multiplier; it decays when you stop.
- [ ] Coins add to the score.
- [ ] Local high score shows on menu/HUD and survives a page reload.
- [ ] Basic audio: jump, smash, coin, death tones play (after first input gesture).
- [ ] Keyboard (Space/↑ jump, ↓ slide, X/→ dash) and touch (tap jump, swipe-down slide, swipe-forward dash) both work — test touch via `preview_resize` to a phone size and tap/swipe interactions.
- [ ] Loop pauses on tab blur (switch tabs in preview, return — no time skip / instant death).

- [ ] **Step 3: Create `README.md`**

```markdown
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
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README + Phase 1 acceptance pass"
```

---

## Spec coverage check (self-review)

- Engine loop, fixed timestep, pause on blur → Task 12. ✓
- Input keyboard + touch (tap/swipe) → Task 11 (classifier + wiring), verified Task 16/18. ✓
- `state.js` lifecycle (menu→playing→gameover→restart) → Task 6, routed in Task 16. ✓
- Player run/jump/slide/dash physics → Task 8. ✓
- Scrolling world + parallax → Task 10 (scroll) + Task 14 (parallax draw). ✓
- ≥3 hazard types (marine, crate, water gap) → Tasks 9/16. ✓
- Dash-smash combat + combo multiplier → Tasks 5/8/16. ✓
- Coins (run score only) → Tasks 4/16 (no wallet/persistence of coins — correct for Phase 1). ✓
- AABB collision → Task 3. ✓
- Scoring → Task 4. ✓
- Local high score via pure `meta/save.js` over `meta/storage.js` adapter → Task 7, used in Task 16. ✓
- Game-over screen + run summary + restart → Tasks 15/16. ✓
- Basic procedural audio → Task 13. ✓
- Test page for pure modules → Task 17; Node tests throughout. ✓
- OUT of scope (power-ups, shop, missions, Capacitor) → no tasks create them. ✓
```
