import {
  RUN_SPEED_START, RUN_SPEED_MAX, RUN_SPEED_RAMP, VIEW, SAFE_RUNWAY_M,
} from '../data/constants.js';
import { makeEntity, SIZES } from './entities.js';

export function runSpeed(elapsedSeconds) {
  return Math.min(RUN_SPEED_MAX, RUN_SPEED_START + RUN_SPEED_RAMP * elapsedSeconds);
}

export function createSpawner(rng) {
  return { rng, nextSpawnX: VIEW.W };
}

// Emit entities to fill space up to (frontierX + VIEW.W). Difficulty (distanceM)
// shrinks the gap between obstacles. During the safe runway, only coins spawn.
export function spawnAhead(spawner, frontierX, distanceM) {
  const out = [];
  const limit = frontierX + VIEW.W;
  const minGap = Math.max(220, 420 - distanceM * 0.5);
  const isRunway = distanceM < SAFE_RUNWAY_M;
  if (spawner.nextSpawnX < frontierX) spawner.nextSpawnX = frontierX;
  while (spawner.nextSpawnX < limit) {
    const roll = spawner.rng.next();
    const type = isRunway ? 'coin'
      : roll < 0.4 ? 'marine' : roll < 0.65 ? 'crate' : roll < 0.8 ? 'gap' : 'coin';
    out.push(makeEntity(type, spawner.nextSpawnX));
    const gap = minGap + spawner.rng.int(0, 180);
    spawner.nextSpawnX += SIZES[type].w + gap;
  }
  return out;
}
