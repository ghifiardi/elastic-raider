import { VIEW, MAGNET_RADIUS } from '../data/constants.js';
import { drawSky, drawClouds, drawIslands, drawSea, drawDock, drawWaterGap, drawBarrel, drawMarine, drawCoin, drawHero, drawPickup } from './sprites.js';

// Only the chrome the orchestrator draws itself (sprite colors live in sprites.js PALETTE).
const COLORS = { sky: '#0b1020', ring: '#46c2ff', text: '#f5efe0' };

export function createRenderer(ctx) {
  function clear() { ctx.fillStyle = COLORS.sky; ctx.fillRect(0, 0, VIEW.W, VIEW.H); }

  function background(traveledPx, t = 0) {
    drawSky(ctx);
    drawClouds(ctx, traveledPx, t);
    drawIslands(ctx, traveledPx);
    drawSea(ctx, traveledPx, t);
  }

  function ground(entities, t = 0) {
    drawDock(ctx);
    for (const e of entities) if (e.type === 'gap') drawWaterGap(ctx, e.x, e.w, t);
  }

  function entitiesLayer(entities, t = 0) {
    for (const e of entities) {
      if (e.type === 'gap') continue;
      if (e.type === 'coin') { drawCoin(ctx, e, t); continue; }
      if (e.type === 'marine') { drawMarine(ctx, e); continue; }
      if (e.type === 'crate') { drawBarrel(ctx, e); continue; }
      if (e.type === 'gear' || e.type === 'magnet' || e.type === 'mult' || e.type === 'revive') {
        drawPickup(ctx, e, t);
      }
    }
  }

  // Faint ring showing the magnet's pull radius, centered on the player.
  function magnetRing(playerBox) {
    const cx = playerBox.x + playerBox.w / 2, cy = playerBox.y + playerBox.h / 2;
    ctx.save();
    ctx.globalAlpha = 0.25; ctx.strokeStyle = COLORS.ring; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, MAGNET_RADIUS, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function player(p, invincible = false, t = 0) {
    drawHero(ctx, p, invincible, t);
  }

  function text(str, x, y, size = 24, align = 'left') {
    ctx.fillStyle = COLORS.text; ctx.font = `${size}px system-ui, sans-serif`; ctx.textAlign = align;
    ctx.fillText(str, x, y);
  }

  return { clear, background, ground, entitiesLayer, magnetRing, player, text };
}
