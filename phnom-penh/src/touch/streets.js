// The light in the streets: one ribbon per street segment, drawn on the ground of the existing 3D city
// (src/render/world.js returns its scene and camera control). Every vertex carries the computed travel
// time to that end of the segment; the shader shows a segment only once the travel front has reached it.
// The front moves from the touch outward; nothing is drawn that the search did not reach.
import * as THREE from 'three';

export function createStreets(world, city) {
  const g = city.graph, nE = city.nE;
  const pos = new Float32Array(nE * 4 * 3), nrm = new Float32Array(nE * 4 * 2), side = new Float32Array(nE * 4);
  const along = new Float32Array(nE * 4), wcls = new Float32Array(nE * 4);
  const aT = new Float32Array(nE * 4), aLost = new Float32Array(nE * 4);
  const idx = new Uint32Array(nE * 6);
  for (let e = 0; e < nE; e++) {
    const E = g.edges[e], ax = g.x[E.a], ay = g.y[E.a], bx = g.x[E.b], by = g.y[E.b];
    let dx = bx - ax, dy = by - ay; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const nx = -dy, ny = dx;
    const v = e * 4;
    const P = [[ax, ay, -1, 0], [ax, ay, 1, 0], [bx, by, -1, L], [bx, by, 1, L]];
    for (let k = 0; k < 4; k++) {
      const [x, y, s, u] = P[k];
      pos.set([x, 2.5, -y], (v + k) * 3);
      nrm.set([nx, -ny], (v + k) * 2);   // three: z = −y
      side[v + k] = s; along[v + k] = u; wcls[v + k] = E.cls;
    }
    idx.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], e * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aNrm', new THREE.BufferAttribute(nrm, 2));
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  geo.setAttribute('aCls', new THREE.BufferAttribute(wcls, 1));
  const tAttr = new THREE.BufferAttribute(aT, 1); tAttr.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aT', tAttr);
  const lAttr = new THREE.BufferAttribute(aLost, 1); lAttr.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aLost', lAttr);
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  const U = { uFront: { value: 0 }, uBudget: { value: 600 }, uW: { value: 30 }, uTime: { value: 0 }, uLostOn: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    vertexShader: /* glsl */`
      attribute vec2 aNrm; attribute float aSide, aAlong, aCls, aT, aLost;
      uniform float uW;
      varying float vT, vSide, vAlong, vLost, vCls;
      void main(){
        float w = uW * (aCls < 0.5 ? 1.35 : aCls < 1.5 ? 1.0 : 0.7);
        vec3 p = position + vec3(aNrm.x, 0.0, aNrm.y) * aSide * w;
        vT = aT; vSide = aSide; vAlong = aAlong; vLost = aLost; vCls = aCls;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uFront, uBudget, uTime, uLostOn, uW;
      varying float vT, vSide, vAlong, vLost, vCls;
      void main(){
        float a = abs(vSide);
        float soft = (1.0 - smoothstep(0.0, 0.45, a)) * 0.9 + (1.0 - smoothstep(0.3, 1.0, a)) * 0.35;
        if (vLost > 0.5 && uLostOn > 0.5) {
          // cut off by the river: ember, dashed so it does not depend on colour alone
          float dash = step(0.5, fract(vAlong / (uW * 5.0)));
          gl_FragColor = vec4(vec3(1.0, 0.3, 0.2) * (0.9 + 1.1 * dash) * soft * 1.6, 1.0);
          return;
        }
        if (vT > uFront || vT > uBudget) discard;
        float u = clamp(vT / uBudget, 0.0, 1.0);
        vec3 near = vec3(1.0, 0.97, 0.86), mid = vec3(1.0, 0.66, 0.2), far = vec3(0.3, 0.8, 1.0);
        vec3 c = u < 0.45 ? mix(near, mid, u / 0.45) : mix(mid, far, (u - 0.45) / 0.55);
        c *= 1.25 - 0.55 * u;
        float edge = exp(-max(uFront - vT, 0.0) / 18.0);        // the travelling front burns brighter
        float fade = 1.0 - smoothstep(0.85, 1.0, u) * 0.5;
        gl_FragColor = vec4(c * soft * (0.75 + 1.8 * edge) * fade, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3;
  world.scene.add(mesh);

  // the touch: a bright point with a beam, so it reads in 3D at any angle
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c2 = cv.getContext('2d'), gr = c2.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,240,200,1)'); gr.addColorStop(0.45, 'rgba(255,190,80,0.45)'); gr.addColorStop(1, 'rgba(255,170,60,0)');
  c2.fillStyle = gr; c2.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const pin = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true, blending: THREE.AdditiveBlending }));
  pin.scale.set(0.11, 0.11, 1); pin.renderOrder = 40; world.scene.add(pin);
  const beamGeo = new THREE.BufferGeometry(); beamGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
  const beam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.8, depthTest: false }));
  beam.renderOrder = 39; world.scene.add(beam);
  let pinH = 260;

  return {
    U,
    // tNode: node times in s (Infinity = not reached); cost: s per segment for the mode;
    // closed: segments under the river (never lit); lost: segments the river cut off (ember)
    set(tNode, cost, closed, lost) {
      for (let e = 0; e < nE; e++) {
        const E = g.edges[e];
        let a = tNode[E.a], b = tNode[E.b];
        // a segment reached from one end only is lit as far as the front gets along it
        if (isFinite(a) && !isFinite(b)) b = a + cost[e];
        else if (isFinite(b) && !isFinite(a)) a = b + cost[e];
        const ok = isFinite(a) && isFinite(b) && !(closed && closed[e]);
        const v = e * 4;
        aT[v] = aT[v + 1] = ok ? a : 1e7; aT[v + 2] = aT[v + 3] = ok ? b : 1e7;
        const l = lost && lost[e] ? 1 : 0;
        aLost[v] = aLost[v + 1] = aLost[v + 2] = aLost[v + 3] = l;
      }
      tAttr.needsUpdate = true; lAttr.needsUpdate = true;
    },
    pin(x, y, h = 260) { pinH = h; pin.position.set(x, h, -y); beam.position.set(x, 0, -y); beam.scale.set(1, h, 1); },
    get pinPos() { return { x: pin.position.x, y: -pin.position.z, h: pinH }; },
    frame(dist, dt) { U.uW.value = Math.max(3, Math.min(40, dist * 0.0016)); U.uTime.value += dt; },
    visible(v) { mesh.visible = v; pin.visible = v; beam.visible = v; },
  };
}
