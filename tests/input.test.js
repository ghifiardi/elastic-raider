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
