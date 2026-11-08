import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';

// ---------- asset resolver (works inline or from ./assets) ----------
const A = (n) => (window.__ASSETS && window.__ASSETS[n]) || ('assets/' + n);

// ---------- constants ----------
const LANE_W = 3.6;
const ROAD_W = 13.2;
const CAR_W = 2.35;
const MAX_X = ROAD_W / 2 - CAR_W / 2 - 0.1;
const GRAVITY = 26;
const JET_THRUST = 52;
const START_SPEED = 38;
const MAX_SPEED = 132;

// ---------- renderer ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 6000);
camera.position.set(0, 4.7, 10.4);

const FOG_COLOR = new THREE.Color(0x2b3a52);
scene.fog = new THREE.FogExp2(0x7d8fa8, 0.00125);

// ---------- sky ----------
const sunDir = new THREE.Vector3(-0.42, 0.16, -1).normalize();
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {
    top: { value: new THREE.Color(0x0a1830) },
    mid: { value: new THREE.Color(0x3f6a92) },
    hor: { value: new THREE.Color(0xd98a4e) },
    sunDir: { value: sunDir },
    sunCol: { value: new THREE.Color(0xffd7a0) }
  },
  vertexShader: `varying vec3 vW; void main(){ vW = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform vec3 top, mid, hor, sunCol; uniform vec3 sunDir; varying vec3 vW;
    void main(){
      float h = clamp(vW.y*0.5+0.5, 0.0, 1.0);
      float t = pow(clamp(vW.y,0.0,1.0), 0.65);
      vec3 c = mix(hor, mid, smoothstep(0.0, 0.30, t));
      c = mix(c, top, smoothstep(0.22, 0.95, t));
      c = mix(c, hor*0.85, smoothstep(0.06, -0.10, vW.y));
      float d = max(dot(normalize(vW), normalize(sunDir)), 0.0);
      c += sunCol * pow(d, 220.0) * 3.2;
      c += sunCol * pow(d, 8.0) * 0.30;
      c += sunCol * pow(d, 2.0) * 0.06;
      float band = smoothstep(0.02, 0.0, abs(vW.y-0.012));
      c = mix(c, vec3(0.42,0.34,0.30), band*0.35);
      gl_FragColor = vec4(c, 1.0);
    }`
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), skyMat));


// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0x9dc4ff, 0x6b4a35, 0.38);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffcf9a, 2.5);
sun.position.copy(sunDir).multiplyScalar(-120);
sun.position.y = 60;
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 220;
const SH = 17;
sun.shadow.camera.left = -SH; sun.shadow.camera.right = SH;
sun.shadow.camera.top = SH; sun.shadow.camera.bottom = -SH;
sun.shadow.bias = -0.0007;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);
// rim/fill lights for a photographic 3-point look
const fill = new THREE.DirectionalLight(0x9dc0ff, 0.7);
fill.position.set(40, 22, 30);
scene.add(fill);
const tailSpill = new THREE.PointLight(0xff3322, 3, 12, 2);
tailSpill.position.set(0, 0.9, 3.2);
scene.add(tailSpill);
const jetSpill = new THREE.PointLight(0x55ccff, 0, 11, 2);
jetSpill.position.set(0, 0.5, 3.4);
scene.add(jetSpill);

// ---------- texture loader ----------
const texLoader = new THREE.TextureLoader();
function loadTex(file, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const src = A(file);
  const t = texLoader.load(src, (tx) => {
    console.log('TEX_OK', file, tx.image && tx.image.width, tx.image && tx.image.height);
  }, undefined, (e) => console.log('TEX_FAIL', file, String(e && e.message)));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = Math.min(aniso, renderer.capabilities.getMaxAnisotropy());
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- environment map from sky (for realistic car paint) ----------
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
function buildEnv() {
  const envScene = new THREE.Scene();
  const m = skyMat.clone();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), m));
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(120, 32),
    new THREE.MeshBasicMaterial({ color: 0x59402e })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -6;
  envScene.add(ground);
  const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(0.1, 500, rt);
  cubeCam.update(renderer, envScene);
  const env = pmrem.fromCubemap(rt.texture).texture;
  rt.dispose();
  return env;
}
const envMap = buildEnv();
scene.environment = envMap;

// swap in a photographic HDR for real reflections on paint / glass
new RGBELoader().load(A('env.hdr'), (hdrTex) => {
  hdrTex.mapping = THREE.EquirectangularReflectionMapping;
  const pm2 = new THREE.PMREMGenerator(renderer);
  pm2.compileEquirectangularShader();
  const rt = pm2.fromEquirectangular(hdrTex);
  scene.environment = rt.texture;
  hdrTex.dispose();
  pm2.dispose();
  console.log('HDR_OK');
}, undefined, (e) => console.log('HDR_FAIL', String(e && e.message)));

const cloudTex = texLoader.load(A('sky_clouds.jpg'));
cloudTex.colorSpace = THREE.SRGBColorSpace;
cloudTex.wrapS = THREE.MirroredRepeatWrapping;
cloudTex.repeat.set(2, 1);
const cloudDome = new THREE.Mesh(
  new THREE.SphereGeometry(4700, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.48),
  new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.42,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, fog: false })
);
cloudDome.rotation.y = 0.7;
scene.add(cloudDome);

// ---------- ground + road ----------
const groundTex = loadTex('ground_new.jpg', { repeat: [220, 660] });
const groundNorm = loadTex('ground_new_norm.jpg', { repeat: [220, 660], srgb: false });
const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, normalMap: groundNorm, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.94, metalness: 0.0, color: 0xc09a76 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 4200), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, -0.03, -1800);
ground.receiveShadow = true;
scene.add(ground);

const asphaltTex = loadTex('asphalt_new.jpg', { repeat: [6, 760] });
const asphaltRough = loadTex('asphalt_new.jpg', { repeat: [6, 760], srgb: false });
const asphaltNorm = loadTex('asphalt_new_norm.jpg', { repeat: [6, 760], srgb: false });
const roadMat = new THREE.MeshStandardMaterial({
  map: asphaltTex, roughnessMap: asphaltRough, normalMap: asphaltNorm, normalScale: new THREE.Vector2(1.05, 1.05), roughness: 0.56, metalness: 0.08, color: 0xb0b0b0
});
const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 4200), roadMat);
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0, -1800);
road.receiveShadow = true;
scene.add(road);

