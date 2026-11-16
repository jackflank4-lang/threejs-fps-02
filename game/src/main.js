// Emberline: boot and the one loop. A fixed 60 Hz simulation feeds a render at the
// display's rate; the simulation (player, bots, rounds, grenades) never allocates in its
// hot paths and never touches the DOM, the HUD only reads numbers out of it.
// ?shot=start|play|plant|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE, TEAM } from './palette.js';
import { mulberry32 } from './rng.js';
import { createMap, SPAWNS, SITES } from './map.js';
import { createPlayer } from './player.js';
import { createWeaponRig, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createGrenades } from './grenades.js';
import { createRounds, BOMB_SECONDS } from './rounds.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createGameState } from './state.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);
const G = createGameState();
G.shot = shot;
G.seed = seed;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const map = createMap(scene);
const combat = createCombat(scene, map.shootables);
const grenades = createGrenades(scene, map.colliders, audio);
const hud = createHud();
const player = createPlayer(map.colliders, SPAWNS.embers[0][0], SPAWNS.embers[0][1], 0);
const bots = createBots(scene, map, random);
const weapon = createWeaponRig(camera);
const input = createInput(renderer.domElement, onLockChange);

const body = player.state;
const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _headMin = new THREE.Vector3();
const _headMax = new THREE.Vector3();
const _torsoMin = new THREE.Vector3();
const _torsoMax = new THREE.Vector3();
const _legsMin = new THREE.Vector3();
const _legsMax = new THREE.Vector3();

let elapsed = 0;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let throwCooldown = 0;
let bombBeepAt = 0;

const playerBody = {
  id: 'player',
  name: 'You',
  team: 'embers',
  mover: player.mover,
  get alive() { return G.player.alive; },
  get health() { return G.player.health; },
  set health(value) { G.player.health = value; },
  get armor() { return G.player.armor; },
  set armor(value) { G.player.armor = value; },
  hitboxes() {
    const p = body.position;
    const crouch = body.crouching ? 0.65 : 1;
    _headMin.set(p.x - 0.17, p.y + 1.36 * crouch, p.z - 0.17);
    _headMax.set(p.x + 0.17, p.y + 1.68 * crouch, p.z + 0.17);
    _torsoMin.set(p.x - 0.29, p.y + 0.62 * crouch, p.z - 0.19);
    _torsoMax.set(p.x + 0.29, p.y + 1.36 * crouch, p.z + 0.19);
    _legsMin.set(p.x - 0.26, p.y, p.z - 0.16);
    _legsMax.set(p.x + 0.26, p.y + 0.62 * crouch, p.z + 0.16);
    return [
      { min: _headMin, max: _headMax, part: 'head' },
      { min: _torsoMin, max: _torsoMax, part: 'torso' },
      { min: _legsMin, max: _legsMax, part: 'legs' },
    ];
  },
  takeDamage(amount) {
    if (!G.player.alive) return false;
    G.player.health -= amount;
    hud.damageFlash();
    audio.hurt();
    if (G.player.health <= 0) {
      G.player.health = 0;
      G.player.alive = false;
      G.player.deaths += 1;
      hud.showMessage('You are down. Your squad fights on.');
      if (document.pointerLockElement) document.exitPointerLock();
      return true;
    }
    return false;
  },
};

const rounds = createRounds({
  onRoundStart(round) {
    saveWeaponAmmo();
    resetPositions();
    grenades.reset();
    G.player.alive = true;
    G.player.health = 100;
    G.player.armor = G.inventory.armor;
    G.player.plantProgress = 0;
    G.player.defuseProgress = 0;
    weapon.equip(WEAPONS[G.inventory.primary], G.inventory.primaryMag, G.inventory.primaryReserve);
    syncHud();
    if (!shot && G.started) hud.showBuy(rounds.state.money);
    hud.showMessage(`Round ${round} — plant the charge at A or B`);
  },
  onLive() {
    hud.hideBuy();
  },
  onRoundEnd(winner, reason, score) {
    if (winner === 'embers') audio.roundWin();
    else audio.roundLose();
    if (!shot) hud.showOverlay('roundEnd', { winner, reason, embers: score.embers, wardens: score.wardens });
    syncHud();
  },
  onMatchEnd(winner, score) {
    G.matchOver = true;
    if (winner === 'embers') audio.roundWin();
    else audio.roundLose();
    if (!shot) hud.showOverlay('matchEnd', { winner, embers: score.embers, wardens: score.wardens });
  },
  onPlant(site) {
    hud.showMessage(`Charge planted at Site ${site} — defend it`);
    audio.beep(true);
    bombBeepAt = elapsed;
  },
  onDefuse() {
    hud.showMessage('Charge defused');
  },
  onDetonation(pos) {
    audio.explosion();
    damageAt(pos, 9, 150, 30);
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 14, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.8, depthWrite: false }),
    );
    flash.position.copy(pos);
    scene.add(flash);
    G.effects.push({ mesh: flash, life: 0.5, grow: 20 });
  },
  onBuy(id) {
    hud.showMessage(`${id} bought`);
    syncHud();
  },
});

