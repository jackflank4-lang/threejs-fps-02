// The armoury: five guns, each a data row plus one shared state machine. A gun owns its
// magazine, its reload, its spread and its view model; main.js owns the ray and the
// damage, so the numbers stay in one place.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', kind: 'pistol', price: 0,
    damage: 34, headMult: 4, pellets: 1, mag: 12, reserve: 36,
    fireGap: 0.14, reloadTime: 1.4, auto: false,
    spreadStill: 0.004, spreadMoving: 0.03, bloom: 0.006, kick: 0.008,
    barrel: 0.3, body: 0.34,
  },
  smg: {
    id: 'smg', name: 'VK-9 Ripper', kind: 'smg', price: 1500,
    damage: 26, headMult: 4, pellets: 1, mag: 30, reserve: 120,
    fireGap: 0.08, reloadTime: 2.0, auto: true,
    spreadStill: 0.006, spreadMoving: 0.045, bloom: 0.009, kick: 0.006,
    barrel: 0.42, body: 0.4,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Longshot', kind: 'rifle', price: 2700,
    damage: 34, headMult: 4, pellets: 1, mag: 30, reserve: 90,
    fireGap: 0.1, reloadTime: 1.9, auto: true,
    spreadStill: 0.0022, spreadMoving: 0.028, bloom: 0.007, kick: 0.009,
    barrel: 0.52, body: 0.46,
  },
  shotgun: {
    id: 'shotgun', name: 'M12 Breacher', kind: 'shotgun', price: 1900,
    damage: 8, headMult: 4, pellets: 9, mag: 6, reserve: 24,
    fireGap: 0.85, reloadTime: 2.6, auto: false,
    spreadStill: 0.02, spreadMoving: 0.05, bloom: 0.004, kick: 0.03,
    barrel: 0.5, body: 0.5,
  },
  sniper: {
    id: 'sniper', name: 'LW-50 Marksman', kind: 'sniper', price: 4750,
    damage: 110, headMult: 4, pellets: 1, mag: 5, reserve: 15,
    fireGap: 1.25, reloadTime: 3.0, auto: false,
    spreadStill: 0.0008, spreadMoving: 0.06, bloom: 0.002, kick: 0.05,
    barrel: 0.72, body: 0.56,
  },
};

export const BUY_MENU = [
  { id: 'smg', label: 'VK-9 Ripper — SMG' },
  { id: 'shotgun', label: 'M12 Breacher — shotgun' },
  { id: 'rifle', label: 'AR-77 Longshot — rifle' },
  { id: 'sniper', label: 'LW-50 Marksman — sniper' },
  { id: 'armor', label: 'Kevlar vest — halves damage' },
  { id: 'frag', label: 'Sparker — frag grenade' },
  { id: 'smoke', label: 'Veil — smoke grenade' },
  { id: 'flash', label: 'Flare — flash grenade' },
];

const ARMOR_PRICE = 650;
const GRENADE_PRICES = { frag: 300, smoke: 300, flash: 200 };

export function priceOf(id) {
  if (id === 'armor') return ARMOR_PRICE;
  if (GRENADE_PRICES[id] !== undefined) return GRENADE_PRICES[id];
  return WEAPONS[id] ? WEAPONS[id].price : 0;
}

export function createWeaponRig(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.7, metalness: 0.25 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.08), accent);
  sight.position.set(0, 0.07, -0.08);
  barrel.position.set(0, 0.025, -0.38);
  stock.position.set(0, -0.02, 0.3);
  model.add(receiver, barrel, stock, sight);
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  // Muzzle flash: a radial-gradient sprite, so it reads as a burst of light rather
  // than a flat square.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  const fctx = flashCanvas.getContext('2d');
  const grad = fctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 240, 200, 1)');
  grad.addColorStop(0.35, 'rgba(255, 150, 60, 0.9)');
  grad.addColorStop(1, 'rgba(255, 110, 30, 0)');
  fctx.fillStyle = grad;
  fctx.fillRect(0, 0, 64, 64);
  const flashTexture = new THREE.CanvasTexture(flashCanvas);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ map: flashTexture, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    def: WEAPONS.rifle,
    mag: WEAPONS.rifle.mag,
    reserve: WEAPONS.rifle.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
    switchLeft: 0,
  };

  function rebuildModel() {
    const def = state.def;
    receiver.scale.set(1, 1, def.body / 0.42);
    barrel.scale.set(1, 1, def.barrel / 0.4);
    barrel.position.z = -0.2 - def.barrel / 2;
    stock.visible = def.kind !== 'pistol';
    sight.visible = def.kind === 'rifle' || def.kind === 'sniper';
    flash.position.z = -0.55 - def.barrel;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.switchLeft = Math.max(0, state.switchLeft - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.position.y = -0.2 + (state.switchLeft > 0 ? -0.12 * state.switchLeft : 0);
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (state.def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = state.def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip(def, mag, reserve) {
      state.def = def;
      state.mag = mag === undefined ? def.mag : mag;
      state.reserve = reserve === undefined ? def.reserve : reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
      state.switchLeft = 0.22;
      rebuildModel();
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switchLeft === 0;
    },
    pullTrigger() {
      state.cooldown = state.def.fireGap;
      state.flash = 0.06;
      state.kick = 0.02 + state.def.kick;
      state.bloom = Math.min(0.06, state.bloom + state.def.bloom);
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === state.def.mag || state.reserve === 0) return false;
      state.reloadLeft = state.def.reloadTime;
      return true;
    },
    spread(speed, crouching) {
      const moving = Math.min(1, speed / 5.2);
      const base = state.def.spreadStill + moving * state.def.spreadMoving;
      return (base + state.bloom) * (crouching ? 0.7 : 1);
    },
    refill() {
      state.mag = state.def.mag;
      state.reserve = state.def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
  };
}
