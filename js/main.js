import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as S from './shaders.js';

// =====================================================================
//  Rendu
// =====================================================================
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
const PR = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.1, 120000);

const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(PR);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.55, 1.15);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass(S.FinalShader);
finalPass.uniforms.uRes.value = [innerWidth * PR, innerHeight * PR];
composer.addPass(finalPass);

const TIME = { value: 0 };
const SUN_I = 2.3;
const SUN_POS = new THREE.Vector3(0, 0, 0);

// =====================================================================
//  Utilitaires
// =====================================================================
const shaderMeshes = [];
function shaderMesh(geo, frag, uniforms = {}, opts = {}) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: S.VERT,
    fragmentShader: frag,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uCamPos: { value: new THREE.Vector3() },
      uTime: TIME,
      uSunI: { value: SUN_I },
      ...uniforms,
    },
    ...opts,
  });
  const m = new THREE.Mesh(geo, mat);
  shaderMeshes.push(m);
  return m;
}

function radialTexture(stops, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW_TEX = radialTexture([[0, 'rgba(255,255,255,1)'], [0.15, 'rgba(255,255,255,0.55)'], [0.4, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);

function glowSprite(r, g, b, scale) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.material.color.setRGB(r, g, b);
  s.scale.setScalar(scale);
  return s;
}

let seed = 1337;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// =====================================================================
//  Ciel, étoiles, environnement
// =====================================================================
const skyMat = new THREE.ShaderMaterial({ vertexShader: S.VERT, fragmentShader: S.SKY_FRAG, uniforms: { uTime: TIME, uSunDir: { value: new THREE.Vector3() }, uCamPos: { value: new THREE.Vector3() } }, side: THREE.BackSide, depthWrite: false });
const sky = new THREE.Mesh(new THREE.SphereGeometry(60000, 64, 32), skyMat);
sky.frustumCulled = false;
sky.renderOrder = -10;
scene.add(sky);

{
  const N = 9000;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
  const temps = [[0.65, 0.78, 1.0], [0.85, 0.9, 1.0], [1, 1, 1], [1, 0.93, 0.78], [1, 0.75, 0.5], [1, 0.6, 0.4]];
  const G = new THREE.Vector3(0.25, 1, 0.35).normalize();
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    // Concentration d'étoiles vers le plan galactique
    do { v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1); } while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
    v.normalize();
    if (rand() < 0.45) { v.addScaledVector(G, -v.dot(G) * 0.85).normalize(); }
    v.multiplyScalar(55000);
    pos.set([v.x, v.y, v.z], i * 3);
    const t = temps[Math.floor(rand() * temps.length)];
    const b = rand() < 0.012 ? 1.5 + rand() * 2.5 : 0.04 + Math.pow(rand(), 5) * 0.7;
    col.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
    size[i] = 1.3 + Math.min(b, 3) * 0.9;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const stars = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: S.STAR_VERT, fragmentShader: S.STAR_FRAG, uniforms: { uPR: { value: PR }, uTime: TIME }, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  sky.add(stars);
}

// Carte d'environnement (réflexions PBR) générée à partir du ciel
{
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), new THREE.ShaderMaterial({ vertexShader: S.VERT, fragmentShader: S.SKY_FRAG, uniforms: { uTime: TIME, uSunDir: { value: new THREE.Vector3() }, uCamPos: { value: new THREE.Vector3() } }, side: THREE.BackSide }));
  envScene.add(envSky);
  const warm = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.6) }));
  warm.position.set(0, 0, -45);
  envScene.add(warm);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  pmrem.dispose();
}

// =====================================================================
//  Soleil
// =====================================================================
const sun = shaderMesh(new THREE.SphereGeometry(1, 96, 64), S.SUN_FRAG);
sun.scale.setScalar(60);
scene.add(sun);
scene.add(glowSprite(3.0, 1.9, 1.0, 420));
scene.add(glowSprite(0.9, 0.45, 0.22, 1200));
scene.add(glowSprite(0.07, 0.05, 0.035, 3200));
const sunLight = new THREE.PointLight(0xfff0dc, 3.2, 0, 0);
scene.add(sunLight);
scene.add(new THREE.HemisphereLight(0x223355, 0x110a06, 0.06));

// =====================================================================
//  Planètes
// =====================================================================
const SPHERE = new THREE.SphereGeometry(1, 192, 128);
const bodies = []; // { root, r, name }

