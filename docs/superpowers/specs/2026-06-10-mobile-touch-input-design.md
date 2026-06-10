# Mobile Touch Input Redesign — Design Spec

**Date:** 2026-06-10
**Status:** Approved pending user review
**Problem:** On Android (Capacitor APK), in-game touch controls are effectively dead. The game starts from the menu, but during play taps/swipes mostly do nothing.

## Root causes (current `src/engine/input.js`)

1. **Release-time classification.** All gestures classify on `touchend`, so every action carries the full gesture duration as latency, and holding a finger does nothing.
2. **200ms tap deadline.** A press longer than `TAP_TIME` (200ms) is not a tap; with near-zero movement it falls through the swipe branch and misclassifies as `'down'` (slide) — or jump never fires.
3. **`'back'` intent is silently dropped.** A slight leftward drift produces `'back'`, which `press()` ignores entirely.
4. **Multi-touch corruption.** A single `(sx, sy, st)` triple is overwritten by any new `touchstart`; the first finger's release computes a garbage delta.
5. **No hold-to-jump on touch.** Keyboard supports variable jump height via `jumpHeld` (`player.js:48` drains `vy` with `JUMP_CUT` when released); touch can never hold, so every touch jump is a short hop.
6. **Keyboard-only hints.** The menu shows `↑/Space jump · ↓ slide · X/→ dash-smash`; mobile players are never told the gestures.

## Design

### 1. Per-touch gesture tracker (pure core)

New pure factory `createGestureTracker()` in `src/engine/input.js` with injected time (no DOM, no `performance.now()` inside):

- `down(id, x, y, t)` — start tracking touch `id`.
- `move(id, x, y)` — if the touch is unconsumed and total movement ≥ `SWIPE_DIST` (30px), classify by dominant axis and fire **immediately**:
  - `up` → jump (`jumpPressed`) + add `id` to `heldJumpIds`
  - `down` → slide (`slidePressed`), remove `id` from `heldJumpIds`
  - `forward` → dash (`dashPressed`), remove `id` from `heldJumpIds`
  - `back` → no action (consumed, inert)
  Mark the touch consumed; a touch fires at most one swipe.
- `tick(t)` — called once per frame from `consume()`. Any unconsumed touch older than `COMMIT_MS` (90ms) **commits as a held jump**: `jumpPressed` + add `id` to `heldJumpIds`. Mark committed.
- `up(id, t)` — if the touch was never consumed and never committed, it is a **fast tap**: `jumpPressed` on release, no hold (short hop — matches a fast keyboard tap). Always: remove `id` from `heldJumpIds`, drop the tracker.
- `cancel(id)` — drop the tracker and remove `id` from `heldJumpIds` (Android fires `touchcancel` when the system claims the gesture).
- `jumpHeld` is **derived**: `heldJumpIds.size > 0`. Never a directly-toggled boolean.

A committed (already-jumped) touch that later crosses `SWIPE_DIST` still fires its swipe action and removes its own id from `heldJumpIds` (e.g. press-then-swipe-down: the jump already happened; slide fires and the jump's hold ends; `player.js` ignores slide while airborne — acceptable).

#### Timing summary

| Gesture | Action fires | Hold |
|---|---|---|
| Fast tap (<90ms) | on release | no (short hop, same as fast keyboard tap) |
| Press ≥90ms | at 90ms (+≤16ms frame granularity) | yes, until that finger lifts |
| Swipe up | the moment movement crosses 30px | yes, until that finger lifts |
| Swipe down / forward | the moment movement crosses 30px | n/a (clears own hold) |
| Swipe left | never (inert) | n/a |

Constants: `SWIPE_DIST = 30` (px), `COMMIT_MS = 90` (ms). The old `TAP_DIST`/`TAP_TIME` and `classifyGesture` are removed.

### 2. DOM wiring (thin layer in `createInput`)

- `touchstart`/`touchmove`/`touchend`/`touchcancel` listeners iterate **all** `e.changedTouches` and forward `(identifier, clientX, clientY, now())` to the tracker. Listeners stay `{ passive: true }` (`index.html` already sets `touch-action: none`, which covers browser-gesture interference).
- `consume()` calls `tracker.tick(now())` before snapshotting, then merges tracker one-shots with keyboard state. `jumpHeld` in the snapshot is `keyboardHeld || tracker.jumpHeld`.
- Keyboard handling unchanged.

### 3. Touch-aware hints (`src/ui/screens.js`, `src/main.js`)

- `main.js` detects touch once (`'ontouchstart' in window || navigator.maxTouchPoints > 0`) and passes `isTouch` to `createScreens(renderer, isTouch)`.
- Menu on touch devices: `tap jump · swipe ↓ slide · swipe → dash-smash` (replaces the keyboard line). Desktop keeps the current keyboard line.
- Game-over screen unchanged (`Tap / Space to run again` already covers both).

### 4. Out of scope

No changes to physics (`player.js`), rendering, packaging, or the Android project. `player.js` already orders dash → slide → jump and gates jump on `state`, so same-frame overrides are safe.

## Files changed

- `src/engine/input.js` — rewrite around `createGestureTracker()` (pure) + thin DOM wiring.
- `src/ui/screens.js` — accept `isTouch`, swap hint string.
- `src/main.js` — detect touch, pass to `createScreens`.
- `tests/input.test.js` — rewrite against the pure tracker.

## Testing

Unit tests (`node:test`, zero-dep, pure tracker with injected timestamps):

1. Fast tap (<90ms): `jumpPressed` on `up`, `jumpHeld` false after.
2. Long press: `tick` at +90ms emits `jumpPressed` once; `jumpHeld` true while down, false after `up`; no second emission.
3. Down-swipe crossing 30px before 90ms: `slidePressed` fires on `move` (before release), **no jump ever**.
4. Forward-swipe: `dashPressed` on threshold crossing.
5. Left-swipe: nothing fires; touch consumed (later movement can't fire either).
6. Two fingers: finger A committed-held while finger B swipes down → `slidePressed` fires, `jumpHeld` stays true (A still down); B's swipe removes only B's id.
7. `cancel` drops tracker and hold.
8. Committed press then down-swipe: slide fires, hold cleared.

End-to-end verification:

1. `npm test` green.
2. Web smoke-test via `npm run serve` + browser devtools touch emulation.
3. Rebuild APK via the existing "Build Android App Bundle" workflow, sideload, and verify on device: every quick/slow/sloppy tap jumps; swipes respond mid-gesture; holding jumps higher; two-thumb play doesn't drop inputs; menu shows touch hints.
