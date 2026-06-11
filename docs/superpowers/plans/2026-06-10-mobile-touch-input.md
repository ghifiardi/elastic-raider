# Mobile Touch Input Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the release-time touch classifier with a per-touch gesture tracker (mid-gesture swipes, 90ms jump-commit window, multi-touch-safe holds) so the Android build's in-game controls actually respond.

**Architecture:** A pure `createGestureTracker()` factory in `src/engine/input.js` owns all gesture state and pending one-shot intents; time is injected (no DOM, no clocks inside). `createInput()` becomes a thin DOM wiring layer that forwards `changedTouches` to the tracker and merges tracker intents with keyboard state in `consume()`. `src/ui/screens.js` gains an `isTouch` flag to show gesture hints instead of keyboard hints.

**Tech Stack:** Vanilla ES modules, zero dependencies, `node:test` + `node:assert/strict` (existing pattern in `tests/`).

**Spec:** `docs/superpowers/specs/2026-06-10-mobile-touch-input-design.md`
**Branch:** all work on `feat/mobile-touch-input` (already created; spec commit `94e3f98` is its first commit).

**Tracker API contract (used by every task — do not deviate):**

```js
const tracker = createGestureTracker();
tracker.down(id, x, y, t)   // touch began; t in ms (caller injects performance.now())
tracker.move(id, x, y)      // touch moved; may fire a swipe intent internally
tracker.tick(t)             // call once per frame; commits held jumps past COMMIT_MS
tracker.up(id)              // touch ended; may fire a fast-tap jump internally
tracker.cancel(id)          // touch stolen by system; discards silently
tracker.jumpHeld            // getter: true while any jump-holding touch is down
tracker.takeIntents()       // drains and returns { jumpPressed, slidePressed, dashPressed }
```

`down/move/tick/up/cancel` return nothing. Intents accumulate inside the tracker and leave **only** through `takeIntents()`, which resets them to all-false. Constants: `SWIPE_DIST = 30` (px), `COMMIT_MS = 90` (ms).

---

### Task 1: Tracker core — taps, commit window, hold

**Files:**
- Modify: `src/engine/input.js` (full rewrite begins; old `classifyGesture`, `TAP_DIST`, `TAP_TIME` are deleted)
- Test: `tests/input.test.js` (full rewrite; old `classifyGesture` tests deleted)

- [ ] **Step 1: Replace `tests/input.test.js` with failing tracker-core tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGestureTracker } from '../src/engine/input.js';

const NONE = { jumpPressed: false, slidePressed: false, dashPressed: false };

test('fast tap: jump fires on release, no hold', () => {
  const tr = createGestureTracker();
  tr.down(1, 100, 100, 0);
  tr.tick(50);                       // before COMMIT_MS: nothing yet
  assert.deepEqual(tr.takeIntents(), NONE);
  tr.up(1);
  assert.deepEqual(tr.takeIntents(), { ...NONE, jumpPressed: true });
  assert.equal(tr.jumpHeld, false);
});

test('long press: jump commits at 90ms and holds until release', () => {
  const tr = createGestureTracker();
  tr.down(1, 100, 100, 0);
  tr.tick(90);
  assert.deepEqual(tr.takeIntents(), { ...NONE, jumpPressed: true });
  assert.equal(tr.jumpHeld, true);
  tr.tick(200);                      // no second emission
  assert.deepEqual(tr.takeIntents(), NONE);
  tr.up(1);                          // release: hold ends, no extra jump
  assert.deepEqual(tr.takeIntents(), NONE);
  assert.equal(tr.jumpHeld, false);
});

test('slow tap with tiny drift commits to jump, not slide/back', () => {
  // The original Android failure mode: >200ms press with a few px of drift.
  const tr = createGestureTracker();
  tr.down(1, 100, 100, 0);
  tr.move(1, 108, 112);              // ~14px drift, under SWIPE_DIST
  tr.tick(120);
  const intents = tr.takeIntents();
  assert.equal(intents.jumpPressed, true);
  assert.equal(intents.slidePressed, false);
  assert.equal(intents.dashPressed, false);
  assert.equal(tr.jumpHeld, true);
});