function makePlanet({ name, pos, r, type, seed: sd, atmo = [0.3, 0.55, 1.0], atmoI = 0.6, bump = 0.4, clouds = false, rings = false, tilt = 0.3, spin = 0.01 }) {
  const root = new THREE.Object3D();
  root.position.copy(pos);
  const body = new THREE.Object3D();
  body.scale.setScalar(r);
  body.rotation.z = tilt;
  root.add(body);
  const atmoC = new THREE.Vector3(...atmo);

  const surface = shaderMesh(SPHERE, S.PLANET_FRAG, {
    uType: { value: type }, uSeed: { value: sd }, uAtmo: { value: atmoC }, uAtmoI: { value: atmoI }, uBump: { value: bump },
  });
  body.add(surface);

  let cloud = null;
  if (clouds) {
    cloud = shaderMesh(SPHERE, S.CLOUD_FRAG, { uSeed: { value: sd * 0.7 } }, { transparent: true, depthWrite: false });
    cloud.scale.setScalar(1.012);
    body.add(cloud);
  }
  if (atmoI > 0) {
    const shell = 1.06;
    const atm = shaderMesh(SPHERE, S.ATMO_FRAG, { uAtmo: { value: atmoC }, uInner: { value: 1 / shell }, uStrength: { value: atmoI } }, { side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    atm.scale.setScalar(shell);
    body.add(atm);
  }
  let ringPivot = null;
  if (rings) {
    ringPivot = new THREE.Object3D();
    ringPivot.rotation.x = -Math.PI / 2;
    body.add(ringPivot);
    const ring = shaderMesh(new THREE.RingGeometry(1.3, 2.4, 256, 1), S.RING_FRAG, { uIn: { value: 1.3 }, uOut: { value: 2.4 } }, { transparent: true, depthWrite: false, side: THREE.DoubleSide });
    ringPivot.add(ring);
  }
  scene.add(root);
  const p = { name, root, body, surface, cloud, ringPivot, r, spin };
  bodies.push(p);
  return p;
}

const ignis = makePlanet({ name: 'Ignis', pos: new THREE.Vector3(260, 10, -130), r: 26, type: 1, seed: 3.1, atmo: [1.0, 0.35, 0.1], atmoI: 0.35, bump: 0.6, spin: 0.02 });
const aurea = makePlanet({ name: 'Aurea', pos: new THREE.Vector3(-520, -20, 420), r: 48, type: 0, seed: 7.4, atmo: [0.28, 0.52, 1.0], atmoI: 0.75, bump: 0.35, clouds: true, tilt: 0.41, spin: 0.012 });
const tharsos = makePlanet({ name: 'Tharsos', pos: new THREE.Vector3(1350, 40, 950), r: 130, type: 2, seed: 2.2, atmo: [0.9, 0.75, 0.55], atmoI: 0.45, rings: true, tilt: 0.38, spin: 0.02 });
const nivis = makePlanet({ name: 'Nivis', pos: new THREE.Vector3(-1750, 120, -1300), r: 34, type: 3, seed: 5.5, atmo: [0.6, 0.8, 1.0], atmoI: 0.4, bump: 0.3, spin: 0.008 });

// Lune d'Aurea (en orbite)
const moonPivot = new THREE.Object3D();
aurea.root.add(moonPivot);
const moon = makePlanet({ name: 'Selene', pos: new THREE.Vector3(), r: 11, type: 4, seed: 9.9, atmoI: 0, bump: 0.9, spin: 0.004 });
scene.remove(moon.root);
moon.root.position.set(125, 12, 0);
moonPivot.add(moon.root);

// =====================================================================
//  Ceinture d'astéroïdes (instanciée, PBR)
// =====================================================================
function rockGeometry(k) {
  let g = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const dirs = [];
  for (let i = 0; i < 9; i++) dirs.push([new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize(), 1 + rand() * 4 * (i + 1) * 0.5, rand() * 6.28, 0.22 / (i * 0.6 + 1)]);
  const p = g.attributes.position, v = new THREE.Vector3();
  const sq = new THREE.Vector3(1, 0.6 + rand() * 0.4, 0.7 + rand() * 0.3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let r = 1;
    for (const [d, f, ph, a] of dirs) r += Math.sin(v.dot(d) * f + ph) * a;
    // Cratères
    for (let c = 0; c < 3; c++) { const cd = dirs[c][0]; const dd = v.distanceTo(cd); if (dd < 0.5) r -= (0.5 - dd) * 0.35 * (k % 2 ? 1 : 0.6); }
    v.multiplyScalar(r).multiply(sq);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
const belt = new THREE.Group();
scene.add(belt);
{
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0.05, envMapIntensity: 0.6 });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pp = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
  for (let k = 0; k < 4; k++) {
    const COUNT = 650;
    const inst = new THREE.InstancedMesh(rockGeometry(k), rockMat, COUNT);
    for (let i = 0; i < COUNT; i++) {
      const a = rand() * Math.PI * 2;
      const rad = 940 + (rand() + rand()) * 0.5 * 280;
      pp.set(Math.cos(a) * rad, (rand() + rand() + rand() - 1.5) * 30, Math.sin(a) * rad);
      e.set(rand() * 6.28, rand() * 6.28, rand() * 6.28);
      q.setFromEuler(e);
      s.setScalar(Math.pow(rand(), 4) * 11 + 0.6);
      m.compose(pp, q, s);
      inst.setMatrixAt(i, m);
      const t = rand();
      c.setRGB(0.34 + t * 0.12, 0.3 + t * 0.08, 0.27 + t * 0.04);
      inst.setColorAt(i, c);
    }
    belt.add(inst);
  }
}

// =====================================================================
//  Vaisseau (PBR physique : métal, clearcoat, verre)
// =====================================================================
const ship = new THREE.Object3D();
const shipModel = new THREE.Group();
ship.add(shipModel);
scene.add(ship);
const flames = [];
const navLights = [];
{
  const hull = new THREE.MeshPhysicalMaterial({ color: 0xd9dee5, metalness: 0.9, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 2.2 });
  const dark = new THREE.MeshPhysicalMaterial({ color: 0x2c3138, metalness: 0.85, roughness: 0.4, clearcoat: 0.6, envMapIntensity: 1.6, side: THREE.DoubleSide });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff6a1a, metalness: 0.4, roughness: 0.35, emissive: 0xff4400, emissiveIntensity: 0.15 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a1622, metalness: 0.1, roughness: 0.03, clearcoat: 1, envMapIntensity: 3, emissive: 0x0a2a40, emissiveIntensity: 0.3 });

  const prof = [[0, -2.8], [0.55, -2.6], [0.85, -1.8], [0.95, -0.4], [0.82, 1.2], [0.55, 2.4], [0.2, 3.3], [0, 3.6]].map(([x, y]) => new THREE.Vector2(x, y));
  const fus = new THREE.LatheGeometry(prof, 48);
  fus.rotateX(-Math.PI / 2);
  fus.scale(1, 0.7, 1);
  shipModel.add(new THREE.Mesh(fus, hull));

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), glass);
  cockpit.scale.set(0.5, 0.36, 1.2);
  cockpit.position.set(0, 0.42, -1.2);
  shipModel.add(cockpit);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.5, -1.2); wingShape.lineTo(4.4, 1.6); wingShape.lineTo(4.5, 2.4); wingShape.lineTo(0.5, 2.3); wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 2 });
  wingGeo.rotateX(Math.PI / 2);
  for (const sgn of [1, -1]) {
    const w = new THREE.Mesh(wingGeo, dark);
    w.scale.x = sgn;
    w.position.y = 0.0;
    shipModel.add(w);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.25), accent);
    stripe.position.set(sgn * 3.2, 0.07, 1.6);
    stripe.rotation.y = sgn * -0.6;
    shipModel.add(stripe);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 1.1), dark);
    fin.position.set(sgn * 4.45, 0.35, 2.0);
    shipModel.add(fin);
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: sgn > 0 ? new THREE.Color(0.2, 4, 0.4) : new THREE.Color(4, 0.2, 0.2) }));
    nav.position.set(sgn * 4.5, 0.85, 2.5);
    shipModel.add(nav);
    navLights.push(nav);

    // Réacteur
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 1.8, 32, 1, false), hull);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(sgn * 1.05, -0.05, 2.0);
    shipModel.add(eng);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 12, 32), dark);
    ring.position.set(sgn * 1.05, -0.05, 2.9);
    shipModel.add(ring);
    const nozzle = new THREE.Mesh(new THREE.CircleGeometry(0.32, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.2, 2.2) }));
    nozzle.position.set(sgn * 1.05, -0.05, 2.91);
    shipModel.add(nozzle);

    const fg = new THREE.ConeGeometry(0.3, 3, 24, 1, true);
    fg.translate(0, 1.5, 0);
    const flame = new THREE.Mesh(fg, new THREE.ShaderMaterial({ vertexShader: S.FLAME_VERT, fragmentShader: S.FLAME_FRAG, uniforms: { uPower: { value: 0 }, uTime: TIME }, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    flame.rotation.x = Math.PI / 2;
    flame.position.set(sgn * 1.05, -0.05, 2.95);
    shipModel.add(flame);
    const fglow = glowSprite(0.12, 0.3, 0.7, 2);
    fglow.position.set(sgn * 1.05, -0.05, 3.2);
    shipModel.add(fglow);
    flames.push({ flame, fglow, offset: new THREE.Vector3(sgn * 1.05, -0.05, 3.0) });
  }
  const engLight = new THREE.PointLight(0x55aaff, 0, 18, 2);
  engLight.position.set(0, 0, 4);
  shipModel.add(engLight);
  flames.engLight = engLight;
}
// Lumière d'appoint liée à la caméra (pour lire le vaisseau côté nuit)
const fill = new THREE.DirectionalLight(0x8899bb, 0.18);
camera.add(fill);
fill.position.set(0.3, 1, 0.5);
scene.add(camera);

// =====================================================================
//  Traînée de réacteur + poussière spatiale
// =====================================================================
const TRAIL_N = 700;
const trailPos = new Float32Array(TRAIL_N * 3);
const trailAge = new Float32Array(TRAIL_N).fill(2);
const trailVel = new Float32Array(TRAIL_N * 3);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute('aAge', new THREE.BufferAttribute(trailAge, 1));
const trail = new THREE.Points(trailGeo, new THREE.ShaderMaterial({ vertexShader: S.TRAIL_VERT, fragmentShader: S.TRAIL_FRAG, uniforms: { uScale: { value: 300 } }, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
trail.frustumCulled = false;
scene.add(trail);
let trailHead = 0;

const DUST_N = 1400;
const dustMat = new THREE.ShaderMaterial({ vertexShader: S.DUST_VERT, fragmentShader: S.DUST_FRAG, uniforms: { uCam: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3() }, uI: { value: 0.5 } }, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
{
  const p = new Float32Array(DUST_N * 6), e = new Float32Array(DUST_N * 2);
  for (let i = 0; i < DUST_N; i++) {
    const x = rand() * 240, y = rand() * 240, z = rand() * 240;
    p.set([x, y, z, x, y, z], i * 6);
    e[i * 2] = 0; e[i * 2 + 1] = 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(e, 1));
  const dust = new THREE.LineSegments(g, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);
}

// =====================================================================
//  Signaux à récupérer
// =====================================================================
const beacons = [];
function makeBeacon(name, parent, localPos) {
  const g = new THREE.Group();
  g.position.copy(localPos);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), new THREE.MeshStandardMaterial({ color: 0x332200, emissive: 0xffb84a, emissiveIntensity: 6, metalness: 0.2, roughness: 0.3 }));
  g.add(core);
  const rings = [];
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(3.4 + i * 1.2, 0.07, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.2, 3.5) }));
    g.add(r);
    rings.push(r);
  }
  g.add(glowSprite(2.5, 1.6, 0.6, 26));
  const light = new THREE.PointLight(0xffc070, 30, 60, 2);
  g.add(light);
  parent.add(g);
  const b = { name, g, core, rings, taken: false, el: null };
  const el = document.createElement('div');
  el.className = 'marker';
  el.innerHTML = '<div class="dia"></div><span></span>';
  document.getElementById('hud').appendChild(el);
  b.el = el;
  b.label = el.querySelector('span');
  beacons.push(b);
  return b;
}
scene.updateMatrixWorld(true);
makeBeacon('Orbite d\'Ignis', scene, ignis.root.position.clone().add(new THREE.Vector3(10, 40, 32)));
makeBeacon('Côte d\'Aurea', scene, aurea.root.position.clone().add(new THREE.Vector3(55, 18, -48)));
makeBeacon('Selene', moonPivot, new THREE.Vector3(125, 30, 0));
makeBeacon('Ceinture', scene, new THREE.Vector3(80, 4, -1060));
{
  const p = new THREE.Vector3(1.92, 0, 0);
  tharsos.ringPivot.localToWorld(p);
  makeBeacon('Anneaux de Tharsos', scene, p);
}
makeBeacon('Pôle de Nivis', scene, nivis.root.position.clone().add(new THREE.Vector3(0, -52, 8)));
makeBeacon('Couronne solaire', scene, new THREE.Vector3(0, 115, 20));

