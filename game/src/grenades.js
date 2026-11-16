// Grenades: a frag that bursts after its fuse, a smoke that lays a sphere no line of
// sight crosses, and a flash that blinds whoever is looking at it. Thrown with an arc,
// they bounce off the map's boxes and tick down in the fixed step.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 12;
const THROW_SPEED = 13;
const FRAG_FUSE = 1.2;
const FRAG_RADIUS = 8;
const FRAG_MAX_DAMAGE = 120;
const FRAG_MIN_DAMAGE = 20;
const SMOKE_RADIUS = 3.6;
const SMOKE_SECONDS = 18;
const FLASH_FUSE = 0.8;
const FLASH_RANGE = 26;

const KINDS = {
  frag: { color: '#2a2e36', fuse: FRAG_FUSE },
  smoke: { color: '#7a8a6a', fuse: 0.6 },
  flash: { color: '#e8e4d8', fuse: FLASH_FUSE },
};

export function createGrenades(scene, colliders, audio) {
  const active = [];
  const smokeSpheres = [];
  const sphereGeometry = new THREE.SphereGeometry(0.14, 10, 8);
  const smokeGeometry = new THREE.SphereGeometry(1, 16, 12);
  const smokeMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#b8bcc0'), transparent: true, opacity: 0.32, depthWrite: false });
  const probe = new THREE.Box3();

  function overlapsPoint(x, y, z) {
    probe.min.set(x - 0.14, y - 0.14, z - 0.14);
    probe.max.set(x + 0.14, y + 0.14, z + 0.14);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function throwGrenade(kind, origin, direction) {
    const mesh = new THREE.Mesh(
      sphereGeometry,
      new THREE.MeshStandardMaterial({ color: new THREE.Color(KINDS[kind].color), roughness: 0.6 }),
    );
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    const velocity = direction.clone().multiplyScalar(THROW_SPEED);
    velocity.y += 3.5;
    active.push({ kind, mesh, velocity, fuse: KINDS[kind].fuse, bounced: false });
  }

  function detonate(item, ctx) {
    const pos = item.mesh.position;
    if (item.kind === 'frag') {
      audio.explosion();
      ctx.onExplosion(pos.clone());
      ctx.damageAt(pos, FRAG_RADIUS, FRAG_MAX_DAMAGE, FRAG_MIN_DAMAGE);
      // A short orange flash sphere marks the blast.
      const flash = new THREE.Mesh(
        new THREE.SphereGeometry(1, 12, 8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.7, depthWrite: false }),
      );
      flash.position.copy(pos);
      scene.add(flash);
      ctx.effects.push({ mesh: flash, life: 0.25, grow: 14 });
    } else if (item.kind === 'smoke') {
      const puff = new THREE.Mesh(smokeGeometry, smokeMaterial.clone());
      puff.position.set(pos.x, Math.max(1.2, pos.y), pos.z);
      puff.scale.setScalar(SMOKE_RADIUS);
      scene.add(puff);
      smokeSpheres.push({ x: puff.position.x, y: puff.position.y, z: puff.position.z, radius: SMOKE_RADIUS, mesh: puff, life: SMOKE_SECONDS, active: true });
    } else {
      ctx.onFlash(pos.clone());
      const flash = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 10, 8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff'), transparent: true, opacity: 0.9, depthWrite: false }),
      );
      flash.position.copy(pos);
      scene.add(flash);
      ctx.effects.push({ mesh: flash, life: 0.15, grow: 6 });
    }
    scene.remove(item.mesh);
  }

  function step(dt, ctx) {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const item = active[i];
      item.fuse -= dt;
      item.velocity.y -= GRAVITY * dt;
      const mesh = item.mesh;
      const nx = mesh.position.x + item.velocity.x * dt;
      const ny = mesh.position.y + item.velocity.y * dt;
      const nz = mesh.position.z + item.velocity.z * dt;
      const hit = overlapsPoint(nx, ny, nz);
      if (hit) {
        // Bounce: reflect the velocity on the axis the box blocks most.
        const cx = (hit.min.x + hit.max.x) / 2;
        const cy = (hit.min.y + hit.max.y) / 2;
        const cz = (hit.min.z + hit.max.z) / 2;
        const dx = Math.abs(nx - cx) / ((hit.max.x - hit.min.x) / 2 + 0.14);
        const dy = Math.abs(ny - cy) / ((hit.max.y - hit.min.y) / 2 + 0.14);
        const dz = Math.abs(nz - cz) / ((hit.max.z - hit.min.z) / 2 + 0.14);
        if (dx >= dy && dx >= dz) item.velocity.x *= -0.45;
        else if (dy >= dx && dy >= dz) item.velocity.y *= -0.45;
        else item.velocity.z *= -0.45;
        item.velocity.multiplyScalar(0.8);
        if (!item.bounced) { item.bounced = true; audio.grenadeBounce(); }
      } else {
        mesh.position.set(nx, ny, nz);
      }
      if (mesh.position.y < 0.14) {
        mesh.position.y = 0.14;
        item.velocity.y = Math.abs(item.velocity.y) * 0.45;
        item.velocity.x *= 0.8;
        item.velocity.z *= 0.8;
      }
      if (item.fuse <= 0) {
        detonate(item, ctx);
        active.splice(i, 1);
      }
    }
    for (let i = smokeSpheres.length - 1; i >= 0; i -= 1) {
      const sphere = smokeSpheres[i];
      sphere.life -= dt;
      if (sphere.life <= 0) {
        sphere.active = false;
        scene.remove(sphere.mesh);
        smokeSpheres.splice(i, 1);
      } else if (sphere.life < 3) {
        sphere.mesh.material.opacity = 0.32 * (sphere.life / 3);
      }
    }
  }

  return {
    throwGrenade,
    step,
    smokeSpheres,
    reset() {
      for (const item of active) scene.remove(item.mesh);
      active.length = 0;
      for (const sphere of smokeSpheres) scene.remove(sphere.mesh);
      smokeSpheres.length = 0;
    },
  };
}
