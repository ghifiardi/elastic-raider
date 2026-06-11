import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, migrate, load, save, updateHighScore } from '../src/meta/save.js';
import { createStorage } from '../src/meta/storage.js';

function fakeAdapter(initial) {
  const m = new Map();
  if (initial !== undefined) m.set('elastic-raider:save', initial);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

test('defaults is the full v3 shape', () => {
  assert.deepEqual(defaults(), {
    version: 3, highScore: 0, coins: 0, unlocks: [],
    upgrades: { magnetDuration: 0, gearDuration: 0, dashCooldown: 0, startingRevives: 0, coinValue: 0 },
    missions: {},
    stats: { runs: 0, coinsBankedTotal: 0, distanceTotalM: 0, smashesTotal: 0, bestComboCount: 0 },
  });
});

test('migrate v1 → v3 preserves highScore and adds empty containers', () => {
  const out = migrate({ version: 1, highScore: 500 });
  assert.equal(out.version, 3);
  assert.equal(out.highScore, 500);
  assert.equal(out.coins, 0);
  assert.deepEqual(out.unlocks, []);
  assert.deepEqual(out.upgrades, { magnetDuration: 0, gearDuration: 0, dashCooldown: 0, startingRevives: 0, coinValue: 0 });
  assert.deepEqual(out.missions, {});
  assert.equal(out.stats.runs, 0);
  assert.equal(out.stats.bestComboCount, 0);
});

test('migrate treats missing version as v1', () => {
  const out = migrate({ highScore: 42 });
  assert.equal(out.version, 3);
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

test('load migrates a stored v1 blob to v3 preserving highScore', () => {
  const out = load(fakeAdapter(JSON.stringify({ version: 1, highScore: 777 })));
  assert.equal(out.version, 3);
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

test('migrate tolerates a non-integer version (floors it, no crash)', () => {
  // A float version must not crash via MIGRATIONS[1.5]; it floors to v1 and migrates.
  const out = migrate({ version: 1.5, highScore: 5 });
  assert.equal(out.version, 3);
  assert.equal(out.highScore, 5);
});

test('migrate evicts unknown top-level keys', () => {
  const out = migrate({ version: 2, highScore: 3, coins: 0, unlocks: [], upgrades: {}, missions: {},
    stats: { runs: 0, coinsBankedTotal: 0, distanceTotalM: 0, smashesTotal: 0, bestComboCount: 0 },
    LEGACY_JUNK: 'remove me' });
  assert.equal('LEGACY_JUNK' in out, false);
  assert.equal(out.highScore, 3);
});

test('createStorage falls back to in-memory when localStorage is absent (Node)', () => {
  const s = createStorage();
  s.setItem('k', 'v');
  assert.equal(s.getItem('k'), 'v');
  assert.equal(s.getItem('missing'), null);
});

test('v3 defaults include named upgrade tiers at 0', () => {
  const d = defaults();
  assert.equal(d.version, 3);
  assert.deepEqual(d.upgrades, {
    magnetDuration: 0, gearDuration: 0, dashCooldown: 0, startingRevives: 0, coinValue: 0,
  });
  assert.deepEqual(d.unlocks, []);        // reserved container kept
  assert.deepEqual(d.missions, {});       // reserved container kept
});

test('v2 -> v3 preserves coins/highScore/stats/unlocks and fills tiers', () => {
  const v2 = {
    version: 2, highScore: 563, coins: 41, unlocks: ['capRed'], upgrades: {}, missions: {},
    stats: { runs: 9, coinsBankedTotal: 41, distanceTotalM: 1200, smashesTotal: 30, bestComboCount: 4 },
  };
  const m = migrate(v2);
  assert.equal(m.version, 3);
  assert.equal(m.highScore, 563);
  assert.equal(m.coins, 41);
  assert.deepEqual(m.unlocks, ['capRed']);
  assert.equal(m.upgrades.magnetDuration, 0);
  assert.equal(m.stats.runs, 9);
});

test('v1 -> v3 chain still works', () => {
  const m = migrate({ version: 1, highScore: 77 });
  assert.equal(m.version, 3);
  assert.equal(m.highScore, 77);
  assert.equal(m.upgrades.coinValue, 0);
});

test('tier sanitization: junk localStorage cannot break shop state', () => {
  const m = migrate({
    version: 3, highScore: 1, coins: 10, unlocks: [], missions: {}, stats: {},
    upgrades: {
      magnetDuration: '2',        // string -> floor/clamp or 0 (must be integer in 0..max)
      gearDuration: NaN,          // NaN -> 0
      dashCooldown: -5,           // negative -> 0
      startingRevives: 99,        // over max -> clamped to 2
      coinValue: 1.7,             // float -> integer 0..max
      hacked: 12,                 // unknown key -> dropped
    },
  });
  for (const v of Object.values(m.upgrades)) {
    assert.ok(Number.isInteger(v) && v >= 0);
  }
  assert.equal(m.upgrades.gearDuration, 0);
  assert.equal(m.upgrades.dashCooldown, 0);
  assert.equal(m.upgrades.startingRevives, 2);     // maxTier('startingRevives')
  assert.equal('hacked' in m.upgrades, false);
});
