// The 3D city: ground (map + water + rain wetness + river-model overlay), 81k mapped building
// footprints with heights, sky with the real sun for 27 Nov, clouds and rain curtains from the
// illustrative storm, sensor glyphs, knowledge pulses, the forecast outline. three.js, WebGL2.
import * as THREE from 'three';
import { paintGround, extentOf, iconCanvas, cloudCanvas, streakCanvas } from './textures.js';
import { sunPosition, scenarioDate } from './sun.js';
import { rainAt, sampleGrid } from '../kernels/storm.js';
import { PAL } from '../palette.js';

const W2 = (x, y, h = 0) => new THREE.Vector3(x, h, -y);     // local metres (x east, y north) → three
export const RAIN_DOM = { x0: -26000, x1: 16000, y0: -20000, y1: 20000, nx: 128, ny: 128 };

const NOISE = /* glsl */`
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
`;
const SKYFN = /* glsl */`
uniform vec3 uSkyTop, uSkyHor, uSunDir, uSunCol;
vec3 skyColor(vec3 d){ float h = clamp(d.y, -0.2, 1.0); vec3 c = mix(uSkyHor, uSkyTop, pow(max(h,0.0), 0.55));
  float s = max(dot(normalize(d), uSunDir), 0.0); c += uSunCol * (pow(s, 8.0)*0.25 + pow(s, 600.0)*3.0); return c; }
`;

function decodeBuildings(buf) {
  const dv = new DataView(buf), out = [];
  let o = 0;
  while (o < buf.byteLength) {
    const n = dv.getUint8(o), h = dv.getUint8(o + 1), f = dv.getUint8(o + 2); o += 3;
    const xs = new Float32Array(n), ys = new Float32Array(n);
    for (let k = 0; k < n; k++) { xs[k] = dv.getInt16(o, true) / 2; ys[k] = dv.getInt16(o + 2, true) / 2; o += 4; }
    out.push({ n, h, f, xs, ys });
  }
  return out;
}

const PALETTE = [[234, 224, 200], [228, 200, 138], [238, 234, 224], [233, 204, 176], [176, 200, 190], [222, 214, 196], [214, 196, 168]];