test('takeIntents drains: second call returns all-false', () => {
  const tr = createGestureTracker();
  tr.down(1, 0, 0, 0);
  tr.up(1);
  tr.takeIntents();
  assert.deepEqual(tr.takeIntents(), NONE);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/input.test.js`
Expected: FAIL — `createGestureTracker` is not exported (the old file exports `classifyGesture`/`createInput`).

- [ ] **Step 3: Write the tracker core (replace `src/engine/input.js` entirely)**

Note: `createInput` disappears in this step and returns in Task 4 — `npm test` for *other* suites still passes because only `main.js` (not tests) imports it; `tests/input.test.js` is the only consumer of this module in tests.

```js
const SWIPE_DIST = 30; // px of total movement that turns a touch into a swipe
const COMMIT_MS = 90;  // ms after which a still finger commits to a held jump

// Pure per-touch gesture state machine. Time is injected; no DOM, no clocks.
// Intents accumulate internally and leave only via takeIntents().
export function createGestureTracker() {
  const touches = new Map();     // id -> { x0, y0, t0, consumed, committed }
  const heldJumpIds = new Set(); // touches currently holding a jump
  let pending = { jumpPressed: false, slidePressed: false, dashPressed: false };

  return {
    down(id, x, y, t) {
      touches.set(id, { x0: x, y0: y, t0: t, consumed: false, committed: false });
    },
    move(id, x, y) {
      // Swipe recognition lands in Task 2.
    },
    tick(t) {
      for (const [id, tr] of touches) {
        if (!tr.consumed && !tr.committed && t - tr.t0 >= COMMIT_MS) {
          tr.committed = true;
          pending.jumpPressed = true;
          heldJumpIds.add(id);
        }
      }
    },
    up(id) {
      const tr = touches.get(id);
      if (tr && !tr.consumed && !tr.committed) pending.jumpPressed = true; // fast tap
      heldJumpIds.delete(id);
      touches.delete(id);
    },
    cancel(id) {
      heldJumpIds.delete(id);
      touches.delete(id);
    },
    get jumpHeld() {
      return heldJumpIds.size > 0;
    },
    takeIntents() {
      const out = pending;
      pending = { jumpPressed: false, slidePressed: false, dashPressed: false };
      return out;
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/input.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/input.js tests/input.test.js
git commit -m "feat: gesture tracker core — tap, 90ms commit window, derived hold"
```

---

### Task 2: Swipe recognition on movement

**Files:**
- Modify: `src/engine/input.js` (fill in `move()`)
- Test: `tests/input.test.js` (append)

- [ ] **Step 1: Append failing swipe tests**

```js
test('down-swipe fires slide mid-gesture, never jumps', () => {
  const tr = createGestureTracker();
  tr.down(1, 100, 100, 0);
  tr.move(1, 102, 140);              // 40px down: crosses SWIPE_DIST
  assert.deepEqual(tr.takeIntents(), { ...NONE, slidePressed: true });
  tr.tick(200);                      // consumed: commit window can't fire
  tr.up(1);                          // nor can release
  assert.deepEqual(tr.takeIntents(), NONE);
  assert.equal(tr.jumpHeld, false);
});

test('forward-swipe fires dash; up-swipe fires jump and holds', () => {
  const tr = createGestureTracker();
  tr.down(1, 100, 100, 0);
  tr.move(1, 145, 102);              // 45px right
  assert.deepEqual(tr.takeIntents(), { ...NONE, dashPressed: true });
  tr.up(1);

  tr.down(2, 100, 100, 0);
  tr.move(2, 98, 60);                // 40px up
  assert.deepEqual(tr.takeIntents(), { ...NONE, jumpPressed: true });
  assert.equal(tr.jumpHeld, true);   // up-swipe holds until release
  tr.up(2);
  assert.equal(tr.jumpHeld, false);
});

test('left-swipe is inert and consumes the touch', () => {
  const tr = createGestureTracker();
  tr.down(1, 100, 100, 0);
  tr.move(1, 55, 102);               // 45px left
  assert.deepEqual(tr.takeIntents(), NONE);
  tr.tick(200);                      // consumed: no late jump commit
  tr.up(1);                          // and no tap on release
  assert.deepEqual(tr.takeIntents(), NONE);
});

test('a touch fires at most one swipe', () => {
  const tr = createGestureTracker();
  tr.down(1, 100, 100, 0);
  tr.move(1, 145, 100);              // dash fires
  tr.move(1, 145, 200);              // further movement: nothing new
  assert.deepEqual(tr.takeIntents(), { ...NONE, dashPressed: true });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `node --test tests/input.test.js`
Expected: the 4 new tests FAIL (move() is a no-op); the 4 Task-1 tests still PASS.

- [ ] **Step 3: Implement `move()`**

Replace the `move` stub in `src/engine/input.js` with:

```js
    move(id, x, y) {
      const tr = touches.get(id);
      if (!tr || tr.consumed) return;
      const dx = x - tr.x0, dy = y - tr.y0;
      if (Math.hypot(dx, dy) < SWIPE_DIST) return;
      tr.consumed = true;
      if (Math.abs(dy) >= Math.abs(dx)) {
        if (dy < 0) { pending.jumpPressed = true; heldJumpIds.add(id); } // up
        else { pending.slidePressed = true; heldJumpIds.delete(id); }    // down
      } else if (dx > 0) { pending.dashPressed = true; heldJumpIds.delete(id); } // forward
      // leftward ('back') is consumed but inert
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/input.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/input.js tests/input.test.js
git commit -m "feat: mid-gesture swipe recognition (30px threshold, left inert)"
```

---

### Task 3: Multi-touch independence, cancel, committed-then-swipe

**Files:**
- Test: `tests/input.test.js` (append; implementation from Tasks 1–2 should already satisfy these — this task pins the behaviors)

- [ ] **Step 1: Append the tests**

```js
test('two fingers: B swiping down does not end A held jump', () => {
  const tr = createGestureTracker();
  tr.down(1, 100, 100, 0);           // finger A
  tr.tick(90);                       // A commits + holds
  tr.takeIntents();
  tr.down(2, 300, 100, 100);         // finger B
  tr.move(2, 300, 140);              // B swipes down
  assert.deepEqual(tr.takeIntents(), { ...NONE, slidePressed: true });
  assert.equal(tr.jumpHeld, true);   // A still holding
  tr.up(2);
  assert.equal(tr.jumpHeld, true);
  tr.up(1);
  assert.equal(tr.jumpHeld, false);
});

test('committed press then down-swipe: slide fires and hold ends', () => {
  const tr = createGestureTracker();
  tr.down(1, 100, 100, 0);
  tr.tick(90);                       // jump committed + held
  tr.takeIntents();
  tr.move(1, 100, 140);              // now swipe down
  assert.deepEqual(tr.takeIntents(), { ...NONE, slidePressed: true });
  assert.equal(tr.jumpHeld, false);  // only its own hold cleared
});

test('cancel discards the touch: no tap, no hold', () => {
  const tr = createGestureTracker();
  tr.down(1, 100, 100, 0);
  tr.tick(90);
  tr.takeIntents();
  assert.equal(tr.jumpHeld, true);
  tr.cancel(1);
  assert.equal(tr.jumpHeld, false);
  tr.up(1);                          // stale up after cancel: harmless
  assert.deepEqual(tr.takeIntents(), NONE);
});
```

- [ ] **Step 2: Run the tests**

Run: `node --test tests/input.test.js`
Expected: PASS (11 tests) with no implementation change. If any fail, fix the tracker — these are spec behaviors (spec tests 6–8), not aspirations.

- [ ] **Step 3: Commit**

```bash
git add tests/input.test.js
git commit -m "test: pin multi-touch, cancel, and committed-then-swipe behaviors"
```

---

### Task 4: DOM wiring — rebuild `createInput`

**Files:**
- Modify: `src/engine/input.js` (append `createInput`)
- Test: `tests/input.test.js` (append; uses Node's built-in `EventTarget`/`Event`)

Old API was `{ actions, consume }`; `src/main.js:103` only uses `consume()` (verify: `grep -rn "input\." src/` → only `input.consume()`). New API: `{ consume }`.

- [ ] **Step 1: Append failing wiring tests**

Timing-sensitive paths (commit window) are already covered by the pure tracker tests; these only check the DOM plumbing, so they use the time-independent fast-tap path and the keyboard merge. Update the import at the top of `tests/input.test.js` to include `createInput`, then append:

```js
import { createGestureTracker, createInput } from '../src/engine/input.js';

function touchEvent(type, id, x, y) {
  const e = new Event(type);
  e.changedTouches = [{ identifier: id, clientX: x, clientY: y }];
  return e;
}

test('createInput: fast tap via DOM events produces jumpPressed once', () => {
  const target = new EventTarget();
  const input = createInput(target);
  target.dispatchEvent(touchEvent('touchstart', 1, 100, 100));
  target.dispatchEvent(touchEvent('touchend', 1, 100, 100));
  const a = input.consume();
  assert.equal(a.jumpPressed, true);
  assert.equal(input.consume().jumpPressed, false); // one-shot cleared
});

test('createInput: keyboard space sets jumpPressed and jumpHeld', () => {
  const target = new EventTarget();
  const input = createInput(target);
  const kd = new Event('keydown'); kd.code = 'Space';
  target.dispatchEvent(kd);
  const a = input.consume();
  assert.equal(a.jumpPressed, true);
  assert.equal(a.jumpHeld, true);
  const ku = new Event('keyup'); ku.code = 'Space';
  target.dispatchEvent(ku);
  assert.equal(input.consume().jumpHeld, false);
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `node --test tests/input.test.js`
Expected: FAIL — `createInput` is not exported.

- [ ] **Step 3: Append `createInput` to `src/engine/input.js`**

```js
// Browser wiring around the tracker. Returns { consume }.
// consume() returns a snapshot of one-shot presses + live jumpHeld, then clears one-shots.
export function createInput(target = window) {
  const keys = { jumpPressed: false, jumpHeld: false, slidePressed: false, dashPressed: false };
  const tracker = createGestureTracker();
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  target.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { keys.jumpPressed = true; keys.jumpHeld = true; }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.slidePressed = true;
    else if (e.code === 'ShiftLeft' || e.code === 'KeyX' || e.code === 'KeyJ') keys.dashPressed = true;
  });
  target.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') keys.jumpHeld = false;
  });

  const forward = (fn) => (e) => { for (const t of e.changedTouches) fn(t); };
  target.addEventListener('touchstart', forward((t) => tracker.down(t.identifier, t.clientX, t.clientY, now())), { passive: true });
  target.addEventListener('touchmove', forward((t) => tracker.move(t.identifier, t.clientX, t.clientY)), { passive: true });
  target.addEventListener('touchend', forward((t) => tracker.up(t.identifier)), { passive: true });
  target.addEventListener('touchcancel', forward((t) => tracker.cancel(t.identifier)), { passive: true });

  return {
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
}
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: ALL suites PASS (input now 13 tests; the other 11 suites untouched).

- [ ] **Step 5: Commit**

```bash
git add src/engine/input.js tests/input.test.js
git commit -m "feat: rebuild createInput as thin DOM wiring over the gesture tracker"
```

---

### Task 5: Touch-aware hints

**Files:**
- Modify: `src/ui/screens.js:3-9` (accept `isTouch`, swap menu hint)
- Modify: `src/main.js:39` (detect touch, pass it)
- Create: `tests/screens.test.js`

- [ ] **Step 1: Write failing test `tests/screens.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreens } from '../src/ui/screens.js';

function captureRenderer() {
  const texts = [];
  return { texts, text: (s) => texts.push(String(s)) };
}

test('menu shows gesture hints on touch devices', () => {
  const r = captureRenderer();
  createScreens(r, true).menu(0);
  assert.ok(r.texts.some((t) => t.includes('tap jump · swipe ↓ slide · swipe → dash-smash')));
  assert.ok(!r.texts.some((t) => t.includes('Space jump')));
});

test('menu keeps keyboard hints on desktop', () => {
  const r = captureRenderer();
  createScreens(r, false).menu(0);
  assert.ok(r.texts.some((t) => t.includes('↑/Space jump')));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/screens.test.js`
Expected: FAIL — touch hint string not rendered (createScreens ignores second arg).

- [ ] **Step 3: Implement**

In `src/ui/screens.js`, change the factory signature and menu hint line:

```js
export function createScreens(renderer, isTouch = false) {
  const controlsHint = isTouch
    ? 'tap jump · swipe ↓ slide · swipe → dash-smash'
    : '↑/Space jump · ↓ slide · X/→ dash-smash';
  function menu(walletCoins = 0) {
    renderer.text('ELASTIC RAIDER', VIEW.W / 2, VIEW.H / 2 - 40, 48, 'center');
    renderer.text('Tap / Space to start', VIEW.W / 2, VIEW.H / 2 + 10, 22, 'center');
    renderer.text(controlsHint, VIEW.W / 2, VIEW.H / 2 + 44, 18, 'center');
    renderer.text(`Coins: ${walletCoins}`, VIEW.W / 2, VIEW.H / 2 + 78, 18, 'center');
  }
  // ... hud and gameOver unchanged ...
```

In `src/main.js`, replace `const screens = createScreens(renderer);` with:

```js
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const screens = createScreens(renderer, IS_TOUCH);
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens.js src/main.js tests/screens.test.js
git commit -m "feat: show touch gesture hints on touch devices"
```

---

### Task 6: Verification and PR

**Files:** none (verification + git)

- [ ] **Step 1: Full suite + stale-reference sweep**

```bash
npm test
grep -rn "classifyGesture\|TAP_DIST\|TAP_TIME\|input.actions" src/ tests/ || echo "clean"
```
Expected: tests PASS; grep prints `clean` (no references to the removed API).

- [ ] **Step 2: Web smoke test (desktop browser, touch emulation)**

```bash
npm run serve   # http://localhost:8080
```
In browser devtools device mode: slow-press starts the game and jumps; swipe down slides *before* finger lift; swipe right dashes; menu shows `tap jump · swipe ↓ slide · swipe → dash-smash`.

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin feat/mobile-touch-input
gh pr create --base main --title "feat: rebuild mobile touch input (per-touch tracker, mid-gesture swipes, hold-to-jump)" --body "Implements docs/superpowers/specs/2026-06-10-mobile-touch-input-design.md — fixes dead in-game touch controls on Android."
```

- [ ] **Step 4: Device verification (after merge — user, on phone)**

Rebuild via the "Build Android App Bundle" workflow, sideload the APK, and verify: every quick/slow/sloppy tap jumps; swipes act mid-gesture; holding jumps higher; two-thumb play doesn't drop inputs.
