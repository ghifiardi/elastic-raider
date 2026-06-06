import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, updateWorld } from '../src/game/world.js';
import { createRng } from '../src/engine/rng.js';

test('world starts with spawned entities ahead of the screen', () => {
  const w = createWorld(createRng(5));
  assert.ok(w.entities.length > 0);
});

test('updateWorld scrolls entities left by speed*dt', () => {
  const w = createWorld(createRng(5));
  const first = w.entities[0];
  const x0 = first.x;
  updateWorld(w, 1, 300);
  assert.ok(Math.abs((x0 - first.x) - 300) < 1e-6);
});

test('entities scrolled off the left are removed', () => {
  const w = createWorld(createRng(5));
  for (let i = 0; i < 600; i++) updateWorld(w, 1 / 60, 600);
  assert.ok(w.entities.every((e) => e.x + e.w > -200));
});

test('new entities keep appearing on the right (endless)', () => {
  const w = createWorld(createRng(5));
  let maxX = Math.max(...w.entities.map((e) => e.x));
  for (let i = 0; i < 600; i++) updateWorld(w, 1 / 60, 600);
  const newMaxX = Math.max(...w.entities.map((e) => e.x));
  assert.ok(newMaxX > 0);
  assert.ok(w.entities.length > 0);
});