// shoulders
const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4c, roughness: 0.9, metalness: 0.05 });
for (const s of [-1, 1]) {
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 4200), shoulderMat);
  sh.rotation.x = -Math.PI / 2;
  sh.position.set(s * (ROAD_W / 2 + 0.75), 0.005, -1800);
  sh.receiveShadow = true;
  scene.add(sh);
}

// lane dashes (instanced)
const dashGeo = new THREE.BoxGeometry(0.16, 0.02, 3.2);
const dashMat = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.55, emissive: 0x1a1a18, metalness: 0.0 });
const DASH_COUNT = 220;
const dashes = new THREE.InstancedMesh(dashGeo, dashMat, DASH_COUNT * 2);
dashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(dashes);
const dashState = [];
for (let i = 0; i < DASH_COUNT * 2; i++) {
  dashState.push({ z: 20 - (i % DASH_COUNT) * 12, x: i < DASH_COUNT ? -LANE_W / 2 : LANE_W / 2 });
}

// guardrails
const postRows = [];
const railMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, roughness: 0.35, metalness: 0.9, envMap });
for (const s of [-1, 1]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 4200), railMat);
  rail.position.set(s * (ROAD_W / 2 + 1.6), 0.72, -1800);
  rail.castShadow = true;
  scene.add(rail);
  const postGeo = new THREE.BoxGeometry(0.14, 0.9, 0.14);
  const posts = new THREE.InstancedMesh(postGeo, railMat, 120);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 120; i++) {
    m4.makeTranslation(s * (ROAD_W / 2 + 1.6), 0.45, 20 - i * 16);
    posts.setMatrixAt(i, m4);
  }
  posts.castShadow = true;
  posts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  posts.userData.side = s;
  postRows.push(posts); // eslint-disable-line
  scene.add(posts);
}

// ---------- distant skyline ring ----------
const cliffTex = texLoader.load(A('cliffs.png'));
cliffTex.colorSpace = THREE.SRGBColorSpace;
cliffTex.wrapS = THREE.MirroredRepeatWrapping;
cliffTex.repeat.set(3, 1);
const cliffRing = new THREE.Mesh(
  new THREE.CylinderGeometry(760, 760, 190, 72, 1, true),
  new THREE.MeshBasicMaterial({ map: cliffTex, transparent: true, depthWrite: false, fog: false,
    color: 0xb4b8bd, side: THREE.BackSide, opacity: 0.98 })
);
cliffRing.position.set(0, 66, -420);
scene.add(cliffRing);

const skylineTex = texLoader.load(A('skyline.png'));
skylineTex.colorSpace = THREE.SRGBColorSpace;
skylineTex.wrapS = THREE.MirroredRepeatWrapping;
skylineTex.repeat.set(4, 1);
const skylineMat = new THREE.MeshBasicMaterial({
  map: skylineTex, transparent: true, depthWrite: false, fog: false,
  color: 0x8fa6c4, opacity: 0.95
});
const skylineGeo = new THREE.CylinderGeometry(1900, 1900, 210, 96, 1, true);
const skyline = new THREE.Mesh(skylineGeo, skylineMat);
skyline.position.set(0, 84, -600);
skylineMat.side = THREE.BackSide;
scene.add(skyline);

