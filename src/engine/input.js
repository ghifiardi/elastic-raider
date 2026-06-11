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
      heldJumpIds.delete(id);
      touches.set(id, { x0: x, y0: y, t0: t, consumed: false, committed: false });
    },
    move(id, x, y) {
      const tr = touches.get(id);
      if (!tr || tr.consumed) return;
      const dx = x - tr.x0, dy = y - tr.y0;
      if (Math.hypot(dx, dy) < SWIPE_DIST) return;
      tr.consumed = true;
      if (Math.abs(dy) >= Math.abs(dx)) {
        if (dy < 0) { if (!tr.committed) pending.jumpPressed = true; heldJumpIds.add(id); } // up
        else { pending.slidePressed = true; heldJumpIds.delete(id); }    // down
      } else if (dx > 0) { pending.dashPressed = true; heldJumpIds.delete(id); } // forward
      // leftward ('back') is consumed but inert
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
