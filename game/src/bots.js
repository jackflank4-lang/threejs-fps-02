// Bots: 3 Embers attackers beside the player, 4 Wardens defenders. Each bot is a mover
// with a gun, a role and a small state machine: push along the waypoint graph, hold an
// angle, engage what it sees, plant or defuse the charge, fall back when hurt. They see
// through a vision cone plus a line-of-sight ray, hear loud noises, and fire in bursts
// with an aim error that grows with distance and movement, so stopping to aim pays.
import * as THREE from 'three';
import { TEAM } from './palette.js';
import { WEAPONS } from './weapons.js';
import { createMover } from './player.js';
import { range } from './rng.js';

const HEALTH = 100;
const VISION_RANGE = 46;
const VISION_HALF_ANGLE = 0.96;
const HEAR_RANGE = 30;
const REACTION_MIN = 0.28;
const REACTION_MAX = 0.5;
const PLANT_SECONDS = 4;
const DEFUSE_SECONDS = 5;

const NAMES = {
  embers: ['Ash', 'Cinder', 'Flint'],
  wardens: ['Slate', 'Moss', 'Rook', 'Tarn'],
};

function buildMesh(scene, team) {
  const group = new THREE.Group();
  const teamColor = new THREE.Color(TEAM[team].color);
  const cloth = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9b48a'), roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2e36'), roughness: 0.85 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.34), cloth);
  torso.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.y = 1.52;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.05), dark);
  visor.position.set(0, 1.54, -0.14);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.66, 0.24), dark);
  legL.position.set(-0.14, 0.33, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), dark);
  gun.position.set(0.22, 1.05, -0.3);
  group.add(torso, head, visor, legL, legR, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
  scene.add(group);
  return { group, torso, head, legL, legR, gun };
}