// =====================================================================
//  Lens flare (DOM, blend "screen")
// =====================================================================
const flareDefs = [
  [0.0, 260, 'rgba(255,220,180,0.35)'], [0.35, 50, 'rgba(120,200,255,0.25)'], [0.6, 90, 'rgba(255,170,90,0.12)'],
  [0.9, 30, 'rgba(160,255,200,0.25)'], [1.2, 140, 'rgba(90,140,255,0.09)'], [1.5, 60, 'rgba(255,120,200,0.15)'], [1.9, 220, 'rgba(255,200,120,0.06)'],
];
const flareEls = flareDefs.map(([, sz, c]) => {
  const d = document.createElement('div');
  d.className = 'flare';
  d.style.width = d.style.height = sz + 'px';
  d.style.background = `radial-gradient(circle, ${c} 0%, ${c.replace(/[\d.]+\)$/, '0)')} 70%)`;
  document.getElementById('flares').appendChild(d);
  return d;
});

// =====================================================================
//  Entrées
// =====================================================================
const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
const mouse = { x: 0, y: 0 };
addEventListener('mousemove', (e) => { mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = (e.clientY / innerHeight) * 2 - 1; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// =====================================================================
//  Audio (WebAudio procédural)
// =====================================================================
let audio = null;
function initAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(lp).connect(g).connect(ctx.destination); src.start();
  const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 45;
  const olp = ctx.createBiquadFilter(); olp.frequency.value = 160;
  const og = ctx.createGain(); og.gain.value = 0;
  osc.connect(olp).connect(og).connect(ctx.destination); osc.start();
  // Nappe d'ambiance
  const pad = ctx.createGain(); pad.gain.value = 0.025; pad.connect(ctx.destination);
  for (const f of [55, 82.4, 110.3, 164.8]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12; o.connect(pad); o.start(); }
  audio = { ctx, lp, g, osc, og };
}
function updateAudio(thr, boost) {
  if (!audio) return;
  const t = audio.ctx.currentTime;
  audio.g.gain.setTargetAtTime(0.04 + thr * 0.22 + boost * 0.25, t, 0.15);
  audio.lp.frequency.setTargetAtTime(180 + thr * 500 + boost * 1400, t, 0.15);
  audio.osc.frequency.setTargetAtTime(40 + thr * 28 + boost * 30, t, 0.15);
  audio.og.gain.setTargetAtTime(0.015 + thr * 0.04, t, 0.15);
}
function chime() {
  if (!audio) return;
  const { ctx } = audio, t = ctx.currentTime;
  [880, 1318.5, 1760, 2637].forEach((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t + i * 0.08);
    g.gain.linearRampToValueAtTime(0.12, t + i * 0.08 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 1.4);
    o.connect(g).connect(ctx.destination); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 1.5);
  });
}

