import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walletBalance, canAfford, spend, earn, makeRunSummary, bankRun } from '../src/meta/economy.js';
import { defaults } from '../src/meta/save.js';

test('earn / walletBalance', () => {
  const s = defaults();
  earn(s, 30);
  assert.equal(walletBalance(s), 30);
});

test('canAfford: cost equal to balance is affordable', () => {
  const s = defaults(); s.coins = 50;
  assert.equal(canAfford(s, 50), true);
  assert.equal(canAfford(s, 51), false);
});

test('spend deducts on success', () => {
  const s = defaults(); s.coins = 50;
  assert.equal(spend(s, 20), true);
  assert.equal(s.coins, 30);
});

test('spend insufficient → false, no mutation', () => {
  const s = defaults(); s.coins = 10;
  assert.equal(spend(s, 25), false);
  assert.equal(s.coins, 10);
});

test('makeRunSummary derives fields from score state + chain count', () => {
  const scoreState = { distance: 123.9, coins: 7, smashes: 4, bonus: 999 };
  assert.deepEqual(makeRunSummary(scoreState, 6), { distanceM: 123, coins: 7, smashes: 4, maxComboCount: 6 });
});

test('bankRun banks raw coins, accumulates stats, returns banked amount', () => {
  const s = defaults();
  const banked = bankRun(s, { distanceM: 100, coins: 12, smashes: 3, maxComboCount: 5 });
  assert.equal(banked, 12);
  assert.equal(s.coins, 12);
  assert.equal(s.stats.runs, 1);
  assert.equal(s.stats.coinsBankedTotal, 12);
  assert.equal(s.stats.distanceTotalM, 100);
  assert.equal(s.stats.smashesTotal, 3);
  assert.equal(s.stats.bestComboCount, 5);
  bankRun(s, { distanceM: 50, coins: 8, smashes: 1, maxComboCount: 3 });
  assert.equal(s.coins, 20);
  assert.equal(s.stats.runs, 2);
  assert.equal(s.stats.bestComboCount, 5); // max(5, 3)
});
