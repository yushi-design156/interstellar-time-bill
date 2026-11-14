import * as THREE from 'three';

/* 视觉语言：柔软的宇宙
 *
 * 关键决定：吸积盘不做成几何体，而是在天空着色器里「穿过透镜」再和赤道面求交。
 * 理由：几何体的盘没有偏折，会横着抹过黑洞阴影 —— 那就不像爱因斯坦的洞，像一块脏玻璃。
 * 现在每个像素走三条光线（直射 / 主像 / 次像），谁先打中赤道面就用谁，
 * 于是盘的远侧自己会拱到阴影上方，近侧自然横在阴影前面。没有一个位置是手摆的。
 *
 * 性能：这是逐像素的物理，手机上会烫。所以有两档质量（high / low），
 * 并且运行中掉帧会自动降档 —— 作品可以慢，但不能卡死。
 */

const HOLE = new THREE.Vector3(0, 0, 0);

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */`
precision highp float;

varying vec3 vDir;

uniform vec3  uHoleDir;
uniform vec3  uCam;
uniform float uThetaE;
uniform float uShadow;
uniform float uLens;
uniform float uTime;
uniform float uSpin;
uniform float uTemp;
uniform float uIn;
uniform float uOut;
uniform float uLow;

/* ── 便宜的 2D 值噪声（4 次 hash，比 3D 省一半）── */
float h21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = h21(i), b = h21(i + vec2(1.0, 0.0));
  float c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/* ── 星空：两层格点，越远越暗越小 ── */
vec3 stars(vec3 dir) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float scale = 30.0 + float(i) * 46.0;
    vec3 p  = dir * scale;
    vec3 id = floor(p);
    vec3 f  = fract(p) - 0.5;
    float h = h21(id.xy + id.z * 17.0 + float(i) * 7.7);
    if (h > 0.972) {
      float b = smoothstep(0.17, 0.0, length(f));
      float tw = 0.76 + 0.24 * sin(uTime * 0.7 + h * 91.0);
      vec3 tint = mix(vec3(0.74, 0.85, 1.0), vec3(1.0, 0.88, 0.72), fract(h * 13.0));
      col += b * tw * tint * (0.34 - float(i) * 0.12);
    }
  }
  return col;
}

/* ── 盘面着色：内缘烧白，外缘熄灭，迎面一侧被多普勒压亮 ── */
vec4 diskAt(vec3 P, vec3 viewDir) {
  float rho = length(P.xz);
  float t   = clamp((rho - uIn) / (uOut - uIn), 0.0, 1.0);
  float phi = atan(P.z, P.x);

  float spiral = phi * 3.0 - log(max(rho, 0.001)) * 4.0;
  float fil = n2(vec2(spiral, rho * 1.1));
  fil = fil * 0.6 + n2(vec2(spiral * 2.9, rho * 2.6)) * 0.4;
  /* 沿流向拉长的细丝：像流动的等离子体，不像一张贴图 */
  float streak = 0.55 + 0.45 * sin(phi * 34.0 + n2(vec2(spiral * 0.6, rho * 0.4)) * 6.0);

  float edge = smoothstep(0.0, 0.10, t) * (1.0 - smoothstep(0.60, 1.0, t));

  vec3  velDir = normalize(vec3(-sin(phi), 0.0, cos(phi)));
  float beta = 0.50 + 0.46 * uSpin;
  float mu   = dot(velDir, viewDir);
  float dop  = 1.0 / pow(max(1.0 - beta * mu, 0.08), 2.6);
  dop = clamp(dop, 0.06, 3.4);

  vec3 hot  = vec3(1.00, 0.94, 0.84);
  vec3 mid  = vec3(1.00, 0.58, 0.24);
  vec3 cool = vec3(0.52, 0.12, 0.04);
  float s1 = smoothstep(0.0, 1.0, clamp((1.0 - t - 0.02) / 0.34, 0.0, 1.0));
  vec3 col = mix(cool, mid, s1);
  float w = clamp(pow(1.0 - t, 3.0) * (0.75 + 0.65 * uTemp), 0.0, 1.0);
  col = mix(col, hot, w);
  /* 多普勒：迎面偏暖白，背面压暗偏红 */
  col = mix(col, vec3(1.00, 0.95, 0.86), 0.22 * clamp((dop - 1.0) / 2.4, 0.0, 1.0));
  col = mix(col, vec3(0.78, 0.20, 0.07), 0.45 * clamp((1.0 - dop) / 0.80, 0.0, 1.0));

  float a = edge * (0.26 + 0.74 * pow(clamp(fil, 0.0, 1.0), 1.25) * streak) * 1.05;
  a *= clamp(pow(dop, 1.15), 0.04, 1.0);
  a *= 0.45 + 0.85 * pow(1.0 - t, 1.5);
  a = clamp(a, 0.0, 0.97);

  vec3 outc = col * clamp(pow(dop, 1.05), 0.05, 2.4) * 0.78;
  outc = outc / (1.0 + outc * 0.10);
  return vec4(outc, a);
}

/* 一条方向与赤道面 y=0 求交 */
vec4 diskImage(vec3 dir) {
  if (abs(dir.y) < 1e-4) return vec4(0.0);
  float tt = -uCam.y / dir.y;
  if (tt <= 0.0) return vec4(0.0);
  vec3 P = uCam + dir * tt;
  float rho = length(P.xz);
  if (rho < uIn || rho > uOut) return vec4(0.0);
  return diskAt(P, normalize(dir));
}

void main() {
  vec3 d = normalize(vDir);
  vec3 h = normalize(uHoleDir);

  float ct = clamp(dot(d, h), -1.0, 1.0);
  float th = acos(ct);
  vec3  perp = d - ct * h;
  float pl = length(perp);
  perp = pl > 1e-6 ? perp / pl : vec3(0.0, 1.0, 0.0);

  /* 反解点透镜：看到 θ 方向的光，真实来自 b = θ − θ_E²/θ。
     正解会把盘的远侧摊成一个盖住半张脸的壳；反解才让它贴着阴影拱起来。 */
  float safeTh = max(th, 1e-4);
  float b1 = th - uThetaE * uThetaE / safeTh;             // 主像：同侧
  float b2 = -(th + uThetaE * uThetaE / safeTh);          // 次像：异侧

  vec3 d1 = h * cos(b1) + perp * sin(b1);
  vec3 d2 = h * cos(b2) + perp * sin(b2);

  /* ── 背景星光（同样走反解，爱因斯坦环才会自然出现）── */
  vec3 skyBent = max(stars(d1), stars(d2) * 0.55);
  vec3 sky = mix(stars(d), skyBent, uLens);

  /* 星云底噪：低功耗档只要一层 */
  vec2 np = vec2(atan(d.z, d.x) * 1.1, d.y * 2.6);
  float neb = n2(np * 2.2 + uTime * 0.01);
  if (uLow < 0.5) neb = neb * 0.6 + n2(np * 5.1 - uTime * 0.006) * 0.4;
  vec3 nebCol = mix(vec3(0.055, 0.045, 0.10), vec3(0.05, 0.07, 0.10), neb);
  sky += nebCol * pow(neb, 2.6) * 0.9;

  /* 阴影：只挡背后的星光。盘在它前面，不被挡。 */
  sky *= smoothstep(uShadow * 0.90, uShadow * 1.12, th);

  /* 光子环：整张图最锐的一条线 */
  float ringw = 0.0022 + uThetaE * 0.035;
  float ring = exp(-pow((th - uThetaE) / ringw, 2.0));
  sky += ring * 0.34 * uLens * vec3(1.0, 0.90, 0.76);

  /* ── 盘的三次求交：直射（近侧）、主像（远侧拱起）、次像（绕后）── */
  vec4 i0 = diskImage(d);
  vec4 i1 = diskImage(d1);
  vec4 i2 = diskImage(d2);
  i2.a *= 0.55;

  vec3 dCol = i2.rgb; float dA = i2.a;
  dCol = dCol * (1.0 - i1.a) + i1.rgb * i1.a; dA = dA + i1.a * (1.0 - dA);
  dCol = dCol * (1.0 - i0.a) + i0.rgb * i0.a; dA = dA + i0.a * (1.0 - dA);

  vec3 col = sky * (1.0 - dA) + dCol;

  /* 自定义 ShaderMaterial 不走 three 的色彩管理，这里自己转到显示空间 */
  gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}`;
