# Visual Juice Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Particles, screen shake, score popups, combo flash, hit-stop, and a day→night sky cycle — visual feedback for every player action, with zero gameplay/scoring change.

**Architecture:** `src/engine/fx.js` is a deterministic state module (own mutable state, no DOM/Canvas, injected RNG) exposing a `state()`/`offset()` read API. The renderer draws world-aligned FX inside a shake-translated pass and full-screen flash outside it; HUD is never shaken. `main.js` calls `fx.*` at its existing event branches with explicit center-point coordinates and gates simulation behind a freeze + pending-death state so hit-stop happens BEFORE banking/audio/game-over.

**Tech Stack:** Vanilla ES modules, zero deps, `node:test`; Playwright (in `~/elastic-raider-promo`) for acceptance.

**Spec:** `docs/superpowers/specs/2026-06-11-visual-juice-pass-design.md` — read first.
**Branch:** `feat/visual-juice` (exists, spec committed). Verify with `git branch --show-current`.
**Baseline:** 116 unit tests green (`npm test`).

**The five review amendments (binding):**
1. True death sets a **pending game-over**: hit-stop runs first; `endRun()` (banking/audio/transition) fires only after the freeze expires.
2. `fx.offset()` is a **pure read** — jitter is generated and cached inside `update(dt)`.
3. Rendering reads via an explicit **`state()`** API (plus `offset()`/`frozen()`).
4. Layering: **shaken pass** = background/ground/entities/player/world-aligned FX; **unshaken** = flash overlay + HUD + screens.
5. Event coordinates are **explicit center points** (`playerCenter`/`entityCenter` helpers in main.js).

---

### Task 1: `fx.js` — deterministic FX state module

**Files:**
- Create: `src/engine/fx.js`
- Test: `tests/fx.test.js` (new)

- [ ] **Step 1: Create `tests/fx.test.js` (failing):**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFx, skyPhase, PARTICLE_CAP } from '../src/engine/fx.js';
import { createRng } from '../src/engine/rng.js';

const fx = () => createFx(createRng(42));

test('skyPhase: 0 at 0m, wraps at 1500m, night at half-cycle', () => {
  assert.equal(skyPhase(0), 0);
  assert.equal(skyPhase(1500), 0);
  assert.equal(skyPhase(750), 0.5);
  assert.equal(skyPhase(2250), 0.5);
});

test('coinBurst spawns 6 particles that expire', () => {
  const f = fx();
  f.coinBurst(100, 200);
  assert.equal(f.state().particles.length, 6);
  f.update(2);                                   // far past max ttl
  assert.equal(f.state().particles.length, 0);
});

test('particle pool caps at PARTICLE_CAP, oldest evicted', () => {
  const f = fx();
  for (let i = 0; i < 40; i++) f.deathBurst(i, 0);   // 40*20 = 800 spawned
  assert.equal(f.state().particles.length, PARTICLE_CAP);
});

test('smashBurst shakes 4px; deathBurst shakes 8px and freezes 0.12s', () => {
  const f = fx();
  f.smashBurst(0, 0);
  f.update(1 / 60);
  const small = f.offset();
  assert.ok(Math.abs(small.x) <= 4 && Math.abs(small.y) <= 4);
  assert.equal(f.frozen(), false);

  const g = fx();
  g.deathBurst(0, 0);
  assert.equal(g.frozen(), true);
  g.update(1 / 60);
  const big = g.offset();
  assert.ok(Math.abs(big.x) <= 8 && Math.abs(big.y) <= 8);
  assert.ok(Math.abs(big.x) > 0 || Math.abs(big.y) > 0);  // shaking now
  g.update(0.12);                                // freeze expires
  assert.equal(g.frozen(), false);
});

test('overlapping shakes take the max, never sum', () => {
  const f = fx();
  f.deathBurst(0, 0);          // mag 8
  f.smashBurst(0, 0);          // mag 4 — must not raise or extend beyond 8
  f.update(1 / 60);
  const o = f.offset();
  assert.ok(Math.abs(o.x) <= 8 && Math.abs(o.y) <= 8);
});

