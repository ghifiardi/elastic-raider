import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, migrate, load, save, updateHighScore } from '../src/meta/save.js';
import { createStorage } from '../src/meta/storage.js';

function fakeAdapter(initial) {
  const m = new Map();
  if (initial !== undefined) m.set('elastic-raider:save', initial);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

test('defaults is the full v2 shape', () => {
  assert.deepEqual(defaults(), {
    version: 2, highScore: 0, coins: 0, unlocks: [], upgrades: {}, missions: {},
    stats: { runs: 0, coinsBankedTotal: 0, distanceTotalM: 0, smashesTotal: 0, bestComboCount: 0 },
  });
});

test('migrate v1 → v2 preserves highScore and adds empty containers', () => {
  const out = migrate({ version: 1, highScore: 500 });
  assert.equal(out.version, 2);
  assert.equal(out.highScore, 500);
  assert.equal(out.coins, 0);
  assert.deepEqual(out.unlocks, []);
  assert.deepEqual(out.upgrades, {});
  assert.deepEqual(out.missions, {});
  assert.equal(out.stats.runs, 0);
  assert.equal(out.stats.bestComboCount, 0);
});

test('migrate treats missing version as v1', () => {
  const out = migrate({ highScore: 42 });
  assert.equal(out.version, 2);
  assert.equal(out.highScore, 42);
});

test('migrate of a valid v2 object is idempotent', () => {
  const v2 = defaults(); v2.highScore = 9; v2.coins = 30; v2.stats.runs = 3;
  assert.deepEqual(migrate(v2), v2);
});

test('migrate deep-fills a partial v2 stats object', () => {
  const partial = { version: 2, highScore: 1, coins: 5, unlocks: [], upgrades: {}, missions: {}, stats: { runs: 2 } };
  const out = migrate(partial);
  assert.equal(out.stats.runs, 2);
  assert.equal(out.stats.coinsBankedTotal, 0);
  assert.equal(out.stats.bestComboCount, 0);
});

test('migrate null / non-object → defaults', () => {
  assert.deepEqual(migrate(null), defaults());
  assert.deepEqual(migrate(42), defaults());
});

test('migrate of a future version → defaults', () => {
  assert.deepEqual(migrate({ version: 99, coins: 9999 }), defaults());
});

test('load returns defaults when empty or corrupt', () => {
  assert.deepEqual(load(fakeAdapter()), defaults());
  assert.deepEqual(load(fakeAdapter('{not json')), defaults());
});

test('load migrates a stored v1 blob to v2 preserving highScore', () => {
  const out = load(fakeAdapter(JSON.stringify({ version: 1, highScore: 777 })));
  assert.equal(out.version, 2);
  assert.equal(out.highScore, 777);
});

test('save then load round-trips a v2 object', () => {
  const a = fakeAdapter();
  const d = defaults(); d.coins = 120; d.highScore = 50; d.stats.runs = 4;
  save(a, d);
  const loaded = load(a);
  assert.equal(loaded.coins, 120);
  assert.equal(loaded.highScore, 50);
  assert.equal(loaded.stats.runs, 4);
});

test('updateHighScore mutates + returns true on a new best, false otherwise', () => {
  const d = defaults();
  assert.equal(updateHighScore(d, 100), true);
  assert.equal(d.highScore, 100);
  assert.equal(updateHighScore(d, 80), false);
  assert.equal(d.highScore, 100);
});

test('createStorage falls back to in-memory when localStorage is absent (Node)', () => {
  const s = createStorage();
  s.setItem('k', 'v');
  assert.equal(s.getItem('k'), 'v');
  assert.equal(s.getItem('missing'), null);
});
