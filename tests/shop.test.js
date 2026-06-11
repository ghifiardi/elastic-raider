import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UPGRADES, maxTier, tierOf, nextCost, canBuy, buyUpgrade, effectsOf,
} from '../src/meta/shop.js';
import { DASH_COOLDOWN } from '../src/data/constants.js';

const freshSave = (coins = 0, upgrades = {}) => ({ coins, upgrades });

test('catalog has the five spec upgrades', () => {
  assert.deepEqual(Object.keys(UPGRADES).sort(), [
    'coinValue', 'dashCooldown', 'gearDuration', 'magnetDuration', 'startingRevives',
  ]);
});

test('tierOf: 0 by default, clamped to maxTier, junk-tolerant', () => {
  assert.equal(tierOf(freshSave(), 'magnetDuration'), 0);
  assert.equal(tierOf(freshSave(0, { magnetDuration: 2 }), 'magnetDuration'), 2);
  assert.equal(tierOf(freshSave(0, { magnetDuration: 99 }), 'magnetDuration'), maxTier('magnetDuration'));
  assert.equal(tierOf({ coins: 0 }, 'magnetDuration'), 0);             // no upgrades key
  assert.equal(tierOf(freshSave(0, { magnetDuration: 'x' }), 'magnetDuration'), 0);
});

test('nextCost walks the cost ladder and returns null when maxed', () => {
  const s = freshSave();
  assert.equal(nextCost(s, 'magnetDuration'), 80);
  s.upgrades.magnetDuration = 1;
  assert.equal(nextCost(s, 'magnetDuration'), 200);
  s.upgrades.magnetDuration = 3;
  assert.equal(nextCost(s, 'magnetDuration'), null);
});

test('canBuy: maxed and poor reasons', () => {
  assert.deepEqual(canBuy(freshSave(0, { magnetDuration: 3 }), 'magnetDuration'), { ok: false, reason: 'maxed' });
  assert.deepEqual(canBuy(freshSave(79), 'magnetDuration'), { ok: false, reason: 'poor' });
  assert.deepEqual(canBuy(freshSave(80), 'magnetDuration'), { ok: true, reason: null });
});

test('buyUpgrade spends exactly once and increments the tier', () => {
  const s = freshSave(300);
  assert.equal(buyUpgrade(s, 'magnetDuration'), true);   // -80
  assert.equal(s.coins, 220);
  assert.equal(s.upgrades.magnetDuration, 1);
  assert.equal(buyUpgrade(s, 'magnetDuration'), true);   // -200
  assert.equal(s.coins, 20);
  assert.equal(buyUpgrade(s, 'magnetDuration'), false);  // poor (450 > 20)
  assert.equal(s.coins, 20);
  assert.equal(s.upgrades.magnetDuration, 2);
});

test('effectsOf: tier 0 equals current behavior', () => {
  assert.deepEqual(effectsOf(freshSave()), {
    magnetDurationBonus: 0,
    gearDurationBonus: 0,
    dashCooldown: DASH_COOLDOWN,
    coinValueMultiplier: 1,
    startingRevives: 0,
  });
});

test('effectsOf: additive math and dash floor', () => {
  const e = effectsOf(freshSave(0, {
    magnetDuration: 2, gearDuration: 3, dashCooldown: 3, startingRevives: 2, coinValue: 3,
  }));
  assert.equal(e.magnetDurationBonus, 3.0);
  assert.equal(e.gearDurationBonus, 3.5999999999999996); // 3 * 1.2
  assert.equal(e.dashCooldown, Math.max(0.20, DASH_COOLDOWN - 0.15));
  assert.equal(e.coinValueMultiplier, 1.75);
  assert.equal(e.startingRevives, 2);
});
