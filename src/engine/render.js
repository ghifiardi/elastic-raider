import { VIEW, GROUND_Y, PLAYER, DASH_REACH, MAGNET_RADIUS } from '../data/constants.js';

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

  // Parallax: distant band scrolls slower than the foreground.
  function background(traveledPx) {
    const off = (traveledPx * 0.2) % VIEW.W;
    ctx.fillStyle = COLORS.skyBand;
    for (let i = -1; i < 3; i++) {
      const x = i * 320 - off;
      ctx.fillRect(x, 180, 220, 120);
    }
  }

  function ground(entities) {
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, GROUND_Y, VIEW.W, VIEW.H - GROUND_Y);
    ctx.fillStyle = COLORS.groundTop;
    ctx.fillRect(0, GROUND_Y, VIEW.W, 6);
    ctx.fillStyle = COLORS.gap;
    for (const e of entities) if (e.type === 'gap') ctx.fillRect(e.x, GROUND_Y, e.w, VIEW.H - GROUND_Y);
  }

  function entitiesLayer(entities) {
    for (const e of entities) {
      if (e.type === 'gap') continue;
      if (e.type === 'coin') {
        ctx.fillStyle = COLORS.coin;
        ctx.beginPath(); ctx.arc(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, 0, Math.PI * 2); ctx.fill();
      } else if (PICKUP_COLOR[e.type]) {
        // Power-up pickup: filled diamond in its theme color.
        const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2;
        ctx.fillStyle = PICKUP_COLOR[e.type];
        ctx.beginPath();
        ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = e.type === 'marine' ? COLORS.marine : COLORS.crate;
        ctx.fillRect(e.x, e.y, e.w, e.h);
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

  function player(p, invincible = false) {
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
