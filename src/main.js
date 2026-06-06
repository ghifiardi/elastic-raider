import { VIEW } from './data/constants.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = VIEW.W * dpr;
  canvas.height = VIEW.H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener('resize', resize);

ctx.fillStyle = '#0b1020';
ctx.fillRect(0, 0, VIEW.W, VIEW.H);
ctx.fillStyle = '#e8d7a0';
ctx.font = '32px system-ui, sans-serif';
ctx.textAlign = 'center';
ctx.fillText('Elastic Raider', VIEW.W / 2, VIEW.H / 2);