// =====================================================================
//  État de jeu
// =====================================================================
const MAX_SPEED = 240, BOOST_MUL = 3.6;
const state = { running: false, speed: 0, vel: new THREE.Vector3(), ang: new THREE.Vector3(), energy: 1, boost: 0, collected: 0, t0: 0, elapsed: 0, shake: 0, won: false };

ship.position.set(-400, 25, 590);
ship.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.position, aurea.root.position.clone().add(new THREE.Vector3(60, 0, 0)), new THREE.Vector3(0, 1, 0)));
camera.position.copy(ship.position).add(new THREE.Vector3(0, 3, 12).applyQuaternion(ship.quaternion));
camera.quaternion.copy(ship.quaternion);

const $ = (id) => document.getElementById(id);
const hud = $('hud');
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.style.opacity = 1;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => (t.style.opacity = 0), 2400);
}

$('go').addEventListener('click', () => {
  $('start').classList.add('hidden');
  hud.classList.add('on');
  state.running = true;
  state.t0 = performance.now();
  initAudio();
  toast('7 SIGNAUX À RETROUVER');
});

// =====================================================================
//  Boucle
// =====================================================================
const clock = new THREE.Clock();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
const qTmp = new THREE.Quaternion();
const fwd = new THREE.Vector3();
const camOffset = new THREE.Vector3(0, 2.7, 11.5);
const lookAhead = new THREE.Vector3();
const worldBody = new THREE.Vector3();
let frame = 0;