export function createBots(scene, map, random) {
  const list = [];
  let defuser = null;

  function spawnBot(team, name, x, z, yaw, weaponId, role, site) {
    const mover = createMover(map.colliders, x, z, yaw);
    const mesh = buildMesh(scene, team);
    const bot = {
      id: `${team}-${name}`,
      name,
      team,
      mover,
      mesh,
      weapon: WEAPONS[weaponId],
      health: HEALTH,
      armor: 0,
      alive: true,
      role,
      site,
      state: 'push',
      path: [],
      pathIndex: 0,
      target: null,
      lastSeen: -10,
      reactionAt: 0,
      burstLeft: 0,
      burstAt: 0,
      nextShotAt: 0,
      scanAt: random() * 0.12,
      holdUntil: 0,
      plantProgress: 0,
      defuseProgress: 0,
      noiseAt: null,
      noiseTime: -10,
      fall: 0,
      stepPhase: 0,
      aimError: 0.035,
      blindUntil: 0,
    };
    bot.hitboxes = makeHitboxes(bot);
    bot.takeDamage = (amount) => takeDamage(bot, amount);
    list.push(bot);
    return bot;
  }

  function makeHitboxes(bot) {
    const min = new THREE.Vector3();
    const max = new THREE.Vector3();
    const boxes = [
      { min: new THREE.Vector3(), max: new THREE.Vector3(), part: 'head' },
      { min: new THREE.Vector3(), max: new THREE.Vector3(), part: 'torso' },
      { min: new THREE.Vector3(), max: new THREE.Vector3(), part: 'legs' },
    ];
    return function hitboxes() {
      const p = bot.mover.state.position;
      const crouch = bot.mover.state.crouching ? 0.65 : 1;
      boxes[0].min.set(p.x - 0.17, p.y + 1.36 * crouch, p.z - 0.17);
      boxes[0].max.set(p.x + 0.17, p.y + 1.68 * crouch, p.z + 0.17);
      boxes[1].min.set(p.x - 0.29, p.y + 0.62 * crouch, p.z - 0.19);
      boxes[1].max.set(p.x + 0.29, p.y + 1.36 * crouch, p.z + 0.19);
      boxes[2].min.set(p.x - 0.26, p.y, p.z - 0.16);
      boxes[2].max.set(p.x + 0.26, p.y + 0.62 * crouch, p.z + 0.16);
      return boxes;
    };
  }

  function reset(round) {
    defuser = null;
    for (const bot of list) {
      bot.health = HEALTH;
      bot.armor = 0;
      bot.alive = true;
      bot.state = bot.team === 'wardens' ? 'hold' : 'push';
      bot.path = [];
      bot.pathIndex = 0;
      bot.target = null;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.fall = 0;
      bot.blindUntil = 0;
      bot.mesh.group.rotation.set(0, 0, 0);
      bot.mesh.group.visible = true;
    }
    const embersSpawns = [[-19, 15], [-11, 15], [-3, 15.5]];
    const wardensSpawns = [[-19, -15], [-11, -15], [11, -15], [19, -15]];
    const embers = list.filter((b) => b.team === 'embers');
    const wardens = list.filter((b) => b.team === 'wardens');
    embers.forEach((bot, i) => {
      const [x, z] = embersSpawns[i];
      bot.mover.teleport(x, z, 0);
      bot.site = i < 2 ? 'A' : 'B';
      bot.role = 'attack';
    });
    wardens.forEach((bot, i) => {
      const [x, z] = wardensSpawns[i];
      bot.mover.teleport(x, z, Math.PI);
      bot.site = i < 2 ? 'A' : 'B';
      bot.role = 'defend';
    });
  }

  function buildTeams() {
    spawnBot('embers', NAMES.embers[0], -19, 15, 0, 'rifle', 'attack', 'A');
    spawnBot('embers', NAMES.embers[1], -11, 15, 0, 'rifle', 'attack', 'A');
    spawnBot('embers', NAMES.embers[2], -3, 15.5, 0, 'smg', 'attack', 'B');
    spawnBot('wardens', NAMES.wardens[0], -19, -15, Math.PI, 'rifle', 'defend', 'A');
    spawnBot('wardens', NAMES.wardens[1], -11, -15, Math.PI, 'smg', 'defend', 'A');
    spawnBot('wardens', NAMES.wardens[2], 11, -15, Math.PI, 'rifle', 'defend', 'B');
    spawnBot('wardens', NAMES.wardens[3], 19, -15, Math.PI, 'shotgun', 'defend', 'B');
  }

  buildTeams();
  reset(1);

  function visibleEnemy(bot, enemies, time, smokeSpheres, combat) {
    const eye = bot.mover.state.position;
    const eyeY = eye.y + bot.mover.state.eye;
    let best = null;
    let bestDist = Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive || enemy === bot || enemy.team === bot.team) continue;
      const ep = enemy.mover ? enemy.mover.state.position : enemy.position;
      const dx = ep.x - eye.x;
      const dz = ep.z - eye.z;
      const dist = Math.hypot(dx, dz);
      if (dist > VISION_RANGE || dist < 0.5) continue;
      const angle = Math.atan2(-dx, -dz) - bot.mover.state.yaw;
      const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
      if (Math.abs(wrapped) > VISION_HALF_ANGLE && dist > 4) continue;
      const from = new THREE.Vector3(eye.x, eyeY, eye.z);
      const to = new THREE.Vector3(ep.x, ep.y + 1.2, ep.z);
      if (!combat.hasLineOfSight(from, to, smokeSpheres)) continue;
      if (dist < bestDist) { bestDist = dist; best = enemy; }
    }
    return best ? { enemy: best, dist: bestDist } : null;
  }

  function moveAlongPath(bot, dt, speed) {
    if (!bot.path.length || bot.pathIndex >= bot.path.length) return true;
    const [tx, tz] = bot.path[bot.pathIndex];
    const p = bot.mover.state.position;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      bot.pathIndex += 1;
      return bot.pathIndex >= bot.path.length;
    }
    const targetYaw = Math.atan2(-dx, -dz);
    let dyaw = targetYaw - bot.mover.state.yaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    bot.mover.state.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, dyaw));
    const sin = Math.sin(bot.mover.state.yaw);
    const cos = Math.cos(bot.mover.state.yaw);
    bot.mover.step(dt, -sin, -cos, speed, false, false);
    return false;
  }

  function faceTarget(bot, dt, tx, tz) {
    const p = bot.mover.state.position;
    const targetYaw = Math.atan2(-(tx - p.x), -(tz - p.z));
    let dyaw = targetYaw - bot.mover.state.yaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    bot.mover.state.yaw += Math.max(-6 * dt, Math.min(6 * dt, dyaw));
  }

  function siteCenter(siteId) {
    return siteId === 'A' ? [-16.5, -12.5] : [16.5, -12.5];
  }

  function step(dt, ctx) {
    const { time, phase, combat, smokeSpheres, fire, onPlant, onDefuse, onNoise } = ctx;
    for (const bot of list) {
      const body = bot.mover.state;
      const group = bot.mesh.group;
      group.position.copy(body.position);
      group.rotation.y = body.yaw;
      // Walk cycle: legs swing while moving, body bobs slightly.
      const speed = bot.mover.groundSpeed();
      if (bot.alive && speed > 0.5) {
        bot.stepPhase += dt * speed * 1.6;
        const swing = Math.sin(bot.stepPhase) * 0.45;
        bot.mesh.legL.rotation.x = swing;
        bot.mesh.legR.rotation.x = -swing;
      } else {
        bot.mesh.legL.rotation.x *= 0.8;
        bot.mesh.legR.rotation.x *= 0.8;
      }
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt * 2.5);
        group.rotation.x = -bot.fall * 1.45;
        continue;
      }
      group.rotation.x = 0;
      if (phase === 'freeze' || phase === 'end' || phase === 'matchEnd') {
        bot.mover.step(dt, 0, 0, 0, false, false);
        continue;
      }

      // Vision, staggered so not every bot scans every frame. A flashed bot sees nothing.
      if (time >= bot.scanAt && time >= bot.blindUntil) {
        bot.scanAt = time + 0.12 + random() * 0.05;
        const seen = visibleEnemy(bot, ctx.enemies, time, smokeSpheres, combat);
        if (seen) {
          if (bot.target !== seen.enemy) {
            bot.target = seen.enemy;
            bot.reactionAt = time + range(random, REACTION_MIN, REACTION_MAX);
            bot.burstLeft = 0;
          }
          bot.lastSeen = time;
        } else if (bot.target && time - bot.lastSeen > 2) {
          bot.target = null;
        }
      }

      // Hearing: a loud noise pulls a bot that has nothing better to do.
      if (onNoise && bot.noiseAt && time - bot.noiseTime < 6 && !bot.target && bot.state !== 'defuse') {
        bot.state = 'investigate';
      }

      const target = bot.target;
      if (target && target.alive) {
        const tp = target.mover ? target.mover.state.position : target.position;
        faceTarget(bot, dt, tp.x, tp.z);
        const dist = Math.hypot(tp.x - body.position.x, tp.z - body.position.z);
        if (time >= bot.reactionAt && time >= bot.nextShotAt) {
          if (bot.burstLeft <= 0) {
            bot.burstLeft = 3 + Math.floor(random() * 3);
            bot.nextShotAt = time + range(random, 0.45, 0.85);
          } else {
            bot.burstLeft -= 1;
            bot.nextShotAt = time + bot.weapon.fireGap * 1.6;
            const muzzle = new THREE.Vector3(body.position.x, body.position.y + 1.35, body.position.z);
            const aim = new THREE.Vector3(tp.x - muzzle.x, tp.y + 1.25 - muzzle.y, tp.z - muzzle.z).normalize();
            const error = bot.aimError * (0.5 + dist / 40) * (1 + bot.mover.groundSpeed() / 5);
            aim.x += (random() * 2 - 1) * error;
            aim.y += (random() * 2 - 1) * error * 0.7;
            aim.z += (random() * 2 - 1) * error;
            aim.normalize();
            fire(bot, muzzle, aim);
          }
        }
        // Close in slowly when the target is far, hold ground when close.
        if (dist > 14) {
          const sin = Math.sin(body.yaw);
          const cos = Math.cos(body.yaw);
          bot.mover.step(dt, -sin * 0.6, -cos * 0.6, bot.mover.botSpeed() * 0.7, false, false);
        } else {
          bot.mover.step(dt, 0, 0, 0, false, false);
        }
        continue;
      }

      // No target: role behaviour.
      if (bot.role === 'attack') {
        if (ctx.bombPlanted) {
          // Bomb is down: hold near the planted site and watch the approaches.
          const [bx, bz] = ctx.bombPos;
          const dist = Math.hypot(bx - body.position.x, bz - body.position.z);
          if (dist > 4) {
            if (!bot.path.length || bot.pathIndex >= bot.path.length) {
              bot.path = map.findPath(body.position.x, body.position.z, bx, bz);
              bot.pathIndex = 0;
            }
            moveAlongPath(bot, dt, bot.mover.botSpeed());
          } else {
            faceTarget(bot, dt, bx + Math.sin(time * 0.5) * 6, bz + Math.cos(time * 0.5) * 6);
            bot.mover.step(dt, 0, 0, 0, true, false);
          }
          continue;
        }
        const [sx, sz] = siteCenter(bot.site);
        const dist = Math.hypot(sx - body.position.x, sz - body.position.z);
        if (dist < 2.6) {
          // On site and clear: plant the charge.
          if (time - bot.lastSeen > 2 || bot.lastSeen < 0) {
            bot.state = 'plant';
            bot.plantProgress += dt;
            bot.mover.step(dt, 0, 0, 0, false, false);
            if (bot.plantProgress >= PLANT_SECONDS) {
              bot.plantProgress = 0;
              onPlant(bot, bot.site);
            }
            continue;
          }
        }
        if (!bot.path.length || bot.pathIndex >= bot.path.length) {
          bot.path = map.findPath(body.position.x, body.position.z, sx, sz);
          bot.pathIndex = 0;
        }
        moveAlongPath(bot, dt, bot.mover.botSpeed());
      } else {
        // Defenders: hold the assigned site; rotate to the planted site to defuse.
        if (ctx.bombPlanted) {
          const [bx, bz] = ctx.bombPos;
          const dist = Math.hypot(bx - body.position.x, bz - body.position.z);
          if (dist > 1.6) {
            if (!bot.path.length || bot.pathIndex >= bot.path.length) {
              bot.path = map.findPath(body.position.x, body.position.z, bx, bz);
              bot.pathIndex = 0;
            }
            moveAlongPath(bot, dt, bot.mover.botSpeed());
          } else if (!defuser || defuser === bot || !defuser.alive) {
            defuser = bot;
            bot.state = 'defuse';
            bot.defuseProgress += dt;
            bot.mover.step(dt, 0, 0, 0, false, false);
            if (bot.defuseProgress >= DEFUSE_SECONDS) {
              bot.defuseProgress = 0;
              defuser = null;
              onDefuse(bot);
            }
          } else {
            faceTarget(bot, dt, bx, bz);
            bot.mover.step(dt, 0, 0, 0, true, false);
          }
          continue;
        }
        if (bot.state === 'investigate' && bot.noiseAt) {
          const [nx, nz] = bot.noiseAt;
          if (!bot.path.length || bot.pathIndex >= bot.path.length) {
            bot.path = map.findPath(body.position.x, body.position.z, nx, nz);
            bot.pathIndex = 0;
          }
          if (moveAlongPath(bot, dt, bot.mover.botSpeed())) {
            bot.noiseAt = null;
            bot.state = 'hold';
            bot.holdUntil = time + 3;
          }
          continue;
        }
        // Hold: stand near the site, slowly sweeping the approaches.
        const [sx, sz] = siteCenter(bot.site);
        const dist = Math.hypot(sx - body.position.x, sz - body.position.z);
        if (dist > 3.5) {
          if (!bot.path.length || bot.pathIndex >= bot.path.length) {
            bot.path = map.findPath(body.position.x, body.position.z, sx + range(random, -2, 2), sz + range(random, -2, 2));
            bot.pathIndex = 0;
          }
          moveAlongPath(bot, dt, bot.mover.botSpeed() * 0.8);
        } else {
          // Hold the site, slowly sweeping the lane that leads in from the south.
          faceTarget(bot, dt, sx + Math.sin(time * 0.35) * 8, sz + 14);
          bot.mover.step(dt, 0, 0, 0, true, false);
        }
      }
    }
  }

  function takeDamage(bot, amount) {
    bot.health -= amount;
    if (bot.health <= 0) {
      bot.alive = false;
      bot.health = 0;
      bot.target = null;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      return true;
    }
    // Being shot interrupts a plant or defuse.
    bot.plantProgress = 0;
    bot.defuseProgress = 0;
    if (bot.health < 30 && bot.role === 'defend') {
      bot.noiseAt = null;
      bot.state = 'hold';
    }
    return false;
  }

  return {
    list,
    step,
    reset,
    takeDamage(bot, amount) { return takeDamage(bot, amount); },
    hear(x, z, time) {
      for (const bot of list) {
        if (!bot.alive) continue;
        const p = bot.mover.state.position;
        if (Math.hypot(x - p.x, z - p.z) < HEAR_RANGE) {
          bot.noiseAt = [x, z];
          bot.noiseTime = time;
        }
      }
    },
    aliveCount(team) {
      return list.filter((b) => b.team === team && b.alive).length;
    },
  };
}
