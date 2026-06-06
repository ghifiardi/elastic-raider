import {
  RUN_SPEED_START, RUN_SPEED_MAX, RUN_SPEED_RAMP, VIEW,
} from '../data/constants.js';
import { makeEntity, SIZES } from './entities.js';

export function runSpeed(elapsedSeconds) {
  return Math.min(RUN_SPEED_MAX, RUN_SPEED_START + RUN_SPEED_RAMP * elapsedSeconds);
}

export function createSpawner(rng) {
  return { rng, nextSpawnX: VIEW.W };
}

// Emit entities to fill space up to (frontierX + VIEW.W). Difficulty (distanceM)
// shrinks the gap between obstacles. Returns the new descriptors.
export function spawnAhead(spawner, frontierX, distanceM) {
  const out = [];
  const limit = frontierX + VIEW.W;
  const minGap = Math.max(220, 420 - distanceM * 0.5);
  if (spawner.nextSpawnX < frontierX) spawner.nextSpawnX = frontierX;
  while (spawner.nextSpawnX < limit) {
    const roll = spawner.rng.next();
    const type = roll < 0.4 ? 'marine' : roll < 0.65 ? 'crate' : roll < 0.8 ? 'gap' : 'coin';
    out.push(makeEntity(type, spawner.nextSpawnX));
    const span = type === 'gap' ? SIZES.gap.w : SIZES[type].w;
    const gap = minGap + spawner.rng.int(0, 180);
    spawner.nextSpawnX += span + gap;
  }
  return out;
}
