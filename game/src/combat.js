// One shot path for the player and every bot: a hitscan ray against the world and
// against every body's hitboxes, headshots worth four times a torso hit, armour halving
// what gets through. Tracers and impact sparks come from small preallocated pools, so
// firing never allocates in a hot loop.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const HEAD_MULT = 4;
const LEG_MULT = 0.75;
const ARMOR_ABSORB = 0.5;
const MAX_RANGE = 120;

const _ray = new THREE.Raycaster();
_ray.far = MAX_RANGE;
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _inv = new THREE.Vector3();
const _box = new THREE.Box3();

function rayHitsBox(origin, dir, min, max) {
  // Slab test, allocation-free. Returns the distance along the ray, or Infinity.
  let tmin = 0;
  let tmax = MAX_RANGE;
  const axes = ['x', 'y', 'z'];
  for (const axis of axes) {
    const o = origin[axis];
    const d = dir[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < min[axis] || o > max[axis]) return Infinity;
      continue;
    }
    let t1 = (min[axis] - o) / d;
    let t2 = (max[axis] - o) / d;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export function createCombat(scene, shootables) {
  // Tracers: twelve thin lines, reused in turn.
  const tracerMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
  const tracers = [];
  for (let i = 0; i < 12; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, tracerMaterial.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  // Impact sparks: eight tiny tetrahedra that burst out and fade.
  const sparkMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
  const sparks = [];
  const sparkGeometry = new THREE.TetrahedronGeometry(0.05);
  for (let i = 0; i < 8; i += 1) {
    const mesh = new THREE.Mesh(sparkGeometry, sparkMaterial.clone());
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, velocity: new THREE.Vector3(), life: 0 });
  }
  let sparkIndex = 0;

  function spawnTracer(from, to) {
    const tracer = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % tracers.length;
    const positions = tracer.line.geometry.attributes.position.array;
    positions[0] = from.x; positions[1] = from.y; positions[2] = from.z;
    positions[3] = to.x; positions[4] = to.y; positions[5] = to.z;
    tracer.line.geometry.attributes.position.needsUpdate = true;
    tracer.line.visible = true;
    tracer.line.material.opacity = 0.85;
    tracer.life = 0.07;
  }

  function spawnSpark(point) {
    for (let i = 0; i < 3; i += 1) {
      const spark = sparks[sparkIndex];
      sparkIndex = (sparkIndex + 1) % sparks.length;
      spark.mesh.position.copy(point);
      spark.velocity.set((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
      spark.mesh.visible = true;
      spark.mesh.material.opacity = 1;
      spark.life = 0.25;
    }
  }

  function step(dt) {
    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / 0.07) * 0.85;
      if (tracer.life <= 0) tracer.line.visible = false;
    }
    for (const spark of sparks) {
      if (spark.life <= 0) continue;
      spark.life -= dt;
      spark.mesh.position.addScaledVector(spark.velocity, dt);
      spark.velocity.y -= 12 * dt;
      spark.mesh.material.opacity = Math.max(0, spark.life / 0.25);
      if (spark.life <= 0) spark.mesh.visible = false;
    }
  }

  // origin/direction are Vector3s; def is a weapon row; targets is a list of bodies, each
  // with hitboxes() returning [{min, max, part, owner}] and takeDamage(amount, part).
  // Returns null on a miss, or { owner, part, damage, killed, point }.
  function resolveShot(origin, direction, def, shooter, targets, smokeSpheres) {
    _origin.copy(origin);
    _dir.copy(direction).normalize();
    _ray.set(_origin, _dir);
    _ray.far = MAX_RANGE;
    const worldHits = _ray.intersectObjects(shootables, false);
    const worldDist = worldHits.length ? worldHits[0].distance : MAX_RANGE;
    const worldPoint = worldHits.length ? worldHits[0].point : null;

    let best = null;
    let bestDist = worldDist;
    for (const target of targets) {
      if (target === shooter || !target.alive || target.team === shooter.team) continue;
      const boxes = target.hitboxes();
      for (const hitbox of boxes) {
        const dist = rayHitsBox(_origin, _dir, hitbox.min, hitbox.max);
        if (dist < bestDist) {
          bestDist = dist;
          best = { owner: target, part: hitbox.part };
        }
      }
    }

    const end = new THREE.Vector3().copy(_origin).addScaledVector(_dir, best ? bestDist : worldDist);
    spawnTracer(origin, end);
    if (!best) {
      if (worldPoint) spawnSpark(worldPoint);
      return null;
    }
    const mult = best.part === 'head' ? HEAD_MULT : best.part === 'legs' ? LEG_MULT : 1;
    let damage = def.damage * mult;
    if (best.owner.armor > 0) {
      const absorbed = damage * ARMOR_ABSORB;
      best.owner.armor = Math.max(0, best.owner.armor - absorbed);
      damage -= absorbed;
    }
    const killed = best.owner.takeDamage(damage, best.part);
    return { owner: best.owner, part: best.part, damage, killed, point: end };
  }

  // Line of sight between two points, blocked by world boxes or by a smoke sphere.
  function hasLineOfSight(from, to, smokeSpheres) {
    _origin.copy(from);
    _dir.copy(to).sub(from);
    const dist = _dir.length();
    if (dist < 0.01) return true;
    _dir.divideScalar(dist);
    _ray.set(_origin, _dir);
    _ray.far = dist;
    if (_ray.intersectObjects(shootables, false).length) return false;
    if (smokeSpheres) {
      for (const sphere of smokeSpheres) {
        if (!sphere.active) continue;
        // Segment-sphere test.
        const cx = sphere.x - from.x;
        const cy = sphere.y - from.y;
        const cz = sphere.z - from.z;
        const t = Math.max(0, Math.min(dist, cx * _dir.x + cy * _dir.y + cz * _dir.z));
        const dx = from.x + _dir.x * t - sphere.x;
        const dy = from.y + _dir.y * t - sphere.y;
        const dz = from.z + _dir.z * t - sphere.z;
        if (dx * dx + dy * dy + dz * dz < sphere.radius * sphere.radius) return false;
      }
    }
    return true;
  }

  return { step, resolveShot, hasLineOfSight };
}