function resetPositions() {
  bots.reset(rounds.state.round);
  const [x, z] = SPAWNS.embers[0];
  player.mover.teleport(x, z, 0);
  G.player.blindUntil = 0;
  G.player.blindStrength = 0;
}

function allBodies() {
  return [playerBody, ...bots.list];
}

function syncHud() {
  hud.setHealth(G.player.health);
  hud.setArmor(G.player.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setWeapon(weapon.state.def.name);
  hud.setMoney(rounds.state.money);
  hud.setScore(rounds.state.score.embers, rounds.state.score.wardens, rounds.state.round);
  hud.setAlive((G.player.alive ? 1 : 0) + bots.aliveCount('embers'), bots.aliveCount('wardens'));
  hud.setGrenades(G.inventory);
  hud.setTimer(rounds.state.phase === 'planted' ? rounds.state.bomb.fuse : rounds.state.timer);
  hud.setBomb(rounds.state.bomb.planted, rounds.state.bomb.site, rounds.state.bomb.fuse, BOMB_SECONDS);
}

function fireShot(shooter, origin, direction, def) {
  const result = combat.resolveShot(origin, direction, def, shooter, allBodies(), grenades.smokeSpheres);
  audio.shot(def.kind);
  bots.hear(origin.x, origin.z, elapsed);
  if (!result) return;
  const victim = result.owner;
  const killer = shooter;
  if (killer === playerBody) {
    hud.hitMarker(result.killed);
    audio.hit();
    if (result.killed) {
      audio.kill();
      G.player.kills += 1;
      rounds.awardKill();
      hud.killfeed('You', 'embers', victim.name, victim.team, def.name);
      syncHud();
    }
  } else if (victim === playerBody) {
    syncHud();
  } else if (result.killed) {
    hud.killfeed(killer.name, killer.team, victim.name, victim.team, def.name);
    syncHud();
  }
  if (result.killed) bots.hear(result.point.x, result.point.z, elapsed);
}

function playerShoot(spread) {
  if (!weapon.takeRound()) {
    audio.dryFire();
    return;
  }
  camera.getWorldDirection(_dir);
  _dir.x += (random() * 2 - 1) * spread;
  _dir.y += (random() * 2 - 1) * spread;
  _dir.z += (random() * 2 - 1) * spread;
  _dir.normalize();
  _muzzle.copy(camera.position).addScaledVector(_dir, 0.6);
  _muzzle.y -= 0.12;
  fireShot(playerBody, _muzzle, _dir, weapon.state.def);
  weapon.pullTrigger();
  player.recoil(0.004 + weapon.state.def.kick * 0.7, (random() * 2 - 1) * weapon.state.def.kick * 0.3);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
}

function damageAt(pos, radius, maxDamage, minDamage) {
  for (const target of allBodies()) {
    if (!target.alive) continue;
    const p = target.mover.state.position;
    const dist = Math.hypot(p.x - pos.x, p.z - pos.z) + Math.abs((p.y + 1) - pos.y) * 0.5;
    if (dist > radius) continue;
    _tmp.set(p.x, p.y + 1.2, p.z);
    if (!combat.hasLineOfSight(pos, _tmp, null)) continue;
    const damage = maxDamage - (maxDamage - minDamage) * (dist / radius);
    const killed = target.takeDamage(damage, 'torso');
    if (killed && target !== playerBody) {
      hud.killfeed('Blast', target.team === 'embers' ? 'wardens' : 'embers', target.name, target.team, 'Sparker');
    }
    if (target === playerBody) syncHud();
  }
  bots.hear(pos.x, pos.z, elapsed);
}

function flashAt(pos) {
  // The player: blinded when facing the flash within range and line of sight.
  const eye = _tmp.set(body.position.x, body.position.y + body.eye, body.position.z);
  const toFlash = new THREE.Vector3().copy(pos).sub(eye);
  const dist = toFlash.length();
  if (dist < 26 && G.player.alive) {
    toFlash.normalize();
    camera.getWorldDirection(_dir);
    const facing = _dir.dot(toFlash);
    if (facing > 0.1 && combat.hasLineOfSight(eye, pos, null)) {
      const strength = (1 - dist / 26) * (0.4 + 0.6 * facing);
      G.player.blindUntil = elapsed + 0.5 + strength * 2.5;
      G.player.blindStrength = strength;
    }
  }
  // Bots: blinded when the flash is in front of them and close.
  for (const bot of bots.list) {
    if (!bot.alive) continue;
    const p = bot.mover.state.position;
    const dx = pos.x - p.x;
    const dz = pos.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 26) continue;
    const yawTo = Math.atan2(-dx, -dz);
    let dyaw = yawTo - bot.mover.state.yaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    if (Math.abs(dyaw) < 1.2) {
      bot.blindUntil = elapsed + 0.5 + (1 - d / 26) * 2.5;
    }
  }
}

