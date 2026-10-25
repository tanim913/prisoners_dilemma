// Live woodcut pictures for each character, drawn with three.js.
// One shared WebGL renderer: the live picture borrows its canvas, card thumbnails are stills cut from it.
import * as THREE from "three";

export const WASH = {
  lapis: 0x2b4c8c,
  vermilion: 0xc8402a,
  verdigris: 0x3f8a6e,
  ochre: 0xc99a2e,
  none: 0xece5d6
};
const PAPER = new THREE.Color(0xece5d6);
const INK = new THREE.Color(0x1b1712);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let renderer = null;
let failed = false;

export function supported() {
  return !!getRenderer();
}

function getRenderer() {
  if (renderer || failed) return renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
  } catch (e) {
    failed = true;
  }
  return renderer;
}

// Engraving shader: light decides how many hatch lines cut through the wash.
const surfaceVert = `
  varying vec3 vN; varying vec3 vPos; varying vec3 vObj; varying vec3 vObjN;
  void main() {
    vObj = position; vObjN = normal;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const surfaceFrag = `
  uniform vec3 uWash; uniform float uWashAmt; uniform float uRim; uniform float uFloor; uniform vec3 uPaper; uniform vec3 uInk; uniform float uScale;
  varying vec3 vN; varying vec3 vPos; varying vec3 vObj; varying vec3 vObjN;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hatch(float x, float w) { float c = abs(fract(x) - 0.5); return step(0.001, w) * (1.0 - smoothstep(w, w + 0.07, c)); }
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 light = normalize(vec3(-0.55, 0.8, 0.65));
    float lum = clamp(max(dot(n, light), 0.0) * 0.9 + 0.12, 0.0, 1.0);
    float rim = 1.0 - max(dot(n, normalize(-vPos)), 0.0);
    // Hatch in object space (pick the plane facing the normal) so lines stay on the form as it turns.
    vec3 an = abs(vObjN);
    vec2 p = (an.y > max(an.x, an.z) ? vObj.xz : (an.x > an.z ? vObj.zy : vObj.xy)) * uScale;
    float wob = sin(p.y * 0.31 + p.x * 0.07) * 0.18;
    float ink = hatch((p.x + p.y) * 0.5 + wob, clamp((0.72 - lum) * 0.62, 0.0, 0.44));
    ink = max(ink, hatch((p.x - p.y) * 0.5 - wob, clamp((0.38 - lum) * 0.9, 0.0, 0.42)));
    ink = max(ink, smoothstep(0.78, 0.93, rim) * uRim);
    ink = max(ink, hatch(p.y * 0.55 + wob * 0.5, 0.07) * uFloor);
    float grain = 0.8 + 0.2 * hash(floor(p * 0.7));
    vec3 base = mix(uPaper, uWash, uWashAmt * grain);
    base = mix(base, uWash * 0.78, rim * 0.25 * uWashAmt);
    gl_FragColor = vec4(mix(base, uInk, ink * 0.93), 1.0);
  }`;
const hullVert = `
  uniform float uThick;
  void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uThick, 1.0); }`;
const hullFrag = `uniform vec3 uInk; void main() { gl_FragColor = vec4(uInk, 1.0); }`;

// Hatch lines per world unit; set from the picture size so small pictures get coarser lines.
const scaleUniform = { value: 30 };

function surface(wash, rim = 1, floor = 0) {
  return new THREE.ShaderMaterial({
    vertexShader: surfaceVert,
    fragmentShader: surfaceFrag,
    side: THREE.DoubleSide,
    uniforms: {
      uWash: { value: new THREE.Color(WASH[wash] ?? WASH.none) },
      uWashAmt: { value: wash === "none" ? 0 : 0.88 },
      uRim: { value: rim },
      uFloor: { value: floor },
      uPaper: { value: PAPER },
      uInk: { value: INK },
      uScale: scaleUniform
    }
  });
}
const hullMat = new THREE.ShaderMaterial({
  vertexShader: hullVert,
  fragmentShader: hullFrag,
  side: THREE.BackSide,
  uniforms: { uThick: { value: 0.022 }, uInk: { value: INK } }
});

// Every solid gets its wash plus an inked outline.
function solid(geo, wash = "none", rim = 1, floor = 0) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, surface(wash, rim, floor)));
  g.add(new THREE.Mesh(geo, hullMat));
  return g;
}
const at = (obj, x = 0, y = 0, z = 0) => (obj.position.set(x, y, z), obj);
const rot = (obj, x = 0, y = 0, z = 0) => (obj.rotation.set(x, y, z), obj);

const K = {
  box: (w, h, d, c) => solid(new THREE.BoxGeometry(w, h, d), c),
  ball: (r, c) => solid(new THREE.SphereGeometry(r, 32, 20), c),
  cyl: (rt, rb, h, c, s = 32) => solid(new THREE.CylinderGeometry(rt, rb, h, s), c),
  cone: (r, h, c, s = 32) => solid(new THREE.ConeGeometry(r, h, s), c),
  ring: (R, r, c, arc = Math.PI * 2) => solid(new THREE.TorusGeometry(R, r, 16, 48, arc), c),
  stick: (r, len, c) => solid(new THREE.CapsuleGeometry(r, len, 6, 12), c),
  lathe: (pts, c) => solid(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 40), c),
  tube: (pts, r, c) => solid(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))), 48, r, 10), c),
  shape: (pts, depth, c) => {
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
    geo.center();
    return solid(geo, c);
  }
};

function group(...kids) {
  const g = new THREE.Group();
  kids.forEach((k) => g.add(k));
  return g;
}

function hand(open, wash) {
  const palm = K.box(0.62, 0.72, 0.24, wash);
  const g = group(palm);
  [-0.22, -0.075, 0.075, 0.22].forEach((x, i) => {
    const f = K.stick(0.068, open ? 0.42 - Math.abs(i - 1.5) * 0.06 : 0.2, wash);
    if (open) at(f, x, 0.62, 0);
    else rot(at(f, x, 0.36, 0.17), Math.PI / 2, 0, 0);
    g.add(f);
  });
  const thumb = K.stick(0.075, 0.26, wash);
  g.add(open ? rot(at(thumb, -0.42, 0.05, 0.02), 0, 0, 0.75) : rot(at(thumb, -0.12, 0.12, 0.2), 0, 0, 1.5));
  return g;
}

// A bust in profile: head, nose, eye and brow, neck and shoulders.
function head(wash) {
  const skull = K.ball(0.46, wash);
  skull.scale.set(0.88, 1.08, 1);
  const shoulders = K.ball(0.6, wash);
  shoulders.scale.set(1.1, 0.55, 0.75);
  return group(
    skull,
    rot(at(K.cone(0.13, 0.36, wash), 0, -0.02, 0.52), Math.PI / 2, 0, 0),
    at(K.ball(0.075, "none"), 0.17, 0.14, 0.38),
    at(K.ball(0.075, "none"), -0.17, 0.14, 0.38),
    at(K.box(0.5, 0.07, 0.14, wash), 0, 0.26, 0.38),
    at(K.cyl(0.2, 0.24, 0.4, wash), 0, -0.55, 0),
    at(shoulders, 0, -0.85, 0)
  );
}

const sway = (t, a = 0.08, s = 0.6) => Math.sin(t * s) * a;

// One scene per character: build() returns the object and an optional tick(t).
const SCENES = {
  device() {
    const a = at(rot(hand(true, "verdigris"), 0, 0.3, 0.15), -0.75, 0.75, 0);
    const b = at(rot(hand(false, "vermilion"), 0, -0.3, -0.15), 0.75, 0.75, 0);
    return { obj: group(a, b), tick: (t) => { a.position.y = 0.75 + sway(t, 0.06, 1.1); b.position.y = 0.75 + sway(t + 1.6, 0.06, 1.1); } };
  },
  tft() {
    const a = at(rot(head("lapis"), 0, Math.PI / 2 - 0.35, 0), -0.75, 1.2, 0);
    const b = at(rot(head("lapis"), 0, -Math.PI / 2 + 0.35, 0), 0.75, 1.2, 0);
    return { obj: group(a, b), tick: (t) => { a.rotation.x = b.rotation.x = sway(t, 0.12, 0.9); } };
  },
  tf2t() {
    const pans = [-0.9, 0.9].map((x) => at(K.cyl(0.32, 0.22, 0.08, "lapis"), x, -0.5, 0));
    const arm = at(group(K.box(2, 0.07, 0.07, "ochre"), ...pans), 0, 1.55, 0);
    return { obj: group(at(K.cyl(0.05, 0.05, 1.5, "ochre"), 0, 0.75, 0), at(K.cyl(0.4, 0.45, 0.1, "none"), 0, 0.05, 0), arm),
      tick: (t) => { arm.rotation.z = Math.sin(t * 0.5) > 0.6 ? 0.12 : 0; pans.forEach((p) => (p.rotation.z = -arm.rotation.z)); } };
  },
  gtft() {
    const coin = at(rot(K.cyl(0.26, 0.26, 0.05, "ochre"), Math.PI / 2, 0, 0), 0.05, 1.75, 0.1);
    return { obj: group(at(rot(hand(true, "verdigris"), -0.25, 0, 0), 0, 0.65, 0), coin), tick: (t) => { coin.rotation.z = t * 1.6; } };
  },
  allc() {
    const bridge = at(K.ring(1.1, 0.12, "verdigris", Math.PI), 0, 0.05, 0);
    const walker = at(K.ball(0.14, "ochre"), 0, 0, 0);
    return { obj: group(bridge, walker), tick: (t) => { const a = ((t * 0.35) % 1) * Math.PI; walker.position.set(Math.cos(Math.PI - a) * 1.1, Math.sin(a) * 1.1 + 0.25, 0); } };
  },
  alld() {
    const blade = K.shape([[0, 0], [0.13, 0.25], [0.11, 1.7], [-0.11, 1.7], [-0.13, 0.25]], 0.05, "none");
    return { obj: group(at(blade, 0, 0.85, 0), at(K.box(0.85, 0.11, 0.13, "vermilion"), 0, 1.72, 0), at(K.stick(0.07, 0.36, "vermilion"), 0, 2.02, 0), at(K.ball(0.1, "ochre"), 0, 2.34, 0)), tick: null };
  },
  grim() {
    const door = at(K.box(0.9, 1.6, 0.12, "vermilion"), 0.45, 0, 0);
    const hinge = at(group(door), -0.45, 0.85, 0);
    const lock = group(at(K.ring(0.13, 0.035, "ochre", Math.PI), 0, 0.13, 0), K.box(0.28, 0.24, 0.1, "ochre"));
    at(lock, 0.2, 0.75, 0.18);
    const frame = group(at(K.box(0.12, 1.85, 0.2, "none"), -0.55, 0.92, 0), at(K.box(0.12, 1.85, 0.2, "none"), 0.55, 0.92, 0), at(K.box(1.22, 0.14, 0.2, "none"), 0, 1.86, 0));
    return { obj: group(frame, hinge, lock), tick: (t) => { hinge.rotation.y = -Math.max(0, Math.cos(Math.min(t * 0.4, Math.PI))) * 1.1; lock.visible = t * 0.4 > Math.PI * 0.9; } };
  },
  joss() {
    const mask = K.ball(0.62, "lapis");
    mask.scale.set(1, 1.15, 0.45);
    const eyes = [-0.2, 0.2].map((x) => at(K.ball(0.08, "none"), x, 1.15, 0.27));
    const knife = rot(at(K.shape([[0, 0], [0.07, 0.15], [0.06, 0.9], [-0.06, 0.9], [-0.07, 0.15]], 0.03, "vermilion"), 0.55, 0.8, -0.3), 0, 0, -0.5);
    return { obj: group(at(mask, 0, 1, 0), ...eyes, knife), tick: (t) => { knife.position.x = 0.55 + Math.max(0, Math.sin(t * 0.7)) * 0.2; } };
  },
  graaskamp() {
    const glass = group(at(K.cone(0.42, 0.75, "none"), 0, 0.38, 0), rot(at(K.cone(0.42, 0.75, "none"), 0, -0.38, 0), Math.PI, 0, 0),
      at(K.cyl(0.55, 0.55, 0.08, "ochre"), 0, 0.8, 0), at(K.cyl(0.55, 0.55, 0.08, "ochre"), 0, -0.8, 0), at(K.ball(0.16, "vermilion"), 0, -0.55, 0));
    at(glass, 0, 1.05, 0);
    return { obj: glass, tick: (t) => { glass.rotation.z = Math.floor(t / 6) % 2 ? Math.PI : 0; glass.rotation.y = t * 0.3; } };
  },
  tester() {
    const glass = group(K.ring(0.42, 0.06, "ochre"), rot(at(K.stick(0.06, 0.7, "ochre"), 0.55, -0.55, 0), 0, 0, 0.78));
    const pebble = at(K.ball(0.3, "vermilion"), 0, 0.3, 0);
    pebble.scale.set(1.2, 0.8, 1);
    return { obj: group(pebble, at(glass, 0, 1.2, 0.2)), tick: (t) => { glass.position.set(Math.sin(t * 0.7) * 0.25, 1.2 + sway(t, 0.1, 1.3), 0.2); } };
  },
  pavlov() {
    const bell = K.lathe([[0, 0.55], [0.12, 0.55], [0.2, 0.45], [0.26, 0.15], [0.42, -0.1], [0.45, -0.18], [0, -0.18]], "ochre");
    const swing = group(at(bell, 0, -0.55, 0), at(K.ball(0.09, "vermilion"), 0, -0.85, 0));
    at(swing, 0, 1.95, 0);
    return { obj: group(at(K.box(0.12, 2.1, 0.12, "none"), -0.9, 1.05, 0), at(K.box(1.05, 0.12, 0.12, "none"), -0.45, 2.05, 0), swing,
      rot(at(K.stick(0.05, 0.9, "lapis"), 0.75, 0.6, 0), 0, 0, 0.7)), tick: (t) => { swing.rotation.z = sway(t, 0.32, 2.4) * (Math.sin(t * 0.4) > 0 ? 1 : 0.15); } };
  },
  gradual() {
    // One block for the first offense, two for the second, three for the third; then two rounds of peace.
    const g = group();
    [1, 2, 3].forEach((n, i) => { for (let k = 0; k < n; k++) g.add(at(K.box(0.34, 0.3, 0.34, "vermilion"), -1.05 + i * 0.48, 0.15 + k * 0.32, 0)); });
    [0, 1].forEach((i) => g.add(at(K.box(0.34, 0.3, 0.34, "verdigris"), 0.45 + i * 0.48, 0.15, 0)));
    return { obj: g, tick: null };
  },
  softmaj() {
    const vane = group(rot(at(K.cone(0.14, 0.35, "verdigris"), 0.6, 0, 0), 0, 0, -Math.PI / 2), at(K.box(1.1, 0.05, 0.05, "verdigris"), 0, 0, 0), at(K.shape([[0, 0], [0.35, 0.25], [0.35, -0.25]], 0.03, "verdigris"), -0.6, 0, 0));
    at(vane, 0, 2, 0);
    return { obj: group(at(K.cyl(0.05, 0.06, 2, "none"), 0, 1, 0), at(K.ball(0.12, "ochre"), 0, 2.15, 0), vane), tick: (t) => { vane.rotation.y = Math.sin(t * 0.25) * 1.4; } };
  },
  hardmaj() {
    const tower = group(at(K.cyl(0.6, 0.68, 1.6, "none", 10), 0, 0.8, 0), at(K.box(0.3, 0.5, 0.1, "lapis"), 0, 0.3, 0.64));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      tower.add(rot(at(K.box(0.2, 0.22, 0.16, "none"), Math.sin(a) * 0.56, 1.7, Math.cos(a) * 0.56), 0, a, 0));
    }
    return { obj: tower, tick: null };
  },
  prober() {
    const hook = group(at(K.cyl(0.015, 0.015, 1.6, "none"), 0, 0.8, 0), at(rot(K.ring(0.2, 0.035, "vermilion", Math.PI * 1.3), 0, 0, Math.PI * 0.9), 0, -0.1, 0), at(K.ball(0.06, "ochre"), 0, 0.2, 0));
    at(hook, 0, 0.6, 0);
    return { obj: group(hook, at(K.cyl(1.1, 1.1, 0.04, "lapis"), 0, 0.03, 0)), tick: (t) => { hook.position.y = 0.6 + sway(t, 0.18, 1.2); hook.rotation.z = sway(t, 0.06, 0.8); } };
  },
  coldopen() {
    const fist = at(rot(hand(false, "vermilion"), 0, 0.55, -0.2), -0.6, 0.8, 0.2);
    const mirror = rot(group(K.box(1, 1.5, 0.08, "lapis"), at(K.box(0.84, 1.32, 0.02, "none"), 0, 0, 0.05)), 0, -0.75, 0);
    return { obj: group(fist, at(mirror, 0.75, 0.95, -0.2)), tick: (t) => { fist.position.x = -0.6 + Math.max(0, Math.sin(t * 0.9)) * 0.25; } };
  },
  bunker() {
    const shutters = [-0.22, 0.22].map((x) => at(K.box(0.42, 0.55, 0.06, "vermilion"), x, 0, 0));
    const win = at(group(...shutters), 0, 0.85, 0.62);
    const roof = rot(at(K.cone(1.05, 0.65, "lapis", 4), 0, 1.75, 0), 0, Math.PI / 4, 0);
    return { obj: group(at(K.box(1.4, 1.3, 1.2, "none"), 0, 0.68, 0), roof, win), tick: (t) => { const open = Math.max(0, Math.sin(t * 0.5)); shutters[0].rotation.y = open * 1.2; shutters[1].rotation.y = -open * 1.2; } };
  },
  hungrymaj() {
    const stones = ["verdigris", "vermilion", "verdigris", "verdigris", "vermilion"].map((c, i) => at(K.ball(0.2, c), -0.9 + i * 0.45, 0.25, 0));
    const arch = at(K.ring(1.05, 0.06, "ochre", Math.PI), 0, 0.12, -0.3);
    return { obj: group(arch, ...stones), tick: (t) => { stones.forEach((s, i) => (s.position.y = 0.25 + Math.max(0, Math.sin(t * 1.4 - i * 0.6)) * 0.12)); } };
  },
  steelgate() {
    const bars = group();
    for (let i = 0; i < 5; i++) bars.add(at(K.box(0.06, 1.5, 0.06, "none"), -0.5 + i * 0.25, 0, 0));
    for (let j = 0; j < 4; j++) bars.add(at(K.box(1.15, 0.05, 0.05, "none"), 0, -0.55 + j * 0.37, 0));
    const frame = group(at(K.box(0.2, 2, 0.3, "lapis"), -0.75, 1, 0), at(K.box(0.2, 2, 0.3, "lapis"), 0.75, 1, 0), at(K.box(1.7, 0.25, 0.3, "lapis"), 0, 2.05, 0));
    return { obj: group(frame, at(bars, 0, 0.78, 0)), tick: (t) => { bars.position.y = 0.78 + (Math.sin(t * 0.45) > 0 ? 0.75 : 0) * Math.min(1, Math.abs(Math.sin(t * 0.45)) * 3); } };
  },
  spiteecho() {
    const horn = K.lathe([[0.06, 0], [0.08, 0.5], [0.13, 0.9], [0.28, 1.2], [0.48, 1.32]], "ochre");
    const rings = [0, 1, 2].map(() => at(rot(K.ring(0.5, 0.025, "vermilion"), 0, Math.PI / 2, 0), 0.9, 1, 0));
    return { obj: group(at(rot(horn, 0, 0, -Math.PI / 2), -0.6, 1, 0), ...rings), tick: (t) => { rings.forEach((r, i) => { const k = (t * 0.5 + i / 3) % 1; r.position.x = 0.75 + k * 0.9; r.scale.setScalar(0.6 + k * 0.9); r.visible = k < 0.95; }); } };
  },
  shockprober() {
    const bolt = K.shape([[0, 1], [0.35, 1], [0.12, 0.45], [0.38, 0.45], [-0.15, -0.6], [0.02, 0.1], [-0.25, 0.1]], 0.12, "vermilion");
    return { obj: group(at(bolt, 0, 1.3, 0), at(K.cyl(1.2, 1.2, 0.04, "lapis"), 0, 0.03, 0)), tick: (t) => { bolt.visible = (t % 5) > 1.2 || (t % 0.3) > 0.15; } };
  },
  warmopen() {
    const flames = [];
    const candles = [-0.6, 0, 0.6].map((x) => {
      const f = at(K.cone(0.09, 0.28, "ochre"), x, 1.18, 0);
      flames.push(f);
      return group(at(K.cyl(0.12, 0.13, 0.9, "none"), x, 0.5, 0), f);
    });
    return { obj: group(...candles), tick: (t) => { flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(t * 6 + i * 2) * 0.12; f.rotation.z = Math.sin(t * 3 + i) * 0.08; }); } };
  },
  olive() {
    const stem = K.tube([[-0.9, 0.6, 0], [-0.3, 1.0, 0.1], [0.3, 1.25, 0], [0.9, 1.6, -0.1]], 0.04, "none");
    const leaves = [];
    for (let i = 0; i < 7; i++) {
      const l = K.ball(0.16, "verdigris");
      l.scale.set(1.8, 0.45, 0.6);
      const x = -0.7 + i * 0.25, side = i % 2 ? 1 : -1;
      leaves.push(rot(at(l, x + 0.05, 0.75 + i * 0.12 + side * 0.15, 0), 0, 0, side * 0.6));
    }
    const fruit = [at(K.ball(0.09, "lapis"), -0.1, 0.95, 0.12), at(K.ball(0.09, "lapis"), 0.4, 1.2, 0.12)];
    const g = group(stem, ...leaves, ...fruit);
    return { obj: g, tick: (t) => { g.rotation.z = sway(t, 0.05, 0.7); } };
  },
  slowcounter() {
    const frame = group(at(K.box(1.8, 0.1, 0.12, "ochre"), 0, 0.3, 0), at(K.box(1.8, 0.1, 0.12, "ochre"), 0, 1.6, 0), at(K.box(0.1, 1.4, 0.12, "ochre"), -0.9, 0.95, 0), at(K.box(0.1, 1.4, 0.12, "ochre"), 0.9, 0.95, 0));
    const beads = [];
    [0.6, 0.95, 1.3].forEach((y, r) => {
      frame.add(rot(at(K.cyl(0.02, 0.02, 1.7, "none"), 0, y, 0), 0, 0, Math.PI / 2));
      for (let i = 0; i < 4; i++) {
        const b = K.ball(0.13, r === 1 && i < 2 ? "vermilion" : "none");
        b.scale.set(0.7, 1, 1);
        beads.push({ b: at(b, -0.6 + i * 0.28, y, 0), r, i });
      }
    });
    return { obj: group(frame, ...beads.map((x) => x.b)), tick: (t) => { beads.forEach(({ b, r, i }) => { if (r === 1 && i < 2) b.position.x = -0.6 + i * 0.28 + (Math.sin(t * 0.6) > 0 ? 0.95 : 0); }); } };
  },
  guardian() {
    const shield = K.shape([[0, -0.75], [0.55, -0.3], [0.6, 0.55], [0, 0.7], [-0.6, 0.55], [-0.55, -0.3]], 0.12, "lapis");
    const flame = at(K.cone(0.14, 0.4, "ochre"), 0.25, 0.42, -0.45);
    return { obj: group(at(shield, -0.15, 1, 0.1), at(K.cyl(0.12, 0.14, 0.2, "none"), 0.25, 0.1, -0.45), flame, at(K.ring(0.12, 0.05, "ochre"), -0.15, 1.3, 0.22)), tick: (t) => { flame.scale.y = 1 + Math.sin(t * 5) * 0.1; } };
  },
  random() {
    const die = K.box(0.9, 0.9, 0.9, "none");
    const pips = group();
    const faces = [[[0, 0]], [[-0.2, -0.2], [0.2, 0.2]], [[-0.22, -0.22], [0, 0], [0.22, 0.22]]];
    faces.forEach((f, k) => f.forEach(([u, v]) => {
      const p = K.ball(0.07, "vermilion");
      if (k === 0) at(p, u, v, 0.45); else if (k === 1) at(p, 0.45, u, v); else at(p, u, 0.45, v);
      pips.add(p);
    }));
    const d = at(group(die, pips), 0, 1, 0);
    return { obj: d, tick: (t) => { d.rotation.set(t * 0.7, t * 0.45, t * 0.3); d.position.y = 1 + Math.abs(Math.sin(t * 1.4)) * 0.3; } };
  }
};

function buildScene(key) {
  const scene = new THREE.Scene();
  const made = (SCENES[key] || SCENES.random)();
  const holder = new THREE.Group();
  holder.add(made.obj);
  scene.add(holder);
  const ground = at(solid(new THREE.CylinderGeometry(1.9, 2.05, 0.08, 48), "none", 0, 1), 0, -0.04, 0);
  scene.add(ground);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.75, 5.3);
  camera.lookAt(0, 0.9, 0);
  return { scene, camera, holder, tick: made.tick };
}

function size(r, w, h) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  r.setPixelRatio(dpr);
  r.setSize(w, h, false);
  scaleUniform.value = Math.min(40, Math.max(14, h / 2.9 / 4.2));
}

const stills = new Map();

// A still frame for card thumbnails, cached per character.
export function still(key, px = 260) {
  if (stills.has(key)) return stills.get(key);
  const r = getRenderer();
  if (!r) return null;
  const s = buildScene(key);
  s.camera.aspect = 1;
  s.camera.updateProjectionMatrix();
  s.tick && s.tick(2.2);
  size(r, px, px);
  r.render(s.scene, s.camera);
  const url = r.domElement.toDataURL("image/png");
  stills.set(key, url);
  if (live) live.resize();
  return url;
}

let live = null;

// The moving picture. Only one exists at a time; mounting another one moves the canvas.
export function mount(container, key) {
  if (live) live.dispose();
  const r = getRenderer();
  if (!r) return null;
  const s = buildScene(key);
  const canvas = r.domElement;
  canvas.className = "woodcut-canvas";
  canvas.setAttribute("role", "img");
  container.appendChild(canvas);

  let react = 0, reactDir = 0, raf = 0, t0 = performance.now(), visible = true;
  const resize = () => {
    const w = container.clientWidth || 300, h = container.clientHeight || 300;
    size(r, w, h);
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
  };
  const frame = (now) => {
    const t = (now - t0) / 1000;
    if (!reduceMotion) {
      s.tick && s.tick(t);
      s.holder.rotation.y = Math.sin(t * 0.25) * 0.35;
    }
    react *= 0.9;
    s.holder.rotation.x = reactDir > 0 ? react * 0.18 : -react * 0.08;
    s.holder.position.z = reactDir < 0 ? -react * 0.6 : react * 0.25;
    r.render(s.scene, s.camera);
    if (!reduceMotion || react > 0.01) raf = requestAnimationFrame(frame);
    else raf = 0;
  };
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(frame);
    if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
  });
  io.observe(container);
  const ro = new ResizeObserver(() => { resize(); if (!raf) r.render(s.scene, s.camera); });
  ro.observe(container);
  resize();
  if (reduceMotion) s.tick && s.tick(2.2);
  raf = requestAnimationFrame(frame);

  live = {
    resize,
    react(move) {
      react = 1;
      reactDir = move === "C" ? 1 : -1;
      if (!raf && visible) raf = requestAnimationFrame(frame);
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      canvas.remove();
      s.scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material !== hullMat) o.material.dispose(); } });
      if (live === this) live = null;
    }
  };
  return live;
}