function updateShip(dt) {
  const k = state.running && !state.won;
  // Accélérateur
  if (k && (keys.KeyW || keys.ArrowUp)) state.speed = Math.min(MAX_SPEED, state.speed + 110 * dt);
  if (k && (keys.KeyS || keys.ArrowDown)) state.speed = Math.max(-30, state.speed - 140 * dt);
  if (k && keys.Space) state.speed *= Math.exp(-3 * dt);
  const wantBoost = k && (keys.ShiftLeft || keys.ShiftRight) && state.energy > 0.02 && state.speed > 5;
  state.boost += ((wantBoost ? 1 : 0) - state.boost) * (1 - Math.exp(-4 * dt));
  state.energy = THREE.MathUtils.clamp(state.energy + (wantBoost ? -0.22 : 0.09) * dt, 0, 1);

  // Rotation (souris + roulis clavier)
  const dz = (x) => (Math.abs(x) < 0.04 ? 0 : (x - Math.sign(x) * 0.04) / 0.96);
  const tgt = v1.set(k ? -dz(mouse.y) * 1.5 : 0, k ? -dz(mouse.x) * 1.3 : 0, k ? ((keys.KeyA || keys.ArrowLeft) ? 1.9 : 0) - ((keys.KeyD || keys.ArrowRight) ? 1.9 : 0) : 0);
  state.ang.lerp(tgt, 1 - Math.exp(-5 * dt));
  ship.rotateX(state.ang.x * dt);
  ship.rotateY(state.ang.y * dt);
  ship.rotateZ(state.ang.z * dt);
  // Inclinaison visuelle
  shipModel.rotation.z += (state.ang.y * 0.45 - shipModel.rotation.z) * (1 - Math.exp(-4 * dt));
  shipModel.rotation.x += (state.ang.x * 0.12 - shipModel.rotation.x) * (1 - Math.exp(-4 * dt));

  // Vitesse avec inertie (léger dérapage)
  fwd.set(0, 0, -1).applyQuaternion(ship.quaternion);
  const target = v2.copy(fwd).multiplyScalar(state.speed * (1 + state.boost * (BOOST_MUL - 1)));
  state.vel.lerp(target, 1 - Math.exp(-1.6 * dt));
  ship.position.addScaledVector(state.vel, dt);

  // Collisions avec planètes / soleil
  const all = [...bodies.map((b) => [b.root.getWorldPosition(worldBody).clone(), b.r]), [SUN_POS, 60]];
  for (const [c, r] of all) {
    const d = ship.position.distanceTo(c);
    const minD = r * 1.03 + 4;
    if (d < minD) {
      const n = v3.copy(ship.position).sub(c).normalize();
      ship.position.copy(c).addScaledVector(n, minD);
      const vn = state.vel.dot(n);
      if (vn < 0) { state.vel.addScaledVector(n, -vn * 1.5); state.speed *= 0.4; state.shake = Math.min(1, state.shake + Math.abs(vn) / 150); }
    }
  }
  // Limite du système
  if (ship.position.length() > 6000) { toast('LIMITE DU SYSTÈME'); state.vel.multiplyScalar(-0.5); ship.position.setLength(5990); }

  // Réacteurs
  const thr = Math.max(0, state.speed / MAX_SPEED);
  const power = 0.15 + thr * 0.85 + state.boost * 1.2;
  for (const f of flames) {
    f.flame.material.uniforms.uPower.value = power;
    f.flame.scale.set(1 + state.boost * 0.3, 0.4 + thr * 1.2 + state.boost * 2.2, 1 + state.boost * 0.3);
    f.fglow.scale.setScalar(1.2 + power * 1.6);
  }
  flames.engLight.intensity = power * 12;
  for (let i = 0; i < navLights.length; i++) navLights[i].visible = Math.sin(TIME.value * 4 + i * 3.14) > 0.6;

  // Particules de traînée
  const emit = Math.floor(2 + power * 4);
  for (const f of flames) {
    for (let e = 0; e < emit; e++) {
      const i = trailHead; trailHead = (trailHead + 1) % TRAIL_N;
      v3.copy(f.offset).applyMatrix4(shipModel.matrixWorld);
      trailPos[i * 3] = v3.x + (Math.random() - 0.5) * 0.3;
      trailPos[i * 3 + 1] = v3.y + (Math.random() - 0.5) * 0.3;
      trailPos[i * 3 + 2] = v3.z + (Math.random() - 0.5) * 0.3;
      v2.copy(fwd).multiplyScalar(-20 - power * 25).add(state.vel);
      trailVel[i * 3] = v2.x; trailVel[i * 3 + 1] = v2.y; trailVel[i * 3 + 2] = v2.z;
      trailAge[i] = Math.random() * 0.1;
    }
  }
  const life = 0.6 + power * 0.25;
  for (let i = 0; i < TRAIL_N; i++) {
    if (trailAge[i] >= 1) continue;
    trailAge[i] += dt / life;
    trailPos[i * 3] += trailVel[i * 3] * dt;
    trailPos[i * 3 + 1] += trailVel[i * 3 + 1] * dt;
    trailPos[i * 3 + 2] += trailVel[i * 3 + 2] * dt;
  }
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.aAge.needsUpdate = true;
  updateAudio(thr, state.boost);
}

