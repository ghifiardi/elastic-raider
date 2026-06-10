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
