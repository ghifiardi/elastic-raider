# Elastic Raider — Pirate Adventure Visual Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder primitives with hand-drawn, lightly-animated pirate-adventure sprites (raider, marines, barrels, treasure, sea, dock, parallax backdrop, themed power-ups), drawn procedurally in code with zero new dependencies — without touching any gameplay/collision/spawn/persistence logic.

**Architecture:** A new `src/engine/sprites.js` holds **stateless draw helpers** (each takes `ctx` + params + an animation time `t`, mutates the canvas, returns nothing; deterministic given inputs — NOT "pure", since it writes to `ctx`). `src/engine/render.js` becomes a thin orchestrator that delegates to those helpers and threads `t`. `src/main.js` accumulates a frame `clock` and passes it to the renderer. All sprites draw within the existing `SIZES`/`PLAYER` hitboxes, so collision is identical.

**Tech Stack:** Vanilla JS (ES modules), HTML5 Canvas 2D. No new dependencies. Verified visually in the preview; pure-logic suite stays green.

**Branch:** `feat/pirate-visual-pass` (Phases 1/2/3a on `main`; 82 tests pass).

**Spec:** `docs/superpowers/specs/2026-06-07-elastic-raider-pirate-visual-pass-design.md`

**IP-SAFETY (binding — applies to every task, all code/comments/UI/commit messages/PR):** Generic pirate-adventure only. NO protected references of any kind — no named characters, places, abilities, or currencies; **no straw hat**; no recreation of an iconic character's silhouette or exact outfit/colors; no comparisons to other games/franchises in code or commits. The hero wears a **red bandana**.

**Verification model:** This is a visual pass. Drawing code is **not unit-tested**; it's verified by the controller via preview screenshots at the checkpoints. Every implementation task MUST still end green: `node --test` = **82/82** (no logic touched) and `node --check` passes on changed files. Do NOT change `SIZES`, `PLAYER`, collision, spawning, scoring, power-up, or persistence code — if a look seems to need that, STOP and report.

---

## File Structure

```
NEW  src/engine/sprites.js   stateless draw helpers + PALETTE (all the actual drawing)
MOD  src/engine/render.js    orchestrator: delegates to sprites, threads the time arg `t`
MOD  src/main.js             frame clock (clock += dt at top of update); pass clock to render
```

No test files change. No other source files change.

---

## Task 1: Scaffold — `sprites.js` + `PALETTE`, frame clock, thread `t` (no look change)

**Files:**
- Create: `src/engine/sprites.js`
- Modify: `src/engine/render.js`
- Modify: `src/main.js`

- [ ] **Step 1: Create `src/engine/sprites.js`** with the palette (drawing helpers are added in later tasks):

```js
// Stateless draw helpers for the pirate-adventure visual pass.
// Each helper takes (ctx, ...params[, t]) and mutates the canvas. No module
// state; deterministic given its inputs. Not "pure" — it writes to ctx.
import { VIEW, GROUND_Y, PLAYER, DASH_REACH } from '../data/constants.js';

export const PALETTE = {
  skyTop: '#1b3a5b', skyBottom: '#3d6e93', cloud: '#cfe3f2',
  island: '#244b3a', seaFar: '#1f6f9c', foam: '#bfe8ff',
  dock: '#6b4420', dockEdge: '#9c6a34', woodDark: '#5a3a1c',
  gapSea: '#155a82', gapFoam: '#bfe8ff',
  skin: '#f0c79a', hair: '#3a2a1c', bandana: '#d23b3b', vest: '#2a5db0', shirt: '#e8e2d0', shorts: '#243b66',
  coat: '#2f4f8f', coatDark: '#243d6e', cap: '#f5f5f5', capBand: '#243d6e',
  wood: '#9a6a33', band: '#cfcfcf',
  coin: '#ffcf3f', coinShine: '#fff2b0',
  gear: '#ff7a33', magnet: '#46c2ff', mult: '#b388ff', revive: '#ff5d8f',
  glow: '#ffe07a', ring: '#46c2ff', text: '#f5efe0',
};
```