function throwHeldGrenade(kind) {
  if (G.inventory[kind] <= 0 || throwCooldown > 0) return;
  G.inventory[kind] -= 1;
  camera.getWorldDirection(_dir);
  _muzzle.copy(camera.position).addScaledVector(_dir, 0.5);
  grenades.throwGrenade(kind, _muzzle, _dir);
  throwCooldown = 0.6;
  equipSlot('primary');
  syncHud();
}

function equipSlot(slot) {
  const inv = G.inventory;
  if (slot === 'primary') {
    weapon.equip(WEAPONS[inv.primary], inv.primaryMag, inv.primaryReserve);
    inv.slot = 'primary';
  } else if (slot === 'pistol') {
    weapon.equip(WEAPONS.pistol, inv.pistolMag, inv.pistolReserve);
    inv.slot = 'pistol';
  } else {
    inv.slot = slot;
  }
  syncHud();
}

function saveWeaponAmmo() {
  if (G.inventory.slot === 'primary') {
    G.inventory.primaryMag = weapon.state.mag;
    G.inventory.primaryReserve = weapon.state.reserve;
  } else if (G.inventory.slot === 'pistol') {
    G.inventory.pistolMag = weapon.state.mag;
    G.inventory.pistolReserve = weapon.state.reserve;
  }
}

function tryPlantOrDefuse(dt) {
  const keys = input.state.keys;
  const holding = keys.has('KeyE');
  const bomb = rounds.state.bomb;
  if (rounds.state.phase === 'live' && G.player.alive && holding) {
    for (const site of SITES) {
      const dist = Math.hypot(site.center[0] - body.position.x, site.center[1] - body.position.z);
      if (dist < site.radius) {
        G.player.plantProgress += dt;
        if (G.player.plantProgress >= 4) {
          G.player.plantProgress = 0;
          const pos = new THREE.Vector3(site.center[0], 0.4, site.center[1]);
          rounds.plant(site.id, pos);
          syncHud();
        }
        return;
      }
    }
  }
  if (rounds.state.phase === 'planted' && G.player.alive && holding && bomb.pos) {
    const dist = Math.hypot(bomb.pos.x - body.position.x, bomb.pos.z - body.position.z);
    if (dist < 2.2) {
      G.player.defuseProgress += dt;
      if (G.player.defuseProgress >= 5) {
        G.player.defuseProgress = 0;
        rounds.defuse();
        syncHud();
      }
      return;
    }
  }
  G.player.plantProgress = 0;
  G.player.defuseProgress = 0;
}

