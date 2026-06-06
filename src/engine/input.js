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
