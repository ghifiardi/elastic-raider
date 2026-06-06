import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aabb, playerBox, dashBox } from '../src/game/collision.js';
import { PLAYER, GROUND_Y } from '../src/data/constants.js';

test('aabb detects overlap', () => {
  assert.equal(aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
});

test('aabb rejects separated boxes', () => {
  assert.equal(aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }), false);
});

test('aabb treats edge-touching as non-overlap', () => {
  assert.equal(aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false);
});

test('playerBox shrinks height while sliding', () => {
  const standing = playerBox({ x: PLAYER.x, y: GROUND_Y, height: PLAYER.hStand });
  const sliding = playerBox({ x: PLAYER.x, y: GROUND_Y, height: PLAYER.hSlide });
  assert.equal(standing.h, PLAYER.hStand);
  assert.equal(sliding.h, PLAYER.hSlide);
  assert.equal(standing.y, GROUND_Y - PLAYER.hStand);
});

test('dashBox is null unless dashing, a forward box when dashing', () => {
  assert.equal(dashBox({ state: 'running', x: PLAYER.x, y: GROUND_Y, height: PLAYER.hStand }), null);
  const box = dashBox({ state: 'dashing', x: PLAYER.x, y: GROUND_Y, height: PLAYER.hStand });
  assert.ok(box.x >= PLAYER.x + PLAYER.w - 1);
  assert.ok(box.w > 0);
});