- [ ] **Step 2: Thread `t` through the `render.js` method signatures** (bodies unchanged for now — they simply ignore the new arg). In `src/engine/render.js`, change these four function signatures (leave their bodies exactly as-is):
  - `function background(traveledPx) {` → `function background(traveledPx, t = 0) {`
  - `function ground(entities) {` → `function ground(entities, t = 0) {`
  - `function entitiesLayer(entities) {` → `function entitiesLayer(entities, t = 0) {`
  - `function player(p, invincible = false) {` → `function player(p, invincible = false, t = 0) {`

- [ ] **Step 3: Add the frame clock in `src/main.js`.** Add a module variable near the other `let` declarations (after `let lastResult = ...`):
```js
let clock = 0; // seconds, advanced every frame (drives sprite animation in all modes)
```
Then, in `update(dt)`, make the **very first line** (before the `const actions = input.consume();` line):
```js
  clock += dt;
```

- [ ] **Step 4: Pass `clock` to the renderer in `src/main.js` `render()`.** Replace the body of `render()` with (only the render-call args change — `screens.*` and logic are unchanged):
```js
function render() {
  renderer.clear();
  if (game.mode === MODES.MENU) {
    renderer.background(0, clock);
    renderer.ground([], clock);
    screens.menu(saveData.coins);
    return;
  }
  renderer.background(run.world.traveledPx, clock);
  renderer.ground(run.world.entities, clock);
  renderer.entitiesLayer(run.world.entities, clock);
  if (magnetActive(run.powerups)) renderer.magnetRing(playerBox(run.player));
  renderer.player(run.player, isInvincible(run.powerups), clock);
  screens.hud(total(run.score), multiplier(run.combo), saveData.highScore, {
    revives: run.powerups.revives,
    scoreMult: scoreMultiplier(run.powerups),
  });
  if (game.mode === MODES.GAMEOVER) {
    screens.gameOver(lastResult.score, saveData.highScore, lastResult.isNewBest, lastResult.banked, lastResult.wallet);
  }
}
```

- [ ] **Step 5: Verify (no look change expected)**

Run: `cd ~/elastic-raider && node --check src/engine/sprites.js src/engine/render.js src/main.js && node --test`
Expected: parses; **82/82** pass. The game looks identical (the `t` args are unused so far).

- [ ] **Step 6: Commit**

```bash
cd ~/elastic-raider
git add src/engine/sprites.js src/engine/render.js src/main.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: scaffold sprites helpers + animation clock (no visual change yet)"
```

---

## Task 2: Background + dock + water gap

**Files:**
- Modify: `src/engine/sprites.js` (add background/ground helpers)
- Modify: `src/engine/render.js` (delegate `background` + `ground`)

- [ ] **Step 1: Append the background/ground helpers to `src/engine/sprites.js`:**