function buildingChunks(list, tile = 2200) {
  const chunks = new Map();
  for (let b = 0; b < list.length; b++) {
    const B = list[b]; let cx = 0, cy = 0;
    for (let k = 0; k < B.n; k++) { cx += B.xs[k]; cy += B.ys[k]; }
    cx /= B.n; cy /= B.n;
    const key = Math.floor(cx / tile) + ':' + Math.floor(cy / tile);
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(B);
  }
  const meshes = [];
  for (const [, arr] of chunks) {
    let nv = 0, ni = 0;
    for (const B of arr) { nv += B.n * 2; ni += B.n * 6 + (B.n - 2) * 3; }
    const pos = new Float32Array(nv * 3), col = new Uint8Array(nv * 4), idx = new Uint32Array(ni);
    let v = 0, ii = 0;
    for (const B of arr) {
      const h = B.h;
      const seed = (Math.abs(Math.round(B.xs[0] * 7 + B.ys[0] * 13)) % 997);
      let c = PALETTE[seed % PALETTE.length];
      if (h >= 40) c = [150 + seed % 20, 170 + seed % 18, 190 + seed % 14];
      else if (h >= 18) c = [222 - seed % 18, 216 - seed % 16, 204 - seed % 20];
      const base = v;
      for (let k = 0; k < B.n; k++) {
        pos.set([B.xs[k], 0, -B.ys[k]], v * 3); col.set([c[0], c[1], c[2], 0], v * 4); v++;
        pos.set([B.xs[k], h, -B.ys[k]], v * 3); col.set([c[0], c[1], c[2], 255], v * 4); v++;
      }
      for (let k = 0; k < B.n; k++) {
        const k2 = (k + 1) % B.n, b0 = base + k * 2, b1 = base + k2 * 2;
        idx[ii++] = b0; idx[ii++] = b1; idx[ii++] = b1 + 1;
        idx[ii++] = b0; idx[ii++] = b1 + 1; idx[ii++] = b0 + 1;
      }
      // roof: fan if convex, otherwise ear clipping
      let convex = true, sgn = 0;
      for (let k = 0; k < B.n && convex; k++) {
        const a = k, b = (k + 1) % B.n, d = (k + 2) % B.n;
        const cr = (B.xs[b] - B.xs[a]) * (B.ys[d] - B.ys[b]) - (B.ys[b] - B.ys[a]) * (B.xs[d] - B.xs[b]);
        if (Math.abs(cr) < 1e-6) continue;
        if (!sgn) sgn = Math.sign(cr); else if (Math.sign(cr) !== sgn) convex = false;
      }
      if (convex) {
        for (let k = 1; k < B.n - 1; k++) { idx[ii++] = base + 1; idx[ii++] = base + k * 2 + 1; idx[ii++] = base + (k + 1) * 2 + 1; }
      } else {
        const contour = []; for (let k = 0; k < B.n; k++) contour.push(new THREE.Vector2(B.xs[k], B.ys[k]));
        const faces = THREE.ShapeUtils.triangulateShape(contour, []);
        for (const f of faces) {
          const cr = (B.xs[f[1]] - B.xs[f[0]]) * (B.ys[f[2]] - B.ys[f[0]]) - (B.ys[f[1]] - B.ys[f[0]]) * (B.xs[f[2]] - B.xs[f[0]]);
          const [a, b, d] = cr >= 0 ? f : [f[0], f[2], f[1]];
          idx[ii++] = base + a * 2 + 1; idx[ii++] = base + b * 2 + 1; idx[ii++] = base + d * 2 + 1;
        }
        for (let k = faces.length; k < B.n - 2; k++) { idx[ii++] = base + 1; idx[ii++] = base + 1; idx[ii++] = base + 1; }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
    g.setIndex(new THREE.BufferAttribute(idx.subarray(0, ii), 1));
    g.computeBoundingSphere();
    meshes.push(g);
  }
  return meshes;
}

export function createWorld(canvas, data, opts = {}) {
  const tier = opts.tier || 'mid';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier === 'high' ? 2 : tier === 'mid' ? 1.6 : 1));
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 20, 120000);
  scene.fog = new THREE.Fog(0xcfd6dc, 8000, 40000);

  const { geo, terrain } = data;
  const U = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
    uSkyTop: { value: new THREE.Color() }, uSkyHor: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() },
    uTime: { value: 0 }, uDusk: { value: 0 }, uRise: { value: 1 }, uRiseO: { value: new THREE.Vector2(1128, 1484) },
    uRain: { value: null }, uRainDom: { value: new THREE.Vector4(RAIN_DOM.x0, RAIN_DOM.y0, RAIN_DOM.x1 - RAIN_DOM.x0, RAIN_DOM.y1 - RAIN_DOM.y0) },
    uFlood: { value: null }, uFloodOn: { value: 0 }, uFloodDom: { value: new THREE.Vector4() },
    uSel: { value: new THREE.Vector3(0, 0, -1) }, uCamDist: { value: 10000 }, uGhost: { value: 0 },
  };

  // rain field: R rain now, G wetness, B cloud shade, A forecast (+30 min) — all 0..255
  const rainData = new Uint8Array(RAIN_DOM.nx * RAIN_DOM.ny * 4);
  const rainTex = new THREE.DataTexture(rainData, RAIN_DOM.nx, RAIN_DOM.ny, THREE.RGBAFormat);
  rainTex.magFilter = rainTex.minFilter = THREE.LinearFilter; rainTex.flipY = false; rainTex.needsUpdate = true;
  U.uRain.value = rainTex;

  // ---------- sky ----------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: U,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `${SKYFN} varying vec3 vDir; void main(){ gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  }));
  sky.renderOrder = -10; scene.add(sky);

  // ---------- ground ----------
  const groundMat = (tex, ext, inner) => new THREE.ShaderMaterial({
    uniforms: { ...U, uMap: { value: tex }, uExt: { value: new THREE.Vector4(ext.x0, ext.y0, ext.x1 - ext.x0, ext.y1 - ext.y0) }, uInner: { value: inner ? 1 : 0 }, ...THREE.UniformsLib.fog },
    fog: true,
    polygonOffset: true, polygonOffsetFactor: inner ? -1 : 0, polygonOffsetUnits: inner ? -2 : 0,
    vertexShader: `varying vec3 vWorld; varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0); vWorld = wp.xyz; vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `${NOISE}${SKYFN}
      uniform sampler2D uMap, uRain, uFlood; uniform vec4 uRainDom, uFloodDom, uExt; uniform float uTime, uFloodOn, uInner, uDusk, uGhost; uniform vec3 uAmb, uSel;
      varying vec3 vWorld; varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){
        vec4 m = texture2D(uMap, vUv);
        vec2 xy = vec2(vWorld.x, -vWorld.z);
        vec2 ru = (xy - uRainDom.xy) / uRainDom.zw; vec4 rf = texture2D(uRain, vec2(ru.x, 1.0 - ru.y));
        float wet = clamp(rf.g*1.4, 0.0, 1.0), shade = rf.b;
        float water = 1.0 - m.a;
        vec3 land = m.rgb * (uAmb + uSunCol * max(uSunDir.y, 0.0) * 0.95);
        land *= 1.0 - shade * 0.42;
        vec3 V = normalize(cameraPosition - vWorld);
        // wet streets: darker, a little sky in them
        vec3 wn = normalize(vec3(noise(xy*0.15 + uTime*0.4) - 0.5, 9.0, noise(xy*0.15 + 13.0 - uTime*0.4) - 0.5));
        vec3 R = reflect(-V, wn);
        land = mix(land, land*0.62 + skyColor(R)*0.18, wet);
        // the rivers: silt brown with sky in them, ripples, and the sun's glint
        vec2 q = xy*0.012 + vec2(uTime*0.05, uTime*0.02);
        vec3 n2 = normalize(vec3((noise(q)-0.5)*0.6 + (noise(q*3.1)-0.5)*0.3, 6.0, (noise(q+5.2)-0.5)*0.6 + (noise(q*2.7+1.3)-0.5)*0.3));
        vec3 R2 = reflect(-V, n2);
        float fres = 0.04 + 0.96*pow(1.0 - max(V.y, 0.0), 5.0);
        vec3 silt = vec3(0.17, 0.25, 0.22) * (uAmb*1.5 + uSunCol*0.3);
        vec3 wc = mix(silt, skyColor(R2), clamp(fres*0.85 + 0.12, 0.0, 1.0));
        wc += uSunCol * pow(max(dot(R2, uSunDir), 0.0), 240.0) * 2.5 * (1.0 - shade);
        wc *= 1.0 - shade*0.3;
        vec3 col = mix(land, wc, water);
        // Sky Reach: modelled river water over land
        if (uInner > 0.5 && uFloodOn > 0.0) {
          vec2 fu = (xy - uFloodDom.xy) / uFloodDom.zw; float f = texture2D(uFlood, vec2(fu.x, 1.0 - fu.y)).r;
          vec3 fc = mix(vec3(0.10, 0.45, 0.55), skyColor(R2)*0.6, 0.35) + vec3(0.02,0.08,0.10)*noise(q*4.0);
          col = mix(col, fc, f * uFloodOn * 0.82 * (1.0 - water));
        }
        // forecast for +30 min: a silver dashed outline where heavy rain is expected, a faint fill inside
        float fc = rf.a * 100.0;
        float edgeD = abs(fc - 25.0) / max(fwidth(fc), 0.05);
        float dash = step(0.45, fract((xy.x + xy.y) / 380.0));
        col = mix(col, vec3(0.86, 0.9, 0.95), smoothstep(25.0, 40.0, fc) * 0.10 * uGhost);
        col = mix(col, vec3(0.92, 0.95, 1.0), (1.0 - smoothstep(0.6, 1.8, edgeD)) * dash * 0.95 * uGhost);
        // selection ring on the ground
        if (uSel.z > 0.0) { float d = length(xy - uSel.xy); float ring = smoothstep(uSel.z*0.9, uSel.z, d) * (1.0 - smoothstep(uSel.z, uSel.z*1.12, d)); col = mix(col, vec3(0.96, 0.77, 0.32), ring*0.9); }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });

  const outerExt = extentOf(geo, 'outer'), innerExt = extentOf(geo, 'inner', terrain);
  const big = tier === 'low' ? 2048 : 4096;
  const outerCv = paintGround(tier === 'low' ? 1024 : 2048, tier === 'low' ? 1024 : 2048, outerExt, geo, terrain, false);
  const innerW = big, innerH = Math.round(big * (innerExt.y1 - innerExt.y0) / (innerExt.x1 - innerExt.x0));
  const innerCv = paintGround(innerW, innerH, innerExt, geo, terrain, true);
  const mkTex = cv => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
  const plane = (ext, tex, inner) => {
    const g = new THREE.PlaneGeometry(ext.x1 - ext.x0, ext.y1 - ext.y0);
    g.rotateX(-Math.PI / 2); g.translate((ext.x0 + ext.x1) / 2, 0, -(ext.y0 + ext.y1) / 2);
    const m = new THREE.Mesh(g, groundMat(tex, ext, inner)); m.renderOrder = inner ? -1 : -2; return m;
  };
  const outer = plane(outerExt, mkTex(outerCv), false), inner = plane(innerExt, mkTex(innerCv), true);
  scene.add(outer, inner);
  // a horizon disc so the far edge of the map is not a cliff
  const horizon = new THREE.Mesh(new THREE.RingGeometry(26000, 90000, 64, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xb9b08e, fog: true }));
  horizon.position.set(-5000, -2, 0); scene.add(horizon);

  // Sky Reach overlay texture (DEM grid)
  const tg = terrain.grid;
  const floodData = new Uint8Array(tg.w * tg.h);
  const floodTex = new THREE.DataTexture(floodData, tg.w, tg.h, THREE.RedFormat);
  floodTex.magFilter = floodTex.minFilter = THREE.LinearFilter; floodTex.flipY = false;
  U.uFlood.value = floodTex;
  U.uFloodDom.value.set(innerExt.x0, innerExt.y0, innerExt.x1 - innerExt.x0, innerExt.y1 - innerExt.y0);

  // ---------- buildings ----------
  const bmat = new THREE.ShaderMaterial({
    uniforms: { ...U, ...THREE.UniformsLib.fog }, fog: true, vertexColors: true,
    vertexShader: `uniform float uRise; uniform vec2 uRiseO; varying vec3 vWorld; varying vec4 vCol;
      #include <fog_pars_vertex>
      void main(){ vec3 p = position; float d = length(vec2(p.x, -p.z) - uRiseO);
        float r = clamp(uRise*1.5 - d/14000.0, 0.0, 1.0); r = 1.0 - pow(1.0 - r, 3.0); p.y *= max(r, 0.002);
        vec4 wp = modelMatrix*vec4(p,1.0); vWorld = wp.xyz; vCol = color; vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `${NOISE}${SKYFN}
      uniform sampler2D uRain; uniform vec4 uRainDom; uniform vec3 uAmb; uniform float uDusk; uniform vec3 uSel;
      varying vec3 vWorld; varying vec4 vCol;
      #include <fog_pars_fragment>
      void main(){
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        vec3 base = pow(vCol.rgb, vec3(2.2));
        float roof = step(0.7, abs(n.y));
        vec2 xy = vec2(vWorld.x, -vWorld.z);
        vec2 ru = (xy - uRainDom.xy)/uRainDom.zw; vec4 rf = texture2D(uRain, vec2(ru.x, 1.0 - ru.y));
        float wet = clamp(rf.g*1.4, 0.0, 1.0), shade = rf.b;
        float ndl = max(dot(n, uSunDir), 0.0);
        vec3 col = base * (uAmb * (0.75 + 0.25*n.y) + uSunCol * ndl * 1.05 * (1.0 - shade*0.6));
        float ao = mix(0.5, 1.0, pow(vCol.a, 0.6));
        if (roof > 0.5) {
          float hh = fract(dot(vCol.rgb, vec3(12.9898, 78.233, 37.719)) * 43.7585);
          vec3 tile = vec3(0.55, 0.20, 0.12), conc = base * 0.78 + vec3(0.04);
          vec3 rc = hh < 0.3 ? tile : conc;
          col = rc * (uAmb * 1.0 + uSunCol * max(uSunDir.y, 0.0) * 1.05 * (1.0 - shade*0.6));
        }
        if (roof < 0.5) {
          vec3 t = normalize(vec3(-n.z, 0.0, n.x));
          float u = dot(vWorld, t);
          vec2 cell = vec2(fract(u/3.4), fract(vWorld.y/3.3));
          float win = step(0.2, cell.x)*step(cell.x, 0.8)*step(0.3, cell.y)*step(cell.y, 0.8)*step(2.5, vWorld.y)*step(vWorld.y, max(vCol.a*400.0, 3.0));
          float h = hash(vec2(floor(u/3.4), floor(vWorld.y/3.3)) + floor(xy/40.0));
          vec3 glass = mix(vec3(0.05,0.07,0.09), skyColor(reflect(normalize(vWorld - cameraPosition), n))*0.55, 0.6);
          vec3 lamp = vec3(1.0, 0.72, 0.38) * step(0.6, h) * uDusk * 2.2;
          col = mix(col, glass + lamp, win*0.8);
          col *= ao;
        }
        col = mix(col, col*0.7 + skyColor(reflect(normalize(vWorld - cameraPosition), n))*0.08, wet*0.8);
        if (uSel.z > 0.0) { float d = length(xy - uSel.xy); col += vec3(0.5, 0.38, 0.1) * (1.0 - smoothstep(uSel.z*0.2, uSel.z, d)) * 0.35; }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const bList = decodeBuildings(data.buildings);
  const bGeoms = buildingChunks(bList);
  for (const g of bGeoms) scene.add(new THREE.Mesh(g, bmat));

  // ---------- clouds and rain curtains ----------
  const cloudTex = new THREE.CanvasTexture(cloudCanvas()); cloudTex.colorSpace = THREE.SRGBColorSpace;
  const streakTex = new THREE.CanvasTexture(streakCanvas()); streakTex.wrapS = streakTex.wrapT = THREE.RepeatWrapping;
  const storm = { s: null, puffs: [] };
  const MAXP = 220;
  const quad = new THREE.PlaneGeometry(1, 1);
  const cloudGeo = new THREE.InstancedBufferGeometry(); cloudGeo.index = quad.index; cloudGeo.attributes.position = quad.attributes.position; cloudGeo.attributes.uv = quad.attributes.uv;
  const cPos = new Float32Array(MAXP * 4), cMisc = new Float32Array(MAXP * 2);
  cloudGeo.setAttribute('iPos', new THREE.InstancedBufferAttribute(cPos, 4)); cloudGeo.setAttribute('iMisc', new THREE.InstancedBufferAttribute(cMisc, 2));
  cloudGeo.instanceCount = 0;
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { ...U, uTex: { value: cloudTex }, ...THREE.UniformsLib.fog }, fog: true, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 iPos; attribute vec2 iMisc; varying vec2 vUv; varying float vA; varying float vLit; varying vec3 vWorldC;
      uniform vec3 uSunDir;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vA = iMisc.x; vec3 c = iPos.xyz;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 p = c + (right*position.x + up*position.y*0.62) * iPos.w;
        vLit = clamp(0.5 + 0.5*dot(normalize(right*position.x + up*position.y), uSunDir), 0.0, 1.0); vWorldC = p;
        vec4 mvPosition = viewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec3 uSunCol, uAmb; uniform float uCamDist; varying vec2 vUv; varying float vA; varying float vLit; varying vec3 vWorldC;
      #include <fog_pars_fragment>
      void main(){ float a = texture2D(uTex, vUv).a; if (a < 0.01) discard;
        vec3 dark = vec3(0.07, 0.09, 0.12), light = vec3(1.0, 0.97, 0.93);
        float k = clamp(pow(vUv.y, 1.4)*1.1 + vLit*0.45 - 0.15, 0.0, 1.0);
        vec3 col = mix(dark*(uAmb*1.6), light*(uAmb*0.9 + uSunCol*0.9), k);
        float dc = length(vWorldC - cameraPosition); float near = smoothstep(0.25, 0.75, dc / max(uCamDist, 1.0));
        gl_FragColor = vec4(col, clamp(a * vA * 1.5, 0.0, 0.62) * near);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const clouds = new THREE.Mesh(cloudGeo, cloudMat); clouds.frustumCulled = false; clouds.renderOrder = 5; scene.add(clouds);

  const curtGeo = new THREE.InstancedBufferGeometry(); curtGeo.index = quad.index; curtGeo.attributes.position = quad.attributes.position; curtGeo.attributes.uv = quad.attributes.uv;
  const rPos = new Float32Array(MAXP * 4), rMisc = new Float32Array(MAXP * 2);
  curtGeo.setAttribute('iPos', new THREE.InstancedBufferAttribute(rPos, 4)); curtGeo.setAttribute('iMisc', new THREE.InstancedBufferAttribute(rMisc, 2));
  curtGeo.instanceCount = 0;
  const curtMat = new THREE.ShaderMaterial({
    uniforms: { ...U, uTex: { value: streakTex }, ...THREE.UniformsLib.fog }, fog: true, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 iPos; attribute vec2 iMisc; varying vec2 vUv; varying float vA; varying float vH; varying float vE; uniform float uTime;
      #include <fog_pars_vertex>
      void main(){ vec3 base = iPos.xyz; float top = iMisc.y;
        vec3 toCam = cameraPosition - base; toCam.y = 0.0; vec3 side = normalize(cross(vec3(0,1,0), normalize(toCam + vec3(1e-3,0,0))));
        vec3 p = base + side*position.x*iPos.w + vec3(0, (position.y + 0.5)*top, 0);
        vUv = vec2(position.x + 0.5 + fract(iPos.x*0.0003), (position.y + 0.5)*top/700.0 + uTime*1.6 + fract(iPos.z*0.0007)); vE = position.x + 0.5; vA = iMisc.x; vH = position.y + 0.5;
        vec4 mvPosition = viewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec3 uAmb, uSunCol; varying vec2 vUv; varying float vA; varying float vH; varying float vE;
      #include <fog_pars_fragment>
      void main(){ float s = texture2D(uTex, vUv).a; float edge = smoothstep(0.0, 0.3, vE)*smoothstep(1.0, 0.7, vE);
        float a = (0.2 + s*0.9) * vA * edge * smoothstep(1.0, 0.7, vH) * smoothstep(0.0, 0.08, vH) * 0.55;
        vec3 col = vec3(0.34, 0.39, 0.46) * (uAmb*1.6 + uSunCol*0.25) + vec3(s*0.12);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const curtains = new THREE.Mesh(curtGeo, curtMat); curtains.frustumCulled = false; curtains.renderOrder = 4; scene.add(curtains);

  let truthOn = true;
  function setStorm(s) {
    storm.s = s; storm.puffs = []; gridCache.clear(); lastT = -1;
    let k = 1;
    const r = () => ((k = (k * 16807 + s.seed * 7) % 2147483647) / 2147483647);
    s.cells.forEach((c, ci) => {
      for (let j = 0; j < 22; j++) { const u = r(); storm.puffs.push({ cell: ci, da: (r() - 0.5) * 1.8 * c.sa, dc: (r() - 0.5) * 1.8 * c.sc, alt: 900 + u * 1900, size: 900 + r() * 1300 + u * 600 }); }
    });
    for (let j = 0; j < 20; j++) storm.puffs.push({ cell: -1, da: (r() - 0.5) * 2 * s.strat.sa, dc: (r() - 0.5) * 1.6 * s.strat.sc, alt: 2400 + r() * 700, size: 2200 + r() * 1800 });
  }

  // ---------- glyphs, links, pulses ----------
  const glyphs = new Map();
  const iconTex = {};
  for (const [k, c] of [['camera', PAL.violet], ['gauge', PAL.cyan], ['facility', PAL.jade], ['compute', PAL.gold], ['river', PAL.cyan], ['off', '#6b7688']]) {
    const t = new THREE.CanvasTexture(iconCanvas(k === 'off' ? 'gauge' : k, c)); t.colorSpace = THREE.SRGBColorSpace; iconTex[k] = t;
  }
  const stalkPos = [];
  function addGlyph(id, kind, x, y, h, size = 0.05) {
    const m = new THREE.SpriteMaterial({ map: iconTex[kind], sizeAttenuation: false, depthTest: false, transparent: true });
    const sp = new THREE.Sprite(m); sp.position.copy(W2(x, y, h)); sp.scale.set(size, size, 1); sp.renderOrder = 20;
    sp.userData = { id, kind, x, y, h, size };
    scene.add(sp); glyphs.set(id, sp);
    stalkPos.push(x, 0, -y, x, h, -y);
    return sp;
  }
  const linkMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PAL.gold), transparent: true, opacity: 0.28, depthWrite: false });
  const links = new THREE.LineSegments(new THREE.BufferGeometry(), linkMat); links.renderOrder = 6; scene.add(links);
  const stalks = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })); scene.add(stalks);

  const PULSES = 96;
  const pPos = new Float32Array(PULSES * 3), pCol = new Float32Array(PULSES * 4);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('pcol', new THREE.BufferAttribute(pCol, 4));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPx: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute vec4 pcol; varying vec4 vC; uniform float uPx; void main(){ vC = pcol; gl_PointSize = (10.0 + 12.0*pcol.a) * uPx; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC.rgb * (0.6 + 1.4*a*a), a*vC.a); }`,
  });
  const pulsePts = new THREE.Points(pGeo, pMat); pulsePts.frustumCulled = false; pulsePts.renderOrder = 30; scene.add(pulsePts);
  const pulses = [];
  const bez = (a, b, lift, u, out) => {
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = Math.max(a.y, b.y) + lift;
    const iu = 1 - u;
    out.set(iu * iu * a.x + 2 * iu * u * mx + u * u * b.x, iu * iu * a.y + 2 * iu * u * my + u * u * b.y, iu * iu * a.z + 2 * iu * u * mz + u * u * b.z);
    return out;
  };
  function pulse(fromId, toId, color = PAL.gold, dur = 1.4) {
    const a = glyphs.get(fromId), b = glyphs.get(toId); if (!a || !b) return;
    if (pulses.length >= PULSES) pulses.shift();
    pulses.push({ a: a.position.clone(), b: b.position.clone(), t: 0, dur, col: new THREE.Color(color) });
  }
  function setLinks(ids, to, on) {
    const pts = [], tmp = new THREE.Vector3();
    const b = glyphs.get(to);
    if (on && b) for (const id of ids) {
      const a = glyphs.get(id); if (!a) continue;
      const lift = a.position.distanceTo(b.position) * 0.12;
      let prev = a.position.clone();
      for (let k = 1; k <= 18; k++) { bez(a.position, b.position, lift, k / 18, tmp); pts.push(prev.x, prev.y, prev.z, tmp.x, tmp.y, tmp.z); prev = tmp.clone(); }
    }
    links.geometry.dispose(); links.geometry = new THREE.BufferGeometry(); links.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }

  // forecast outline (silver, dashed by alternating segments)
  const ghost = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: new THREE.Color(PAL.silver), transparent: true, opacity: 0.9, depthTest: false }));
  ghost.renderOrder = 15; scene.add(ghost);
  function setGhost(field, grid, thr) {
    const { x0, y0, x1, y1, nx, ny } = grid, dx = (x1 - x0) / nx, dy = (y1 - y0) / ny, pts = [];
    const v = (i, j) => field[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
    const P = (fx, fy) => [x0 + (fx + 0.5) * dx, y1 - (fy + 0.5) * dy];
    let seg = 0;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
      const code = (a >= thr) | ((b >= thr) << 1) | ((c >= thr) << 2) | ((d >= thr) << 3);
      if (code === 0 || code === 15) continue;
      const e = [];
      const lerp = (p, q, ip, jp, iq, jq) => { const t = (thr - p) / (q - p); return P(ip + (iq - ip) * t, jp + (jq - jp) * t); };
      if ((a >= thr) !== (b >= thr)) e.push(lerp(a, b, i, j, i + 1, j));
      if ((b >= thr) !== (c >= thr)) e.push(lerp(b, c, i + 1, j, i + 1, j + 1));
      if ((c >= thr) !== (d >= thr)) e.push(lerp(c, d, i + 1, j + 1, i, j + 1));
      if ((d >= thr) !== (a >= thr)) e.push(lerp(d, a, i, j + 1, i, j));
      for (let k = 0; k + 1 < e.length; k += 2) { if ((seg++ % 3) === 2) continue; pts.push(e[k][0], 60, -e[k][1], e[k + 1][0], 60, -e[k + 1][1]); }
    }
    ghost.geometry.dispose(); ghost.geometry = new THREE.BufferGeometry(); ghost.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }

  // ---------- time, sun, rain field ----------
  const gridCache = new Map();
  const rainGrid = (t) => { const k = Math.round(t); if (!gridCache.has(k)) gridCache.set(k, sampleGrid(storm.s, k, RAIN_DOM)); return gridCache.get(k); };
  let lastT = -1, forecastField = null;
  function setTime(t) {
    // sun and sky
    const sp = sunPosition(scenarioDate(t));
    const el = sp.elevation * Math.PI / 180, az = sp.azimuth * Math.PI / 180;
    U.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    const e = Math.max(-0.2, Math.min(1, sp.elevation / 35));
    // overcast near the view target
    let over = 0;
    if (storm.s) { const tx = ctrl.target.x, ty = -ctrl.target.z; for (const [dx, dy] of [[0, 0], [3000, 0], [-3000, 0], [0, 3000], [0, -3000]]) over += Math.min(1, rainAt(storm.s, tx + dx, ty + dy, t) / 40) / 5; }
    const warm = 1 - Math.max(0, Math.min(1, (sp.elevation - 2) / 22));
    U.uSunCol.value.setRGB(1.0, 0.92 - 0.3 * warm, 0.82 - 0.45 * warm).multiplyScalar(Math.max(0, Math.min(1.35, 0.25 + e * 1.5)) * (1 - over * 0.4));
    U.uSkyTop.value.setRGB(0.22 + 0.12 * e, 0.38 + 0.16 * e, 0.62 + 0.12 * e).lerp(new THREE.Color(0.32, 0.36, 0.42), over * 0.45).multiplyScalar(0.45 + 0.55 * Math.max(0.15, e));
    U.uSkyHor.value.setRGB(0.95, 0.78 - 0.1 * warm, 0.62 - 0.12 * warm).lerp(new THREE.Color(0.62, 0.66, 0.7), over * 0.4).multiplyScalar(0.5 + 0.5 * Math.max(0.2, e));
    U.uAmb.value.copy(U.uSkyTop.value).lerp(U.uSkyHor.value, 0.5).multiplyScalar(0.62);
    U.uDusk.value = Math.max(0, Math.min(1, (6 - sp.elevation) / 8));
    scene.fog.color.copy(U.uSkyHor.value).convertLinearToSRGB();
    if (!storm.s || Math.round(t) === lastT) return;
    lastT = Math.round(t);
    const N0 = RAIN_DOM.nx * RAIN_DOM.ny;
    const now = truthOn ? rainGrid(t) : new Float32Array(N0);
    const N = RAIN_DOM.nx * RAIN_DOM.ny, wet = new Float32Array(N);
    for (let k = 0; k <= 40; k += 2) { if (!truthOn || t - k < 0) break; const g = rainGrid(t - k), w = Math.exp(-k / 14) * 2; for (let i = 0; i < N; i++) wet[i] += g[i] * w; }
    for (let i = 0; i < N; i++) {
      rainData[i * 4] = Math.min(255, now[i] * 2.55);
      rainData[i * 4 + 1] = Math.min(255, wet[i] * 0.35);
      rainData[i * 4 + 2] = Math.min(255, Math.sqrt(now[i] / 60) * 230);
      rainData[i * 4 + 3] = forecastField ? Math.min(255, forecastField[i] * 2.55) : 0;
      U.uGhost.value = forecastField ? 1 : 0;
    }
    rainTex.needsUpdate = true;
  }

  function updateStormMeshes(t) {
    if (!storm.s || !truthOn) { cloudGeo.instanceCount = 0; curtGeo.instanceCount = 0; return; }
    const s = storm.s, along0 = s.v * (t - s.tArrive);
    let n = 0, m = 0;
    for (const p of storm.puffs) {
      let cx, cy, amp;
      if (p.cell >= 0) {
        const c = s.cells[p.cell];
        const a = along0 + c.along + c.surge * t + p.da, cc = c.across + c.drift * t + p.dc;
        cx = s.ux * a + s.nx * cc; cy = s.uy * a + s.ny * cc;
      } else {
        const a = along0 - s.strat.behind + p.da, cc = s.offset + p.dc;
        cx = s.ux * a + s.nx * cc; cy = s.uy * a + s.ny * cc;
      }
      amp = rainAt(s, cx, cy, t);
      const vis = Math.min(1, amp / 30);
      if (vis < 0.04) continue;
      cPos.set([cx, p.alt, -cy, p.size * (0.7 + 0.5 * vis)], n * 4); cMisc.set([vis * 0.75, 0], n * 2); n++;
      if (amp > 5 && p.cell >= 0 && m < MAXP) { rPos.set([cx, 0, -cy, p.size * 0.8], m * 4); rMisc.set([Math.min(1, amp / 45), p.alt - p.size * 0.15], m * 2); m++; }
    }
    cloudGeo.instanceCount = n; cloudGeo.attributes.iPos.needsUpdate = true; cloudGeo.attributes.iMisc.needsUpdate = true;
    curtGeo.instanceCount = m; curtGeo.attributes.iPos.needsUpdate = true; curtGeo.attributes.iMisc.needsUpdate = true;
  }

  // ---------- camera control ----------
  const ctrl = { target: new THREE.Vector3(-1500, 0, 200), dist: 10500, az: 0.5, el: 0.52, anim: null };
  const clampCtrl = () => { ctrl.dist = Math.max(600, Math.min(60000, ctrl.dist)); ctrl.el = Math.max(0.08, Math.min(1.45, ctrl.el)); };
  function applyCam() {
    clampCtrl();
    const ce = Math.cos(ctrl.el);
    camera.position.set(ctrl.target.x + ctrl.dist * Math.sin(ctrl.az) * ce, ctrl.target.y + ctrl.dist * Math.sin(ctrl.el), ctrl.target.z + ctrl.dist * Math.cos(ctrl.az) * ce);
    camera.lookAt(ctrl.target);
    scene.fog.near = ctrl.dist * 1.3; scene.fog.far = ctrl.dist * 7 + 20000;
  }
  function flyTo(pose, ms = 1600) {
    if (opts.reducedMotion || ms <= 0) { Object.assign(ctrl, { target: new THREE.Vector3(pose.x, 0, -pose.y), dist: pose.dist, az: pose.az, el: pose.el }); ctrl.anim = null; applyCam(); return; }
    ctrl.anim = { t0: performance.now(), ms, from: { tx: ctrl.target.x, tz: ctrl.target.z, dist: ctrl.dist, az: ctrl.az, el: ctrl.el }, to: { tx: pose.x, tz: -pose.y, dist: pose.dist, az: pose.az, el: pose.el } };
  }
  function stepAnim(now) {
    const A = ctrl.anim; if (!A) return;
    let u = Math.min(1, (now - A.t0) / A.ms); const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    const L = (a, b) => a + (b - a) * e;
    ctrl.target.set(L(A.from.tx, A.to.tx), 0, L(A.from.tz, A.to.tz));
    ctrl.dist = Math.exp(L(Math.log(A.from.dist), Math.log(A.to.dist))); ctrl.az = L(A.from.az, A.to.az); ctrl.el = L(A.from.el, A.to.el);
    if (u >= 1) ctrl.anim = null;
  }
  // gestures: one finger pans, two fingers pinch-zoom and twist; mouse drag pans, right-drag turns, wheel zooms
  const ptrs = new Map(); let gest = null, moved = 0, downAt = 0;
  const groundAt = (cx, cy) => {
    const r = canvas.getBoundingClientRect(), nd = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(nd, camera);
    const t = -ray.ray.origin.y / ray.ray.direction.y; if (!(t > 0)) return null;
    return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
  };
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button });
    ctrl.anim = null; moved = 0; downAt = performance.now();
    gest = ptrs.size === 1 ? { kind: e.button === 2 ? 'turn' : 'pan', g0: groundAt(e.clientX, e.clientY), x: e.clientX, y: e.clientY } : { kind: 'pinch' };
    if (gest.kind === 'pinch') { const [a, b] = [...ptrs.values()]; gest.d = Math.hypot(a.x - b.x, a.y - b.y); gest.ang = Math.atan2(b.y - a.y, b.x - a.x); gest.my = (a.y + b.y) / 2; }
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const p = ptrs.get(e.pointerId); moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y); p.x = e.clientX; p.y = e.clientY;
    if (!gest) return;
    if (gest.kind === 'pan' && gest.g0) { applyCam(); const g = groundAt(e.clientX, e.clientY); if (g) { ctrl.target.x += gest.g0.x - g.x; ctrl.target.z += gest.g0.z - g.z; } }
    else if (gest.kind === 'turn') { ctrl.az -= (e.clientX - gest.x) * 0.006; ctrl.el += (e.clientY - gest.y) * 0.004; gest.x = e.clientX; gest.y = e.clientY; }
    else if (gest.kind === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), my = (a.y + b.y) / 2;
      ctrl.dist *= gest.d / Math.max(10, d); ctrl.az -= ang - gest.ang; ctrl.el += (my - gest.my) * 0.004; gest.d = d; gest.ang = ang; gest.my = my;
    }
  });
  const up = e => {
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    if (p && moved < 10 && performance.now() - downAt < 450 && opts.onTap) opts.onTap(e.clientX, e.clientY);
    gest = null;
    if (ptrs.size === 1) { const [q] = [...ptrs.values()]; gest = { kind: 'pan', g0: groundAt(q.x, q.y) }; }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { e.preventDefault(); ctrl.anim = null; ctrl.dist *= Math.exp(e.deltaY * 0.0012); }, { passive: false });

  // ---------- picking and projection ----------
  const v3 = new THREE.Vector3();
  function project(x, y, h = 0) {
    v3.copy(W2(x, y, h)).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: (v3.x + 1) / 2 * r.width, y: (1 - v3.y) / 2 * r.height, on: v3.z < 1 && Math.abs(v3.x) < 1.2 && Math.abs(v3.y) < 1.2 };
  }
  function pickGlyph(cx, cy, radius = 30) {
    const r = canvas.getBoundingClientRect(); let best = null, bd = radius;
    for (const [id, sp] of glyphs) {
      if (!sp.visible) continue;
      const p = project(sp.userData.x, sp.userData.y, sp.userData.h); if (!p.on) continue;
      const d = Math.hypot(p.x - (cx - r.left), p.y - (cy - r.top)); if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
  function pickGround(cx, cy) { const g = groundAt(cx, cy); return g ? { x: g.x, y: -g.z } : null; }

  // ---------- frame ----------
  let simT = 0, lastFrame = performance.now(), fps = 60, frames = 0, fpsT = performance.now();
  let occ = { right: 0, bottom: 0 };
  function resize() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    const vw = r.width - occ.right, vh = r.height - occ.bottom;
    camera.aspect = r.width / Math.max(1, r.height);
    camera.fov = vw / Math.max(1, vh) < 0.8 ? 58 : vw / Math.max(1, vh) < 1.2 ? 50 : 40;
    // centre the view in the part of the screen the sheet leaves open
    if (occ.right || occ.bottom) camera.setViewOffset(r.width + occ.right, r.height + occ.bottom, occ.right, occ.bottom, r.width, r.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix(); pMat.uniforms.uPx.value = renderer.getPixelRatio();
  }
  function setOcclusion(right, bottom) { if (Math.abs(right - occ.right) < 2 && Math.abs(bottom - occ.bottom) < 2) return; occ = { right, bottom }; resize(); }
  function frame(now = performance.now()) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    U.uTime.value += opts.reducedMotion ? 0 : dt;
    stepAnim(now); applyCam(); U.uCamDist.value = ctrl.dist;
    updateStormMeshes(simT);
    // pulses
    const tmp = new THREE.Vector3(); let n = 0;
    for (let i = pulses.length - 1; i >= 0; i--) { const p = pulses[i]; p.t += dt / p.dur; if (p.t >= 1) pulses.splice(i, 1); }
    for (const p of pulses) {
      if (n >= PULSES) break;
      bez(p.a, p.b, p.a.distanceTo(p.b) * 0.12, p.t, tmp); pPos.set([tmp.x, tmp.y, tmp.z], n * 3);
      pCol.set([p.col.r, p.col.g, p.col.b, Math.sin(Math.PI * p.t) * 0.9 + 0.1], n * 4); n++;
    }
    pGeo.setDrawRange(0, n); pGeo.attributes.position.needsUpdate = true; pGeo.attributes.pcol.needsUpdate = true;
    // glyph breathing
    for (const [, sp] of glyphs) { const s = sp.userData.size * (sp.userData.pulse ? 1 + 0.18 * Math.sin(now / 180) : 1) * (sp.userData.sel ? 1.35 : 1); sp.scale.set(s, s, 1); }
    renderer.render(scene, camera);
    frames++; if (now - fpsT > 1000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; }
  }

  stalks.geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  function finishGlyphs() {
    stalkPos.length = 0; for (const [, g] of glyphs) { const u = g.userData; if (u.id !== '_preview') stalkPos.push(u.x, 0, -u.y, u.x, u.h, -u.y); }
    stalks.geometry.dispose(); stalks.geometry = new THREE.BufferGeometry(); stalks.geometry.setAttribute('position', new THREE.Float32BufferAttribute(stalkPos, 3));
  }
  function removeGlyph(id) { const g = glyphs.get(id); if (!g) return; scene.remove(g); g.material.dispose(); glyphs.delete(id); finishGlyphs(); }
  function moveGlyph(id, x, y) { const g = glyphs.get(id); if (!g) return; g.position.copy(W2(x, y, g.userData.h)); g.userData.x = x; g.userData.y = y; finishGlyphs(); }

  resize(); applyCam();
  return {
    renderer, scene, camera, ctrl, U,
    get fps() { return fps; },
    buildingCount: bList.length,
    setStorm, setTime(t) { simT = t; setTime(t); },
    setForecast(field) { forecastField = field; lastT = -1; setTime(simT); },
    setGhost, clearGhost() { ghost.geometry.dispose(); ghost.geometry = new THREE.BufferGeometry(); },
    setFlood(mask) { if (!mask) { U.uFloodOn.value = 0; return; } for (let i = 0; i < mask.length; i++) floodData[i] = mask[i] ? 255 : 0; floodTex.needsUpdate = true; U.uFloodOn.value = 1; },
    setRise(v) { U.uRise.value = v; },
    setSelect(x, y, r) { U.uSel.value.set(x, y, r || -1); },
    addGlyph, finishGlyphs, removeGlyph, moveGlyph, glyph: id => glyphs.get(id), glyphs, setLinks, pulse,
    setTruth(v) { truthOn = !!v; lastT = -1; setTime(simT); }, get truth() { return truthOn; },
    setGlyphState(id, st) { const g = glyphs.get(id); if (!g) return; Object.assign(g.userData, st); if ('off' in st) g.material.map = st.off ? iconTex.off : iconTex[g.userData.kind]; g.material.opacity = st.off ? 0.55 : 1; },
    flyTo, project, pickGlyph, pickGround, resize, frame, setOcclusion,
    innerCanvas: innerCv, innerExt,
  };
}
