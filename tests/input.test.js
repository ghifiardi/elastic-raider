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