function updateCamera(dt) {
  const spd = state.vel.length();
  const off = v1.copy(camOffset);
  off.z += state.boost * 4;
  off.applyQuaternion(ship.quaternion);
  const desired = v2.copy(ship.position).add(off);
  camera.position.lerp(desired, 1 - Math.exp(-7 * dt));
  qTmp.copy(ship.quaternion);
  camera.quaternion.slerp(qTmp, 1 - Math.exp(-6 * dt));
  // Regarder un peu devant le vaisseau
  lookAhead.set(0, 0, -30).applyQuaternion(ship.quaternion).add(ship.position);
  const up = v3.set(0, 1, 0).applyQuaternion(camera.quaternion);
  camera.up.copy(up);
  camera.lookAt(lookAhead);
  if (state.shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * state.shake;
    camera.position.y += (Math.random() - 0.5) * state.shake;
    state.shake *= Math.exp(-4 * dt);
  }
  const targetFov = 64 + Math.min(spd / MAX_SPEED, 1) * 8 + state.boost * 14;
  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-3 * dt));
  camera.updateProjectionMatrix();
  trail.material.uniforms.uScale.value = (innerHeight * PR) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  finalPass.uniforms.uAberr.value = 0.004 + state.boost * 0.03;
  dustMat.uniforms.uCam.value.copy(camera.position);
  dustMat.uniforms.uVel.value.copy(state.vel);
  dustMat.uniforms.uI.value = 0.15 + Math.min(spd / MAX_SPEED, 1) * 0.6 + state.boost * 0.6;
}