test('offset() is a pure read: same value until the next update', () => {
  const f = fx();
  f.deathBurst(0, 0);
  f.update(1 / 60);
  const a = f.offset();
  const b = f.offset();
  assert.deepEqual(a, b);                        // no rng consumed between reads
  f.update(1 / 60);
  assert.notDeepEqual(f.offset(), a);            // new jitter only after update
});

test('shake decays toward zero', () => {
  const f = fx();
  f.smashBurst(0, 0);
  f.update(0.5);                                 // past dur 0.2
  assert.deepEqual(f.offset(), { x: 0, y: 0 });
});

test('popup rises and expires', () => {
  const f = fx();
  f.popup(100, 300, '+50', '#ffcf3f');
  const p0 = f.state().popups[0];
  assert.equal(p0.text, '+50');
  const yStart = p0.y;
  f.update(0.4);
  assert.ok(f.state().popups[0].y < yStart);     // rising
  f.update(0.5);                                 // past ttl 0.8
  assert.equal(f.state().popups.length, 0);
});

test('comboFlash lives 60ms then clears', () => {
  const f = fx();
  f.comboFlash('#b388ff');
  assert.equal(f.state().flash.color, '#b388ff');
  f.update(0.07);
  assert.equal(f.state().flash, null);
});

test('reviveFlash and powerupRing spawn ring particles, no shake, no freeze', () => {
  const f = fx();
  f.reviveFlash(50, 60);
  f.powerupRing(70, 80, '#46c2ff');
  assert.equal(f.state().particles.filter((p) => p.shape === 'ring').length, 2);
  f.update(1 / 60);
  assert.deepEqual(f.offset(), { x: 0, y: 0 });
  assert.equal(f.frozen(), false);
});

test('update during freeze still animates particles', () => {
  const f = fx();
  f.deathBurst(100, 100);
  const before = f.state().particles.map((p) => p.y);
  f.update(0.05);                                // frozen, but fx animates
  const after = f.state().particles.map((p) => p.y);
  assert.notDeepEqual(after, before);
});
```

- [ ] **Step 2:** `node --test tests/fx.test.js` → FAIL (module not found). Confirm.

- [ ] **Step 3: Create `src/engine/fx.js`:**

```js
// Deterministic FX state module: mutates its own state, no DOM/Canvas, all
// randomness from the injected rng. Coordinates are SCREEN coordinates.
// Rendering reads via state()/offset()/frozen() — never writes.
export const PARTICLE_CAP = 200;
const SHAKE_CAP = 8;        // px, hard cap
const FREEZE_DEATH = 0.12;  // s of hit-stop on true death
const DAY_CYCLE_M = 1500;   // meters per full day→night→day cycle
const POPUP_TTL = 0.8;      // s
const POPUP_RISE = 50;      // px/s
const FLASH_TTL = 0.06;     // s
const GRAVITY = 600;        // px/s² on spark particles

// Pure: 0..1 phase of the day cycle at a distance (0 = day, 0.5 = night).
export function skyPhase(distanceM) {
  return (((distanceM % DAY_CYCLE_M) + DAY_CYCLE_M) % DAY_CYCLE_M) / DAY_CYCLE_M;
}

