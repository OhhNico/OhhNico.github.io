/* Materials, and the environment they reflect.

   The page is an unlit room, so nothing here receives light from outside: the
   globe is the lamp. That makes two things matter more than usual. Chrome and
   glass need something to reflect or they read as flat grey shapes, and the
   environment that supplies those reflections cannot be downloaded, because the
   published page makes no third-party request. So it is generated. */

import {
  BackSide, AdditiveBlending, Color, DataTexture, EquirectangularReflectionMapping,
  FloatType, LinearFilter, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial,
  PMREMGenerator, RGBAFormat, Scene, ShaderMaterial, CanvasTexture, SRGBColorSpace,
} from "three";

/* A room built out of a gradient. Dark floor, a brighter band where a ceiling
   strip would be, and a cool wash above it: enough structure for a curved
   chrome surface to show that it is curved. 32x16 is plenty, because PMREM
   blurs it into roughness levels anyway and nothing here is a mirror. */
function environment(renderer) {
  const W = 32, H = 16;
  const data = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);            // 0 at the top of the sphere
    // A soft strip a third of the way down, which is where a shop's ceiling
    // light would sit, plus a dim floor bounce.
    const band = Math.exp(-((v - 0.3) ** 2) / 0.006) * 1.35;
    const sky = 0.10 * (1 - v);
    const floor = 0.035 * v * v;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      data[i] = band * 0.98 + sky * 0.55 + floor * 0.9;
      data[i + 1] = band * 0.99 + sky * 0.62 + floor * 0.85;
      data[i + 2] = band + sky * 0.85 + floor * 1.0;
      data[i + 3] = 1;
    }
  }
  const tex = new DataTexture(data, W, H, RGBAFormat, FloatType);
  tex.mapping = EquirectangularReflectionMapping;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;

  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

/* Brushed metal without a texture file: vertical streaks drawn once into a
   canvas and used as roughness. Deterministic, because a seeded pattern that
   changes between loads is a pattern nobody can review. */
function brushedRoughness() {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 256;
  const g = c.getContext("2d");
  let seed = 0x2f6e2b1;
  const rand = () => (((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff));
  for (let y = 0; y < 256; y++) {
    const v = 78 + rand() * 34;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(0, y, 8, 1);
  }
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = 1000; // RepeatWrapping
  tex.repeat.set(3, 1);
  return tex;
}

/* Glass, on a machine that can afford it. transmission forces three.js to
   render the scene into a target once more per frame, which is the single most
   expensive thing on this page. */
function realGlass(env) {
  return new MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 1,
    ior: 1.5,
    thickness: 0.5,
    roughness: 0.05,
    metalness: 0,
    envMap: env,
    envMapIntensity: 1.1,
    transparent: true,
    depthWrite: false,
  });
}

/* Glass, on a phone. A Fresnel term written by hand: bright at grazing angles,
   nearly clear head on, which is most of what a thin curved shell actually does
   to your eye. No transmission pass, no second render of the scene, no
   backdrop texture. It is not the same material; it is the same reading. */
function fresnelGlass() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTint: { value: new Color(0xbfd8ff) }, uPower: { value: 2.4 } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTint; uniform float uPower;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
        gl_FragColor = vec4(uTint * f, f * 0.9);
      }`,
  });
}

export function makeMaterials(renderer, { cheap }) {
  const env = environment(renderer);
  const roughnessMap = brushedRoughness();

  const glass = cheap ? fresnelGlass() : realGlass(env);

  const chrome = new MeshStandardMaterial({
    color: 0xd8dae0, metalness: 1, roughness: 0.14, envMap: env, envMapIntensity: 1.4,
  });

  /* Two metals the reconstruction needs and this page did not have.

     The reference photograph has three distinct metals and the ordering between
     them is what makes the object read as manufactured rather than moulded: a
     polished collar, milled bar stock in the lid armature, and one raw sand cast
     plate on the front. Measured off the reference by
     forge/stage1_intake/extract_pbr_evidence.py, the roughness ordering is
     0.08 for the polished ring, 0.30 for the milled stock and 0.62 for the
     casting, and the casting is the only matte surface anywhere on the object.

     What is NOT carried over is colour. The reference's machine is vivid red in
     a bright room; this page is a dark room where the globe is the only lamp,
     and section 4.1 of the design spec governs the palette. So these two take
     the measured roughness and metalness relationships and the page's values.
     The measured albedo stays in the sculpt spec as evidence rather than
     arriving here as a hue nobody asked for. */
  const milled = new MeshStandardMaterial({
    color: 0x9aa0a8, metalness: 1, roughness: 0.34,
    roughnessMap, envMap: env, envMapIntensity: 1.05,
  });

  const cast = new MeshStandardMaterial({
    color: 0x5c6068, metalness: 1, roughness: 0.62, envMap: env, envMapIntensity: 0.55,
  });

  const body = new MeshStandardMaterial({
    color: 0x30343f, metalness: 0.55, roughness: 0.42,
    roughnessMap, envMap: env, envMapIntensity: 0.9,
  });

  /* The additive shell that stands in for bloom. A back-facing sphere just
     outside the globe, brightest where it turns away from the eye, tinted by
     whichever capsule is current. One draw call instead of a multi-pass
     post-processing chain, and it survives on a phone. */
  const halo = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: BackSide,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: new Color(0xffffff) }, uStrength: { value: 0.55 } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uStrength;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
        gl_FragColor = vec4(uColor * f * uStrength, f * uStrength);
      }`,
  });

  /* One capsule material per capsule, because each carries its own colour and
     its own emissive level. Cheap: 44 materials sharing one geometry is 44 draw
     calls, which is nothing next to one transmission pass. */
  const capsule = (hex, live) => new MeshPhysicalMaterial({
    color: new Color(hex),
    metalness: 0,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
    envMap: env,
    envMapIntensity: 0.8,
    emissive: new Color(hex),
    emissiveIntensity: live ? 1.15 : 0.14,
  });

  const sign = (texture) => new MeshBasicMaterial({ map: texture, transparent: true });

  return { env, glass, chrome, milled, cast, body, halo, capsule, sign, cheap };
}