```js
export function drawSky(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW.H);
  g.addColorStop(0, PALETTE.skyTop); g.addColorStop(1, PALETTE.skyBottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW.W, VIEW.H);
}

function cloudPuff(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.arc(x + 26, y - 8, 26, 0, Math.PI * 2);
  ctx.arc(x + 54, y, 20, 0, Math.PI * 2);
  ctx.fill();
}

export function drawClouds(ctx, traveledPx, t) {
  const span = VIEW.W + 200;
  const off = (traveledPx * 0.05 + t * 8) % span;
  ctx.fillStyle = PALETTE.cloud; ctx.globalAlpha = 0.85;
  for (const [bx, by] of [[120, 90], [430, 60], [720, 110], [950, 75]]) {
    const x = ((bx - off) % span + span) % span - 100;
    cloudPuff(ctx, x, by);
  }
  ctx.globalAlpha = 1;
}

export function drawIslands(ctx, traveledPx) {
  const off = (traveledPx * 0.15) % 380;
  ctx.fillStyle = PALETTE.island;
  for (let i = -1; i < 4; i++) {
    const cx = i * 380 - off + 120;
    ctx.beginPath();
    ctx.moveTo(cx - 90, 300);
    ctx.quadraticCurveTo(cx, 232, cx + 90, 300);
    ctx.closePath(); ctx.fill();
  }
}

export function drawSea(ctx, traveledPx, t) {
  const top = 300, bottom = 360;
  ctx.fillStyle = PALETTE.seaFar;
  ctx.fillRect(0, top, VIEW.W, bottom - top);
  ctx.strokeStyle = PALETTE.foam; ctx.globalAlpha = 0.4; ctx.lineWidth = 2;
  ctx.beginPath();
  const off = (traveledPx * 0.3 + t * 20) % 40;
  for (let x = -40 + off; x < VIEW.W; x += 40) {
    const y = top + 22 + Math.sin((x + t * 30) * 0.05) * 4;
    ctx.moveTo(x, y); ctx.lineTo(x + 16, y);
  }
  ctx.stroke(); ctx.globalAlpha = 1;
}

export function drawDock(ctx) {
  ctx.fillStyle = PALETTE.dock;
  ctx.fillRect(0, GROUND_Y, VIEW.W, VIEW.H - GROUND_Y);
  ctx.fillStyle = PALETTE.dockEdge;
  ctx.fillRect(0, GROUND_Y, VIEW.W, 6);
  ctx.strokeStyle = PALETTE.woodDark; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < VIEW.W; x += 64) { ctx.moveTo(x, GROUND_Y + 6); ctx.lineTo(x, VIEW.H); }
  ctx.stroke(); ctx.globalAlpha = 1;
}

export function drawWaterGap(ctx, x, w, t) {
  ctx.fillStyle = PALETTE.gapSea;
  ctx.fillRect(x, GROUND_Y, w, VIEW.H - GROUND_Y);
  ctx.strokeStyle = PALETTE.gapFoam; ctx.globalAlpha = 0.7; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= w; i += 6) {
    const y = GROUND_Y + 3 + Math.sin((x + i) * 0.15 + t * 4) * 3;
    if (i === 0) ctx.moveTo(x + i, y); else ctx.lineTo(x + i, y);
  }
  ctx.stroke(); ctx.globalAlpha = 1;
}
```

- [ ] **Step 2: Delegate `background` + `ground` in `src/engine/render.js`.** Add a new import at the top (render.js keeps its existing `COLORS` for `clear`/`magnetRing`/`text`; `PALETTE` stays internal to `sprites.js`, so it is NOT imported here — only the draw functions are):
```js
import { drawSky, drawClouds, drawIslands, drawSea, drawDock, drawWaterGap } from './sprites.js';
```
Replace the `background` function with:
```js
  function background(traveledPx, t = 0) {
    drawSky(ctx);
    drawClouds(ctx, traveledPx, t);
    drawIslands(ctx, traveledPx);
    drawSea(ctx, traveledPx, t);
  }
```
Replace the `ground` function with:
```js
  function ground(entities, t = 0) {
    drawDock(ctx);
    for (const e of entities) if (e.type === 'gap') drawWaterGap(ctx, e.x, e.w, t);
  }
```

- [ ] **Step 3: Verify**

Run: `cd ~/elastic-raider && node --check src/engine/sprites.js src/engine/render.js && node --test`
Expected: parses; **82/82** pass.

- [ ] **Step 4: Commit**

```bash
git add src/engine/sprites.js src/engine/render.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: pirate sky/cloud/island/sea backdrop + wooden dock + water gaps"
```

> **CONTROLLER CHECKPOINT (after Task 2):** preview the menu + a run — confirm the sky gradient, drifting clouds, horizon islands, sea shimmer, and dock planks render correctly behind the still-primitive entities; no console errors.

---

## Task 3: Entities — barrel, marine, spinning coin

**Files:**
- Modify: `src/engine/sprites.js` (add entity helpers)
- Modify: `src/engine/render.js` (rewrite `entitiesLayer` for coin/marine/crate)

- [ ] **Step 1: Append the entity helpers to `src/engine/sprites.js`:**