export function createFx(rng) {
  const particles = [];   // spark: {shape:'square',x,y,vx,vy,life,ttl,size,color}
                          // ring:  {shape:'ring',x,y,r,grow,life,ttl,color}
  const popups = [];      // {x,y,text,color,life,ttl}
  const shake = { mag: 0, t: 0, dur: 0, ox: 0, oy: 0 };
  let flash = null;       // {color,life,ttl} | null
  let freeze = 0;

  function push(p) {
    if (particles.length >= PARTICLE_CAP) particles.shift();
    particles.push(p);
  }
  function sparks(n, x, y, colors, speed) {
    for (let i = 0; i < n; i++) {
      push({
        shape: 'square', x, y,
        vx: (rng.next() * 2 - 1) * speed,
        vy: -rng.next() * speed,
        life: 0, ttl: 0.4 + rng.next() * 0.2,
        size: 3 + rng.next() * 3,
        color: colors[i % colors.length],
      });
    }
  }
  function ring(x, y, color) {
    push({ shape: 'ring', x, y, r: 10, grow: 140, life: 0, ttl: 0.5, color });
  }
  function startShake(mag, dur) {
    const m = Math.min(SHAKE_CAP, mag);
    if (m >= shake.mag) { shake.mag = m; shake.t = dur; shake.dur = dur; } // max, never sum
  }

  return {
    coinBurst(x, y) { sparks(6, x, y, ['#ffcf3f', '#fff2b0'], 160); },
    smashBurst(x, y) { sparks(12, x, y, ['#ff7a33', '#ffcf3f', '#f5efe0'], 240); startShake(4, 0.2); },
    deathBurst(x, y) {
      sparks(20, x, y, ['#ff5d8f', '#ff7a33', '#f5efe0', '#46c2ff'], 320);
      startShake(8, 0.4);
      freeze = FREEZE_DEATH;
    },
    reviveFlash(x, y) { ring(x, y, '#ff5d8f'); },
    powerupRing(x, y, color) { ring(x, y, color); },
    popup(x, y, text, color) { popups.push({ x, y, text, color, life: 0, ttl: POPUP_TTL }); },
    comboFlash(color) { flash = { color, life: 0, ttl: FLASH_TTL }; },

    update(dt) {
      freeze = Math.max(0, freeze - dt);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.ttl) { particles.splice(i, 1); continue; }
        if (p.shape === 'square') { p.vy += GRAVITY * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        else p.r += p.grow * dt;
      }
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.life += dt; p.y -= POPUP_RISE * dt;
        if (p.life >= p.ttl) popups.splice(i, 1);
      }
      if (flash) { flash.life += dt; if (flash.life >= flash.ttl) flash = null; }
      if (shake.t > 0) {
        shake.t = Math.max(0, shake.t - dt);
        // Exponential decay: full magnitude at start, ~0 by the end of dur.
        const amp = shake.mag * Math.exp(-6 * (1 - shake.t / shake.dur));
        shake.ox = (rng.next() * 2 - 1) * amp;
        shake.oy = (rng.next() * 2 - 1) * amp;
        if (shake.t === 0) { shake.mag = 0; shake.ox = 0; shake.oy = 0; }
      } else { shake.mag = 0; shake.ox = 0; shake.oy = 0; }
    },

    // Pure reads — no state change, no rng consumption.
    offset() { return { x: shake.ox, y: shake.oy }; },
    frozen() { return freeze > 0; },
    state() { return { particles, popups, flash }; },
  };
}
```

- [ ] **Step 4:** `node --test tests/fx.test.js` → PASS (11). `npm test` → ALL PASS (127).

- [ ] **Step 5: Commit:**
```bash
git add src/engine/fx.js tests/fx.test.js
git commit -m "feat: deterministic FX state module (particles, shake, popups, freeze, skyPhase)"
```

---

### Task 2: Scoring helpers return awarded points

**Files:**
- Modify: `src/game/scoring.js`
- Test: `tests/scoring.test.js` (append)

- [ ] **Step 1: Append failing tests:**

```js
test('addCoin returns the awarded bonus points', () => {
  const s = createScore();
  assert.equal(addCoin(s, 2, 1.75), 35);
  assert.equal(s.bonus, 35);                       // mutation unchanged
});

