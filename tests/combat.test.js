import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCombo, registerSmash, tickCombo, multiplier } from '../src/game/combat.js';
import { COMBO_WINDOW, COMBO_MAX_MULT } from '../src/data/constants.js';

test('fresh combo has count 0 and multiplier 1', () => {
  const c = createCombo();
  assert.equal(c.count, 0);
  assert.equal(multiplier(c), 1);
});

test('registerSmash increments count and refreshes timer', () => {
  const c = createCombo();
  registerSmash(c);
  assert.equal(c.count, 1);
  assert.equal(c.timer, COMBO_WINDOW);
});

test('multiplier grows every 3 smashes and caps', () => {
  const c = createCombo();
  for (let i = 0; i < 3; i++) registerSmash(c);
  assert.equal(multiplier(c), 2);
  for (let i = 0; i < 100; i++) registerSmash(c);
  assert.equal(multiplier(c), COMBO_MAX_MULT);
});

test('combo resets when the timer runs out', () => {
  const c = createCombo();
  registerSmash(c);
  tickCombo(c, COMBO_WINDOW + 0.01);
  assert.equal(c.count, 0);
  assert.equal(multiplier(c), 1);
});

test('ticking within the window keeps the combo alive', () => {
  const c = createCombo();
  registerSmash(c); registerSmash(c);
  tickCombo(c, COMBO_WINDOW / 2);
  assert.equal(c.count, 2);
});
