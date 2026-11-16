// The DOM HUD: crosshair, hit marker, health, armour, ammo, money, timer, score, team
// counts, kill feed, bomb bar, damage and flash overlays, and the buy menu. It never
// touches the simulation; main.js pushes numbers in and reads callbacks out.
import { BUY_MENU, priceOf } from './weapons.js';

const OVERLAY_COPY = {
  start: {
    title: 'Emberline',
    copy: 'Kiln Yard, dusk. Plant the spark charge at Site A or Site B, or wipe the Wardens out. First to five rounds takes the yard.',
    action: 'Click to play',
  },
  paused: {
    title: 'Emberline',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayCopy = $('overlay-copy');
  const playButton = $('play');
  const buyOverlay = $('buy');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const healthValue = $('health-value');
  const armorValue = $('armor-value');
  const armorRow = $('armor-row');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const roundScore = $('round-score');
  const aliveEmbers = $('alive-embers');
  const aliveWardens = $('alive-wardens');
  const killfeed = $('killfeed');
  const bombBar = $('bomb-bar');
  const bombFill = $('bomb-fill');
  const bombLabel = $('bomb-label');
  const grenadeRow = $('grenades');
  const damageVignette = $('damage');
  const flashOverlay = $('flash');
  const message = $('message');

  let hitTimer = 0;
  let messageTimer = 0;
  let last = {};
  let buyHandler = null;
  let playHandler = null;

  for (const item of BUY_MENU) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-item';
    button.dataset.id = item.id;
    button.innerHTML = `<span class="buy-label">${item.label}</span><span class="buy-price">$${priceOf(item.id)}</span>`;
    button.addEventListener('click', () => { if (buyHandler) buyHandler(item.id); });
    buyList.appendChild(button);
  }

  function setText(element, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    element.textContent = value;
  }

  return {
    setHealth(value) {
      setText(healthValue, String(Math.ceil(value)), 'health');
      healthValue.parentElement.classList.toggle('low', value <= 30);
    },
    setArmor(value) {
      armorRow.style.display = value > 0 ? '' : 'none';
      setText(armorValue, String(Math.ceil(value)), 'armor');
    },
    setAmmo(mag, reserve) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'reserve');
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setWeapon(name) { setText(weaponName, name, 'weapon'); },
    setMoney(value) {
      setText(moneyValue, `$${value}`, 'money');
      setText(buyMoney, `$${value}`, 'buyMoney');
    },
    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(timerValue, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 'timer');
    },
    setScore(embers, wardens, round) {
      setText(roundScore, `R${round}  ${embers} — ${wardens}`, 'score');
    },
    setAlive(embers, wardens) {
      setText(aliveEmbers, '●'.repeat(embers) + '○'.repeat(Math.max(0, 4 - embers)), 'aliveE');
      setText(aliveWardens, '●'.repeat(wardens) + '○'.repeat(Math.max(0, 4 - wardens)), 'aliveW');
    },
    setGrenades(inventory) {
      setText(grenadeRow, `Frag ${inventory.frag} · Smoke ${inventory.smoke} · Flash ${inventory.flash}`, 'grenades');
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    setBomb(planted, site, fuse, total) {
      bombBar.hidden = !planted;
      if (planted) {
        setText(bombLabel, `CHARGE PLANTED — SITE ${site}`, 'bombLabel');
        bombFill.style.width = `${Math.max(0, (fuse / total) * 100).toFixed(1)}%`;
      }
    },
    hitMarker(killed) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), 110);
    },
    killfeed(killerName, killerTeam, victimName, victimTeam, weaponName) {
      const entry = document.createElement('div');
      entry.className = 'feed-entry';
      entry.innerHTML = `<b style="color:${killerTeam === 'embers' ? '#ff7a2f' : '#3fa7a0'}">${killerName}</b> <span>▸ ${weaponName} ▸</span> <b style="color:${victimTeam === 'embers' ? '#ff7a2f' : '#3fa7a0'}">${victimName}</b>`;
      killfeed.prepend(entry);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => entry.remove(), 5200);
    },
    damageFlash() {
      damageVignette.classList.add('on');
      setTimeout(() => damageVignette.classList.remove('on'), 180);
    },
    flashBlind(strength) {
      flashOverlay.style.opacity = String(Math.min(1, strength));
    },
    showMessage(text, ms = 2600) {
      message.textContent = text;
      message.hidden = false;
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => { message.hidden = true; }, ms);
    },
    showOverlay(mode, data) {
      if (mode === 'roundEnd') {
        overlayTitle.textContent = data.winner === 'embers' ? 'Round to the Embers' : 'Round to the Wardens';
        overlayCopy.textContent = `${data.reason}. ${data.embers} — ${data.wardens}.`;
        playButton.textContent = 'Next round';
      } else if (mode === 'matchEnd') {
        overlayTitle.textContent = data.winner === 'embers' ? 'The yard is yours' : 'The Wardens hold the yard';
        overlayCopy.textContent = `Final score ${data.embers} — ${data.wardens}.`;
        playButton.textContent = 'Play again';
      } else {
        const copy = OVERLAY_COPY[mode];
        overlayTitle.textContent = copy.title;
        overlayCopy.textContent = copy.copy;
        playButton.textContent = copy.action;
      }
      overlay.hidden = false;
      playButton.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    showBuy(money) {
      buyOverlay.hidden = false;
      this.setMoney(money);
    },
    hideBuy() { buyOverlay.hidden = true; },
    markBought(id, ok) {
      const button = buyList.querySelector(`[data-id="${id}"]`);
      if (!button) return;
      button.classList.remove('bought', 'denied');
      button.classList.add(ok ? 'bought' : 'denied');
      setTimeout(() => button.classList.remove('bought', 'denied'), 400);
    },
    onPlay(handler) {
      playHandler = handler;
      playButton.addEventListener('click', () => playHandler());
    },
    onBuy(handler) { buyHandler = handler; },
  };
}
