import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFx, skyPhase, PARTICLE_CAP } from '../src/engine/fx.js';
import { createRng } from '../src/engine/rng.js';

const fx = () => createFx(createRng(42));

test('skyPhase: 0 at 0m, wraps at 1500m, night at half-cycle', () => {
  assert.equal(skyPhase(0), 0);
  assert.equal(skyPhase(1500), 0);
  assert.equal(skyPhase(750), 0.5);
  assert.equal(skyPhase(2250), 0.5);
});

test('coinBurst spawns 6 particles that expire', () => {
  const f = fx();
  f.coinBurst(100, 200);
  assert.equal(f.state().particles.length, 6);
  f.update(2);                                   // far past max ttl
  assert.equal(f.state().particles.length, 0);
});

test('particle pool caps at PARTICLE_CAP, oldest evicted', () => {
  const f = fx();
  for (let i = 0; i < 40; i++) f.deathBurst(i, 0);   // 40*20 = 800 spawned
  assert.equal(f.state().particles.length, PARTICLE_CAP);
});

test('smashBurst shakes 4px; deathBurst shakes 8px and freezes 0.12s', () => {
  const f = fx();
  f.smashBurst(0, 0);
  f.update(1 / 60);
  const small = f.offset();
  assert.ok(Math.abs(small.x) <= 4 && Math.abs(small.y) <= 4);
  assert.equal(f.frozen(), false);

  const g = fx();
  g.deathBurst(0, 0);
  assert.equal(g.frozen(), true);
  g.update(1 / 60);
  const big = g.offset();
  assert.ok(Math.abs(big.x) <= 8 && Math.abs(big.y) <= 8);
  assert.ok(Math.abs(big.x) > 0 || Math.abs(big.y) > 0);  // shaking now
  g.update(0.12);                                // freeze expires
  assert.equal(g.frozen(), false);
});

test('overlapping shakes take the max, never sum', () => {
  const f = fx();
  f.deathBurst(0, 0);          // mag 8
  f.smashBurst(0, 0);          // mag 4 — must not raise or extend beyond 8
  f.update(1 / 60);
  const o = f.offset();
  assert.ok(Math.abs(o.x) <= 8 && Math.abs(o.y) <= 8);
});

test('offset() is a pure read: same value until the next update', () => {
  const f = fx();
  f.deathBurst(0, 0);
  f.update(1 / 60);
  const a = f.offset();
  const b = f.offset();
  assert.deepEqual(a, b);                        // no rng consumed between reads
  f.update(1 / 60);
  assert.notDeepEqual(f.offset(), a);            // new jitter only after update
});

test('shake decays toward zero', () => {
  const f = fx();
  f.smashBurst(0, 0);
  f.update(0.5);                                 // past dur 0.2
  assert.deepEqual(f.offset(), { x: 0, y: 0 });
});

test('popup rises and expires', () => {
  const f = fx();
  f.popup(100, 300, '+50', '#ffcf3f');
  const p0 = f.state().popups[0];
  assert.equal(p0.text, '+50');
  const yStart = p0.y;
  f.update(0.4);
  assert.ok(f.state().popups[0].y < yStart);     // rising
  f.update(0.5);                                 // past ttl 0.8
  assert.equal(f.state().popups.length, 0);
});

test('comboFlash lives 60ms then clears', () => {
  const f = fx();
  f.comboFlash('#b388ff');
  assert.equal(f.state().flash.color, '#b388ff');
  f.update(0.07);
  assert.equal(f.state().flash, null);
});

test('reviveFlash and powerupRing spawn ring particles, no shake, no freeze', () => {
  const f = fx();
  f.reviveFlash(50, 60);
  f.powerupRing(70, 80, '#46c2ff');
  assert.equal(f.state().particles.filter((p) => p.shape === 'ring').length, 2);
  f.update(1 / 60);
  assert.deepEqual(f.offset(), { x: 0, y: 0 });
  assert.equal(f.frozen(), false);
});

test('update during freeze still animates particles', () => {
  const f = fx();
  f.deathBurst(100, 100);
  const before = f.state().particles.map((p) => p.y);
  f.update(0.05);                                // frozen, but fx animates
  const after = f.state().particles.map((p) => p.y);
  assert.notDeepEqual(after, before);
});