// ---------- car builder ----------
function buildCar() {
  const car = new THREE.Group();
  const HW = 0.95;            // half width
  const AXLE_F = 1.72, AXLE_R = -1.78, WHEEL_R = 0.58, ARCH_R = 0.74;

  // ---------- body: Cybertruck-style wedge, front points to -Z ----------
  const shape = new THREE.Shape();
  shape.moveTo(2.86, 0.50);
  shape.lineTo(2.86, 0.94);     // front face
  shape.lineTo(1.98, 1.10);     // hood
  shape.lineTo(0.92, 1.98);     // A pillar -> roof
  shape.lineTo(-0.40, 2.04);    // roof
  shape.lineTo(-1.66, 1.44);    // rear glass slope
  shape.lineTo(-2.86, 1.06);    // tailgate top
  shape.lineTo(-2.86, 0.50);    // tailgate bottom
  shape.lineTo(-2.44, 0.50);
  shape.absarc(AXLE_R, 0.50, ARCH_R, Math.PI, 0, true);   // rear arch
  shape.lineTo(AXLE_F - ARCH_R, 0.50);
  shape.absarc(AXLE_F, 0.50, ARCH_R, Math.PI, 0, true);   // front arch
  shape.lineTo(2.86, 0.50);

  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: HW * 2 - 0.08, bevelEnabled: true, bevelThickness: 0.08,
    bevelSize: 0.08, bevelSegments: 4, steps: 1
  });
  bodyGeo.translate(0, 0, -(HW * 2 - 0.08) / 2);
  bodyGeo.rotateY(Math.PI / 2);          // shape X -> -Z, extrusion -> X

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: 0xc4ccd4, metalness: 0.96, roughness: 0.19, envMap,
    envMapIntensity: 1.45, clearcoat: 1.0, clearcoatRoughness: 0.04
  });
  const body = new THREE.Mesh(bodyGeo, paintMat);
  body.castShadow = true; body.receiveShadow = true;
  car.add(body);

  // lower cladding / skirt
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.62, metalness: 0.35, envMap });
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 - 0.12, 0.24, 4.0), darkMat);
  skirt.position.set(0, 0.46, 0);
  skirt.castShadow = true;
  car.add(skirt);

  // ---------- glass ----------
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a1017, metalness: 0.9, roughness: 0.05, envMap,
    envMapIntensity: 1.5, clearcoat: 1.0, clearcoatRoughness: 0.02
  });
  const gShape = new THREE.Shape();
  gShape.moveTo(0.90, 1.10);
  gShape.lineTo(0.80, 1.90);
  gShape.lineTo(-0.34, 1.96);
  gShape.lineTo(-1.54, 1.38);
  gShape.lineTo(-1.44, 1.12);
  gShape.lineTo(0.90, 1.02);
  const gGeo = new THREE.ExtrudeGeometry(gShape, { depth: HW * 2 + 0.005, bevelEnabled: false });
  gGeo.translate(0, 0, -(HW * 2 + 0.005) / 2);
  gGeo.rotateY(Math.PI / 2);
  const glass = new THREE.Mesh(gGeo, glassMat);
  car.add(glass);

  // windscreen (front slab between hood and roof)
  const shield = new THREE.Mesh(new THREE.BoxGeometry(HW * 1.86, 0.04, 1.42), glassMat);
  shield.position.set(0, 1.50, -1.02);
  shield.rotation.x = -0.86;
  car.add(shield);

  for (const zz of [AXLE_F, AXLE_R]) {
    for (const xx of [-1, 1]) {
      const arch = new THREE.Mesh(new THREE.CylinderGeometry(ARCH_R + 0.02, ARCH_R + 0.02, 0.10, 20, 1, true, 0, Math.PI), darkMat);
      arch.rotation.z = Math.PI / 2;
      arch.rotation.y = Math.PI / 2;
      arch.position.set(xx * (HW - 0.04), 0.50, zz);
      car.add(arch);
    }
  }

  // rear glass on the sloping tailgate
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(HW * 1.80, 0.03, 1.30), glassMat);
  rearGlass.position.set(0, 1.72, 1.06);
  rearGlass.rotation.x = -0.445;
  car.add(rearGlass);

  // ---------- wheels ----------
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.95, metalness: 0.02 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x8f979f, roughness: 0.24, metalness: 1.0, envMap });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.45, metalness: 0.8 });
  const tireGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.36, 32);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.375, 24);
  rimGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const zz of [AXLE_F, AXLE_R]) {
    for (const xx of [-1, 1]) {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.position.set(xx * (HW - 0.02), WHEEL_R, zz);
      tire.castShadow = true;
      car.add(tire);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.copy(tire.position);
      car.add(rim);
      for (let i = 0; i < 6; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.09), hubMat);
        spoke.position.copy(tire.position);
        spoke.position.x += xx * 0.21;
        spoke.rotation.x = (i / 6) * Math.PI;
        car.add(spoke);
      }
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.40, 12), hubMat);
      cap.rotation.z = Math.PI / 2;
      cap.position.copy(tire.position);
      car.add(cap);
      wheels.push(tire);
    }
  }

  // ---------- light bars ----------
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdce9ff, emissiveIntensity: 3.2 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(HW * 1.72, 0.075, 0.05), headMat);
  head.position.set(0, 0.84, -2.88);
  car.add(head);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2b2b, emissive: 0xff1a1a, emissiveIntensity: 1.5 });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(HW * 1.62, 0.085, 0.05), tailMat);
  tail.position.set(0, 1.02, 2.88);
  car.add(tail);

  // ---------- mirrors / seams / sensors ----------
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x2b3037, roughness: 0.5, metalness: 0.7, envMap });
  for (const xx of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.05), seamMat);
    stalk.position.set(xx * (HW + 0.06), 1.12, -0.66);
    car.add(stalk);
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.15, 0.24), paintMat);
    mir.position.set(xx * (HW + 0.15), 1.14, -0.66);
    mir.castShadow = true;
    car.add(mir);
    const crease = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 4.1), seamMat);
    crease.position.set(xx * (HW - 0.005), 0.92, 0);
    car.add(crease);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.60, 0.015), seamMat);
    door.position.set(xx * (HW - 0.005), 0.76, 0.16);
    car.add(door);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.24), seamMat);
    handle.position.set(xx * (HW + 0.005), 1.02, -0.10);
    car.add(handle);
  }
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.105, 0.13, 12), seamMat);
  pod.position.set(0, 1.95, 0.05);
  car.add(pod);

  // ---------- jet pods ----------
  const podMat = new THREE.MeshStandardMaterial({ color: 0x3b414a, roughness: 0.26, metalness: 1.0, envMap });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x6fe2ff, emissive: 0x39c8ff, emissiveIntensity: 2.2 });
  const flames = [];
  for (const xx of [-0.52, 0, 0.52]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.25, 0.86, 18), podMat);
    p.rotation.x = Math.PI / 2;
    p.position.set(xx, 0.66, 2.42);
    p.castShadow = true;
    car.add(p);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.035, 8, 22), glowMat);
    ring.position.set(xx, 0.66, 2.84);
    car.add(ring);
    const flameGeo = new THREE.ConeGeometry(0.19, 1.9, 16, 1, true);
    flameGeo.rotateX(Math.PI / 2);
    flameGeo.translate(0, 0, 0.95);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x8fe4ff, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(xx, 0.60, 2.95);
    flame.userData.isFlame = true;
    car.add(flame);
    flames.push(flame);
  }

  car.userData = { wheels, flames, tailMat, headMat, glowMat };
  return car;
}

// soft contact shadow under the car
const contactTex = texLoader.load(A('shadow.png'));
contactTex.colorSpace = THREE.SRGBColorSpace;
const contactShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(6.6, 9.4),
  new THREE.MeshBasicMaterial({ color: 0x0a0c10, map: contactTex, transparent: true, depthWrite: false, opacity: 0.55 })
);
contactShadow.rotation.x = -Math.PI / 2;
contactShadow.position.y = 0.02;
scene.add(contactShadow);

const jetGlowMats = [];
const car = buildCar();

