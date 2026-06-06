import { VIEW, GROUND_Y, PLAYER, DASH_REACH } from '../data/constants.js';

const COLORS = {
  sky: '#0b1020', skyBand: '#16224a', ground: '#2b1d12', groundTop: '#5a3c22',
  player: '#e8d7a0', dash: '#ffd34d', marine: '#3f6fb0', crate: '#8a5a2b',
  gap: '#0b1020', coin: '#ffcf3f', text: '#f5efe0',
};

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
      ctx.fillStyle = e.type === 'marine' ? COLORS.marine : e.type === 'crate' ? COLORS.crate : COLORS.coin;
      if (e.type === 'coin') { ctx.beginPath(); ctx.arc(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(e.x, e.y, e.w, e.h);
    }
  }

  function player(p) {
    ctx.fillStyle = p.state === 'dashing' ? COLORS.dash : COLORS.player;
    ctx.fillRect(p.x, p.y - p.height, PLAYER.w, p.height);
    if (p.state === 'dashing') { ctx.globalAlpha = 0.4; ctx.fillRect(p.x + PLAYER.w, p.y - p.height, DASH_REACH, p.height); ctx.globalAlpha = 1; }
  }

  function text(str, x, y, size = 24, align = 'left') {
    ctx.fillStyle = COLORS.text; ctx.font = `${size}px system-ui, sans-serif`; ctx.textAlign = align;
    ctx.fillText(str, x, y);
  }

  return { clear, background, ground, entitiesLayer, player, text };
}