const RING_VERT = /* glsl */`
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const RING_FRAG = /* glsl */`
precision highp float;
varying vec2 vP;
uniform float uTime;
uniform float uSpin;
void main() {
  /* RingGeometry 的 uv 是径向 0..1，不是圆盘坐标 —— 用顶点位置算半径和角度 */
  float rad = length(vP);
  float ang = atan(vP.y, vP.x);
  float band = exp(-pow((rad - 0.945) / 0.030, 2.0));
  float asym = 0.76 + 0.24 * cos(ang + 1.2);
  float flick = 0.96 + 0.04 * sin(uTime * 1.3 + ang * 3.0);
  vec3 col = mix(vec3(1.0, 0.82, 0.58), vec3(1.0, 0.97, 0.92), 0.35 + 0.5 * uSpin);
  gl_FragColor = vec4(col, band * asym * flick * 0.50);
}`;

export class Cosmos {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const qs = new URLSearchParams(location.search);
    this.quality = qs.get('q') === 'low' ? 'low' : 'high';
    // ?still=1：渲几帧就停，给截图/OG 图用（软件渲染下也能抓到画面）
    this.still = qs.has('still');
    this._frames = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality === 'high', alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x07060b, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);

    /* 洞不在正中：文字占左上，黑洞压右下，构图才有斜向的呼吸 */
    this.az = 0.0; this.el = 0.20; this.dist = 11.6;
    this.focus = new THREE.Vector3(-1.9, 1.05, 0);
    this.camera.position.set(0, Math.sin(this.el) * this.dist, Math.cos(this.el) * this.dist);
    this.camera.lookAt(this.focus);

    this.spin = 0.9999;
    this.massLog = 8;
    this.lensOn = true;
    this.photonR = 1.66;
    this._fpsAcc = 0; this._fpsN = 0;

    this._buildSky();
    this._buildRing();
    this._buildPlanet();
    this._bindPointer();
    this._applyQuality();

    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(this.canvas.parentElement);
    }
    requestAnimationFrame(() => this.resize());

    this.loop = this.loop.bind(this);
    this.renderer.setAnimationLoop(this.loop);
  }

  _applyQuality() {
    const low = this.quality === 'low';
    const dpr = low ? 0.62 : Math.min(window.devicePixelRatio || 1, window.innerWidth < 860 ? 1.7 : 2);
    this.renderer.setPixelRatio(dpr);
    if (this.skyMat) this.skyMat.uniforms.uLow.value = low ? 1 : 0;
    this.resize();
  }

  /** 掉帧就降档：作品可以慢，不能卡死 */
  degrade() {
    if (this.quality === 'low') return;
    this.quality = 'low';
    this._applyQuality();
    window.dispatchEvent(new CustomEvent('cosmos:quality', { detail: 'low' }));
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(180, 64, 40);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: {
        uHoleDir: { value: new THREE.Vector3(0, 0, -1) },
        uCam:     { value: new THREE.Vector3() },
        uThetaE:  { value: 0.088 },
        uShadow:  { value: 0.092 },
        uLens:    { value: 1 },
        uTime:    { value: 0 },
        uSpin:    { value: 0.9 },
        uTemp:    { value: 0.8 },
        uIn:      { value: 2.11 },
        uOut:     { value: 3.32 },
        uLow:     { value: 0 },
      },
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  _buildRing() {
    /* 贴着一圈极薄的亮环，给阴影一个清楚的边 */
    const geo = new THREE.RingGeometry(0.9, 1.0, 160, 1);
    this.ringMat = new THREE.ShaderMaterial({
      vertexShader: RING_VERT, fragmentShader: RING_FRAG,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSpin: { value: 0.9 } },
    });
    // 光子环改由天空着色器逐像素画（更锐、且跟透镜同源）；网格版留着会重影
    this.ring = new THREE.Mesh(geo, this.ringMat);
    this.ring.visible = false;
    this.ring.renderOrder = 2;
    this.scene.add(this.ring);
  }

  _buildPlanet() {
    const g = new THREE.SphereGeometry(0.085, 16, 12);
    this.planetMat = new THREE.MeshBasicMaterial({ color: 0x9fe2ff, transparent: true, opacity: 0.95 });
    this.planet = new THREE.Mesh(g, this.planetMat);
    this.planet.renderOrder = 3;
    this.scene.add(this.planet);

    const o = new THREE.RingGeometry(1, 1.003, 220, 1);
    o.rotateX(-Math.PI / 2);
    this.orbitMat = new THREE.MeshBasicMaterial({
      color: 0x8fd6ff, transparent: true, opacity: 0.17,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.orbit = new THREE.Mesh(o, this.orbitMat);
    this.orbit.renderOrder = 3;
    this.scene.add(this.orbit);
    this.orbR = 4.3;
  }

  _bindPointer() {
    let px = 0, py = 0, active = false;
    this.canvas.addEventListener('pointerdown', (e) => {
      active = true; px = e.clientX; py = e.clientY;
      this.canvas.setPointerCapture?.(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!active) return;
      this.az -= (e.clientX - px) * 0.005;
      this.el = Math.max(-0.55, Math.min(0.80, this.el + (e.clientY - py) * 0.0035));
      px = e.clientX; py = e.clientY;
    });
    const end = () => { active = false; };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('pointerleave', end);
  }

  /** 参数来自物理层，视觉只做映射，不改物理 */
  setState({ spin, massSolar, radiusM, planetColor }) {
    this.spin = spin;
    this.massLog = Math.log10(Math.max(1, massSolar || 1));
    this.planetR = Math.asin(Math.min(1, 1 / Math.max(1.02, radiusM || 2)));

    /* 视觉标尺：1 M = VIS 个视觉单位。光子环 b_ph ≈ 5.2 M。
       阴影、盘内缘、透镜角全部由它派生 —— 不然三者会各说各话。 */
    const VIS = 0.32;
    this.photonR = 5.2 * VIS * (0.94 + 0.10 * Math.min(1, spin));

    const u = this.skyMat.uniforms;
    u.uSpin.value = spin;
    u.uIn.value = this.photonR * 1.22;
    u.uOut.value = this.photonR * 1.92;
    // 越大的黑洞吸积盘越冷：温度只做视觉分级，不动几何
    u.uTemp.value = Math.max(0.18, Math.min(1, 1.15 - (this.massLog - 1) / 8.2));

    this.ringMat.uniforms.uSpin.value = spin;
    if (planetColor) { this.planetMat.color.setStyle(planetColor); this.orbitMat.color.setStyle(planetColor); }
  }

  setLens(on) { this.lensOn = on; }

  resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.fov = w < 700 ? 56 : 38;
    this.camera.updateProjectionMatrix();
    // 手机上文字在黑洞上方，洞要回中间
    if (this.focus) this.focus.set(w < 760 ? 0.1 : -1.9, w < 760 ? 0.55 : 1.05, 0);
  }

  loop() {
    const dt = this.clock.getDelta();
    const t = this.clock.getElapsedTime();
    const still = this.reduced ? 0 : 1;

    /* 掉帧降档：连续 24 帧平均超过 90ms 就降 */
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsN >= 24) {
      if (this._fpsAcc / this._fpsN > 0.09) this.degrade();
      this._fpsAcc = 0; this._fpsN = 0;
    }

    this.az += 0.00035 * still;

    const d = this.dist;
    this.camera.position.set(
      Math.sin(this.az) * Math.cos(this.el) * d,
      Math.sin(this.el) * d,
      Math.cos(this.az) * Math.cos(this.el) * d
    );
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();

    const u = this.skyMat.uniforms;
    this.sky.position.copy(this.camera.position);   // 星穹跟相机走，方向才是方向
    u.uCam.value.copy(this.camera.position);
    // 透镜中心 = 真正的洞（世界原点）。取景偏移只动相机朝向，不动物理中心。
    u.uHoleDir.value.copy(HOLE).sub(this.camera.position).normalize();
    u.uTime.value = t;
    u.uLens.value = this.lensOn === false ? 0 : 1;

    // 阴影角半径由几何决定：asin(光子环半径 / 距离)。拉近拉远，黑洞跟着变大小。
    const distToHole = this.camera.position.distanceTo(HOLE);
    const ang = Math.asin(Math.min(0.9, this.photonR / Math.max(2, distToHole)));
    u.uShadow.value = ang * 1.05;
    u.uThetaE.value = ang;

    this.ringMat.uniforms.uTime.value = t;
    this.ring.quaternion.copy(this.camera.quaternion);
    this.ring.scale.setScalar(Math.tan(ang) * distToHole * 1.02);
    this.ring.position.copy(HOLE);

    this.orbit.scale.setScalar(this.orbR);
    this.orbit.position.copy(HOLE);
    const pa = t * 0.09 * still;
    this.planet.position.set(Math.cos(pa) * this.orbR, 0.02, Math.sin(pa) * this.orbR);

    this.renderer.render(this.scene, this.camera);

    if (this.still && ++this._frames >= 3) this.renderer.setAnimationLoop(null);
  }

  /** 轨道半径（M）→ 视觉环半径 */
  setOrbit(radiusM) {
    const t = Math.min(1, Math.log10(Math.max(1, radiusM)) / Math.log10(300));
    this.orbR = 3.95 + 1.35 * t;
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }
}