// ---- Blender-built car model ----
new GLTFLoader().load(A('car.glb'), (g) => {
  const model = g.scene;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mt = o.material;
    if (!mt) return;
    if (mt.name === 'CarPaint') { mt.metalness = 1.0; mt.roughness = 0.14; mt.envMapIntensity = 0.55; mt.clearcoat = 0.85; mt.clearcoatRoughness = 0.035; }
    else if (mt.name === 'Glass') { mt.metalness = 0.85; mt.roughness = 0.07; mt.envMapIntensity = 0.45; mt.color = new THREE.Color(0x0a0f14); }
    else { mt.envMapIntensity = 0.6; }
    if (mt.emissive && mt.emissive.getHex() !== 0x000000) {
      const n = mt.name || '';
      if (n === 'JetGlow') { jetGlowMats.push(mt); mt.emissiveIntensity = 0.05; }
      else if (n === 'TailLight') mt.emissiveIntensity = 0.9;
      else if (n === 'HeadLight') mt.emissiveIntensity = 1.1;
    }
    mt.needsUpdate = true;
  });
  model.name = 'carModel';
  car.add(model);
  for (const ch of car.children) {
    if (ch.isMesh && !ch.userData.isFlame) ch.visible = false;
  }
  console.log('GLB_OK');
}, undefined, (e) => console.log('GLB_FAIL', String(e && e.message)));


// headlights
const headTargets = [];
for (const xx of [-0.75, 0.75]) {
  const sl = new THREE.SpotLight(0xdfe9ff, 26, 90, 0.42, 0.55, 1.4);
  sl.position.set(xx, 0.85, -2.3);
  sl.target.position.set(xx * 2.2, -1.2, -34);
  car.add(sl); car.add(sl.target);
  headTargets.push(sl);
}
// glow pool on the asphalt in front of the car
const poolCv = document.createElement('canvas');
poolCv.width = 256; poolCv.height = 256;
{
  const g3 = poolCv.getContext('2d');
  const grd = g3.createRadialGradient(128, 190, 6, 128, 190, 130);
  grd.addColorStop(0, 'rgba(190,220,255,0.55)');
  grd.addColorStop(0.5, 'rgba(150,190,255,0.18)');
  grd.addColorStop(1, 'rgba(120,170,255,0)');
  g3.fillStyle = grd; g3.fillRect(0, 0, 256, 256);
}
const poolMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(poolCv), transparent: true,
  depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 });
const lightPool = new THREE.Mesh(new THREE.PlaneGeometry(13, 26), poolMat);
lightPool.rotation.x = -Math.PI / 2;
lightPool.position.set(0, 0.03, -13);
scene.add(lightPool);
car.position.set(0, 0.02, 0);
scene.add(car);

// ---------- shared materials for props ----------
const metalTex = loadTex('metal.jpg', { repeat: [1, 1] });
const propMats = {
  concrete: new THREE.MeshStandardMaterial({ map: metalTex, color: 0xe8e2d6, roughness: 0.72, metalness: 0.18 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xff6a18, roughness: 0.55, metalness: 0.25, emissive: 0xff4000, emissiveIntensity: 0.25 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.32, metalness: 0.95, envMap }),
  darkSteel: new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.5, metalness: 0.8, envMap }),
  cone: new THREE.MeshStandardMaterial({ color: 0xff5a1e, roughness: 0.7 }),
  neon: new THREE.MeshStandardMaterial({ color: 0x22e0ff, emissive: 0x18c8ff, emissiveIntensity: 2.4 }),
  neonMag: new THREE.MeshStandardMaterial({ color: 0xff3fb0, emissive: 0xff2f9c, emissiveIntensity: 2.0 }),
  warn: new THREE.MeshStandardMaterial({ color: 0xffcc22, emissive: 0xffaa00, emissiveIntensity: 1.3 })
};

const gateTex = texLoader.load(A('gate.jpg'));
gateTex.colorSpace = THREE.SRGBColorSpace;
const gateMat = new THREE.MeshBasicMaterial({
  map: gateTex, transparent: true, blending: THREE.AdditiveBlending,
  depthWrite: false, opacity: 0.95
});

// ---------- prop factory ----------
function makeBarrier() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.85, 0.55), propMats.concrete);
  base.position.y = 0.45; base.castShadow = true; base.receiveShadow = true;
  g.add(base);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.22, 0.58), propMats.warn);
  stripe.position.y = 0.70;
  g.add(stripe);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), propMats.warn);
  lamp.position.set(-0.62, 0.92, 0);
  g.add(lamp);
  const lamp2 = lamp.clone(); lamp2.position.x = 0.62; g.add(lamp2);
  g.userData.hit = { hw: 0.98, hd: 0.36, yTop: 0.95, yBot: 0 };
  return g;
}
function makeBarrel() {
  const g = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 16), propMats.orange);
    b.position.set(i === 0 ? -0.45 : 0.45, 0.5, 0);
    b.castShadow = true;
    g.add(b);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.435, 0.435, 0.12, 16), propMats.warn);
    band.position.set(b.position.x, 0.78, 0);
    g.add(band);
  }
  g.userData.hit = { hw: 0.95, hd: 0.45, yTop: 1.0, yBot: 0 };
  return g;
}
function makeContainer() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.6, 5.2), new THREE.MeshStandardMaterial({ color: 0x2f6f9b, roughness: 0.55, metalness: 0.6, envMap }));
  box.position.y = 1.3; box.castShadow = true; box.receiveShadow = true;
  g.add(box);
  const rib = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.12, 5.24), propMats.darkSteel);
  rib.position.y = 2.45;
  g.add(rib);
  g.userData.hit = { hw: 1.27, hd: 2.6, yTop: 2.6, yBot: 0 };
  return g;
}
function makeOverhead() {
  const g = new THREE.Group();
  for (const xx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), propMats.darkSteel);
    leg.position.set(xx * (ROAD_W / 2 - 0.2), 1.1, 0);
    leg.castShadow = true;
    g.add(leg);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W, 0.42, 0.34), propMats.darkSteel);
  bar.position.y = 1.55; bar.castShadow = true;
  g.add(bar);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W - 0.2, 0.08, 0.36), propMats.neonMag);
  glow.position.y = 1.76;
  g.add(glow);
  g.userData.hit = { hw: ROAD_W / 2, hd: 0.25, yTop: 1.82, yBot: 1.3 };
  return g;
}
function makeRamp() {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-2.6, 0); shape.lineTo(2.6, 0); shape.lineTo(2.6, 0.25); shape.lineTo(-2.6, 2.1); shape.lineTo(-2.6, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 3.0, bevelEnabled: false });
  geo.translate(0, 0, -1.5);
  geo.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: metalTex, color: 0x9aa0a8, roughness: 0.35, metalness: 0.9, envMap }));
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  for (const sx of [-1.52, 1.52]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.12, 5.2), propMats.neon);
    rail.position.set(sx, 0.55, 0);
    rail.rotation.x = -0.36;
    g.add(rail);
  }
  for (let i = 0; i < 5; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(3.02, 0.05, 0.28), propMats.warn);
    st.position.set(0, 0.35 + i * 0.38, -2.2 + i * 1.0);
    st.rotation.x = -0.72;
    g.add(st);
  }
  g.userData.hit = { hw: 1.5, hd: 2.6, yTop: 2.15, yBot: 0, ramp: true };
  return g;
}
function makeGate() {
  const g = new THREE.Group();
  for (const xx of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.4, 12), propMats.steel);
    col.position.set(xx * 4.2, 1.7, 0); col.castShadow = true;
    g.add(col);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 6, 16), propMats.neon);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(xx * 4.2, 3.3, 0);
    g.add(ring);
  }
  const planeMat = new THREE.MeshBasicMaterial({ map: gateTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.72, side: THREE.DoubleSide });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 3.4), planeMat);
  plane.position.y = 1.85;
  g.add(plane);
  g.userData.hit = { hw: 4.2, hd: 0.4, yTop: 3.6, yBot: 0, gate: true };
  g.userData.animate = (t) => { planeMat.opacity = 0.55 + 0.4 * Math.sin(t * 6); };
  return g;
}
function makeAirRing() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 10, 40), propMats.neon);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 3.9;
  g.add(ring);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(2.12, 0.06, 8, 32), propMats.neonMag);
  inner.rotation.x = Math.PI / 2;
  inner.position.y = 3.9;
  g.add(inner);
  g.userData.hit = { hw: 2.4, hd: 0.5, yTop: 6.2, yBot: 1.6, airring: true };
  g.userData.animate = (t) => { ring.rotation.z = t * 0.9; inner.rotation.z = -t * 1.4; };
  return g;
}


