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