function step(dt) {
  elapsed += dt;
  G.time = elapsed;
  throwCooldown = Math.max(0, throwCooldown - dt);
  map.step(dt);
  combat.step(dt);
  grenades.step(dt, {
    effects: G.effects,
    // detonate() already plays the sound, spawns the flash and calls damageAt once.
    onExplosion() {},
    damageAt,
    onFlash(pos) { flashAt(pos); },
  });
  for (let i = G.effects.length - 1; i >= 0; i -= 1) {
    const effect = G.effects[i];
    effect.life -= dt;
    const scale = 1 + (0.5 - effect.life) * effect.grow;
    effect.mesh.scale.setScalar(Math.max(0.1, scale));
    effect.mesh.material.opacity = Math.max(0, effect.life / 0.5) * 0.8;
    if (effect.life <= 0) {
      scene.remove(effect.mesh);
      G.effects.splice(i, 1);
    }
  }

  const phase = rounds.state.phase;
  const enemies = allBodies();
  bots.step(dt, {
    time: elapsed,
    phase,
    combat,
    smokeSpheres: grenades.smokeSpheres,
    enemies,
    bombPlanted: rounds.state.bomb.planted,
    bombPos: rounds.state.bomb.pos ? [rounds.state.bomb.pos.x, rounds.state.bomb.pos.z] : [0, 0],
    fire(bot, muzzle, dir) { fireShot(bot, muzzle, dir, bot.weapon); },
    onPlant(bot, site) {
      const pos = new THREE.Vector3(site === 'A' ? -16.5 : 16.5, 0.4, -12.5);
      rounds.plant(site, pos);
      syncHud();
    },
    onDefuse(bot) { rounds.defuse(); syncHud(); },
    onNoise: true,
  });

  if (G.player.alive && (phase === 'live' || phase === 'planted' || phase === 'freeze')) {
    player.step(dt, input.state.keys);
    // Footsteps: a soft tap every 2.2 m walked.
    const speed = player.groundSpeed();
    if (speed > 1 && body.onGround) {
      G.player.stepAccum += speed * dt;
      if (G.player.stepAccum > 2.2) {
        G.player.stepAccum = 0;
        audio.step();
      }
    }
    tryPlantOrDefuse(dt);
  }

  if (rounds.state.bomb.planted) {
    // The planted charge beeps faster as the fuse runs down.
    const fuse = rounds.state.bomb.fuse;
    const gap = 0.4 + (fuse / BOMB_SECONDS) * 0.8;
    if (elapsed - bombBeepAt >= gap) {
      bombBeepAt = elapsed;
      audio.plantTick();
    }
  }

  weapon.step(dt);
  rounds.step(dt, {
    embersAlive: G.player.alive ? 1 + bots.aliveCount('embers') : bots.aliveCount('embers'),
    wardensAlive: bots.aliveCount('wardens'),
  });
  syncHud();
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (G.player.alive && input.state.locked) player.look(look.x, look.y);
    handleKeys();
    if (input.state.firing && G.player.alive) {
      if (G.inventory.slot === 'primary' || G.inventory.slot === 'pistol') {
        const def = weapon.state.def;
        if (def.auto) {
          if (weapon.ready()) playerShoot(shot ? 0 : weapon.spread(player.groundSpeed(), body.crouching));
        }
      } else if (throwCooldown === 0) {
        throwHeldGrenade(G.inventory.slot);
      }
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    // Blindness fades; the flash overlay follows it.
    if (elapsed < G.player.blindUntil) {
      const remaining = (G.player.blindUntil - elapsed) / Math.max(0.1, G.player.blindStrength * 3);
      hud.flashBlind(Math.min(1, remaining));
    } else {
      hud.flashBlind(0);
    }
    const spread = weapon.spread(player.groundSpeed(), body.crouching);
    hud.setCrosshairGap(4 + spread * 260);
    hud.setTimer(rounds.state.phase === 'planted' ? rounds.state.bomb.fuse : rounds.state.timer);
  }
  renderer.render(scene, camera);
}