function updateWorld(dt) {
  for (const b of bodies) {
    b.surface.rotation.y += b.spin * dt;
    if (b.cloud) b.cloud.rotation.y += b.spin * 1.25 * dt;
  }
  moonPivot.rotation.y += 0.02 * dt;
  belt.rotation.y += 0.0025 * dt;
  sky.position.copy(camera.position);
  scene.updateMatrixWorld();
  for (const m of shaderMeshes) {
    const u = m.material.uniforms;
    m.worldToLocal(u.uCamPos.value.copy(camera.position));
    m.worldToLocal(u.uSunDir.value.copy(SUN_POS)).normalize();
  }
  for (const b of beacons) {
    if (b.taken) continue;
    b.core.rotation.y += dt * 1.5;
    b.rings[0].rotation.x += dt * 0.9;
    b.rings[1].rotation.y += dt * 0.7;
    b.core.scale.setScalar(1 + Math.sin(TIME.value * 3) * 0.12);
  }
}

const hudVec = new THREE.Vector3();
function updateHUD() {
  if (!state.running) return;
  if (!state.won) state.elapsed = (performance.now() - state.t0) / 1000;
  const mm = String(Math.floor(state.elapsed / 60)).padStart(2, '0');
  const ss = String(Math.floor(state.elapsed % 60)).padStart(2, '0');
  $('time').textContent = `${mm}:${ss}`;
  $('speed').textContent = `${Math.round(state.vel.length())} u/s`;
  $('thr').style.width = `${Math.max(0, state.speed / MAX_SPEED) * 100}%`;
  $('nrg').style.width = `${state.energy * 100}%`;
  $('count').textContent = `${state.collected} / ${beacons.length}`;

  const m = $('mouse');
  m.style.left = `${(mouse.x * 0.5 + 0.5) * innerWidth}px`;
  m.style.top = `${(mouse.y * 0.5 + 0.5) * innerHeight}px`;

  let nearest = null, nd = Infinity;
  for (const b of beacons) {
    if (b.taken) { b.el.style.display = 'none'; continue; }
    b.g.getWorldPosition(hudVec);
    const d = hudVec.distanceTo(ship.position);
    if (d < nd) { nd = d; nearest = b; }
    // Collecte
    if (d < 14) {
      b.taken = true;
      b.g.visible = false;
      b.el.style.display = 'none';
      state.collected++;
      state.shake = 0.4;
      chime();
      toast(`SIGNAL RÉCUPÉRÉ · ${b.name.toUpperCase()}`);
      if (state.collected === beacons.length) win();
      continue;
    }
    b.dist = d;
  }
  for (const b of beacons) {
    if (b.taken) continue;
    b.g.getWorldPosition(hudVec);
    const cs = hudVec.clone().applyMatrix4(camera.matrixWorldInverse);
    hudVec.project(camera);
    const on = cs.z < 0 && Math.abs(hudVec.x) < 1 && Math.abs(hudVec.y) < 1;
    b.el.style.display = on ? 'block' : 'none';
    b.el.classList.toggle('near', b === nearest);
    if (on) {
      b.el.style.left = `${(hudVec.x * 0.5 + 0.5) * innerWidth}px`;
      b.el.style.top = `${(-hudVec.y * 0.5 + 0.5) * innerHeight}px`;
      b.label.textContent = `${Math.round(b.dist)} u`;
    }
  }
  const arrow = $('arrow');
  if (nearest) {
    $('target').textContent = nearest.name;
    $('tdist').textContent = `${Math.round(nd)} unités`;
    nearest.g.getWorldPosition(hudVec);
    const cs = hudVec.applyMatrix4(camera.matrixWorldInverse);
    const proj = cs.clone().applyMatrix4(camera.projectionMatrix);
    const onScreen = cs.z < 0 && Math.abs(proj.x / 1) < 1 && Math.abs(proj.y) < 1;
    if (!onScreen) {
      let x = cs.x, y = cs.y;
      if (cs.z > 0 && Math.hypot(x, y) < 1e-3) y = -1;
      const a = Math.atan2(y, x);
      const rx = innerWidth / 2 - 50, ry = innerHeight / 2 - 50;
      arrow.style.display = 'block';
      arrow.style.left = `${innerWidth / 2 + Math.cos(a) * rx - 12}px`;
      arrow.style.top = `${innerHeight / 2 - Math.sin(a) * ry - 11}px`;
      arrow.style.transform = `rotate(${Math.PI / 2 - a}rad)`;
    } else arrow.style.display = 'none';
  } else {
    arrow.style.display = 'none';
    $('target').textContent = '—';
    $('tdist').textContent = '—';
  }
  // Alerte proximité soleil
  const sd = ship.position.length();
  $('warn').textContent = sd < 200 ? '⚠ CHALEUR CRITIQUE · COURONNE SOLAIRE' : '';
  $('warn').style.opacity = sd < 200 ? 1 : 0;
}