test('addSmash returns the awarded bonus points', () => {
  const s = createScore();
  assert.equal(addSmash(s, 3), 150);               // SMASH_SCORE 50 * 3
  assert.equal(s.bonus, 150);
});
```
(Extend the import line with `addSmash` if missing.)

- [ ] **Step 2:** `node --test tests/scoring.test.js` → both FAIL (return undefined). Confirm.

- [ ] **Step 3: Implement** — in `src/game/scoring.js` replace `addCoin` and `addSmash`:

```js
export function addCoin(score, multiplier, coinValueMultiplier = 1) {
  score.coins += 1;
  const pts = COIN_SCORE * multiplier * coinValueMultiplier;
  score.bonus += pts;
  return pts;
}
export function addSmash(score, multiplier) {
  score.smashes += 1;
  const pts = SMASH_SCORE * multiplier;
  score.bonus += pts;
  return pts;
}
```

- [ ] **Step 4:** `npm test` → ALL PASS (129).

- [ ] **Step 5: Commit:**
```bash
git add src/game/scoring.js tests/scoring.test.js
git commit -m "feat: scoring helpers return awarded points (behavior-compatible)"
```

---

### Task 3: Day→night palette in sprites.js

**Files:**
- Modify: `src/engine/sprites.js` (add `lerpColor`, `paletteAt`, `phase` params on the four background drawers; stars at night)
- Test: `tests/sprites.test.js` (new — pure color math only)

- [ ] **Step 1: Create `tests/sprites.test.js` (failing):**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerpColor, paletteAt, PALETTE } from '../src/engine/sprites.js';

test('lerpColor endpoints are exact', () => {
  assert.equal(lerpColor('#000000', '#ffffff', 0), '#000000');
  assert.equal(lerpColor('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(lerpColor('#102030', '#304050', 0.5), '#203040');
});

test('paletteAt(0) is the exact day palette (no visual change at rest)', () => {
  const p = paletteAt(0);
  assert.equal(p.skyTop, PALETTE.skyTop);
  assert.equal(p.skyBottom, PALETTE.skyBottom);
  assert.equal(p.cloud, PALETTE.cloud);
  assert.equal(p.island, PALETTE.island);
  assert.equal(p.seaFar, PALETTE.seaFar);
  assert.equal(p.foam, PALETTE.foam);
  assert.equal(p.starAlpha, 0);
});

test('paletteAt(0.5) is night: darker sky, visible stars', () => {
  const n = paletteAt(0.5);
  assert.notEqual(n.skyTop, PALETTE.skyTop);
  assert.ok(n.starAlpha > 0.5);
});

test('paletteAt wraps smoothly: phase 0 equals phase ~1', () => {
  const a = paletteAt(0), b = paletteAt(0.999);
  // within one lerp step of day
  assert.equal(a.starAlpha, 0);
  assert.ok(b.starAlpha < 0.05);
});
```

- [ ] **Step 2:** `node --test tests/sprites.test.js` → FAIL (no such exports). Confirm.

- [ ] **Step 3: Implement in `src/engine/sprites.js`.** Add below `PALETTE`:

```js
// --- Day→night cycle -------------------------------------------------------
// Keyframes: 0 = day (the exact PALETTE values), 0.25 = dusk, 0.5 = night,
// 0.75 = dawn, wrapping back to day at 1. Only background colors participate:
// entity sprites, gap foam, and HUD colors are NEVER phase-tinted (readability).
const DAY = {
  skyTop: PALETTE.skyTop, skyBottom: PALETTE.skyBottom, cloud: PALETTE.cloud,
  island: PALETTE.island, seaFar: PALETTE.seaFar, foam: PALETTE.foam, starAlpha: 0,
};
const DUSK = {
  skyTop: '#3a2a4d', skyBottom: '#b06a4a', cloud: '#e8c8b0',
  island: '#1d3a2e', seaFar: '#2a5a80', foam: '#d8c8b0', starAlpha: 0.25,
};
const NIGHT = {
  skyTop: '#070b18', skyBottom: '#16243d', cloud: '#5a6a85',
  island: '#15291f', seaFar: '#10395c', foam: '#9fc8e8', starAlpha: 1,
};
const KEYFRAMES = [DAY, DUSK, NIGHT, DUSK]; // day→dusk→night→dawn(=dusk)→day

export function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// Blend the keyframe ring at phase 0..1.
export function paletteAt(phase) {
  const seg = (((phase % 1) + 1) % 1) * KEYFRAMES.length;
  const i = Math.floor(seg) % KEYFRAMES.length;
  const j = (i + 1) % KEYFRAMES.length;
  const t = seg - Math.floor(seg);
  const a = KEYFRAMES[i], b = KEYFRAMES[j];
  const out = { starAlpha: a.starAlpha + (b.starAlpha - a.starAlpha) * t };
  for (const k of ['skyTop', 'skyBottom', 'cloud', 'island', 'seaFar', 'foam']) {
    out[k] = lerpColor(a[k], b[k], t);
  }
  return out;
}
```

