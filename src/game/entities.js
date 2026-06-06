import { GROUND_Y } from '../data/constants.js';

export const SIZES = {
  marine: { w: 40, h: 56 },
  crate:  { w: 44, h: 44 },
  gap:    { w: 120, h: 0 },
  coin:   { w: 24, h: 24 },
  gear:   { w: 28, h: 28 },
  magnet: { w: 28, h: 28 },
  mult:   { w: 28, h: 28 },
  revive: { w: 28, h: 28 },
};

// Entities that float at coin height rather than resting on the ground.
const FLOATING = new Set(['coin', 'gear', 'magnet', 'mult', 'revive']);

// type ∈ marine|crate|gap|coin|gear|magnet|mult|revive. x is the left edge in world space.
export function makeEntity(type, x) {
  const size = SIZES[type];
  let y;
  if (type === 'gap') y = GROUND_Y;
  else if (FLOATING.has(type)) y = GROUND_Y - 120;
  else y = GROUND_Y - size.h;
  return { type, x, y, w: size.w, h: size.h, dead: false, collected: false };
}
