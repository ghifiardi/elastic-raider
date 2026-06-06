import { PLAYER, DASH_REACH } from '../data/constants.js';

// Axis-aligned bounding-box overlap. Boxes: {x, y, w, h}. Edge-touch is NOT overlap.
export function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// player.y is the feet line (ground contact); the box rises `height` above it.
export function playerBox(player) {
  return { x: player.x, y: player.y - player.height, w: PLAYER.w, h: player.height };
}

// Forward "punch" reach, only while dashing.
export function dashBox(player) {
  if (player.state !== 'dashing') return null;
  return {
    x: player.x + PLAYER.w,
    y: player.y - player.height,
    w: DASH_REACH,
    h: player.height,
  };
}