Then change the four background drawers to accept `phase` (default 0) and use `paletteAt`:

```js
export function drawSky(ctx, phase = 0) {
  const pal = paletteAt(phase);
  const g = ctx.createLinearGradient(0, 0, 0, VIEW.H);
  g.addColorStop(0, pal.skyTop); g.addColorStop(1, pal.skyBottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  if (pal.starAlpha > 0.01) {
    ctx.save(); ctx.globalAlpha = pal.starAlpha; ctx.fillStyle = '#e8ecf8';
    // Fixed star field (deterministic positions; no rng — same sky every night)
    for (const [sx, sy, r] of [[60, 40, 1.5], [180, 90, 1], [320, 30, 2], [470, 70, 1],
      [610, 45, 1.5], [760, 95, 1], [880, 25, 2], [930, 120, 1], [240, 140, 1], [700, 150, 1.5]]) {
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
```

In `drawClouds`: replace `ctx.fillStyle = PALETTE.cloud;` with `ctx.fillStyle = paletteAt(phase).cloud;` and add `phase = 0` as the last parameter: `export function drawClouds(ctx, traveledPx, t, phase = 0)`.
In `drawIslands`: same pattern — `export function drawIslands(ctx, traveledPx, phase = 0)`, fillStyle from `paletteAt(phase).island`.
In `drawSea`: `export function drawSea(ctx, traveledPx, t, phase = 0)`; `seaFar` and `foam` from `paletteAt(phase)`.
Do NOT touch `drawWaterGap`, entity drawers, or hero — their colors stay constant (readability bound).

- [ ] **Step 4:** `node --test tests/sprites.test.js` → PASS (4). `npm test` → ALL PASS (133).

- [ ] **Step 5: Commit:**
```bash
git add src/engine/sprites.js tests/sprites.test.js
git commit -m "feat: day→night palette keyframes with phase-parameterized background drawers"
```

---

### Task 4: Renderer — shaken pass, FX layer, flash layer

**Files:**
- Modify: `src/engine/render.js`

No unit test (pure canvas drawing) — verified by boot check here and acceptance in Task 6.

- [ ] **Step 1: Implement.** In `src/engine/render.js`:

Update the sprites import to add nothing new (drawers already imported). Change `background` and add four functions; final exported set: `{ clear, background, ground, entitiesLayer, magnetRing, player, text, beginShake, endShake, fxLayer, flashLayer }`.

```js
  function background(traveledPx, t = 0, phase = 0) {
    drawSky(ctx, phase);
    drawClouds(ctx, traveledPx, t, phase);
    drawIslands(ctx, traveledPx, phase);
    drawSea(ctx, traveledPx, t, phase);
  }

  // Amendment 4: world-aligned drawing happens between beginShake/endShake;
  // flashLayer and text/HUD are drawn OUTSIDE so they never shake.
  function beginShake(offset) { ctx.save(); ctx.translate(offset.x, offset.y); }
  function endShake() { ctx.restore(); }

  // World-aligned FX: particles + popups (screen coords, drawn inside the shaken pass).
  function fxLayer(fxState) {
    for (const p of fxState.particles) {
      const fade = 1 - p.life / p.ttl;
      ctx.save(); ctx.globalAlpha = Math.max(0, fade);
      if (p.shape === 'square') {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else {
        ctx.strokeStyle = p.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    for (const p of fxState.popups) {
      const fade = 1 - p.life / p.ttl;
      ctx.save(); ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = p.color; ctx.font = 'bold 20px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    }
  }

  // Full-screen combo flash — UNSHAKEN, drawn before HUD. Alpha capped low.
  function flashLayer(flash) {
    if (!flash) return;
    const fade = 1 - flash.life / flash.ttl;
    ctx.save(); ctx.globalAlpha = 0.18 * fade; ctx.fillStyle = flash.color;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    ctx.restore();
  }
```

- [ ] **Step 2: Boot check** (game must still render identically — all new params default):

