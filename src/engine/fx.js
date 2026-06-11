// Deterministic FX state module: mutates its own state, no DOM/Canvas, all
// randomness from the injected rng. Coordinates are SCREEN coordinates.
// Rendering reads via state()/offset()/frozen() — never writes.
export const PARTICLE_CAP = 200;
const SHAKE_CAP = 8;        // px, hard cap
const FREEZE_DEATH = 0.12;  // s of hit-stop on true death
const DAY_CYCLE_M = 1500;   // meters per full day→night→day cycle
const POPUP_TTL = 0.8;      // s
const POPUP_RISE = 50;      // px/s
const FLASH_TTL = 0.06;     // s
const GRAVITY = 600;        // px/s² on spark particles

// Pure: 0..1 phase of the day cycle at a distance (0 = day, 0.5 = night).
export function skyPhase(distanceM) {
  return (((distanceM % DAY_CYCLE_M) + DAY_CYCLE_M) % DAY_CYCLE_M) / DAY_CYCLE_M;
}

export function createFx(rng) {
  const particles = [];   // spark: {shape:'square',x,y,vx,vy,life,ttl,size,color}
                          // ring:  {shape:'ring',x,y,r,grow,life,ttl,color}
  const popups = [];      // {x,y,text,color,life,ttl}
  const shake = { mag: 0, t: 0, dur: 0, ox: 0, oy: 0 };
  let flash = null;       // {color,life,ttl} | null
  let freeze = 0;

  function push(p) {
    if (particles.length >= PARTICLE_CAP) particles.shift();
    particles.push(p);
  }
  function sparks(n, x, y, colors, speed) {
    for (let i = 0; i < n; i++) {
      push({
        shape: 'square', x, y,
        vx: (rng.next() * 2 - 1) * speed,
        vy: -rng.next() * speed,
        life: 0, ttl: 0.4 + rng.next() * 0.2,
        size: 3 + rng.next() * 3,
        color: colors[i % colors.length],
      });
    }
  }
  function ring(x, y, color) {
    push({ shape: 'ring', x, y, r: 10, grow: 140, life: 0, ttl: 0.5, color });
  }
  function startShake(mag, dur) {
    const m = Math.min(SHAKE_CAP, mag);
    if (m >= shake.mag) { shake.mag = m; shake.t = dur; shake.dur = dur; } // max, never sum
  }

  return {
    coinBurst(x, y) { sparks(6, x, y, ['#ffcf3f', '#fff2b0'], 160); },
    smashBurst(x, y) { sparks(12, x, y, ['#ff7a33', '#ffcf3f', '#f5efe0'], 240); startShake(4, 0.2); },
    deathBurst(x, y) {
      sparks(20, x, y, ['#ff5d8f', '#ff7a33', '#f5efe0', '#46c2ff'], 320);
      startShake(8, 0.4);
      freeze = FREEZE_DEATH;
    },
    reviveFlash(x, y) { ring(x, y, '#ff5d8f'); },
    powerupRing(x, y, color) { ring(x, y, color); },
    popup(x, y, text, color) { popups.push({ x, y, text, color, life: 0, ttl: POPUP_TTL }); },
    comboFlash(color) { flash = { color, life: 0, ttl: FLASH_TTL }; },

    update(dt) {
      freeze = Math.max(0, freeze - dt);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.ttl) { particles.splice(i, 1); continue; }
        if (p.shape === 'square') { p.vy += GRAVITY * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        else p.r += p.grow * dt;
      }
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.life += dt; p.y -= POPUP_RISE * dt;
        if (p.life >= p.ttl) popups.splice(i, 1);
      }
      if (flash) { flash.life += dt; if (flash.life >= flash.ttl) flash = null; }
      if (shake.t > 0) {
        shake.t = Math.max(0, shake.t - dt);
        // Exponential decay: full magnitude at start, ~0 by the end of dur.
        const amp = shake.mag * Math.exp(-6 * (1 - shake.t / shake.dur));
        shake.ox = (rng.next() * 2 - 1) * amp;
        shake.oy = (rng.next() * 2 - 1) * amp;
        if (shake.t === 0) { shake.mag = 0; shake.ox = 0; shake.oy = 0; }
      } else { shake.mag = 0; shake.ox = 0; shake.oy = 0; }
    },

    // Pure reads — no state change, no rng consumption.
    offset() { return { x: shake.ox, y: shake.oy }; },
    frozen() { return freeze > 0; },
    state() { return { particles, popups, flash }; },
  };
}
