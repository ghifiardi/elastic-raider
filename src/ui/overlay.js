import { UPGRADES, tierOf, nextCost, canBuy, buyUpgrade, maxTier } from '../meta/shop.js';

// DOM shop overlay. Hard input-hygiene requirements (spec):
// 1. All pointer/touch/click/key events stop at the panel — they must never
//    reach createInput(window)'s listeners.
// 2. input.clear() on BOTH open and close.
// deps: { root, openButton, saveData, persist, input }
export function createOverlay({ root, openButton, saveData, persist, input }) {
  let open = false;

  const STOP_EVENTS = [
    'pointerdown', 'pointerup', 'touchstart', 'touchend', 'touchmove',
    'click', 'keydown', 'keyup',
  ];
  for (const ev of STOP_EVENTS) {
    root.addEventListener(ev, (e) => e.stopPropagation());
    openButton.addEventListener(ev, (e) => e.stopPropagation());
  }

  function rowHtml(id) {
    const u = UPGRADES[id];
    const tier = tierOf(saveData, id);
    const cost = nextCost(saveData, id);
    const check = canBuy(saveData, id);
    const pips = '●'.repeat(tier) + '○'.repeat(maxTier(id) - tier);
    const label = check.reason === 'maxed' ? 'MAX' : `${cost} \u{1FA99}`;
    return `
      <div class="row" data-id="${id}">
        <div class="info">
          <div class="name">${u.name} <span class="pips">${pips}</span></div>
          <div class="effect">${u.effectLine}${check.reason === 'poor' ? ' — not enough coins' : ''}</div>
        </div>
        <button class="buy" data-id="${id}" ${check.ok ? '' : 'disabled'}>${label}</button>
      </div>`;
  }

  function render() {
    root.innerHTML = `
      <div class="panel">
        <button class="close" aria-label="Close shop">✕</button>
        <h2>SHOP</h2>
        <div class="wallet">\u{1FA99} ${saveData.coins} coins</div>
        ${Object.keys(UPGRADES).map(rowHtml).join('')}
      </div>`;
    root.querySelector('.close').addEventListener('click', hide);
    for (const btn of root.querySelectorAll('button.buy')) {
      btn.addEventListener('click', () => {
        if (buyUpgrade(saveData, btn.dataset.id)) { persist(); render(); }
      });
    }
  }

  function show() { open = true; input.clear(); render(); root.hidden = false; }
  function hide() { open = false; root.hidden = true; input.clear(); }

  openButton.addEventListener('click', show);

  return {
    isOpen: () => open,
    show,
    hide,
    setButtonVisible(visible) { openButton.hidden = !visible || open; },
  };
}
