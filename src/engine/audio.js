// Tiny procedural SFX. AudioContext is created lazily and resumed on first
// user gesture to satisfy autoplay policies.
export function createAudio() {
  let ctx = null;

  function ensure() {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function blip(freq, dur, type = 'square', gain = 0.06) {
    const c = ensure(); if (!c) return;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    osc.connect(g).connect(c.destination);
    osc.start(); osc.stop(c.currentTime + dur);
  }

  return {
    unlock: ensure, // call from a user-gesture handler
    jump:  () => blip(520, 0.12, 'square'),
    smash: () => blip(180, 0.14, 'sawtooth', 0.09),
    coin:  () => blip(880, 0.10, 'triangle'),
    death: () => { blip(200, 0.25, 'sawtooth', 0.1); setTimeout(() => blip(120, 0.35, 'sawtooth', 0.1), 90); },
  };
}