```js
export function drawBarrel(ctx, e) {
  const { x, y, w, h } = e;
  ctx.fillStyle = PALETTE.wood; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PALETTE.woodDark; ctx.globalAlpha = 0.3;
  ctx.fillRect(x, y, 4, h); ctx.fillRect(x + w - 4, y, 4, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.band;
  ctx.fillRect(x, y + h * 0.18, w, 4);
  ctx.fillRect(x, y + h * 0.70, w, 4);
}

export function drawMarine(ctx, e) {
  const { x, y, w, h } = e;
  ctx.fillStyle = PALETTE.coat;  ctx.fillRect(x, y + h * 0.30, w, h * 0.70);
  ctx.fillStyle = PALETTE.coatDark; ctx.fillRect(x, y + h * 0.60, w, 4);
  ctx.fillStyle = PALETTE.skin;  ctx.fillRect(x + w * 0.25, y + h * 0.12, w * 0.50, h * 0.20);
  ctx.fillStyle = PALETTE.cap;   ctx.fillRect(x + w * 0.16, y + h * 0.02, w * 0.68, h * 0.12);
  ctx.fillStyle = PALETTE.capBand; ctx.fillRect(x + w * 0.16, y + h * 0.12, w * 0.68, 3);
}

export function drawCoin(ctx, e, t) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2;
  const sx = Math.max(0.15, Math.abs(Math.cos(t * 4 + e.x * 0.05)));
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(sx, 1);
  ctx.fillStyle = PALETTE.coin; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.coinShine; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.25, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
```

- [ ] **Step 2: Rewrite `entitiesLayer` in `src/engine/render.js`** to dispatch real sprites for coin/marine/crate (power-up pickups keep the temporary diamond until Task 4). Add `drawBarrel, drawMarine, drawCoin` to the `./sprites.js` import. Replace the `entitiesLayer` function with:
```js
  function entitiesLayer(entities, t = 0) {
    for (const e of entities) {
      if (e.type === 'gap') continue;
      if (e.type === 'coin') { drawCoin(ctx, e, t); continue; }
      if (e.type === 'marine') { drawMarine(ctx, e); continue; }
      if (e.type === 'crate') { drawBarrel(ctx, e); continue; }
      if (PICKUP_COLOR[e.type]) {
        const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2;
        ctx.fillStyle = PICKUP_COLOR[e.type];
        ctx.beginPath();
        ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
        ctx.closePath(); ctx.fill();
      }
    }
  }
```
(`PICKUP_COLOR` and `COLORS` already exist in render.js; leave them — Task 4 removes the pickup-diamond branch.)

- [ ] **Step 3: Verify**

Run: `cd ~/elastic-raider && node --check src/engine/sprites.js src/engine/render.js && node --test`
Expected: parses; **82/82** pass.

- [ ] **Step 4: Commit**

```bash
git add src/engine/sprites.js src/engine/render.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: barrel, marine, and spinning treasure sprites"
```

> **CONTROLLER CHECKPOINT (after Task 3):** preview a run — confirm barrels (was crates), navy marines, and spinning gold coins read clearly and sit within their hitboxes; no console errors.

---

## Task 4: Hero + themed power-ups + animation

**Files:**
- Modify: `src/engine/sprites.js` (add `drawHero`, `drawPickup` + icon helpers)
- Modify: `src/engine/render.js` (delegate `player`; route pickups to `drawPickup`)

- [ ] **Step 1: Append the hero + pickup helpers to `src/engine/sprites.js`:**