function win() {
  state.won = true;
  const mm = Math.floor(state.elapsed / 60), ss = Math.floor(state.elapsed % 60);
  $('wintime').textContent = `Les 7 signaux ont été récupérés en ${mm} min ${String(ss).padStart(2, '0')} s`;
  setTimeout(() => $('win').classList.remove('hidden'), 1800);
}

const rayDir = new THREE.Vector3();
function updateFlares() {
  const cs = v1.copy(SUN_POS).applyMatrix4(camera.matrixWorldInverse);
  const p = v2.copy(SUN_POS).project(camera);
  let vis = cs.z < 0 && Math.abs(p.x) < 1.3 && Math.abs(p.y) < 1.3 ? 1 : 0;
  if (vis) {
    // Occultation par les planètes (test rayon/sphère)
    rayDir.copy(SUN_POS).sub(camera.position);
    const L = rayDir.length();
    rayDir.normalize();
    for (const b of bodies) {
      b.root.getWorldPosition(worldBody);
      const oc = v3.copy(worldBody).sub(camera.position);
      const t = oc.dot(rayDir);
      if (t > 0 && t < L) {
        const d2 = oc.lengthSq() - t * t;
        const rr = b.r * 1.02;
        if (d2 < rr * rr) { vis = 0; break; }
        const ang = Math.sqrt(d2) - rr;
        vis = Math.min(vis, THREE.MathUtils.clamp(ang / (b.r * 0.1), 0, 1));
      }
    }
    vis *= 1 - THREE.MathUtils.smoothstep(Math.hypot(p.x, p.y), 0.8, 1.3);
  }
  const sx = (p.x * 0.5 + 0.5) * innerWidth, sy = (-p.y * 0.5 + 0.5) * innerHeight;
  const cx = innerWidth / 2, cy = innerHeight / 2;
  flareDefs.forEach(([t], i) => {
    const el = flareEls[i];
    el.style.opacity = vis;
    if (vis > 0) {
      el.style.left = `${sx + (cx - sx) * t * 2}px`;
      el.style.top = `${sy + (cy - sy) * t * 2}px`;
    }
  });
}

function loop() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  TIME.value += dt;
  finalPass.uniforms.uTime.value = TIME.value;
  updateShip(dt);
  updateWorld(dt);
  updateCamera(dt);
  updateHUD();
  updateFlares();
  composer.render();
  if (frame++ === 1) $('loading').style.display = 'none';
  requestAnimationFrame(loop);
}
loop();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  finalPass.uniforms.uRes.value = [innerWidth * PR, innerHeight * PR];
});
window.__game = { ship, state, THREE, snap() { updateWorld(0); camera.position.copy(ship.position).add(camOffset.clone().applyQuaternion(ship.quaternion)); camera.quaternion.copy(ship.quaternion); } };
