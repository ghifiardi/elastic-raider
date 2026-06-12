import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerpColor, paletteAt, PALETTE } from '../src/engine/sprites.js';

test('lerpColor endpoints are exact', () => {
  assert.equal(lerpColor('#000000', '#ffffff', 0), '#000000');
  assert.equal(lerpColor('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(lerpColor('#102030', '#304050', 0.5), '#203040');
});

test('paletteAt(0) is the exact day palette (no visual change at rest)', () => {
  const p = paletteAt(0);
  assert.equal(p.skyTop, PALETTE.skyTop);
  assert.equal(p.skyBottom, PALETTE.skyBottom);
  assert.equal(p.cloud, PALETTE.cloud);
  assert.equal(p.island, PALETTE.island);
  assert.equal(p.seaFar, PALETTE.seaFar);
  assert.equal(p.foam, PALETTE.foam);
  assert.equal(p.starAlpha, 0);
});

test('paletteAt(0.5) is night: darker sky, visible stars', () => {
  const n = paletteAt(0.5);
  assert.notEqual(n.skyTop, PALETTE.skyTop);
  assert.ok(n.starAlpha > 0.5);
});

test('paletteAt wraps smoothly: phase 0 equals phase ~1', () => {
  const a = paletteAt(0), b = paletteAt(0.999);
  // within one lerp step of day
  assert.equal(a.starAlpha, 0);
  assert.ok(b.starAlpha < 0.05);
});
