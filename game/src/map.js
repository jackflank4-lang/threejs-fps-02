// Kiln Yard: a dusk brick-kiln compound, 44 x 36 m, built from boxes. Three lanes run
// north to the two bomb sites: the west lane to Site A (the Kiln), the east lane to Site B
// (the Storehouse), and the open mid yard between them. Every box is a collider for
// movement and a surface a bullet stops on. Waypoints form the graph bots navigate.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// [width, height, depth, x, y, z, material]
const BOXES = [
  // Ground and outer walls.
  [44.4, 0.4, 36.4, 0, -0.2, 0, 'sand'],
  [0.4, 4.6, 36.4, -22.2, 2.3, 0, 'brickDark'],
  [0.4, 4.6, 36.4, 22.2, 2.3, 0, 'brickDark'],
  [44.4, 4.6, 0.4, 0, 2.3, -18.2, 'brickDark'],
  [44.4, 4.6, 0.4, 0, 2.3, 18.2, 'brickDark'],
  // Site A: the Kiln, a walled room in the north-west with one wide door (west lane) and
  // one narrow door (mid). The south wall is split so the west lane walks straight in
  // through a 3 m door at x -19..-16.
  [3.0, 3.4, 0.4, -20.5, 1.7, -7.4, 'brick'],
  [4.4, 3.4, 0.4, -13.8, 1.7, -7.4, 'brick'],
  [0.4, 3.4, 9.2, -11.6, 1.7, -12, 'brick'],
  [4.8, 3.4, 0.4, -19.4, 1.7, -16.4, 'brick'],
  [0.4, 3.4, 4.4, -21.8, 1.7, -14.2, 'brick'],
  [2.2, 1.1, 1.2, -19.2, 0.55, -11.6, 'wood'],
  [1.2, 1.1, 1.2, -14.8, 0.55, -15.2, 'wood'],
  // Site B: the Storehouse, an open-sided shed in the north-east (mirrored door x 16..19).
  [4.4, 3.4, 0.4, 13.8, 1.7, -7.4, 'brick'],
  [3.0, 3.4, 0.4, 20.5, 1.7, -7.4, 'brick'],
  [0.4, 3.4, 9.2, 11.6, 1.7, -12, 'brick'],
  [4.8, 3.4, 0.4, 19.4, 1.7, -16.4, 'brick'],
  [0.4, 3.4, 4.4, 21.8, 1.7, -14.2, 'brick'],
  [3.2, 1.1, 1.2, 17.6, 0.55, -11.4, 'wood'],
  [1.2, 2.2, 1.2, 13.6, 1.1, -15.4, 'steel'],
  // The kiln block: a solid brick mass in the middle of the north wall, splitting the two
  // sites and giving the mid lane its one big sightline break.
  [7.0, 4.2, 3.4, 0, 2.1, -15.6, 'brick'],
  // Mid yard cover: a low wall, two crate stacks and a steel container.
  [6.0, 1.15, 0.8, -4, 0.575, 2, 'brickDark'],
  [1.2, 1.1, 1.2, -8.6, 0.55, -2.4, 'wood'],
  [1.2, 1.1, 1.2, -7.4, 0.55, -2.4, 'wood'],
  [1.2, 1.1, 1.2, -8.0, 1.65, -2.4, 'wood'],
  [1.2, 1.1, 1.2, 8.6, 0.55, -2.4, 'wood'],
  [1.2, 1.1, 1.2, 7.4, 0.55, -2.4, 'wood'],
  [5.6, 2.4, 2.2, 6.4, 1.2, 6.8, 'steel'],
  [2.4, 0.9, 1.2, -12.6, 0.45, 6.4, 'wood'],
  [2.4, 0.9, 1.2, 12.6, 0.45, 6.4, 'wood'],
  // West lane: a pillar and a crate to crouch behind.
  [1.4, 3.0, 1.4, -15.5, 1.5, 1.5, 'brickDark'],
  [1.6, 0.7, 1.6, -18.4, 0.35, -2.8, 'wood'],
  [1.2, 1.1, 1.2, -13.2, 0.55, -5.6, 'wood'],
  // East lane: a low wall and a pillar.
  [1.4, 3.0, 1.4, 15.5, 1.5, 1.5, 'brickDark'],
  [6.0, 1.15, 0.8, 13.5, 0.575, -3.2, 'brickDark'],
  [1.6, 0.7, 1.6, 18.4, 0.35, -2.8, 'wood'],
  // South: spawn cover, low walls so each spawn reads as a courtyard.
  [5.0, 1.15, 0.8, -10, 0.575, 12.6, 'brickDark'],
  [5.0, 1.15, 0.8, 10, 0.575, 12.6, 'brickDark'],
  [1.2, 1.1, 1.2, -3.4, 0.55, 10.8, 'wood'],
  [1.2, 1.1, 1.2, 3.4, 0.55, 10.8, 'wood'],
];

// Waypoint graph: [x, z] nodes. Edges link nodes closer than 11 m whose segment clears
// the walls at chest height; computed once at build time.
const WAYPOINTS = [
  [-19, 15], [-11, 15], [0, 15], [11, 15], [19, 15], // south spawn line
  [-19, 8], [-11, 8], [0, 8], [11, 8], [19, 8],
  [-13, 3], [-7, 0], [0, 0], [7, 0], [13, 3],
  [-18, -5], [-8, -5], [0, -5], [8, -5], [18, -5],
  [-16, -11], [-13, -13], [16, -11], [13, -13], // sites
  [-4, -11], [4, -11], // kiln flanks
];

export const SPAWNS = {
  embers: [
    [-19, 15, 0], [-11, 15, 0], [-3, 15.5, 0], [5, 15.5, 0],
  ],
  wardens: [
    [-19, -15, Math.PI], [-11, -15, Math.PI], [11, -15, Math.PI], [19, -15, Math.PI],
  ],
};

