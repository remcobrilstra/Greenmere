// The Warden's portrait (vitals plaque) and paper doll (character sheet), drawn
// from the real hero model so they show what is worn.
//
// The hero's meshes are also put on PORTRAIT_LAYER, with two lights that live only
// on that layer; a portrait camera that sees just that layer renders the hero
// alone into a small target with the main renderer. The rig is set to a calm
// stance for the shot and restored after. Re-shot when the worn set changes
// (rt.refreshPortrait, called by play/herolook.js) and when the sheet opens.

import * as THREE from "three";

export const PORTRAIT_LAYER = 5;
const BG = 0x1a120c;

export function attachPortrait(rt) {
  const renderer = rt.renderer;
  if (!renderer) return;

  const hemi = new THREE.HemisphereLight(0xfff3df, 0x3a2a22, 1.5);
  const key = new THREE.DirectionalLight(0xffe2b8, 2.2);
  const rim = new THREE.DirectionalLight(0x8cc8ff, 0.9);
  for (const l of [hemi, key, rim]) {
    l.layers.set(PORTRAIT_LAYER);
    l.castShadow = false;
    rt.scene.add(l);
  }
  key.target.layers.set(PORTRAIT_LAYER);
  rim.target.layers.set(PORTRAIT_LAYER);
  rt.scene.add(key.target, rim.target);

  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.layers.set(PORTRAIT_LAYER);

  // ---- outputs ----
  const portraitBox = document.querySelector("#vitals .portrait");
  const face = document.createElement("canvas");
  face.width = 128;
  face.height = 128;
  face.className = "portrait-live";
  face.hidden = true;
  if (portraitBox) portraitBox.appendChild(face);

  const doll = document.createElement("canvas");
  doll.width = 240;
  doll.height = 340;
  doll.className = "sheet-doll";
  doll.setAttribute("aria-label", "The Warden as dressed now");
  rt.dollNode = doll;

  const targets = new Map();
  function target(w, h) {
    const k = w + "x" + h;
    let t = targets.get(k);
    if (!t) {
      t = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
      t.texture.colorSpace = THREE.SRGBColorSpace;
      targets.set(k, t);
    }
    return t;
  }

  // Calm stance for the shot; returns a restore function.
  const rigKeys = ["body", "torso", "head", "leftArm", "rightArm", "leftLeg", "rightLeg", "cape"];
  function stance() {
    const saved = rigKeys.map((k) => {
      const o = rt[k];
      return o ? { o, p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() } : null;
    });
    const ps = rt.player.scale.clone();
    rt.player.scale.set(1, 1, 1);
    if (rt.body) { rt.body.position.set(0, 0, 0); rt.body.rotation.set(0, 0, 0); }
    if (rt.torso) rt.torso.scale.set(1, 1, 1);
    if (rt.head) rt.head.rotation.set(0, 0, 0);
    if (rt.leftArm) rt.leftArm.rotation.set(0.05, 0, 0.22);
    if (rt.rightArm) rt.rightArm.rotation.set(0.25, 0, -0.22);
    if (rt.leftLeg) rt.leftLeg.rotation.set(0, 0, 0.05);
    if (rt.rightLeg) rt.rightLeg.rotation.set(0, 0, -0.05);
    if (rt.cape) rt.cape.rotation.x = 0.22;
    rt.player.updateMatrixWorld(true);
    return () => {
      for (const s of saved) {
        if (!s) continue;
        s.o.position.copy(s.p);
        s.o.rotation.copy(s.r);
        s.o.scale.copy(s.s);
      }
      rt.player.scale.copy(ps);
      rt.player.updateMatrixWorld(true);
    };
  }

  const _v = new THREE.Vector3();
  const _look = new THREE.Vector3();
  // Camera placed in the hero's own frame (front is local −z), three-quarter view.
  function frame(kind) {
    if (kind === "bust") {
      cam.fov = 26;
      _v.set(0.55, 2.0, -1.85);
      _look.set(0, 1.7, 0);
    } else {
      cam.fov = 34;
      _v.set(2.2, 1.8, -6.1);
      _look.set(0, 1.25, 0);
    }
    rt.player.localToWorld(cam.position.copy(_v));
    rt.player.localToWorld(_look);
    cam.up.set(0, 1, 0);
    cam.lookAt(_look);
    // Light from the camera's side and a cool rim from behind.
    rt.player.localToWorld(key.position.set(1.5, 3.2, -2.4));
    rt.player.localToWorld(key.target.position.set(0, 1.2, 0));
    rt.player.localToWorld(rim.position.set(-1.8, 2.4, 2.2));
    rt.player.localToWorld(rim.target.position.set(0, 1.2, 0));
    key.target.updateMatrixWorld();
    rim.target.updateMatrixWorld();
  }

  function shoot(canvas, kind) {
    const w = canvas.width;
    const h = canvas.height;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    const restore = stance();
    frame(kind);
    // Everything that makes up the hero joins the portrait layer.
    rt.player.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        if (o.userData.layer || o.name === "nose" || o.name === "toe" || o.name === "relicMotes") o.layers.enable(PORTRAIT_LAYER);
      }
    });
    const t = target(w, h);
    const prevTarget = renderer.getRenderTarget();
    const prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevBg = rt.scene.background;
    const prevFog = rt.scene.fog;
    const prevShadow = renderer.shadowMap.autoUpdate;
    rt.scene.background = null;
    rt.scene.fog = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(BG, 1);
    renderer.setRenderTarget(t);
    renderer.clear();
    renderer.render(rt.scene, cam);
    const px = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(t, 0, 0, w, h, px);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    rt.scene.background = prevBg;
    rt.scene.fog = prevFog;
    renderer.shadowMap.autoUpdate = prevShadow;
    restore();
    // Render targets read bottom-up.
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    }
    ctx.putImageData(img, 0, 0);
    return true;
  }

  let shots = 0;
  rt.refreshPortrait = function () {
    try {
      shoot(face, "bust");
      shoot(doll, "full");
      shots++;
      face.hidden = false;
      const svg = portraitBox && portraitBox.querySelector("svg");
      if (svg) svg.style.display = "none";
    } catch (err) {
      // Keep the drawn portrait if the shot fails.
      face.hidden = true;
    }
  };
  rt.portraitShots = () => shots;
}
