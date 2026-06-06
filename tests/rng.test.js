import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/engine/rng.js';

test('same seed produces same sequence', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 5; i++) assert.equal(a.next(), b.next());
});

test('different seeds diverge', () => {
  const a = createRng(1), b = createRng(2);
  assert.notEqual(a.next(), b.next());
});

test('next() stays in [0,1)', () => {
  const r = createRng(7);
  for (let i = 0; i < 100; i++) { const v = r.next(); assert.ok(v >= 0 && v < 1); }
});

test('int(min,max) is inclusive and in range', () => {
  const r = createRng(9); const seen = new Set();
  for (let i = 0; i < 200; i++) { const v = r.int(3, 5); assert.ok(v >= 3 && v <= 5); seen.add(v); }
  assert.deepEqual([...seen].sort(), [3, 4, 5]);
});

test('pick returns an element of the array', () => {
  const r = createRng(11); const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 20; i++) assert.ok(arr.includes(r.pick(arr)));
});
