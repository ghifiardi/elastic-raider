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

export function drawBarrel(ctx, e) {
  const { x, y, w, h } = e;
  ctx.fillStyle = PALETTE.wood; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PALETTE.woodDark; ctx.globalAlpha = 0.3;
  ctx.fillRect(x, y, 4, h); ctx.fillRect(x + w - 4, y, 4, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.band;
  ctx.fillRect(x, y + h * 0.18, w, 4);
  ctx.fillRect(x, y + h * 0.70, w, 4);
}

export function drawMarine(ctx, e) {
  const { x, y, w, h } = e;
  ctx.fillStyle = PALETTE.coat;  ctx.fillRect(x, y + h * 0.30, w, h * 0.70);
  ctx.fillStyle = PALETTE.coatDark; ctx.fillRect(x, y + h * 0.60, w, 4);
  ctx.fillStyle = PALETTE.skin;  ctx.fillRect(x + w * 0.25, y + h * 0.12, w * 0.50, h * 0.20);
  ctx.fillStyle = PALETTE.cap;   ctx.fillRect(x + w * 0.16, y + h * 0.02, w * 0.68, h * 0.12);
  ctx.fillStyle = PALETTE.capBand; ctx.fillRect(x + w * 0.16, y + h * 0.12, w * 0.68, 3);
}

export function drawCoin(ctx, e, t) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2;
  const sx = Math.max(0.15, Math.abs(Math.cos(t * 4 + e.x * 0.05)));
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(sx, 1);
  ctx.fillStyle = PALETTE.coin; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.coinShine; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.25, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawHero(ctx, p, invincible, t) {
  const w = PLAYER.w, h = p.height, topY = p.y - h, cx = p.x + w / 2;
  if (invincible) {
    ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = PALETTE.glow;
    ctx.fillRect(p.x - 6, topY - 6, w + 12, h + 12); ctx.restore();
  }
  const running = p.state === 'running';
  const dashing = p.state === 'dashing';
  const sliding = p.state === 'sliding';
  const bob = running ? Math.sin(t * 12) * 2 : 0;
  const swing = running ? Math.sin(t * 12) * 6 : 0;

  const headR = w * 0.28;
  const headCy = topY + bob + headR + (sliding ? 2 : 4);
  const torsoTop = headCy + headR * 0.6;
  const torsoBot = p.y - (sliding ? 2 : h * 0.26);

  // legs
  ctx.strokeStyle = PALETTE.shorts; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 5, torsoBot); ctx.lineTo(cx - 5 - swing * 0.4, p.y);
  ctx.moveTo(cx + 5, torsoBot); ctx.lineTo(cx + 5 + swing * 0.4, p.y);
  ctx.stroke();

  // torso (shirt + vest stripes)
  ctx.fillStyle = PALETTE.shirt; ctx.fillRect(cx - w * 0.22, torsoTop, w * 0.44, torsoBot - torsoTop);
  ctx.fillStyle = PALETTE.vest;
  ctx.fillRect(cx - w * 0.24, torsoTop, w * 0.10, torsoBot - torsoTop);
  ctx.fillRect(cx + w * 0.14, torsoTop, w * 0.10, torsoBot - torsoTop);

  // arms (the dash stretches the front arm forward — the signature reach)
  ctx.strokeStyle = PALETTE.skin; ctx.lineWidth = 5; ctx.lineCap = 'round';
  const armY = torsoTop + (torsoBot - torsoTop) * 0.3;
  if (dashing) {
    ctx.beginPath(); ctx.moveTo(cx, armY); ctx.lineTo(p.x + w + DASH_REACH, armY); ctx.stroke();
    ctx.fillStyle = PALETTE.skin; ctx.beginPath(); ctx.arc(p.x + w + DASH_REACH, armY, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, armY); ctx.lineTo(cx - 10, armY + 8); ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx, armY); ctx.lineTo(cx + 8 + swing, armY + 10);
    ctx.moveTo(cx, armY); ctx.lineTo(cx - 8 - swing, armY + 10);
    ctx.stroke();
  }

  // head + hair + red bandana
  ctx.fillStyle = PALETTE.skin; ctx.beginPath(); ctx.arc(cx, headCy, headR, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.hair; ctx.fillRect(cx - headR, headCy - headR * 0.1, headR * 2, headR * 0.5);
  ctx.fillStyle = PALETTE.bandana;
  ctx.beginPath(); ctx.arc(cx, headCy, headR, Math.PI, 0); ctx.fill();
  ctx.fillRect(cx - headR, headCy - 2, headR * 2, 5);
  ctx.fillRect(cx + headR - 2, headCy - 1, 8, 4); // knot tail
}

function gearOrb(ctx, r, t) {
  ctx.fillStyle = PALETTE.gear; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.7; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.5, t * 3, t * 3 + Math.PI * 1.3); ctx.stroke();
  ctx.globalAlpha = 1;
}
function magnetIcon(ctx, r) {
  ctx.strokeStyle = PALETTE.magnet; ctx.lineWidth = r * 0.5; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.6, Math.PI, 0); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, -r * 0.1); ctx.lineTo(-r * 0.6, r * 0.7);
  ctx.moveTo(r * 0.6, -r * 0.1); ctx.lineTo(r * 0.6, r * 0.7);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-r * 0.85, r * 0.55, r * 0.5, r * 0.22);
  ctx.fillRect(r * 0.35, r * 0.55, r * 0.5, r * 0.22);
}
function starShape(ctx, outer, inner) {
  let rot = -Math.PI / 2; const step = Math.PI / 5;
  ctx.beginPath(); ctx.moveTo(0, -outer);
  for (let i = 0; i < 5; i++) {
    ctx.lineTo(Math.cos(rot) * outer, Math.sin(rot) * outer); rot += step;
    ctx.lineTo(Math.cos(rot) * inner, Math.sin(rot) * inner); rot += step;
  }
  ctx.closePath(); ctx.fill();
}
function multStar(ctx, r) {
  ctx.fillStyle = PALETTE.mult; starShape(ctx, r, r * 0.5);
  ctx.fillStyle = '#fff'; ctx.font = `${Math.round(r)}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('2', 0, 1);
  ctx.textBaseline = 'alphabetic';
}
function heartIcon(ctx, r) {
  ctx.fillStyle = PALETTE.revive;
  ctx.beginPath(); ctx.moveTo(0, r * 0.6);
  ctx.bezierCurveTo(r, -r * 0.2, r * 0.4, -r, 0, -r * 0.3);
  ctx.bezierCurveTo(-r * 0.4, -r, -r, -r * 0.2, 0, r * 0.6);
  ctx.fill();
}

export function drawPickup(ctx, e, t) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2;
  const bob = Math.sin(t * 3 + e.x * 0.05) * 2;
  ctx.save(); ctx.translate(cx, cy + bob);
  if (e.type === 'gear') gearOrb(ctx, r, t);
  else if (e.type === 'magnet') magnetIcon(ctx, r);
  else if (e.type === 'mult') multStar(ctx, r);
  else if (e.type === 'revive') heartIcon(ctx, r);
  ctx.restore();
}
