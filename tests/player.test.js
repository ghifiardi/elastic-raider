import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer } from '../src/game/player.js';
import { GROUND_Y, PLAYER, JUMP_VELOCITY, SLIDE_DURATION, DASH_DURATION } from '../src/data/constants.js';

const NONE = { jumpPressed: false, jumpHeld: false, slidePressed: false, dashPressed: false };
const tick = (p, a, dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) updatePlayer(p, a, dt); };

test('player starts running on the ground', () => {
  const p = createPlayer();
  assert.equal(p.state, 'running');
  assert.equal(p.onGround, true);
  assert.equal(p.y, GROUND_Y);
  assert.equal(p.height, PLAYER.hStand);
});

test('jump leaves the ground then gravity returns it', () => {
  const p = createPlayer();
  updatePlayer(p, { ...NONE, jumpPressed: true, jumpHeld: true }, 1 / 60);
  assert.equal(p.onGround, false);
  assert.equal(p.state, 'jumping');
  assert.ok(p.vy < 0);
  tick(p, { ...NONE, jumpHeld: true }, 1 / 60, 300);
  assert.equal(p.onGround, true);
  assert.equal(p.state, 'running');
  assert.equal(p.y, GROUND_Y);
});

test('cannot double-jump while airborne', () => {
  const p = createPlayer();
  updatePlayer(p, { ...NONE, jumpPressed: true, jumpHeld: true }, 1 / 60);
  const vyAfterFirst = p.vy;
  updatePlayer(p, { ...NONE, jumpPressed: true, jumpHeld: true }, 1 / 60);
  assert.ok(p.vy > vyAfterFirst);
});

test('slide lowers height, then auto-stands after SLIDE_DURATION', () => {
  const p = createPlayer();
  updatePlayer(p, { ...NONE, slidePressed: true }, 1 / 60);
  assert.equal(p.state, 'sliding');
  assert.equal(p.height, PLAYER.hSlide);
  tick(p, NONE, 1 / 60, Math.ceil((SLIDE_DURATION + 0.05) * 60));
  assert.equal(p.state, 'running');
  assert.equal(p.height, PLAYER.hStand);
});

test('dash sets dashing state and a cooldown, then ends', () => {
  const p = createPlayer();
  updatePlayer(p, { ...NONE, dashPressed: true }, 1 / 60);
  assert.equal(p.state, 'dashing');
  assert.ok(p.dashCooldown > 0);
  tick(p, NONE, 1 / 60, Math.ceil((DASH_DURATION + 0.02) * 60));
  assert.notEqual(p.state, 'dashing');
});

test('dash on cooldown is ignored', () => {
  const p = createPlayer();
  updatePlayer(p, { ...NONE, dashPressed: true }, 1 / 60);
  tick(p, NONE, 1 / 60, Math.ceil((DASH_DURATION + 0.02) * 60));
  const before = p.state;
  updatePlayer(p, { ...NONE, dashPressed: true }, 1 / 60);
  assert.equal(p.state, before);
});