// ---------- roadside: light poles ----------
const poleMat = new THREE.MeshStandardMaterial({ color: 0x5c646d, roughness: 0.45, metalness: 0.85, envMap });
const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd79a, emissiveIntensity: 3.2 });
const POLE_N = 34;
const poleGeo = new THREE.CylinderGeometry(0.08, 0.11, 7.2, 8);
const armGeo = new THREE.BoxGeometry(1.5, 0.09, 0.09);
const lampGeo2 = new THREE.BoxGeometry(0.75, 0.14, 0.3);
const poles = new THREE.InstancedMesh(poleGeo, poleMat, POLE_N);
const arms = new THREE.InstancedMesh(armGeo, poleMat, POLE_N);
const lamps = new THREE.InstancedMesh(lampGeo2, lampMat, POLE_N);
poles.castShadow = true; arms.castShadow = true;
for (const im of [poles, arms, lamps]) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); }
const poleZs = Array.from({ length: POLE_N }, (_, i) => 10 - i * 46);
const poleSides = Array.from({ length: POLE_N }, (_, i) => (i % 2 === 0 ? -1 : 1));

// ---------- pooling / spawning ----------
const FACTORY = { barrier: makeBarrier, barrel: makeBarrel, container: makeContainer, overhead: makeOverhead, ramp: makeRamp, gate: makeGate, airring: makeAirRing };
const pool = {}; for (const k in FACTORY) pool[k] = [];
const active = [];
function take(type) {
  let p = pool[type].pop();
  if (!p) { p = FACTORY[type](); p.visible = false; scene.add(p); }
  p.visible = true;
  p.userData.type = type;
  return p;
}
function release(p) { p.visible = false; pool[p.userData.type].push(p); }

let nextZ = -70;
function spawn() {
  const diff = Math.min(1, state.distance / 2600);
  const r = Math.random();
  let type;
  if (r < 0.14) type = 'barrel';
  else if (r < 0.30) type = 'barrier';
  else if (r < 0.40) type = 'container';
  else if (r < 0.56) type = 'overhead';
  else if (r < 0.74) type = 'ramp';
  else if (r < 0.90) type = 'gate';
  else type = 'airring';

  const p = take(type);
  const hit = p.userData.hit;
  let x = 0;
  if (type === 'barrier' || type === 'barrel' || type === 'container') {
    const lane = [-1, 0, 1][Math.floor(Math.random() * 3)];
    x = lane * LANE_W;
    if (type === 'container') x = lane * LANE_W * 1.05;
  } else if (type === 'ramp') {
    x = (Math.floor(Math.random() * 3) - 1) * LANE_W * 0.9;
  }
  p.position.set(x, 0, nextZ);
  p.userData.hw = hit.hw; p.userData.hd = hit.hd;
  p.userData.yTop = hit.yTop; p.userData.yBot = hit.yBot;
  p.userData.airring = !!hit.airring;
  p.userData.gate = !!hit.gate;
  p.userData.ramp = !!hit.ramp;
  p.userData.passed = false;
  p.userData.hitDone = false;
  active.push(p);

  const gap = 20 + Math.random() * 26 - diff * 6 + state.speed * 0.075;
  nextZ -= Math.max(14, gap);
}

// ---------- game state ----------
const state = {
  running: false, over: false,
  speed: START_SPEED, targetSpeed: START_SPEED,
  carX: 0, carY: 0, vy: 0,
  energy: 100, maxEnergy: 100,
  distance: 0, score: 0, tricks: 0,
  flying: false, shake: 0, flash: 0, hitFlash: 0,
  best: (() => { try { return Number(localStorage.getItem('tjr_best') || 0); } catch (e) { return 0; } })(),
  time: 0
};
const keys = { left: false, right: false, jet: false };

