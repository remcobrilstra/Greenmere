// Dresses the Warden in what is equipped: re-dresses on any change to the worn
// set (equip, unequip, load, upgrade) and ticks the relic extras. See
// view/hero.js (dress, tick) and view/gearlook.js (item → look).

import { lookSignature } from "../view/gearlook.js";

export function attachHeroLook(rt, hero) {
  let sig = null;
  function sync() {
    const eq = rt.session && rt.session.equipped;
    const next = lookSignature(eq);
    if (next === sig) return false;
    sig = next;
    rt.heroLooks = hero.dress(eq);
    if (rt.refreshPortrait) rt.refreshPortrait();
    return true;
  }
  const prevPose = rt.poseHero;
  rt.poseHero = function (dt) {
    if (prevPose) prevPose(dt);
    sync();
    const m = rt.heroMotion || (rt.heroMotion = {});
    m.dying = !!rt.dying;
    m.hp = rt.vitals ? rt.vitals.hp : 0;
    hero.tick(dt || 0, m);
  };
  rt.syncHeroLook = sync;
  sync();
  // The Blender-built Warden swaps in after load; repaint the portrait then.
  if (hero.ready) hero.ready.then(() => { if (rt.refreshPortrait) rt.refreshPortrait(); });
}
