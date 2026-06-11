import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPowerups, activate, tick, gearActive, isInvincible, magnetActive,
  scoreMultiplier, consumeRevive, speedScale, magnetPull,
} from '../src/game/powerups.js';
import {
  GEAR_DURATION, MAGNET_DURATION, MULTIPLIER_DURATION, MERCY_DURATION,
  MULTIPLIER_VALUE, REVIVE_SPEED_EASE, MAGNET_RADIUS,
} from '../src/data/constants.js';

test('fresh state is all zero', () => {
  const s = createPowerups();
  // config is now part of the object; check the numeric fields individually
  assert.equal(s.gear, 0);
  assert.equal(s.magnet, 0);
  assert.equal(s.multiplier, 0);
  assert.equal(s.mercy, 0);
  assert.equal(s.revives, 0);
});

test('activate sets each timer / increments revives', () => {
  const s = createPowerups();
  activate(s, 'gear');   assert.equal(s.gear, GEAR_DURATION);
  activate(s, 'magnet'); assert.equal(s.magnet, MAGNET_DURATION);
  activate(s, 'mult');   assert.equal(s.multiplier, MULTIPLIER_DURATION);
  activate(s, 'revive'); activate(s, 'revive'); assert.equal(s.revives, 2);
});

test('re-activating refreshes duration (no stacking)', () => {
  const s = createPowerups();
  activate(s, 'gear'); tick(s, 2); activate(s, 'gear');
  assert.equal(s.gear, GEAR_DURATION);
});

test('tick decrements timers and clamps at 0; revives untouched', () => {
  const s = createPowerups();
  activate(s, 'magnet'); activate(s, 'revive');
  tick(s, MAGNET_DURATION + 1);
  assert.equal(s.magnet, 0);
  assert.equal(s.revives, 1);
});

test('gearActive only during gear; isInvincible during gear OR mercy', () => {
  const s = createPowerups();
  activate(s, 'gear');
  assert.equal(gearActive(s), true);
  assert.equal(isInvincible(s), true);
  tick(s, GEAR_DURATION + 0.1);
  assert.equal(gearActive(s), false);
  assert.equal(isInvincible(s), false);
  consumeRevive(s);
  s.revives = 1; consumeRevive(s);
  assert.equal(gearActive(s), false);
  assert.equal(isInvincible(s), true);
});

test('magnetActive + scoreMultiplier reflect timers', () => {
  const s = createPowerups();
  assert.equal(magnetActive(s), false);
  assert.equal(scoreMultiplier(s), 1);
  activate(s, 'magnet'); activate(s, 'mult');
  assert.equal(magnetActive(s), true);
  assert.equal(scoreMultiplier(s), MULTIPLIER_VALUE);
});

test('consumeRevive decrements, starts mercy, returns true; false when empty', () => {
  const s = createPowerups();
  assert.equal(consumeRevive(s), false);
  s.revives = 2;
  assert.equal(consumeRevive(s), true);
  assert.equal(s.revives, 1);
  assert.equal(s.mercy, MERCY_DURATION);
});

test('speedScale: 1 without mercy, eases from REVIVE_SPEED_EASE back to 1', () => {
  const s = createPowerups();
  assert.equal(speedScale(s), 1);
  s.revives = 1; consumeRevive(s);
  assert.ok(Math.abs(speedScale(s) - REVIVE_SPEED_EASE) < 1e-9);
  tick(s, MERCY_DURATION / 2);
  const mid = speedScale(s);
  assert.ok(mid > REVIVE_SPEED_EASE && mid < 1);
  tick(s, MERCY_DURATION);
  assert.equal(speedScale(s), 1);
});

test('magnetPull moves an in-radius coin toward the player; ignores others', () => {
  const pb = { x: 180, y: 396, w: 48, h: 64 };
  const near = { type: 'coin', x: 320, y: 410, w: 24, h: 24, collected: false };
  const far  = { type: 'coin', x: 900, y: 100, w: 24, h: 24, collected: false };
  const crate = { type: 'crate', x: 320, y: 410, w: 44, h: 44 };
  const farBefore = far.x, crateBefore = crate.x, nearBefore = near.x;
  magnetPull([near, far, crate], pb, 1 / 60);
  assert.ok(near.x < nearBefore);
  assert.equal(far.x, farBefore);
  assert.equal(crate.x, crateBefore);
});

test('createPowerups stores effect-adjusted durations and starting revives', () => {
  const s = createPowerups({ magnetDurationBonus: 3, gearDurationBonus: 2.4, startingRevives: 2 });
  assert.equal(s.revives, 2);
  activate(s, 'magnet');
  assert.equal(s.magnet, 9);     // MAGNET_DURATION 6 + 3
  activate(s, 'gear');
  assert.equal(s.gear, 7.4);     // GEAR_DURATION 5 + 2.4
});

test('createPowerups without effects matches current behavior', () => {
  const s = createPowerups();
  assert.equal(s.revives, 0);
  activate(s, 'magnet');
  assert.equal(s.magnet, 6);
  activate(s, 'gear');
  assert.equal(s.gear, 5);
});
