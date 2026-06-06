import {
  RUN_SPEED_START, RUN_SPEED_MAX, RUN_SPEED_RAMP, VIEW, SAFE_RUNWAY_M,
  POWERUP_FIRST_OFFSET, POWERUP_GAP_PX, POWERUP_GAP_JITTER,
} from '../data/constants.js';
import { makeEntity, SIZES } from './entities.js';

export function runSpeed(elapsedSeconds) {
  return Math.min(RUN_SPEED_MAX, RUN_SPEED_START + RUN_SPEED_RAMP * elapsedSeconds);
}

export function createSpawner(rng) {
  return { rng, nextSpawnX: VIEW.W, nextPowerupX: VIEW.W + POWERUP_FIRST_OFFSET };
}

// Weighted power-up kind: Magnet/Multiplier common, Gear uncommon, Revive rarest.
function pickPowerup(rng) {
  const r = rng.next();
  return r < 0.35 ? 'magnet' : r < 0.70 ? 'mult' : r < 0.90 ? 'gear' : 'revive';
}

// Emit entities to fill space up to (frontierX + VIEW.W). Difficulty (distanceM)
// shrinks the gap between obstacles. During the safe runway, only coins spawn.
// Obstacles and power-ups use two independent cursors; both are clamped to the
// frontier so NOTHING is ever emitted behind frontierX.
export function spawnAhead(spawner, frontierX, distanceM) {
  const out = [];
  const limit = frontierX + VIEW.W;
  const minGap = Math.max(220, 420 - distanceM * 0.5);
  const isRunway = distanceM < SAFE_RUNWAY_M;

  // Obstacle / coin stream.
  if (spawner.nextSpawnX < frontierX) spawner.nextSpawnX = frontierX;
  while (spawner.nextSpawnX < limit) {
    const roll = spawner.rng.next();
    const type = isRunway ? 'coin'
      : roll < 0.4 ? 'marine' : roll < 0.65 ? 'crate' : roll < 0.8 ? 'gap' : 'coin';
    out.push(makeEntity(type, spawner.nextSpawnX));
    const gap = minGap + spawner.rng.int(0, 180);
    spawner.nextSpawnX += SIZES[type].w + gap;
  }

  // Power-up stream — its own cursor. A mark that has fallen behind the frontier
  // (the world scrolled past it) is advanced over, never emitted; only marks
  // within [frontierX, limit) are emitted. This guarantees x >= frontierX.
  while (spawner.nextPowerupX < limit) {
    if (spawner.nextPowerupX >= frontierX) {
      out.push(makeEntity(pickPowerup(spawner.rng), spawner.nextPowerupX));
    }
    spawner.nextPowerupX += POWERUP_GAP_PX + spawner.rng.int(0, POWERUP_GAP_JITTER);
  }

  return out;
}
