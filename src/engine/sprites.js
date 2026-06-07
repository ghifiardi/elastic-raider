// Stateless draw helpers for the pirate-adventure visual pass.
// Each helper takes (ctx, ...params[, t]) and mutates the canvas. No module
// state; deterministic given its inputs. Not "pure" — it writes to ctx.
import { VIEW, GROUND_Y, PLAYER, DASH_REACH } from '../data/constants.js';

export const PALETTE = {
  skyTop: '#1b3a5b', skyBottom: '#3d6e93', cloud: '#cfe3f2',
  island: '#244b3a', seaFar: '#1f6f9c', foam: '#bfe8ff',
  dock: '#6b4420', dockEdge: '#9c6a34', woodDark: '#5a3a1c',
  gapSea: '#155a82', gapFoam: '#bfe8ff',
  skin: '#f0c79a', hair: '#3a2a1c', bandana: '#d23b3b', vest: '#2a5db0', shirt: '#e8e2d0', shorts: '#243b66',
  coat: '#2f4f8f', coatDark: '#243d6e', cap: '#f5f5f5', capBand: '#243d6e',
  wood: '#9a6a33', band: '#cfcfcf',
  coin: '#ffcf3f', coinShine: '#fff2b0',
  gear: '#ff7a33', magnet: '#46c2ff', mult: '#b388ff', revive: '#ff5d8f',
  glow: '#ffe07a', ring: '#46c2ff', text: '#f5efe0',
};

export function drawSky(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW.H);
  g.addColorStop(0, PALETTE.skyTop); g.addColorStop(1, PALETTE.skyBottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW.W, VIEW.H);
}

function cloudPuff(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.arc(x + 26, y - 8, 26, 0, Math.PI * 2);
  ctx.arc(x + 54, y, 20, 0, Math.PI * 2);
  ctx.fill();
}

export function drawClouds(ctx, traveledPx, t) {
  const span = VIEW.W + 200;
  const off = (traveledPx * 0.05 + t * 8) % span;
  ctx.fillStyle = PALETTE.cloud; ctx.globalAlpha = 0.85;
  for (const [bx, by] of [[120, 90], [430, 60], [720, 110], [950, 75]]) {
    const x = ((bx - off) % span + span) % span - 100;
    cloudPuff(ctx, x, by);
  }
  ctx.globalAlpha = 1;
}

export function drawIslands(ctx, traveledPx) {
  const off = (traveledPx * 0.15) % 380;
  ctx.fillStyle = PALETTE.island;
  for (let i = -1; i < 4; i++) {
    const cx = i * 380 - off + 120;
    ctx.beginPath();
    ctx.moveTo(cx - 90, 300);
    ctx.quadraticCurveTo(cx, 232, cx + 90, 300);
    ctx.closePath(); ctx.fill();
  }
}

export function drawSea(ctx, traveledPx, t) {
  const top = 300, bottom = 360;
  ctx.fillStyle = PALETTE.seaFar;
  ctx.fillRect(0, top, VIEW.W, bottom - top);
  ctx.strokeStyle = PALETTE.foam; ctx.globalAlpha = 0.4; ctx.lineWidth = 2;
  ctx.beginPath();
  const off = (traveledPx * 0.3 + t * 20) % 40;
  for (let x = -40 + off; x < VIEW.W; x += 40) {
    const y = top + 22 + Math.sin((x + t * 30) * 0.05) * 4;
    ctx.moveTo(x, y); ctx.lineTo(x + 16, y);
  }
  ctx.stroke(); ctx.globalAlpha = 1;
}

export function drawDock(ctx) {
  ctx.fillStyle = PALETTE.dock;
  ctx.fillRect(0, GROUND_Y, VIEW.W, VIEW.H - GROUND_Y);
  ctx.fillStyle = PALETTE.dockEdge;
  ctx.fillRect(0, GROUND_Y, VIEW.W, 6);
  ctx.strokeStyle = PALETTE.woodDark; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < VIEW.W; x += 64) { ctx.moveTo(x, GROUND_Y + 6); ctx.lineTo(x, VIEW.H); }
  ctx.stroke(); ctx.globalAlpha = 1;
}

export function drawWaterGap(ctx, x, w, t) {
  ctx.fillStyle = PALETTE.gapSea;
  ctx.fillRect(x, GROUND_Y, w, VIEW.H - GROUND_Y);
  ctx.strokeStyle = PALETTE.gapFoam; ctx.globalAlpha = 0.7; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= w; i += 6) {
    const y = GROUND_Y + 3 + Math.sin((x + i) * 0.15 + t * 4) * 3;
    if (i === 0) ctx.moveTo(x + i, y); else ctx.lineTo(x + i, y);
  }
  ctx.stroke(); ctx.globalAlpha = 1;
}
