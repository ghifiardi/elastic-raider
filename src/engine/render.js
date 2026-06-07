import { VIEW, GROUND_Y, PLAYER, DASH_REACH, MAGNET_RADIUS } from '../data/constants.js';
import { drawSky, drawClouds, drawIslands, drawSea, drawDock, drawWaterGap, drawBarrel, drawMarine, drawCoin } from './sprites.js';

const COLORS = {
  sky: '#0b1020', skyBand: '#16224a', ground: '#2b1d12', groundTop: '#5a3c22',
  player: '#e8d7a0', dash: '#ffd34d', marine: '#3f6fb0', crate: '#8a5a2b',
  gap: '#0b1020', coin: '#ffcf3f', text: '#f5efe0',
  gear: '#ff7043', magnet: '#46c2ff', mult: '#b388ff', revive: '#ff5d8f',
  glow: '#ffe07a', ring: '#46c2ff',
};

const PICKUP_COLOR = { gear: COLORS.gear, magnet: COLORS.magnet, mult: COLORS.mult, revive: COLORS.revive };

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
      if (PICKUP_COLOR[e.type]) {
        const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2;
        ctx.fillStyle = PICKUP_COLOR[e.type];
        ctx.beginPath();
        ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
        ctx.closePath(); ctx.fill();
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
    if (invincible) {
      ctx.save();
      ctx.globalAlpha = 0.5; ctx.fillStyle = COLORS.glow;
      ctx.fillRect(p.x - 6, p.y - p.height - 6, PLAYER.w + 12, p.height + 12);
      ctx.restore();
    }
    ctx.fillStyle = p.state === 'dashing' ? COLORS.dash : COLORS.player;
    ctx.fillRect(p.x, p.y - p.height, PLAYER.w, p.height);
    if (p.state === 'dashing') {
      ctx.globalAlpha = 0.4;
      ctx.fillRect(p.x + PLAYER.w, p.y - p.height, DASH_REACH, p.height);
      ctx.globalAlpha = 1;
    }
  }

  function text(str, x, y, size = 24, align = 'left') {
    ctx.fillStyle = COLORS.text; ctx.font = `${size}px system-ui, sans-serif`; ctx.textAlign = align;
    ctx.fillText(str, x, y);
  }

  return { clear, background, ground, entitiesLayer, magnetRing, player, text };
}