```js
export function drawHero(ctx, p, invincible, t) {
  const w = PLAYER.w, h = p.height, topY = p.y - h, cx = p.x + w / 2;
  if (invincible) {
    ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = PALETTE.glow;
    ctx.fillRect(p.x - 6, topY - 6, w + 12, h + 12); ctx.restore();
  }
  const running = p.state === 'running';
  const dashing = p.state === 'dashing';
  const sliding = p.state === 'sliding';
  const bob = running ? Math.sin(t * 12) * 2 : 0;
  const swing = running ? Math.sin(t * 12) * 6 : 0;

  const headR = w * 0.28;
  const headCy = topY + bob + headR + (sliding ? 2 : 4);
  const torsoTop = headCy + headR * 0.6;
  const torsoBot = p.y - (sliding ? 2 : h * 0.26);

  // legs
  ctx.strokeStyle = PALETTE.shorts; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 5, torsoBot); ctx.lineTo(cx - 5 - swing * 0.4, p.y);
  ctx.moveTo(cx + 5, torsoBot); ctx.lineTo(cx + 5 + swing * 0.4, p.y);
  ctx.stroke();

  // torso (shirt + vest stripes)
  ctx.fillStyle = PALETTE.shirt; ctx.fillRect(cx - w * 0.22, torsoTop, w * 0.44, torsoBot - torsoTop);
  ctx.fillStyle = PALETTE.vest;
  ctx.fillRect(cx - w * 0.24, torsoTop, w * 0.10, torsoBot - torsoTop);
  ctx.fillRect(cx + w * 0.14, torsoTop, w * 0.10, torsoBot - torsoTop);

  // arms (the dash stretches the front arm forward — the signature reach)
  ctx.strokeStyle = PALETTE.skin; ctx.lineWidth = 5; ctx.lineCap = 'round';
  const armY = torsoTop + (torsoBot - torsoTop) * 0.3;
  if (dashing) {
    ctx.beginPath(); ctx.moveTo(cx, armY); ctx.lineTo(p.x + w + DASH_REACH, armY); ctx.stroke();
    ctx.fillStyle = PALETTE.skin; ctx.beginPath(); ctx.arc(p.x + w + DASH_REACH, armY, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, armY); ctx.lineTo(cx - 10, armY + 8); ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx, armY); ctx.lineTo(cx + 8 + swing, armY + 10);
    ctx.moveTo(cx, armY); ctx.lineTo(cx - 8 - swing, armY + 10);
    ctx.stroke();
  }

  // head + hair + red bandana
  ctx.fillStyle = PALETTE.skin; ctx.beginPath(); ctx.arc(cx, headCy, headR, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.hair; ctx.fillRect(cx - headR, headCy - headR * 0.1, headR * 2, headR * 0.5);
  ctx.fillStyle = PALETTE.bandana;
  ctx.beginPath(); ctx.arc(cx, headCy, headR, Math.PI, 0); ctx.fill();
  ctx.fillRect(cx - headR, headCy - 2, headR * 2, 5);
  ctx.fillRect(cx + headR - 2, headCy - 1, 8, 4); // knot tail
}

function gearOrb(ctx, r, t) {
  ctx.fillStyle = PALETTE.gear; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.7; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.5, t * 3, t * 3 + Math.PI * 1.3); ctx.stroke();
  ctx.globalAlpha = 1;
}
function magnetIcon(ctx, r) {
  ctx.strokeStyle = PALETTE.magnet; ctx.lineWidth = r * 0.5; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.6, Math.PI, 0); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, -r * 0.1); ctx.lineTo(-r * 0.6, r * 0.7);
  ctx.moveTo(r * 0.6, -r * 0.1); ctx.lineTo(r * 0.6, r * 0.7);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-r * 0.85, r * 0.55, r * 0.5, r * 0.22);
  ctx.fillRect(r * 0.35, r * 0.55, r * 0.5, r * 0.22);
}
function starShape(ctx, outer, inner) {
  let rot = -Math.PI / 2; const step = Math.PI / 5;
  ctx.beginPath(); ctx.moveTo(0, -outer);
  for (let i = 0; i < 5; i++) {
    ctx.lineTo(Math.cos(rot) * outer, Math.sin(rot) * outer); rot += step;
    ctx.lineTo(Math.cos(rot) * inner, Math.sin(rot) * inner); rot += step;
  }
  ctx.closePath(); ctx.fill();
}
function multStar(ctx, r) {
  ctx.fillStyle = PALETTE.mult; starShape(ctx, r, r * 0.5);
  ctx.fillStyle = '#fff'; ctx.font = `${Math.round(r)}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('2', 0, 1);
  ctx.textBaseline = 'alphabetic';
}
function heartIcon(ctx, r) {
  ctx.fillStyle = PALETTE.revive;
  ctx.beginPath(); ctx.moveTo(0, r * 0.6);
  ctx.bezierCurveTo(r, -r * 0.2, r * 0.4, -r, 0, -r * 0.3);
  ctx.bezierCurveTo(-r * 0.4, -r, -r, -r * 0.2, 0, r * 0.6);
  ctx.fill();
}

export function drawPickup(ctx, e, t) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2;
  const bob = Math.sin(t * 3 + e.x * 0.05) * 2;
  ctx.save(); ctx.translate(cx, cy + bob);
  if (e.type === 'gear') gearOrb(ctx, r, t);
  else if (e.type === 'magnet') magnetIcon(ctx, r);
  else if (e.type === 'mult') multStar(ctx, r);
  else if (e.type === 'revive') heartIcon(ctx, r);
  ctx.restore();
}
```

- [ ] **Step 2: Delegate `player` and route pickups in `src/engine/render.js`.** Add `drawHero, drawPickup` to the `./sprites.js` import. Replace the `player` function with:
```js
  function player(p, invincible = false, t = 0) {
    drawHero(ctx, p, invincible, t);
  }