function handleKeys() {
  const pressed = input.takePressed();
  for (const code of pressed) {
    if (code === 'KeyM') {
      const muted = audio.toggleMute();
      hud.showMessage(muted ? 'Sound muted' : 'Sound on');
    }
    if (code === 'KeyB' && rounds.state.phase === 'freeze' && !shot) {
      if (document.getElementById('buy').hidden) hud.showBuy(rounds.state.money);
      else hud.hideBuy();
    }
    if (code === 'KeyR' && G.player.alive) {
      if (weapon.reload()) audio.reload();
    }
    if (!document.getElementById('buy').hidden && rounds.state.phase === 'freeze') {
      const buyIds = ['smg', 'shotgun', 'rifle', 'sniper', 'armor', 'frag', 'smoke', 'flash'];
      const buyIndex = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'].indexOf(code);
      if (buyIndex >= 0) {
        const id = buyIds[buyIndex];
        const ok = rounds.buy(id, G.inventory);
        hud.markBought(id, ok);
        if (ok && WEAPONS[id]) equipSlot('primary');
        syncHud();
      }
      continue;
    }
    if (!G.player.alive) continue;
    if (code === 'Digit1' && G.inventory.slot !== 'primary') { saveWeaponAmmo(); equipSlot('primary'); }
    if (code === 'Digit2' && G.inventory.slot !== 'pistol') { saveWeaponAmmo(); equipSlot('pistol'); }
    if (code === 'Digit3') equipSlot('frag');
    if (code === 'Digit4') equipSlot('smoke');
    if (code === 'Digit5') equipSlot('flash');
  }
  // Semi-auto weapons fire once per click: track the mouse button edge here.
  if (!input.state.firing) semiFired = false;
  if (input.state.firing && G.player.alive && !semiFired) {
    const def = weapon.state.def;
    if (!def.auto && (G.inventory.slot === 'primary' || G.inventory.slot === 'pistol')) {
      if (weapon.ready()) {
        playerShoot(shot ? 0 : weapon.spread(player.groundSpeed(), body.crouching));
        semiFired = true;
      }
    }
  }
}

let semiFired = false;

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    G.started = true;
    audio.unlock();
    hud.hideOverlay();
  } else if (!G.matchOver && rounds.state.phase !== 'end') {
    hud.showOverlay(G.started ? 'paused' : 'start');
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (G.matchOver) {
    location.reload();
    return;
  }
  hud.hideOverlay();
  input.requestLock();
});
hud.onBuy((id) => {
  const ok = rounds.buy(id, G.inventory);
  hud.markBought(id, ok);
  if (ok && WEAPONS[id]) equipSlot('primary');
  syncHud();
});

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    player.mover.teleport(0, 15, 0);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.4, -8));
    hud.showBuy(800);
    syncHud();
  } else if (name === 'play') {
    rounds.state.phase = 'live';
    rounds.state.timer = 72;
    rounds.state.money = 2650;
    G.inventory.primaryMag = 24;
    G.inventory.primaryReserve = 90;
    weapon.equip(WEAPONS.rifle, 24, 90);
    player.mover.teleport(-2, 4, 0);
    settle(20);
    // One warden holds the mid lane; aim at his chest and fire once for a tracer.
    const warden = bots.list.find((b) => b.team === 'wardens');
    warden.mover.teleport(2, -8, Math.PI);
    settle(10);
    aimAt(new THREE.Vector3(2, 1.2, -8));
    playerShoot(0);
    settle(2);
    syncHud();
  } else if (name === 'plant') {
    rounds.state.phase = 'planted';
    rounds.state.bomb = { planted: true, site: 'A', pos: new THREE.Vector3(-16.5, 0.4, -12.5), fuse: 32 };
    rounds.state.score = { embers: 2, wardens: 1 };
    rounds.state.money = 3400;
    weapon.equip(WEAPONS.rifle, 18, 60);
    player.mover.teleport(-17.5, -2, 0);
    const warden = bots.list.find((b) => b.team === 'wardens');
    warden.mover.teleport(-15, -13.5, Math.PI * 0.25);
    settle(20);
    aimAt(new THREE.Vector3(-16, 1.2, -12.8));
    syncHud();
  } else {
    // end: round won, overlay up, score 3-1 after four rounds.
    rounds.state.phase = 'end';
    rounds.state.round = 4;
    rounds.state.timer = 4;
    rounds.state.score = { embers: 3, wardens: 1 };
    rounds.state.money = 5900;
    weapon.equip(WEAPONS.rifle, 30, 90);
    player.mover.teleport(-14, -10, 0);
    settle(20);
    aimAt(new THREE.Vector3(-16.5, 1.4, -12.5));
    hud.showOverlay('roundEnd', { winner: 'embers', reason: 'Charge detonated', embers: 3, wardens: 1 });
    syncHud();
  }
  hud.setScore(rounds.state.score.embers, rounds.state.score.wardens, rounds.state.round);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
syncHud();
rounds.startRound();
if (shot) runShot(shot);
else requestAnimationFrame(frame);

// A small handle for local testing and for the finalist review: the live state, read-only
// in practice, so a headless run can drive the game and assert on it.
window.__game = { G, rounds, bots, player, weapon, grenades, input, hud, combat, fireShot, playerShoot, throwHeldGrenade, equipSlot, step, syncCamera, map };