```bash
npm test && npm run assemble:web
python3 -m http.server 8087 -d www & SERVER_PID=$!
cd ~/elastic-raider-promo && node -e "
import('playwright').then(async ({ chromium }) => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8087'); await p.waitForTimeout(1500);
  console.log(errs.length ? errs : 'boot OK'); await b.close(); process.exit(errs.length ? 1 : 0);
});"
kill $SERVER_PID
```
Expected: 133 tests pass, `boot OK`.

- [ ] **Step 3: Commit:**
```bash
cd /Users/raditio.ghifiardigmail.com/elastic-raider
git add src/engine/render.js
git commit -m "feat: renderer shake pass, fx layer, unshaken flash layer, phase threading"
```

---

### Task 5: main.js wiring — events, freeze gate, pending death, render order

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Implement.** All edits in `src/main.js`:

**Imports** — add ONE new line (`playerBox`, `pxToMeters`, `addSmash` etc. are already imported — verify, don't duplicate):
```js
import { createFx, skyPhase } from './engine/fx.js';
```

**Module state** — next to `let run = null;` add:
```js
let fx = null;
```

**Center helpers (amendment 5)** — add above `newRun()`:
```js
// Explicit center points for FX events (screen coordinates).
const entityCenter = (e) => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 });
function playerCenter(p) {
  const pb = playerBox(p);
  return { x: pb.x + pb.w / 2, y: pb.y + pb.h / 2 };
}
```

**`newRun()`** — add fx creation (own RNG stream, never `run.rng` — spec §6) and the pending flag:
```js
function newRun() {
  const seed = (Date.now() ^ (runCounter++ * 2654435761)) >>> 0;
  const rng = createRng(seed);
  const effects = effectsOf(saveData);
  fx = createFx(createRng(seed ^ 0x9e3779b9));   // separate stream: fx draws must not perturb spawning
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
    pendingDeath: false,
  };
}
```

**`fatal()` (amendments 1 + 5)** — replace entirely:
```js
// A fatal hit either burns a Revive (survival, no points) or sets a PENDING
// death: the death burst + hit-stop play first; endRun() (banking, audio,
// game-over transition) fires only after the freeze expires (see update()).
function fatal() {
  const pc = playerCenter(run.player);
  if (consumeRevive(run.powerups)) { audio.revive(); fx.reviveFlash(pc.x, pc.y); return; }
  fx.deathBurst(pc.x, pc.y);                      // also starts shake + freeze
  run.pendingDeath = true;
}
```

**`update(dt)`** — insert the fx tick + gates after the overlay gate and before the mode checks:
```js
  if (run) fx.update(dt);                          // fx animates in PLAYING and GAMEOVER

  if (game.mode === MODES.MENU || game.mode === MODES.GAMEOVER) {
    if (actions.jumpPressed) beginPlaying();
    return;
  }
  if (game.mode !== MODES.PLAYING) return;
  if (fx.frozen()) return;                         // hit-stop: input consumed, fx ticked, sim skipped
  if (run.pendingDeath) { run.pendingDeath = false; endRun(); return; }
```

**Event branches in the entity loop:**
- Coin branch — replace the body:
```js
      if (aabb(pb, e)) {
        e.collected = true;
        const pts = addCoin(run.score, multiplier(run.combo) * scoreMultiplier(run.powerups), run.effects.coinValueMultiplier);
        const c = entityCenter(e);
        fx.coinBurst(c.x, c.y);
        fx.popup(c.x, c.y - 18, `+${pts}`, '#ffcf3f');
        audio.coin();
      }
```
- Pickup branch:
```js
      if (aabb(pb, e)) {
        e.collected = true; activate(run.powerups, e.type); audio.powerup();
        const c = entityCenter(e);
        const PICKUP_COLORS = { gear: '#ff7a33', magnet: '#46c2ff', mult: '#b388ff', revive: '#ff5d8f' };
        fx.powerupRing(c.x, c.y, PICKUP_COLORS[e.type]);
      }
```
(Hoist `PICKUP_COLORS` to module scope next to `PICKUPS` — do not redeclare per frame.)
- Smash branch (amendment: tier compare BEFORE/AFTER `registerSmash`):
```js
    if (e.type === 'marine' && ((db && aabb(db, e)) || (gearActive(run.powerups) && aabb(pb, e)))) {
      e.dead = true;
      const tierBefore = multiplier(run.combo);
      registerSmash(run.combo);
      run.maxComboCount = Math.max(run.maxComboCount, run.combo.count);
      const pts = addSmash(run.score, multiplier(run.combo) * scoreMultiplier(run.powerups));
      const c = entityCenter(e);
      fx.smashBurst(c.x, c.y);
      fx.popup(c.x, c.y - 24, `+${pts}`, '#ff7a33');
      if (multiplier(run.combo) > tierBefore) fx.comboFlash('#b388ff');  // tier crossing only
      audio.smash();
      continue;
    }
```

**`render()` (amendment 4 layering)** — replace entirely:
```js
function render() {
  renderer.clear();
  if (game.mode === MODES.MENU) {
    renderer.background(0, clock);                 // menu stays day (phase 0)
    renderer.ground([], clock);
    screens.menu(saveData.coins);
    return;
  }
  const phase = skyPhase(pxToMeters(run.world.traveledPx));
  renderer.beginShake(fx.offset());                // --- shaken, world-aligned pass
  renderer.background(run.world.traveledPx, clock, phase);
  renderer.ground(run.world.entities, clock);
  renderer.entitiesLayer(run.world.entities, clock);
  if (magnetActive(run.powerups)) renderer.magnetRing(playerBox(run.player));
  renderer.player(run.player, isInvincible(run.powerups), clock);
  renderer.fxLayer(fx.state());
  renderer.endShake();                             // --- end shaken pass
  renderer.flashLayer(fx.state().flash);           // unshaken full-screen flash
  screens.hud(total(run.score), multiplier(run.combo), saveData.highScore, {   // unshaken HUD
    revives: run.powerups.revives,
    scoreMult: scoreMultiplier(run.powerups),
  });
  if (game.mode === MODES.GAMEOVER) {
    screens.gameOver(lastResult.score, saveData.highScore, lastResult.isNewBest, lastResult.banked, lastResult.wallet);
  }
}
```
(`pxToMeters` is already imported in main.js — no constants-import change needed.)

- [ ] **Step 2: Verify:** `npm test` (133), then boot + a real run smoke:

```bash
npm run assemble:web
python3 -m http.server 8088 -d www & SERVER_PID=$!
cd ~/elastic-raider-promo && node -e "
import('playwright').then(async ({ chromium }) => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8088'); await p.waitForTimeout(1200);
  await p.keyboard.press('Space');                  // start run
  await p.waitForTimeout(4000);                     // let it run (and likely die)
  console.log(errs.length ? errs : 'run OK'); await b.close(); process.exit(errs.length ? 1 : 0);
});"
kill $SERVER_PID
```
Expected: `run OK` — no errors through a full play/death cycle.

- [ ] **Step 3: Commit:**
```bash
cd /Users/raditio.ghifiardigmail.com/elastic-raider
git add src/main.js
git commit -m "feat: wire fx events, hit-stop with pending game-over, shaken/unshaken render passes"
```

---

### Task 6: Playwright acceptance

**Files:**
- Create: `/Users/raditio.ghifiardigmail.com/elastic-raider-promo/juice-acceptance.mjs`

- [ ] **Step 1: Create the script** (same serving pattern as shop-acceptance.mjs; hook exposes run/fx/mode):

```js
// Acceptance for the Visual Juice Pass. Run: node juice-acceptance.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = '/Users/raditio.ghifiardigmail.com/elastic-raider/www';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const HOOK = `\nwindow.__er = { get mode() { return game.mode; }, get run() { return run; }, get fx() { return fx; } };\n`;

const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    let body = await readFile(join(ROOT, path));
    if (path === '/src/main.js') body = Buffer.concat([body, Buffer.from(HOOK)]);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(8126, r));

let failures = 0;
const check = (name, ok) => { console.log(ok ? `PASS ${name}` : `FAIL ${name}`); if (!ok) failures++; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:8126/');
await page.waitForTimeout(1200);

// 1. Menu renders the exact day sky (top-left pixel = day skyTop #1b3a5b)
const px = await page.evaluate(() => {
  const c = document.getElementById('game');
  const d = c.getContext('2d').getImageData(2, 2, 1, 1).data;
  return [d[0], d[1], d[2]];
});
check('1 menu sky is day palette', px[0] === 0x1b && px[1] === 0x3a && px[2] === 0x5b);

// Start a run, play with taps so coins get collected
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })));
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })));
await page.waitForTimeout(500);

// 2. Collect activity for ~6s: particles must appear at some point (coins/smashes)
let sawParticles = false, sawShakeOrPopup = false;
const t0 = Date.now();
while (Date.now() - t0 < 6000) {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })), 150);
  });
  const s = await page.evaluate(() => ({
    n: window.__er.fx ? window.__er.fx.state().particles.length : 0,
    pop: window.__er.fx ? window.__er.fx.state().popups.length : 0,
    off: window.__er.fx ? window.__er.fx.offset() : { x: 0, y: 0 },
    mode: window.__er.mode,
  }));
  if (s.n > 0) sawParticles = true;
  if (s.pop > 0 || s.off.x !== 0 || s.off.y !== 0) sawShakeOrPopup = true;
  if (s.mode === 'gameover') break;
  await page.waitForTimeout(180);
}
check('2 particles appeared during play', sawParticles);
check('3 popup or shake observed', sawShakeOrPopup);

// 4. Death ends in gameover (pending-death path completes: banking + transition)
const finalMode = await page.evaluate(() => window.__er.mode);
if (finalMode !== 'gameover') {
  // ensure a death: stop input and wait
  await page.waitForTimeout(8000);
}
check('4 death reaches gameover after hit-stop', await page.evaluate(() => window.__er.mode) === 'gameover');

// 5. Sky differs at night distance, entity palette untouched (restart, teleport)
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })));
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })));
await page.waitForTimeout(400);
await page.evaluate(() => { window.__er.run.world.traveledPx = 750 * 50; }); // 750m = night
await page.waitForTimeout(200);
const nightPx = await page.evaluate(() => {
  const c = document.getElementById('game');
  const d = c.getContext('2d').getImageData(2, 2, 1, 1).data;
  return [d[0], d[1], d[2]];
});
check('5 sky changed at 750m', !(nightPx[0] === 0x1b && nightPx[1] === 0x3a && nightPx[2] === 0x5b));

check('6 zero page errors', errs.length === 0);

await browser.close();
server.close();
console.log(failures ? `\n${failures} FAILURES` : '\nALL JUICE ACCEPTANCE CHECKS PASS');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run:**
```bash
cd /Users/raditio.ghifiardigmail.com/elastic-raider && npm run assemble:web
cd ~/elastic-raider-promo && node juice-acceptance.mjs
```
Expected: `ALL JUICE ACCEPTANCE CHECKS PASS` (exit 0). Fix the game (not the checks) on failure; flag check-bugs (timing flakiness) explicitly if found. Note: HUD-not-shaken (spec acceptance 4) is verified by code structure (HUD drawn outside `beginShake/endShake`) — covered by Task 5's review, not pixel-asserted here.

- [ ] **Step 3:** Repo commit only if game fixes were needed (`git status -s` to confirm).

---

### Task 7: Final verification + PR

- [ ] **Step 1:**
```bash
cd /Users/raditio.ghifiardigmail.com/elastic-raider
npm test                                           # 133 PASS
grep -rn "Phase 4a" docs/superpowers/specs/2026-06-11-visual-juice-pass-design.md && echo "BAD NAME" || echo "naming clean"
```

- [ ] **Step 2: Push + PR:**
```bash
git push -u origin feat/visual-juice
gh pr create --base main \
  --title "feat: visual juice pass — particles, shake, popups, hit-stop, day→night" \
  --body "Implements docs/superpowers/specs/2026-06-11-visual-juice-pass-design.md. Zero gameplay/scoring change; every action now has visual feedback. 133 unit tests + 6 acceptance checks."
```

- [ ] **Step 3: Post-merge:** Pages auto-deploys; verify live with a quick run; record before/after bot footage for the next reel.