// ---------- audio ----------
let audio = null;
function initAudio() {
  if (audio) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const master = ctx.createGain(); master.gain.value = 0.0; master.connect(ctx.destination);
  // engine: two detuned saws through lowpass
  const osc1 = ctx.createOscillator(); osc1.type = 'sawtooth';
  const osc2 = ctx.createOscillator(); osc2.type = 'square'; osc2.detune.value = -12;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 6;
  const eg = ctx.createGain(); eg.gain.value = 0.10;
  osc1.connect(lp); osc2.connect(lp); lp.connect(eg); eg.connect(master);
  osc1.start(); osc2.start();
  // wind noise
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
  const ng = ctx.createGain(); ng.gain.value = 0.02;
  noise.connect(bp); bp.connect(ng); ng.connect(master); noise.start();
  // jet hiss
  const noise2 = ctx.createBufferSource(); noise2.buffer = buf; noise2.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
  const jg = ctx.createGain(); jg.gain.value = 0.0;
  noise2.connect(hp); hp.connect(jg); jg.connect(master); noise2.start();
  audio = { ctx, master, osc1, osc2, lp, eg, ng, bp, jg };
}
function updateAudio() {
  if (!audio) return;
  const { ctx, master, osc1, osc2, lp, eg, ng, jg } = audio;
  const t = ctx.currentTime;
  const spd = state.speed / MAX_SPEED;
  master.gain.setTargetAtTime(state.running && !state.over ? 0.55 : 0.0, t, 0.25);
  osc1.frequency.setTargetAtTime(48 + spd * 150, t, 0.08);
  osc2.frequency.setTargetAtTime(48 + spd * 150, t, 0.08);
  lp.frequency.setTargetAtTime(320 + spd * 1400, t, 0.1);
  eg.gain.setTargetAtTime(0.05 + spd * 0.09, t, 0.12);
  ng.gain.setTargetAtTime(0.008 + spd * 0.055, t, 0.15);
  jg.gain.setTargetAtTime(state.flying ? 0.10 : 0.0, t, 0.08);
}
function blip(freq, dur, type = 'sine', vol = 0.18) {
  if (!audio) return;
  const { ctx, master } = audio;
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur + 0.02);
}

// ---------- input ----------
function bindHold(el, key) {
  if (!el) return;
  const on = (e) => { e.preventDefault(); keys[key] = true; };
  const off = (e) => { e.preventDefault(); keys[key] = false; };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
bindHold(document.getElementById('btnLeft'), 'left');
bindHold(document.getElementById('btnRight'), 'right');
bindHold(document.getElementById('btnJet'), 'jet');

addEventListener('keydown', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { keys.jet = true; e.preventDefault(); }
  if (e.code === 'Enter' && (state.over || !state.running)) startGame();
});
addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') keys.jet = false;
});

// ---------- HUD ----------
const elSpeed = document.getElementById('speed');
const elEnergy = document.getElementById('energyFill');
const elScore = document.getElementById('score');
const elDist = document.getElementById('dist');
const elSpeedNum = document.getElementById('speedNum');
const elStart = document.getElementById('start');
const elOver = document.getElementById('over');
const elOverStats = document.getElementById('overStats');
const elBest = document.getElementById('best');
if (elBest) elBest.textContent = Math.round(state.best) + ' m';

function startGame() {
  initAudio();
  if (audio && audio.ctx.state === 'suspended') audio.ctx.resume();
  for (const p of active.slice()) { release(p); }
  active.length = 0;
  state.running = true; state.over = false;
  state.speed = START_SPEED; state.targetSpeed = START_SPEED;
  state.carX = 0; state.carY = 0; state.vy = 0;
  state.energy = 100; state.distance = 0; state.score = 0; state.tricks = 0;
  state.shake = 0; state.flash = 0; state.hitFlash = 0;
  nextZ = -70;
  for (let i = 0; i < 18; i++) spawn();
  if (elStart) elStart.classList.add('hide');
  if (elOver) elOver.classList.add('hide');
}
document.getElementById('btnStart')?.addEventListener('click', startGame);
document.getElementById('btnRestart')?.addEventListener('click', startGame);

function gameOver() {
  state.running = false; state.over = true;
  state.best = Math.max(state.best, state.distance);
  try { localStorage.setItem('tjr_best', String(state.best)); } catch (e) {}
  if (elOverStats) {
    elOverStats.innerHTML =
      `<div><span>距离</span><b>${Math.round(state.distance)} m</b></div>` +
      `<div><span>得分</span><b>${Math.round(state.score)}</b></div>` +
      `<div><span>特技</span><b>${state.tricks}</b></div>` +
      `<div><span>最高纪录</span><b>${Math.round(state.best)} m</b></div>`;
  }
  if (elOver) elOver.classList.remove('hide');
}

