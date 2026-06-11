import {
  GEAR_DURATION, MAGNET_DURATION, MULTIPLIER_DURATION, MERCY_DURATION,
  MULTIPLIER_VALUE, MAGNET_RADIUS, MAGNET_PULL_SPEED, REVIVE_SPEED_EASE,
} from '../data/constants.js';

// effects is the run-start snapshot from shop.effectsOf(); omitted in tests
// that exercise base behavior.
export function createPowerups(effects = null) {
  return {
    gear: 0, magnet: 0, multiplier: 0, mercy: 0,
    revives: effects?.startingRevives ?? 0,
    config: {
      gearDuration: GEAR_DURATION + (effects?.gearDurationBonus ?? 0),
      magnetDuration: MAGNET_DURATION + (effects?.magnetDurationBonus ?? 0),
    },
  };
}

export function activate(s, type) {
  if (type === 'revive') { s.revives += 1; return; }
  if (type === 'gear') s.gear = s.config.gearDuration;
  else if (type === 'magnet') s.magnet = s.config.magnetDuration;
  else if (type === 'mult') s.multiplier = MULTIPLIER_DURATION;
}

export function tick(s, dt) {
  if (s.gear > 0) s.gear = Math.max(0, s.gear - dt);
  if (s.magnet > 0) s.magnet = Math.max(0, s.magnet - dt);
  if (s.multiplier > 0) s.multiplier = Math.max(0, s.multiplier - dt);
  if (s.mercy > 0) s.mercy = Math.max(0, s.mercy - dt);
}

export function gearActive(s) { return s.gear > 0; }
export function isInvincible(s) { return s.gear > 0 || s.mercy > 0; }
export function magnetActive(s) { return s.magnet > 0; }
export function scoreMultiplier(s) { return s.multiplier > 0 ? MULTIPLIER_VALUE : 1; }

export function consumeRevive(s) {
  if (s.revives <= 0) return false;
  s.revives -= 1;
  s.mercy = MERCY_DURATION;
  return true;
}

// During mercy, run speed eases from REVIVE_SPEED_EASE back to 1 as mercy runs down.
export function speedScale(s) {
  if (s.mercy <= 0) return 1;
  const t = 1 - s.mercy / MERCY_DURATION; // 0 at the start of mercy → 1 at its end
  return REVIVE_SPEED_EASE + (1 - REVIVE_SPEED_EASE) * t;
}

// Pull in-radius coins toward the player. Mutates coin x/y. Caller invokes only
// when magnetActive(s) is true. Non-coins and out-of-radius coins are untouched.
export function magnetPull(entities, playerBox, dt) {
  const cx = playerBox.x + playerBox.w / 2;
  const cy = playerBox.y + playerBox.h / 2;
  const step = MAGNET_PULL_SPEED * dt;
  for (const e of entities) {
    if (e.type !== 'coin' || e.collected) continue;
    const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
    const dx = cx - ex, dy = cy - ey;
    const dist = Math.hypot(dx, dy);
    if (dist === 0 || dist > MAGNET_RADIUS) continue;
    const move = Math.min(step, dist);
    e.x += (dx / dist) * move;
    e.y += (dy / dist) * move;
  }
}
