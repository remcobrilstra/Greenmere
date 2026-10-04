// Adaptive render resolution. The GPU cost here is mostly per pixel (flat Lambert,
// fog, one shadow map), and high-DPI laptops render 2-3x the pixels of a 1x screen,
// so the pixel ratio is the lever: start at the cap, step down while frames run long,
// step back up after a calm stretch, and stop probing a level that just failed.
//
// rt.renderScale = { ratio, min, max, fixed } for the HUD or a console.
// Dev: &res=pin keeps the cap, &res=<number> pins that ratio (perf and shots use it).

const STEP = 0.125;
const SLOW_MS = 20.5; // below ~49 fps
const CALM_MS = 17.6; // a steady 60
const DROP_AFTER = 700; // ms of slow frames before stepping down
const RAISE_AFTER = 5000; // ms of calm frames before trying a step up
const RETRY_MS = 30000; // a level that failed right after a raise is left alone this long

export function attachResolution(rt, renderer, params) {
  const dpr = window.devicePixelRatio || 1;
  const max = Math.min(dpr, 1.75);
  const min = Math.min(max, Math.max(0.75, dpr * 0.5));
  const pin = params && params.get("res");
  const fixed = pin === "pin" ? max : pin != null && Number(pin) > 0 ? Number(pin) : null;
  const state = { ratio: fixed || max, min, max, fixed: fixed != null };
  rt.renderScale = state;
  renderer.setPixelRatio(state.ratio);

  let avg = 16.7;
  let slow = 0;
  let calm = 0;
  let raisedAt = -Infinity;
  const blockedUntil = new Map();

  function apply(r, now) {
    state.ratio = Math.round(r * 1000) / 1000;
    renderer.setPixelRatio(state.ratio);
    calm = 0;
    slow = 0;
    if (now != null) avg = 16.7;
  }

  // frameMs: the wall-clock time since the previous frame.
  return function tickResolution(frameMs, now) {
    if (state.fixed || !(frameMs > 0) || frameMs > 120) return;
    avg += (frameMs - avg) * 0.1;
    if (avg > SLOW_MS) {
      slow += frameMs;
      calm = 0;
    } else {
      slow = 0;
      calm = avg < CALM_MS ? calm + frameMs : 0;
    }
    if (slow > DROP_AFTER && state.ratio > state.min + 1e-3) {
      // Failing right after a raise: remember that level and do not probe it for a while.
      if (now - raisedAt < 2500) blockedUntil.set(state.ratio, now + RETRY_MS);
      apply(Math.max(state.min, state.ratio - STEP), now);
      return;
    }
    if (calm > RAISE_AFTER && state.ratio < state.max - 1e-3) {
      const next = Math.min(state.max, state.ratio + STEP);
      const until = blockedUntil.get(Math.round(next * 1000) / 1000);
      if (until && now < until) { calm = 0; return; }
      raisedAt = now;
      apply(next, now);
    }
  };
}
