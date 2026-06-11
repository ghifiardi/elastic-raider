import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGestureTracker, createInput } from '../src/engine/input.js';

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

test('committed press then up-swipe: no second jump pulse, hold persists', () => {
  const tr = createGestureTracker();
  tr.down(1, 100, 100, 0);
  tr.tick(90);                       // jump committed + held
  tr.takeIntents();
  tr.move(1, 100, 60);               // drag up 40px
  assert.deepEqual(tr.takeIntents(), NONE);  // no phantom second jump
  assert.equal(tr.jumpHeld, true);           // hold persists until release
});

test('id reuse after a lost up: stale hold does not leak', () => {
  const tr = createGestureTracker();
  tr.down(1, 100, 100, 0);
  tr.tick(90);                       // committed + held
  tr.takeIntents();
  // up(1) is lost (e.g., app backgrounded mid-touch); browser reuses id 1
  tr.down(1, 200, 200, 1000);
  assert.equal(tr.jumpHeld, false);  // stale hold cleared by down()
});

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
