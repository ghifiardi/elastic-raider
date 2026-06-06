import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEntity, SIZES } from '../src/game/entities.js';
import { runSpeed, createSpawner, spawnAhead } from '../src/game/spawner.js';
import { createRng } from '../src/engine/rng.js';
import { RUN_SPEED_START, RUN_SPEED_MAX, GROUND_Y, SAFE_RUNWAY_M } from '../src/data/constants.js';

test('makeEntity sets size by type and rests a ground entity on the ground', () => {
  const m = makeEntity('marine', 500);
  assert.equal(m.w, SIZES.marine.w);
  assert.equal(m.h, SIZES.marine.h);
  assert.equal(m.y, GROUND_Y - SIZES.marine.h);
  assert.equal(m.dead, false);
});

test('runSpeed ramps from start and clamps at max', () => {
  assert.equal(runSpeed(0), RUN_SPEED_START);
  assert.ok(runSpeed(10) > RUN_SPEED_START);
  assert.equal(runSpeed(100000), RUN_SPEED_MAX);
});

test('spawnAhead is deterministic for a given seed', () => {
  const s1 = createSpawner(createRng(123));
  const s2 = createSpawner(createRng(123));
  const a = spawnAhead(s1, 1000, 0);
  const b = spawnAhead(s2, 1000, 0);
  assert.deepEqual(a, b);
});

test('spawnAhead places entities at or beyond the frontier and advances it', () => {
  const s = createSpawner(createRng(7));
  const before = s.nextSpawnX;
  const out = spawnAhead(s, 1000, 0);
  assert.ok(out.length >= 1);
  for (const e of out) assert.ok(e.x >= 1000);
  assert.ok(s.nextSpawnX > before);
});

test('only known entity types are produced', () => {
  const s = createSpawner(createRng(99));
  const types = new Set();
  for (let i = 0; i < 50; i++) spawnAhead(s, s.nextSpawnX, i * 100).forEach((e) => types.add(e.type));
  for (const t of types) assert.ok(['marine', 'crate', 'gap', 'coin'].includes(t));
});

test('no hazards spawn during the safe runway (distanceM < SAFE_RUNWAY_M)', () => {
  const s = createSpawner(createRng(3));
  const out = spawnAhead(s, 960, 0); // distance 0 → runway
  const hazards = out.filter((e) => ['marine', 'crate', 'gap'].includes(e.type));
  assert.equal(hazards.length, 0);
  assert.ok(out.length >= 1); // runway still produces coins
});

test('hazards appear once past the safe runway', () => {
  const s = createSpawner(createRng(3));
  const out = spawnAhead(s, 960, SAFE_RUNWAY_M + 50);
  const hazards = out.filter((e) => ['marine', 'crate', 'gap'].includes(e.type));
  assert.ok(hazards.length >= 1);
});

test('makeEntity creates floating power-up pickups with sizes', () => {
  for (const t of ['gear', 'magnet', 'mult', 'revive']) {
    const e = makeEntity(t, 700);
    assert.equal(e.w, SIZES[t].w);
    assert.equal(e.h, SIZES[t].h);
    assert.equal(e.y, GROUND_Y - 120); // floats like a coin
    assert.equal(e.collected, false);
  }
});
