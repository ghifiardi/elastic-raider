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
  for (const t of types) assert.ok(
    ['marine', 'crate', 'gap', 'coin', 'gear', 'magnet', 'mult', 'revive'].includes(t));
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

test('createSpawner seeds a power-up cursor ahead of the screen', () => {
  const s = createSpawner(createRng(1));
  assert.ok(typeof s.nextPowerupX === 'number');
  assert.ok(s.nextPowerupX > 960);
});

test('power-ups eventually spawn and are drawn from the allowed set', () => {
  const s = createSpawner(createRng(5));
  const kinds = [];
  for (let i = 0; i < 40; i++) {
    spawnAhead(s, s.nextSpawnX, 100 + i * 100).forEach((e) => {
      if (['gear', 'magnet', 'mult', 'revive'].includes(e.type)) kinds.push(e.type);
    });
  }
  assert.ok(kinds.length >= 3, `expected several power-ups, got ${kinds.length}`);
  for (const k of kinds) assert.ok(['gear', 'magnet', 'mult', 'revive'].includes(k));
});

test('power-up emission is deterministic for a seed', () => {
  const collect = (seed) => {
    const s = createSpawner(createRng(seed));
    const out = [];
    for (let i = 0; i < 30; i++) spawnAhead(s, s.nextSpawnX, 100 + i * 100)
      .filter((e) => ['gear', 'magnet', 'mult', 'revive'].includes(e.type))
      .forEach((e) => out.push(e.type));
    return out;
  };
  assert.deepEqual(collect(7), collect(7));
});

test('revive is the rarest power-up over a large sample', () => {
  const s = createSpawner(createRng(13));
  const count = { gear: 0, magnet: 0, mult: 0, revive: 0 };
  for (let i = 0; i < 300; i++) spawnAhead(s, s.nextSpawnX, 100 + i * 100)
    .forEach((e) => { if (e.type in count) count[e.type]++; });
  assert.ok(count.revive < count.magnet, JSON.stringify(count));
  assert.ok(count.revive < count.mult, JSON.stringify(count));
});

test('every emitted entity (obstacle or power-up) is at or beyond the frontier', () => {
  const s = createSpawner(createRng(21));
  for (let i = 0; i < 30; i++) {
    const frontier = s.nextSpawnX;
    const out = spawnAhead(s, frontier, 100 + i * 100);
    for (const e of out) assert.ok(e.x >= frontier, `${e.type} at ${e.x} < frontier ${frontier}`);
  }
});
