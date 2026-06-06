import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, migrate, load, save, recordHighScore } from '../src/meta/save.js';
import { createStorage } from '../src/meta/storage.js';

function fakeAdapter() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

test('defaults shape', () => {
  assert.deepEqual(defaults(), { version: 1, highScore: 0 });
});

test('migrate fills missing fields and stamps version', () => {
  assert.deepEqual(migrate({}), { version: 1, highScore: 0 });
  assert.deepEqual(migrate({ highScore: 50 }), { version: 1, highScore: 50 });
  assert.deepEqual(migrate(null), { version: 1, highScore: 0 });
});

test('load returns defaults when storage empty or corrupt', () => {
  const a = fakeAdapter();
  assert.deepEqual(load(a), defaults());
  a.setItem('elastic-raider:save', '{not json');
  assert.deepEqual(load(a), defaults());
});

test('save then load round-trips', () => {
  const a = fakeAdapter();
  save(a, { version: 1, highScore: 123 });
  assert.equal(load(a).highScore, 123);
});

test('recordHighScore only updates on a new best', () => {
  const a = fakeAdapter();
  assert.equal(recordHighScore(a, 100), 100);
  assert.equal(recordHighScore(a, 80), 100);
  assert.equal(recordHighScore(a, 150), 150);
  assert.equal(load(a).highScore, 150);
});

test('createStorage falls back to in-memory when localStorage is absent (Node)', () => {
  const s = createStorage();
  s.setItem('k', 'v');
  assert.equal(s.getItem('k'), 'v');
  assert.equal(s.getItem('missing'), null);
});