```
And in `entitiesLayer`, replace the pickup-diamond branch:
```js
      if (PICKUP_COLOR[e.type]) {
        const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2;
        ctx.fillStyle = PICKUP_COLOR[e.type];
        ctx.beginPath();
        ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
        ctx.closePath(); ctx.fill();
      }
```
with:
```js
      if (e.type === 'gear' || e.type === 'magnet' || e.type === 'mult' || e.type === 'revive') {
        drawPickup(ctx, e, t);
      }
```

- [ ] **Step 3: Verify**

Run: `cd ~/elastic-raider && node --check src/engine/sprites.js src/engine/render.js && node --test`
Expected: parses; **82/82** pass.

- [ ] **Step 4: Commit**

```bash
git add src/engine/sprites.js src/engine/render.js
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: bandana raider hero with run/dash animation + themed power-up icons"
```

> **CONTROLLER CHECKPOINT (after Task 4):** preview menu + a live run — confirm the bandana raider runs (bob/arm-swing), the dash stretches the arm forward, slide crouches, the four pickups (orange orb / cyan magnet / purple ×2 star / pink heart) are recognizable, and the coin spin + sea shimmer animate; no console errors.

---

## Task 5: Acceptance pass

**Files:** none (verification only — controller-driven)

- [ ] **Step 1: Full suite + parse** — `cd ~/elastic-raider && node --test` → **82/82, 0 failures**; `node --check src/engine/sprites.js src/engine/render.js src/main.js` → clean.

- [ ] **Step 2: IP-safety grep** — `grep -rniE "one piece|luffy|gum-gum|gum gum|devil fruit|straw hat|nika|zoro|nami" src/ docs/superpowers/specs/2026-06-07-elastic-raider-pirate-visual-pass-design.md docs/superpowers/plans/2026-06-07-elastic-raider-pirate-visual-pass.md` → expect **no matches** in `src/` (the spec/plan may mention "straw hat" only inside their binding "do NOT use" constraint lines; confirm `src/` is clean).

- [ ] **Step 3: Preview acceptance** (controller): capture screenshots of —
- [ ] Menu (parallax sky/clouds/islands/sea + dock + wallet line).
- [ ] A live run showing the raider, ≥1 marine, ≥1 barrel, treasure coins, a water gap, on the dock with the backdrop.
- [ ] The dash pose (front arm stretched forward).
- [ ] Each of the four power-up pickups recognizable.
- [ ] **No console errors** (`preview_console_logs` level=error empty) across menu + gameplay.

- [ ] **Step 4 (only if a checkpoint flagged a look issue):** adjust palette values / sprite proportions in `src/engine/sprites.js` (drawing only — never hitboxes/sizes/logic), re-verify, and commit `chore: tune pirate sprite visuals from preview`.

---

## Spec coverage check (self-review)

- `engine/sprites.js` stateless draw helpers + `PALETTE` → Task 1 (palette) + Tasks 2–4 (helpers). ✓
- `render.js` delegates + threads `t`; keeps method names → Tasks 1–4. ✓
- `main.js` `clock += dt` at top of `update` (animates menu too) + passes `clock` → Task 1. ✓
- Background parallax (sky/clouds/islands/sea) + dock + animated water gap → Task 2. ✓
- Barrel, marine, spinning coin → Task 3. ✓
- Bandana raider with run/jump/slide/dash states + invincible glow; themed pickups (orb/magnet/×2 star/heart) → Task 4. ✓
- Clock-driven animation, no per-entity animation state → Tasks 2–4 (functions of `t`/position). ✓
- Hitboxes/sizes unchanged (sprites draw within `SIZES`/`PLAYER`); no logic touched → all tasks (each ends `node --test` 82/82). ✓
- IP-safety (no protected refs; red bandana not straw hat; no comparisons) → header + every task + Task 5 grep. ✓
- Verification = preview screenshots + no-console + green suite → checkpoints after Tasks 2/3/4 + Task 5. ✓
- Out of scope (gameplay/hitbox/spawn/balance/persistence, shop/characters/missions, multi-frame cycles, assets) → no task touches them. ✓
```
