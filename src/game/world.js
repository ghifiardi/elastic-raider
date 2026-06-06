import { VIEW, PPM } from '../data/constants.js';
import { createSpawner, spawnAhead } from './spawner.js';

const CULL_MARGIN = 200;

export function createWorld(rng) {
  const spawner = createSpawner(rng);
  const world = { spawner, entities: [], traveledPx: 0 };
  world.entities.push(...spawnAhead(spawner, VIEW.W, 0)); // prime the screen
  return world;
}

// Scrolls everything left by speed*dt, culls off-screen entities, and spawns ahead.
export function updateWorld(world, dt, speed) {
  const move = speed * dt;
  world.traveledPx += move;
  world.spawner.nextSpawnX -= move;
  for (const e of world.entities) e.x -= move;
  world.entities = world.entities.filter(
    (e) => e.x + e.w > -CULL_MARGIN && !e.collected && !e.dead,
  );
  const distanceM = world.traveledPx / PPM;
  if (world.spawner.nextSpawnX < VIEW.W * 2) {
    world.entities.push(...spawnAhead(world.spawner, world.spawner.nextSpawnX, distanceM));
  }
}