// ---------- post processing ----------
const LITE = new URLSearchParams(location.search).get('lite') === '1';
if (LITE) renderer.setPixelRatio(1);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ssao = new SSAOPass(scene, camera, innerWidth, innerHeight);
ssao.kernelRadius = 0.55;
ssao.minDistance = 0.0015;
ssao.maxDistance = 0.09;
ssao.output = SSAOPass.OUTPUT.Default;
ssao.enabled = !LITE;
composer.addPass(ssao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.26, 0.5, 1.05);
composer.addPass(bloom);
const gradePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.0 },
    uFlash: { value: 0 },
    uAberr: { value: 0.0016 }
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uFlash, uAberr; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c,c);
      vec2 off = c * uAberr * (E);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float vig = smoothstep(1.05, 0.25, r2 * uVignette * 1.9);
      col *= mix(0.66, 1.0, vig);
      // contrast + saturation
      col = (col - 0.5) * 1.14 + 0.5;
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, 1.16);
      // split tone: warm highlights, cool shadows
      col += vec3(0.030, 0.012, -0.022) * smoothstep(0.5, 1.0, lum);
      col += vec3(-0.018, 0.0, 0.030) * (1.0 - smoothstep(0.0, 0.5, lum));
      col = clamp(col, 0.0, 1.0);
      float g = hash(vUv * 1024.0 + vec2(uTime*57.0, uTime*23.0));
      col += (g - 0.5) * 0.009;
      col = mix(col, vec3(1.0, 0.95, 0.9), uFlash * 0.55);
      gl_FragColor = vec4(col, 1.0);
    }`.replace('(E)', '(0.25 + r2*2.0)')
});
composer.addPass(gradePass);
composer.addPass(new SMAAPass());
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  ssao.setSize(innerWidth, innerHeight);
});

// ---------- instanced scrollers ----------
for (const pm of postRows) {
  pm.userData.zs = Array.from({ length: 120 }, (_, i) => 20 - i * 16);
}
const _m4 = new THREE.Matrix4();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);

// ---------- main loop ----------
let last = performance.now();
let camShake = 0;
let fpsAcc = 0, fpsN = 0, ssaoOn = !LITE, qualityTimer = 0;

function tick(now) {
  const dt = Math.min(0.045, Math.max(0.001, (now - last) / 1000));
  last = now;
  state.time += dt;
  const t = state.time;

  if (state.running) {
    // difficulty & speed
    state.targetSpeed = Math.min(MAX_SPEED, START_SPEED + state.distance * 0.021);
    state.speed += (state.targetSpeed - state.speed) * Math.min(1, dt * 0.9);

    // lateral
    const lateral = 8.6 + state.speed * 0.055;
    let ax = 0;
    if (keys.left) ax -= 1;
    if (keys.right) ax += 1;
    state.carX = THREE.MathUtils.clamp(state.carX + ax * lateral * dt, -MAX_X, MAX_X);

    // jet / gravity
    const wantJet = keys.jet && state.energy > 0;
    if (wantJet) {
      state.vy += JET_THRUST * dt;
      state.energy = Math.max(0, state.energy - 30 * dt);
      state.flying = true;
    } else {
      state.vy -= GRAVITY * dt;
    }
    state.vy = THREE.MathUtils.clamp(state.vy, -26, 22);
    state.carY += state.vy * dt;
    if (state.carY <= 0) {
      state.carY = 0;
      if (state.vy < -3) state.shake = Math.max(state.shake, 0.25);
      state.vy = 0;
      state.flying = false;
      state.energy = Math.min(state.maxEnergy, state.energy + 16 * dt);
    }
    if (state.carY > 12) { state.carY = 12; state.vy = Math.min(state.vy, 0); }

    // distance / score
    state.distance += state.speed * dt;
    state.score += state.speed * dt * 0.6;

    // scroll props
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      p.position.z += state.speed * dt;
      const u = p.userData;
      if (u.animate) u.animate(t);

      const dz = Math.abs(p.position.z);
      const overlapZ = dz < (u.hd + 2.3);
      const overlapX = Math.abs(p.position.x - state.carX) < (u.hw + CAR_W * 0.5);
      const carBot = state.carY + 0.28;
      const carTop = state.carY + 1.85;
      const overlapY = carTop > u.yBot && carBot < u.yTop;

      if (overlapZ && overlapX && overlapY && !u.hitDone) {
        u.hitDone = true;
        if (u.gate) {
          state.speed = Math.min(MAX_SPEED * 1.12, state.speed * 1.20 + 8);
          state.energy = Math.min(state.maxEnergy, state.energy + 45);
          state.score += 120; state.tricks += 1;
          state.flash = Math.min(1, state.flash + 0.5);
          blip(660, 0.18, 'triangle', 0.2); blip(990, 0.22, 'sine', 0.12);
        } else if (u.ramp) {
          state.vy = Math.max(state.vy, state.speed * 0.30 + 9);
          state.carY = Math.max(state.carY, 0.4);
          state.energy = Math.min(state.maxEnergy, state.energy + 12);
          state.score += 90; state.tricks += 1;
          state.shake = Math.max(state.shake, 0.3);
          blip(320, 0.25, 'sawtooth', 0.16);
        } else if (u.airring) {
          state.speed = Math.min(MAX_SPEED * 1.15, state.speed * 1.12 + 6);
          state.energy = Math.min(state.maxEnergy, state.energy + 55);
          state.score += 400; state.tricks += 1;
          state.flash = Math.min(1, state.flash + 0.75);
          blip(880, 0.3, 'sine', 0.22); blip(1320, 0.35, 'triangle', 0.12);
        } else {
          // crash
          state.speed *= 0.62;
          state.shake = Math.max(state.shake, 0.85);
          state.hitFlash = 1;
          state.score = Math.max(0, state.score - 60);
          blip(110, 0.35, 'square', 0.22);
          state.carY = Math.max(state.carY, 0.15);
          state.vy = Math.min(state.vy, -2);
          if (state.speed < 14) { gameOver(); }
        }
      }

      // near miss / fly-over credit
      if (!u.passed && p.position.z > 2.6) {
        u.passed = true;
        if (!u.hitDone && (u.airring || p.position.y === 0 && state.carY > u.yTop + 0.05)) {
          state.tricks += 1; state.score += 40;
        }
      }

      if (p.position.z > 16) {
        release(p);
        active.splice(i, 1);
      }
    }
    while (active.length < 19) spawn();

    // instanced scrollers
    const dMove = state.speed * dt;
    for (let i = 0; i < dashes.count; i++) {
      const d = dashState[i];
      d.z += dMove;
      if (d.z > 22) d.z -= DASH_COUNT * 12;
      _m4.makeTranslation(d.x, 0.012, d.z);
      dashes.setMatrixAt(i, _m4);
    }
    dashes.instanceMatrix.needsUpdate = true;

    for (const pm of postRows) {
      const zs = pm.userData.zs;
      for (let i = 0; i < zs.length; i++) {
        zs[i] += dMove;
        if (zs[i] > 22) zs[i] -= 120 * 16;
        _m4.makeTranslation(pm.userData.side * (ROAD_W / 2 + 1.6), 0.45, zs[i]);
        pm.setMatrixAt(i, _m4);
      }
      pm.instanceMatrix.needsUpdate = true;
    }


    for (let i = 0; i < POLE_N; i++) {
      poleZs[i] += dMove;
      if (poleZs[i] > 24) poleZs[i] -= POLE_N * 46;
      const sd = poleSides[i];
      const px = sd * (ROAD_W / 2 + 2.6);
      _m4.makeTranslation(px, 3.6, poleZs[i]); poles.setMatrixAt(i, _m4);
      _m4.makeTranslation(px - sd * 0.75, 7.05, poleZs[i]); arms.setMatrixAt(i, _m4);
      _m4.makeTranslation(px - sd * 1.45, 7.0, poleZs[i]); lamps.setMatrixAt(i, _m4);
    }
    poles.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;

    // asphalt uv scroll
    asphaltTex.offset.y -= dMove / 5.2;
    asphaltRough.offset.y = asphaltTex.offset.y;
    asphaltNorm.offset.y = asphaltTex.offset.y;
    groundTex.offset.y -= dMove / 8;
    groundNorm.offset.y = groundTex.offset.y;
  }

  // car transform
  const axSide = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
  car.position.x += (state.carX - car.position.x) * Math.min(1, dt * 12);
  car.position.y += (state.carY - car.position.y) * Math.min(1, dt * 18);
  const targetRoll = axSide * -0.10 - state.carX * 0.012;
  const targetYaw = axSide * -0.14;
  const targetPitch = state.flying ? -0.16 - state.vy * 0.004 : 0.015;
  car.rotation.z += (targetRoll - car.rotation.z) * Math.min(1, dt * 8);
  car.rotation.y += (targetYaw - car.rotation.y) * Math.min(1, dt * 8);
  car.rotation.x += (targetPitch - car.rotation.x) * Math.min(1, dt * 6);

  // wheels
  tailSpill.position.set(car.position.x, 0.85 + state.carY, 3.1);
  tailSpill.intensity = 5.5 + Math.sin(t * 9) * 0.8;
  jetSpill.position.set(car.position.x, 0.5 + state.carY, 3.6);
  jetSpill.intensity += ((keys.jet && state.running ? 9 : 0) - jetSpill.intensity) * Math.min(1, dt * 8);
  lightPool.position.x = car.position.x * 0.9;
  lightPool.material.opacity = 0.85 - state.carY * 0.03;

  contactShadow.position.x = car.position.x;
  contactShadow.position.z = car.position.z;
  contactShadow.scale.setScalar(1 + state.carY * 0.07);
  contactShadow.material.opacity = Math.max(0.06, 0.55 - state.carY * 0.05);


  const spin = state.speed * dt * 1.6;
  for (const w of car.userData.wheels) w.rotation.x = (w.rotation.x || 0) + spin;

  // flames
  for (const f of car.userData.flames) {
    const on = keys.jet && state.energy > 0 && state.running;
    const target = on ? 0.95 : 0.0;
    f.material.opacity += (target * (0.75 + Math.random() * 0.25) - f.material.opacity) * Math.min(1, dt * 18);
    const s = on ? 0.95 + Math.random() * 0.35 : 0.35 + Math.sin(t * 20) * 0.05;
    f.scale.set(1, 1, s);
    f.material.color.setHSL(on ? 0.53 : 0.55, 0.9, on ? 0.72 : 0.45);
  }
  car.userData.glowMat.emissiveIntensity = keys.jet ? 5 : 2.2;
  const jetOn = keys.jet && state.energy > 0 && state.running;
  for (const m of jetGlowMats) m.emissiveIntensity += ((jetOn ? 4.0 : 0.10) - m.emissiveIntensity) * Math.min(1, dt * 10);

  // camera
  const camTargetY = 5.05 + state.carY * 0.62;
  const camBack = 10.2 + state.speed * 0.020;
  camShake = Math.max(0, camShake - dt * 2);
  const sh = state.shake + (state.speed / MAX_SPEED) * 0.04;
  camera.position.x += ((state.carX * 0.62) - camera.position.x) * Math.min(1, dt * 5) + (Math.random() - 0.5) * sh * 0.5;
  camera.position.y += (camTargetY - camera.position.y) * Math.min(1, dt * 4) + (Math.random() - 0.5) * sh * 0.4;
  camera.position.z += ((camBack) - camera.position.z) * Math.min(1, dt * 3);
  camera.lookAt(state.carX * 0.7, 1.75 + state.carY * 0.8, -10);
  const targetFov = 58 + (state.speed / MAX_SPEED) * 16 + (state.flying ? 4 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();

  state.shake = Math.max(0, state.shake - dt * 1.6);
  state.flash = Math.max(0, state.flash - dt * 2.2);
  state.hitFlash = Math.max(0, state.hitFlash - dt * 2.6);

  // sun follows
  sun.position.set(car.position.x - 22, 34, -16);
  sun.target.position.set(car.position.x, 0, -8);

  // skyline parallax
  skyline.rotation.y = state.carX * 0.00005;
  skyline.position.z = -600 + (state.distance % 100000) * 0.0;

  gradePass.uniforms.uTime.value = t;
  gradePass.uniforms.uFlash.value = Math.max(state.flash * 0.5, state.hitFlash * 0.7);
  bloom.strength = 0.26 + state.flash * 0.4;

  // hud
  if (elSpeedNum) elSpeedNum.textContent = String(Math.round(state.speed * 3.6));
  if (elSpeed) elSpeed.style.setProperty('--v', (state.speed / MAX_SPEED).toFixed(3));
  if (elEnergy) elEnergy.style.width = state.energy.toFixed(0) + '%';
  if (elScore) elScore.textContent = Math.round(state.score).toLocaleString();
  if (elDist) elDist.textContent = Math.round(state.distance) + ' m';

  // adaptive quality: drop SSAO on weaker devices
  fpsAcc += dt; fpsN++;
  if (fpsN >= 90) {
    const fps = fpsN / fpsAcc;
    if (fps < 40 && ssaoOn) { ssao.enabled = false; ssaoOn = false; renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); }
    fpsAcc = 0; fpsN = 0;
  }

  updateAudio();
  composer.render();
  requestAnimationFrame(tick);
}

requestAnimationFrame((t) => { last = t; tick(t); });
