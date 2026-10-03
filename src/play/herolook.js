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
    return true;
  }
  const prevPose = rt.poseHero;
  rt.poseHero = function (dt) {
    if (prevPose) prevPose(dt);
    sync();
    hero.tick(dt || 0);
  };
  rt.syncHeroLook = sync;
  sync();
}
