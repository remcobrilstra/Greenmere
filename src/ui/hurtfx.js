// Screen-space hurt feedback: a red flash from the screen edges when the Warden
// takes damage (stronger for a bigger share of max health) and a slow red pulse
// while health is below a third. Combat calls rt.heroHurtFx(loss); the camera
// shake lives in play/camera.js. DOM only.

const LOW = 0.3;

export function attachHurtFx(rt) {
  const node = document.createElement("div");
  node.id = "hurtfx";
  node.setAttribute("aria-hidden", "true");
  document.body.appendChild(node);
  let flash = 0;
  let clock = 0;
  let shown = -1;

  rt.heroHurtFx = function (loss) {
    const max = rt.vitals && rt.vitals.hpMax > 0 ? rt.vitals.hpMax : 160;
    const share = Math.max(0, Number(loss) || 0) / max;
    flash = Math.min(1, Math.max(flash, 0.45 + share * 3.2));
    rt.camShake = Math.max(rt.camShake || 0, Math.min(0.35, 0.08 + share * 1.6));
  };
  rt.hurtFlash = () => flash;

  const prevTick = rt.tickHud;
  rt.tickHud = function (dt) {
    if (prevTick) prevTick(dt);
    clock += dt;
    flash = Math.max(0, flash - dt * 2.2);
    let low = 0;
    const v = rt.vitals;
    if (v && v.hpMax > 0 && v.hp > 0 && v.hp / v.hpMax < LOW && rt.space === "dungeon") {
      const depth = 1 - v.hp / v.hpMax / LOW;
      low = (0.22 + 0.2 * depth) * (0.6 + 0.4 * Math.sin(clock * 4.2));
    }
    const level = Math.min(1, Math.max(flash, low));
    const rounded = Math.round(level * 100) / 100;
    if (rounded !== shown) {
      shown = rounded;
      node.style.opacity = String(rounded);
    }
  };
}