export const SITES = [
  { id: 'A', name: 'Kiln', center: [-16.5, -12.5], radius: 3.2 },
  { id: 'B', name: 'Storehouse', center: [16.5, -12.5], radius: 3.2 },
];

function letterTexture(letter) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a1d26';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#ff7a2f';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 116);
  ctx.fillStyle = '#ff7a2f';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'steel' ? 0.55 : 0.92,
      metalness: name === 'steel' ? 0.35 : 0.02,
    });
  }
  const colliders = [];
  const shootables = [];
  function box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  for (const [w, h, d, x, y, z, material] of BOXES) box(w, h, d, x, y, z, material);

  // The chimney: a tall brick cylinder over the kiln block, the map's landmark.
  const chimney = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.5, 9, 12),
    materials.brick,
  );
  chimney.position.set(0, 4.5, -15.6);
  chimney.castShadow = true;
  group.add(chimney);
  colliders.push(new THREE.Box3().setFromObject(chimney));
  shootables.push(chimney);

  // Barrels: low steel cylinders scattered as small cover.
  const barrelGeometry = new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12);
  for (const [x, z] of [[-6.2, 4.6], [-5.4, 4.6], [10.2, -6.8], [-10.2, -6.8], [3.2, -8.6]]) {
    const barrel = new THREE.Mesh(barrelGeometry, materials.steel);
    barrel.position.set(x, 0.5, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    colliders.push(new THREE.Box3().setFromObject(barrel));
    shootables.push(barrel);
  }

  // Site pylons: glowing posts with a canvas letter sign, so each site reads at a glance.
  const pylons = [];
  for (const site of SITES) {
    const [cx, cz] = site.center;
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 2.6, 0.5),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35, roughness: 0.6 }),
    );
    post.position.set(cx, 1.3, cz);
    post.castShadow = true;
    group.add(post);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1),
      new THREE.MeshBasicMaterial({ map: letterTexture(site.id), transparent: false }),
    );
    sign.position.set(cx, 3.1, cz);
    sign.rotation.y = site.id === 'A' ? Math.PI / 4 : -Math.PI / 4;
    group.add(sign);
    pylons.push({ post, sign, phase: site.id === 'A' ? 0 : 1.6 });
  }

  // Chimney smoke: twelve soft sprites that rise, fade and reset. Pure atmosphere.
  const smokeTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(200, 195, 185, 0.55)');
    gradient.addColorStop(1, 'rgba(200, 195, 185, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  })();
  const smoke = [];
  for (let i = 0; i < 12; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture, transparent: true, opacity: 0.35, depthWrite: false }));
    sprite.position.set(0, 9 + i * 0.7, -15.6);
    sprite.scale.set(2.2 + i * 0.35, 2.2 + i * 0.35, 1);
    scene.add(sprite);
    smoke.push({ sprite, offset: i / 12 });
  }

  // Light: low dusk sun from the west, cool sky fill, warm bounce from the kiln.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a90a8'), new THREE.Color('#3a2c22'), 0.85);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb37a'), 2.4);
  sun.position.set(-26, 18, 14);
  sun.target.position.set(2, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const kilnGlow = new THREE.PointLight(new THREE.Color(PALETTE.ember), 24, 18, 1.8);
  kilnGlow.position.set(0, 2.2, -12.4);
  scene.add(kilnGlow);

  // Waypoint graph: link nodes closer than 11 m when the segment clears walls at 1.2 m.
  const nodes = WAYPOINTS.map(([x, z]) => ({ x, z, neighbors: [] }));
  const probe = new THREE.Box3();
  function segmentBlocked(ax, az, bx, bz) {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      probe.min.set(x - 0.2, 0.4, z - 0.2);
      probe.max.set(x + 0.2, 2.0, z + 0.2);
      for (const collider of colliders) {
        if (collider.min.y > 2.0 || collider.max.y < 0.4) continue;
        if (probe.intersectsBox(collider)) return true;
      }
    }
    return false;
  }
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      if (dist > 11 || segmentBlocked(a.x, a.z, b.x, b.z)) continue;
      a.neighbors.push(j);
      b.neighbors.push(i);
    }
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  // Breadth-first path over the graph, returned as a list of [x, z] points.
  function findPath(fromX, fromZ, toX, toZ) {
    const start = nearestNode(fromX, fromZ);
    const goal = nearestNode(toX, toZ);
    const prev = new Array(nodes.length).fill(-1);
    const queue = [start];
    prev[start] = start;
    while (queue.length) {
      const current = queue.shift();
      if (current === goal) break;
      for (const next of nodes[current].neighbors) {
        if (prev[next] !== -1) continue;
        prev[next] = current;
        queue.push(next);
      }
    }
    if (prev[goal] === -1) return [[toX, toZ]];
    const path = [];
    let node = goal;
    while (node !== start) {
      path.unshift([nodes[node].x, nodes[node].z]);
      node = prev[node];
    }
    path.push([toX, toZ]);
    return path;
  }

  let time = 0;
  return {
    colliders,
    shootables,
    nodes,
    findPath,
    nearestNode,
    step(dt) {
      time += dt;
      for (const pylon of pylons) {
        pylon.post.material.emissiveIntensity = 0.3 + 0.18 * Math.sin(time * 2 + pylon.phase);
      }
      for (const puff of smoke) {
        const t = (time * 0.05 + puff.offset) % 1;
        puff.sprite.position.y = 9 + t * 7;
        puff.sprite.material.opacity = 0.35 * (1 - t);
        const scale = 2.2 + t * 4;
        puff.sprite.scale.set(scale, scale, 1);
      }
    },
  };
}
