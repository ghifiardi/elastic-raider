import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScore, addDistance, addCoin, addSmash, total } from '../src/game/scoring.js';
import { COIN_SCORE, SMASH_SCORE } from '../src/data/constants.js';

test('new score is zeroed', () => {
  const s = createScore();
  assert.deepEqual(s, { distance: 0, coins: 0, smashes: 0, bonus: 0 });
  assert.equal(total(s), 0);
});

test('distance contributes 1 point per whole meter', () => {
  const s = createScore();
  addDistance(s, 3.0); addDistance(s, 0.4);
  assert.equal(s.distance, 3.4);
  assert.equal(total(s), 3);
});

test('coins add COIN_SCORE * multiplier and increment count', () => {
  const s = createScore();
  addCoin(s, 1); addCoin(s, 2);
  assert.equal(s.coins, 2);
  assert.equal(s.bonus, COIN_SCORE * 1 + COIN_SCORE * 2);
});

test('smashes add SMASH_SCORE * multiplier and increment count', () => {
  const s = createScore();
  addSmash(s, 3);
  assert.equal(s.smashes, 1);
  assert.equal(s.bonus, SMASH_SCORE * 3);
});

test('total combines floored distance and bonus', () => {
  const s = createScore();
  addDistance(s, 10.9); addCoin(s, 2); addSmash(s, 1);
  assert.equal(total(s), 10 + COIN_SCORE * 2 + SMASH_SCORE * 1);
});

test('addCoin applies coinValueMultiplier to SCORE only, raw count unchanged', () => {
  const s = createScore();
  addCoin(s, 2, 1.75);              // combo mult 2, Gold Rush x1.75
  assert.equal(s.coins, 1);         // raw pickup count — what bankRun banks
  assert.equal(s.bonus, 35);        // COIN_SCORE 10 * 2 * 1.75
});

test('addCoin default multiplier preserves current behavior', () => {
  const s = createScore();
  addCoin(s, 3);
  assert.equal(s.bonus, 30);
});
